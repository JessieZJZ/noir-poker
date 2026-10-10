import { test, expect } from '@playwright/test';
import { openSettings, closeSettings } from './settings-helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

test('settings group useful information and keep difficulty, emotion, personas and seats separate without narrow-screen overlap', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.foldWin(9));
  for (const width of [320, 390, 700, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await openSettings(page);
    const info = page.locator('.settings-info');
    await expect(info).toContainText('难度立即生效');
    await expect(info).toContainText('下一手生效');
    await expect(info).toContainText('策略倾向');
    await expect(info).toContainText('VPIP');
    await expect(info).toContainText('PFR');
    await expect(page.locator('.difficulty-module #difficulty')).toHaveCount(1);
    await expect(page.locator('.emotion-module #emotion-mode')).toHaveCount(1);
    await expect(page.locator('.personas-module #profile-stage')).toHaveCount(1);
    await expect(page.locator('.seats-module #opponent-roster')).toHaveCount(1);
    await expect(
      page.locator('.opponent-current-style, .opponent-observed, .opponent-mood-reason'),
    ).toHaveCount(0);
    await expect(page.locator('#opponent-roster')).not.toContainText(
      /VPIP|PFR|本手实际风格|急于追回|单手净损失/,
    );
    const issues = await page.evaluate(() => {
      const difficulty = document.querySelector('.difficulty-module'),
        emotion = document.querySelector('.emotion-module');
      const issues = [];
      if (!(difficulty.compareDocumentPosition(emotion) & Node.DOCUMENT_POSITION_FOLLOWING))
        issues.push('emotion is before difficulty');
      if (difficulty.nextElementSibling !== emotion)
        issues.push('another module interrupts difficulty and emotion');
      if (difficulty.getBoundingClientRect().bottom > emotion.getBoundingClientRect().top + 1)
        issues.push('difficulty and emotion overlap');
      const dialog = document.querySelector('#opponents-dialog');
      if (dialog.scrollWidth > dialog.clientWidth + 1)
        issues.push('settings overflow horizontally');
      for (const row of document.querySelectorAll('.opponent-row')) {
        const box = row.getBoundingClientRect(),
          portrait = row.querySelector('.opponent-portrait').getBoundingClientRect(),
          title = row.querySelector('.opponent-row-person strong').getBoundingClientRect(),
          seat = row.querySelector('.opponent-seat-label').getBoundingClientRect(),
          select = row.querySelector('select').getBoundingClientRect();
        if (portrait.right > title.left + 1) issues.push('portrait covers seat name');
        if (
          seat.left < title.right &&
          seat.right > title.left &&
          seat.top < title.bottom &&
          seat.bottom > title.top
        )
          issues.push('seat number covers seat name');
        if (title.right > box.right || title.left < box.left) issues.push('seat name escapes card');
        if (select.top < Math.max(title.bottom, portrait.bottom))
          issues.push('seat selector covers identity');
        if (select.left < box.left || select.right > box.right)
          issues.push('selector escapes card');
      }
      return issues;
    });
    expect(issues, `settings geometry at ${width}px`).toEqual([]);
    if (width === 390)
      await page
        .locator('#opponents-dialog')
        .screenshot({ path: test.info().outputPath('mobile-settings-modules.png') });
    await closeSettings(page);
  }
});

test('mobile persona details cover the selector in place and closing restores its focused card and scroll position', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.profileReveals = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.id === 'profile-detail') window.profileReveals.push({ keyframes, options });
      return animate.call(this, keyframes, options);
    };
  });
  for (const width of [320, 390, 700]) {
    await page.setViewportSize({ width, height: 844 });
    await openSettings(page);
    const card = page.locator('[data-profile-preview="dwan"]');
    await card.scrollIntoViewIfNeeded();
    const before = await page.locator('.opponents-body').evaluate((el) => el.scrollTop);
    await card.click();
    const stage = page.locator('#profile-stage');
    await expect(stage).toHaveAttribute('data-detail-open', 'true');
    await expect(page.locator('#profile-detail')).toHaveAttribute('data-profile-id', 'dwan');
    await expect(page.locator('#profile-detail')).toBeVisible();
    await expect(page.locator('#profile-detail h3')).toHaveText('Tom Dwan');
    await expect(page.locator('[data-close-profile-detail]')).toBeFocused();
    const reveal = await page.evaluate(() => window.profileReveals.at(-1));
    expect(reveal.keyframes[0].clipPath).toMatch(/^circle\(0px at /);
    expect(reveal.keyframes[1].clipPath).toMatch(/^circle\([1-9]/);
    expect(reveal.options.duration).toBeGreaterThan(0);
    expect(reveal.options.duration).toBeLessThanOrEqual(500);
    expect(await page.locator('#profile-cards').evaluate((el) => el.inert)).toBe(true);
    const coverage = await page.locator('#profile-detail').evaluate((el) => {
      const detail = el.getBoundingClientRect(),
        stage = document.querySelector('#profile-stage').getBoundingClientRect(),
        body = document.querySelector('.opponents-body').getBoundingClientRect(),
        close = el.querySelector('[data-close-profile-detail]').getBoundingClientRect();
      return {
        insideWidth: detail.left >= stage.left - 1 && detail.right <= stage.right + 1,
        closeVisible: close.top >= body.top && close.bottom <= body.bottom,
        positioned: getComputedStyle(el).position,
      };
    });
    expect(coverage.insideWidth).toBe(true);
    expect(coverage.closeVisible).toBe(true);
    expect(['absolute', 'fixed']).toContain(coverage.positioned);
    if (width === 390)
      await page.locator('#opponents-dialog').screenshot({
        path: test.info().outputPath('mobile-persona-detail.png'),
        animations: 'disabled',
      });
    const checkDetailLayer = () =>
      page.evaluate(() => {
        const detail = document.querySelector('#profile-detail'),
          body = document.querySelector('.opponents-body').getBoundingClientRect(),
          bounds = detail.getBoundingClientRect(),
          close = detail.querySelector('[data-close-profile-detail]'),
          closeBounds = close.getBoundingClientRect(),
          footer = document.querySelector('.opponents-save-row').getBoundingClientRect();
        const covered = [...document.querySelectorAll('.opponent-portrait')]
          .map((portrait) => {
            const r = portrait.getBoundingClientRect();
            return {
              name: portrait.closest('.opponent-row').querySelector('strong').textContent,
              x: r.left + r.width / 2,
              y: r.top + r.height / 2,
            };
          })
          .filter(
            ({ x, y }) =>
              x > Math.max(bounds.left, body.left) &&
              x < Math.min(bounds.right, body.right) &&
              y > Math.max(bounds.top, body.top) &&
              y < Math.min(bounds.bottom, body.bottom),
          );
        return {
          coveredCount: covered.length,
          blocked: covered
            .filter(({ x, y }) => !detail.contains(document.elementFromPoint(x, y)))
            .map(({ name }) => name),
          closeVisible: closeBounds.top >= body.top && closeBounds.bottom <= body.bottom,
          closeAboveFooter: closeBounds.bottom <= footer.top,
          closeOnTop: close.contains(
            document.elementFromPoint(
              closeBounds.left + closeBounds.width / 2,
              closeBounds.top + closeBounds.height / 2,
            ),
          ),
        };
      });
    // Geometry alone missed avatars from the following seat-assignment module
    // painting above the overlay. Check the actual hit layer at those avatars.
    await expect.poll(checkDetailLayer).toMatchObject({
      blocked: [],
      closeVisible: true,
      closeAboveFooter: true,
      closeOnTop: true,
    });
    if (width === 390) expect((await checkDetailLayer()).coveredCount).toBeGreaterThan(0);
    // Long introductions scroll inside the overlay; its sticky close control
    // must remain available above the save footer after reaching the end.
    await page.locator('#profile-detail').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(checkDetailLayer).toMatchObject({
      blocked: [],
      closeVisible: true,
      closeAboveFooter: true,
      closeOnTop: true,
    });
    if (width === 390)
      expect(await page.locator('#profile-detail').evaluate((el) => el.scrollTop)).toBeGreaterThan(
        0,
      );
    expect(await page.locator('.opponents-body').evaluate((el) => el.scrollTop)).toBeCloseTo(
      before,
      0,
    );
    if (width === 390)
      await page.locator('#opponents-dialog').screenshot({
        path: test.info().outputPath('mobile-persona-detail-scrolled.png'),
        animations: 'disabled',
      });
    // The detail can be read without navigating to a separate below-grid card.
    await page.locator('[data-close-profile-detail]').click();
    await expect(stage).toHaveAttribute('data-detail-open', 'false');
    await expect(page.locator('#profile-detail')).toBeHidden();
    expect(await page.locator('#profile-cards').evaluate((el) => el.inert)).toBe(false);
    await expect(card).toBeFocused();
    await expect
      .poll(() => page.locator('.opponents-body').evaluate((el) => el.scrollTop))
      .toBeCloseTo(before, 0);
    await closeSettings(page);
  }
});

test('reduced motion preserves usable details and Escape closes only the detail before the settings dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSettings(page);
  const card = page.locator('[data-profile-preview="tan"]');
  await card.click();
  await expect(page.locator('#profile-detail')).toBeVisible();
  await expect(page.locator('[data-close-profile-detail]')).toBeFocused();
  const moving = await page
    .locator('#profile-detail')
    .evaluate(
      (el) => el.getAnimations().filter((animation) => animation.playState === 'running').length,
    );
  expect(moving).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#profile-detail')).toBeHidden();
  await expect(page.locator('#opponents-dialog')).toBeVisible();
  await expect(card).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#opponents-dialog')).toBeHidden();
  await expect(page.locator('#opponents-button')).toBeFocused();
});

test('desktop persona detail stays below the available selector while a mobile resize makes it an overlay', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSettings(page);
  const choice = page.locator('[data-profile-preview="st"]');
  await choice.click();
  await expect(page.locator('#profile-detail h3')).toHaveText('ST Wang');
  const layout = await page.evaluate(() => ({
    gridBottom: document.querySelector('#profile-cards').getBoundingClientRect().bottom,
    detailTop: document.querySelector('#profile-detail').getBoundingClientRect().top,
    inert: document.querySelector('#profile-cards').inert,
  }));
  expect(layout.detailTop).toBeGreaterThanOrEqual(layout.gridBottom);
  expect(layout.inert).toBe(false);
  await page.locator('#profile-detail').scrollIntoViewIfNeeded();
  await page
    .locator('#opponents-dialog')
    .screenshot({ path: test.info().outputPath('desktop-persona-detail.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#profile-detail')).toBeHidden();
  await choice.click();
  await expect(page.locator('#profile-detail')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#profile-detail')).toBeVisible();
  expect(await page.locator('#profile-cards').evaluate((el) => el.inert)).toBe(false);
  await expect(page.locator('[data-profile-preview="dwan"]')).toBeEnabled();
});

test('the guide teaches winning, streets, actions and position before introducing review and table settings', async ({
  page,
}) => {
  await page.locator('#rules-button').click();
  const guide = page.locator('#rules-dialog');
  await expect(guide).toHaveAttribute('aria-labelledby', 'rules-dialog-title');
  const headings = await guide.locator('h3').allTextContents();
  expect(headings).toHaveLength(6);
  expect(headings.slice(0, 4)).toEqual([
    expect.stringContaining('赢'),
    expect.stringContaining('一手牌'),
    expect.stringContaining('怎么选'),
    expect.stringContaining('位置'),
  ]);
  expect(headings[4]).toContain('复盘');
  expect(headings[5]).toContain('设置');
  await expect(guide).toContainText('复盘这一手');
  await expect(guide).toContainText('一次赢牌不能证明长期赚钱');
  await expect(guide).toContainText('不用对手暗牌或后来发出的牌评价');
  await expect(guide).toContainText('5–9 人');
  await expect(guide).toContainText('下一手');
  await expect(guide).toContainText('各座位分配风格');
  await expect(guide).toContainText('难度');
  await expect(guide).toContainText('轻松、标准到进阶');
  await guide
    .locator('details')
    .filter({ hasText: '关于具名牌手与训练原型' })
    .locator('summary')
    .click();
  await expect(guide.locator('a[href="https://www.kpclive.com/"]')).toBeVisible();
  await expect(guide.locator('a[href="https://tritonpokerseries.com/en-US/home"]')).toBeVisible();
  await expect(guide).toContainText('不代表本人真实或完整的打法');
  await expect(guide).toContainText('不表示本人或赛事方');
  await expect(guide.locator('a[href="./app-privacy.html#persona-notice"]')).toBeVisible();
  await guide.evaluate((el) => {
    el.scrollTop = 0;
  });
  await guide.screenshot({ path: test.info().outputPath('guide-basics.png') });
});
