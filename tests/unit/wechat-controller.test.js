import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { act, advanceStreet, legalActions, potSize } from '../../src/engine/poker.js';
import { createReviewInput } from '../../src/review/analysis.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
function scheduler() {
  let sequence = 0;
  let now = 0;
  const pending = new Map();
  return {
    pending,
    schedule(fn, delay) {
      const id = ++sequence;
      pending.set(id, { fn, delay, due: now + delay });
      return id;
    },
    unschedule(id) {
      pending.delete(id);
    },
    runNext() {
      const selected = [...pending].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!selected) return false;
      const [id, job] = selected;
      pending.delete(id);
      now = job.due;
      job.fn();
      return true;
    },
    callbacks: () => [...pending.values()].map((job) => job.fn),
  };
}
function setup(t, initial = {}) {
  const timers = scheduler();
  const preferences = new Map([
    ['noir-wechat-settings-v1', JSON.stringify({ playerCount: 6, hints: false, ...initial })],
  ]);
  const snapshots = [];
  const sounds = [];
  const controller = createWechatController({
    publish: (data) => snapshots.push(copy(data)),
    storage: {
      getItem: (key) => preferences.get(key) ?? null,
      setItem: (key, value) => preferences.set(key, value),
    },
    sound: (name) => sounds.push(name),
    schedule: timers.schedule,
    unschedule: timers.unschedule,
  });
  t.after(() => controller.destroy());
  controller.start();
  return { controller, timers, preferences, sounds, snapshots, latest: () => snapshots.at(-1) };
}
function reachHero(controller) {
  const game = controller.getGame();
  let limit = 0;
  while (game.phase === 'playing' && game.actor !== 0) {
    assert.ok(++limit < 20);
    act(game, game.actor, 'call');
  }
  assert.equal(game.actor, 0);
  controller.show();
  return game;
}
function finish(game, action = 'call') {
  let limit = 0;
  while (game.phase !== 'done') {
    assert.ok(++limit < 150);
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, action);
  }
}
function originalState(game) {
  const result = copy(game);
  delete result.logs;
  delete result.replayAttempt;
  return result;
}
function verifyChips(game, total) {
  const amounts = [
    game.currentBet,
    game.minRaise,
    ...game.players.flatMap((player) => [player.stack, player.bet, player.total]),
    ...game.history.map((entry) => entry.amount),
    ...game.payouts,
    ...game.refunds.map((refund) => refund.amount),
    ...game.pots.flatMap((pot) => [pot.amount, ...pot.awards.map((award) => award.amount)]),
  ];
  for (const amount of amounts)
    assert.ok(Number.isSafeInteger(amount) && amount >= 0 && amount % 25 === 0, String(amount));
  const money = game.players.reduce((sum, player) => sum + player.stack, 0);
  assert.equal(money + (game.phase === 'done' ? 0 : potSize(game)), total);
}

for (const playerCount of [5, 9]) {
  test(`WeChat ${playerCount}-seat raises, presets, calls and settlement preserve whole chips`, (t) => {
    const { controller, latest } = setup(t, { playerCount });
    const game = reachHero(controller);
    assert.equal(latest().seats.length, playerCount - 1);
    assert.equal(latest().heroPosition, 'BTN');
    for (const preset of ['min', 'half', 'pot', 'all']) {
      controller.preset(preset);
      assert.equal(latest().raiseTo % 25, 0);
      const legal = legalActions(game, 0);
      assert.ok(latest().raiseTo >= legal.minRaiseTo && latest().raiseTo <= legal.maxRaiseTo);
    }
    controller.setRaise(656);
    assert.equal(latest().raiseTo, 650);
    assert.equal(controller.action('raise'), true);
    verifyChips(game, playerCount * 5000);
    finish(game);
    verifyChips(game, playerCount * 5000);
    assert.equal(game.stats.hands, 1);
  });

  test(`WeChat ${playerCount}-seat all-in automatically deals all streets and settles`, (t) => {
    const { controller, timers } = setup(t, { playerCount });
    const game = reachHero(controller);
    controller.preset('all');
    controller.action('raise');
    while (game.phase === 'playing') act(game, game.actor, 'call');
    assert.equal(game.phase, 'between');
    // Calls above were applied directly through the real engine to guarantee a
    // multiway runout; discard the controller's older pending bot plan first.
    controller.hide();
    controller.show();
    for (let steps = 0; game.phase !== 'done'; steps++) {
      assert.ok(steps < 15, 'runout must finish instead of leaving the app between streets');
      assert.ok(timers.runNext(), 'every between-street transition needs a scheduled engine step');
      verifyChips(game, playerCount * 5000);
    }
    assert.equal(game.board.length, 5);
    assert.equal(game.stats.hands, 1);
  });
}

test('WeChat difficulty applies immediately; profiles, emotions and seats auto-save for the next hand', (t) => {
  const { controller, timers, preferences } = setup(t, { playerCount: 9 });
  const game = controller.getGame();
  const stale = timers.callbacks();
  controller.setPreference('difficulty', 'hard');
  assert.equal(game.difficulty, 'hard');
  for (const callback of stale) callback();
  assert.equal(game.history.length, 0);
  controller.setSeatProfile(1, 'tan');
  controller.setPreference('emotionMode', 'lively');
  controller.setPreference('playerCount', 5);
  assert.equal(game.players[1].botProfile, 'balanced');
  assert.equal(game.emotionMode, 'subtle');
  assert.equal(game.players.length, 9);
  const saved = JSON.parse(preferences.get('noir-wechat-settings-v1'));
  assert.equal(saved.assignments[1], 'tan');
  assert.equal(saved.emotionMode, 'lively');
  assert.equal(saved.playerCount, 5);
  finish(game, 'fold');
  controller.nextHand();
  const next = controller.getGame();
  assert.equal(next.players.length, 5);
  assert.equal(next.players[1].botProfile, 'tan');
  assert.equal(next.emotionMode, 'lively');
  assert.equal(next.difficulty, 'hard');
});

test('WeChat new streets clear previous calls and raises while retaining global folds', (t) => {
  const { controller, latest } = setup(t);
  const game = controller.getGame();
  act(game, game.actor, 'fold');
  const folded = 3;
  reachHero(controller);
  controller.action('call');
  while (game.phase === 'playing') act(game, game.actor, 'call');
  assert.equal(game.phase, 'between');
  assert.match(game.players[0].lastAction.text, /跟注/);
  advanceStreet(game);
  controller.show();
  assert.equal(latest().heroAction, '');
  assert.equal(latest().seats.find((seat) => seat.id === folded).action, '弃牌');
  for (const seat of latest().seats.filter((entry) => !entry.folded))
    assert.doesNotMatch(seat.action, /跟注|加注|小盲|大盲/);
});

test('WeChat a free call is a check and plays the distinct table-knock effect', (t) => {
  const { controller, sounds } = setup(t);
  const game = reachHero(controller);
  controller.action('call');
  while (game.phase === 'playing') act(game, game.actor, 'call');
  advanceStreet(game);
  while (game.actor !== 0) act(game, game.actor, 'check');
  controller.show();
  assert.equal(legalActions(game, 0).canCheck, true);
  controller.action('call');
  assert.equal(game.decisions.at(-1).action, 'check');
  assert.equal(sounds.at(-1), 'check');
});

test('WeChat finish-hand fast-forward handles all-in streets and keeps one settlement', (t) => {
  const { controller, timers, latest } = setup(t);
  const game = reachHero(controller);
  controller.preset('all');
  controller.action('raise');
  while (game.phase === 'playing') act(game, game.actor, 'call');
  controller.finishHand();
  for (let step = 0; game.phase !== 'done'; step++) {
    assert.ok(step < 15);
    assert.ok(timers.runNext());
  }
  assert.equal(game.board.length, 5);
  assert.equal(game.stats.hands, 1);
  assert.equal(latest().done, true);
  verifyChips(game, 30000);
  const settled = copy(game);
  controller.finishHand();
  assert.deepEqual(game, settled);
});

test('WeChat freezes slider bounds while bots think and one fast finish publishes the complete board', (t) => {
  const { controller, timers, latest, snapshots } = setup(t);
  const game = reachHero(controller);
  controller.preset('half');
  const before = latest();
  controller.action('raise');
  const waiting = latest();
  assert.equal(waiting.canAct, false);
  for (const key of ['minRaise', 'maxRaise', 'raiseTo', 'callLabel', 'callText'])
    assert.equal(waiting[key], before[key]);
  while (game.phase !== 'done' && !(game.phase === 'playing' && game.actor === 0)) {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, 'call');
  }
  controller.show();
  controller.action('fold');
  const index = snapshots.length;
  assert.equal(controller.finishHand(), true);
  while (!latest().done) {
    assert.ok([...timers.pending.values()].some((job) => job.delay === 0));
    assert.ok(timers.runNext());
  }
  assert.equal(snapshots.length, index + 1, 'No intermediate streets repaint during fast finish');
  assert.equal((game.practiceBoard || game.board).length, 5);
  assert.equal(game.stats.hands, 1);
  verifyChips(game, 30000);
});

test('WeChat retry restores original private deal and retracts awards/statistics exactly once', (t) => {
  const { controller } = setup(t);
  const game = controller.getGame();
  const baseline = originalState(game);
  reachHero(controller);
  controller.preset('all');
  controller.action('raise');
  finish(game, 'fold');
  assert.equal(game.stats.hands, 1);
  assert.ok(game.players[0].stack > baseline.players[0].stack);
  controller.setSeatProfile(1, 'dwan');
  controller.setPreference('emotionMode', 'lively');
  assert.equal(controller.retry(), true);
  assert.deepEqual(originalState(game), baseline);
  assert.equal(game.replayAttempt, 1);
  assert.equal(game.stats.hands, 0);
  verifyChips(game, 30000);
  const restored = copy(game);
  assert.equal(controller.retry(), false);
  assert.deepEqual(game, restored);
  assert.equal(game.players[1].botProfile, 'balanced');
  assert.equal(game.emotionMode, 'subtle');
  assert.equal(controller.getSettings().assignments[1], 'dwan');
});

test('WeChat hide and destroy reject already queued bot callbacks; show resumes cleanly', (t) => {
  const { controller, timers } = setup(t);
  assert.equal(timers.runNext(), true); // Plan computation, before the delayed action.
  const delayed = timers.callbacks();
  const before = copy(controller.getGame());
  controller.hide();
  assert.equal(timers.pending.size, 0);
  for (const callback of delayed) callback();
  assert.deepEqual(controller.getGame(), before);
  controller.show();
  assert.equal(timers.runNext(), true);
  assert.equal(timers.runNext(), true);
  assert.equal(controller.getGame().history.length, 1);
  const stillQueued = timers.callbacks();
  const stopped = copy(controller.getGame());
  controller.destroy();
  for (const callback of stillQueued) callback();
  controller.show();
  assert.equal(controller.action('fold'), false);
  assert.equal(timers.pending.size, 0);
  assert.deepEqual(controller.getGame(), stopped);
});

for (const transition of ['nextHand', 'retry', 'reset', 'hide', 'destroy']) {
  test(`WeChat ${transition} cancels queued review and bot work`, (t) => {
    const { controller, timers } = setup(t);
    const staleBot = timers.callbacks();
    reachHero(controller);
    controller.action('fold');
    finish(controller.getGame(), 'fold');
    const reports = [];
    controller.review((report) => reports.push(report));
    assert.equal(reports.length, 1);
    assert.equal(reports[0].loading, true);
    const staleReview = timers.callbacks();
    controller[transition]();
    const after = copy(controller.getGame());
    for (const callback of [...staleBot, ...staleReview]) callback();
    assert.equal(reports.length, 1, 'a cancelled analysis must never publish a final report');
    assert.deepEqual(controller.getGame(), after);
  });
}

test('WeChat review grades only the public before-action snapshot and keeps it detached', (t) => {
  const { controller, timers } = setup(t);
  const game = reachHero(controller);
  const before = { board: copy(game.board), hole: copy(game.players[0].hole), pot: potSize(game) };
  controller.action('fold');
  const decision = copy(game.decisions[0]);
  assert.deepEqual(decision.board, before.board);
  assert.deepEqual(decision.hole, before.hole);
  assert.equal(decision.pot, before.pot);
  assert.equal(
    decision.history.some((entry) => entry.id === 0),
    false,
  );
  assert.equal('deck' in decision, false);
  assert.equal('winners' in decision, false);
  assert.equal(
    decision.players.some((player) => 'hole' in player || 'cards' in player),
    false,
  );
  finish(game, 'fold');
  const reviewInput = createReviewInput(game);
  game.deck.length = 0;
  game.players[1].hole[0].rank = 99;
  assert.deepEqual(reviewInput.decisions[0], decision);
  assert.deepEqual(game.decisions[0], decision);
  const reports = [];
  controller.review((report) => reports.push(report));
  for (let step = 0; reports.at(-1).loading; step++) {
    assert.ok(step < 10);
    assert.ok(timers.runNext());
  }
  const report = reports.at(-1);
  assert.equal(report.steps.length, 1);
  assert.deepEqual(report.steps[0].board, []);
  assert.deepEqual(
    report.steps[0].cards.map((card) => card.key),
    before.hole.map((card) => card.key),
  );
  assert.equal('title' in report, false);
  assert.equal('summary' in report, false);
  assert.ok(report.steps[0].suggestion);
});

test('fresh WeChat settings use five players and publish disabled controls before the hero turn', (t) => {
  const snapshots = [];
  const controller = createWechatController({
    publish: (data) => snapshots.push(copy(data)),
    storage: { getItem: () => null, setItem() {} },
    schedule: () => 1,
    unschedule() {},
  });
  t.after(() => controller.destroy());
  controller.start();
  assert.equal(controller.getGame().players.length, 5);
  assert.equal(snapshots.at(-1).settings.playerCount, 5);
  assert.equal(snapshots.at(-1).canAct, false);
});

test('Chinese table hints match Web prices and stale timers cannot clear a new decision hint', (t) => {
  const { controller, timers, latest } = setup(t, { hints: true });
  const game = reachHero(controller);
  game.players[0].hole = [
    { rank: 14, suit: 0, symbol: '♠', key: '0-14' },
    { rank: 14, suit: 1, symbol: '♥', key: '1-14' },
  ];
  controller.setPreference('hints', false);
  controller.setPreference('hints', true);
  assert.equal(
    latest().hintText,
    '口袋对子有成三条的潜力；面对大额加注，先考虑跟注成本。 跟注占可争夺底池约 18%。',
  );
  const old = Array.from(timers.pending.values()).find((job) => job.delay === 24000).fn;
  controller.hide();
  assert.equal(latest().hintText, '');
  controller.retry();
  reachHero(controller);
  controller.setPreference('hints', false);
  controller.setPreference('hints', true);
  const current = latest().hintText;
  assert.ok(current);
  old();
  assert.equal(latest().hintText, current);
  finish(controller.getGame(), 'fold');
  controller.show();
  assert.ok(latest().hintText.startsWith('复盘本手') || latest().hintText.startsWith('回看弃牌'));
});
