import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.clock.pauseAt(60000);
  await page.evaluate(() => {
    window.qa.foldWin(6);
    navigator.vibrate = () => {
      window.turnVibrations = (window.turnVibrations || 0) + 1;
      return true;
    };
    window.qa.heroTurn(6);
  });
});
const phase = (page) => page.locator('.action-dock');
const boxes = (page) =>
  page.locator('#hero-cards .playing-card, .action-buttons button').evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
const finishDeal = (page) =>
  page.locator('#hero-cards').evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((animation) => Number.isFinite(animation.effect.getComputedTiming().endTime))
        .map((animation) => animation.finished),
    ),
  );

test('entry and one idle reminder decorate the whole action area without moving cards or buttons', async ({
  page,
}) => {
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'enter');
  await expect(page.locator('.hero-cards-wrap')).toHaveClass(/turn-enter/);
  await expect(page.locator('#turn-prompt')).toBeVisible();
  await expect(page.locator('#turn-prompt')).toHaveText('轮到你行动');
  await expect(page.locator('.turn-glow')).toHaveCSS('animation-duration', '3.2s');
  expect(
    await page.locator('.turn-glow').evaluate((el) =>
      ['::before', '::after'].map((pseudo) => ({
        name: getComputedStyle(el, pseudo).animationName,
        duration: getComputedStyle(el, pseudo).animationDuration,
      })),
    ),
  ).toEqual([
    { name: 'none', duration: '0s' },
    { name: 'none', duration: '0s' },
  ]);
  await expect(page.locator('.turn-line')).toHaveCSS('animation-duration', '1.6s');
  // The mocked timer does not advance CSS's document timeline. Let the separate
  // finite deal animation finish before measuring decorative-glow stability.
  await finishDeal(page);
  await page.clock.fastForward(1600);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'enter');
  await page.clock.fastForward(1600);
  const before = await boxes(page);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'waiting');
  await page.clock.fastForward(4799);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'waiting');
  await page.clock.fastForward(1);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'reminder');
  expect(await boxes(page)).toEqual(before);
  expect(await page.evaluate(() => window.turnVibrations)).toBe(1);
  await expect(page.locator('.turn-glow')).toHaveCSS('animation-duration', '2.2s');
  await page.clock.fastForward(2199);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'reminder');
  await page.clock.fastForward(1);
  await page.clock.fastForward(20000);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'waiting');
  expect(await boxes(page)).toEqual(before);
});

test('sizing, background, settlement and retry do not leak old reminders', async ({ page }) => {
  await page.locator('[data-preset="half"]').click();
  await page.clock.fastForward(9000);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'waiting');
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: false } })),
  );
  await expect(phase(page)).toHaveAttribute('data-turn-phase', '');
  await expect(page.locator('.turn-line')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#turn-prompt')).toHaveCSS('animation-name', 'none');
  await page.clock.fastForward(9000);
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: true } })),
  );
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'waiting');
  await page.clock.fastForward(9000);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'waiting');
  await page.evaluate(() => window.qa.foldWin(6));
  await expect(phase(page)).toHaveAttribute('data-turn-phase', '');
  await expect(page.locator('#turn-prompt')).toBeHidden();
  await page.clock.fastForward(9000);
  await expect(phase(page)).toHaveAttribute('data-turn-phase', '');
  await page.locator('#restart-hand-button').click();
  await expect(phase(page)).toHaveAttribute('data-turn-phase', /enter|waiting/);
});

test('reduced motion and muted native feedback keep a visible, localized turn state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.hero-cards-wrap .turn-glow')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.turn-line')).toHaveCSS('animation-name', 'none');
  expect(
    await page
      .locator('.turn-glow')
      .evaluate((el) =>
        ['::before', '::after'].map((pseudo) => getComputedStyle(el, pseudo).animationName),
      ),
  ).toEqual(['none', 'none']);
  await expect(page.locator('.turn-line')).toHaveCSS('opacity', '0.72');
  await expect(page.locator('#turn-prompt')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#turn-prompt')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.documentElement.classList.add('native-app'));
  await page.locator('#opponents-button').click();
  await page.locator('#sound-button').click();
  await page.locator('#opponents-dialog .close-dialog').first().click();
  await page.evaluate(() => window.qa.heroTurn(7));
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'enter');
  expect(await page.evaluate(() => window.turnVibrations)).toBe(1);
  await page.evaluate(async () => {
    const { loadLocale, localizeDocument } = await import('/src/i18n/index.js');
    await loadLocale('en');
    localizeDocument(document);
  });
  await expect(page.locator('#turn-prompt')).toHaveText('Your turn');
  await expect(page.locator('#decision-text')).not.toContainText('轮到');
});

test('one soft hand glow has no clipped rim; a thin rail pulses from the center while the prompt stays still', async ({
  page,
}) => {
  const glow = page.locator('.turn-glow');
  await expect(glow).toHaveCSS('border-radius', '0px');
  await expect(glow).toHaveCSS('border-top-width', '0px');
  await expect(glow).toHaveCSS('box-shadow', 'none');
  const decorations = await glow.evaluate((el) => ({
    gradients: getComputedStyle(el).backgroundImage.match(/radial-gradient/g)?.length,
    layers: ['::before', '::after'].map((pseudo) => getComputedStyle(el, pseudo).content),
  }));
  expect(decorations).toEqual({ gradients: 1, layers: ['none', 'none'] });
  const frame = (selector, name, time) =>
    page.locator(selector).evaluate(
      (el, { name, time }) => {
        const motion = el.getAnimations().find((animation) => animation.animationName === name);
        if (!motion) throw Error(`Missing ${name}`);
        motion.pause();
        motion.currentTime = time;
        const style = getComputedStyle(el);
        return {
          opacity: Number(style.opacity),
          x: el.getBoundingClientRect().x,
          width: el.getBoundingClientRect().width,
        };
      },
      { name, time },
    );
  await expect(page.locator('.turn-line')).toHaveCSS('height', '1px');
  await expect(page.locator('#turn-prompt')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#turn-prompt')).toHaveCSS('opacity', '1');
  await expect(page.locator('#turn-prompt')).toHaveCSS('text-shadow', 'none');
  const from = await frame('.turn-line', 'hero-turn-line-pulse', 192);
  const to = await frame('.turn-line', 'hero-turn-line-pulse', 1120);
  expect(to.x).toBeLessThan(from.x);
  expect(to.x + to.width).toBeGreaterThan(from.x + from.width);
  expect(to.x + to.width / 2).toBeCloseTo(from.x + from.width / 2, 3);
  expect(to.width).toBeGreaterThan(from.width * 5);
  const faded = await frame('.turn-line', 'hero-turn-line-pulse', 1568);
  expect(faded.opacity).toBeLessThan(0.15);
  await page.clock.fastForward(3200);
  await expect(glow).toHaveCSS('opacity', '0.24');
  await expect(glow).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.turn-line')).toHaveCSS('animation-name', 'hero-turn-line-pulse');
  await expect(page.locator('#turn-prompt')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#turn-prompt')).toHaveCSS('opacity', '1');
  await finishDeal(page);
  const before = await boxes(page);
  const promptBounds = await page.locator('#turn-prompt').boundingBox();
  await frame('.turn-line', 'hero-turn-line-pulse', 192);
  expect(await boxes(page)).toEqual(before);
  expect(await page.locator('#turn-prompt').boundingBox()).toEqual(promptBounds);
});
