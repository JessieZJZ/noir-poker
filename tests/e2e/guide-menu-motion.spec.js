import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  await page.mouse.move(0, 0);
  const trigger = page.locator('#rules-button');
  // Stop rotation before freezing time, then restart its interval exactly at
  // the paused clock. Wall time between driver calls must not consume the
  // 400 ms animation window that this test inspects.
  await trigger.focus();
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await trigger.evaluate((element) => element.blur());
});

test('automatic guide labels roll downward in a clipped stable slot and arrows have no circles', async ({
  page,
}) => {
  const trigger = page.locator('#rules-button');
  const before = await trigger.boundingBox();
  // A slow load can let one real tick pass before the clock is frozen, so the
  // cycle is checked from whichever label is showing.
  const order = ['records', 'tutorial', 'guide', 'win-rate'];
  const start = order.indexOf(await trigger.getAttribute('data-label'));
  expect(start).toBeGreaterThanOrEqual(0);
  const after = (steps) => order[(start + steps) % order.length];
  await page.clock.runFor(5000);
  await expect(trigger).toHaveAttribute('data-label', after(1));
  await expect(trigger).toHaveAttribute('data-animating', 'true');
  const motion = await trigger.evaluate((button) => {
    const slot = button.querySelector('.guide-rotating-label');
    const incoming = button.querySelector('.guide-label-enter');
    const outgoing = button.querySelector('.guide-label-leave');
    const animation = (element) => ({
      name: getComputedStyle(element).animationName,
      transforms: element
        .getAnimations()[0]
        .effect.getKeyframes()
        .map((frame) => frame.transform),
      hidden: element.getAttribute('aria-hidden'),
    });
    const circle = button.querySelector('.guide-menu-arrow');
    return {
      clip: getComputedStyle(slot).overflow,
      incoming: animation(incoming),
      outgoing: animation(outgoing),
      circle: {
        radius: getComputedStyle(circle).borderRadius,
        border: parseFloat(getComputedStyle(circle).borderWidth),
      },
    };
  });
  expect(motion.clip).toBe('hidden');
  expect(motion.incoming.name).toBe('guide-label-enter');
  expect(motion.incoming.transforms).toEqual(['translateY(-110%)', 'translateY(0px)']);
  expect(motion.outgoing.transforms).toEqual(['translateY(0px)', 'translateY(110%)']);
  expect(motion.incoming.hidden).toBe('false');
  expect(motion.outgoing.hidden).toBe('true');
  expect(motion.circle).toEqual({ radius: '0px', border: 0 });
  await page.clock.runFor(400);
  await expect(trigger).not.toHaveAttribute('data-animating');
  const settled = await trigger.boundingBox();
  expect(settled.width).toBeCloseTo(before.width, 1);
  expect(settled.height).toBeCloseTo(before.height, 1);
  // Every menu choice takes its turn in menu order, then the cycle repeats.
  for (const label of [after(2), after(3), after(4)]) {
    await page.clock.runFor(5000);
    await expect(trigger).toHaveAttribute('data-label', label);
    await expect(trigger.locator(`[data-guide-label="${label}"]`)).toHaveAttribute(
      'aria-hidden',
      'false',
    );
  }
  await page.clock.runFor(400);
  const widest = await trigger.boundingBox();
  expect(widest.width).toBeCloseTo(before.width, 1);
});

test('reduced motion and focused menus keep labels still, with working keyboard choices after page restore', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const trigger = page.locator('#rules-button');
  const original = await trigger.getAttribute('data-label');
  await page.clock.runFor(12000);
  await expect(trigger).toHaveAttribute('data-label', original);
  await expect(trigger).not.toHaveAttribute('data-animating');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await trigger.focus();
  await page.clock.runFor(12000);
  await expect(trigger).toHaveAttribute('data-label', original);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await trigger.press('ArrowDown');
  await expect(page.locator('#records-menu-item')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#tutorial-menu-item')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#guide-menu-item')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-menu')).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const locale of ['zh-CN', 'es', 'pt', 'de'])
  test(`four rotating labels keep the logo and settings on a 320px header in ${locale}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const mark = box('.brand-mark'),
        rules = box('#rules-button'),
        settings = box('#opponents-button');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        logoClear: mark.left >= 0 && mark.right <= rules.left,
        settingsInside: rules.right <= settings.left && settings.right <= innerWidth,
        labels: document.querySelectorAll('#rules-button [data-guide-label]').length,
      };
    });
    expect(layout).toEqual({ overflow: false, logoClear: true, settingsInside: true, labels: 4 });
  });
