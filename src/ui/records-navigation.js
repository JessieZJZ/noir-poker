export function recordsRoute(hash) {
  if (hash === '#records') return { page: 'list' };
  if (!hash.startsWith('#records/')) return { page: 'game' };
  try {
    const id = decodeURIComponent(hash.slice('#records/'.length));
    return id ? { page: 'hand', id } : { page: 'list' };
  } catch {
    return { page: 'list' };
  }
}

const depth = (route) => ({ game: 0, list: 1, hand: 2 })[route.page];
const equal = (a, b) => a.page === b.page && a.id === b.id;
const CLOSED_ROUTES_KEY = 'noir-records-closed-routes-v1';

// All three pages share the same document and live engine. History entries
// represent pages, never new practice sessions or another WebView.
export function createRecordsNavigation({
  window,
  show,
  id = () => window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
}) {
  let current = { page: 'game' },
    flow,
    pending = false,
    initialized = false;
  const closed = new Set();
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CLOSED_ROUTES_KEY));
    if (Array.isArray(saved))
      saved
        .filter((value) => typeof value === 'string')
        .slice(-32)
        .forEach((value) => closed.add(value));
  } catch {}

  function closeFlow(value) {
    if (!value) return;
    closed.add(value);
    try {
      window.sessionStorage.setItem(CLOSED_ROUTES_KEY, JSON.stringify([...closed].slice(-32)));
    } catch {}
  }
  function url(route) {
    const hash =
      route.page === 'list'
        ? '#records'
        : route.page === 'hand'
          ? '#records/' + encodeURIComponent(route.id)
          : '';
    return window.location.pathname + window.location.search + hash;
  }
  function write(route, method = 'replaceState') {
    const existing = window.history.state;
    window.history[method](
      {
        ...(existing && typeof existing === 'object' ? existing : {}),
        noirRecords: route,
        noirRecordsNavigation: { version: 1, flow, depth: depth(route) },
      },
      '',
      url(route),
    );
  }
  function publish(next) {
    current = { ...next };
    show({ ...current });
  }
  function managed(route) {
    const state = window.history.state,
      marker = state?.noirRecordsNavigation;
    return (
      marker?.version === 1 &&
      typeof marker.flow === 'string' &&
      marker.depth === depth(route) &&
      state.noirRecords &&
      equal(state.noirRecords, route)
    );
  }
  function establish(next) {
    flow = id();
    write({ page: 'game' });
    if (next.page !== 'game') write({ page: 'list' }, 'pushState');
    if (next.page === 'hand') write(next, 'pushState');
    publish(next);
  }
  function sync(event) {
    // A traversal emits popstate and then hashchange. The older hashchange
    // must not release a newer Back gesture that is still awaiting popstate.
    if (pending && event.type !== 'popstate') return;
    pending = false;
    const next = recordsRoute(window.location.hash),
      marker = window.history.state?.noirRecordsNavigation;
    if (next.page === 'game' && current.page !== 'game') closeFlow(flow);
    if (managed(next) && closed.has(marker.flow)) {
      // Explicit Return Game closes the whole visit. Old forward entries
      // cannot reopen a stale record, including after a document reload.
      if (marker.depth > 0) {
        pending = true;
        window.history.go(-marker.depth);
        return;
      }
      flow = id();
      write({ page: 'game' });
      publish({ page: 'game' });
    } else if (managed(next)) {
      flow = marker.flow;
      if (!equal(current, next)) publish(next);
    } else if (!equal(current, next)) establish(next);
  }
  function returnGame() {
    if (pending || current.page === 'game') return;
    closeFlow(flow);
    pending = true;
    window.history.go(-depth(current));
  }
  function navigate(next) {
    if (pending || equal(current, next)) return;
    if (next.page === 'game') return returnGame();
    if (next.page === 'list' && current.page === 'hand') {
      pending = true;
      window.history.back();
      return;
    }
    if (current.page === 'game') {
      // Pushing a fresh visit also truncates the closed visit's forward stack.
      write({ page: 'list' }, 'pushState');
      if (next.page === 'list') return publish(next);
    }
    write(next, current.page === 'hand' ? 'replaceState' : 'pushState');
    publish(next);
  }
  function back() {
    if (pending || current.page === 'game') return;
    if (current.page === 'list') return returnGame();
    pending = true;
    window.history.back();
  }
  return {
    initialize() {
      if (initialized) return;
      initialized = true;
      window.addEventListener('popstate', sync);
      window.addEventListener('hashchange', sync);
      window.addEventListener('noir:records-back', back);
      const next = recordsRoute(window.location.hash);
      if (!managed(next)) return establish(next);
      const marker = window.history.state.noirRecordsNavigation;
      flow = marker.flow;
      if (!closed.has(flow)) return publish(next);
      if (marker.depth === 0) return establish({ page: 'game' });
      publish({ page: 'game' });
      pending = true;
      window.history.go(-marker.depth);
    },
    navigate,
    back,
    route: () => ({ ...current }),
    destroy() {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('noir:records-back', back);
    },
  };
}
