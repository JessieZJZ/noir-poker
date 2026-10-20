// DevTools rendering fixtures, separate from the real playback/gameplay suite.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const output = path.resolve(process.argv[3] || '.artifacts/review-layout/wechat');
await mkdir(output, { recursive: true });
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const report = {
  status: 'running',
  scope:
    'Real DevTools renderer with 1/2/3/4-card display fixtures; not gameplay or a physical client',
  checks: [],
  exceptions: [],
};
mini.on('exception', (error) => report.exceptions.push(error));
const fields = [
  'tableReady',
  'reviewOpen',
  'reviewData',
  'reviewSteps',
  'reviewIndex',
  'selectedReviewStep',
  'reviewPerspective',
  'opponentOptions',
  'opponentFilter',
  'reviewActivityOpen',
  'reviewActivity',
];
let saved;
try {
  report.build = JSON.parse(
    await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
  );
  const page = await mini.currentPage();
  assert.equal(page.path, 'pages/table/table');
  const data = await page.data();
  assert.equal(data.tableReady, true);
  assert.equal(data.heroCards.length, 2);
  saved = Object.fromEntries(fields.map((key) => [key, data[key]]));
  await page.setData({ tableReady: false });
  assert.equal(await page.$('.nav'), null);
  const launch = await page.$('.launch-screen image');
  assert.equal(await launch.attribute('src'), '/assets/launch-icon.png');
  await mini.screenshot({ path: path.join(output, 'launch-artwork.png') });
  await page.setData({ tableReady: true });
  assert.ok(await page.$('.nav'));
  report.startup = { initializedHand: true, launchFixtureHidesNavigation: true };
  await mini.evaluate(() => getCurrentPages().at(-1).setOverlay({ reviewOpen: true }));
  for (const perspective of ['hero', 'opponent'])
    for (const count of [1, 2, 3, 4]) {
      const steps = Array.from({ length: count }, (_, index) => ({
        index,
        name: 'Mia',
        street: ['翻牌前', '翻牌', '转牌', '河牌'][index],
        position: 'SB',
        actual: index ? '过牌' : '跟注 3.1K',
        keep: false,
        label:
          perspective === 'opponent'
            ? ['ST', '谭老板，Tan Xuan', '阿宝，KPC A Bao', 'Peter，HCL'][index]
            : ['待分析', '弃牌', '待分析', '弃牌'][index],
      }));
      await page.setData({
        reviewOpen: true,
        reviewPerspective: perspective,
        reviewData: { hand: 1, resultContext: '复盘布局验证', profit: '0', loading: false },
        reviewSteps: steps,
        reviewIndex: 0,
        selectedReviewStep: null,
        opponentOptions: ['全部对手'],
        opponentFilter: 0,
        reviewActivityOpen: true,
        reviewActivity: [
          { key: 'layout', text: '你 SB 跟注 3.1K', current: true, emphasized: true },
        ],
      });
      const track = await page.$('.review-timeline'),
        cards = await page.$$('.review-step');
      assert.equal(cards.length, count);
      const hint = (await track.attribute('class')).includes('has-overflow');
      assert.equal(hint, count > 2);
      const evidence = { perspective, count, hint, width: (await cards[0].size()).width };
      evidence.tags = [];
      const tags = await page.$$('.review-timeline .review-label');
      assert.equal(tags.length, perspective === 'hero' ? count : 0);
      for (let index = 0; index < cards.length; index++) {
        const card = cards[index];
        assert.equal(await (await card.$('.review-step-number')).text(), String(index + 1));
        assert.ok((await (await card.$('.review-step-meta')).text()).trim());
        assert.equal(await (await card.$('.review-step-action')).text(), steps[index].actual);
      }
      for (const tag of tags) {
        const height = (await tag.size()).height;
        const lineHeight = parseFloat(await tag.style('line-height'));
        const top = parseFloat(await tag.style('padding-top'));
        const bottom = parseFloat(await tag.style('padding-bottom'));
        assert.equal(top, 4);
        assert.equal(bottom, 4);
        const lines = (height - top - bottom) / lineHeight;
        assert.ok(Math.abs(lines - Math.round(lines)) < 0.07);
        evidence.tags.push({ text: await tag.text(), height, lines });
      }
      if (perspective === 'hero') assert.ok(Math.abs(evidence.tags[0].lines - 1) < 0.07);
      if (count > 2) {
        const third = cards[2],
          box = await track.offset(),
          size = await track.size();
        evidence.fraction =
          (box.left + size.width - 2 - (await third.offset()).left) / (await third.size()).width;
        assert.ok(evidence.fraction > 0.45 && evidence.fraction < 0.55, JSON.stringify(evidence));
      }
      evidence.font = await (await page.$('.review-activity-event')).style('font-size');
      assert.equal(evidence.font, '13px');
      assert.equal(await (await page.$('.review-activity-event text')).style('font-size'), '13px');
      if (count === 4)
        await mini.screenshot({ path: path.join(output, `${perspective}-two-and-half.png`) });
      report.checks.push(evidence);
    }
  assert.deepEqual(report.exceptions, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack || error);
  throw error;
} finally {
  if (saved)
    await mini
      .evaluate((saved) => {
        const page = getCurrentPages().at(-1);
        page.setData(saved);
        page.setOverlay({ reviewOpen: saved.reviewOpen });
      }, saved)
      .catch(() => {});
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini.disconnect();
}
