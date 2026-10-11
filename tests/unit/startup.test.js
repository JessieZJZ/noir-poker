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

test('Web and native use identical local fonts without a remote font request', () => {
  assert.doesNotMatch(html, /data-web-fonts|fonts\.(googleapis|gstatic)\.com/);
  for (const name of readdirSync(new URL('../../src/styles', import.meta.url))) {
    assert.doesNotMatch(
      readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8'),
      /@import\s+url\(['"]https?:/,
    );
  }
  assert.deepEqual(config({ mode: 'native' }).plugins, config({ mode: 'production' }).plugins);
  const fonts = readFileSync(new URL('../../src/styles/fonts.css', import.meta.url), 'utf8');
  const paths = [...fonts.matchAll(/url\('\/fonts\/([^']+)'\)/g)];
  assert.equal(paths.length, 4);
  for (const [, name] of paths)
    assert.equal(
      readFileSync(new URL(`../../public/fonts/${name}`, import.meta.url))
        .subarray(0, 4)
        .toString(),
      'wOF2',
    );
});

test('the HTML action controls are disabled before platform, locale and game preparation', () => {
  for (const id of ['bet-slider', 'raise-button', 'fold-button', 'call-button']) {
    const tag = html.match(new RegExp('<(?:button|input)\\b[^>]*id="' + id + '"[^>]*>'))?.[0];
    assert.ok(tag, id);
    assert.match(tag, /\bdisabled\b/, id);
  }
  const presets = [...html.matchAll(/<button\b[^>]*data-preset="[^"]+"[^>]*>/g)];
  assert.equal(presets.length, 4);
  for (const [tag] of presets) assert.match(tag, /\bdisabled\b/);
});
