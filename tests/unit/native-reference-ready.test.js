import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { loadNativeReferencePage } from '../native/page-parity.mjs';

test('native visual replay waits for CSS, fonts and images without waiting for a stalled audio buffer', async () => {
  const font = await readFile(new URL('../../public/fonts/manrope.woff2', import.meta.url));
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/pending.mp3') {
      response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      response.write('ID3');
      return;
    }
    setTimeout(() => {
      if (request.url === '/app.css' || request.url === '/broken-font.css') {
        response.setHeader('Content-Type', 'text/css');
        response.end(
          `@font-face{font-family:Replay;src:url(/${request.url === '/app.css' ? 'font' : 'missing'}.woff2)}body{font-family:Replay}.box{width:137px}`,
        );
      } else if (request.url === '/font.woff2') {
        response.setHeader('Content-Type', 'font/woff2');
        response.end(font);
      } else if (request.url === '/portrait.svg') {
        response.setHeader('Content-Type', 'image/svg+xml');
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12"/></svg>',
        );
      } else {
        response.writeHead(404);
        response.end();
      }
    }, 80);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const html = `<base href="http://127.0.0.1:${server.address().port}/"><link rel="stylesheet" href="/app.css"><body><div class="box">Ready</div><img src="/portrait.svg"><audio preload="auto" src="/pending.mp3"></audio></body>`;
    await assert.rejects(page.setContent(html, { timeout: 500 }), /Timeout/);
    assert.ok(requests.includes('/pending.mp3'), 'The original load waits on real pending media');
    await loadNativeReferencePage(page, html, { timeout: 3000 });
    const visual = await page.evaluate(() => ({
      width: document.querySelector('.box').getBoundingClientRect().width,
      image: document.querySelector('img').naturalWidth,
      font: [...document.fonts].map((face) => ({ family: face.family, status: face.status })),
    }));
    assert.equal(visual.width, 137);
    assert.equal(visual.image, 12);
    assert.ok(
      visual.font.some(
        (face) => face.family.replaceAll('"', '') === 'Replay' && face.status === 'loaded',
      ),
      JSON.stringify(visual.font),
    );
    for (const broken of ['stylesheet', 'image', 'font']) {
      await assert.rejects(
        loadNativeReferencePage(
          page,
          `<base href="http://127.0.0.1:${server.address().port}/"><body>${broken === 'stylesheet' ? '<link rel="stylesheet" href="/missing.css">' : broken === 'font' ? '<link rel="stylesheet" href="/broken-font.css"><p>Font must load</p>' : '<img src="/missing.svg">'}</body>`,
          { timeout: 1000 },
        ),
        (error) =>
          /Timeout|visual asset failed/.test(error.message) &&
          error.referenceLoad.failed.some((request) => request.status === 404),
        `A missing ${broken} must still fail visual readiness`,
      );
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
