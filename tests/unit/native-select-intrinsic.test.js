import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { assertPrivacySelectIntrinsic, collectNativePageSnapshot } from '../native/page-parity.mjs';

let browser, page, source;
before(async () => {
  source = await readFile(new URL('../../public/app-privacy.html', import.meta.url), 'utf8');
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 402, height: 874 }, locale: 'zh-CN' });
});
after(async () => browser?.close());

async function boxes(change) {
  await page.setContent(source);
  await page.evaluate(async () => document.fonts.ready);
  if (change) await page.evaluate(change);
  const snapshot = await page.evaluate(collectNativePageSnapshot, ['#policy-language']);
  return snapshot.boxes['#policy-language'];
}

test('actual privacy HTML exposes its complete auto select and records intrinsic widths separately', async () => {
  const web = await boxes(),
    native = structuredClone(web);
  // Keep the observed UIKit/Chromium difference; this unit checks the
  // semantic/fit contract, while installed-app parity supplies real UIKit data.
  native.width -= 3;
  const evidence = assertPrivacySelectIntrinsic(native, web);
  assert.equal(evidence.property, 'width');
  assert.equal(evidence.native, native.width);
  assert.equal(evidence.web, web.width);
  assert.match(evidence.reason, /OS intrinsic menu chrome/);
  assert.equal(web.intrinsicSelect.options.length, 11);
  assert.equal(web.intrinsicSelect.value, 'zh-CN');
  assert.deepEqual(web.intrinsicSelect.authoredWidths, []);
});

test('authored inline, stylesheet, logical and minimum widths cannot use the intrinsic exception', async () => {
  for (const change of [
    () => (document.querySelector('select').style.width = '113px'),
    () => (document.querySelector('select').style.inlineSize = '113px'),
    () => (document.querySelector('select').style.minWidth = '113px'),
    () => {
      const style = document.createElement('style');
      style.textContent = '#policy-language { width: 113px }';
      document.head.append(style);
    },
  ]) {
    const box = await boxes(change);
    assert.throws(() => assertPrivacySelectIntrinsic(box, box), /has authored width/);
  }
});

test('a custom appearance, missing label or multiple menu does not qualify', async () => {
  for (const [change, error] of [
    [() => (document.querySelector('select').style.appearance = 'none'), /appearance/],
    [() => document.querySelector('label').remove(), /visible label/],
    [() => (document.querySelector('select').multiple = true), /is multiple/],
    [() => (document.querySelector('select').disabled = true), /is disabled/],
  ]) {
    const box = await boxes(change);
    assert.throws(() => assertPrivacySelectIntrinsic(box, box), error);
  }
});

test('missing/changed options and invalid/different selected values are rejected even in both renderers', async () => {
  for (const change of [
    () => document.querySelector('option[value="ko"]').remove(),
    () => (document.querySelector('option[value="ko"]').value = 'unknown'),
    () => (document.querySelector('option[value="ko"]').textContent = 'wrong label'),
    () => (document.querySelector('select').value = 'unknown'),
  ]) {
    const box = await boxes(change);
    assert.throws(() => assertPrivacySelectIntrinsic(box, box), /language (?:options|value)/);
  }
  const web = await boxes(),
    native = structuredClone(web);
  native.intrinsicSelect.value = 'en';
  assert.throws(() => assertPrivacySelectIntrinsic(native, web), /selected language/);
});

test('zero size, selected-text clipping and container/viewport overflow fail without widening tolerance', async () => {
  const web = await boxes();
  for (const [damage, error] of [
    [(box) => (box.width = 0), /no rendered size/],
    [(box) => (box.shown = false), /no rendered size/],
    [
      (box) =>
        (box.width = box.intrinsicSelect.textWidth + box.intrinsicSelect.horizontalInsets - 1),
      /clips its selected text/,
    ],
    [(box) => (box.left = box.intrinsicSelect.container.left - 1), /outside its container/],
    [
      (box) => (box.left = box.intrinsicSelect.container.right - box.width + 1),
      /outside its container/,
    ],
    [
      (box) => (box.intrinsicSelect.viewportWidth = box.left + box.width - 1),
      /outside its container or viewport/,
    ],
    [(box) => (box.intrinsicSelect.label.top = box.top + box.height + 1), /share a row/],
    [(box) => (box.intrinsicSelect.label.right = box.left + 1), /share a row/],
  ]) {
    const native = structuredClone(web);
    damage(native);
    assert.throws(() => assertPrivacySelectIntrinsic(native, web), error);
  }
});
