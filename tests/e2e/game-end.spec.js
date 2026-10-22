import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.noir.getState());
// Seek every running animation so frames are checked without waiting on timers.
const seek = (page, selector, time) =>
  page.evaluate(
    ({ selector, time }) => {
      for (const animation of document.getAnimations()) {
        const target = animation.effect?.target;
        if (target?.closest?.(selector)) {
          animation.pause();
          animation.currentTime = time;
        }
      }
    },
    { selector, time },
  );
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
});

test('a premium start lights the hole cards after the deal, then the effect leaves', async ({
  page,
}) => {
  await page.clock.install();
  await page.evaluate(() => window.qa.premiumStart());
  const wrap = page.locator('main.main .hero-cards-wrap');
  await expect(wrap).not.toHaveClass(/premium-start/);
  await page.clock.runFor(1200);
  await expect(wrap).toHaveClass(/premium-start/);
  await expect(wrap.locator('.premium-spark')).toHaveCount(18);
  await expect(wrap.locator('.playing-card').first()).toHaveCSS('animation-name', 'deal-card');
  await page.clock.runFor(2700);
  await expect(wrap).not.toHaveClass(/premium-start/);
  await expect(wrap.locator('.premium-sparks')).toHaveCount(0);
});

for (const heroWins of [true, false]) {
  test(`${heroWins ? 'the hero' : 'the last bot'} is crowned after winning heads-up`, async ({
    page,
  }) => {
    await page.evaluate((heroWins) => window.qa.finale({ heroWins }), heroWins);
    await page.evaluate(() => window.qa.finaleShowdown());
    const view = await state(page);
    expect(view.over).toEqual({ heroPlace: heroWins ? 1 : 2, championId: heroWins ? 0 : 1 });
    await expect(page.locator('.crown-stage')).toHaveCount(1);
    await expect(page.locator('.crown-caption')).toHaveText(
      heroWins ? '你获得冠军' : 'Mia 获得冠军',
    );
    await expect(page.locator('.confetti-layer')).toHaveCount(heroWins ? 1 : 0);
    if (heroWins) await expect(page.locator('.confetti-piece')).toHaveCount(112);
    const resting = heroWins ? '.hero-champion-crown' : '.seat-1 .champion-crown';
    await expect(page.locator(resting)).toHaveClass(/crown-pending/);
    await seek(page, '.crown-stage', 1000);
    await page.screenshot({ path: test.info().outputPath(`coronation-${heroWins}.png`) });
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    await expect(page.locator('.crown-stage')).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator(resting)).not.toHaveClass(/crown-pending/);
    await expect(page.locator('.champion-crown')).toHaveCount(1);
    // The crown is worn upright: no rotation, only the landing scale.
    expect(
      await page.locator(resting).evaluate((crown) => {
        const style = getComputedStyle(crown);
        const [, b = 0, c = 0] = (style.transform.match(/matrix\(([^)]+)\)/)?.[1] || '')
          .split(',')
          .map(Number);
        return { rotate: style.rotate, skew: Math.abs(b) + Math.abs(c) };
      }),
    ).toEqual({ rotate: 'none', skew: 0 });
    await expect(page.locator('#street-label')).toHaveText('本局结束');
    await expect(page.locator('#next-button')).toHaveText('下一局');
    await expect(page.locator('#reset-button')).toBeHidden();
    await expect(page.locator('#restart-hand-button')).toBeVisible();
    await expect(page.locator('#session-title')).toHaveText('本局结束');
    await expect(page.locator('#session-standing')).toHaveText(heroWins ? '冠军' : '第2名');
    await expect(page.locator('#session-standing')).toHaveClass(
      heroWins ? /standing-champion/ : /standing-2/,
    );
    await page.screenshot({ path: test.info().outputPath(`crowned-${heroWins}.png`) });
    const session = view.sessionNumber;
    await page.locator('#next-button').click();
    const next = await state(page);
    expect(next.over).toBeNull();
    expect(next.sessionNumber).toBe(session + 1);
    expect(next.hand).toBe(1);
    await expect(page.locator('.champion-crown')).toHaveCount(0);
    await expect(page.locator('#reset-button')).toBeVisible();
    await expect(page.locator('#session-title')).toHaveText('本局练习');
    await page.goto('/#records');
    const finished = page.locator(`[data-session-number="${session}"]`);
    await expect(finished.locator('.record-standing')).toHaveText(heroWins ? '冠军' : '第2名');
    await expect(
      page.locator(`[data-session-number="${session + 1}"] .record-standing`),
    ).toHaveText('进行中');
  });
}

test('retrying the deciding hand withdraws the crown and the final standing', async ({ page }) => {
  await page.evaluate(() => window.qa.finale({ heroWins: true }));
  await page.evaluate(() => window.qa.finaleShowdown());
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  await expect(page.locator('.hero-champion-crown')).toHaveCount(1);
  await page.locator('#restart-hand-button').click();
  const view = await state(page);
  expect(view.over).toBeNull();
  expect(view.replayAttempt).toBe(1);
  await expect(page.locator('.champion-crown, .crown-stage')).toHaveCount(0);
  await expect(page.locator('#session-title')).toHaveText('本局练习');
  await expect(page.locator('#reset-button')).toBeVisible();
});

test('busting with refills left shows the refill count, deals at once and counts the stack up', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.finale({ heroWins: false, rivals: 3, rebuysUsed: 1 }));
  await page.evaluate(() => window.qa.finaleShowdown());
  const view = await state(page);
  expect(view.over).toBeNull();
  expect(view.needsRebuy).toBe(true);
  const next = page.locator('#next-button');
  await expect(next).toContainText('补充筹码');
  await expect(next.locator('.rebuy-count')).toHaveText('剩 2 次');
  const hand = view.hand;
  await next.click();
  // The next hand is dealt immediately; the refill effect plays during it.
  const dealt = await state(page);
  expect(dealt.hand).toBe(hand + 1);
  expect(dealt.phase).not.toBe('done');
  expect(dealt.rebuysLeft).toBe(1);
  expect(dealt.needsRebuy).toBe(false);
  await expect(next).toBeHidden();
  await expect(page.locator('.rebuy-burst')).toHaveText('+20K');
  await expect(page.locator('#hero-stack')).toHaveClass(/stack-refill/);
  // The name row stays still while the stack counts up.
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push(
      await page.evaluate(() => {
        const name = document.querySelector('.hero-identity > strong').getBoundingClientRect(),
          stack = document.querySelector('#hero-stack');
        return { left: Math.round(name.left * 10) / 10, text: stack.textContent };
      }),
    );
    await page.waitForTimeout(80);
  }
  const lefts = samples.map((sample) => sample.left);
  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(0.5);
  expect(new Set(samples.map((sample) => sample.text)).size).toBeGreaterThan(2);
  await page.screenshot({ path: test.info().outputPath('refill.png') });
  await expect(page.locator('.rebuy-burst')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#hero-stack')).not.toHaveClass(/stack-refill/);
  // After the count the stack shows the real amount again (blinds included).
  await expect(page.locator('#hero-stack')).not.toHaveText('0');
  expect((await state(page)).hand).toBe(hand + 1);
});

test('busting after the last refill ends the game with a place and no champion', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.finale({ heroWins: false, rivals: 3, rebuysUsed: 3 }));
  await page.evaluate(() => window.qa.finaleShowdown());
  const view = await state(page);
  expect(view.over.championId).toBeNull();
  await expect(page.locator('.crown-stage, .confetti-layer, .champion-crown')).toHaveCount(0);
  await expect(page.locator('#next-button')).toHaveText('下一局');
  await expect(page.locator('#reset-button')).toBeHidden();
  await expect(page.locator('#session-standing')).toHaveText(`第${view.over.heroPlace}名`);
  await expect(page.locator('main.main .hero-area')).toHaveClass(/hero-out/);
  // Eliminated bots stay greyed out with their place.
  await expect(page.locator('.seat-4')).toHaveClass(/seat-out/);
  await expect(page.locator('.seat-4 .seat-action')).toContainText('出局 · 第');
});

test('records drop the live note, keep results at full opacity and toast a save failure once', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qa.recordsFinish();
    window.qa.recordsRetry();
    window.qa.recordsFinish();
  });
  await page.goto('/#records');
  await expect(page.locator('.records-live-note, #records-storage-error')).toHaveCount(0);
  for (const result of await page.locator('.record-hand-result').all())
    await expect(result).toHaveCSS('opacity', '1');
  await expect(page.locator('.compliance-footer')).toHaveText('单机练习·虚拟筹码·禁止赌博');
  await expect(page.locator('.compliance-footer')).toHaveCSS('text-align', 'center');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'noir-game-records-v1') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.locator('#records-back-button').click();
  await page.evaluate(() => window.qa.recordsNext());
  await expect(page.locator('#app-toast')).toHaveText('对局记录保存失败，关闭后可能丢失。');
  await expect(page.locator('#app-toast')).toBeHidden({ timeout: 5000 });
  await page.evaluate(() => {
    window.qa.recordsFinish();
    window.qa.recordsNext();
  });
  await expect(page.locator('#app-toast')).toBeHidden();
  // A fresh start does not bring the warning back.
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await expect(page.locator('#app-toast')).toBeHidden();
});
