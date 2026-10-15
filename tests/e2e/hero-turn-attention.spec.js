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
const railMotion = (page) =>
  page.locator('.turn-line').evaluate((el) =>
    ['::before', '::after'].map((pseudo) => {
      const style = getComputedStyle(el, pseudo);
      return { name: style.animationName, duration: style.animationDuration };
    }),
  );
const outwardPulses = [
  { name: 'hero-turn-pulse-left', duration: '1.6s' },
  { name: 'hero-turn-pulse-right', duration: '1.6s' },
];

test('entry and one idle reminder decorate the whole action area without moving cards or buttons', async ({
  page,
}) => {
  await expect(phase(page)).toHaveAttribute('data-turn-phase', 'enter');
  await expect(page.locator('.hero-cards-wrap')).toHaveClass(/turn-enter/);
  await expect(page.locator('#turn-prompt')).toBeVisible();
  await expect(page.locator('#turn-prompt')).toHaveText('轮到你行动');
  await expect(page.locator('.turn-frame')).toHaveCSS('animation-duration', '2s');
  expect(
    await page.locator('.turn-frame').evaluate((el) =>
      ['::before', '::after'].map((pseudo) => ({
        name: getComputedStyle(el, pseudo).animationName,
        duration: getComputedStyle(el, pseudo).animationDuration,
      })),
    ),
  ).toEqual([
    { name: 'none', duration: '0s' },
    { name: 'none', duration: '0s' },
  ]);
  await expect(page.locator('.turn-line')).toHaveCSS('animation-name', 'none');
  expect(await railMotion(page)).toEqual(outwardPulses);
  // The mocked timer does not advance CSS's document timeline. Let the separate
  // finite deal animation finish before measuring decorative-frame stability.
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
  await expect(page.locator('.turn-frame')).toHaveCSS('animation-duration', '2s');
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
  expect(await railMotion(page)).toEqual([
    { name: 'none', duration: '0s' },
    { name: 'none', duration: '0s' },
  ]);
  await expect(page.locator('.turn-frame')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.turn-frame')).toHaveCSS('opacity', '0');
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
  await expect(page.locator('.hero-cards-wrap .turn-frame')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.turn-frame')).toHaveCSS('opacity', '1');
  await expect(page.locator('.turn-line')).toHaveCSS('animation-name', 'none');
  expect(
    await page
      .locator('.turn-frame')
      .evaluate((el) =>
        ['::before', '::after'].map((pseudo) => getComputedStyle(el, pseudo).animationName),
      ),
  ).toEqual(['none', 'none']);
  expect(await railMotion(page)).toEqual([
    { name: 'none', duration: '0s' },
    { name: 'none', duration: '0s' },
  ]);
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

test('hand frame shares opponent thinking style; two thin fronts move outward while the prompt stays still', async ({
  page,
}) => {
  const handFrame = page.locator('.turn-frame');
  await expect(handFrame).toHaveCSS('border-radius', '10px');
  await expect(handFrame).toHaveCSS('border-top-width', '1px');
  await expect(handFrame).toHaveCSS('border-top-color', 'rgb(110, 231, 197)');
  const decorations = await handFrame.evaluate((el) => ({
    background: getComputedStyle(el).backgroundImage,
    layers: ['::before', '::after'].map((pseudo) => getComputedStyle(el, pseudo).content),
  }));
  expect(decorations).toEqual({ background: 'none', layers: ['none', 'none'] });
  const matchingThinking = await handFrame.evaluate((el) => {
    const opponent = document.querySelector('.seat');
    const wasThinking = opponent.classList.contains('thinking');
    opponent.classList.add('thinking');
    const own = getComputedStyle(el);
    const peer = getComputedStyle(opponent.querySelector('.seat-profile'));
    const properties = [
      'borderTopColor',
      'animationName',
      'animationDuration',
      'animationTimingFunction',
    ];
    const same = properties.every((property) => own[property] === peer[property]);
    if (!wasThinking) opponent.classList.remove('thinking');
    return same;
  });
  expect(matchingThinking).toBe(true);
  const frame = (pseudo, name, time) =>
    page.locator('.turn-line').evaluate(
      (el, { pseudo, name, time }) => {
        const motion = el
          .getAnimations({ subtree: true })
          .find((animation) => animation.animationName === name);
        if (!motion) throw Error(`Missing ${name}`);
        motion.pause();
        motion.currentTime = time;
        const style = getComputedStyle(el, pseudo);
        return {
          opacity: Number(style.opacity),
          x: new DOMMatrixReadOnly(style.transform).m41,
          width: parseFloat(style.width),
        };
      },
      { pseudo, name, time },
    );
  await expect(page.locator('.turn-line')).toHaveCSS('height', '1px');
  await expect(page.locator('.turn-line')).toHaveCSS('box-shadow', 'none');
  expect(await railMotion(page)).toEqual(outwardPulses);
  await expect(page.locator('#turn-prompt')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#turn-prompt')).toHaveCSS('opacity', '1');
  await expect(page.locator('#turn-prompt')).toHaveCSS('text-shadow', 'none');
  const leftFrom = await frame('::before', 'hero-turn-pulse-left', 192);
  const rightFrom = await frame('::after', 'hero-turn-pulse-right', 192);
  const leftTo = await frame('::before', 'hero-turn-pulse-left', 1120);
  const rightTo = await frame('::after', 'hero-turn-pulse-right', 1120);
  expect(leftTo.x).toBeLessThan(leftFrom.x);
  expect(rightTo.x).toBeGreaterThan(rightFrom.x);
  expect(leftTo.width).toBe(leftFrom.width);
  expect(rightTo.width).toBe(rightFrom.width);
  expect(leftTo.x + rightTo.x).toBeCloseTo(-leftTo.width, 2);
  const leftFaded = await frame('::before', 'hero-turn-pulse-left', 1568);
  const rightFaded = await frame('::after', 'hero-turn-pulse-right', 1568);
  expect(leftFaded.opacity).toBeLessThan(0.15);
  expect(rightFaded.opacity).toBeLessThan(0.15);
  await page.clock.fastForward(3200);
  await expect(handFrame).toHaveCSS('opacity', '1');
  await expect(handFrame).toHaveCSS('animation-name', 'turn-glow');
  await expect(page.locator('.turn-line')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#turn-prompt')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#turn-prompt')).toHaveCSS('opacity', '1');
  await finishDeal(page);
  const before = await boxes(page);
  const promptBounds = await page.locator('#turn-prompt').boundingBox();
  await frame('::before', 'hero-turn-pulse-left', 192);
  await frame('::after', 'hero-turn-pulse-right', 192);
  expect(await boxes(page)).toEqual(before);
  expect(await page.locator('#turn-prompt').boundingBox()).toEqual(promptBounds);
});
