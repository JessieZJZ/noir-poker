import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(new URL('../../miniprogram/pages/table/raise-rail.wxs', import.meta.url), 'utf8'),
    { module },
  );
  const api = module.exports,
    state = {},
    calls = [],
    styles = [];
  const track = { getBoundingClientRect: () => ({ left: 100, width: 400 }) };
  const hit = { getState: () => state };
  const owner = {
    selectComponent: (id) =>
      id === '#raise-track'
        ? track
        : id === '#raise-hit'
          ? hit
          : { setStyle: (value) => styles.push(value.left) },
    callMethod: (name, value) => calls.push({ name, value }),
  };
  api.sync({ key: 'one', position: 250000, enabled: true }, null, owner, hit);
  const event = (x, time = 0, id = 7) => ({
    timeStamp: time,
    touches: [{ clientX: x, identifier: id }],
    changedTouches: [{ clientX: x, identifier: id }],
  });
  return { api, state, calls, styles, owner, hit, event, track };
}

test('WXS track responds immediately while the service is stalled, and commits the raw position once', () => {
  const f = fixture();
  f.api.start(f.event(180), f.owner);
  assert.equal(f.styles.at(-1), '20%');
  f.api.move(f.event(392.4936, 70), f.owner);
  assert.equal(f.styles.at(-1), '73.1234%');
  // These service messages have not been processed, but the thumb already moved.
  assert.equal(f.calls.length, 2);
  f.api.sync({ key: 'one', position: 250000, enabled: true }, null, f.owner, f.hit);
  assert.equal(f.styles.at(-1), '73.1234%');
  f.api.end(f.event(392.4936, 80), f.owner);
  f.api.tap({ timeStamp: 81, detail: { x: 392.4936 } }, f.owner);
  const commits = f.calls.filter((c) => c.name === 'railCommit');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].value.position, 731234);
  assert.equal(f.styles.at(-1), '73.1234%');
  f.api.tap({ timeStamp: 90, detail: { x: 300 } }, f.owner);
  assert.equal(f.styles.at(-1), '50%', 'a quick independent click must not be suppressed');
});

test('WXS track clamps endpoints and cancels changed decisions, other fingers and interrupted touches', () => {
  const f = fixture();
  f.api.start(f.event(-10), f.owner);
  assert.equal(f.styles.at(-1), '0%');
  f.api.move(f.event(900, 60, 8), f.owner);
  assert.equal(f.styles.at(-1), '0%');
  f.api.move(f.event(900, 90), f.owner);
  assert.equal(f.styles.at(-1), '100%');
  f.api.cancel(f.event(900, 100), f.owner);
  assert.equal(f.styles.at(-1), '25%');
  f.api.end(f.event(900, 110), f.owner);
  assert.equal(f.calls.filter((c) => c.name === 'railCommit').length, 0);
  f.api.start(f.event(300, 200), f.owner);
  f.api.sync({ key: 'two', position: 500000, enabled: false }, null, f.owner, f.hit);
  f.api.end(f.event(400, 220), f.owner);
  assert.equal(f.styles.at(-1), '50%');
  assert.equal(f.calls.filter((c) => c.name === 'railCommit').length, 0);
});

test('a standalone rail tap paints and commits its location without waiting for a geometry bridge', () => {
  const f = fixture();
  f.api.tap({ timeStamp: 200, detail: { x: 400 } }, f.owner);
  assert.equal(f.styles.at(-1), '75%');
  assert.equal(f.calls.at(-1).name, 'railCommit');
  assert.equal(f.calls.at(-1).value.position, 750000);
  f.api.tap({ timeStamp: 900 }, f.owner);
  assert.equal(f.styles.at(-1), '50%', 'coordinate-free activation uses the centre');
});
