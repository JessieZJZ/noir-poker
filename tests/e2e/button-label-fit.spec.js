import { test, expect } from '@playwright/test';

const locales = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru'];
const sizes = [
  [320, 568],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [768, 1024],
  [1280, 900],
  [1700, 1000],
];

async function buttonIssues(page) {
  return page
    .locator('.action-dock button:visible, .header-actions button:visible')
    .evaluateAll((buttons) => {
      const issues = [];
      for (const button of buttons) {
        const box = button.getBoundingClientRect(),
          walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT),
          rows = [];
        // This intentionally rotating slot may use an ellipsis. Its hidden
        // alternatives are not painted text and must not shrink the control.
        if (button.id === 'rules-button') continue;
        if (
          button.scrollWidth > button.clientWidth + 1 ||
          button.scrollHeight > button.clientHeight + 1
        )
          issues.push(button.id + ': scroll overflow');
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (
            !node.textContent.trim() ||
            getComputedStyle(node.parentElement).visibility === 'hidden' ||
            parseFloat(getComputedStyle(node.parentElement).fontSize) === 0
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (!rect.width || !rect.height) continue;
            if (
              rect.left < box.left - 1 ||
              rect.right > box.right + 1 ||
              rect.top < box.top - 1 ||
              rect.bottom > box.bottom + 1
            )
              issues.push(button.id + ': painted text outside button');
            const row = rows.find(
              (r) =>
                Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top) > rect.height * 0.3,
            );
            if (row) {
              row.top = Math.min(row.top, rect.top);
              row.bottom = Math.max(row.bottom, rect.bottom);
            } else rows.push({ top: rect.top, bottom: rect.bottom });
          }
        }
        if (rows.length > 2) issues.push(button.id + ': more than two text lines');
        const others = buttons.filter((b) => b !== button);
        for (const other of others) {
          const next = other.getBoundingClientRect();
          if (
            Math.min(box.right, next.right) - Math.max(box.left, next.left) > 1 &&
            Math.min(box.bottom, next.bottom) - Math.max(box.top, next.top) > 1
          )
            issues.push(button.id + ': overlaps ' + other.id);
        }
      }
      const brand = document.querySelector('.header .brand'),
        wordmark = brand.lastElementChild,
        header = brand.closest('.header').getBoundingClientRect(),
        brandBox = brand.getBoundingClientRect(),
        rules = document.querySelector('#rules-button').getBoundingClientRect(),
        settings = document.querySelector('#opponents-button').getBoundingClientRect();
      if (wordmark.textContent.replace(/\s/g, '') !== 'NOIRPOKER')
        issues.push('incomplete brand text');
      if (getComputedStyle(wordmark.querySelector('.brand-light')).display === 'none')
        issues.push('hidden POKER wordmark');
      if (getComputedStyle(wordmark).textOverflow === 'ellipsis')
        issues.push('brand uses ellipsis');
      if (wordmark.scrollWidth > wordmark.clientWidth + 1) issues.push('brand text clipped');
      if (
        brandBox.left < header.left ||
        brandBox.right > rules.left - 2 ||
        settings.right > header.right + 1
      )
        issues.push('brand or header control overlap');
      return issues;
    });
}

for (const hasTouch of [false, true])
  test.describe(hasTouch ? 'touch controls' : 'pointer controls', () => {
    test.use({ hasTouch });
    for (const locale of locales)
      test(`${locale} translated controls fit phones, tablets, desktop and a rotation round trip`, async ({
        page,
      }, testInfo) => {
        await page.goto('/');
        await page.waitForFunction(() => !!window.qa);
        await page.evaluate(() => {
          window.qa.stop();
          return document.fonts.ready;
        });
        await page.locator('#language-select').evaluate((select, value) => {
          select.value = value;
          select.dispatchEvent(new Event('change'));
        }, locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        for (const [width, height] of sizes) {
          const beforeResize = await page.evaluate(() => window.noir.getState());
          await page.setViewportSize({ width, height });
          const afterResize = await page.evaluate(() => window.noir.getState());
          for (const key of [
            'hand',
            'replayAttempt',
            'phase',
            'actor',
            'wealth',
            'players',
            'stats',
          ])
            expect(
              afterResize[key],
              `${locale} ${width}x${height} orientation-only ${key}`,
            ).toEqual(beforeResize[key]);
          for (const settled of [false, true]) {
            await page.evaluate((settled) => {
              if (settled) window.qa.foldWin(5, 2);
              else window.qa.heroTurn(9);
              window.qa.stop();
            }, settled);
            if (settled) await expect(page.locator('#continue-deal-button')).toBeVisible();
            const before = await page.evaluate(() => window.noir.getState());
            await expect
              .poll(() => buttonIssues(page), {
                message: `${locale} ${width}x${height} ${settled ? 'four settled buttons' : 'live controls'}`,
              })
              .toEqual([]);
            const after = await page.evaluate(() => window.noir.getState());
            expect(after.players).toEqual(before.players);
            expect(after.hand).toBe(before.hand);
            expect(after.wealth).toBe(before.wealth);
            if (locale === 'es' && width === 320 && settled)
              await page.screenshot({ path: testInfo.outputPath('spanish-four-buttons-320.png') });
          }
        }
      });
  });
