import { test, expect } from '@playwright/test';
import { BOT_PROFILES } from '../../src/engine/bot-profiles.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';

const ids = BOT_PROFILES.filter((profile) => profile.research).map((profile) => profile.id);

async function inspectDetail(page, id) {
  return page.evaluate(async (id) => {
    const { BOT_PROFILES, PROFILE_AXES } = await import('/src/engine/bot-profiles.js');
    const { localizeText } = await import('/src/i18n/index.js');
    const profile = BOT_PROFILES.find((p) => p.id === id);
    const detail = document.querySelector('#profile-detail');
    const card = document.querySelector(`[data-profile-preview="${id}"]`);
    const section = document.querySelector('#profile-detail .profile-research');
    const sources = document.querySelector('#profile-detail .profile-source-records');
    const fields = [
      profile.research.identity,
      ...profile.research.formats,
      ...profile.research.career.map((c) => c.text),
      ...profile.research.observations.map((c) => c.text),
      ...profile.research.adaptation,
      profile.research.limits,
    ];
    const sourceFields = profile.sources.flatMap((s) => [s.label, s.kind, s.context]);
    const normalize = (text) => text.trim().replace(/\s+/g, ' ');
    const contains = (root, text) =>
      normalize(root.textContent).includes(normalize(localizeText(text)));
    const links = [...section.querySelectorAll('a'), ...sources.querySelectorAll('a')];
    const unknownLinks = links.filter((a) => !profile.sources.some((s) => s.url === a.href));
    const missingLabels = [...section.querySelectorAll('a')].filter((a) => {
      const source = profile.sources.find((s) => s.url === a.href);
      return a.getAttribute('aria-label') !== localizeText(source.label);
    });
    return {
      missingProfileFields: [
        profile.name,
        profile.description,
        profile.evidence,
        ...PROFILE_AXES,
        '训练原型',
        '常用翻后下注：',
      ].filter((s) => !contains(detail, s)),
      missingCardFields: [profile.short, profile.tag].filter((s) => !contains(card, s)),
      missingFields: fields.filter((s) => !contains(section, s)),
      missingSourceFields: sourceFields.filter((s) => !contains(sources, s)),
      ignored:
        Number(Boolean(section.closest('[translate="no"]'))) +
        Number(Boolean(sources.closest('[translate="no"]'))) +
        Number(section.matches('[lang="zh-CN"]')) +
        Number(sources.matches('[lang="zh-CN"]')) +
        section.querySelectorAll('[translate="no"], [lang="zh-CN"]').length +
        sources.querySelectorAll('[translate="no"], [lang="zh-CN"]').length,
      unknownLinks: unknownLinks.map((a) => a.href),
      missingLabels: missingLabels.map((a) => a.getAttribute('aria-label')),
      sourceCount: sources.querySelectorAll('a').length,
      expectedSourceCount: profile.sources.length,
      overflow: [detail, section, sources].some((el) => el.scrollWidth > el.clientWidth + 1),
      text: detail.textContent + card.textContent,
    };
  }, id);
}

for (const locale of SUPPORTED_LOCALES) {
  test(`complete ${locale} research for all ${ids.length} players works offline without untranslated blocks or broken references`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', (route) => {
      const { hostname } = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(hostname) ? route.continue() : route.abort();
    });
    await page.addInitScript((locale) => localStorage.setItem('noir-locale', locale), locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate(() => window.qa.stop());
    await page.locator('#opponents-button').click();
    for (const id of ids) {
      await page.locator(`[data-profile-preview="${id}"]`).click();
      await expect(page.locator('#profile-detail')).toHaveAttribute('data-profile-id', id);
      await expect(page.locator('#profile-detail')).toBeVisible();
      const result = await inspectDetail(page, id);
      expect(result.missingProfileFields, `${locale} ${id} summary`).toEqual([]);
      expect(result.missingCardFields, `${locale} ${id} card`).toEqual([]);
      expect(result.missingFields, `${locale} ${id} body`).toEqual([]);
      expect(result.missingSourceFields, `${locale} ${id} sources`).toEqual([]);
      expect(result.ignored).toBe(0);
      expect(result.unknownLinks).toEqual([]);
      expect(result.missingLabels).toEqual([]);
      expect(result.sourceCount).toBe(result.expectedSourceCount);
      expect(result.overflow, `${locale} ${id} narrow layout`).toBe(false);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(result.text).not.toMatch(/\p{Script=Han}/u);
      if (id === 'haxton') {
        const heading = page.locator('#profile-detail .profile-research h4').first();
        await heading.scrollIntoViewIfNeeded();
        await expect(heading).toBeInViewport();
        await page.screenshot({
          path: test.info().outputPath(`research-${locale}.png`),
          animations: 'disabled',
        });
        const source = page.locator('#profile-detail .profile-source-records a').first();
        await source.scrollIntoViewIfNeeded();
        await expect(source).toBeInViewport();
        await page.screenshot({
          path: test.info().outputPath(`sources-${locale}.png`),
          animations: 'disabled',
        });
      }
      if (await page.locator('[data-close-profile-detail]').isVisible())
        await page.locator('[data-close-profile-detail]').click();
    }
  });
}

test('live language changes update complete research and source labels while keeping source URLs and the hand unchanged', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('noir-locale', 'zh-CN'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => window.qa.stop());
  await page.locator('#opponents-button').click();
  await page.locator('[data-profile-preview="haxton"]').click();
  // Mobile's detail overlay covers the language select; close it once, leaving
  // its DOM intact so the subsequent updates exercise remembered text sources.
  if (await page.locator('[data-close-profile-detail]').isVisible())
    await page.locator('[data-close-profile-detail]').click();
  const before = await page.evaluate(() => ({
    hand: JSON.stringify(window.noir.getState()),
    links: [...document.querySelectorAll('#profile-detail a')].map((a) => a.href),
    origin: performance.timeOrigin,
  }));
  for (const locale of ['en', 'fr', 'ja', 'zh-TW', 'ko', 'ru', 'zh-CN']) {
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const result = await inspectDetail(page, 'haxton');
    expect(result.missingProfileFields).toEqual([]);
    expect(result.missingCardFields).toEqual([]);
    expect(result.missingFields).toEqual([]);
    expect(result.missingSourceFields).toEqual([]);
    expect(result.missingLabels).toEqual([]);
    const after = await page.evaluate(() => ({
      hand: JSON.stringify(window.noir.getState()),
      links: [...document.querySelectorAll('#profile-detail a')].map((a) => a.href),
      origin: performance.timeOrigin,
    }));
    expect(after).toEqual(before);
  }
});
