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

test('the iOS package declares no non-exempt encryption', () => {
  assert.match(
    read('ios/App/App/Info.plist'),
    /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/,
  );
});
