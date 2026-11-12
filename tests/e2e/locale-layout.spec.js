import { test, expect } from '@playwright/test';

// Translated table chrome keeps the Simplified Chinese layout on phones:
// short labels stay on one line instead of wrapping beneath their slot.
const locales = ['en', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru'];

async function switchLocale(page, locale) {
  await page.locator('#language-select').evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }, locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

const lines = (element) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0.5);
  const tops = [];
  for (const r of rects)
    if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top);
  const last = rects.filter((r) => Math.abs(r.top - tops.at(-1)) < r.height / 2);
  return {
    count: tops.length,
    lastWidth: last.reduce((sum, r) => sum + r.width, 0),
    width: element.getBoundingClientRect().width,
  };
};

for (const [width, height] of [
  [360, 740],
  [390, 844],
]) {
  test(`translated waiting header and game info stay compact at ${width}px`, async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Explicit phone sizes run once');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    for (const locale of locales) {
      await switchLocale(page, locale);
      await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'waiting');
      await expect
        .poll(
          () =>
            page.evaluate((measure) => {
              const lines = new Function(`return ${measure}`)();
              const waiting = lines(document.querySelector('#street-label'));
              return {
                // Two lines are allowed only when balanced: no lone last word.
                waiting:
                  waiting.count === 1 ||
                  (waiting.count === 2 && waiting.lastWidth >= waiting.width * 0.3),
                info: [...document.querySelectorAll('.game-info-stats dt')].every(
                  (dt) => lines(dt).count === 1,
                ),
              };
            }, lines.toString()),
          `${locale} ${width}px`,
        )
        .toEqual({ waiting: true, info: true });
    }
  });
}

test('every translated locale labels posted blinds SB / BB beside the amount', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Explicit phone size runs once');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  for (const locale of locales) {
    await switchLocale(page, locale);
    await page.evaluate(() => (window.qa.heroTurn(6), window.qa.stop()));
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('.seat .seat-action-label')]
              .filter((label) => /^(SB|BB)$/.test(label.textContent))
              .map((label) => {
                const amount = label.nextElementSibling.getBoundingClientRect();
                const box = label.getBoundingClientRect();
                return `${label.textContent}:${Math.abs(box.top + box.height / 2 - amount.top - amount.height / 2) < 4}`;
              })
              .sort(),
          ),
        locale,
      )
      .toEqual(['BB:true', 'SB:true']);
  }
});
