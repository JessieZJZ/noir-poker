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
test('all sixteen named profiles have dated, claim-linked evidence and local attributed portraits', () => {
  const named = BOT_PROFILES.filter((p) => p.id !== 'balanced');
  assert.equal(named.length, 16);
  assert.equal(new Set(named.map((p) => p.id)).size, named.length);
  for (const p of named) {
    assert.equal(p.research.reviewedAt, '2026-10-11');
    assert.ok(p.research.identity && p.research.limits && p.research.adaptation.length >= 2);
    assert.ok(p.sources.length >= 2);
    for (const claim of [...p.research.career, ...p.research.observations]) {
      assert.ok(claim.sourceIds.length);
      assert.ok(claim.sourceIds.every((id) => p.sources.some((s) => s.id === id)));
    }
    assert.ok(p.sources.every((s) => /^https:\/\//.test(s.url) && s.kind && s.context));
    assert.ok(PROFILE_PORTRAITS[p.id]?.src.startsWith('/portraits/'));
    assert.equal(sanitizeBotSettings({ assignments: { 1: p.id } }).assignments[1], p.id);
  }
  assert.match(get('negreanu').research.limits, /历史/);
  assert.match(get('abao').research.limits, /媒体复述/);
  assert.match(get('peter').research.limits, /附加规则/);
});
test('research rendering escapes claims and provides citations without presenting controls as career statistics', () => {
  const p = structuredClone(get('ivey'));
  p.research.identity = '<script>untrusted</script>';
  const html = playerResearchMarkup(p);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes(p.sources[0].url));
  assert.ok(!html.includes('translate="no"'));
  assert.ok(!html.includes('lang="zh-CN"'));
  assert.equal(playerResearchMarkup(get('balanced')), '');
});
test('Holz dry high-card cbet is small, turn draw sizing is different, and Negreanu controls middling pots more often', () => {
  const flop = decide('holz', view());
  assert.equal(flop.action, 'raise');
  assert.equal(flop.trace.reason, 'small-cbet');
  assert.equal(flop.amount, 400);
  const turn = decide(
    'abao',
    view({ street: 2, equity: 0.4, features: { wet: true, draw: true } }),
    () => 0.1,
  );
  assert.equal(turn.action, 'raise');
  assert.equal(turn.trace.sizing.fraction, 0.9);
  const sample = (id) =>
    Array.from({ length: 500 }, (_, i) =>
      decide(id, view({ equity: 0.57 }), seeded(i + 99)),
    ).filter((d) => d.trace.reason === 'pot-control').length;
  assert.ok(sample('negreanu') > sample('dwan') + 50);
});
test('Float needs position, a dry heads-up board, affordable price and no all-in pressure', () => {
  const base = view({ equity: 0.16, currentBet: 250, contestable: 1250 });
  base.legal = { ...base.legal, toCall: 250, callAmount: 250, canCheck: false, canRaise: false };
  assert.equal(decide('haxton', base, () => 0.1).trace.reason, 'float-continue');
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
      decide('haxton', { ...base, ...change }, () => 0.9).trace.style.floatContinue,
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
  assert.equal(decide('haxton', { ...base, inPosition: false }, () => 0.9).action, 'fold');
  assert.equal(decide('haxton', delayed).trace.style.context.delayed, true);
  assert.equal(
    decide('haxton', { ...delayed, inPosition: false }).trace.style.context.delayed,
    false,
  );
});
test('river air requires a relevant blocker and does not turn board-only strength into a bluff', () => {
  const base = view({ street: 3, board: cards(12, 8, 7, 4, 2), equity: 0.05 });
  assert.equal(decide('dwan', base, () => 0).action, 'check');
  assert.equal(decide('dwan', { ...base, hole: cards(14, 6) }, () => 0).trace.reason, 'pure-bluff');
  assert.equal(
    decide('dwan', { ...base, hole: cards(14, 6), playsBoard: true }, () => 0).action,
    'check',
  );
  const flush = { ...base, board: [12, 8, 7, 4, 2].map((rank) => ({ rank, suit: 0 })) };
  const style = resolveBotStyle(get('koon'));
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
  const style = resolveBotStyle(get('ivey'));
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
        const g = newGame(count);
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
