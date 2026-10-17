// External DevTools fixture, excluded from production bundles.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pairedFlushReviewGame } from '../fixtures/paired-flush-review.js';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || '.artifacts/compact-tags/wechat');
await mkdir(output, { recursive: true });
const report = { status: 'running', checks: [], exceptions: [] };
const mini = await automator.connect({ wsEndpoint: process.argv[2] });
mini.on('exception', (error) => report.exceptions.push(String(error)));
try {
  report.build = JSON.parse(await readFile(path.join(root, '.artifacts/wechat/build-info.json')));
  report.stage = 'launch';
  await mini.reLaunch('/pages/table/table');
  const page = await mini.currentPage();
  const wait = async (predicate) => {
    const started = Date.now();
    while (!predicate(await page.data())) {
      if (Date.now() - started > 45000) throw Error('DevTools page did not reach ' + report.stage);
      await page.waitFor(100);
    }
  };
  report.stage = 'reported-public-line';
  await mini.evaluate(
    (snapshot) => {
      const controller = getCurrentPages().at(-1)._controller;
      controller.hide();
      controller.setPreference('playerCount', 9);
      controller.setPreference('stakes', snapshot.stakes);
      controller.reset();
      Object.assign(controller.getGame(), snapshot);
      controller.show();
    },
    JSON.parse(JSON.stringify(pairedFlushReviewGame())),
  );
  await wait((data) => data.done && data.seats.length === 8);
  await page.waitFor(1450);
  report.stage = 'compact-tags-and-eyes';
  for (let id = 1; id <= 8; id++) {
    const tag = await page.$(`.seat .position[data-id="${id}"]`),
      eye = await page.$(`.seat-eye[data-id="${id}"]`),
      font = parseFloat(await tag.style('font-size')),
      width = parseFloat(await eye.style('width'));
    assert.ok(font >= 14 && font <= 15, 'Phone position tags use the normal or short-screen size');
    assert.equal(width, 20);
    assert.ok(width > font);
    report.checks.push({ name: 'seat-' + id, positionFont: font, eyeWidth: width });
  }
  await (await page.$('.seat-eye[data-id="1"]')).tap();
  await wait((data) => data.seats.find((seat) => seat.id === 1)?.revealed);
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, 'larger-inspection-eyes.png') });
  report.checks.push({ name: 'larger-eye-still-reveals-folded-hand', revealed: true });
  report.stage = 'review';
  await mini.evaluate(() => getCurrentPages().at(-1).openReview());
  await wait((data) => data.reviewData && !data.reviewData.loading && data.selectedReviewStep);
  const last = (await page.data()).reviewSteps.length - 1;
  await mini.evaluate(
    (index) =>
      getCurrentPages()
        .at(-1)
        .selectReviewStep({ currentTarget: { dataset: { index } } }),
    last,
  );
  await wait((data) => data.reviewIndex === last);
  const data = await page.data();
  const group = data.selectedReviewStep.commentary
    .flatMap((part) => part.matchups?.groups || [])
    .find((group) => group.direction === 'behind');
  assert.deepEqual(
    group.examples.map((example) => example.label),
    ['顺子', '三条', '葫芦', '同花'],
  );
  const rows = await page.$$('[data-matchup-direction="behind"] .review-matchup-example');
  assert.equal(rows.length, 4);
  assert.match(await rows[3].text(), /♠.*同花/);
  report.checks.push({ name: 'four-distinct-winning-hands', examples: group.examples });
  const scroll = await page.$('.review-sheet .sheet-scroll'),
    target = await page.$('[data-matchup-direction="behind"]');
  const targetOffset = await target.offset(),
    scrollOffset = await scroll.offset();
  await scroll.scrollTo(
    0,
    (await scroll.property('scrollTop')) + targetOffset.top - scrollOffset.top - 20,
  );
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, 'four-stronger-hand-types.png') });
  assert.deepEqual(report.exceptions, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  throw error;
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await mini.disconnect();
}
