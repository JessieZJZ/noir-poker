import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true', { timeout: 30000 });
  await page.evaluate(() => window.qa.stop());
}
async function openTutorial(page) {
  await page.locator('#rules-button').click();
  await page.locator('#tutorial-menu-item').click();
  await expect(page.locator('#tutorial-dialog')).toBeVisible();
}
const coach = (page) => page.evaluate(() => window.noir.getState().tutorial);

// Real taps only: the same controls a new player uses. Acts on the view the
// caller judged, or a step reached since then would be tapped through unseen.
async function advance(page, view) {
  if (view.options.length) {
    for (const option of view.options) {
      await page.locator(`[data-tutorial-answer="${option.index}"]`).click();
      if ((await coach(page)).canContinue) break;
    }
    await page.locator('#tutorial-next').click();
    return;
  }
  if (view.canContinue) return page.locator('#tutorial-next').click();
  const action = view.allowed?.action;
  if (action === 'fold') return page.locator('#fold-button').click();
  if (action === 'call' || action === 'check') return page.locator('#call-button').click();
  if (action === 'finish') return page.locator('#continue-deal-button').click();
  if (action === 'raise') {
    if (view.allowed.preset) await page.locator(`[data-preset="${view.allowed.preset}"]`).click();
    return page.locator('#raise-button').click();
  }
  await page.waitForTimeout(60);
}
async function playUntil(page, done) {
  const deadline = Date.now() + 100000;
  while (Date.now() < deadline) {
    const view = await coach(page);
    if (done(view)) return view;
    await advance(page, view);
  }
  throw Error('The tutorial did not reach the expected step');
}

test('the guide menu opens a tutorial that pauses the live hand and restores it on exit', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#rules-button').click();
  await expect(page.locator('#guide-menu [role="menuitem"]')).toHaveText([
    '玩法指南',
    '新手引导',
    '对局记录',
    '胜率计算器',
  ]);
  await page.locator('#tutorial-menu-item').click();
  const dialog = page.locator('#tutorial-dialog');
  await expect(dialog.locator('h2')).toHaveText('新手引导');
  await expect(dialog.locator('.tutorial-steps li')).toHaveCount(5);
  await expect(dialog.locator('#tutorial-dialog-note')).toContainText('不计入对局记录');

  const before = await page.evaluate(() => ({
    state: window.noir.getState(),
    records: window.noir.getRecords(),
  }));
  await dialog.locator('#tutorial-dialog-primary').click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#tutorial-coach')).toBeVisible();
  await expect(page.locator('#session-number-label')).toBeHidden();
  await expect(page.locator('.header-actions')).toBeHidden();
  await expect(page.locator('#hero-position')).toHaveText('BTN');
  await expect(page.locator('.hero-cards-wrap')).toHaveAttribute('data-tutorial-focus', 'true');
  await expect.poll(() => page.evaluate(() => window.noir.getState().hole)).toEqual(['10♥', '9♥']);

  await page.locator('#tutorial-exit').click();
  await expect(page.locator('#tutorial-coach')).toBeHidden();
  await expect(page.locator('.header-actions')).toBeVisible();
  await expect(page.locator('[data-tutorial-focus]')).toHaveCount(0);
  const after = await page.evaluate(() => ({
    state: window.noir.getState(),
    records: window.noir.getRecords(),
  }));
  expect(after.state.tutorial).toBeNull();
  expect(after.state.hand).toBe(before.state.hand);
  expect(after.state.hole).toEqual(before.state.hole);
  expect(after.state.pot).toBe(before.state.pot);
  expect(after.state.players.map((p) => p.stack)).toEqual(before.state.players.map((p) => p.stack));
  expect(after.records).toEqual(before.records);
});

test('closing the intro leaves the live table exactly as it was', async ({ page }) => {
  await ready(page);
  const before = await page.evaluate(() => window.noir.getState());
  await openTutorial(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#tutorial-dialog')).not.toBeVisible();
  await expect.poll(() => coach(page)).toBeNull();
  const after = await page.evaluate(() => window.noir.getState());
  expect(after.hole).toEqual(before.hole);
  await expect(page.locator('#tutorial-coach')).toBeHidden();
});

test('the tutorial opens from the waiting table and returns to it unseated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const surface = page.locator('.game-surface');
  await expect(surface).toHaveAttribute('data-entry-state', 'waiting');
  const before = await page.evaluate(() => window.noir.getState());
  expect(before.phase).toBe('idle');
  await openTutorial(page);
  await page.locator('#tutorial-dialog-primary').click();
  await expect(page.locator('#tutorial-coach')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.noir.getState().hole)).toEqual(['10♥', '9♥']);
  await expect(page.locator('#join-table-button')).toBeHidden();
  await page.locator('#tutorial-exit').click();
  await expect(page.locator('#tutorial-coach')).toBeHidden();
  await expect(surface).toHaveAttribute('data-entry-state', 'waiting');
  await expect(page.locator('#join-table-button')).toBeVisible();
  expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
  await page.locator('#join-table-button').click();
  await expect(surface).toHaveAttribute('data-entry-state', 'playing');
});

test('a guided turn leaves only the taught control live', async ({ page }) => {
  await ready(page);
  await openTutorial(page);
  await page.locator('#tutorial-dialog-primary').click();
  await expect(page.locator('#fold-button')).toBeDisabled();
  const view = await playUntil(page, (v) => v.allowed?.action === 'call');
  expect(view.text).toContain('这次要补 200');
  await expect(page.locator('#call-button')).toBeEnabled();
  await expect(page.locator('#call-button')).toHaveAttribute('data-tutorial-focus', 'true');
  await expect(page.locator('#fold-button')).toBeDisabled();
  await expect(page.locator('#raise-button')).toBeDisabled();
  await expect(page.locator('#bet-slider')).toBeDisabled();
  await expect(page.locator('[data-preset="all"]')).toBeDisabled();
});

test('the first hand reaches showdown, offers a replay and a wrong answer is corrected', async ({
  page,
}) => {
  test.setTimeout(150000);
  await ready(page);
  await openTutorial(page);
  await page.locator('#tutorial-dialog-primary').click();
  const quiz = await playUntil(page, (v) => v.options.length > 0);
  await page.locator('[data-tutorial-answer="0"]').click();
  await expect(page.locator('[data-tutorial-answer="0"]')).toHaveClass(/is-wrong/);
  await expect(page.locator('#tutorial-next')).toBeHidden();
  await expect(page.locator('#tutorial-text')).not.toHaveText(quiz.text);
  await page.locator('[data-tutorial-answer="1"]').click();
  await expect(page.locator('#tutorial-options')).toBeHidden();
  await expect(page.locator('#tutorial-text')).toContainText('同花顺、四条、葫芦');

  await playUntil(page, (v) => v.stage === 'summary');
  const state = await page.evaluate(() => window.noir.getState());
  expect(state.phase).toBe('done');
  expect(state.result).toContain('同花');
  await expect(page.locator('#showdown-stage')).toBeVisible();
  await expect(page.locator('#tutorial-dialog h2')).toHaveText('第一手完成');
  await expect(page.locator('#next-button')).toBeHidden();
  await expect(page.locator('#restart-hand-button')).toBeHidden();
  await expect(page.locator('#review-hand-button')).toBeHidden();

  await page.locator('#tutorial-dialog-secondary').click();
  await expect(page.locator('#tutorial-dialog')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => window.noir.getState().phase)).toBe('playing');
  await expect.poll(() => page.evaluate(() => window.noir.getState().pot)).toBe(300);
});

test('all lessons run through to the real free hand and the finish card', async ({ page }) => {
  test.setTimeout(240000);
  await ready(page);
  const before = await page.evaluate(() => window.noir.getRecords());
  await openTutorial(page);
  await page.locator('#tutorial-dialog-primary').click();
  for (const title of ['第一手完成', '第二手完成', '第三手完成', '第四手完成']) {
    await playUntil(page, (v) => v.stage === 'summary');
    await expect(page.locator('#tutorial-dialog h2')).toHaveText(title);
    if (title === '第三手完成') {
      await expect(page.locator('#board-caption')).toContainText('练习补牌');
      const state = await page.evaluate(() => window.noir.getState());
      expect(state.board).toHaveLength(5);
      expect(state.settlementBoard).toHaveLength(0);
    }
    if (title === '第四手完成') {
      const pots = await page.evaluate(() => window.noir.getState().pots);
      expect(pots.map((p) => p.awards[0].name)).toEqual(['Mia', '你']);
      await expect(page.locator('#showdown-context')).toContainText('主池与边池分别结算');
    }
    await page.locator('#tutorial-dialog-primary').click();
    await expect(page.locator('#tutorial-dialog')).not.toBeVisible();
  }
  await expect.poll(async () => (await coach(page)).stage).toBe('free');
  await expect(page.locator('#tutorial-lesson')).toContainText('第 5 / 5 手');
  for (let i = 0; i < 300; i++) {
    const [view, state] = await page.evaluate(() => [
      window.noir.getState().tutorial,
      window.noir.getState(),
    ]);
    if (view.canContinue) break;
    if (state.legal.enabled)
      await page.locator(state.legal.canCheck ? '#call-button' : '#fold-button').click();
    else if (await page.locator('#continue-deal-button').isVisible())
      await page.locator('#continue-deal-button').click();
    await page.waitForTimeout(100);
  }
  await page.locator('#tutorial-next').click();
  await expect(page.locator('#tutorial-dialog h2')).toHaveText('你可以上桌了');
  await expect(page.locator('#tutorial-dialog-primary')).toHaveText('开始真实对局');
  await page.locator('#tutorial-dialog-primary').click();
  await expect(page.locator('#tutorial-coach')).toBeHidden();
  expect(await page.evaluate(() => window.noir.getState().tutorial)).toBeNull();
  expect(await page.evaluate(() => window.noir.getRecords())).toEqual(before);
});

test('the tutorial can be started from the records page', async ({ page }) => {
  await ready(page);
  await page.locator('#rules-button').click();
  await page.locator('#records-menu-item').click();
  await expect(page.locator('#records-page')).toBeVisible();
  await openTutorial(page);
  await expect(page.locator('#records-page')).toBeHidden();
  await page.locator('#tutorial-dialog-primary').click();
  await expect(page.locator('#tutorial-coach')).toBeVisible();
});

test('reviewing an archived hand never copies the coach panel', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.qa.recordsStart();
    window.qa.recordsFinish();
  });
  await page.locator('#rules-button').click();
  await page.locator('#records-menu-item').click();
  await page.locator('[data-record-hand]').first().click();
  await expect(page.locator('.records-game-surface')).toBeVisible();
  await expect(page.locator('.records-game-surface .tutorial-coach')).toHaveCount(0);
});

test('the coach, table and controls share the first screen without overlapping', async ({
  page,
}) => {
  await ready(page);
  await openTutorial(page);
  await page.locator('#tutorial-dialog-primary').click();
  await expect(page.locator('#tutorial-coach')).toBeVisible();
  await page.waitForTimeout(300);
  const viewport = page.viewportSize();
  const coachBox = await page.locator('#tutorial-coach').boundingBox();
  const dock = await page.locator('.action-dock').boundingBox();
  const arena = await page.locator('.hero-name').boundingBox();
  if (viewport.width <= 900) {
    expect(coachBox.y).toBeGreaterThanOrEqual(arena.y + arena.height - 1);
    expect(dock.y).toBeGreaterThanOrEqual(coachBox.y + coachBox.height - 1);
    expect(dock.y + dock.height).toBeLessThanOrEqual(viewport.height);
    const table = await page.locator('#arena').boundingBox();
    await page.locator('#tutorial-next').click();
    await page.waitForTimeout(200);
    expect(await page.locator('#arena').boundingBox()).toEqual(table);
  } else {
    expect(coachBox.x).toBeGreaterThanOrEqual(dock.x + dock.width);
    expect(coachBox.y + coachBox.height).toBeLessThanOrEqual(viewport.height);
    expect(coachBox.height).toBeGreaterThan(300);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
});

for (const [locale, title, button, primary] of [
  ['en', 'Beginner tutorial', 'Exit tutorial', 'Continue'],
  ['ru', 'Обучение для новичков', 'Выйти из обучения', 'Продолжить'],
  ['ja', '初心者ガイド', 'ガイドを終了', '続ける'],
]) {
  test(`coach copy and dynamic amounts are translated in ${locale}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate(() => window.qa.stop());
    await page.locator('#rules-button').click();
    await expect(page.locator('#tutorial-menu-item')).toHaveText(title);
    await page.locator('#tutorial-menu-item').click();
    await expect(page.locator('#tutorial-dialog h2')).toHaveText(title);
    await page.locator('#tutorial-dialog-primary').click();
    await expect(page.locator('#tutorial-exit')).toHaveText(button);
    await expect(page.locator('#tutorial-next')).toHaveText(primary);
    await page.locator('#tutorial-next').click();
    const text = page.locator('#tutorial-text');
    await expect(text).toContainText('20K');
    await expect(text).toContainText('20000');
    if (locale !== 'ja') await expect(page.locator('#tutorial-coach')).not.toContainText(/[一-龥]/);
    await page.locator('#tutorial-next').click();
    await expect(text).toContainText('100');
    await expect(text).toContainText('200');
  });
}
