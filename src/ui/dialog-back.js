import { historyLayers } from './history-layer.js';

// Back on a dialog acts like Esc: the dialog's own cancel handler can close a
// sub-view first (an opponent's detail in settings) and keep the dialog open;
// otherwise the dialog closes. Returns whether the dialog closed.
export function dismissDialog(dialog) {
  const event = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent?.(event);
  if (event.defaultPrevented) return false;
  dialog.close();
  return true;
}

// Dialogs with their own Back (the tutorial and the win-rate calculator) or
// none (the rotate-device prompt) are left alone.
const OWN_BACK = new Set(['orientation-dialog', 'tutorial-dialog', 'win-rate-dialog']);

// Every other full-screen dialog takes one history layer while open, so the
// browser's Back (or a phone's Back gesture in the browser) closes it instead
// of leaving the page. Dialogs created later are picked up as they open.
export function trackDialogBack(document, layers = historyLayers) {
  const tracked = new WeakMap();
  function layerFor(dialog) {
    if (!dialog.id || OWN_BACK.has(dialog.id)) return null;
    if (tracked.has(dialog)) return tracked.get(dialog);
    const layer = layers.register(`dialog:${dialog.id}`, () => {
      if (!dismissDialog(dialog)) layer.open();
    });
    dialog.addEventListener('close', () => layer.close());
    tracked.set(dialog, layer);
    return layer;
  }
  const opened = (dialog) => dialog.open && layerFor(dialog)?.open();
  const observer = new document.defaultView.MutationObserver((records) => {
    for (const record of records) if (record.target.localName === 'dialog') opened(record.target);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  document.querySelectorAll('dialog[open]').forEach(opened);
  return () => observer.disconnect();
}
