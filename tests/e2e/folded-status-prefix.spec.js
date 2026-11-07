import { test, expect } from '@playwright/test';

const labels = {
  'zh-CN': '已弃牌 · 两对',
  en: 'Folded · Two pair',
  'zh-TW': '已棄牌 · 兩對',
  ja: 'フォールド済み · ツーペア',
  ko: '폴드 · 투페어',
  es: 'Se retiró · Doble pareja',
  it: 'Ha fatto fold · Doppia coppia',
  pt: 'Desistiu · Dois pares',
  de: 'Gepasst · Zwei Paare',
  fr: 'Couché · Deux paires',
  ru: 'Фолд · Две пары',
};
const sizes = [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1024, 768],
];

// These are browser checks of the production CSS selectors. A platform class
// does not turn Chromium into an Android/iOS runtime or prove native raster ink.
async function readRank(page, platform = 'web') {
  return page.evaluate(async (platform) => {
    const root = document.documentElement;
    root.classList.remove('native-android', 'native-ios');
    if (platform !== 'web') root.classList.add(`native-${platform}`);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rank = document.querySelector('#hero-hand-rank');
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const rect = box(rank);
    const range = document.createRange();
    range.selectNodeContents(rank);
    const text = box(range);
    const style = getComputedStyle(rank);
    const clips = [];
    for (let ancestor = rank; ancestor; ancestor = ancestor.parentElement) {
      const s = getComputedStyle(ancestor);
      if (/(hidden|clip|scroll|auto)/.test(`${s.overflowX} ${s.overflowY}`)) {
        const b = box(ancestor);
        const clippedX = /hidden|clip|scroll|auto/.test(s.overflowX);
        const clippedY = /hidden|clip|scroll|auto/.test(s.overflowY);
        if (
          (clippedX && (text.left < b.left - 1 || text.right > b.right + 1)) ||
          (clippedY && (text.top < b.top - 1 || text.bottom > b.bottom + 1))
        )
          clips.push(ancestor.id || ancestor.className || ancestor.tagName);
      }
    }
    const layer = (element) => {
      const s = getComputedStyle(element);
      return {
        transform: s.transform,
        identity: s.transform === 'none' || new DOMMatrix(s.transform).isIdentity,
        backface: s.backfaceVisibility,
      };
    };
    return {
      platform,
      text: rank.textContent,
      rect,
      textRect: text,
      textLines: range.getClientRects().length,
      scrollWidth: rank.scrollWidth,
      clientWidth: rank.clientWidth,
      clips,
      identity: box(document.querySelector('.hero-identity')),
      font: {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        lineHeight: style.lineHeight,
        padding: style.padding,
      },
      layers: [rank.parentElement, rank, ...rank.children].map(layer),
      viewport: [innerWidth, innerHeight],
    };
  }, platform);
}

function expectCompleteRank(measurement, expected) {
  expect(measurement.text).toBe(expected);
  expect(measurement.textLines).toBe(1);
  expect(measurement.clips).toEqual([]);
  expect(measurement.scrollWidth).toBeLessThanOrEqual(measurement.clientWidth + 1);
  const text = measurement.textRect;
  const rank = measurement.rect;
  expect(text.left).toBeGreaterThanOrEqual(rank.left - 1);
  expect(text.right).toBeLessThanOrEqual(rank.right + 1);
  expect(text.top).toBeGreaterThanOrEqual(rank.top - 1);
  expect(text.bottom).toBeLessThanOrEqual(rank.bottom + 1);
  expect(rank.left).toBeGreaterThanOrEqual(0);
  expect(rank.right).toBeLessThanOrEqual(measurement.viewport[0]);
  expect(rank.top).toBeGreaterThanOrEqual(0);
  expect(rank.bottom).toBeLessThanOrEqual(measurement.viewport[1]);
  expect(rank.bottom).toBeLessThanOrEqual(measurement.identity.top + 1);
}

function expectSameGeometry(measured, baseline) {
  expect(measured.font).toEqual(baseline.font);
  for (const key of ['rect', 'textRect', 'identity'])
    for (const edge of ['left', 'top', 'right', 'bottom'])
      expect(Math.abs(measured[key][edge] - baseline[key][edge]), `${key}.${edge}`).toBeLessThan(
        0.1,
      );
}

for (const [locale, expected] of Object.entries(labels)) {
  test(`folded ${locale} hero rank is complete across phone/tablet CSS platform layers`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((locale) => localStorage.setItem('noir-locale', locale), locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => {
      // Existing test-only scene uses the real evaluator, settlement and
      // renderer. The folded hero's two pair cannot win the pot.
      window.qa.scene('Ah 2d', 'As Kd 2c 7h 9s', {
        count: 5,
        folded: [0, 2, 3, 4],
        otherHoles: { 1: 'Ac Qd' },
      });
      window.qa.stop();
      return document.fonts.ready;
    });
    const before = await page.evaluate(() => window.noir.getState());
    expect(before.phase).toBe('done');
    expect(before.board).toHaveLength(5);
    expect(before.players[0].folded).toBe(true);
    expect(before.pots.flatMap((pot) => pot.awards.map((award) => award.name))).not.toContain(
      before.players[0].name,
    );
    const rank = page.locator('#hero-hand-rank');
    await expect(rank).toBeVisible();
    await expect(rank).toHaveText(expected);
    const measurements = [];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      const web = await readRank(page);
      expectCompleteRank(web, expected);
      expect(web.layers.every((layer) => layer.transform === 'none')).toBe(true);
      const iosBefore = await readRank(page, 'ios');
      expectCompleteRank(iosBefore, expected);
      expect(iosBefore.layers).toEqual(web.layers);
      const android = await readRank(page, 'android');
      expectCompleteRank(android, expected);
      expectSameGeometry(android, web);
      for (const layer of android.layers) {
        expect(layer.transform).not.toBe('none');
        expect(layer.identity).toBe(true);
        expect(layer.backface).toBe('hidden');
      }
      const webAfter = await readRank(page);
      expectCompleteRank(webAfter, expected);
      expectSameGeometry(webAfter, web);
      expect(webAfter.layers).toEqual(web.layers);
      // iOS intentionally reserves its own minimum dock bottom inset. Compare
      // its existing geometry with itself, not Web's different safe-area policy.
      const iosAfter = await readRank(page, 'ios');
      expectCompleteRank(iosAfter, expected);
      expectSameGeometry(iosAfter, iosBefore);
      expect(iosAfter.layers).toEqual(iosBefore.layers);
      measurements.push({ size: [width, height], web, iosBefore, android, webAfter, iosAfter });
    }
    const after = await page.evaluate(() => window.noir.getState());
    expect(after).toEqual(before);
    await info.attach('browser-rank-geometry-not-native-raster', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    });
  });
}
