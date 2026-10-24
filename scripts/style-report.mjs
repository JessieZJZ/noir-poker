// Compare measure-bots outputs with the style targets and with each other:
// node scripts/style-report.mjs out/balanced.json out/rook.json ...
import { readFileSync } from 'node:fs';
import { STYLE_TARGETS, STYLE_DISTANCE } from './style-targets.mjs';

const pct = (v) => (v == null ? null : v * 100);
const positionVpip = (profile, positions) => {
  const rows = positions.map((p) => profile.byPosition?.[p]).filter(Boolean);
  const hands = rows.reduce((n, r) => n + r.hands, 0);
  return hands ? (100 * rows.reduce((n, r) => n + r.vpip, 0)) / hands : null;
};
function statsOf(run) {
  const m = run.metrics,
    p = run.styleProfile;
  return {
    vpip: pct(m.vpip),
    pfr: pct(m.pfr),
    threeBet: pct(m.threeBet),
    foldToThreeBet: pct(m.foldToThreeBet),
    af: m.afInfinite ? Infinity : m.af,
    cbet: p.cbetPercent,
    foldToCbet: p.foldToCbetPercent,
    wtsd: p.wtsdPercent,
    betSize: p.averageBetFraction,
    earlyVpip: positionVpip(p.counts, ['UTG', 'UTG+1', 'MP', 'LJ']),
    buttonVpip: positionVpip(p.counts, ['BTN']),
    lateGap:
      positionVpip(p.counts, ['CO', 'BTN']) - positionVpip(p.counts, ['UTG', 'UTG+1', 'MP', 'LJ']),
    smallBets: p.smallBetPercent,
    drawRaise: p.drawRaisePercent,
    largeBets: p.largeBetPercent,
    flopPlayers: run.averageFlopPlayers,
    checkedThrough: p.checkedThroughFlopPercent,
    limpedFlops: p.limpedFlopPercent,
    limpedCheckedThrough: p.limpedCheckedThroughPercent,
    heroFaced: p.heroFacedBotPer100,
    twoWay: p.twoWayPer100,
  };
}
const runs = process.argv.slice(2).map((file) => JSON.parse(readFileSync(file, 'utf8')));
const rows = runs.map((run) => ({ id: run.profile, label: run.label, stats: statsOf(run) }));
const fmt = (v, key) =>
  v == null
    ? '-'
    : v === Infinity
      ? '∞'
      : ['af', 'betSize', 'flopPlayers'].includes(key)
        ? v.toFixed(2)
        : v.toFixed(1);
let misses = 0;
console.log('Targets (✓ inside, ✗ outside):');
for (const { id, stats } of rows) {
  const target = STYLE_TARGETS[id] || {};
  const cells = Object.entries(target).map(([key, [min, max]]) => {
    const v = stats[key],
      ok = v != null && v >= min && v <= max;
    if (!ok) misses++;
    return `${key} ${fmt(v, key)}${ok ? '✓' : '✗'}`;
  });
  console.log(`${id.padEnd(9)} ${cells.join('  ')}`);
}
console.log('\nTable feel:');
for (const { id, stats } of rows)
  console.log(
    `${id.padEnd(9)} flop players ${fmt(stats.flopPlayers, 'flopPlayers')}  checked-through flops ${fmt(stats.checkedThrough)}%  limped flops ${fmt(stats.limpedFlops)}% (checked through ${fmt(stats.limpedCheckedThrough)}%)  Hero faced bot bet ${fmt(stats.heroFaced)}/100  two-way ${fmt(stats.twoWay)}/100`,
  );
console.log('\nPairs with fewer than two clearly different stats:');
let close = 0;
for (let i = 0; i < rows.length; i++)
  for (let j = i + 1; j < rows.length; j++) {
    const diff = Object.entries(STYLE_DISTANCE).filter(([key, gap]) => {
      const a = rows[i].stats[key],
        b = rows[j].stats[key];
      return a != null && b != null && Math.abs(a - b) >= gap;
    });
    if (diff.length < 2) {
      close++;
      console.log(`  ${rows[i].id} / ${rows[j].id}: ${diff.map(([k]) => k).join(', ') || 'none'}`);
    }
  }
console.log(`\n${misses} target misses; ${close} pairs too close.`);
