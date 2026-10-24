import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { profileDetailBounds } from '../../src/ui/profile-layout.js';
import { compareNativePaint } from './paint-parity.mjs';

export function collectNativePageSnapshot(selectors) {
  const root = document.documentElement;
  const inset = (edge) =>
    parseFloat(getComputedStyle(document.body).getPropertyValue('padding-' + edge)) || 0;
  const top = inset('top'),
    bottom = inset('bottom');
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:fixed;visibility:hidden;width:0;height:0;border-left:1px solid;pointer-events:none';
  document.body.append(probe);
  const layoutScale =
    Math.round(10000 / parseFloat(getComputedStyle(probe).borderLeftWidth)) / 10000;
  probe.remove();
  const clone = document.body.cloneNode(true);
  document.querySelectorAll('select').forEach((select, index) => {
    const copy = clone.querySelectorAll('select')[index];
    [...copy.options].forEach((option) =>
      option.toggleAttribute('selected', option.value === select.value),
    );
  });
  clone.querySelectorAll('script').forEach((script) => script.remove());
  // Web's content viewport excludes the native gesture area. The fitted
  // surface stores the full native height and its dock keeps part of that
  // area (--dock-bottom-inset): the whole inset on Android, a small clearance
  // on iOS. The replay has no inset, so remove that clearance; the rest of the
  // dock then extends below the viewport exactly as natively. The settled
  // single-row dock drops its padding but keeps the same table height, so the
  // variable itself is resolved rather than the dock's current padding.
  const surface = clone.querySelector('.game-surface');
  const playHeight = parseFloat(surface?.style.getPropertyValue('--play-height'));
  const live = document.querySelector('.game-surface');
  let dockInset = NaN;
  if (live) {
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;visibility:hidden;width:0;height:var(--dock-bottom-inset);pointer-events:none';
    live.append(probe);
    dockInset = probe.getBoundingClientRect().height;
    probe.remove();
  }
  if (Number.isFinite(playHeight))
    surface.style.setProperty(
      '--play-height',
      playHeight - (Number.isFinite(dockInset) ? dockInset : bottom) + 'px',
    );
  const boxes = Object.fromEntries(
    selectors.map((selector) => {
      const element = document.querySelector(selector),
        r = element.getBoundingClientRect(),
        style = getComputedStyle(element),
        shown = element.getClientRects().length > 0;
      let intrinsicSelect;
      if (selector === '#policy-language' && element.tagName === 'SELECT') {
        const widths = [],
          widthProperties = ['width', 'inline-size', 'min-width', 'min-inline-size'];
        const inspectStyle = (declaration, source) => {
          for (const property of widthProperties)
            if (declaration.getPropertyValue(property))
              widths.push({ source, property, value: declaration.getPropertyValue(property) });
        };
        inspectStyle(element.style, 'inline');
        if (element.hasAttribute('width'))
          widths.push({
            source: 'attribute',
            property: 'width',
            value: element.getAttribute('width'),
          });
        let unreadableStylesheet = false;
        const inspectRules = (rules) => {
          for (const rule of rules) {
            if (rule.selectorText && element.matches(rule.selectorText))
              inspectStyle(rule.style, rule.selectorText);
            if (rule.cssRules) inspectRules(rule.cssRules);
          }
        };
        for (const sheet of document.styleSheets) {
          try {
            inspectRules(sheet.cssRules);
          } catch {
            unreadableStylesheet = true;
          }
        }
        const parent = element.parentElement,
          parentRect = parent.getBoundingClientRect(),
          parentStyle = getComputedStyle(parent),
          label = [...element.labels][0],
          labelRect = label?.getBoundingClientRect(),
          selected = element.selectedOptions[0],
          canvas = document.createElement('canvas'),
          context = canvas.getContext('2d'),
          number = (property) => parseFloat(style[property]) || 0;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        intrinsicSelect = {
          appearance: style.appearance,
          authoredWidths: widths,
          unreadableStylesheet,
          multiple: element.multiple,
          size: element.size,
          disabled: element.disabled,
          value: element.value,
          options: [...element.options].map((option) => ({
            value: option.value,
            label: option.label,
            disabled: option.disabled,
          })),
          accessibleLabel: element.getAttribute('aria-label'),
          label: label && {
            text: label.textContent.trim(),
            left: labelRect.left,
            right: labelRect.right,
            top: labelRect.top - top,
            bottom: labelRect.bottom - top,
          },
          textWidth: context.measureText(selected?.label || '').width,
          horizontalInsets:
            number('paddingLeft') +
            number('paddingRight') +
            number('borderLeftWidth') +
            number('borderRightWidth'),
          container: {
            left:
              parentRect.left +
              parseFloat(parentStyle.paddingLeft) +
              parseFloat(parentStyle.borderLeftWidth),
            right:
              parentRect.right -
              parseFloat(parentStyle.paddingRight) -
              parseFloat(parentStyle.borderRightWidth),
          },
          viewportWidth: innerWidth,
        };
      }
      return [
        selector,
        {
          left: r.left,
          top: shown ? r.top - top : 0,
          shown,
          width: r.width,
          height: r.height,
          font: style.fontFamily.replaceAll('"', '').replaceAll("'", ''),
          size: style.fontSize,
          weight: style.fontWeight,
          lineHeight: style.lineHeight,
          // A range has no rendered text; its track/thumb colors are styled
          // separately. Browsers retain different unused UA text colors.
          color: element.type === 'range' ? null : style.color,
          ...(intrinsicSelect && { intrinsicSelect }),
        },
      ];
    }),
  );
  return {
    head: document.head.innerHTML.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''),
    body: clone.outerHTML,
    lang: root.lang,
    pixelRatio: devicePixelRatio,
    layoutScale,
    viewport: { width: innerWidth, height: innerHeight - top - bottom },
    insets: { top, bottom },
    scroll: scrollY
      ? {
          left: scrollX,
          top: scrollY,
          bottomDistance: document.documentElement.scrollHeight - scrollY - innerHeight,
        }
      : null,
    open: [...document.querySelectorAll('dialog[open]')].map((dialog) => dialog.id),
    scrolls: [...document.querySelectorAll('[id], .opponents-body')]
      .filter((element) => element.scrollTop)
      .map((element) => ({
        selector: element.id ? '#' + element.id : '.opponents-body',
        top: element.scrollTop,
      })),
    boxes,
  };
}

export function referenceDocumentScroll({ scroll }) {
  if (!scroll) return { left: 0, top: 0 };
  const { left, top } = scroll;
  assert.ok(
    Number.isFinite(left) && Number.isFinite(top),
    'Native replay needs the captured document scroll offsets',
  );
  // Keep the same document origin. Matching distance from the page bottom
  // instead lets rounding in distant content move every measured component.
  return { left, top };
}

export function localReferenceHead(head) {
  // Vite's async CSS loader writes an absolute native localhost URL. Replay
  // those assets from the reference server, preserving all actual CSS rules.
  return head.replace(/\b(href|src)=(["'])(.*?)\2/g, (attribute, name, quote, value) => {
    try {
      const url = new URL(value);
      if (['capacitor:', 'http:', 'https:'].includes(url.protocol) && url.hostname === 'localhost')
        return `${name}=${quote}${url.pathname}${url.search}${url.hash}${quote}`;
    } catch {}
    return attribute;
  });
}

const privacyOptions = [
  ['zh-CN', '简体中文'],
  ['en', 'English'],
  ['zh-TW', '繁體中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['ru', 'Русский'],
].map(([value, label]) => ({ value, label, disabled: false }));

// An unstyled HTML select uses the OS menu chrome to choose its intrinsic
// width. Keep authored geometry strict, but verify the privacy control's real
// content and fit instead of requiring Chromium's arrow to match UIKit's.
export function assertPrivacySelectIntrinsic(nativeBox, webBox) {
  for (const [renderer, box] of [
    ['native', nativeBox],
    ['Web', webBox],
  ]) {
    const control = box.intrinsicSelect;
    assert.ok(control, `${renderer} privacy select metadata is missing`);
    assert.equal(control.appearance, 'auto', `${renderer} privacy select appearance`);
    assert.deepEqual(control.authoredWidths, [], `${renderer} privacy select has authored width`);
    assert.equal(
      control.unreadableStylesheet,
      false,
      `${renderer} privacy select stylesheet unreadable`,
    );
    assert.equal(control.multiple, false, `${renderer} privacy select is multiple`);
    assert.equal(control.size, 0, `${renderer} privacy select has authored size`);
    assert.equal(control.disabled, false, `${renderer} privacy select is disabled`);
    assert.deepEqual(control.options, privacyOptions, `${renderer} privacy language options`);
    assert.ok(
      privacyOptions.some(({ value }) => value === control.value),
      `${renderer} privacy language value`,
    );
    assert.equal(
      control.accessibleLabel,
      'Language',
      `${renderer} privacy select accessible label`,
    );
    assert.equal(control.label?.text, 'Language', `${renderer} privacy select visible label`);
    assert.ok(
      box.shown && Number.isFinite(box.width) && box.width > 0 && box.height > 0,
      `${renderer} privacy select has no rendered size`,
    );
    assert.ok(
      Number.isFinite(control.textWidth) &&
        control.textWidth > 0 &&
        Number.isFinite(control.horizontalInsets) &&
        control.horizontalInsets >= 0 &&
        control.textWidth + control.horizontalInsets <= box.width,
      `${renderer} privacy select clips its selected text`,
    );
    assert.ok(
      Number.isFinite(control.container.left) &&
        Number.isFinite(control.container.right) &&
        box.left >= control.container.left &&
        box.left + box.width <= control.container.right &&
        box.left >= 0 &&
        box.left + box.width <= control.viewportWidth,
      `${renderer} privacy select is outside its container or viewport`,
    );
    assert.ok(
      box.left >= control.label.right &&
        control.label.top < box.top + box.height &&
        control.label.bottom > box.top,
      `${renderer} privacy select and label must share a row without overlap`,
    );
  }
  assert.equal(
    nativeBox.intrinsicSelect.value,
    webBox.intrinsicSelect.value,
    'privacy selected language',
  );
  return {
    property: 'width',
    reason:
      'OS intrinsic menu chrome; appearance:auto and no authored width; options, selected text fit and container checked',
    native: nativeBox.width,
    web: webBox.width,
  };
}

// Replay only the installed app's rendered DOM in Chromium. This compares the
// same cards, text and selections, without putting test fixtures in an app.
// Native screenshots still come from the installed app's native driver.
export async function compareNativePage({ root, output, evaluate, screenshot }, name, selectors) {
  await evaluate(async () => {
    document.activeElement?.blur();
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => {})),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  // WebKit can resolve frame callbacks before UIKit presents the new layer.
  // Give the device compositor time to present dialog and scrolling changes.
  await new Promise((resolve) => setTimeout(resolve, 750));
  const snapshot = await evaluate(collectNativePageSnapshot, selectors);
  const nativeCapture = await screenshot('parity-' + name + '-native');
  const directory = path.join(root, '.artifacts/mobile/web');
  const server = createServer(async (request, response) => {
    try {
      response.setHeader('Access-Control-Allow-Origin', '*');
      const filename = path.resolve(
        directory,
        '.' + new URL(request.url, 'http://localhost').pathname,
      );
      if (!filename.startsWith(directory + path.sep)) throw Error('Outside bundle');
      const mime = {
        '.css': 'text/css',
        '.woff2': 'font/woff2',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      };
      response.setHeader(
        'Content-Type',
        mime[path.extname(filename)] || 'application/octet-stream',
      );
      response.end(await readFile(filename));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  // WebView applies Android's display scale during CSS layout, including
  // fractional border widths. DPR emulation alone only changes raster density.
  let browser;
  try {
    // Launch inside the try: a missing browser must still close the server,
    // or its open socket keeps the test process alive until the CI timeout.
    browser = await chromium.launch({
      args: [`--force-device-scale-factor=${snapshot.layoutScale}`],
    });
    const page = await browser.newPage({
      viewport: snapshot.viewport,
      // Android commonly uses fractional densities (for example 2.625).
      // Matching them avoids accumulating different 1px border rounding.
      deviceScaleFactor: snapshot.pixelRatio,
      locale: snapshot.lang,
    });
    await writeFile(path.join(output, 'parity-' + name + '-head.html'), snapshot.head);
    await page.setContent(
      `<!doctype html><html lang="${snapshot.lang}"><head><base href="http://127.0.0.1:${server.address().port}/">${localReferenceHead(snapshot.head)}</head>${snapshot.body}</html>`,
    );
    await page.evaluate(
      async ({ snapshot, scroll }) => {
        document.documentElement.dataset.appReady = 'true';
        for (const edge of ['top', 'right', 'bottom', 'left'])
          document.documentElement.style.setProperty('--safe-area-inset-' + edge, '0px');
        for (const id of snapshot.open) {
          const dialog = document.getElementById(id);
          dialog.removeAttribute('open');
          dialog.showModal();
        }
        await document.fonts.ready;
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) => Number.isFinite(animation.effect.getComputedTiming().endTime))
            .map((animation) => animation.finished.catch(() => {})),
        );
        for (const scroll of snapshot.scrolls)
          document.querySelector(scroll.selector).scrollTop = scroll.top;
        window.scrollTo(scroll.left, scroll.top);
        document.activeElement?.blur();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      },
      { snapshot, scroll: referenceDocumentScroll(snapshot) },
    );
    // Native's inline offset is relative to its scrolled profile grid. Replay
    // the actual Web positioning rule against this renderer's grid and viewport
    // rather than preserving accumulated border rounding in that old offset.
    const profileGeometry = await page.evaluate(() => {
      const panel = document.querySelector('#profile-detail'),
        stage = document.querySelector('#profile-stage'),
        body = document.querySelector('.opponents-body');
      if (!panel || panel.hidden || getComputedStyle(panel).position !== 'absolute') return null;
      const region = stage.getBoundingClientRect(),
        viewport = body.getBoundingClientRect();
      return {
        region: { top: region.top, height: region.height },
        viewport: { top: viewport.top, bottom: viewport.bottom },
        clientHeight: body.clientHeight,
      };
    });
    if (profileGeometry)
      await page.evaluate((bounds) => {
        const panel = document.querySelector('#profile-detail');
        panel.style.setProperty('--profile-detail-top', `${bounds.top}px`);
        panel.style.setProperty('--profile-detail-height', `${bounds.height}px`);
      }, profileDetailBounds(profileGeometry));
    const { boxes } = await page.evaluate(collectNativePageSnapshot, selectors);
    const webImage = path.join(output, 'parity-' + name + '-web.png');
    await page.screenshot({ path: webImage });
    const paint = /^(?:table|settlement)(?:-[5-9])?$/.test(name)
      ? await compareNativePaint(nativeCapture, webImage, snapshot)
      : undefined;
    const comparison = {
      name,
      mode: 'Installed app DOM replay in Chromium; same content, usable viewport and local CSS',
      ...snapshot,
      head: undefined,
      body: undefined,
      web: boxes,
      intrinsicControlWidths:
        name === 'privacy' && selectors.includes('#policy-language')
          ? {
              '#policy-language': {
                reason:
                  'OS intrinsic menu chrome; validate appearance:auto, no authored width, options, text fit and container',
                native: snapshot.boxes['#policy-language'].width,
                web: boxes['#policy-language'].width,
              },
            }
          : undefined,
      paint,
    };
    await writeFile(
      path.join(output, 'parity-' + name + '.json'),
      JSON.stringify(comparison, null, 2),
    );
    if (paint)
      assert.ok(
        paint.meanChannelError <= paint.limit,
        `${name}: native paint differs from Web (${paint.meanChannelError.toFixed(4)} > ${paint.limit}); inspect the retained screenshots`,
      );
    const intrinsicControlWidths = {};
    for (const selector of selectors) {
      const intrinsic = name === 'privacy' && selector === '#policy-language';
      if (intrinsic)
        intrinsicControlWidths[selector] = assertPrivacySelectIntrinsic(
          snapshot.boxes[selector],
          boxes[selector],
        );
      for (const key of ['left', 'top', ...(intrinsic ? [] : ['width']), 'height'])
        assert.ok(
          Math.abs(snapshot.boxes[selector][key] - boxes[selector][key]) <= 2,
          `${name} ${selector} ${key}: native ${snapshot.boxes[selector][key]}, Web ${boxes[selector][key]}`,
        );
      for (const key of ['size', 'lineHeight']) {
        const nativeValue = snapshot.boxes[selector][key],
          webValue = boxes[selector][key];
        if (nativeValue.endsWith('px') && webValue.endsWith('px'))
          assert.ok(
            Math.abs(parseFloat(nativeValue) - parseFloat(webValue)) <= 0.01,
            `${name} ${selector} ${key}: native ${nativeValue}, Web ${webValue}`,
          );
        else assert.equal(nativeValue, webValue, `${name} ${selector} ${key}`);
      }
      for (const key of ['shown', 'font', 'weight', 'color'])
        assert.equal(
          snapshot.boxes[selector][key],
          boxes[selector][key],
          `${name} ${selector} ${key}`,
        );
    }
    return {
      name,
      viewport: snapshot.viewport,
      insets: snapshot.insets,
      components: selectors.length,
      tolerancePx: 2,
      intrinsicControlWidths,
      paint,
    };
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
