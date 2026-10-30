import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
  for (const route of ['table/table', 'history/history', 'records/records', 'source/source'])
    assert.match(
      read(`miniprogram/pages/${route}.wxml`),
      /^<page-meta\s[^>]*page-orientation="\{\{pageOrientation\}\}"/,
    );
  assert.doesNotMatch(read('miniprogram/pages/table/table-surface.wxml'), /<page-meta/);
  assert.match(read('miniprogram/pages/table/table.wxml'), /include src=".\/table-surface.wxml"/);
  assert.match(
    read('miniprogram/pages/history/history.wxml'),
    /include src="..\/table\/table-surface.wxml"/,
  );
});

test('WeChat tablet orientation uses the full screen and remains stable through split screen and keyboards', () => {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(new URL('../../miniprogram/device-orientation.js', import.meta.url), 'utf8'),
    { module },
  );
  const { pageOrientation } = module.exports;
  for (const [short, expected] of [
    [599, 'portrait'],
    [600, 'auto'],
    [820, 'auto'],
  ]) {
    const app = {};
    assert.equal(
      pageOrientation(
        {},
        {
          screenWidth: short,
          screenHeight: 1180,
          windowWidth: 390,
          windowHeight: 500,
        },
        app,
      ),
      expected,
    );
    assert.equal(
      pageOrientation(
        {},
        {
          screenWidth: 1180,
          screenHeight: short,
          windowWidth: 500,
          windowHeight: 390,
        },
        app,
      ),
      expected,
    );
  }
  assert.equal(
    pageOrientation(
      { getDeviceInfo: () => ({ model: 'iPad Pro' }) },
      {
        windowWidth: 375,
        windowHeight: 700,
      },
      {},
    ),
    'auto',
  );
  const app = {};
  assert.equal(pageOrientation({}, { windowWidth: 390, windowHeight: 844 }, app), 'portrait');
  // The legacy-runtime fallback may change after a genuine device resize.
  assert.equal(pageOrientation({}, { windowWidth: 820, windowHeight: 1180 }, app), 'auto');
  assert.equal(
    pageOrientation(
      {
        getDeviceInfo() {
          throw Error('unavailable');
        },
      },
      {
        screenWidth: 844,
        screenHeight: 390,
        windowWidth: 844,
        windowHeight: 390,
      },
      {},
    ),
    'portrait',
  );
});

test('rendered viewport watching remeasures changed widths and cancels hidden-page callbacks', () => {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(new URL('../../miniprogram/device-orientation.js', import.meta.url), 'utf8'),
    { module },
  );
  const { watchWindow, stopWindowWatch } = module.exports;
  const measurements = [],
    observers = [],
    sizes = [];
  const page = {
    createSelectorQuery() {
      return {
        selectViewport() {
          return this;
        },
        boundingClientRect(callback) {
          measurements.push(callback);
          return this;
        },
        exec() {},
      };
    },
    createMediaQueryObserver() {
      const observer = {
        disconnect() {
          this.disconnected = true;
        },
        observe(query, callback) {
          this.query = query;
          this.callback = callback;
        },
      };
      observers.push(observer);
      return observer;
    },
    onResize(event) {
      sizes.push(event.detail.size);
    },
  };
  watchWindow(page);
  measurements[0]({ width: 834.25, height: 1112 });
  assert.deepEqual({ ...observers[0].query }, { minWidth: 834, maxWidth: 835 });
  observers[0].callback({ matches: true });
  assert.equal(measurements.length, 1);
  observers[0].callback({ matches: false });
  assert.equal(observers[0].disconnected, true);
  measurements[1]({ width: 1112, height: 834 });
  assert.equal(sizes.length, 2);
  assert.equal(sizes[1].windowWidth, 1112);
  watchWindow(page);
  stopWindowWatch(page);
  measurements[2]({ width: 834, height: 1112 });
  assert.equal(sizes.length, 2, 'late measurements from hidden pages cannot resize the game');
  assert.equal(observers[1].disconnected, true);
});
