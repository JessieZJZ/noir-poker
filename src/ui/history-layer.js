// Full-screen layers (dialogs, the win-rate calculator, the beginner tutorial)
// own one history entry while open, so Back closes the layer instead of leaving
// the page or app. The entry keeps the current URL and state, so records routes
// are unchanged. Layers stack on that one entry: Back closes the top layer and
// the entry comes back for the layer beneath; a layer closing out of order
// hands the entry to the new top without popping it.
export function createHistoryLayers(window) {
  const stack = [];
  const handlers = new Map();
  // Our own history.back() calls still to arrive as popstate.
  let pendingBacks = 0;
  const marked = () => typeof window.history.state?.noirLayer === 'string';
  const withLayer = (key) => {
    const state = window.history.state;
    return { ...(state && typeof state === 'object' ? state : {}), noirLayer: key };
  };
  const mark = (method) =>
    window.history[method](withLayer(stack.at(-1)), '', window.location.href);
  // While a layer is open the browser must not restore the page's scroll on
  // these same-page entries: a dialog locks and restores it itself, and the
  // position the browser saved was taken under that lock.
  let restoration = null;
  const holdScroll = () => {
    if (restoration !== null || !('scrollRestoration' in window.history)) return;
    restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
  };
  const releaseScroll = () => {
    if (restoration === null || stack.length || pendingBacks) return;
    window.history.scrollRestoration = restoration;
    restoration = null;
  };
  // A reload while a layer was open leaves its entry behind with no layer.
  if (marked()) {
    const { noirLayer: _, ...state } = window.history.state;
    window.history.replaceState(state, '', window.location.href);
  }
  window.addEventListener('popstate', () => {
    if (pendingBacks) {
      // A layer that opened while its predecessor's entry was being popped
      // gets an entry of its own now.
      pendingBacks--;
      if (stack.length && !marked()) mark('pushState');
      releaseScroll();
      return;
    }
    if (!stack.length || marked()) return;
    handlers.get(stack.pop())?.();
    if (stack.length && !marked()) mark('pushState');
    releaseScroll();
  });
  return {
    register(key, onBack) {
      handlers.set(key, onBack);
      return {
        open() {
          if (stack.at(-1) === key) return;
          const index = stack.indexOf(key);
          if (index >= 0) stack.splice(index, 1);
          stack.push(key);
          holdScroll();
          if (pendingBacks) return;
          mark(marked() ? 'replaceState' : 'pushState');
        },
        // The layer closed itself (button, Esc, Android Back): drop its entry,
        // or hand it to the layer still open beneath.
        close() {
          const index = stack.indexOf(key);
          if (index < 0) return;
          stack.splice(index, 1);
          if (!marked() || pendingBacks) return releaseScroll();
          if (stack.length) mark('replaceState');
          else {
            pendingBacks++;
            window.history.back();
          }
        },
      };
    },
  };
}

export const historyLayers = typeof window === 'undefined' ? null : createHistoryLayers(window);
