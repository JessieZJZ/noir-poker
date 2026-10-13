import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { BOT_PROFILES, chooseBotAction, freshBotMood } from '../../src/engine/bot-profiles.js';
import { explainOpponent } from '../../src/review/opponents.js';
const deck = deckOfCards();
const cards = (keys) =>
  keys
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const input = (hole = 'Ks Qh') => ({
  id: 1,
  hole: cards(hole),
  board: [],
  street: 0,
  position: 'UTG+1',
  count: 9,
  stack: 4875,
  bet: 125,
  pot: 450,
  currentBet: 200,
  contestable: 525,
  rivals: 8,
  equity: 0.05,
  difficulty: 'normal',
  playsBoard: false,
  history: [
    { id: 1, street: 0, action: 'raise', amount: 125 },
    { id: 0, street: 0, action: 'raise', amount: 200 },
  ],
  opponents: [0, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
    id,
    stack: 4800,
    bet: id === 0 ? 200 : 0,
    allin: false,
  })),
  features: { draw: false, wet: false, overpair: false },
  legal: {
    enabled: true,
    canCheck: false,
    canRaise: true,
    toCall: 75,
    callAmount: 75,
    minRaiseTo: 275,
    maxRaiseTo: 5000,
  },
});
const decide = (v, profile = BOT_PROFILES[0], kind = 'steady') =>
  chooseBotAction(v, profile, { ...freshBotMood(), kind }, 'subtle', () => 0.9);

test('normal/hard KQ defends a tiny 3-bet across every style and subtle moods', () => {
  for (const difficulty of ['normal', 'hard'])
    for (const profile of BOT_PROFILES)
      for (const kind of ['steady', 'cautious', 'reactive', 'frustrated', 'confident']) {
        const v = { ...input(), difficulty };
        const d = decide(v, profile, kind);
        assert.equal(d.action, 'call', `${difficulty}/${profile.id}/${kind}`);
        assert.equal(d.trace.reason, 'small-reraise-continue');
        assert.equal(d.trace.affordableThreeBet, true);
        assert.ok(!d.trace.checks.some((c) => c.code === 'insufficient-equity'));
      }
  const v = input(),
    d = decide(v);
  const explanation = explainOpponent({ action: d.action, trace: { ...d.trace, view: v } });
  assert.match(explanation.detail, /小尺度 3-bet 防守/);
  assert.match(explanation.detail, /不证明跟注盈利/);
  assert.equal(explanation.warning, '');
  assert.equal(explanation.metrics.length, 2);
  assert.match(explanation.metrics[1], /小尺度再加注/);
  assert.doesNotMatch(explanation.metrics.join(' '), /随机范围估计|低成本跟入范围/);
});

test('priced 3-bet defense stops at large sizes, short stacks, all-ins and 4-bets', () => {
  const v = input();
  for (const overrides of [
    { difficulty: 'easy' },
    { currentBet: 525 },
    { stack: 500 },
    { contestable: 200 },
    { opponents: v.opponents.map((p) => (p.id === 0 ? { ...p, stack: 999 } : p)) },
    { opponents: v.opponents.map((p) => (p.id === 0 ? { ...p, allin: true } : p)) },
    { legal: { ...v.legal, toCall: 375, callAmount: 375 } },
    { history: [...v.history, { id: 2, street: 0, action: 'raise', amount: 300 }] },
    { opponents: [] },
  ])
    assert.equal(
      decide({ ...v, ...overrides }).trace.affordableThreeBet,
      false,
      JSON.stringify(overrides),
    );
  assert.equal(decide(input('7s 2h')).action, 'fold');
  const large = {
    ...v,
    currentBet: 1500,
    legal: { ...v.legal, toCall: 1375, callAmount: 1375 },
    contestable: 3000,
  };
  assert.equal(decide(large).action, 'fold');
});
