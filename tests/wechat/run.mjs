import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(root, process.argv[3] || '.artifacts/wechat-e2e');
await mkdir(output, { recursive: true });
const report = {
  platform: 'WeChat DevTools simulator',
  startedAt: new Date().toISOString(),
  pages: [],
  exceptions: [],
  status: 'running',
  repeatedAccelerateControls: [],
};
const build = JSON.parse(await readFile(path.join(root, '.artifacts/wechat/build-info.json')));
report.build = {
  sourceDigest: build.sourceDigest,
  builtAt: build.builtAt,
  totalBytes: build.totalBytes,
};
let mini;
try {
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9432' });
  mini.on('exception', (exception) => report.exceptions.push(exception));
  const page = await mini.currentPage();
  const invoke = (name, argument) =>
    mini.evaluate(
      (name, argument) => {
        const current = getCurrentPages().at(-1);
        return current[name](argument);
      },
      name,
      argument,
    );
  report.device = await mini.systemInfo();
  const wait = async (predicate, timeout = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await predicate(await page.data())) return;
      await page.waitFor(100);
    }
    throw Error('Mini-program page did not reach the expected state');
  };
  const settle = async (screen) => {
    await invoke('finishHand');
    let signature,
      lastUpdate = Date.now();
    await wait(async (data) => {
      if (data.done) return true;
      const current = JSON.stringify([data.street, data.pot, data.seats]);
      if (current !== signature) {
        signature = current;
        lastUpdate = Date.now();
      }
      // This is a rendering suite. If the simulator stops publishing updates,
      // press its real accelerate button again rather than mutating the engine
      // or injecting a completed deal. Timer cancellation has separate tests.
      if (Date.now() - lastUpdate > 1500) {
        const button = await page.$('.call-button');
        assert.ok(button, 'The real accelerate-to-settlement control must exist');
        await button.tap();
        report.repeatedAccelerateControls.push({
          screen,
          hand: data.hand,
          at: new Date().toISOString(),
        });
        lastUpdate = Date.now();
      }
      return false;
    }, 90000);
  };
  const capture = async (name, selectors) => {
    // Wait for finite sheet/card entrance animations before comparing geometry.
    await page.waitFor(750);
    if (name === 'settlement' || name === 'practice-runout' || /^settlement-[5-9]$/.test(name)) {
      const data = await page.data();
      const buttons = await page.$$('.settled-buttons button');
      assert.equal(buttons.length, 2 + Number(data.canRetry) + Number(data.canPracticeRunout));
      assert.ok(await page.$('.retry-button'), 'Replay remains visible alongside practice runout');
      const sizes = await Promise.all(buttons.map((button) => button.size()));
      for (const size of sizes) {
        assert.equal(size.height, 44);
        assert.ok(
          Math.abs(size.width - sizes[0].width) <= 1,
          'Settlement actions have equal widths',
        );
      }
      selectors = [...selectors, '.retry-button'];
    }
    if (name === 'review' || /^review-[5-9]$/.test(name))
      selectors = [...selectors, '.review-step'];
    const components = {};
    for (const selector of selectors) {
      const element = await page.$(selector);
      assert.ok(element, `${name}: ${selector} must exist in the real view`);
      const size = await element.size(),
        offset = await element.offset();
      components[selector] = {
        ...size,
        ...offset,
        font: await element.style('font-family'),
        fontSize: await element.style('font-size'),
      };
      assert.ok(size.width > 0 && size.height > 0, `${name}: ${selector} must render`);
    }
    await mini.screenshot({ path: path.join(output, name + '.png') });
    const data = await page.data();
    const game = await mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame());
    await writeFile(
      path.join(output, name + '-state.json'),
      JSON.stringify({ game, data }, null, 2),
    );
    report.pages.push({
      name,
      components,
      viewport: {
        width: data.windowWidth,
        height: data.windowHeight,
        top: data.topInset,
        bottom: data.bottomInset,
        capsule: 36,
      },
    });
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log('PASS', name);
  };
  const capturePracticeRunout = async () => {
    if (
      !report.pages.some((entry) => entry.name === 'practice-runout') &&
      (await page.data()).canPracticeRunout
    ) {
      const before = await mini.evaluate(() => {
        const g = getCurrentPages().at(-1)._controller.getGame();
        return { board: g.board, deck: g.deck, stats: g.stats, winners: g.winners };
      });
      await (await page.$('.practice-runout-button')).tap();
      await wait((data) => !data.canPracticeRunout && data.board.length === 5);
      const after = await mini.evaluate(() => {
        const g = getCurrentPages().at(-1)._controller.getGame();
        return { board: g.board, deck: g.deck, stats: g.stats, winners: g.winners };
      });
      assert.deepEqual(after, before);
      await capture('practice-runout', ['.settled-buttons', '.hero', '.board-row']);
    }
  };
  const captureShowdown = async () => {
    if (
      !report.pages.some((entry) => entry.name === 'showdown') &&
      (await page.data()).showdown.length
    ) {
      const stage = await page.$('.showdown-stage');
      const data = await page.data();
      await mini.pageScrollTo(Math.max(0, (await stage.offset()).top - data.topInset - 36));
      await capture('showdown', ['.showdown-stage', '.showdown-player', '.winning-cards']);
      assert.equal(
        (await page.data()).showdown.length,
        await mini.evaluate(
          () =>
            getCurrentPages()
              .at(-1)
              ._controller.getGame()
              .players.filter((player) => !player.folded).length,
        ),
      );
      await mini.pageScrollTo(0);
    }
  };
  assert.equal(
    await mini.evaluate(() => typeof getCurrentPages().at(-1).changeOpponentFilter),
    'function',
    'DevTools must load the current Page source, not cached compiled code',
  );
  // Fix the baseline count instead of inheriting the previous run's last setting.
  await invoke('changeCount', { detail: { value: '3' } });
  await invoke('resetPractice');
  await invoke('confirmReset');
  await wait((data) => data.canAct);
  await capture('table', ['.nav', '.game-shell', '.board-row', '.hero-cards', '.action-buttons']);
  const board = await page.$('.board-row'),
    hero = await page.$('.hero-cards');
  const boardOffset = await board.offset(),
    boardSize = await board.size(),
    heroOffset = await hero.offset();
  assert.ok(
    boardOffset.top + boardSize.height <= heroOffset.top,
    'Public cards must stay above the hero cards',
  );
  await (await page.$('.icon-button')).tap();
  await capture('settings', [
    '.settings-modal',
    '.general-settings',
    '.difficulty',
    '.settings-switch',
  ]);
  const difficulty = await page.$('.difficulty');
  const difficultySize = await difficulty.size();
  const difficultyOffset = await difficulty.offset();
  assert.ok(
    difficultyOffset.left + difficultySize.width <= report.device.windowWidth - 16,
    'All difficulty choices must fit inside the settings panel',
  );
  const sound = (await page.data()).settings.sound;
  await (await page.$('[data-key="sound"]')).tap();
  await wait((data) => data.settings.sound === !sound, 5000);
  assert.equal((await page.data()).settings.sound, !sound);
  await (await page.$('[data-key="sound"]')).tap();
  await wait((data) => data.settings.sound === sound, 5000);
  await invoke('viewProfile', { currentTarget: { dataset: { id: 'haxton' } } });
  await capture('player', [
    '.profile-detail',
    '.detail-identity',
    '.detail-avatar',
    '.axis',
    '.profile-sizing',
  ]);
  assert.match((await page.data()).detailProfile.research.identity, /\S/);
  await invoke('closeProfile');
  await invoke('closeSettings');
  await (await page.$('.guide-button')).tap();
  await capture('guide', ['.guide-sheet', '.guide-h2', '.rules-flow', '.guide-p']);
  await invoke('toggleGuide', { currentTarget: { dataset: { index: 0 } } });
  assert.equal((await page.data()).guideExpanded[0], true);
  await invoke('closeGuide');
  await (await page.$('.pot-detail')).tap();
  await capture('pots', ['.pot-sheet', '.pot-detail-card', '.pot-detail-heading']);
  await invoke('togglePot', { currentTarget: { dataset: { index: 0 } } });
  assert.equal((await page.data()).potExpanded[0], true);
  await invoke('closePots');
  await invoke('resetPractice');
  await capture('reset', ['.reset-sheet', '.dialog-actions']);
  const hand = (await page.data()).hand;
  await invoke('closeReset');
  assert.equal((await page.data()).hand, hand, 'Cancelling reset preserves the deal');
  await (await page.$('[data-action="fold"]')).tap();
  await settle('settlement');
  await capture('settlement', ['.settled-buttons', '.hero', '.board-row']);
  await captureShowdown();
  await capturePracticeRunout();
  await (await page.$('.review-button')).tap();
  await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
  await capture('review', ['.review-sheet', '.review-tabs', '.review-timeline', '.review-scene']);
  assert.equal(await page.$('.review-summary'), null);
  const stepSize = await (await page.$('.review-step')).size();
  assert.ok(Math.abs(stepSize.width - 160) <= 1, 'Review steps retain the Web phone width');
  await (await page.$('[data-value="opponent"]')).tap();
  await capture('opponent-review', [
    '.review-sheet',
    '.review-tabs',
    '.review-timeline',
    '.review-scene',
  ]);
  assert.ok((await page.data()).reviewSteps.length > 0, 'Opponent view uses recorded actions');
  const options = (await page.data()).opponentOptions;
  if (options.length > 1) {
    await invoke('changeOpponentFilter', { detail: { value: '1' } });
    assert.ok((await page.data()).reviewSteps.every((step) => step.name === options[1]));
    await invoke('changeOpponentFilter', { detail: { value: '0' } });
  }
  await invoke('closeReview');
  const practice = await page.$('.practice-panel');
  const activityViewport = await page.data();
  await mini.pageScrollTo(
    Math.max(0, (await practice.offset()).top - activityViewport.topInset - 36),
  );
  await capture('session-activity', [
    '.practice-panel',
    '.activity-panel',
    '.bottom-links',
    '.bottom-links button',
  ]);
  const resetSize = await (await page.$('.bottom-links button')).size();
  assert.ok(
    resetSize.width >= 74 && resetSize.width <= 82,
    'The footer reset control keeps the Web text-button width, not WeChat’s 184px default',
  );
  await mini.pageScrollTo(0);
  for (const count of [5, 6, 7, 8, 9]) {
    await invoke('openSettings');
    await invoke('changeCount', { detail: { value: String(count - 5) } });
    await wait((data) => data.settings.playerCount === count);
    await capture(`settings-${count}`, ['.settings-modal', '.general-settings', '.difficulty']);
    await invoke('resetPractice');
    await invoke('confirmReset');
    await wait((data) => data.canAct && data.seats.length === count - 1);
    await capture(`table-${count}`, [
      '.game-shell',
      '.board-row',
      '.hero-cards',
      '.action-buttons',
      '.seat-body',
      '.community',
      '.hero',
      '.felt',
    ]);
    await (await page.$('[data-action="fold"]')).tap();
    await settle(`settlement-${count}`);
    await capture(`settlement-${count}`, ['.settled-buttons', '.hero', '.board-row']);
    await captureShowdown();
    await capturePracticeRunout();
    await (await page.$('.review-button')).tap();
    await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
    await capture(`review-${count}`, [
      '.review-sheet',
      '.review-tabs',
      '.review-timeline',
      '.review-scene',
    ]);
    await invoke('closeReview');
  }
  assert.ok(
    report.pages.some((entry) => entry.name === 'showdown'),
    'At least one real showdown must be captured',
  );
  assert.equal(report.exceptions.length, 0, 'DevTools must report no runtime exceptions');
  assert.equal(
    JSON.parse(await readFile(path.join(root, '.artifacts/wechat/build-info.json'))).sourceDigest,
    build.sourceDigest,
    'The mini-program bundle must stay unchanged throughout the installed runtime check',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}
