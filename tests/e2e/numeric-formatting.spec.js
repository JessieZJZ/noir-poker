import { test, expect } from '@playwright/test';

const locales = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru'];

async function switchLocale(page, locale) {
  await page.locator('#language-select').evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }, locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

test('guide chip examples keep decimal points through all language switches', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => window.qa.stop());
  await page.locator('#rules-button').click();
  await page.locator('#guide-menu-item').click();
  for (const locale of locales) {
    await switchLocale(page, locale);
    const example = page.locator('#rules-dialog .guide-body > p').filter({ hasText: '1.2K' });
    await expect(example).toHaveCount(1);
    for (const amount of ['200', '600', '400', '1.2K', '1K'])
      await expect(example).toContainText(amount);
    await expect(example).not.toContainText('1,2K');
  }
});

test('calculator numbers keep decimal points and ungrouped counts through all language switches', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => {
    window.qa.heroTurn(9);
    window.qa.stop();
  });
  const before = await page.evaluate(() => window.noir.getState());
  await page.locator('#rules-button').click();
  await page.locator('#win-rate-menu-item').click();
  for (const [player, cards] of [
    [0, ['0-14', '0-13']],
    [1, ['1-12', '1-11']],
  ]) {
    await page.locator(`[data-player="${player}"][data-card="0"]`).click();
    for (const card of cards) await page.locator(`[data-pick="${card}"]`).click();
  }
  const wins = page.locator('.win-rate-odds-values strong');
  await expect(wins).toHaveText(['62.47%', '37.03%']);
  for (const locale of [...locales, 'zh-CN', 'pt', 'en']) {
    await switchLocale(page, locale);
    await expect(wins).toHaveText(['62.47%', '37.03%']);
    for (const tie of await page.locator('.win-rate-odds-tie').all())
      await expect(tie).toContainText('0.50%');
    await expect(page.locator('#win-rate-status')).toContainText('1712304');
    await expect(page.locator('#win-rate-status')).not.toContainText(/1[,.\s]712[,.\s]304/);
    await expect(page.locator('[data-win-rate-player="0"] .win-rate-hole')).toContainText('A♠');
    await expect(page.locator('[data-win-rate-player="1"] .win-rate-hole')).toContainText('Q♥');
    await expect(page.locator('#stakes-structure')).toContainText('1.5K');
  }
  const after = await page.evaluate(() => window.noir.getState());
  for (const key of ['hand', 'replayAttempt', 'wealth', 'actor', 'phase', 'players', 'legal'])
    expect(after[key], key).toEqual(before[key]);
});

test('numeric game prose preserves signs, precision, ratios and protected facts on repeated translation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const outputs = await page.evaluate(async (locales) => {
    const { loadLocale, localizeDocument, setLocalizedHTML } = await import('/src/i18n/index.js');
    const { renderActivityParts } = await import('/src/ui/activity.js');
    const root = document.createElement('section');
    root.dataset.i18nChips = '';
    document.body.append(root);
    const source =
      '<p>+7.4K / -1.000025M / 42.40% / -0.00 BB / 2.50:1</p><a href="https://example.com/1,2K?q=42.40%">https://example.com/1,2K?q=42.40%</a><span>Doe, Jane / Version1.1K</span>';
    setLocalizedHTML(root, source);
    const result = [];
    for (const locale of [...locales, 'zh-CN', 'pt', 'en']) {
      await loadLocale(locale);
      localizeDocument(root);
      const first = root.textContent;
      localizeDocument(root);
      result.push({
        locale,
        numeric: root.querySelector('p').textContent,
        url: root.querySelector('a').getAttribute('href'),
        urlText: root.querySelector('a').textContent,
        facts: root.querySelector('span').textContent,
        repeatStable: root.textContent === first,
        actor: renderActivityParts([
          { actor: true, name: 'Doe, Version1.1K', position: 'BTN' },
          { text: ' 获胜 · 获得 7.4K 筹码' },
        ]),
      });
    }
    root.remove();
    return result;
  }, locales);
  for (const result of outputs) {
    expect(result.numeric, result.locale).toBe('+7.4K / -1.000025M / 42.40% / -0.00 BB / 2.50:1');
    expect(result.url, result.locale).toBe('https://example.com/1,2K?q=42.40%');
    expect(result.urlText, result.locale).toBe(result.url);
    expect(result.facts, result.locale).toBe('Doe, Jane / Version1.1K');
    expect(result.repeatStable, result.locale).toBe(true);
    expect(result.actor, result.locale).toContain('Doe, Version1.1K');
    expect(result.actor, result.locale).toContain('7.4K');
  }
});
