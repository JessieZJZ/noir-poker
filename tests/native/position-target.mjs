export function nativeTargetReady(selector) {
  const element = document.querySelector(selector);
  return Boolean(
    element && !element.disabled && !element.hidden && element.getClientRects().length,
  );
}

export function centerNativeTarget(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Native target disappeared: ${selector}`);
  // Anchored menus own their scrolling and clipping. Let the real driver's
  // existing menu positioning run without scrolling the document behind them.
  if (element.closest('.dropdown-menu')) return false;
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  return true;
}

// Position before the standard driver's nearest alignment. The actual click
// still goes through its configured native touch path, with no JS event.
export function withCenteredNativeClicks(app) {
  return {
    ...app,
    async click(selector) {
      await app.waitFor(
        () => app.evaluate(nativeTargetReady, selector),
        30000,
        `Control unavailable before native positioning: ${selector}`,
      );
      await app.evaluate(centerNativeTarget, selector);
      return app.click(selector);
    },
  };
}
