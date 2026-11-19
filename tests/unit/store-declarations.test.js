import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Store answers: no advertising ID on Google Play, no non-exempt encryption on
// the App Store. The packages must keep matching what was declared.
test('the Android package removes the advertising ID permission any SDK might add', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  assert.match(
    manifest,
    /<uses-permission android:name="com\.google\.android\.gms\.permission\.AD_ID" tools:node="remove" \/>/,
  );
});

test('the Android portrait lock does not restrict which devices can install', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:screenOrientation="portrait"/);
  assert.match(
    manifest,
    /<uses-feature android:name="android\.hardware\.screen\.portrait" android:required="false" \/>/,
  );
  assert.doesNotMatch(manifest, /android\.hardware\.screen\.landscape/);
});

test('the iOS package declares no non-exempt encryption', () => {
  assert.match(
    read('ios/App/App/Info.plist'),
    /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/,
  );
});

test('about and each bundled privacy policy use the store contact', () => {
  const { publisher, supportEmail, locales } = JSON.parse(read('mobile/store-readiness.json'));
  const about = read('src/platform/native.js');
  assert.ok(about.includes(`发行者：${publisher} · ${supportEmail}`));
  assert.ok(about.includes(`mailto:${supportEmail}`));

  const policy = read('public/app-privacy.html');
  const articles = new Map(
    [...policy.matchAll(/<article lang="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)].map(
      ([, locale, content]) => [locale, content],
    ),
  );
  for (const locale of locales) {
    const article = articles.get(locale);
    assert.ok(article?.includes(`${publisher} · ${supportEmail}`), locale);
    assert.ok(article?.includes(`href="mailto:${supportEmail}">${supportEmail}</a>`), locale);
  }
});
