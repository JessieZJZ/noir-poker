import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { profileDetailBounds } from '../../src/ui/profile-layout.js';

function load() {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(
      new URL('../../miniprogram/pages/table/profile-detail.wxs', import.meta.url),
      'utf8',
    ),
    { module },
  );
  return module.exports;
}

test('the mini program introduction follows the settings scroll exactly as on Web', () => {
  const { place } = load();
  const viewTop = 120;
  for (const geometry of [
    // Phone: choices taller than the settings view, opened at their top.
    { gridOffset: 600, gridHeight: 720, viewHeight: 560, height: 560, top: 0 },
    // Opened 60px above the choices to fit, as when a lower card was tapped.
    { gridOffset: 600, gridHeight: 720, viewHeight: 560, height: 560, top: -60 },
    // Tablet: choices shorter than the view, opened low so it starts above them.
    { gridOffset: 900, gridHeight: 300, viewHeight: 700, height: 300, top: -120 },
  ])
    for (let scrollTop = 0; scrollTop <= 1600; scrollTop += 40) {
      const web = profileDetailBounds({
        region: { top: viewTop + geometry.gridOffset - scrollTop, height: geometry.gridHeight },
        viewport: { top: viewTop, bottom: viewTop + geometry.viewHeight },
        clientHeight: geometry.viewHeight,
        opened: geometry.top,
      });
      assert.equal(
        place(geometry, scrollTop),
        web.top,
        `${JSON.stringify(geometry)} @${scrollTop}`,
      );
    }
});

test('a settings scroll moves the open introduction and still reaches the page', () => {
  const { sync, scroll } = load();
  const state = {},
    styles = [],
    calls = [];
  const panel = { getState: () => state, setStyle: (style) => styles.push(style) };
  let open = true;
  const owner = {
    selectComponent: (selector) => (selector === '#profile-detail' && open ? panel : null),
    callMethod: (name, value) => calls.push([name, value]),
  };
  sync(
    { gridOffset: 600, gridHeight: 720, viewHeight: 560, height: 560, top: 0 },
    null,
    owner,
    panel,
  );
  scroll({ detail: { scrollTop: 700 } }, owner);
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(styles), [{ top: '100px' }]);
  assert.deepEqual(plain(calls), [['settingsScrolled', { detail: { scrollTop: 700 } }]]);
  // Closed, or opened before its place was measured: only the page hears it.
  open = false;
  scroll({ detail: { scrollTop: 20 } }, owner);
  open = true;
  sync({ top: 0, height: 400 }, null, owner, panel);
  scroll({ detail: { scrollTop: 30 } }, owner);
  assert.equal(styles.length, 1);
  assert.equal(calls.length, 3);
});
