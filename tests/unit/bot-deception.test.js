import test from 'node:test';
import assert from 'node:assert/strict';
import { deceptiveAction, deceptionPolicy, isDonkLead } from '../../src/engine/bot-deception.js';
import {
  BOT_PROFILES,
  getBotProfile,
  chooseBotAction,
  freshBotMood,
} from '../../src/engine/bot-profiles.js';
import {
  newGame,
  startHand,
  botDecision,
  applyBotSettings,
  act,
  advanceStreet,
  potSize,
} from '../../src/engine/poker.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import {
  cards,
  deceptiveView,
  deceptionCases,
  deceptiveRecords,
} from '../fixtures/deceptive-decisions.js';
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const special = (v, profile = 'balanced') => deceptiveAction(v, getBotProfile(profile), () => 0);

test('new mix is standard and advanced only, and capabilities follow base styles rather than mood', () => {
  for (const p of BOT_PROFILES) {
    const easy = deceptionPolicy(p, 'easy'),
      normal = deceptionPolicy(p, 'normal'),
      hard = deceptionPolicy(p, 'hard');
    assert.ok(Object.values(easy).every((v) => v === 0));
    assert.equal(hard.trap, normal.trap * 1.8);
    for (const key of ['dirty', 'donk', 'sevenTwo']) assert.equal(normal[key], 0);
  }
  for (const id of ['balanced', 'rook', 'knox', 'finn']) {
    assert.ok(deceptionPolicy(getBotProfile(id), 'hard').sevenTwo > 0);
    assert.ok(deceptionPolicy(getBotProfile(id), 'hard').dirty > 0);
  }
  for (const id of ['vale', 'bram', 'nico', 'owen']) {
    assert.equal(deceptionPolicy(getBotProfile(id), 'hard').dirty, 0);
    assert.equal(deceptionPolicy(getBotProfile(id), 'hard').sevenTwo, 0);
  }
  assert.ok(deceptionPolicy(getBotProfile('vale'), 'normal').trap > 0);
  assert.equal(deceptionPolicy(getBotProfile('knox'), 'hard').trap, 0);
  assert.equal(deceptionPolicy(getBotProfile('bram'), 'hard').donk, 0);
});

test('actual slow-plays, trash raises, donks and 7-2 bluffs have distinct executed traces and reasons', () => {
  const records = deceptiveRecords();
  assert.deepEqual(
    records.map((r) => r.trace.reason),
    [
      'strong-trap',
      'strong-trap',
      'strong-trap',
      'dirty-open',
      'dirty-reraise',
      'donk-lead',
      'donk-lead',
      'seven-two-bluff',
      'seven-two-bluff',
    ],
  );
  assert.deepEqual(
    records.slice(0, 3).map((r) => r.action),
    ['call', 'check', 'call'],
  );
  for (const r of records) {
    assert.equal(r.trace.reason, r.trace.deception.strategy);
    assert.equal(
      r.trace.exceptions.length,
      0,
      'Deliberate mix never depends on random-error exemptions',
    );
    const e = explainOpponent(r);
    assert.match(e.detail, /埋牌|脏牌|donk|2–7/);
    assert.deepEqual(e.metrics, []);
    if (r.action === 'raise') {
      assert.equal(r.amount % 25, 0);
      assert.ok(
        r.amount >= r.trace.view.legal.minRaiseTo && r.amount < r.trace.view.legal.maxRaiseTo,
      );
      assert.ok(r.amount - r.trace.view.bet <= r.trace.deception.effective * 0.15);
      assert.equal(r.trace.sizing.executed, true);
    }
  }
  assert.match(explainOpponent(records[5]).detail, /两头顺听牌|同花听牌/);
  assert.match(explainOpponent(records[6]).detail, /付费/);
  assert.doesNotMatch(explainOpponent(records[8]).detail, /奖励|EV|抽样|模拟器/);
});

test('conditional executed mix rises with difficulty at fixed inputs and deterministic random samples', () => {
  const measured = {};
  for (const [name, view] of Object.entries(deceptionCases())) {
    const totals = {};
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const random = seeded(20261013);
      totals[difficulty] = 0;
      for (let i = 0; i < 12000; i++) {
        const d = deceptiveAction({ ...view, difficulty }, getBotProfile('balanced'), () =>
          random(),
        );
        if (d) totals[difficulty]++;
      }
    }
    assert.equal(totals.easy, 0);
    assert.ok(
      name.includes('trap')
        ? totals.normal > 50 && totals.hard > totals.normal * 1.5
        : totals.normal === 0 && totals.hard > 50,
      `${name}: ${JSON.stringify(totals)}`,
    );
    measured[name] = totals;
  }
  // Reproducible conditional counts, not all-hand or real-player frequencies.
  console.log('deception conditional samples per 12000:', JSON.stringify(measured));
});

test('slow-play requires genuine own strength, a safe price, deep stacks and a dry board', () => {
  const { 'preflop-trap': pre, 'check-trap': post, 'call-trap': call } = deceptionCases();
  for (const v of [
    { ...pre, currentBet: 225 },
    { ...pre, rivals: 3 },
    { ...pre, stack: 1000 },
    { ...pre, history: [...pre.history, { id: 2, street: 0, action: 'raise', amount: 400 }] },
    { ...post, features: { ...post.features, wet: true } },
    { ...post, stack: 1500 },
    { ...post, rivals: 2 },
    { ...post, playsBoard: true },
    { ...call, legal: { ...call.legal, callAmount: 500, toCall: 500 } },
    deceptiveView('As Kh', '9d 9c 9h', { equity: 0.99 }),
    deceptiveView('As Kh', 'Qd 8c 2h', { equity: 0.99 }),
  ])
    assert.notEqual(special(v)?.reason, 'strong-trap');
  assert.notEqual(
    special({ ...call, legal: { ...call.legal, canRaise: false } })?.reason,
    'strong-trap',
    'A legally forced call is not a deliberate choice to conceal a raise',
  );
  assert.equal(
    special(deceptiveView('9s 9h', '9d Kc 2h 6c Ad', { equity: 0.9, inPosition: false })).reason,
    'strong-trap',
    'River checking can still induce a bet without inventing another card',
  );
  assert.notEqual(
    special(
      deceptiveView('9s 9h', '9d Kc 2h 6c Ad', {
        equity: 0.9,
        inPosition: true,
        history: [{ id: 0, street: 3, action: 'check', amount: 0 }],
      }),
    )?.reason,
    'strong-trap',
    'The final river check closes betting instead of inducing a nonexistent later bet',
  );
  assert.notEqual(
    special(
      deceptiveView('9s 9h', '9d Kc 2h 6c Ad', {
        equity: 0.9,
        inPosition: false,
        history: [{ id: 0, street: 3, action: 'check', amount: 0 }],
      }),
    )?.reason,
    'strong-trap',
    'A player who has already checked cannot act again after this river check',
  );
  assert.notEqual(
    special({
      ...pre,
      rivals: 2,
      opponents: [
        { id: 0, stack: 500, bet: 150, allin: false },
        { id: 2, stack: 5000, bet: 0, allin: false },
      ],
    })?.reason,
    'strong-trap',
    'An unrelated deep player cannot make the actual shallow opener a deep-stack trap target',
  );
});

test('standard river slow-play also requires an opponent who can still respond to the check', () => {
  const input = (overrides = {}) =>
    deceptiveView('9s 9h', '9d Kc 2h 6c Ad', {
      difficulty: 'normal',
      equity: 0.9,
      inPosition: false,
      rivals: 1,
      ...overrides,
    });
  const decide = (view) =>
    chooseBotAction(view, getBotProfile('balanced'), freshBotMood(), 'off', () => 0);
  const inducing = input();
  assert.equal(inducing.features.strongMade, true);
  assert.ok(['trap', 'strong-trap'].includes(decide(inducing).trace.reason));
  for (const closed of [
    input({ inPosition: true, history: [{ id: 0, street: 3, action: 'check', amount: 0 }] }),
    input({ history: [{ id: 0, street: 3, action: 'check', amount: 0 }] }),
  ]) {
    assert.equal(closed.features.strongMade, true);
    assert.notEqual(decide(closed).trace.reason, 'trap');
    assert.notEqual(decide(closed).trace.reason, 'strong-trap');
  }
});

test('trash raises require an unopened late pot or a single small open plus blocker and no callers', () => {
  const { 'dirty-open': open, 'dirty-reraise': re } = deceptionCases();
  for (const v of [
    { ...open, position: 'UTG' },
    { ...open, rivals: 4 },
    { ...open, history: [{ id: 0, street: 0, action: 'call', amount: 50 }] },
    { ...re, currentBet: 175 },
    { ...re, history: [...re.history, { id: 2, street: 0, action: 'call', amount: 150 }] },
    { ...re, hole: cards('Jh 4c') },
    { ...re, stack: 1000 },
    { ...re, legal: { ...re.legal, minRaiseTo: 1000 } },
  ])
    assert.equal(special(v), null);
});

test('donk identification rejects c-bets, probes, check-raises, folded aggressors and unbacked air', () => {
  const v = deceptionCases()['donk-draw'];
  assert.equal(isDonkLead(v), true);
  for (const changed of [
    { ...v, inPosition: true },
    { ...v, history: v.history.map((a) => ({ ...a, id: a.id === 0 ? 1 : 0 })) },
    { ...v, history: [...v.history, { id: 0, street: 1, action: 'check', amount: 0 }] },
    { ...v, history: [...v.history, { id: 1, street: 1, action: 'check', amount: 0 }] },
    { ...v, opponents: [{ id: 2, stack: 5000 }] },
    { ...v, opponents: [{ id: 0, stack: 0, allin: true }] },
    { ...v, opponents: [{ id: 0, stack: 0, allin: false }] },
    { ...v, legal: { ...v.legal, canCheck: false, toCall: 100, callAmount: 100 } },
  ])
    assert.equal(isDonkLead(changed), false);
  assert.equal(
    isDonkLead({
      ...v,
      rivals: 2,
      opponents: [
        { id: 0, stack: 5000 },
        { id: 2, stack: 5000 },
      ],
      history: [...v.history, { id: 2, street: 1, action: 'check', amount: 0 }],
    }),
    true,
    'A different player checking first does not turn a lead before the aggressor into a probe',
  );
  assert.equal(special({ ...v, rivals: 2 }), null);
  assert.equal(
    special({ ...v, features: { ...v.features, draw: false, flushDraw: false, straightOuts: 4 } }),
    null,
  );
  // Ordinary policy leads are labeled too, without inventing strong value.
  const base = chooseBotAction(v, getBotProfile('balanced'), freshBotMood(), 'off', () => 0.2);
  assert.equal(base.trace.reason, 'donk-lead');
  assert.equal(base.trace.deception.source, 'base-policy');
});

test('7-2 bluff is never a bounty shove, a multiway punt or a made-hand mislabeled bluff', () => {
  const { 'seven-two-probe': probe, 'seven-two-open': open } = deceptionCases();
  for (const v of [
    { ...probe, rivals: 2 },
    { ...probe, inPosition: false },
    { ...probe, history: [] },
    { ...probe, features: { ...probe.features, wet: true } },
    { ...probe, features: { ...probe.features, madeCategory: 1 } },
    { ...probe, features: { ...probe.features, draw: true } },
    { ...probe, playsBoard: true },
    { ...open, legal: { ...open.legal, minRaiseTo: 5000 } },
  ])
    assert.equal(special(v), null);
  for (const v of Object.values(deceptionCases())) {
    assert.equal(special({ ...v, opponents: [{ id: 0, stack: 0, allin: true }] }), null);
    assert.equal(special({ ...v, difficulty: 'easy' }), null);
  }
  const declined = chooseBotAction(
    open,
    getBotProfile('balanced'),
    freshBotMood(),
    'off',
    () => 0.99,
  );
  assert.equal(declined.action, 'fold');
  assert.equal(declined.trace.deception, null);
  assert.doesNotMatch(
    explainOpponent({ ...declined, trace: { ...declined.trace, view: open } }).detail,
    /2–7.*诈唬/,
  );
});

test('actual bot perspective and chip conservation remain intact in standard and advanced complete hands', () => {
  for (const difficulty of ['normal', 'hard']) {
    const g = newGame(5, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
    g.difficulty = difficulty;
    applyBotSettings(g, {
      emotionMode: 'off',
      assignments: { 1: 'balanced', 2: 'rook', 3: 'vale', 4: 'finn' },
    });
    const random = seeded(391);
    for (let hand = 0; hand < 6; hand++) {
      g.players.forEach((p) => (p.stack = 5000));
      startHand(g);
      let turns = 0;
      while (g.phase !== 'done') {
        assert.ok(++turns < 300);
        if (g.phase === 'between') advanceStreet(g);
        else {
          const d = botDecision(g, random);
          assert.ok(!('deck' in d.trace.view) && !('winners' in d.trace.view));
          assert.ok(d.trace.view.opponents.every((p) => !('hole' in p)));
          act(g, g.actor, d.action, d.amount);
        }
        assert.equal(
          g.players.reduce((sum, p) => sum + p.stack, 0) + (g.phase === 'done' ? 0 : potSize(g)),
          25000,
        );
        assert.ok(g.players.every((p) => [p.stack, p.bet, p.total].every((n) => n % 25 === 0)));
      }
    }
  }
});

test('every executed deceptive rationale localizes and keeps key poker information', async () => {
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const r of deceptiveRecords()) {
      const e = explainOpponent(r);
      for (const text of [e.title, ...e.paragraphParts.flat(), ...e.reasons, ...e.metrics]) {
        const translated = localizeText(text);
        assert.doesNotMatch(translated, /\{\d+\}/);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
        if (text.includes('2–7')) assert.ok(translated.includes('2–7'));
        if (text.includes('donk')) assert.ok(translated.toLowerCase().includes('donk'));
      }
    }
  }
});
