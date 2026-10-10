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
const template = readFileSync(
  new URL('../../miniprogram/pages/table/table.wxml', import.meta.url),
  'utf8',
);
const copy = (value) => JSON.parse(JSON.stringify(value));
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
      ...(menuRect === undefined
        ? {}
        : {
            getMenuButtonBoundingClientRect:
              typeof menuRect === 'function' ? menuRect : () => menuRect,
          }),
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
        page.data.tableHeight + page.data.topInset + page.data.bottomInset + 230,
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
      assert.match(stylesheet, /\.action-dock\s*\{[^}]*flex:\s*0 0 108px/s);
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

test('WeChat custom navigation and modal close buttons reserve the measured native capsule', (t) => {
  const info = {
    windowWidth: 320,
    windowHeight: 568,
    statusBarHeight: 20,
    safeArea: { bottom: 568 },
  };
  const rect = { left: 226, right: 313, top: 24, bottom: 56, width: 87, height: 32 };
  const { page } = setup(t, { info, menuRect: rect });
  assert.equal(page.data.navRightInset, rect.width + info.windowWidth - rect.right + 8);
  assert.equal(page.data.compactNav, true, 'narrow navigation hides the POKER subtitle');
  assert.ok(info.windowWidth - 8 - page.data.navRightInset <= rect.left - 8);
  assert.match(template, /class="nav[^\n]*padding-right: \{\{navRightInset\}\}px/);
  assert.match(template, /wx:if="\{\{!compactNav\}\}" class="brand-sub"/);
  assert.equal(
    [...template.matchAll(/class="modal-header" style="padding-right: \{\{navRightInset\}\}px;"/g)]
      .length,
    5,
    'all fullscreen modal close buttons avoid the capsule',
  );
  info.windowWidth = 390;
  rect.left = 296;
  rect.right = 383;
  page.onResize();
  assert.equal(page.data.compactNav, false, 'larger navigation keeps the subtitle');
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
    assert.equal(page.data.tableHeight + page.data.topInset + page.data.bottomInset + 230, 844);
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

for (const playerCount of [5, 6, 7, 8, 9]) {
  for (const info of [
    { windowWidth: 320, windowHeight: 568, statusBarHeight: 20, safeArea: { bottom: 568 } },
    { windowWidth: 375, windowHeight: 667, statusBarHeight: 20, safeArea: { bottom: 667 } },
    { windowWidth: 390, windowHeight: 667, statusBarHeight: 20, safeArea: { bottom: 667 } },
    { windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 } },
    { windowWidth: 768, windowHeight: 1024, statusBarHeight: 24, safeArea: { bottom: 1004 } },
    { windowWidth: 1024, windowHeight: 768, statusBarHeight: 24, safeArea: { bottom: 748 } },
  ]) {
    test(`WeChat ${playerCount}-seat ${info.windowWidth}x${info.windowHeight} showdown keeps all cards and captions clear of the hero`, (t) => {
      const { page } = setup(t, { playerCount, info });
      const originalLayout = copy(page.data.layout);
      const originalSeats = page.data.seats.map(({ left, top }) => ({ left, top }));
      assert.ok(page.data.seats.every((seat) => seat.cards.length === 0));
      const game = page._controller.getGame();
      finish(game);
      page._controller.show();
      assert.equal(page.data.done, true);
      assert.ok(page.data.seats.every((seat) => seat.cards.length === 2 && seat.rank));
      assert.deepEqual(
        page.data.layout,
        originalLayout,
        'dealing and settling never resize the desk',
      );
      assert.deepEqual(
        page.data.seats.map(({ left, top }) => ({ left, top })),
        originalSeats,
        'revealing cards never moves a seat',
      );
      const height = page.data.tableHeight;
      const layout = page.data.layout;
      assert.match(template, /layout.compact \? 'table-short'/);
      const style = template.match(/style="(left: \{\{item.left\}\}px; top: [^"]+)"/)[1];
      const width = layout.width;
      const seatWidth = layout.seatWidth;
      const seatHeight = layout.seatHoleHeight + layout.seatBodyHeight + layout.seatCaptionHeight;
      const backSelector = layout.wide
        ? '.table-wide .card-back'
        : layout.narrow
          ? '.table-short .card-back'
          : '.table-roomy .card-back';
      const backWidth = cssNumber(backSelector, 'width');
      const backHeight = cssNumber(backSelector, 'height');
      const backAngle = (7 * Math.PI) / 180;
      assert.ok(
        backWidth * Math.sin(backAngle) + backHeight * Math.cos(backAngle) <= layout.seatHoleHeight,
        'rotated face-down cards fit the same reserved hole slot',
      );
      assert.match(stylesheet, /\.seat-hole\s*\{[^}]*align-items:\s*center/s);
      const identityHeight = layout.heroInlineIdentity
        ? cssNumber('.hero-identity-inline', 'height')
        : cssNumber('.hero-identity', 'line-height') * 2;
      const heroFooterHeight = identityHeight + cssNumber('.hero-action', 'height');
      const heroBottom = height - cssNumber('.hero', 'bottom');
      const identityTop = heroBottom - heroFooterHeight;
      const cardWidth = layout.heroCardWidth;
      const cardHeight = layout.heroCardHeight;
      const angle = (5 * Math.PI) / 180;
      const rotatedWidth = cardWidth * Math.cos(angle) + cardHeight * Math.sin(angle);
      const rotatedHeight = cardHeight * Math.cos(angle) + cardWidth * Math.sin(angle);
      const heroWidth = cardWidth + cssNumber('.hero-cards', 'gap') + rotatedWidth;
      const heroTop =
        identityTop -
        cssNumber('.hero-cards', 'margin-bottom') -
        layout.heroRankHeight -
        cardHeight -
        (rotatedHeight - cardHeight) / 2;
      const hero = {
        left: (width - heroWidth) / 2,
        right: (width + heroWidth) / 2,
        top: heroTop,
        bottom: heroBottom,
      };
      const heroFooterWidth = cssNumber('.hero-action', 'width');
      const heroFooter = {
        left: (width - heroFooterWidth) / 2,
        right: (width + heroFooterWidth) / 2,
        top: identityTop,
        bottom: heroBottom,
      };
      const communityWidth = Math.min(218, width * (cssNumber('.community', 'width') / 100));
      const communityHeight =
        cssNumber('.pot-row', 'height') +
        cssNumber('.pot-row', 'margin-bottom') +
        2 * (layout.cardHeight + cssNumber('.board-row', 'margin-bottom'));
      const community = {
        left: (width - communityWidth) / 2,
        right: (width + communityWidth) / 2,
        top: layout.communityTop,
        bottom: layout.communityTop + communityHeight,
      };
      assert.ok(community.bottom <= hero.top, 'the two board rows clear the rotated hero cards');
      const bounds = page.data.seats.map((item) => {
        const rendered = style.replace(/\{\{([\s\S]+?)\}\}/g, (_, expression) =>
          vm.runInNewContext(expression, { item, layout }),
        );
        const top = Number(rendered.match(/top: ([\d.]+)px/)[1]);
        const left = Number(rendered.match(/left: ([\d.]+)px/)[1]) - seatWidth / 2;
        return { id: item.id, left, right: left + seatWidth, top, bottom: top + seatHeight };
      });
      for (const seat of bounds) {
        assert.ok(seat.top >= 0 && seat.left >= 0 && seat.right <= width);
        assert.ok(seat.bottom <= identityTop - 6, `seat ${seat.id} caption clears the hero footer`);
        assert.equal(intersects(seat, hero), false, `seat ${seat.id} clears the hero cards`);
        assert.equal(
          intersects(seat, heroFooter),
          false,
          `seat ${seat.id} clears the centered action slot`,
        );
        assert.equal(intersects(seat, community), false, `seat ${seat.id} clears the full board`);
      }
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          assert.equal(
            intersects(bounds[i], bounds[j]),
            false,
            'revealed seat cards and captions do not collide',
          );
        }
      }
      assert.equal(layout.heroFooterHeight, heroFooterHeight);
      assert.equal(layout.heroIdentityHeight, identityHeight);
      if (layout.heroInlineIdentity) {
        assert.equal(layout.heroRankHeight, cssNumber('.hero-inline .hero-rank .rank', 'height'));
        assert.equal(heroFooterHeight, 30);
      }
      assert.equal(layout.communityHeight, communityHeight);
      assert.ok(3 * layout.cardWidth + 2 * cssNumber('.board-row', 'gap') <= communityWidth);
      assert.ok(
        layout.cardWidth >= 31,
        'even the shortest 320px screen enlarges the community cards',
      );
      if (info.windowWidth >= 375) assert.ok(layout.cardWidth >= 48);
      if (info.windowWidth >= 700)
        assert.ok(layout.cardWidth >= (layout.compact ? 50 : 60) && layout.heroCardWidth >= 70);
    });
  }
}

test('WeChat hero cards and identity stay centered independently of the action text', (t) => {
  const { page } = setup(t, {
    info: { windowWidth: 375, windowHeight: 667, statusBarHeight: 20, safeArea: { bottom: 667 } },
  });
  assert.equal(page.data.layout.cardWidth, 48);
  assert.equal(page.data.layout.cardHeight, 65);
  assert.equal(page.data.tableHeight, 417, 'the shorter dock returns 28px to the SE table');
  assert.match(stylesheet, /\.felt\s*\{[^}]*inset:\s*12px 4px 16px/s);
  assert.match(stylesheet, /\.hero-cards\s*\{[^}]*justify-content:\s*center/s);
  assert.match(stylesheet, /\.hero-identity\s*\{[^}]*margin:\s*0 auto/s);
  assert.match(stylesheet, /\.hero-action\s*\{[^}]*position:\s*absolute/s);
  assert.match(
    stylesheet,
    /\.hero-action\s*\{[^}]*left:\s*50%[^}]*transform:\s*translateX\(-50%\)[^}]*text-align:\s*center/s,
  );
  assert.match(stylesheet, /\.hero-rank\s*\{[^}]*position:\s*absolute/s);
  assert.match(template, /top: \{\{layout.heroIdentityHeight\}\}px/);
  assert.match(template, /top: -\{\{layout.heroRankOffset\}\}px/);
  assert.equal(template.includes('class="hero-status"'), false);
  assert.equal(cssNumber('.hero-rank', 'height'), 12);
  assert.equal(cssNumber('.hero-info', 'height'), 46);
  assert.equal(cssNumber('.hero-action', 'height'), 16);
  assert.equal(cssNumber('.hero-action', 'line-height'), 16);
  assert.equal(cssNumber('.hero-cards', 'margin-bottom'), 8);
  assert.equal(cssNumber('.hero-cards', 'gap'), 3);
  const layout = copy(page.data.layout);
  for (const heroAction of ['', '过牌', '加注 4,875', '全下 15,075']) {
    page.setData({ heroAction });
    assert.deepEqual(page.data.layout, layout);
  }
  assert.match(template, /height: \{\{layout.seatHoleHeight\}\}px/);
  assert.match(template, /height: \{\{layout.seatBodyHeight\}\}px/);
  assert.match(template, /height: \{\{layout.seatCaptionHeight\}\}px/);
});

test('WeChat action states keep one dock height and terminal buttons fill one row', (t) => {
  const { page } = setup(t, { playerCount: 9 });
  const layout = copy(page.data.layout);
  assert.equal(page.data.canAct, false);
  const game = page._controller.getGame();
  const stacks = game.players.map((player) => player.stack);
  page.act({ currentTarget: { dataset: { action: 'raise' } } });
  assert.deepEqual(
    game.players.map((player) => player.stack),
    stacks,
    'disabled actions cannot commit chips',
  );
  reachHero(page);
  assert.equal(page.data.canAct, true);
  page.preset({ currentTarget: { dataset: { preset: 'all' } } });
  page.act({ currentTarget: { dataset: { action: 'raise' } } });
  assert.equal(page.data.heroStatus, '已全下');
  assert.deepEqual(page.data.layout, layout);
  finish(game);
  page._controller.show();
  assert.equal(page.data.done, true);
  assert.deepEqual(page.data.layout, layout);
  page.retryHand();
  reachHero(page);
  page.act({ currentTarget: { dataset: { action: 'fold' } } });
  assert.equal(page.data.heroFolded, true);
  assert.deepEqual(page.data.layout, layout);
  assert.equal(cssNumber('.action-dock', 'height'), 108);
  assert.equal(cssNumber('.action-dock-terminal', 'padding'), 12);
  assert.match(stylesheet, /\.settled-buttons\s*\{[^}]*display:\s*flex/s);
  assert.match(
    stylesheet,
    /\.settled-buttons button\s*\{[^}]*flex:\s*1[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    stylesheet,
    /\.continue-buttons button\s*\{[^}]*width:\s*100%[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    stylesheet,
    /\.action-dock button\[disabled\]\s*\{[^}]*opacity:\s*1[^}]*box-shadow:\s*none/s,
  );
  assert.match(stylesheet, /\.primary:not\(\[disabled\]\)/);
  assert.match(template, /wx:elif="\{\{heroFolded \|\| heroStatus === '已全下'\}\}"/);
});

for (const playerCount of [5, 9]) {
  test(`WeChat ${playerCount}-seat preflop fold settlement keeps exactly three equal buttons at 320px`, (t) => {
    const { page } = setup(t, {
      playerCount,
      info: { windowWidth: 320, windowHeight: 568, statusBarHeight: 20, safeArea: { bottom: 568 } },
    });
    const layout = copy(page.data.layout);
    const game = page._controller.getGame();
    while (game.phase === 'playing' && game.actor !== 0) act(game, game.actor, 'fold');
    page._controller.show();
    page.act({ currentTarget: { dataset: { action: 'fold' } } });
    for (let count = 0; game.phase !== 'done'; count++) {
      assert.ok(count < playerCount);
      assert.equal(game.phase, 'playing');
      act(game, game.actor, 'fold');
    }
    page._controller.show();
    assert.equal(page.data.heroFolded, true);
    assert.equal(page.data.done, true);
    assert.equal(page.data.board.length, 0, 'fold settlement leaves public cards undealt');
    assert.deepEqual(page.data.layout, layout);
    const settled = template.match(/<block wx:if="\{\{done\}\}"[\s\S]*?<\/block\s*>/)[0];
    const buttons = [
      ...settled.matchAll(/<button[^>]*bindtap="([^"]+)"[^>]*>([\s\S]*?)<\/button\s*>/g),
    ];
    assert.deepEqual(
      buttons.map(([, method]) => method),
      ['nextHand', 'retryHand', 'openReview'],
    );
    assert.match(template, /<\/block\s*>\s*<block wx:elif="\{\{heroFolded/);
    const labelSize = cssNumber('.settled-buttons button', 'font-size');
    const rowWidth = layout.width - 2 * 10;
    const buttonWidth = (rowWidth - 2 * cssNumber('.settled-buttons', 'gap')) / buttons.length;
    for (const [, , label] of buttons) {
      assert.ok(label.trim().length * labelSize < buttonWidth, 'each Chinese label fits one row');
    }
    assert.match(stylesheet, /\.settled-buttons\s*\{[^}]*display:\s*flex/s);
    assert.match(
      stylesheet,
      /\.settled-buttons button\s*\{[^}]*flex:\s*1[^}]*min-width:\s*0[^}]*white-space:\s*nowrap/s,
    );
  });
}

test('WeChat resizing recalculates the current seats while preserving the running hand', (t) => {
  const { page, info } = setup(t, { playerCount: 9 });
  const game = page._controller.getGame();
  const oldWidth = page.data.layout.width;
  info.windowWidth = 768;
  info.windowHeight = 1024;
  info.statusBarHeight = 24;
  info.safeArea.bottom = 1004;
  page.onResize();
  assert.equal(page._controller.getGame(), game);
  assert.equal(page.data.layout.wide, true);
  assert.ok(page.data.layout.width > oldWidth);
  assert.equal(page.data.layout.cardWidth, 64);
  assert.equal(page.data.tableHeight + page.data.topInset + page.data.bottomInset + 230, 1024);
  for (const seat of page.data.seats)
    assert.equal(seat.left, (seat.x * page.data.layout.width) / 100);
});
