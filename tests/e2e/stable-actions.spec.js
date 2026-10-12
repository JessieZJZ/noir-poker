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
    window.dispatchEvent(new Event('resize'));
    root.style.setProperty('--safe-area-inset-top', `${top}px`);
    root.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
    window.scrollTo(0, 0);
  }, insets);
}

async function startFrameCapture(page) {
  await flushLayout(page);
  return page.evaluate(() => {
    const read = () => ({
      phase: document.querySelector('#arena').classList.contains('is-done') ? 'settled' : 'live',
      ...Object.fromEntries(
        [
          '.table-viewport',
          '#arena',
          '.poker-table',
          '.table-center',
          '#board',
          '#hero-cards',
          '.hero-identity',
          ...[...document.querySelectorAll('.seat')].map(
            (seat) => `.seat-${seat.dataset.player} .seat-profile`,
          ),
        ].map((selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return [
            selector,
            { top: r.top, height: r.height, bottom: r.bottom, left: r.left, width: r.width },
          ];
        }),
      ),
    });
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
  const settled = frames.find((frame) => frame.phase === 'settled');
  if (settled && initial.phase !== 'settled') {
    expect(
      Math.abs(settled['.table-viewport'].top - initial['.table-viewport'].top),
    ).toBeLessThanOrEqual(1);
    expect(settled['.table-viewport'].height).toBeGreaterThan(
      initial['.table-viewport'].height + 40,
    );
  }
  const shifts = frames.flatMap((frame, index) => {
    const baseline = frame.phase === initial.phase ? initial : settled;
    return Object.entries(frame)
      .filter(([selector]) => selector !== 'phase')
      .flatMap(([selector, box]) =>
        Object.entries(box)
          .filter(([key, value]) => Math.abs(value - baseline[selector][key]) > 1)
          .map(([key, value]) => ({
            frame: index,
            phase: frame.phase,
            selector,
            key,
            initial: baseline[selector][key],
            value,
          })),
      );
  });
  expect(
    shifts,
    'Each live or settled phase retains its geometry; retry restores the live table',
  ).toEqual([]);
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
            if (!fits(next.left, inner.left) || !fits(review.right, inner.right))
              issues.push('settled row does not fill the padded panel');
            if (
              ![retry, review].every(
                (button) =>
                  fits(button.top, next.top) &&
                  fits(button.bottom, next.bottom) &&
                  fits(button.width, next.width),
              )
            )
              issues.push('settled buttons do not share one equal-width row');
            if (!fits(next.top, inner.top) || !fits(review.bottom, inner.bottom))
              issues.push('settled row has unexpected vertical padding');
            if (dock.height > 65 + bottomInset) issues.push('settled controls did not shrink');
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

test('fold, expedited settlement, retry and next hand fill the first screen and keep each phase stable while the dock collapses to one row', async ({
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
    if (size.width > size.height) {
      await expect(page.locator('#orientation-dialog')).toBeVisible();
      continue;
    }
    for (const count of [5, 6, 9]) {
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
      await expect
        .poll(() => page.evaluate(() => window.qa.state().phase), { timeout: 15000 })
        .toBe('done');
      await expect(page.locator('#next-button')).toBeVisible();
      await expectDockLayout(page, 'settled', insets.bottom);
      if (size.width === 390 && count === 9)
        await page.screenshot({
          path: test.info().outputPath('settled-single-row-buttons.png'),
        });
      await page.locator('#restart-hand-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#replay-label')).toContainText('重打');
      await expectDockLayout(page, 'live', insets.bottom);
      await page.locator('#fold-button').click();
      await page.evaluate(() => window.qa.stop());
      await page.locator('#continue-deal-button').click();
      await expect
        .poll(() => page.evaluate(() => window.qa.state().phase), { timeout: 15000 })
        .toBe('done');
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

test('SE streets, real expedited bots and card peeks preserve the fitted arena and public anchors', async ({
  page,
}) => {
  test.setTimeout(60000);
  await configureViewport(page, { width: 375, height: 667 });
  for (const count of [6, 9]) {
    await page.evaluate((count) => window.qa.heroTurn(count), count);
    const initial = await startFrameCapture(page);
    await page.locator('#fold-button').click();
    await page.evaluate(() => window.qa.stop());
    await page.locator('#continue-deal-button').click();
    await expect.poll(() => page.evaluate(() => window.qa.state().phase)).toBe('done');
    for (const button of await page.locator('.seat-peek').all()) {
      await button.click();
      await button.click();
    }
    await expectStableCapturedFrames(page, initial);
    await page.screenshot({ path: test.info().outputPath(`se-expedited-${count}.png`) });

    await page.evaluate((count) => window.qa.publicBoard(count), count);
    const flop = await startFrameCapture(page);
    for (let street = 0; street < 3; street++)
      await page.evaluate(() => {
        window.qa.checkRest();
        window.qa.finish();
      });
    await expectStableCapturedFrames(page, flop);
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

test('hero identity keeps chips beside the position and its recent action in a centered bottom row', async ({
  page,
}) => {
  test.setTimeout(90000);
  const callAndPauseBots = async () => {
    // Cancel in the click task, before a slow driver round trip can allow
    // a real bot timer to change this deterministic layout fixture.
    await page.evaluate(() => {
      document.querySelector('#call-button').addEventListener('click', () => window.qa.stop(), {
        once: true,
      });
    });
    await page.locator('#call-button').click();
  };
  for (const size of [
    { width: 320, height: 900 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    await configureViewport(page, size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect(page.locator('.hero-avatar')).toHaveCount(0);
      await expect(page.locator('#hero-turn')).toHaveCount(0);
      await expect(page.locator('#hero-last-action')).toBeHidden();
      const baseline = await heroAnchorBounds(page);
      await callAndPauseBots();
      await expect(page.locator('#hero-last-action')).toContainText('跟注');
      await expect(page.locator('#fold-button')).toBeDisabled();
      await expectHeroAnchor(page, baseline);
      if (size.width === 390 && count === 9)
        await page.screenshot({ path: test.info().outputPath('hero-status-and-action-slots.png') });
      expect(
        await page.evaluate(() => {
          const identity = document.querySelector('.hero-identity').getBoundingClientRect();
          const action = document.querySelector('#hero-last-action').getBoundingClientRect();
          return {
            actionBelowIdentity: action.top >= identity.bottom - 1,
            centered: Math.abs(action.left + action.right - identity.left - identity.right) <= 2,
            nearby: action.top - identity.bottom <= 7,
            chipsBesidePosition: (() => {
              const stack = document.querySelector('#hero-stack').getBoundingClientRect();
              const position = document.querySelector('#hero-position').getBoundingClientRect();
              return (
                stack.left >= position.right &&
                stack.top < position.bottom &&
                stack.bottom > position.top
              );
            })(),
            actionUnclipped:
              document.querySelector('#hero-last-action').scrollWidth <=
              document.querySelector('#hero-last-action').clientWidth + 1,
          };
        }),
      ).toEqual({
        actionBelowIdentity: true,
        centered: true,
        nearby: true,
        chipsBesidePosition: true,
        actionUnclipped: true,
      });
      const flop = await page.evaluate(() => window.qa.respondToHero(0, true));
      expect(flop.board).toHaveLength(3);
      await expect(page.locator('#hero-last-action')).toBeHidden();
      await expectHeroAnchor(page, baseline);
      await callAndPauseBots();
      await expect(page.locator('#hero-last-action')).toHaveText('过牌');
      await expectHeroAnchor(page, baseline);
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#hero-last-action')).toBeHidden();
      await expectHeroAnchor(page, baseline);
    }
  }
});

async function expectAdaptiveBoard(page) {
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
        const twoRows = !same(cards[3].top, cards[0].top);
        if (twoRows && (!same(cards[3].top, cards[4].top) || cards[3].top < cards[0].bottom))
          issues.push('the fourth and fifth positions are not in the second row');
        if (!twoRows && !cards.every((card) => same(card.top, cards[0].top)))
          issues.push('a single row must contain all five cards');
        const count = Number(document.querySelector('#arena').dataset.playerCount);
        // Waist seats also use the central corridor on a five-player table.
        // The fitted footprint, rather than a fixed phone width, determines
        // when a denser table needs the two-row fallback.
        if (innerWidth > 600 && twoRows)
          issues.push('cards wrapped despite ample room in the middle');
        const topCenter = (cards[0].left + cards[2].right) / 2;
        const bottomCenter = (cards[3].left + cards[4].right) / 2;
        if (twoRows && !same(topCenter, bottomCenter))
          issues.push('the second public row is not centered');
        for (let i = 0; i < cards.length; i++)
          for (const other of cards.slice(i + 1))
            if (
              cards[i].left < other.right - 0.5 &&
              cards[i].right > other.left + 0.5 &&
              cards[i].top < other.bottom - 0.5 &&
              cards[i].bottom > other.top + 0.5
            )
              issues.push('public card faces overlap');
        for (const el of board.querySelectorAll(
          '.card-art .card-rank, .card-art > .card-suit-icon',
        )) {
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

test('public cards prefer five in one row and fall back to centered three-plus-two when crowded', async ({
  page,
}) => {
  test.setTimeout(90000);
  let sawFallback = false;
  for (const width of [320, 375, 390, 440, 600, 768]) {
    await configureViewport(page, { width, height: width === 320 ? 1020 : 900 });
    for (const count of [5, 8, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect(page.locator('#board > .board-slot')).toHaveCount(5);
      await expectAdaptiveBoard(page);
      sawFallback ||= await page
        .locator('#arena')
        .evaluate((el) => el.classList.contains('public-two-rows'));
      await page.locator('#call-button').click();
      await page.evaluate(() => {
        window.qa.stop();
        window.qa.respondToHero(0, true);
      });
      await expect(page.locator('#board > .playing-card')).toHaveCount(3);
      await expectAdaptiveBoard(page);
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#board > .playing-card')).toHaveCount(4);
      await expectAdaptiveBoard(page);
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#board > .playing-card')).toHaveCount(5);
      await expectAdaptiveBoard(page);
      if (width === 390 && count === 9)
        await page.screenshot({ path: test.info().outputPath('public-cards-three-plus-two.png') });
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#next-button')).toBeVisible();
      await expectAdaptiveBoard(page);
      await page.locator('#next-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#board > .board-slot')).toHaveCount(5);
      await expectAdaptiveBoard(page);
    }
  }
  expect(sawFallback, 'a crowded table must exercise the centered two-row fallback').toBe(true);
});
