import { test, expect } from '@playwright/test';
import { readTableLayout, assertTableLayout } from '../native/layout.mjs';

for (const width of [320, 390, 820, 1032]) {
  test(`centered public cards, rail seats and single-line persona labels at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1376 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => document.fonts.ready);
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      assertTableLayout(await page.evaluate(readTableLayout));
      const text = await page
        .locator('.seat-profile')
        .first()
        .evaluate((el) => {
          const font = (selector) =>
            parseFloat(getComputedStyle(el.querySelector(selector)).fontSize);
          return {
            name: font('strong'),
            stack: font('.seat-stack'),
            persona: font('.seat-style-label'),
          };
        });
      expect(text.name).toBeGreaterThanOrEqual(width > 600 ? 21 : 13);
      expect(text.stack).toBeGreaterThanOrEqual(width > 600 ? 20 : 13);
      expect(text.persona).toBeGreaterThanOrEqual(width > 600 ? 16 : 12);
      const labels = await page.locator('.seat-style-label').evaluateAll((elements) =>
        elements.map((el) => {
          const a = el.closest('.seat').querySelector('.avatar').getBoundingClientRect();
          const r = el.getBoundingClientRect(),
            s = getComputedStyle(el);
          const arena = document.querySelector('#arena'),
            scale = arena.getBoundingClientRect().width / arena.offsetWidth;
          return { gap: (r.left - a.right) / scale, wrap: s.whiteSpace, overflow: s.textOverflow };
        }),
      );
      for (const label of labels) {
        expect(Math.abs(label.gap - 4)).toBeLessThanOrEqual(0.1);
        expect(label.wrap).toBe('nowrap');
        expect(label.overflow).toBe('ellipsis');
      }
      await page.evaluate((count) => window.qa.publicBoard(count), count);
      expect(await page.locator('#board .card-art > rect').count()).toBe(0);
      assertTableLayout(await page.evaluate(readTableLayout));
    }
    await page.locator('#opponents-button').click();
    await page.locator('[data-bot-seat="3"]').selectOption('viktor');
    await page.locator('[data-bot-seat="4"]').selectOption('haxton');
    await page.locator('#opponents-dialog .close-dialog').click();
    await page.evaluate(() => window.qa.heroTurn(9));
    for (const id of [3, 4]) {
      const tag = await page.locator(`.seat-${id} .seat-style-label`).evaluate((el) => {
        const r = el.getBoundingClientRect(),
          p = el.closest('.seat-profile'),
          b = p.getBoundingClientRect();
        const scale =
          document.querySelector('#arena').getBoundingClientRect().width /
          document.querySelector('#arena').offsetWidth;
        return {
          truncated: el.scrollWidth > el.clientWidth,
          right: r.right,
          availableRight: b.right - parseFloat(getComputedStyle(p).paddingRight) * scale,
        };
      });
      expect(tag.right).toBeLessThanOrEqual(tag.availableRight + 1);
      if (tag.truncated) expect(Math.abs(tag.right - tag.availableRight)).toBeLessThanOrEqual(1);
    }
  });
}

test('sticky header covers the table and native safe area with an opaque background', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '47px');
    window.scrollTo(0, 240);
  });
  const header = await page.locator('.header').evaluate((el) => {
    const style = getComputedStyle(el),
      cap = getComputedStyle(el, '::before');
    return {
      background: style.backgroundColor,
      capBackground: cap.backgroundColor,
      capHeight: parseFloat(cap.height),
      top: el.getBoundingClientRect().top,
    };
  });
  expect(header.background).toBe('rgb(10, 16, 22)');
  expect(header.capBackground).toBe(header.background);
  expect(header.capHeight).toBe(47);
  expect(header.top).toBe(47);
});
