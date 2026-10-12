import { compactTableLayout } from '../../src/ui/compact-table-layout.js';
import { renderCardArtwork } from '../../src/ui/cards.js';
import { railLayout } from '../../src/ui/rail-layout.js';
import { PROFILE_PORTRAITS } from '../../src/ui/portraits.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import {
  act,
  advanceStreet,
  completeBoardForPractice,
  rankText,
  evaluate,
} from '../../src/engine/poker.js';

const pageSource = readFileSync(
  new URL('../../miniprogram/pages/table/table.js', import.meta.url),
  'utf8',
);
const stylesheet = readFileSync(
  new URL('../../miniprogram/pages/table/table.wxss', import.meta.url),
  'utf8',
);
const template = readFileSync(
  new URL('../../miniprogram/pages/table/table.wxml', import.meta.url),
  'utf8',
);
const copy = (value) => JSON.parse(JSON.stringify(value));
const presentationModule = { exports: {} };
vm.runInNewContext(
  readFileSync(new URL('../../miniprogram/pages/table/presentation.js', import.meta.url), 'utf8'),
  {
    module: presentationModule,
    require: (name) =>
      name.endsWith('/cards.js') ? { renderCardArtwork } : { evaluate, rankText },
  },
);
function setup(
  t,
  {
    playerCount = 6,
    info = { windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 } },
    menuRect,
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
  const vibrations = [];
  const toasts = [];
  const clipboard = [];
  const navigations = [],
    scrolls = [];
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
      if (name === '../../assets/portraits/credits.js')
        return Object.fromEntries(
          Object.entries(PROFILE_PORTRAITS).map(([id, image]) => [
            id,
            { label: image.credit, url: image.source },
          ]),
        );
      if (name === './presentation.js') return presentationModule.exports;
      if (name === './phone-layout.js') return { phoneLayout: compactTableLayout };
      if (name === '../../shared/engine/poker.js')
        return { completeBoardForPractice, rankText, evaluate };
      assert.equal(name, '../../shared/platform/wechat-controller.js');
      return { createWechatController: controllerFactory };
    },
    wx: {
      getWindowInfo: () => info,
      ...(menuRect === undefined
        ? {}
        : {
            getMenuButtonBoundingClientRect:
              typeof menuRect === 'function' ? menuRect : () => menuRect,
          }),
      getStorageSync: (key) => preferences.get(key),
      setStorageSync: (key, value) => preferences.set(key, value),
      showToast: (value) => toasts.push(value),
      setClipboardData: (value) => clipboard.push(value.data),
      navigateTo: (value) => navigations.push(value.url),
      pageScrollTo: (value) => scrolls.push(value.scrollTop),
      vibrateShort(options) {
        vibrations.push(options.type);
      },
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
    setData(value, callback) {
      Object.assign(this.data, copy(value));
      callback?.();
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
  return {
    page,
    preferences,
    audios,
    vibrations,
    toasts,
    clipboard,
    navigations,
    scrolls,
    flush,
    jobs,
    info,
    wx: context.wx,
  };
}

test('measuring the pot sheet cannot change the table pot row or public-card placement', (t) => {
  const { page, wx } = setup(t);
  const before = copy({
    potHeight: page.data.potHeight,
    publicTop: page.data.publicTop,
    slots: page.data.boardSlots,
  });
  wx.createSelectorQuery = () => {
    let measured;
    const query = {
      select(selector) {
        assert.equal(selector, '.pot-sheet .sheet-body');
        return query;
      },
      boundingClientRect(callback) {
        measured = callback;
        return query;
      },
      exec() {
        measured({ height: 420 });
      },
    };
    return query;
  };
  page.openPots();
  assert.equal(page.data.potSheetHeight, 422);
  assert.deepEqual(
    copy({
      potHeight: page.data.potHeight,
      publicTop: page.data.publicTop,
      slots: page.data.boardSlots,
    }),
    before,
  );
  page.closePots();
  assert.equal(page.data.potHeight, before.potHeight);
});

test('WeChat activity retains full hand history, bet ordinals and Web persona labels', (t) => {
  const { page } = setup(t);
  const game = page._controller.getGame();
  const player = game.players[1];
  player.botProfile = 'haxton';
  game.logs = Array.from({ length: 41 }, (_, index) => ({
    text: `${player.name} 3-bet 加注至 ${200 + index * 25}`,
    player: player.id,
    type: index === 0 ? 'result' : 'action',
  })).reverse();
  page._controller.show();
  assert.equal(page.data.logs.length, 41, 'Long hands must not drop records after 30 actions');
  assert.match(page.data.logs[0].text, /3-bet 加注至 200/);
  assert.match(page.data.logs[0].text, /（.*）/);
  assert.equal(page.data.logs[0].type, 'result');
  assert.equal(page.data.logs.at(-1).hero, false);
});

test('real engine logs read from hand start to settlement in the displayed activity', (t) => {
  let seed = 0x12345678;
  t.mock.method(Math, 'random', () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const { page, flush } = setup(t);
  flush();
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  flush();
  assert.match(page.data.logs[0].text, /^第 1 手开始/);
  assert.ok(page.data.done);
  assert.deepEqual(
    page.data.logs.map((entry) => entry.text),
    page._controller
      .getGame()
      .logs.slice()
      .reverse()
      .map((entry) => entry.text),
  );
  const resultIndex = page.data.logs.findIndex((entry) => entry.type === 'result');
  assert.ok(resultIndex > page.data.logs.findLastIndex((entry) => entry.type === 'action'));
  // A losing bot may publish its synthetic mood after the awards. Those
  // post-settlement records also retain their actual chronological position.
  assert.ok(
    page.data.logs.slice(resultIndex).every((entry) => ['result', 'info'].includes(entry.type)),
  );
  assert.equal(page.data.logs[0].key, 0);
});

test('WeChat ranks sit 3px below the final painted action line, including wrapped chip amounts', (t) => {
  const { page, wx } = setup(t);
  page.data.arenaScale = 0.5;
  const words = [
    { dataset: { id: 1 }, top: 100, height: 15 },
    { dataset: { id: 1 }, top: 120, height: 16 },
    { dataset: { id: 2 }, top: 140, height: 13 },
  ];
  const ranks = [
    { dataset: { id: 1 }, top: 150 },
    { dataset: { id: 2 }, top: 170 },
  ];
  wx.createSelectorQuery = () => {
    const selectors = [];
    const query = {
      selectAll(selector) {
        selectors.push(selector);
        return query;
      },
      fields() {
        return query;
      },
      exec(callback) {
        callback(
          selectors.map((selector) =>
            selector === '.seat-action-word'
              ? words
              : selector === '.seat-rank-slot .rank'
                ? ranks
                : [],
          ),
        );
      },
    };
    return query;
  };
  page.tightenSeatRanks();
  assert.equal(page.data['phoneSeats[0].rankLift'], -25);
  assert.equal(page.data['phoneSeats[1].rankLift'], -31);
  // Large all-in captions can need a small downward adjustment as well.
  ranks[0].top = 136;
  page.tightenSeatRanks();
  assert.equal(page.data['phoneSeats[0].rankLift'], 3);
});

test('retry and next hand remount every deal while ordinary turns preserve the hero card nodes', (t) => {
  const { page } = setup(t);
  const heroKeys = copy(page.data.heroCards).map((card) => card.dealKey);
  const backKeys = copy(page.data.phoneSeats).flatMap((seat) =>
    seat.backCards.map((card) => card.key),
  );
  page._controller.show();
  assert.deepEqual(
    copy(page.data.heroCards).map((card) => card.dealKey),
    heroKeys,
  );
  finish(page._controller.getGame());
  page._controller.show();
  page.retryHand();
  assert.notDeepEqual(
    copy(page.data.heroCards).map((card) => card.dealKey),
    heroKeys,
  );
  assert.notDeepEqual(
    copy(page.data.phoneSeats).flatMap((seat) => seat.backCards.map((card) => card.key)),
    backKeys,
  );
  assert.match(template, /wx:key="dealKey"/);
  assert.match(template, /420 \+ index \* 130/);
  assert.match(template, /class="card-back back-deal"/);
  const retryKeys = copy(page.data.heroCards).map((card) => card.dealKey);
  finish(page._controller.getGame());
  page._controller.show();
  page.nextHand();
  assert.notDeepEqual(
    copy(page.data.heroCards).map((card) => card.dealKey),
    retryKeys,
  );
});

test('practice runout preserves Web rank visibility without modifying the engine deal or payouts', (t) => {
  const { page, flush } = setup(t);
  flush();
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  flush();
  const game = page._controller.getGame();
  const before = JSON.stringify({
    board: game.board,
    deck: game.deck,
    stats: game.stats,
    winners: game.winners,
  });
  page.finishHand();
  assert.equal(page.data.boardSlots.filter((card) => !card.empty).length, 5);
  assert.equal(
    page.data.heroRank,
    game.board.length === 5 && (game.revealed || game.showdown)
      ? evaluate([...game.players[0].hole, ...game.board]).label
      : '',
  );
  assert.ok(page.data.heroCards.every((card) => !card.best));
  assert.equal(
    JSON.stringify({
      board: game.board,
      deck: game.deck,
      stats: game.stats,
      winners: game.winners,
    }),
    before,
  );
});

test('secondary pages lock the home scroll and source titles navigate to a separate web page', (t) => {
  const { page, scrolls, navigations, audios } = setup(t);
  assert.equal(audios.length, 6, 'All local effects are preloaded on entry');
  assert.ok(audios.every((audio) => audio.volume === 1));
  page.onPageScroll({ scrollTop: 240 });
  for (const [open, close] of [
    ['openSettings', 'closeSettings'],
    ['openGuide', 'closeGuide'],
    ['openPots', 'closePots'],
    ['openActivity', 'closeActivity'],
  ]) {
    page[open]();
    assert.equal(page.data.homeLocked, true);
    assert.equal(page.data.homeOffset, -240);
    page.onPageScroll({ scrollTop: 0 });
    page[close]();
    assert.equal(page.data.homeLocked, false);
    assert.equal(scrolls.at(-1), 240);
  }
  page.openSettings();
  page.viewProfile({ currentTarget: { dataset: { id: 'tan' } } });
  const url = page.data.detailProfile.sources[0].url;
  page.openResearchSource({ currentTarget: { dataset: { url } } });
  assert.equal(navigations.at(-1), `/pages/source/source?url=${encodeURIComponent(url)}`);
  page.openResearchSource({ currentTarget: { dataset: { url: 'https://example.com/' } } });
  assert.equal(navigations.length, 1);
});

test('public flips stagger only newly dealt cards and details preserve their slots and anchors', (t) => {
  const { page } = setup(t);
  const game = reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'call' } } });
  while (game.phase === 'playing') act(game, game.actor, 'call');
  advanceStreet(game);
  page._controller.show();
  assert.deepEqual(
    copy(page.data.board).map((card) => card.dealDelay),
    [0, 140, 280],
  );
  const top = page.data.publicTop;
  page.openPots();
  const keys = copy(page.data.boardSlots).map((card) => card.key);
  page.closePots();
  assert.deepEqual(
    copy(page.data.boardSlots).map((card) => card.key),
    keys,
  );
  while (game.phase === 'playing') act(game, game.actor, 'check');
  advanceStreet(game);
  page._controller.show();
  assert.deepEqual(
    copy(page.data.board).map((card) => card.arriving),
    [true, true, true, true],
  );
  assert.equal(page.data.board[3].dealDelay, 0);
  assert.equal(page.data.publicTop, top);
});

test('WeChat tablet rotation preserves the deal, settings dialog and pending actions', (t) => {
  const { page, info, jobs } = setup(t, {
    info: { windowWidth: 820, windowHeight: 1180, statusBarHeight: 24 },
  });
  page.openSettings();
  const hand = page.data.hand;
  const cards = copy(page.data.heroCards);
  const pending = [...jobs.keys()];
  for (const size of [
    { windowWidth: 1180, windowHeight: 820 },
    { windowWidth: 820, windowHeight: 1180 },
  ]) {
    Object.assign(info, size);
    page.onResize();
    assert.equal(page.data.windowWidth, size.windowWidth);
    assert.equal(page.data.windowHeight, size.windowHeight);
    assert.equal(page.data.hand, hand);
    assert.deepEqual(copy(page.data.heroCards), cards);
    assert.equal(page.data.settingsOpen, true);
    assert.deepEqual([...jobs.keys()], pending);
    assert.ok(page.data.tableHeight > 0);
  }
});
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
test('WeChat practice runout uses the shared engine without changing settlement or review cards', (t) => {
  const { page } = setup(t, { playerCount: 5 });
  const game = reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  for (let step = 0; game.phase !== 'done'; step++) {
    assert.ok(step < 20);
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, 'fold');
  }
  page._controller.show();
  assert.equal(page.data.canPracticeRunout, true);
  assert.equal(page.data.canRetry, true);
  assert.match(template, /wx:if="{{canRetry}}"\s+class="retry-button"/);
  assert.doesNotMatch(template, /wx:if="{{!canPracticeRunout}}"\s+class="retry-button"/);
  const before = copy({
    board: game.board,
    deck: game.deck,
    stats: game.stats,
    winners: game.winners,
    stacks: game.players.map((p) => p.stack),
  });
  page.finishHand();
  assert.equal(page.data.board.length, 5);
  assert.equal(page.data.canPracticeRunout, false);
  assert.deepEqual(
    copy({
      board: game.board,
      deck: game.deck,
      stats: game.stats,
      winners: game.winners,
      stacks: game.players.map((p) => p.stack),
    }),
    before,
  );
  assert.deepEqual(
    copy(page.data.board.map((c) => c.red)),
    game.practiceBoard.map((c) => c.suit === 1 || c.suit === 3),
  );
});
test('WeChat opponent review picker filters recorded actions and restores the full timeline', (t) => {
  const { page } = setup(t);
  page.setData({ reviewPerspective: 'opponent' });
  const report = {
    steps: [],
    opponents: [
      { name: 'Alex', actual: '跟注' },
      { name: 'River', actual: '加注' },
      { name: 'Alex', actual: '弃牌' },
    ],
  };
  page.updateReview(report);
  page.changeOpponentFilter({ detail: { value: '1' } });
  assert.equal(page.data.reviewSteps.length, 2);
  assert.ok(page.data.reviewSteps.every((step) => step.name === 'Alex'));
  page.changeOpponentFilter({ detail: { value: '0' } });
  assert.equal(page.data.reviewSteps.length, 3);
});
function text(value) {
  assert.equal(typeof value, 'string');
  assert.ok(value.trim());
  assert.ok(!value.includes('undefined'));
}

test('WeChat turn, fold, settlement and retry keep live geometry and preserve the table while compact controls collapse', (t) => {
  assert.match(template, /class="action-notice" wx:if="\{\{!compactActions\}\}"/);
  assert.match(template, /class="raise-controls" wx:if="\{\{!compactActions\}\}"/);
  assert.equal(
    cssNumber('.settled-buttons button', 'width'),
    100,
    'WeChat native button width must follow its grid cell instead of the platform default',
  );
  assert.equal(cssNumber('.settled-buttons button', 'min-width'), 0);
  const { page } = setup(t, { playerCount: 9 });
  const game = reachHero(page);
  const height = page.data.tableHeight;
  assert.equal(page.data.canAct, true);
  assert.equal(page.data.compactActions, false);
  assert.equal(page.data.heroStatus, undefined);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  assert.equal(page.data.canAct, false);
  assert.equal(page.data.heroFolded, true);
  assert.equal(page.data.compactActions, true);
  assert.equal(page.data.tableHeight, height);
  finish(game);
  page._controller.show();
  assert.equal(page.data.done, true);
  assert.equal(page.data.compactActions, true);
  assert.equal(page.data.tableHeight, height);
  page.retryHand();
  assert.equal(page.data.compactActions, false);
  assert.equal(page.data.tableHeight, height);
});

test('WeChat all-in waits retain the disabled Web action dock until settlement', (t) => {
  const { page } = setup(t);
  reachHero(page);
  page.preset({ currentTarget: { dataset: { preset: 'all' } } });
  page.act({ currentTarget: { dataset: { action: 'raise' } } });
  assert.equal(page.data.heroAllin, true);
  assert.equal(page.data.canAct, false);
  assert.equal(page.data.compactActions, false);
});

for (const playerCount of [5, 9]) {
  for (const info of [
    { windowWidth: 320, windowHeight: 568, statusBarHeight: 20, safeArea: { bottom: 568 } },
    { windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 } },
  ]) {
    test(`WeChat ${playerCount}-seat page fills its first-screen table at ${info.windowWidth}x${info.windowHeight}`, (t) => {
      const { page } = setup(t, { playerCount, info });
      assert.equal(page.data.seats.length, playerCount - 1);
      assert.equal(page.data.windowHeight, info.windowHeight);
      assert.equal(
        page.data.tableHeight + page.data.topInset + page.data.bottomInset + 321,
        info.windowHeight,
      );
      const height = page.data.tableHeight;
      const game = reachHero(page);
      page.act({ currentTarget: { dataset: { action: 'fold' } } });
      finish(game);
      page._controller.show();
      assert.equal(page.data.done, true);
      assert.equal(page.data.tableHeight, height, 'settlement must preserve the live table budget');
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
  for (const field of ['scope', 'profit']) text(report[field]);
  assert.equal('summary' in report, false);
  assert.doesNotMatch(template, /review-summary|reviewData\.summary|reviewData\.title/);
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
  assert.equal(page.data.activePlayerCount, 6);
  assert.notEqual(page.data.settings.playerCount, page.data.activePlayerCount);
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
  assert.equal(page.data.activePlayerCount, page.data.settings.playerCount);
  assert.equal(page.data.seats[0].profileId, 'tan');
  assert.equal(page.data.seats[0].portrait, '/assets/portraits/tan.jpg');
});

test('WeChat Page stops and destroys native audio plus pending work when backgrounded', (t) => {
  const { page, audios, jobs } = setup(t);
  assert.ok(
    audios.every((audio) => !audio.played),
    'Never replay startup audio before a gesture',
  );
  page.call('setPreference', 'sound', false);
  page.call('setPreference', 'sound', true);
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

test('WeChat reserves a capsule row above the Web navigation and settings', (t) => {
  const { page } = setup(t);
  assert.equal(page.data.compactNav, false);
  assert.match(template, /padding-top: \{\{topInset \+ 36\}\}px/);
  assert.match(template, /class="modal settings-modal"/);
  assert.match(template, /top: \{\{topInset \+ 36\}\}px/);
});

test('WeChat capsule measurement falls back safely when absent, invalid or throwing', (t) => {
  for (const menuRect of [
    undefined,
    { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
    { left: 20, right: 900, top: 24, bottom: 56, width: 87, height: 32 },
    () => {
      throw new Error('not ready');
    },
  ]) {
    const { page } = setup(t, { menuRect });
    assert.equal(page.data.navRightInset, 104);
    assert.equal(page.data.tableHeight + page.data.topInset + page.data.bottomInset + 321, 844);
  }
});

test('WeChat profile parameters keep stable unique keys when values repeat', (t) => {
  const { page } = setup(t);
  page.viewProfile({ currentTarget: { dataset: { id: 'balanced' } } });
  const rows = page.data.detailProfile.axisRows;
  assert.deepEqual(
    rows.map((row) => row.value),
    [50, 50, 40, 50, 20],
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, 5);
  assert.deepEqual(
    rows.map((row) => row.label),
    ['入池宽度', '进攻倾向', '诈唬倾向', '跟到底倾向', '强牌诱导'],
  );
  assert.match(template, /wx:for="\{\{detailProfile.axisRows\}\}" wx:key="id"/);
  page.viewProfile({ currentTarget: { dataset: { id: 'tan' } } });
  assert.deepEqual(
    page.data.detailProfile.axisRows.map((row) => row.id),
    rows.map((row) => row.id),
  );
  page.closeProfile();
  assert.equal(page.data.detailProfile, null);
});

function cssNumber(selector, property) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(rule, `missing geometry rule ${selector}`);
  const declaration = rule[1].match(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([\\d.]+)`));
  assert.ok(declaration, `missing ${selector} ${property}`);
  return Number(declaration[1]);
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('large portrait tablets reserve five larger public positions through settlement and resizing', (t) => {
  const info = { windowWidth: 1032, windowHeight: 1376, statusBarHeight: 24 };
  const { page } = setup(t, { playerCount: 9, info });
  assert.equal(page.data.boardTwoRows, false);
  assert.equal(page.data.boardWidth, 5 * 94 + 16);
  assert.equal(page.data.boardSlots.length, 5);
  const tableHeight = page.data.tableHeight;
  for (const board of [
    [],
    [{ key: 'a' }],
    Array.from({ length: 5 }, (_, i) => ({ key: `c${i}` })),
  ]) {
    assert.equal(page.publicLayout(board).boardWidth, 5 * 94 + 16);
    assert.equal(page.publicLayout(board).boardSlots.length, 5);
  }
  const game = reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  finish(game);
  page._controller.show();
  assert.equal(page.data.done, true);
  assert.equal(page.data.tableHeight, tableHeight);
  Object.assign(info, { windowWidth: 960, windowHeight: 1440 });
  page.onResize();
  assert.equal(page.data.boardWidth, 5 * 94 + 16);
  Object.assign(info, { windowWidth: 820, windowHeight: 1180 });
  page.onResize();
  assert.equal(page.data.boardWidth, page.data.boardTwoRows ? 3 * 106 + 8 : 5 * 106 + 16);
  Object.assign(info, { windowWidth: 1032, windowHeight: 1099 });
  page.onResize();
  assert.equal(page.data.boardWidth, 5 * 94 + 16);
  Object.assign(info, { windowWidth: 1101, windowHeight: 1440 });
  page.onResize();
  assert.equal(page.data.boardWidth, 5 * 70 + 16);
});

for (const playerCount of [5, 6, 7, 8, 9]) {
  for (const info of [
    { windowWidth: 320, windowHeight: 568, statusBarHeight: 20, safeArea: { bottom: 568 } },
    { windowWidth: 390, windowHeight: 667, statusBarHeight: 20, safeArea: { bottom: 667 } },
  ]) {
    test(`WeChat ${playerCount}-seat ${info.windowWidth}x${info.windowHeight} showdown keeps all cards and captions clear of the hero`, (t) => {
      const { page } = setup(t, { playerCount, info });
      const game = page._controller.getGame();
      finish(game);
      page._controller.show();
      assert.equal(page.data.done, true);
      assert.ok(page.data.seats.every((seat) => seat.cards.length === 2 && seat.rank));
      const height = page.data.arenaHeight;
      const width = page.data.arenaWidth;
      assert.equal(page.data.phoneLayout, true);
      assert.ok(height * page.data.arenaScale <= page.data.tableHeight + 0.01);
      assert.match(template, /wx:for="\{\{phoneSeats\}\}"/);
      const heroWidth = 2 * page.data.heroWidth + 7;
      const hero = {
        left: (width - heroWidth) / 2,
        right: (width + heroWidth) / 2,
        top: page.data.hero.top,
        bottom: page.data.hero.top + page.data.hero.height,
      };
      const community = {
        left: (width - page.data.boardWidth) / 2,
        right: (width + page.data.boardWidth) / 2,
        top: page.data.publicTop,
        bottom: page.data.publicTop + page.data.publicHeight,
      };
      assert.ok(community.bottom + 24 <= hero.top);
      const bounds = page.data.phoneSeats.flatMap((seat) =>
        seat.parts.map((part) => ({
          id: seat.id,
          left: seat.left + part.left,
          right: seat.left + part.left + part.width,
          top: seat.top + part.top,
          bottom: seat.top + part.top + part.height,
        })),
      );
      for (const seat of bounds) {
        assert.ok(seat.top >= 0 && seat.left >= 0 && seat.right <= width);
        assert.ok(seat.bottom <= height);
        assert.equal(intersects(seat, hero), false, `seat ${seat.id} clears the hero cards`);
        for (const part of page.data.public.parts) {
          const box = {
            left: page.data.public.left + part.left,
            right: page.data.public.left + part.left + part.width,
            top: page.data.public.top + part.top,
            bottom: page.data.public.top + part.top + part.height,
          };
          assert.equal(intersects(seat, box), false, `seat ${seat.id} clears the public content`);
        }
      }
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          if (bounds[i].id === bounds[j].id) continue;
          assert.equal(
            intersects(bounds[i], bounds[j]),
            false,
            'revealed seat cards and captions do not collide',
          );
        }
      }
    });
  }
}

test('WeChat exposes all researched players, linked claims and only copies a selected known source', (t) => {
  const { page, clipboard } = setup(t, { playerCount: 9 });
  const profiles = page.data.profiles.filter((p) => p.research);
  assert.equal(profiles.length, 16);
  for (const profile of profiles) {
    page.viewProfile({ currentTarget: { dataset: { id: profile.id } } });
    const detail = page.data.detailProfile;
    assert.equal(detail.research.reviewedAt, '2026-10-11');
    for (const claim of [...detail.research.career, ...detail.research.observations])
      for (const reference of claim.references) {
        assert.match(reference.label, /\[\d+\]/);
        assert.ok(profile.sources.some((source) => source.url === reference.url));
      }
    page.copyResearchSource({ currentTarget: { dataset: { url: profile.sources[0].url } } });
    assert.equal(clipboard.at(-1), profile.sources[0].url);
    const length = clipboard.length;
    page.copyResearchSource({
      currentTarget: { dataset: { url: 'https://example.com/unlisted' } },
    });
    assert.equal(clipboard.length, length);
    page.closeProfile();
  }
  assert.match(
    template,
    /class="profile-overview"[\s\S]*?detailProfile.evidence[\s\S]*?detailProfile.research.limits[\s\S]*?资料核对日期/,
  );
  assert.doesNotMatch(template, />资料边界</);
  assert.match(template, /公开资料/);
  assert.match(template, /openResearchSource/);
});

test('WeChat public card rows use the measured corridor and stay fixed from deal to settlement and resize', (t) => {
  const { page, info } = setup(t, {
    playerCount: 9,
    info: { windowWidth: 320, windowHeight: 667, statusBarHeight: 20, safeArea: { bottom: 667 } },
  });
  assert.equal(page.data.boardTwoRows, false);
  assert.equal(page.data.cardWidth, 66);
  assert.ok(page.data.boardWidth >= 3 * 50 + 8);
  assert.equal(page.data.boardSlots.length, 5);
  assert.ok(page.data.boardSlots.every((card) => card.empty));
  const budget = page.data.tableHeight;
  finish(page._controller.getGame());
  page._controller.show();
  assert.equal(page.data.boardSlots.length, 5);
  assert.ok(page.data.boardSlots.every((card) => !card.empty));
  assert.equal(page.data.tableHeight, budget);
  assert.equal(page.data.boardTwoRows, false);
  Object.assign(info, { windowWidth: 390, windowHeight: 900, safeArea: { bottom: 900 } });
  page.onResize();
  assert.equal(page.data.boardSlots.length, 5);
  assert.equal(
    page.data.boardWidth,
    Math.ceil(page.data.boardTwoRows ? 3 * 62.4 + 8 : 5 * 62.4 + 16),
  );
  Object.assign(info, { windowWidth: 820, windowHeight: 1180, safeArea: { bottom: 1180 } });
  page.onResize();
  assert.equal(page.data.boardSlots.length, 5);
  assert.equal(page.data.boardWidth, page.data.boardTwoRows ? 3 * 106 + 8 : 5 * 106 + 16);
});

test('WeChat five-player layout keeps two players near the crown and two around the waist', (t) => {
  const { page } = setup(t, { playerCount: 5 });
  const seats = page.data.seats;
  assert.ok(seats[0].x < 20 && seats[3].x > 80);
  assert.ok(seats[0].y >= 40 && seats[0].y <= 55);
  assert.equal(seats[0].y, seats[3].y);
  assert.ok(seats[1].x >= 25 && seats[2].x <= 75);
  assert.ok(seats[1].y <= 20 && seats[2].y <= 20);
  assert.equal(cssNumber('.seat-hole', 'height'), cssNumber('.seat-hole.revealed-hole', 'height'));
  assert.equal(
    cssNumber('.table-short .seat-hole', 'height'),
    cssNumber('.table-short .seat-hole.revealed-hole', 'height'),
  );
});

for (const playerCount of [6, 8]) {
  test(`WeChat ${playerCount}-seat crown stays on the rail before and after reveal`, (t) => {
    const { page } = setup(t, { playerCount });
    const crown = page.data.seats.find((seat) => seat.x === 50);
    assert.ok(crown);
    assert.equal(crown.y, 0);
    const profileTop = cssNumber('.seat-hole', 'height');
    const railTop = cssNumber('.table-area:not(.table-short) .felt-crowned', 'top');
    assert.ok(profileTop < railTop);
    assert.ok(profileTop + cssNumber('.seat-body', 'min-height') > railTop);
    assert.equal(profileTop, cssNumber('.seat-hole.revealed-hole', 'height'));
    const before = page.data.seats.map(({ id, x, y }) => ({ id, x, y }));
    finish(page._controller.getGame());
    page._controller.show();
    assert.deepEqual(
      page.data.seats.map(({ id, x, y }) => ({ id, x, y })),
      before,
    );
  });
}

test('WeChat temporarily unavailable table space recovers without invalid card geometry', (t) => {
  const { page, info } = setup(t);
  const cards = copy(page.data.heroCards);
  info.windowHeight = 200;
  page.onResize();
  assert.equal(page.data.tableHeight, 0);
  assert.ok(Number.isFinite(page.data.arenaWidth));
  assert.ok(Number.isFinite(page.data.boardWidth));
  info.windowHeight = 844;
  page.onResize();
  assert.ok(page.data.arenaScale > 0 && page.data.arenaScale <= 1);
  assert.deepEqual(copy(page.data.heroCards), cards);
});

test('Chinese-only settings start with sound enabled and select real dark options without changing the deal', (t) => {
  const { page } = setup(t);
  assert.equal(page.data.settings.sound, true);
  assert.doesNotMatch(template, /语言|Language|languageOptions/);
  assert.doesNotMatch(template, /<picker\b|⚙|⌄/);
  const before = JSON.stringify(page._controller.getGame());
  page.openSettings();
  page.openSelect({ currentTarget: { dataset: { field: 'count' } } });
  assert.deepEqual(page.data.selection.options, ['5 人', '6 人', '7 人', '8 人', '9 人']);
  page.chooseSelect({ currentTarget: { dataset: { index: 4 } } });
  assert.equal(page.data.selection, null);
  assert.equal(page.data.settings.playerCount, 9);
  assert.equal(JSON.stringify(page._controller.getGame()), before);
  assert.match(template, /top: 0; bottom: 0;.*padding-bottom: \{\{16 \+ bottomInset\}\}px/);
  const config = JSON.parse(
    readFileSync(new URL('../../miniprogram/pages/table/table.json', import.meta.url)),
  );
  assert.equal(config.disableScroll, false);
});

test('seat inspection is available only after settlement and does not alter cards, statistics or payouts', (t) => {
  const { page } = setup(t);
  assert.equal(page._controller.peek(1), false);
  const game = page._controller.getGame();
  finish(game);
  page._controller.show();
  const before = JSON.stringify(game);
  const shown = page.data.seats[0].revealed;
  page.peekSeat({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(page.data.seats[0].revealed, !shown);
  page.peekSeat({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(page.data.seats[0].revealed, shown);
  assert.equal(JSON.stringify(game), before);
});

test('settings keep eight assignable seats and retain off-table choices for the next hand', (t) => {
  const { page } = setup(t, { playerCount: 5 });
  assert.equal(page.data.seatSettings.length, 8);
  assert.equal(page.data.seatSettings.filter((s) => s.offTable).length, 4);
  const before = JSON.stringify(page._controller.getGame());
  const index = page.data.profiles.findIndex((p) => p.id === 'viktor');
  page.changeSeat({ currentTarget: { dataset: { id: 8 } }, detail: { value: index } });
  assert.equal(JSON.stringify(page._controller.getGame()), before);
  assert.equal(page.data.seatSettings[7].profileName, 'Viktor Blom');
  assert.match(page.data.seatSettings[7].portrait, /viktor/);
  page.changeCount({ detail: { value: 4 } });
  finish(page._controller.getGame());
  page._controller.show();
  page.nextHand();
  assert.equal(page._controller.getGame().players[8].botProfile, 'viktor');
});

test('dropdown data anchors the options below the original control and settings have no reset footer', (t) => {
  const { page } = setup(t);
  page.openSelect({ currentTarget: { dataset: { field: 'count' } } });
  assert.equal(page.data.selection.top, 308);
  assert.equal(page.data.selection.width, 110);
  assert.ok(page.data.selection.left + page.data.selection.width <= page.data.windowWidth - 8);
  assert.doesNotMatch(template, /selection-close|settings-footer/);
  assert.match(template, /top: 0; bottom: 0;/);
});

test('WeChat slider preview changes only the caption, final change commits the legal amount', (t) => {
  const { page } = setup(t);
  reachHero(page);
  page._controller.show();
  const before = copy(page.data),
    hand = copy(page._controller.getGame());
  page.previewRaise({ detail: { value: 875 } });
  assert.equal(page.data.raiseText, '875');
  assert.equal(page.data.raiseTo, before.raiseTo);
  for (const key of ['phoneSeats', 'boardSlots', 'heroCards', 'arenaHeight', 'publicTop'])
    assert.deepEqual(copy(page.data[key]), before[key]);
  assert.deepEqual(copy(page._controller.getGame()), hand);
  page.changeRaise({ detail: { value: 875 } });
  assert.equal(page.data.raiseTo, 875);
  assert.equal(page.data.raiseTo % 25, 0);
});

test('delayed chip measurements cannot draw into a hidden page or a replayed deal', (t) => {
  const { page, wx } = setup(t);
  const callbacks = [];
  wx.createSelectorQuery = () => {
    const query = {
      select() {
        return query;
      },
      boundingClientRect() {
        return query;
      },
      exec(fn) {
        callbacks.push(fn);
      },
    };
    return query;
  };
  const boxes = [
    { left: 10, top: 20, width: 40, height: 50 },
    { left: 120, top: 180, width: 60, height: 30 },
  ];
  page.flyChips(1);
  callbacks.shift()(boxes);
  assert.equal(page.data.flyingChips.length, 3);
  page.flyChips(1);
  page.onHide();
  callbacks.shift()(boxes);
  assert.equal(page.data.flyingChips.length, 0);
  delete wx.createSelectorQuery;
  page.onShow();
  finish(page._controller.getGame());
  page._controller.show();
  wx.createSelectorQuery = () => {
    const query = {
      select() {
        return query;
      },
      boundingClientRect() {
        return query;
      },
      exec(fn) {
        callbacks.push(fn);
      },
    };
    return query;
  };
  page.flyChips(1);
  delete wx.createSelectorQuery;
  page.retryHand();
  callbacks.shift()(boxes);
  assert.equal(page.data.flyingChips.length, 0);
});

test('WeChat hero turn vibrates once, rerenders/settings/background do not repeat it', (t) => {
  const { page, vibrations } = setup(t);
  reachHero(page);
  page._controller.show();
  assert.deepEqual(vibrations, ['light']);
  page._controller.show();
  page.openSettings();
  page.mixProfiles();
  page.closeSettings();
  assert.deepEqual(vibrations, ['light']);
  page.onHide();
  page.onShow();
  assert.deepEqual(vibrations, ['light']);
});
