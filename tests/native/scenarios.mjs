import assert from 'node:assert/strict';
const documentLoginMarker = (text) => /sign in|log in|登录账号/i.test(text);

// These scenarios drive the installed production bundle. They read only the
// public state already exposed by the app and never install browser fixtures.
export async function nativeScenarios(app) {
  const result = [];
  const check = async (name, run) => {
    const started = Date.now();
    const evidence = await run();
    await app.screenshot(name);
    const entry = { name, status: 'passed', elapsedMs: Date.now() - started, evidence };
    result.push(entry);
    app.record(entry);
    app.log(`PASS ${name}`);
  };
  await check('local-launch-and-no-login', async () => {
    const info = await app.evaluate(() => ({
      href: location.href,
      native: document.documentElement.classList.contains('native-app'),
      fixtures: typeof window.qa,
      footer: document.querySelector('.practice-info')?.textContent,
      state: window.noir?.getState(),
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
    assert.ok(info.state && info.state.playerCount >= 5);
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
    };
  });
  await check('settings-autosave-and-local-portraits', async () => {
    await app.click('#opponents-button');
    await app.select('#language-select', 'zh-CN');
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
        return images.length >= 8 && images.every((image) => image.loaded && image.local)
          ? images
          : null;
      },
      15000,
      'All eight portraits must load from the installed bundle',
    );
    const images = await app.evaluate(() =>
      [...document.querySelectorAll('#profile-cards img')].map((image) => ({
        profile: image.dataset.portraitProfile,
        source: new URL(image.src).pathname,
        width: image.naturalWidth,
      })),
    );
    await app.click('#opponents-dialog .close-dialog');
    // Closing and relaunching exercises Capacitor Preferences, not just in-memory controls.
    await app.relaunch();
    await app.click('#opponents-button');
    const saved = await app.evaluate(() => ({
      players: document.querySelector('#player-count').value,
      emotion: document.querySelector('#emotion-mode').value,
      profile: document.querySelector('[data-bot-seat="1"]').value,
      sound: document.querySelector('#sound-button').getAttribute('aria-checked'),
    }));
    assert.deepEqual(saved, { players: '5', emotion: 'lively', profile: 'tan', sound: 'false' });
    await app.click('#opponents-dialog .close-dialog');
    return { saved, portraits: images };
  });
  await check('raise-call-fold-and-settlement', async () => {
    const coverage = { raise: null, call: null, fold: null };
    let settled;
    let settlementBudget;
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
      if (action === 'fold' && (await app.visible('#continue-deal-button')))
        await app.click('#continue-deal-button');
      if (action !== 'fold') continue;
      await app.waitFor(
        async () => (await app.state()).phase === 'done',
        60000,
        'Hand must settle after fold',
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
    return { coverage, pot: settled.pot, settlementBudget };
  });
  await check('settlement-decision-review', async () => {
    await app.click('#review-hand-button');
    const review = await app.waitFor(
      async () =>
        app.evaluate(() => {
          const dialog = document.querySelector('#review-dialog');
          const overview = document.querySelector('#review-overview')?.textContent.trim();
          const suggestion = document.querySelector('#review-suggestion')?.textContent.trim();
          return dialog.open &&
            overview &&
            suggestion &&
            !/分析中|undefined/.test(overview + suggestion)
            ? { overview, suggestion }
            : null;
        }),
      30000,
      'Installed local review worker must produce an overview and suggestion',
    );
    await app.screenshot('settlement-decision-review-open');
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
  return result;
}
