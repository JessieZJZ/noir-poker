import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';

const compatibilitySource = readFileSync(
  new URL('../../src/platform/wechat-compat.js', import.meta.url),
  'utf8',
);
function oldRuntime() {
  const context = vm.createContext({});
  vm.runInContext(
    `delete Array.prototype.at;
     delete Array.prototype.findLast;
     delete Array.prototype.flatMap;
     delete Object.hasOwn;
     delete Object.fromEntries;`,
    context,
  );
  return context;
}
function install(context) {
  vm.runInContext(`(function () { ${compatibilitySource} })();`, context);
}

test('WeChat compatibility installs only missing built-ins and preserves modern implementations', () => {
  const context = vm.createContext({});
  vm.runInContext(
    `globalThis.originalAt = Array.prototype.at;
     globalThis.originalFromEntries = Object.fromEntries;`,
    context,
  );
  install(context);
  assert.equal(
    vm.runInContext(
      'Array.prototype.at === originalAt && Object.fromEntries === originalFromEntries',
      context,
    ),
    true,
  );
});

test('WeChat missing built-ins support negative indexes, sparse mapping and safe object keys', () => {
  const context = oldRuntime();
  install(context);
  const result = JSON.parse(
    vm.runInContext(
      `JSON.stringify({
        at: [[10, 20, 30].at(-1), [10, 20, 30].at(-2), [10, 20].at(NaN), [10].at(Infinity) ?? null],
        mapped: [1, , 3].flatMap(value => [value, , value * 2]),
        last: [1, 2, 3, 4].findLast(value => value % 2 === 0),
        own: Object.hasOwn(Object.create({ inherited: true }), 'inherited'),
        entries: Object.fromEntries([['a', 1], ['__proto__', 'own data']]),
        enumerable: Object.keys(Array.prototype).includes('at')
      })`,
      context,
    ),
  );
  assert.deepEqual(result.at, [30, 20, 10, null]);
  assert.deepEqual(result.mapped, [1, 2, 3, 6]);
  assert.equal(result.last, 4);
  assert.equal(result.own, false);
  assert.equal(result.entries.a, 1);
  assert.equal(result.entries.__proto__, 'own data');
  assert.equal(result.enumerable, false);
});

test('WeChat compiled controller completes a real nine-seat hand without modern built-ins or DOM', () => {
  const context = oldRuntime();
  context.module = { exports: {} };
  context.exports = context.module.exports;
  const bundle = buildSync({
    stdin: {
      contents: `import './wechat-compat.js';
        export { createWechatController } from './wechat-controller.js';
        export { act, potSize } from '../engine/poker.js';`,
      resolveDir: new URL('../../src/platform/', import.meta.url).pathname,
      loader: 'js',
    },
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2019',
    write: false,
  }).outputFiles[0].text;
  vm.runInContext(bundle, context);
  const pending = new Map();
  let id = 0;
  let latest;
  const api = context.module.exports;
  const controller = api.createWechatController({
    storage: {
      getItem: () => '{"playerCount":9,"hints":false}',
      setItem: () => {},
    },
    publish: (value) => {
      latest = JSON.parse(JSON.stringify(value));
    },
    schedule: (fn) => {
      pending.set(++id, fn);
      return id;
    },
    unschedule: (job) => pending.delete(job),
  });
  try {
    controller.start();
    const game = controller.getGame();
    while (game.actor !== 0) api.act(game, game.actor, 'call');
    controller.preset('all');
    controller.action('raise');
    while (game.phase === 'playing') api.act(game, game.actor, 'call');
    controller.hide();
    controller.show();
    for (let step = 0; game.phase !== 'done'; step++) {
      assert.ok(step < 10);
      const [job, fn] = pending.entries().next().value ?? [];
      assert.ok(fn, 'runout must remain scheduled');
      pending.delete(job);
      fn();
    }
    assert.equal(game.board.length, 5);
    assert.equal(game.stats.hands, 1);
    assert.equal(
      game.players.reduce((sum, player) => sum + player.stack, 0),
      180000,
    );
    assert.equal(latest.seats.length, 8);
    assert.equal(latest.done, true);
    assert.equal(controller.retry(), true);
    assert.equal(game.stats.hands, 0);
    assert.equal(api.potSize(game), 300);
    assert.equal(
      vm.runInContext('typeof document + ":" + typeof window', context),
      'undefined:undefined',
    );
  } finally {
    controller.destroy();
  }
});
