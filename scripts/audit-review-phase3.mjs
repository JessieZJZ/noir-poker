// Offline review phase three. Raw data must stay under the ignored artifact root.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PHASE3_SCENES,
  PHASE3_STYLES,
  arrangePhase3Cards,
  createPhase3Controller,
  phase3Configuration,
  phase3Dealer,
  phase3Reviewer,
} from './review-phase3-scenes.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const REPOSITORY = path.resolve(path.dirname(SCRIPT), '..');
const ARTIFACT_ROOT = path.join(REPOSITORY, '.artifacts/review-phase3-2026-10-24');
const copy = (value) => JSON.parse(JSON.stringify(value));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const now = () => new Date().toISOString();
const handFile = (index) => `hand-${String(index).padStart(4, '0')}.json`;

export function phase3Seed(seed, index, lane = 0) {
  // Each hand is independent of shard boundaries and previous hand lengths.
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9) ^ Math.imul(lane + 1, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return (Math.imul(x, 0x846ca68b) ^ (x >>> 16)) >>> 0;
}

function filesIn(root, prefix = '') {
  return readdirSync(path.join(root, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory() ? filesIn(root, relative) : entry.isFile() ? [relative] : [];
    })
    .sort();
}

export function phase3Digest(root) {
  const files = filesIn(root).map((file) => ({
    file,
    bytes: statSync(path.join(root, file)).size,
    sha256: sha(readFileSync(path.join(root, file))),
  }));
  return { digest: sha(JSON.stringify(files)), files };
}

function exclusiveJSON(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function confinedOutput(value) {
  const output = path.resolve(value);
  assert(output.startsWith(`${ARTIFACT_ROOT}${path.sep}`), `Output must be below ${ARTIFACT_ROOT}`);
  mkdirSync(output, { recursive: true });
  return output;
}

export async function loadPhase3Source(value) {
  let source = path.resolve(value || REPOSITORY);
  if (existsSync(path.join(source, 'src/engine/poker.js'))) source = path.join(source, 'src');
  assert(existsSync(path.join(source, 'engine/poker.js')), 'source must contain src/ or engine/');
  const load = (file) => import(pathToFileURL(path.join(source, file)).href);
  const [engine, review, opponent, equity, coaching, context, matchups, routes, preflop] =
    await Promise.all([
      load('engine/poker.js'),
      load('review/analysis.js'),
      load('review/opponents.js'),
      load('review/equity.js'),
      load('review/coaching.js'),
      load('review/context.js'),
      load('review/matchups.js'),
      load('review/routes.js'),
      load('review/preflop.js'),
    ]);
  return {
    source,
    fingerprint: phase3Digest(source),
    engine,
    review,
    opponent,
    equity,
    coaching,
    context,
    matchups,
    routes,
    preflop,
  };
}

function harnessFingerprint() {
  const files = [SCRIPT, path.join(path.dirname(SCRIPT), 'review-phase3-scenes.mjs')].map(
    (file) => ({
      file: path.relative(REPOSITORY, file),
      sha256: sha(readFileSync(file)),
    }),
  );
  return { digest: sha(JSON.stringify(files)), files };
}

export function assertPhase3Ledger(game, bank) {
  const amounts = [
    game.currentBet,
    game.minRaise,
    ...game.players.flatMap((p) => [p.stack, p.bet, p.total]),
    ...(game.payouts || []),
    ...(game.refunds || []).map((r) => r.amount),
    ...(game.pots || []).flatMap((p) => [p.amount, ...(p.awards || []).map((a) => a.amount)]),
  ];
  assert(
    amounts.every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value % game.chipUnit === 0,
    ),
    'Nonnegative whole-chip ledger required',
  );
  assert.equal(
    game.players.reduce((total, p) => total + p.stack + (game.phase === 'done' ? 0 : p.total), 0),
    bank,
    'Chip conservation',
  );
}

function summary(review) {
  const index = review.paragraphs.indexOf('复盘分析总结');
  return review.paragraphs.slice(index < 0 ? 0 : index + 1).join('');
}

function heroPresentation(analysis) {
  const { coaching, context } = analysis;
  return {
    label: coaching.label,
    suggestion: coaching.suggestion,
    paragraphs: coaching.paragraphs,
    summary: summary(coaching),
    evidence: analysis.evidence,
    board: context.matchups.boardParts,
    strength: context.matchups.strengthParts,
    metrics: analysis.metrics,
    code: analysis.code,
    recommendedAction: coaching.recommendedAction || analysis.alternative,
  };
}

function opponentPresentation(review) {
  return {
    title: review.title,
    summary: summary(review),
    paragraphs: review.paragraphs,
    basisSource: review.basisSource,
    reasons: review.reasons,
  };
}

function actionSemanticTrace(proposal, decision) {
  // These labels describe a scripted action, never an invented policy motive.
  // The original production proposal and its full trace remain in policyLog.
  const reason = decision.action === 'check' ? 'free-check' : 'scripted-review-probe';
  return {
    ...copy(proposal.trace),
    reason,
    basis: undefined,
    deception: undefined,
    exceptions: [],
    provenance: decision.source,
    reasonSource: 'scripted-action-only',
  };
}

function sourceAction(decision, source = 'production') {
  return {
    action: decision.action,
    ...(decision.action === 'raise' ? { amount: decision.amount } : {}),
    source,
  };
}

function targetFactsOf(api, played, status) {
  const target = played.policyLog.find((p) => p.sequence === status.targetEvent.sequence);
  const view = target.proposed.trace.view;
  const context = api.context.handContext(view);
  const facts = {
    handClass: context.handClass,
    handLabel: context.handLabel,
    madeCategory: context.made.score[0],
    maxSuit: context.texture.maxSuit,
    paired: context.texture.paired,
    drawOuts: context.draw.outs,
    flushDraw: context.draw.flush,
    straightDraw: context.draw.straight,
    pendingOthers: view.actionContext.pendingResponseCount,
    opponents: view.opponents.length,
    preflopRaises: view.history.filter((a) => a.street === 0 && a.action === 'raise').length,
  };
  const id = played.configuration.scene.id;
  if (id === 'set-three-hearts-turn') {
    assert.equal(facts.handClass, 'set');
    assert.equal(facts.maxSuit, 3);
  } else if (id === 'dry-set-flop') {
    assert.equal(facts.handClass, 'set');
    assert.equal(facts.maxSuit, 1);
  } else if (id === 'set-four-hearts-river') {
    assert.equal(facts.handClass, 'set');
    assert.equal(facts.maxSuit, 4);
  } else if (id === 'full-house-flush-board') {
    assert.equal(facts.madeCategory, 6);
    assert(facts.maxSuit >= 3);
  } else if (id === 'closing-check-turn') assert.equal(facts.pendingOthers, 0);
  else if (id === 'pending-check-turn') assert(facts.pendingOthers > 0);
  else if (id === 'nut-flush-draw-turn') assert(facts.flushDraw && facts.drawOuts >= 9);
  else if (id === 'combo-draw-flop')
    assert(facts.flushDraw && facts.straightDraw && facts.drawOuts >= 12);
  else if (id === 'missed-draw-river') {
    assert.equal(facts.madeCategory, 0);
    assert.equal(facts.drawOuts, 0);
    assert(api.context.drawInfo(view.hole, view.board.slice(0, 4)).outs > 0);
  } else if (id === 'paired-board-top-pair') {
    assert(facts.paired);
    assert.equal(facts.madeCategory, 2);
  } else if (id === 'four-straight-river') assert.equal(facts.madeCategory, 1);
  else if (id === 'board-only-river') assert.equal(facts.handClass, 'board');
  else if (id === 'multiway-top-pair') {
    assert.equal(facts.handClass, 'top-pair');
    assert(facts.opponents >= 3);
  } else if (id === 'preflop-four-bet') assert.equal(facts.preflopRaises, 3);
  else if (id === 'preflop-five-bet') assert.equal(facts.preflopRaises, 4);
  else if (id === 'river-thin-value') assert.equal(facts.handClass, 'top-pair');
  else if (id === 'river-bluff-catcher') assert.equal(facts.madeCategory, 1);
  return facts;
}

export function playPhase3Hand(api, index, { seed = 202610243, botTrials } = {}) {
  const { engine, equity } = api;
  const configuration = phase3Configuration(index);
  const { players, smallBlind, scene } = configuration;
  const deckSeed = phase3Seed(seed, index, 0);
  const policySeed = phase3Seed(seed, index, 1);
  const deckRandom = equity.seedRandom(deckSeed);
  const policyRandom = equity.seedRandom(policySeed);
  const oldRandom = Math.random;
  const game = engine.newGame(players, {
    smallBlind,
    bigBlind: smallBlind * 2,
    startingStack: smallBlind * 200,
    chipUnit: smallBlind,
  });
  game.difficulty = configuration.difficulty;
  game.dealer = (phase3Dealer(configuration) + players - 1) % players;
  engine.applyBotSettings(game, {
    emotionMode: configuration.emotionMode,
    assignments: configuration.assignments,
  });
  for (const player of game.players) {
    player.stack = configuration.stacksBB[player.id] * game.bigBlind;
    if (player.id && game.emotionMode !== 'off')
      Object.assign(player.botMood, {
        kind: configuration.moods[player.id],
        remaining: 5,
        cooldown: 4,
        reason: '离线测试注入的前序情绪状态，不代表本手输赢',
        wins: 2,
        losses: 2,
      });
  }
  const bank = game.players.reduce((total, p) => total + p.stack, 0);
  try {
    Math.random = deckRandom;
    engine.startHand(game);
  } finally {
    Math.random = oldRandom;
  }
  const arranged = arrangePhase3Cards(engine, game, configuration);
  const initialDeal = {
    dealer: game.dealer,
    positions: copy(game.positions),
    players: copy(game.players),
    deck: copy(game.deck),
    bank,
    arranged,
  };
  const controller = createPhase3Controller(configuration);
  const policyLog = [];
  const transitions = [];
  let moves = 0;
  assertPhase3Ledger(game, bank);
  while (game.phase !== 'done') {
    assert(++moves < 600, `Unfinished phase-three hand ${index}`);
    if (game.phase === 'between') {
      engine.advanceStreet(game);
      assertPhase3Ledger(game, bank);
      continue;
    }
    const id = game.actor;
    const legal = engine.legalActions(game);
    const proposal = engine.botDecision(
      game,
      policyRandom,
      botTrials === undefined ? {} : { trials: botTrials },
    );
    let decision = controller?.decide(game, legal) || sourceAction(proposal);
    if (!scene && id === 0) {
      if (configuration.heroPolicy === 'check-call')
        decision = { action: legal.canCheck ? 'check' : 'call', source: 'hero-check-call-policy' };
      else if (configuration.heroPolicy === 'pressure' && legal.canRaise)
        decision = {
          action: 'raise',
          amount: policyRandom() < 0.3 ? legal.maxRaiseTo : legal.minRaiseTo,
          source: 'hero-pressure-policy',
        };
      else if (configuration.heroPolicy === 'cautious' && !legal.canCheck && policyRandom() < 0.35)
        decision = { action: 'fold', source: 'hero-cautious-policy' };
    }
    const normalized = decision.action === 'call' && legal.canCheck ? 'check' : decision.action;
    decision = { ...decision, action: normalized };
    const sequence = game.history.length + 1;
    const trace =
      decision.source === 'production'
        ? copy(proposal.trace)
        : actionSemanticTrace(proposal, decision);
    policyLog.push({
      sequence,
      actor: id,
      street: game.street,
      source: decision.source,
      proposed: copy(proposal),
      applied: copy(decision),
      changedFromProduction:
        proposal.action !== normalized ||
        (normalized === 'raise' && proposal.amount !== decision.amount),
    });
    const record = id
      ? {
          id,
          name: game.players[id].name,
          hand: game.hand,
          sequence,
          action: normalized,
          ...(normalized === 'raise' ? { amount: decision.amount } : {}),
          trace,
          actionSource: decision.source,
        }
      : null;
    engine.act(game, id, normalized, decision.amount);
    if (record) game.botDecisions.push(record);
    assertPhase3Ledger(game, bank);
    transitions.push({
      sequence,
      street: game.street,
      phase: game.phase,
      actor: game.actor,
      ledger: game.players.map(({ id, stack, bet, total, folded, allin }) => ({
        id,
        stack,
        bet,
        total,
        folded,
        allin,
      })),
    });
  }
  if (controller) {
    assert(controller.status.targetReached, `Target missing ${scene.id}`);
    if (scene.board)
      assert.deepEqual(
        controller.status.targetEvent.board.map((c) => c.key),
        arranged.intendedBoard
          .slice(0, scene.street === 1 ? 3 : scene.street === 2 ? 4 : 5)
          .map((c) => c.key),
      );
    if (scene.id === 'short-all-in-no-reopen')
      assert.equal(
        controller.status.targetEvent.legal.canRaise,
        false,
        'Short all-in must not reopen hero raise',
      );
  }
  const played = {
    game,
    configuration,
    initialDeal,
    policyLog,
    transitions,
    seed,
    deckSeed,
    policySeed,
    targeted: controller ? controller.status : null,
  };
  if (controller) played.targeted.facts = targetFactsOf(api, played, controller.status);
  return played;
}

function reviewFaults(entry) {
  const text = entry.review.summary;
  const faults = [];
  if (/[；;]/.test(text)) faults.push('semicolon');
  if (/undefined|NaN|\[object Object\]/.test(text)) faults.push('interpolation');
  if (/跟住|仍未弃牌|还留有?\s*0(?:[，。\s]|$)/.test(text)) faults.push('wording');
  if (entry.perspective === 'hero') {
    const { snapshot: s, review } = entry;
    const action = review.recommendedAction;
    if (
      action?.action === 'raise' &&
      (!s.legal.canRaise ||
        action.amount < s.legal.minRaiseTo ||
        action.amount > s.legal.maxRaiseTo ||
        action.amount % s.chipUnit !== 0)
    )
      faults.push('illegal-recommendation');
    if (
      s.action === 'call' &&
      s.legal.callAmount >= s.stack &&
      /你在翻后有位置|你需要重新决定是否继续|下一街的投入还要另算/.test(text)
    )
      faults.push('all-in-future-choice');
    if (JSON.stringify(s).includes('"deck"') || s.players.some((p) => p.id !== 0 && p.hole))
      faults.push('hidden-information');
  }
  return faults;
}

export function analyzePhase3Hand(api, played, { trials = 600, rolloutTrials = 12 } = {}) {
  const input = api.review.createReviewInput(played.game);
  const entries = [];
  const actionBySequence = new Map(played.policyLog.map((record) => [record.sequence, record]));
  for (const snapshot of input.decisions) {
    const analysis = api.review.analyzeDecision(snapshot, { trials, rolloutTrials });
    const sequence = snapshot.history.length + 1;
    const actionSource = actionBySequence.get(sequence)?.source;
    entries.push({
      perspective: 'hero',
      index: snapshot.index,
      sequence,
      snapshot,
      analysis,
      actionSource,
      reviewScope:
        actionSource === 'production'
          ? 'production-policy'
          : actionSource === 'scripted-prefix'
            ? 'setup-action'
            : actionSource === 'scripted-probe'
              ? 'scripted-display-probe'
              : 'hero-test-policy',
      isTargetDecision: played.targeted?.targetEvent.sequence === sequence,
      analysisDigest: api.fingerprint.digest,
      presentationDigest: api.fingerprint.digest,
      review: heroPresentation(analysis),
    });
  }
  for (const record of input.opponents) {
    const review = api.opponent.explainOpponent(record, input.players);
    entries.push({
      perspective: 'opponent',
      sequence: record.sequence,
      record,
      actionSource: record.actionSource,
      reviewScope:
        record.actionSource === 'production'
          ? 'production-policy'
          : record.actionSource === 'scripted-probe'
            ? 'scripted-display-probe'
            : 'setup-action',
      isTargetDecision: played.targeted?.targetEvent.sequence === record.sequence,
      presentationDigest: api.fingerprint.digest,
      review: opponentPresentation(review),
    });
  }
  entries.forEach((entry) => {
    entry.automaticFaults = reviewFaults(entry);
  });
  const { game, ...evidence } = played;
  return {
    schema: 'noir-review-phase3-v1',
    hand: played.configuration.index,
    reviewerStratum: phase3Reviewer(played.configuration.index),
    analysisDigest: api.fingerprint.digest,
    presentationDigest: api.fingerprint.digest,
    budget: { trials, rolloutTrials },
    ...evidence,
    fullHistory: copy(game.history),
    finalGame: copy(game),
    reviewInput: input,
    roster: input.players,
    entries,
  };
}

function presentationFacts(ctx) {
  return {
    handClass: ctx.handClass,
    tier: ctx.tier,
    draw: ctx.draw,
    score: ctx.made.score,
    opponents: ctx.opponents,
    pendingOthers: ctx.pendingOthers,
    effective: ctx.effective,
    inPosition: ctx.inPosition,
    preflopRaises: ctx.preflopRaises,
  };
}

export function refreshPhase3Hand(
  api,
  original,
  { trials = 600, rolloutTrials = 12, reanalyze = () => false } = {},
) {
  const data = copy(original);
  data.refresh = {
    at: now(),
    inputAnalysisDigest: original.analysisDigest,
    inputPresentationDigest: original.presentationDigest,
    source: api.source,
    numericalReanalysis: [],
  };
  for (const entry of data.entries) {
    if (entry.perspective === 'opponent') {
      entry.review = opponentPresentation(api.opponent.explainOpponent(entry.record, data.roster));
    } else {
      const s = entry.snapshot;
      if (reanalyze(data.hand, entry.index)) {
        entry.analysisHistory ||= [];
        entry.analysisHistory.push({
          digest: entry.analysisDigest,
          priorBudget: entry.analysisBudget || data.budget,
        });
        entry.analysis = api.review.analyzeDecision(s, { trials, rolloutTrials });
        delete entry.presentationAnalysis;
        entry.analysisDigest = api.fingerprint.digest;
        entry.analysisBudget = { trials, rolloutTrials };
        data.refresh.numericalReanalysis.push(entry.index);
        entry.review = heroPresentation(entry.analysis);
      } else {
        const analysis = copy(entry.analysis);
        const context = api.context.decisionContext(s);
        assert.deepEqual(
          presentationFacts(context),
          presentationFacts(analysis.context),
          `Facts changed for hand ${data.hand} entry ${entry.index}; explicitly reanalyze this decision`,
        );
        context.matchups = api.matchups.handMatchups(s, context);
        context.valuePlan = api.matchups.valuePlan(s, context, context.matchups);
        const pre = s.street === 0 ? api.preflop.preflopContext(s) : null;
        if (pre) context.positionedEntry = api.preflop.positionedEntry(s, context, pre);
        analysis.context = context;
        analysis.routes = api.routes.comparisonRoutes(s, context, {
          code: analysis.code,
          status: analysis.status,
          alternative: analysis.alternative,
          pre,
        });
        analysis.coaching = api.coaching.coachDecision(s, analysis);
        const nextReview = heroPresentation(analysis);
        const actionIdentity = (action) => ({ action: action.action, amount: action.amount ?? 0 });
        assert.deepEqual(
          actionIdentity(nextReview.recommendedAction),
          actionIdentity(entry.review.recommendedAction),
          `Recommendation changed for hand ${data.hand} entry ${entry.index}; explicitly reanalyze`,
        );
        entry.review = nextReview;
        entry.presentationAnalysis = analysis;
      }
    }
    entry.presentationDigest = api.fingerprint.digest;
    entry.automaticFaults = reviewFaults(entry);
  }
  data.presentationDigest = api.fingerprint.digest;
  data.analysisDigests = [
    ...new Set(
      data.entries
        .filter((entry) => entry.perspective === 'hero')
        .map((entry) => entry.analysisDigest),
    ),
  ];
  if (data.analysisDigests.length === 1) data.analysisDigest = data.analysisDigests[0];
  return data;
}

function updateCounts(manifest, data) {
  const count = (key, value = 1) => {
    manifest.counts[key] = (manifest.counts[key] || 0) + value;
  };
  const c = data.configuration;
  count(c.scene ? 'targeted-hands' : 'natural-hands');
  count(`players-${c.players}`);
  count(`difficulty-${c.difficulty}`);
  count(`emotion-${c.emotionMode}`);
  count(`blind-${c.smallBlind}`);
  count(`depth-${c.depthKind}`);
  count(`hero-policy-${c.scene ? 'scripted-target' : c.heroPolicy}`);
  if (c.scene) count(`scene-${c.scene.id}`);
  for (const player of data.initialDeal.players.slice(1)) {
    count(`assigned-style-${player.botProfile}`);
    count(`initial-mood-${player.botMood.kind}`);
  }
  for (const policy of data.policyLog) count(`action-source-${policy.source}`);
  for (const entry of data.entries) {
    count(`review-${entry.perspective}`);
    if (entry.perspective === 'hero') {
      count(`hero-street-${entry.snapshot.street}`);
      count(`hero-code-${entry.analysis.code}`);
      count(`recommend-${entry.review.recommendedAction?.action}`);
    }
    if (entry.automaticFaults.length)
      manifest.issues.push({
        hand: data.hand,
        perspective: entry.perspective,
        index: entry.index,
        sequence: entry.sequence,
        faults: entry.automaticFaults,
      });
  }
}

function argumentsOf(argv) {
  return Object.fromEntries(
    argv.map((arg) => {
      assert(arg.startsWith('--'));
      const split = arg.indexOf('=');
      return split < 0 ? [arg.slice(2), true] : [arg.slice(2, split), arg.slice(split + 1)];
    }),
  );
}

export async function runPhase3Audit(argv = process.argv.slice(2)) {
  const args = argumentsOf(argv);
  const start = Number(args.start ?? 0);
  const end = Number(args.end ?? 4000);
  const seed = Number(args.seed ?? 202610243);
  const trials = Number(args.trials ?? 600);
  const rolloutTrials = Number(args.rollouts ?? 12);
  assert(
    Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= 4000,
  );
  assert(
    Number.isInteger(seed) &&
      Number.isInteger(trials) &&
      trials >= 1 &&
      Number.isInteger(rolloutTrials) &&
      rolloutTrials >= 2,
  );
  const botTrials = args['bot-trials'] === undefined ? undefined : Number(args['bot-trials']);
  if (botTrials !== undefined) assert(Number.isInteger(botTrials) && botTrials >= 1);
  const api = await loadPhase3Source(args.source);
  const output = confinedOutput(args.output || path.join(ARTIFACT_ROOT, `raw-${start}-${end}`));
  const manifestPath = path.join(output, `manifest-${start}-${end}.json`);
  assert(!existsSync(manifestPath), 'Refusing to overwrite an existing shard manifest');
  for (let index = start; index < end; index++)
    assert(!existsSync(path.join(output, handFile(index))), `Refusing to overwrite hand ${index}`);
  const refreshFrom = args['refresh-from'] ? path.resolve(args['refresh-from']) : null;
  const selected = args['reanalyze-input']
    ? new Set(json(path.resolve(args['reanalyze-input'])))
    : null;
  const manifest = {
    schema: 'noir-review-phase3-manifest-v1',
    startedAt: now(),
    completedAt: null,
    start,
    end,
    plannedHands: end - start,
    seed,
    trials,
    rolloutTrials,
    botTrials: botTrials ?? 'production-default',
    source: api.source,
    sourceDigest: api.fingerprint.digest,
    sourceFiles: api.fingerprint.files,
    harness: harnessFingerprint(),
    refreshFrom,
    refreshMode: args.reanalyze
      ? 'full-reanalysis'
      : refreshFrom
        ? 'presentation-only-or-selected-reanalysis'
        : null,
    protocol: {
      totalHands: 4000,
      naturalHands: 3200,
      targetedHands: 800,
      targetedRepeats: 40,
      scenes: PHASE3_SCENES,
      styles: PHASE3_STYLES,
      handSeedsIndependent: true,
      reviewUsesBeforeActionPublicSnapshots: true,
      futureBoardRestrictedToDealSetup: true,
      syntheticInitialMoods: true,
      scriptedActionsMarked: true,
      naturalHeroPolicies: ['production', 'check-call', 'pressure', 'cautious'],
      reusedStartingStacks: false,
    },
    counts: {},
    issues: [],
    files: [],
    timings: [],
  };
  exclusiveJSON(manifestPath, manifest);
  const checkpoint = path.join(output, `checkpoint-${start}-${end}.json`);
  try {
    for (let index = start; index < end; index++) {
      const begun = performance.now();
      const data = refreshFrom
        ? refreshPhase3Hand(api, json(path.join(refreshFrom, handFile(index))), {
            trials,
            rolloutTrials,
            reanalyze: (hand, entry) => args.reanalyze || selected?.has(`${hand}:${entry}`),
          })
        : analyzePhase3Hand(api, playPhase3Hand(api, index, { seed, botTrials }), {
            trials,
            rolloutTrials,
          });
      data.generatedAt = now();
      data.harnessDigest = manifest.harness.digest;
      const file = handFile(index);
      exclusiveJSON(path.join(output, file), data);
      updateCounts(manifest, data);
      const durationMs = Math.round(performance.now() - begun);
      manifest.files.push({
        hand: index,
        file,
        sha256: sha(readFileSync(path.join(output, file))),
        entries: data.entries.length,
        durationMs,
        analysisDigest: data.analysisDigest,
        presentationDigest: data.presentationDigest,
      });
      manifest.timings.push({
        hand: index,
        durationMs,
        hero: data.entries.filter((e) => e.perspective === 'hero').length,
        opponent: data.entries.filter((e) => e.perspective === 'opponent').length,
      });
      // Only this checkpoint is mutable. Completed hand files are immutable.
      writeFileSync(
        checkpoint,
        `${JSON.stringify({ ...manifest, lastCompleteHand: index }, null, 2)}\n`,
      );
      console.log(
        JSON.stringify({
          completed: index,
          totalCompleted: manifest.files.length,
          durationMs,
          counts: manifest.counts,
          automaticIssues: manifest.issues.length,
        }),
      );
    }
    assert.equal(
      phase3Digest(api.source).digest,
      manifest.sourceDigest,
      'Source changed during audit; freeze source before running',
    );
    assert.equal(
      harnessFingerprint().digest,
      manifest.harness.digest,
      'Harness changed during audit',
    );
    manifest.completedAt = now();
    exclusiveJSON(path.join(output, `complete-${start}-${end}.json`), manifest);
    writeFileSync(checkpoint, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (error) {
    exclusiveJSON(path.join(output, `failure-${start}-${end}-${Date.now()}.json`), {
      at: now(),
      completedHands: manifest.files.length,
      nextHand: start + manifest.files.length,
      error: error.stack,
      sourceDigest: manifest.sourceDigest,
      harnessDigest: manifest.harness.digest,
    });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  await runPhase3Audit();
}
