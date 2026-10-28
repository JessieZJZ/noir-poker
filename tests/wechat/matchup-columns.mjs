// External renderer fixture: real public-snapshot examples, no production QA hook.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { aceFourPreflopReview } from '../fixtures/bottom-pair-review.js';
import { heroValueGame } from '../fixtures/review-spots.js';
import { pairedFlushReviewGame } from '../fixtures/paired-flush-review.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups, matchupPresentation } from '../../src/review/matchups.js';

const require = createRequire(path.join(process.cwd(), '.artifacts/wechat-tools/package.json'));
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const output = path.resolve(process.argv[3] || '.artifacts/wechat-matchup-columns');
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  scope: 'Actual DevTools renderer with external public-snapshot display fixtures',
  checks: [],
};
let page, saved;
const keys = [
  'reviewOpen',
  'reviewData',
  'reviewSteps',
  'reviewIndex',
  'selectedReviewStep',
  'reviewPerspective',
];
try {
  report.build = JSON.parse(await readFile('.artifacts/wechat/build-info.json', 'utf8'));
  report.device = await mini.evaluate(() => {
    const { model } = wx.getDeviceInfo();
    const { windowWidth, windowHeight } = wx.getWindowInfo();
    return { model, windowWidth, windowHeight };
  });
  page = await mini.currentPage();
  let data = await page.data();
  if (process.env.NOIR_WECHAT_ORIENTATION) {
    const landscape = process.env.NOIR_WECHAT_ORIENTATION === 'landscape';
    const deadline = Date.now() + 30000;
    console.log('Waiting for DevTools viewport: ' + process.env.NOIR_WECHAT_ORIENTATION);
    while (data.windowWidth > data.windowHeight !== landscape && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      data = await page.data();
    }
    assert.equal(data.windowWidth > data.windowHeight, landscape);
  }
  report.viewport = { width: data.windowWidth, height: data.windowHeight };
  saved = Object.fromEntries(keys.map((key) => [key, data[key]]));
  await mini.evaluate(() => getCurrentPages().at(-1).setOverlay({ reviewOpen: true }));
  const snapshots = [
    aceFourPreflopReview(),
    heroValueGame('overpair').decisions.find((s) => s.street === 1),
    pairedFlushReviewGame().decisions.findLast((s) => s.street === 3),
  ];
  for (const perspective of ['hero', 'opponent'])
    for (const snapshot of snapshots) {
      const presentation = matchupPresentation(
        handMatchups(snapshot, decisionContext(snapshot)),
        snapshot.street,
      );
      const step = {
        index: 0,
        name: 'Alex',
        street: ['翻牌前', '翻牌', '转牌', '河牌'][snapshot.street],
        position: 'SB',
        actual: '跟注',
        label: '需要比较',
        cards: [],
        board: [],
        pot: '100',
        stack: '20K',
        paragraphs: ['复盘分析总结'],
        commentary: [{ text: '复盘分析总结' }, { matchups: presentation }],
      };
      await page.setData({
        reviewOpen: true,
        reviewPerspective: perspective,
        reviewData: { loading: false, hand: 1, resultContext: '', profit: '0' },
        reviewSteps: [step],
        reviewIndex: 0,
        selectedReviewStep: step,
      });
      const groups = [];
      for (const group of await page.$$('.review-matchup-examples')) {
        const items = [];
        for (const item of await group.$$('.review-matchup-example'))
          items.push({ text: await item.text(), ...(await item.offset()), ...(await item.size()) });
        assert.ok(items.length > 0);
        for (let i = 1; i < items.length; i += 2) {
          assert.ok(Math.abs(items[i].top - items[i - 1].top) <= 1);
          assert.ok(items[i].left >= items[i - 1].left + items[i - 1].width);
        }
        if (items.length > 2) assert.ok(items[2].top >= items[0].top + items[0].height);
        groups.push(items);
      }
      assert.ok(groups.some((items) => items.length >= 2));
      const scroll = await page.$('.review-sheet .sheet-scroll'),
        target = await page.$('.review-matchup-examples');
      await scroll.scrollTo(
        0,
        (await scroll.property('scrollTop')) +
          (await target.offset()).top -
          (await scroll.offset()).top -
          60,
      );
      await mini.screenshot({ path: path.join(output, `${perspective}-${snapshot.street}.png`) });
      report.checks.push({ perspective, street: snapshot.street, groups });
    }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  process.exitCode = 1;
} finally {
  if (saved) {
    await page.setData(saved);
    await mini.evaluate(
      (reviewOpen) => getCurrentPages().at(-1).setOverlay({ reviewOpen }),
      saved.reviewOpen,
    );
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini.disconnect();
}
console.log(
  JSON.stringify({
    status: report.status,
    device: report.device,
    checks: report.checks.length,
    error: report.error,
  }),
);
