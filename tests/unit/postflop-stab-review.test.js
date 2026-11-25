import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { publicPostflopLine, publicStoryWeight } from '../../src/engine/public-story.js';
import { handFeatures } from '../../src/engine/hand-features.js';
import { gameIdentities } from '../../src/engine/player-identity.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { allInRandom } from '../fixtures/all-in-decisions.js';
import { facingPotBet } from '../fixtures/reported-overpair.js';

const deck = engine.deckOfCards();
const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const handData = (hole, board) => {
  const score = engine.evaluate([...hole, ...board]).score;
  return { score, features: handFeatures(hole, board, score) };
};
const flop = cards('3d 7s 4d');
const line = (action, extra = {}) => [
  { street: 1, action, ratio: 1, board: flop, checkedTo: false, ...extra },
];

test('a flop stab after checks keeps overcards and weak pairs in the betting range', () => {
  const air = cards('Ac Kh'),
    weakPair = cards('2c 2h'),
    set = cards('7c 7d');
  const stab = line('bet', { checkedTo: true }),
    lead = line('bet'),
    river = [{ ...stab[0], street: 3, board: [...flop, ...cards('Jc 2s')] }];
  assert.equal(publicStoryWeight(air, stab, handData), 0.1);
  assert.equal(publicStoryWeight(air, lead, handData), 0.025);
  assert.equal(publicStoryWeight(weakPair, stab, handData), 0.2);
  assert.equal(publicStoryWeight(weakPair, lead, handData), 0.12);
  assert.equal(publicStoryWeight(set, stab, handData), 0.95, 'Value is unchanged');
  assert.equal(publicStoryWeight(air, line('raise', { checkedTo: true }), handData), 0.015);
  assert.equal(publicStoryWeight(air, river, handData), 0.025, 'River bets keep the old weight');
  const small = line('bet', { checkedTo: true, ratio: 0.5 });
  assert.equal(publicStoryWeight(air, small, handData), 0.25);
});

test('the reported line marks the caller’s pot-size bet after the 3-bettor’s check as a stab', () => {
  const g = facingPotBet('hard');
  const view = engine.botDecision(g, allInRandom(1)).trace.view;
  const [bet] = publicPostflopLine(view, 0);
  assert.equal(bet.action, 'bet');
  assert.equal(bet.checkedTo, true);
  assert.ok(Math.abs(bet.ratio - 1) < 1e-9);
});

const TIGHT = {
  hands: 40,
  voluntaryHands: 10,
  raisingHands: 8,
  largeRaiseHands: 0,
  largeCallHands: 0,
  postActions: 20,
  postRaises: 3,
  facedPostBet: 8,
  calledPostBet: 3,
  foldedPostBet: 5,
};
function reviewedFold(seedFrom, options) {
  for (let seed = seedFrom; seed < seedFrom + 60; seed++) {
    const g = facingPotBet('hard', '9c 9d', options);
    engine.executeBotTurn(g, engine.planBotTurn(g, allInRandom(seed)));
    const record = g.botDecisions.at(-1);
    if (record.action === 'fold') return explainOpponent(record, gameIdentities(g));
  }
  return null;
}

test('a read-based overpair fold states the estimate, the price and the player’s public record', () => {
  const review = reviewedFold(1, { heroRead: TIGHT });
  assert.ok(review, 'A tight public read keeps this a close spot with some folds');
  assert.match(review.detail, /超对 9 ?的胜率约 \d+\.\d%，低于这笔跟注需要的 33\.3%/);
  assert.match(
    review.detail,
    /还参考了你最近 40 手的公开打法：主动入池约 25\.0%，翻后行动中主动下注或加注约 15\.0%。入池偏紧、翻后也很少主动下注/,
  );
  assert.doesNotMatch(review.detail, /当前下注范围仍可能同时包含/);
  assert.match(review.detail, /自己能赢的部分不足以支付这次跟注/);
});

test('without a tight read the overpair calls the pot-size stab', () => {
  for (const difficulty of ['normal', 'hard'])
    for (let seed = 1; seed <= 20; seed++) {
      const d = engine.botDecision(facingPotBet(difficulty), allInRandom(seed));
      assert.equal(d.action, 'call', `${difficulty} seed ${seed}`);
      assert.ok(d.trace.view.publicEquity.priceEquity > 0.4);
    }
});
