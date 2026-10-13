import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { profileDetailBounds } from '../../src/ui/profile-layout.js';
import { compareNativePaint } from './paint-parity.mjs';

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
  const snapshot = await evaluate((selectors) => {
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
    // surface stores the full native height; remove that inset in the replay.
    const surface = clone.querySelector('.game-surface');
    const playHeight = parseFloat(surface?.style.getPropertyValue('--play-height'));
    if (Number.isFinite(playHeight))
      surface.style.setProperty('--play-height', playHeight - bottom + 'px');
    const boxes = Object.fromEntries(
      selectors.map((selector) => {
        const element = document.querySelector(selector),
          r = element.getBoundingClientRect(),
          style = getComputedStyle(element),
          shown = element.getClientRects().length > 0;
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
        ? { bottomDistance: document.documentElement.scrollHeight - scrollY - innerHeight }
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
  }, selectors);
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
  const browser = await chromium.launch({
    args: [`--force-device-scale-factor=${snapshot.layoutScale}`],
  });
  try {
    const page = await browser.newPage({
      viewport: snapshot.viewport,
      // Android commonly uses fractional densities (for example 2.625).
      // Matching them avoids accumulating different 1px border rounding.
      deviceScaleFactor: snapshot.pixelRatio,
      locale: snapshot.lang,
    });
    await writeFile(path.join(output, 'parity-' + name + '-head.html'), snapshot.head);
    await page.setContent(
      `<!doctype html><html lang="${snapshot.lang}"><head><base href="http://127.0.0.1:${server.address().port}/">${snapshot.head}</head>${snapshot.body}</html>`,
    );
    await page.evaluate(async (snapshot) => {
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
      window.scrollTo(
        0,
        snapshot.scroll
          ? document.documentElement.scrollHeight - innerHeight - snapshot.scroll.bottomDistance
          : 0,
      );
      document.activeElement?.blur();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, snapshot);
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
    const boxes = await page.evaluate(
      (selectors) =>
        Object.fromEntries(
          selectors.map((selector) => {
            const element = document.querySelector(selector),
              r = element.getBoundingClientRect(),
              style = getComputedStyle(element);
            return [
              selector,
              {
                left: r.left,
                top: r.top,
                shown: element.getClientRects().length > 0,
                width: r.width,
                height: r.height,
                font: style.fontFamily.replaceAll('"', '').replaceAll("'", ''),
                size: style.fontSize,
                weight: style.fontWeight,
                lineHeight: style.lineHeight,
                color: element.type === 'range' ? null : style.color,
              },
            ];
          }),
        ),
      selectors,
    );
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
    for (const selector of selectors) {
      for (const key of ['left', 'top', 'width', 'height'])
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
      paint,
    };
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
