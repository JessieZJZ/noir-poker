import { compactChips, compactActionAmounts } from '../../src/engine/chip-format.js';
import { compactTableLayout } from '../../src/ui/compact-table-layout.js';
import { renderCardArtwork } from '../../src/ui/cards.js';
import { railLayout } from '../../src/ui/rail-layout.js';
import { PROFILE_PORTRAITS } from '../../src/ui/portraits.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { recordResult } from '../../src/engine/game-records.js';
import { nameTooltipPosition } from '../../src/ui/name-tooltip-position.js';
import { numericWidthScale, numericColumnWidth } from '../../src/ui/numeric-width.js';
import {
  act,
  advanceStreet,
  completeBoardForPractice,
  rankText,
  evaluate,
} from '../../src/engine/poker.js';

const pageSource = readFileSync(
  new URL('../../miniprogram/pages/table/page-definition.js', import.meta.url),
  'utf8',
);
const stylesheet = readFileSync(
  new URL('../../miniprogram/pages/table/table.wxss', import.meta.url),
  'utf8',
);
const railStylesheet = readFileSync(
  new URL('../../miniprogram/pages/table/rail.wxss', import.meta.url),
  'utf8',
);
const template = readFileSync(
  new URL('../../miniprogram/pages/table/table.wxml', import.meta.url),
  'utf8',
);
const copy = (value) => JSON.parse(JSON.stringify(value));
const presentationModule = { exports: {} };
const recordTimeModule = { exports: {} };
vm.runInNewContext(
  readFileSync(new URL('../../miniprogram/record-time.js', import.meta.url), 'utf8'),
  { module: recordTimeModule },
);
vm.runInNewContext(
  readFileSync(new URL('../../miniprogram/pages/table/presentation.js', import.meta.url), 'utf8'),
  {
    module: presentationModule,
    require: (name) =>
      name.endsWith('/chip-format.js')
        ? { compactChips }
        : name.endsWith('/cards.js')
          ? { renderCardArtwork }
          : { evaluate, rankText },
  },
);
function setup(
  t,
  {
    playerCount = 6,
    waiting = false,
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
  const app = {};
  const stack = [];
  const navigationModule = { exports: {} };
  const context = vm.createContext({
    setTimeout(fn, delay = 0) {
      const id = ++serial;
      jobs.set(id, { fn, due: now + delay });
      return id;
    },
    clearTimeout(id) {
      jobs.delete(id);
    },
    module: { exports: {} },
    getApp: () => app,
    getCurrentPages: () => stack,
    require(name) {
      if (name === '../../record-navigation.js') return navigationModule.exports;
      if (name === '../../assets/portraits/credits.js')
        return Object.fromEntries(
          Object.entries(PROFILE_PORTRAITS).map(([id, image]) => [
            id,
            { label: image.credit, url: image.source },
          ]),
        );
      if (name.endsWith('/chip-format.js')) return { compactChips, compactActionAmounts };
      if (name === './presentation.js') return presentationModule.exports;
      if (name === './phone-layout.js') return { phoneLayout: compactTableLayout };
      if (name.endsWith('/name-tooltip-position.js')) return { nameTooltipPosition };
      if (name.endsWith('/numeric-width.js')) return { numericWidthScale, numericColumnWidth };
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
      navigateTo(value) {
        navigations.push(value.url);
        stack.push({ route: value.url.split('?')[0].replace(/^\//, '') });
        value.complete?.();
      },
      redirectTo(value) {
        navigations.push(value.url);
        stack[stack.length - 1] = { route: value.url.split('?')[0].replace(/^\//, '') };
        value.complete?.();
      },
      navigateBack(value) {
        stack.splice(Math.max(1, stack.length - value.delta));
        value.complete?.();
      },
      reLaunch(value) {
        stack.splice(0, stack.length, { route: value.url.replace(/^\//, '') });
        value.complete?.();
      },
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
            this.playing = true;
            this.playCount = (this.playCount || 0) + 1;
          },
          stop() {
            this.stopped = true;
            this.playing = false;
            this.stopCount = (this.stopCount || 0) + 1;
          },
          seek(value) {
            this.seekPosition = value;
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
  vm.runInNewContext(
    readFileSync(new URL('../../miniprogram/record-navigation.js', import.meta.url), 'utf8'),
    { module: navigationModule, wx: context.wx, getCurrentPages: () => stack },
  );
  vm.runInContext(pageSource, context);
  definition = context.module.exports;
  const page = {
    route: 'pages/table/table',
    ...definition,
    data: copy(definition.data),
    setData(value, callback) {
      for (const [path, entry] of Object.entries(value)) {
        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let target = this.data;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts.at(-1)] = copy(entry);
      }
      callback?.();
    },
  };
  stack.push(page);
  page.onLoad();
  if (!waiting) {
    page.joinTable();
    for (let count = 0; page.data.dealing && count < 50; count++) {
      const [id, job] = [...jobs].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      jobs.delete(id);
      now = job.due;
      job.fn();
    }
  }
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
    definition,
    app,
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
    stack,
    navigation: navigationModule.exports,
    wx: context.wx,
  };
}

test('WeChat publishes the waiting table atomically after the launch artwork', (t) => {
  const { page, definition } = setup(t, { waiting: true });
  assert.equal(definition.data.tableReady, false);
  assert.equal(page.data.tableReady, true);
  assert.equal(page.data.heroCards.length, 0);
  assert.equal(page.data.heroPosition, '');
  assert.equal(page.data.waitingForSeat, true);
  assert.equal(page.data.seats.length, page.data.settings.playerCount - 1);
  assert.match(template, /wx:if="\{\{!tableReady\}\}" class="launch-screen"/);
  assert.match(template, /<view\s+wx:else\s+class="screen /);
  assert.match(
    template,
    /<text\s+wx:if="\{\{!waitingForSeat\}\}"\s+class="position">\s*\{\{heroPosition\}\}\s*<\/text>/,
  );
});

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
  player.botProfile = 'owen';
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

test('WeChat hero actions and persona-expanded activity compact every chip amount, preserving hand counts', (t) => {
  const { page } = setup(t);
  const game = page._controller.getGame();
  game.players[1].botProfile = 'owen';
  game.players[0].lastAction = { street: game.street, text: '全下至18800' };
  game.players[1].lastAction = { street: game.street, text: '3-bet 全下至18800' };
  game.logs = [
    { text: '你 全下至18800', player: 0, type: 'action' },
    { text: 'Mia 3-bet 加注至1200', player: 1, type: 'action' },
    { text: '第 1001 手开始·庄家 你', type: 'info' },
  ];
  page._controller.show();
  assert.equal(page.data.heroAction, '全下至18.8K');
  assert.equal(page.data.seats[0].actionAmount, '18.8K');
  assert.match(page.data.logs[1].text, /Mia（.*） 3-bet 加注至1.2K/);
  assert.equal(page.data.logs[2].text, '你 全下至18.8K');
  assert.equal(page.data.logs[0].text, '第 1001 手开始·庄家 你');
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
      .map((entry) => compactActionAmounts(entry.text)),
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
  assert.equal(page.data.phoneSeats[0].rankLift, -25);
  assert.equal(page.data.phoneSeats[1].rankLift, -31);
  // Large all-in captions can need a small downward adjustment as well.
  ranks[0].top = 136;
  page.tightenSeatRanks();
  assert.equal(page.data.phoneSeats[0].rankLift, -22);
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
  assert.match(template, /class="card-back \{\{back.arriving/);
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
  assert.equal(audios.length, 5, 'Each unique local effect is preloaded once on entry');
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
  page.viewProfile({ currentTarget: { dataset: { id: 'rook' } } });
  assert.deepEqual(copy(page.data.detailProfile.sources), []);
  const url = 'https://example.com/unlisted';
  page.openResearchSource({ currentTarget: { dataset: { url } } });
  assert.equal(navigations.length, 0);
  page.openResearchSource({ currentTarget: { dataset: { url: 'https://example.com/' } } });
  assert.equal(navigations.length, 0);
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
  assert.match(template, /wx:if="{{canRetry && !historyReadOnly}}"\s+class="retry-button"/);
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
      { name: 'Alex', actual: '跟注', named: true, profileName: '多街施压' },
      { name: 'River', actual: '加注' },
      { name: 'Alex', actual: '弃牌' },
    ],
  };
  page.updateReview(report);
  assert.equal(page.data.opponentOptions[1], 'Alex，多街施压');
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

test('WeChat turn, fold, settlement and retry keep the table fixed while compacting unused actions', (t) => {
  assert.match(template, /class="action-notice"\s+wx:if="\{\{!compactActions\}\}"/);
  assert.match(template, /class="raise-controls" wx:if="\{\{!compactActions\}\}"/);
  assert.match(
    template,
    /height: {{tableHeight \+ 50 \+ \(waitingForSeat \? 0 : historyReadOnly \|\| compactActions \? 64 : 134\)}}px/,
  );
  assert.equal(cssNumber('.action-dock.compact-actions', 'height'), 64);
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
        page.data.tableHeight + page.data.topInset + page.data.bottomInset + 284,
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
      assert.match(stylesheet, /\.action-dock\s*\{[^}]*flex:\s*0 0 134px/s);
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
  for (const field of ['street', 'actual', 'label', 'suggestion', 'reason', 'followUp'])
    text(report.steps[0][field]);
  assert.equal(report.steps[0].ev, undefined);
  assert.ok(Array.isArray(report.activity));
  assert.equal(page.data.reviewActivityOpen, false);
  page.toggleReviewActivity();
  assert.equal(page.data.reviewActivityOpen, true);
  assert.ok(page.data.reviewActivity.some((event) => event.emphasized));
  assert.equal(report.steps[0].cards.length, 2);
  assert.ok(report.steps[0].evidence.length >= 4);
  assert.ok(report.activity.length > 0);
  assert.doesNotMatch(
    template,
    /你当时选择|它当时选择|下次怎么调整|实际执行记录|逐步查看它当时如何判断/,
  );
  assert.match(template, /当时的关键信息/);
  assert.match(template, /!selectedReviewStep.keep/);
  assert.doesNotMatch(
    template,
    /opponent-metrics|selectedReviewStep\.metrics\b|selectedReviewStep\.ev\b/,
  );
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
  assert.equal(saved.assignments[1], 'rook');
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
  assert.equal(page.data.seats[0].profileId, 'rook');
  assert.equal(page.data.seats[0].portrait, '/assets/portraits/rook.jpg');
});

test('WeChat settings expose compact blinds, validate raw edits in red and apply queued amounts after retry', (t) => {
  const { page, preferences } = setup(t);
  const game = reachHero(page);
  page._controller.hide();
  const before = copy(game);
  page.openSettings();
  assert.equal(page.data.configuredSmallBlindText, '100');
  assert.equal(page.data.configuredBigBlindText, '200');
  page.editSmallBlind();
  assert.equal(page.data.smallBlindEditing, true);
  assert.equal(page.data.smallBlindDraft, '100');
  for (const value of ['0', '-25', '50.5', '1K', '50025']) {
    const stored = preferences.get('noir-wechat-settings-v1');
    page.changeSmallBlind({ detail: { value } });
    page.finishSmallBlindEdit();
    assert.equal(page.data.smallBlindEditing, true);
    assert.equal(page.data.stakesError, '小盲只能输入25的正整数倍，且不超过50K。');
    assert.equal(preferences.get('noir-wechat-settings-v1'), stored);
    assert.deepEqual(game, before);
  }
  page.changeSmallBlind({ detail: { value: '50000' } });
  page.finishSmallBlindEdit();
  assert.equal(page.data.smallBlindEditing, false);
  assert.equal(page.data.stakesError, '');
  assert.equal(page.data.configuredSmallBlindText, '50K');
  assert.equal(page.data.configuredBigBlindText, '100K');
  assert.equal(page.data.stakesNotice, '下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始');
  assert.deepEqual(game, before);
  page.editSmallBlind();
  assert.equal(
    page.data.smallBlindDraft,
    '50000',
    'An edit uses full digits rather than a K display',
  );
  page.closeSettings();
  finish(game);
  page._controller.show();
  page.retryHand();
  page._controller.hide();
  assert.equal(page.data.blindText, '100 / 200');
  assert.equal(page.data.pendingStakes, true);
  finish(game);
  page.nextHand();
  assert.equal(page.data.blindText, '50K / 100K');
  assert.equal(page.data.pendingStakes, false);
  assert.equal(page._controller.getGame().stats.hands, 0);
  assert.ok(
    page._controller.getGame().players.every((player) => player.stack + player.total === 10000000),
  );
  assert.match(template, /id="small-blind-button"/);
  assert.match(template, /id="small-blind-input"/);
  assert.match(template, /id="stakes-error" class="stakes-error"/);
  assert.match(stylesheet, /\.stakes-error\s*\{[^}]*color: #ff8e95/s);
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

test('WeChat boosted sound cues keep only the latest context active and respect all playback gates', (t) => {
  const { page, audios, app } = setup(t);
  let ducks = 0;
  app.noirMusic = { duck: () => ducks++, unlock() {}, setEnabled() {} };
  const fold = page._soundPool.fold;
  const call = page._soundPool.chip;
  const snapshots = () => audios.map((audio) => [audio.playCount || 0, audio.stopCount || 0]);
  let before = snapshots();
  page.playSound('fold');
  assert.deepEqual(snapshots(), before, 'No gesture must neither stop nor play a cue');
  assert.equal(ducks, 0);
  page._audioUnlocked = true;
  page.playSound('fold');
  assert.equal(fold.playCount, 1);
  assert.equal(fold.seekPosition, 0);
  assert.deepEqual(
    audios.filter((audio) => audio.playing),
    [fold],
  );
  const stopped = fold.stopCount;
  page.playSound('call');
  assert.equal(fold.stopCount, stopped + 1);
  assert.equal(call.playCount, 1);
  assert.equal(call.seekPosition, 0);
  assert.equal(call.src, '/assets/sounds/chip.wav');
  page.playSound('raise');
  assert.equal(call.playCount, 2, 'Raise and call reuse the same recorded chip context');
  assert.equal(ducks, 3, 'Every actually played cue reserves music headroom');
  assert.deepEqual(
    audios.filter((audio) => audio.playing),
    [call],
  );
  page.call('setPreference', 'sound', false);
  const mutedPlays = audios.map((audio) => audio.playCount || 0);
  const emitted = [];
  const playSound = page.playSound;
  page.playSound = (name) => {
    emitted.push(name);
    playSound.call(page, name);
  };
  reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  assert.deepEqual(emitted, [], 'Muted controller actions never dispatch sound cues');
  assert.deepEqual(
    audios.map((audio) => audio.playCount || 0),
    mutedPlays,
  );
  page.call('setPreference', 'sound', true);
  assert.equal(emitted.at(-1), 'deal', 'The authoritative unmute cue can precede the updated view');
  page.onHide();
  assert.ok(audios.every((audio) => !audio.playing && audio.destroyed));
  before = snapshots();
  page.playSound('fold');
  assert.deepEqual(snapshots(), before, 'Hidden callbacks cannot recreate or replay audio');
  page.onShow();
  const restored = page._soundPool.fold;
  assert.notEqual(restored, fold);
  page.playSound('fold');
  assert.equal(restored.playCount, 1);
  assert.deepEqual(
    audios.filter((audio) => audio.playing),
    [restored],
  );
  assert.equal(restored.volume, 1);
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
    assert.equal(page.data.tableHeight + page.data.topInset + page.data.bottomInset + 284, 844);
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
  page.viewProfile({ currentTarget: { dataset: { id: 'rook' } } });
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
  assert.ok(page.data.cardWidth >= 94, 'Felt space may enlarge the baseline public cards');
  const initialBoardWidth = page.data.boardWidth;
  assert.equal(initialBoardWidth, 5 * page.data.cardWidth + 16);
  assert.equal(page.data.boardSlots.length, 5);
  const tableHeight = page.data.tableHeight;
  for (const board of [
    [],
    [{ key: 'a' }],
    Array.from({ length: 5 }, (_, i) => ({ key: `c${i}` })),
  ]) {
    assert.equal(page.publicLayout(board).boardWidth, initialBoardWidth);
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
  assert.ok(page.data.cardWidth >= 94);
  assert.equal(page.data.boardWidth, 5 * page.data.cardWidth + 16);
  Object.assign(info, { windowWidth: 820, windowHeight: 1180 });
  page.onResize();
  assert.ok(page.data.cardWidth >= 106);
  assert.equal(
    page.data.boardWidth,
    page.data.boardTwoRows ? 3 * page.data.cardWidth + 8 : 5 * page.data.cardWidth + 16,
  );
  Object.assign(info, { windowWidth: 1032, windowHeight: 1099 });
  page.onResize();
  assert.ok(page.data.cardWidth >= 94);
  assert.equal(page.data.boardWidth, 5 * page.data.cardWidth + 16);
  Object.assign(info, { windowWidth: 1101, windowHeight: 1440 });
  page.onResize();
  assert.ok(page.data.cardWidth >= 61);
  assert.equal(
    page.data.boardWidth,
    page.data.boardTwoRows ? 3 * page.data.cardWidth + 8 : 5 * page.data.cardWidth + 16,
  );
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

test('WeChat exposes original character descriptions without source links or photo credits', (t) => {
  const { page, clipboard } = setup(t, { playerCount: 9 });
  const profiles = page.data.profiles.filter((p) => p.id !== 'balanced');
  assert.equal(profiles.length, 7);
  for (const profile of profiles) {
    page.viewProfile({ currentTarget: { dataset: { id: profile.id } } });
    const detail = page.data.detailProfile;
    assert.equal(detail.character.sections.length, 5);
    assert.equal(detail.research, undefined);
    assert.equal(detail.portraitCredit, undefined);
    assert.deepEqual(copy(detail.sources), []);
    const length = clipboard.length;
    page.copyResearchSource({
      currentTarget: { dataset: { url: 'https://example.com/unlisted' } },
    });
    assert.equal(clipboard.length, length);
    page.closeProfile();
  }
  assert.match(template, /detailProfile.character.sections/);
  assert.doesNotMatch(template, /公开资料|履历摘录|公开打法样本|detailProfile.research|头像：/);
});

test('WeChat public card rows use the measured corridor and stay fixed from deal to settlement and resize', (t) => {
  const { page, info } = setup(t, {
    playerCount: 9,
    info: { windowWidth: 320, windowHeight: 667, statusBarHeight: 20, safeArea: { bottom: 667 } },
  });
  assert.equal(page.data.boardTwoRows, true, 'A tight corridor uses two readable rows');
  assert.ok(page.data.cardWidth * page.data.arenaScale >= 31);
  assert.ok(page.data.boardWidth >= 3 * 50 + 8);
  assert.equal(page.data.boardSlots.length, 5);
  assert.ok(page.data.boardSlots.every((card) => card.empty));
  const budget = page.data.tableHeight;
  const originalCardWidth = page.data.cardWidth;
  const originalBoardWidth = page.data.boardWidth;
  finish(page._controller.getGame());
  page._controller.show();
  assert.equal(page.data.boardSlots.length, 5);
  assert.ok(page.data.boardSlots.every((card) => !card.empty));
  assert.equal(page.data.tableHeight, budget);
  assert.equal(page.data.boardTwoRows, true);
  assert.equal(page.data.cardWidth, originalCardWidth);
  assert.equal(page.data.boardWidth, originalBoardWidth);
  Object.assign(info, { windowWidth: 390, windowHeight: 900, safeArea: { bottom: 900 } });
  page.onResize();
  assert.equal(page.data.boardSlots.length, 5);
  assert.ok(page.data.cardWidth >= 61);
  assert.equal(
    page.data.boardWidth,
    page.data.boardTwoRows ? 3 * page.data.cardWidth + 8 : 5 * page.data.cardWidth + 16,
  );
  Object.assign(info, { windowWidth: 820, windowHeight: 1180, safeArea: { bottom: 1180 } });
  page.onResize();
  assert.equal(page.data.boardSlots.length, 5);
  assert.ok(page.data.cardWidth * page.data.arenaScale >= 70);
  assert.equal(
    page.data.boardWidth,
    page.data.boardTwoRows ? 3 * page.data.cardWidth + 8 : 5 * page.data.cardWidth + 16,
  );
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

test('WeChat transient same-width window changes preserve the shared live and history budget', (t) => {
  const { page, info } = setup(t);
  const cards = copy(page.data.heroCards);
  const height = page.data.tableHeight;
  info.windowHeight = 200;
  page.onResize();
  assert.equal(page.data.tableHeight, height);
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
  const index = page.data.profiles.findIndex((p) => p.id === 'rook');
  page.changeSeat({ currentTarget: { dataset: { id: 8 } }, detail: { value: index } });
  assert.equal(JSON.stringify(page._controller.getGame()), before);
  assert.equal(page.data.seatSettings[7].profileName, '多街施压');
  assert.match(page.data.seatSettings[7].portrait, /rook/);
  page.changeCount({ detail: { value: 4 } });
  finish(page._controller.getGame());
  page._controller.show();
  page.nextHand();
  assert.equal(page._controller.getGame().players[8].botProfile, 'rook');
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
  assert.equal(page.data.raiseText, '900');
  assert.equal(page.data.raiseTo, before.raiseTo);
  for (const key of ['phoneSeats', 'boardSlots', 'heroCards', 'arenaHeight', 'publicTop'])
    assert.deepEqual(copy(page.data[key]), before[key]);
  assert.deepEqual(copy(page._controller.getGame()), hand);
  page.changeRaise({ detail: { value: 875 } });
  assert.equal(page.data.raiseTo, 900);
  assert.equal(page.data.raiseTo % 100, 0);
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

test('sound mute clears audio while independent vibration still notifies later hero turns', (t) => {
  const { page, vibrations, audios } = setup(t);
  page.togglePreference({ currentTarget: { dataset: { key: 'sound' } } });
  const count = vibrations.length;
  reachHero(page);
  assert.equal(page.data.settings.sound, false);
  assert.equal(vibrations.length, count + 1);
  assert.ok(audios.every((audio) => audio.stopped));
  assert.match(template, /aria-label="音效与音乐"/);
  page.togglePreference({ currentTarget: { dataset: { key: 'vibration' } } });
  page._controller.retry();
  reachHero(page);
  assert.equal(vibrations.length, count + 1);
  assert.match(template, /aria-label="振动"/);
});
test('peek preserves peer caption lifts and ordinary updates never re-deal the hero', (t) => {
  const { page } = setup(t);
  finish(page._controller.getGame());
  page._controller.show();
  page.data.phoneSeats.forEach((seat, i) => (seat.rankLift = -i - 3));
  const before = copy(page.data.phoneSeats).map((seat) => seat.rankLift);
  page.peekSeat({ currentTarget: { dataset: { id: 1 } } });
  assert.deepEqual(
    copy(page.data.phoneSeats).map((seat) => seat.rankLift),
    before,
  );
  const heroKeys = copy(page.data.heroCards).map((card) => card.dealKey);
  page._controller.show();
  assert.deepEqual(
    copy(page.data.heroCards).map((card) => card.dealKey),
    heroKeys,
  );
});
test('old deal motion callbacks cannot clear a replay and hiding cancels pending motion', (t) => {
  const { page, jobs } = setup(t);
  const stale = jobs.get(page._cardTimers.get('deal')).fn;
  finish(page._controller.getGame());
  page._controller.show();
  page.retryHand();
  const timer = page._cardTimers.get('deal');
  stale();
  assert.equal(page._cardTimers.get('deal'), timer);
  assert.ok(page.data.heroCards.every((card) => card.arriving));
  page.onHide();
  assert.equal(page._cardTimers.size, 0);
  assert.ok(page.data.heroCards.every((card) => !card.arriving));
});

test('WeChat shared page receives turn timer patches without changing table geometry', (t) => {
  const { page, jobs } = setup(t);
  reachHero(page);
  assert.equal(page.data.turnPhase, 'enter');
  const geometry = copy({ height: page.data.tableHeight, style: page.data.heroStyle });
  const patches = [];
  const original = page.setData;
  page.setData = function (patch, callback) {
    patches.push(Object.keys(patch));
    return original.call(this, patch, callback);
  };
  const [id, job] = [...jobs].find(([, job]) => job.due === 1300 + 3200);
  jobs.delete(id);
  job.fn();
  assert.equal(page.data.turnPhase, 'waiting');
  assert.deepEqual(patches, [['turnPhase']]);
  assert.deepEqual(copy({ height: page.data.tableHeight, style: page.data.heroStyle }), geometry);
  page.previewRaise({ detail: { value: page.data.minRaise } });
  assert.ok(![...jobs.values()].some((job) => job.due === 1300 + 8000));
  page.onHide();
  assert.equal(page.data.turnPhase, '');
  page.onShow();
  assert.equal(page.data.turnPhase, 'waiting');
});

test('WeChat record navigation keeps live bot progress and actual app background cancels it', (t) => {
  const { page, jobs, navigations, app } = setup(t);
  const game = reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  page.openRecords();
  assert.equal(navigations.at(-1), '/pages/records/records');
  page.onHide();
  assert.equal(app.noirController, page._controller);
  assert.ok(jobs.size > 0, 'Navigating to records must retain the bot timer');
  for (let count = 0; game.phase !== 'done'; count++) {
    assert.ok(count < 200);
    const [id, job] = [...jobs].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
    assert.ok(job, 'The backgrounded table continues the same live hand');
    jobs.delete(id);
    job.fn();
  }
  assert.equal(page._controller.getRecords()[0].attempts[0].status, 'completed');
  const source = readFileSync(new URL('../../miniprogram/app.js', import.meta.url), 'utf8');
  let appDefinition;
  vm.runInNewContext(source, {
    require() {},
    App(value) {
      appDefinition = value;
    },
  });
  page._controller.nextHand();
  assert.ok(jobs.size > 0);
  appDefinition.onHide.call(app);
  assert.equal(jobs.size, 0, 'True App background retains existing cancellation semantics');
  appDefinition.onShow.call(app);
  assert.ok(jobs.size > 0);
});

test('WeChat combined resources menu keeps both choices and rotates only while closed', (t) => {
  const { page, jobs } = setup(t);
  page._controller.hide();
  page.startResourceRotation();
  const tick = () => {
    const timer = jobs.get(page._resourceTimer);
    jobs.delete(page._resourceTimer);
    timer.fn();
  };
  tick();
  assert.equal(page.data.resourceLabel, '对局记录');
  assert.equal(page.data.resourcePreviousLabel, '玩法指南');
  assert.equal(page.data.resourceRolling, true);
  jobs.get(page._resourceMotionTimer).fn();
  assert.equal(page.data.resourceRolling, false);
  page.toggleResourceMenu();
  assert.equal(page.data.resourceRolling, false);
  tick();
  assert.equal(page.data.resourceLabel, '对局记录');
  page.openGuide();
  assert.equal(page.data.resourceMenuOpen, false);
  assert.equal(page.data.guideOpen, true);
  assert.match(template, /id="resource-guide"/);
  assert.match(template, /id="resource-records"/);
  assert.match(template, /resourceMenuOpen \? 'resource-menu-active' : ''/);
  assert.ok(
    cssNumber('.nav.resource-menu-active', 'z-index') > cssNumber('.resource-dismiss', 'z-index'),
    'The entire sticky header must sit above the dismiss mask; child z-index cannot escape its parent',
  );
  assert.match(
    stylesheet,
    /@keyframes resource-label-in\s*\{\s*from\s*\{\s*transform: translateY\(-100%\)/,
  );
  assert.match(
    stylesheet,
    /@keyframes resource-label-out\s*\{\s*from\s*\{\s*transform: translateY\(0\)/,
  );
});

test('WeChat reduced motion keeps resource labels static and schedules no auto rotation', (t) => {
  const { page, wx, jobs } = setup(t);
  page.startResourceRotation();
  let callback;
  wx.createSelectorQuery = () => ({
    select(selector) {
      assert.equal(selector, '#resource-menu-button');
      return {
        fields(options, fn) {
          assert.deepEqual(copy(options), { computedStyle: ['animation-duration'] });
          callback = fn;
        },
      };
    },
    exec() {
      callback({ 'animation-duration': '0s' });
    },
  });
  page.readResourceMotionPreference();
  assert.equal(page.data.resourceReducedMotion, true);
  assert.equal(page.data.resourceLabel, '玩法指南');
  assert.equal(page.data.resourceRolling, false);
  assert.equal(jobs.has(page._resourceTimer), false);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(
    stylesheet,
    /\.resource-label-window \.resource-label-static\s*\{\s*display: block;\s*\}/,
  );
});

test('WeChat shared viewport remains stable across scrolling and historical page entry', (t) => {
  const fixture = setup(t);
  const { page, info } = fixture;
  finish(page._controller.getGame());
  page._controller.show();
  const fields = ['tableHeight', 'arenaWidth', 'arenaHeight', 'arenaScale', 'textStyle'];
  const geometry = (item) => copy(Object.fromEntries(fields.map((key) => [key, item.data[key]])));
  const before = geometry(page);
  page.onPageScroll({ scrollTop: 380 });
  assert.deepEqual(geometry(page), before);
  info.windowHeight -= 110;
  info.safeArea.bottom -= 110;
  page.onResize();
  assert.deepEqual(geometry(page), before);
  const history = secondaryPage(t, 'history/history.js', fixture);
  history.onLoad({ id: page._controller.getRecords()[0].attempts[0].id });
  history.onShow();
  assert.deepEqual(geometry(history), before);
  page.onShow();
  assert.deepEqual(geometry(page), before);
  info.windowWidth = 820;
  info.windowHeight = 1180;
  info.safeArea.bottom = 1180;
  history.onResize();
  page.onShow();
  assert.deepEqual(geometry(history), geometry(page));
  assert.notEqual(page.data.tableHeight, before.tableHeight);
});

function secondaryPage(t, file, fixture) {
  let definition;
  vm.runInNewContext(
    readFileSync(new URL(`../../miniprogram/pages/${file}`, import.meta.url), 'utf8'),
    {
      Page(value) {
        definition = value;
      },
      getApp: () => fixture.app,
      wx: fixture.wx,
      setTimeout: () => 1,
      clearTimeout() {},
      require(name) {
        if (name === '../../record-time.js') return recordTimeModule.exports;
        if (name === '../../record-navigation.js') return fixture.navigation;
        if (name === '../../shared/engine/game-records.js') return { recordResult };
        if (name === '../table/page-definition.js') return fixture.definition;
        if (name === '../table/presentation.js') return presentationModule.exports;
        assert.equal(name, '../../shared/engine/chip-format.js');
        return { compactChips };
      },
    },
  );
  const page = { ...definition, data: copy(definition.data), setData: fixture.page.setData };
  t.after(() => page.onUnload());
  return page;
}

test('WeChat records classify every completed hand including zero folds and zero awards, with signed changes', (t) => {
  const fixture = setup(t);
  const hole = copy(fixture.page._controller.getGame().players[0].hole);
  const base = { status: 'completed', superseded: false, refill: false, hole, wonPot: true };
  const session = {
    id: 'records-ui',
    number: 1,
    startedAt: 1,
    endedAt: null,
    stakes: { smallBlind: 25, bigBlind: 50 },
    playerCount: 5,
    profit: 0,
    wins: 2,
    completed: 5,
    attempts: [
      { ...base, id: 'initial-win', hand: 1, attempt: 0, profit: 25, superseded: true },
      { ...base, id: 'initial-split', hand: 2, attempt: 0, profit: 0 },
      { ...base, id: 'zero-without-pot', hand: 3, attempt: 0, profit: 0, wonPot: false },
      { ...base, id: 'replay-one', hand: 4, attempt: 1, profit: -1025 },
      { ...base, id: 'replay-two', hand: 4, attempt: 2, profit: 1025, refill: true },
      { ...base, id: 'unfinished', hand: 5, attempt: 0, profit: null, status: 'unfinished' },
      { ...base, id: 'playing', hand: 6, attempt: 0, profit: null, status: 'playing' },
    ],
  };
  let revision = 0;
  fixture.app.noirController = {
    getRecordSummaries: () => [copy(session)],
    getRecordsRevision: () => revision,
    getRecordsError: () => '',
  };
  const records = secondaryPage(t, 'records/records.js', fixture);
  records.onLoad();
  records.onShow();
  const view = records.data.sessions[0];
  assert.equal(view.profitText, '+0');
  assert.deepEqual(copy(view.attempts.map((attempt) => [attempt.hand, attempt.attemptText])), [
    [6, ''],
    [5, ''],
    [4, '重打2'],
    [4, '重打1'],
    [3, ''],
    [2, ''],
    [1, ''],
  ]);
  assert.deepEqual(copy(view.attempts.map((attempt) => attempt.profitText)), [
    '—',
    '—',
    '+1.025K',
    '-1.025K',
    '+0',
    '+0',
    '+25',
  ]);
  const row = (id) => view.attempts.find((attempt) => attempt.id === id);
  assert.equal(row('initial-split').resultText, '赢', 'A zero net award still wins a pot');
  assert.equal(row('zero-without-pot').resultText, '输');
  assert.equal(row('unfinished').resultText, '未完成');
  assert.equal(row('playing').resultText, '进行中');
  assert.equal(row('initial-win').superseded, true, 'Replacement state stays available');
  assert.equal(row('replay-two').cards.length, 2);
  assert.equal(row('replay-two').refill, true);
  assert.equal(session.attempts[0].id, 'initial-win', 'Rendering does not reorder saved records');
  session.profit = -25;
  revision++;
  records.refreshRecords();
  assert.equal(records.data.sessions[0].profitText, '-25');
  session.profit = 25;
  revision++;
  records.refreshRecords();
  assert.equal(records.data.sessions[0].profitText, '+25');
  const markup = readFileSync(
    new URL('../../miniprogram/pages/records/records.wxml', import.meta.url),
    'utf8',
  );
  assert.match(markup, /wx:if="{{item.attemptText}}" class="hand-tag hand-replay"/);
  assert.match(markup, /wx:if="{{item.resultText}}"/);
  assert.doesNotMatch(markup, /已被重打替代/);
  assert.match(markup, /wx:if="{{item.refill \|\| item.resultText}}"/);
  assert.match(markup, /item.superseded \? 'superseded'/, 'Existing muted styling is retained');
  const css = readFileSync(
    new URL('../../miniprogram/pages/records/records.wxss', import.meta.url),
    'utf8',
  );
  assert.match(
    css,
    /\.hand-tag\.hand-replay\s*\{[^}]*color: #[0-9a-f]+;[^}]*border-color: #[0-9a-f]+;[^}]*background:/s,
  );
});

test('WeChat record rows use full-width native views and reject unfinished hand entry', (t) => {
  const fixture = setup(t);
  const attempts = {
    playing: { id: 'playing', status: 'playing' },
    unfinished: { id: 'unfinished', status: 'unfinished' },
    completed: { id: 'completed', status: 'completed' },
  };
  const records = secondaryPage(t, 'records/records.js', fixture);
  records.data.sessions = [{ attempts: Object.values(attempts) }];
  for (const id of ['playing', 'unfinished', 'missing']) {
    records.openHand({ currentTarget: { dataset: { id } } });
    assert.equal(fixture.navigations.length, 0);
  }
  records.openHand({ currentTarget: { dataset: { id: 'completed' } } });
  assert.deepEqual(fixture.navigations, ['/pages/history/history?id=completed']);
  const markup = readFileSync(
    new URL('../../miniprogram/pages/records/records.wxml', import.meta.url),
    'utf8',
  );
  assert.match(markup, /<view\s+class="session-item"[^>]*aria-role="button"/s);
  assert.match(markup, /<view\s+wx:for="{{session.attempts}}"[^>]*aria-role="button"/s);
  assert.match(markup, /aria-disabled="{{item.status !== 'completed' \? 'true' : 'false'}}"/);
  assert.doesNotMatch(markup, /<button[^>]*class="(?:session-item|hand-item)/s);
  const css = readFileSync(
    new URL('../../miniprogram/pages/records/records.wxss', import.meta.url),
    'utf8',
  );
  for (const selector of ['session-item', 'hand-item']) {
    const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))[1];
    assert.match(rule, /width:\s*100%;/);
    assert.match(rule, /margin:\s*0;/);
    assert.match(rule, /background:\s*transparent;/);
  }
  assert.match(css, /\.hand-item\.is-disabled\s*\{[^}]*background:\s*transparent;/s);
});

test('WeChat record lists send bounded summary patches and remain idle without record changes', (t) => {
  const fixture = setup(t);
  // Eights have the largest encoded vector rank; cover the worst artwork size.
  const hole = [
    { key: '2-8', rank: 8, suit: 2, symbol: '♣' },
    { key: '0-8', rank: 8, suit: 0, symbol: '♠' },
  ];
  let revision = 1,
    reads = 0;
  const sessions = Array.from({ length: 25 }, (_, i) => ({
    id: `session-${i}`,
    number: 25 - i,
    startedAt: 1000 + i,
    endedAt: i ? 2000 : null,
    stakes: { smallBlind: 100, bigBlind: 200 },
    playerCount: 9,
    profit: 0,
    wins: 0,
    completed: 90,
    attempts: Array.from({ length: 90 }, (_, j) => ({
      id: `attempt-${i}-${j}`,
      hand: j + 1,
      attempt: 0,
      hole,
      status: 'completed',
      profit: 0,
      wonPot: false,
      superseded: false,
      refill: false,
      // A defensive projection must not bridge unknown archive fields either.
      snapshot: { largeUnusedTree: 'x'.repeat(2000) },
    })),
  }));
  fixture.app.noirController = {
    getRecords() {
      throw Error('The list must never clone the full archive');
    },
    getRecord() {
      throw Error('Only the detail page loads a snapshot');
    },
    getRecordSummaries() {
      reads++;
      return sessions;
    },
    getRecordsRevision: () => revision,
    getRecordsError: () => '',
  };
  const page = secondaryPage(t, 'records/records.js', fixture);
  const patches = [];
  const setData = page.setData;
  page.setData = function (patch, callback) {
    patches.push(copy(patch));
    setData.call(this, patch, callback);
  };
  page.onLoad();
  page.onShow();
  const initialBytes = patches.reduce(
    (sum, patch) => sum + Buffer.byteLength(JSON.stringify(patch)),
    0,
  );
  assert.equal(page.data.sessions.length, 20);
  assert.equal(page.data.hasMoreSessions, true);
  assert.equal(page.data.sessions[0].attempts.length, 24);
  assert.deepEqual(
    copy(page.data.sessions[0].attempts.map((row) => row.hand)),
    Array.from({ length: 24 }, (_, i) => 90 - i),
  );
  assert.equal(page.data.sessions[1].attempts.length, 0);
  assert.doesNotMatch(JSON.stringify(page.data), /largeUnusedTree|snapshot/);
  const idleReads = reads,
    idlePatches = patches.length;
  for (let i = 0; i < 20; i++) page.refreshRecords();
  assert.equal(reads, idleReads);
  assert.equal(patches.length, idlePatches, 'Polling unchanged records must not call setData');
  page.moreHands({ currentTarget: { dataset: { id: 'session-0' } } });
  assert.equal(page.data.sessions[0].attempts.length, 48);
  assert.deepEqual(
    copy(page.data.sessions[0].attempts.map((row) => row.hand)),
    Array.from({ length: 48 }, (_, i) => 90 - i),
  );
  page.moreHands({ currentTarget: { dataset: { id: 'session-0' } } });
  assert.equal(page.data.sessions[0].attempts.length, 72);
  page.moreHands({ currentTarget: { dataset: { id: 'session-0' } } });
  assert.equal(page.data.sessions[0].attempts.length, 90);
  assert.equal(page.data.sessions[0].hasMoreHands, false);
  page.moreSessions();
  assert.equal(page.data.sessions.length, 25);
  assert.equal(page.data.hasMoreSessions, false);
  page.toggleSession({ currentTarget: { dataset: { id: 'session-24' } } });
  assert.equal(page.data.sessions[24].attempts.length, 24);
  sessions[0].attempts[0].profit = -100;
  sessions[0].profit = -100;
  revision++;
  const before = patches.length;
  page.refreshRecords();
  assert.equal(page.data.sessions[0].attempts.at(-1).profitText, '-100');
  assert.equal(patches.length, before + 1);
  assert.ok(
    JSON.stringify(patches.at(-1)).length < 500,
    'A settled amount updates only its changed leaves',
  );
  sessions.unshift({ ...sessions[1], id: 'new-session', number: 26, attempts: [] });
  revision++;
  page.refreshRecords();
  assert.equal(page.data.sessions[0].id, 'new-session');
  assert.equal(page.data.sessions[1].attempts.length, 90, 'Reordering retains expanded rows');
  assert.ok(
    Math.max(...patches.map((patch) => Buffer.byteLength(JSON.stringify(patch)))) < 256 * 1024,
  );
  page.openHand({ currentTarget: { dataset: { id: 'attempt-0-0' } } });
  assert.match(fixture.navigations.at(-1), /history\?id=attempt-0-0$/);
  page.onHide();
  const hiddenPatches = patches.length;
  revision++;
  page.refreshRecords();
  assert.equal(patches.length, hiddenPatches);
  t.diagnostic(
    JSON.stringify({
      initialBytes,
      largestPatchBytes: Math.max(
        ...patches.map((patch) => Buffer.byteLength(JSON.stringify(patch))),
      ),
      idleUpdates: patches.length - hiddenPatches,
      sessions: 25,
      hands: 2250,
    }),
  );
});

test('WeChat history uses a compact review dock and the records header keeps its return button intrinsic', () => {
  assert.match(
    template,
    /tableHeight \+ 50 \+ \(waitingForSeat \? 0 : historyReadOnly \|\| compactActions \? 64 : 134\)/,
  );
  assert.match(stylesheet, /\.history-shell \.action-dock\s*\{[^}]*height: 64px/);
  assert.match(stylesheet, /\.history-practice-heading\s*\{[^}]*margin: 12px 8px 8px/);
  const markup = readFileSync(
    new URL('../../miniprogram/pages/records/records.wxml', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../../miniprogram/pages/records/records.wxss', import.meta.url),
    'utf8',
  );
  assert.ok(markup.indexOf('<text>对局记录</text>') < markup.indexOf('id="records-back"'));
  assert.doesNotMatch(markup, /每一局的练习足迹/);
  assert.match(css, /\.records-nav button\s*\{[^}]*width: auto;[^}]*min-width: 0;[^}]*margin: 0;/);
});

for (const playerCount of [5, 9]) {
  for (const [windowWidth, windowHeight] of [
    [320, 568],
    [390, 844],
    [768, 1024],
  ]) {
    test(`WeChat archived ${playerCount}-seat settlement shares live geometry at ${windowWidth}x${windowHeight}`, (t) => {
      const fixture = setup(t, {
        playerCount,
        info: {
          windowWidth,
          windowHeight,
          statusBarHeight: 24,
          safeArea: { bottom: windowHeight },
        },
      });
      const game = reachHero(fixture.page);
      finish(game);
      fixture.page._controller.show();
      const attempt = fixture.page._controller.getRecords()[0].attempts[0];
      const history = secondaryPage(t, 'history/history.js', fixture);
      history.onLoad({ id: attempt.id });
      history.onShow();
      const fields = [
        'tableHeight',
        'arenaWidth',
        'arenaHeight',
        'arenaScale',
        'publicLeft',
        'publicTop',
        'potHeight',
        'boardWidth',
        'boardTwoRows',
        'cardWidth',
        'cardHeight',
        'heroWidth',
        'heroHeight',
        'feltStyle',
        'heroStyle',
        'seatWidth',
        'seatHeight',
        'profileWidth',
        'profileHeight',
      ];
      const geometry = (page) =>
        copy(Object.fromEntries(fields.map((field) => [field, page.data[field]])));
      assert.deepEqual(geometry(history), geometry(fixture.page));
      const seats = (page) =>
        copy(
          page.data.phoneSeats.map((seat) => ({
            id: seat.id,
            left: seat.left,
            top: seat.top,
            rankLift: seat.rankLift,
            cards: seat.cards.map((card) => card.key),
          })),
        );
      assert.deepEqual(seats(history), seats(fixture.page));
      assert.deepEqual(
        copy(history.data.boardSlots.map((card) => card.key)),
        copy(fixture.page.data.boardSlots.map((card) => card.key)),
      );
      assert.deepEqual(
        copy(history.data.heroCards.map((card) => card.key)),
        copy(fixture.page.data.heroCards.map((card) => card.key)),
      );
      assert.equal(history.data.historyReadOnly, true);
      assert.equal(
        history.data.historyAttemptLabel,
        undefined,
        'The extra historical navigation line is absent',
      );
      const archivedBefore = copy(history._controller.getGame());
      history.retryHand();
      assert.deepEqual(copy(history._controller.getGame()), archivedBefore);
      history.nextHand();
      assert.deepEqual(copy(history._controller.getGame()), archivedBefore);
      assert.equal(fixture.app.noirController, fixture.page._controller);
      const markup = readFileSync(
        new URL('../../miniprogram/pages/history/history.wxml', import.meta.url),
        'utf8',
      );
      assert.equal(markup.trim(), '<include src="../table/table.wxml" />');
      const css = readFileSync(
        new URL('../../miniprogram/pages/history/history.wxss', import.meta.url),
        'utf8',
      );
      assert.match(css, /^@import ['"]\.\.\/table\/table\.wxss['"];\s*$/);
    });
  }
}

test('WeChat history removes the extra navigation heading while preserving replay and statistics', (t) => {
  const fixture = setup(t);
  const game = reachHero(fixture.page);
  finish(game);
  fixture.page._controller.show();
  fixture.page._controller.retry();
  finish(game);
  fixture.page._controller.show();
  const session = fixture.page._controller.getRecords()[0];
  assert.deepEqual(copy(session.attempts.map((attempt) => attempt.superseded)), [true, false]);
  assert.equal(session.completed, 1);
  const archived = session.attempts[1];
  const history = secondaryPage(t, 'history/history.js', fixture);
  history.onLoad({ id: archived.id });
  history.onShow();
  assert.equal(history.data.historyAttemptLabel, undefined);
  assert.equal(history.data.replay, 1);
  assert.equal(
    history.data.historyStartedAt,
    recordTimeModule.exports.recordStartTime(archived.startedAt),
  );
  assert.equal(fixture.app.noirController, fixture.page._controller);
  assert.equal(fixture.page._controller.getRecords()[0].completed, 1);
  assert.doesNotMatch(template, /history-back|history-nav-title|history-replay-tag/);
  assert.match(template, /id="history-return-game"[^>]*bindtap="returnToGame"/);
  assert.match(template, /class="history-start-time">{{historyStartedAt}}/);
  assert.match(
    template,
    /<block wx:if="{{!historyReadOnly}}"\s*><text class="hand-divider">·<\/text><text>{{street}}/,
  );
  assert.doesNotMatch(template, /历史结算|历史记录/);
  assert.match(template, /wx:if="{{replay}}" class="replay"/);
  assert.match(template, /wx:if="{{!historyReadOnly}}"[^>]*bindtap="nextHand"/);
});

test('WeChat larger table text uses shared profile and hero footprints without overflowing their slots', (t) => {
  const actionRule = railStylesheet.match(
    /\.web-phone-layout \.seat \.seat-action\s*\{([^}]+)\}/,
  )[1];
  for (const [windowWidth, windowHeight, playerCount] of [
    [320, 568, 9],
    [390, 844, 9],
    [390, 844, 5],
    [768, 1024, 9],
    [1032, 1376, 9],
  ]) {
    const { page } = setup(t, {
      playerCount,
      info: { windowWidth, windowHeight, statusBarHeight: 24 },
    });
    const m = page.data.textMetrics;
    assert.equal(
      m['player-avatar'],
      Math.ceil(m['player-persona'] * 1.15 + 4 + m['player-stack'] + 2),
    );
    // Resolve the native rule against the actual serialized Page variables.
    // This is an adapter projection, not a DevTools glyph measurement.
    const variables = Object.fromEntries(
      [...page.data.textStyle.matchAll(/--([\w-]+):([\d.]+)px;/g)].map((match) => [
        match[1],
        Number(match[2]),
      ]),
    );
    const resolved = (property) =>
      variables[actionRule.match(new RegExp(`${property}:\\s*var\\(--([\\w-]+)\\)`))[1]];
    const action = {
      font: resolved('font-size'),
      height: resolved('height'),
      padding: resolved('padding-top'),
    };
    assert.ok(
      action.padding + 2 * action.font * 1.2 <= action.height,
      `${windowWidth}px has room for both action and amount lines including top padding`,
    );
    if (page.data.large) assert.deepEqual(action, { font: 25, height: 68, padding: 4 });
    else assert.equal(action.padding, 2);
    const padding = m['profile-padding'];
    const profileContent =
      m['player-name'] + m['player-stack'] + m['player-persona'] * 1.15 + 4 + 4 + padding * 2 + 2;
    assert.ok(
      profileContent <= page.data.profileHeight + 0.01,
      `${windowWidth}px profile keeps all text rows inside its footprint`,
    );
    assert.equal(
      page.data.heroFoot,
      m['hero-card-slot-height'] + m['rank-height'] + m['hero-info-height'] + 4,
    );
    assert.ok(m['hero-identity-height'] >= m['hero-identity'] * 1.2);
    assert.ok(m['hero-action-height'] >= m['hero-action'] * 1.2);
    assert.equal(m['hero-info-height'], m['hero-identity-height'] + m['hero-action-height'] + 2);
    assert.ok(
      page.data.tableHeight + page.data.topInset + page.data.bottomInset + 284 <= windowHeight,
    );
  }
  for (const key of [
    'pot-number',
    'pot-height',
    'profile-padding',
    'hero-identity',
    'hero-position',
    'hero-info-height',
    'hero-identity-height',
    'hero-action-height',
    'caption-width',
    'player-back-width',
    'player-back-height',
    'player-back-shift',
    'hero-card-slot-height',
    'hero-card-shift',
    'hero-card-gap',
    'hero-card-left-angle',
    'hero-card-right-angle',
    'hero-rank-empty-lift',
  ])
    assert.ok(stylesheet.includes(`var(--${key})`), `${key} is consumed by the native layout`);
  assert.match(stylesheet, /height: calc\(var\(--player-persona\) \* 1\.15 \+ 4px\)/);
});

test('WeChat long seat names shrink visually while position and inspection slots keep their space', (t) => {
  const { page } = setup(t, { playerCount: 9 });
  const game = page._controller.getGame();
  const name = 'Alexander · Long seat identity';
  game.players[1].name = name;
  page._controller.show();
  assert.equal(
    page.data.phoneSeats.find((seat) => seat.id === 1).name,
    name,
    'Ellipsis preserves the recorded identity and changes presentation alone',
  );
  assert.match(template, /class="seat-name-label[^>]+>{{item.name}}<\/text\s*>/s);
  assert.match(template, /class="seat-name-measure"[^>]*aria-hidden="true"[^>]*>{{item.name}}/s);
  const nameRow = railStylesheet.match(
    /\.web-phone-layout \.seat \.seat-name\s*\{[^}]*grid-column:[^}]+\}/,
  )[0];
  assert.match(nameRow, /min-width: 0/);
  assert.match(nameRow, /width: 100%/);
  assert.match(nameRow, /max-width: 100%/);
  const label = railStylesheet.match(
    /\.web-phone-layout \.seat \.seat-name-label\s*\{([^}]+)\}/,
  )[1];
  assert.match(label, /flex: 0 1 auto/);
  assert.match(label, /min-width: 0/);
  assert.match(label, /overflow: hidden/);
  assert.match(label, /text-overflow: ellipsis/);
  assert.match(railStylesheet, /\.seat-name \.position\s*\{\s*flex: none/);
  assert.match(railStylesheet, /\.seat-eye-slot\s*\{[^}]*width: 14px;[^}]*flex: none;/s);
  assert.match(
    railStylesheet,
    /\.web-phone-layout\.large-layout \.seat-eye\s*\{[^}]*width: 22px !important;[^}]*min-width: 22px;/s,
  );
  assert.match(
    railStylesheet,
    /\.seat-body > \.avatar\s*\{[^}]*align-self: end;[^}]*width: var\(--player-avatar\);[^}]*height: var\(--player-avatar\)/s,
  );
  assert.match(template, /class="position[^>]*>{{item.position}}<\/text\s*>/s);
  assert.match(template, /class="seat-eye"[^>]*bindtap="peekSeat"/s);
});

test('WeChat final cards retain readable phone dimensions within the unchanged first-screen budget', (t) => {
  for (const [windowWidth, windowHeight, playerCount, statusBarHeight, bottomInset] of [
    [320, 844, 9, 47, 34],
    [360, 800, 9, 24, 0],
    [360, 800, 9, 47, 34],
    [390, 844, 7, 47, 34],
    [390, 844, 8, 47, 34],
    [390, 844, 9, 47, 34],
    [390, 844, 5, 47, 34],
    [768, 1024, 9, 24, 0],
  ]) {
    const { page } = setup(t, {
      playerCount,
      info: {
        windowWidth,
        windowHeight,
        statusBarHeight,
        safeArea: { bottom: windowHeight - bottomInset },
      },
    });
    const metrics = page.data.textMetrics;
    assert.deepEqual(
      [metrics['player-back-width'], metrics['player-back-height'], metrics['player-back-shift']],
      page.data.tablet ? [33, 46, 28] : [32, 42, 22],
    );
    const scale = page.data.arenaScale;
    assert.ok(
      metrics['player-back-width'] * scale >= 14.5,
      `${windowWidth}px card backs retain the 15px target with 0.5px fit tolerance`,
    );
    // The profile begins 4px below the fixed mini-card slot. This is the
    // unrotated minimum exposed strip, before the +/-7deg corners extend it.
    assert.ok(
      (metrics['player-back-height'] - metrics['player-back-shift'] + 4) * scale >= 8,
      `${windowWidth}px exposes at least 8px of each back above the profile`,
    );
    assert.ok(
      page.data.cardWidth * scale >= 30.5,
      `${windowWidth}px public cards retain the shared 31px target with 0.5px layout tolerance`,
    );
    const faces = page.data.heroCardGeometry.faces;
    assert.equal(faces.length, 2);
    assert.equal(metrics['hero-card-slot-height'], page.data.tablet ? 136 : 104);
    assert.ok(page.data.heroWidth * scale >= 30, 'Crowded hero cards retain readable faces');
    assert.ok(page.data.heroHeight <= metrics['hero-card-slot-height'] * 1.4);
    const asBounds = (part) => ({
      left: part.left,
      top: part.top,
      right: part.left + part.width,
      bottom: part.top + part.height,
    });
    assert.equal(intersects(asBounds(faces[0]), asBounds(faces[1])), false);
    for (const face of faces) {
      assert.ok(face.left >= 0 && face.left + face.width <= page.data.arenaWidth);
      assert.ok(face.top >= page.data.publicTop + page.data.publicHeight + 32);
      assert.ok(face.top + face.height <= page.data.hero.top + metrics['hero-card-slot-height']);
      for (const seat of page.data.phoneSeats)
        for (const part of seat.parts)
          assert.equal(
            intersects(
              asBounds(face),
              asBounds({ ...part, left: seat.left + part.left, top: seat.top + part.top }),
            ),
            false,
            `${windowWidth}px grown hero face clears player ${seat.id}`,
          );
    }
    const slotWidth = page.data.tablet ? 92 : page.data.roomy ? 76 : 68;
    assert.ok(
      metrics['player-back-width'] * 2 + 3 <= slotWidth,
      'The pair fits its original fixed slot',
    );
    assert.equal(page.data.tableHeight + statusBarHeight + bottomInset + 284, windowHeight);
  }
  assert.match(
    stylesheet,
    /\.web-phone-layout \.seat \.card-back\s*\{[^}]*width: var\(--player-back-width\);[^}]*height: var\(--player-back-height\);[^}]*transform: translateY\(var\(--player-back-shift\)\) rotate\(-7deg\)/s,
  );
  assert.match(
    stylesheet,
    /\.web-phone-layout \.seat \.card-back \+ \.card-back\s*\{[^}]*transform: translateY\(var\(--player-back-shift\)\) rotate\(7deg\)/s,
  );
  assert.match(
    stylesheet,
    /\.web-phone-layout \.hero-cards\s*\{[^}]*height: var\(--hero-card-slot-height\);[^}]*min-height: var\(--hero-card-slot-height\);[^}]*align-items: flex-start;[^}]*gap: var\(--hero-card-gap\);/s,
  );
  assert.match(
    stylesheet,
    /\.web-phone-layout \.hero-card\s*\{[^}]*position: relative;[^}]*top: calc\(-1 \* var\(--hero-card-shift\)\);[^}]*transform: rotate\(var\(--hero-card-left-angle\)\);/s,
  );
});

test('WeChat practice heading owns reset and omits the old footer', () => {
  assert.match(
    template,
    /class="practice-panel"\s*><view class="session-title"\s*><text>本局练习<\/text\s*><button class="practice-reset"[^>]*bindtap="resetPractice">\s*重新练习\s*<\/button\s*>/,
  );
  assert.doesNotMatch(
    template,
    /你的练习|本次牌桌|class="bottom-links"|class="practice-info"|本地电脑对手 · 无需登录/,
  );
  assert.ok(
    template.indexOf('id="resource-menu-button"') <
      template.indexOf('class="icon-button settings-button"'),
  );
  assert.match(
    readFileSync(new URL('../../miniprogram/pages/table/parity.wxss', import.meta.url), 'utf8'),
    /\.practice-reset\s*\{[^}]*width: 70px;[^}]*min-height: 32px/s,
  );
  assert.match(template, /本次练习净变化/);
  assert.match(template, /<text>本局动态<\/text><text>{{done \? 'FINISHED' : 'LIVE'}}<\/text>/);
});

function measuredNumbers(page, width = 120) {
  return page.data.phoneSeats.map((seat, index) => ({
    dataset: {
      id: seat.id,
      number: seat.stack,
      widthScale: seat.stackWidthScale || 1,
    },
    width: (index ? 8 : width) * page.data.arenaScale * (seat.stackWidthScale || 1),
    'font-size': `${page.data.textMetrics['player-stack']}px`,
    'font-family': 'Barlow Condensed, Manrope, sans-serif',
    'font-weight': '600',
  }));
}

function deferSeatMeasurements(wx) {
  const pending = [];
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
        pending.push((numbers, names = [], positions = []) =>
          callback(
            selectors.map((selector) =>
              selector === '.seat-body > .stack'
                ? numbers
                : selector === '.seat-name-measure'
                  ? names
                  : selector === '.seat-name .position'
                    ? positions
                    : [],
            ),
          ),
        );
      },
    };
    return query;
  };
  return pending;
}

test('WeChat fits measured names only without the inspection icon and resets the fit at settlement', (t) => {
  const { page, wx } = setup(t, { playerCount: 9 });
  const game = copy(page._controller.getGame());
  const callbacks = deferSeatMeasurements(wx);
  const id = page.data.phoneSeats[0].id;
  const scale = page.data.arenaScale;
  const available =
    page.data.profileWidth - page.data.textMetrics['profile-padding'] * 2 - 2 - 48 - 3 - 0.25;
  const names = [{ dataset: { id }, width: (available / 0.85) * scale }];
  const positions = [{ dataset: { id }, width: 48 * scale }];
  page.tightenSeatRanks();
  callbacks.shift()([], names, positions);
  assert.equal(page.data.phoneSeats[0].nameFit, true);
  assert.ok(Math.abs(page.data.phoneSeats[0].nameWidthScale - 0.85) < 0.00001);
  assert.deepEqual(copy(page._controller.getGame()), game);
  page.tightenSeatRanks();
  callbacks.shift()([], [{ dataset: { id }, width: available * 2 * scale }], positions);
  assert.equal(
    page.data.phoneSeats[0].nameFit,
    false,
    'An excessively long identity keeps ellipsis',
  );
  page.tightenSeatRanks();
  const delayed = callbacks.shift();
  finish(page._controller.getGame());
  page._controller.show();
  assert.ok(page.data.done);
  delayed([], names, positions);
  assert.ok(page.data.phoneSeats.every((seat) => !seat.nameFit && seat.nameWidthScale === 1));
});

test('WeChat fits only overflowing full-precision numbers and caches the actual native font width', (t) => {
  const { page, wx } = setup(t, { playerCount: 9 });
  const game = copy(page._controller.getGame());
  page.data.phoneSeats[0].stack = '9.999975M';
  const amounts = page.data.phoneSeats.map((seat) => seat.stack);
  const beforeMetrics = copy(page.data.textMetrics);
  const beforeProfile = [page.data.profileWidth, page.data.profileHeight];
  const callbacks = deferSeatMeasurements(wx);
  page.tightenSeatRanks();
  const samples = measuredNumbers(page);
  assert.equal(samples.length, 8, 'Every displayed opponent supplies a real measurement');
  callbacks.shift()(samples);
  const available = numericColumnWidth({
    profileWidth: page.data.profileWidth,
    padding: beforeMetrics['profile-padding'],
    avatar: beforeMetrics['player-avatar'],
  });
  assert.equal(page.data.phoneSeats[0].stackWidthScale, available / 120);
  assert.ok(page.data.phoneSeats.slice(1).every((seat) => seat.stackWidthScale === 1));
  assert.deepEqual(copy(page.data.phoneSeats.map((seat) => seat.stack)), amounts);
  assert.deepEqual(copy(page.data.textMetrics), beforeMetrics);
  assert.deepEqual([page.data.profileWidth, page.data.profileHeight], beforeProfile);
  const fitted = page.data.phoneSeats[0].stackWidthScale;
  page.tightenSeatRanks();
  callbacks.shift()(measuredNumbers(page, 900));
  assert.equal(
    page.data.phoneSeats[0].stackWidthScale,
    fitted,
    'Unchanged text reuses its font width',
  );
  page._numberWidths.clear();
  page.tightenSeatRanks();
  callbacks.shift()(measuredNumbers(page));
  assert.equal(
    page.data.phoneSeats[0].stackWidthScale,
    fitted,
    'A transformed native rect recovers the natural width',
  );
  const changedFont = measuredNumbers(page, 90);
  changedFont[0]['font-size'] = '24px';
  page.tightenSeatRanks();
  callbacks.shift()(changedFont);
  assert.ok(Math.abs(page.data.phoneSeats[0].stackWidthScale - available / 90) < 0.00001);
  assert.deepEqual(copy(page._controller.getGame()), game);
  assert.match(template, /data-number="{{item.stack}}"/);
  assert.match(template, /--stack-width-scale: {{item.stackWidthScale \|\| 1}};/);
  assert.match(template, />{{item.stack}}<\/text/);
  assert.match(stylesheet, /font-family: 'Barlow Condensed', Manrope, sans-serif;/);
  assert.match(stylesheet, /transform: scaleX\(var\(--stack-width-scale, 1\)\);/);
  assert.match(stylesheet, /transform-origin: left center;/);
});

for (const action of ['hide', 'reset', 'configure', 'next', 'retry']) {
  test(`WeChat ${action} rejects delayed number measurements and cancels font calibration`, (t) => {
    const { page, wx, jobs } = setup(t);
    finish(page._controller.getGame());
    page._controller.show();
    page.onShow();
    const calibration = page._cardTimers.get('number-font');
    assert.ok(jobs.has(calibration));
    const callbacks = deferSeatMeasurements(wx);
    page.tightenSeatRanks();
    const samples = measuredNumbers(page);
    const delayed = callbacks.shift();
    if (action === 'hide') page.onHide();
    else if (action === 'reset') page._controller.reset();
    else if (action === 'configure') page._controller.setStakes({ smallBlind: 25, bigBlind: 50 });
    else if (action === 'next') page.nextHand();
    else page.retryHand();
    assert.equal(jobs.has(calibration), false);
    const before = copy(page.data.phoneSeats);
    delayed(samples);
    assert.deepEqual(copy(page.data.phoneSeats), before);
  });
}

test('WeChat historical number fitting updates its view without changing the live game or archive', (t) => {
  const fixture = setup(t);
  finish(fixture.page._controller.getGame());
  fixture.page._controller.show();
  const attempt = fixture.page._controller.getRecords()[0].attempts[0];
  const history = secondaryPage(t, 'history/history.js', fixture);
  history.onLoad({ id: attempt.id });
  assert.equal(
    history._dealKey,
    `${history.data.sessionNumber}:${history.data.hand}:${history.data.replay}`,
  );
  fixture.page._controller.reset();
  assert.notEqual(history.data.sessionNumber, fixture.page.data.sessionNumber);
  assert.notEqual(history._dealKey, fixture.page._dealKey);
  const live = copy(fixture.page._controller.getGame());
  const archive = copy(fixture.page._controller.getRecord(attempt.id));
  const callbacks = deferSeatMeasurements(fixture.wx);
  history.tightenSeatRanks();
  callbacks.shift()(measuredNumbers(history));
  assert.ok(history.data.phoneSeats[0].stackWidthScale < 1);
  assert.deepEqual(copy(fixture.page._controller.getGame()), live);
  assert.deepEqual(copy(fixture.page._controller.getRecord(attempt.id)), archive);
});

test('WeChat untagged hero information rises within the same card and first-screen footprints', (t) => {
  for (const [windowWidth, windowHeight, playerCount] of [
    [390, 844, 5],
    [390, 844, 9],
    [768, 1024, 9],
    [1032, 1376, 9],
  ]) {
    const { page } = setup(t, {
      playerCount,
      info: { windowWidth, windowHeight, statusBarHeight: 24 },
    });
    const geometry = () =>
      copy(
        Object.fromEntries(
          [
            'tableHeight',
            'arenaHeight',
            'arenaWidth',
            'arenaScale',
            'heroStyle',
            'heroFoot',
            'heroCardGeometry',
            'cardWidth',
            'cardHeight',
            'publicTop',
          ].map((key) => [key, page.data[key]]),
        ),
      );
    const before = geometry();
    assert.equal(page.data.heroRank, '');
    assert.equal(page.data.heroWinner, false);
    const metrics = page.data.textMetrics;
    assert.equal(metrics['hero-rank-empty-lift'], metrics['rank-height'] - 2);
    const normalTop = page.data.hero.top + page.data.heroFoot - metrics['hero-info-height'];
    const closeTop = normalTop - metrics['hero-rank-empty-lift'];
    assert.equal(closeTop - (page.data.hero.top + metrics['hero-card-slot-height']), 6);
    finish(page._controller.getGame());
    page._controller.show();
    assert.ok(page.data.heroRank || page.data.heroWinner);
    assert.deepEqual(geometry(), before);
  }
  assert.match(template, /heroRank \|\| heroWinner \? 'has-hero-rank' : ''/);
  assert.match(
    stylesheet,
    /\.web-phone-layout \.hero:not\(\.has-hero-rank\) \.hero-info\s*\{\s*translate: 0 calc\(-1 \* var\(--hero-rank-empty-lift\)\);/,
  );
});

test('returning from records preserves the painted live layout without replaying offscreen cards', (t) => {
  const { page, jobs, info } = setup(t);
  const game = reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  page.openRecords();
  page.onHide();
  for (let count = 0; game.phase !== 'done'; count++) {
    assert.ok(count < 200);
    const [id, job] = [...jobs].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
    jobs.delete(id);
    job.fn();
  }
  assert.equal(page.data.done, true);
  const cards = [
    ...page.data.heroCards,
    ...page.data.board,
    ...page.data.boardSlots,
    ...page.data.phoneSeats.flatMap((seat) => [...seat.cards, ...seat.backCards]),
  ];
  assert.ok(cards.every((card) => !card.arriving));
  assert.ok(page.data.phoneSeats.every((seat) => !seat.peekArriving));
  const before = copy(page.data);
  page._numberWidths = new Map([['measured', 123]]);
  const patches = [];
  const apply = page.setData;
  page.setData = function (patch, callback) {
    patches.push(copy(patch));
    apply.call(this, patch, callback);
  };
  const show = page._controller.show;
  let shows = 0;
  page._controller.show = () => {
    shows++;
    show();
  };
  page.onShow();
  assert.equal(shows, 0, 'A running live controller is not restarted by native Back');
  assert.equal(patches.length, 0, 'Unchanged dimensions do not cross the bridge or flash');
  assert.deepEqual(copy(page.data), before);
  assert.equal(page._numberWidths.get('measured'), 123);
  assert.equal(page._cardTimers?.has('number-font'), false);
  info.windowWidth = 820;
  info.windowHeight = 1180;
  info.safeArea.bottom = 1180;
  page.onResize();
  assert.equal(patches.length, 1, 'Real rotation publishes window and player geometry atomically');
  assert.equal(page.data.windowWidth, 820);
  assert.ok(page.data.phoneSeats.length);
});

test('WeChat long press shows every style, only clipped player names, and rejects stale tooltips', (t) => {
  const { page, wx } = setup(t);
  let naturalWidth = 100,
    labelWidth = 40,
    delayed = false;
  const callbacks = [];
  wx.createSelectorQuery = () => {
    const selectors = [];
    const query = {
      select(selector) {
        selectors.push(selector);
        return query;
      },
      fields() {
        return query;
      },
      boundingClientRect() {
        return query;
      },
      exec(callback) {
        const result =
          selectors[0] === '.seat-name-tooltip'
            ? [{ width: 140, height: 40 }]
            : [{ left: 320, top: 300, width: labelWidth, height: 20 }, { width: naturalWidth }];
        if (delayed) callbacks.push(() => callback(result));
        else callback(result);
      },
    };
    return query;
  };
  const seat = page.data.phoneSeats[0];
  page.showNameTooltip({ currentTarget: { dataset: { id: seat.id, kind: 'persona' } } });
  assert.equal(page.data.nameTooltip.text, seat.profileName);
  assert.equal(page.data.nameTooltip.visible, true);
  assert.ok(page.data.nameTooltip.position.left + 140 <= page.data.windowWidth - 12);
  page.onPageScroll({ scrollTop: 20 });
  assert.equal(page.data.nameTooltip, null);
  naturalWidth = labelWidth;
  page.showNameTooltip({ currentTarget: { dataset: { id: seat.id, kind: 'persona' } } });
  assert.equal(
    page.data.nameTooltip.text,
    seat.profileName,
    'A fully visible short style still opens',
  );
  page.closeNameTooltip();
  page.showNameTooltip({ currentTarget: { dataset: { id: seat.id, kind: 'name' } } });
  assert.equal(page.data.nameTooltip, null, 'Fully displayed names need no popup');
  naturalWidth = 100;
  delayed = true;
  page.showNameTooltip({ currentTarget: { dataset: { id: seat.id, kind: 'name' } } });
  page.onHide();
  callbacks.shift()();
  assert.equal(page.data.nameTooltip, null);
  assert.match(template, /class="seat-body"[\s\S]*?bindlongpress="showNameTooltip"/);
  assert.match(template, /catchlongpress="showNameTooltip"/);
  assert.match(template, /class="seat-eye"[\s\S]*?catchlongpress="closeNameTooltip"/);
  assert.match(stylesheet, /\.seat-name-tooltip\s*\{[^}]*position: fixed/s);
});

test('WeChat hand rankings shortcut resets the guide anchor on normal open and can jump again', (t) => {
  const { page } = setup(t);
  page._homeScroll = 120;
  page.openHandRankings();
  assert.equal(page.data.guideOpen, true);
  assert.equal(page.data.homeLocked, true);
  assert.equal(page.data.guideScrollTarget, 'hand-rankings');
  assert.equal(page.data.guideScrollTop, 0);
  page.closeGuide();
  assert.equal(page.data.guideOpen, false);
  assert.equal(page._homeScroll, 120);
  page.openGuide();
  assert.equal(page.data.guideScrollTarget, '');
  page.closeGuide();
  page.openHandRankings();
  assert.equal(page.data.guideScrollTarget, 'hand-rankings');
  assert.match(template, /id="hand-rankings-button"/);
  assert.match(template, /scroll-into-view="\{\{guideScrollTarget\}\}"/);
});

test('a late guide jump cannot move a closed or newly opened normal guide', (t) => {
  const { page } = setup(t);
  const pending = [];
  const setData = page.setData.bind(page);
  page.setData = (patch, callback) =>
    setData(patch, callback ? () => pending.push(callback) : undefined);
  page.openHandRankings();
  page.closeGuide();
  page.openGuide();
  for (const callback of pending) callback();
  assert.equal(page.data.guideOpen, true);
  assert.equal(page.data.guideScrollTarget, '');
});
