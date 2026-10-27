import { test, expect, webkit } from '@playwright/test';

test('Web and WebKit share the wager slider appearance and keyboard interaction', async ({
  page,
  baseURL,
}) => {
  const browser = await webkit.launch();
  try {
    const native = await browser.newPage({ viewport: { width: 393, height: 759 }, baseURL });
    const styles = [];
    for (const target of [page, native]) {
      await target.goto('/');
      await target.waitForFunction(() => !!window.qa);
      await target.evaluate(() => window.qa.heroTurn(8));
      const slider = target.locator('#bet-slider');
      await expect(slider).toBeEnabled();
      const before = Number(await slider.inputValue());
      await slider.focus();
      await slider.press('ArrowRight');
      await expect(slider).toHaveValue(String(before + 25));
      styles.push(
        await slider.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            appearance: style.appearance,
            height: style.height,
            background: style.backgroundColor,
          };
        }),
      );
    }
    expect(styles[0].appearance).toBe('none');
    expect(styles[1]).toEqual(styles[0]);
  } finally {
    await browser.close();
  }
});

async function prepare(page, native) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(async (native) => {
    window.qa.stop();
    const root = document.documentElement;
    root.classList.toggle('native-app', native);
    root.style.setProperty('--safe-area-inset-top', native ? '59px' : '0px');
    root.style.setProperty('--safe-area-inset-bottom', native ? '34px' : '0px');
    await document.fonts.ready;
    window.qa.scene('Ah Ad', 'As Ks Qd Jh 9c', {
      count: 8,
      totals: [100, 0, 100, 0, 0, 0, 0, 0],
      folded: [1, 3, 4, 5, 6, 7],
      otherHoles: { 2: 'Kh Kc' },
    });
    window.dispatchEvent(new Event('resize'));
  }, native);
  await expect(page.locator('#review-hand-button')).toBeVisible();
  await expect(page.locator('#showdown-stage')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

function geometry() {
  const table = document.querySelector('.table-viewport').getBoundingClientRect();
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left - table.left, top: r.top - table.top, width: r.width, height: r.height };
  };
  const dock = document.querySelector('.action-dock').getBoundingClientRect();
  const showdown = document.querySelector('#showdown-stage').getBoundingClientRect();
  return {
    table: { width: table.width, height: table.height },
    profiles: [...document.querySelectorAll('.seat-profile')].map(box),
    board: box(document.querySelector('#board')),
    seam: showdown.top - dock.bottom,
    dockHeight: dock.height,
    fonts: ['Manrope', 'Noto Sans SC'].map((name) =>
      [...document.fonts].some(
        (face) => face.family.replaceAll('"', '') === name && face.status === 'loaded',
      ),
    ),
  };
}

test('Chromium Web and WebKit native use the same available viewport and settlement spacing', async ({
  page,
  baseURL,
}) => {
  // An iPhone's 852 CSS px includes 59px status and 34px gesture areas. Compare
  // with the browser's 759px content viewport, not two different usable heights.
  await page.setViewportSize({ width: 393, height: 759 });
  await prepare(page, false);
  const browser = await webkit.launch();
  try {
    const native = await browser.newPage({
      viewport: { width: 393, height: 852 },
      locale: 'zh-CN',
      baseURL,
    });
    await prepare(native, true);
    const web = await page.evaluate(geometry);
    const app = await native.evaluate(geometry);
    expect(web.fonts).toEqual([true, true]);
    expect(app.fonts).toEqual([true, true]);
    expect(Math.abs(web.seam)).toBeLessThanOrEqual(1);
    expect(Math.abs(app.seam)).toBeLessThanOrEqual(1);
    expect(app.dockHeight).toBeLessThanOrEqual(65);
    for (const key of ['width', 'height'])
      expect(Math.abs(app.table[key] - web.table[key])).toBeLessThanOrEqual(1);
    for (const [index, profile] of web.profiles.entries())
      for (const key of ['left', 'top', 'width', 'height'])
        expect(
          Math.abs(app.profiles[index][key] - profile[key]),
          `seat ${index} ${key}`,
        ).toBeLessThanOrEqual(2);
  } finally {
    await browser.close();
  }
});

for (const viewport of [
  { width: 393, height: 759, top: 59, bottom: 34 },
  { width: 360, height: 710, top: 0, bottom: 0 },
]) {
  test(`every dialog follows Web at ${viewport.width}x${viewport.height} usable pixels`, async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await prepare(page, false);
    const browser = await webkit.launch();
    try {
      const native = await browser.newPage({
        viewport: {
          width: viewport.width,
          height: viewport.height + viewport.top + viewport.bottom,
        },
        locale: 'zh-CN',
        baseURL,
      });
      await prepare(native, true);
      await native.evaluate(({ top, bottom }) => {
        document.documentElement.style.setProperty('--safe-area-inset-top', top + 'px');
        document.documentElement.style.setProperty('--safe-area-inset-bottom', bottom + 'px');
      }, viewport);
      for (const id of ['rules', 'pot', 'reset', 'opponents', 'review']) {
        const boxes = [];
        for (const [target, isNative] of [
          [page, false],
          [native, true],
        ]) {
          if (id === 'review') {
            await target.evaluate(() => {
              window.qa.reviewClosingCall(false);
              document.querySelector('#review-hand-button').click();
            });
            await expect(target.locator('#review-dialog')).toHaveAttribute(
              'data-analysis-status',
              'done',
              { timeout: 120000 },
            );
          } else
            await target.evaluate(
              (id) => document.querySelector('#' + id + '-dialog').showModal(),
              id,
            );
          await target.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          const box = await target.evaluate(
            ({ id, top }) => {
              const dialog = document.querySelector('#' + id + '-dialog'),
                r = dialog.getBoundingClientRect();
              return {
                left: r.left,
                top: r.top - top,
                width: r.width,
                height: r.height,
                padding: getComputedStyle(dialog).padding,
              };
            },
            { id, top: isNative ? viewport.top : 0 },
          );
          boxes.push(box);
          await testInfo.attach(`${id}-${isNative ? 'webkit-native' : 'web'}-${viewport.width}`, {
            body: await target.screenshot(),
            contentType: 'image/png',
          });
          await target.evaluate((id) => document.querySelector('#' + id + '-dialog').close(), id);
        }
        for (const key of ['left', 'top', 'width', 'height'])
          expect(Math.abs(boxes[0][key] - boxes[1][key]), `${id} ${key}`).toBeLessThanOrEqual(2);
        expect(boxes[0].padding).toEqual(boxes[1].padding);
      }
    } finally {
      await browser.close();
    }
  });
}
