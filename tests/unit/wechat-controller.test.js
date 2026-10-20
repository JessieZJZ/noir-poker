import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { act, advanceStreet, legalActions, potSize } from '../../src/engine/poker.js';
import { createReviewInput, analyzeDecision } from '../../src/review/analysis.js';
import { BOT_THINK_LIMITS } from '../../src/engine/bot-timing.js';
import { checkedSeatGame } from '../fixtures/checked-actions.js';
import { tableHint } from '../../src/review/table-hint.js';

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
function setup(t, initial = {}, options = {}) {
  const timers = scheduler();
  const preferences = new Map([
    [
      'noir-wechat-settings-v1',
      JSON.stringify({
        playerCount: 6,
        hints: false,
        stakes: { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 },
        ...initial,
      }),
    ],
  ]);
  const snapshots = [];
  const sounds = [];
  const controller = createWechatController({
    ...options,
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

test('WeChat executes policy pacing once and hiding rejects stale bot callbacks', (t) => {
  const { controller, timers, latest } = setup(t);
  const game = reachHero(controller);
  controller.action('call');
  assert.ok(timers.runNext(), 'Paint task selects one bot plan');
  const waits = [...timers.pending.values()].filter(
    ({ delay }) => delay >= BOT_THINK_LIMITS.minimum && delay <= BOT_THINK_LIMITS.maximum,
  );
  assert.equal(waits.length, 1);
  const stale = timers.callbacks();
  controller.hide();
  const paused = copy(game);
  for (const callback of stale) callback();
  assert.deepEqual(game, paused);
  controller.show();
  while (game.botDecisions.length === 0) assert.ok(timers.runNext());
  assert.equal(game.botDecisions.length, 1);
  assert.equal(game.botDecisions[0].trace.thinking.model, 'policy-pacing-v2');
  assert.equal(game.botDecisions[0].trace.thinking.expedited, false);
  assert.ok(
    !JSON.stringify(latest()).includes('policy-pacing-v2'),
    'Live UI keeps private timing factors hidden',
  );
});

test('WeChat visual attention survives mute, cancels on sizing/hide/retry/destroy and publishes timer phases', (t) => {
  const { controller, timers, latest } = setup(t, { sound: false });
  const phases = [];
  // The view phase covers rendering; a separate publisher updates only the
  // decorative layer when timers fire, without rebuilding the table.
  const clock = scheduler();
  const adapter = createWechatController({
    publish: () => {},
    publishAttention: (phase) => phases.push(phase),
    schedule: clock.schedule,
    unschedule: clock.unschedule,
    storage: { getItem: () => JSON.stringify({ hints: false, sound: false }) },
  });
  t.after(() => adapter.destroy());
  adapter.start();
  reachHero(controller);
  assert.equal(latest().turnPhase, 'enter');
  controller.setRaise(controller.getGame().bigBlind * 4);
  assert.equal(latest().turnPhase, 'waiting');
  assert.ok(![...timers.pending.values()].some((job) => job.delay === 8000));
  controller.hide();
  assert.equal(latest().turnPhase, '');
  controller.show();
  assert.equal(latest().turnPhase, 'waiting');
  controller.retry();
  assert.ok(![...timers.pending.values()].some((job) => job.delay === 8000));

  reachHero(adapter);
  assert.equal(phases.at(-1), 'enter');
  adapter.show();
  assert.equal(phases.filter((phase) => phase === 'enter').length, 1);
  while (phases.at(-1) !== 'reminder') assert.ok(clock.runNext());
  assert.equal(phases.at(-1), 'reminder');
  const stale = clock.callbacks();
  adapter.destroy();
  stale.forEach((fn) => fn());
  assert.equal(phases.at(-1), '');
  assert.equal(clock.pending.size, 0);
});

function fakeReviewWorker() {
  return {
    stopped: 0,
    onMessage(callback) {
      this.receive = callback;
    },
    onProcessKilled(callback) {
      this.killed = callback;
    },
    postMessage(payload) {
      this.payload = payload;
    },
    terminate() {
      this.stopped++;
    },
  };
}
for (const transition of ['cancelReview', 'nextHand', 'retry', 'reset', 'hide', 'destroy']) {
  test(`WeChat ${transition} terminates active review workers and rejects late results`, (t) => {
    const worker = fakeReviewWorker();
    const { controller } = setup(t, {}, { createReviewWorker: () => worker });
    reachHero(controller);
    controller.action('fold');
    finish(controller.getGame(), 'fold');
    const updates = [];
    controller.review((value) => updates.push(value));
    assert.deepEqual(Object.keys(worker.payload), ['decisions']);
    assert.ok(worker.payload.decisions.length);
    for (const decision of worker.payload.decisions) {
      assert.equal('deck' in decision || 'outcome' in decision, false);
      assert.ok(decision.players.every((player) => !('hole' in player)));
    }
    controller[transition]();
    worker.receive({ type: 'step', index: 0, result: {} });
    worker.receive({ type: 'complete' });
    worker.killed();
    assert.equal(worker.stopped, 1);
    assert.equal(updates.length, 1);
  });
}
test('WeChat worker completion equals full fallback and a killed worker retains full-quality analysis', (t) => {
  const worker = fakeReviewWorker();
  const { controller, timers } = setup(t, {}, { createReviewWorker: () => worker });
  reachHero(controller);
  controller.action('fold');
  finish(controller.getGame(), 'fold');
  const updates = [];
  controller.review((value) => updates.push(value));
  const decision = worker.payload.decisions[0];
  const result = analyzeDecision(decision);
  worker.receive({ type: 'step', index: 0, result });
  worker.receive({ type: 'complete' });
  assert.equal(updates.at(-1).loading, false);
  const expected = copy(updates.at(-1));
  controller.review((value) => updates.push(value));
  worker.killed();
  for (let i = 0; updates.at(-1).loading; i++) {
    assert.ok(i < 10);
    assert.ok(timers.runNext());
  }
  assert.deepEqual(updates.at(-1), expected);
});
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

test('WeChat retains a completed check during subsequent thinking and clears it on the next street', (t) => {
  const { controller, latest } = setup(t, { playerCount: 9 });
  controller.hide();
  const game = controller.getGame();
  Object.assign(game, checkedSeatGame());
  game.players[1].action = '';
  game.players[1].lastAction = null;
  controller.show();
  const mia = () => latest().seats.find((seat) => seat.id === 1);
  assert.equal(mia().actionLabel, '过牌');
  assert.equal(latest().seats.find((seat) => seat.id === 2).actionLabel, '思考中');
  act(game, 2, 'raise', game.bigBlind);
  while (game.actor !== 1) {
    controller.show();
    assert.equal(mia().actionLabel, '过牌');
    act(game, game.actor, 'call');
  }
  controller.show();
  assert.equal(mia().actionLabel, '思考中');
  act(game, 1, 'call');
  controller.show();
  assert.equal(mia().actionLabel, '跟注');
  advanceStreet(game);
  controller.show();
  assert.equal(mia().actionLabel, '等待行动');
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
  assert.ok(snapshots.length > index, 'Fast finish publishes street boundaries like Web');
  const frames = snapshots.slice(index);
  assert.ok(frames.every((frame) => frame.done || frame.phase === 'between'));
  assert.ok(frames.every((frame) => frame.raiseTo === before.raiseTo));
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
  assert.equal(latest().hintText, tableHint(game));
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
  assert.equal(latest().hintText, tableHint(controller.getGame()));
});

test('WeChat mixed lineup persists ownership and manual selections survive cancellation', (t) => {
  const { controller, latest, preferences } = setup(t);
  controller.setSeatProfile(1, 'tan');
  controller.toggleMixedProfiles();
  assert.equal(latest().settings.mixed, true);
  assert.equal(latest().settings.assignments[1], 'tan');
  const auto = latest().settings.assignments[2];
  controller.setSeatProfile(2, auto);
  controller.toggleMixedProfiles();
  assert.equal(latest().settings.assignments[1], 'tan');
  assert.equal(latest().settings.assignments[2], auto);
  for (const id of [3, 4, 5]) assert.equal(latest().settings.assignments[id], 'balanced');
  assert.equal(JSON.parse(preferences.get('noir-wechat-settings-v1')).mixed, false);
});

test('WeChat retry, fast finish and sound re-enable use the Web cue sequence', (t) => {
  const { controller, timers, sounds } = setup(t);
  controller.setPreference('sound', false);
  controller.setPreference('sound', true);
  assert.equal(sounds.at(-1), 'deal');
  const game = reachHero(controller);
  controller.action('fold');
  const start = sounds.length;
  controller.finishHand();
  while (game.phase !== 'done') assert.ok(timers.runNext());
  assert.deepEqual(sounds.slice(start), ['win']);
  controller.retry();
  assert.equal(sounds.at(-1), 'deal');
});

test('WeChat queues requested blinds until next hand, retaining the original deal and scale on retry', (t) => {
  const { controller, timers, preferences, latest } = setup(t, {
    stakes: { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 },
  });
  const game = reachHero(controller);
  controller.hide();
  const before = copy(game);
  const originalCards = game.players.map((player) => player.hole.map((card) => card.key));
  const requested = { smallBlind: 500, bigBlind: 1000, startingStack: 100000, chipUnit: 500 };
  assert.equal(controller.requestSmallBlind('500'), true);
  assert.deepEqual(game, before, 'A valid edit cannot change the current hand');
  assert.deepEqual(JSON.parse(preferences.get('noir-wechat-settings-v1')).stakes, requested);
  assert.equal(latest().pendingStakes, true);
  assert.equal(latest().blindText, '100 / 200');
  assert.equal(latest().configuredSmallBlindText, '500');
  assert.equal(latest().configuredBigBlindText, '1K');
  assert.equal(latest().stakesNotice, '下一手起始盲注500/1K·筹码恢复为100K，统计重新开始');

  const persisted = preferences.get('noir-wechat-settings-v1');
  for (const invalid of ['', '0', '-25', '25.5', '100.0', '2.5K', '50025', '1e3', 'abc']) {
    assert.equal(controller.requestSmallBlind(invalid), false, invalid);
    assert.equal(latest().stakesError, '小盲只能输入25的正整数倍，且不超过50K。');
    assert.equal(preferences.get('noir-wechat-settings-v1'), persisted);
    assert.deepEqual(game, before);
  }
  assert.equal(controller.requestSmallBlind('500'), false, 'Repeated valid input is a no-op');
  assert.equal(latest().stakesError, '');
  assert.equal(preferences.get('noir-wechat-settings-v1'), persisted);
  controller.nextHand();
  assert.deepEqual(game, before, 'Next hand cannot run before settlement');

  finish(game);
  assert.equal(game.stats.hands, 1);
  controller.show();
  assert.equal(controller.retry(), true);
  const stale = timers.callbacks();
  assert.ok(stale.length > 0);
  controller.hide();
  assert.equal(game.smallBlind, 100);
  assert.equal(game.bigBlind, 200);
  assert.equal(game.chipUnit, 100);
  assert.equal(game.stats.hands, 0);
  assert.deepEqual(
    game.players.map((player) => player.hole.map((card) => card.key)),
    originalCards,
  );
  assert.deepEqual(controller.getSettings().stakes, requested);
  assert.equal(latest().pendingStakes, true);
  finish(game);
  controller.nextHand();
  const changed = controller.getGame();
  assert.notEqual(changed, game);
  assert.equal(changed.hand, 1);
  assert.deepEqual(changed.stakes, requested);
  assert.deepEqual(changed.stats, { hands: 0, wins: 0, buyin: 100000 });
  assert.ok(changed.players.every((player) => player.stack + player.total === 100000));
  assert.equal(
    changed.players.reduce((sum, player) => sum + player.stack, 0) + potSize(changed),
    600000,
  );
  assert.ok(
    changed.players.every((player) =>
      [player.stack, player.bet, player.total].every((amount) => amount % 500 === 0),
    ),
  );
  assert.equal(latest().pendingStakes, false);
  assert.equal(latest().stakesNotice, '');
  const state = JSON.stringify(changed);
  for (const callback of stale) callback();
  assert.equal(JSON.stringify(changed), state, 'Old work cannot mutate the restarted session');
});

test('WeChat accepts inclusive small-blind boundaries, restores queued preferences on a fresh session and can cancel a pending edit', (t) => {
  const { controller, preferences, latest } = setup(t);
  controller.hide();
  assert.equal(controller.requestSmallBlind('25'), false);
  assert.equal(controller.requestSmallBlind('50000'), true);
  assert.deepEqual(controller.getSettings().stakes, {
    smallBlind: 50000,
    bigBlind: 100000,
    startingStack: 10000000,
    chipUnit: 50000,
  });
  assert.equal(latest().stakesNotice, '下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始');
  const resumed = createWechatController({
    publish() {},
    storage: { getItem: (key) => preferences.get(key) },
    schedule: () => 1,
    unschedule() {},
  });
  t.after(() => resumed.destroy());
  resumed.start();
  assert.equal(resumed.getGame().smallBlind, 50000);
  assert.equal(resumed.getGame().players[0].stack, 10000000);
  assert.equal(controller.requestSmallBlind('25'), true);
  assert.equal(latest().pendingStakes, false);
  assert.equal(latest().stakesNotice, '');
  assert.equal(controller.setPreference('stakes', { smallBlind: 50, bigBlind: 100 }), true);
  assert.equal(controller.getGame().smallBlind, 25, 'Generic UI preference edits must also queue');
});

test('WeChat immediate stakes API retracts pending settings without resetting an already matching active game', (t) => {
  const { controller, preferences, latest } = setup(t, {
    stakes: { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 },
  });
  const game = reachHero(controller);
  controller.hide();
  assert.equal(controller.requestSmallBlind('500'), true);
  const before = copy(game);
  const queuedSettings = preferences.get('noir-wechat-settings-v1');
  for (const invalid of [
    { smallBlind: 0, bigBlind: 200 },
    { smallBlind: 100, bigBlind: 250 },
    { smallBlind: 50025, bigBlind: 100050 },
    { smallBlind: 100, bigBlind: 200, startingStack: 15000 },
  ]) {
    assert.equal(controller.setStakes(invalid), false);
    assert.equal(preferences.get('noir-wechat-settings-v1'), queuedSettings);
    assert.deepEqual(game, before);
  }
  assert.equal(controller.setStakes({ smallBlind: 100, bigBlind: 200 }), true);
  assert.equal(controller.getGame(), game);
  assert.deepEqual(
    game,
    before,
    'Retracting a queued change must preserve the current deal and statistics',
  );
  assert.equal(latest().pendingStakes, false);
  assert.equal(latest().stakesError, '');
  assert.deepEqual(JSON.parse(preferences.get('noir-wechat-settings-v1')).stakes, game.stakes);
  const saved = preferences.get('noir-wechat-settings-v1');
  assert.equal(controller.setStakes({ smallBlind: 100, bigBlind: 200 }), false);
  assert.equal(preferences.get('noir-wechat-settings-v1'), saved);
  assert.deepEqual(game, before);
});

test('WeChat records preserve retries, resume unfinished bankrolls, and open new sessions only on effective settings', (t) => {
  const { controller, preferences, latest } = setup(t);
  const game = reachHero(controller);
  const initialStacks = game.players.map((player) => player.stack + player.total);
  finish(game);
  controller.show();
  const first = controller.getRecords()[0];
  assert.equal(first.number, 1);
  assert.equal(latest().sessionNumber, 1);
  assert.equal(first.attempts[0].status, 'completed');
  const firstSnapshot = copy(first.attempts[0].snapshot);
  controller.requestSmallBlind(500);
  assert.equal(controller.retry(), true);
  assert.equal(controller.getRecords()[0].attempts[0].superseded, true);
  assert.deepEqual(controller.getRecord(first.attempts[0].id).snapshot, firstSnapshot);
  assert.equal(controller.getRecords()[0].completed, 0);
  controller.action('call');
  controller.destroy();
  const snapshots = [];
  const restored = createWechatController({
    publish: (view) => snapshots.push(view),
    storage: {
      getItem: (key) => preferences.get(key) ?? null,
      setItem: (key, value) => preferences.set(key, value),
    },
    schedule: () => 1,
    unschedule() {},
  });
  t.after(() => restored.destroy());
  // Resume returns the unfinished attempt's pre-blind bankroll before start().
  assert.deepEqual(
    restored.getGame().players.map((player) => player.stack),
    initialStacks,
  );
  assert.equal(restored.getGame().stats.hands, 0);
  const old = restored.getRecords()[0];
  assert.equal(old.attempts.at(-1).status, 'unfinished');
  restored.start();
  assert.equal(
    snapshots.at(-1).sessionNumber,
    2,
    'Pending blinds take effect at the resumed next hand',
  );
  assert.equal(restored.getGame().hand, 1);
  assert.equal(restored.getGame().smallBlind, 500);
  assert.equal(restored.getRecords()[1].attempts.length, 2);
});

test('WeChat history reviews an isolated settlement while the live game advances', (t) => {
  const { controller, latest } = setup(t);
  const game = reachHero(controller);
  finish(game);
  controller.show();
  const attempt = controller.getRecords()[0].attempts[0];
  const archived = copy(attempt.snapshot);
  const timers = scheduler();
  let historyView;
  const history = createWechatController({
    readOnlyAttempt: attempt,
    readOnlySessionNumber: 1,
    publish: (view) => (historyView = view),
    schedule: timers.schedule,
    unschedule: timers.unschedule,
  });
  t.after(() => history.destroy());
  history.show();
  controller.nextHand();
  const liveBefore = copy(controller.getGame());
  assert.equal(latest().hand, 2);
  assert.equal(historyView.hand, 1);
  assert.equal(historyView.historyReadOnly, true);
  assert.equal(history.retry(), false);
  assert.equal(history.action('fold'), false);
  assert.equal(history.finishHand(), false);
  history.reset();
  history.nextHand();
  assert.equal(history.setStakes({ smallBlind: 500, bigBlind: 1000 }), false);
  const updates = [];
  history.review((view) => updates.push(view));
  for (let count = 0; updates.at(-1)?.loading; count++) {
    assert.ok(count < 100);
    assert.ok(timers.runNext());
  }
  assert.ok(updates.length >= 2);
  assert.equal(updates.at(-1).hand, 1);
  assert.deepEqual(controller.getGame(), liveBefore);
  assert.deepEqual(history.getGame(), archived);
  assert.deepEqual(controller.getRecord(attempt.id).snapshot, archived);
});

test('WeChat relaunch continues the same session and rolls an incomplete hand back before the next deal', (t) => {
  const { controller, preferences } = setup(t);
  const game = reachHero(controller);
  const bankrolls = game.players.map((player) => player.stack + player.total);
  controller.action('call');
  const sessionId = controller.getRecords()[0].id;
  controller.destroy();
  let view;
  const resumed = createWechatController({
    publish: (value) => (view = value),
    storage: {
      getItem: (key) => preferences.get(key) ?? null,
      setItem: (key, value) => preferences.set(key, value),
    },
    schedule: () => 1,
    unschedule() {},
  });
  t.after(() => resumed.destroy());
  resumed.start();
  assert.equal(view.sessionNumber, 1);
  assert.equal(view.hand, 2);
  assert.equal(resumed.getRecords()[0].id, sessionId);
  assert.equal(resumed.getRecords()[0].attempts[0].status, 'unfinished');
  assert.deepEqual(
    resumed.getGame().players.map((player) => player.stack + player.total),
    bankrolls,
  );
  assert.deepEqual(resumed.getGame().stats, { hands: 0, wins: 0, buyin: 5000 });
});

test('WeChat records mark the first post-refill hand and exclude the virtual buy-in from its result', (t) => {
  const { controller } = setup(t);
  const game = reachHero(controller);
  finish(game);
  controller.show();
  game.players[1].stack += game.players[0].stack;
  game.players[0].stack = 0;
  controller.nextHand();
  assert.equal(controller.getRecords()[0].attempts.at(-1).refill, true);
  assert.equal(game.stats.buyin, 10000);
  finish(game);
  controller.show();
  const attempt = controller.getRecords()[0].attempts.at(-1);
  assert.equal(attempt.profit, game.payouts[0] - game.players[0].total);
  verifyChips(game, 7 * 5000);
});
