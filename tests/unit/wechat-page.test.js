import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { act, advanceStreet } from '../../src/engine/poker.js';

const pageSource = readFileSync(
  new URL('../../miniprogram/pages/table/table.js', import.meta.url),
  'utf8',
);
const stylesheet = readFileSync(
  new URL('../../miniprogram/pages/table/table.wxss', import.meta.url),
  'utf8',
);
const copy = (value) => JSON.parse(JSON.stringify(value));
function setup(
  t,
  {
    playerCount = 6,
    info = { windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 } },
  } = {},
) {
  let definition;
  let serial = 0;
  let now = 0;
  const jobs = new Map();
  const preferences = new Map([
    ['noir-wechat-settings-v1', JSON.stringify({ playerCount, hints: false })],
  ]);
  const audios = [];
  const toasts = [];
  const controllerFactory = (options) =>
    createWechatController({
      ...options,
      schedule(fn, delay = 0) {
        const id = ++serial;
        jobs.set(id, { fn, due: now + delay });
        return id;
      },
      unschedule(id) {
        jobs.delete(id);
      },
    });
  const context = vm.createContext({
    Page(value) {
      definition = value;
    },
    require(name) {
      assert.equal(name, '../../shared/platform/wechat-controller.js');
      return { createWechatController: controllerFactory };
    },
    wx: {
      getWindowInfo: () => info,
      getStorageSync: (key) => preferences.get(key),
      setStorageSync: (key, value) => preferences.set(key, value),
      showToast: (value) => toasts.push(value),
      createInnerAudioContext() {
        const audio = {
          src: '',
          played: false,
          stopped: false,
          destroyed: false,
          onEnded(fn) {
            this.end = fn;
          },
          onError(fn) {
            this.error = fn;
          },
          play() {
            this.played = true;
          },
          stop() {
            this.stopped = true;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        audios.push(audio);
        return audio;
      },
    },
  });
  vm.runInContext(pageSource, context);
  const page = {
    ...definition,
    data: copy(definition.data),
    setData(value) {
      Object.assign(this.data, copy(value));
    },
  };
  page.onLoad();
  t.after(() => page.onUnload());
  function flush() {
    for (let count = 0; jobs.size; count++) {
      assert.ok(count < 300, 'platform jobs must be bounded');
      const [id, job] = [...jobs].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      jobs.delete(id);
      now = job.due;
      job.fn();
    }
  }
  return { page, preferences, audios, toasts, flush, jobs, info };
}
function reachHero(page) {
  const game = page._controller.getGame();
  while (game.phase === 'playing' && game.actor !== 0) act(game, game.actor, 'call');
  page._controller.show();
  return game;
}
function finish(game) {
  for (let count = 0; game.phase !== 'done'; count++) {
    assert.ok(count < 150);
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, 'call');
  }
}
function text(value) {
  assert.equal(typeof value, 'string');
  assert.ok(value.trim());
  assert.ok(!value.includes('undefined'));
}

for (const playerCount of [5, 9]) {
  for (const info of [
    { windowWidth: 320, windowHeight: 568, statusBarHeight: 20, safeArea: { bottom: 568 } },
    { windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 } },
  ]) {
    test(`WeChat ${playerCount}-seat page reserves a stable first-screen table at ${info.windowWidth}x${info.windowHeight}`, (t) => {
      const { page } = setup(t, { playerCount, info });
      assert.equal(page.data.seats.length, playerCount - 1);
      assert.equal(page.data.windowHeight, info.windowHeight);
      assert.equal(
        page.data.tableHeight + page.data.topInset + page.data.bottomInset + 258,
        info.windowHeight,
      );
      const height = page.data.tableHeight;
      const game = reachHero(page);
      page.act({ currentTarget: { dataset: { action: 'fold' } } });
      finish(game);
      page._controller.show();
      assert.equal(page.data.done, true);
      assert.equal(page.data.tableHeight, height, 'fold or settlement cannot stretch the table');
      page.retryHand();
      assert.equal(page.data.done, false);
      assert.equal(page.data.tableHeight, height, 'retry cannot resize the table');
      assert.match(stylesheet, /\.action-dock\s*\{[^}]*flex:\s*0 0 136px/s);
    });
  }
}

test('WeChat Page presents completed shared review copy and per-decision advice', (t) => {
  const { page, flush, toasts } = setup(t);
  const game = reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  finish(game);
  page._controller.show();
  page.openReview();
  assert.equal(page.data.reviewOpen, true);
  assert.equal(page.data.reviewData.loading, true);
  flush();
  const report = page.data.reviewData;
  assert.equal(report.loading, false);
  assert.equal(report.hand, game.hand);
  for (const field of ['title', 'summary', 'scope', 'profit']) text(report[field]);
  assert.equal(report.steps.length, 1);
  for (const field of ['street', 'actual', 'label', 'suggestion', 'reason', 'followUp', 'ev'])
    text(report.steps[0][field]);
  assert.equal(report.steps[0].cards.length, 2);
  assert.equal(toasts.length, 0);
  page.closeReview();
  assert.equal(page.data.reviewOpen, false);
});

test('WeChat Page automatically saves settings and changes the requested next hand', (t) => {
  const { page, preferences } = setup(t);
  page.openSettings();
  page.changeSwitch({ currentTarget: { dataset: { key: 'sound' } }, detail: { value: false } });
  page.changeCount({ detail: { value: '4' } });
  page.changeDifficulty({ currentTarget: { dataset: { value: 'hard' } } });
  page.changeEmotion({ detail: { value: '2' } });
  page.changeSeat({ currentTarget: { dataset: { id: '1' } }, detail: { value: '1' } });
  const saved = JSON.parse(preferences.get('noir-wechat-settings-v1'));
  assert.equal(saved.sound, false);
  assert.equal(saved.playerCount, 9);
  assert.equal(saved.difficulty, 'hard');
  assert.equal(saved.emotionMode, 'lively');
  assert.equal(saved.assignments[1], 'tan');
  assert.equal(
    page._controller.getGame().players.length,
    6,
    'an active hand keeps its original table',
  );
  page.closeSettings();
  assert.equal(page.data.settingsOpen, false);
  const game = reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  finish(game);
  page._controller.show();
  page.nextHand();
  assert.equal(page.data.seats.length, 8);
  assert.equal(page.data.seats[0].profileId, 'tan');
  assert.equal(page.data.seats[0].portrait, '/assets/portraits/tan.jpg');
});

test('WeChat Page stops and destroys native audio plus pending work when backgrounded', (t) => {
  const { page, audios, jobs } = setup(t);
  assert.ok(audios.some((audio) => audio.src === '/assets/sounds/deal.wav' && audio.played));
  page.playSound('check');
  page.playSound('fold');
  assert.ok(audios.some((audio) => audio.src === '/assets/sounds/check.wav'));
  assert.ok(audios.some((audio) => audio.src === '/assets/sounds/fold.wav'));
  page.onHide();
  assert.equal(jobs.size, 0);
  assert.equal(page._audio.length, 0);
  assert.ok(audios.every((audio) => audio.stopped && audio.destroyed));
  page.onShow();
  assert.ok(jobs.size > 0, 'foreground resumes a fresh bot schedule');
});
