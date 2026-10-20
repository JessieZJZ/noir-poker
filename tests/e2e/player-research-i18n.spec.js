import { test, expect } from '@playwright/test';
import { BOT_PROFILES } from '../../src/engine/bot-profiles.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';
const forbidden =
  /Phil Ivey|ST Wang|Tan Xuan|Aaron Zang|Viktor Blom|Daniel Cates|Tom Dwan|Daniel Negreanu|Phil Hellmuth|Patrik Antonius|Jason Koon|Stephen Chidwick|Fedor Holz|Isaac Haxton|Triton|KPC|谭老板|臧书奴|阿宝|公开打法样本|履历摘录|头像：/i;
async function inspect(page, id) {
  return page.evaluate(async (id) => {
    const { BOT_PROFILES } = await import('/src/engine/bot-profiles.js');
    const { localizeText } = await import('/src/i18n/index.js');
    const p = BOT_PROFILES.find((p) => p.id === id),
      detail = document.querySelector('#profile-detail'),
      card = document.querySelector(`[data-profile-preview="${id}"]`);
    const normalize = (s) => s.trim().replace(/\s+/g, ' '),
      contains = (root, s) => normalize(root.textContent).includes(normalize(localizeText(s)));
    return {
      missing: [
        p.name,
        p.description,
        ...p.character.sections.flatMap((s) => [s.title, ...s.paragraphs]),
      ].filter((s) => !contains(detail, s)),
      cardMissing: [p.short, p.tag].filter((s) => !contains(card, s)),
      links: detail.querySelectorAll('a').length,
      sections: detail.querySelectorAll('.character-section').length,
      ignored: detail.querySelectorAll('[translate="no"],[lang="zh-CN"]').length,
      overflow: detail.scrollWidth > detail.clientWidth + 1,
      text: detail.textContent,
      images: [...detail.querySelectorAll('img')].map((i) => ({
        src: i.getAttribute('src'),
        loaded: i.complete && i.naturalWidth > 0,
      })),
    };
  }, id);
}
for (const locale of SUPPORTED_LOCALES) {
  test(`complete ${locale} original character introductions and portraits work offline`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', (route) =>
      ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
        ? route.continue()
        : route.abort(),
    );
    await page.addInitScript((locale) => localStorage.setItem('noir-locale', locale), locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate(() => window.qa.stop());
    await page.locator('#opponents-button').click();
    for (const p of BOT_PROFILES) {
      await page.locator(`[data-profile-preview="${p.id}"]`).click();
      await expect(page.locator('#profile-detail')).toBeVisible();
      if (p.id !== 'balanced')
        await expect(page.locator('#profile-detail img')).toHaveJSProperty('complete', true);
      const r = await inspect(page, p.id);
      if (p.id === 'balanced') {
        expect(r.images).toEqual([]);
        await expect(page.locator('#profile-detail .portrait-fallback')).not.toBeEmpty();
      }
      expect(r.missing, `${locale} ${p.id}`).toEqual([]);
      expect(r.cardMissing).toEqual([]);
      expect(r.sections).toBe(5);
      expect(r.links).toBe(0);
      expect(r.ignored).toBe(0);
      expect(r.overflow).toBe(false);
      expect(r.text).not.toMatch(forbidden);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale)) expect(r.text).not.toMatch(/\p{Script=Han}/u);
      for (const image of r.images) {
        expect(image.loaded).toBe(true);
        expect(image.src).toBe(`/portraits/${p.id}.jpg`);
      }
      if (p.id === 'iris')
        await page.screenshot({
          path: test.info().outputPath(`characters-${locale}.png`),
          animations: 'disabled',
        });
      if (await page.locator('[data-close-profile-detail]').isVisible())
        await page.locator('[data-close-profile-detail]').click();
    }
  });
}
test('live language changes retain the hand and update original character descriptions', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('noir-locale', 'zh-CN'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => window.qa.stop());
  await page.locator('#opponents-button').click();
  await page.locator('[data-profile-preview="iris"]').click();
  if (await page.locator('[data-close-profile-detail]').isVisible())
    await page.locator('[data-close-profile-detail]').click();
  const before = await page.evaluate(() => JSON.stringify(window.noir.getState()));
  for (const locale of ['en', 'fr', 'ja', 'zh-TW', 'ko', 'ru', 'zh-CN']) {
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const r = await inspect(page, 'iris');
    expect(r.missing).toEqual([]);
    expect(r.text).not.toMatch(forbidden);
    expect(await page.evaluate(() => JSON.stringify(window.noir.getState()))).toBe(before);
  }
});
