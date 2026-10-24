import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openSettings, closeSettings } from './settings-helpers.js';
import { readTableLayout, assertTableLayout } from '../native/layout.mjs';
import {
  readRecordTableGeometry,
  recordGeometryDifferences,
} from '../fixtures/records-geometry.js';

async function prepare(page, size) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
}

async function geometry(page, selector) {
  return page.evaluate(readRecordTableGeometry, selector);
}

async function browserBars(page, height, scroll) {
  await page.evaluate(
    ({ height, scroll }) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: height });
      window.scrollTo(0, scroll);
      window.dispatchEvent(new Event('resize'));
      window.visualViewport.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    },
    { height, scroll },
  );
}

for (const count of [5, 9]) {
  test(`${count}-seat live and historical geometry stays fixed while scrolling and browser bars change`, async ({
    page,
  }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate((count) => {
      window.qa.recordsStart({ count });
      while (window.noir.getState().phase !== 'done') {
        window.qa.allinRest();
        window.qa.finish();
      }
    }, count);
    const before = await geometry(page, '#arena');
    for (const [height, scroll] of [
      [744, 300],
      [844, 0],
      [700, 180],
      [844, 0],
    ]) {
      await browserBars(page, height, scroll);
      await expect
        .poll(async () => recordGeometryDifferences(await geometry(page, '#arena'), before))
        .toEqual([]);
    }
    const attempt = await page.evaluate(() => window.noir.getRecords()[0].attempts[0]);
    await page.locator('#rules-button').click();
    await page.locator('#records-menu-item').click();
    await page.locator(`[data-record-hand="${attempt.id}"]`).click();
    const historical = await geometry(page, '#history-arena');
    expect(recordGeometryDifferences(historical, before)).toEqual([]);
    for (const [height, scroll] of [
      [744, 480],
      [844, 0],
      [700, 600],
      [844, 0],
    ]) {
      await browserBars(page, height, scroll);
      await expect
        .poll(async () =>
          recordGeometryDifferences(await geometry(page, '#history-arena'), historical),
        )
        .toEqual([]);
    }
    await page.screenshot({ path: test.info().outputPath(`stable-history-${count}.png`) });
  });
}

test('same-width mobile browser height changes do not refit the table but a real width change does', async ({
  page,
}) => {
  await prepare(page, { width: 390, height: 844 });
  await page.evaluate(() => window.qa.publicBoard(9));
  const before = await geometry(page, '#arena');
  for (const height of [744, 700, 844]) {
    await page.setViewportSize({ width: 390, height });
    await expect
      .poll(async () => recordGeometryDifferences(await geometry(page, '#arena'), before))
      .toEqual([]);
  }
  await page.setViewportSize({ width: 440, height: 956 });
  await expect
    .poll(async () => (await geometry(page, '#arena')).arena.width)
    .toBeGreaterThan(before.arena.width + 30);
});

test('larger fitted text keeps phone actions in the first screen and saved tables match live tables', async ({
  page,
}) => {
  const metrics = [];
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 440, height: 956 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    await prepare(page, size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect
        .poll(() =>
          page.locator('#call-button').evaluate((el) => el.getBoundingClientRect().bottom),
        )
        .toBeLessThanOrEqual(size.height);
      const metric = await page.locator('#arena').evaluate((arena) => {
        const scale = new DOMMatrix(getComputedStyle(arena).transform).a;
        const font = (selector) =>
          parseFloat(getComputedStyle(arena.querySelector(selector)).fontSize) * scale;
        return {
          name: font('.seat-name-label'),
          action: font('.seat-action'),
          persona: font('.seat-style-label'),
          position: font('.seat .position-badge'),
          hero: font('.hero-identity'),
        };
      });
      metrics.push({ ...size, count, ...metric });
      // The shortest nine-seat phone trades maximum type size for one-screen
      // play. These are actual painted sizes, including the arena transform.
      const primary =
        size.width === 320
          ? count === 9
            ? 7.5
            : 9.5
          : size.width === 375
            ? count === 9
              ? 9
              : 11.5
            : size.width === 390
              ? count === 9
                ? 11.5
                : 13
              : 12;
      expect(metric.name).toBeGreaterThanOrEqual(primary);
      expect(metric.action).toBeGreaterThanOrEqual(primary - 0.5);
      expect(metric.persona).toBeGreaterThanOrEqual(primary - 1.5);
      // Position tags deliberately use smaller type than the player's name.
      // Keep a painted-size floor; exact responsive sizes are also covered in
      // compact-tags-matchups.spec.js, including the working inspection eye.
      expect(metric.position).toBeGreaterThanOrEqual(primary * 0.6);
      expect(metric.position).toBeLessThan(metric.name);
      if (size.width === 390 || size.width === 320)
        await page.screenshot({
          path: test.info().outputPath(`readable-live-${size.width}-${count}.png`),
        });
    }
  }
  await test.info().attach('effective-fonts', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  await writeFile(test.info().outputPath('effective-fonts.json'), JSON.stringify(metrics, null, 2));
});

test('Chinese, Korean and long locale persona tags keep the same height without resetting practice', async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    await prepare(page, size);
    await page.locator('#opponents-button').click();
    await page.locator('[data-bot-seat="3"]').selectOption('rook');
    await page.locator('[data-bot-seat="4"]').selectOption('owen');
    await closeSettings(page);
    await page.evaluate(() => window.qa.heroTurn(9));
    const read = () =>
      page.evaluate(() => {
        const arena = document.querySelector('#arena'),
          scale = new DOMMatrix(getComputedStyle(arena).transform).a;
        const rows = [...arena.querySelectorAll('.seat-profile')].map((profile) => {
          const label = profile.querySelector('.seat-style-label');
          return {
            profile: profile.getBoundingClientRect().height,
            tag: label.getBoundingClientRect().height,
            font: parseFloat(getComputedStyle(label).fontSize) * scale,
            whiteSpace: getComputedStyle(label).whiteSpace,
            overflow: getComputedStyle(label).textOverflow,
          };
        });
        const { hand, phase, stakes, players, stats } = window.noir.getState();
        return {
          rows,
          height: arena.getBoundingClientRect().height,
          game: { hand, phase, stakes, players, stats },
        };
      });
    const before = await read();
    for (const locale of ['ko', 'de', 'en', 'fr', 'ru', 'ja', 'es', 'it', 'pt', 'zh-TW', 'zh-CN']) {
      await openSettings(page);
      await page.locator('#language-select').selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await closeSettings(page);
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(async () => {
          const current = await read();
          return recordGeometryDifferences(current, before, 0.5);
        })
        .toEqual([]);
      assertTableLayout(await page.evaluate(readTableLayout));
    }
    await page.screenshot({ path: test.info().outputPath(`locale-tag-height-${size.width}.png`) });
  }
});

test('player text, portraits and inspection leave real space inside all four profile borders', async ({
  page,
}) => {
  const measurements = [];
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1032, height: 1376 },
    { width: 1280, height: 900 },
  ]) {
    await prepare(page, size);
    for (const count of [5, 9]) {
      for (const state of ['live', 'settled']) {
        await page.evaluate(
          ({ count, state }) =>
            state === 'live' ? window.qa.heroTurn(count) : window.qa.shortAllinSettlement(count),
          { count, state },
        );
        const layout = await page.evaluate(readTableLayout);
        assertTableLayout(layout);
        expect(layout.profiles).toHaveLength(count - 1);
        expect(layout.profiles.every((profile) => profile.contentInsets)).toBe(true);
        measurements.push({
          ...size,
          count,
          state,
          scale: layout.scale,
          profiles: layout.profiles,
        });
        if (size.width === 390 && count === 9)
          await page.locator('#arena').screenshot({
            path: test.info().outputPath(`profile-padding-${state}-390.png`),
          });
      }
    }
  }
  await writeFile(
    test.info().outputPath('profile-content-insets.json'),
    JSON.stringify(measurements, null, 2),
  );
});

test('larger rotated hero faces use free felt space without covering cards, players or the fixed rank', async ({
  page,
}) => {
  const measurements = [];
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await prepare(page, size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.shortAllinSettlement(count), count);
      const metric = await page.locator('#arena').evaluate((arena) => {
        const scale = new DOMMatrix(getComputedStyle(arena).transform).a;
        const rect = (el) => el.getBoundingClientRect();
        const overlap = (a, b) =>
          a.left < b.right - 0.25 &&
          a.right > b.left + 0.25 &&
          a.top < b.bottom - 0.25 &&
          a.bottom > b.top + 0.25;
        const cards = [...arena.querySelectorAll('.hero-cards .playing-card')];
        const obstacles = [
          ...arena.querySelectorAll('.seat-profile, .seat-action, .hand-rank, .board > *'),
        ];
        const rank = rect(arena.querySelector('.hero-rank-slot'));
        return {
          face: cards[0].offsetWidth * scale,
          public: arena.querySelector('.board > *').offsetWidth * scale,
          slot: arena.querySelector('.hero-cards').offsetHeight,
          issues: cards.flatMap((card) => {
            const box = rect(card);
            const failures = [];
            if (box.bottom > rank.top - 0.1) failures.push('hero artwork touches the fixed rank');
            if (obstacles.some((el) => overlap(box, rect(el))))
              failures.push('hero artwork covers a player or public card');
            for (const feature of card.querySelectorAll(
              '.card-art .card-rank, .card-art > .card-suit-icon',
            )) {
              const mark = rect(feature);
              if (
                !mark.width ||
                !mark.height ||
                cards.some((other) => other !== card && overlap(mark, rect(other)))
              )
                failures.push('hero rank or suit is missing or covered by the other card');
            }
            return failures;
          }),
        };
      });
      expect(metric.issues).toEqual([]);
      expect(metric.face).toBeGreaterThanOrEqual(size.height <= 600 ? 27 : 32);
      expect(metric.face / metric.public).toBeLessThanOrEqual(1.25);
      expect(metric.public / metric.face).toBeLessThanOrEqual(1.4);
      if (size.width <= 390) expect(metric.slot).toBe(104);
      measurements.push({ ...size, count, ...metric });
    }
  }
  await writeFile(
    test.info().outputPath('hero-safe-growth.json'),
    JSON.stringify(measurements, null, 2),
  );
});

test('tablet-sized PC windows keep restrained hero cards for five and nine seats', async ({
  page,
}) => {
  for (const size of [
    { width: 821, height: 813 },
    { width: 900, height: 700 },
    { width: 1032, height: 1376 },
  ]) {
    await prepare(page, size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      expect(
        await page
          .locator('#hero-cards > .playing-card')
          .first()
          .evaluate((el) => el.offsetWidth),
      ).toBeLessThanOrEqual(94);
      assertTableLayout(await page.evaluate(readTableLayout));
    }
  }
  await page.screenshot({ path: test.info().outputPath('restrained-tablet-cards.png') });
});

test('ordinary and long chip amounts preserve every digit, vertical font size and real profile padding', async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    await prepare(page, size);
    await page.evaluate(() => window.qa.heroTurn(9));
    const before = await page
      .locator('.seat-stack')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize);
    // Exercise the display boundary independently of engine settlement: these
    // literal integers/abbreviations are never used as game state or payouts.
    const values = ['5K', '11.775K', '1.123275M', '90,000,000'];
    await page.evaluate((values) => {
      document.querySelectorAll('#arena .seat-stack').forEach((el, i) => {
        el.textContent = values[i % values.length];
      });
      window.dispatchEvent(new Event('resize'));
    }, values);
    await expect
      .poll(() =>
        page
          .locator('.seat-stack')
          .nth(3)
          .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
      )
      .toBeLessThan(size.width === 390 ? 1 : 1.01);
    assertTableLayout(await page.evaluate(readTableLayout));
    expect(
      await page
        .locator('.seat-stack')
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe(before);
    expect(await page.locator('.seat-stack').allTextContents()).toEqual([...values, ...values]);
    expect(
      await page
        .locator('.seat-stack')
        .first()
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    ).toBe(1);
    await page
      .locator('#arena')
      .screenshot({ path: test.info().outputPath(`complete-chip-digits-${size.width}.png`) });
  }
});

test('an empty hero rank moves the identity close to the cards without changing table or artwork geometry', async ({
  page,
}) => {
  const measurements = [];
  for (const size of [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 821, height: 813 },
    { width: 1280, height: 900 },
  ]) {
    await prepare(page, size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      const empty = await page.evaluate(readTableLayout);
      expect(empty.profiles).toHaveLength(count - 1);
      expect(empty.rail.seats).toHaveLength(count - 1);
      assertTableLayout(empty);
      const read = (selector = '#arena') =>
        page.locator(selector).evaluate((arena) => {
          const box = (selector) => {
            const r = (
              selector === ':scope' ? arena : arena.querySelector(selector)
            ).getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
          };
          const cards = [...arena.querySelectorAll('.hero-cards .playing-card')].map((el) =>
            el.getBoundingClientRect(),
          );
          const identity = box('.hero-identity');
          return {
            arena: box(':scope'),
            card: box('.hero-cards'),
            identity,
            paintedGap: identity.top - Math.max(...cards.map((r) => r.bottom)),
          };
        });
      const before = await read();
      expect(before.paintedGap).toBeGreaterThanOrEqual(0);
      expect(before.paintedGap).toBeLessThanOrEqual(9);
      if (size.width === 821 || (size.width === 390 && count === 9))
        await page.screenshot({
          path: test.info().outputPath(`close-live-identity-${size.width}-${count}.png`),
        });
      await page.evaluate((count) => window.qa.scene('Kh 6s', 'Kc 7d Tc 3s 2h', { count }), count);
      await expect(page.locator('#hero-hand-rank')).toBeVisible();
      const after = await read();
      assertTableLayout(await page.evaluate(readTableLayout));
      expect(after.paintedGap).toBeGreaterThan(before.paintedGap + 10);
      for (const part of ['arena', 'card'])
        for (const key of ['top', 'bottom', 'width', 'height'])
          expect(Math.abs(after[part][key] - before[part][key])).toBeLessThanOrEqual(1);
      expect(after.identity.top).toBeGreaterThan(before.identity.top + 10);
      if (size.width === 821)
        await page.screenshot({
          path: test.info().outputPath(`tagged-live-identity-${size.width}-${count}.png`),
        });
      measurements.push({ ...size, count, empty: before, tagged: after });
      // A folded hero has neither a winner nor a revealed hand rank. Its saved
      // settlement must retain the same close identity and fixed frame.
      await page.evaluate((count) => {
        window.qa.recordsStart({ count });
        window.qa.recordsFinish(1);
      }, count);
      await expect(page.locator('#hero-hand-rank')).toBeHidden();
      const live = await geometry(page, '#arena');
      const liveEmpty = await read();
      const attempt = await page.evaluate(() => window.noir.getRecords()[0].attempts[0]);
      await page.locator('#rules-button').click();
      await page.locator('#records-menu-item').click();
      await page.locator(`[data-record-hand="${attempt.id}"]`).click();
      await expect
        .poll(async () => recordGeometryDifferences(await geometry(page, '#history-arena'), live))
        .toEqual([]);
      const archivedEmpty = await read('#history-arena');
      expect(archivedEmpty.paintedGap).toBeGreaterThanOrEqual(0);
      expect(archivedEmpty.paintedGap).toBeLessThanOrEqual(9);
      expect(Math.abs(archivedEmpty.paintedGap - liveEmpty.paintedGap)).toBeLessThanOrEqual(1);
      measurements.at(-1).historicalEmpty = archivedEmpty;
      if (size.width === 390 && count === 9)
        await page.screenshot({ path: test.info().outputPath('close-history-identity-390-9.png') });
      await backToGame(page);
    }
  }
  await writeFile(
    test.info().outputPath('hero-rank-gaps.json'),
    JSON.stringify(measurements, null, 2),
  );
});

// Records rely on system Back: unwind the detail and list pages to the game.
async function backToGame(page) {
  while (/#records/.test(page.url())) await page.goBack();
}
