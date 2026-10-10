import { test, expect } from '@playwright/test';
import { closeSettings } from './settings-helpers.js';

async function assertPublicArea(page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const overlaps = (a, b) =>
          a.left < b.right - 0.5 &&
          a.right > b.left + 0.5 &&
          a.top < b.bottom - 0.5 &&
          a.bottom > b.top + 0.5;
        const problems = [];
        const amount = box('#pot-value'),
          details = box('#pot-details-button'),
          compact = matchMedia(
            '(max-width: 900px), (max-width: 1100px) and (orientation: portrait)',
          ).matches,
          arena = compact ? box('.table-viewport') : box('#arena'),
          transform = getComputedStyle(document.querySelector('#arena')).transform,
          scale = transform === 'none' ? 1 : new DOMMatrix(transform).a,
          gap = 12 * scale;
        const group = box('.table-center'),
          table = box('.table-inner'),
          hero = box('.hero-area');
        if (Math.abs((group.left + group.right - table.left - table.right) / 2) > 1)
          problems.push('public group not horizontally centered');
        if (
          details.left < amount.right + 4 * scale ||
          Math.abs((details.top + details.bottom - amount.top - amount.bottom) / 2) > 1
        )
          problems.push('details not aligned to right of amount');
        const visible = (el) => !el.hidden && getComputedStyle(el).display !== 'none';
        const publicSelectors = ['.pot', '#board', '#board-caption'].filter((selector) =>
          visible(document.querySelector(selector)),
        );
        for (const selector of publicSelectors) {
          const rect = box(selector);
          if (rect.left < arena.left || rect.right > arena.right)
            problems.push(selector + ' overflow');
          for (const player of document.querySelectorAll(
            '.seat .mini-cards, .seat-profile, .seat .hand-rank, .seat .seat-action, .hero-cards',
          ))
            if (visible(player) && overlaps(rect, player.getBoundingClientRect()))
              problems.push(
                selector +
                  ' overlaps ' +
                  player.className +
                  ' seat ' +
                  player.closest('.seat')?.dataset.player,
              );
        }
        // Independently scan legal positions by pixel; a fixed low anchor
        // must fail even when it happens not to overlap any player.
        const parts = publicSelectors.map(box);
        const occupied = [
          ...document.querySelectorAll(
            '.seat .mini-cards, .seat-profile, .seat .seat-rank-slot, .seat .seat-action',
          ),
        ]
          .filter(visible)
          .map((el) => el.getBoundingClientRect());
        const min = table.top + gap;
        // The reserved gap starts at the visible tilted card edge, not its
        // unrotated flex wrapper. Scan independently inside that safe band.
        const heroTop = compact
          ? hero.top - 8 * scale
          : Math.min(
              hero.top,
              ...[...document.querySelectorAll('#hero-cards .playing-card')]
                .map((el) => el.getBoundingClientRect())
                .filter((r) => r.width > 0 && r.height > 0)
                .map((r) => r.top),
            );
        const max = Math.min(
          table.bottom - group.height - gap,
          heroTop - group.height - 24 * scale,
        );
        const ideal = table.top + table.height * 0.44 - group.height / 2;
        const clearAt = (top) =>
          parts.every((part) =>
            occupied.every(
              (r) =>
                r.left >= part.right + gap ||
                r.right <= part.left - gap ||
                top + part.bottom - group.top <= r.top - gap + 0.5 ||
                top + part.top - group.top >= r.bottom + gap - 0.5,
            ),
          );
        if (group.top < min - 0.5 || group.top > max + 0.5 || !clearAt(group.top)) {
          problems.push(
            `public group is outside a clear position: ${innerWidth}x${innerHeight}, ${document.querySelector('#arena').dataset.playerCount} players, ${document.querySelector('#arena').className}, top ${group.top}, min ${min}, max ${max}, scale ${scale}`,
          );
          for (const selector of publicSelectors) {
            const part = box(selector);
            for (const el of document.querySelectorAll(
              '.seat .mini-cards, .seat-profile, .seat .hand-rank, .seat .seat-action',
            )) {
              if (!visible(el)) continue;
              const r = el.getBoundingClientRect();
              if (
                r.left < part.right + gap &&
                r.right > part.left - gap &&
                part.bottom > r.top - gap + 0.5 &&
                part.top < r.bottom + gap - 0.5
              )
                problems.push(
                  `${selector} clearance vs ${el.className} player ${el.closest('.seat')?.dataset.player}: part ${JSON.stringify(part.toJSON())}, seat ${JSON.stringify(r.toJSON())}, gap ${gap}`,
                );
            }
          }
        }
        let best = Infinity;
        for (let top = Math.ceil(min); top <= max; top++)
          if (clearAt(top)) best = Math.min(best, Math.abs(top - ideal));
        if (ideal >= min && ideal <= max && clearAt(ideal)) best = 0;
        if (!Number.isFinite(best) || Math.abs(group.top - ideal) > best + 1.5)
          problems.push(
            `public group is farther from the upper felt anchor than necessary: actual ${Math.abs(group.top - ideal).toFixed(2)}, best ${best.toFixed(2)}`,
          );
        return problems;
      }),
    )
    .toEqual([]);
}

test('public areas stay closest to the upper felt anchor within the play viewport without covering players', async ({
  page,
}) => {
  // Each test traverses many complete table layouts; each assertion keeps
  // its own short retry limit so a geometry regression still fails promptly.
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => document.fonts.ready);
  for (const named of [false, true]) {
    if (named) {
      await page.locator('#opponents-button').click();
      await page.locator('#mix-opponents').click();
      await closeSettings(page);
    }
    for (const width of [320, 390, 768, 1115, 1280, 1700]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const count of [5, 6, 7, 8, 9]) {
        for (const settled of [false, true]) {
          await page.evaluate(
            ({ count, settled }) =>
              settled
                ? window.qa.scene('3s 8h', 'Ks 7s Jd 5c 9s', {
                    count,
                    totals: Array(count).fill(4500),
                    folded: Array.from({ length: count }, (_, id) => id).filter(
                      (id) => ![0, 1, 3].includes(id),
                    ),
                    otherHoles: { 1: 'As 8s', 3: 'Qs Kh' },
                  })
                : window.qa.publicBoard(count),
            { count, settled },
          );
          await assertPublicArea(page);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
      }
    }
  }
  await page.locator('#pot-details-button').click();
  await expect(page.locator('#pot-dialog')).toBeVisible();
});

test('public area re-centers on resize without a new render and reserves space for unusually tall player content', async ({
  page,
}) => {
  // Each test traverses many complete table layouts; each assertion keeps
  // its own short retry limit so a geometry regression still fails promptly.
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => document.fonts.ready);
  for (const count of [5, 6, 7, 8, 9]) {
    for (const settled of [false, true]) {
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.evaluate(
        ({ count, settled }) =>
          settled
            ? window.qa.scene('3s 8h', 'Ks 7s Jd 5c 9s', { count, totals: Array(count).fill(4500) })
            : window.qa.publicBoard(count),
        { count, settled },
      );
      for (const width of [1700, 320, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        await assertPublicArea(page);
      }
    }
  }
  // Stress the measured-space fallback instead of depending on a fixed retry cap.
  await page.addStyleTag({ content: '.seat-profile { padding-block: 150px !important; }' });
  await page.evaluate(() => window.qa.publicBoard(9));
  await assertPublicArea(page);
});
