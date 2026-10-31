// Official DevTools production-controller lifecycle probe. Deals and actions
// are real, externally scripted play; this is not natural human-play evidence.
// No observation/deal fixture, test-mode bundle or hidden cards are injected.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seatAtTable } from './seat.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || '.artifacts/wechat-player-observations-persistence');
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  platform: 'Official WeChat DevTools simulator',
  scope:
    'Production controller, real random deals and externally scripted folds; no fake observations or deals; original page and local user data restored',
  checks: [],
  exceptions: [],
};
let mini,
  backedUp = false,
  stage = 'connect';
const wait = async (predicate, message, timeout = 45000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error(message);
};
const ready = () =>
  wait(
    () => mini.evaluate(() => Boolean(getCurrentPages().at(-1)?._controller)),
    'The real page._controller must become ready before the lifecycle probe',
  );
const read = () =>
  mini.evaluate(() => {
    const page = getCurrentPages().at(-1),
      controller = page._controller,
      game = controller.getGame();
    const backup = getApp().__playerObservationPersistenceProbe;
    if (backup && page !== backup.page && !page._readOnlyAttempt)
      for (const session of controller.getRecordSummaries())
        for (const attempt of session.attempts)
          backup.createdFiles.add(`${encodeURIComponent(attempt.id)}.json`);
    const raw = wx.getStorageSync('noir-player-observations-v1');
    return {
      profile: raw ? JSON.parse(raw) : null,
      imported: {
        version: 1,
        revision: game.playerObservationRevision,
        totalHands: game.playerObservationHands,
        samples: game.players[0].publicReads,
      },
      styles: game.players.slice(1).map((player) => player.botProfile),
      settings: page.data.settings,
      done: game.phase === 'done',
      attempt: game.replayAttempt || 0,
    };
  });
const count = (profile) => ({ revision: profile.revision, totalHands: profile.totalHands });
try {
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9453' });
  mini.on('exception', (exception) => report.exceptions.push({ ...exception, stage }));
  await ready();
  stage = 'preserve-original-page';
  const preserved = await mini.evaluate(() => {
    const pages = getCurrentPages(),
      app = getApp(),
      page = pages.at(-1);
    if (page.route !== 'pages/table/table' || page._readOnlyAttempt)
      throw Error('Return to the live table before running this non-destructive probe');
    if (pages.length > 7) throw Error('At least two free page-stack slots are required');
    if (app.__playerObservationPersistenceProbe)
      throw Error('An earlier probe backup still exists');
    // Stop the original controller before temporarily isolating its index.
    // The original page/game references remain intact, including retry state.
    page.onHide?.();
    const values = Object.fromEntries(
      wx
        .getStorageInfoSync()
        .keys.filter((key) => key.startsWith('noir-'))
        .map((key) => [key, wx.getStorageSync(key)]),
    );
    const fs = wx.getFileSystemManager?.(),
      directory = `${wx.env?.USER_DATA_PATH}/noir-records`;
    let files = [];
    try {
      files = fs.readdirSync(directory);
    } catch {}
    app.__playerObservationPersistenceProbe = {
      page,
      controller: page._controller,
      game: page._controller.getGame(),
      appController: app.noirController,
      tableReady: app.noirTableReady,
      stackLength: pages.length,
      values,
      fs,
      directory,
      files,
      createdFiles: new Set(),
    };
    // An empty temporary archive prevents the probe from pruning any existing
    // user's indexed snapshots. The real profile and settings stay present.
    wx.removeStorageSync('noir-game-records-v1');
    return {
      route: page.route,
      stackLength: pages.length,
      storageKeyCount: Object.keys(values).length,
    };
  });
  backedUp = true;
  report.preserved = preserved;
  report.build = JSON.parse(
    await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
  );
  stage = 'open-isolated-production-table';
  await mini.navigateTo('/pages/table/table');
  await ready();
  const before = await read();
  assert.deepEqual(before.imported, before.profile);
  await seatAtTable(mini, { finished: true });
  const first = await read();
  assert.equal(first.profile.totalHands, before.profile.totalHands + 1);
  assert.ok(first.profile.revision > before.profile.revision);
  assert.deepEqual(first.imported, first.profile);
  assert.deepEqual(first.styles, before.styles);
  assert.deepEqual(Object.keys(first.profile), ['version', 'revision', 'totalHands', 'samples']);
  assert.doesNotMatch(JSON.stringify(first.profile), /hole|deck|winner|payout|stack|botProfile/);
  report.checks.push({
    kind: 'first-real-settlement',
    before: count(before.profile),
    after: count(first.profile),
  });
  stage = 'retry-retraction';
  const rollback = await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller;
    if (!controller.retry()) throw Error('The actual completed hand must be retryable');
    return {
      profile: JSON.parse(wx.getStorageSync('noir-player-observations-v1')),
      attempt: controller.getGame().replayAttempt,
    };
  });
  assert.equal(rollback.attempt, 1);
  assert.equal(rollback.profile.totalHands, before.profile.totalHands);
  assert.deepEqual(rollback.profile.samples, before.profile.samples);
  assert.ok(rollback.profile.revision > first.profile.revision);
  await seatAtTable(mini, { finished: true });
  const replacement = await read();
  assert.equal(replacement.profile.totalHands, before.profile.totalHands + 1);
  assert.ok(replacement.profile.revision > rollback.profile.revision);
  assert.deepEqual(replacement.imported, replacement.profile);
  assert.deepEqual(replacement.styles, before.styles);
  report.checks.push({
    kind: 'retry-and-replacement',
    retracted: count(rollback.profile),
    replacement: count(replacement.profile),
  });
  stage = 'read-only-history';
  const id = await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller,
      game = controller.getGame();
    const row = controller
      .getRecordSummaries()
      .flatMap((session) => session.attempts)
      .filter((attempt) => attempt.status === 'completed' && !attempt.superseded)
      .map((attempt) => controller.getRecord(attempt.id))
      .find(
        (attempt) =>
          attempt?.snapshot?.hand === game.hand &&
          attempt.snapshot.replayAttempt === game.replayAttempt,
      );
    if (!row) throw Error('A real completed archive is required for read-only navigation');
    return row.id;
  });
  await mini.navigateTo(`/pages/history/history?id=${encodeURIComponent(id)}`);
  await ready();
  const history = await read();
  assert.deepEqual(history.profile, replacement.profile);
  assert.equal(await mini.evaluate(() => Boolean(getCurrentPages().at(-1)._readOnlyAttempt)), true);
  await mini.screenshot({ path: path.join(output, 'read-only-history.png') });
  await mini.navigateBack();
  await ready();
  assert.deepEqual((await read()).profile, replacement.profile);
  report.checks.push({ kind: 'real-read-only-history', observationWrites: 0 });
  stage = 'new-game-reuses-profile';
  const reset = await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller;
    controller.reset();
    const game = controller.getGame();
    return {
      profile: JSON.parse(wx.getStorageSync('noir-player-observations-v1')),
      samples: game.players[0].publicReads,
      revision: game.playerObservationRevision,
      totalHands: game.playerObservationHands,
      settings: getCurrentPages().at(-1).data.settings,
    };
  });
  assert.deepEqual(reset.profile, replacement.profile);
  assert.deepEqual(reset.samples, replacement.profile.samples);
  assert.equal(reset.revision, replacement.profile.revision);
  assert.equal(reset.totalHands, replacement.profile.totalHands);
  assert.deepEqual(reset.settings, replacement.settings);
  // Stop the fresh random hand before any unneeded further completion. The
  // next temporary page then creates a new controller from persisted storage.
  await mini.evaluate(() => getCurrentPages().at(-1).onHide());
  await mini.navigateTo('/pages/table/table');
  await ready();
  const reloaded = await read();
  assert.deepEqual(reloaded.profile, replacement.profile);
  assert.deepEqual(reloaded.imported, replacement.profile);
  assert.deepEqual(reloaded.settings, replacement.settings);
  report.checks.push({
    kind: 'new-game-and-new-controller',
    profile: count(reloaded.profile),
    settingsPreserved: true,
  });
  await mini.screenshot({ path: path.join(output, 'new-controller-reuses-profile.png') });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { stage, message: error.message, stack: error.stack };
  if (mini) await mini.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (mini && backedUp) {
    stage = 'restore-original-user-data';
    try {
      await mini.evaluate(() => {
        const backup = getApp().__playerObservationPersistenceProbe;
        for (const page of getCurrentPages().slice(backup.stackLength))
          if (page._controller && !page._readOnlyAttempt)
            for (const session of page._controller.getRecordSummaries())
              for (const attempt of session.attempts)
                backup.createdFiles.add(`${encodeURIComponent(attempt.id)}.json`);
      });
      // Destroy only temporary controllers before restoring storage. Returning
      // to the untouched original page then resumes its genuine private game.
      while (
        await mini.evaluate(
          () =>
            getCurrentPages().length > getApp().__playerObservationPersistenceProbe.stackLength + 1,
        )
      ) {
        await mini.navigateBack();
      }
      const restored = await mini.evaluate(() => {
        const app = getApp(),
          backup = app.__playerObservationPersistenceProbe;
        const pages = getCurrentPages(),
          top = pages.at(-1);
        if (top !== backup.page) {
          top.onHide?.();
          top._controller?.destroy();
          // onUnload will call destroy again during navigateBack. An already
          // disposed temporary controller must not capture its newer test
          // revision after the original user's storage has been restored.
          if (top._controller) top._controller.destroy = () => {};
        }
        for (const key of wx.getStorageInfoSync().keys)
          if (key.startsWith('noir-') && !Object.hasOwn(backup.values, key))
            wx.removeStorageSync(key);
        for (const [key, value] of Object.entries(backup.values)) wx.setStorageSync(key, value);
        let removedFiles = 0;
        try {
          const files = backup.fs.readdirSync(backup.directory);
          for (const file of backup.createdFiles)
            if (!backup.files.includes(file) && files.includes(file)) {
              backup.fs.unlinkSync(`${backup.directory}/${file}`);
              removedFiles++;
            }
        } catch (error) {
          if (backup.fs) throw error;
        }
        app.noirController = backup.appController;
        app.noirTableReady = backup.tableReady;
        const current = Object.fromEntries(
          wx
            .getStorageInfoSync()
            .keys.filter((key) => key.startsWith('noir-'))
            .map((key) => [key, wx.getStorageSync(key)]),
        );
        const same =
          JSON.stringify(Object.entries(current).sort()) ===
          JSON.stringify(Object.entries(backup.values).sort());
        return {
          storageRestored: same,
          originalGamePreserved:
            backup.page._controller === backup.controller &&
            backup.controller.getGame() === backup.game,
          removedFiles,
        };
      });
      assert.equal(restored.storageRestored, true);
      assert.equal(restored.originalGamePreserved, true);
      if (
        await mini.evaluate(
          () => getCurrentPages().at(-1) !== getApp().__playerObservationPersistenceProbe.page,
        )
      )
        await mini.navigateBack();
      const returned = await mini.evaluate(() => {
        const backup = getApp().__playerObservationPersistenceProbe;
        if (getCurrentPages().at(-1) !== backup.page) return null;
        // A failed navigation before leaving the original page needs its
        // manually hidden controller resumed explicitly.
        if (backup.page._hidden) backup.page.onShow?.();
        const current = Object.fromEntries(
          wx
            .getStorageInfoSync()
            .keys.filter((key) => key.startsWith('noir-'))
            .map((key) => [key, wx.getStorageSync(key)]),
        );
        const storageRestoredAfterReturn =
          JSON.stringify(Object.entries(current).sort()) ===
          JSON.stringify(Object.entries(backup.values).sort());
        if (!storageRestoredAfterReturn)
          throw Error('Returning to the original page modified restored storage');
        delete getApp().__playerObservationPersistenceProbe;
        return { returnedToOriginalPage: true, storageRestoredAfterReturn };
      });
      assert.ok(returned);
      report.restoration = { ...restored, ...returned };
    } catch (error) {
      report.status = 'failed';
      report.restoreError = { message: error.message, stack: error.stack };
      process.exitCode = 1;
    }
  }
  if (mini) mini.disconnect();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checks: report.checks,
        restoration: report.restoration,
        error: report.error,
        restoreError: report.restoreError,
      },
      null,
      2,
    ),
  );
}
