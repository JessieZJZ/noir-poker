import { nameTooltipPosition } from './name-tooltip-position.js';

export function prepareNameTooltips() {
  const events = new AbortController();
  const tooltip = document.createElement('div');
  tooltip.id = 'seat-name-tooltip';
  tooltip.className = 'seat-name-tooltip';
  tooltip.role = 'tooltip';
  tooltip.hidden = true;
  document.body.append(tooltip);
  let timer, anchor, origin, pressed, observer;
  const on = (target, event, fn, options = {}) =>
    target.addEventListener(event, fn, { ...options, signal: events.signal });
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  const close = () => {
    cancel();
    anchor?.removeAttribute('aria-describedby');
    anchor = null;
    tooltip.hidden = true;
    observer?.disconnect();
    observer = null;
  };
  const show = (label) => {
    cancel();
    if (
      !label.isConnected ||
      label.scrollWidth <= label.clientWidth + 1 ||
      label.dataset.nameFit === 'true'
    )
      return;
    close();
    anchor = label;
    tooltip.textContent = label.textContent.trim();
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    const viewport = window.visualViewport;
    const position = nameTooltipPosition(label.getBoundingClientRect(), box, {
      width: viewport?.width || innerWidth,
      height: viewport?.height || innerHeight,
      top: viewport?.offsetTop || 0,
    });
    Object.assign(tooltip.style, { left: `${position.left}px`, top: `${position.top}px` });
    tooltip.style.setProperty('--tooltip-arrow', `${position.arrow}px`);
    tooltip.dataset.placement = position.placement;
    label.setAttribute('aria-describedby', tooltip.id);
    observer = new MutationObserver(() => {
      if (!label.isConnected) close();
    });
    observer.observe(label.closest('.seats') || label.closest('.arena'), {
      childList: true,
      subtree: true,
    });
    pressed = true;
  };
  const labelAt = (event) => event.target.closest?.('.seat-name-label, .seat-style-label');
  on(document, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    if (!tooltip.contains(event.target)) close();
    pressed = false;
    const label = labelAt(event);
    if (!label) return;
    origin = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => show(label), 450);
  });
  on(
    document,
    'pointermove',
    (event) => {
      if (timer && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) cancel();
    },
    { passive: true },
  );
  on(document, 'pointerup', cancel);
  on(document, 'pointercancel', cancel);
  on(document, 'contextmenu', (event) => {
    const label = labelAt(event);
    if (label) {
      event.preventDefault();
      show(label);
    }
  });
  on(
    document,
    'click',
    (event) => {
      if (pressed && labelAt(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pressed = false;
      }
    },
    { capture: true },
  );
  on(document, 'keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  on(document, 'scroll', close, { capture: true, passive: true });
  on(document, 'visibilitychange', () => {
    if (document.hidden) close();
  });
  for (const event of ['resize', 'pagehide', 'popstate', 'hashchange']) on(window, event, close);
  return () => {
    close();
    events.abort();
    tooltip.remove();
  };
}
