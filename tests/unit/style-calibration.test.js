import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseBotAction,
  getBotProfile,
  freshBotMood,
  sanitizeBotSettings,
} from '../../src/engine/bot-profiles.js';
import { deceptiveView } from '../fixtures/deceptive-decisions.js';
const seeded = (n) => () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
const decide = (id, v, seed) =>
  chooseBotAction(v, getBotProfile(id), freshBotMood(), 'off', seeded(seed));
const rate = (id, v, predicate) =>
  Array.from({ length: 1600 }, (_, i) => decide(id, v, 18013 + i * 7919)).filter(predicate).length /
  1600;

test('call-induction entry preference is priced, range-limited and absent against raises or shallow commitments', () => {
  const cheap = deceptiveView('Kh Th', '', { equity: 0.4, position: 'CO', difficulty: 'normal' });
  const calls = (d) => d.action === 'call';
  assert.ok(rate('vale', cheap, calls) > rate('balanced', cheap, calls) + 0.25);
  const usedPreference = (v) =>
    decide('vale', v, 2).trace.checks.some((c) => c.code === 'entry-call');
  assert.equal(usedPreference(cheap), true);
  for (const changed of [
    { ...cheap, stack: 300 },
    { ...cheap, hole: deceptiveView('As Ah').hole },
    {
      ...cheap,
      currentBet: 200,
      history: [{ id: 0, street: 0, action: 'raise', amount: 200 }],
      legal: { ...cheap.legal, toCall: 200, callAmount: 200, minRaiseTo: 350 },
    },
    deceptiveView('Ks Jh', 'Ac 7d 2h', { equity: 0.2, difficulty: 'normal' }),
  ])
    assert.equal(usedPreference(changed), false);
});

test('retired style selections migrate idempotently without becoming an unavailable choice', () => {
  const assignments = {
    1: 'slate',
    2: 'knox',
    3: 'finn',
    4: 'theo',
    5: 'sage',
    6: 'bram',
    7: 'leon',
    8: 'ezra',
  };
  const clean = sanitizeBotSettings({ assignments });
  assert.deepEqual(Object.values(clean.assignments), [
    'rook',
    'rook',
    'rook',
    'owen',
    'vale',
    'vale',
    'owen',
    'owen',
  ]);
  assert.deepEqual(sanitizeBotSettings(clean), clean);
});
test('strong-hand traps stand out on deep dry boards and do not leak into wet or shallow protection spots', () => {
  const v = deceptiveView('9s 9h', '9d Kc 2h', { equity: 0.9, inPosition: false });
  const check = (d) => d.action === 'check';
  assert.ok(rate('vale', v, check) > rate('balanced', v, check) + 0.25);
  for (const changed of [
    deceptiveView('9s 9h', '9d Kc 2c', { equity: 0.9, inPosition: false }),
    { ...v, stack: 500 },
    { ...v, rivals: 2, opponents: [...v.opponents, { id: 2, stack: 5000, allin: false }] },
  ])
    assert.notEqual(decide('vale', changed, 2).trace.reason, 'strong-trap');
});
test('safe top-pair induction is limited to a deep dry heads-up flop with a strong kicker', () => {
  const top = deceptiveView('As Qh', 'Ac 7d 2h', { equity: 0.8, inPosition: false });
  for (const difficulty of ['normal', 'hard']) {
    const v = { ...top, difficulty };
    const trap = (d) => d.trace.reason === 'strong-trap';
    assert.ok(rate('vale', v, trap) > rate('balanced', v, trap) + 0.25);
    for (const changed of [
      { ...v, street: 2 },
      { ...v, stack: 500 },
      { ...v, rivals: 2 },
      { ...v, equity: 0.65 },
      deceptiveView('As Qh', 'Ac 7d 2d', { equity: 0.8, inPosition: false, difficulty }),
      deceptiveView('As Jh', 'Ac 7d 2h', { equity: 0.8, inPosition: false, difficulty }),
      { ...v, opponents: [{ id: 0, stack: 0, allin: true }] },
    ])
      assert.notEqual(decide('vale', changed, 2).trace.reason, 'strong-trap');
  }
});
test('late-position emphasis changes unopened entry and attack without widening the re-raise tier', () => {
  const pre = deceptiveView('Kh Th', '', { equity: 0.4, position: 'BTN', history: [] });
  for (const difficulty of ['normal', 'hard']) {
    const late = { ...pre, difficulty },
      early = { ...late, position: 'UTG' };
    assert.ok(
      decide('iris', late, 2).trace.openingRange > decide('iris', early, 2).trace.openingRange * 2,
    );
    // This already-admitted hand checks the attack preference. The population
    // signature and its 25-point target are measured separately on full hands.
    const raise = (d) => d.action === 'raise';
    assert.ok(rate('iris', late, raise) > rate('balanced', late, raise) + 0.2);
    const easy = { ...late, difficulty: 'easy' };
    assert.ok(
      decide('iris', easy, 2).trace.openingRange /
        decide('iris', { ...easy, position: 'UTG' }, 2).trace.openingRange <
        2,
    );
    const raised = {
      ...late,
      currentBet: 500,
      history: [{ id: 0, street: 0, action: 'raise', amount: 500 }],
      legal: { ...late.legal, toCall: 500, callAmount: 500, minRaiseTo: 950 },
    };
    assert.ok(decide('iris', raised, 2).trace.raiseRange < 0.2);
  }
});
test('draw emphasis affects executed aggression but retains price, all-in and population boundaries', () => {
  const v = deceptiveView('As Js', 'Qs 8h 2s', {
    equity: 0.4,
    difficulty: 'normal',
    history: [
      { id: 1, street: 0, action: 'raise', amount: 150 },
      { id: 0, street: 1, action: 'check', amount: 0 },
    ],
  });
  const raise = (d) => d.action === 'raise';
  assert.ok(rate('mira', v, raise) > rate('balanced', v, raise) + 0.25);
  for (const changed of [
    { ...v, rivals: 3 },
    { ...v, opponents: [{ id: 0, stack: 0, allin: true }] },
    {
      ...v,
      currentBet: 3000,
      legal: { ...v.legal, toCall: 3000, callAmount: 3000, canCheck: false },
    },
    { ...v, difficulty: 'easy' },
  ])
    assert.equal(decide('mira', changed, 2).trace.semiBluff, false);
});
test('the delayed style can float at standard difficulty and cannot bypass an expensive call or act from no position', () => {
  const v = deceptiveView('Ks Jh', 'Ac 7d 2h', {
    equity: 0.16,
    difficulty: 'normal',
    pot: 1000,
    currentBet: 200,
    contestable: 1200,
    history: [{ id: 0, street: 1, action: 'raise', amount: 200 }],
    legal: {
      enabled: true,
      chipUnit: 25,
      toCall: 200,
      callAmount: 200,
      canCheck: false,
      canRaise: true,
      minRaiseTo: 400,
      maxRaiseTo: 5000,
    },
  });
  const call = (d) => d.action === 'call';
  assert.ok(rate('iris', v, call) > 0.25);
  for (const changed of [
    { ...v, inPosition: false },
    { ...v, difficulty: 'easy' },
    { ...v, legal: { ...v.legal, toCall: 300, callAmount: 300 } },
  ])
    assert.equal(decide('iris', changed, 2).trace.style.floatContinue, false);
  const turn = deceptiveView('Ks Jh', 'Ac 7d 2h 9s', {
    equity: 0.25,
    difficulty: 'normal',
    history: [
      { id: 1, street: 1, action: 'call', amount: 200 },
      { id: 0, street: 2, action: 'check', amount: 0 },
    ],
  });
  assert.ok(rate('iris', turn, (d) => d.action === 'raise') > 0.15);
});

test('supported ordinary value hands remain active without admitting unsupported air as value', () => {
  const publicSituation = {
    equity: 0.68,
    inPosition: false,
    rivals: 3,
    opponents: [0, 2, 3].map((id) => ({ id, stack: 5000, allin: false })),
    history: [
      { id: 1, street: 0, action: 'raise', amount: 150 },
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 2, street: 1, action: 'check', amount: 0 },
    ],
  };
  const topPair = deceptiveView('As Kh', 'Ad 6c 5h', publicSituation);
  assert.ok(rate('balanced', topPair, (d) => d.action === 'raise') > 0.76);
  const air = deceptiveView('9s 8h', 'Ad Qc 5h', { ...publicSituation, equity: 0.25 });
  assert.equal(
    rate('balanced', air, (d) => d.action === 'raise'),
    0,
  );
});

// Regression from anonymous session A18: a weak top pair must not use the
// ordinary first-bet equity threshold to keep re-raising a 100BB pot.
test('value raises respect hand support, public resistance and investment boundaries', async () => {
  const { valueRaiseSupported } = await import('../../src/engine/bot-style.js');
  const facing = {
    equity: 0.75,
    currentBet: 300,
    pot: 1000,
    history: [{ id: 0, street: 1, action: 'raise', amount: 300 }],
    legal: {
      enabled: true,
      chipUnit: 25,
      toCall: 300,
      callAmount: 300,
      canCheck: false,
      canRaise: true,
      minRaiseTo: 600,
      maxRaiseTo: 5000,
    },
  };
  const weak = deceptiveView('Qs 8c', 'Qc 2h Th', facing);
  assert.equal(valueRaiseSupported(weak, 0.75), false);
  const strong = deceptiveView('As Qh', 'Qc 7d 2h', facing);
  assert.equal(valueRaiseSupported(strong, 0.75), true);
  assert.equal(
    valueRaiseSupported(
      {
        ...strong,
        history: [...facing.history, { id: 1, street: 1, action: 'raise', amount: 600 }],
      },
      0.9,
    ),
    false,
  );
  assert.equal(
    valueRaiseSupported({ ...strong, legal: { ...strong.legal, minRaiseTo: 1500 } }, 0.9),
    false,
  );
  const set = deceptiveView('9s 9h', '9d Kc 2h', facing);
  assert.equal(valueRaiseSupported(set, 0.9), true);
  const dangerous = deceptiveView('9s 9h', '9d Kd 2d', facing);
  assert.equal(valueRaiseSupported(dangerous, 0.9), false);
});

test('all historical and retired selections resolve transitively to active styles', async () => {
  const { BOT_PROFILES } = await import('../../src/engine/bot-profiles.js');
  const { readFileSync } = await import('node:fs');
  const original = JSON.parse(
    readFileSync(new URL('../fixtures/character-strategies.json', import.meta.url)),
  );
  const active = new Set(BOT_PROFILES.map((p) => p.id));
  for (const p of original) assert.ok(active.has(getBotProfile(p.id).id), p.id);
  const settings = sanitizeBotSettings({ assignments: { 1: 'vale', 2: 'mira', 3: 'iris' } });
  assert.deepEqual(Object.values(settings.assignments).slice(0, 3), ['vale', 'mira', 'iris']);
});

test('safe multiway strong hands seek value while threat boards retain their protection', async () => {
  const { safeStrongValue } = await import('../../src/engine/bot-style.js');
  const v = deceptiveView('9s 9h', '9d Kc 2h', {
    equity: 0.55,
    rivals: 3,
    opponents: [0, 2, 3].map((id) => ({ id, stack: 5000, allin: false })),
  });
  assert.equal(safeStrongValue(v, 0.55), true);
  assert.ok(rate('balanced', v, (d) => d.action === 'raise') > 0.8);
  assert.equal(
    safeStrongValue(
      deceptiveView('9s 9h', '9d Kd 2d', {
        ...v,
        features: deceptiveView('9s 9h', '9d Kd 2d').features,
        board: deceptiveView('9s 9h', '9d Kd 2d').board,
      }),
      0.55,
    ),
    false,
  );
  assert.equal(safeStrongValue({ ...v, playsBoard: true }, 0.9), false);
  assert.equal(safeStrongValue({ ...v, legal: { ...v.legal, canCheck: false } }, 0.9), false);
});

test('repeated expensive aggression can release a weak pair without overriding priced all-ins', async () => {
  const { expensiveWeakPair } = await import('../../src/engine/bot-style.js');
  const v = deceptiveView('As 4h', 'Ad Jh 9h 2c', {
    difficulty: 'hard',
    equity: 0.52,
    currentBet: 1500,
    pot: 2500,
    contestable: 4000,
    history: [
      { id: 0, street: 1, action: 'raise', amount: 500 },
      { id: 0, street: 2, action: 'raise', amount: 1500 },
    ],
    legal: {
      enabled: true,
      chipUnit: 25,
      canCheck: false,
      canRaise: true,
      toCall: 1500,
      callAmount: 1500,
      minRaiseTo: 3000,
      maxRaiseTo: 5000,
    },
  });
  assert.equal(expensiveWeakPair(v, 0.52), true);
  assert.equal(decide('jett', v, 15).action, 'fold');
  assert.equal(expensiveWeakPair({ ...v, allIn: { odds: 0.2, pendingBuffer: 0 } }, 0.52), false);
  assert.equal(expensiveWeakPair({ ...v, difficulty: 'easy' }, 0.52), false);
  assert.equal(expensiveWeakPair({ ...v, legal: { ...v.legal, callAmount: 1000 } }, 0.52), false);
  assert.equal(expensiveWeakPair(v, 0.75), false);
});

test('checked-to dry top pairs can seek moderate value without value raising a bet', async () => {
  const { checkedToPairValue } = await import('../../src/engine/bot-style.js');
  const v = deceptiveView('Ks Qh', 'Kd 7c 2s', {
    equity: 0.55,
    rivals: 3,
    opponents: [0, 2, 3].map((id) => ({ id, stack: 5000, allin: false })),
    history: [0, 2, 3].map((id) => ({ id, street: 1, action: 'check', amount: 0 })),
  });
  assert.equal(checkedToPairValue(v, 0.55), true);
  assert.ok(rate('balanced', v, (d) => d.action === 'raise') > 0.4);
  assert.equal(checkedToPairValue({ ...v, inPosition: false }, 0.55), false);
  const monotone = deceptiveView('Ks Qh', 'Kd 7d 2d', {
    ...v,
    board: deceptiveView('Ks Qh', 'Kd 7d 2d').board,
    features: deceptiveView('Ks Qh', 'Kd 7d 2d').features,
  });
  assert.equal(checkedToPairValue(monotone, 0.55), false);
  assert.equal(checkedToPairValue({ ...v, legal: { ...v.legal, canCheck: false } }, 0.9), false);
});

test('checked-to overpairs on low paired two-tone boards seek bounded value instead of treating board pairing as a weak hand', async () => {
  const { checkedToPairValue } = await import('../../src/engine/bot-style.js');
  const v = deceptiveView('As Ac', '3h 3s Ks', {
    equity: 0.6,
    rivals: 3,
    opponents: [0, 2, 3].map((id) => ({ id, stack: 5000, allin: false })),
    history: [0, 2, 3].map((id) => ({ id, street: 1, action: 'check' })),
  });
  assert.equal(v.features.overpair, true);
  assert.equal(v.features.strongMade, false);
  assert.equal(checkedToPairValue(v, 0.6), true);
  assert.ok(rate('balanced', v, (d) => d.action === 'raise') > 0.7);
  for (let i = 0; i < 80; i++) {
    const d = decide('jett', v, i * 7919);
    if (d.action === 'raise') assert.ok(d.trace.sizing.fraction <= 0.35);
  }
  const ordinary = deceptiveView('Qd Jc', 'Qs 9h 4h', {
    equity: 0.55,
    rivals: 2,
    history: [{ id: 0, street: 1, action: 'check' }],
  });
  assert.equal(checkedToPairValue(ordinary, 0.55), true);
  assert.equal(checkedToPairValue({ ...ordinary, inPosition: false }, 0.55), false);
});

test('a checked-through street permits a modest overpair probe while new threats and missing checks stop it', async () => {
  const { checkedThroughPairValue } = await import('../../src/engine/bot-style.js');
  const v = deceptiveView('Jd Js', '9d Th Ts 5h', {
    equity: 0.55,
    rivals: 2,
    inPosition: false,
    opponents: [0, 2].map((id) => ({ id, stack: 5000, allin: false })),
    history: [0, 1, 2].map((id) => ({ id, street: 1, action: 'check' })),
  });
  assert.equal(checkedThroughPairValue(v, 0.55), true);
  assert.ok(rate('balanced', v, (d) => d.action === 'raise') > 0.7);
  assert.equal(
    checkedThroughPairValue({ ...v, history: v.history.filter((a) => a.id !== 2) }, 0.55),
    false,
  );
  assert.equal(
    checkedThroughPairValue(
      { ...v, history: [...v.history, { id: 0, street: 1, action: 'raise', amount: 100 }] },
      0.55,
    ),
    false,
  );
  assert.equal(
    checkedThroughPairValue({ ...v, legal: { ...v.legal, canCheck: false } }, 0.55),
    false,
  );
  const danger = deceptiveView('Jd Js', '9h Th 2h 5h', {
    ...v,
    board: deceptiveView('Jd Js', '9h Th 2h 5h').board,
    features: deceptiveView('Jd Js', '9h Th 2h 5h').features,
  });
  assert.equal(checkedThroughPairValue(danger, 0.9), false);
  for (let i = 0; i < 80; i++) {
    const d = decide('rook', v, i * 7919);
    if (d.action === 'raise') assert.ok(d.trace.sizing.fraction <= 0.4);
  }
});

test('expensive preflop defense preserves premiums and ordinary small-reraise prices', async () => {
  const { expensivePreflopDefense } = await import('../../src/engine/bot-style.js');
  const v = deceptiveView('5s 5h', '', {
    equity: 0.3,
    pot: 3000,
    contestable: 4000,
    currentBet: 1000,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 300 },
      { id: 2, street: 0, action: 'raise', amount: 1000 },
    ],
    legal: {
      enabled: true,
      chipUnit: 25,
      canCheck: false,
      canRaise: true,
      toCall: 1000,
      callAmount: 1000,
      minRaiseTo: 1700,
      maxRaiseTo: 5000,
    },
  });
  assert.equal(expensivePreflopDefense(v, 0.3), true);
  assert.equal(decide('rook', v, 23).action, 'fold');
  assert.equal(expensivePreflopDefense({ ...v, currentBet: 750 }, 0.3), false);
  assert.equal(
    expensivePreflopDefense({ ...v, allIn: { odds: 0.25, pendingBuffer: 0 } }, 0.3),
    false,
  );
  assert.equal(
    expensivePreflopDefense(
      deceptiveView('Qs Qh', '', { ...v, hole: deceptiveView('Qs Qh').hole }),
      0.3,
    ),
    false,
  );
});

test('a made straight may seek river value and fragile value bets stay modest after sizing multipliers', async () => {
  const { safeStrongValue, valueBetCap } = await import('../../src/engine/bot-style.js');
  const straight = deceptiveView('Th 4h', '9h 6c Jd Ks Qc', { equity: 0.55, rivals: 3 });
  assert.equal(safeStrongValue(straight, 0.55), true);
  assert.ok(rate('balanced', straight, (d) => d.action === 'raise') > 0.8);
  const fragile = deceptiveView('Kh Qs', 'Kd Qd 2d 7c 3h', { equity: 0.9 });
  assert.equal(valueBetCap(fragile), 0.5);
  assert.equal(valueBetCap(deceptiveView('Kh Qs', 'Kd Qd Jh')), 0.5);
  for (let seed = 0; seed < 100; seed++) {
    const d = decide('jett', fragile, seed * 7919 + 5);
    if (d.action === 'raise') assert.ok(d.trace.sizing.fraction <= 0.5);
  }
});
