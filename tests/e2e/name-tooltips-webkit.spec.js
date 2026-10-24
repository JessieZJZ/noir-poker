import { test, expect } from '@playwright/test';

test.use({ browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true });

test('WebKit long press opens an untruncated localized style without text selection', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('noir-locale', 'en'));
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.recordsStart({ count: 5 });
    window.qa.stop();
    return document.fonts.ready;
  });
  const label = page.locator('#seats .seat-style-label').first();
  await expect(label).toHaveAttribute('data-full-name', 'Balanced');
  const r = await label.boundingBox();
  await page.evaluate(() => {
    const scrolling = document.createElement('div');
    scrolling.style.cssText =
      'position:fixed;left:0;bottom:0;width:100px;height:10px;overflow:auto;white-space:nowrap';
    scrolling.textContent = 'Automatic hint scroll '.repeat(80);
    document.body.append(scrolling);
    window.__tooltipUnrelatedScroll = setInterval(
      () => (scrolling.scrollLeft = (scrolling.scrollLeft + 3) % 300),
      16,
    );
  });
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(page.getByRole('tooltip')).toHaveText('Balanced');
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  await page.evaluate(() => clearInterval(window.__tooltipUnrelatedScroll));
  await page.locator('#arena .hero-identity').click();
  await expect(page.getByRole('tooltip')).toBeHidden();
});
