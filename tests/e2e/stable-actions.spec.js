import { test, expect } from '@playwright/test';
import { openSettings, closeSettings } from './settings-helpers.js';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
  await openSettings(page);
  await page.locator('#mix-opponents').click();
  await closeSettings(page);
});

async function flushLayout(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function configureViewport(page, size, insets = { top: 0, bottom: 0 }) {
  await page.setViewportSize(size);
  await page.evaluate(({ top, bottom }) => {
    const root = document.documentElement;
    root.classList.toggle('native-app', top > 0 || bottom > 0);
    root.style.setProperty('--safe-area-inset-top', `${top}px`);
    root.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
    window.scrollTo(0, 0);
  }, insets);
}

async function startFrameCapture(page) {
  await flushLayout(page);
  return page.evaluate(() => {
    const read = () =>
      Object.fromEntries(
        ['.game-surface', '.table-viewport', '.action-dock'].map((selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return [selector, { top: r.top, height: r.height, bottom: r.bottom }];
        }),
      );
    const capture = { frames: [read()], frame: null };
    const sample = () => {
      capture.frames.push(read());
      capture.frame = requestAnimationFrame(sample);
    };
    capture.frame = requestAnimationFrame(sample);
    window.dockRegressionCapture = capture;
    return capture.frames[0];
  });
}

async function expectStableCapturedFrames(page, initial) {
  await flushLayout(page);
  const frames = await page.evaluate(() => {
    const capture = window.dockRegressionCapture;
    cancelAnimationFrame(capture.frame);
    delete window.dockRegressionCapture;
    return capture.frames;
  });
  expect(frames.length).toBeGreaterThan(4);
  const shifts = frames.flatMap((frame, index) =>
    Object.entries(frame).flatMap(([selector, box]) =>
      Object.entries(box)
        .filter(([key, value]) => Math.abs(value - initial[selector][key]) > 1)
        .map(([key, value]) => ({
          frame: index,
          selector,
          key,
          initial: initial[selector][key],
          value,
        })),
    ),
  );
  expect(shifts, 'fold/settlement/retry must not borrow height from the main table').toEqual([]);
}

async function expectDockLayout(page, kind, bottomInset = 0) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ kind, bottomInset }) => {
          const rect = (el) => el.getBoundingClientRect();
          const dock = rect(document.querySelector('.action-dock'));
          const panel = document.querySelector('#action-panel');
          const r = rect(panel);
          const style = getComputedStyle(panel);
          const inner = {
            left: r.left + parseFloat(style.paddingLeft),
            right: r.right - parseFloat(style.paddingRight),
            top: r.top + parseFloat(style.paddingTop),
            bottom: r.bottom - parseFloat(style.paddingBottom),
          };
          const issues = [];
          if (dock.bottom > innerHeight + 1) issues.push('dock leaves the first screen');
          const fits = (a, b) => Math.abs(a - b) <= 1.5;
          if (kind === 'single') {
            const button = rect(document.querySelector('#continue-deal-button'));
            if (!fits(button.left, inner.left) || !fits(button.right, inner.right))
              issues.push('single button does not fill the available width');
            if (!fits((button.top + button.bottom) / 2, (inner.top + inner.bottom) / 2))
              issues.push('single button is not vertically centered');
            if (button.height < 44 || button.height > 45.5)
              issues.push('single button does not retain its 44px tap target');
          } else if (kind === 'settled') {
            const next = rect(document.querySelector('#next-button'));
            const retry = rect(document.querySelector('#restart-hand-button'));
            const review = rect(document.querySelector('#review-hand-button'));
            if (!fits(next.left, inner.left) || !fits(next.right, inner.right))
              issues.push('next hand does not occupy the complete first row');
            if (
              !fits(retry.left, inner.left) ||
              !fits(review.right, inner.right) ||
              !fits(retry.top, review.top) ||
              !fits(retry.bottom, review.bottom) ||
              !fits(retry.width, review.width) ||
              retry.top < next.bottom
            )
              issues.push('retry and review do not form the equal-width second row');
            if (!fits(next.top, inner.top) || !fits(review.bottom, inner.bottom))
              issues.push('settled buttons leave unused vertical space');
          }
          const buttons = [...panel.querySelectorAll('button')].filter(
            (el) => !el.hidden && getComputedStyle(el).display !== 'none' && rect(el).height > 0,
          );
          for (const button of buttons) {
            const bounds = rect(button);
            if (bounds.bottom > innerHeight - bottomInset + 1)
              issues.push(`${button.id || button.dataset.preset} crosses the native safe area`);
            if (bounds.left < inner.left - 1 || bounds.right > inner.right + 1)
              issues.push(`${button.id || button.dataset.preset} exceeds panel width`);
            if (button.scrollWidth > button.clientWidth + 1)
              issues.push(`${button.id || button.dataset.preset} text exceeds its button`);
            const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
            const centers = [];
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              centers.push(
                ...[...range.getClientRects()]
                  .filter((line) => line.width > 1 && line.height > 1)
                  .map((line) => (line.top + line.bottom) / 2),
              );
            }
            if (centers.length && Math.max(...centers) - Math.min(...centers) > 8)
              issues.push(`${button.id || button.dataset.preset} label wraps onto another line`);
          }
          return issues;
        },
        { kind, bottomInset },
      ),
    )
    .toEqual([]);
}

test('fold, expedited settlement, retry and next hand keep the mobile table and dock height stable', async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const { size, insets } of [
    { size: { width: 390, height: 844 }, insets: { top: 0, bottom: 0 } },
    { size: { width: 320, height: 667 }, insets: { top: 0, bottom: 0 } },
    { size: { width: 375, height: 667 }, insets: { top: 59, bottom: 34 } },
    { size: { width: 844, height: 390 }, insets: { top: 0, bottom: 21 } },
  ]) {
    await configureViewport(page, size, insets);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect(page.locator('#fold-button')).toBeEnabled();
      await expectDockLayout(page, 'live', insets.bottom);
      const baseline = await startFrameCapture(page);
      await page.locator('#fold-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#continue-deal-button')).toBeEnabled();
      await expectDockLayout(page, 'single', insets.bottom);
      if (size.width === 390 && count === 9)
        await page.screenshot({ path: test.info().outputPath('folded-single-button.png') });
      await page.locator('#continue-deal-button').click();
      await expect.poll(() => page.evaluate(() => window.qa.state().phase)).toBe('done');
      await expect(page.locator('#next-button')).toBeVisible();
      await expectDockLayout(page, 'settled', insets.bottom);
      if (size.width === 390 && count === 9)
        await page.screenshot({
          path: test.info().outputPath('settled-fixed-two-row-buttons.png'),
        });
      await page.locator('#restart-hand-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#replay-label')).toContainText('重打');
      await expectDockLayout(page, 'live', insets.bottom);
      await page.locator('#fold-button').click();
      await page.evaluate(() => window.qa.stop());
      await page.locator('#continue-deal-button').click();
      await expect.poll(() => page.evaluate(() => window.qa.state().phase)).toBe('done');
      await expectDockLayout(page, 'settled', insets.bottom);
      await page.locator('#next-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#replay-label')).toBeHidden();
      await expectDockLayout(page, 'live', insets.bottom);
      await expectStableCapturedFrames(page, baseline);
      await expect(page.locator('.table-viewport')).toHaveJSProperty('scrollTop', 0);
    }
  }
});

async function heroAnchorBounds(page) {
  await flushLayout(page);
  const { anchors, identityCenterOffset } = await page.evaluate(() => {
    const anchors = Object.fromEntries(
      ['#hero-cards', '.hero-name', '.hero-identity'].map((selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [
          selector,
          {
            top: box.top + scrollY,
            bottom: box.bottom + scrollY,
            left: box.left + scrollX,
            right: box.right + scrollX,
          },
        ];
      }),
    );
    const cards = [...document.querySelectorAll('#hero-cards > .playing-card')].map((card) =>
      card.getBoundingClientRect(),
    );
    const cardCenter =
      (Math.min(...cards.map((box) => box.left)) + Math.max(...cards.map((box) => box.right))) / 2;
    const identity = document.querySelector('.hero-identity').getBoundingClientRect();
    return {
      anchors,
      identityCenterOffset: (identity.left + identity.right) / 2 - cardCenter,
    };
  });
  expect(
    Math.abs(identityCenterOffset),
    'hero identity and stack must remain centered below the two hole cards',
  ).toBeLessThanOrEqual(1);
  return anchors;
}

async function expectHeroAnchor(page, baseline) {
  await expect
    .poll(async () => {
      const current = await heroAnchorBounds(page);
      return Object.entries(current).flatMap(([selector, box]) =>
        Object.entries(box)
          .filter(([key, value]) => Math.abs(value - baseline[selector][key]) > 1)
          .map(([key, value]) => ({
            selector,
            key,
            before: baseline[selector][key],
            after: value,
          })),
      );
    })
    .toEqual([]);
}

test('hero status and recent action share fixed left and right slots without lifting cards', async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const size of [
    { width: 320, height: 900 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    await configureViewport(page, size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect(page.locator('.hero-avatar')).toHaveCount(0);
      await expect(page.locator('#hero-turn')).toHaveText('你的回合');
      await expect(page.locator('#hero-last-action')).toBeHidden();
      const baseline = await heroAnchorBounds(page);
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#hero-last-action')).toContainText('跟注');
      await expect(page.locator('#hero-turn')).toHaveText('等待行动');
      await expectHeroAnchor(page, baseline);
      if (size.width === 390 && count === 9)
        await page.screenshot({ path: test.info().outputPath('hero-status-and-action-slots.png') });
      expect(
        await page.evaluate(() => {
          const status = document.querySelector('#hero-turn').getBoundingClientRect();
          const identity = document.querySelector('.hero-identity').getBoundingClientRect();
          const action = document.querySelector('#hero-last-action').getBoundingClientRect();
          return {
            statusBeforeIdentity: status.right <= identity.left + 1,
            actionAfterIdentity: action.left >= identity.right - 1,
            sameRow: status.top < action.bottom && status.bottom > action.top,
            actionUnclipped:
              document.querySelector('#hero-last-action').scrollWidth <=
              document.querySelector('#hero-last-action').clientWidth + 1,
          };
        }),
      ).toEqual({
        statusBeforeIdentity: true,
        actionAfterIdentity: true,
        sameRow: true,
        actionUnclipped: true,
      });
      const flop = await page.evaluate(() => window.qa.respondToHero(0, true));
      expect(flop.board).toHaveLength(3);
      await expect(page.locator('#hero-last-action')).toBeHidden();
      await expectHeroAnchor(page, baseline);
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#hero-last-action')).toHaveText('过牌');
      await expectHeroAnchor(page, baseline);
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#hero-last-action')).toBeHidden();
      await expectHeroAnchor(page, baseline);
    }
  }
});

async function expectThreePlusTwoBoard(page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const board = document.querySelector('#board');
        const cards = [...board.children].map((el) => el.getBoundingClientRect());
        const issues = [];
        if (cards.length !== 5) return ['the five public positions were not retained'];
        const same = (a, b) => Math.abs(a - b) < 1;
        if (!cards.slice(0, 3).every((card) => same(card.top, cards[0].top)))
          issues.push('the first three public positions are not in the first row');
        if (!same(cards[3].top, cards[4].top) || cards[3].top < cards[0].bottom)
          issues.push('the fourth and fifth positions are not in the second row');
        const topCenter = (cards[0].left + cards[2].right) / 2;
        const bottomCenter = (cards[3].left + cards[4].right) / 2;
        if (!same(topCenter, bottomCenter)) issues.push('the second public row is not centered');
        for (let i = 0; i < cards.length; i++)
          for (const other of cards.slice(i + 1))
            if (
              cards[i].left < other.right - 0.5 &&
              cards[i].right > other.left + 0.5 &&
              cards[i].top < other.bottom - 0.5 &&
              cards[i].bottom > other.top + 0.5
            )
              issues.push('public card faces overlap');
        for (const el of board.querySelectorAll('.card-art > text, .card-art > .card-suit-icon')) {
          const mark = el.getBoundingClientRect();
          const face = el.closest('.playing-card').getBoundingClientRect();
          if (
            mark.left < face.left - 1 ||
            mark.right > face.right + 1 ||
            mark.top < face.top - 1 ||
            mark.bottom > face.bottom + 1
          )
            issues.push('public rank or suit is clipped by the full card face');
        }
        return issues;
      }),
    )
    .toEqual([]);
}

test('narrow public cards and undealt slots keep an unobscured centered three-plus-two arrangement', async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const width of [320, 390]) {
    await configureViewport(page, { width, height: 900 });
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect(page.locator('#board > .board-slot')).toHaveCount(5);
      await expectThreePlusTwoBoard(page);
      await page.locator('#call-button').click();
      await page.evaluate(() => {
        window.qa.stop();
        window.qa.respondToHero(0, true);
      });
      await expect(page.locator('#board > .playing-card')).toHaveCount(3);
      await expectThreePlusTwoBoard(page);
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#board > .playing-card')).toHaveCount(4);
      await expectThreePlusTwoBoard(page);
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#board > .playing-card')).toHaveCount(5);
      await expectThreePlusTwoBoard(page);
      if (width === 390 && count === 9)
        await page.screenshot({ path: test.info().outputPath('public-cards-three-plus-two.png') });
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#next-button')).toBeVisible();
      await expectThreePlusTwoBoard(page);
      await page.locator('#next-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#board > .board-slot')).toHaveCount(5);
      await expectThreePlusTwoBoard(page);
    }
  }
});
