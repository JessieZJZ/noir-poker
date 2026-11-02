import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, compare } from '../../src/engine/poker.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const block = html.match(/<details class="preflop-equity">[\s\S]*?<\/details>/)[0];
const rows = [
  ...block.matchAll(/data-hand="(\w+)">\s*<b>\1<\/b><span>(\d+)%<\/span><span>(\d+)%<\/span>/g),
].map(([, hand, one, four]) => ({ hand, one: Number(one), four: Number(four) }));
const ranks = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
const rank = (c) => ranks[c] || Number(c);

// Seeded so the check is repeatable; ties share the pot as in the guide note.
function equity(code, opponents, trials) {
  let seed = 20261024;
  const random = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const hero = [
    { rank: rank(code[0]), suit: 0 },
    { rank: rank(code[1]), suit: code[2] === 's' ? 0 : 1 },
  ];
  const deck = [];
  for (let suit = 0; suit < 4; suit++)
    for (let r = 2; r <= 14; r++)
      if (!hero.some((c) => c.rank === r && c.suit === suit)) deck.push({ rank: r, suit });
  let share = 0;
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < 5 + opponents * 2; i++) {
      const j = i + Math.floor(random() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const board = deck.slice(0, 5);
    const mine = evaluate([...hero, ...board]).score;
    let ties = 1,
      lost = false;
    for (let o = 0; o < opponents && !lost; o++) {
      const result = compare(evaluate([deck[5 + o * 2], deck[6 + o * 2], ...board]).score, mine);
      if (result > 0) lost = true;
      else if (result === 0) ties++;
    }
    if (!lost) share += 1 / ties;
  }
  return (share / trials) * 100;
}

test('the guide preflop table is collapsed, ordered by tier and lists each hand once', () => {
  assert.doesNotMatch(block, /<details class="preflop-equity" open/);
  assert.equal(rows.length, 39);
  assert.equal(new Set(rows.map((row) => row.hand)).size, rows.length);
  for (const row of rows) {
    assert.match(row.hand, /^(?:([AKQJT2-9])\1|[AKQJT2-9]{2}[so])$/);
    assert.ok(row.four < row.one, `${row.hand} wins less often against four opponents`);
  }
  assert.deepEqual(
    rows.slice(0, 2).map((row) => row.hand),
    ['AA', 'KK'],
  );
  assert.equal(rows.at(-1).hand, '72o');
});

test('guide win rates agree with the engine hand comparison', () => {
  for (const hand of ['AA', 'AKs', '22', '72o']) {
    const row = rows.find((entry) => entry.hand === hand);
    assert.ok(Math.abs(equity(hand, 1, 4000) - row.one) <= 2.5, `${hand} against one opponent`);
    assert.ok(Math.abs(equity(hand, 4, 2500) - row.four) <= 3, `${hand} against four opponents`);
  }
});
