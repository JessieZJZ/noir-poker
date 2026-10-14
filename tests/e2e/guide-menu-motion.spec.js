import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  await page.mouse.move(0, 0);
});

test('automatic guide labels roll downward in a clipped stable slot and arrows have circles', async ({
  page,
}) => {
  const trigger = page.locator('#rules-button');
  const before = await trigger.boundingBox();
  await page.clock.runFor(5000);
  await expect(trigger).toHaveAttribute('data-label', 'records');
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
  expect(motion.circle).toEqual({ radius: '50%', border: 1 });
  await page.clock.runFor(400);
  await expect(trigger).not.toHaveAttribute('data-animating');
  const after = await trigger.boundingBox();
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
  await page.clock.runFor(5000);
  await expect(trigger).toHaveAttribute('data-label', 'guide');
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
  await expect(page.locator('#guide-menu-item')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#records-menu-item')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-menu')).toBeHidden();
  await expect(trigger).toBeFocused();
});
