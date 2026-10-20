import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_PROFILES,
  chooseBotAction,
  freshBotMood,
  sanitizeBotSettings,
} from '../../src/engine/bot-profiles.js';
import { PROFILE_PORTRAITS } from '../../src/ui/portraits.js';
import { playerResearchMarkup } from '../../src/ui/player-research.js';
import { botStyleContext, resolveBotStyle } from '../../src/engine/bot-style.js';
import {
  newGame,
  startHand,
  applyBotSettings,
  botDecision,
  act,
  advanceStreet,
  potSize,
  legalActions,
} from '../../src/engine/poker.js';
const get = (id) => BOT_PROFILES.find((p) => p.id === id);
const cards = (...ranks) => ranks.map((rank, suit) => ({ rank, suit }));
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function view(overrides = {}) {
  return {
    bigBlind: 50,
    chipUnit: 25,
    id: 1,
    hole: cards(11, 9),
    board: cards(14, 7, 2),
    street: 1,
    position: 'BTN',
    inPosition: true,
    count: 6,
    stack: 5000,
    bet: 0,
    pot: 1000,
    currentBet: 0,
    contestable: 1000,
    rivals: 1,
    equity: 0.3,
    difficulty: 'hard',
    history: [{ id: 1, street: 0, action: 'raise', amount: 150 }],
    opponents: [{ id: 0, stack: 5000, allin: false }],
    features: { wet: false, draw: false, overpair: false },
    playsBoard: false,
    legal: {
      chipUnit: 25,
      enabled: true,
      toCall: 0,
      callAmount: 0,
      canCheck: true,
      canRaise: true,
      minRaiseTo: 50,
      maxRaiseTo: 5000,
    },
    ...overrides,
  };
}
const decide = (id, v, random = () => 0.3) =>
  chooseBotAction(v, get(id), freshBotMood(), 'off', random);
test('all original characters have distinct names, complete strategy descriptions and local illustrations', () => {
  const named = BOT_PROFILES.filter((p) => p.id !== 'balanced');
  assert.equal(named.length, 3);
  assert.equal(new Set(named.map((p) => p.short)).size, 3);
  for (const p of BOT_PROFILES) {
    assert.equal(p.sources.length, 0);
    assert.equal(p.research, undefined);
    assert.equal(p.character.sections.length, 5);
    assert.deepEqual(
      p.character.sections.map((s) => s.title),
      ['入池选择', '翻牌与转牌', '河牌取舍', '特色操作', '应对思路'],
    );
    assert.ok(
      p.character.sections.every(
        (s) => s.paragraphs.length && s.paragraphs.every((t) => t.length > 20),
      ),
    );
    if (p.id !== 'balanced') assert.ok(PROFILE_PORTRAITS[p.id].src.startsWith('/portraits/'));
    assert.equal(sanitizeBotSettings({ assignments: { 1: p.id } }).assignments[1], p.id);
  }
});
test('character rendering escapes content and contains no biographies, credits or source links', () => {
  const p = structuredClone(get('owen'));
  p.character.sections[0].paragraphs[0] = '<script>untrusted</script>';
  const html = playerResearchMarkup(p);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotMatch(html, /<script>|<a |公开资料|履历摘录|公开打法样本|资料核对日期|头像：/);
  assert.match(playerResearchMarkup(get('balanced')), /入池选择/);
});
test('small-cbet, draw-pressure and pot-control styles retain distinct executed choices', () => {
  const flop = decide('rook', view());
  assert.equal(flop.action, 'raise');
  assert.equal(flop.trace.reason, 'small-cbet');
  assert.equal(flop.amount, 325);
  const turn = decide(
    'rook',
    view({ street: 2, equity: 0.4, features: { wet: true, draw: true } }),
    () => 0.1,
  );
  assert.equal(turn.action, 'raise');
  assert.equal(turn.trace.sizing.fraction, 0.8);
  const sample = (id) =>
    Array.from({ length: 500 }, (_, i) =>
      decide(id, view({ equity: 0.57 }), seeded(i + 99)),
    ).filter((d) => d.trace.reason === 'pot-control').length;
  assert.ok(sample('balanced') > sample('rook') + 50);
});
test('Float needs position, a dry heads-up board, affordable price and no all-in pressure', () => {
  const base = view({ equity: 0.16, currentBet: 250, contestable: 1250 });
  base.legal = { ...base.legal, toCall: 250, callAmount: 250, canCheck: false, canRaise: false };
  assert.equal(decide('balanced', base, () => 0.1).trace.reason, 'float-continue');
  for (const change of [
    { inPosition: false },
    { rivals: 2 },
    { features: { wet: true, draw: false } },
    { features: { wet: false, draw: true } },
    { equity: 0.05 },
    { equity: 0.65 },
    { opponents: [{ id: 0, stack: 0, allin: true }] },
    { legal: { ...base.legal, toCall: 275, callAmount: 275 } },
  ])
    assert.equal(
      decide('balanced', { ...base, ...change }, () => 0.9).trace.style.floatContinue,
      false,
    );
  const delayed = view({
    // A visible earlier call is the delayed-aggression proxy, not hidden hand strength.
    street: 2,
    history: [
      { id: 1, street: 1, action: 'call', amount: 100 },
      { id: 0, street: 2, action: 'check' },
    ],
  });
  assert.equal(decide('balanced', { ...base, inPosition: false }, () => 0.9).action, 'fold');
  assert.equal(decide('balanced', delayed).trace.style.context.delayed, true);
  assert.equal(
    decide('balanced', { ...delayed, inPosition: false }).trace.style.context.delayed,
    false,
  );
});
test('river air requires a relevant blocker and does not turn board-only strength into a bluff', () => {
  const base = view({ street: 3, board: cards(12, 8, 7, 4, 2), equity: 0.05 });
  assert.equal(decide('rook', base, () => 0).action, 'check');
  assert.equal(decide('rook', { ...base, hole: cards(14, 6) }, () => 0).trace.reason, 'pure-bluff');
  assert.equal(
    decide('rook', { ...base, hole: cards(14, 6), playsBoard: true }, () => 0).action,
    'check',
  );
  const flush = { ...base, board: [12, 8, 7, 4, 2].map((rank) => ({ rank, suit: 0 })) };
  const style = resolveBotStyle(get('owen'));
  assert.equal(
    botStyleContext(
      {
        ...flush,
        hole: [
          { rank: 14, suit: 1 },
          { rank: 6, suit: 2 },
        ],
      },
      style,
    ).riverBlocker,
    false,
  );
  assert.equal(
    botStyleContext(
      {
        ...flush,
        hole: [
          { rank: 14, suit: 0 },
          { rank: 6, suit: 2 },
        ],
      },
      style,
    ).riverBlocker,
    true,
  );
});
test('public action adjustment needs three observations, stays bounded and excludes our own or folded opponents', () => {
  const style = resolveBotStyle(get('owen'));
  const actions = Array.from({ length: 3 }, (_, i) => ({ id: 0, street: i + 1, action: 'raise' }));
  assert.equal(botStyleContext(view({ history: actions.slice(0, 2) }), style).publicAdjustment, 0);
  assert.ok(botStyleContext(view({ history: actions }), style).publicAdjustment <= 0.025);
  assert.equal(
    botStyleContext(view({ history: actions.map((a) => ({ ...a, id: 1 })) }), style).publicSamples,
    0,
  );
  assert.equal(
    botStyleContext(view({ history: actions, opponents: [] }), style).publicAdjustment,
    0,
  );
});
test('every persona and emotion mode completes unequal-stack 5/9-max games legally with whole chips and conservation', () => {
  for (const profile of BOT_PROFILES)
    for (const count of [5, 9])
      for (const emotionMode of ['off', 'subtle', 'lively']) {
        const g = newGame(count, {
          smallBlind: 25,
          bigBlind: 50,
          startingStack: 5000,
          chipUnit: 25,
        });
        applyBotSettings(g, {
          emotionMode,
          assignments: Object.fromEntries(
            Array.from({ length: count - 1 }, (_, i) => [i + 1, profile.id]),
          ),
        });
        g.players.forEach((p, i) => {
          p.stack = 300 + i * 175;
        });
        startHand(g);
        const wealth = g.players.reduce((n, p) => n + p.stack, 0) + potSize(g);
        const random = seeded(count + profile.axes[0]);
        let turns = 0;
        while (g.phase !== 'done') {
          assert.ok(++turns < 600);
          if (g.phase === 'between') advanceStreet(g);
          else {
            const d = botDecision(g, random, { trials: 8 });
            const legal = legalActions(g);
            if (d.action === 'raise') {
              assert.ok(legal.canRaise);
              assert.ok(d.amount >= legal.minRaiseTo && d.amount <= legal.maxRaiseTo);
            }
            act(g, g.actor, d.action, d.amount);
          }
          for (const n of [...g.players.flatMap((p) => [p.stack, p.bet, p.total]), ...g.payouts])
            assert.equal(n % 25, 0);
          assert.equal(
            g.players.reduce((n, p) => n + p.stack, 0) + (g.phase === 'done' ? 0 : potSize(g)),
            wealth,
          );
        }
      }
});
