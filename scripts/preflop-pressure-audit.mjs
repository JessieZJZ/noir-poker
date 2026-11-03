import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  PRESSURE_HANDS,
  PRESSURE_LINES,
  preflopPressureCase,
  finishPressureCase,
} from './preflop-pressure-cases.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const root = resolve(args.source || '.');
const out = resolve(args.out || '.artifacts/preflop-pressure-local');
mkdirSync(out, { recursive: true });
const engine = await import(pathToFileURL(join(root, 'src/engine/poker.js')));
const policy = await import(pathToFileURL(join(root, 'src/engine/bot-profiles.js')));
const seeded = (n) => () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
const h = createHash('sha256');
for (const name of readdirSync(join(root, 'src/engine'))
  .filter((n) => n.endsWith('.js'))
  .sort())
  h.update(name).update(readFileSync(join(root, 'src/engine', name)));
const manifest = {
  at: new Date().toISOString(),
  sourceDigest: h.digest('hex'),
  harnessDigest: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .update(readFileSync(new URL('./preflop-pressure-cases.mjs', import.meta.url)))
    .digest('hex'),
  seats: [2, 3, 5, 6, 7, 8, 9],
  lines: PRESSURE_LINES,
  hands: Object.keys(PRESSURE_HANDS),
  difficulties: ['normal', 'hard'],
  equitySeeds: [428113, 756137],
  policyDraws: 16,
  profiles: policy.BOT_PROFILES.map((p) => p.id),
  interpretation:
    'Scripted public states, independent equity draws, paired conditional policy replays. One draw per style completes via scripted check/call continuation. Counts are not independent natural deals.',
};
assert(!args.overwrite, 'Use a new output directory to preserve prior evidence');
const rowsPath = join(out, 'cases.jsonl');
try {
  readFileSync(rowsPath);
  throw Error('Output already exists');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
let assessments = 0,
  decisions = 0,
  completed = 0;
const summary = {};
for (const seats of manifest.seats)
  for (const kind of manifest.lines)
    for (const hand of manifest.hands)
      for (const difficulty of manifest.difficulties) {
        const game = preflopPressureCase(engine, { seats, kind, hand, difficulty });
        if (!game) continue;
        for (const seed of manifest.equitySeeds) {
          const assessment = engine.botDecision(game, seeded(seed));
          const view = assessment.trace.view;
          const result = { seats, kind, hand, difficulty, seed, view, profiles: {} };
          for (const p of policy.BOT_PROFILES) {
            const actions = {},
              reasons = {};
            let shoves = 0;
            for (let k = 0; k < manifest.policyDraws; k++) {
              const d = policy.chooseBotAction(
                view,
                p,
                policy.freshBotMood(),
                'off',
                seeded(seed + k * 7919 + 13000019),
              );
              actions[d.action] = (actions[d.action] || 0) + 1;
              reasons[d.trace.reason] = (reasons[d.trace.reason] || 0) + 1;
              if (d.action === 'raise') {
                assert(
                  view.legal.canRaise &&
                    d.amount >= view.legal.minRaiseTo &&
                    d.amount <= view.legal.maxRaiseTo &&
                    d.amount % view.chipUnit === 0,
                );
                shoves += Number(d.amount === view.legal.maxRaiseTo);
              }
              if (!k) {
                finishPressureCase(engine, game, d);
                completed++;
              }
              decisions++;
            }
            result.profiles[p.id] = { actions, reasons, shoves };
            const key = `${kind}/${hand}`;
            const s = (summary[key] ||= { decisions: 0, fold: 0, call: 0, raise: 0, shoves: 0 });
            s.decisions += manifest.policyDraws;
            for (const [action, n] of Object.entries(actions)) s[action] = (s[action] || 0) + n;
            s.shoves += shoves;
          }
          appendFileSync(rowsPath, JSON.stringify(result) + '\n');
          if (++assessments % 200 === 0) console.log(`completed ${assessments} public assessments`);
        }
      }
writeFileSync(
  join(out, 'summary.json'),
  JSON.stringify(
    {
      assessments,
      conditionalDecisions: decisions,
      scriptedCompleteExecutions: completed,
      conservation: true,
      summary,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    assessments,
    conditionalDecisions: decisions,
    scriptedCompleteExecutions: completed,
    conservation: true,
  }),
);
