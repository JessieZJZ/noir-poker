import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { act, legalActions } from '../../src/engine/poker.js';

function setup() {
  const views = [],
    timers = new Map(),
    sounds = [],
    wagers = [];
  let nextTimer = 1;
  const store = new Map();
  const controller = createWechatController({
    publish: (view) => views.push(view),
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    },
    sound: (name) => sounds.push(name),
    wager: (id) => wagers.push(id),
    schedule(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    unschedule: (id) => timers.delete(id),
  });
  const drain = (limit = 1) => {
    for (let i = 0; i < limit && timers.size; i++) {
      const [id, { callback }] = timers.entries().next().value;
      timers.delete(id);
      callback();
    }
  };
  return { controller, views, timers, sounds, wagers, drain, last: () => views.at(-1) };
}

// Walks the guided script using only the page's own controller calls.
function step({ controller, drain, last }) {
  const coach = last().tutorial;
  if (coach.options.length) {
    for (const option of coach.options) if (controller.tutorialAnswer(option.index)) break;
    controller.tutorialNext();
  } else if (coach.canContinue) controller.tutorialNext();
  else if (coach.allowed?.action === 'finish') controller.finishHand();
  else if (coach.allowed?.action === 'none') drain();
  else {
    if (coach.allowed.preset) controller.preset(coach.allowed.preset);
    controller.action(coach.allowed.action === 'check' ? 'call' : coach.allowed.action);
  }
}

test('the WeChat table enters the tutorial, plays it and returns the live hand unchanged', () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  const live = controller.getGame(),
    before = JSON.stringify(live),
    sessions = JSON.stringify(controller.getRecords());

  assert.equal(controller.startTutorial(), true);
  assert.equal(controller.getGame(), live, 'The intro still shows the paused live table');
  assert.equal(page.timers.size, 0, 'Entering cancels the live table timers');
  assert.equal(last().tutorial.stage, 'intro');
  assert.equal(last().tutorialPlaying, false);

  controller.tutorialPrimary();
  const lesson = controller.getGame();
  assert.notEqual(lesson, live);
  assert.equal(last().tutorialPlaying, true);
  assert.equal(last().hintText, '');
  assert.equal(last().canRetry, false);
  assert.deepEqual(
    last().heroCards.map((card) => card.rank + card.suit),
    ['10♥', '9♥'],
  );

  for (let guard = 0; last().tutorial.stage === 'lesson'; guard++) {
    assert.ok(guard < 100);
    step(page);
  }
  assert.equal(last().tutorial.stage, 'summary');
  assert.equal(lesson.phase, 'done');
  assert.ok(page.wagers.includes(0), 'Hero chips fly to the pot as usual');
  assert.ok(
    page.wagers.some((id) => id > 0),
    'Scripted bets fly to the pot as usual',
  );

  assert.equal(controller.exitTutorial(), true);
  assert.equal(controller.getGame(), live);
  assert.equal(JSON.stringify(live), before);
  assert.equal(
    JSON.stringify(controller.getRecords()),
    sessions,
    'Tutorial hands are not recorded',
  );
  assert.equal(last().tutorial, null);
  assert.equal(last().tutorialPlaying, false);
});

test('guided turns lock every control except the taught one', () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  controller.startTutorial();
  controller.tutorialPrimary();
  while (last().tutorial.allowed?.action !== 'call') {
    if (last().tutorial.canContinue) controller.tutorialNext();
    else page.drain();
  }
  const game = controller.getGame();
  assert.deepEqual(
    [last().lockFold, last().lockCall, last().lockRaise, last().lockSizing, last().lockHalf],
    [true, false, true, true, true],
  );
  assert.equal(controller.action('fold'), false);
  assert.equal(game.players[0].folded, false);
  const raiseTo = last().raiseTo;
  controller.setRaise(game.bigBlind * 10);
  assert.equal(last().raiseTo, raiseTo, 'The slider cannot leave the script');
  assert.equal(controller.action('call'), true);
});

test('a half-pot lesson unlocks the bet only after its preset is chosen', () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  controller.startTutorial();
  controller.tutorialPrimary();
  while (last().tutorial.allowed?.action !== 'raise') step(page);
  const { raiseTarget, allowed } = last().tutorial;
  assert.equal(allowed.preset, 'half');
  assert.equal(last().lockHalf, false);
  assert.equal(last().lockSizing, true);
  const before = last().raiseTo;
  controller.preset('pot');
  assert.equal(last().raiseTo, before, 'Other sizes stay out of the lesson');
  controller.preset('half');
  assert.equal(last().raiseTo, raiseTarget);
  assert.equal(last().lockRaise, false);
  assert.equal(controller.action('raise'), true);
});

test('tutorial bots stop on hide, resume on show and never reach the next hand after exit', () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  controller.startTutorial();
  controller.tutorialPrimary();
  while (!page.timers.size) step(page);
  const game = controller.getGame(),
    actions = game.history.length;
  controller.hide();
  assert.equal(page.timers.size, 0);
  controller.show();
  assert.equal(page.timers.size, 1);
  page.drain();
  assert.equal(game.history.length, actions + 1);
  controller.exitTutorial();
  page.drain(20);
  assert.equal(game.history.length, actions + 1, 'A stale tutorial timer cannot act');
  assert.equal(last().tutorialPlaying, false);
});

test('reset, retry and next hand cannot touch the table during the tutorial', () => {
  const page = setup(),
    { controller } = page;
  controller.start();
  controller.startTutorial();
  controller.tutorialPrimary();
  const game = controller.getGame();
  for (const blocked of ['retry', 'reset', 'nextHand']) controller[blocked]();
  assert.equal(controller.setStakes({ smallBlind: 50, bigBlind: 100 }), false);
  assert.equal(controller.getGame(), game);
  assert.equal(legalActions(game, 0).enabled, false);
  assert.throws(() => act(game, 0, 'call'));
});

test('WXML keeps the hero label on one line because text nodes render their whitespace', () => {
  const template = readFileSync(
    new URL('../../miniprogram/pages/table/table.wxml', import.meta.url),
    'utf8',
  );
  assert.match(template, /<text>你 <text class="position">{{heroPosition}}<\/text><\/text/);
});
