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
import { deriveSeed, seededRandom } from './bot-exploit-policy.mjs';
import { pairedLearningDifference } from './player-learning-protocol.mjs';
import { postflopEvaluationDesign } from './postflop-evaluation-protocol.mjs';
import { checkedPostflopGame, CHECKED_POSTFLOP_CASES } from '../tests/fixtures/checked-postflop.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')),
);
const stage = args.stage || 'register',
  output = path.resolve(args.output || '.artifacts/checked-postflop');
assert.ok(['register', 'measure', 'audit', 'summarize'].includes(stage));
assert.ok(output.startsWith(path.join(root, '.artifacts') + path.sep));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const load = (name) => JSON.parse(readFileSync(path.join(output, name)));
function write(name, value) {
  const target = path.join(output, name);
  writeFileSync(target + '.tmp', JSON.stringify(value, null, 2) + '\n');
  renameSync(target + '.tmp', target);
}
function producer(file) {
  const folder = path.dirname(file),
    hash = createHash('sha256');
  for (const name of readdirSync(folder)
    .filter((name) => name.endsWith('.js'))
    .sort())
    hash.update(name + '\0').update(readFileSync(path.join(folder, name)));
  return {
    file,
    sourceDigest: hash.digest('hex'),
    charactersDigest: sha(readFileSync(path.join(folder, '../data/characters.json'))),
  };
}
const tools = [
  'scripts/measure-checked-postflop.mjs',
  'scripts/postflop-evaluation-protocol.mjs',
  'scripts/player-learning-protocol.mjs',
  'scripts/bot-exploit-policy.mjs',
  'tests/fixtures/checked-postflop.js',
  'src/engine/stakes.js',
];
const toolHashes = () =>
  Object.fromEntries(tools.map((name) => [name, sha(readFileSync(path.join(root, name)))]));
function visibleState(game) {
  return structuredClone({
    actor: game.actor,
    street: game.street,
    board: game.board,
    hole: game.players[1].hole,
    stakes: game.stakes,
    history: game.history,
    players: game.players.map(({ id, stack, bet, total, folded, allin, botProfile }) => ({
      id,
      stack,
      bet,
      total,
      folded,
      allin,
      botProfile,
    })),
  });
}
function metrics(decision) {
  const plan = decision.trace.style?.linePlan,
    model = decision.trace.view.publicStrategy;
  const option = model?.options.find((choice) => choice.amount === decision.amount);
  return {
    decisions: 1,
    raises: Number(decision.action === 'raise'),
    checks: Number(decision.action === 'check'),
    calls: Number(decision.action === 'call'),
    folds: Number(decision.action === 'fold'),
    protection: Number(plan?.kind === 'checked-value-protection'),
    checkedPressure: Number(
      ['checked-marginal-or-unmade', 'prior-checkthrough-marginal-or-unmade'].includes(
        plan?.rangeRead,
      ),
    ),
    plan: plan?.kind ?? null,
    rangeRead: plan?.rangeRead ?? null,
    fraction: option?.fraction ?? null,
    calledEquity: option?.calledEquity ?? null,
    worseMadeCallMass: option?.worseMadeCallMass ?? null,
    drawCallMass: option?.drawCallMass ?? null,
    raiseProbability: option?.raiseProbability ?? null,
    estimatedValue: option?.estimatedValue ?? null,
  };
}
function replayDecision(engine, game, action) {
  const initial = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
  engine.act(game, 1, action.action, action.amount);
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack + (game.phase === 'done' ? 0 : p.total), 0),
    initial,
  );
  for (const player of game.players)
    for (const value of [player.stack, player.bet, player.total])
      assert.ok(Number.isSafeInteger(value) && value >= 0 && value % game.chipUnit === 0);
}

if (stage === 'register') {
  assert.ok(args.before && args.after);
  assert.ok(!existsSync(path.join(output, 'protocol.json')));
  const design = postflopEvaluationDesign(args.smoke === 'true');
  assert.ok(design.cases.every((name) => Object.hasOwn(CHECKED_POSTFLOP_CASES, name)));
  const engines = {
    before: producer(path.resolve(args.before)),
    after: producer(path.resolve(args.after)),
  };
  assert.notEqual(engines.before.sourceDigest, engines.after.sourceDigest);
  mkdirSync(output, { recursive: true });
  write('protocol.json', {
    at: new Date().toISOString(),
    status: design.smoke ? 'smoke-only' : 'registered-before-new-outcomes',
    design,
    engines,
    toolHashes: toolHashes(),
  });
  console.log(JSON.stringify({ status: 'registered', output, design }));
} else {
  const protocol = load('protocol.json'),
    design = protocol.design;
  const verify = () => {
    assert.deepEqual(toolHashes(), protocol.toolHashes, 'Frozen fixture or tool changed');
    for (const record of Object.values(protocol.engines))
      assert.deepEqual(producer(record.file), record, 'Frozen producer changed');
  };
  verify();
  const engines = Object.fromEntries(
    await Promise.all(
      Object.entries(protocol.engines).map(async ([key, record]) => [
        key,
        await import(pathToFileURL(record.file).href),
      ]),
    ),
  );
  function fixture(engine, scenario, profile, seedIndex) {
    return checkedPostflopGame({
      engine,
      scenario,
      count: design.players,
      opponents: design.liveOpponents,
      profile,
      difficulty: design.difficulty,
      seed: deriveSeed(design.seed, scenario, profile, seedIndex, 'fixture'),
    });
  }
  function decide(engine, game, scenario, profile, seedIndex) {
    const random = seededRandom(deriveSeed(design.seed, scenario, profile, seedIndex, 'policy'));
    const timingRandom = seededRandom(
      deriveSeed(design.seed, scenario, profile, seedIndex, 'timing'),
    );
    return engine.executeBotTurn(game, engine.planBotTurn(game, random, { timingRandom }), {
      expedited: true,
    });
  }
  if (stage === 'measure') {
    const [shard, shards] = (args.shard || '0/1').split('/').map(Number);
    assert.ok([1, 2].includes(shards) && Number.isInteger(shard) && shard >= 0 && shard < shards);
    for (const [index, scenario] of design.cases.entries()) {
      if (index % shards !== shard) continue;
      verify();
      const lock = path.join(output, scenario + '.lock'),
        descriptor = openSync(lock, 'wx');
      try {
        assert.ok(
          !existsSync(path.join(output, scenario + '.json')),
          'Completed outcome is immutable',
        );
        const records = [],
          contamination = [],
          started = Date.now();
        for (const profile of design.profiles)
          for (let seedIndex = 0; seedIndex < design.seeds; seedIndex++) {
            let pairedVisible = null;
            for (const [role, engine] of Object.entries(engines)) {
              const game = fixture(engine, scenario, profile, seedIndex),
                visible = visibleState(game);
              if (pairedVisible)
                assert.deepEqual(
                  visible,
                  pairedVisible,
                  'Old/new before-action public condition differs',
                );
              else pairedVisible = structuredClone(visible);
              const decision = decide(engine, game, scenario, profile, seedIndex),
                measurement = metrics(decision);
              if (design.casesByRole[scenario].category.includes('danger-control')) {
                assert.equal(
                  measurement.protection,
                  0,
                  'Protection branch entered a declared dangerous control',
                );
                assert.equal(
                  measurement.checkedPressure,
                  0,
                  'Checked-range pressure marker entered a declared dangerous control',
                );
              }
              records.push({
                scenario,
                profile,
                seedIndex,
                role,
                visible,
                decision,
                metrics: measurement,
              });
              if (!design.smoke && profile === 'balanced' && seedIndex === 0) {
                const alternate = fixture(engine, scenario, profile, seedIndex);
                const hidden = [
                  ...alternate.players.filter((p) => p.id !== 1).flatMap((p) => p.hole),
                  ...alternate.deck,
                ].reverse();
                for (const player of alternate.players)
                  if (player.id !== 1) player.hole = hidden.splice(0, 2);
                alternate.deck = hidden;
                assert.deepEqual(visibleState(alternate), visible);
                const shadow = decide(engine, alternate, scenario, profile, seedIndex);
                assert.deepEqual(
                  shadow,
                  decision,
                  'Hidden opponent cards or future deck changed the decision',
                );
                contamination.push({ scenario, role, profile, seedIndex, status: 'passed' });
              }
            }
          }
        const bytes = gzipSync(JSON.stringify(records));
        writeFileSync(path.join(output, scenario + '.json.gz'), bytes);
        write(scenario + '.json', {
          scenario,
          decisions: records.length,
          contamination,
          traceSha256: sha(bytes),
          elapsedMs: Date.now() - started,
        });
        console.log(
          JSON.stringify({
            scenario,
            decisions: records.length,
            contaminationChecks: contamination.length,
            elapsedMs: Date.now() - started,
          }),
        );
      } finally {
        closeSync(descriptor);
        unlinkSync(lock);
      }
    }
  } else if (stage === 'audit') {
    const report = { status: 'running', decisions: 0, hiddenInformationChecks: 0, scenarios: 0 };
    for (const scenario of design.cases) {
      const summary = load(scenario + '.json'),
        bytes = readFileSync(path.join(output, scenario + '.json.gz'));
      assert.equal(sha(bytes), summary.traceSha256);
      const records = JSON.parse(gunzipSync(bytes)),
        seen = new Set();
      assert.equal(records.length, design.profiles.length * design.seeds * 2);
      for (const record of records) {
        assert.equal(record.scenario, scenario);
        assert.ok(design.profiles.includes(record.profile));
        assert.ok(
          Number.isInteger(record.seedIndex) &&
            record.seedIndex >= 0 &&
            record.seedIndex < design.seeds,
        );
        assert.ok(engines[record.role]);
        const key = `${record.profile}:${record.seedIndex}:${record.role}`;
        assert.ok(!seen.has(key));
        seen.add(key);
        const engine = engines[record.role],
          game = fixture(engine, scenario, record.profile, record.seedIndex);
        assert.deepEqual(visibleState(game), record.visible);
        const view = record.decision.trace.view;
        assert.deepEqual(view.hole, game.players[1].hole);
        assert.deepEqual(view.board, game.board);
        assert.ok(!('deck' in view));
        for (const opponent of view.opponents) {
          assert.ok(!('hole' in opponent));
          assert.equal(opponent.stack, game.players[opponent.id].stack);
        }
        assert.deepEqual(metrics(record.decision), record.metrics);
        replayDecision(engine, game, record.decision);
        report.decisions++;
      }
      report.hiddenInformationChecks += summary.contamination.length;
      report.scenarios++;
    }
    assert.equal(report.decisions, design.decisions);
    assert.equal(report.hiddenInformationChecks, design.hiddenInformationChecks);
    report.status = 'passed';
    write('independent-audit.json', report);
    console.log(JSON.stringify(report));
  } else {
    const audited = load('independent-audit.json');
    assert.equal(audited.status, 'passed');
    const results = [];
    for (const scenario of design.cases) {
      const records = JSON.parse(
        gunzipSync(readFileSync(path.join(output, scenario + '.json.gz'))),
      );
      const totals = {};
      for (const role of ['before', 'after']) {
        const selected = records.filter((r) => r.role === role),
          count = (key) => selected.reduce((sum, row) => sum + row.metrics[key], 0);
        totals[role] = {
          decisions: selected.length,
          raises: count('raises'),
          checks: count('checks'),
          calls: count('calls'),
          folds: count('folds'),
          protection: count('protection'),
          checkedPressure: count('checkedPressure'),
          raiseRate: count('raises') / selected.length,
          plans: Object.fromEntries(
            [...new Set(selected.map((r) => r.metrics.plan))].map((kind) => [
              kind ?? 'none',
              selected.filter((r) => r.metrics.plan === kind).length,
            ]),
          ),
        };
      }
      const comparisons = [];
      if (!design.smoke)
        for (const profile of ['all-styles', ...design.profiles]) {
          const paired = Array.from({ length: design.seeds }, (_, block) => ({
            block,
            arms: Object.fromEntries(
              ['before', 'after'].map((role) => {
                const selected = records.filter(
                  (r) =>
                    r.seedIndex === block &&
                    r.role === role &&
                    (profile === 'all-styles' || r.profile === profile),
                );
                return [
                  role,
                  {
                    decisions: selected.length,
                    raises: selected.reduce((sum, r) => sum + r.metrics.raises, 0),
                  },
                ];
              }),
            ),
          }));
          comparisons.push({
            profile,
            ...pairedLearningDifference(paired, 'before', 'after', {
              numerator: 'raises',
              denominator: 'decisions',
              direction: 'increase',
              seed: 28101612,
            }),
          });
        }
      results.push({ scenario, role: design.casesByRole[scenario], totals, comparisons });
    }
    const report = {
      at: new Date().toISOString(),
      design,
      engines: protocol.engines,
      audit: audited,
      results,
      scope: design.scope,
    };
    write('report.json', report);
    console.log(
      JSON.stringify({ output, decisions: audited.decisions, smokeOnly: design.smoke, results }),
    );
  }
}
