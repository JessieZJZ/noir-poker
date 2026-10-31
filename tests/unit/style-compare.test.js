import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function measure({ hard = 'same', lockedSource = 'candidate' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'noir-style-comparison-'));
  try {
    const cell = (raise) => ({
      n: 16,
      raise,
      fold: 16 - raise,
      call: 0,
      check: 0,
      small: 0,
      large: 0,
    });
    const metric = (isRook) => {
      const normal = cell(isRook ? 16 : 0);
      const advanced = cell(hard === 'reverse' ? (isRook ? 0 : 16) : isRook ? 16 : 0);
      // All 30 original shuffles are paired across both styles. Resampling
      // decisions within a shuffle must not manufacture independent hands.
      const snapshots = Array.from({ length: 30 }, (_, index) => ({
        ...normal,
        unit: `balanced-5-normal-${index + 1}-1`,
      }));
      if (hard !== 'missing')
        snapshots.push(
          ...Array.from({ length: 30 }, (_, index) => ({
            ...advanced,
            unit: `balanced-5-hard-${index + 1}-1`,
          })),
        );
      const totals = Object.fromEntries(Object.keys(normal).map((key) => [key, 0]));
      for (const snapshot of snapshots)
        for (const key of Object.keys(totals)) totals[key] += snapshot[key];
      return {
        ...totals,
        distinctSnapshots: snapshots.length,
        snapshots,
        byDifficulty: {
          normal: { ...normal, n: 480, raise: normal.raise * 30, fold: normal.fold * 30 },
          ...(hard === 'missing'
            ? {}
            : {
                hard: { ...advanced, n: 480, raise: advanced.raise * 30, fold: advanced.fold * 30 },
              }),
        },
      };
    };
    writeFileSync(
      join(directory, 'probes.json'),
      JSON.stringify({
        sourceDigest: 'candidate',
        results: { balanced: { entry: metric(false) }, rook: { entry: metric(true) } },
      }),
    );
    const lock = join(directory, 'lock.json');
    writeFileSync(
      lock,
      JSON.stringify({
        sourceDigest: lockedSource,
        pairs: [
          {
            first: 'rook',
            second: 'balanced',
            best: { metric: 'entry', field: 'raise', differencePP: 100 },
          },
        ],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/style-compare.mjs'), `--probes=${directory}`, `--lock=${lock}`],
      { encoding: 'utf8' },
    );
    return {
      status: result.status,
      stderr: result.stderr,
      validation:
        result.status === 0
          ? JSON.parse(readFileSync(join(directory, 'locked-validation.json')))
          : null,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('held-out comparison rejects missing or reversed difficulty strata despite 30 paired shuffles', () => {
  assert.equal(measure({ hard: 'missing' }).validation.passedPairs, 0);
  assert.equal(measure({ hard: 'reverse' }).validation.passedPairs, 0);
  const accepted = measure().validation;
  assert.equal(accepted.passedPairs, 1);
  assert.equal(accepted.pairs[0].handClusters, 30);
});

test('held-out comparison cannot apply a lock from another strategy source', () => {
  const result = measure({ lockedSource: 'earlier-candidate' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Locked source digest mismatch/);
});
