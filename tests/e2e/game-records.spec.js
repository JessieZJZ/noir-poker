import { test, expect } from '@playwright/test';
import { BOT_THINK_LIMITS } from '../../src/engine/bot-timing.js';
import {
  readRecordTableGeometry,
  recordGeometryDifferences,
} from '../fixtures/records-geometry.js';

const records = (page) => page.evaluate(() => window.noir.getRecords());
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

test('the rotating entry always opens both choices and keyboard focus keeps its label stable', async ({
  page,
}) => {
  await page.clock.install();
  const trigger = page.locator('#rules-button');
  await trigger.focus();
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
    ({ source, id }) => {
      const saved = JSON.parse(localStorage.getItem('noir-game-records-v1'));
      const attempt = saved.sessions
        .flatMap((session) => session.attempts)
        .find((a) => a.id === id);
      attempt.snapshot.pots[0].label = source;
      attempt.snapshot.pots[0].awards[0].label = source;
      attempt.snapshot.players[1].name = source;
      attempt.snapshot.players[1].action = source;
      attempt.snapshot.players[1].lastAction.text = source;
      attempt.snapshot.winners[0].label = 'award " data-archive-injected="true';
      localStorage.setItem('noir-game-records-v1', JSON.stringify(saved));
    },
    { source, id: record.id },
  );
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await openRecords(page);
  await page.locator(`[data-record-hand="${record.id}"]`).click();
  await expect(page.locator('.records-settlement')).toContainText(source);
  expect(await page.evaluate(() => window.historyMarkupExecuted)).toBeUndefined();
  await expect(page.locator('.records-settlement img')).toHaveCount(0);
  await expect(page.locator('#history-arena .seat-name-label').first()).toHaveText(source);
  await expect(page.locator('#history-arena .seat-action').first()).toHaveText(source);
  await expect(page.locator('#history-arena img:not(.persona-portrait)')).toHaveCount(0);
  await expect(page.locator('#history-arena [data-archive-injected]')).toHaveCount(0);
});

test('records group sessions newest first and show graphic hands in chronological attempt order', async ({
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
    ['1', '0'],
    ['1', '1'],
    ['2', '0'],
  ]);
  await expect(session.locator('.record-hand').first()).toContainText('已被重打替代');
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

test('record rows omit first-attempt and neutral copy, color retry tags and sign every chip delta', async ({
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
    const profit = session.attempts[index].profit;
    expect(Math.abs(profit)).toBeLessThan(1000);
    await expect(rows.nth(index).locator('.record-hand-result strong')).toHaveText(
      `${profit < 0 ? '-' : '+'}${Math.abs(profit)}`,
    );
  }
  await expect(rows.nth(1).locator('.record-hand-result span')).toHaveCount(0);
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
            return geometry.arena.width > 0 && geometry.seats.length === count - 1;
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
  await expect(page.locator('#records-title')).toContainText('第 1 手');
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
  await page.locator('#history-back-button').click();
  await expect(page).toHaveURL(/#records$/);
  await page.goBack();
  await expect(page.locator('#history-page')).toBeVisible();
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
    await page.locator('#history-back-button').click();
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
    await page.locator('#history-back-button').click();
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
