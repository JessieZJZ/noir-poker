import { test, expect } from '@playwright/test';

async function start(page, locale = 'zh-CN') {
  await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.recordsStart({ count: 5 });
    window.qa.stop();
    return document.fonts.ready;
  });
}
async function holdMouse(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
}

test('a short, fully visible style opens its full name from an expanded target without selecting text', async ({
  page,
}) => {
  await start(page);
  const label = page.locator('#seats .seat-style-label').first();
  await expect(label).toHaveAttribute('data-full-name', '均衡');
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const r = await label.boundingBox();
  const point = { x: r.x - 6, y: r.y + r.height / 2 };
  expect(
    await label.evaluate(
      (el, point) => !el.contains(document.elementFromPoint(point.x, point.y)),
      point,
    ),
  ).toBe(true);
  await holdMouse(page, point);
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText('均衡');
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  await page.screenshot({ path: test.info().outputPath('expanded-style-target.png') });
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await label.focus();
  await page.keyboard.press('Enter');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText('均衡');
});

test('full style names follow the active language and context menus are suppressed', async ({
  page,
}) => {
  await start(page, 'en');
  const label = page.locator('#seats .seat-style-label').first();
  await expect(label).toHaveAttribute('data-full-name', 'Balanced');
  const r = await label.boundingBox();
  await holdMouse(page, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
  await expect(page.getByRole('tooltip')).toHaveText('Balanced');
  expect(
    await label.evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
});

test('unrelated automatic scrolling does not cancel a style hold, while scrolling its table does', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const hint = document.createElement('div');
    hint.id = 'tooltip-scroll-probe';
    hint.style.cssText =
      'position:fixed;left:0;bottom:0;width:100px;height:10px;overflow:auto;white-space:nowrap';
    hint.textContent = '滚动中的牌桌提示 '.repeat(80);
    document.body.append(hint);
    window.__tooltipHintScroll = setInterval(() => {
      hint.scrollLeft = (hint.scrollLeft + 3) % 300;
    }, 16);
  });
  const label = page.locator('#seats .seat-style-label').first();
  const r = await label.boundingBox();
  await holdMouse(page, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(
    await page.locator('#tooltip-scroll-probe').evaluate((el) => el.scrollLeft),
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    clearInterval(window.__tooltipHintScroll);
    document.querySelector('#arena').dispatchEvent(new Event('scroll'));
  });
  await expect(page.getByRole('tooltip')).toBeHidden();
});

test('a real touch hold opens the style while a moving touch cancels it', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await start(page);
    const label = page.locator('#seats .seat-style-label').first();
    const r = await label.boundingBox();
    const x = r.x + r.width + 5,
      y = r.y + r.height / 2;
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    await touch('touchStart', [{ x, y }]);
    await page.waitForTimeout(550);
    await touch('touchEnd', []);
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('均衡');
    expect(await page.evaluate(() => getSelection().toString())).toBe('');
    await page.screenshot({ path: test.info().outputPath('touch-style-tooltip.png') });
    await page.touchscreen.tap(195, 100);
    await expect(tooltip).toBeHidden();
    await touch('touchStart', [{ x, y }]);
    await touch('touchMove', [{ x, y: y + 24 }]);
    await page.waitForTimeout(550);
    await touch('touchEnd', []);
    await expect(tooltip).toBeHidden();
  } finally {
    await context.close();
  }
});
