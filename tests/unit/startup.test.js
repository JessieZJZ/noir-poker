import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import config from '../../vite.config.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('all game styles load through an awaited module while independent launch artwork can paint', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  const styles = [
    ...readFileSync(new URL('../../src/styles/app.js', import.meta.url), 'utf8').matchAll(
      /import '\.\/([^']+\.css)'/g,
    ),
  ];
  assert.deepEqual(
    styles.map((match) => match[1]).sort(),
    readdirSync(new URL('../../src/styles', import.meta.url))
      .filter((name) => name.endsWith('.css'))
      .sort(),
  );
  assert.doesNotMatch(head, /rel="stylesheet"/);
  assert.match(head, /body\[inert\] \*\s*\{\s*visibility:\s*hidden !important;/);
  assert.match(head, /rel="preload" href="\/launch-icon\.png" as="image"/);
  assert.match(head, /html:not\(\[data-app-ready='true'\]\)::before/);
  assert.match(html, /<body inert>/);
  assert.match(readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8'), /await styles/);
});

test('Web and native use identical local fonts without a remote font request', () => {
  assert.doesNotMatch(html, /data-web-fonts|fonts\.(googleapis|gstatic)\.com/);
  for (const name of readdirSync(new URL('../../src/styles', import.meta.url))) {
    assert.doesNotMatch(
      readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8'),
      /@import\s+url\(['"]https?:/,
    );
  }
  const native = config({ mode: 'native' }),
    web = config({ mode: 'production' });
  const pluginShape = (plugins) => plugins.map(({ name, enforce }) => ({ name, enforce }));
  assert.deepEqual(pluginShape(native.plugins), pluginShape(web.plugins));
  const cacheModule = new URL('../../src/review/result-cache.js', import.meta.url).pathname;
  assert.equal(
    native.plugins[0].transform('__NOIR_REVIEW_REVISION__', cacheModule),
    web.plugins[0].transform('__NOIR_REVIEW_REVISION__', cacheModule),
    'Web and native must build the same review cache revision',
  );
  assert.ok(!pluginShape(native.plugins).some(({ name }) => name === 'poker-test-fixtures'));
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
