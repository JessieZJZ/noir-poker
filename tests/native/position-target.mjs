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
  if (
    !element ||
    element.disabled ||
    element.hidden ||
    !element.getClientRects().length ||
    (!element.closest('dialog[open]') &&
      (document.documentElement.dataset.homeScrollLocked === 'true' ||
        document.querySelector('dialog[open]')))
  )
    return null;
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

export function suspendNativeTargetLabelledBy({ selector, token }) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Native target disappeared: ${selector}`);
  if (!element.hasAttribute('aria-labelledby')) return false;
  let pending = window.__noirNativeTargetLabels;
  if (!pending) {
    const entries = new Map();
    pending = {
      entries,
      restore(token) {
        for (const [key, entry] of entries)
          if (token === undefined || key === token) {
            entry.element.setAttribute('aria-labelledby', entry.value);
            entries.delete(key);
          }
        if (!entries.size) {
          window.removeEventListener('pagehide', pending.onPagehide);
          delete window.__noirNativeTargetLabels;
        }
      },
      onPagehide: () => pending.restore(),
    };
    window.__noirNativeTargetLabels = pending;
    window.addEventListener('pagehide', pending.onPagehide);
  }
  pending.entries.set(token, { element, value: element.getAttribute('aria-labelledby') });
  element.removeAttribute('aria-labelledby');
  return true;
}

export function restoreNativeTargetLabelledBy(token) {
  window.__noirNativeTargetLabels?.restore(token);
  return true;
}

let labelToken = 0;

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
            // Sample readiness and geometry in one WebView round trip. A
            // software-rendered emulator can spend >1s per driver command.
            const measured = await app.evaluate(readNativeTargetPosition, selector);
            if (!measured) {
              previous = undefined;
              stable = 0;
              return false;
            }
            const position = JSON.stringify(measured);
            if (position === previous) stable++;
            else {
              previous = position;
              stable = 0;
              // A late modal scroll restore can precede our very first sample.
              // Re-center that sample too, then require three stable readings.
              await app.evaluate(centerNativeTarget, selector);
            }
            return stable >= 2;
          },
          30000,
          `Native target geometry did not stabilize: ${selector}`,
        );
      }
      const token = app.platform === 'ios' ? `native-label-${++labelToken}` : null;
      // Safari exposes summary through nested AX buttons. The calibration
      // iframe also cannot calibrate through a modal, and page-tail controls
      // sit next to the home inset. Use the actual WebView frame for these
      // native taps; never dispatch a DOM click.
      if (
        app.platform === 'ios' &&
        app.nativeTap &&
        (await app.evaluate((selector) => {
          const target = document.querySelector(selector);
          return (
            (target.matches('summary, a') && !!target.closest('dialog[open]')) ||
            ['reset-button', 'hand-rankings-button'].includes(target.id)
          );
        }, selector))
      )
        return app.nativeTap(selector);
      let failed = false;
      try {
        // Appium marks aria-label with a UUID for native AX lookup. A
        // referenced label takes precedence over that marker. Suspend only
        // this competing attribute; Appium owns its aria-label restoration.
        if (token) await app.evaluate(suspendNativeTargetLabelledBy, { selector, token });
        return await app.click(selector);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        if (token)
          try {
            await app.evaluate(restoreNativeTargetLabelledBy, token);
          } catch (error) {
            if (!failed) throw error;
          }
      }
    },
  };
}
