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

test('WeChat turn, fold, settlement and retry keep the table budget while compacting the controls', (t) => {
  assert.match(template, /class="action-notice" wx:if="\{\{!compactActions\}\}"/);
  assert.match(template, /class="raise-controls" wx:if="\{\{!compactActions\}\}"/);
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

test('WeChat all-in waits use a compact dock independently of status text', (t) => {
  const { page } = setup(t);
  reachHero(page);
  page.preset({ currentTarget: { dataset: { preset: 'all' } } });
  page.act({ currentTarget: { dataset: { action: 'raise' } } });
  assert.equal(page.data.heroAllin, true);
  assert.equal(page.data.canAct, false);
  assert.equal(page.data.compactActions, true);
});

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
    assert.equal(page.data.tableHeight + page.data.topInset + page.data.bottomInset + 258, 844);
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
  assert.equal(page.data.boardWidth, 5 * 82 + 16);
  assert.equal(page.data.boardSlots.length, 5);
  const tableHeight = page.data.tableHeight;
  for (const board of [
    [],
    [{ key: 'a' }],
    Array.from({ length: 5 }, (_, i) => ({ key: `c${i}` })),
  ]) {
    assert.equal(page.publicLayout(board).boardWidth, 5 * 82 + 16);
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
  assert.equal(page.data.boardWidth, 5 * 82 + 16);
  Object.assign(info, { windowWidth: 820, windowHeight: 1180 });
  page.onResize();
  assert.equal(page.data.boardWidth, 5 * 48 + 16);
  Object.assign(info, { windowWidth: 1032, windowHeight: 1099 });
  page.onResize();
  assert.equal(page.data.boardWidth, 5 * 48 + 16);
  Object.assign(info, { windowWidth: 1101, windowHeight: 1440 });
  page.onResize();
  assert.equal(page.data.boardWidth, 5 * 48 + 16);
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
      const height = page.data.tableHeight;
      assert.ok(height < 430);
      assert.match(template, /tableHeight < 430 \? 'table-short'/);
      // Read actual template expressions and actual CSS dimensions. This catches
      // a return to percentage seats even when the overall page height stays fixed.
      const style = template.match(/style="(left: \{\{item.x\}\}%; top: [^"]+)"/)[1];
      const width = info.windowWidth - 18; // 8px page gutters and the 1px shell border.
      const seatWidth = cssNumber('.table-short .seat', 'width');
      const seatHeight =
        cssNumber('.table-short .seat-hole.revealed-hole', 'height') +
        cssNumber('.table-short .seat-body', 'height') +
        cssNumber('.table-short .seat-caption', 'height') +
        cssNumber('.table-short .seat-caption', 'margin-top');
      const heroFooterHeight = cssNumber('.hero-identity', 'line-height') * 2;
      const heroBottom = height - cssNumber('.table-short .hero', 'bottom');
      const identityTop = heroBottom - heroFooterHeight;
      const cardWidth = cssNumber('.table-short .hero-card', 'width');
      const cardHeight = cssNumber('.table-short .hero-card', 'height');
      const angle = (5 * Math.PI) / 180;
      const rotatedWidth = cardWidth * Math.cos(angle) + cardHeight * Math.sin(angle);
      const rotatedHeight = cardHeight * Math.cos(angle) + cardWidth * Math.sin(angle);
      const heroWidth = cardWidth + cssNumber('.hero-cards', 'gap') + rotatedWidth;
      const heroTop =
        identityTop -
        cssNumber('.table-short .hero-rank', 'height') -
        cardHeight -
        (rotatedHeight - cardHeight) / 2;
      const hero = {
        left: (width - heroWidth) / 2,
        right: (width + heroWidth) / 2,
        top: heroTop,
        bottom: heroBottom,
      };
      const communityWidth = page.data.boardWidth;
      const communityOffset = Number(
        stylesheet.match(/\.table-short \.community\s*\{[^}]*translate\(-50%,\s*(-[\d.]+)px\)/)[1],
      );
      const communityHeight =
        cssNumber('.table-short .pot-row', 'height') +
        cssNumber('.table-short .pot-row', 'margin-bottom') +
        (page.data.boardTwoRows ? 2 : 1) *
          (cssNumber('.table-short .card-placeholder', 'height') +
            cssNumber('.table-short .board-row', 'margin-bottom'));
      const community = {
        left: (width - communityWidth) / 2,
        right: (width + communityWidth) / 2,
        top: (height * cssNumber('.table-short .community', 'top')) / 100 + communityOffset,
        bottom:
          (height * cssNumber('.table-short .community', 'top')) / 100 +
          communityOffset +
          communityHeight,
      };
      assert.ok(community.bottom <= hero.top, 'the two board rows clear the rotated hero cards');
      const bounds = page.data.seats.map((item) => {
        const rendered = style.replace(/\{\{([\s\S]+?)\}\}/g, (_, expression) =>
          vm.runInNewContext(expression, { item, tableHeight: height }),
        );
        const top = Number(rendered.match(/top: ([\d.]+)px/)[1]);
        const left = (item.x * width) / 100 - seatWidth / 2;
        return { id: item.id, left, right: left + seatWidth, top, bottom: top + seatHeight };
      });
      for (const seat of bounds) {
        assert.ok(seat.top >= 0 && seat.left >= 0 && seat.right <= width);
        assert.ok(seat.bottom <= identityTop - 6, `seat ${seat.id} caption clears the hero footer`);
        assert.equal(intersects(seat, hero), false, `seat ${seat.id} clears the hero cards`);
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
    });
  }
}

test('WeChat public card rows use the measured corridor and stay fixed from deal to settlement and resize', (t) => {
  const { page, info } = setup(t, {
    playerCount: 9,
    info: { windowWidth: 320, windowHeight: 667, statusBarHeight: 20, safeArea: { bottom: 667 } },
  });
  assert.equal(page.data.boardTwoRows, false);
  assert.equal(page.data.boardWidth, 5 * 25 + 16);
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
  assert.equal(page.data.boardTwoRows, true);
  assert.equal(page.data.boardWidth, 3 * 48 + 8);
  Object.assign(info, { windowWidth: 820, windowHeight: 1180, safeArea: { bottom: 1180 } });
  page.onResize();
  assert.equal(page.data.boardTwoRows, false);
  assert.equal(page.data.boardWidth, 5 * 48 + 16);
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
