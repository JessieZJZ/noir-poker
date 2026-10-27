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
  await mini.evaluate(() => {
    getApp().__noirTurnVibrations = [];
  });
  await mini.mockWxMethod('vibrateShort', function (options) {
    getApp().__noirTurnVibrations.push(options.type);
    return { errMsg: 'vibrateShort:ok' };
  });
  await mini.reLaunch('/pages/table/table');
  let page = await mini.currentPage();
  assert.equal(page.path, 'pages/table/table');
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
  report.stakes = await mini.evaluate(() => {
    const current = getCurrentPages().at(-1);
    return {
      stakes: current._controller.getGame().stakes,
      blinds: current.data.blindText,
      unit: current.data.chipUnit,
    };
  });
  assert.deepEqual(report.stakes.stakes, {
    smallBlind: 100,
    bigBlind: 200,
    startingStack: 20000,
    chipUnit: 100,
  });
  assert.equal(report.stakes.blinds, '100 / 200');
  assert.equal(report.stakes.unit, 100);
  const icon = await page.$('.app-icon');
  assert.equal(await icon.attribute('src'), '/assets/app-icon.png');

  const wait = async (predicate, timeout = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await predicate(await page.data())) return;
      await page.waitFor(100);
    }
    throw Error('Mini-program page did not reach the expected state');
  };
  await wait((data) => data.tableReady && data.waitingForSeat);
  await mini.screenshot({ path: path.join(output, 'waiting-before-entry.png') });
  await (await page.$('#join-table-button')).tap();
  await wait((data) => !data.dealing && !data.waitingForSeat);
  const scrollHomeTop = async () => {
    // Native page scrolling and the Page's onPageScroll event are asynchronous.
    // Finish any overlay restoration before opening the next modal at the top.
    await page.waitFor(250);
    await mini.pageScrollTo(0);
    await wait(
      async (data) =>
        !data.homeLocked &&
        Math.abs((await (await page.$('.screen')).offset()).top) <= 1 &&
        (await mini.evaluate(() => getCurrentPages().at(-1)._homeScroll || 0)) === 0,
      5000,
    );
  };
  const settle = async (screen) => {
    const before = await page.data();
    const started = Date.now();
    await invoke('finishHand');
    await wait((data) => data.done && data.boardSlots.every((card) => !card.empty), 30000);
    const after = await page.data();
    assert.equal(after.tableHeight, before.tableHeight);
    report.fastFinishes ??= [];
    report.fastFinishes.push({ screen, elapsedMs: Date.now() - started, repeatedClicks: 0 });
  };
  const liveTableGeometry = new Map();
  const geometryKey = (data) => `${data.sessionNumber}:${data.hand}:${data.replay || 0}`;
  const readTableGeometry = async () => {
    const data = await page.data();
    const table = await page.$('.table-area');
    const shell = await page.$('.game-shell');
    const dock = await page.$('.action-dock');
    assert.ok(table && shell && dock, 'The actual table, shell and action dock must exist');
    assert.ok(await table.$('.table-arena'), 'The table owns its rendered arena');
    const [origin, tableSize, shellOffset, shellSize, dockOffset, dockSize] = await Promise.all([
      table.offset(),
      table.size(),
      shell.offset(),
      shell.size(),
      dock.offset(),
      dock.size(),
    ]);
    const expectedPlayers = data.settings.playerCount - 1;
    assert.equal(data.seats.length, expectedPlayers);
    assert.equal(data.phoneSeats.length, expectedPlayers);
    const elements = {};
    for (const [selector, count] of [
      ['.table-arena', 1],
      ['.felt', 1],
      ['.community', 1],
      ['.board-row', 1],
      ['.board-row > view', 5],
      ['.hero', 1],
      ['.hero-cards', 1],
      ['.hero-card', 2],
      ['.seat', expectedPlayers],
      ['.seat-hole', expectedPlayers],
      ['.seat-body', expectedPlayers],
      ['.seat-caption', expectedPlayers],
    ]) {
      // The official WXML selector bridge does not match the native `view`
      // type here; both concrete classes still identify all five real slots.
      const matches =
        selector === '.board-row > view'
          ? [
              ...(await table.$$('.board-row .card-placeholder')),
              ...(await table.$$('.board-row .community-card')),
            ]
          : await table.$$(selector);
      assert.equal(matches.length, count, `${selector} keeps every actual slot and player`);
      elements[selector] = await Promise.all(
        matches.map(async (element) => {
          const [offset, size] = await Promise.all([element.offset(), element.size()]);
          const bounds = {
            left: Number(offset.left) - origin.left,
            top: Number(offset.top) - origin.top,
            width: Number(size.width),
            height: Number(size.height),
          };
          assert.ok(Object.values(bounds).every(Number.isFinite), `${selector} has finite bounds`);
          assert.ok(bounds.width > 0 && bounds.height > 0, `${selector} has a nonempty footprint`);
          return bounds;
        }),
      );
      if (selector === '.board-row > view')
        elements[selector].sort((a, b) =>
          Math.abs(a.top - b.top) > Math.min(a.height, b.height) / 2
            ? a.top - b.top
            : a.left - b.left,
        );
    }
    const bodyIds = await Promise.all(
      (await table.$$('.seat-body')).map((body) => body.attribute('id')),
    );
    assert.deepEqual(
      bodyIds,
      data.phoneSeats.map((seat) => `seat-body-${seat.id}`),
    );
    const shellBottom = Number(shellOffset.top) + Number(shellSize.height);
    return {
      key: geometryKey(data),
      playerIds: data.phoneSeats.map((seat) => seat.id),
      viewport: {
        width: data.windowWidth,
        height: data.windowHeight,
        topInset: data.topInset,
        bottomInset: data.bottomInset,
      },
      tableHeight: data.tableHeight,
      shell: { ...shellOffset, ...shellSize },
      table: {
        left: Number(origin.left) - shellOffset.left,
        top: Number(origin.top) - shellOffset.top,
        width: Number(tableSize.width),
        height: Number(tableSize.height),
      },
      dockHeight: Number(dockSize.height),
      shellBottom,
      reservedSpace: shellBottom - 1 - Number(dockOffset.top) - Number(dockSize.height),
      elements,
    };
  };
  const assertTableBudget = (geometry, compact) => {
    const { viewport, tableHeight } = geometry;
    assert.equal(
      tableHeight,
      Math.max(0, viewport.height - viewport.topInset - viewport.bottomInset - 284),
      'The table keeps the fixed viewport budget',
    );
    assert.equal(geometry.table.height, tableHeight);
    assert.equal(Number(geometry.shell.height), tableHeight + 50 + (compact ? 64 : 134));
    assert.equal(geometry.dockHeight, compact ? 64 : 134);
    assert.ok(
      Math.abs(geometry.shell.top - (viewport.topInset + 36 + 48 + 8)) <= 1,
      'The shell keeps its original top position',
    );
    assert.ok(
      Math.abs(
        geometry.shellBottom - (viewport.height - viewport.bottomInset - 8 - (compact ? 70 : 0)),
      ) <= 1,
      'Settlement releases only the unused 70px of action controls',
    );
    assert.ok(
      Math.abs(geometry.reservedSpace) <= 1,
      'Neither live nor compact actions leave unused space inside the shell',
    );
  };
  const rememberLiveGeometry = async (name) => {
    await page.waitFor(1450);
    const data = await page.data();
    assert.ok(!data.done && data.canAct, 'The geometry baseline must precede a real hero fold');
    const geometry = await readTableGeometry();
    report.tableGeometry ??= { live: {}, comparisons: [] };
    report.tableGeometry.live[geometry.key] = { name, ...geometry };
    assertTableBudget(geometry, false);
    liveTableGeometry.set(geometry.key, geometry);
  };
  const assertSettledGeometry = async (name) => {
    const current = await readTableGeometry();
    const baseline = liveTableGeometry.get(current.key);
    report.tableGeometry ??= { live: {}, comparisons: [] };
    report.tableGeometry.comparisons.push({ name, key: current.key, baseline, current });
    assert.ok(baseline, `${name} must use the same session, hand and retry's live baseline`);
    assertTableBudget(current, true);
    assert.deepEqual(current.viewport, baseline.viewport);
    assert.deepEqual(current.playerIds, baseline.playerIds);
    const compareBounds = (actual, expected, label) => {
      for (const field of ['left', 'top', 'width', 'height'])
        assert.ok(
          Math.abs(Number(actual[field]) - Number(expected[field])) <= 1,
          `${name}: ${label} ${field} matches the same live hand`,
        );
    };
    compareBounds(
      current.shell,
      { ...baseline.shell, height: baseline.shell.height - 70 },
      'shell',
    );
    compareBounds(current.table, baseline.table, 'table');
    for (const [selector, bounds] of Object.entries(baseline.elements)) {
      assert.equal(current.elements[selector].length, bounds.length);
      bounds.forEach((expected, index) =>
        compareBounds(current.elements[selector][index], expected, `${selector}[${index}]`),
      );
    }
  };
  const capture = async (name, selectors) => {
    // Wait for finite sheet/card entrance animations before comparing geometry.
    // Nine-seat backs and five-card runouts finish after stagger + 650ms.
    // Capturing at 750ms preserved half-flipped/transparent cards in the report.
    await page.waitFor(1450);
    if (name === 'settlement' || name === 'practice-runout' || /^settlement-[5-9]$/.test(name)) {
      const data = await page.data();
      await assertSettledGeometry(name);
      const buttons = await page.$$('.settled-buttons button');
      assert.equal(buttons.length, 2 + Number(data.canRetry) + Number(data.canPracticeRunout));
      assert.ok(await page.$('.retry-button'), 'Replay remains visible alongside practice runout');
      const sizes = await Promise.all(buttons.map((button) => button.size()));
      for (const size of sizes) {
        assert.equal(size.height, 38);
        assert.ok(
          Math.abs(size.width - sizes[0].width) <= 1,
          'Settlement actions have equal widths',
        );
      }
      selectors = [...selectors, '.retry-button'];
      const textSizes = {};
      for (const selector of [
        '.seat-name',
        '.seat-body > .stack',
        '.persona',
        '.seat-action',
        '.rank',
        '.pot-detail',
      ]) {
        const el = await page.$(selector);
        if (el) textSizes[selector] = parseFloat(await el.style('font-size'));
      }
      assert.ok(textSizes['.seat-name'] >= 13 && textSizes['.seat-body > .stack'] >= 13);
      assert.ok(textSizes['.persona'] >= 12 && textSizes['.seat-action'] >= 13);
      assert.ok(textSizes['.rank'] >= 12 && textSizes['.pot-detail'] >= 13);
      report.readability ??= {};
      report.readability[name] = textSizes;
      const gaps = [];
      const words = await Promise.all(
        (await page.$$('.seat-action-word')).map(async (word) => ({
          id: Number(await word.attribute('data-id')),
          bottom: (await word.offset()).top + (await word.size()).height,
        })),
      );
      for (const rank of await page.$$('.rank')) {
        const id = Number(await rank.attribute('data-id'));
        if (!(id >= 1)) continue;
        const bottoms = words.filter((word) => word.id === id).map((word) => word.bottom);
        assert.ok(bottoms.length > 0, 'Every seat rank must measure its actual action text');
        gaps.push({
          id,
          gap: ((await rank.offset()).top - Math.max(...bottoms)) / (await page.data()).arenaScale,
        });
      }
      assert.equal(gaps.length, (await page.data()).phoneSeats.filter((seat) => seat.rank).length);
      assert.ok(gaps.length > 0, 'Settlement must measure at least its winner rank');
      for (const rank of gaps)
        assert.ok(
          rank.gap >= 2.5 && rank.gap <= 3.5,
          `Seat ${rank.id} rank stays close to its complete action`,
        );
      report.readability[name].rankGaps = gaps;
      const winner = await page.$('.seat.winner .seat-body');
      if (winner) {
        const action = await page.$('.seat.winner .seat-action');
        const style = {
          borders: await Promise.all(
            ['top', 'right', 'bottom', 'left'].map((edge) => winner.style(`border-${edge}-color`)),
          ),
          action: await action.style('color'),
        };
        for (const border of style.borders)
          assert.equal(border, 'rgb(227, 191, 114)', 'Winner rail matches Web gold');
        assert.equal(style.action, 'rgb(230, 211, 162)', 'Winner action matches Web gold');
        report.winnerStyles ??= {};
        report.winnerStyles[name] = style;
      }
    }
    if (name === 'table' || /^table-[5-9]$/.test(name)) {
      const data = await page.data();
      const areas = {};
      for (const selector of [
        '.seat',
        '.seat-body',
        '.avatar',
        '.persona',
        '.community',
        '.board-row',
        '.felt',
        '.hero',
      ]) {
        const elements = await page.$$(selector);
        areas[selector] = await Promise.all(
          elements.map(async (element) => ({
            ...(await element.offset()),
            ...(await element.size()),
          })),
        );
      }
      const group = areas['.board-row'][0],
        felt = areas['.felt'][0];
      assert.ok(
        Math.abs(group.top + group.height / 2 - felt.top - felt.height / 2) <= 1,
        'Public cards stay centered on the table',
      );
      for (let i = 0; i < areas['.avatar'].length; i++) {
        const avatar = areas['.avatar'][i],
          tag = areas['.persona'][i];
        assert.ok(
          Math.abs((tag.left - avatar.left - avatar.width) / data.arenaScale - 4) <= 1,
          'Persona tag stays at a fixed distance after the avatar',
        );
      }
      report.tableAreas ??= {};
      report.tableAreas[name] = areas;
    }
    if (name === 'review' || /^review-[5-9]$/.test(name))
      selectors = [...selectors, '.review-step'];
    const components = {};
    for (const selector of selectors) {
      let element;
      const paintDeadline = Date.now() + 15000;
      while (!(element = await page.$(selector)) && Date.now() < paintDeadline)
        await page.waitFor(100);
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
    const png = await readFile(path.join(output, name + '.png'));
    report.screenshotDensity ??= {};
    report.screenshotDensity[name] = {
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
      logicalWidth: data.windowWidth,
      effectivePixelRatio: png.readUInt32BE(16) / data.windowWidth,
      settledAnimationWaitMs: 1450,
    };
    const game = await mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame());
    await writeFile(
      path.join(output, name + '-state.json'),
      JSON.stringify(
        {
          game,
          data,
          settingsScroll: await mini.evaluate(() => getCurrentPages().at(-1)._settingsScroll || 0),
        },
        null,
        2,
      ),
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
      (await page.data()).done &&
      (await mini.evaluate(() =>
        Boolean(getCurrentPages().at(-1)._controller.getGame().practiceBoard),
      ))
    ) {
      await capture('practice-runout', ['.settled-buttons', '.hero', '.board-row']);
      return;
    }
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
      await scrollHomeTop();
    }
  };
  assert.equal(
    await mini.evaluate(() => typeof getCurrentPages().at(-1).changeOpponentFilter),
    'function',
    'DevTools must load the current Page source, not cached compiled code',
  );
  for (const close of [
    'closeResourceMenu',
    'closeProfile',
    'closeSettings',
    'closeGuide',
    'closePots',
    'closeReview',
    'closeActivity',
    'closeReset',
  ])
    await invoke(close);
  await scrollHomeTop();
  // Fix the baseline count instead of inheriting the previous run's last setting.
  await invoke('changeCount', { detail: { value: '3' } });
  await invoke('resetPractice');
  await invoke('confirmReset');
  await wait((data) => data.canAct);
  // Observe an actual decision and its delayed attention state in DevTools.
  // Changing a harmless setting rerenders without restarting this decision.
  report.turnAttention = { phase: (await page.data()).turnPhase };
  assert.equal(report.turnAttention.phase, 'enter');
  report.turnAttention.handCards = (await page.$$('.hero-cards .hero-card')).length;
  assert.equal(report.turnAttention.handCards, 2);
  assert.equal(await page.$('.turn-frame'), null, 'No frame encloses the entire hand');
  // Hand outlines now belong to each card's ::before. Element.style() exposes
  // only the host; pseudo-element motion is sampled by Web/native scenarios.
  const prompt = await page.$('.turn-prompt');
  assert.equal(await prompt.text(), '轮到你行动，');
  const detail = await page.$('.decision-detail');
  assert.equal(await prompt.style('color'), await detail.style('color'));
  assert.equal(await prompt.style('font-weight'), await detail.style('font-weight'));
  assert.equal(await prompt.style('animation-name'), 'none');
  assert.equal(await prompt.style('opacity'), '1');
  const rail = await page.$('.turn-line');
  assert.equal(await rail.style('height'), '2px');
  assert.equal(await rail.style('animation-name'), 'none');
  assert.equal(await rail.style('box-shadow'), 'none');
  const notice = await page.$('.action-notice');
  const slider = await page.$('.raise-controls slider');
  const noticeTop = (await notice.offset()).top;
  report.turnAttention.noticeSpacing = {
    topGap: noticeTop - (await rail.offset()).top - (await rail.size()).height,
    controlGap:
      (await slider.offset()).top +
      ((await slider.size()).height - 28) / 2 -
      noticeTop -
      (await notice.size()).height,
  };
  assert.ok(report.turnAttention.noticeSpacing.topGap >= 4);
  assert.ok(report.turnAttention.noticeSpacing.controlGap >= 4);
  assert.ok(
    Math.abs(
      report.turnAttention.noticeSpacing.topGap - report.turnAttention.noticeSpacing.controlGap,
    ) <= 1,
    JSON.stringify(report.turnAttention.noticeSpacing),
  );
  // The host stays still; shared CSS animates two pseudo-element light fronts.
  // Web/native frame sampling covers their direction; DevTools retains a capture.
  await page.waitFor(850);
  report.turnAttention.railHeight = await rail.style('height');
  await mini.screenshot({ path: path.join(output, 'hero-turn-entry.png') });
  await wait((data) => data.turnPhase === 'waiting');
  assert.equal(await (await page.$('.turn-line')).style('animation-name'), 'none');
  const turnGeometry = async () => ({
    cards: await (await page.$('.hero-cards')).size(),
    actions: await (await page.$('.action-buttons')).size(),
  });
  const beforeAttention = await turnGeometry();
  await wait((data) => data.turnPhase === 'reminder', 10000);
  await wait((data) => data.turnPhase === 'waiting');
  assert.deepEqual(await turnGeometry(), beforeAttention);
  await invoke('previewRaise', { detail: { value: (await page.data()).minRaise } });
  await invoke('onHide');
  assert.equal((await page.data()).turnPhase, '');
  await page.waitFor(9000);
  assert.equal((await page.data()).turnPhase, '');
  await invoke('onShow');
  assert.equal((await page.data()).turnPhase, 'waiting');
  await page.waitFor(9000);
  assert.equal((await page.data()).turnPhase, 'waiting');
  report.turnAttention = {
    ...report.turnAttention,
    status: 'passed',
    before: beforeAttention,
    after: await turnGeometry(),
    backgroundCancelled: true,
    sizingCancelled: true,
  };
  await capture('table', ['.nav', '.game-shell', '.board-row', '.hero-cards', '.action-buttons']);
  const styleSeat = (await page.data()).phoneSeats[0];
  const styleHit = await page.$(`#seat-body-${styleSeat.id}`);
  await styleHit.longpress();
  await wait((data) => data.nameTooltip?.visible);
  assert.equal((await page.data()).nameTooltip.text, styleSeat.profileName);
  assert.equal(await (await page.$('.seat-name-tooltip')).text(), styleSeat.profileName);
  report.styleTooltip = {
    text: styleSeat.profileName,
    hitTarget: 'seat-body',
    scope: 'DevTools longpress on the expanded seat region, including untruncated styles',
  };
  await capture('style-tooltip', ['.seat-name-tooltip']);
  await (await page.$('.name-tooltip-dismiss')).tap();
  await wait((data) => !data.nameTooltip);
  assert.equal((await (await page.$('.nav')).size()).height, 48);
  for (const button of await page.$$('.action-buttons button'))
    assert.equal((await button.size()).height, 38);
  for (const button of await page.$$('button'))
    assert.equal(await button.attribute('hover-class'), 'none');
  report.compactChrome = {
    navHeight: 48,
    liveDockHeight: 134,
    primaryButtonHeight: 38,
    tableHeaderHeight: 26,
    buttonHoverClass: 'none',
  };
  const board = await page.$('.board-row'),
    hero = await page.$('.hero-cards');
  const boardOffset = await board.offset(),
    boardSize = await board.size(),
    heroOffset = await hero.offset();
  assert.ok(
    boardOffset.top + boardSize.height <= heroOffset.top,
    'Public cards must stay above the hero cards',
  );
  const homeTop = (await (await page.$('.game-shell')).offset()).top;
  await (await page.$('.icon-button')).tap();
  await capture('settings', [
    '.settings-modal',
    '.general-settings',
    '.difficulty',
    '.settings-switch',
  ]);
  const settingsSize = await (await page.$('.settings-modal')).size();
  const settingsOffset = await (await page.$('.settings-modal')).offset();
  const currentWindow = await page.data();
  assert.ok(
    settingsOffset.top + settingsSize.height >= currentWindow.windowHeight - 1,
    'Settings background covers the bottom safe area',
  );
  assert.equal(await page.$('[data-field="language"]'), null);
  await (await page.$('[data-field="count"]')).tap();
  await wait(
    async (data) => !!data.selection && (await page.$$('.selection-option')).length === 5,
    5000,
  );
  assert.equal(
    (await page.$$('.selection-option')).length,
    5,
    'All five player counts must be visible options',
  );
  const trigger = await page.$('[data-field="count"]');
  const menu = await page.$('.selection-sheet');
  const t = await trigger.offset(),
    ts = await trigger.size(),
    m = await menu.offset(),
    ms = await menu.size();
  // It opens 4px below its trigger, or 4px above it when a short screen
  // leaves too little room below (e.g. a 375x667 simulator).
  const opensBelow = Math.abs(m.top - t.top - ts.height - 4) <= 1;
  const placed = (await page.data()).selection;
  const opensAbove =
    Math.abs(m.top + placed.height + 4 - t.top) <= 1 && ms.height - placed.height <= 2;
  assert.ok(opensBelow || opensAbove, 'Count dropdown opens immediately beside its trigger');
  assert.equal(
    await (await page.$('.selection-backdrop')).style('background-color'),
    'rgba(0, 0, 0, 0)',
  );
  await mini.screenshot({ path: path.join(output, 'count-options.png') });
  await invoke('closeSelect');
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
  const settingsScroll = await page.$('.settings-modal .modal-scroll');
  const scrollToSetting = async (selector, margin = 0) => {
    const current = await mini.evaluate(() => getCurrentPages().at(-1)._settingsScroll || 0);
    const element = await page.$(selector);
    const offset = await element.offset(),
      body = await settingsScroll.offset();
    await settingsScroll.scrollTo(0, Math.max(0, current + offset.top - body.top - margin));
    await page.waitFor(250);
  };
  await scrollToSetting('.profile-grid', 30);
  assert.equal((await page.data()).homeLocked, true);
  assert.ok(
    Math.abs((await (await page.$('.game-shell')).offset()).top - homeTop) <= 1,
    'Settings scrolling cannot move the home table',
  );

  const profileCards = await page.$$('.profile-card');
  const boxes = await Promise.all(
    profileCards.map(async (card) => ({ ...(await card.offset()), ...(await card.size()) })),
  );
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (const b of boxes.slice(i + 1))
      assert.ok(
        !(
          a.left < b.left + b.width - 0.5 &&
          a.left + a.width > b.left + 0.5 &&
          a.top < b.top + b.height - 0.5 &&
          a.top + a.height > b.top + 0.5
        ),
        'Profile cards must not overlap',
      );
    const avatar = await profileCards[i].$('.profile-avatar');
    assert.ok(
      Math.abs(
        (await avatar.offset()).top -
          a.top -
          parseFloat(await profileCards[i].style('padding-top')) -
          1,
      ) <= 1,
      'Persona portraits start at the top of each grid cell',
    );
    for (const selector of ['.profile-name', '.profile-tag']) {
      const child = await profileCards[i].$(selector),
        c = await child.offset(),
        cs = await child.size();
      assert.ok(
        c.left >= a.left && c.left + cs.width <= a.left + a.width + 0.5,
        'Profile text stays inside its own column',
      );
    }
  }
  await capture('settings-profiles', [
    '.settings-modal',
    '.profile-grid',
    '.profile-card',
    '.profile-name',
    '.profile-tag',
  ]);
  await scrollToSetting('.seat-roster', 36);
  assert.equal((await page.$$('.seat-setting')).length, 8);
  const chooseSeat = async (id, style) => {
    const data = await page.data();
    await invoke('changeSeat', {
      currentTarget: { dataset: { id } },
      detail: { value: data.profiles.findIndex((profile) => profile.id === style) },
    });
  };
  if ((await page.data()).settings.mixed) await invoke('mixProfiles');
  assert.equal(await (await page.$('.small-button')).style('background-color'), 'rgba(0, 0, 0, 0)');
  await chooseSeat(1, 'rook');
  await chooseSeat(2, 'balanced');
  await invoke('mixProfiles');
  const mixedOn = (await page.data()).settings;
  assert.equal(mixedOn.mixed, true);
  // Every seated opponent, manual choices included, gets a distinct
  // non-balanced style.
  const seatedStyles = Array.from(
    { length: mixedOn.playerCount - 1 },
    (_, i) => mixedOn.assignments[i + 1],
  );
  assert.equal(new Set(seatedStyles).size, Math.min(seatedStyles.length, 7));
  assert.ok(seatedStyles.every((id) => id !== 'balanced'));
  await chooseSeat(3, 'owen');
  await invoke('mixProfiles');
  const mixedSettings = (await page.data()).settings;
  assert.equal(mixedSettings.mixed, false);
  // Cancelling returns every seat to balanced.
  assert.ok(Object.values(mixedSettings.assignments).every((id) => id === 'balanced'));
  report.mixedToggle = { on: mixedOn, off: mixedSettings };
  await capture('settings-roster', [
    '.settings-modal',
    '.seat-roster',
    '.seat-setting',
    '.roster-person',
    '.roster-label',
  ]);
  await settingsScroll.scrollTo(0, 10000);
  await page.waitFor(250);
  assert.equal(await page.$('.settings-footer'), null);
  const modal = await page.$('.settings-modal');
  assert.equal(
    (await modal.offset()).top,
    0,
    'Settings background covers system/capsule areas as well',
  );
  await capture('settings-bottom', ['.settings-modal', '.info-module', '.settings-save-row']);
  await scrollToSetting('.profile-card[data-id="owen"]', 80);
  await (await page.$('.profile-card[data-id="owen"]')).tap();
  await wait((data) => !!data.detailProfile);
  const profileDetail = await page.$('.profile-detail');
  report.motion = {
    profileReveal: await profileDetail.style('animation-name'),
    profileDuration: await profileDetail.style('animation-duration'),
  };
  assert.equal(report.motion.profileReveal, 'profile-reveal');
  assert.equal(report.motion.profileDuration, '0.42s');
  await mini.screenshot({ path: path.join(output, 'profile-reveal.png') });

  await capture('player', [
    '.profile-detail',
    '.detail-identity',
    '.detail-avatar',
    '.axis',
    '.profile-sizing',
  ]);
  assert.equal((await page.data()).detailProfile.character.sections.length, 5);
  assert.equal((await page.$$('.profile-detail .research-link')).length, 0);
  report.originalCharacters = [];
  for (const profile of (await page.data()).profiles) {
    await invoke('viewProfile', { currentTarget: { dataset: { id: profile.id } } });
    await wait((data) => data.detailProfile?.id === profile.id);
    const detail = (await page.data()).detailProfile;
    assert.equal(detail.character.sections.length, 5);
    assert.equal(detail.sources.length, 0);
    report.originalCharacters.push({
      id: detail.id,
      name: detail.name,
      sections: detail.character.sections.length,
      portrait: detail.portrait,
    });
  }

  await invoke('closeProfile');
  await invoke('closeSettings');
  await (await page.$('#resource-menu-button')).tap();
  await wait(async (data) => data.resourceMenuOpen && !!(await page.$('#resource-guide')), 5000);
  await (await page.$('#resource-guide')).tap();
  await wait((data) => data.guideOpen && !data.resourceMenuOpen, 5000);
  for (const [index, expanded] of (await page.data()).guideExpanded.entries())
    if (expanded) await invoke('toggleGuide', { currentTarget: { dataset: { index } } });
  await capture('guide', ['.guide-sheet', '.guide-h2', '.rules-flow', '.guide-p']);
  assert.equal((await page.$$('.hand-example')).length, 9);
  assert.equal((await page.$$('.guide-card')).length, 45);
  assert.ok((await (await page.$('.position-glossary')).text()).includes('HJ'));
  const readGuideAmounts = async () =>
    (await Promise.all((await page.$$('.guide-p')).map((element) => element.text())))
      .join(' ')
      .replace(/\s+/g, ' ');
  const actionExample = await readGuideAmounts();
  assert.ok(actionExample.includes('选择加注 1.2K 则补 1K'));
  assert.ok(!/\b(?:1200|1000)\b/.test(actionExample), 'Guide chip examples must use K');
  // The preflop win-rate table is collapsed until opened, like Web.
  assert.equal((await page.$$('.preflop-row')).length, 0);
  await invoke('toggleGuide', { currentTarget: { dataset: { index: 0 } } });
  assert.equal((await page.data()).guideExpanded[0], true);
  assert.equal((await page.$$('.preflop-row')).length, 39);
  assert.ok((await (await page.$('.preflop-table')).text()).includes('85%'));
  await capture('guide-preflop', ['.guide-sheet', '.preflop-table']);
  await invoke('toggleGuide', { currentTarget: { dataset: { index: 1 } } });
  assert.equal((await page.data()).guideExpanded[1], true);
  const raiseExample = await readGuideAmounts();
  assert.ok(raiseExample.includes('至少要加到 1K'));
  report.visualGuide = {
    hands: 9,
    cards: 45,
    compactActionExample: true,
    compactRaiseExample: true,
  };
  await invoke('closeGuide');
  for (let attempt = 0; attempt < 3 && !(await page.data()).canAct; attempt++) {
    await invoke('nextHand');
    await wait((data) => data.canAct || data.done, 60000);
  }
  assert.equal((await page.data()).canAct, true);
  const handBeforeRankings = (await page.data()).hand;
  report.handRankings = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    await (await page.$('#hand-rankings-button')).tap();
    await wait((data) => data.guideOpen && data.guideScrollTarget === 'hand-rankings', 5000);
    const target = await page.$('#hand-rankings'),
      body = await page.$('.guide-scroll');
    await wait(async () => {
      const offset = (await target.offset()).top - (await body.offset()).top;
      return offset >= -1 && offset <= 2;
    }, 5000);
    const heading = await page.$('.guide-heading');
    const evidence = {
      target: await target.offset(),
      body: await body.offset(),
      header: await heading.offset(),
      headerSize: await heading.size(),
    };
    assert.ok(evidence.target.top >= evidence.header.top + evidence.headerSize.height - 1);
    report.handRankings.push(evidence);
    if (!attempt)
      await capture('hand-rankings', ['.guide-sheet', '#hand-rankings', '.hand-example']);
    await (await heading.$('button')).tap();
    await wait((data) => !data.guideOpen, 5000);
  }
  assert.equal((await page.data()).hand, handBeforeRankings);
  await invoke('openGuide');
  await wait((data) => data.guideOpen && data.guideScrollTarget === '', 5000);
  assert.equal(await (await page.$('.guide-scroll')).property('scrollTop'), 0);
  await invoke('closeGuide');
  const cardsBefore = (await page.data()).boardSlots.map((card) => card.key);
  const rowsBefore = await (await page.$('.board-row')).offset();
  await (await page.$('.pot-detail')).tap();
  await wait((data) => data.potOpen && data.homeLocked, 5000);
  assert.equal((await page.data()).homeLocked, true);
  assert.equal(await (await page.$('.screen')).style('position'), 'fixed');
  const lockedTableTop = (await (await page.$('.game-shell')).offset()).top;
  await mini.pageScrollTo(200);
  assert.equal((await (await page.$('.game-shell')).offset()).top, lockedTableTop);
  assert.equal(await (await page.$('.sheet-scroll')).attribute('scroll-y'), 'true');
  report.potScrollLock = { fixedHome: true, innerScroll: true };
  for (let frame = 0; frame < 4; frame++) {
    assert.deepEqual(
      (await page.data()).boardSlots.map((card) => card.key),
      cardsBefore,
      'Opening details keeps all five public-card slots',
    );
    const rowsAfter = await (await page.$('.board-row')).offset();
    assert.ok(
      Math.abs(rowsAfter.top - rowsBefore.top) <= 1,
      'Details cannot reposition the public cards',
    );
    await page.waitFor(50);
  }

  for (const [index, expanded] of Object.entries((await page.data()).potExpanded))
    if (expanded) await invoke('togglePot', { currentTarget: { dataset: { index } } });
  await capture('pots', ['.pot-sheet', '.pot-detail-card', '.pot-detail-heading']);
  await invoke('togglePot', { currentTarget: { dataset: { index: 0 } } });
  assert.equal((await page.data()).potExpanded[0], true);
  await invoke('closePots');
  await invoke('resetPractice');
  await capture('reset', ['.reset-sheet', '.dialog-actions']);
  const hand = (await page.data()).hand;
  await invoke('closeReset');
  assert.equal((await page.data()).hand, hand, 'Cancelling reset preserves the deal');
  await wait((data) => data.canAct && data.canRaise);
  const vibrationsBefore = await mini.evaluate(() => getApp().__noirTurnVibrations.length);
  assert.ok(vibrationsBefore > 0, 'Real controller turns must dispatch short vibrations');
  const sliderBefore = await page.data();
  await invoke('previewRaise', { detail: { value: sliderBefore.minRaise + 100 } });
  const sliderPreview = await page.data();
  assert.equal(sliderPreview.raiseTo, sliderBefore.raiseTo);
  assert.deepEqual(sliderPreview.boardSlots, sliderBefore.boardSlots);
  await invoke('changeRaise', { detail: { value: sliderBefore.minRaise } });
  assert.equal(
    await mini.evaluate(() => getApp().__noirTurnVibrations.length),
    vibrationsBefore,
    'Slider changes must not repeat a turn vibration',
  );
  await (await page.$('[data-action="raise"]')).tap();
  await wait((data) => data.flyingChips.length >= 3, 5000);
  const flying = (await page.$$('.flying-chip')).at(-1);
  const [animationName, animationDuration] = await Promise.all([
    flying.style('animation-name'),
    flying.style('animation-duration'),
  ]);
  assert.equal(animationName, 'fly-chips');
  assert.equal(animationDuration, '0.52s');
  await mini.screenshot({ path: path.join(output, 'raise-chip-motion.png') });
  report.wagerMotion = { chips: 3, durationMs: 520, staggerMs: 60 };
  await wait((data) => data.canAct || data.done);
  if ((await page.data()).done) {
    await invoke('nextHand');
    await wait((data) => data.canAct);
  }
  const vibrationsAfter = await mini.evaluate(() => getApp().__noirTurnVibrations);
  assert.ok(vibrationsAfter.length > vibrationsBefore, 'A new hero decision vibrates again');
  assert.ok(vibrationsAfter.every((type) => type === 'light'));
  report.turnVibration = {
    before: vibrationsBefore,
    after: vibrationsAfter.length,
    type: 'light',
    scope: 'Actual controller dispatch with wx.vibrateShort mocked; physical feel needs a phone',
  };
  await rememberLiveGeometry('settlement');
  await (await page.$('[data-action="fold"]')).tap();
  await settle('settlement');
  await capture('settlement', ['.settled-buttons', '.hero', '.board-row']);
  const beforePeek = await page.data();
  // A folded opponent: an unrevealed winner would swap "获胜" for its hand.
  const target = beforePeek.phoneSeats.find((seat) => seat.cards.length === 0 && seat.folded);
  assert.ok(target, 'A folded opponent must be available for the peek regression');
  const targetCardIndex = beforePeek.phoneSeats
    .slice(0, beforePeek.phoneSeats.indexOf(target))
    .reduce((sum, seat) => sum + seat.cards.length, 0);
  const peekStarted = await mini.evaluate((id) => {
    const current = getCurrentPages().at(-1);
    current.__peekGeometry = [];
    current.peekSeat({ currentTarget: { dataset: { id } } });
    // Sample the first card after its 650ms flip, while the staggered pair
    // still carries the animation class, then after the class is removed.
    for (const delay of [720, 950])
      setTimeout(() => {
        wx.createSelectorQuery()
          .selectAll('.mini-card')
          .boundingClientRect((cards) => current.__peekGeometry.push({ delay, cards }))
          .exec();
      }, delay);
    const seat = current.data.phoneSeats.find((entry) => entry.id === id);
    return {
      peekArriving: seat.peekArriving,
      wholeCardsArriving: seat.cards.every((card) => card.arriving),
    };
  }, target.id);
  assert.deepEqual(peekStarted, { peekArriving: true, wholeCardsArriving: true });
  const afterPeek = await page.data();
  for (const seat of beforePeek.phoneSeats) {
    const next = afterPeek.phoneSeats.find((entry) => entry.id === seat.id);
    assert.equal(next.rankLift, seat.rankLift);
    assert.equal(next.actionLabel, seat.actionLabel);
    assert.equal(next.rank, seat.rank);
  }
  const revealed = await page.$('.face-arrive');
  assert.equal(await revealed.style('animation-name'), 'hole-flip');
  assert.equal(await revealed.style('animation-duration'), '0.65s');
  await mini.screenshot({ path: path.join(output, 'motion-peek-early.png') });
  await page.waitFor(850);
  assert.equal(await page.$('.seat-hole.peek-arrive'), null);
  assert.equal(await page.$('.face-arrive'), null);
  await mini.screenshot({ path: path.join(output, 'motion-peek-complete.png') });
  const peekGeometry = await mini.evaluate(() => getCurrentPages().at(-1).__peekGeometry);
  assert.equal(peekGeometry.length, 2);
  const firstCard = peekGeometry.map((sample) => sample.cards[targetCardIndex]);
  assert.ok(firstCard.every(Boolean));
  const peekShift = {
    x: Math.abs(firstCard[1].left - firstCard[0].left),
    y: Math.abs(firstCard[1].top - firstCard[0].top),
  };
  assert.ok(peekShift.x <= 1 && peekShift.y <= 1, 'Peek cleanup must keep the card in place');
  report.peekTransition = {
    wholeCard: true,
    durationMs: 650,
    containerFadeMs: 180,
    peerCaptionsPreserved: true,
    endpointGeometry: peekGeometry,
    cleanupShiftPx: peekShift,
  };
  await invoke('peekSeat', { currentTarget: { dataset: { id: target.id } } });
  await captureShowdown();
  await capturePracticeRunout();
  await (await page.$('.review-button')).tap();
  await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
  await capture('review', ['.review-sheet', '.review-tabs', '.review-timeline', '.review-scene']);
  assert.equal(await page.$('.review-summary'), null);
  const stepSize = await (await page.$('.review-step')).size();
  const heroStepCount = (await page.data()).reviewSteps.length;
  if (heroStepCount > 2) {
    const track = await page.$('.review-timeline'),
      third = (await page.$$('.review-step'))[2];
    const visible =
      (await track.offset()).left + (await track.size()).width - 2 - (await third.offset()).left;
    assert.ok(
      Math.abs(visible / stepSize.width - 0.5) < 0.05,
      'Third review card hints at horizontal scrolling',
    );
  } else
    assert.ok(
      Math.abs(stepSize.width - 160) <= 1,
      'One or two hero steps retain their previous width',
    );
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
    assert.ok((await page.data()).reviewSteps.every((step) => options[1].startsWith(step.name)));
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
    '.practice-panel .session-title',
    '.practice-reset',
  ]);
  for (let attempt = 0; attempt < 3; attempt++) {
    await mini.pageScrollTo(100000);
    await page.waitFor(250);
    const data = await page.data();
    const top = await page.$('.top-chrome'),
      bottom = await page.$('.bottom-chrome'),
      nav = await page.$('.nav');
    assert.equal(
      (await page.$$('.practice-panel')).length,
      1,
      'The home page has exactly one practice panel',
    );
    for (const el of [top, bottom, nav])
      assert.equal(await el.style('background-color'), 'rgb(10, 16, 22)');
    assert.equal((await top.offset()).top, 0);
    assert.equal((await top.size()).height, data.topInset + 36);
    assert.equal((await nav.offset()).left, 0);
    assert.equal((await nav.size()).width, data.windowWidth);
    assert.ok(Math.abs((await nav.offset()).top - data.topInset - 36) <= 1);
    assert.equal((await bottom.size()).height, data.bottomInset);
    assert.ok(Math.abs((await bottom.offset()).top + data.bottomInset - data.windowHeight) <= 1);
  }
  await mini.screenshot({ path: path.join(output, 'home-bottom-chrome.png') });
  report.scrollChrome = { opaque: true, practicePanels: 1, bottomScrolls: 3 };
  assert.match(
    (await page.data()).logs[0].text,
    /^第 \d+ 手开始/,
    'Display the real hand start before later activity',
  );
  const resetSize = await (await page.$('.practice-reset')).size();
  assert.ok(
    resetSize.width > 0 && resetSize.height === 32,
    'The reset control in the practice heading has a real touch target',
  );
  await scrollHomeTop();
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
    await rememberLiveGeometry(`settlement-${count}`);
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
  // The count/layout passes deliberately fold Hero. They cannot guarantee a
  // showdown between bots, so exercise actual legal check/calls separately.
  report.showdownCoverage = { additionalHands: 0, heroCheckCalls: 0 };
  for (
    let hand = 0;
    hand < 10 && !report.pages.some((entry) => entry.name === 'showdown');
    hand++
  ) {
    await scrollHomeTop();
    await invoke('nextHand');
    report.showdownCoverage.additionalHands++;
    for (let decision = 0; decision < 30; decision++) {
      await wait((data) => data.done || data.canAct);
      if ((await page.data()).done) break;
      await (await page.$('[data-action="call"]')).tap();
      report.showdownCoverage.heroCheckCalls++;
    }
    await wait((data) => data.done);
    await captureShowdown();
  }
  assert.ok(
    report.pages.some((entry) => entry.name === 'showdown'),
    'At least one real showdown must be captured',
  );
  report.dealTransitions = [];
  await scrollHomeTop();
  for (const method of ['retryHand', 'nextHand']) {
    const before = await page.data();
    await invoke(method);
    const after = await page.data();
    assert.notDeepEqual(
      after.heroCards.map((card) => card.dealKey),
      before.heroCards.map((card) => card.dealKey),
    );
    if (method === 'retryHand')
      assert.deepEqual(
        after.heroCards.map((card) => card.key),
        before.heroCards.map((card) => card.key),
      );
    const face = await page.$('.hero-card'),
      back = await page.$('.card-back');
    assert.equal(await face.style('animation-name'), 'face-arrive');
    assert.equal(await face.style('animation-delay'), '0.42s');
    assert.equal(await back.style('animation-name'), 'deal-back');
    await mini.screenshot({ path: path.join(output, `motion-${method}-early.png`) });
    await page.waitFor(1450);
    assert.equal(await face.style('opacity'), '1');
    // A random premium hand then plays its 2.6 s glow on the same faces.
    assert.equal(
      await face.style('animation-name'),
      (await page.data()).premium ? 'premium-glow' : 'none',
    );
    await mini.screenshot({ path: path.join(output, `motion-${method}-complete.png`) });
    report.dealTransitions.push({
      method,
      heroDelayMs: 420,
      staggerMs: 130,
      backsStaggerMs: 65,
      finiteFrames: [`motion-${method}-early.png`, `motion-${method}-complete.png`],
    });
    await wait((data) => data.canAct);
    await rememberLiveGeometry(`motion-${method}`);
    await (await page.$('[data-action="fold"]')).tap();
    await settle(`motion-${method}`);
    await page.waitFor(1450);
    await assertSettledGeometry(`motion-${method}`);
  }
  // Count actual Page audio.play requests, while retaining the real contexts.
  await mini.evaluate(() => {
    const current = getCurrentPages().at(-1);
    current.__audioPlays = 0;
    for (const audio of current._audio) {
      const play = audio.play.bind(audio);
      audio.play = () => {
        current.__audioPlays++;
        return play();
      };
    }
  });
  if (!(await page.data()).settings.sound)
    await invoke('togglePreference', { currentTarget: { dataset: { key: 'sound' } } });
  if (!(await page.data()).settings.vibration)
    await invoke('togglePreference', { currentTarget: { dataset: { key: 'vibration' } } });
  await invoke('togglePreference', { currentTarget: { dataset: { key: 'sound' } } });
  const mutedBefore = await mini.evaluate(() => ({
    audio: getCurrentPages().at(-1).__audioPlays,
    vibrations: getApp().__noirTurnVibrations.length,
  }));
  await invoke('nextHand');
  await wait((data) => data.canAct);
  const mutedAfter = await mini.evaluate(() => ({
    audio: getCurrentPages().at(-1).__audioPlays,
    vibrations: getApp().__noirTurnVibrations.length,
  }));
  assert.equal(mutedAfter.audio, mutedBefore.audio, 'Sound mute suppresses action audio');
  assert.ok(mutedAfter.vibrations > mutedBefore.vibrations, 'Sound mute retains enabled vibration');
  await invoke('togglePreference', { currentTarget: { dataset: { key: 'vibration' } } });
  await invoke('togglePreference', { currentTarget: { dataset: { key: 'sound' } } });
  await invoke('resetPractice');
  await invoke('confirmReset');
  await wait((data) => data.canAct);
  const enabled = await mini.evaluate(() => ({
    audio: getCurrentPages().at(-1).__audioPlays,
    vibrations: getApp().__noirTurnVibrations.length,
  }));
  assert.ok(enabled.audio > mutedAfter.audio, 'Sound unmute restores action audio');
  assert.equal(enabled.vibrations, mutedAfter.vibrations, 'Vibration mute retains action audio');
  await invoke('togglePreference', { currentTarget: { dataset: { key: 'vibration' } } });
  report.combinedFeedback = {
    mutedBefore,
    mutedAfter,
    enabled,
    scope: 'Real Page audio dispatch and mocked wx vibration; phone hearing/feel not tested',
  };
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
  if (mini) await mini.restoreWxMethod('vibrateShort').catch(() => {});
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}
