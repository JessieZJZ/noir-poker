import { test, expect } from '@playwright/test';
const locales = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru'];
const practiceTitles = {
  'zh-CN': '本局练习',
  en: 'Session practice',
  'zh-TW': '本局練習',
  ja: 'このセッションの練習',
  ko: '이번 세션 연습',
  es: 'Práctica de esta sesión',
  it: 'Pratica della sessione',
  pt: 'Prática desta sessão',
  de: 'Übung dieser Sitzung',
  fr: 'Pratique de cette session',
  ru: 'Практика в этой сессии',
};
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
    await expect(page.locator('.session-card .section-title h2')).toHaveText(
      practiceTitles[locale],
    );
    await expect(page.locator('.session-card .section-title .subtle-label')).toHaveCount(0);
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
    await page.locator('#guide-menu-item').click();
    const guide = page.locator('#rules-dialog');
    await expect(guide).toBeVisible();
    const raiseExample = ['es', 'it', 'pt', 'de', 'fr', 'ru'].includes(locale) ? '1,2K' : '1.2K';
    const callExample = guide.locator(':scope > p').filter({ hasText: raiseExample });
    await expect(callExample).toBeVisible();
    for (const amount of ['200', '600', '400', raiseExample, '1K'])
      await expect(callExample).toContainText(amount);
    const minimumRules = guide.locator(':scope > details').filter({ hasText: '1K' });
    await expect(minimumRules).toHaveCount(1);
    await minimumRules.locator(':scope > summary').click();
    const minimumRaise = minimumRules.locator(':scope > p').first();
    await expect(minimumRaise).toBeVisible();
    for (const amount of ['200', '600', '400', '1K'])
      await expect(minimumRaise).toContainText(amount);
    await expect(guide).not.toContainText(/\b(?:1200|1000)\b/);
    await guide.locator('.close-dialog').first().click();
    const initial = await page.evaluate(() => window.qa.foldWin(9, 0));
    await page.locator('#review-hand-button').click();
    await expect(page.locator('#review-dialog[data-analysis-status="done"]')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('#review-coach-explanation')).not.toBeEmpty();
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
    const policyFonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        family: getComputedStyle(document.body).fontFamily,
        loaded: [...document.fonts]
          .filter((face) => face.status === 'loaded')
          .map((face) => face.family.replace(/["']/g, '')),
      };
    });
    expect(policyFonts.family).toMatch(/^Manrope,/);
    expect(policyFonts.loaded).toContain('Manrope');
    if (locale === 'ko') expect(policyFonts.loaded).toContain('Noto Sans KR');
  });
}

test('system language fallback and manual language switch retain table preferences', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'ar-SA', timezoneId: 'UTC' });
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
    await expect(page.locator('#opponents-dialog')).toBeVisible();
    await expect(page.locator('#player-count')).toHaveValue('5');
    await expect(page.locator('#language-select')).toHaveValue('zh-CN');
  } finally {
    await context.close();
  }
});

test('live switching keeps settings, controls and the entire current hand across repeated languages', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => {
    window.qa.heroTurn(6);
    window.languageSession = {};
  });
  const state = await page.evaluate(() => window.qa.state());
  const fullState = await page.evaluate(() => window.qa.snapshot());
  const stats = await page.locator('#stat-hands').textContent();
  await page.locator('#opponents-button').click();
  const dialog = page.locator('#opponents-dialog');
  const select = page.locator('#language-select');
  await select.focus();
  for (const [locale, title] of [
    ['ja', '設定'],
    ['ko', '설정'],
    ['en', 'Settings'],
    ['zh-CN', '设置'],
    ['ko', '설정'],
    ['ja', '設定'],
  ]) {
    await select.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h2')).toHaveText(title);
    await expect(select).toBeFocused();
    expect(await page.evaluate(() => window.qa.state())).toEqual(state);
    expect(await page.evaluate(() => window.qa.snapshot())).toEqual(fullState);
    expect(await page.locator('#stat-hands').textContent()).toBe(stats);
    await expect(page.locator('.session-card .section-title h2')).toHaveText(
      practiceTitles[locale],
    );
    await expect(page.locator('.session-card .section-title .subtle-label')).toHaveCount(0);
    expect(await page.evaluate(() => !!window.languageSession)).toBe(true);
    expect(await page.locator('.hint-marquee-copy').textContent()).toBe(
      await page.locator('#coach-tip').textContent(),
    );
    expect(
      await page.locator('[data-profile-preview="balanced"] .portrait-fallback').textContent(),
    ).toBe(
      (await page.locator('[data-profile-preview="balanced"] strong').textContent()).slice(0, 1),
    );
  }
  await dialog.locator('.close-dialog').click();
  await expect(page.locator('#call-button')).toBeEnabled();
  await page.locator('#call-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.qa.state().totalLogs)).toBeGreaterThan(state.totalLogs);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});

test('language switching preserves paid settlement and retry retracts it exactly once', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const state = await page.evaluate(() => window.qa.foldWin(6, 0));
  const before = await page.evaluate(() => window.qa.state());
  const hands = await page.locator('#stat-hands').textContent();
  await page.locator('#opponents-button').click();
  for (const locale of ['ja', 'ko', 'zh-CN']) {
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(await page.evaluate(() => window.qa.state())).toEqual(before);
    expect(await page.locator('#stat-hands').textContent()).toBe(hands);
  }
  await page.locator('#opponents-dialog .close-dialog').click();
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  const retry = await page.evaluate(() => window.qa.state());
  expect(retry.hand).toBe(state.hand);
  expect(retry.hole).toEqual(state.hole);
  expect(retry.replayAttempt).toBe(state.replayAttempt + 1);
  expect(retry.wealth).toBe(30000);
  expect(await page.locator('#stat-hands').textContent()).toBe('0');
});

test('Japanese and Korean profile cards and ranges fit a narrow settings page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => window.qa.heroTurn());
  await page.locator('#opponents-button').click();
  for (const locale of ['ja', 'ko']) {
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const cards = page.locator('.profile-card');
    await expect(cards).toHaveCount(17);
    const bounds = await cards.evaluateAll((items) =>
      items.map((el) => ({
        height: el.getBoundingClientRect().height,
        fits: el.scrollWidth <= el.clientWidth + 1,
        text: el.textContent,
      })),
    );
    expect(
      bounds.every((b) => b.height < 250 && b.fits && !/[⁇�]|\?{2}|(.{1,12})\1{5}/u.test(b.text)),
    ).toBe(true);
    await page.locator('[data-profile-preview="zang"]').click();
    await expect(page.locator('#profile-detail')).toBeVisible();
    await expect(page.locator('.profile-sizing strong')).toHaveText(
      locale === 'ja' ? 'ポットの 60–100%' : '팟의 60–100%',
    );
    expect(
      await page
        .locator('.profile-sizing strong')
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(35);
    expect(
      await page.locator('#profile-detail').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.locator('[data-close-profile-detail]').click();
  }
});

test('DOM sources survive rerenders, duplicate translated labels and rapid language changes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const result = await page.evaluate(async () => {
    const {
      loadLocale,
      localizeDocument,
      setLocalizedText,
      setLocalizedHTML,
      setLocalizedAttribute,
    } = await import('/src/i18n/index.js');
    const holder = document.createElement('div');
    await loadLocale('en');
    setLocalizedHTML(
      holder,
      '<button title="弃牌">弃牌</button><span>已弃牌</span><b translate="no">谭老板</b>',
    );
    const button = holder.querySelector('button');
    button.dataset.rule = '弃牌';
    button.onclick = () => {
      holder.dataset.clicked = 'true';
    };
    await loadLocale('ja');
    localizeDocument(holder);
    setLocalizedText(button, '跟注');
    setLocalizedAttribute(button, 'title', '跟注');
    await loadLocale('ko');
    localizeDocument(holder);
    await loadLocale('zh-CN');
    localizeDocument(holder);
    button.click();
    return {
      text: button.textContent,
      title: button.title,
      span: holder.querySelector('span').textContent,
      legalName: holder.querySelector('b').textContent,
      rule: button.dataset.rule,
      clicked: holder.dataset.clicked,
    };
  });
  expect(result).toEqual({
    text: '跟注',
    title: '跟注',
    span: '已弃牌',
    legalName: '谭老板',
    rule: '弃牌',
    clicked: 'true',
  });
  await page.locator('#opponents-button').click();
  await page.locator('#language-select').evaluate((select) => {
    window.localeChanges = 0;
    document.addEventListener('noir:locale-changed', () => window.localeChanges++);
    for (const locale of ['ja', 'ko', 'en', 'zh-CN']) {
      select.value = locale;
      select.dispatchEvent(new Event('change'));
    }
  });
  await expect.poll(() => page.evaluate(() => window.localeChanges)).toBe(4);
  await expect(page.locator('#opponents-dialog h2')).toHaveText('设置');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(await page.evaluate(() => localStorage.getItem('noir-locale'))).toBe('zh-CN');
});

test('switching language keeps a pending bot action and its deadline alive', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.evaluate(() => window.qa.heroTurn());
  await page.locator('#call-button').click();
  const thinking = await page.evaluate(() => window.qa.thinking());
  expect(thinking).not.toBeNull();
  const state = await page.evaluate(() => window.qa.snapshot());
  await page.locator('#opponents-button').click();
  for (const locale of ['ja', 'ko']) {
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(await page.evaluate(() => window.qa.snapshot())).toEqual(state);
    expect(await page.evaluate(() => window.qa.thinking())).toEqual(thinking);
  }
  await page.clock.runFor(thinking.delayMs + 1);
  expect(await page.evaluate(() => window.qa.state().totalLogs)).toBeGreaterThan(state.logs.length);
  expect(await page.evaluate(() => window.qa.state().wealth)).toBe(30000);
});
