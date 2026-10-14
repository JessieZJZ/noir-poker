export function nativeTargetReady(selector) {
  const element = document.querySelector(selector);
  if (
    element &&
    !element.closest('dialog[open]') &&
    (document.documentElement.dataset.homeScrollLocked === 'true' ||
      document.querySelector('dialog[open]'))
  )
    return false;
  return Boolean(
    element && !element.disabled && !element.hidden && element.getClientRects().length,
  );
}

export function readNativeTargetPosition(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Native target disappeared: ${selector}`);
  const rect = element.getBoundingClientRect(),
    viewport = window.visualViewport;
  return {
    rect: [rect.x, rect.y, rect.width, rect.height],
    scroll: [window.scrollX, window.scrollY],
    viewport: viewport && [
      viewport.width,
      viewport.height,
      viewport.offsetLeft,
      viewport.offsetTop,
      viewport.scale,
    ],
  };
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
      if (await app.evaluate(centerNativeTarget, selector)) {
        let previous,
          stable = 0;
        // Dialog close restores body scrolling and schedules layout work.
        // Observe three consecutive positions before delegating one real tap.
        await app.waitFor(
          async () => {
            if (!(await app.evaluate(nativeTargetReady, selector))) {
              previous = undefined;
              stable = 0;
              return false;
            }
            const position = JSON.stringify(await app.evaluate(readNativeTargetPosition, selector));
            if (position === previous) stable++;
            else {
              previous = position;
              stable = 0;
              await app.evaluate(centerNativeTarget, selector);
            }
            return stable >= 2;
          },
          5000,
          `Native target geometry did not stabilize: ${selector}`,
        );
      }
      return app.click(selector);
    },
  };
}
