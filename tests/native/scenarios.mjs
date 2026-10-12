import assert from 'node:assert/strict';
import { readTableLayout, assertTableLayout } from './layout.mjs';
import { readCardRankState, readNativeRankInk, assertStableRankInk } from './card-ranks.mjs';
const documentLoginMarker = (text) => /sign in|log in|登录账号/i.test(text);

// Keep the installed-app completion assertion and its existing deadline. The
// observations distinguish a working but slow review from a failed WebView or
// an analysis that stopped progressing; they do not authorize a partial pass.
export async function waitForNativeReview(app, { now = Date.now } = {}) {
  const started = now();
  const diagnostics = { timeoutMs: 30000, observations: [], progress: [] };
  let lastSnapshot;
  let lastDone = -1;
  let lastProgressAt = started;
  try {
    const review = await app.waitFor(
      async () => {
        let snapshot;
        try {
          snapshot = await app.evaluate(() => {
            const analysisState = document
              .querySelector('#review-analysis-state')
              ?.textContent.trim();
            const ratio = /正在分析决策\s+(\d+)\s*\/\s*(\d+)/.exec(analysisState || '');
            const retry = document.querySelector('#review-retry');
            return {
              dialogOpen: Boolean(document.querySelector('#review-dialog')?.open),
              analysisState,
              done: ratio ? Number(ratio[1]) : null,
              total: ratio ? Number(ratio[2]) : null,
              decisionCount: document.querySelectorAll('#review-timeline .review-step').length,
              retryVisible: Boolean(retry && !retry.hidden),
              analysisStatus: document.querySelector('#review-dialog')?.dataset.analysisStatus,
              decisionTitle: document.querySelector('#review-decision-title')?.textContent.trim(),
              summaryCount: document.querySelectorAll('.review-summary, #review-overview').length,
              suggestion: document.querySelector('#review-suggestion')?.textContent.trim(),
            };
          });
        } catch (error) {
          diagnostics.observations.push({ elapsedMs: now() - started, readError: error.message });
          throw error;
        }
        const elapsedMs = now() - started;
        const key = JSON.stringify(snapshot);
        if (key !== lastSnapshot) {
          diagnostics.observations.push({ elapsedMs, ...snapshot });
          lastSnapshot = key;
        }
        if (Number.isInteger(snapshot.done) && snapshot.done > lastDone) {
          diagnostics.progress.push({
            done: snapshot.done,
            total: snapshot.total,
            elapsedMs,
            sincePreviousProgressMs: now() - lastProgressAt,
          });
          lastDone = snapshot.done;
          lastProgressAt = now();
        }
        return snapshot.dialogOpen &&
          snapshot.analysisStatus === 'done' &&
          snapshot.decisionTitle &&
          snapshot.suggestion &&
          !/分析中|undefined/.test(snapshot.decisionTitle + snapshot.suggestion)
          ? { decisionTitle: snapshot.decisionTitle, suggestion: snapshot.suggestion }
          : null;
      },
      diagnostics.timeoutMs,
      'Installed local review worker must produce a decision explanation and suggestion',
    );
    diagnostics.elapsedMs = now() - started;
    return { ...review, diagnostics };
  } catch (error) {
    diagnostics.elapsedMs = now() - started;
    error.reviewDiagnostics = diagnostics;
    throw error;
  }
}

// These scenarios drive the installed production bundle. They read only the
// public state already exposed by the app and never install browser fixtures.
export async function nativeScenarios(app) {
  const result = [];
  const selectedScenarios = process.env.NOIR_NATIVE_SCENARIOS?.split(',');
  const check = async (name, run) => {
    if (selectedScenarios && !selectedScenarios.includes(name)) return;
    const started = Date.now();
    try {
      const evidence = await run();
      await app.screenshot(name);
      const entry = { name, status: 'passed', elapsedMs: Date.now() - started, evidence };
      result.push(entry);
      app.record(entry);
      app.log(`PASS ${name}`);
    } catch (error) {
      app.record({
        name,
        status: 'failed',
        elapsedMs: Date.now() - started,
        error: error.stack || String(error),
        ...(error.reviewDiagnostics ? { reviewDiagnostics: error.reviewDiagnostics } : {}),
      });
      throw error;
    }
  };
  await check('local-launch-and-no-login', async () => {
    const fonts = await app.waitFor(
      () =>
        app.evaluate(() =>
          ['Manrope', 'Noto Sans SC'].every((name) =>
            [...document.fonts].some(
              (face) => face.family.replaceAll('"', '') === name && face.status === 'loaded',
            ),
          ),
        ),
      5000,
      'Installed WebView must load the shared local UI fonts',
    );
    if (app.comparePage)
      await app.comparePage('table', [
        '.header',
        '.surface-top',
        '.table-viewport',
        '#bet-slider',
        '.action-buttons',
      ]);
    const layout = await app.evaluate(readTableLayout);
    assertTableLayout(layout);
    const info = await app.evaluate(() => ({
      href: location.href,
      native: document.documentElement.classList.contains('native-app'),
      fixtures: typeof window.qa,
      footer: document.querySelector('.practice-info')?.textContent,
      state: window.noir?.getState(),
      startup: {
        ready: document.documentElement.dataset.appReady === 'true',
        inert: document.body.inert,
        visibility: getComputedStyle(document.body).visibility,
        background: getComputedStyle(document.body).backgroundColor,
        fontRequests: performance
          .getEntriesByType('resource')
          .filter((entry) => /fonts\.(googleapis|gstatic)\.com/.test(entry.name)).length,
        remoteFontLink: Boolean(document.querySelector('[data-web-fonts]')),
      },
      viewport: { width: innerWidth, height: innerHeight },
      controls: ['raise', 'fold', 'call'].map((action) => {
        const rect = document.querySelector(`#${action}-button`).getBoundingClientRect();
        return { action, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      }),
    }));
    assert.ok(info.native, 'The installed app must use the native platform adapter');
    assert.equal(info.fixtures, 'undefined', 'Production app must not contain QA fixtures');
    assert.ok(
      /^(capacitor|https?):\/\/localhost(?:\/|$)/.test(info.href),
      'App must load bundled local code',
    );
    assert.ok(info.footer && !documentLoginMarker(info.footer));
    assert.equal(info.state.playerCount, 5, 'A clean install starts with five players');
    assert.deepEqual(info.startup, {
      ready: true,
      inert: false,
      visibility: 'visible',
      background: 'rgb(11, 16, 23)',
      fontRequests: 0,
      remoteFontLink: false,
    });
    assert.ok(
      info.controls.every(
        (rect) =>
          rect.top >= 0 &&
          rect.bottom <= info.viewport.height &&
          rect.left >= 0 &&
          rect.right <= info.viewport.width &&
          rect.bottom > rect.top &&
          rect.right > rect.left,
      ),
      'The first viewport must contain every action button before any test scroll',
    );
    return {
      origin: info.href,
      playerCount: info.state.playerCount,
      viewport: info.viewport,
      controls: info.controls,
      layout,
      startup: info.startup,
    };
  });
  await check('card-ranks-stay-stable-after-native-repaint', async () => {
    await app.waitHero();
    const before = await app.evaluate(readCardRankState);
    assert.equal(before.textCount, 0);
    assert.equal(before.ranks.length, 2);
    const first = await readNativeRankInk(await app.screenshot('card-ranks-before'), before);
    await app.background();
    await app.sleep(1200);
    await app.activate();
    await app.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        window.dispatchEvent(new Event('resize'));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    const after = await app.evaluate(readCardRankState);
    assert.equal(after.textCount, 0);
    assert.deepEqual(
      after.ranks.map(({ rank, path }) => ({ rank, path })),
      before.ranks.map(({ rank, path }) => ({ rank, path })),
    );
    const second = await readNativeRankInk(await app.screenshot('card-ranks-after'), after);
    assertStableRankInk(first, second);
    return { before: first, after: second, resizePasses: 6, backgroundMs: 1200 };
  });
  await check('phone-portrait-or-tablet-rotation', async () => {
    await app.waitHero();
    const readOrientation = () =>
      app.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        tablet: document.documentElement.dataset.tablet === 'true',
        blocked: document.querySelector('#orientation-dialog').open,
        hand: window.noir.getState().hand,
      }));
    const before = await readOrientation();
    let landscape;
    let request;
    try {
      request = await app.rotate('LANDSCAPE', { allowPortraitLock: !before.tablet });
      await app.sleep(1000);
      landscape = await readOrientation();
      if (before.tablet)
        assert.ok(landscape.width > landscape.height, 'Tablet must allow landscape');
      else assert.ok(landscape.height > landscape.width, 'Phone must keep normal portrait');
      assert.equal(
        landscape.blocked,
        false,
        'The native orientation policy must keep the table usable',
      );
      assert.equal(landscape.hand, before.hand, 'Rotation must not redeal');
      await app.screenshot('orientation-landscape-request');
    } finally {
      await app.rotate('PORTRAIT');
    }
    await app.sleep(1000);
    const portrait = await readOrientation();
    assert.ok(portrait.height > portrait.width, 'Normal upright portrait must remain available');
    assert.equal(portrait.blocked, false);
    assert.equal(portrait.hand, before.hand);
    return { before, request, landscape, portrait };
  });
  await check('crown-seat-and-style-row', async () => {
    const tables = [];
    for (const count of [6, 8]) {
      await app.click('#opponents-button');
      await app.select('#player-count', String(count));
      if (
        await app.evaluate(
          () => document.querySelector('#mix-opponents').getAttribute('aria-pressed') !== 'true',
        )
      )
        await app.click('#mix-opponents');
      await app.click('#opponents-dialog .close-dialog');
      await app.click('#reset-button');
      await app.click('#confirm-reset');
      await app.waitFor(
        async () => (await app.state()).playerCount === count,
        15000,
        'The selected table size must apply through the normal reset controls',
      );
      await app.evaluate(() => window.scrollTo(0, 0));
      const layout = await app.evaluate(readTableLayout);
      assertTableLayout(layout);
      const presentation = await app.evaluate(() => {
        const crown = document.querySelector('.seat-crown .seat-profile').getBoundingClientRect(),
          rail = document.querySelector('.poker-table').getBoundingClientRect();
        const names = [...document.querySelectorAll('.seat-style-label')].map((tag) => ({
          full: tag.scrollWidth <= tag.clientWidth + 1,
          below:
            tag.closest('.seat-profile').querySelector('.seat-stack').getBoundingClientRect().top >=
            tag.getBoundingClientRect().bottom - 0.5,
        }));
        return { straddles: crown.top < rail.top && crown.bottom > rail.top, names };
      });
      assert.ok(presentation.straddles, 'The crown profile must straddle the rail');
      assert.ok(
        presentation.names.every((tag) => tag.below),
        'Chips must sit below the style row',
      );
      assert.ok(
        await app.evaluate(() =>
          [...document.querySelectorAll('.seat-style-label')].every(
            (tag) =>
              tag.textContent.trim() &&
              tag.title &&
              getComputedStyle(tag).textOverflow === 'ellipsis',
          ),
        ),
        'Named style labels preserve their complete accessible identity',
      );
      await app.screenshot(`crown-${count}-style-row`);
      tables.push({ count, presentation, layout });
    }
    return { tables };
  });
  await check('native-turn-haptics-bridge', async () => {
    const bridge = await app.evaluate(async () => {
      const available = window.Capacitor.isPluginAvailable('Haptics');
      if (!available) throw Error('Native Haptics plugin is missing');
      await window.Capacitor.nativePromise('Haptics', 'impact', { style: 'LIGHT' });
      return {
        available,
        style: 'LIGHT',
        scope: 'Installed native bridge call; physical feel requires a device with a vibrator',
      };
    });
    assert.equal(bridge.available, true);
    return bridge;
  });
  await check('mixed-toggle-and-visual-guide', async () => {
    await app.click('#opponents-button');
    if (
      await app.evaluate(
        () => document.querySelector('#mix-opponents').getAttribute('aria-pressed') === 'true',
      )
    )
      await app.click('#mix-opponents');
    await app.select('[data-bot-seat="1"]', 'tan');
    await app.select('[data-bot-seat="2"]', 'balanced');
    await app.click('#mix-opponents');
    assert.equal(
      await app.evaluate(() =>
        document.querySelector('#mix-opponents').getAttribute('aria-pressed'),
      ),
      'true',
    );
    await app.select('[data-bot-seat="3"]', 'ivey');
    await app.click('#mix-opponents');
    const assignments = await app.evaluate(() =>
      [1, 2, 3].map((id) => document.querySelector(`[data-bot-seat="${id}"]`).value),
    );
    assert.deepEqual(assignments, ['tan', 'balanced', 'ivey']);
    await app.click('#opponents-dialog .close-dialog');
    await app.click('#rules-button');
    const guide = await app.evaluate(() => ({
      hands: document.querySelectorAll('.hand-example').length,
      cards: document.querySelectorAll('.guide-card').length,
      positions: document.querySelector('.position-glossary').textContent,
    }));
    assert.equal(guide.hands, 9);
    assert.equal(guide.cards, 45);
    assert.ok(guide.positions.includes('HJ · Hijack') && guide.positions.includes('CO · Cutoff'));
    await app.screenshot('visual-beginner-guide');
    await app.click('#rules-dialog .icon-button.close-dialog');
    return { assignments, guide };
  });
  await check('settings-autosave-and-local-portraits', async () => {
    await app.click('#opponents-button');
    const languageChanges = [];
    const changeLanguage = async (target) => {
      const before = await app.evaluate(() => ({
        language: document.querySelector('#language-select').value,
        timeOrigin: performance.timeOrigin,
        hand: window.noir.getState().hand,
      }));
      if (before.language === target) return;
      await app.select('#language-select', target);
      // Catalog loading updates the current document. Check translated text,
      // the open dialog and the hand as well as the locale attribute.
      const after = await app.waitFor(
        async () => {
          const loaded = await app.evaluate(() => ({
            language: document.documentElement.lang,
            timeOrigin: performance.timeOrigin,
            ready: document.documentElement.dataset.appReady === 'true',
            initialized: Boolean(window.noir?.getState()),
            settingsOpen: document.querySelector('#opponents-dialog')?.open,
            title: document.querySelector('#opponents-dialog h2')?.textContent.trim(),
            hand: window.noir?.getState().hand,
          }));
          return loaded.language === target &&
            loaded.title === (target === 'en' ? 'Settings' : '设置') &&
            loaded.ready &&
            loaded.initialized
            ? loaded
            : null;
        },
        30000,
        `Language ${target} must finish localizing the installed document`,
      );
      assert.equal(after.timeOrigin, before.timeOrigin, 'Changing language must not reload');
      assert.equal(after.settingsOpen, true, 'Changing language must keep settings open');
      assert.equal(after.hand, before.hand, 'Changing language must not start another hand');
      languageChanges.push({
        from: before.language,
        to: after.language,
        beforeTimeOrigin: before.timeOrigin,
        afterTimeOrigin: after.timeOrigin,
      });
    };
    const initialLanguage = await app.evaluate(() => document.documentElement.lang);
    // Force a real change even on a simulator that already starts in Chinese;
    // this exercises the same live catalog path as an English CI simulator.
    await changeLanguage(initialLanguage === 'en' ? 'zh-CN' : 'en');
    await changeLanguage('zh-CN');
    await app.select('#player-count', '5');
    await app.select('#emotion-mode', 'lively');
    await app.select('[data-bot-seat="1"]', 'tan');
    await app.click('#sound-button');
    await app.waitFor(
      async () => {
        const images = await app.evaluate(() =>
          [...document.querySelectorAll('#profile-cards img[data-portrait-profile]')].map(
            (image) => ({
              profile: image.dataset.portraitProfile,
              src: image.currentSrc || image.src,
              loaded: image.complete && image.naturalWidth > 0 && !image.hidden,
              local: new URL(image.currentSrc || image.src).origin === location.origin,
            }),
          ),
        );
        return images.length === 16 && images.every((image) => image.loaded && image.local)
          ? images
          : null;
      },
      15000,
      'All sixteen portraits must load from the installed bundle',
    );
    const images = await app.evaluate(() =>
      [...document.querySelectorAll('#profile-cards img')].map((image) => ({
        profile: image.dataset.portraitProfile,
        source: new URL(image.src).pathname,
        width: image.naturalWidth,
      })),
    );
    if (app.comparePage)
      await app.comparePage('settings', [
        '#opponents-dialog',
        '.settings-dialog .dialog-header',
        '.general-settings',
        '.difficulty-module',
      ]);
    await app.click('#opponents-dialog .close-dialog');
    // Closing and relaunching exercises Capacitor Preferences, not just in-memory controls.
    await app.relaunch();
    await app.click('#opponents-button');
    const saved = await app.evaluate(() => ({
      language: document.querySelector('#language-select').value,
      players: document.querySelector('#player-count').value,
      emotion: document.querySelector('#emotion-mode').value,
      profile: document.querySelector('[data-bot-seat="1"]').value,
      sound: document.querySelector('#sound-button').getAttribute('aria-checked'),
    }));
    assert.deepEqual(saved, {
      language: 'zh-CN',
      players: '5',
      emotion: 'lively',
      profile: 'tan',
      sound: 'false',
    });
    await app.click('#opponents-dialog .close-dialog');
    return { saved, languageChanges, portraits: images };
  });
  await check('researched-players-and-new-style-persistence', async () => {
    const ids = ['ivey', 'negreanu', 'hellmuth', 'antonius', 'koon', 'chidwick', 'holz', 'haxton'];
    await app.click('#opponents-button');
    const details = [];
    for (const id of ids) {
      await app.click(`[data-profile-preview="${id}"]`);
      await app.waitFor(
        () =>
          app.evaluate(() =>
            document
              .querySelector('#profile-detail')
              .getAnimations()
              .every((a) => a.playState !== 'running'),
          ),
        5000,
        'Profile circular reveal must finish before inspecting and closing it',
      );
      const detail = await app.evaluate(() => {
        const section = document.querySelector('#profile-detail .profile-research');
        return {
          text: section.textContent,
          claims: section.querySelectorAll('a').length,
          sources: document.querySelectorAll('#profile-detail .profile-source-records a').length,
          overflow: section.scrollWidth > section.clientWidth + 1,
        };
      });
      assert.ok(detail.text.includes('2026-10-11'));
      assert.ok(detail.claims > 0 && detail.sources >= 2);
      assert.equal(detail.overflow, false);
      if (id === 'haxton') {
        await app.screenshot('researched-haxton-detail');
        if (app.comparePage)
          await app.comparePage('player', [
            '#profile-detail',
            '.profile-detail-heading',
            '.profile-detail-content',
          ]);
      }
      details.push({ id, ...detail });
      if (await app.visible('[data-close-profile-detail]'))
        await app.click('[data-close-profile-detail]');
    }
    await app.select('[data-bot-seat="1"]', 'haxton');
    await app.click('#opponents-dialog .close-dialog');
    await app.relaunch();
    const applied = await app.state();
    assert.equal(applied.players[1].botProfile, 'haxton');
    await app.click('#opponents-button');
    const saved = await app.evaluate(() => document.querySelector('[data-bot-seat="1"]').value);
    assert.equal(saved, 'haxton');
    await app.click('#opponents-dialog .close-dialog');
    return { details, saved, applied: applied.players[1].botProfile };
  });
  await check('raise-call-fold-and-settlement', async () => {
    const coverage = { raise: null, call: null, fold: null };
    let settled;
    let settlementBudget;
    let beforeFold;
    // Capture public state immediately after the actual click handler, before
    // bot timers or an uncalled-bet refund can obscure the chip transfer.
    const actAndObserve = async (action) => {
      await app.evaluate((action) => {
        window.__nativeActionObservation = null;
        document.querySelector(`#${action}-button`).addEventListener(
          'click',
          () => {
            window.__nativeActionObservation = window.noir.getState();
          },
          { once: true },
        );
      }, action);
      await app.click(`#${action}-button`);
      return app.evaluate(() => window.__nativeActionObservation);
    };
    // A zero-priced call button is a check, not paid-call coverage. Real random
    // hands may also end immediately after a raise, so use bounded new deals.
    for (let decision = 0; decision < 45 && !Object.values(coverage).every(Boolean); decision++) {
      if ((await app.state()).phase === 'done') await app.click('#next-button');
      const turn = await app.waitFor(
        async () => {
          const game = await app.state();
          return game.phase === 'done' || game.legal.enabled ? game : null;
        },
        90000,
        'A real hand must reach a hero decision or settlement',
      );
      if (turn.phase === 'done') continue;
      // Public pot includes all committed chips from earlier streets. A bot
      // may rebuy between real hands, so infer this hand's budget rather than
      // treating the initial five stacks as a permanent table balance.
      settlementBudget = turn.players.reduce((sum, player) => sum + player.stack, 0) + turn.pot;
      const action =
        !coverage.call && turn.legal.toCall > 0
          ? 'call'
          : !coverage.raise && turn.legal.canRaise
            ? 'raise'
            : coverage.call && coverage.raise
              ? 'fold'
              : 'call';
      if (action === 'raise') await app.click('[data-preset="min"]');
      if (action === 'fold') beforeFold = await app.evaluate(readTableLayout);
      const acted = await actAndObserve(action);
      assert.ok(acted, 'A real enabled click must reach the game handler');
      const paid = turn.stack - acted.stack;
      if (action === 'fold') assert.ok(acted.players[0].folded);
      else if (action === 'raise') {
        assert.equal(paid, turn.legal.minRaiseTo - turn.players[0].bet);
        assert.equal(acted.players[0].lastAction?.bet, turn.legal.minRaiseTo);
        assert.ok(paid > turn.legal.callAmount, 'Raise must pay beyond the call');
      } else {
        assert.equal(paid, Math.min(turn.legal.toCall, turn.stack));
      }
      assert.equal(acted.stack % 25, 0);
      if (action !== 'call' || paid > 0)
        coverage[action] = {
          hand: acted.hand,
          street: turn.street,
          action: acted.players[0].lastAction,
          paid,
          callRequired: action === 'call' ? turn.legal.toCall : undefined,
        };
      if (action === 'fold' && (await app.visible('#continue-deal-button'))) {
        try {
          await app.click('#continue-deal-button');
        } catch (error) {
          // Real bots can finish during a slow driver round trip. Only an
          // already completed hand makes the disappearing button expected.
          if ((await app.state()).phase !== 'done') throw error;
        }
      }
      if (action !== 'fold') continue;
      await app.waitFor(
        () =>
          app.evaluate(
            () =>
              window.noir.getState().phase === 'done' &&
              document.querySelector('#arena').classList.contains('is-done') &&
              !document.querySelector('#next-button').hidden &&
              document.querySelector('#continue-deal-button').hidden,
          ),
        60000,
        'Hand must complete its visible settlement after fold',
      );
      settled = await app.state();
    }
    assert.ok(
      Object.values(coverage).every(Boolean),
      'Bounded real decisions must exercise a paid call, raise and fold',
    );
    settled ??= await app.state();
    assert.equal(settled.pot % 25, 0);
    assert.ok(settled.players.every((player) => player.stack % 25 === 0));
    assert.equal(
      settled.players.reduce((sum, player) => sum + player.stack, 0),
      settlementBudget,
      'Settlement must conserve chips',
    );
    await app.waitFor(
      () =>
        app.evaluate(() =>
          document
            .querySelector('#board')
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== 'running'),
        ),
      5000,
      'Visible public-card deal and highlight animations must finish before reading face rows',
    );
    const layout = await app.evaluate(readTableLayout);
    assertTableLayout(layout);
    assert.ok(
      Math.abs(layout.table.height - beforeFold.table.height) <= 1,
      'Settlement preserves the live table height',
    );
    assert.ok(Math.abs(layout.table.top - beforeFold.table.top) <= 1);
    assert.ok(
      Math.abs(layout.dock.top - beforeFold.dock.top) <= 1,
      'Only the control dock shrinks',
    );
    const buttons = layout.settledButtons;
    assert.ok(
      buttons.every((button) => Math.abs(button.top - buttons[0].top) <= 1 && button.height >= 44),
    );
    assert.ok(layout.dock.height <= 65 + layout.bottomInset, 'Settlement must use the compact row');
    const crownInspection = [];
    const initialPressed = await app.evaluate(() =>
      document.querySelector('.seat-crown .seat-peek').getAttribute('aria-pressed'),
    );
    for (let toggle = 0; toggle < 2; toggle++) {
      await app.click('.seat-crown .seat-peek');
      await app.waitFor(
        () =>
          app.evaluate(() =>
            document
              .querySelector('.seat-crown .mini-cards')
              .getAnimations({ subtree: true })
              .every((animation) => animation.playState !== 'running'),
          ),
        5000,
        'Finish the staggered seat reveal before measuring its final card bounds',
      );
      const inspection = await app.evaluate(() => {
        const seat = document.querySelector('.seat-crown'),
          view = document.querySelector('.table-viewport').getBoundingClientRect(),
          profile = seat.querySelector('.seat-profile').getBoundingClientRect(),
          scale = new DOMMatrix(getComputedStyle(document.querySelector('#arena')).transform).a;
        return {
          pressed: seat.querySelector('.seat-peek').getAttribute('aria-pressed'),
          cards: [...seat.querySelectorAll('.playing-card')].map((card) => {
            const r = card.getBoundingClientRect();
            return {
              clearOfHint: r.top >= view.top + 10 * scale - 0.5,
              visibleFraction: (profile.top - r.top) / r.height,
            };
          }),
        };
      });
      const expected =
        toggle === 0 ? (initialPressed === 'true' ? 'false' : 'true') : initialPressed;
      assert.equal(inspection.pressed, expected);
      assert.equal(inspection.cards.length, expected === 'true' ? 2 : 0);
      assert.ok(
        inspection.cards.every(
          (card) =>
            card.clearOfHint && card.visibleFraction >= 0.65 && card.visibleFraction <= 0.98,
        ),
      );
      const peekLayout = await app.evaluate(readTableLayout);
      assertTableLayout(peekLayout);
      for (const anchor of ['arena', 'publicArea'])
        for (const key of ['top', 'left', 'height', 'right'])
          assert.ok(
            Math.abs(peekLayout[anchor][key] - layout[anchor][key]) <= 1,
            `${anchor} must stay fixed when inspecting the crown hand`,
          );
      if (expected === 'true') {
        // Layout reads can precede WebKit's compositor frame. Keep the hand
        // open until two frame callbacks have run before the native screenshot.
        await app.evaluate(() => {
          window.__nativeInspectionPainted = false;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.__nativeInspectionPainted = true;
            }),
          );
        });
        await app.waitFor(
          () => app.evaluate(() => window.__nativeInspectionPainted),
          5000,
          'Inspected crown cards must paint before the native screenshot',
        );
        await app.screenshot('crown-hand-inspection');
      }
      crownInspection.push(inspection);
    }
    if (app.comparePage)
      await app.comparePage('settlement', [
        '.surface-top',
        '.table-viewport',
        '#board',
        '.hero-area',
        '.action-panel.settled-actions',
        '#showdown-stage',
      ]);
    return { coverage, pot: settled.pot, settlementBudget, layout, crownInspection };
  });
  await check('settlement-decision-review', async () => {
    await app.click('#review-hand-button');
    const review = await waitForNativeReview(app);
    assert.equal(
      await app.evaluate(
        () =>
          document.querySelectorAll('.review-summary, #review-overview, #review-priority').length,
      ),
      0,
    );
    await app.screenshot('settlement-decision-review-open');
    if (app.comparePage) {
      await app.comparePage('review', [
        '#review-dialog',
        '.review-title-row',
        '.review-tabs',
        '#review-timeline',
        '.review-scene',
      ]);
      await app.click('#review-opponents-tab');
      await app.comparePage('opponent-review', [
        '#review-dialog',
        '.review-tabs',
        '.review-opponent-heading',
      ]);
    }
    await app.click('#review-dialog .close-dialog');
    assert.equal(await app.evaluate(() => document.querySelector('#review-dialog').open), false);
    return review;
  });
  await check('retry-original-deal-and-next-hand', async () => {
    const original = await app.state();
    const handsBefore = await app.evaluate(() => document.querySelector('#stat-hands').textContent);
    await app.click('#restart-hand-button');
    const retried = await app.state();
    assert.equal(retried.hand, original.hand);
    assert.deepEqual(retried.hole, original.hole);
    assert.equal(retried.replayAttempt, original.replayAttempt + 1);
    const handsAfter = await app.evaluate(() => document.querySelector('#stat-hands').textContent);
    assert.equal(
      Number(handsAfter),
      Number(handsBefore) - 1,
      'Retry retracts completed-hand statistics once',
    );
    await app.waitHero();
    await app.click('#fold-button');
    if (await app.visible('#continue-deal-button')) await app.click('#continue-deal-button');
    await app.waitFor(
      async () => (await app.state()).phase === 'done',
      60000,
      'Retried hand must settle',
    );
    await app.click('#next-button');
    const next = await app.state();
    assert.equal(next.hand, original.hand + 1);
    assert.equal(next.replayAttempt, 0);
    assert.ok(!next.players[0].folded);
    return {
      originalHand: original.hand,
      retry: retried.replayAttempt,
      nextHand: next.hand,
      retractedHands: { before: handsBefore, after: handsAfter },
    };
  });
  await check('real-background-cancels-pending-action', async () => {
    await app.waitHero();
    // Observers only record public snapshots. No timers, cards, legal actions
    // or production behavior are replaced. Android hides WebView debugging in
    // the background, so capture both real native lifecycle boundaries.
    await app.evaluate(() => {
      window.__nativeLifecycleObservations = [];
      document.addEventListener('noir:app-state', ({ detail }) => {
        window.__nativeLifecycleObservations.push({
          active: detail.active,
          at: Date.now(),
          state: window.noir.getState(),
        });
      });
    });
    await app.click('#call-button');
    await app.waitFor(
      async () => {
        const game = await app.state();
        return game.phase === 'playing' && game.actor && game.actor !== '你' ? game : null;
      },
      15000,
      'Background test needs a pending opponent action',
    );
    const nativeBackground = await app.background();
    await app.sleep(6000);
    const stillBackgrounded = await app.nativeState();
    const backgroundMs = performance.now() - nativeBackground.startedAt;
    assert.ok([2, 3].includes(stillBackgrounded), 'App must still be natively backgrounded');
    assert.ok(backgroundMs >= 6000, 'Native app must remain in the background for six seconds');
    await app.activate();
    const boundaries = await app.evaluate(() => window.__nativeLifecycleObservations);
    const hiddenIndex = boundaries.findIndex((entry) => !entry.active);
    const paused = boundaries[hiddenIndex];
    const resumed = boundaries.slice(hiddenIndex + 1).find((entry) => entry.active);
    assert.ok(paused && resumed, 'Native inactive and active events must both arrive');
    assert.equal(paused.state.phase, 'playing');
    assert.ok(paused.state.actor && paused.state.actor !== '你');
    assert.deepEqual(
      resumed.state,
      paused.state,
      'Game must not advance while the native app is in the background',
    );
    await app.waitFor(
      async () => {
        const current = await app.state();
        return JSON.stringify(current) !== JSON.stringify(paused.state);
      },
      45000,
      'Game should resume after native foreground event',
    );
    return {
      backgroundMs: Math.round(backgroundMs),
      nativeStateBefore: nativeBackground.nativeState,
      nativeStateAfter: stillBackgrounded,
      jsLifecycleIntervalMs: resumed.at - paused.at,
      pausedActor: paused.state.actor,
      pausedHand: paused.state.hand,
      pausedPhase: paused.state.phase,
    };
  });
  if (app.comparePage)
    await check('every-player-count-matches-web', async () => {
      const comparisons = [];
      for (const count of [5, 6, 7, 8, 9]) {
        await app.click('#opponents-button');
        await app.select('#player-count', String(count));
        comparisons.push(
          await app.comparePage(`settings-${count}`, [
            '#opponents-dialog',
            '.general-settings',
            '#player-count',
            '.seats-module',
          ]),
        );
        await app.click('#opponents-dialog .close-dialog');
        await app.click('#reset-button');
        await app.click('#confirm-reset');
        await app.waitFor(async () => (await app.state()).playerCount === count, 15000);
        await app.waitHero();
        await app.evaluate(() => window.scrollTo(0, 0));
        assertTableLayout(await app.evaluate(readTableLayout));
        comparisons.push(
          await app.comparePage(`table-${count}`, [
            '.table-viewport',
            '#board',
            '.hero-area',
            '.action-panel',
            ...Array.from({ length: count - 1 }, (_, index) => `.seat-${index + 1}`),
          ]),
        );
        await app.click('#fold-button');
        if (await app.visible('#continue-deal-button')) {
          try {
            await app.click('#continue-deal-button');
          } catch (error) {
            if ((await app.state()).phase !== 'done') throw error;
          }
        }
        await app.waitFor(async () => (await app.state()).phase === 'done', 90000);
        comparisons.push(
          await app.comparePage(`settlement-${count}`, [
            '.table-viewport',
            '#board',
            '.hero-area',
            '.action-panel.settled-actions',
            '#showdown-stage',
          ]),
        );
        await app.click('#review-hand-button');
        await waitForNativeReview(app);
        comparisons.push(
          await app.comparePage(`review-${count}`, [
            '#review-dialog',
            '.review-tabs',
            '#review-timeline',
            '.review-scene',
          ]),
        );
        await app.click('#review-dialog .close-dialog');
      }
      return comparisons;
    });
  if (app.comparePage)
    await check('all-secondary-pages-match-web', async () => {
      const comparisons = [];
      await app.click('#rules-button');
      comparisons.push(
        await app.comparePage('guide', [
          '#rules-dialog',
          '#rules-dialog .dialog-header',
          '#rules-dialog h2',
          '.rules-flow',
        ]),
      );
      await app.click('#rules-dialog .close-dialog');
      await app.click('.pot-details-trigger');
      comparisons.push(
        await app.comparePage('pots', [
          '#pot-dialog',
          '#pot-dialog .dialog-header',
          '#pot-dialog-title',
          '.pot-detail-card',
        ]),
      );
      await app.click('#pot-dialog .close-dialog');
      await app.click('#reset-button');
      comparisons.push(
        await app.comparePage('reset', [
          '#reset-dialog',
          '#reset-dialog .dialog-header',
          '#reset-dialog h2',
          '.dialog-actions',
        ]),
      );
      await app.click('#reset-dialog .close-dialog');
      await app.evaluate(() => document.querySelector('.session-card').scrollIntoView());
      const stickyChrome = await app.evaluate(() => {
        const header = document.querySelector('.header'),
          style = getComputedStyle(header);
        return {
          top: header.getBoundingClientRect().top,
          inset: parseFloat(style.top),
          background: style.backgroundColor,
          cap: getComputedStyle(header, '::before').backgroundColor,
        };
      });
      assert.ok(
        Math.abs(stickyChrome.top - stickyChrome.inset) <= 1,
        'Header remains at the native safe area while scrolling',
      );
      assert.equal(stickyChrome.background, 'rgb(10, 16, 22)');
      assert.equal(stickyChrome.cap, stickyChrome.background);
      comparisons.push(
        await app.comparePage('session-activity', [
          '.session-card',
          '.activity-card',
          '.site-footer',
        ]),
      );
      await app.evaluate(() => window.scrollTo(0, 0));
      await app.click('#native-about-button');
      comparisons.push(
        await app.comparePage('about', [
          '#native-about-dialog',
          '#native-about-dialog h2',
          '#native-about-dialog p',
        ]),
      );
      await app.click('#native-about-dialog a[href="./app-privacy.html"]');
      await app.waitFor(
        async () => app.evaluate(() => !!document.querySelector('#policy-language')),
        15000,
        'Local privacy policy must load',
      );
      comparisons.push(
        await app.comparePage('privacy', [
          'main',
          '#policy-language',
          'article:not([hidden]) h1',
          'article:not([hidden]) p',
        ]),
      );
      return comparisons;
    });
  return result;
}
