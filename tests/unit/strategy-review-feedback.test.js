import test from 'node:test';
import assert from 'node:assert/strict';
import { strategyRiver, strategyRiverGame } from '../fixtures/strategy-review.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext, drawInfo } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import { checkRisks } from '../../src/review/check-reasoning.js';
import { closedDrawChance } from '../../src/review/strategy-facts.js';
import { evaluate, compare, botDecision } from '../../src/engine/poker.js';
import { explainOpponent } from '../../src/review/opponents.js';
const analyze = (s) => analyzeDecision(s, { trials: 12, rolloutTrials: 2 });
test('a locked royal board proves the closing split-call without an opponent range', () => {
  for (const action of ['call', 'fold']) {
    const s = strategyRiver({ action }),
      r = analyze(s),
      text = r.coaching.explanation;
    assert.equal(r.context.guaranteedBoard.minimum, 3100);
    assert.equal(r.context.guaranteedBoard.cost, 1200);
    assert.equal(r.coaching.recommendedAction.action, 'call');
    assert.equal(r.coaching.label, action === 'call' ? '值得保留' : '跟注');
    assert.match(text, /至少可分回 3.1K.*成本为 1.2K/);
    assert.doesNotMatch(text, /需要结合这条下注线|需要比较是否值得|对手.*组成更大/);
    assert.equal(r.simulation, null);
  }
});
test('a non-nut shared board or pending decision cannot reuse a guaranteed split', () => {
  const vulnerable = strategyRiver({ board: '9s Ts Js Qs Ks' }); // an opponent As beats the board.
  assert.equal(analyze(vulnerable).context.guaranteedBoard, null);
  const pending = strategyRiver();
  pending.players[2].folded = false;
  pending.pending.push(2);
  assert.equal(analyze(pending).context.guaranteedBoard, null);
});
test('the private kicker is distinguished from shared higher public kickers', () => {
  const s = strategyRiver({ hole: 'Ac Qd', board: 'As Kh 2c 7d 9s' });
  assert.match(decisionContext(s).handLabel, /底牌 Q 参与踢脚比较/);
  s.hole = cards('Ac 2d');
  s.board = cards('As Kh Qc Jd 9s');
  assert.match(decisionContext(s).handLabel, /踢脚来自公共牌 K \/ Q \/ J/);
});
test('an ace-high flush can fear a straight flush, but cannot fear a higher ordinary flush', () => {
  const s = strategyRiver({ hole: 'Ah Ad', board: 'Jh Th 9h 2h 2d' }),
    c = decisionContext(s);
  assert.equal(evaluate([...s.board, ...cards('Kh Qh')]).score[0], 8);
  assert.equal(compare(evaluate([...s.board, ...cards('Kh Qh')]).score, c.made.score), 1);
  const text = checkRisks(s, c).join('');
  assert.match(text, /同花顺/);
  assert.match(text, /葫芦或四条/);
  assert.doesNotMatch(text, /更高的同花/);
});
test('flop all-in candidate-card appearance uses both remaining cards, not next-card odds', () => {
  const s = { street: 1, hole: cards('Ah 5h'), board: cards('Kh Qh 2c') };
  const draw = drawInfo(s.hole, s.board);
  assert.equal(draw.outs, 9);
  assert.equal(draw.nextChance, 9 / 47);
  assert.ok(Math.abs(closedDrawChance(s, draw) - (1 - (38 * 37) / (47 * 46))) < 1e-12);
});
test('a paired flush board never invents a straight as a value-paying made hand', () => {
  const s = strategyRiver({ hole: 'Ah 5h', board: 'Kh Qh 2h 2s 3d', action: 'raise' });
  s.amount = 3700;
  const r = analyze(s);
  assert.equal(r.context.matchups.weakerMadeCategories.includes(4), false);
  assert.doesNotMatch(r.coaching.paragraphs.at(-1), /领先更低同花或顺子/);
});

test('the guaranteed split bound is paid by the actual engine and conserves chips at both stake boundaries', () => {
  for (const unit of [25, 100, 10000, 50000]) {
    const { game: g, snapshot: s } = strategyRiverGame({ smallBlind: unit });
    const r = analyze(s);
    assert.equal(g.phase, 'done');
    assert.ok(g.payouts[0] >= r.context.guaranteedBoard.minimum);
    assert.equal(
      g.players.reduce((sum, p) => sum + p.stack, 0),
      5 * g.stakes.startingStack,
    );
    for (const p of g.players) assert.equal(p.stack % unit, 0);
  }
});

test('A2 keeps a weak side card while public cards replace it in the actual best five', () => {
  const turn = strategyRiver({ hole: 'As 2d', board: 'Ad Ts 8h 7s' });
  turn.street = 2;
  assert.match(decisionContext(turn).handLabel, /踢脚来自公共牌 10 \/ 8 \/ 7/);
  const river = strategyRiver({ hole: 'As 2d', board: 'Ad Ts 8h 7s 8d' });
  const c = decisionContext(river);
  assert.deepEqual(c.made.score, [2, 14, 8, 10]);
  assert.doesNotMatch(c.handLabel, /2 踢脚/);
  assert.doesNotMatch(checkRisks(river, c).join(''), /同花/);
  assert.equal(handMatchups(river, c).strongerMadeCategories.includes(5), false);
});

test('opponent review keeps folded blinds in the engine call price at both stake boundaries', () => {
  for (const unit of [25, 100, 50000]) {
    const { game } = strategyRiverGame({ smallBlind: unit, action: null });
    const d = botDecision(game, () => 0.4);
    const v = d.trace.view;
    assert.equal(v.callPrice.cost, 12 * unit);
    assert.equal(v.callPrice.contestable, 63 * unit);
    assert.ok(v.opponents.every((p) => !p.folded));
    assert.ok(v.opponents.reduce((sum, p) => sum + p.total, v.total) < v.pot);
    const r = explainOpponent({
      id: v.id,
      name: 'Alex',
      action: 'fold',
      amount: 0,
      trace: { ...d.trace, reasonSource: 'scripted-action-only' },
    });
    assert.match(r.detail, /当前保本门槛为 19.0%/);
    assert.doesNotMatch(r.detail, /当前保本门槛为 20.0%/);
  }
});
