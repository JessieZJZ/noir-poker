import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fixedAttack, seededRandom } from './bot-exploit-policy.mjs';
import { freshSimulationGame, carrySimulationMemory } from './style-simulation-game.mjs';
import {
  LEARNING_ARMS,
  learningDesign,
  learningSeeds,
  learningLineup,
  eligibleHeroShove,
  actualAllFold,
  pairedLearningDifference,
} from './player-learning-protocol.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')),
);
const stage = args.stage || 'register';
assert.ok(['register', 'measure', 'audit', 'summarize'].includes(stage));
const output = path.resolve(args.output || '.artifacts/player-learning');
assert.ok(
  output.startsWith(path.join(workspace, '.artifacts') + path.sep),
  'Raw learning records stay local',
);
const load = (name) => JSON.parse(readFileSync(path.join(output, name)));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => sha(readFileSync(file));
function write(name, data) {
  const target = path.join(output, name);
  writeFileSync(target + '.tmp', JSON.stringify(data, null, 2) + '\n');
  renameSync(target + '.tmp', target);
}
function engineSource(file) {
  const root = path.dirname(file),
    hash = createHash('sha256');
  for (const name of readdirSync(root)
    .filter((name) => name.endsWith('.js'))
    .sort())
    hash.update(name + '\0').update(readFileSync(path.join(root, name)));
  const characters = path.join(root, '../data/characters.json');
  return { file, sourceDigest: hash.digest('hex'), charactersDigest: fileHash(characters) };
}
const toolFiles = [
  'measure-player-learning.mjs',
  'player-learning-protocol.mjs',
  'bot-exploit-policy.mjs',
  'style-simulation-game.mjs',
];
function toolHashes() {
  return Object.fromEntries(
    toolFiles.map((name) => [name, fileHash(path.join(workspace, 'scripts', name))]),
  );
}
function assertPublicProfile(profile) {
  assert.ok(profile && profile.version === 1 && Array.isArray(profile.samples));
  assert.ok(profile.samples.length <= 64);
  assert.ok(Number.isFinite(profile.totalHands) && profile.totalHands >= 0);
  const hidden = new Set([
    'hole',
    'board',
    'deck',
    'winner',
    'winners',
    'payouts',
    'refunds',
    'profitBB',
    'stack',
  ]);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert.ok(
        !hidden.has(key),
        'Persistent learning must not contain hidden/result data: ' + key,
      );
      visit(item);
    }
  };
  visit(profile);
}

if (stage === 'register') {
  assert.ok(args.before && args.after, 'Register frozen before and after engine paths first');
  assert.ok(
    !existsSync(path.join(output, 'protocol.json')),
    'Never overwrite an existing registration',
  );
  const smoke = args.smoke === 'true';
  const design = learningDesign(smoke ? 28101600 : 28101601);
  if (smoke)
    Object.assign(design, {
      blocks: 1,
      strata: { balanced: 1, mixed: 0 },
      plannedTrainingHands: 16,
      plannedEvaluationHands: 30,
      plannedHands: 46,
    });
  const engines = {
    before: engineSource(path.resolve(args.before)),
    after: engineSource(path.resolve(args.after)),
  };
  assert.notEqual(
    engines.before.sourceDigest,
    engines.after.sourceDigest,
    'Before and after must be independently identified',
  );
  mkdirSync(output, { recursive: true });
  write('protocol.json', {
    registeredAt: new Date().toISOString(),
    status: smoke ? 'smoke-only-not-an-acceptance-sample' : 'registered-before-new-outcomes',
    smoke,
    design,
    engines,
    toolHashes: toolHashes(),
    execution:
      'At most two measurement/replay workers. Optional disjoint shards 0/2 and 1/2; never restart or add blocks based on observed significance.',
    limitations: [
      'Fixed nine seats and 100BB, not actual bankroll sessions.',
      'The formal seed must not be used for policy tuning; a further revision needs a fresh registration.',
      'No model is trained from hidden cards, wins or future cards. Saved raw traces remain local.',
    ],
  });
  console.log(JSON.stringify({ status: 'registered', output, design }));
} else {
  const protocol = load('protocol.json'),
    design = protocol.design;
  assert.deepEqual(toolHashes(), protocol.toolHashes, 'Registered measurement tools changed');
  for (const record of Object.values(protocol.engines))
    assert.deepEqual(engineSource(record.file), record, 'Frozen engine inputs changed');
  const engines = {};
  for (const [key, record] of Object.entries(protocol.engines)) {
    const engine = await import(pathToFileURL(record.file).href);
    const observations = await import(
      pathToFileURL(path.join(path.dirname(record.file), 'public-observations.js')).href
    );
    engines[key] = { engine, observations };
  }
  for (const name of [
    'importPlayerObservations',
    'exportPlayerObservations',
    'publicReadForPlayer',
  ])
    assert.equal(
      typeof engines.after.engine[name],
      'function',
      'New engine observation API is required: ' + name,
    );

  function begin(bundle, block, hand, role, previous, profile) {
    const game = freshSimulationGame(
      bundle.engine,
      9,
      block * 1000 + (role === 'train' ? 0 : 100) + hand,
      design.difficulty,
    );
    game.emotionMode = design.emotions;
    carrySimulationMemory(previous, game);
    const lineup = learningLineup(block);
    for (const [index, player] of game.players.slice(1).entries())
      player.botProfile = lineup.assignments[index];
    // Carry this evaluation block's other public memories/mood first. Import
    // the public-only Hero profile last so carry cannot overwrite training.
    if (profile) {
      assertPublicProfile(profile);
      assert.equal(bundle.engine.importPlayerObservations(game, structuredClone(profile)), true);
    }
    const seeds = learningSeeds(design, block, hand, role === 'train' ? 'train' : 'evaluation');
    const originalRandom = Math.random;
    try {
      Math.random = seededRandom(seeds.deck);
      bundle.engine.startHand(game);
    } finally {
      Math.random = originalRandom;
    }
    return { game, seeds, lineup };
  }
  const historyEntry = ({ id, street, action, amount, betLabel }) => ({
    id,
    street,
    action,
    amount,
    ...(betLabel ? { betLabel } : {}),
  });
  const emptyCounts = () => ({
    hands: 0,
    heroShoves: 0,
    allFoldAfterShove: 0,
    potWins: 0,
    profitBB: 0,
    actions: 0,
    botSnapshots: 0,
    noHeroAction: 0,
    premiumResponses: {},
    styleActions: {},
  });
  function plus(target, source) {
    for (const key of [
      'hands',
      'heroShoves',
      'allFoldAfterShove',
      'potWins',
      'profitBB',
      'actions',
      'botSnapshots',
      'noHeroAction',
    ])
      target[key] += source[key];
    for (const category of ['premiumResponses', 'styleActions'])
      for (const [key, n] of Object.entries(source[category]))
        target[category][key] = (target[category][key] || 0) + n;
    return target;
  }
  function metrics(game, shoveSequence) {
    const data = emptyCounts();
    data.hands = 1;
    data.heroShoves = Number(shoveSequence !== null);
    data.allFoldAfterShove = Number(
      actualAllFold(
        game.players,
        game.players.slice(1).map((p) => p.id),
        shoveSequence !== null,
      ),
    );
    data.potWins = Number(game.winners.some((p) => p.id === 0));
    data.profitBB = (game.players[0].stack - game.stakes.startingStack) / game.bigBlind;
    data.actions = game.history.length;
    data.botSnapshots = game.botDecisions.length;
    data.noHeroAction = Number(!game.history.some((event) => event.id === 0));
    for (const record of game.botDecisions) {
      const view = record.trace.view,
        style = view.botProfile;
      const key = `${style}:${record.action}`;
      data.styleActions[key] = (data.styleActions[key] || 0) + 1;
      if (view.street !== 0 || shoveSequence === null || record.sequence <= shoveSequence) continue;
      const [high, low] = view.hole.map((card) => card.rank).sort((a, b) => b - a);
      const label =
        high === low && high >= 10
          ? ['TT', 'JJ', 'QQ', 'KK', 'AA'][high - 10]
          : high === 14 && low >= 12
            ? low === 13
              ? 'AK'
              : 'AQ'
            : null;
      if (label) {
        const response = label + ':' + (record.action === 'fold' ? 'fold' : 'continue');
        data.premiumResponses[response] = (data.premiumResponses[response] || 0) + 1;
      }
    }
    return data;
  }
  function verifyLedger(game) {
    for (const player of game.players)
      for (const amount of [player.stack, player.bet, player.total])
        assert.ok(Number.isSafeInteger(amount) && amount >= 0 && amount % game.chipUnit === 0);
    assert.equal(
      game.players.reduce((sum, p) => sum + p.stack + (game.phase === 'done' ? 0 : p.total), 0),
      9 * game.stakes.startingStack,
    );
  }
  async function measureCohort(block, role, initialProfile = null) {
    const name = `block-${String(block).padStart(3, '0')}-${role}`;
    assert.ok(
      !existsSync(path.join(output, name + '.json')),
      'A completed cohort is immutable; use a fresh output for a retry',
    );
    const bundle = role === 'old-cold' ? engines.before : engines.after;
    const count = role === 'train' ? design.trainHands : design.evaluationHands;
    let previous = null,
      profile = initialProfile ? JSON.parse(JSON.stringify(initialProfile)) : null;
    const records = [],
      summary = emptyCounts(),
      started = Date.now();
    for (let hand = 0; hand < count; hand++) {
      const beforeProfile = profile ? structuredClone(profile) : null;
      const { game, seeds, lineup } = begin(bundle, block, hand, role, previous, profile);
      const deckHash = sha(
        JSON.stringify({ hole: game.players.map((p) => p.hole), deck: game.deck }),
      );
      const policyRandom = seededRandom(seeds.policy),
        timingRandom = seededRandom(seeds.timing);
      let turns = 0,
        heroActions = 0,
        shoveSequence = null;
      while (game.phase !== 'done') {
        assert.ok(++turns < 1000, 'A learning hand must terminate');
        if (game.phase === 'between') bundle.engine.advanceStreet(game);
        else if (game.actor === 0) {
          const legal = bundle.engine.legalActions(game);
          const action = fixedAttack(
            { legal, currentBet: game.currentBet, pot: bundle.engine.potSize(game) },
            design.policy,
          );
          if (
            eligibleHeroShove({
              id: 0,
              street: game.street,
              firstHeroAction: heroActions === 0,
              ...action,
              legal,
            })
          )
            shoveSequence = game.history.length + 1;
          bundle.engine.act(game, 0, action.action, action.amount);
          heroActions++;
        } else
          bundle.engine.executeBotTurn(
            game,
            bundle.engine.planBotTurn(game, policyRandom, { timingRandom }),
            { expedited: true },
          );
        verifyLedger(game);
      }
      assert.ok(
        game.players.slice(1).every((p, index) => p.botProfile === lineup.assignments[index]),
        'Learning cannot change a bot style',
      );
      for (const record of game.botDecisions)
        assert.ok(record.trace.thinking.expedited && record.trace.thinking.waitedMs === 0);
      const result = metrics(game, shoveSequence);
      plus(summary, result);
      records.push({
        block,
        role,
        hand,
        seeds,
        deckHash,
        beforePlayerProfile: beforeProfile,
        shoveSequence,
        metrics: result,
        game,
      });
      if (role !== 'old-cold') {
        profile = JSON.parse(JSON.stringify(bundle.engine.exportPlayerObservations(game)));
        assertPublicProfile(profile);
        assert.equal(
          profile.totalHands,
          (initialProfile?.totalHands || 0) + hand + 1,
          'Each completed hand contributes exactly once',
        );
      }
      previous = game;
    }
    const bytes = gzipSync(JSON.stringify(records));
    const trace = path.join(output, name + '.json.gz');
    writeFileSync(trace + '.tmp', bytes);
    renameSync(trace + '.tmp', trace);
    const final = {
      name,
      block,
      role,
      stratum: learningLineup(block).stratum,
      ...summary,
      initialProfile,
      finalProfile: profile,
      traceSha256: sha(bytes),
      sourceDigest: (role === 'old-cold' ? protocol.engines.before : protocol.engines.after)
        .sourceDigest,
      elapsedMs: Date.now() - started,
    };
    write(name + '.json', final);
    console.log(
      JSON.stringify({
        name,
        hands: summary.hands,
        heroShoves: summary.heroShoves,
        allFoldAfterShove: summary.allFoldAfterShove,
        elapsedMs: final.elapsedMs,
      }),
    );
    return final;
  }
  async function measure() {
    const [shard, shards] = (args.shard || '0/1').split('/').map(Number);
    assert.ok([1, 2].includes(shards) && Number.isInteger(shard) && shard >= 0 && shard < shards);
    const lock = path.join(output, `measurement-${shard}-${shards}.lock`),
      descriptor = openSync(lock, 'wx');
    try {
      for (let block = 0; block < design.blocks; block++) {
        if (block % shards !== shard) continue;
        const blockLock = path.join(output, `block-${block}.lock`),
          blockDescriptor = openSync(blockLock, 'wx');
        try {
          const trained = await measureCohort(block, 'train');
          assert.equal(trained.finalProfile.totalHands, design.trainHands);
          for (const role of LEARNING_ARMS)
            await measureCohort(
              block,
              role,
              role === 'new-warm' ? JSON.parse(JSON.stringify(trained.finalProfile)) : null,
            );
        } finally {
          closeSync(blockDescriptor);
          unlinkSync(blockLock);
        }
      }
    } finally {
      closeSync(descriptor);
      unlinkSync(lock);
    }
  }
  async function audit() {
    const report = {
      status: 'running',
      blocks: 0,
      hands: 0,
      actions: 0,
      botSnapshots: 0,
      profilesRoundTripped: 0,
    };
    for (let block = 0; block < design.blocks; block++) {
      const trainName = `block-${String(block).padStart(3, '0')}-train`;
      const trained = load(trainName + '.json');
      for (const role of ['train', ...LEARNING_ARMS]) {
        const name = `block-${String(block).padStart(3, '0')}-${role}`,
          summary = load(name + '.json');
        const bytes = readFileSync(path.join(output, name + '.json.gz'));
        assert.equal(sha(bytes), summary.traceSha256);
        const records = JSON.parse(gunzipSync(bytes));
        const bundle = role === 'old-cold' ? engines.before : engines.after;
        let previous = null,
          profile = role === 'new-warm' ? JSON.parse(JSON.stringify(trained.finalProfile)) : null;
        assert.deepEqual(summary.initialProfile, profile);
        if (profile) {
          assertPublicProfile(profile);
          report.profilesRoundTripped++;
        }
        const totals = emptyCounts();
        for (const [hand, record] of records.entries()) {
          assert.equal(record.hand, hand);
          assert.equal(record.block, block);
          assert.equal(record.role, role);
          assert.deepEqual(record.beforePlayerProfile, profile);
          const { game, seeds } = begin(bundle, block, hand, role, previous, profile);
          assert.deepEqual(seeds, record.seeds);
          assert.equal(
            sha(JSON.stringify({ hole: game.players.map((p) => p.hole), deck: game.deck })),
            record.deckHash,
          );
          const traces = new Map(record.game.botDecisions.map((entry) => [entry.sequence, entry]));
          let heroActions = 0,
            shoveSequence = null;
          const publicRead = (id) =>
            bundle.engine.publicReadForPlayer
              ? bundle.engine.publicReadForPlayer(game, id)
              : bundle.observations.summarizePublicRead(game.players[id].publicReads);
          for (const [index, event] of record.game.history.entries()) {
            while (game.phase === 'between') bundle.engine.advanceStreet(game);
            assert.equal(game.phase, 'playing');
            assert.equal(game.actor, event.id);
            assert.equal(game.street, event.street);
            if (event.id === 0) {
              const legal = bundle.engine.legalActions(game),
                expected = fixedAttack(
                  { legal, currentBet: game.currentBet, pot: bundle.engine.potSize(game) },
                  design.policy,
                );
              assert.equal(event.action, expected.action);
              if (expected.action === 'raise') assert.equal(event.amount, expected.amount);
              if (
                eligibleHeroShove({
                  id: 0,
                  street: game.street,
                  firstHeroAction: heroActions === 0,
                  ...expected,
                  legal,
                })
              )
                shoveSequence = index + 1;
              heroActions++;
            } else {
              const entry = traces.get(index + 1);
              assert.ok(entry);
              const view = entry.trace.view;
              assert.equal(entry.action, event.action);
              if (event.action === 'raise') assert.equal(entry.amount, event.amount);
              assert.deepEqual(view.hole, game.players[event.id].hole);
              assert.deepEqual(view.board, game.board);
              assert.deepEqual(view.history, game.history.map(historyEntry));
              assert.equal(view.stack, game.players[event.id].stack);
              assert.deepEqual(view.publicRead, publicRead(event.id));
              assert.ok(!('deck' in view));
              for (const opponent of view.opponents) {
                assert.ok(!('hole' in opponent));
                assert.equal(opponent.stack, game.players[opponent.id].stack);
                assert.deepEqual(opponent.publicRead, publicRead(opponent.id));
              }
              report.botSnapshots++;
            }
            bundle.engine.act(game, event.id, event.action, event.amount);
            verifyLedger(game);
            report.actions++;
          }
          while (game.phase === 'between') bundle.engine.advanceStreet(game);
          assert.equal(game.phase, 'done');
          for (const key of ['board', 'payouts', 'refunds', 'pots', 'winners'])
            assert.deepEqual(game[key], record.game[key]);
          assert.deepEqual(
            game.players.map((p) => p.stack),
            record.game.players.map((p) => p.stack),
          );
          assert.equal(shoveSequence, record.shoveSequence);
          // Metrics use the audited actor snapshots, whose private actor cards
          // have just been matched, never another seat's hidden cards to act.
          game.botDecisions = record.game.botDecisions;
          const result = metrics(game, shoveSequence);
          assert.deepEqual(result, record.metrics);
          plus(totals, result);
          if (role !== 'old-cold') {
            profile = JSON.parse(JSON.stringify(bundle.engine.exportPlayerObservations(game)));
            assertPublicProfile(profile);
          }
          previous = game;
          report.hands++;
        }
        assert.equal(records.length, role === 'train' ? design.trainHands : design.evaluationHands);
        for (const key of Object.keys(totals)) assert.deepEqual(totals[key], summary[key]);
        assert.deepEqual(profile, summary.finalProfile);
      }
      report.blocks++;
    }
    assert.equal(report.hands, design.plannedHands);
    report.status = 'passed';
    write('independent-audit.json', report);
    console.log(JSON.stringify(report));
  }
  function summarize() {
    const audited = load('independent-audit.json');
    assert.equal(audited.status, 'passed');
    assert.equal(audited.blocks, design.blocks);
    const rows = Array.from({ length: design.blocks }, (_, block) => ({
      block,
      stratum: learningLineup(block).stratum,
      arms: Object.fromEntries(
        LEARNING_ARMS.map((role) => [
          role,
          load(`block-${String(block).padStart(3, '0')}-${role}.json`),
        ]),
      ),
    }));
    const armTotals = {};
    for (const arm of LEARNING_ARMS) {
      const total = rows.reduce((result, row) => plus(result, row.arms[arm]), emptyCounts());
      armTotals[arm] = {
        ...total,
        allFoldRate: total.allFoldAfterShove / total.heroShoves,
        potWinRate: total.potWins / total.hands,
        bbPer100: (total.profitBB * 100) / total.hands,
      };
    }
    const comparisons = [],
      pairs = [
        ['old-cold', 'new-cold'],
        ['old-cold', 'new-warm'],
        ['new-cold', 'new-warm'],
      ];
    if (!protocol.smoke)
      for (const stratum of ['overall', 'balanced', 'mixed']) {
        const group = rows.filter((row) => stratum === 'overall' || row.stratum === stratum);
        for (const [before, after] of pairs)
          comparisons.push({ stratum, ...pairedLearningDifference(group, before, after) });
      }
    const report = {
      at: new Date().toISOString(),
      smokeOnly: protocol.smoke,
      design,
      engines: protocol.engines,
      audit: audited,
      armTotals,
      comparisons,
      scope:
        'Fixed-budget paired learning evidence. Training and new evaluation seeds separated; no optional stopping. Per-stratum and overall comparisons are pointwise, not simultaneous global claims.',
    };
    write('report.json', report);
    console.log(
      JSON.stringify({ output, smokeOnly: protocol.smoke, arms: armTotals, comparisons }),
    );
  }
  if (stage === 'measure') await measure();
  else if (stage === 'audit') await audit();
  else summarize();
}
