// Real DevTools page navigation and engine play; no test fixture enters the app bundle.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || path.join(root, '.artifacts/wechat-records'));
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  platform: 'WeChat DevTools simulator',
  startedAt: new Date().toISOString(),
  checks: [],
  exceptions: [],
  screenshots: [],
};
let mini;
let page;
const readLive = () => mini.evaluate(() => getApp().noirController.getGame());
const readRecords = () => mini.evaluate(() => getApp().noirController.getRecords());
const wait = async (name, read, predicate, timeout = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await read();
    if (predicate(value)) return value;
    await page.waitFor(100);
  }
  throw Error(`${name} did not reach its expected state`);
};
const waitRoute = async (route) => {
  page = await wait(
    `Route ${route}`,
    () => mini.currentPage(),
    (current) => current.path === route,
  );
  await wait(
    'Native navigation completion',
    () => mini.evaluate(() => getApp().__recordsNavigationProbe?.pending || 0),
    (pending) => pending === 0,
  );
  await page.waitFor(200);
};
const waitElement = (selector) =>
  wait(
    `Element ${selector}`,
    () => page.$(selector),
    (element) => !!element,
  );
const scrollTo = async (top) => {
  await mini.pageScrollTo(top);
  return wait(
    `Actual page scroll ${top}`,
    () => mini.evaluate(() => getCurrentPages().at(-1)._homeScroll || 0),
    (actual) => (top ? actual > 0 : actual <= 1),
    10000,
  );
};
const tap = async (selector) => (await waitElement(selector)).tap();
const assertStack = async (...routes) =>
  assert.deepEqual(
    (await mini.pageStack()).map((item) => item.path),
    routes,
  );
const recordLayout = async (disabled = false) => {
  const session = await waitElement('.records-session');
  const heading = await waitElement('.session-item');
  const list = await waitElement('.hand-list');
  const hand = await waitElement(disabled ? '.hand-item.is-disabled' : '.hand-item');
  const containerWidth = (await session.size()).width;
  const headingWidth = (await heading.size()).width;
  const handWidth = (await hand.size()).width;
  const listWidth = (await list.size()).width;
  const horizontalPadding =
    parseFloat(await list.style('padding-left')) + parseFloat(await list.style('padding-right'));
  assert.equal(heading.tagName, 'view');
  assert.equal(hand.tagName, 'view');
  assert.equal(await heading.attribute('aria-role'), 'button');
  assert.equal(await heading.attribute('aria-expanded'), 'true');
  assert.equal(await hand.attribute('aria-role'), 'button');
  assert.equal(await hand.attribute('aria-disabled'), disabled ? 'true' : 'false');
  assert.ok(Math.abs(headingWidth - (containerWidth - 2)) <= 1, 'Session fills its card');
  assert.ok(Math.abs(handWidth - (listWidth - horizontalPadding)) <= 1, 'Hand fills its list');
  assert.equal(parseFloat(await heading.style('margin-left')), 0);
  assert.equal(parseFloat(await hand.style('margin-left')), 0);
  const background = await hand.style('background-color');
  assert.match(background, /^(?:transparent|rgba\([^)]*,\s*0\))$/);
  return { containerWidth, headingWidth, listWidth, handWidth, background, disabled };
};
const waitHero = () =>
  wait('Hero turn', readLive, (game) => game.phase === 'playing' && game.actor === 0);
const capture = async (name) => {
  await page.waitFor(1450);
  const filename = path.join(output, `${name}.png`);
  await mini.screenshot({ path: filename });
  const png = await readFile(filename);
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  report.screenshots.push({
    path: filename,
    width,
    height,
    screenshotScale: width / report.device.windowWidth,
    sha256: createHash('sha256').update(png).digest('hex'),
  });
};
const tableGeometry = async (players) => {
  const table = await waitElement('.table-area');
  const origin = await table.offset();
  const size = await table.size();
  const elements = {};
  for (const selector of [
    '.table-arena',
    '.felt',
    '.community',
    '.board-row',
    '.hero',
    '.hero-cards',
    ...players.slice(1).map((player) => `#seat-body-${player.id}`),
  ]) {
    const element = await waitElement(selector);
    const offset = await element.offset();
    const measured = await element.size();
    elements[selector] = {
      left: offset.left - origin.left,
      top: offset.top - origin.top,
      width: measured.width,
      height: measured.height,
    };
  }
  return { size, elements };
};
const nativeRects = async (selectors) => {
  await mini.evaluate((selectors) => {
    const current = getCurrentPages().at(-1);
    current._recordRectJSON = null;
    const measured = selectors.map(() => null);
    const query = wx.createSelectorQuery();
    selectors.forEach((selector, index) => {
      query.selectAll(selector).boundingClientRect((boxes) => {
        measured[index] = boxes.map((box) => ({
          id: String(box.id || ''),
          left: Number(box.left),
          top: Number(box.top),
          width: Number(box.width),
          height: Number(box.height),
          right: Number(box.right),
          bottom: Number(box.bottom),
        }));
        if (measured.every(Array.isArray)) current._recordRectJSON = JSON.stringify(measured);
      });
    });
    query.exec();
    return true;
  }, selectors);
  return JSON.parse(
    await wait(
      'Serialized rendered bounds',
      () => mini.evaluate(() => getCurrentPages().at(-1)._recordRectJSON),
      (value) => typeof value === 'string',
    ),
  );
};
const visibleSeatText = async (playerCount) => {
  const measured = await nativeRects([
    '.seat-body',
    '.seat-body .seat-name-label',
    '.seat-body > .persona',
    '.seat-body > .stack',
  ]);
  report.visibleSeatText = measured;
  for (const samples of measured) assert.equal(samples.length, playerCount - 1);
  const view = await page.data();
  const inset = view.textMetrics['profile-padding'] * view.arenaScale;
  for (let index = 0; index < measured[0].length; index++) {
    const body = measured[0][index];
    for (const samples of measured.slice(1)) {
      const text = samples[index];
      assert.ok(text.width > 0 && text.height > 0, 'Every displayed text sample is nonempty');
      assert.ok(text.left >= body.left + inset - 0.5);
      assert.ok(text.right <= body.right - inset + 0.5, 'Text keeps the authored right padding');
      assert.ok(text.top >= body.top && text.bottom <= body.bottom + 0.5);
    }
    const id = Number(body.id.split('-').at(-1));
    const seat = view.phoneSeats.find((item) => item.id === id);
    assert.ok(seat);
    assert.equal(await (await waitElement(`#seat-body-${id} > .stack`)).text(), seat.stack);
  }
  return measured;
};
const heroInformationGap = async () => {
  const [cards, information, slots, tables] = await nativeRects([
    '.hero-card',
    '.hero-info',
    '.hero-cards',
    '.table-area',
  ]);
  assert.equal(cards.length, 2);
  assert.equal(information.length, 1);
  assert.equal(slots.length, 1);
  assert.equal(tables.length, 1);
  for (const box of [...cards, ...information, ...slots, ...tables])
    assert.ok(box.width > 0 && box.height > 0);
  const view = await page.data();
  const tagged = !!(view.heroRank || view.heroWinner);
  const hero = await waitElement('.hero');
  const heroOrigin = await hero.offset(),
    heroSize = await hero.size();
  const cardCenter =
    (Math.min(...cards.map((card) => card.left)) + Math.max(...cards.map((card) => card.right))) /
    2;
  assert.ok(
    Math.abs(cardCenter - heroOrigin.left - heroSize.width / 2) <= 0.6,
    'Grown hero cards stay centered on the fixed hero identity',
  );
  const gap = information[0].top - Math.max(...cards.map((card) => card.bottom));
  const expected = (7 + (tagged ? view.textMetrics['hero-rank-empty-lift'] : 0)) * view.arenaScale;
  const sample = {
    tagged,
    gap,
    expected,
    tableHeight: tables[0].height,
    slotHeight: slots[0].height,
  };
  (report.heroInformationSamples ??= []).push(sample);
  assert.ok(
    Math.abs(gap - expected) <= 1,
    'Actual information gap follows the conditional tag slot',
  );
  return sample;
};
const assertTableParity = (actual, expected) => {
  for (const field of ['width', 'height'])
    assert.ok(
      Math.abs(actual.size[field] - expected.size[field]) <= 1,
      `Table ${field} matches the live settlement`,
    );
  for (const [selector, bounds] of Object.entries(expected.elements)) {
    assert.ok(actual.elements[selector]);
    for (const [field, value] of Object.entries(bounds))
      assert.ok(
        Math.abs(actual.elements[selector][field] - value) <= 1,
        `${selector} ${field} matches the same live settlement`,
      );
  }
};
const finishByFolding = async () => {
  await waitHero();
  await tap('.fold-button');
  await wait('Hero fold processed', readLive, (game) => game.players[0].folded);
  await mini.evaluate(() => getApp().noirController.finishHand());
  const settled = await wait('Settlement', readLive, (game) => game.phase === 'done');
  await wait(
    'Settlement paint',
    () => page.data(),
    (view) => view.done,
  );
  return settled;
};
const finishWithoutFolding = async () => {
  for (let actions = 0; actions < 100; actions++) {
    const game = await wait(
      'Hero action or settlement',
      readLive,
      (game) => game.phase === 'done' || (game.phase === 'playing' && game.actor === 0),
    );
    if (game.phase === 'done') {
      await wait(
        'Settlement paint',
        () => page.data(),
        (view) => view.done,
      );
      return game;
    }
    await wait(
      'Enabled hero controls',
      () => page.data(),
      (view) => view.canAct,
    );
    const decisions = game.decisions.length;
    await tap('.call-button');
    const after = await wait(
      'Call or check processed',
      readLive,
      (current) => current.decisions.length > decisions || current.phase === 'done',
    );
    if (after.players[0].allin && after.phase !== 'done')
      await mini.evaluate(() => getApp().noirController.finishHand());
  }
  throw Error('A real check/call hand exceeded 100 hero actions');
};
try {
  const manifest = JSON.parse(
    await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
  );
  report.build = {
    sourceDigest: manifest.sourceDigest,
    builtAt: manifest.builtAt,
    totalBytes: manifest.totalBytes,
  };
  report.stage = 'connect';
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9483' });
  mini.on('exception', (exception) => report.exceptions.push(exception));
  // A route enters the page stack before wx.navigateTo's completion callback.
  // Wait for that callback rather than tapping through an unfinished transition.
  // This probe exists only in the external test and is restored below.
  await mini.evaluate(() => {
    const probe = (getApp().__recordsNavigationProbe = { pending: 0, originals: {} });
    for (const method of ['navigateTo', 'navigateBack', 'redirectTo', 'reLaunch']) {
      probe.originals[method] = wx[method];
      wx[method] = function (options = {}) {
        probe.pending++;
        return probe.originals[method].call(wx, {
          ...options,
          complete(...args) {
            try {
              options.complete?.apply(this, args);
            } finally {
              probe.pending--;
            }
          },
        });
      };
    }
  });
  report.stage = 'initial-current-page';
  page = await mini.currentPage();
  report.stage = 'initial-relaunch';
  await mini.reLaunch('/pages/table/table');
  await waitRoute('pages/table/table');
  report.stage = 'real-game-play-and-records-navigation';
  report.device = await mini.systemInfo();
  await waitElement('.nav-actions > .icon-button');
  await waitElement('.resource-label-window');
  const [settingsButtons, resourceLabels] = await nativeRects([
    '.nav-actions > .icon-button',
    '.resource-label-window',
  ]);
  assert.equal(settingsButtons.length, 1);
  assert.equal(resourceLabels.length, 1);
  const navGap = resourceLabels[0].left - settingsButtons[0].right;
  assert.ok(navGap >= 4 && navGap <= 12, 'The settings icon and resource label stay close');
  assert.ok(settingsButtons[0].width >= 34 && settingsButtons[0].height >= 34);
  report.navigationSpacing = {
    gap: navGap,
    settings: settingsButtons[0],
    label: resourceLabels[0],
  };
  await mini.evaluate(() => {
    const table = getCurrentPages().at(-1);
    for (const method of [
      'closeResourceMenu',
      'closeSettings',
      'closeGuide',
      'closeReview',
      'closeActivity',
      'closePots',
      'closeReset',
    ])
      table[method]();
    getApp().noirController.reset();
  });
  await waitHero();
  report.stage = 'live-hero-without-tag';
  await capture('00-live-hero-without-tag');
  const untaggedHero = await heroInformationGap();
  assert.equal(untaggedHero.tagged, false);
  // A fold-win can legally show only a practice board and have no rank tag.
  // Keep the hero in this real hand so settlement has a winner or showdown tag.
  report.stage = 'real-check-call-settlement-with-tag';
  const firstSettled = await finishWithoutFolding();
  const initialSession = (await readRecords())[0];
  const archived = initialSession.attempts[0];
  assert.equal(archived.status, 'completed');
  assert.deepEqual(archived.hole, firstSettled.players[0].hole);
  assert.equal(archived.profit, firstSettled.payouts[0] - firstSettled.players[0].total);
  await capture('01-first-settlement');
  const taggedHero = await heroInformationGap();
  assert.equal(taggedHero.tagged, true);
  assert.ok(untaggedHero.gap < taggedHero.gap);
  assert.equal(untaggedHero.tableHeight, taggedHero.tableHeight);
  assert.equal(untaggedHero.slotHeight, taggedHero.slotHeight);
  report.heroInformation = { untagged: untaggedHero, tagged: taggedHero };
  report.checks.push({
    name: 'hero-information-closes-the-empty-tag-gap-with-fixed-table-and-card-slot',
  });
  const liveSettlementGeometry = await tableGeometry(firstSettled.players);
  report.stage = 'all-visible-seat-font-and-padding-bounds';
  const liveFontMetrics = {};
  for (const [selector, key] of [
    ['.seat-name', 'player-name'],
    ['.persona', 'player-persona'],
    ['.seat-body > .stack', 'player-stack'],
    ['.pot-number', 'pot-number'],
    ['.hero-identity', 'hero-identity'],
  ]) {
    const element = await waitElement(selector);
    const font = parseFloat(await element.style('font-size'));
    const view = await page.data();
    assert.equal(font, view.textMetrics[key], `${selector} uses the shared readable font`);
    liveFontMetrics[selector] = { font, effectiveFont: font * view.arenaScale };
  }
  report.fonts = liveFontMetrics;
  report.visibleSeatText = await visibleSeatText(firstSettled.players.length);
  report.checks.push({ name: 'native-rendered-fonts-use-shared-text-and-footprint-metrics' });
  const liveShellHeight = (await (await waitElement('.game-shell')).size()).height;
  await scrollTo(300);
  assertTableParity(await tableGeometry(firstSettled.players), liveSettlementGeometry);
  assert.equal(
    (await (await waitElement('.game-shell')).size()).height,
    liveShellHeight,
    'Live settlement and historical review share the same compact dock',
  );
  assert.equal((await (await waitElement('.action-dock')).size()).height, 64);
  await scrollTo(0);
  await tap('.retry-button');
  await wait(
    'Retry processed',
    readLive,
    (game) => game.phase === 'playing' && game.replayAttempt === 1,
  );
  const secondSettled = await finishByFolding();
  const retried = (await readRecords())[0];
  assert.deepEqual(
    retried.attempts.map((row) => [row.hand, row.attempt, row.superseded]),
    [
      [1, 0, true],
      [1, 1, false],
    ],
  );
  assert.equal(retried.completed, 1);
  assert.equal(retried.profit, secondSettled.payouts[0] - secondSettled.players[0].total);
  assert.deepEqual(retried.attempts[0].snapshot, archived.snapshot);
  report.checks.push({
    name: 'retry-keeps-all-settlements-counts-final-attempt',
    session: retried.number,
  });
  await tap('.settled-buttons .primary');
  await wait('Next hand processed', readLive, (game) => game.hand === 2);
  await waitHero();
  await tap('.fold-button');
  await wait('Hero fold before browsing', readLive, (game) => game.players[0].folded);
  assert.equal((await (await waitElement('.game-shell')).size()).height, liveShellHeight);
  const beforeBrowse = await readLive();
  await tap('#resource-menu-button');
  await wait(
    'Resources menu paint',
    () => page.data(),
    (view) => view.resourceMenuOpen,
  );
  await page.waitFor(150);
  assert.ok(await page.$('#resource-guide'));
  assert.ok(await page.$('#resource-records'));
  report.menuLayers = {
    nav: Number(await (await waitElement('.nav')).style('z-index')),
    dismiss: Number(await (await waitElement('.resource-dismiss')).style('z-index')),
  };
  assert.ok(
    report.menuLayers.nav > report.menuLayers.dismiss,
    'The whole menu stacking context clears the dismiss mask',
  );
  await capture('02-resources-menu');
  await tap('#resource-records');
  await waitRoute('pages/records/records');
  await assertStack('pages/table/table', 'pages/records/records');
  const liveCompleted = await wait(
    'Live game while records are open',
    readLive,
    (game) => game.phase === 'done',
  );
  assert.equal(liveCompleted.hand, 2);
  assert.ok(liveCompleted.history.length > beforeBrowse.history.length);
  await wait(
    'Records refresh',
    () => page.data(),
    (view) => view.sessions[0]?.attempts[0]?.status === 'completed',
  );
  const recordsView = await page.data();
  assert.equal(recordsView.sessions[0].number, initialSession.number);
  assert.deepEqual(
    recordsView.sessions[0].attempts.map((row) => [row.hand, row.attemptText]),
    [
      [2, ''],
      [1, '重打1'],
      [1, ''],
    ],
  );
  assert.deepEqual(
    recordsView.sessions[0].attempts.map((row) => row.attemptText),
    ['', '重打1', ''],
  );
  const resultFacts = await mini.evaluate(() =>
    getApp()
      .noirController.getRecords()
      .map(({ id, profit, attempts }) => ({
        id,
        profit,
        attempts: attempts.map(({ id, profit, wonPot }) => ({ id, profit, wonPot })),
      })),
  );
  for (const session of recordsView.sessions) {
    const facts = resultFacts.find((item) => item.id === session.id);
    assert.ok(facts);
    assert.match(session.profitText, /^[+-]\d/);
    if (facts.profit === 0) assert.equal(session.profitText, '+0');
    for (const attempt of session.attempts) {
      if (attempt.status !== 'completed') continue;
      const result = facts.attempts.find((item) => item.id === attempt.id);
      assert.ok(result);
      assert.match(attempt.profitText, /^[+-]\d/);
      assert.equal(
        attempt.resultText,
        result.wonPot ? (result.profit < 0 ? '获得部分底池 · 净亏损' : '赢') : '输',
      );
      if (result.profit === 0) {
        assert.equal(attempt.profitText, '+0');
      }
    }
  }
  const replayTag = await waitElement('.hand-replay');
  assert.equal(await replayTag.text(), '重打1');
  const replayColor = await replayTag.style('color');
  assert.ok(replayColor && replayColor !== (await replayTag.style('background-color')));
  assert.equal((await page.$$('.hand-attempt')).length, 0);
  assert.equal(recordsView.sessions[0].attempts[0].cards.length, 2);
  assert.match(recordsView.sessions[0].attempts[0].cards[0].artStyle, /data:image\/svg\+xml/);
  const cards = await page.$$('.record-card');
  assert.equal(cards.length, 6);
  report.recordLayout = { completed: await recordLayout() };
  await capture('03-records-list');
  report.checks.push({
    name: 'real-records-page-newest-attempts-first-graphic-cards-live-progress',
    historyBefore: beforeBrowse.history.length,
    historyAfter: liveCompleted.history.length,
  });
  await tap(`.hand-item[data-id="${archived.id}"]`);
  await waitRoute('pages/history/history');
  await assertStack('pages/table/table', 'pages/records/records', 'pages/history/history');
  await wait(
    'Historical settlement view',
    () => page.data(),
    (view) => view.done && view.historyReadOnly,
  );
  const historyView = await page.data();
  assert.equal(historyView.hand, 1);
  assert.equal(historyView.sessionNumber, initialSession.number);
  assert.equal(historyView.replay, 0);
  assert.equal((await page.$$('.retry-button')).length, 0);
  assert.equal((await page.$$('.settled-buttons .primary')).length, 0);
  assert.equal((await page.$$('.history-nav-title')).length, 0);
  assert.equal((await page.$$('.history-replay-tag')).length, 0);
  assert.equal((await page.$$('#history-back')).length, 0);
  assert.ok(await page.$('#history-return-game'));
  assert.ok(await page.$('.activity-panel'));
  await capture('04-historical-settlement');
  const historySettlementGeometry = await tableGeometry(archived.snapshot.players);
  assertTableParity(historySettlementGeometry, liveSettlementGeometry);
  assert.equal((await (await waitElement('.game-shell')).size()).height, liveShellHeight);
  await scrollTo(300);
  assertTableParity(await tableGeometry(archived.snapshot.players), historySettlementGeometry);
  await scrollTo(0);
  report.geometry = { live: liveSettlementGeometry, historical: historySettlementGeometry };
  report.checks.push({ name: 'historical-settlement-uses-the-same-rendered-table-geometry' });
  report.stage = 'historical-readonly-review-request';
  const liveBeforeReview = await readLive();
  report.reviewProtocol = { tapStartedAt: new Date().toISOString() };
  await tap('.review-button');
  report.reviewProtocol.tapReturnedAt = new Date().toISOString();
  report.stage = 'historical-readonly-review-progress';
  report.reviewProtocol.afterTap = JSON.parse(
    await mini.evaluate(() => {
      const current = getCurrentPages().at(-1);
      const data = current.data;
      return JSON.stringify({
        route: current.route,
        reviewOpen: !!data.reviewOpen,
        loading: !!data.reviewData?.loading,
        hand: data.reviewData?.hand ?? null,
        heroSteps: data.reviewData?.steps?.length ?? 0,
        opponentSteps: data.reviewData?.opponents?.length ?? 0,
      });
    }),
  );
  await wait(
    'Archived review',
    () => page.data(),
    (view) => view.reviewOpen && !view.reviewData.loading,
  );
  report.reviewProtocol.readyAt = new Date().toISOString();
  assert.equal((await page.data()).reviewData.hand, 1);
  assert.deepEqual(await readLive(), liveBeforeReview);
  assert.deepEqual((await readRecords())[0].attempts[0].snapshot, archived.snapshot);
  await capture('05-historical-review');
  report.checks.push({
    name: 'separate-historical-page-readonly-review-does-not-mutate-live-or-archive',
  });
  await mini.evaluate(() => getCurrentPages().at(-1).closeReview());
  await mini.navigateBack();
  await waitRoute('pages/records/records');
  await assertStack('pages/table/table', 'pages/records/records');
  assert.equal((await page.data()).expanded[initialSession.id], true);
  for (let i = 0; i < 2; i++) {
    await tap(`.hand-item[data-id="${archived.id}"]`);
    await waitRoute('pages/history/history');
    await assertStack('pages/table/table', 'pages/records/records', 'pages/history/history');
    await mini.navigateBack();
    await waitRoute('pages/records/records');
  }
  await tap('#records-back');
  await waitRoute('pages/table/table');
  await assertStack('pages/table/table');
  await tap('#resource-menu-button');
  await tap('#resource-records');
  await waitRoute('pages/records/records');
  await tap(`.hand-item[data-id="${archived.id}"]`);
  await waitRoute('pages/history/history');
  await tap('#history-return-game');
  await waitRoute('pages/table/table');
  await assertStack('pages/table/table');
  report.checks.push({ name: 'native-back-and-return-game-preserve-a-bounded-page-stack' });
  await mini.evaluate(() => getApp().noirController.nextHand());
  const beforeLeave = await readLive();
  assert.equal(beforeLeave.hand, 3);
  const bankrolls = beforeLeave.players.map((player) => player.stack + player.total);
  const baselineStats = beforeLeave.stats;
  await waitHero();
  const decisionCount = (await readLive()).decisions.length;
  await tap('.call-button');
  await wait('Wager before relaunch', readLive, (game) => game.decisions.length > decisionCount);
  await mini.reLaunch('/pages/table/table');
  await waitRoute('pages/table/table');
  await wait('Resume new hand', readLive, (game) => game.hand === 4);
  const resumed = await readLive();
  const continued = (await readRecords())[0];
  assert.equal(continued.id, initialSession.id);
  assert.equal(resumed.hand, 4);
  assert.equal(continued.attempts.find((attempt) => attempt.hand === 3).status, 'unfinished');
  assert.deepEqual(
    resumed.players.map((player) => player.stack + player.total),
    bankrolls,
  );
  assert.deepEqual(resumed.stats, baselineStats);
  await capture('06-resumed-same-session');
  report.checks.push({
    name: 'relaunch-resumes-session-next-hand-refunds-unfinished-wagers',
    session: continued.number,
    hand: resumed.hand,
    bankrolls,
  });
  await waitHero();
  await tap('#resource-menu-button');
  await tap('#resource-records');
  await waitRoute('pages/records/records');
  report.recordLayout.disabled = await recordLayout(true);
  await tap('.hand-item.is-disabled');
  await page.waitFor(1450);
  assert.equal((await mini.currentPage()).path, 'pages/records/records');
  await assertStack('pages/table/table', 'pages/records/records');
  await capture('07-full-width-unfinished-records');
  await tap('#records-back');
  await waitRoute('pages/table/table');
  await assertStack('pages/table/table');
  report.checks.push({
    name: 'full-width-native-record-views-preserve-accessibility-and-disabled-gate',
  });
  assert.equal(report.exceptions.length, 0);
  const currentBuild = JSON.parse(
    await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
  );
  assert.equal(
    currentBuild.sourceDigest,
    report.build.sourceDigest,
    'Local mini-program bundle files stayed unchanged',
  );
  report.stage = 'complete';
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  if (mini)
    await mini.evaluate(() => {
      const probe = getApp().__recordsNavigationProbe;
      if (!probe) return;
      for (const [method, original] of Object.entries(probe.originals)) wx[method] = original;
      delete getApp().__recordsNavigationProbe;
    });
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}
console.log(`WeChat records passed: ${report.checks.length} checks`);
