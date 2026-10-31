import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {
  readNativeTargetPosition,
  restoreNativeTargetLabelledBy,
  withCenteredNativeClicks,
} from '../native/position-target.mjs';

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
    async waitFor(predicate, timeout) {
      const deadline = Date.now() + Math.min(timeout, 500);
      while (Date.now() < deadline) {
        if (await predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('Target did not become ready');
    },
    click,
  };
}

test('three semantically identical geometry samples remain stable when driver dictionary order alternates', async () => {
  await page.setContent('<button id="ready">Ready</button>');
  let samples = 0;
  let taps = 0;
  const positioned = withCenteredNativeClicks({
    ...app(async (selector) => {
      taps++;
      return driverClick(selector);
    }),
    async evaluate(fn, value) {
      const measured = await page.evaluate(fn, value);
      if (fn.name === 'readNativeTargetPosition' && ++samples % 2)
        return Object.fromEntries(Object.entries(measured).reverse());
      return measured;
    },
  });
  await positioned.click('#ready');
  assert.equal(samples, 3);
  assert.equal(taps, 1);
});

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

test('a slow native bridge still observes three identical positions before one trusted tap', async () => {
  await page.setContent('<button id="ready">Ready</button>');
  let clock = 0;
  let samples = 0;
  let taps = 0;
  const positioned = withCenteredNativeClicks({
    async evaluate(fn, value) {
      clock += 2400;
      if (fn.name === 'readNativeTargetPosition') samples++;
      return page.evaluate(fn, value);
    },
    async waitFor(predicate, budget) {
      const deadline = clock + budget;
      while (clock < deadline) if (await predicate()) return true;
      throw Error('Slow bridge exhausted the positioning deadline');
    },
    async click(selector) {
      taps++;
      return driverClick(selector);
    },
  });
  await positioned.click('#ready');
  assert.equal(samples, 3);
  assert.equal(taps, 1);
});

test('a background-page target cannot be tapped through an open modal even when it has a rectangle', async () => {
  await page.setContent(`
    <button id="background">Background</button>
    <dialog><button id="inside">Inside</button></dialog>
    <script>document.querySelector('dialog').showModal();</script>`);
  let delegated = 0;
  const positioned = withCenteredNativeClicks(app(async () => delegated++));
  await assert.rejects(positioned.click('#background'), /did not become ready/);
  assert.equal(delegated, 0);
  await positioned.click('#inside');
  assert.equal(delegated, 1, 'Visible modal controls retain their real-driver path');
});

test('closing a modal waits for unlock and late scroll restoration before the single real page tap', async () => {
  await page.setContent(`
    <style>
      body { margin: 0; } .before { height: 1800px; } .after { height: 800px; }
      #reset { width: 160px; height: 40px; margin-left: 100px; }
    </style>
    <div class="before"></div><button id="reset">Reset</button><div class="after"></div>
    <dialog><button id="close">Close</button></dialog>
    <script>
      window.taps = []; window.restored = false;
      const dialog = document.querySelector('dialog');
      document.documentElement.dataset.homeScrollLocked = 'true';
      dialog.showModal();
      document.querySelector('#close').addEventListener('click', () => {
        dialog.close();
        setTimeout(() => {
          delete document.documentElement.dataset.homeScrollLocked;
          window.unlocked = true;
        }, 80);
      });
      document.querySelector('#reset').addEventListener('click', event =>
        window.taps.push({ trusted: event.isTrusted, restored: window.restored }));
    </script>`);
  const delegations = [],
    base = app(async (selector) => {
      delegations.push(selector);
      if (selector === '#reset')
        assert.equal(
          await page.evaluate(() => window.restored),
          true,
          'Late native scroll restoration must finish before the real click',
        );
      return driverClick(selector);
    }),
    positioned = withCenteredNativeClicks({
      ...base,
      async evaluate(fn, selector) {
        if (selector === '#reset' && fn === readNativeTargetPosition)
          await page.evaluate(() => {
            if (window.restored) return;
            // Restore after the first centering but before its first sample.
            // This ordering must hold even on a CPU-throttled browser.
            window.scrollTo(0, 600);
            window.dispatchEvent(new Event('resize'));
            window.restored = true;
          });
        return base.evaluate(fn, selector);
      },
    });
  await positioned.click('#close');
  const point = await positioned.click('#reset');
  assert.deepEqual(delegations, ['#close', '#reset']);
  assert.ok(Math.abs(point.y - 437) <= 1, 'Late scroll drift is re-centered before delegation');
  assert.deepEqual(await page.evaluate(() => window.taps), [{ trusted: true, restored: true }]);
});

test('a continually moving target exhausts the finite geometry wait without delegating a tap', async () => {
  await page.setContent('<button id="moving">Moving</button>');
  let delegated = 0,
    samples = 0;
  const base = app(async () => delegated++),
    deadlines = [],
    positioned = withCenteredNativeClicks({
      ...base,
      async evaluate(fn, selector) {
        // Advance physical geometry on each observation. A throttled browser
        // can otherwise return one CSS-animation frame three times in a row.
        if (fn === readNativeTargetPosition)
          await page.locator('#moving').evaluate((element, step) => {
            element.style.transform = `translateX(${step * 2}px)`;
          }, ++samples);
        return base.evaluate(fn, selector);
      },
      waitFor(predicate, timeout) {
        deadlines.push(timeout);
        return base.waitFor(predicate, timeout);
      },
    });
  await assert.rejects(positioned.click('#moving'), /did not become ready/);
  assert.deepEqual(deadlines, [30000, 30000]);
  assert.equal(delegated, 0);
});

async function labelledFixture() {
  await page.setContent(`
    <span id="sound-label">Sound and vibration</span><span id="extra-label">Preference</span>
    <button id="sound" role="switch" aria-checked="false"
      aria-labelledby=" sound-label  extra-label " aria-label="Original label">Toggle</button>
    <script>window.taps = []; document.querySelector('button').addEventListener('click',
      event => window.taps.push({ trusted: event.isTrusted }));</script>`);
}

test('iOS AX marker becomes the real accessible name during one trusted tap, then labels and geometry return exactly', async () => {
  await labelledFixture();
  const name = 'Sound and vibration Preference',
    marker = 'native-driver-uuid';
  assert.equal(await page.getByRole('switch', { name, exact: true }).count(), 1);
  await page.evaluate(
    (marker) => document.querySelector('button').setAttribute('aria-label', marker),
    marker,
  );
  assert.equal(
    await page.getByRole('switch', { name: marker, exact: true }).count(),
    0,
    'The actual accessibility tree gives aria-labelledby priority over the driver UUID',
  );
  assert.equal(await page.getByRole('switch', { name, exact: true }).count(), 1);
  await page.evaluate(() =>
    document.querySelector('button').setAttribute('aria-label', 'Original label'),
  );
  const before = await page.locator('button').boundingBox();
  let clicks = 0;
  const positioned = withCenteredNativeClicks({
    ...app(async (selector) => {
      clicks++;
      assert.equal(await page.locator(selector).getAttribute('aria-labelledby'), null);
      await page.evaluate(
        (marker) => document.querySelector('button').setAttribute('aria-label', marker),
        marker,
      );
      try {
        assert.equal(await page.getByRole('switch', { name: marker, exact: true }).count(), 1);
        return await driverClick(selector);
      } finally {
        // The real Appium driver similarly owns its marker's restoration.
        await page.evaluate(() =>
          document.querySelector('button').setAttribute('aria-label', 'Original label'),
        );
      }
    }),
    platform: 'ios',
  });
  await positioned.click('#sound');
  assert.equal(clicks, 1);
  assert.equal(
    await page.locator('button').getAttribute('aria-labelledby'),
    ' sound-label  extra-label ',
  );
  assert.equal(await page.locator('button').getAttribute('aria-label'), 'Original label');
  assert.equal(await page.getByRole('switch', { name, exact: true }).count(), 1);
  assert.deepEqual(await page.locator('button').boundingBox(), before);
  assert.deepEqual(await page.evaluate(() => window.taps), [{ trusted: true }]);
  assert.equal(await page.evaluate(() => window.__noirNativeTargetLabels), undefined);
});

test('a failed driver tap restores the exact original referenced label without masking its error', async () => {
  await labelledFixture();
  const error = new Error('Actual native AX tap failed');
  await assert.rejects(
    withCenteredNativeClicks({
      ...app(async () => {
        assert.equal(await page.locator('button').getAttribute('aria-labelledby'), null);
        throw error;
      }),
      platform: 'ios',
    }).click('#sound'),
    (received) => received === error,
  );
  assert.equal(
    await page.locator('button').getAttribute('aria-labelledby'),
    ' sound-label  extra-label ',
  );
  assert.equal(await page.locator('button').getAttribute('aria-label'), 'Original label');
  assert.equal(await page.evaluate(() => window.__noirNativeTargetLabels), undefined);
});

test('removed targets and cleanup transport errors preserve the original driver failure', async () => {
  await labelledFixture();
  const original = new Error('Native tap target went away');
  await assert.rejects(
    withCenteredNativeClicks({
      ...app(async () => {
        await page.evaluate(() => {
          window.removedTarget = document.querySelector('button');
          window.removedTarget.remove();
        });
        throw original;
      }),
      platform: 'ios',
    }).click('#sound'),
    (received) => received === original,
  );
  assert.equal(
    await page.evaluate(() => window.removedTarget.getAttribute('aria-labelledby')),
    ' sound-label  extra-label ',
  );
  assert.equal(await page.evaluate(() => window.__noirNativeTargetLabels), undefined);
  for (const failClick of [true, false]) {
    await labelledFixture();
    const cleanup = new Error('Restoration transport failed'),
      base = app(async () => {
        if (failClick) throw original;
      });
    let token;
    await assert.rejects(
      withCenteredNativeClicks({
        ...base,
        platform: 'ios',
        evaluate(fn, value) {
          if (fn === restoreNativeTargetLabelledBy) {
            token = value;
            throw cleanup;
          }
          return base.evaluate(fn, value);
        },
      }).click('#sound'),
      (received) => received === (failClick ? original : cleanup),
    );
    await page.evaluate(restoreNativeTargetLabelledBy, token);
    assert.equal(
      await page.locator('button').getAttribute('aria-labelledby'),
      ' sound-label  extra-label ',
    );
  }
});

test('Android keeps its referenced accessibility label throughout the original native click', async () => {
  await labelledFixture();
  let delegated = 0;
  await withCenteredNativeClicks({
    ...app(async () => {
      delegated++;
      assert.equal(
        await page.locator('button').getAttribute('aria-labelledby'),
        ' sound-label  extra-label ',
      );
      assert.equal(await page.evaluate(() => window.__noirNativeTargetLabels), undefined);
    }),
    platform: 'android',
  }).click('#sound');
  assert.equal(delegated, 1);
});

test('iOS preserves the difference between absent and explicitly empty labelledby attributes', async () => {
  for (const value of [null, '']) {
    await page.setContent('<button id="target" aria-label="Original label">Target</button>');
    if (value === '')
      await page
        .locator('button')
        .evaluate((element) => element.setAttribute('aria-labelledby', ''));
    await withCenteredNativeClicks({
      ...app(async () => {
        assert.equal(await page.locator('button').getAttribute('aria-labelledby'), null);
        assert.equal(await page.locator('button').getAttribute('aria-label'), 'Original label');
      }),
      platform: 'ios',
    }).click('#target');
    assert.equal(await page.locator('button').getAttribute('aria-labelledby'), value);
    assert.equal(await page.evaluate(() => window.__noirNativeTargetLabels), undefined);
  }
});

test('iOS footer reset and rankings use the actual native viewport tap and open their dialog', async () => {
  for (const id of ['reset-button', 'hand-rankings-button']) {
    await page.setContent(`
      <style>body{margin:0}header{position:fixed;top:0;height:88px;width:100%;background:black;z-index:2}.before{height:1800px}.after{height:600px}button{height:40px;width:160px;margin-left:100px}</style>
      <header></header><div class="before"></div><button id="${id}">Open</button><div class="after"></div><dialog>Guide or reset confirmation</dialog>
      <script>window.taps=[];document.querySelector('button').onclick=event=>{window.taps.push(event.isTrusted);document.querySelector('dialog').showModal()};</script>`);
    const taps = [];
    const positioned = withCenteredNativeClicks({
      ...app(() => {
        throw Error('AX calibration must not handle this viewport-edge control');
      }),
      platform: 'ios',
      nativeTap: async (selector) => {
        taps.push(selector);
        return driverClick(selector);
      },
    });
    const point = await positioned.click(`#${id}`);
    assert.ok(point.y > 88 && point.y < 840);
    assert.deepEqual(taps, [`#${id}`]);
    assert.equal(await page.locator('dialog').evaluate((element) => element.open), true);
    assert.deepEqual(await page.evaluate(() => window.taps), [true]);
  }
});

test('iOS relaid-out modal dropdown controls use a trusted viewport tap without AX calibration', async () => {
  await page.setContent(`
    <style>.dropdown-menu{height:80px;overflow:auto}.dropdown-option{display:block;height:40px}</style>
    <dialog><button class="dropdown-trigger">Language</button><div class="dropdown-menu">${Array.from({ length: 12 }, (_, i) => `<button class="dropdown-option" data-value="${i}">${i}</button>`).join('')}</div></dialog>
    <script>window.taps=[];document.querySelector('dialog').showModal();document.querySelectorAll('button').forEach(button=>button.onclick=event=>window.taps.push({className:button.className,trusted:event.isTrusted}));</script>`);
  const positioned = withCenteredNativeClicks({
    ...app(() => {
      throw Error('Modal dropdown must not use the blocked calibration iframe');
    }),
    platform: 'ios',
    nativeTap: async (selector) => {
      assert.equal(
        await page.evaluate((selector) => {
          const element = document.querySelector(selector),
            r = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }, selector),
        true,
        'The native hit point must already be visible inside its clipped menu',
      );
      return driverClick(selector);
    },
  });
  await positioned.click('.dropdown-trigger');
  await positioned.click('.dropdown-option[data-value="11"]');
  assert.deepEqual(await page.evaluate(() => window.taps), [
    { className: 'dropdown-trigger', trusted: true },
    { className: 'dropdown-option', trusted: true },
  ]);
});
