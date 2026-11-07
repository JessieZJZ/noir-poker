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
    loadTutorial: () => import('../../src/engine/tutorial.js'),
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

test('the WeChat table enters the tutorial, plays it and returns the live hand unchanged', async () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  const live = controller.getGame(),
    before = JSON.stringify(live),
    sessions = JSON.stringify(controller.getRecords());

  assert.equal(await controller.startTutorial(), true);
  assert.equal(controller.getGame(), live, 'The intro still shows the paused live table');
  assert.equal(page.timers.size, 0, 'Entering cancels the live table timers');
  assert.equal(last().tutorial.stage, 'intro');
  assert.equal(last().tutorialPlaying, false);
  assert.equal(last().tutorialActive, true, 'Back is taken from the intro card on');

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
  assert.equal(last().tutorialActive, false, 'Back belongs to the mini program again');
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

test('guided turns lock every control except the taught one', async () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  await controller.startTutorial();
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

test('a half-pot lesson unlocks the bet only after its preset is chosen', async () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  await controller.startTutorial();
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

test('tutorial bots stop on hide, resume on show and never reach the next hand after exit', async () => {
  const page = setup(),
    { controller, last } = page;
  controller.start();
  await controller.startTutorial();
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

test('reset, retry and next hand cannot touch the table during the tutorial', async () => {
  const page = setup(),
    { controller } = page;
  controller.start();
  await controller.startTutorial();
  controller.tutorialPrimary();
  const game = controller.getGame();
  for (const blocked of ['retry', 'reset', 'nextHand']) controller[blocked]();
  assert.equal(controller.setStakes({ smallBlind: 50, bigBlind: 100 }), false);
  assert.equal(controller.getGame(), game);
  assert.equal(legalActions(game, 0).enabled, false);
  assert.throws(() => act(game, 0, 'call'));
});

test('WXML keeps the hero label on one line because text nodes render their whitespace', async () => {
  const template = readFileSync(
    new URL('../../miniprogram/pages/table/table-surface.wxml', import.meta.url),
    'utf8',
  );
  assert.match(
    template,
    /><text>你<\/text\s*><text wx:if="{{!waitingForSeat}}" class="position">{{heroPosition}}<\/text>/,
  );
});

test('a missing tutorial subpackage leaves the live table playable and can be retried', async () => {
  let attempts = 0;
  const views = [];
  const controller = createWechatController({
    loadTutorial: async () => {
      if (++attempts === 1) throw Error('offline');
      return import('../../src/engine/tutorial.js');
    },
    publish: (view) => views.push(view),
    storage: { getItem: () => null, setItem() {} },
    schedule: () => 1,
    unschedule() {},
  });
  await assert.rejects(controller.startTutorial(), /offline/);
  assert.equal(views.at(-1)?.tutorial ?? null, null);
  assert.equal(await controller.startTutorial(), true);
  assert.equal(attempts, 2);
  assert.ok(views.at(-1).tutorial.dialog);
});

test('the mini-program panel follows Web: short phones, a side column on landscape tablets', () => {
  const template = readFileSync(
    new URL('../../miniprogram/pages/table/page-definition.js', import.meta.url),
    'utf8',
  );
  const [start, end] = [
    template.indexOf('const TUTORIAL_SIDE_WIDTH'),
    template.indexOf('// Match responsive chrome'),
  ];
  const coach = new Function(`${template.slice(start, end)}; return tutorialCoach;`)();
  const lesson = { tutorialPlaying: true, tutorial: { stage: 'lesson' } };
  const free = { tutorialPlaying: true, tutorial: { stage: 'free' } };
  assert.deepEqual(coach(390, 844, { tutorialPlaying: false }), {
    side: false,
    height: 0,
    width: 0,
    dockSaving: 0,
  });
  assert.equal(coach(390, 844, lesson).height, 186);
  assert.deepEqual(coach(360, 640, lesson), { side: false, height: 158, width: 0, dockSaving: 27 });
  assert.equal(coach(360, 640, free).dockSaving, 0);
  assert.equal(coach(820, 1180, lesson).side, false);
  assert.deepEqual(coach(1180, 820, lesson), {
    side: true,
    height: 0,
    width: 312,
    dockSaving: 0,
  });
  // A phone never takes the tablet layout, however its keyboard resizes it.
  assert.equal(coach(844, 390, lesson).side, false);
});

test('mini-program bots move on right after the player acts, and a settled hand puts Continue in the dock', async () => {
  const page = setup(),
    { controller, last, timers } = page;
  controller.start();
  await controller.startTutorial();
  controller.tutorialPrimary();
  while (last().tutorial.allowed?.action !== 'call') step(page);
  const turn = last().tutorial;
  assert.equal(controller.action('call'), true);
  // The call was the reply to a read message: no Continue stop, and the
  // opponents move at the scripted pace without leftover reading time.
  assert.equal(last().tutorial.canContinue, false);
  assert.equal(last().tutorial.text, turn.text);
  assert.equal(timers.size, 1);
  const [{ delay }] = timers.values();
  assert.equal(delay, 950, 'The opponents move at the scripted pace');
  while (last().tutorial.stage === 'lesson' && !last().tutorial.settled) step(page);
  assert.equal(last().done, true);
  assert.equal(last().tutorial.canContinue, true);
  const template = readFileSync(
    new URL('../../miniprogram/pages/table/table-surface.wxml', import.meta.url),
    'utf8',
  );
  assert.match(template, /wx:if="{{tutorial.canContinue && !tutorial.settled}}"/);
  assert.match(
    template,
    /class="settled-buttons"\s*><button\s+wx:if="{{tutorialPlaying && tutorial.canContinue && tutorial.settled}}"[^>]*bindtap="tutorialNext"/,
  );
  const actions = template.slice(template.indexOf('class="action-buttons"'));
  assert.ok(
    actions.indexOf('data-action="raise"') < actions.indexOf('data-action="fold"') &&
      actions.indexOf('data-action="fold"') < actions.indexOf('data-action="call"'),
    'Raise sits left of fold, as on Web',
  );
  const menu = template.slice(template.indexOf('class="resource-menu"'));
  assert.ok(menu.indexOf('openRecords') < menu.indexOf('openGuide'), 'Records lead the menu');
});
