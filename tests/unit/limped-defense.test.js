import test from 'node:test';
import assert from 'node:assert/strict';
import { pairedTurn, checkedRiver, deepFourBet } from '../fixtures/limped-defense.js';
import { clarityRandom, giveClarityHole } from '../fixtures/review-clarity-followup.js';
import {
  botDecision,
  act,
  advanceStreet,
  legalActions,
  planBotTurn,
  executeBotTurn,
} from '../../src/engine/poker.js';
import { limpedPairValueLine } from '../../src/engine/bot-style-lines.js';
import { resolveBotStyle } from '../../src/engine/bot-style.js';
import { getBotProfile } from '../../src/engine/bot-profiles.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { preflopPressureCase } from '../../scripts/preflop-pressure-cases.mjs';
import * as engine from '../../src/engine/poker.js';
const decide = (g, seed = 71) => botDecision(g, clarityRandom(seed));

test('the limped turn uses the actual 33.3% price without inventing pending calls', () => {
  const d = decide(pairedTurn()),
    v = d.trace.view;
  assert.equal(v.pot, 160000);
  assert.equal(v.callPrice.odds, 1 / 3);
  assert.deepEqual(
    v.callPots.map((p) => [p.amount, p.eligible]),
    [
      [80000, [0, 1, 2, 4]],
      [160000, [0, 1]],
    ],
  );
  assert.ok(v.publicEquity.priceEquity > v.publicEquity.potEquity);
  assert.equal(v.equity, v.publicEquity.priceEquity);
  assert.equal(d.action, 'call');
});

test('identical public state cannot learn the bluffer actual hole cards or undealt cards', () => {
  const a = pairedTurn(),
    b = pairedTurn();
  giveClarityHole(b, 0, 'Qh Jd');
  b.deck.reverse();
  assert.deepEqual(decide(a), decide(b));
});

test('executing the defense conserves whole chips at both stake boundaries', () => {
  for (const smallBlind of [25, 50000]) {
    const g = pairedTurn({ smallBlind }),
      total = g.players.reduce((s, p) => s + p.stack + p.total, 0);
    executeBotTurn(g, planBotTurn(g, clarityRandom(71), { timingRandom: () => 0.4 }), {
      expedited: true,
    });
    while (g.phase !== 'done') {
      if (g.phase === 'between') advanceStreet(g);
      else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'fold');
    }
    assert.equal(
      g.players.reduce((s, p) => s + p.stack, 0),
      total,
    );
    for (const p of g.players) assert.equal(p.stack % smallBlind, 0);
  }
});

test('the flop value probe requires actual checks and a bounded investment', () => {
  const v = decide(pairedTurn({ flop: true })).trace.view,
    style = resolveBotStyle(getBotProfile('vale'));
  assert.equal(limpedPairValueLine(v, style, 0.5).fraction, 0.3);
  assert.equal(
    limpedPairValueLine({ ...v, history: v.history.filter((a) => !a.street) }, style, 0.5),
    null,
  );
  assert.equal(
    limpedPairValueLine({ ...v, legal: { ...v.legal, canCheck: false } }, style, 0.5),
    null,
  );
  assert.equal(limpedPairValueLine({ ...v, stack: v.pot }, style, 0.5), null);
});

test('river thin value requires two checked streets, a safe board and the advanced skill', () => {
  const v = decide(checkedRiver({ beforeBet: true })).trace.view,
    style = resolveBotStyle(getBotProfile('vale'));
  assert.equal(limpedPairValueLine(v, style, 0.4).fraction, 0.25);
  for (const delta of [
    { difficulty: 'normal' },
    { features: { ...v.features, ownMade: false } },
    { history: [...v.history, { street: 2, id: 0, action: 'raise', amount: 20000 }] },
    { rivals: 4 },
  ])
    assert.equal(limpedPairValueLine({ ...v, ...delta }, style, 0.4), null);
});

test('value mixes retain checks and one pair does not automatically raise a turn bet', () => {
  let flop = 0,
    river = 0,
    calls = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const f = decide(pairedTurn({ flop: true }), seed),
      r = decide(checkedRiver({ beforeBet: true }), seed),
      t = decide(pairedTurn(), seed);
    if (f.action === 'raise') {
      flop++;
      assert.ok(f.amount <= 30000);
    }
    if (r.action === 'raise') {
      river++;
      assert.equal(r.amount, 20000);
    }
    if (t.action === 'call') calls++;
    assert.notEqual(t.action, 'raise');
  }
  assert.ok(flop >= 5 && flop < 30);
  assert.ok(river >= 5 && river < 30);
  assert.ok(calls >= 20);
});

test('the screenshot deep AK fold is a range and price decision, not a stack veto', () => {
  const d = decide(deepFourBet()),
    v = d.trace.view;
  assert.equal(v.allIn.depthBB, 222.5);
  assert.equal(v.callPrice.cost, 4270000);
  assert.equal(v.allIn.line, 'multi-raise-shove');
  assert.equal(d.action, 'fold');
  assert.ok(d.trace.equity < d.trace.requiredEquity);
  const text = explainOpponent({ id: v.id, name: 'Mia', ...d }).detail;
  assert.match(text, /42.4%/);
  assert.match(text, /范围很宽/);
  assert.doesNotMatch(text, /保住剩下的|保住剩余筹码/);
});

test('AK and JJ continue against shallow late open shoves at every supported table size', () => {
  for (const seats of [5, 6, 7, 8, 9])
    for (const hand of ['AKo', 'JJ']) {
      const g = preflopPressureCase(engine, {
        seats,
        hand,
        kind: 'late-jam-20',
        difficulty: 'hard',
        smallBlind: 100,
      });
      assert.notEqual(decide(g).action, 'fold', `${seats}/${hand}`);
    }
});

test('recorded folds explain threats and price without claiming those are the actual cards', () => {
  const g = pairedTurn();
  act(g, 1, 'fold');
  const d = decide(g),
    v = d.trace.view;
  const review = explainOpponent({ id: v.id, name: 'Alex', ...d });
  assert.equal(d.action, 'fold');
  assert.match(review.detail, /33.3%/);
  assert.match(review.detail, /可能领先当前手牌的组合/);
  assert.match(review.detail, /并非已经看到了对手底牌/);
  assert.doesNotMatch(review.detail, /当前成牌仍可能遇到更大牌/);
});
