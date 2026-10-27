import test from 'node:test';
import assert from 'node:assert/strict';
import { phase3CheckSpot } from '../fixtures/review-phase3.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { checkReasoning, checkRisks } from '../../src/review/check-reasoning.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

const text = (record) => explainOpponent(record).paragraphs.at(-1);

test('the actual screenshot free-check explains a set versus a completed flush without seeing rival cards', () => {
  const { record } = phase3CheckSpot();
  assert.equal(record.action, 'check');
  assert.equal(record.trace.reason, 'free-check');
  const summary = text(record);
  assert.match(summary, /三张同花色.*两张该花色.*组成同花/);
  assert.match(summary, /同时持有 2 和 3/);
  assert.match(summary, /过牌避免主动扩大当前底池/);
  assert.match(summary, /葫芦或四条/);
  assert.doesNotMatch(summary, /再遇下注时|要结合金额、人数和此前行动/);
  assert.match(summary, /免费见到下一张/);
  assert.doesNotMatch(summary, /他已成同花|对手已经成同花|领先你现在/);
});

test('four-flush top pair cannot reuse the ordinary top-pair value paragraph', () => {
  const { record } = phase3CheckSpot('Ac Kd', 'Ah Qh 9h 3h', { reason: 'free-check' });
  const summary = text(record);
  assert.match(summary, /四张同花色.*一张该花色.*组成同花/);
  assert.doesNotMatch(summary, /仍可向较弱的一对或听牌取值/);
});

test('a four-connected board does not turn a set check into an unconditional value bet', () => {
  const { snapshot } = phase3CheckSpot('5c 5d', '5s 6d 7h 8c');
  const r = analyzeDecision(snapshot, { trials: 120, rolloutTrials: 12 });
  assert.equal(r.context.valuePlan.primary, null);
  assert.notEqual(r.code, 'value-check');
  assert.equal(r.alternative.action, 'check');
  assert.match(r.coaching.paragraphs.at(-1), /组成顺子/);
  assert.match(r.coaching.paragraphs.at(-1), /只需持有 4 \/ 9 中任意一张/);
  assert.doesNotMatch(r.coaching.paragraphs.at(-1), /这手建议.*(?:加注|下注)/);
});

test('dry strong checks explain the missed value while quads do not fear a flush', () => {
  const dry = phase3CheckSpot('5c 5d', 'Kh 9d 5s 2c', { reason: 'free-check' });
  assert.match(text(dry.record), /强成牌仍有向较弱成牌收取跟注的空间.*过牌可能少收一轮价值/);
  assert.doesNotMatch(text(dry.record), /若其常过回|再遇下注时/);
  assert.doesNotMatch(text(dry.record), /对手若持两张该花色/);
  const quads = phase3CheckSpot('5c 5d', '5s Qh Ah 5h', { reason: 'free-check' });
  assert.match(text(quads.record), /四条/);
  assert.doesNotMatch(text(quads.record), /用四条控池|同花.*领先|葫芦或四条.*领先/);
});

test('slowplay distinguishes an unacted opponent from a closing turn or river check', () => {
  for (const board of ['Kh 9d 5s 2c', 'Kh 9d 5s 2c 3h']) {
    const closing = phase3CheckSpot('5c 5d', board, { pending: false, reason: 'strong-trap' });
    const review = explainOpponent(closing.record);
    assert.equal(review.title, '强牌选择过牌');
    assert.match(text(closing.record), /最后行动.*不能诱导本轮下注/);
    assert.doesNotMatch(text(closing.record), /选择过牌，诱导对手主动下注/);
    if (board.split(' ').length === 5) assert.doesNotMatch(text(closing.record), /下一张/);
  }
  const pending = phase3CheckSpot('5c 5d', 'Kh 9d 5s 2c', { reason: 'strong-trap' });
  assert.match(text(pending.record), /后面还有玩家可以下注.*诱导/);
});

test('small flush warnings depend on possible higher flushes, not just the texture label', () => {
  const small = phase3CheckSpot('7h 8d', 'Ah Qh 5h 2h').snapshot;
  assert.match(checkRisks(small, decisionContext(small)).join(''), /更高的同花/);
  const nuts = phase3CheckSpot('Kh 8d', 'Ah Qh 5h 2h').snapshot;
  assert.doesNotMatch(checkRisks(nuts, decisionContext(nuts)).join(''), /更高的同花/);
  const boat = phase3CheckSpot('5c 5d', 'Ah Qh 5h As').snapshot;
  assert.doesNotMatch(checkRisks(boat, decisionContext(boat)).join(''), /同花.*领先/);
});

test('check explanations are invariant to hidden cards, future deck and final winners', () => {
  const { snapshot } = phase3CheckSpot();
  const before = checkReasoning(snapshot, decisionContext(snapshot));
  const changed = structuredClone(snapshot);
  changed.players[1].hole = ['secret'];
  changed.deck = ['future'];
  changed.winners = [0];
  changed.payouts = [999999];
  assert.deepEqual(checkReasoning(changed, decisionContext(changed)), before);
});

test('closing dangerous river checks never plan to respond to another bet', () => {
  const { record } = phase3CheckSpot('5c 5d', '5h Qh Ah 2h Tc', {
    pending: false,
    reason: 'free-check',
  });
  const summary = text(record);
  assert.match(summary, /过牌后直接摊牌/);
  assert.doesNotMatch(summary, /保留遇到下注|再遇下注时|下一张/);
});

test('dangerous made hands retain checking unless a concrete continuation supports betting', () => {
  for (const [hole, board] of [
    ['As Qd', 'Ah 8h 3h 2c'],
    ['7h 8d', 'Ah Qh 5h 2h'],
    ['5c 5d', '4d Qh Ah 5h'],
  ]) {
    const { snapshot } = phase3CheckSpot(hole, board);
    const r = analyzeDecision(snapshot, { trials: 120, rolloutTrials: 12 });
    assert.equal(r.code, 'dangerous-made-check');
    assert.equal(r.routes.primary.action, 'check');
    assert.equal(r.coaching.recommendedAction.action, 'check');
    assert.equal(r.routes.secondary.action, 'raise');
    assert.match(r.routes.secondary.condition, /有明确较弱跟注目标/);
  }
});

test('all causal check facts and titles display in every supported locale', async () => {
  const cases = [
    phase3CheckSpot(),
    phase3CheckSpot('5c 5d', '5s 6d 7h 8c'),
    phase3CheckSpot('7h 8d', 'Ah Qh 5h 2h'),
    phase3CheckSpot('5c 5d', '5h Qh Ah 2h Tc', { pending: false, reason: 'strong-trap' }),
    phase3CheckSpot('Ac Kd', 'Qd 8c 2h', { reason: 'pot-control' }),
  ];
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const { record, snapshot } of cases) {
      const review = explainOpponent(record);
      for (const source of [
        review.title,
        ...review.paragraphParts.flat(),
        ...checkReasoning(snapshot, decisionContext(snapshot)),
      ]) {
        const translated = localizeText(source);
        assert.doesNotMatch(translated, /\{\d+\}/, `${locale}: ${translated}`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
      }
    }
  }
});
