import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { analyzeDecision, createReviewInput } from '../src/review/analysis.js';
import { clearReviewCardCache } from '../src/review/card-cache.js';
import { INTERACTIVE_REVIEW_OPTIONS } from '../src/review/budget.js';
import { explainOpponent } from '../src/review/opponents.js';
import { heroValueGame, causalReraiseGame } from '../tests/fixtures/review-spots.js';
import {
  turnBluffReview,
  pocketNinesCheckedBoard,
  suitedBroadwayFiveBetFold,
} from '../tests/fixtures/review-summary.js';

// Optional archived analysis.js path makes a reproducible same-input A/B run.
// This is CPU work in Node, not a phone or browser responsiveness benchmark.
const baselinePath = process.argv[2],
  baseline = baselinePath
    ? await import(pathToFileURL(path.resolve(baselinePath)))
    : { analyzeDecision },
  clearBaseline = baselinePath
    ? (await import(pathToFileURL(path.resolve(path.dirname(baselinePath), 'card-cache.js'))))
        .clearReviewCardCache
    : clearReviewCardCache;
const games = [heroValueGame('set-shove'), heroValueGame('overpair'), causalReraiseGame()];
const cases = games.flatMap((g, i) =>
  g.decisions.map((snapshot, j) => ({ label: `engine-${i}-${j}`, snapshot })),
);
cases.push(
  ...[turnBluffReview(), pocketNinesCheckedBoard(), suitedBroadwayFiveBetFold()].map(
    (snapshot, i) => ({ label: `legacy-${i}`, snapshot }),
  ),
);
const rows = [];
for (const { label, snapshot } of cases) {
  clearBaseline();
  let start = performance.now();
  const before = baseline.analyzeDecision(snapshot),
    beforeMs = performance.now() - start;
  clearReviewCardCache();
  start = performance.now();
  const after = analyzeDecision(snapshot, INTERACTIVE_REVIEW_OPTIONS),
    afterMs = performance.now() - start;
  const row = {
    label,
    beforeMs,
    afterMs,
    primaryMetricsEqual: isDeepStrictEqual(before.metrics, after.metrics),
    matchupsEqual: isDeepStrictEqual(before.context.matchups, after.context.matchups),
    beforeAction: before.coaching.recommendedAction,
    afterAction: after.coaching.recommendedAction,
    trials: after.metrics.trials,
    rolloutTrials: after.simulation?.trials ?? 0,
    candidates: after.simulation?.rows.length ?? 0,
    comparisonReady: after.simulation?.comparisonReady ?? false,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const opponents = [];
for (const [i, g] of games.entries()) {
  const input = createReviewInput(g);
  for (const record of input.opponents) {
    clearReviewCardCache();
    const start = performance.now();
    explainOpponent(record, input.players);
    opponents.push({ game: i, sequence: record.sequence, ms: performance.now() - start });
  }
}
console.log(
  JSON.stringify({
    totalBeforeMs: rows.reduce((s, r) => s + r.beforeMs, 0),
    totalAfterMs: rows.reduce((s, r) => s + r.afterMs, 0),
    opponents,
  }),
);
if (rows.some((r) => !r.primaryMetricsEqual || !r.matchupsEqual)) process.exitCode = 1;
