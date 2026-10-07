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

async function assertWinnerIndicators(page) {
  const state = await page.evaluate(() => window.noir.getState());
  const awards = new Map();
  for (const pot of state.pots)
    for (const award of pot.awards)
      awards.set(award.name, (awards.get(award.name) || 0) + award.amount);
  await expect(page.locator('.winner-indicator')).toHaveCount(awards.size);
  await expect(page.locator('.winner-icon')).toHaveCount(awards.size);
  for (const p of state.players) {
    const badge = p.id
      ? page.locator(`.seat-${p.id} .winner-indicator`)
      : page.locator('#hero-hand-rank.winner-indicator');
    if (!awards.has(p.name)) {
      await expect(badge).toHaveCount(0);
      continue;
    }
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute(
      'aria-label',
      `${p.name} 获得底池 ${awards.get(p.name).toLocaleString('en-US')} 筹码`,
    );
    await expect(badge.locator('svg')).toBeVisible();
  }
}

test('fold winners keep a visible crown without revealing cards, including practice runout and hero wins', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((n) => window.qa.foldWin(n, 2), count);
      await assertWinnerIndicators(page);
      await expect(page.locator('.seat-2 .winner-indicator')).toHaveText('获胜');
      await expect(page.locator('.seat-2 .playing-card')).toHaveCount(0);
      await page.locator('#continue-deal-button').click();
      await expect(page.locator('#board .playing-card')).toHaveCount(5);
      await assertWinnerIndicators(page);
      for (let i = 0; i < 2; i++) {
        await page.locator('[data-peek-player="2"]').click();
        await assertWinnerIndicators(page);
        await expect(page.locator('.seat-2 .winner-indicator')).toHaveText('获胜');
      }
      const fits = await page.locator('.seat-2 .winner-indicator').evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = document.querySelector('#board').getBoundingClientRect();
        return (
          a.left >= 0 &&
          a.right <= innerWidth &&
          !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
        );
      });
      expect(fits).toBe(true);
      await page.evaluate((n) => window.qa.foldWin(n, 0), count);
      await assertWinnerIndicators(page);
      await expect(page.locator('#hero-hand-rank')).toHaveText('获胜');
    }
  }
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('.winner-icon, .winner-indicator')).toHaveCount(0);
  await page.evaluate(() => window.qa.foldWin());
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('.winner-icon, .winner-indicator')).toHaveCount(0);
});

test('winner crowns follow actual main and side pot awards and survive hidden showdown cards; refunds alone are not wins', async ({
  page,
}) => {
  await page.evaluate(() =>
    window.qa.scene('As Ac', '2s 3h 4c 8d 9s', {
      totals: [100, 200, 300, 300, 0, 0],
      folded: [4, 5],
      otherHoles: { 1: 'Ks Kc', 2: 'Qd Qh', 3: 'Jh Jd' },
    }),
  );
  await assertWinnerIndicators(page);
  await expect(page.locator('.winner-indicator')).toHaveCount(3);
  await page.locator('[data-peek-player="1"]').click();
  await expect(page.locator('.seat-1 .winner-indicator')).toHaveText('获胜');
  await assertWinnerIndicators(page);
  await page.evaluate(() =>
    window.qa.scene('7c 8d', '2h 4s 6d 9c Kh', {
      totals: [1000, 200, 100, 100, 100, 100],
      folded: [2, 3, 4, 5],
      otherHoles: { 1: 'As Ad' },
    }),
  );
  expect((await page.evaluate(() => window.noir.getState())).uncalled[0].name).toBe('你');
  await assertWinnerIndicators(page);
  await expect(page.locator('#hero-hand-rank.winner-indicator')).toHaveCount(0);
});

test('compact settlement leads with the winner and keeps refunds separate from one displayed award', async ({
  page,
}) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.qa.foldPotRefund());
    await expect(page.locator('#result-banner .result-copy > strong')).toHaveText('Alex 获胜');
    await expect(page.locator('#result-banner .result-reason')).toHaveText('其余玩家均已弃牌');
    await expect(page.locator('#result-banner .result-amount > span')).toHaveCount(0);
    await expect(page.locator('#decision-text')).toHaveText('Alex 获胜 · 获得 125 筹码');
    await expect(page.locator('#activity-list')).toContainText('Alex 获胜 · 获得 125 筹码');
    await expect(page.locator('#hand-strength')).toHaveCount(0);
    await expect(page.locator('.seat-2 .winner-indicator')).toHaveAttribute(
      'title',
      '其余玩家均已弃牌 · 获得 125 筹码',
    );
    await expect(page.locator('#result-banner')).not.toHaveAttribute('aria-haspopup');
    await expect(page.locator('#result-banner button, .result-link')).toHaveCount(0);
    expect(await page.locator('#result-banner').evaluate((el) => el.tagName)).toBe('DIV');
    await page.locator('#result-banner').click();
    await expect(page.locator('#pot-dialog')).not.toBeVisible();
    await page.locator('#pot-details-button').click();
    await expect(page.locator('#pot-dialog-title')).toHaveText('本手结算');
    await expect(page.locator('#pot-dialog-note')).toBeHidden();
    await expect(page.locator('.settled-pot')).toHaveCount(1);
    await expect(page.locator('.settled-pot .pot-detail-heading > strong')).toHaveCount(0);
    await expect(page.locator('.pot-award')).toHaveCount(1);
    await expect(page.locator('.pot-award')).toContainText('Alex 获胜');
    await expect(page.locator('.pot-award')).toContainText('其余玩家均已弃牌');
    await expect(page.locator('.pot-award > strong')).toHaveText('+125筹码');
    await expect(page.locator('.compact-refund')).toContainText('未跟注退还 Alex');
    await expect(page.locator('.compact-refund > strong')).toHaveText('75');
    await expect(page.locator('.pot-eligibility, .pot-player-list')).toHaveCount(0);
    await expect(page.locator('.pot-distribution')).not.toHaveAttribute('open');
    await expect(page.locator('.pot-distribution-body')).toBeHidden();
    const compact = await page
      .locator('#pot-dialog')
      .evaluate(
        (el) => el.scrollHeight <= el.clientHeight + 1 && el.getBoundingClientRect().height < 600,
      );
    expect(compact).toBe(true);
    await page.locator('.pot-distribution > summary').click();
    await expect(page.locator('.pot-distribution-body')).toContainText(
      '你不参与此池 · 结算资格：Alex',
    );
    await expect(page.locator('.pot-contribution-list li')).toHaveCount(3);
    await page.evaluate(() => window.qa.finish());
    await expect(page.locator('.pot-distribution')).toHaveAttribute('open');
    await page.locator('#pot-dialog .primary-button').click();
  }
});

test('pot details retain per-pot awards, odd split shares and conditional live eligibility', async ({
  page,
}) => {
  await page.evaluate(() =>
    window.qa.scene('As Ac', '2s 3h 4c 8d 9s', {
      totals: [100, 200, 300, 300, 0, 0],
      folded: [4, 5],
      otherHoles: { 1: 'Ks Kc', 2: 'Qd Qh', 3: 'Jh Jd' },
    }),
  );
  await page.locator('#pot-details-button').click();
  const state = await page.evaluate(() => window.noir.getState());
  await expect(page.locator('#result-banner .result-amount > span')).toHaveText('3 个底池');
  await expect(page.locator('.settled-pot h3')).toHaveText(['主池', '边池 1', '边池 2']);
  for (let i = 0; i < state.pots.length; i++) {
    const card = page.locator(`.settled-pot[data-pot-index="${i}"]`);
    await expect(card.locator('.pot-award > strong')).toHaveText(
      state.pots[i].awards.map((a) => `+${a.amount.toLocaleString('en-US')}筹码`),
    );
    await expect(card.locator('.pot-distribution')).not.toHaveAttribute('open');
  }
  await page.locator('#pot-dialog .primary-button').click();
  await page.evaluate(() =>
    window.qa.scene('2c 3d', 'As Ks Qs Js Ts', {
      count: 5,
      totals: [100, 100, 1, 1, 1],
      folded: [2, 3, 4],
    }),
  );
  await page.locator('#pot-details-button').click();
  await expect(page.locator('.pot-split-total')).toHaveText('203 筹码 · 平分');
  expect(await page.locator('.pot-award > strong').allTextContents()).toEqual(
    expect.arrayContaining(['+101筹码', '+102筹码']),
  );
  await page.locator('.pot-distribution > summary').click();
  await expect(page.locator('.pot-rounding-note')).toBeVisible();
  await page.locator('#pot-dialog .primary-button').click();
  await page.evaluate(() => window.qa.heroTurn());
  await page.locator('[data-preset="all"]').click();
  await page.locator('#raise-button').click();
  await page.evaluate(() => window.qa.stop());
  await page.locator('#pot-details-button').click();
  await expect(page.locator('#pot-dialog-title')).toHaveText('主池与边池');
  await expect(page.locator('#pot-dialog-note')).toBeVisible();
  await expect(page.locator('.pot-eligibility.hero-eligible')).toBeVisible();
  await expect(page.locator('.pot-award, .compact-refund')).toHaveCount(0);
  await expect(page.locator('.pot-refund')).toContainText('待跟注或退还');
});

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
  await page.evaluate(() =>
    window.qa.scene('Ah 2d', 'As Kd 2c 7h 9s', {
      folded: [0, 2, 3, 4, 5],
      otherHoles: { 1: 'Ac Qd' },
    }),
  );
  await expect(page.locator('#result-banner .result-copy > strong')).toHaveText('Mia 获胜');
  await expect(page.locator('#result-banner .result-amount > span')).toHaveText('一对');
  await expect(page.locator('#result-banner .result-amount')).not.toContainText('筹码');
  await expect(page.locator('#hero-hand-rank')).toHaveText('已弃牌 · 两对');
  await expect(page.locator('#hand-strength')).toHaveCount(0);
});

test('settled seats retain all-in sizes, board and hero action across viewing and all screen sizes', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((n) => window.qa.heroTurn(n), count);
      await page.locator('[data-preset="all"]').click();
      await page.locator('#raise-button').click();
      const retained = await page.evaluate(() => {
        window.qa.stop();
        window.qa.allinRest();
        return window.noir.getState().players.map((p) => p.lastAction);
      });
      await page.evaluate(() => {
        while (window.noir.getState().phase !== 'done') window.qa.finish();
      });
      const done = await page.evaluate(() => window.noir.getState());
      expect(done.board).toHaveLength(5);
      expect(done.players.map((p) => p.lastAction)).toEqual(retained);
      await expect(page.locator('#hero-last-action')).toBeVisible();
      await expect(page.locator('#hero-last-action')).toContainText('2-bet 全下');
      await expect(page.locator('#hero-last-action .seat-action-amount')).toHaveText('5,000');
      await expect(page.locator('.seat .seat-action')).toHaveCount(count - 1);
      for (let id = 1; id < count; id++) {
        await expect(page.locator(`.seat-${id} .seat-action-label`)).toHaveText('全下');
        await expect(page.locator(`.seat-${id} .seat-action-amount`)).toHaveText('5,000');
      }
      const geometry = await page.evaluate(() => {
        const board = document.querySelector('#board').getBoundingClientRect();
        const banner = document.querySelector('#result-banner').getBoundingClientRect();
        const overlaps = (a, b) =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return {
          overflowing: document.documentElement.scrollWidth > innerWidth,
          boardOverlaps: [
            ...document.querySelectorAll('.seat .seat-action, .seat .hand-rank'),
          ].some((el) => overlaps(el.getBoundingClientRect(), board)),
          cardOverlaps: [
            ...document.querySelectorAll('.seat .playing-card, #hero-cards .playing-card'),
          ].some((el) => overlaps(el.getBoundingClientRect(), board)),
          bannerOverlaps: overlaps(
            document.querySelector('#hero-last-action').getBoundingClientRect(),
            banner,
          ),
        };
      });
      expect(geometry).toEqual({
        overflowing: false,
        boardOverlaps: false,
        cardOverlaps: false,
        bannerOverlaps: false,
      });
      await page.locator('.seat-peek').first().click();
      expect(
        (await page.evaluate(() => window.noir.getState())).players.map((p) => p.lastAction),
      ).toEqual(retained);
      expect((await page.evaluate(() => window.noir.getState())).board).toEqual(done.board);
    }
  }
  await page.locator('#restart-hand-button').click();
  const retry = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  expect(retry.players[0].lastAction).toBeNull();
  await expect(page.locator('#hero-last-action')).toBeHidden();
  expect(retry.players.filter((p) => p.lastAction)).toHaveLength(2);
});

test('settled raises, calls and folds retain their actual amounts until the next hand', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qa.retainedRiver(9);
    window.qa.finish();
  });
  const done = await page.evaluate(() => window.noir.getState());
  expect(
    done.players.some((p) => p.lastAction.text === '跟注 200' && p.lastAction.bet === 300),
  ).toBe(true);
  expect(done.players.some((p) => p.lastAction.text === '2-bet 加注至 300')).toBe(true);
  expect(done.players.some((p) => p.lastAction.text === '弃牌')).toBe(true);
  for (const p of done.players) {
    const row = p.id
      ? page.locator(`.seat-${p.id} .seat-action`)
      : page.locator('#hero-last-action');
    await expect(row).toBeVisible();
    if (p.lastAction.text.startsWith('跟注')) {
      await expect(row.locator('.seat-action-label')).toHaveText('跟注');
      await expect(row.locator('.seat-action-amount')).toHaveText(
        String(Number(p.lastAction.text.split(' ')[1])),
      );
      await expect(row.locator('.seat-action-amount')).toHaveAttribute('title', /本轮累计投入 300/);
    } else if (p.lastAction.text === '弃牌') await expect(row).toHaveText('弃牌');
    else {
      await expect(row.locator('.seat-action-label')).toHaveText('2-bet');
      await expect(row.locator('.seat-action-amount')).toHaveText('300');
    }
  }
  await page.locator('#next-button').click();
  const next = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  expect(next.board).toEqual([]);
  expect(next.players.filter((p) => p.lastAction)).toHaveLength(2);
  expect(
    next.players.filter((p) => p.lastAction).every((p) => /^(小盲|大盲) /.test(p.lastAction.text)),
  ).toBe(true);
  await expect(page.locator('#hero-last-action')).toBeHidden();
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
  const potLogs = (await page.locator('#activity-list .log-result').allTextContents())
    .map((text) => /^(主池|边池 \d+) /.exec(text)?.[1])
    .filter(Boolean);
  expect(potLogs).toEqual(done.pots.map((pot) => pot.label));
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

test('fast finish fills all five visible board cards after preflop, flop or turn fold-wins without changing awards', async ({
  page,
}) => {
  for (const street of [0, 1, 2]) {
    const before = await page.evaluate((s) => window.qa.foldFinished(s), street);
    expect(before.phase).toBe('done');
    expect(before.board).toHaveLength([0, 3, 4][street]);
    expect(before.canContinue).toBe(true);
    await expect(page.locator('#continue-deal-button')).toBeVisible();
    await page.locator('#continue-deal-button').evaluate((button) => {
      button.click();
      button.click();
    });
    const after = await page.evaluate(() => window.qa.state());
    expect(after.phase).toBe('done');
    expect(after.board).toHaveLength(5);
    expect(after.board.slice(0, before.board.length)).toEqual(before.board);
    expect(after.settlementBoard).toEqual(before.board);
    expect(after.practiceRunout).toBe(true);
    expect(after.canContinue).toBe(false);
    expect(after.players.map((p) => p.stack)).toEqual(before.players.map((p) => p.stack));
    expect(after.players.map((p) => p.botStats)).toEqual(before.players.map((p) => p.botStats));
    expect(after.pots).toEqual(before.pots);
    expect(after.uncalled).toEqual(before.uncalled);
    expect(after.result).toEqual(before.result);
    expect(after.wealth).toBe(30000);
    await expect(page.locator('#board .playing-card')).toHaveCount(5);
    await expect(page.locator('#board .board-slot')).toHaveCount(0);
    await expect(page.locator('#board-caption')).toContainText('练习补牌');
    await expect(page.locator('#result-banner')).toBeVisible();
    await expect(page.locator('#result-banner')).toContainText('其余玩家均已弃牌');
    await expect(page.locator('#showdown-stage')).toBeHidden();
    await expect(page.locator('#stat-hands')).toHaveText('1');
    await expect(page.locator('#continue-deal-button')).toBeHidden();
    await page.locator('#restart-hand-button').click();
    const retry = await page.evaluate(() => {
      window.qa.stop();
      return window.noir.getState();
    });
    expect(retry.board).toHaveLength(0);
    expect(retry.practiceRunout).toBe(false);
    expect(retry.hole).toEqual(before.hole);
    await expect(page.locator('#stat-hands')).toHaveText('0');
    await expect(page.locator('#board .playing-card')).toHaveCount(0);
  }
});

test('review completes through real worker with facts and a conditional follow-up plan', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.heroTurn());
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  await page.locator('#continue-deal-button').click();
  await page.waitForFunction(() => window.noir.getState().phase === 'done');
  await expect(page.locator('#board .playing-card')).toHaveCount(5);
  await expect(page.locator('#result-banner')).toBeVisible();
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toBeVisible();
  await expect(page.locator('#review-priority')).toBeVisible({ timeout: 15000 });
  expect(await page.locator('#review-evidence li').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#review-plan')).not.toHaveText('分析完成后展示后续处理路线。');
  await expect(page.locator('#review-model-note')).toContainText('范围');
  await expect(page.locator('#review-reason')).not.toBeEmpty();
});

test('activity follows chronological column order at every breakpoint and naturally expands', async ({
  page,
}) => {
  for (const width of [320, 360, 390, 600, 768, 900, 901, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [6, 9]) {
      await page.evaluate((n) => {
        window.qa.river(n);
        window.qa.finish();
      }, count);
      const layout = await page.evaluate(() => {
        const list = document.querySelector('#activity-list');
        const items = [...list.children];
        const texts = items.map((el) => el.textContent);
        const rects = items.map((el, index) => {
          const rect = el.getBoundingClientRect();
          return { index, top: rect.top, left: rect.left };
        });
        const readingOrder = rects
          .sort((a, b) => (Math.abs(a.left - b.left) > 1 ? a.left - b.left : a.top - b.top))
          .map((rect) => rect.index);
        const milestones = [
          texts.findIndex((text) => /^第 \d+ 手开始/.test(text)),
          texts.findIndex((text) => text.includes('小盲') && text.includes('大盲')),
          texts.findIndex((text) => text.startsWith('翻牌 ·')),
          texts.findIndex((text) => text.startsWith('转牌 ·')),
          texts.findIndex((text) => text.startsWith('河牌 ·')),
          texts.indexOf(window.noir.getState().result),
        ];
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
          numbers: items.map((item) => item.value),
          actualLogs: window.qa.state().totalLogs,
          texts,
          milestones,
          readingOrder,
          scrollHeight: list.scrollHeight,
          clientHeight: list.clientHeight,
          overflow: getComputedStyle(list).overflowY,
          bannerOverlaps: banner.bottom > board.top && banner.top < board.bottom,
          peekOverlaps: overlaps,
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.logCount).toBe(layout.actualLogs);
      expect(layout.numbers).toEqual(Array.from({ length: layout.logCount }, (_, i) => i + 1));
      expect(layout.milestones[0]).toBe(0);
      for (let i = 1; i < layout.milestones.length; i++)
        expect(layout.milestones[i]).toBeGreaterThan(layout.milestones[i - 1]);
      expect(layout.readingOrder).toEqual(Array.from({ length: layout.logCount }, (_, i) => i));
      expect(layout.overflow).toBe('visible');
      expect(layout.scrollHeight - layout.clientHeight).toBeLessThanOrEqual(1);
      expect(layout.bannerOverlaps).toBe(false);
      expect(layout.peekOverlaps).toBe(false);
      await page.locator('.seat-peek').first().click();
      await expect(page.locator('#activity-list li')).toHaveText(layout.texts);
    }
  }
});

test('activity shows actual assigned personas across actions and results without changing pending hand identities', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.stop());
  await page.locator('#opponents-button').click();
  for (const [id, profile] of Object.entries({
    1: 'viktor',
    2: 'st',
    3: 'jungleman',
    4: 'dwan',
  }))
    await page.locator(`[data-bot-seat="${id}"]`).selectOption(profile);
  await page.locator('#save-opponents').click();

  for (const count of [6, 9]) {
    await page.evaluate((n) => {
      window.qa.river(n);
      window.qa.finish();
    }, count);
    const list = page.locator('#activity-list');
    await expect(list.locator('.log-blind')).toHaveText(
      'Mia（Viktor Blom） 小盲 25 · Alex（ST 王） 大盲 50',
    );
    for (const label of [
      'Mia（Viktor Blom）',
      'Alex（ST 王）',
      'River（Daniel Cates）',
      'Kai（Tom Dwan）',
    ])
      await expect(list).toContainText(label);
    await expect(list).not.toContainText('Luna（');
    await expect(list).not.toContainText('你（');
    expect(
      await list.locator('li').evaluateAll((items) => items.map((item) => item.value)),
    ).toEqual(Array.from({ length: await list.locator('li').count() }, (_, i) => i + 1));
    const layout = await list.evaluate((el) => {
      const rects = [...el.children].map((item, index) => {
        const rect = item.getBoundingClientRect();
        return { index, left: rect.left, top: rect.top, fragments: item.getClientRects().length };
      });
      return {
        readingOrder: rects
          .sort((a, b) => (Math.abs(a.left - b.left) > 1 ? a.left - b.left : a.top - b.top))
          .map((item) => item.index),
        fragments: rects.map((item) => item.fragments),
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.readingOrder).toEqual(
      Array.from({ length: layout.fragments.length }, (_, i) => i),
    );
    expect(layout.fragments.every((count) => count === 1)).toBe(true);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  }

  await page.evaluate(() => window.qa.foldPotRefund());
  await expect(page.locator('#activity-list .log-result').last()).toContainText(
    'Alex（ST 王） 获胜',
  );
  await expect(page.locator('#activity-list')).toContainText('Alex（ST 王） 未被跟注的 75');
  await expect(page.locator('#result-banner')).toContainText('Alex 获胜');
  await page.locator('#opponents-button').click();
  await page.locator('[data-bot-seat="2"]').selectOption('abao');
  await page.locator('#save-opponents').click();
  await page.locator('.seat-2 .seat-peek').click();
  await expect(page.locator('#activity-list')).toContainText('Alex（ST 王） 获胜');
  await expect(page.locator('#activity-list')).not.toContainText('Alex（阿宝）');

  await page.locator('#next-button').click();
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.foldRest();
  });
  await expect(page.locator('#activity-list')).toContainText('Alex（阿宝）');
  await expect(page.locator('#activity-list')).not.toContainText('Alex（ST 王）');
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

test('first visit presents balanced opponents and safe defaults', async ({ page }) => {
  await expect(page.locator('#player-count')).toHaveValue('6');
  await expect(page.getByLabel('标准', { exact: true })).toBeChecked();
  await expect(page.locator('#opponents-summary')).toHaveText('均衡');
  await expect(page.locator('.seat-style-label')).toHaveText(Array(5).fill('均衡'));
  await expect(page.locator('#hint-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#opponents-button').click();
  await expect(page.locator('[data-profile-preview="balanced"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-bot-seat]')).toHaveCount(8);
  for (let id = 1; id <= 8; id++)
    await expect(page.locator(`[data-bot-seat="${id}"]`)).toHaveValue('balanced');
  await expect(page.locator('#emotion-mode')).toHaveValue('subtle');
  await page.locator('#opponents-dialog .close-dialog').click();

  await page.evaluate(() => localStorage.setItem('noir-table-v1', '{broken'));
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await expect(page.locator('#player-count')).toHaveValue('6');
  await expect(page.getByLabel('标准', { exact: true })).toBeChecked();
  expect((await page.evaluate(() => window.noir.getState())).playerCount).toBe(6);
});

test('returning restores all saved options before the first fresh hand, including pending choices', async ({
  page,
}) => {
  await page.locator('#player-count').selectOption('9');
  await page
    .locator('.difficulty-option')
    .filter({ has: page.locator('input[value="hard"]') })
    .click();
  await page.locator('#hint-toggle').click();
  await page.locator('#sound-button').click();
  await page.locator('#opponents-button').click();
  await page.locator('#mix-opponents').click();
  await page.locator('#emotion-mode').selectOption('lively');
  await page.locator('#save-opponents').click();
  const previous = await page.evaluate(() => window.noir.getState());
  expect(previous.playerCount).toBe(6);
  expect(previous.players[1].botProfile).toBe('balanced');
  await expect(page.locator('#opponents-summary')).toHaveText('下手生效');

  await page.goto('about:blank');
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await expect(page.locator('#player-count')).toHaveValue('9');
  await expect(page.getByLabel('进阶', { exact: true })).toBeChecked();
  await expect(page.locator('#hint-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#opponents-summary')).toHaveText('8 位风格对手');
  await expect(page.locator('#opponents-change-note')).toBeHidden();
  await expect(page.locator('#table-change-note')).toBeHidden();
  await expect(page.locator('#stat-hands')).toHaveText('0');
  const state = await page.evaluate(() => window.noir.getState());
  expect(state.playerCount).toBe(9);
  expect(state.emotionMode).toBe('lively');
  expect(state.players.slice(1).map((p) => p.botProfile)).toEqual([
    'tan',
    'st',
    'zang',
    'peter',
    'abao',
    'viktor',
    'jungleman',
    'dwan',
  ]);
  expect(state.hand).toBe(1);
  expect(state.board).toEqual([]);
  expect(state.result).toBeNull();
  for (const player of state.players) expect(player.stack + player.bet).toBe(5000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('noir-table-v1')))).toEqual({
    playerCount: 9,
    difficulty: 'hard',
  });
  await page.locator('#opponents-button').click();
  await expect(page.locator('#emotion-mode')).toHaveValue('lively');
  await expect(page.locator('[data-bot-seat="8"]')).toHaveValue('dwan');
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
  await expect(page.locator('#opponents-summary')).toHaveText('下手生效');
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
  await expect(page.locator('#player-count')).toHaveValue('9');
  expect((await page.evaluate(() => window.noir.getState())).playerCount).toBe(9);
  expect((await page.evaluate(() => window.noir.getState())).players[1].botProfile).toBe('tan');
  await page.locator('#opponents-button').click();
  await expect(page.locator('[data-bot-seat="8"]')).toHaveValue('st');
  await expect(page.locator('#opponents-dialog')).toContainText('不是真人的 VPIP');
});

test('nine-seat style assignment shows every persona at all sizes and executes the selected policies', async ({
  page,
}) => {
  const assignments = {
    1: 'tan',
    2: 'st',
    3: 'zang',
    4: 'peter',
    5: 'abao',
    6: 'viktor',
    7: 'jungleman',
    8: 'dwan',
  };
  const labels = [
    '谈老板',
    'ST 王',
    '臧书奴',
    'Peter',
    '阿宝',
    'Viktor Blom',
    'Daniel Cates',
    'Tom Dwan',
  ];
  await page.evaluate(() => window.qa.foldWin(9));
  await page.locator('#opponents-button').click();
  await page.locator('#mix-opponents').click();
  await page.locator('#emotion-mode').selectOption('off');
  await expect(page.locator('[data-opponent-row="8"] .opponent-current-style')).toHaveText(
    '本手实际风格：均衡',
  );
  await page.locator('#save-opponents').click();
  await expect(page.locator('#opponents-change-note')).toBeVisible();
  await expect(page.locator('.seat-8 .seat-style-label')).toHaveText('均衡');
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('#opponents-change-note')).toBeHidden();
  for (const width of [320, 390, 768, 1115, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (let id = 1; id <= 8; id++) {
      const label = page.locator(`.seat-${id} .seat-style-label`);
      await expect(label).toBeVisible();
      await expect(label).toHaveText(labels[id - 1]);
      await expect(label).toHaveAttribute('data-style-profile', assignments[id]);
      const fits = await label.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1;
      });
      expect(fits).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const traces = await page.evaluate(() => window.qa.finishWithProfiles());
  const catalog = await page.evaluate(
    async () => (await import('/src/engine/bot-profiles.js')).BOT_PROFILES,
  );
  for (let id = 1; id <= 8; id++) {
    const actions = traces.filter((r) => r.id === id);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.profile).toBe(assignments[id]);
      const axes = catalog.find((p) => p.id === assignments[id]).axes;
      expect(action.baseAxes).toEqual(axes);
      expect(action.axes).toEqual(axes);
    }
  }
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  for (let id = 1; id <= 8; id++)
    await expect(page.locator(`.seat-${id} .seat-style-label`)).toHaveText(labels[id - 1]);
  for (const count of [8, 9]) {
    await page.evaluate((n) => {
      window.qa.heroTurn(n);
      while (window.noir.getState().phase !== 'done') {
        window.qa.allinRest();
        window.qa.finish();
      }
    }, count);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const crowded = await page.evaluate(() => {
        const overlap = (a, b) =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return [...document.querySelectorAll('.seat')].some((seat) =>
          [...seat.querySelectorAll('.seat-action, .hand-rank')].some((label) =>
            [...document.querySelectorAll('.seat .playing-card')].some(
              (card) =>
                !seat.contains(card) &&
                overlap(label.getBoundingClientRect(), card.getBoundingClientRect()),
            ),
          ),
        );
      });
      expect(crowded).toBe(false);
    }
  }
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

test('review timelines hint at horizontal scrolling and keep late selections in place', async ({
  page,
}) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.qa.reviewLine());
    await page.locator('#review-hand-button').click();
    await expect(page.locator('#review-priority')).toBeVisible({ timeout: 15000 });
    if (width < 700) {
      const heroTimeline = page.locator('#review-timeline');
      const heroIndex = (await heroTimeline.locator('.review-step').count()) - 1;
      await heroTimeline.evaluate((timeline) => {
        const item = timeline.lastElementChild.getBoundingClientRect();
        timeline.scrollLeft += item.left - timeline.getBoundingClientRect().left - 2;
      });
      const before = await heroTimeline.evaluate((el) => el.scrollLeft);
      expect(before).toBeGreaterThan(0);
      await heroTimeline.locator(`[data-review-index="${heroIndex}"]`).click();
      await expect(heroTimeline.locator('[aria-current="step"]')).toHaveAttribute(
        'data-review-index',
        String(heroIndex),
      );
      expect(Math.abs((await heroTimeline.evaluate((el) => el.scrollLeft)) - before)).toBeLessThan(
        1.1,
      );
    }
    await page.locator('#review-opponents-tab').click();
    const timeline = page.locator('#review-opponents .review-timeline');
    if (width < 700) {
      const preview = await timeline.evaluate((el) => {
        const second = el.children[1].getBoundingClientRect();
        return (el.getBoundingClientRect().right - second.left - 2) / second.width;
      });
      expect(preview).toBeGreaterThan(0.45);
      expect(preview).toBeLessThan(0.55);
    }
    await timeline.evaluate((el, mobile) => {
      const item = el.children[5].getBoundingClientRect(),
        bounds = el.getBoundingClientRect();
      if (mobile) el.scrollLeft += item.left - bounds.left - 2;
      else el.scrollTop += item.top - bounds.top - 2;
    }, width < 700);
    const before = await timeline.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    if (width < 700) expect(before.left).toBeGreaterThan(0);
    const lateCard = timeline.locator('[data-opponent-index="5"]');
    const heading = await lateCard.locator('small').innerText();
    await lateCard.click();
    await expect(lateCard).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('#review-opponent-detail .review-detail-header h3')).toHaveText(
      heading,
    );
    await expect(lateCard).toBeFocused();
    await page.keyboard.press('Enter');
    const after = await timeline.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    expect(Math.abs(after.left - before.left)).toBeLessThan(1.1);
    expect(Math.abs(after.top - before.top)).toBeLessThan(1.1);
    await page.locator('[data-opponent-nav="-1"]').evaluate((button) => button.click());
    await expect(timeline.locator('[aria-current="step"]')).toHaveAttribute(
      'data-opponent-index',
      '4',
    );
    if (width < 700) expect(await timeline.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await page.locator('#review-opponent-filter').selectOption('1');
    await expect(timeline.locator('.review-step').first()).toHaveAttribute('aria-current', 'step');
    await expect(timeline).toContainText('Mia');
    expect(await timeline.evaluate((el) => el.scrollLeft + el.scrollTop)).toBe(0);
    await page.locator('#review-opponent-filter').selectOption('all');
    expect(await timeline.evaluate((el) => el.scrollLeft + el.scrollTop)).toBe(0);
    await page.locator('#review-dialog .icon-button.close-dialog').click();
  }
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
  for (const [profile, name] of [
    ['viktor', 'Viktor Blom'],
    ['jungleman', 'Daniel Cates'],
    ['dwan', 'Tom Dwan'],
  ]) {
    const choice = page.locator(`[data-profile-preview="${profile}"]`);
    await expect(choice.locator('strong')).toHaveText(name);
    await choice.click();
    await expect(page.locator('.profile-detail-heading h3')).toHaveText(name);
  }
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
