// Actual DevTools worker/heartbeat probe on an already completed real hand.
// Instrument API calls only; never change cards, decisions or analysis options.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { seatAtTable } from './seat.mjs';
const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const output = path.resolve(process.argv[3] || '.artifacts/wechat-review-worker');
await mkdir(output, { recursive: true });
const report = { status: 'running', platform: 'WeChat DevTools simulator' };
const page = await seatAtTable(mini, { finished: true });
try {
  assert.equal((await page.data()).done, true, 'Probe needs a completed real hand');
  await mini.evaluate(() => {
    const p = getCurrentPages().at(-1);
    p.closeReview();
    const probe = {
      created: 0,
      terminated: 0,
      messages: [],
      ticks: 0,
      maxGapMs: 0,
      last: Date.now(),
    };
    getApp().__reviewWorkerProbe = probe;
    probe.original = wx.createWorker;
    wx.createWorker = function (...args) {
      const worker = probe.original.apply(this, args);
      probe.created++;
      const terminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        probe.terminated++;
        return terminate();
      };
      const onMessage = worker.onMessage.bind(worker);
      worker.onMessage = (callback) =>
        onMessage((message) => {
          probe.messages.push(message.type);
          callback(message);
        });
      return worker;
    };
    probe.timer = setInterval(() => {
      const now = Date.now();
      probe.ticks++;
      probe.maxGapMs = Math.max(probe.maxGapMs, now - probe.last);
      probe.last = now;
    }, 50);
    p.openReview();
  });
  const started = Date.now();
  while ((await page.data()).reviewData.loading) {
    assert.ok(Date.now() - started < 90000, 'Full-quality review must finish');
    await page.waitFor(100);
  }
  report.elapsedMs = Date.now() - started;
  report.analysis = await mini.evaluate(() => {
    const { created, terminated, messages, ticks, maxGapMs } = getApp().__reviewWorkerProbe;
    return { created, terminated, messages, ticks, maxGapMs };
  });
  assert.equal(report.analysis.created, 1);
  assert.equal(report.analysis.terminated, 1);
  assert.ok(report.analysis.messages.includes('step'));
  assert.ok(report.analysis.messages.includes('complete'));
  assert.ok(report.analysis.ticks > 0);
  assert.ok(
    report.analysis.maxGapMs < 3000,
    'Worker analysis must leave the service thread responsive',
  );
  await mini.screenshot({ path: path.join(output, 'completed.png') });
  await mini.evaluate(() => {
    const p = getCurrentPages().at(-1),
      probe = getApp().__reviewWorkerProbe;
    p.closeReview();
    p.openReview();
    const started = Date.now();
    setTimeout(() => {
      p.closeReview();
      probe.cancelMs = Date.now() - started;
    }, 50);
  });
  await page.waitFor(500);
  report.cancellation = await mini.evaluate(() => {
    const p = getCurrentPages().at(-1),
      probe = getApp().__reviewWorkerProbe;
    return {
      created: probe.created,
      terminated: probe.terminated,
      cancelMs: probe.cancelMs,
      open: p.data.reviewOpen,
    };
  });
  assert.equal(report.cancellation.created, 2);
  assert.equal(report.cancellation.terminated, 2);
  assert.equal(report.cancellation.open, false);
  assert.ok(report.cancellation.cancelMs < 1000);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  await mini.evaluate(() => {
    const probe = getApp().__reviewWorkerProbe;
    if (!probe) return;
    getCurrentPages().at(-1).closeReview();
    clearInterval(probe.timer);
    wx.createWorker = probe.original;
    delete getApp().__reviewWorkerProbe;
  });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini.disconnect();
}
console.log(JSON.stringify(report));
