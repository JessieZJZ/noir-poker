// Full-screen layers (the win-rate calculator, the beginner tutorial) own one
// history entry while open, so Back closes the layer instead of leaving the
// page or app. The entry keeps the current URL and state, so records routes
// are unchanged. One entry is shared: a layer opened over another takes it
// over, and closing a layer that no longer owns it does not pop the new one.
export function createHistoryLayers(window) {
  let owner = null;
  const handlers = new Map();
  const marked = () => typeof window.history.state?.noirLayer === 'string';
  const withLayer = (key) => {
    const state = window.history.state;
    return { ...(state && typeof state === 'object' ? state : {}), noirLayer: key };
  };
  // A reload while a layer was open leaves its entry behind with no layer.
  if (marked()) {
    const { noirLayer: _, ...state } = window.history.state;
    window.history.replaceState(state, '', window.location.href);
  }
  window.addEventListener('popstate', () => {
    if (!owner || marked()) return;
    const key = owner;
    owner = null;
    handlers.get(key)?.();
  });
  return {
    register(key, onBack) {
      handlers.set(key, onBack);
      return {
        open() {
          if (owner === key) return;
          if (owner) window.history.replaceState(withLayer(key), '', window.location.href);
          else window.history.pushState(withLayer(key), '', window.location.href);
          owner = key;
        },
        // The layer closed itself (button, Esc, Android Back): drop its entry.
        close() {
          if (owner !== key) return;
          owner = null;
          if (marked()) window.history.back();
        },
      };
    },
  };
}

export const historyLayers = typeof window === 'undefined' ? null : createHistoryLayers(window);
