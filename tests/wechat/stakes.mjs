// Actual DevTools controller checks; no game mutation or production fixtures.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { legalActions, potSize } from '../../src/engine/poker.js';
import { DEFAULT_STAKES } from '../../src/engine/stakes.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(root, process.argv[3] || '.artifacts/wechat-stakes');
await mkdir(output, { recursive: true });
const report = {
  platform: 'WeChat DevTools simulator',
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
  exceptions: [],
};
const buildPath = path.join(root, '.artifacts/wechat/build-info.json');
const custom = { smallBlind: 500, bigBlind: 1000, startingStack: 100000, chipUnit: 500 };
let mini, page, savedSettings;

const game = () => mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame());
const wait = async (name, predicate, timeout = 60000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const current = await game();
    if (predicate(current)) return current;
    await page.waitFor(100);
  }
  throw Error(`${name}: controller did not reach the expected state within ${timeout}ms`);
};
const waitHero = () =>
  wait('Hero turn', (current) => current.phase === 'playing' && current.actor === 0);
const verifyChips = (current, expectedWealth) => {
  const unit = current.stakes.chipUnit;
  const amounts = [
    current.currentBet,
    current.minRaise,
    ...current.players.flatMap((player) => [player.stack, player.bet, player.total]),
    ...current.history.map((entry) => entry.amount),
    ...current.payouts,
    ...current.refunds.map((refund) => refund.amount),
    ...current.pots.flatMap((pot) => [pot.amount, ...pot.awards.map((award) => award.amount)]),
  ];
  for (const amount of amounts)
    assert.ok(
      Number.isSafeInteger(amount) && amount >= 0 && amount % unit === 0,
      `Amount ${amount} must be a whole ${unit}-denomination chip`,
    );
  const stacks = current.players.reduce((sum, player) => sum + player.stack, 0);
  assert.equal(stacks + (current.phase === 'done' ? 0 : potSize(current)), expectedWealth);
};
const verifyFresh = (current, stakes) => {
  assert.deepEqual(current.stakes, stakes);
  assert.equal(current.smallBlind, stakes.smallBlind);
  assert.equal(current.bigBlind, stakes.bigBlind);
  assert.equal(current.chipUnit, stakes.chipUnit);
  assert.equal(current.hand, 1);
  assert.equal(current.phase, 'playing');
  assert.equal(current.street, 0);
  assert.deepEqual(current.stats, { hands: 0, wins: 0, buyin: stakes.startingStack });
  assert.deepEqual(current.decisions, []);
  assert.deepEqual(current.payouts, []);
  assert.deepEqual(current.refunds, []);
  assert.deepEqual(current.pots, []);
  assert.deepEqual(current.winners, []);
  for (const player of current.players)
    assert.equal(player.stack + player.total, stakes.startingStack);
  verifyChips(current, current.players.length * stakes.startingStack);
  for (const decision of current.botDecisions) {
    assert.equal(decision.trace.view.bigBlind, stakes.bigBlind);
    assert.equal(decision.trace.view.chipUnit, stakes.chipUnit);
    assert.equal(decision.trace.view.legal.chipUnit, stakes.chipUnit);
  }
};
const capture = async (name) => {
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, `${name}.png`) });
};
const settingsWithoutStakes = ({ stakes, ...settings }) => settings;

try {
  report.build = JSON.parse(await readFile(buildPath, 'utf8'));
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9432' });
  mini.on('exception', (exception) => report.exceptions.push(exception));
  page = await mini.currentPage();
  savedSettings = await mini.evaluate(() => getCurrentPages().at(-1)._controller.getSettings());
  assert.deepEqual(savedSettings.stakes, DEFAULT_STAKES);
  await mini.evaluate(() => {
    const current = getCurrentPages().at(-1);
    for (const name of [
      'closeProfile',
      'closeSettings',
      'closeGuide',
      'closePots',
      'closeReview',
      'closeActivity',
      'closeReset',
    ])
      current[name]();
    current._controller.show();
    current._controller.reset();
  });
  const initial = await waitHero();
  verifyFresh(initial, DEFAULT_STAKES);
  assert.equal(legalActions(initial, 0).chipUnit, 100);
  report.checks.push({ name: 'default-stakes-and-legal-denomination', stakes: initial.stakes });

  const finish = await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller;
    const folded = controller.action('fold');
    const accelerated = controller.finishHand();
    return { folded, accelerated };
  });
  assert.deepEqual(finish, { folded: true, accelerated: true });
  const settled = await wait('Default settlement', (current) => current.phase === 'done');
  assert.equal(settled.stats.hands, 1);
  assert.ok(settled.decisions.length > 0);
  for (const decision of settled.decisions) {
    assert.equal(decision.smallBlind, 100);
    assert.equal(decision.bigBlind, 200);
    assert.equal(decision.chipUnit, 100);
    assert.equal(decision.legal.chipUnit, 100);
  }
  verifyChips(settled, settled.players.length * DEFAULT_STAKES.startingStack);
  await capture('default-settled');
  report.checks.push({
    name: 'real-settlement-records-stats-and-conserves-chips',
    hands: settled.stats.hands,
    decisions: settled.decisions.length,
  });

  // A review first publishes loading synchronously, then schedules its work.
  // Change stakes in the same service-thread call, before that work can run.
  const changed = await mini.evaluate((stakes) => {
    const controller = getCurrentPages().at(-1)._controller;
    getApp().__noirStakesReviewUpdates = [];
    controller.review((update) =>
      getApp().__noirStakesReviewUpdates.push({
        loading: update.loading,
        hand: update.hand,
        steps: update.steps.length,
      }),
    );
    const changed = controller.setStakes(stakes);
    return {
      changed,
      game: controller.getGame(),
      reviewUpdates: getApp().__noirStakesReviewUpdates,
      retry: controller.retry(),
    };
  }, custom);
  assert.equal(changed.changed, true);
  assert.equal(changed.retry, false, 'The old settled hand cannot be retried after a stakes reset');
  verifyFresh(changed.game, custom);
  assert.deepEqual(changed.game.botDecisions, []);
  assert.equal(potSize(changed.game), 1500, 'Only the new 500/1000 blinds are posted at reset');
  assert.deepEqual(changed.reviewUpdates, [{ loading: true, hand: 1, steps: 0 }]);
  await page.waitFor(1000);
  assert.deepEqual(
    await mini.evaluate(() => getApp().__noirStakesReviewUpdates),
    changed.reviewUpdates,
    'A cancelled old review must not publish into the new session',
  );
  const customTurn = await waitHero();
  verifyFresh(customTurn, custom);
  const customLegal = legalActions(customTurn, 0);
  assert.equal(customLegal.chipUnit, 500);
  for (const key of ['toCall', 'callAmount', 'minRaiseTo', 'fullRaiseTo', 'maxRaiseTo'])
    assert.equal(customLegal[key] % 500, 0);
  const view = await page.data();
  assert.equal(view.blindText, '500 / 1K');
  assert.equal(view.chipUnit, 500);
  await capture('500-1000-100bb');
  report.checks.push({
    name: 'stakes-reset-clears-game-and-cancels-review',
    stakes: customTurn.stakes,
    stats: customTurn.stats,
    wealth: customTurn.players.length * custom.startingStack,
    legal: customLegal,
    oldReviewUpdates: changed.reviewUpdates,
  });

  // Pause unrelated bot/hint work only while comparing exact no-op state.
  const noMutation = await mini.evaluate((stakes) => {
    const controller = getCurrentPages().at(-1)._controller;
    controller.hide();
    const before = JSON.stringify(controller.getGame());
    const beforeSettings = controller.getSettings();
    const same = controller.setStakes(stakes);
    const sameUnchanged = JSON.stringify(controller.getGame()) === before;
    const invalid = controller.setStakes({ smallBlind: 75, bigBlind: 200 });
    return {
      same,
      sameUnchanged,
      invalid,
      invalidUnchanged: JSON.stringify(controller.getGame()) === before,
      beforeSettings,
      afterSettings: controller.getSettings(),
    };
  }, custom);
  assert.equal(noMutation.same, false);
  assert.equal(noMutation.sameUnchanged, true);
  assert.equal(noMutation.invalid, false);
  assert.equal(noMutation.invalidUnchanged, true);
  assert.deepEqual(noMutation.afterSettings, noMutation.beforeSettings);
  report.checks.push({ name: 'same-and-invalid-stakes-do-not-mutate', ...noMutation });

  // No hide/pause after changing stakes: real queued fast-finish callbacks must
  // be rejected by setStakes itself while the new session runs normally.
  const interrupted = await mini.evaluate((defaults) => {
    const controller = getCurrentPages().at(-1)._controller;
    controller.show();
    const before = controller.getGame();
    const contenders = before.players.filter((player) => !player.folded).length;
    const otherActors = before.players.filter(
      (player) => player.id !== 0 && !player.folded && !player.allin,
    ).length;
    controller.preset('all');
    const raised = controller.action('raise');
    const decision = JSON.parse(JSON.stringify(controller.getGame().decisions.at(-1)));
    const accelerated = controller.finishHand();
    const pending = {
      phase: controller.getGame().phase,
      stats: { ...controller.getGame().stats },
      heroAllin: controller.getGame().players[0].allin,
    };
    const changed = controller.setStakes(defaults);
    return { contenders, otherActors, raised, decision, accelerated, pending, changed };
  }, DEFAULT_STAKES);
  assert.ok(interrupted.contenders >= 3 && interrupted.otherActors >= 2);
  assert.equal(interrupted.raised, true);
  assert.equal(interrupted.accelerated, true);
  assert.notEqual(interrupted.pending.phase, 'done', 'The interrupted finish must be asynchronous');
  assert.equal(interrupted.pending.stats.hands, 0);
  assert.equal(interrupted.pending.heroAllin, true);
  assert.equal(interrupted.changed, true);
  assert.equal(interrupted.decision.smallBlind, 500);
  assert.equal(interrupted.decision.bigBlind, 1000);
  assert.equal(interrupted.decision.chipUnit, 500);
  assert.equal(interrupted.decision.legal.chipUnit, 500);
  assert.equal(interrupted.decision.amount % 500, 0);
  await page.waitFor(1000);
  const restored = await waitHero();
  verifyFresh(restored, DEFAULT_STAKES);
  assert.equal(legalActions(restored, 0).chipUnit, 100);
  const reviewBlocked = await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller;
    const before = getApp().__noirStakesReviewUpdates.length;
    controller.review((update) =>
      getApp().__noirStakesReviewUpdates.push({ loading: update.loading }),
    );
    return {
      before,
      after: getApp().__noirStakesReviewUpdates.length,
      settings: controller.getSettings(),
    };
  });
  assert.equal(reviewBlocked.before, 1);
  assert.equal(reviewBlocked.after, 1, 'A fresh hand has no old decision review to publish');
  assert.deepEqual(
    settingsWithoutStakes(reviewBlocked.settings),
    settingsWithoutStakes(savedSettings),
    'Changing stakes preserves all unrelated preferences',
  );
  await capture('default-after-interrupted-finish');
  report.checks.push({
    name: 'changing-stakes-cancels-real-fast-finish-and-old-payouts',
    interrupted,
    restored: { stakes: restored.stakes, stats: restored.stats, hand: restored.hand },
  });

  // Exercise the actual settings controls, while keeping the current deal
  // stationary for the edit/no-op/invalid mutation comparisons.
  const queuedBefore = await mini.evaluate(() => {
    const current = getCurrentPages().at(-1);
    current._controller.hide();
    current.openSettings();
    return {
      game: current._controller.getGame(),
      settings: current._controller.getSettings(),
      cards: current._controller
        .getGame()
        .players.map((player) => player.hole.map((card) => card.key)),
    };
  });
  await (await page.$('#small-blind-button')).tap();
  // The editor renders after the tap's own setData.
  await page.waitFor('#small-blind-input');
  const input = await page.$('#small-blind-input');
  assert.equal(await input.value(), '100');
  for (const value of ['0', '-25', '25.5', '1K', '50025']) {
    await input.input(value);
    await page.waitFor(80);
    assert.equal((await page.data()).stakesError, '小盲只能输入25的正整数倍，且不超过50K。');
    assert.equal(await (await page.$('#stakes-error')).style('color'), 'rgb(255, 142, 149)');
    assert.deepEqual(await game(), queuedBefore.game);
    assert.deepEqual(
      await mini.evaluate(() => getCurrentPages().at(-1)._controller.getSettings()),
      queuedBefore.settings,
    );
  }
  await capture('queued-blinds-invalid-input');
  await input.input('50000');
  await input.trigger('confirm', { value: '50000' });
  await page.waitFor(100);
  const queuedStakes = {
    smallBlind: 50000,
    bigBlind: 100000,
    startingStack: 10000000,
    chipUnit: 50000,
  };
  const queuedView = await page.data();
  assert.equal(queuedView.configuredSmallBlindText, '50K');
  assert.equal(queuedView.configuredBigBlindText, '100K');
  assert.equal(queuedView.stakesNotice, '下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始');
  assert.equal(queuedView.pendingStakes, true);
  assert.equal(queuedView.stakesError, '');
  assert.deepEqual(await game(), queuedBefore.game);
  assert.deepEqual(queuedView.settings.stakes, queuedStakes);
  assert.deepEqual(
    await mini.evaluate(() => JSON.parse(wx.getStorageSync('noir-wechat-settings-v1')).stakes),
    queuedStakes,
  );
  await capture('queued-blinds-50k-100k-10m');
  report.checks.push({
    name: 'settings-editor-validates-and-persists-without-current-hand-mutation',
    requested: queuedStakes,
  });

  await mini.evaluate(() => {
    const current = getCurrentPages().at(-1);
    current.closeSettings();
    current._controller.show();
    current._controller.action('fold');
    current._controller.finishHand();
  });
  const beforeRetry = await wait(
    'Queued-blinds old-scale settlement',
    (current) => current.phase === 'done',
  );
  verifyChips(beforeRetry, beforeRetry.players.length * DEFAULT_STAKES.startingStack);
  assert.equal(beforeRetry.stats.hands, 1);
  const retried = await mini.evaluate(() => {
    const current = getCurrentPages().at(-1);
    const result = current._controller.retry();
    current._controller.hide();
    return { result, game: current._controller.getGame(), view: current.data };
  });
  assert.equal(retried.result, true);
  assert.deepEqual(retried.game.stakes, DEFAULT_STAKES);
  assert.deepEqual(
    retried.game.players.map((player) => player.hole.map((card) => card.key)),
    queuedBefore.cards,
  );
  assert.equal(retried.game.stats.hands, 0);
  assert.equal(retried.view.pendingStakes, true);
  assert.deepEqual(retried.view.settings.stakes, queuedStakes);
  report.checks.push({ name: 'retry-retains-old-blinds-original-deal-and-queued-setting' });

  await mini.evaluate(() => getCurrentPages().at(-1)._controller.show());
  await waitHero();
  await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller;
    controller.action('fold');
    controller.finishHand();
  });
  const queuedSettled = await wait(
    'Replayed old-scale settlement',
    (current) => current.phase === 'done',
  );
  assert.equal(queuedSettled.stats.hands, 1);
  const appliedQueued = await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller;
    getApp().__noirQueuedReviewUpdates = [];
    controller.review((update) =>
      getApp().__noirQueuedReviewUpdates.push({ loading: update.loading, hand: update.hand }),
    );
    controller.nextHand();
    controller.hide();
    return {
      game: controller.getGame(),
      view: getCurrentPages().at(-1).data,
      review: getApp().__noirQueuedReviewUpdates,
    };
  });
  verifyFresh(appliedQueued.game, queuedStakes);
  assert.equal(potSize(appliedQueued.game), 150000);
  assert.equal(appliedQueued.view.pendingStakes, false);
  assert.equal(appliedQueued.view.stakesNotice, '');
  assert.equal(appliedQueued.view.blindText, '50K / 100K');
  assert.deepEqual(appliedQueued.review, [{ loading: true, hand: 1 }]);
  await page.waitFor(300);
  assert.deepEqual(
    await mini.evaluate(() => getApp().__noirQueuedReviewUpdates),
    appliedQueued.review,
    'Next hand cancels the old hand review before applying queued blinds',
  );
  await capture('next-hand-applied-50k-100k-10m');
  report.checks.push({
    name: 'next-hand-applies-pending-config-resets-session-and-cancels-old-review',
    stakes: appliedQueued.game.stakes,
  });
  assert.equal(report.exceptions.length, 0);
  assert.equal(
    JSON.parse(await readFile(buildPath, 'utf8')).sourceDigest,
    report.build.sourceDigest,
    'The mini-program bundle must stay unchanged throughout the runtime check',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  if (mini) {
    try {
      report.cleanup = await mini.evaluate((defaults) => {
        const controller = getCurrentPages().at(-1)._controller;
        controller.cancelReview();
        controller.setStakes(defaults);
        controller.show();
        delete getApp().__noirStakesReviewUpdates;
        delete getApp().__noirQueuedReviewUpdates;
        return { stakes: controller.getGame().stakes, settings: controller.getSettings() };
      }, DEFAULT_STAKES);
      assert.deepEqual(report.cleanup.stakes, DEFAULT_STAKES);
      assert.deepEqual(report.cleanup.settings.stakes, DEFAULT_STAKES);
      if (savedSettings)
        assert.deepEqual(
          settingsWithoutStakes(report.cleanup.settings),
          settingsWithoutStakes(savedSettings),
        );
    } catch (error) {
      report.status = 'failed';
      report.cleanupError = error.stack;
      if (!report.error) report.error = error.stack;
    }
  }
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}
assert.equal(report.status, 'passed', report.cleanupError);
console.log('WeChat configured stakes passed:', report.checks.length, 'checks');
