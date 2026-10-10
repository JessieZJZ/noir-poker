import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openSettings, closeSettings } from './settings-helpers.js';

const cases = [
  { width: 375, height: 667, publicWidth: 48, heroWidth: 52 },
  { width: 440, height: 956, publicWidth: 54, heroWidth: 52 },
  { width: 427, height: 952, publicWidth: 54, heroWidth: 52 },
  { width: 1032, height: 1376, publicWidth: 60, heroWidth: 60 },
  { width: 1280, height: 900, publicWidth: 60, heroWidth: 60 },
];

async function settleLayout(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function geometry(page) {
  await settleLayout(page);
  return page.evaluate(() => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return {
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const arena = document.querySelector('#arena');
    const scale = arena.getBoundingClientRect().width / arena.offsetWidth;
    const visible = (element) =>
      !element.hidden &&
      getComputedStyle(element).display !== 'none' &&
      element.getBoundingClientRect().height > 0;
    const cards = [...document.querySelectorAll('#hero-cards > .playing-card')].map(rect);
    const heroCards = {
      top: Math.min(...cards.map((card) => card.top)),
      left: Math.min(...cards.map((card) => card.left)),
      right: Math.max(...cards.map((card) => card.right)),
      bottom: Math.max(...cards.map((card) => card.bottom)),
      widths: [...document.querySelectorAll('#hero-cards > .playing-card')].map(
        (card) => card.offsetWidth * scale,
      ),
    };
    return {
      viewport: { width: innerWidth, height: innerHeight, scrollY },
      table: rect(document.querySelector('.table-viewport')),
      arena: rect(arena),
      felt: rect(document.querySelector('.poker-table')),
      identity: rect(document.querySelector('.hero-identity')),
      heroCards,
      scale,
      public: [...document.querySelector('#board').children].map((card) => ({
        ...rect(card),
        faceWidth: card.offsetWidth * scale,
      })),
      publicParts: [...document.querySelectorAll('.pot, #board, #board-caption')]
        .filter(visible)
        .map((element) => ({ ...rect(element), label: element.id || element.className })),
      seatParts: [
        ...document.querySelectorAll(
          '.seat .mini-cards, .seat-profile, .seat .seat-action, .seat .hand-rank',
        ),
      ]
        .filter(visible)
        .map((element) => ({
          ...rect(element),
          label: `${element.closest('.seat').dataset.player} ${element.className}`,
        })),
      actionState: document.querySelector('.game-surface').dataset.actionState,
      tableScroll: document.querySelector('.table-viewport').scrollTop,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function expectGeometry(page, target) {
  await expect
    .poll(async () => {
      const g = await geometry(page);
      const issues = [];
      const center = (r) => (r.left + r.right) / 2;
      const overlap = (a, b) =>
        a.left < b.right - 0.5 &&
        a.right > b.left + 0.5 &&
        a.top < b.bottom - 0.5 &&
        a.bottom > b.top + 0.5;
      if (Math.abs(center(g.heroCards) - center(g.identity)) > 1)
        issues.push('hero identity is not centered under its visible cards');
      if (Math.abs(center(g.identity) - center(g.felt)) > 1)
        issues.push('hero identity is not centered on the felt');
      const heroGap = g.identity.top - g.heroCards.bottom;
      if (heroGap < -1 || heroGap > 16)
        issues.push(`hero identity gap ${heroGap.toFixed(1)} is not compact`);
      if (g.heroCards.widths.some((width) => width < target.heroWidth - 0.5))
        issues.push(`hero faces below ${target.heroWidth}px`);
      if (g.public.length !== 5) issues.push('all five public positions must remain reserved');
      for (const [index, card] of g.public.entries()) {
        if (card.faceWidth < target.publicWidth - 0.5)
          issues.push(`public face ${card.faceWidth.toFixed(1)} below ${target.publicWidth}px`);
        if (g.public.slice(index + 1).some((other) => overlap(card, other)))
          issues.push('public card faces overlap');
      }
      for (const part of g.seatParts) {
        if (
          part.left < g.table.left - 1 ||
          part.right > g.table.right + 1 ||
          part.top < g.table.top - 1 ||
          part.bottom > g.table.bottom + 1
        )
          issues.push(`seat ${part.label} leaves the visible table`);
        for (const publicPart of g.publicParts)
          if (overlap(part, publicPart))
            issues.push(`seat ${part.label} covers ${publicPart.label}`);
      }
      for (const publicPart of g.publicParts)
        if (overlap(publicPart, g.heroCards))
          issues.push(`${publicPart.label} reaches the hero card row`);
      const rows = g.public.reduce((rows, card) => {
        const row = rows.find((row) => Math.abs(row.top - card.top) < 1);
        if (row) row.cards.push(card);
        else rows.push({ top: card.top, cards: [card] });
        return rows;
      }, []);
      const expectedRows = target.width <= 900 ? [3, 2] : [5];
      if (JSON.stringify(rows.map((row) => row.cards.length)) !== JSON.stringify(expectedRows))
        issues.push('public cards do not use the expected non-overlapping rows');
      for (const row of rows)
        if (Math.abs((row.cards[0].left + row.cards.at(-1).right) / 2 - center(g.felt)) > 1)
          issues.push('a public row is not centered on the felt');
      if (g.arena.width < g.table.width * 0.97 || g.felt.width < g.table.width * 0.9)
        issues.push('the table shrinks into an unnecessarily narrow central strip');
      if (g.felt.height < g.table.height * 0.75)
        issues.push('the felt leaves excessive unused vertical space');
      if (target.width <= 900 && Math.abs(g.scale - 1) > 0.005)
        issues.push('portrait mode scales down the entire arena');
      if (g.tableScroll !== 0 || g.horizontalOverflow)
        issues.push('the table scrolls independently or the page overflows horizontally');
      return issues;
    })
    .toEqual([]);
  await expect(page.locator('#hero-turn')).toHaveCount(0);
  return geometry(page);
}

async function expectActionRow(page, selectors) {
  await expect
    .poll(() =>
      page.evaluate((selectors) => {
        const live = selectors.includes('#raise-button');
        const panel = document.querySelector(live ? '.action-buttons' : '#action-panel');
        const panelBox = panel.getBoundingClientRect();
        const style = getComputedStyle(panel);
        const left = panelBox.left + parseFloat(style.paddingLeft);
        const right = panelBox.right - parseFloat(style.paddingRight);
        const buttons = selectors.map((selector) => {
          const button = document.querySelector(selector);
          const r = button.getBoundingClientRect();
          const lineCenters = [];
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            for (const line of range.getClientRects())
              if (line.width > 1 && line.height > 1) lineCenters.push((line.top + line.bottom) / 2);
          }
          return {
            id: button.id,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            wraps: lineCenters.length && Math.max(...lineCenters) - Math.min(...lineCenters) > 8,
            clips: button.scrollWidth > button.clientWidth + 1,
          };
        });
        const issues = [];
        if (Math.abs(buttons[0].left - left) > 1 || Math.abs(buttons.at(-1).right - right) > 1)
          issues.push('buttons do not fill the available row');
        for (const [index, button] of buttons.entries()) {
          if (
            Math.abs(button.top - buttons[0].top) > 1 ||
            Math.abs(button.bottom - buttons[0].bottom) > 1
          )
            issues.push(`${button.id} is on a different row`);
          if ((!live || innerWidth <= 900) && Math.abs(button.width - buttons[0].width) > 1)
            issues.push(`${button.id} does not have equal row width`);
          if (button.height < 44 || button.wraps || button.clips)
            issues.push(`${button.id} has a small target or clipped/wrapped label`);
          if (index && button.left < buttons[index - 1].right) issues.push('buttons overlap');
        }
        return issues;
      }, selectors),
    )
    .toEqual([]);
}

async function expectCompactWagers(page, target) {
  if (target.width > 900) return;
  await expect
    .poll(() =>
      page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const slider = box('#bet-slider');
        const presets = box('.bet-presets');
        const dock = box('.action-dock');
        const safeArea =
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom'),
          ) || 0;
        const issues = [];
        if (
          slider.right > presets.left + 1 ||
          Math.abs((slider.top + slider.bottom - presets.top - presets.bottom) / 2) > 1
        )
          issues.push('the slider and all four wager presets do not share one row');
        if (slider.width < 64 || presets.width < slider.width * 1.5)
          issues.push('the compact wager row does not reserve enough width for its presets');
        if (document.querySelectorAll('.bet-presets button').length !== 4)
          issues.push('a wager preset was removed to save space');
        if (dock.height > 116 + safeArea + 1)
          issues.push('live controls consume the compact table height budget');
        for (const selector of ['#raise-button', '#fold-button', '#call-button']) {
          const button = box(selector);
          if (button.top < 0 || button.bottom > innerHeight - safeArea + 1)
            issues.push(`${selector} does not fit the first screen above the native safe area`);
        }
        return issues;
      }),
    )
    .toEqual([]);
}

async function buttonBoxes(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ['raise', 'fold', 'call'].map((action) => {
        const button = document.querySelector(`#${action}-button`);
        const r = button.getBoundingClientRect();
        return [
          action,
          {
            top: r.top + scrollY,
            left: r.left + scrollX,
            width: r.width,
            height: r.height,
            transform: getComputedStyle(button).transform,
            background: getComputedStyle(button).backgroundColor,
            opacity: getComputedStyle(button).opacity,
          },
        ];
      }),
    ),
  );
}

async function expectNoButtonMotion(page, before) {
  await expect
    .poll(async () => {
      const now = await buttonBoxes(page);
      const changes = [];
      for (const [action, current] of Object.entries(now)) {
        if (current.transform !== 'none') changes.push(`${action} has an interaction transform`);
        for (const key of ['top', 'left', 'width', 'height'])
          if (Math.abs(current[key] - before[action][key]) > 0.5)
            changes.push(`${action}.${key} moved`);
      }
      return changes;
    })
    .toEqual([]);
}

async function startTableCapture(page) {
  await settleLayout(page);
  return page.evaluate(() => {
    const read = () =>
      Object.fromEntries(
        ['.table-viewport', '#arena', '.poker-table'].map((selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return [
            selector,
            { top: r.top + scrollY, left: r.left + scrollX, width: r.width, height: r.height },
          ];
        }),
      );
    const capture = { initial: read(), frames: [], frame: null };
    const sample = () => {
      capture.frames.push(read());
      capture.frame = requestAnimationFrame(sample);
    };
    capture.frame = requestAnimationFrame(sample);
    window.responsiveTableCapture = capture;
    return capture.initial;
  });
}

async function expectStableTableFrames(page, initial) {
  await settleLayout(page);
  const frames = await page.evaluate(() => {
    const capture = window.responsiveTableCapture;
    cancelAnimationFrame(capture.frame);
    delete window.responsiveTableCapture;
    return capture.frames;
  });
  expect(frames.length).toBeGreaterThan(1);
  for (const frame of frames)
    for (const [selector, bounds] of Object.entries(frame))
      for (const [key, value] of Object.entries(bounds))
        expect(
          Math.abs(value - initial[selector][key]),
          `${selector}.${key} flashes after fold/settlement`,
        ).toBeLessThanOrEqual(1);
}

async function savePassingScreenshot(page, info, name, evidence) {
  const label = `responsive-${name}`;
  await page.screenshot({
    path: info.outputPath(`${label}.png`),
    fullPage: evidence.viewport.width > 900,
  });
  await writeFile(
    info.outputPath(`${label}.json`),
    JSON.stringify(
      {
        case: name,
        status: 'passed',
        project: info.project.name,
        evidence,
      },
      null,
      2,
    ) + '\n',
  );
}

for (const target of cases) {
  test(`${target.width}x${target.height} keeps 5–9 seat cards centered, readable and stable`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: target.width, height: target.height });
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
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((count) => {
        window.qa.publicBoard(count);
        window.qa.respondToHero();
      }, count);
      await expect(page.locator('#call-button')).toBeEnabled();
      await expect(page.locator('.game-surface')).toHaveAttribute('data-action-state', 'ready');
      const live = await expectGeometry(page, target);
      await expectActionRow(page, ['#raise-button', '#fold-button', '#call-button']);
      await expectCompactWagers(page, target);
      const before = await buttonBoxes(page);
      expect(Object.values(before).every((button) => button.opacity === '1')).toBe(true);
      for (const action of ['raise', 'fold', 'call']) {
        await page.locator(`#${action}-button`).hover();
        await expectNoButtonMotion(page, before);
      }
      const raised = await page.locator('#raise-button').boundingBox();
      await page.mouse.move(raised.x + raised.width / 2, raised.y + raised.height / 2);
      await page.mouse.down();
      await expectNoButtonMotion(page, before);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await savePassingScreenshot(
        page,
        info,
        `${target.width}x${target.height}-${count}-ready`,
        live,
      );
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#call-button')).toBeDisabled();
      await expect(page.locator('.game-surface')).toHaveAttribute('data-action-state', 'waiting');
      const disabled = await buttonBoxes(page);
      expect(disabled.call.background).not.toBe(before.call.background);
      expect(Object.values(disabled).every((button) => button.opacity === '1')).toBe(true);
      for (const action of ['raise', 'fold', 'call']) {
        await page.locator(`#${action}-button`).hover({ force: true });
        await expectNoButtonMotion(page, before);
      }
      await page.evaluate(() => window.qa.respondToHero(0, true));
      await expect(page.locator('#fold-button')).toBeEnabled();
      const initial = await startTableCapture(page);
      await page.locator('#fold-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('.game-surface')).toHaveAttribute('data-action-state', 'folded');
      await expectActionRow(page, ['#continue-deal-button']);
      const folded = await expectGeometry(page, target);
      await savePassingScreenshot(
        page,
        info,
        `${target.width}x${target.height}-${count}-folded`,
        folded,
      );
      await page.locator('#continue-deal-button').click();
      await expect.poll(() => page.evaluate(() => window.noir.getState().phase)).toBe('done');
      await expect(page.locator('.game-surface')).toHaveAttribute('data-action-state', 'settled');
      await expectActionRow(page, ['#next-button', '#restart-hand-button', '#review-hand-button']);
      const settled = await expectGeometry(page, target);
      await expectStableTableFrames(page, initial);
      await savePassingScreenshot(
        page,
        info,
        `${target.width}x${target.height}-${count}-settled`,
        settled,
      );
    }
  });
}
