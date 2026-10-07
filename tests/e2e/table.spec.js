import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.qa && window.noir);
  page.errors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

async function assertBestHands(page, count) {
  await expect(page.locator('.showdown-player')).toHaveCount(count);
  const comparisons = await page.evaluate(async () => {
    const { evaluate, deckOfCards } = await import('/src/engine/poker.js');
    const deck = deckOfCards(),
      state = window.noir.getState();
    const parse = (labels) =>
      labels.map((label) =>
        deck.find(
          (c) =>
            c.symbol === label.at(-1) &&
            (c.rank === 10 ? '10' : '23456789TJQKA'[c.rank - 2]) === label.slice(0, -1),
        ),
      );
    return [...document.querySelectorAll('.showdown-player')].map((row) => {
      const p = state.players[Number(row.dataset.player)];
      return {
        actual: [...row.querySelectorAll('.winning-card')].map((c) => c.dataset.card).sort(),
        expected: evaluate([...parse(p.cards), ...parse(state.board)])
          .cards.map((c) => String(c.key))
          .sort(),
      };
    });
  });
  for (const row of comparisons) expect(row.actual).toEqual(row.expected);
}

test('5–9 player showdown reveals all holes immediately and displays each best five', async ({
  page,
}) => {
  for (let count = 5; count <= 9; count++) {
    await page.evaluate((n) => window.qa.river(n), count);
    await expect(page.locator('.seat .playing-card')).toHaveCount(2 * (count - 1));
    await expect(page.locator('.seat-peek')).toHaveCount(0);
    await expect(page.locator('#showdown-stage')).toBeHidden();
    await page.evaluate(() => window.qa.finish());
    await assertBestHands(page, count);
    await expect(page.locator('.seat-peek')).toHaveCount(count - 1);
  }
  await expect(page.locator('#replay-showdown, #show-hands-button, #review-card')).toHaveCount(0);
});

test('each eye toggles only its seat in place without changing showdown or settlement', async ({
  page,
}) => {
  const state = await page.evaluate(() =>
    window.qa.scene('Qh Qc', '4d 6s Kh 5h 3s', {
      count: 9,
      totals: [500, 50, 100, 200, 300, 400, 500, 600, 700],
      folded: [3, 7],
      otherHoles: { 1: '7c 8d' },
    }),
  );
  await assertBestHands(page, 7);
  for (let id = 1; id < 9; id++) {
    const button = page.locator(`[data-peek-player="${id}"]`);
    const cards = page.locator(`#seat-hand-${id} .playing-card`);
    const expected = await page.evaluate((id) => window.qa.hole(id), id);
    if ((await button.getAttribute('aria-pressed')) === 'true') {
      await button.click();
      await expect(cards).toHaveCount(0);
    }
    const othersBefore = await page
      .locator(`.seat:not(.seat-${id}) .playing-card`)
      .evaluateAll((elements) => elements.map((e) => e.getAttribute('aria-label')));
    await button.click();
    await expect(cards).toHaveCount(2);
    expect(
      await cards.evaluateAll((elements) => elements.map((e) => e.getAttribute('aria-label'))),
    ).toEqual(expected);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toBeFocused();
    await expect(page.locator('dialog[open], #hands-dialog')).toHaveCount(0);
    expect(
      await page
        .locator(`.seat:not(.seat-${id}) .playing-card`)
        .evaluateAll((elements) => elements.map((e) => e.getAttribute('aria-label'))),
    ).toEqual(othersBefore);
    if (state.players[id].folded) {
      await expect(page.locator(`.seat-${id}`)).toHaveClass(/folded/);
      await expect(page.locator(`#seat-hand-${id}`)).toHaveCSS('opacity', '1');
      await expect(page.locator(`.showdown-player[data-player="${id}"]`)).toHaveCount(0);
    }
    const after = await page.evaluate(() => window.noir.getState());
    expect(after.players.map((p) => p.stack)).toEqual(state.players.map((p) => p.stack));
    expect(after.pots).toEqual(state.pots);
    await button.click();
    await expect(cards).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.locator('.showdown-player')).toHaveCount(7);
});

test('fold-win holes reveal individually and clear on retry, next hand and reset', async ({
  page,
}) => {
  for (const count of [5, 6, 9]) {
    const before = await page.evaluate((n) => window.qa.foldWin(n), count);
    await expect(page.locator('.seat .playing-card')).toHaveCount(0);
    const id = count - 1;
    const expected = await page.evaluate((id) => window.qa.hole(id), id);
    await page.locator(`[data-peek-player="${id}"]`).click();
    await expect(page.locator('.seat .playing-card')).toHaveCount(2);
    expect(
      await page
        .locator(`#seat-hand-${id} .playing-card`)
        .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label'))),
    ).toEqual(expected);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.locator('#restart-hand-button').click();
    await page.evaluate(() => window.qa.stop());
    await expect(page.locator('.seat .playing-card, .seat-peek')).toHaveCount(0);
    expect((await page.evaluate(() => window.noir.getState())).hole).toEqual(before.hole);
    await page.evaluate(() => window.qa.foldRest());
    await expect(page.locator('.seat .playing-card')).toHaveCount(0);
    await page.locator(`[data-peek-player="${id}"]`).click();
    await page.locator('#next-button').click();
    await page.evaluate(() => window.qa.stop());
    await expect(page.locator('.seat .playing-card, .seat-peek')).toHaveCount(0);
    await page.evaluate(() => window.qa.foldRest());
    await expect(page.locator('.seat .playing-card')).toHaveCount(0);
  }
  await page.evaluate(() => window.qa.foldWin(9));
  await page.locator('[data-peek-player="6"]').click();
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('.seat .playing-card, .seat-peek')).toHaveCount(0);
  await expect(page.locator('#stat-hands')).toHaveText('0');
});

test('fold continuation settles unequal all-ins once, then retry restores original hand', async ({
  page,
}) => {
  const before = await page.evaluate(() => window.qa.heroTurn(9, true));
  const wealth = before.players.reduce((sum, p) => sum + p.stack, 0) + before.pot;
  await page.locator('#fold-button').click();
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.allinRest();
  });
  await expect(page.locator('#continue-deal-button')).toBeVisible();
  await page.locator('#continue-deal-button').evaluate((button) => {
    button.click();
    button.click();
  });
  await page.waitForFunction(() => window.noir.getState().phase === 'done');
  const done = await page.evaluate(() => window.noir.getState());
  expect(done.hand).toBe(before.hand);
  expect(done.board).toHaveLength(5);
  expect(done.pots.length).toBeGreaterThan(1);
  expect(done.players.reduce((sum, p) => sum + p.stack, 0)).toBe(wealth);
  await expect(page.locator('#stat-hands')).toHaveText('1');
  await assertBestHands(page, 8);
  await page.locator('#restart-hand-button').click();
  const retry = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  expect(retry.hand).toBe(before.hand);
  expect(retry.hole).toEqual(before.hole);
  expect(retry.stack).toBe(before.stack);
  await expect(page.locator('#stat-hands')).toHaveText('0');
  await expect(page.locator('.showdown-player, .seat-peek')).toHaveCount(0);
  await expect(page.locator('#review-hand-button')).toBeHidden();
});

test('review completes through real worker with facts and a conditional follow-up plan', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.heroTurn());
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  await page.locator('#continue-deal-button').click();
  await page.waitForFunction(() => window.noir.getState().phase === 'done');
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toBeVisible();
  await expect(page.locator('#review-priority')).toBeVisible({ timeout: 15000 });
  expect(await page.locator('#review-evidence li').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#review-plan')).not.toHaveText('分析完成后展示后续处理路线。');
  await expect(page.locator('#review-model-note')).toContainText('范围');
  await expect(page.locator('#review-reason')).not.toBeEmpty();
});

test('activity uses full history; settings, settlement and cards fit narrow screens', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [6, 9]) {
      await page.evaluate((n) => {
        window.qa.river(n);
        window.qa.finish();
      }, count);
      const layout = await page.evaluate(() => {
        const list = document.querySelector('#activity-list');
        const board = document.querySelector('#board').getBoundingClientRect();
        const banner = document.querySelector('#result-banner').getBoundingClientRect();
        const overlaps = [...document.querySelectorAll('.seat-peek')].some((el) => {
          const a = el.getBoundingClientRect();
          return (
            a.left < board.right &&
            a.right > board.left &&
            a.top < board.bottom &&
            a.bottom > board.top
          );
        });
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          logCount: list.children.length,
          actualLogs: window.qa.state().totalLogs,
          scrollHeight: list.scrollHeight,
          clientHeight: list.clientHeight,
          overflow: getComputedStyle(list).overflowY,
          bannerOverlaps: banner.bottom > board.top && banner.top < board.bottom,
          peekOverlaps: overlaps,
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.logCount).toBe(layout.actualLogs);
      expect(layout.overflow).toBe('visible');
      expect(layout.scrollHeight - layout.clientHeight).toBeLessThanOrEqual(1);
      expect(layout.bannerOverlaps).toBe(false);
      expect(layout.peekOverlaps).toBe(false);
    }
  }
});

test('reset cancels queued continuation and table size applies on next deal', async ({ page }) => {
  await page.evaluate(() => window.qa.heroTurn(9));
  await page.locator('#fold-button').click();
  await page.evaluate(() => {
    window.qa.stop();
    document.querySelector('#continue-deal-button').click();
    document.querySelector('#reset-button').click();
    document.querySelector('#confirm-reset').click();
    window.qa.stop();
  });
  await expect(page.locator('#stat-hands')).toHaveText('0');
  await page.waitForTimeout(50); // Give a stale continuation a chance to run.
  expect((await page.evaluate(() => window.noir.getState())).players[0].folded).toBe(false);
  await page.evaluate(() => {
    window.qa.river(6);
    window.qa.finish();
  });
  await page.locator('#player-count').selectOption('5');
  await page.locator('#next-button').click();
  expect(
    (
      await page.evaluate(() => {
        window.qa.stop();
        return window.noir.getState();
      })
    ).playerCount,
  ).toBe(5);
  await page
    .locator('.difficulty-option')
    .filter({ has: page.locator('input[value="hard"]') })
    .click();
  await expect(page.getByLabel('进阶', { exact: true })).toBeChecked();
});
