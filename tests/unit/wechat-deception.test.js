import test from 'node:test';
import assert from 'node:assert/strict';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { deceptiveRecords } from '../fixtures/deceptive-decisions.js';
import { reviewedAllInGame } from '../fixtures/all-in-decisions.js';

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
      /(?=.*埋牌)(?=.*(?:平跟|只补))/,
      /(?=.*埋牌)(?=.*过牌)/,
      /(?=.*埋牌)(?=.*只跟)/,
      /脏牌开池/,
      /脏牌再加注/,
      /donk.*先领打/,
      /donk.*付费/,
      /2–7.*(?:开池|偷盲)/,
      /(?=.*2–7)(?=.*本轮已经过牌)(?=.*诈唬)/,
    ];
    result.opponents.forEach((meta, index) => {
      assert.equal(meta.analyzed, false);
      const r = { ...meta, ...c.reviewOpponent(index) };
      assert.match(r.reason, expected[index]);
      assert.equal(r.metrics, undefined);
      assert.doesNotMatch(r.reason, /它|EV|模型|模拟器|抽样|奖励/);
      assert.ok(!('checks' in r) && !('axes' in r));
    });
  } finally {
    c.destroy();
  }
});

test('WeChat transports real all-in and near-all-in motives without numeric or developer panels', () => {
  for (const [kind, action, cost] of [
    ['flop-qq', 'call', '4.95K'],
    ['multi-qq', 'fold', '4.85K'],
    ['shared-royal', 'call', '4.95K'],
    ['deep-nonallin', 'call', '3.85K'],
  ]) {
    const queue = new Map();
    let ticket = 0;
    const controller = createWechatController({
      publish() {},
      storage: { getItem: () => null, setItem() {} },
      schedule(fn) {
        queue.set(++ticket, fn);
        return ticket;
      },
      unschedule(id) {
        queue.delete(id);
      },
    });
    try {
      controller.start();
      const game = reviewedAllInGame(kind);
      assert.equal(game.botDecisions[0].action, action);
      Object.assign(controller.getGame(), game);
      let report;
      controller.review((value) => {
        report = value;
      });
      for (let count = 0; report.loading; count++) {
        assert.ok(count < 20);
        const [id, callback] = queue.entries().next().value;
        queue.delete(id);
        callback();
      }
      assert.equal(report.opponents.length, 1);
      const step = { ...report.opponents[0], ...controller.reviewOpponent(0) };
      assert.match(step.reason, new RegExp(cost));
      assert.ok(step.reason.includes(game.botDecisions[0].name));
      assert.equal(step.metrics, undefined);
      assert.equal(step.ev, undefined);
      assert.doesNotMatch(step.reason, /它|EV|模型|模拟器|抽样|价格门槛/);
      assert.ok(!('checks' in step) && !('axes' in step) && !('allIn' in step));
      if (kind === 'shared-royal') assert.match(step.reason, /平分底池/);
      if (kind === 'deep-nonallin')
        assert.doesNotMatch(step.reason, /全下者已|之后只能等|跟完就已全下/);
    } finally {
      controller.destroy();
    }
  }
});
