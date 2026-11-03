// Full legal hands and conditional policy comparisons. Detailed records remain local.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { freshSimulationGame } from './style-simulation-game.mjs';

export const interactionRandom = (initial) => {
  let state = initial >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
export function interactionSourceDigest(root) {
  const files = readdirSync(path.join(root, 'src/engine'))
    .filter((s) => s.endsWith('.js'))
    .sort();
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(readFileSync(path.join(root, 'src/engine', f)));
  return h.update(readFileSync(path.join(root, 'src/data/characters.json'))).digest('hex');
}
export async function loadInteractionSource(root) {
  return {
    engine: await import(pathToFileURL(path.resolve(root, 'src/engine/poker.js'))),
    policy: await import(pathToFileURL(path.resolve(root, 'src/engine/bot-profiles.js'))),
  };
}
export function interactionPlacement(count, hand) {
  const target = 1 + (Math.floor(hand / count) % (count - 1));
  const dealer = (target - (hand % count) + count) % count;
  return { target, beforeDealer: (dealer + count - 1) % count };
}
export function validateInteractionLedger(engine, game, expected) {
  for (const p of game.players) {
    assert(p.stack >= 0 && p.stack % game.chipUnit === 0);
    assert(p.total >= 0 && p.total % game.chipUnit === 0);
  }
  assert.equal(
    game.players.reduce((n, p) => n + p.stack + (game.phase === 'done' ? 0 : p.total), 0),
    expected,
  );
  const visible = [...game.board, ...game.players.flatMap((p) => p.hole), ...game.deck];
  assert.equal(new Set(visible.map((c) => c.key)).size, visible.length);
  if (game.phase === 'done') assert.equal(engine.legalActions(game).enabled, false);
}
export function interactionOpportunities(v) {
  const result = [],
    l = v.legal,
    f = v.features;
  const raises = v.history.filter((a) => a.action === 'raise');
  const checked =
    v.street > 0 &&
    l.canCheck &&
    v.inPosition &&
    v.opponents.length &&
    v.opponents.every(
      (p) =>
        !p.allin &&
        p.stack > 0 &&
        v.history.some((a) => a.street === v.street && a.id === p.id && a.action === 'check'),
    );
  const hu = v.rivals === 1 && (v.publicEquity?.assumedOpponentIds.length ?? 1) === 1;
  if (
    v.street === 0 &&
    ['BTN', 'CO'].includes(v.position) &&
    !raises.length &&
    !v.allIn &&
    !v.history.some((a) => a.action === 'call' && a.amount > 0)
  )
    result.push('late-open');
  if (
    checked &&
    v.street < 3 &&
    !f.ownMade &&
    !f.draw &&
    !f.wet &&
    v.rivals <= 2 &&
    v.equity >= 0.15 &&
    v.equity < 0.65 &&
    Math.max(...v.hole.map((c) => c.rank)) >= 12
  )
    result.push('position-air');
  const flopRaises = raises.filter((a) => a.street === 1);
  if (
    checked &&
    hu &&
    v.street === 2 &&
    flopRaises.length === 1 &&
    flopRaises[0].id === v.id &&
    f.drawOuts >= 8
  )
    result.push('turn-draw-followup');
  const pre = raises.filter((a) => a.street === 0);
  if (
    checked &&
    hu &&
    v.street === 1 &&
    !f.ownMade &&
    !f.draw &&
    !f.wet &&
    v.equity >= 0.28 &&
    v.equity < 0.6 &&
    pre.length === 1 &&
    pre[0].id === v.id &&
    Math.max(...v.board.map((c) => c.rank)) >= 11
  )
    result.push('routine-cbet-air');
  if (
    checked &&
    hu &&
    f.ownMade &&
    !f.strongMade &&
    !f.draw &&
    !f.wet &&
    v.equity >= 0.3 &&
    v.equity <= 0.6
  )
    result.push('medium-showdown');
  if (
    hu &&
    v.street > 0 &&
    l.callAmount > 0 &&
    !v.allIn &&
    f.ownMade &&
    !f.strongMade &&
    !f.wet &&
    v.equity >= (v.callPrice?.odds ?? 0) + 0.05 &&
    l.callAmount <= (v.stack + v.bet) * 0.08
  )
    result.push('priced-medium-defense');
  return result;
}
export function playInteractionHand({
  before,
  candidate,
  count,
  hand,
  difficulty,
  seed,
  profile,
  variant,
  lineup,
  emotion = 'off',
  deployment = false,
}) {
  const e = before.engine,
    g = freshSimulationGame(e, count, hand, difficulty);
  const { target, beforeDealer } = interactionPlacement(count, hand);
  g.dealer = beforeDealer;
  const allProfiles = ['balanced', 'rook', 'jett', 'owen', 'vale', 'nico', 'mira', 'iris'];
  const assignments = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      i,
      i === target
        ? profile
        : lineup === 'fixed-baseline-mixed'
          ? allProfiles[(i + hand) % 8]
          : 'balanced',
    ]),
  );
  const deckSeed = (seed + count * 1031 + hand * 100003) >>> 0;
  const prior = Math.random;
  Math.random = interactionRandom(deckSeed);
  try {
    e.startHand(g);
  } finally {
    Math.random = prior;
  }
  const initial = structuredClone(g),
    expected = count * g.stakes.startingStack;
  const events = [],
    views = [],
    sharedStreets = new Set(),
    exchanges = new Set();
  let sharedFlop = false,
    heroFaces = false,
    targetFaces = false,
    quiet = true,
    targetVPIP = false,
    targetPFR = false;
  const actorCounts = new Map();
  while (g.phase !== 'done') {
    assert(events.length < 600);
    if (g.phase === 'between') {
      e.advanceStreet(g);
      if (g.street === 1 && !g.players[0].folded && !g.players[target].folded) sharedFlop = true;
      continue;
    }
    const actor = g.actor,
      n = actorCounts.get(actor) || 0;
    actorCounts.set(actor, n + 1);
    const policySeed = (seed + count * 977 + hand * 700001 + actor * 7919 + n * 130003) >>> 0;
    const v = e.botDecision(g, interactionRandom(policySeed)).trace.view;
    const module =
      deployment || (actor === target && variant === 'candidate')
        ? candidate.policy
        : before.policy;
    const id = actor === 0 ? 'balanced' : assignments[actor];
    const mood = module.freshBotMood();
    if (deployment)
      mood.kind = ['steady', 'frustrated', 'cautious', 'confident', 'reactive'][hand % 5];
    const d = module.chooseBotAction(
      v,
      module.getBotProfile(id),
      mood,
      emotion,
      interactionRandom(policySeed + 19000031),
    );
    const last = v.history.filter((a) => a.street === v.street && a.action === 'raise').at(-1);
    if (v.street > 0) {
      if (actor === 0 && !g.players[target].folded) {
        sharedStreets.add(g.street);
        if (last?.id === target && v.legal.callAmount > 0) heroFaces = true;
      }
      if (actor === target && last?.id === 0 && v.legal.callAmount > 0) targetFaces = true;
      if (
        ((actor === 0 && last?.id === target) || (actor === target && last?.id === 0)) &&
        ['call', 'raise'].includes(d.action)
      )
        exchanges.add(g.street);
      if (d.action === 'raise') quiet = false;
    }
    if (actor === target && v.street === 0) {
      targetVPIP ||= ['call', 'raise'].includes(d.action) && v.legal.callAmount > 0;
      targetPFR ||= d.action === 'raise';
    }
    if (actor === target)
      views.push({ view: v, decision: d, opportunities: interactionOpportunities(v) });
    if (d.action === 'raise')
      assert(
        v.legal.canRaise &&
          d.amount >= v.legal.minRaiseTo &&
          d.amount <= v.legal.maxRaiseTo &&
          d.amount % g.chipUnit === 0,
      );
    events.push({
      actor,
      street: g.street,
      action: d.action,
      amount: d.amount ?? null,
      reason: d.trace.reason,
      plan: d.trace.style.linePlan ?? null,
    });
    e.act(g, actor, d.action, d.amount);
    validateInteractionLedger(e, g, expected);
  }
  return {
    configuration: {
      count,
      hand,
      difficulty,
      seed,
      deckSeed,
      profile,
      variant,
      lineup,
      emotion,
      deployment,
      target,
      targetPosition: e.seatPosition(initial, target),
      heroPosition: e.seatPosition(initial, 0),
    },
    initial,
    events,
    views,
    final: structuredClone(g),
    metrics: {
      hands: 1,
      sharedFlop: Number(sharedFlop),
      heroFacingTargetPostflopHands: Number(heroFaces),
      targetFacingHeroPostflopHands: Number(targetFaces),
      twoStreetExchanges: Number(exchanges.size >= 2),
      heroTargetSharedPostflopStreets: sharedStreets.size,
      quietFiveCard: Number(g.board.length === 5 && quiet),
      targetVPIP: Number(targetVPIP || targetPFR),
      targetPFR: Number(targetPFR),
      targetPostflopRaises: events.filter(
        (a) => a.actor === target && a.street > 0 && a.action === 'raise',
      ).length,
      lineEligible: views.filter((s) => s.decision.trace.style.linePlan).length,
      lineSelected: views.filter((s) => s.decision.trace.style.linePlan?.selected).length,
      lineVeto: views.filter((s) => s.decision.trace.style.linePlan?.veto).length,
    },
  };
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')),
  );
  const base = path.resolve('.artifacts/style-lines-2026-10-24'),
    out = path.resolve(args.out);
  assert(out.startsWith(base + path.sep));
  mkdirSync(out, { recursive: false });
  mkdirSync(path.join(out, 'hands'));
  const protocol = JSON.parse(readFileSync(path.join(base, 'protocol-before-implementation.json')));
  const beforeRoot = path.resolve(args.before || path.join(base, 'before-source')),
    candidateRoot = path.resolve(args.candidate);
  const before = await loadInteractionSource(beforeRoot),
    candidate = await loadInteractionSource(candidateRoot);
  const digests = {
    before: interactionSourceDigest(beforeRoot),
    candidate: interactionSourceDigest(candidateRoot),
  };
  const stage = args.stage || 'development';
  const cells = [];
  if (stage === 'smoke')
    for (const count of protocol.deploymentSmoke.players)
      for (const difficulty of protocol.deploymentSmoke.difficulty)
        for (const emotion of protocol.deploymentSmoke.emotion)
          cells.push({
            count,
            difficulty,
            emotion,
            seed: protocol.deploymentSmoke.seed,
            profile: 'balanced',
            variant: 'candidate',
            lineup: 'fixed-baseline-mixed',
            deployment: true,
          });
  else
    for (const profile of protocol.styles)
      for (const count of protocol.natural.players)
        for (const difficulty of protocol.natural.difficulty)
          for (const seed of stage === 'holdout'
            ? protocol.natural.holdoutSeeds
            : protocol.natural.developmentSeeds)
            for (const lineup of protocol.natural.lineups)
              for (const variant of protocol.natural.variants)
                cells.push({ profile, count, difficulty, seed, lineup, variant });
  const rows = [];
  let total = 0;
  const corpus = [];
  for (const [cellIndex, cell] of cells.entries()) {
    const sum = {},
      n = stage === 'smoke' ? protocol.deploymentSmoke.handsPerCell : protocol.natural.handsPerCell;
    for (let hand = 0; hand < n; hand++) {
      const played = playInteractionHand({ before, candidate, hand, ...cell });
      writeFileSync(
        path.join(out, 'hands', String(total++).padStart(5, '0') + '.json'),
        JSON.stringify(played),
        { flag: 'wx' },
      );
      for (const [k, v] of Object.entries(played.metrics)) sum[k] = (sum[k] || 0) + v;
      if (cell.variant === 'before')
        for (const s of played.views)
          if (s.opportunities.length)
            corpus.push({
              cluster: `${cell.count}/${cell.seed}/${hand}`,
              cell,
              hand,
              view: s.view,
              opportunities: s.opportunities,
            });
    }
    rows.push({ ...cell, metrics: sum });
    console.log(`completed ${cellIndex + 1}/${cells.length} cells; ${total} complete hands`);
  }
  assert.equal(interactionSourceDigest(beforeRoot), digests.before);
  assert.equal(interactionSourceDigest(candidateRoot), digests.candidate);
  writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        stage,
        sourceDigests: digests,
        hands: total,
        rows,
        note: 'Paired initial deals, fixed baseline companions and Hero. Conditional repeats are not new hands. Smoke varies all table policies and configured emotion separately.',
      },
      null,
      2,
    ),
  );
  writeFileSync(path.join(out, 'conditional-corpus.json'), JSON.stringify(corpus));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
)
  await main();
