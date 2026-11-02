import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { foldPressure, foldWinNote } from '../../src/review/presentation.js';
import { allInPressureSnapshot, cheapMiddlePairRaise } from '../fixtures/review-sidepots.js';
import { cards } from '../fixtures/deceptive-decisions.js';

const options = { trials: 120, rolloutTrials: 4 };
const decisionText = (r) => r.coaching.paragraphs.at(-1);
const noWholePotPromise = (text) => {
  assert.match(text, /已全下者参与的底池仍需摊牌/);
  assert.doesNotMatch(
    text,
    /需要开池者.*都放弃|对手弃牌可直接拿池|对手弃牌就拿走|想让所有人都弃牌/,
  );
};
function opponentRecord(s, reason, deception) {
  const { players, ...view } = s;
  return {
    id: 0,
    name: 'River',
    action: s.action,
    amount: s.amount,
    trace: {
      profile: 'balanced',
      mode: 'off',
      reason,
      deception,
      view: {
        ...view,
        id: 0,
        inPosition: true,
        rivals: players.filter((p) => p.id && !p.folded).length,
        features: decisionContext(s).features,
        opponents: players.filter((p) => p.id && !p.folded),
      },
    },
  };
}

test('an all-in opener cannot be squeezed out and a proposed raise is not an existing side pot', () => {
  const s = allInPressureSnapshot({ preflop: true });
  assert.deepEqual(foldPressure(s), {
    hasAllInOpponent: true,
    foldableCount: 3,
    hasContestableSidePot: false,
  });
  const r = analyzeDecision(s, options),
    text = decisionText(r);
  noWholePotPromise(text);
  assert.doesNotMatch(text, /边池/);
  assert.match(r.routes.primary.tradeoff, /仍需摊牌/);
});

test('a flop semi-bluff cannot immediately win the pot shared with an all-in player', () => {
  const s = allInPressureSnapshot(),
    r = analyzeDecision(s, options),
    text = decisionText(r);
  assert.equal(s.pot, 1800);
  assert.equal(foldPressure(s).hasContestableSidePot, false);
  assert.match(text, /半诈唬.*同花听牌|同花听牌.*半诈唬/);
  noWholePotPromise(text);
  assert.doesNotMatch(text, /边池/);
});

test('only matched public contributions can establish a contestable side pot', () => {
  const s = allInPressureSnapshot({ sidePot: true });
  assert.equal(foldPressure(s).hasContestableSidePot, true);
  assert.match(foldWinNote(s), /已有的边池.*已全下者参与的底池仍需摊牌/);
  noWholePotPromise(decisionText(analyzeDecision(s, options)));
  assert.match(decisionText(analyzeDecision(s, options)), /已有的边池/);
});

test('fold pressure uses public ledgers, ignores folded all-ins and has no targets when all are committed', () => {
  const s = allInPressureSnapshot();
  for (const p of s.players)
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('hidden cards must not be read');
      },
    });
  assert.equal(foldPressure(s).hasAllInOpponent, true);
  s.players[3].folded = true;
  assert.equal(foldPressure(s).hasAllInOpponent, false);
  s.players[3].folded = false;
  s.players[4].folded = true;
  assert.equal(foldPressure(s).foldableCount, 0);
  assert.match(foldWinNote(s), /没有可施压弃牌的目标/);
});

test('ordinary semi-bluffs retain their immediate fold-win explanation without an all-in opponent', () => {
  const s = allInPressureSnapshot({ allIn: false });
  assert.equal(foldWinNote(s), '');
  assert.match(decisionText(analyzeDecision(s, options)), /对手(?:全部)?弃牌可直接拿池/);
});

test('opponent bluff, semi-bluff and donk explanations distinguish the shared pot and existing side pots', () => {
  for (const sidePot of [false, true]) {
    const s = allInPressureSnapshot({ sidePot });
    for (const reason of ['semi-bluff', 'pure-bluff', 'donk-lead']) {
      const r = explainOpponent(opponentRecord(s, reason, { kind: 'semi-bluff' })),
        text = r.paragraphs.at(-1);
      noWholePotPromise(text);
      assert.equal(text.includes('已有的边池'), sidePot);
      if (reason === 'donk-lead' && !sidePot) {
        assert.equal(r.title, '主动下注');
        assert.doesNotMatch(text, /前一街进攻者还没行动/);
      }
    }
  }
});

test('an affordable middle pair can be called without presenting a raise as necessary', () => {
  const s = cheapMiddlePairRaise(),
    r = analyzeDecision(s, options),
    text = decisionText(r);
  assert.equal(r.context.handClass, 'middle-pair');
  assert.equal(r.alternative.action, 'call');
  assert.equal(r.alternative.amount, 200);
  assert.match(text, /已有.*跟注只需 200.*11.8%/);
  assert.match(text, /边缘成牌.*大加注.*范围更紧/);
  assert.doesNotMatch(text, /跟注.*有正收益/);
});

test('river nuts compare value sizes without warning about a nonexistent larger hand', () => {
  const s = allInPressureSnapshot({ allIn: false });
  Object.assign(s, {
    hole: cards('Ad Th'),
    board: cards('4d Ks 6d Qc Jh'),
    street: 3,
    action: 'check',
    amount: 0,
    stack: 1200,
  });
  s.players[0].stack = 1200;
  s.legal.maxRaiseTo = 1200;
  const r = analyzeDecision(s, options);
  assert.equal(r.context.matchups.nut, true);
  assert.match(r.coaching.followUp, /河牌最大成牌.*弱牌是否愿意支付全下.*较小尺度/);
  assert.doesNotMatch(r.coaching.followUp, /留意更大/);
  s.action = 'raise';
  s.amount = 200;
  const small = analyzeDecision(s, options);
  assert.equal(small.coaching.suggestedAction, '下注至 200');
  assert.doesNotMatch(small.coaching.followUp, /比较价值全下/);
});

test('short-stack small-pair flats and weak late limps need independent continuation support', () => {
  const cases = JSON.parse(
      readFileSync(new URL('../fixtures/review-priced-flats.json', import.meta.url), 'utf8'),
    ),
    expensive = cases.expensiveSmallPair.snapshot;
  const flat = analyzeDecision(expensive, options);
  assert.equal(flat.code, 'costly-small-pair-flat');
  assert.equal(flat.alternative.action, 'fold');
  assert.notEqual(flat.coaching.assessmentLabel, '值得保留');

  const limp = cases.weakLateLimp.snapshot;
  const weak = analyzeDecision(limp, options);
  assert.equal(weak.code, 'weak-late-limp');
  assert.equal(weak.routes.primary.action, 'fold');
  assert.equal(weak.routes.secondary.action, 'raise');
  assert.equal(weak.routes.secondary.amount, 50000);
  assert.match(weak.routes.secondary.condition, /只有已有公开行动显示盲位过度弃牌/);
  assert.notEqual(weak.coaching.assessmentLabel, '值得保留');
});
