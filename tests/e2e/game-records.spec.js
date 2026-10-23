import { test, expect } from '@playwright/test';
import { BOT_THINK_LIMITS } from '../../src/engine/bot-timing.js';
import {
  readRecordTableGeometry,
  recordGeometryDifferences,
} from '../fixtures/records-geometry.js';

const records = (page) => page.evaluate(() => window.noir.getRecords());
// The saved index with each hand's snapshot attached, for tests to edit and
// store back through `qa.writeRecords`.
const editableRecords = () => {
  const saved = JSON.parse(localStorage.getItem('noir-game-records-v1')),
    full = new Map(
      window.noir
        .getRecords()
        .flatMap((session) => session.attempts)
        .map((attempt) => [attempt.id, attempt.snapshot]),
    );
  for (const attempt of saved.sessions.flatMap((session) => session.attempts))
    attempt.snapshot = full.get(attempt.id) ?? null;
  return saved;
};
const state = (page) => page.evaluate(() => window.noir.getState());
const openRecords = async (page) => {
  await page.locator('#rules-button').click();
  await expect(page.locator('#guide-menu')).toBeVisible();
  await page.locator('#records-menu-item').click();
  await expect(page).toHaveURL(/#records$/);
};
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.recordsStart());
});

test('large archives open every game expanded, fold on demand and keep snapshots on demand', async ({
  page,
}) => {
  await page.evaluate((editable) => {
    window.qa.recordsFinish();
    const saved = new Function(`return (${editable})()`)();
    const source = saved.sessions.find((session) => session.id === saved.currentId);
    const attempt = source.attempts.find((attempt) => attempt.status === 'completed');
    saved.sessions = Array.from({ length: 8 }, (_, i) => ({
      ...source,
      id: `perf-session-${i}`,
      number: i + 1,
      endedAt: i === 7 ? null : source.startedAt + 1,
      attempts: Array.from({ length: 12 }, (_, j) => ({
        ...attempt,
        id: `perf-hand-${i}-${j}`,
        hand: j + 1,
        snapshot: {
          ...attempt.snapshot,
          hand: j + 1,
          decisions: attempt.snapshot.decisions.map((decision) => ({ ...decision, hand: j + 1 })),
          botDecisions: attempt.snapshot.botDecisions.map((decision) => ({
            ...decision,
            hand: j + 1,
          })),
        },
      })),
    }));
    saved.currentId = 'perf-session-7';
    saved.nextNumber = 9;
    saved.checkpoint.hand = 12;
    return window.qa.writeRecords(saved);
  }, String(editableRecords));
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  await openRecords(page);
  await expect(page.locator('.record-session')).toHaveCount(8);
  const current = page.locator('[data-session-id="perf-session-7"]');
  await expect(current.locator('.record-hand')).toHaveCount(13);
  await expect(current.locator('.record-hand').first()).toHaveAttribute('data-hand', '13');
  // Finished games are expanded by default too; a heading folds and reopens.
  const previous = page.locator('[data-session-id="perf-session-6"]');
  await expect(page.locator('.record-session-heading[aria-expanded="true"]')).toHaveCount(8);
  await expect(previous.locator('.record-hand')).toHaveCount(12);
  await previous.locator('.record-session-heading').click();
  await expect(previous.locator('.record-session-heading')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(previous.locator('.record-session-hands')).toBeHidden();
  await previous.locator('.record-session-heading').click();
  await expect(previous.locator('.record-hand')).toHaveCount(12);
  await expect(previous.locator('.record-hand').first()).toBeVisible();
  await expect(previous.locator('.record-hand').first()).toHaveAttribute('data-hand', '12');
  await previous.locator('.record-hand').first().click();
  await expect(page.locator('#history-table')).toBeVisible();
  await expect(page.locator('#history-review-button')).toBeVisible();
  expect((await state(page)).hand).toBe(13);
});

test('viewing a historical hand flips only the clicked cards and respects reduced motion', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish(1));
  const saved = await records(page);
  const live = await state(page);
  const snapshot = await page.evaluate(() => window.qa.snapshot());
  await openRecords(page);
  await page.locator(`[data-record-hand="${saved[0].attempts[0].id}"]`).click();
  const table = page.locator('#history-arena');
  await expect(table.locator('.card-deal')).toHaveCount(0);
  const peek = () => table.locator('[data-history-peek="1"]');
  await peek().click();
  const cards = () => table.locator('.seat-1 .mini-cards .playing-card');
  await expect(cards()).toHaveCount(2);
  await expect(cards().first()).toHaveClass(/card-deal/);
  await expect(cards().first()).toHaveCSS('animation-name', 'flip-card');
  await expect(table.locator('.card-deal')).toHaveCount(2);
  await expect(peek()).toBeFocused();
  await peek().click();
  await expect(cards()).toHaveCount(0);
  await peek().click();
  await expect(cards().first()).toHaveCSS('animation-name', 'flip-card');
  await expect(table.locator('.card-deal')).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(cards().first()).toHaveCSS('animation-name', 'none');
  expect(await records(page)).toEqual(saved);
  const after = await state(page);
  expect(after.phase).toBe(live.phase);
  expect(await page.evaluate(() => window.qa.snapshot())).toEqual(snapshot);
});

test('archived tables never inherit the live hero-turn decoration', async ({ page }) => {
  await page.evaluate(() => window.qa.recordsFinish());
  const saved = (await records(page))[0];
  const archived = saved.attempts[0];
  await page.evaluate(() => window.qa.recordsStart());
  await expect(page.locator('main.main .hero-cards-wrap')).toHaveClass(/turn-attention/);
  await openRecords(page);
  // The earlier game is already expanded.
  await page.locator(`[data-record-hand="${archived.id}"]`).click();
  const history = page.locator('#history-table');
  await expect(history.locator('.turn-attention')).toHaveCount(0);
  await expect(history.locator('[data-turn-phase]')).toHaveCount(0);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: false } }));
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: true } }));
  });
  await expect(history.locator('.turn-attention')).toHaveCount(0);
  await expect(page.locator('main.main .hero-cards-wrap')).toHaveClass(/turn-attention/);
  expect((await records(page)).find((row) => row.id === saved.id).attempts[0].snapshot).toEqual(
    archived.snapshot,
  );
});

test('the rotating entry always opens both choices and keyboard focus keeps its label stable', async ({
  page,
}) => {
  await expect(page.locator('body')).toHaveJSProperty('inert', false);
  await page.clock.install();
  const trigger = page.locator('#rules-button');
  await trigger.focus();
  await expect(trigger).toBeFocused();
  const label = await trigger.getAttribute('data-label');
  await page.clock.fastForward(12000);
  expect(await trigger.getAttribute('data-label')).toBe(label);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#guide-menu')).toBeVisible();
  await expect(page.locator('#guide-menu-item')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#records-menu-item')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('#guide-menu-item').click();
  await expect(page.locator('#rules-dialog')).toBeVisible();
});

test('stored historical labels remain text and cannot execute markup', async ({ page }) => {
  await page.evaluate(() => window.qa.recordsFinish());
  const record = (await records(page))[0].attempts[0];
  const source = '<img src=x onerror="window.historyMarkupExecuted=true">';
  await page.evaluate(
    ({ source, id, editable }) => {
      const saved = new Function(`return (${editable})()`)();
      const attempt = saved.sessions
        .flatMap((session) => session.attempts)
        .find((a) => a.id === id);
      attempt.snapshot.pots[0].label = source;
      attempt.snapshot.pots[0].awards[0].label = source;
      attempt.snapshot.players[1].name = source;
      attempt.snapshot.players[1].action = source;
      attempt.snapshot.players[1].lastAction.text = source;
      attempt.snapshot.winners[0].label = 'award " data-archive-injected="true';
      return window.qa.writeRecords(saved);
    },
    { source, id: record.id, editable: String(editableRecords) },
  );
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await openRecords(page);
  await page.locator(`[data-record-hand="${record.id}"]`).click();
  await page.locator('#history-pot-details-button').click();
  await expect(page.locator('#pot-dialog')).toBeVisible();
  await expect(page.locator('#pot-dialog')).toContainText(source);
  expect(await page.evaluate(() => window.historyMarkupExecuted)).toBeUndefined();
  await expect(page.locator('#pot-dialog img')).toHaveCount(0);
  await page.locator('#pot-dialog .close-dialog').first().click();
  await expect(page.locator('#history-arena .seat-name-label').first()).toHaveText(source);
  await expect(page.locator('#history-arena .seat-action').first()).toHaveText(source);
  await expect(page.locator('#history-arena img:not(.persona-portrait)')).toHaveCount(0);
  await expect(page.locator('#history-arena [data-archive-injected]')).toHaveCount(0);
});

test('records show sessions, hands and retries newest first without changing saved order', async ({
  page,
}) => {
  const initial = await state(page);
  await page.evaluate(() => window.qa.recordsFinish());
  await page.evaluate(() => window.qa.recordsRetry());
  await page.evaluate(() => window.qa.recordsFinish(1));
  await page.evaluate(() => window.qa.recordsNext());
  await page.evaluate(() => window.qa.recordsFinish());
  const current = (await records(page))[0];
  expect(current.attempts.map((a) => [a.hand, a.attempt])).toEqual([
    [1, 0],
    [1, 1],
    [2, 0],
  ]);
  expect(current.attempts[0].superseded).toBe(true);
  expect(current.profit).toBe(current.attempts[1].profit + current.attempts[2].profit);
  await expect(page.locator('#session-number-label')).toHaveText(`第 ${initial.sessionNumber} 局`);
  await openRecords(page);
  const session = page.locator('.record-session').first();
  await expect(session).toHaveAttribute('data-session-number', String(initial.sessionNumber));
  await expect(session.locator('.record-session-heading')).not.toContainText(/已完成|手数|\d+ 手/);
  await expect(session.locator('.record-session-heading')).toContainText('100 / 200');
  await expect(session.locator('.record-cards .playing-card')).toHaveCount(6);
  await expect(session.locator('.record-cards .card-art')).toHaveCount(6);
  expect(
    await session
      .locator('.record-hand')
      .evaluateAll((rows) => rows.map((r) => [r.dataset.hand, r.dataset.attempt])),
  ).toEqual([
    ['2', '0'],
    ['1', '1'],
    ['1', '0'],
  ]);
  await expect(session.locator('.record-hand').last()).toHaveAttribute('data-superseded', 'true');
  await expect(session.locator('.record-hand').last()).toHaveClass(/record-superseded/);
  await session.locator('.record-session-heading').click();
  await session.locator('.record-session-heading').click();
  await expect(session.locator('.record-hand').first()).toHaveAttribute('data-hand', '2');
  expect((await records(page))[0].attempts.map((a) => [a.hand, a.attempt])).toEqual([
    [1, 0],
    [1, 1],
    [2, 0],
  ]);
  await expect(session).not.toContainText('已被重打替代');
  await page.locator('#records-back-button').click();
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
  await page.evaluate(() => window.qa.stop());
  await openRecords(page);
  expect(
    await page
      .locator('.record-session')
      .evaluateAll((rows) => rows.map((r) => Number(r.dataset.sessionNumber))),
  ).toEqual((await records(page)).map((s) => s.number));
  expect((await state(page)).sessionNumber).toBe(initial.sessionNumber + 1);
});

test('record rows omit first-attempt copy, retain settled outcomes, color retries and sign chip deltas', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish());
  await page.evaluate(() => window.qa.recordsRetry());
  await page.evaluate(() => window.qa.recordsFinish(1));
  await page.evaluate(() => window.qa.recordsNext());
  await page.evaluate(() => window.qa.recordsFinish(1));
  const session = (await records(page))[0];
  expect(session.attempts[0].profit).toBeGreaterThan(0);
  expect(session.attempts[1].profit).toBe(0);
  expect(session.attempts[2].profit).toBeLessThan(0);
  await openRecords(page);
  const rows = page.locator('.record-session').first().locator('.record-hand');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#records-page')).not.toContainText('首次');
  await expect(page.locator('#records-page')).not.toContainText('持平');
  await expect(rows.nth(0).locator('.record-retry')).toHaveCount(0);
  await expect(rows.nth(2).locator('.record-retry')).toHaveCount(0);
  const retry = rows.nth(1).locator('.record-retry');
  await expect(retry).toHaveText('重打1');
  const tag = await retry.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderWidth: parseFloat(style.borderWidth),
      color: style.color,
    };
  });
  expect(tag.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(tag.borderWidth).toBeGreaterThan(0);
  const channels = tag.color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  expect(Math.max(...channels) - Math.min(...channels)).toBeGreaterThan(10);
  for (let index = 0; index < session.attempts.length; index++) {
    const profit = session.attempts.at(-1 - index).profit;
    expect(Math.abs(profit)).toBeLessThan(1000);
    // A lost hand without a chip change reads -0.
    const lost = (await rows.nth(index).locator('.record-hand-result span').allTextContents())
      .join('')
      .includes('输');
    await expect(rows.nth(index).locator('.record-hand-result strong')).toHaveText(
      `${profit < 0 || (profit === 0 && lost) ? '-' : '+'}${Math.abs(profit)}`,
    );
  }
  await expect(rows.nth(1).locator('.record-hand-result span')).toHaveText('输');
  await expect(
    page
      .locator('.record-session')
      .first()
      .locator('.record-session-stats > span')
      .nth(1)
      .locator('strong'),
  ).toHaveText(`${session.profit < 0 ? '-' : '+'}${Math.abs(session.profit)}`);
  await rows.nth(0).click();
  await expect(page.locator('#records-title')).not.toContainText(/首次|[·\s]$/);
});

test('historical details omit the extra heading and use system Back to the list', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qa.recordsFinish();
    window.qa.recordsRetry();
    window.qa.recordsFinish();
    window.qa.recordsRetry();
    window.qa.recordsRetry();
    window.qa.recordsFinish();
  });
  const session = (await records(page))[0];
  expect(session.attempts.map((attempt) => attempt.superseded)).toEqual([true, true, false]);
  expect(session.completed).toBe(1);
  expect(session.profit).toBe(session.attempts[2].profit);
  await openRecords(page);
  for (const attempt of session.attempts) {
    await page.locator(`[data-record-hand="${attempt.id}"]`).click();
    await expect(page.locator('#records-title')).toHaveText('对局记录');
    await expect(page.locator('#records-title')).toHaveClass(/sr-only/);
    await expect(page.locator('#records-hand-start')).toHaveAttribute(
      'datetime',
      new Date(attempt.startedAt).toISOString(),
    );
    await expect(page.locator('.records-live-note')).toHaveCount(0);
    await expect(page.locator('#history-street-label, #history-street-divider')).toHaveCount(0);
    await expect(
      page.locator('.records-history-heading, #history-back-button, .records-history-result'),
    ).toHaveCount(0);
    await expect(
      page.locator('#records-title .record-tag, #history-page .record-retry'),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: '返回游戏', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#records$/);
    await expect(page.locator(`[data-session-id="${session.id}"]`)).toBeVisible();
  }
});

test('historical headers show each attempt start date with the year, align the return button and omit repeated copy', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qa.recordsFinish();
    window.qa.recordsRetry();
    window.qa.recordsFinish();
  });
  const session = (await records(page))[0];
  const starts = ['2026-01-01T00:01:00.000Z', '2026-01-02T01:02:00.000Z'];
  await page.evaluate(
    ({ id, starts }) => {
      const data = JSON.parse(localStorage.getItem('noir-game-records-v1'));
      const session = data.sessions.find((item) => item.id === id);
      session.startedAt = Date.parse('2025-12-31T15:59:00.000Z');
      session.attempts.forEach((attempt, i) => {
        attempt.startedAt = Date.parse(starts[i]);
      });
      localStorage.setItem('noir-game-records-v1', JSON.stringify(data));
    },
    { id: session.id, starts },
  );
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await openRecords(page);
    const date = page.locator(`[data-session-id="${session.id}"] .record-session-title time`);
    await expect(date).toHaveText('2025/12/31 23:59');
    await expect(date).toHaveAttribute('datetime', '2025-12-31T15:59:00.000Z');
    for (const [i, attempt] of session.attempts.entries()) {
      await page.locator(`[data-record-hand="${attempt.id}"]`).click();
      await expect(page.locator('#records-hand-start')).toHaveAttribute('datetime', starts[i]);
      await expect(page.locator('#records-hand-start')).toHaveText(
        i ? '2026/01/02 09:02' : '2026/01/01 08:01',
      );
      const layout = await page.evaluate(() => {
        const label = document.querySelector('.records-eyebrow').getBoundingClientRect();
        const button = document.querySelector('#records-back-button').getBoundingClientRect();
        const time = document.querySelector('#records-hand-start').getBoundingClientRect();
        const actions = document.querySelector('.header-actions');
        return {
          centerOffset: Math.abs(label.top + label.height / 2 - button.top - button.height / 2),
          timeGap: time.top - label.bottom,
          right: actions.getBoundingClientRect().right,
          shift: getComputedStyle(actions).left,
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(layout.centerOffset).toBeLessThan(1);
      expect(layout.timeGap).toBeGreaterThan(0);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.shift).toBe('6px');
      expect(layout.overflow).toBeLessThanOrEqual(1);
      for (const selector of ['#history-street-label', '#history-street-divider'])
        await expect(page.locator(selector)).toBeHidden();
      expect(
        await page.locator('#records-title').evaluate((el) => el.classList.contains('sr-only')),
      ).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`history-heading-${width}-${i}.png`) });
      await page.goBack();
    }
    await page.locator('#records-back-button').click();
  }
  await openRecords(page);
  await page.locator(`[data-record-hand="${session.attempts[0].id}"]`).click();
  await page.locator('#opponents-button').click();
  await page.locator('#language-select').selectOption('en');
  await page.locator('#opponents-dialog .close-dialog').click();
  await expect(page.locator('#records-hand-start')).toHaveText('01/01/2026, 08:01');
  await expect(page.locator('#records-hand-start')).toHaveAttribute('datetime', starts[0]);
  await page.reload();
  await expect(page.locator('#records-hand-start')).toHaveAttribute('datetime', starts[0]);
});

// The predecessor is another same-origin page so Back after Return Game is
// observable without leaving the test host or relying on browser startup tabs.
test('returning to the game closes the records visit without nested Back routes', async ({
  page,
}) => {
  await page.goto('/app-privacy.html');
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.recordsStart();
    window.qa.recordsFinish(1);
  });
  const attempt = (await records(page))[0].attempts[0];
  const before = await state(page);
  await page.evaluate(() => (window.recordsDocument = { same: true }));
  for (let visit = 0; visit < 3; visit++) {
    await openRecords(page);
    await page.locator(`[data-record-hand="${attempt.id}"]`).click();
    await page.locator('#records-back-button').click();
    await expect(page).not.toHaveURL(/#records/);
    await expect(page.locator('main.main')).toBeVisible();
    expect(await page.evaluate(() => window.recordsDocument.same)).toBe(true);
    expect(await state(page)).toMatchObject({
      hand: before.hand,
      sessionNumber: before.sessionNumber,
    });
    if (visit === 0) {
      await page.evaluate(() => history.forward());
      await expect
        .poll(() => page.evaluate(() => history.state.noirRecordsNavigation.depth))
        .toBe(0);
      await expect(page).not.toHaveURL(/#records/);
      expect(await page.evaluate(() => window.recordsDocument.same)).toBe(true);
    }
  }
  await page.goBack();
  await expect(page).toHaveURL(/app-privacy\.html$/);
});

test('native Back events pop independent records pages while the live document stays running', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish(1));
  const attempt = (await records(page))[0].attempts[0];
  expect(attempt.profit).toBe(0);
  expect(attempt.snapshot.players[0].folded).toBe(true);
  await openRecords(page);
  // Folding without a chip change is still a lost hand: -0.
  await expect(page.locator(`[data-record-hand="${attempt.id}"] .record-hand-result`)).toHaveText(
    '-0输',
  );
  await page.locator(`[data-record-hand="${attempt.id}"]`).click();
  const live = await state(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('noir:records-back')));
  await expect(page).toHaveURL(/#records$/);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('noir:records-back')));
  await expect(page).not.toHaveURL(/#records/);
  expect(await state(page)).toMatchObject({ hand: live.hand, sessionNumber: live.sessionNumber });
});

test('reloading a historical URL retains its list parent and does not reload practice on Back', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish(1));
  const attempt = (await records(page))[0].attempts[0],
    before = await state(page);
  await openRecords(page);
  await page.locator(`[data-record-hand="${attempt.id}"]`).click();
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  const resumed = await state(page);
  expect(resumed.hand).toBe(before.hand + 1);
  expect(resumed.sessionNumber).toBe(before.sessionNumber);
  await expect(page.locator('#history-page')).toBeVisible();
  await page.evaluate(() => (window.recordsReloadDocument = true));
  await page.goBack();
  await expect(page).toHaveURL(/#records$/);
  expect(await page.evaluate(() => window.recordsReloadDocument)).toBe(true);
  expect((await state(page)).hand).toBe(resumed.hand);
  await page.locator('#records-back-button').click();
  await expect(page).not.toHaveURL(/#records/);
  expect(await page.evaluate(() => window.recordsReloadDocument)).toBe(true);
  expect((await state(page)).hand).toBe(resumed.hand);
});

test('same-page locale refresh preserves historical review while Back closes it with the page', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish());
  const attempt = (await records(page))[0].attempts[0],
    saved = await records(page);
  await openRecords(page);
  await page.locator(`[data-record-hand="${attempt.id}"]`).click();
  await page.locator('#history-review-button').click();
  await expect(page.locator('#review-dialog')).toBeVisible();
  await page.evaluate(async () => {
    const { loadLocale, localizeDocument } = await import('/src/i18n/index.js');
    await loadLocale('en');
    localizeDocument(document);
    document.dispatchEvent(new CustomEvent('noir:locale-changed'));
  });
  await expect(page.locator('#review-dialog')).toBeVisible();
  expect((await state(page)).recordsRoute).toEqual({ page: 'hand', id: attempt.id });
  await page.goBack();
  await expect(page).toHaveURL(/#records$/);
  await expect(page.locator('#review-dialog')).toBeHidden();
  expect(await records(page)).toEqual(saved);
});

for (const count of [5, 9]) {
  test(`historical ${count}-seat settlement uses the live table geometry for folded and revealed hands`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    for (const mode of ['fold', 'showdown']) {
      await page.evaluate(
        ({ count, mode }) => {
          window.qa.recordsStart({ count });
          if (mode === 'fold') window.qa.recordsFinish(1);
          else {
            window.qa.allinRest();
            while (window.noir.getState().phase === 'between') window.qa.finish();
            window.qa.stop();
          }
        },
        { count, mode },
      );
      const attempt = (await records(page))[0].attempts[0];
      for (const width of [320, 390, 700, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(() =>
          document
            .querySelector('#arena')
            .getAnimations({ subtree: true })
            .every(
              (animation) =>
                animation.effect.getTiming().iterations === Infinity ||
                animation.playState !== 'running',
            ),
        );
        await expect
          .poll(async () => {
            const geometry = await page.evaluate(readRecordTableGeometry, '#arena');
            const fitted = await page.locator('#arena').evaluate((arena) => {
              const viewport = arena.closest('.table-viewport');
              const compact = matchMedia(
                '(max-width: 900px), (max-width: 1100px) and (orientation: portrait)',
              ).matches;
              return (
                !compact ||
                Math.abs(arena.getBoundingClientRect().width - viewport.clientWidth) <= 1.5
              );
            });
            return geometry.arena.width > 0 && geometry.seats.length === count - 1 && fitted;
          })
          .toBe(true);
        const live = await page.evaluate(readRecordTableGeometry, '#arena');
        await openRecords(page);
        await page.locator(`[data-record-hand="${attempt.id}"]`).click();
        await expect(page.locator('#history-arena')).toBeVisible();
        await expect
          .poll(async () => {
            const archived = await page.evaluate(readRecordTableGeometry, '#history-arena');
            return recordGeometryDifferences(archived, live);
          })
          .toEqual([]);
        const archived = await page.evaluate(readRecordTableGeometry, '#history-arena');
        expect(archived.seats).toHaveLength(count - 1);
        const overlaps = (a, b) =>
          a &&
          b &&
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        for (const seat of archived.seats) {
          for (const card of archived.boardCards) {
            expect(
              overlaps(seat.cards, card),
              `seat ${seat.id} cards overlap public cards`,
            ).toBeFalsy();
            expect(
              overlaps(seat.profile, card),
              `seat ${seat.id} profile overlaps public cards`,
            ).toBeFalsy();
          }
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (width === 390 || width === 1280)
          await page.locator('#history-page').screenshot({
            path: test.info().outputPath(`history-${count}-${mode}-${width}.png`),
          });
        await page.locator('#records-back-button').click();
      }
    }
  });
}

test('historical settlement and review stay fixed while the live game advances', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish());
  const original = (await records(page))[0].attempts[0];
  await page.evaluate(() => window.qa.recordsNext());
  await openRecords(page);
  await page.locator(`[data-record-hand="${original.id}"]`).click();
  await expect(page.locator('#history-page')).toBeVisible();
  await expect(page.locator('#records-hand-start')).toHaveAttribute(
    'datetime',
    new Date(original.startedAt).toISOString(),
  );
  await expect(
    page.locator('#history-page #next-button, #history-page #restart-hand-button'),
  ).toHaveCount(0);
  const snapshotText = await page.locator('#history-table').innerText();
  const liveBefore = await state(page);
  const thinking = await page.evaluate(() => window.qa.resumeBots());
  expect(thinking.delayMs).toBeLessThanOrEqual(BOT_THINK_LIMITS.maximum);
  // Hero is no longer the first seat on the second hand; actual opponent
  // timers must progress while the records view remains on screen.
  await expect
    .poll(async () => (await page.evaluate(() => window.qa.snapshot())).history.length, {
      timeout: thinking.delayMs + 1500,
    })
    .toBeGreaterThan(0);
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('#history-table')).toHaveText(snapshotText, { useInnerText: true });
  await page.locator('#history-review-button').click();
  await expect(page.locator('#review-dialog-title')).toContainText('第 1 手');
  await page.evaluate(() => window.qa.recordsFinish());
  expect((await state(page)).hand).toBe(liveBefore.hand);
  await expect(page.locator('#review-dialog-title')).toContainText('第 1 手');
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  await page.locator('#review-dialog .close-dialog').first().click();
  await page.goBack();
  await expect(page).toHaveURL(/#records$/);
  await page.locator('#records-back-button').click();
  await expect(page.locator('main.main')).toBeVisible();
  expect((await state(page)).phase).toBe('done');
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog-title')).toContainText('第 2 手');
});

test('reload keeps the session, refunds an unfinished attempt and starts a new hand without losing settled stats', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish());
  await page.evaluate(() => window.qa.recordsNext());
  const before = await page.evaluate(() => window.qa.snapshot());
  await page.evaluate(() => window.qa.raiseActions(3));
  const live = await state(page);
  expect(live.phase).not.toBe('done');
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  const after = await page.evaluate(() => window.qa.snapshot());
  expect(after.hand).toBe(before.hand + 1);
  expect(after.stats).toEqual(before.stats);
  expect(after.players.map((p) => p.stack + p.total)).toEqual(
    before.players.map((p) => p.stack + p.total),
  );
  const session = (await records(page))[0];
  expect(session.number).toBe(live.sessionNumber);
  expect(session.attempts.map((a) => a.status)).toEqual(['completed', 'unfinished', 'playing']);
  expect(session.attempts[1].profit).toBeNull();
  expect(session.completed).toBe(1);
  await openRecords(page);
  const unfinished = page
    .locator('.record-session')
    .first()
    .locator('.record-hand[data-status="unfinished"]');
  await expect(unfinished).toContainText('未完成');
  await expect(unfinished).not.toHaveAttribute('data-record-hand');
  await expect(unfinished.locator('.record-cards .playing-card')).toHaveCount(2);
});

test('refills use the short tag and pending blind changes start another session only when applied', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsStart({ refill: true, smallBlind: 300 }));
  const original = await state(page);
  await page.evaluate(() => window.noir.requestSmallBlind(500));
  expect((await records(page))[0].number).toBe(original.sessionNumber);
  await page.evaluate(() => window.qa.recordsFinish());
  await page.evaluate(() => window.qa.recordsRetry());
  expect((await state(page)).smallBlind).toBe(300);
  await page.evaluate(() => window.qa.recordsFinish());
  await openRecords(page);
  await expect(page.locator('.record-session').first().locator('.record-refill')).toHaveCount(2);
  await expect(page.locator('.record-session').first()).not.toContainText('补充后首手');
  await page.locator('#records-back-button').click();
  await page.evaluate(() => window.qa.recordsNext());
  expect((await state(page)).sessionNumber).toBe(original.sessionNumber + 1);
  expect((await state(page)).smallBlind).toBe(500);
  const all = await records(page);
  expect(all[1].endedAt).not.toBeNull();
  expect(all[0].profit).toBe(0);
  expect(all[1].completed).toBe(1);
});

test('records and historic cards fit narrow screens and localize without changing stored results', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.recordsFinish());
  const original = (await records(page))[0].attempts[0];
  await openRecords(page);
  for (const width of [320, 390, 700, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.locator(`[data-record-hand="${original.id}"]`).click();
    await expect(page.locator('#history-table .hero-cards .playing-card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.goBack();
  }
  const saved = await records(page);
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru', 'zh-CN']) {
    await page.evaluate(async (locale) => {
      const { loadLocale, localizeDocument } = await import('/src/i18n/index.js');
      await loadLocale(locale);
      localizeDocument(document);
      document.dispatchEvent(new CustomEvent('noir:locale-changed'));
    }, locale);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(await page.locator('#records-page').innerText()).not.toMatch(/\p{Script=Han}/u);
    await page.locator(`[data-record-hand="${original.id}"]`).click();
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(await page.locator('#history-page').innerText()).not.toMatch(/\p{Script=Han}/u);
    await page.goBack();
    expect(await records(page)).toEqual(saved);
  }
  await page.locator('#records-page').screenshot({ path: test.info().outputPath('records.png') });
  await page.locator(`[data-record-hand="${original.id}"]`).click();
  await page
    .locator('#records-page')
    .screenshot({ path: test.info().outputPath('historical-settlement.png') });
});

test('nine-seat history keeps cards centered, hero identity unclipped and the mobile entry visible', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qa.recordsStart({ count: 9 });
    window.qa.allinRest();
    while (window.noir.getState().phase === 'between') window.qa.finish();
    window.qa.stop();
  });
  const original = (await records(page))[0].attempts[0];
  await openRecords(page);
  await page.locator(`[data-record-hand="${original.id}"]`).click();
  await expect(page.locator('#history-table .board .playing-card')).toHaveCount(5);
  for (const width of [320, 390, 700, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const table = document.querySelector('#history-table').getBoundingClientRect();
          const center = table.x + table.width / 2;
          const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
          const hero = rect('#history-table .hero-area');
          const cards = rect('#history-table .hero-cards');
          const name = rect('#history-table .hero-name');
          const board = rect('#history-table .board');
          const label = document.querySelector(
            `#rules-button [data-guide-label="${document.querySelector('#rules-button').dataset.label || 'guide'}"]`,
          );
          const style = getComputedStyle(label);
          return {
            heroCentered: Math.abs(cards.x + cards.width / 2 - center) < 2,
            boardCentered: Math.abs(board.x + board.width / 2 - center) < 2,
            heroInside: hero.bottom <= table.bottom + 1 && name.bottom <= table.bottom + 1,
            boardInside: board.x >= table.x - 1 && board.right <= table.right + 1,
            labelVisible:
              label.getBoundingClientRect().width > 0 &&
              style.display !== 'none' &&
              style.visibility === 'visible',
            noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
            ranksBelowCards: [...document.querySelectorAll('#history-table .seat')].every(
              (seat) => {
                const rank = seat.querySelector('.hand-rank');
                return (
                  !rank ||
                  rank.getBoundingClientRect().top >=
                    seat.querySelector('.mini-cards').getBoundingClientRect().bottom - 1
                );
              },
            ),
          };
        }),
      )
      .toEqual({
        heroCentered: true,
        boardCentered: true,
        heroInside: true,
        boardInside: true,
        labelVisible: true,
        noOverflow: true,
        ranksBelowCards: true,
      });
  }
});

test('records headings keep their note close and revealed opponents use larger fixed slots', async ({
  page,
}) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      window.qa.recordsStart({ count: 9 });
      window.qa.allinRest();
      while (window.noir.getState().phase === 'between') window.qa.finish();
      window.qa.stop();
    });
    const attempt = (await records(page))[0].attempts[0];
    const read = (selector) => {
      const arena = document.querySelector(selector);
      const scale = arena.getBoundingClientRect().width / arena.offsetWidth;
      return [...arena.querySelectorAll('.revealed-cards')].map((slot) => {
        const face = slot.querySelector('.playing-card');
        const profile = slot.parentElement.querySelector('.seat-profile').getBoundingClientRect();
        const card = face.getBoundingClientRect();
        return {
          profileWidth: profile.width / scale,
          width: card.width / scale,
          baseWidth: face.offsetWidth,
          left: card.left,
          right: card.right,
          profileLeft: profile.left,
          profileRight: profile.right,
          bottom: card.bottom,
          profileTop: profile.top,
        };
      });
    };
    await page.waitForTimeout(800);
    const live = await page.evaluate(read, '#arena');
    expect(live.length).toBeGreaterThan(0);
    for (const face of live) {
      expect(face.baseWidth).toBeGreaterThanOrEqual(44);
      expect(face.left).toBeGreaterThan(face.profileLeft + 2);
      expect(face.right).toBeLessThan(face.profileRight - 2);
      expect(face.bottom - face.profileTop).toBeLessThan(20);
    }
    await openRecords(page);
    // The live-play note is gone; the first card sits a fixed gap below the heading.
    const spacing = await page.evaluate(() => {
      const heading = document.querySelector('.records-page-heading').getBoundingClientRect();
      const title = document.querySelector('#records-title').getBoundingClientRect();
      const row = document.querySelector('.record-session').getBoundingClientRect();
      const back = document.querySelector('#records-back-button').getBoundingClientRect();
      return {
        cardGap: row.top - heading.bottom,
        center: Math.abs(title.top + title.height / 2 - back.top - back.height / 2),
      };
    });
    expect(spacing.cardGap).toBe(16);
    expect(spacing.center).toBeLessThan(1);
    await page.locator(`[data-record-hand="${attempt.id}"]`).click();
    const saved = await page.evaluate(read, '#history-arena');
    expect(saved.map((face) => [face.baseWidth, face.width])).toEqual(
      live.map((face) => [face.baseWidth, face.width]),
    );
    await page.screenshot({ path: test.info().outputPath(`revealed-faces-${width}.png`) });
    await page.locator('#records-back-button').click();
  }
});

test('long press reveals full clipped names on live and archived tables and dismisses safely', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.qa.recordsStart({ count: 9 });
    const game = window.qa.snapshot();
    game.players.slice(1).forEach((player) => {
      player.botProfile = 'viktor';
    });
    window.qa.loadRecordedGame(game);
    window.qa.recordsFinish();
  });
  const attempt = (await records(page))[0].attempts[0];
  for (const root of ['#arena', '#history-arena']) {
    if (root === '#history-arena') {
      await openRecords(page);
      await page.locator(`[data-record-hand="${attempt.id}"]`).click();
    }
    const label = page.locator(`${root} .seat-style-label`).first();
    await label.scrollIntoViewIfNeeded();
    expect(await label.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(true);
    const full = await label.textContent();
    const rect = await label.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText(full);
    const tip = await tooltip.boundingBox();
    expect(tip.x).toBeGreaterThanOrEqual(12);
    expect(tip.x + tip.width).toBeLessThanOrEqual(378);
    expect(tip.y).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: test.info().outputPath(`full-name-${root.slice(1)}.png`) });
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    // Dragging starts a page gesture; it must not become a long press.
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 + 20);
    await page.waitForTimeout(500);
    await page.mouse.up();
    await expect(tooltip).toBeHidden();
  }
});

test('historical pot dialogs and showdown stay bound to the saved hand while live practice changes', async ({
  page,
}) => {
  await page.evaluate(() => {
    // Seat 1 covers the hero, so the all-in cannot end the game and the
    // saved hand stays in the live, expanded session.
    window.qa.recordsStart({ count: 5, rivalStack: 40000 });
    window.qa.allinRest();
    while (window.noir.getState().phase === 'between') window.qa.finish();
    window.qa.stop();
  });
  const saved = (await records(page))[0].attempts[0];
  expect((await state(page)).over).toBeNull();
  await page.evaluate(() => window.qa.recordsNext());
  await openRecords(page);
  await page.locator(`[data-record-hand="${saved.id}"]`).click();
  await expect(page.locator('#history-pot-settlement, .records-settlement')).toHaveCount(0);
  await expect(page.locator('#history-showdown-stage')).toBeVisible();
  const players = saved.snapshot.players.filter((player) => !player.folded);
  await expect(page.locator('#history-showdown-scene .showdown-player')).toHaveCount(
    players.length,
  );
  for (const player of players) {
    const row = page.locator(`#history-showdown-scene [data-player="${player.id}"]`);
    await expect(row.locator('.winning-card')).toHaveCount(5);
    await expect(row).toContainText(player.name);
  }
  await page.locator('#history-pot-details-button').click();
  await expect(page.locator('#pot-dialog')).toBeVisible();
  const potText = await page.locator('#pot-dialog-content').textContent();
  const showdownText = await page.locator('#history-showdown-scene').textContent();
  await page.evaluate(() => {
    window.qa.recordsFinish();
  });
  await expect(page.locator('#pot-dialog-content')).toHaveText(potText);
  await expect(page.locator('#history-showdown-scene')).toHaveText(showdownText);
  await page.locator('#pot-dialog .close-dialog').first().click();
  await expect(page.locator('#pot-dialog')).toBeHidden();
  await expect(page.locator('#history-showdown-stage')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('history-showdown.png') });
  await page.locator('#records-back-button').click();
  await page.locator('#pot-details-button').click();
  await expect(page.locator('#pot-dialog')).toBeVisible();
  expect(await page.locator('#pot-dialog-content').textContent()).not.toBe(potText);
});
