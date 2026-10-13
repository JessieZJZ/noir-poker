// Official DevTools test; fixtures are external and never bundled in the app.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { deceptiveRecords } from '../fixtures/deceptive-decisions.js';
const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || '.artifacts/wechat-deception');
fs.mkdirSync(output, { recursive: true });
const report = {
  platform: 'Official WeChat DevTools simulator',
  status: 'running',
  checks: [],
  exceptions: [],
};
const mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9463' });
mini.on('exception', (e) => report.exceptions.push(e));
const page = await mini.currentPage();
const invoke = (name, arg) =>
  mini.evaluate((name, arg) => getCurrentPages().at(-1)[name](arg), name, arg);
const wait = async (predicate) => {
  const started = Date.now();
  while (!predicate(await page.data())) {
    if (Date.now() - started > 45000) throw Error('Expected review state did not render');
    await page.waitFor(150);
  }
};
let original;
try {
  report.build = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/wechat/build-info.json')));
  await invoke('closeReview');
  while (!(await page.data()).done) {
    const phase = await mini.evaluate(() => {
      const g = getCurrentPages().at(-1)._controller.getGame();
      return { phase: g.phase, actor: g.actor };
    });
    if (phase.phase === 'playing' && phase.actor === 0)
      await invoke('act', { currentTarget: { dataset: { action: 'fold' } } });
    await invoke('finishHand');
    await wait((data) => data.done || data.actor === 0);
  }
  original = await mini.evaluate(() => {
    const g = getCurrentPages().at(-1)._controller.getGame();
    return { decisions: g.decisions, botDecisions: g.botDecisions };
  });
  const records = deceptiveRecords();
  await mini.evaluate((records) => {
    const g = getCurrentPages().at(-1)._controller.getGame();
    g.decisions = [];
    g.botDecisions = records;
  }, records);
  await invoke('openReview');
  await wait((data) => !data.reviewData.loading);
  await (await page.$('[data-value="opponent"]')).tap();
  await wait(
    (data) => data.reviewPerspective === 'opponent' && data.reviewSteps.length === records.length,
  );
  const expected = [
    /(?=.*埋牌)(?=.*(?:平跟|只补))/,
    /(?=.*埋牌)(?=.*过牌)/,
    /(?=.*埋牌)(?=.*只跟)/,
    /脏牌开池/,
    /脏牌再加注/,
    /donk.*先领打/,
    /donk.*付费/,
    /2–7.*(?:开池|偷盲)/,
    /(?=.*2–7)(?=.*本轮已经过牌)(?=.*诈唬)/,
  ];
  for (let i = 0; i < records.length; i++) {
    await (await page.$(`.review-step[data-index="${i}"]`)).tap();
    await wait((data) => data.reviewIndex === i);
    const step = (await page.data()).selectedReviewStep;
    assert.match(step.reason, expected[i]);
    assert.match(await (await page.$('.review-coaching text')).text(), expected[i]);
    assert.ok(step.metrics.length <= 2);
    assert.doesNotMatch(step.metrics.join(''), /随机范围估计|抽样\s*\d+\s*次|价格门槛/);
    assert.equal(await page.$('.review-choice'), null);
    assert.equal(await page.$('.review-comparison'), null);
    report.checks.push({
      fixture: records[i].fixture,
      action: records[i].action,
      reason: step.reason,
    });
    if ([1, 4, 5, 8].includes(i)) {
      const scroll = await page.$('.review-sheet .sheet-scroll');
      const body = await scroll.offset();
      const reason = await (await page.$('.review-coaching')).offset();
      await scroll.scrollTo(0, (await scroll.property('scrollTop')) + reason.top - body.top - 12);
      await page.waitFor(1450);
      await mini.screenshot({ path: path.join(output, records[i].fixture + '.png') });
    }
  }
  assert.equal(report.exceptions.length, 0);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = e.stack;
  throw e;
} finally {
  if (original) {
    await invoke('closeReview');
    await mini.evaluate((original) => {
      Object.assign(getCurrentPages().at(-1)._controller.getGame(), original);
    }, original);
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini.disconnect();
}
console.log('Official WeChat deceptive review checks:', report.checks.length);
