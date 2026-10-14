// Real DevTools page navigation and engine play; no test fixture enters the app bundle.
import { createRequire } from 'node:module';
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
  await page.waitFor(200);
};
const waitElement = (selector) =>
  wait(
    `Element ${selector}`,
    () => page.$(selector),
    (element) => !!element,
  );
const tap = async (selector) => (await waitElement(selector)).tap();
const waitHero = () =>
  wait('Hero turn', readLive, (game) => game.phase === 'playing' && game.actor === 0);
const capture = async (name) => {
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, `${name}.png`) });
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
  report.stage = 'initial-current-page';
  page = await mini.currentPage();
  report.stage = 'initial-relaunch';
  await mini.reLaunch('/pages/table/table');
  await waitRoute('pages/table/table');
  report.stage = 'real-game-play-and-records-navigation';
  report.device = await mini.systemInfo();
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
  const firstSettled = await finishByFolding();
  const initialSession = (await readRecords())[0];
  const archived = initialSession.attempts[0];
  assert.equal(archived.status, 'completed');
  assert.deepEqual(archived.hole, firstSettled.players[0].hole);
  assert.equal(archived.profit, firstSettled.payouts[0] - firstSettled.players[0].total);
  await capture('01-first-settlement');
  const liveSettlementGeometry = await tableGeometry(firstSettled.players);
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
  await capture('02-resources-menu');
  await tap('#resource-records');
  await waitRoute('pages/records/records');
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
    (view) => view.sessions[0]?.attempts.at(-1)?.status === 'completed',
  );
  const recordsView = await page.data();
  assert.equal(recordsView.sessions[0].number, initialSession.number);
  assert.deepEqual(
    recordsView.sessions[0].attempts.map((row) => [row.hand, row.attempt]),
    [
      [1, 0],
      [1, 1],
      [2, 0],
    ],
  );
  assert.deepEqual(
    recordsView.sessions[0].attempts.map((row) => row.attemptText),
    ['', '重打1', ''],
  );
  for (const session of recordsView.sessions) {
    assert.match(session.profitText, /^[+-]\d/);
    if (session.profit === 0) assert.equal(session.profitText, '+0');
    for (const attempt of session.attempts) {
      if (attempt.status !== 'completed') continue;
      assert.match(attempt.profitText, /^[+-]\d/);
      if (attempt.profit === 0) {
        assert.equal(attempt.profitText, '+0');
        assert.equal(attempt.resultText, '');
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
  await capture('03-records-list');
  report.checks.push({
    name: 'real-records-page-ascending-attempts-graphic-cards-live-progress',
    historyBefore: beforeBrowse.history.length,
    historyAfter: liveCompleted.history.length,
  });
  await tap(`.hand-item[data-id="${archived.id}"]`);
  await waitRoute('pages/history/history');
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
  assert.ok(await page.$('.activity-panel'));
  await capture('04-historical-settlement');
  const historySettlementGeometry = await tableGeometry(archived.snapshot.players);
  assertTableParity(historySettlementGeometry, liveSettlementGeometry);
  report.geometry = { live: liveSettlementGeometry, historical: historySettlementGeometry };
  report.checks.push({ name: 'historical-settlement-uses-the-same-rendered-table-geometry' });
  const liveBeforeReview = await readLive();
  await tap('.review-button');
  await wait(
    'Archived review',
    () => page.data(),
    (view) => view.reviewOpen && !view.reviewData.loading,
  );
  assert.equal((await page.data()).reviewData.hand, 1);
  assert.deepEqual(await readLive(), liveBeforeReview);
  assert.deepEqual((await readRecords())[0].attempts[0].snapshot, archived.snapshot);
  await capture('05-historical-review');
  report.checks.push({
    name: 'separate-historical-page-readonly-review-does-not-mutate-live-or-archive',
  });
  await mini.evaluate(() => getCurrentPages().at(-1).closeReview());
  await tap('#history-back');
  await waitRoute('pages/records/records');
  assert.equal((await page.data()).expanded[initialSession.id], true);
  await tap('#records-back');
  await waitRoute('pages/table/table');
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
  assert.equal(report.exceptions.length, 0);
  const currentBuild = JSON.parse(
    await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
  );
  assert.equal(
    currentBuild.sourceDigest,
    report.build.sourceDigest,
    'Installed mini-program bundle stayed unchanged',
  );
  report.stage = 'complete';
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}
console.log(`WeChat records passed: ${report.checks.length} checks`);
