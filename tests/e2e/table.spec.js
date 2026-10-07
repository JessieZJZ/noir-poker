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

test('raise controls, seats, activity and review share street-specific bet ordinals', async ({
  page,
}) => {
  for (const level of [2, 3, 4]) {
    await page.evaluate((n) => window.qa.bettingTurn(n), level);
    await expect(page.locator('#raise-button')).toContainText(`${level}-bet`);
    if (level >= 3) {
      await expect(page.locator('.seat-3 .seat-action')).toContainText('2-bet');
      await expect(page.locator('#activity-list')).toContainText('River 2-bet 开池至 150');
    }
    if (level >= 4) await expect(page.locator('.seat-4 .seat-action')).toContainText('3-bet');
  }
  for (const street of [1, 2, 3]) {
    await page.evaluate((s) => window.qa.bettingTurn(1, s), street);
    await expect(page.locator('#raise-button')).toContainText('1-bet 下注至');
    await page.evaluate((s) => window.qa.bettingTurn(3, s), street);
    await expect(page.locator('#raise-button')).toContainText('3-bet 加注至');
    await expect(page.locator('.seat-1 .seat-action')).toContainText('1-bet');
    await expect(page.locator('.seat-2 .seat-action')).toContainText('2-bet');
  }
  await page.evaluate(() => window.qa.bettingTurn(3, 0, true));
  await expect(page.locator('#raise-button')).toContainText('3-bet 短全下至');
  const buttonFits = await page
    .locator('#raise-button')
    .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(buttonFits).toBe(true);

  await page.evaluate(() => window.qa.reviewLine());
  await expect(page.locator('#activity-list')).toContainText('Alex 3-bet 加注至 650');
  await expect(page.locator('#activity-list')).toContainText('Mia 4-bet 加注至 1800');
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-priority')).toBeVisible({ timeout: 15000 });
  await page.locator('#review-timeline [data-review-index="0"]').click();
  await expect(page.locator('#review-your-action')).toContainText('2-bet 开池至 150');
  await expect(page.locator('#review-routes')).toContainText('2-bet');
  await page.locator('#review-timeline [data-review-index="2"]').click();
  await expect(page.locator('#review-public-actions')).toContainText('3-bet 加注至 650');
  await expect(page.locator('#review-public-actions')).toContainText('4-bet 加注至 1,800');
});

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

test('per-seat styles apply next hand, survive resize and refresh, and freeze on retry', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#opponents-button').click();
  const assignments = { 1: 'tan', 2: 'st', 3: 'zang', 4: 'peter', 5: 'abao', 8: 'st' };
  for (const [id, style] of Object.entries(assignments))
    await page.locator(`[data-bot-seat="${id}"]`).selectOption(style);
  await page.locator('#emotion-mode').selectOption('lively');
  await page.locator('#save-opponents').click();
  await expect(page.locator('#opponents-summary')).toHaveText('下手更新');
  expect((await page.evaluate(() => window.noir.getState())).players[1].botProfile).toBe(
    'balanced',
  );
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  expect((await page.evaluate(() => window.noir.getState())).players[1].botProfile).toBe(
    'balanced',
  );
  await page.evaluate(() => window.qa.foldRest());
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  for (let id = 1; id < 6; id++)
    await expect(page.locator(`.seat-${id}`)).toHaveAttribute('data-profile', assignments[id]);
  expect((await page.evaluate(() => window.noir.getState())).emotionMode).toBe('lively');
  for (const count of [9, 5, 9]) {
    await page.evaluate(() => window.qa.foldRest());
    await page.locator('#player-count').selectOption(String(count));
    await page.locator('#next-button').click();
    const state = await page.evaluate(() => {
      window.qa.stop();
      return window.noir.getState();
    });
    expect(state.playerCount).toBe(count);
    if (count === 9) expect(state.players[8].botProfile).toBe('st');
  }
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  expect((await page.evaluate(() => window.noir.getState())).players[1].botProfile).toBe('tan');
  await page.locator('#opponents-button').click();
  await expect(page.locator('[data-bot-seat="8"]')).toHaveValue('st');
  await expect(page.locator('#opponents-dialog')).toContainText('不是真人的 VPIP');
});

test('configured bots use the fast-deal path and observed samples roll back on retry', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#opponents-button').click();
  for (let id = 1; id < 6; id++) await page.locator(`[data-bot-seat="${id}"]`).selectOption('abao');
  await page.locator('#save-opponents').click();
  await page.evaluate(() => window.qa.heroTurn(6));
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  await page.locator('#continue-deal-button').click();
  await page.waitForFunction(() => window.noir.getState().phase === 'done');
  const state = await page.evaluate(() => window.noir.getState());
  for (const p of state.players.slice(1)) {
    expect(p.botProfile).toBe('abao');
    expect(p.botStats.hands).toBe(1);
    expect(p.botStats.pfr).toBeLessThanOrEqual(p.botStats.vpip);
    expect(p.botStats.vpip).toBeLessThanOrEqual(p.botStats.hands);
  }
  await page.locator('#restart-hand-button').click();
  const retry = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  for (const p of retry.players.slice(1)) {
    expect(p.botProfile).toBe('abao');
    expect(p.botStats.hands).toBe(0);
  }
});

test('loss state is visible and can be disabled; configuration fits narrow screens', async ({
  page,
}) => {
  await page.evaluate(() =>
    window.qa.scene('As Ah', 'Ac 2h 3d 4c 8s', {
      totals: [5000, 5000, 50, 50, 50, 50],
      folded: [2, 3, 4, 5],
      otherHoles: { 1: 'Ks Kd' },
    }),
  );
  await expect(page.locator('.seat-1')).toHaveAttribute('data-mood', 'frustrated');
  await page.locator('#opponents-button').click();
  await expect(page.locator('[data-opponent-row="1"]')).toContainText('急于追回');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page
      .locator('#opponents-dialog')
      .evaluate((d) => d.scrollWidth - d.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await page.locator('#emotion-mode').selectOption('off');
  await page.locator('#save-opponents').click();
  await page.locator('#next-button').click();
  const state = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  expect(state.emotionMode).toBe('off');
  for (const p of state.players.slice(1)) expect(p.mood).toBe('steady');
});

test('A7 review separates steal, 3bet and 4bet; opponents expose actual decisions after settlement', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.reviewLine());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-priority')).toBeVisible({ timeout: 15000 });
  await page.locator('#review-timeline [data-review-index="0"]').click();
  await expect(page.locator('#review-reason')).toContainText('阻断');
  await expect(page.locator('#review-suggestion')).not.toHaveText('2-bet 开池至 150');
  await expect(page.locator('#review-routes .review-route')).toHaveCount(2);
  await page.locator('#review-timeline [data-review-index="1"]').click();
  await expect(page.locator('#review-decision-title')).toContainText('3-bet');
  await page.locator('#review-timeline [data-review-index="2"]').click();
  await expect(page.locator('#review-decision-title')).toContainText('多次再加注');
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-hero-panel')).toBeHidden();
  await expect(page.locator('#review-opponent-detail .review-cards .playing-card')).toHaveCount(5);
  await expect(page.locator('#review-opponent-detail .review-explanation')).not.toBeEmpty();
  await expect(page.locator('#review-opponent-detail .review-evidence')).toContainText(
    '随机对手范围',
  );
  await expect(page.locator('#review-opponent-detail')).toContainText('本次没有情绪偏移');
  await page.locator('#review-opponent-filter').selectOption('1');
  expect(
    await page.locator('#review-opponents .review-timeline .review-step').count(),
  ).toBeGreaterThan(0);
  await expect(page.locator('#review-opponents .review-timeline')).toContainText('Mia');
  await expect(page.locator('#review-opponents .review-timeline')).not.toContainText('Alex');
  await page.locator('#review-hero-tab').click();
  await expect(page.locator('#review-decision-title')).toContainText('多次再加注');
  const layout = await page.evaluate(() => {
    const d = document.querySelector('#review-dialog');
    return { width: d.clientWidth, scroll: d.scrollWidth };
  });
  expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
});

test('fast finish records opponents while live public state never exposes private policy trace', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.heroTurn());
  const live = await page.evaluate(() => JSON.stringify(window.noir.getState()));
  expect(live).not.toContain('rawEquity');
  expect(live).not.toContain('botDecisions');
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  await page.locator('#continue-deal-button').click();
  await page.waitForFunction(() => window.noir.getState().phase === 'done');
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-opponents .review-step').first()).toBeVisible();
  await expect(page.locator('#review-opponent-detail .review-evidence')).toContainText('实际');
  await expect(
    page.locator('#review-opponent-detail .review-cards').first().locator('.playing-card'),
  ).toHaveCount(2);
});

test('foreign style assignments persist and candidate simulation is available in review', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.foldWin(9));
  await page.locator('#opponents-button').click();
  for (const [seat, profile] of [
    [1, 'viktor'],
    [2, 'jungleman'],
    [3, 'dwan'],
  ])
    await page.locator(`[data-bot-seat="${seat}"]`).selectOption(profile);
  await expect(page.locator('#profile-cards .profile-card')).toHaveCount(9);
  await page.locator('#save-opponents').click();
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  const state = await page.evaluate(() => window.noir.getState());
  expect(state.players[1].botProfile).toBe('viktor');
  expect(state.players[2].botProfile).toBe('jungleman');
  expect(state.players[3].botProfile).toBe('dwan');
  await page.evaluate(() => window.qa.reviewLine());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-priority')).toBeVisible({ timeout: 20000 });
  await page.locator('#review-timeline [data-review-index="0"]').click();
  await expect(page.locator('#review-simulation')).toContainText('模拟 40 手');
  expect(await page.locator('#review-simulation tbody tr').count()).toBeGreaterThanOrEqual(4);
  await page.locator('#review-simulation summary').click();
  await expect(page.locator('#review-simulation')).toContainText('不是 GTO');
});
