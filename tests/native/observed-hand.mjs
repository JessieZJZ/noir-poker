import assert from 'node:assert/strict';
import { withCenteredNativeClicks } from './position-target.mjs';

const identity = (state) => ({
  sessionNumber: state.sessionNumber,
  hand: state.hand,
  attempt: state.replayAttempt,
});

function armObservedAction({ selector, intended }) {
  const state = window.noir.getState();
  const actual = {
    sessionNumber: state.sessionNumber,
    hand: state.hand,
    attempt: state.replayAttempt,
  };
  if (JSON.stringify(actual) !== JSON.stringify(intended))
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
      target: event.target.closest('button')?.id,
      trusted: event.isTrusted,
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
  return { state, rect: [rect.x, rect.y, rect.width, rect.height], scroll: [scrollX, scrollY] };
}

function readObservedAction(release = false) {
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
  if (release) {
    probe?.release();
    delete window.__nativeObservedAction;
  }
  return result;
}

export function assertObservedAction(result, selector, intended) {
  assert.deepEqual(identity(result.state), intended, 'A native action must not open another hand');
  const clicks = result.events.filter((event) => event.type === 'click');
  assert.equal(clicks.length, 1, 'One native tap must produce exactly one real control click');
  for (const event of result.events) {
    assert.equal(event.trusted, true, 'The action must come from real native touch');
    assert.deepEqual(
      { sessionNumber: event.sessionNumber, hand: event.hand, attempt: event.attempt },
      intended,
      'The button event belongs to the intended hand',
    );
  }
  const click = clicks[0],
    downs = result.events.filter((event) => event.type === 'pointerdown'),
    ups = result.events.filter((event) => event.type === 'pointerup');
  if (
    selector === '#continue-deal-button' &&
    result.armed?.state.phase === 'playing' &&
    JSON.stringify(identity(result.armed.state)) === JSON.stringify(intended) &&
    result.armed.state.canContinue === true &&
    click.target === 'next-button' &&
    click.defaultPrevented === true &&
    click.phase === 'done' &&
    result.state.phase === 'done' &&
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
    return JSON.stringify(identity(state)) !== JSON.stringify(intended) ||
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
      await app.nativeTap(target);
      await app.waitFor(
        async () => {
          const observed = await app.evaluate(readObservedAction);
          return observed.events.some((event) => event.type === 'click') ? observed : null;
        },
        Math.max(1, Math.min(5000, deadline - Date.now())),
        'The one native tap must reach its actual control',
      );
      observed = await app.evaluate(readObservedAction, true);
      const outcome = assertObservedAction({ armed, ...observed }, target, intended);
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

export async function settleObservedNativeHand(app, ready) {
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
          if (JSON.stringify(identity(state)) !== JSON.stringify(intended))
            return { changedHand: true, state };
          // A settled hand needs no optional practice-board tap. Never mistake
          // the replacement next-hand control for the old continue control.
          if (state.phase === 'done') return { settled: true };
          if (!continued && state.canContinue && (await app.visible('#continue-deal-button')))
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
    return { intended, actions, observations, budgetMs: 60000 };
  } catch (error) {
    error.settlementDiagnostics = {
      ...error.settlementDiagnostics,
      intended,
      actions,
      observations,
      budgetMs: 60000,
    };
    throw error;
  }
}
