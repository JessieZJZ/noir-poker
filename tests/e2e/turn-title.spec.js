import { test, expect } from '@playwright/test';

test('Spanish actual turn keeps a compact fourth-community-card caption in landscape', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The caption is intentionally hidden in the narrow phone layout. Exercise
  // the landscape table where the original repeated title was visibly broken.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('noir-locale', 'es'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page).toHaveTitle("NOIR Poker · Práctica de Hold'em sin conexión");
  const state = await page.evaluate(() => {
    // The existing test-only fixture advances the real engine through legal
    // calls/checks, then renders an actual four-card turn. No text is injected.
    const result = window.qa.bettingTurn(1, 2);
    window.qa.stop();
    return result;
  });
  // publicState reports the canonical engine street name, not a localized label.
  expect(state.street).toBe('转牌');
  expect(state.board).toHaveLength(4);
  await expect(page.locator('.board .playing-card')).toHaveCount(4);
  // Only wait for finite, running board-card animations. The intentional
  // infinite hero-turn glow is unrelated to the caption and stays untouched.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.board .playing-card')].every((card) =>
      card
        .getAnimations({ subtree: true })
        .filter((animation) =>
          Number.isFinite(animation.effect?.getComputedTiming().activeDuration),
        )
        .every((animation) => animation.playState !== 'running'),
    ),
  );
  const caption = page.locator('#board-caption');
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText('TURN · 4.ª carta comunitaria');
  const bounds = await caption.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const arena = element.closest('.arena').getBoundingClientRect();
    return {
      lines: range.getClientRects().length,
      text: { left: text.left, right: text.right },
      arena: { left: arena.left, right: arena.right },
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(bounds.lines).toBe(1);
  expect(bounds.text.left).toBeGreaterThanOrEqual(bounds.arena.left);
  expect(bounds.text.right).toBeLessThanOrEqual(bounds.arena.right);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
  await page.screenshot({ path: test.info().outputPath('es-turn-landscape.png') });
  expect(errors).toEqual([]);
});
