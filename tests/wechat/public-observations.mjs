// External constructed history only. The installed mini-program controller
// executes the actual first bot decision; no fixture code enters the bundle.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { coldShoveResponse, pendingShoveResponse } from '../fixtures/all-in-decisions.js';
import { observedSqueeze } from '../fixtures/observed-preflop.js';
import { seatAtTable } from './seat.mjs';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || '.artifacts/wechat-public-observations');
mkdirSync(output, { recursive: true });
const report = {
  platform: 'Official WeChat DevTools simulator',
  status: 'running',
  checks: [],
  exceptions: [],
};
let mini, original;
let stage = 'launch';
try {
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9453' });
  mini.on('exception', (e) => report.exceptions.push({ ...e, stage }));
  const initialDeadline = Date.now() + 45000;
  while (!(await mini.evaluate(() => Boolean(getCurrentPages().slice(-1)[0]?._controller)))) {
    if (Date.now() >= initialDeadline)
      throw Error('The real mini-program controller did not become ready before reLaunch');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  // Each run owns this project's page. Start with fresh presentation timers,
  // including after a retained failed fixture run; do not reuse its view arrays.
  await mini.reLaunch('/pages/table/table');
  const page = await seatAtTable(mini, { finished: true });
  await mini.evaluate(() => {
    const page = getCurrentPages().at(-1);
    page.__publicReadOriginalSetData = page.setData;
    page.__publicReadBridge = { calls: 0, totalBytes: 0, largestPatchBytes: 0 };
    page.setData = function (patch, callback) {
      const bytes = encodeURIComponent(JSON.stringify(patch)).replace(/%[A-F\d]{2}/g, 'x').length;
      const metrics = this.__publicReadBridge;
      metrics.calls++;
      metrics.totalBytes += bytes;
      metrics.largestPatchBytes = Math.max(metrics.largestPatchBytes, bytes);
      return this.__publicReadOriginalSetData(patch, callback);
    };
  });
  report.build = JSON.parse(readFileSync(path.join(root, '.artifacts/wechat/build-info.json')));
  original = await mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame());
  const game = coldShoveResponse('As Kd');
  game.difficulty = 'hard';
  game.decisions = [];
  game.players[0].publicReads = Array.from({ length: 32 }, () => ({
    hands: 1,
    voluntaryHands: 1,
    raisingHands: 1,
    largeRaiseHands: 1,
    postActions: 4,
    postRaises: 4,
  }));
  stage = 'observed-shove';
  const first = await mini.evaluate((fixture) => {
    const page = getCurrentPages().at(-1);
    const controller = page._controller;
    // A fixture bypasses the normal hand/setting transition. Cancel the page's
    // pending motion and layout callbacks as well as controller bot timers.
    page.onHide();
    const live = controller.getGame();
    Object.assign(live, fixture);
    page.onShow();
    const before = Math.random;
    let seed = 73;
    try {
      Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      controller.finishHand();
    } finally {
      Math.random = before;
    }
    const record = live.botDecisions[0];
    return {
      action: record.action,
      equity: record.trace.equity,
      model: record.trace.view.publicReadModel,
      opponentRead: record.trace.view.opponents.find((p) => p.id === 0).publicRead,
      presentedSeatIds: page.data.seats.map((seat) => seat.id),
      presentedPhoneSeatIds: page.data.phoneSeats.map((seat) => seat.id),
    };
  }, game);
  assert.equal(first.action, 'call');
  assert.equal(first.model, 'observed-public-actions-v1');
  assert.equal(first.opponentRead.hands, 32);
  assert.equal(first.opponentRead.largeRaiseHands, 32);
  const expectedSeatIds = game.players.slice(1).map((player) => player.id);
  assert.deepEqual(first.presentedSeatIds, expectedSeatIds);
  assert.deepEqual(first.presentedPhoneSeatIds, expectedSeatIds);
  report.checks.push({ kind: 'bundled-policy-execution', ...first });
  const wait = async (condition) => {
    const started = Date.now();
    while (!condition(await page.data())) {
      if (Date.now() - started > 45000)
        throw Error('The actual mini-program did not reach the expected review state');
      await page.waitFor(150);
    }
  };
  await wait((data) => data.done);
  const settledSeatIds = await mini.evaluate(() => {
    const page = getCurrentPages().at(-1);
    return {
      seats: page.data.seats.map((seat) => seat.id),
      phoneSeats: page.data.phoneSeats.map((seat) => seat.id),
    };
  });
  assert.deepEqual(settledSeatIds.seats, expectedSeatIds);
  assert.deepEqual(settledSeatIds.phoneSeats, expectedSeatIds);
  const show = async () => {
    await mini.evaluate(() => getCurrentPages().at(-1).openReview());
    await wait((data) => !data.reviewData.loading);
    await (await page.$('[data-value="opponent"]')).tap();
    await wait((data) => data.reviewPerspective === 'opponent' && data.reviewSteps.length > 0);
    await (await page.$('.review-step[data-index="0"]')).tap();
    await wait((data) => data.reviewIndex === 0);
    const step = (await page.data()).selectedReviewStep;
    assert.match(step.reason, /Mia结合你此前 32 手中 32 手翻前大额加注/);
    assert.match(step.reason, /保留了更多非顶级起手牌/);
    assert.doesNotMatch(step.reason, /机器人|建议|EV|模型|抽样/);
    const texts = await page.$$('.review-coaching text');
    assert.match((await Promise.all(texts.map((el) => el.text()))).join(''), /此前 32 手中 32 手/);
    return step.reason;
  };
  stage = 'review-and-reopen';
  const reason = await show();
  await mini.evaluate(() => getCurrentPages().at(-1).closeReview());
  assert.equal(await show(), reason);
  report.checks.push({ kind: 'causal-review-and-reopen', reason });
  const scroll = await page.$('.review-sheet .sheet-scroll');
  const box = await scroll.offset();
  const content = await (await page.$('.review-coaching')).offset();
  await scroll.scrollTo(0, (await scroll.property('scrollTop')) + content.top - box.top - 12);
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, 'observed-defense.png') });
  const squeezed = observedSqueeze({ count: original.players.length });
  stage = 'observed-squeeze';
  await mini.evaluate((fixture) => {
    const page = getCurrentPages().at(-1);
    page.closeReview();
    const controller = page._controller;
    page.onHide();
    Object.assign(controller.getGame(), fixture);
    getApp().__publicReadRandomOriginal = Math.random;
    let seed = 73;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    page.onShow();
  }, squeezed);
  let defense = null;
  const defenseStart = Date.now();
  while (!defense) {
    defense = await mini.evaluate(() => {
      const controller = getCurrentPages().at(-1)._controller;
      const record = controller.getGame().botDecisions[0];
      if (!record) return null;
      getCurrentPages().at(-1).onHide();
      Math.random = getApp().__publicReadRandomOriginal;
      delete getApp().__publicReadRandomOriginal;
      return {
        action: record.action,
        reason: record.trace.reason,
        observedDefense: record.trace.observedDefense,
        equity: record.trace.equity,
        required: record.trace.requiredEquity,
        model: record.trace.view.publicReadModel,
        opponentReads: record.trace.view.opponents.map((p) => ({ id: p.id, read: p.publicRead })),
      };
    });
    if (Date.now() - defenseStart > 45000)
      throw Error('The bundled observed squeeze response did not execute');
    if (!defense) await page.waitFor(150);
  }
  report.checks.push({ kind: 'bundled-observed-squeeze-defense', ...defense });
  assert.notEqual(defense.action, 'fold');
  assert.equal(defense.observedDefense.hands, 32);
  assert.ok(defense.observedDefense.realizedEquity >= defense.observedDefense.required + 0.04);
  stage = 'pending-shove-fold';
  const pending = await mini.evaluate((fixture) => {
    const page = getCurrentPages().at(-1);
    page.closeReview();
    page.onHide();
    const controller = page._controller;
    const game = controller.getGame();
    Object.assign(game, fixture);
    const originalRandom = Math.random;
    let seed = 1;
    try {
      Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      page.onShow();
      controller.finishHand();
    } finally {
      Math.random = originalRandom;
    }
    const record = game.botDecisions[0];
    return {
      action: record.action,
      equity: record.trace.equity,
      odds: record.trace.odds,
      required: record.trace.requiredEquity,
      pendingResponses: record.trace.view.actionContext.pendingResponseIds.length,
    };
  }, pendingShoveResponse());
  assert.equal(pending.action, 'fold');
  assert.equal(pending.pendingResponses, 5);
  assert.ok(pending.equity > pending.odds && pending.equity < pending.required);
  await wait((data) => data.done);
  await mini.evaluate(() => getCurrentPages().at(-1).openReview());
  await wait((data) => !data.reviewData.loading);
  await (await page.$('[data-value="opponent"]')).tap();
  await wait((data) => data.reviewPerspective === 'opponent' && data.reviewSteps.length > 0);
  await (await page.$('.review-step[data-index="0"]')).tap();
  await wait((data) => data.reviewIndex === 0);
  const pendingReason = (await page.data()).selectedReviewStep.reason;
  assert.match(pendingReason, /Q♣ Q♠/);
  assert.match(pendingReason, /后面 5 位尚未回应这次全下的玩家会用强牌跟入/);
  assert.doesNotMatch(pendingReason, /这次没有用当前起手牌|机器人|建议|EV|模型|抽样/);
  const pendingTexts = await page.$$('.review-coaching text');
  assert.match(
    (await Promise.all(pendingTexts.map((el) => el.text()))).join(''),
    /后面 5 位尚未回应这次全下/,
  );
  report.checks.push({ kind: 'pending-shove-fold-review', ...pending, reason: pendingReason });
  report.bridge = await mini.evaluate(() => getCurrentPages().at(-1).__publicReadBridge);
  assert.ok(report.bridge.calls > 0);
  assert.ok(report.bridge.largestPatchBytes < 1024 * 1024);
  assert.equal(report.exceptions.length, 0);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  if (mini) await mini.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (mini && original)
    await mini
      .evaluate((game) => {
        const page = getCurrentPages().at(-1);
        if (page.__publicReadOriginalSetData) {
          page.setData = page.__publicReadOriginalSetData;
          delete page.__publicReadOriginalSetData;
        }
        if (getApp().__publicReadRandomOriginal) {
          Math.random = getApp().__publicReadRandomOriginal;
          delete getApp().__publicReadRandomOriginal;
        }
        page.closeReview();
        page.onHide();
        Object.assign(page._controller.getGame(), game);
        page.onShow();
      }, original)
      .catch(() => {});
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
