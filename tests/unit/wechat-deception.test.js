import test from 'node:test';
import assert from 'node:assert/strict';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { deceptiveRecords } from '../fixtures/deceptive-decisions.js';

test('WeChat review transports the executed deceptive logic from the shared engine without redundant data', () => {
  const queue = new Map();
  let id = 0;
  const c = createWechatController({
    publish() {},
    storage: { getItem: () => null, setItem() {} },
    schedule(fn) {
      queue.set(++id, fn);
      return id;
    },
    unschedule(ticket) {
      queue.delete(ticket);
    },
  });
  try {
    c.start();
    const g = c.getGame();
    g.phase = 'done';
    g.decisions = [];
    g.botDecisions = deceptiveRecords();
    let result;
    c.review((r) => (result = r));
    for (let i = 0; queue.size && i < 20; i++) {
      const [ticket, fn] = queue.entries().next().value;
      queue.delete(ticket);
      fn();
    }
    assert.equal(result.loading, false);
    assert.equal(result.opponents.length, 9);
    const expected = [
      /平跟埋牌/,
      /过牌埋牌/,
      /只跟注埋牌/,
      /脏牌开池/,
      /脏牌再加注/,
      /donk.*先领打/,
      /donk.*付费/,
      /2–7.*开池/,
      /2–7.*试探下注/,
    ];
    result.opponents.forEach((r, index) => {
      assert.match(r.reason, expected[index]);
      assert.ok(r.metrics.length <= 2);
      assert.ok(!('checks' in r) && !('axes' in r));
    });
  } finally {
    c.destroy();
  }
});
