import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Browser-only fixtures replay the actual DevTools deal. They never ship in
// the mini-program or installed native bundles.
const directory = path.resolve(process.argv[2] || '.artifacts/wechat-e2e');
const browser = await chromium.launch();
const results = [];
try {
  const defaultNames = [
    'table',
    'settings',
    'player',
    'guide',
    'pots',
    'reset',
    'settlement',
    'review',
    'opponent-review',
    'session-activity',
    ...[5, 6, 7, 8, 9].flatMap((count) =>
      ['settings', 'table', 'settlement', 'review'].map((name) => `${name}-${count}`),
    ),
  ];
  const runtimeReport = JSON.parse(await readFile(path.join(directory, 'report.json')));
  if (!process.argv[4]) {
    expect(
      runtimeReport.status,
      'Only a completed DevTools run can supply the full reference set',
    ).toBe('passed');
    for (const name of defaultNames)
      expect(
        runtimeReport.pages.some((entry) => entry.name === name),
        `${name}: current DevTools capture must exist`,
      ).toBe(true);
  }
  if (runtimeReport.pages.some((entry) => entry.name === 'practice-runout'))
    defaultNames.splice(defaultNames.indexOf('settlement') + 1, 0, 'practice-runout');
  if (runtimeReport.pages.some((entry) => entry.name === 'showdown'))
    defaultNames.splice(defaultNames.indexOf('settlement') + 1, 0, 'showdown');
  for (const name of process.argv[4]?.split(',') || defaultNames) {
    const screen = name === 'practice-runout' ? 'settlement' : name.replace(/-[5-9]$/, '');
    const { game, data } = JSON.parse(await readFile(path.join(directory, name + '-state.json')));
    const capsule = [
      'table',
      'settings',
      'player',
      'settlement',
      'session-activity',
      'showdown',
    ].includes(screen)
      ? 36
      : 0;
    const viewport = {
      width: data.windowWidth,
      height: data.windowHeight - data.topInset - data.bottomInset - capsule,
    };
    const page = await browser.newPage({ viewport, locale: 'zh-CN', deviceScaleFactor: 3 });
    await page.goto(process.argv[3] || 'http://127.0.0.1:4192');
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(
      async ({ game, settings }) => {
        await document.fonts.ready;
        window.qa.loadRecordedGame(game, settings);
      },
      { game, settings: data.settings },
    );
    await page.evaluate((hintText) => {
      const banner = document.querySelector('.hint-banner');
      if (banner) banner.hidden = !hintText;
    }, data.hintText);
    if (['settings', 'player'].includes(screen)) {
      await page.locator('#opponents-button').click();
      await expect(page.locator('#player-count')).toHaveValue(String(data.settings.playerCount));
      if (screen === 'player') await page.locator('[data-profile-preview="haxton"]').click();
    } else if (screen === 'guide') await page.locator('#rules-button').click();
    else if (screen === 'pots') await page.locator('.pot-details-trigger').click();
    else if (screen === 'reset') await page.locator('#reset-button').click();
    else if (['review', 'opponent-review'].includes(screen)) {
      await page.locator('#review-hand-button').click();
      await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
        timeout: 60000,
      });
      if (screen === 'opponent-review') await page.locator('#review-opponents-tab').click();
    } else if (screen === 'session-activity' || screen === 'showdown') {
      // Match the actual scroll anchor. The full simulator window still
      // includes system areas when pageScrollTo clamps at the page bottom.
      const anchor = runtimeReport.pages.find((entry) => entry.name === name)?.components[
        screen === 'showdown' ? '.showdown-stage' : '.practice-panel'
      ];
      await page.locator(screen === 'showdown' ? '#showdown-stage' : '.session-card').evaluate(
        (element, top) => {
          window.scrollTo(0, scrollY + element.getBoundingClientRect().top - top);
        },
        anchor ? anchor.top - data.topInset - capsule : 0,
      );
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
          .map((animation) => animation.finished),
      );
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    if (/^table-[5-9]$/.test(name)) {
      const report = JSON.parse(await readFile(path.join(directory, 'report.json')));
      const miniPage = report.pages.find((entry) => entry.name === name);
      const mapping = {
        '.seat-body': '.seat-profile',
        '.community': '.table-center',
        '.hero': '.hero-area',
        '.felt': '.poker-table',
      };
      const measured = await page.evaluate(
        (mapping) =>
          Object.fromEntries(
            Object.entries(mapping).map(([mini, web]) => {
              const box = document.querySelector(web).getBoundingClientRect();
              return [mini, { left: box.left, top: box.top, width: box.width, height: box.height }];
            }),
          ),
        mapping,
      );
      for (const [selector, web] of Object.entries(measured)) {
        const native = miniPage.components[selector];
        for (const key of ['left', 'top', 'width', 'height']) {
          const value = native[key] - (key === 'top' ? data.topInset + capsule : 0);
          expect(
            Math.abs(value - web[key]),
            `${name} ${selector} ${key}: WeChat ${value}, Web ${web[key]}`,
          ).toBeLessThanOrEqual(3);
        }
      }
    }
    if (screen === 'showdown' || screen === 'pots') {
      const recorded = runtimeReport.pages.find((entry) => entry.name === name).components;
      const mapping =
        screen === 'pots'
          ? {
              '.pot-sheet': '#pot-dialog',
              '.pot-detail-card': '.pot-detail-card',
              '.pot-detail-heading': '.pot-detail-heading',
            }
          : {
              '.showdown-stage': '.showdown-stage',
              '.showdown-player': '.showdown-player',
              '.winning-cards': '.winning-cards',
            };
      const measured = await page.evaluate(
        (mapping) =>
          Object.fromEntries(
            Object.entries(mapping).map(([selector, webSelector]) => {
              const r = document.querySelector(webSelector).getBoundingClientRect();
              return [selector, { left: r.left, top: r.top, width: r.width, height: r.height }];
            }),
          ),
        mapping,
      );
      for (const [selector, box] of Object.entries(measured))
        for (const field of ['left', 'top', 'width', 'height']) {
          const actual =
            recorded[selector][field] - (field === 'top' ? data.topInset + capsule : 0);
          expect(
            Math.abs(actual - box[field]),
            `${name} ${selector} ${field}: WeChat ${actual}, Web ${box[field]}`,
          ).toBeLessThanOrEqual(3);
        }
    }
    if (screen === 'settlement') {
      const recorded = runtimeReport.pages.find((entry) => entry.name === name).components;
      const box = await page.locator('#restart-hand-button').boundingBox();
      expect(box, 'Replay must be present in the corresponding Web state').toBeTruthy();
      for (const [field, webField] of Object.entries({
        left: 'x',
        top: 'y',
        width: 'width',
        height: 'height',
      })) {
        const actual =
          recorded['.retry-button'][field] - (field === 'top' ? data.topInset + capsule : 0);
        expect(
          Math.abs(actual - box[webField]),
          `${name}: replay button ${field}`,
        ).toBeLessThanOrEqual(3);
      }
    }
    if (screen === 'review') {
      const recorded = runtimeReport.pages.find((entry) => entry.name === name).components[
        '.review-step'
      ];
      const box = await page.locator('#review-hero-panel .review-step').first().boundingBox();
      expect(box).toBeTruthy();
      for (const [field, webField] of Object.entries({
        left: 'x',
        top: 'y',
        width: 'width',
        height: 'height',
      })) {
        const actual = recorded[field] - (field === 'top' ? data.topInset : 0);
        expect(
          Math.abs(actual - box[webField]),
          `${name}: decision card ${field}`,
        ).toBeLessThanOrEqual(3);
      }
    }
    await page.screenshot({ path: path.join(directory, name + '-web.png') });
    results.push({ name, viewport, sameDeal: true, capsuleReserved: capsule });
    await page.close();
    console.log('WEB', name);
  }
  await writeFile(path.join(directory, 'web-reference.json'), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
