import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const module = { exports: {} };
vm.runInNewContext(
  readFileSync(new URL('../../miniprogram/record-navigation.js', import.meta.url), 'utf8'),
  { module, wx: {}, getCurrentPages: () => [] },
);
const { createRecordNavigation } = module.exports;
function setup() {
  const game = { route: 'pages/table/table' };
  const stack = [game];
  const calls = [];
  let completion;
  const api = Object.fromEntries(
    ['navigateTo', 'redirectTo', 'navigateBack', 'reLaunch'].map((method) => [
      method,
      (options) => {
        calls.push([method, options]);
        completion = () => {
          const route = options.url?.split('?')[0].replace(/^\//, '');
          if (method === 'navigateTo') stack.push({ route });
          if (method === 'redirectTo') stack[stack.length - 1] = { route };
          if (method === 'navigateBack') stack.splice(stack.length - options.delta);
          if (method === 'reLaunch') stack.splice(0, stack.length, { route });
          options.complete();
        };
      },
    ]),
  );
  return {
    game,
    stack,
    calls,
    finish: () => completion(),
    nav: createRecordNavigation({ api, pages: () => stack }),
  };
}

test('WeChat records routes have one game, one list and one replaceable detail despite double taps', () => {
  const { nav, stack, calls, game, finish } = setup();
  assert.equal(nav.openRecords(), true);
  assert.equal(game._browsingRecords, true);
  assert.equal(nav.openRecords(), false);
  finish();
  assert.equal(nav.openRecords(), false);
  assert.equal(stack.length, 2);
  assert.equal(nav.openHand('first id'), true);
  assert.equal(nav.openHand('double tap'), false);
  assert.match(calls.at(-1)[1].url, /id=first%20id$/);
  finish();
  assert.equal(stack.length, 3);
  nav.openHand('second');
  assert.equal(calls.at(-1)[0], 'redirectTo');
  finish();
  assert.equal(stack.length, 3);
  nav.openRecords();
  assert.equal(calls.at(-1)[0], 'navigateBack');
  assert.equal(calls.at(-1)[1].delta, 1);
  finish();
  assert.equal(stack.length, 2);
  nav.openHand('third');
  finish();
  // Records have no return button; native Back pops the detail and the list.
  stack.splice(1);
  assert.equal(stack.length, 1);
  for (let i = 0; i < 8; i++) {
    nav.openRecords();
    finish();
    nav.openHand(String(i));
    finish();
    // A native edge gesture/hardware Back pops the detail to the retained list.
    stack.pop();
    assert.equal(stack.at(-1).route, 'pages/records/records');
    stack.pop();
    assert.equal(stack.length, 1);
  }
});

test('WeChat failed navigation releases the pending guard and can retry', () => {
  let options;
  let failures = 0;
  const nav = createRecordNavigation({
    api: {
      navigateTo(value) {
        options = value;
      },
    },
    pages: () => [{ route: 'pages/table/table' }],
  });
  nav.openRecords({ fail: () => failures++ });
  options.fail();
  options.complete();
  assert.equal(failures, 1);
  assert.equal(nav.openRecords(), true);
});
