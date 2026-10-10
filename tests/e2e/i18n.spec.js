import { test, expect } from '@playwright/test';
const locales = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru'];
test('localized HTML preserves URLs, identifiers and serialized rule data', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { loadLocale, localizeHTML } = await import('/src/i18n/index.js');
    await loadLocale('en');
    const holder = document.createElement('div');
    holder.innerHTML = localizeHTML(
      '<a id="弃牌" href="/弃牌" data-rule="弃牌" aria-label="弃牌">弃牌</a><span translate="no">郑建宙</span>',
    );
    const link = holder.querySelector('a');
    return {
      text: link.textContent,
      label: link.getAttribute('aria-label'),
      id: link.id,
      url: link.getAttribute('href'),
      rule: link.dataset.rule,
      legalName: holder.querySelector('span').textContent,
    };
  });
  expect(result).toEqual({
    text: 'Fold',
    label: 'Fold',
    id: '弃牌',
    url: '/弃牌',
    rule: '弃牌',
    legalName: '郑建宙',
  });
});
for (const locale of locales) {
  test(`offline ${locale} table, settings, guide, review and retry keep chip rules`, async ({
    page,
  }) => {
    // This full journey includes reloads, settings, review and a second page.
    // Keep a bounded budget for slower CI runners without relaxing assertions.
    test.setTimeout(60000);
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        await route.abort();
      } else await route.continue();
    });
    await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.locator('#opponents-button').click();
    await expect(page.locator('#language-select')).toHaveValue(locale);
    await expect(page.locator('#language-select option')).toHaveCount(11);
    await page.locator('#player-count').selectOption('9');
    await expect(page.locator('#opponents-dialog')).toBeVisible();
    await page.locator('#opponents-dialog .close-dialog').click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.locator('#opponents-button').click();
    await expect(page.locator('#player-count')).toHaveValue('9');
    await page.locator('#opponents-dialog .close-dialog').click();
    await page.evaluate(() => window.qa.foldWin(9, 0));
    await expect(page.locator('#next-button')).toBeVisible();
    await page.locator('#next-button').click();
    await expect(page.locator('#hero-stack')).not.toBeEmpty();
    await expect(page.locator('#table-size-label')).toContainText('9');
    await page.evaluate(() => window.qa.stop());
    await page.locator('#rules-button').click();
    await expect(page.locator('#rules-dialog')).toBeVisible();
    await page.locator('#rules-dialog .close-dialog').first().click();
    const initial = await page.evaluate(() => window.qa.foldWin(9, 0));
    await page.locator('#review-hand-button').click();
    await expect(page.locator('#review-priority')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#review-your-action')).not.toBeEmpty();
    await page.locator('#review-dialog .close-dialog').first().click();
    await page.locator('#restart-hand-button').click();
    await page.evaluate(() => window.qa.stop());
    const state = await page.evaluate(() => window.qa.state());
    expect(state.wealth).toBe(45000);
    expect(state.players.every((player) => player.stack % 25 === 0)).toBe(true);
    expect(state.hand).toBe(initial.hand);
    expect(state.replayAttempt).toBe(initial.replayAttempt + 1);
    if (locale === 'en') {
      const untranslated = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT),
          out = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode())
          if (
            !node.parentElement?.closest('script,style,[translate="no"],[aria-hidden="true"]') &&
            /\p{Script=Han}/u.test(node.nodeValue)
          )
            out.push(node.nodeValue.trim());
        return [...new Set(out)].filter(Boolean);
      });
      expect(untranslated).toEqual([]);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    expect(overflow).toBe(false);
    await page.goto('/app-privacy.html?lang=' + locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('article:visible')).toHaveCount(1);
    await expect(page.locator('article:visible')).toContainText('958182284@qq.com');
  });
}

test('system language fallback and manual language switch retain table preferences', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'ar-SA' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.locator('#opponents-button').click();
    await page.locator('#player-count').selectOption('5');
    await page.locator('#language-select').selectOption('zh-CN');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.locator('#opponents-button').click();
    await expect(page.locator('#player-count')).toHaveValue('5');
    await expect(page.locator('#language-select')).toHaveValue('zh-CN');
  } finally {
    await context.close();
  }
});
