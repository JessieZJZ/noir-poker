import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import config from '../../vite.config.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('every local stylesheet is render-blocking in the head before the inert app shell', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  const styles = [...head.matchAll(/<link rel="stylesheet" href="\/src\/styles\/([^"/]+)"\s*\/>/g)];
  assert.deepEqual(
    styles.map((match) => match[1]).sort(),
    readdirSync(new URL('../../src/styles', import.meta.url))
      .filter((name) => name.endsWith('.css'))
      .sort(),
  );
  assert.match(head, /body\[inert\]\s*\{\s*visibility:\s*hidden;/);
  assert.match(html, /<body inert>/);
  assert.doesNotMatch(
    readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8'),
    /import\s+['"][^'"]+\.css/,
  );
});

test('optional Web fonts cannot block startup and native builds remove their entire request', () => {
  const link = html.match(/<link\s+data-web-fonts\b[^>]*>/)?.[0];
  assert.ok(link);
  assert.match(link, /media="print"/);
  assert.match(link, /onload="this.media = 'all'"/);
  for (const name of readdirSync(new URL('../../src/styles', import.meta.url))) {
    assert.doesNotMatch(
      readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8'),
      /@import\s+url\(['"]https?:/,
    );
  }
  const plugin = config({ mode: 'native' }).plugins.find(
    (item) => item.name === 'native-offline-fonts',
  );
  const bundled = plugin.transformIndexHtml(html);
  assert.doesNotMatch(bundled, /data-web-fonts|fonts\.googleapis\.com/);
  assert.equal((bundled.match(/<link rel="stylesheet" href="\/src\/styles\//g) ?? []).length, 13);
  assert.ok(config({ mode: 'production' }).plugins.every((item) => item.name !== plugin.name));
});
