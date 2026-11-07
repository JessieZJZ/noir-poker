import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { pushWidth, PUSH_FOLD_BB, eliminationPremium } from '../../src/engine/push-fold.js';
import { publicComboWeight } from '../../src/engine/public-ranges.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { analyzeDecision } from '../../src/review/analysis.js';

const card = (rank, suit) => ({ rank, suit, symbol: '♠♥♣♦'[suit], key: `${suit}-${rank}` });
const hole = (text) => {
  const ranks = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const r = (c) => ranks[c] || Number(c);
  const suited = text.endsWith('s');
  return [card(r(text[0]), 0), card(r(text[1]), suited ? 0 : 1)];
};
let seed = 11;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// A table where everyone holds `depth` big blinds, dealt with `cards` for
// the first seat to act.
function shortTable(depth, cards, seats = 6, heroFirst = false) {
  const g = engine.newGame(seats);
  // The button moves one seat as the hand starts; put the hero under the gun.
  if (heroFirst) g.dealer = seats - 4;
  g.difficulty = 'hard';
  g.emotionMode = 'off';
  for (const p of g.players) p.stack = depth * g.bigBlind;
  engine.startHand(g);
  const used = new Set(cards.map((c) => c.key));
  const actor = g.players[g.actor];
  for (const p of g.players) if (p !== actor) p.hole = p.hole.filter((c) => !used.has(c.key));
  const spare = engine
    .deckOfCards()
    .filter((c) => !used.has(c.key) && !g.players.some((p) => p.hole.some((h) => h.key === c.key)));
  for (const p of g.players) while (p.hole.length < 2) p.hole.push(spare.pop());
  actor.hole = cards;
  g.deck = spare;
  return g;
}

test('push widths widen with fewer seats behind and shorter stacks', () => {
  assert.ok(pushWidth(10, 1) > pushWidth(10, 2));
  assert.ok(pushWidth(10, 2) > pushWidth(10, 5));
  assert.ok(pushWidth(5, 3) > pushWidth(10, 3));
  assert.ok(pushWidth(10, 8) >= 0.1 && pushWidth(10, 8) <= 0.2);
});

test('at 12 BB or less a first-in opponent only moves all-in or folds', () => {
  for (const depth of [4, 8, PUSH_FOLD_BB])
    for (let i = 0; i < 60; i++) {
      const g = shortTable(
        depth,
        engine
          .deckOfCards()
          .sort(() => random() - 0.5)
          .slice(0, 2),
      );
      const d = engine.botDecision(g, random, { trials: 8 });
      const legal = engine.legalActions(g);
      assert.ok(
        d.action === 'fold' || (d.action === 'raise' && d.amount === legal.maxRaiseTo),
        `${depth} BB ${d.action} ${d.amount}`,
      );
      assert.ok(['short-push', 'short-fold'].includes(d.trace.reason), d.trace.reason);
    }
  const aces = engine.botDecision(shortTable(8, hole('AA')), random, { trials: 8 });
  assert.equal(aces.trace.reason, 'short-push');
  const trash = engine.botDecision(shortTable(8, hole('72')), random, { trials: 8 });
  assert.equal(trash.trace.reason, 'short-fold');
  // Deeper stacks keep the normal opening policy.
  const deep = engine.botDecision(shortTable(40, hole('AA')), random, { trials: 8 });
  assert.notEqual(deep.trace.reason, 'short-push');
});

test('a short first-in shove is read as a wide push range, not only premiums', () => {
  const descriptor = {
    allIn: true,
    street: 0,
    role: 'shover',
    line: 'cold-shove',
    committedCount: 1,
    depthBB: 8,
    position: 'BTN',
    seatedCount: 6,
  };
  assert.equal(publicComboWeight(hole('K7'), descriptor), 1);
  assert.ok(publicComboWeight(hole('72'), descriptor) < 0.2);
  const early = { ...descriptor, position: 'UTG' };
  assert.ok(publicComboWeight(hole('K7'), early) < publicComboWeight(hole('K7'), descriptor));
});

test('near the final table an all-in call that can bust needs a survival margin', () => {
  const stacks = (rows) => rows.map(([id, chips]) => ({ id, chips }));
  const view = (stage, rows) => ({
    id: 1,
    stack: 4000,
    total: 0,
    tournament: { stage, stacks: stacks(rows) },
  });
  assert.equal(eliminationPremium(view('early', [[1, 4000]]), true), 0);
  const bubble = eliminationPremium(
    view('bubble', [
      [1, 4000],
      [2, 9000],
      [3, 2000],
      [4, 9000],
    ]),
    true,
  );
  const final = eliminationPremium(
    view('final', [
      [1, 4000],
      [2, 9000],
      [3, 9000],
    ]),
    true,
  );
  assert.ok(bubble > final && final > 0);
  // Covering the shover risks chips, not the game.
  assert.ok(
    eliminationPremium(
      view('final', [
        [1, 4000],
        [2, 9000],
      ]),
      false,
    ) < final,
  );
});

test('the opponent review explains short pushes and folds without placement jargon', () => {
  const push = shortTable(8, hole('A5'));
  const d = engine.botDecision(push, random, { trials: 8 });
  assert.equal(d.trace.reason, 'short-push');
  const text = explainOpponent({
    id: push.actor,
    name: push.players[push.actor].name,
    action: d.action,
    amount: d.amount,
    trace: d.trace,
  }).paragraphs.join('');
  assert.match(text, /有效筹码只剩约 8 个大盲.*全下和弃牌/);
  assert.doesNotMatch(text, /ICM|名次价值/);
});

test('the hero review recommends push or fold over a short min-raise or limp', () => {
  const g = shortTable(9, hole('A9'), 6, true);
  assert.equal(g.actor, 0);
  const legal = engine.legalActions(g);
  engine.act(g, 0, 'raise', legal.minRaiseTo);
  const s = g.decisions.at(-1);
  const result = analyzeDecision(s, { trials: 40, rollouts: false });
  assert.equal(result.code, 'short-stack-push-fold');
  assert.equal(result.alternative.action, 'raise');
  assert.equal(result.alternative.amount, legal.maxRaiseTo);
  assert.match(result.reason, /全下和弃牌之间选择/);
  assert.doesNotMatch(result.reason, /ICM|名次价值/);
});
