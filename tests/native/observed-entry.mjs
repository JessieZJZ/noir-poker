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
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click'])
    document.addEventListener(type, input, true);
  document.addEventListener('noir:app-state', lifecycle);
  probe.release = () => {
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click'])
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
  // Selenium's WebKit atom classifies any object containing `document` as a
  // Window reference. A primitive JSON string preserves this entire trace,
  // including nested document diagnostics, without element/window wrapping.
  return JSON.stringify(result);
}

export function decodeEntryTouch(wire) {
  assert.equal(typeof wire, 'string', 'Entry trace must cross the driver as serialized JSON');
  const result = JSON.parse(wire);
  const record = (value, name) =>
    assert.ok(
      value && typeof value === 'object' && !Array.isArray(value),
      `Entry trace ${name} must be an object`,
    );
  const visibility = (value, name) => {
    record(value, name);
    assert.equal(typeof value.hidden, 'boolean', `Entry trace ${name}.hidden must be boolean`);
    assert.equal(
      typeof value.visibilityState,
      'string',
      `Entry trace ${name}.visibilityState must be a string`,
    );
    assert.equal(typeof value.hasFocus, 'boolean', `Entry trace ${name}.hasFocus must be boolean`);
  };
  const state = (value, name) => {
    record(value, name);
    assert.ok(
      Number.isSafeInteger(value.hand) && value.hand >= 0,
      `Entry trace ${name}.hand must be a nonnegative integer`,
    );
    assert.equal(typeof value.phase, 'string', `Entry trace ${name}.phase must be a string`);
    assert.equal(
      typeof value.entryState,
      'string',
      `Entry trace ${name}.entryState must be a string`,
    );
    assert.ok(Array.isArray(value.hole), `Entry trace ${name}.hole must be an array`);
    assert.ok(Array.isArray(value.players), `Entry trace ${name}.players must be an array`);
    assert.ok(Number.isFinite(value.pot), `Entry trace ${name}.pot must be finite`);
  };
  record(result, 'payload');
  state(result.state, 'state');
  visibility(result.document, 'document');
  assert.ok(Array.isArray(result.events), 'Entry trace events must be an array');
  assert.ok(Array.isArray(result.lifecycle), 'Entry trace lifecycle must be an array');
  for (const event of result.events) {
    record(event, 'event');
    assert.ok(
      ['pointerdown', 'pointerup', 'pointercancel', 'click'].includes(event.type),
      'Entry trace event.type must be an observed input type',
    );
    assert.ok(
      event.target === null || typeof event.target === 'string',
      'Entry trace event.target must be a string or null',
    );
    assert.equal(typeof event.trusted, 'boolean', 'Entry trace event.trusted must be boolean');
    assert.equal(
      typeof event.defaultPrevented,
      'boolean',
      'Entry trace event.defaultPrevented must be boolean',
    );
    state(event.stateAtEvent, 'event.stateAtEvent');
    visibility(event.documentAtEvent, 'event.documentAtEvent');
    if (event.afterDispatch !== undefined) {
      state(event.afterDispatch, 'event.afterDispatch');
      visibility(event.documentAfterDispatch, 'event.documentAfterDispatch');
    }
  }
  for (const event of result.lifecycle) {
    record(event, 'lifecycle event');
    record(event.detail, 'lifecycle detail');
    assert.equal(
      typeof event.detail.active,
      'boolean',
      'Entry trace lifecycle detail.active must be boolean',
    );
    state(event.state, 'lifecycle state');
    visibility(event.document, 'lifecycle document');
  }
  return result;
}

export async function joinObservedNativeTable(app, before) {
  const deadline = Date.now() + 10000;
  let armed,
    observed,
    during,
    nativeTapCalls = 0,
    wireFailure;
  const read = async (release = false) => {
    const wire = await app.evaluate(readEntryTouch, release);
    try {
      return decodeEntryTouch(wire);
    } catch (error) {
      wireFailure = { message: error.message, wire };
      throw error;
    }
  };
  try {
    armed = await app.evaluate(armEntryTouch);
    assert.equal(armed.before.hand, before.hand);
    assert.equal(armed.before.phase, 'idle');
    nativeTapCalls++;
    await app.nativeTap('#join-table-button');
    let readError;
    await app.waitFor(
      async () => {
        try {
          observed = await read();
        } catch (error) {
          readError = error;
          return true;
        }
        return observed.events.some((event) => event.type === 'click' && event.afterDispatch)
          ? observed
          : null;
      },
      Math.max(1, deadline - Date.now()),
      'The single real join touch must deliver its actual click and handler state',
    );
    if (readError) throw readError;
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
        try {
          observed = await read();
        } catch (error) {
          readError = error;
          return true;
        }
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
    if (readError) throw readError;
    observed = await read(true);
    assert.equal(observed.events.filter((event) => event.type === 'click').length, 1);
    for (const event of observed.events) {
      assert.equal(event.target, 'join-table-button');
      assert.equal(event.trusted, true);
    }
    assert.equal(observed.state.hand, during.hand);
    return { armed, during, ...observed, nativeTapCalls, budgetMs: 10000 };
  } catch (error) {
    try {
      observed = await read(true);
    } catch {}
    error.entryDiagnostics = {
      armed,
      during,
      ...observed,
      nativeTapCalls,
      budgetMs: 10000,
      ...(wireFailure ? { wireFailure } : {}),
    };
    throw error;
  }
}
