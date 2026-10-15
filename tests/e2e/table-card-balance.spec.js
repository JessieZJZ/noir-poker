import { test, expect } from '@playwright/test';

const viewports = [
  [320, 568],
  [320, 900],
  [390, 844],
  [440, 956],
  [820, 1180],
  [1280, 900],
];

async function ready(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => document.fonts.ready);
}

function balance() {
  const box = (element) => element.getBoundingClientRect();
  const arena = document.querySelector('#arena');
  const scale = box(arena).width / arena.offsetWidth;
  const hero = [...document.querySelectorAll('#hero-cards .playing-card')].map(box);
  const board = [...document.querySelectorAll('#board > *')].map(box);
  const players = [...document.querySelectorAll('.seat-profile')].map(box);
  const distance = (a, b) =>
    Math.hypot(
      Math.max(0, a.left - b.right, b.left - a.right),
      Math.max(0, a.top - b.bottom, b.top - a.bottom),
    );
  const felt = box(document.querySelector('.poker-table'));
  return {
    scale,
    rows: arena.classList.contains('public-two-rows') ? 2 : 1,
    heroWidth: hero[0].width,
    publicWidth: board[0].width,
    heroGap: Math.min(...hero.flatMap((a) => players.map((b) => distance(a, b)))),
    publicGap: Math.min(...board.flatMap((a) => players.map((b) => distance(a, b)))),
    feltGap: Math.min(...board.flatMap((a) => [a.left - felt.left, felt.right - a.right])),
    height: box(document.querySelector('.table-viewport')).height,
    names: [...document.querySelectorAll('.seat-name-label')].map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return {
        name: el.textContent,
        shown: el.clientWidth * scale,
        needed: range.getBoundingClientRect().width,
        eye: !!el.parentElement.querySelector('.seat-peek'),
      };
    }),
  };
}

for (const [width, height] of viewports) {
  test(`balanced card faces and clear player gaps at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await ready(page);
    for (const count of [5, 7, 9]) {
      let live;
      for (const done of [false, true]) {
        await page.evaluate(
          ({ count, done }) => {
            if (done)
              window.qa.scene('9s Jd', '4d 2h Ah Qs 9h', {
                count,
                totals: Array(count).fill(200),
                folded: [0, 2],
                otherHoles: { 1: 'As Ad', 3: 'Kh Qh' },
              });
            else window.qa.heroTurn(count);
            window.qa.stop();
          },
          { count, done },
        );
        await expect
          .poll(async () => {
            const value = await page.evaluate(balance);
            return value.heroWidth / value.publicWidth;
          })
          .toBeLessThanOrEqual(1.4);
        const current = await page.evaluate(balance);
        expect(current.publicWidth / current.heroWidth).toBeLessThanOrEqual(1.4);
        expect(current.heroGap).toBeGreaterThanOrEqual(current.scale * 17 - 0.75);
        expect(current.publicGap).toBeGreaterThanOrEqual(current.scale * 15 - 0.75);
        expect(current.feltGap).toBeGreaterThanOrEqual(current.scale * 15 - 0.75);
        expect(current.publicWidth).toBeGreaterThanOrEqual(height <= 600 ? 27 : 32);
        if (width === 390 && count === 9) {
          expect(current.rows).toBe(2);
          expect(current.publicWidth).toBeGreaterThanOrEqual(42);
        }
        if (width === 820) expect(current.rows).toBe(1);
        if (!done) {
          live = current;
          for (const name of current.names) {
            expect(name.eye).toBe(false);
            expect(name.needed, name.name).toBeLessThanOrEqual(name.shown + 1);
          }
        } else {
          expect(current.height).toBeCloseTo(live.height, 1);
          expect(current.heroWidth).toBeCloseTo(live.heroWidth, 1);
          expect(current.publicWidth).toBeCloseTo(live.publicWidth, 1);
          expect(current.rows).toBe(live.rows);
        }
      }
      await page.screenshot({ path: test.info().outputPath(`${count}-players.png`) });
    }
  });
}

test('names use the empty inspection space in every position and badges keep inner space', async ({
  page,
}) => {
  await ready(page);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (let dealer = 0; dealer < 9; dealer++) {
      await page.evaluate((dealer) => {
        window.qa.heroTurn(9, false, dealer);
        window.qa.stop();
      }, dealer);
      await expect
        .poll(() =>
          page.locator('.seat-name-label').evaluateAll((elements) =>
            elements
              .filter((el) => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const text = range.getBoundingClientRect();
                const position = el.nextElementSibling.getBoundingClientRect();
                return text.right > position.left - 0.5;
              })
              .map((el) => ({
                name: el.textContent,
                position: el.nextElementSibling.textContent,
                shown: el.clientWidth,
                needed: el.scrollWidth,
                font: getComputedStyle(el).font,
                padding: getComputedStyle(el.nextElementSibling).padding,
                viewport: [innerWidth, innerHeight],
              })),
          ),
        )
        .toEqual([]);
    }
    const padding = await page.locator('.hero-identity .position-badge').evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.paddingTop, style.paddingBottom, style.paddingLeft, style.paddingRight].map(
        parseFloat,
      );
    });
    expect(padding[0]).toBeGreaterThanOrEqual(1);
    expect(padding[1]).toBeGreaterThanOrEqual(1);
    expect(padding[2]).toBeGreaterThanOrEqual(5);
    expect(padding[3]).toBeGreaterThanOrEqual(5);
  }
});

test('record chevrons are bare and vertically centered in session and hand items', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    window.qa.recordsStart({ count: 9 });
    window.qa.recordsFinish(1);
  });
  await page.locator('#rules-button').click();
  await page.locator('#records-menu-item').click();
  const heading = page.locator('.record-session-heading').first();
  const hand = page.locator('button.record-hand').first();
  const centers = async (item, arrow) =>
    item.evaluate((element, selector) => {
      const parent = element.getBoundingClientRect();
      const icon = element.querySelector(selector).getBoundingClientRect();
      return Math.abs((parent.top + parent.bottom - icon.top - icon.bottom) / 2);
    }, arrow);
  await expect.poll(() => centers(heading, '.record-session-chevron path')).toBeLessThan(1);
  await expect.poll(() => centers(hand, '.record-hand-arrow path')).toBeLessThan(1);
  const bare = await heading.locator('.record-session-chevron').evaluate((el) => {
    const style = getComputedStyle(el);
    return { border: parseFloat(style.borderWidth), background: style.backgroundColor };
  });
  expect(bare).toEqual({ border: 0, background: 'rgba(0, 0, 0, 0)' });
  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => centers(heading, '.record-session-chevron path')).toBeLessThan(1);
});
