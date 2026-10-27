import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const directory = resolve(args.probes || '.artifacts/style-audit-2026-10-20/final-probes');
const data = JSON.parse(readFileSync(join(directory, 'probes.json'))),
  profiles = Object.keys(data.results);
const seeded = (n) => () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
const fields = ['raise', 'call', 'check', 'small', 'large', 'continue'];
const rate = (s, field) => (field === 'continue' ? 1 - s.fold / s.n : s[field] / s.n);
function playerCounts(a, b, field) {
  const groups = new Map();
  for (let i = 0; i < a.snapshots.length; i++) {
    const x = a.snapshots[i],
      y = b.snapshots[i];
    if (x.unit !== y?.unit) throw Error('Unpaired snapshots');
    const count = x.unit.match(/^[^-]+-([5-9])-(?:normal|hard)-\d+-\d+$/)?.[1];
    if (!count) throw Error(`Snapshot has no table-size identity: ${x.unit}`);
    const g = groups.get(count) || { first: 0, second: 0, decisions: 0, snapshots: 0 };
    if (x.n !== y.n) throw Error('Unequal paired decision counts');
    g.first += rate(x, field) * x.n;
    g.second += rate(y, field) * y.n;
    g.decisions += x.n;
    g.snapshots++;
    groups.set(count, g);
  }
  return Object.fromEntries(
    [5, 6, 7, 8, 9].map((count) => {
      const g = groups.get(String(count));
      return [
        count,
        g
          ? {
              firstRate: g.first / g.decisions,
              secondRate: g.second / g.decisions,
              differencePP: ((g.first - g.second) / g.decisions) * 100,
              snapshots: g.snapshots,
              conditionalDecisionsPerStyle: g.decisions,
            }
          : null,
      ];
    }),
  );
}
function paired(a, b, field) {
  if (a.snapshots.length !== b.snapshots.length) throw Error('Unequal paired snapshots');
  const groups = new Map();
  for (let i = 0; i < a.snapshots.length; i++) {
    const x = a.snapshots[i],
      y = b.snapshots[i];
    if (x.unit !== y.unit) throw Error('Unpaired snapshots');
    // Initial shuffles are deliberately shared across styles, counts and
    // difficulties. Keep every trajectory from that shuffle in one cluster.
    const key = x.unit.replace(/^[^-]+-[5-9]-(?:normal|hard)-(\d+)-(\d+)$/, '$1-$2');
    const g = groups.get(key) || { sum: 0, n: 0 };
    g.sum += rate(x, field) - rate(y, field);
    g.n++;
    groups.set(key, g);
  }
  const values = [...groups.values()],
    point = rate(a, field) - rate(b, field);
  const rng = seeded(77213),
    samples = [];
  for (let r = 0; r < 600; r++) {
    let sum = 0,
      n = 0;
    for (let k = 0; k < values.length; k++) {
      const v = values[Math.floor(rng() * values.length)];
      sum += v.sum;
      n += v.n;
    }
    samples.push(sum / Math.max(1, n));
  }
  samples.sort((x, y) => x - y);
  return {
    differencePP: point * 100,
    ci95PP: [samples[15] * 100, samples[584] * 100],
    snapshots: a.distinctSnapshots,
    handClusters: groups.size,
    conditionalDecisions: a.n,
  };
}
if (args.signatures) {
  const spec = JSON.parse(readFileSync(resolve(args.signatures)));
  if (spec.sourceDigest !== data.sourceDigest) throw Error('Signature source digest mismatch');
  const signatures = spec.styles.map((s) => {
    const a = data.results[s.profile]?.[s.metric],
      b = data.results.balanced?.[s.metric];
    if (!a?.n || !b?.n)
      return { ...s, passed: false, reason: 'missing representative opportunities' };
    const effect = paired(a, b, s.field);
    const strata = Object.fromEntries(
      ['normal', 'hard'].map((difficulty) => {
        const x = a.byDifficulty[difficulty],
          y = b.byDifficulty[difficulty];
        return [
          difficulty,
          x?.n && y?.n
            ? { n: x.n, differencePP: (rate(x, s.field) - rate(y, s.field)) * 100 }
            : null,
        ];
      }),
    );
    return {
      ...s,
      firstRate: rate(a, s.field),
      balancedRate: rate(b, s.field),
      ...effect,
      strata,
      byPlayers: playerCounts(a, b, s.field),
      passed:
        effect.handClusters >= 30 &&
        effect.differencePP * s.direction >= 25 &&
        (effect.ci95PP[0] > 0 || effect.ci95PP[1] < 0) &&
        Object.values(strata).every((v) => v && v.differencePP * s.direction > 0),
    };
  });
  const result = {
    sourceDigest: data.sourceDigest,
    cohort: args.lock ? 'held-out' : 'development',
    specification: resolve(args.signatures),
    denominator:
      'All eligible conditional decisions, including checks and folds; not completed hands or bets only.',
    signatures,
    passedStyles: signatures.filter((s) => s.passed).length,
    totalStyles: signatures.length,
  };
  writeFileSync(join(directory, 'signature-validation.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      cohort: result.cohort,
      passedStyles: result.passedStyles,
      totalStyles: result.totalStyles,
    }),
  );
}
if (args.lock) {
  const locked = JSON.parse(readFileSync(resolve(args.lock)));
  if (locked.sourceDigest !== data.sourceDigest) throw Error('Locked source digest mismatch');
  const verified = locked.pairs.map((spec) => {
    const metric = spec.best?.metric,
      field = spec.best?.field;
    const a = data.results[spec.first]?.[metric],
      b = data.results[spec.second]?.[metric];
    if (!a || !b)
      return {
        first: spec.first,
        second: spec.second,
        metric,
        field,
        passed: false,
        reason: 'missing held-out opportunities',
      };
    const effect = paired(a, b, field);
    const strata = Object.fromEntries(
      ['normal', 'hard'].map((d) => {
        const x = a.byDifficulty[d],
          y = b.byDifficulty[d];
        return [
          d,
          x && y ? { n: x.n, differencePP: (rate(x, field) - rate(y, field)) * 100 } : null,
        ];
      }),
    );
    return {
      first: spec.first,
      second: spec.second,
      metric,
      field,
      developmentDifferencePP: spec.best.differencePP,
      firstRate: rate(a, field),
      secondRate: rate(b, field),
      ...effect,
      strata,
      byPlayers: playerCounts(a, b, field),
      passed:
        effect.handClusters >= 30 &&
        Math.abs(effect.differencePP) >= 20 &&
        effect.differencePP * spec.best.differencePP > 0 &&
        (effect.ci95PP[0] > 0 || effect.ci95PP[1] < 0) &&
        Object.values(strata).every(
          (v) => v && v.n > 0 && v.differencePP * spec.best.differencePP > 0,
        ),
    };
  });
  const result = {
    sourceDigest: data.sourceDigest,
    lock: resolve(args.lock),
    corpusDirectory: data.corpusDirectory,
    description:
      'One metric/field/direction fixed per pair on development corpus before held-out measurement; paired initial-shuffle-cluster bootstrap 600 resamples. No human perception claim.',
    allPairs: verified.length,
    passedPairs: verified.filter((p) => p.passed).length,
    pairs: verified,
  };
  writeFileSync(join(directory, 'locked-validation.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
const pairs = [];
for (let i = 0; i < profiles.length; i++)
  for (let j = i + 1; j < profiles.length; j++) {
    const first = profiles[i],
      second = profiles[j],
      metrics = [];
    for (const [metric, a] of Object.entries(data.results[first])) {
      const b = data.results[second][metric];
      for (const field of fields) {
        const difference = Math.abs(rate(a, field) - rate(b, field));
        if (difference >= 0.18)
          metrics.push({
            metric,
            field,
            firstRate: rate(a, field),
            secondRate: rate(b, field),
            ...paired(a, b, field),
            byPlayers: playerCounts(a, b, field),
          });
      }
    }
    metrics.sort((a, b) => Math.abs(b.differencePP) - Math.abs(a.differencePP));
    const supported = metrics.filter(
      (m) =>
        m.handClusters >= 30 &&
        Math.abs(m.differencePP) >= 20 &&
        (m.ci95PP[0] > 0 || m.ci95PP[1] < 0),
    );
    pairs.push({
      first,
      second,
      clearlyDifferent: supported.length > 0,
      best: supported[0] || metrics[0] || null,
      metrics,
    });
  }
const result = {
  sourceDigest: data.sourceDigest,
  repetitions: data.repetitions,
  note: 'Paired initial-shuffle-cluster bootstrap, 600 resamples; units are conditional decisions, not complete hands. Thresholds are product targets, not human perception proof.',
  allPairs: pairs.length,
  clearPairs: pairs.filter((p) => p.clearlyDifferent).length,
  pairs,
};
writeFileSync(join(directory, 'comparison.json'), JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      pairs: result.allPairs,
      clearPairs: result.clearPairs,
      unresolved: pairs
        .filter((p) => !p.clearlyDifferent)
        .map(({ first, second, best }) => ({ first, second, best })),
      versusBalanced: pairs
        .filter((p) => p.first === 'balanced')
        .map(({ second, best }) => ({ style: second, best })),
    },
    null,
    2,
  ),
);
