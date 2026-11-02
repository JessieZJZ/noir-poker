import assert from 'node:assert/strict';
import { withCenteredNativeClicks } from './position-target.mjs';

const identity = (state) => ({
  sessionNumber: state.sessionNumber,
  hand: state.hand,
  attempt: state.replayAttempt,
});
const sameIdentity = (state, intended) =>
  state.sessionNumber === intended.sessionNumber &&
  state.hand === intended.hand &&
  state.replayAttempt === intended.attempt;

function armObservedAction({ selector, intended }) {
  const state = window.noir.getState();
  const actual = {
    sessionNumber: state.sessionNumber,
    hand: state.hand,
    attempt: state.replayAttempt,
  };
  if (
    actual.sessionNumber !== intended.sessionNumber ||
    actual.hand !== intended.hand ||
    actual.attempt !== intended.attempt
  )
    throw Error('The intended hand changed before the native action');
  if (selector === '#continue-deal-button' && state.phase === 'done')
    return { skippedSettled: true, state };
  const target = document.querySelector(selector);
  if (!target || target.disabled || target.hidden || !target.getClientRects().length)
    throw Error('The intended native action is unavailable');
  const rect = target.getBoundingClientRect();
  const events = [];
  const listener = (event) => {
    const current = window.noir.getState();
    events.push({
      event,
      type: event.type,
      target: event.target?.closest?.('button')?.id || null,
      rawTarget: {
        tag: event.target?.tagName,
        id: event.target?.id,
        className: typeof event.target?.className === 'string' ? event.target.className : null,
      },
      trusted: event.isTrusted,
      timeStamp: event.timeStamp,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      detail: event.detail,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      sessionNumber: current.sessionNumber,
      hand: current.hand,
      attempt: current.replayAttempt,
      phase: current.phase,
    });
  };
  for (const type of ['pointerdown', 'pointerup', 'click'])
    document.addEventListener(type, listener, true);
  window.__nativeObservedAction = {
    events,
    release() {
      for (const type of ['pointerdown', 'pointerup', 'click'])
        document.removeEventListener(type, listener, true);
    },
  };
  return {
    state,
    identityArgumentKeys: Object.keys(intended),
    rect: [rect.x, rect.y, rect.width, rect.height],
    scroll: [scrollX, scrollY],
  };
}

function readObservedAction(options = false) {
  const release = typeof options === 'boolean' ? options : options.release;
  const probe = window.__nativeObservedAction;
  const result = {
    // Keep the standard Event until after dispatch. Production onclick runs
    // after our passive capture observer and can still call preventDefault.
    events: (probe?.events || []).map(({ event, ...captured }) => ({
      ...captured,
      defaultPrevented: event.defaultPrevented,
    })),
    state: window.noir.getState(),
  };
  if (options.selector) {
    const target = document.querySelector(options.selector),
      rect = target?.getBoundingClientRect(),
      hit = rect && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    result.frameCoverage = {
      target: target?.id,
      rect: rect && [rect.x, rect.y, rect.width, rect.height],
      hit: hit && { id: hit.id, className: hit.className },
      settledPanelCover:
        !!rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        hit?.id === 'action-panel' &&
        hit.classList.contains('settled-actions'),
    };
  }
  if (release) {
    probe?.release();
    delete window.__nativeObservedAction;
  }
  return result;
}

export function assertObservedAction(result, selector, intended) {
  assert.deepEqual(identity(result.state), intended, 'A native action must not open another hand');
  const clicks = result.events.filter((event) => event.type === 'click');
  for (const event of result.events) {
    assert.equal(event.trusted, true, 'The action must come from real native touch');
    assert.deepEqual(
      { sessionNumber: event.sessionNumber, hand: event.hand, attempt: event.attempt },
      intended,
      'The button event belongs to the intended hand',
    );
  }
  const downs = result.events.filter((event) => event.type === 'pointerdown'),
    ups = result.events.filter((event) => event.type === 'pointerup'),
    settledContinue =
      selector === '#continue-deal-button' &&
      result.armed?.state.phase === 'playing' &&
      sameIdentity(result.armed.state, intended) &&
      result.armed.state.canContinue === true &&
      result.state.phase === 'done';
  if (
    settledContinue &&
    clicks.length === 0 &&
    result.events.length === 2 &&
    downs.length === 1 &&
    ups.length === 1 &&
    result.events[0] === downs[0] &&
    result.events[1] === ups[0] &&
    downs[0].pointerId === ups[0].pointerId &&
    downs[0].pointerType === ups[0].pointerType &&
    downs[0].target === 'continue-deal-button' &&
    ups[0].target === 'continue-deal-button' &&
    downs[0].phase === 'playing' &&
    ups[0].phase === 'done'
  )
    return 'settled-during-cancelled-touch';
  assert.equal(clicks.length, 1, 'One native tap must produce exactly one real control click');
  const click = clicks[0];
  if (
    settledContinue &&
    click.target === 'next-button' &&
    click.defaultPrevented === true &&
    click.phase === 'done' &&
    downs.length === 1 &&
    ups.length === 1 &&
    downs[0].target !== 'next-button'
  )
    return 'settled-with-obsolete-next-blocked';
  for (const event of result.events)
    assert.equal(event.target, selector.slice(1), 'Native touch must hit the intended button');
  if (selector === '#fold-button')
    assert.equal(result.state.players[0].folded, true, 'The single native fold must take effect');
  return 'target-clicked';
}

class SettledBeforeNativeTouch extends Error {
  constructor(state) {
    super('The intended hand settled before native positioning completed');
    this.state = state;
  }
}

export async function tapObservedAction(app, selector, intended, deadline = Date.now() + 60000) {
  let armed, observed;
  const positioningState = Symbol('positioningState');
  const positioningGuard = async () => {
    const state = await app.state();
    return !sameIdentity(state, intended) ||
      (selector === '#continue-deal-button' && state.phase === 'done')
      ? { [positioningState]: state }
      : null;
  };
  const positioned = withCenteredNativeClicks({
    ...app,
    async waitFor(predicate, timeout, message) {
      const result = await app.waitFor(
        async () => {
          const before = await positioningGuard();
          if (before) return before;
          try {
            const ready = await predicate();
            return (await positioningGuard()) || ready;
          } catch (error) {
            const settled = await positioningGuard();
            if (settled) return settled;
            throw error;
          }
        },
        Math.max(1, Math.min(timeout, deadline - Date.now())),
        message,
      );
      if (result?.[positioningState]) {
        const state = result[positioningState];
        assert.deepEqual(identity(state), intended, 'Positioning must stay on the intended hand');
        throw new SettledBeforeNativeTouch(state);
      }
      return result;
    },
    click: async (target) => {
      armed = await app.evaluate(armObservedAction, { selector: target, intended });
      if (armed.skippedSettled) return armed;
      // Use the existing measured WebView frame and a single native touch,
      // rather than the driver's potentially stale accessibility rectangle.
      try {
        await app.nativeTap(target);
      } catch (error) {
        // This exact error comes from nativeTouch's DOM hit-test, before it
        // switches to native context or emits an input request. Preserve all
        // driver errors and every other cover/identity instead of retrying.
        if (
          target === '#continue-deal-button' &&
          error.message.includes('Native touch target is covered')
        ) {
          observed = await app.evaluate(readObservedAction, { release: true, selector: target });
          if (
            armed.state.phase === 'playing' &&
            armed.state.canContinue === true &&
            sameIdentity(observed.state, intended) &&
            observed.state.phase === 'done' &&
            observed.events.length === 0 &&
            observed.frameCoverage.target === 'continue-deal-button' &&
            observed.frameCoverage.settledPanelCover
          )
            return {
              armed,
              ...observed,
              outcome: 'settled-before-covered-touch',
              coverError: error.message,
            };
        }
        throw error;
      }
      let clickError;
      try {
        await app.waitFor(
          async () => {
            const observed = await app.evaluate(readObservedAction);
            return observed.events.some((event) => event.type === 'click') ? observed : null;
          },
          Math.max(1, Math.min(5000, deadline - Date.now())),
          'The one native tap must reach its actual control',
        );
      } catch (error) {
        clickError = error;
      }
      observed = await app.evaluate(readObservedAction, true);
      const outcome = assertObservedAction({ armed, ...observed }, target, intended);
      // Observe the entire existing click window before classifying a zero-
      // click cancellation, so a delayed compatibility click cannot be missed.
      if (clickError && outcome !== 'settled-during-cancelled-touch') throw clickError;
      return { armed, ...observed, outcome };
    },
  });
  try {
    return await positioned.click(selector);
  } catch (error) {
    if (error instanceof SettledBeforeNativeTouch)
      return { skippedSettled: true, state: error.state };
    try {
      error.settlementDiagnostics = {
        intended,
        selector,
        armed,
        ...(observed || (await app.evaluate(readObservedAction, true))),
      };
    } catch {}
    throw error;
  }
}

export async function settleObservedNativeHand(app, ready, { mode = 'accelerated' } = {}) {
  assert.ok(
    ['natural', 'accelerated'].includes(mode),
    'Settlement mode must be explicit and supported',
  );
  const initial = await app.state(),
    intended = identity(initial),
    deadline = Date.now() + 60000,
    actions = [],
    observations = [];
  let continued = false;
  try {
    if (!ready.settledBeforeHero)
      actions.push(await tapObservedAction(app, '#fold-button', intended, deadline));
    for (;;) {
      const next = await app.waitFor(
        async () => {
          const state = await app.state();
          const observation = {
            ...identity(state),
            phase: state.phase,
            actor: state.actor,
            folded: state.players[0].folded,
            canContinue: state.canContinue,
          };
          if (JSON.stringify(observation) !== JSON.stringify(observations.at(-1)))
            observations.push(observation);
          if (!sameIdentity(state, intended)) return { changedHand: true, state };
          // A settled hand needs no optional practice-board tap. Never mistake
          // the replacement next-hand control for the old continue control.
          if (state.phase === 'done') return { settled: true };
          if (
            mode === 'accelerated' &&
            !continued &&
            state.canContinue &&
            (await app.visible('#continue-deal-button'))
          )
            return { continue: true };
          return false;
        },
        Math.max(1, deadline - Date.now()),
        'The intended real observation hand must settle within its original 60-second budget',
      );
      if (next.changedHand)
        assert.deepEqual(
          identity(next.state),
          intended,
          'Settlement must stay on the intended hand',
        );
      if (next.settled) break;
      continued = true;
      actions.push(await tapObservedAction(app, '#continue-deal-button', intended, deadline));
    }
    return { intended, mode, actions, observations, budgetMs: 60000 };
  } catch (error) {
    error.settlementDiagnostics = {
      ...error.settlementDiagnostics,
      intended,
      actions,
      observations,
      mode,
      budgetMs: 60000,
    };
    throw error;
  }
}
