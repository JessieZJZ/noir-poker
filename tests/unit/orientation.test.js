import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isIPad, isTablet, shouldBlockLandscape } from '../../src/platform/orientation.js';

const landscapePhone = {
  native: false,
  coarsePointer: true,
  tablet: false,
  width: 844,
  height: 390,
  type: 'landscape-primary',
};

test('phones block landscape while desktop and tablet windows can rotate or resize', () => {
  assert.equal(shouldBlockLandscape(landscapePhone), true);
  assert.equal(shouldBlockLandscape({ ...landscapePhone, type: 'landscape-secondary' }), true);
  assert.equal(shouldBlockLandscape({ ...landscapePhone, width: 390, height: 844 }), false);
  assert.equal(shouldBlockLandscape({ ...landscapePhone, coarsePointer: false }), false);
  assert.equal(shouldBlockLandscape({ ...landscapePhone, tablet: true }), false);
  assert.equal(shouldBlockLandscape({ ...landscapePhone, native: true, tablet: true }), false);
  assert.equal(
    shouldBlockLandscape({ ...landscapePhone, native: true, coarsePointer: false }),
    true,
  );
});

test('a portrait keyboard and letterboxed native window do not look like phone rotation', () => {
  assert.equal(shouldBlockLandscape({ ...landscapePhone, type: 'portrait-primary' }), false);
  assert.equal(shouldBlockLandscape({ ...landscapePhone, type: undefined, angle: 0 }), false);
  for (const angle of [90, -90, 270])
    assert.equal(shouldBlockLandscape({ ...landscapePhone, type: undefined, angle }), true);
  assert.equal(
    shouldBlockLandscape({ ...landscapePhone, native: true, width: 390, height: 844 }),
    false,
  );
});

test('tablet classification uses physical CSS screen size, including iPad desktop-site identity', () => {
  assert.ok(isIPad({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }));
  assert.ok(isIPad({ platform: 'MacIntel', maxTouchPoints: 5 }));
  assert.equal(isIPad({ platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isTablet({}, { width: 599, height: 1000 }), false);
  assert.equal(isTablet({}, { width: 600, height: 1000 }), true);
  assert.equal(isTablet({}, { width: 1000, height: 600 }), true);
  assert.equal(isTablet({}, { width: 844, height: 390 }), false);
  assert.ok(isTablet({ platform: 'MacIntel', maxTouchPoints: 5 }, { width: 500, height: 400 }));
});

test('native and WeChat declarations restrict phones while retaining tablet rotation', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const plist = read('ios/App/App/Info.plist');
  const orientations = (suffix = '') =>
    [
      ...plist
        .match(
          new RegExp(
            `<key>UISupportedInterfaceOrientations${suffix}</key>\\s*<array>([\\s\\S]*?)</array>`,
          ),
        )[1]
        .matchAll(/<string>(.*?)<\/string>/g),
    ].map((match) => match[1]);
  assert.deepEqual(orientations(), ['UIInterfaceOrientationPortrait']);
  assert.ok(orientations('~ipad').includes('UIInterfaceOrientationLandscapeLeft'));
  assert.ok(orientations('~ipad').includes('UIInterfaceOrientationLandscapeRight'));
  assert.ok(orientations('~ipad').includes('UIInterfaceOrientationPortrait'));
  assert.match(
    read('android/app/src/main/AndroidManifest.xml'),
    /android:screenOrientation="portrait"/,
  );
  const activity = read(
    'android/app/src/main/java/io/github/jessiezjz/noirpoker/MainActivity.java',
  );
  assert.match(activity, /smallestScreenWidthDp >= 600/);
  assert.match(activity, /SCREEN_ORIENTATION_USER/);
  assert.match(activity, /SCREEN_ORIENTATION_PORTRAIT/);
  const app = JSON.parse(read('miniprogram/app.json'));
  const page = JSON.parse(read('miniprogram/pages/table/table.json'));
  assert.equal(app.window.pageOrientation, 'portrait');
  assert.equal(page.pageOrientation, 'portrait');
  assert.equal(app.resizable, true);
});
