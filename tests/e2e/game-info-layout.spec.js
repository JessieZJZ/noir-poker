import { test, expect } from '@playwright/test';

const tablets = [
  [768, 1024],
  [800, 1280],
  [820, 1180],
  [834, 1194],
  [1024, 1366],
  [1032, 1376],
];

for (const size of tablets) {
  for (const [width, height] of [size, [...size].reverse()]) {
    test(`game information uses the card width and readable type at ${width}x${height}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name === 'mobile', 'Explicit tablet matrix runs once');
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() =>
        localStorage.setItem(
          'noir-table-v1',
          JSON.stringify({ playerCount: 9, stakes: { smallBlind: 10000, bigBlind: 20000 } }),
        ),
      );
      await page.goto('/');
      await expect(page.locator('.game-info')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // Exercise the depleted stack / signed change shown in the report, and
      // wide values. Only presentation text changes; gameplay stays untouched.
      for (const values of [
        { stack: '0', change: '-2M', hands: '11', wins: '8', rate: '73%' },
        { stack: '19.95M', change: '+17.95M', hands: '999', wins: '998', rate: '100%' },
      ]) {
        await page.evaluate((values) => {
          for (const [id, value] of Object.entries({
            'info-stack': values.stack,
            'info-change': values.change,
            'info-hands': values.hands,
            'info-wins': values.wins,
            'info-winrate': values.rate,
          }))
            document.getElementById(id).textContent = value;
        }, values);
        await expect
          .poll(() =>
            page.evaluate(() => {
              const card = document.querySelector('.game-info');
              const rect = card.getBoundingClientRect();
              const title = card.querySelector('h2');
              const stats = card.querySelector('.game-info-stats');
              const columns = [...stats.children].map((el) => el.getBoundingClientRect());
              const values = [...stats.querySelectorAll('dd')];
              const tops = values.map((el) => el.getBoundingClientRect().top);
              return {
                fullWidth: stats.getBoundingClientRect().width >= rect.width * 0.9,
                titleAligned: Math.abs(title.getBoundingClientRect().left - columns[0].left) < 1,
                lastAligned:
                  Math.abs(
                    columns.at(-1).right -
                      card.querySelector('.section-title').getBoundingClientRect().right,
                  ) < 1,
                titleFont: parseFloat(getComputedStyle(title).fontSize) >= 16,
                terms: [...stats.querySelectorAll('dt')].every(
                  (el) => parseFloat(getComputedStyle(el).fontSize) >= 14,
                ),
                numbers: values.every((el) => parseFloat(getComputedStyle(el).fontSize) >= 20),
                noClipping: values.every(
                  (el) =>
                    el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1,
                ),
                sharedValueRow: Math.max(...tops) - Math.min(...tops) < 1,
                firstScreen: rect.bottom <= innerHeight + 1,
                noOverflow: document.documentElement.scrollWidth <= innerWidth,
              };
            }),
          )
          .toEqual({
            fullWidth: true,
            titleAligned: true,
            lastAligned: true,
            titleFont: true,
            terms: true,
            numbers: true,
            noClipping: true,
            sharedValueRow: true,
            firstScreen: true,
            noOverflow: true,
          });
      }
      await page
        .locator('.game-info')
        .screenshot({ path: info.outputPath('tablet-game-info.png') });
    });
  }
}
