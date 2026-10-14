import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { withCenteredNativeClicks } from '../native/position-target.mjs';

let browser, page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 402, height: 874 } });
});
after(async () => browser?.close());

// This is the standard driver's existing nearest/menu positioning followed
// by a real browser pointer click. The helper must leave this delegation intact.
async function driverClick(selector) {
  const point = await page.evaluate((selector) => {
    const element = document.querySelector(selector),
      menu = element.closest('.dropdown-menu');
    if (menu) {
      const row = element.getBoundingClientRect(),
        box = menu.getBoundingClientRect();
      if (row.top < box.top) menu.scrollTop -= box.top - row.top;
      if (row.bottom > box.bottom) menu.scrollTop += row.bottom - box.bottom;
    } else element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  await page.mouse.click(point.x, point.y);
  return point;
}

function app(click = driverClick) {
  return {
    evaluate: (fn, value) => page.evaluate(fn, value),
    async waitFor(predicate) {
      if (await predicate()) return true;
      throw new Error('Target did not become ready');
    },
    click,
  };
}

test('centering a page-tail button keeps the actual pointer above the home area and below a fixed header', async () => {
  await page.setContent(`
    <style>
      body { margin: 0; }
      header { position: fixed; inset: 0 0 auto; height: 88px; background: black; z-index: 2; }
      .home { position: fixed; inset: auto 0 0; height: 34px; background: black; z-index: 2; }
      .before { height: 1800px; } .after { height: 600px; }
      button { height: 40px; width: 160px; margin-left: 100px; }
    </style>
    <header></header><div class="before"></div><button id="reset">Reset</button>
    <div class="after"></div><div class="home"></div>
    <script>window.taps = []; document.querySelector('button').addEventListener('click',
      event => window.taps.push({ trusted: event.isTrusted }));</script>`);
  const old = await driverClick('#reset');
  assert.ok(old.y > 840, 'Nearest alignment reproduces a tap inside the 34px home area');
  assert.deepEqual(await page.evaluate(() => window.taps), []);
  const point = await withCenteredNativeClicks(app()).click('#reset');
  assert.ok(point.y > 88 && point.y < 840);
  assert.ok(Math.abs(point.y - 437) <= 1, 'Target center uses the middle of the real viewport');
  assert.deepEqual(await page.evaluate(() => window.taps), [{ trusted: true }]);
});

test('dropdown positioning leaves the page scroll untouched and lets the existing menu logic reveal the target', async () => {
  await page.setContent(`
    <style>
      body { margin: 0; height: 2600px; }
      .dropdown-menu { position: fixed; top: 200px; left: 90px; width: 160px;
        height: 100px; overflow: auto; background: white; }
      button { display: block; width: 140px; height: 40px; }
    </style>
    <div class="dropdown-menu">${Array.from({ length: 12 }, (_, i) => `<button id="option-${i}">${i}</button>`).join('')}</div>
    <script>window.taps = []; document.querySelector('#option-11').addEventListener('click',
      event => window.taps.push({ trusted: event.isTrusted }));</script>`);
  await page.evaluate(() => window.scrollTo(0, 700));
  const before = await page.evaluate(() => window.scrollY);
  let pageScrollAtDelegation, menuScrollAtDelegation;
  const positioned = withCenteredNativeClicks(
    app(async (selector) => {
      [pageScrollAtDelegation, menuScrollAtDelegation] = await page.evaluate(() => [
        window.scrollY,
        document.querySelector('.dropdown-menu').scrollTop,
      ]);
      return driverClick(selector);
    }),
  );
  const point = await positioned.click('#option-11');
  assert.equal(pageScrollAtDelegation, before);
  assert.equal(menuScrollAtDelegation, 0, 'The wrapper must not replace menu scroll ownership');
  assert.equal(await page.evaluate(() => window.scrollY), before);
  assert.ok(await page.evaluate(() => document.querySelector('.dropdown-menu').scrollTop > 0));
  assert.ok(point.y >= 200 && point.y <= 300);
  assert.deepEqual(await page.evaluate(() => window.taps), [{ trusted: true }]);
});

test('unready targets and native driver errors stop the scenario without synthetic fallback', async () => {
  await page.setContent('<button id="disabled" disabled>Disabled</button>');
  let delegated = 0;
  const positioned = withCenteredNativeClicks(app(async () => delegated++));
  await assert.rejects(positioned.click('#disabled'), /did not become ready/);
  await assert.rejects(positioned.click('#missing'), /did not become ready/);
  assert.equal(delegated, 0);
  await page.setContent('<button id="ready">Ready</button>');
  const error = new Error('Real WDA tap failed');
  await assert.rejects(
    withCenteredNativeClicks(
      app(async () => {
        throw error;
      }),
    ).click('#ready'),
    (received) => received === error,
  );
});
