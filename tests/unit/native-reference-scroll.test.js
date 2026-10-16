import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { referenceDocumentScroll } from '../native/page-parity.mjs';

test('native replay preserves the captured origin when distant content changes total height', () => {
  const capturedTop = 320.76190185546875;
  // The original Android failure had identical table height but a uniform
  // 2.2857px offset: bottom anchoring imported accumulated rounding below it.
  for (const bottomDistance of [1368.8095092773438, 1371.09521484375, 2000]) {
    const snapshot = Object.freeze({
      scroll: Object.freeze({ left: 0, top: capturedTop, bottomDistance }),
    });
    assert.deepEqual(referenceDocumentScroll(snapshot), { left: 0, top: capturedTop });
  }
});

test('unscrolled replay and horizontal offsets retain their actual origins', () => {
  assert.deepEqual(referenceDocumentScroll({ scroll: null }), { left: 0, top: 0 });
  assert.deepEqual(referenceDocumentScroll({ scroll: { left: -12.5, top: 45.25 } }), {
    left: -12.5,
    top: 45.25,
  });
});

test('missing or corrupt scroll observations fail instead of aligning by unrelated page height', () => {
  for (const scroll of [
    { bottomDistance: 100 },
    { left: 0, top: NaN },
    { left: Infinity, top: 40 },
  ])
    assert.throws(() => referenceDocumentScroll({ scroll }), /captured document scroll offsets/);
});

test('real fractional-density replay removes bottom-origin drift without hiding a size regression', async () => {
  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1.3125'] });
  try {
    const page = await browser.newPage({
      viewport: { width: 412, height: 839 },
      deviceScaleFactor: 2.625,
    });
    await page.setContent(
      '<body style="margin:0;height:2603px"><div id="table" style="position:absolute;top:137px;width:396px;height:574px"></div></body>',
    );
    await page.evaluate(() => window.scrollTo(0, 321.5));
    const captured = await page.evaluate(() => ({
      scroll: {
        left: scrollX,
        top: scrollY,
        bottomDistance: document.documentElement.scrollHeight - scrollY - innerHeight,
      },
      top: document.querySelector('#table').getBoundingClientRect().top,
      height: document.querySelector('#table').getBoundingClientRect().height,
    }));
    const oldTop = await page.evaluate(({ scroll }) => {
      document.body.style.height = '2600px';
      window.scrollTo(
        0,
        document.documentElement.scrollHeight - innerHeight - scroll.bottomDistance,
      );
      return document.querySelector('#table').getBoundingClientRect().top;
    }, captured);
    assert.ok(
      Math.abs(oldTop - captured.top) > 2,
      'The original bottom-origin mismatch is reproduced',
    );
    const replayed = await page.evaluate(({ left, top }) => {
      window.scrollTo(left, top);
      const rect = document.querySelector('#table').getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    }, referenceDocumentScroll(captured));
    assert.equal(replayed.top, captured.top);
    assert.equal(replayed.height, captured.height);
    const changedHeight = await page.evaluate(() => {
      const table = document.querySelector('#table');
      table.style.height = '578px';
      return table.getBoundingClientRect().height;
    });
    assert.ok(
      Math.abs(changedHeight - captured.height) > 2,
      'A real height change stays detectable',
    );
  } finally {
    await browser.close();
  }
});
