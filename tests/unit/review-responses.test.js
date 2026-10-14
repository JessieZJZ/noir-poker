import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewInput, analyzeReview } from '../../src/review/analysis.js';
import { collectPublicResponses } from '../../src/review/responses.js';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { causalReraiseGame, heroValueGame, weakSuitedShove } from '../fixtures/review-spots.js';
import { cards } from '../fixtures/deceptive-decisions.js';

test('public responses replay only real same-street opponent actions after the matching hero action', () => {
  const game = causalReraiseGame();
  const input = createReviewInput(game);
  assert.equal(input.publicResponses.length, input.decisions.length);
  assert.ok(input.publicResponses[0].every((paragraph) => typeof paragraph === 'string'));
  const replay = input.publicResponses[0].join('');
  assert.match(replay, /Mia/);
  assert.match(replay, /4-bet/);
  assert.match(replay, /1,000/);
  assert.match(replay, /Alex.*弃牌/);
  assert.match(replay, /River.*950/);
  assert.match(replay, /Luna.*800/);
  assert.doesNotMatch(replay, /A[♦♥♣♠]|Q[♦♥♣♠]|翻牌|转牌|河牌|赢家|获胜|所以.*(?:合理|错误)/);
  assert.deepEqual(input.publicResponses[1], []);
});

test('public response changes, final cards and winners cannot change before-action grades or advice', () => {
  const input = createReviewInput(causalReraiseGame());
  const baseline = analyzeReview(input, { trials: 120, rolloutTrials: 12 }).steps;
  const changed = structuredClone(input);
  changed.publicResponses = input.decisions.map(() => ['Mia弃牌，River跟注 999,999。']);
  changed.outcome.profit = -99999;
  changed.outcome.board = cards('As Ks Qs Js Ts');
  changed.outcome.result = 'Mia获胜';
  changed.opponents[0].trace.view.hole = cards('As Ah');
  assert.deepEqual(analyzeReview(changed, { trials: 120, rolloutTrials: 12 }).steps, baseline);
  assert.ok(baseline.every((step) => !('publicResponses' in step.coaching)));
});

test('unknown, incomplete or mismatched final histories cannot invent an opponent response', () => {
  const game = causalReraiseGame();
  const identities = game.players.map(({ id, name }) => ({ id, name }));
  assert.deepEqual(collectPublicResponses(game.decisions, [], identities), [[], []]);
  assert.deepEqual(
    collectPublicResponses(game.decisions, game.history, identities, game.hand + 1),
    [[], []],
  );
  assert.deepEqual(collectPublicResponses([weakSuitedShove()], game.history, identities), [[]]);
  const wrong = structuredClone(game.history);
  wrong[3].amount = 400;
  assert.deepEqual(collectPublicResponses([game.decisions[0]], wrong, identities), [[]]);
  const earlier = structuredClone(game.history);
  earlier[2].amount = 225;
  assert.deepEqual(collectPublicResponses([game.decisions[0]], earlier, identities), [[]]);
  assert.deepEqual(
    collectPublicResponses([game.decisions[0]], game.history.slice(0, 4), identities),
    [[]],
  );
});

test('response replay uses public identity and action fields without reading other cards or later streets', () => {
  const game = causalReraiseGame();
  const before = collectPublicResponses(game.decisions, game.history, game.players);
  for (const player of game.players) {
    player.hole = cards('As Ah');
    player.winner = true;
  }
  for (const action of game.history.filter((action) => action.street > 0)) {
    action.amount = 99999;
    action.hiddenCards = cards('Ks Kh');
  }
  assert.deepEqual(collectPublicResponses(game.decisions, game.history, game.players), before);
});

test('WeChat transports public responses separately from the original reason and grade', () => {
  const queue = new Map();
  let ticket = 0;
  const controller = createWechatController({
    publish() {},
    storage: { getItem: () => null, setItem() {} },
    schedule(fn) {
      queue.set(++ticket, fn);
      return ticket;
    },
    unschedule(id) {
      queue.delete(id);
    },
  });
  try {
    controller.start();
    Object.assign(controller.getGame(), causalReraiseGame());
    let report;
    controller.review((value) => {
      report = value;
    });
    for (let count = 0; report.loading; count++) {
      assert.ok(count < 20);
      const [id, callback] = queue.entries().next().value;
      queue.delete(id);
      callback();
    }
    const hero = report.steps[0];
    assert.match(hero.publicResponses.join(''), /Mia.*1,000/);
    assert.match(hero.publicResponses.join(''), /River.*950/);
    assert.match(hero.publicResponses.join(''), /Luna.*800/);
    assert.ok(hero.publicResponses.every((paragraph) => hero.paragraphs.includes(paragraph)));
    assert.ok(hero.publicResponses.every((paragraph) => !hero.reason.includes(paragraph)));
    assert.deepEqual(report.steps[1].publicResponses, []);
    assert.equal(hero.ev, undefined);
    assert.equal(report.opponents[0].metrics, undefined);
    assert.doesNotMatch(
      report.opponents[0].reason,
      /它|EV|模型|模拟器|抽样|0\s*人(?:尚可|尚未|还可)行动/,
    );
  } finally {
    controller.destroy();
  }
});

test('common value fixtures use real legal chips, actual public responses and engine settlement', () => {
  for (const [kind, total] of [
    ['set-shove', 23000],
    ['aa-flat', 30000],
  ]) {
    const game = heroValueGame(kind);
    assert.equal(game.phase, 'done');
    assert.equal(
      game.players.reduce((sum, player) => sum + player.stack, 0),
      total,
    );
    assert.ok(game.players.every((player) => player.stack % 25 === 0));
    assert.ok(game.history.every((entry) => entry.amount % 25 === 0));
    const input = createReviewInput(game);
    if (kind === 'set-shove') {
      assert.equal(game.decisions[1].amount, 1000);
      assert.deepEqual(
        game.decisions[1].board.map((card) => card.key),
        cards('5h Ks 9c').map((card) => card.key),
      );
      assert.match(input.publicResponses[1].join(''), /Luna.*900/);
    } else {
      assert.equal(game.decisions[0].action, 'call');
      assert.equal(game.decisions[0].amount, 150);
      assert.match(input.publicResponses[0].join(''), /Mia.*弃牌/);
      assert.match(input.publicResponses[0].join(''), /Alex.*弃牌/);
    }
  }
});
