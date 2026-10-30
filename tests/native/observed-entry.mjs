import assert from 'node:assert/strict';

function armEntryTouch() {
  const target = document.querySelector('#join-table-button');
  const rect = target.getBoundingClientRect();
  const documentState = () => ({
    hidden: document.hidden,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
  });
  const snapshot = () => structuredClone(window.noir.getState());
  const timers = new Set();
  const probe = { events: [], lifecycle: [], before: snapshot(), documentBefore: documentState() };
  const input = (event) => {
    const captured = {
      event,
      type: event.type,
      target: event.target?.closest?.('button')?.id || null,
      rawTarget: { tag: event.target?.tagName, id: event.target?.id },
      trusted: event.isTrusted,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      detail: event.detail,
      timeStamp: event.timeStamp,
      clientX: event.clientX,
      clientY: event.clientY,
      stateAtEvent: snapshot(),
      documentAtEvent: documentState(),
    };
    probe.events.push(captured);
    if (event.type === 'click') {
      // A following task observes all synchronous click handlers. A microtask
      // can run between listeners of a real browser-dispatched native event.
      const timer = setTimeout(() => {
        captured.afterDispatch = snapshot();
        captured.documentAfterDispatch = documentState();
        timers.delete(timer);
      }, 0);
      timers.add(timer);
    }
  };
  const lifecycle = (event) =>
    probe.lifecycle.push({
      detail: event.detail,
      at: performance.now(),
      state: snapshot(),
      document: documentState(),
    });
  for (const type of ['pointerdown', 'pointerup', 'click'])
    document.addEventListener(type, input, true);
  document.addEventListener('noir:app-state', lifecycle);
  probe.release = () => {
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.removeEventListener(type, input, true);
    document.removeEventListener('noir:app-state', lifecycle);
    for (const timer of timers) clearTimeout(timer);
  };
  window.__nativeEntryTouch = probe;
  return {
    before: probe.before,
    documentBefore: probe.documentBefore,
    rect: [rect.x, rect.y, rect.width, rect.height],
    scroll: [scrollX, scrollY],
  };
}

function readEntryTouch(release = false) {
  const probe = window.__nativeEntryTouch;
  const result = {
    state: window.noir.getState(),
    events: (probe?.events || []).map(({ event, ...captured }) => ({
      ...captured,
      defaultPrevented: event.defaultPrevented,
    })),
    lifecycle: probe?.lifecycle || [],
    document: {
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
    },
  };
  if (release) {
    probe?.release();
    delete window.__nativeEntryTouch;
  }
  return result;
}

export async function joinObservedNativeTable(app, before) {
  const deadline = Date.now() + 10000;
  let armed,
    observed,
    during,
    nativeTapCalls = 0;
  try {
    armed = await app.evaluate(armEntryTouch);
    assert.equal(armed.before.hand, before.hand);
    assert.equal(armed.before.phase, 'idle');
    nativeTapCalls++;
    await app.nativeTap('#join-table-button');
    await app.waitFor(
      async () => {
        observed = await app.evaluate(readEntryTouch);
        return observed.events.some((event) => event.type === 'click' && event.afterDispatch)
          ? observed
          : null;
      },
      Math.max(1, deadline - Date.now()),
      'The single real join touch must deliver its actual click and handler state',
    );
    const clicks = observed.events.filter((event) => event.type === 'click');
    assert.equal(clicks.length, 1, 'One real join touch must deliver exactly one click');
    for (const event of observed.events) {
      assert.equal(
        event.target,
        'join-table-button',
        'The join touch must hit the intended control',
      );
      assert.equal(event.trusted, true, 'Join must come from the single real native touch');
    }
    assert.equal(clicks[0].defaultPrevented, false);
    during = clicks[0].afterDispatch;
    assert.equal(
      during.hand,
      before.hand + 1,
      'The observed join handler must start exactly the next hand',
    );
    await app.waitFor(
      async () => {
        observed = await app.evaluate(readEntryTouch);
        assert.equal(
          observed.state.hand,
          during.hand,
          'The join gesture must not start a second hand',
        );
        return observed.state.entryState === 'playing' ? observed : null;
      },
      Math.max(1, deadline - Date.now()),
      'Visible entry deal must finish within the original10-second budget',
    );
    observed = await app.evaluate(readEntryTouch, true);
    assert.equal(observed.events.filter((event) => event.type === 'click').length, 1);
    for (const event of observed.events) {
      assert.equal(event.target, 'join-table-button');
      assert.equal(event.trusted, true);
    }
    assert.equal(observed.state.hand, during.hand);
    return { armed, during, ...observed, nativeTapCalls, budgetMs: 10000 };
  } catch (error) {
    try {
      observed = await app.evaluate(readEntryTouch, true);
    } catch {}
    error.entryDiagnostics = { armed, during, ...observed, nativeTapCalls, budgetMs: 10000 };
    throw error;
  }
}
