import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewInput, analyzeReview } from '../../src/review/analysis.js';
import { selectedActivity, reviewActivity } from '../../src/review/activity.js';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { causalReraiseGame, heroValueGame } from '../fixtures/review-spots.js';
import { cards } from '../fixtures/deceptive-decisions.js';

test('completed activity keeps chronology and highlights all actor actions plus the selected action', () => {
  const game = causalReraiseGame(),
    input = createReviewInput(game);
  const hero = selectedActivity(input, 0, input.decisions[0].history.length + 1);
  assert.equal(input.publicResponses, undefined);
  assert.equal(
    hero.filter((event) => event.emphasized && event.sequence).length,
    input.decisions.length,
  );
  assert.equal(hero.filter((event) => event.current).length, 1);
  assert.match(hero.find((event) => event.current).text, /加注|raise/);
  const opponent = input.opponents[0];
  const events = selectedActivity(input, opponent.id, opponent.sequence);
  assert.equal(events.filter((event) => event.current).length, 1);
  assert.ok(
    events.filter((event) => event.emphasized).every((event) => event.player === opponent.id),
  );
  assert.equal(selectedActivity(input, null).filter((event) => event.emphasized).length, 0);
  assert.match(events.map((event) => event.text).join(''), /Mia.*1K/);
  assert.match(events.map((event) => event.text).join(''), /River.*950/);
  assert.deepEqual(
    events.filter((event) => event.sequence).map((event) => event.sequence),
    game.history.map((_, index) => index + 1),
  );
});

test('later activity, final cards, opponent holes and winners cannot change before-action grades or advice', () => {
  const input = createReviewInput(causalReraiseGame());
  const baseline = analyzeReview(input, { trials: 120, rolloutTrials: 12 }).steps;
  const changed = structuredClone(input);
  changed.activity = [{ text: 'Mia wins 999999 with AA', player: 1, key: 0 }];
  changed.outcome.profit = -99999;
  changed.outcome.board = cards('As Ks Qs Js Ts');
  changed.outcome.result = 'Mia wins';
  changed.opponents[0].trace.view.hole = cards('As Ah');
  assert.deepEqual(analyzeReview(changed, { trials: 120, rolloutTrials: 12 }).steps, baseline);
});

test('legacy records recover only known public actions without reading hole cards', () => {
  const game = causalReraiseGame();
  const events = reviewActivity({ history: game.history, players: game.players });
  game.players.forEach((p) =>
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('hidden cards');
      },
    }),
  );
  assert.deepEqual(reviewActivity({ history: game.history, players: game.players }), events);
  const legacy = { decisions: game.decisions };
  const known = selectedActivity(legacy, 0);
  assert.equal(known.length, game.decisions.at(-1).history.length);
});

test('WeChat sends one separate chronology and computes opponent explanations lazily without lowering hero analysis quality', () => {
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
    const game = causalReraiseGame();
    Object.assign(controller.getGame(), game);
    let report;
    controller.review((value) => {
      report = value;
    });
    for (let count = 0; report.loading; count++) {
      assert.ok(count < 30);
      const [id, fn] = queue.entries().next().value;
      queue.delete(id);
      fn();
    }
    assert.deepEqual(
      report.activity.map(({ emphasized, current, ...event }) => event),
      reviewActivity(game),
    );
    assert.equal(report.steps[0].publicResponses, undefined);
    assert.equal(report.opponents[0].analyzed, false);
    const explanation = controller.reviewOpponent(0);
    assert.equal(explanation, controller.reviewOpponent(0));
    assert.ok(explanation.reason);
    assert.equal(explanation.metrics, undefined);
    assert.equal(
      report.steps[0].reason,
      analyzeReview(createReviewInput(game)).steps[0].coaching.explanation,
    );
    controller.cancelReview();
    assert.equal(controller.reviewOpponent(0), null);
  } finally {
    controller.destroy();
  }
});

test('value fixtures settle with whole chips and immutable activity after practice runout', () => {
  for (const [kind, total] of [
    ['set-shove', 23000],
    ['aa-flat', 30000],
  ]) {
    const game = heroValueGame(kind);
    assert.equal(game.phase, 'done');
    assert.equal(
      game.players.reduce((sum, p) => sum + p.stack, 0),
      total,
    );
    assert.ok(game.players.every((p) => p.stack % 25 === 0));
    assert.ok(game.history.every((entry) => entry.amount % 25 === 0));
    const input = createReviewInput(game);
    assert.ok(input.activity.length > input.decisions.length);
    assert.ok(!input.decisions.some((decision) => 'activity' in decision));
  }
});
