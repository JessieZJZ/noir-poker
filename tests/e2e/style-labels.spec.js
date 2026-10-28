import { test, expect } from '@playwright/test';
import { BOT_PROFILES } from '../../src/engine/bot-profiles.js';
const profiles = BOT_PROFILES.map((profile) => profile.id);
const sizes = [
  [320, 568],
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1024, 1366],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
];
for (const [width, height] of sizes) {
  test(`complete style tags preserve original columns on live and archived 5–9 seat tables at ${width}x${height}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Viewport matrix is explicit; do not duplicate it');
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => document.fonts.ready);
    for (const count of [5, 6, 7, 8, 9]) {
      for (const phase of ['live', 'archive']) {
        if (phase === 'live')
          await page.evaluate(
            ({ count, profiles }) =>
              window.qa.recordsStart({
                count,
                styles: Array.from(
                  { length: count - 1 },
                  (_, i) => profiles[(i + count) % profiles.length],
                ),
              }),
            { count, profiles },
          );
        else {
          await page.evaluate(() => window.qa.recordsFinish());
          await page.locator('#rules-button').click();
          await page.locator('#records-menu-item').click();
          await page.locator('button.record-hand').first().click();
          await expect(page.locator('#history-table')).toBeVisible();
        }
        const labels = page.locator(
          phase === 'live' ? '#seats .seat-style-label' : '#history-table .seat-style-label',
        );
        await expect
          .poll(() =>
            labels.evaluateAll((labels) =>
              labels.every((el) => {
                const r = el.getBoundingClientRect(),
                  p = el.closest('.seat-profile').getBoundingClientRect();
                return (
                  el.textContent === el.dataset.fullName &&
                  el.scrollWidth <= el.clientWidth + 1 &&
                  el.scrollHeight <= el.clientHeight + 1 &&
                  r.left >= p.left - 1 &&
                  r.right <= p.right + 1 &&
                  r.bottom <= p.bottom + 1 &&
                  getComputedStyle(el).textOverflow !== 'ellipsis' &&
                  getComputedStyle(el).whiteSpace === 'nowrap' &&
                  r.left >=
                    el.closest('.seat-profile').querySelector('.avatar').getBoundingClientRect()
                      .right &&
                  el.closest('.seat-profile').querySelector('.seat-stack').getBoundingClientRect()
                    .top >=
                    r.bottom - 1
                );
              }),
            ),
          )
          .toBe(true);
        expect(await labels.count()).toBe(count - 1);
        expect(await page.locator('#seat-name-tooltip').count()).toBe(0);
        if (count === 9 && phase === 'archive')
          await page.screenshot({ path: info.outputPath(`${width}-${height}-9seats.png`) });
        if (phase === 'archive') {
          await page.goto('/');
          await page.waitForFunction(() => !!window.qa);
        }
      }
    }
  });
}
test('localized styles fit one line completely and holding a label never opens an overlay', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate((profiles) => {
    window.qa.recordsStart({ count: 9, styles: profiles });
    window.qa.stop();
  }, profiles);
  for (const locale of ['en', 'de', 'fr', 'ru', 'ja', 'ko', 'es', 'it', 'pt', 'zh-TW', 'zh-CN']) {
    await page.locator('#language-select').evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('change'));
    }, locale);
    await expect
      .poll(() =>
        page
          .locator('#seats .seat-style-label')
          .evaluateAll(
            (labels, count) =>
              labels.length === count &&
              labels.every(
                (el) =>
                  el.textContent === el.dataset.fullName &&
                  getComputedStyle(el).textOverflow !== 'ellipsis' &&
                  getComputedStyle(el).whiteSpace === 'nowrap' &&
                  el.scrollWidth <= el.clientWidth + 1 &&
                  el.scrollHeight <= el.clientHeight + 1,
              ),
            profiles.length,
          ),
      )
      .toBe(true);
  }
  const box = await page.locator('#seats .seat-style-label').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect(page.locator('#seat-name-tooltip')).toHaveCount(0);
});
