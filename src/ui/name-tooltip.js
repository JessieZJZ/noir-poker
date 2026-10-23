import { nameTooltipPosition } from './name-tooltip-position.js';

export function prepareNameTooltips() {
  const events = new AbortController();
  const tooltip = document.createElement('div');
  tooltip.id = 'seat-name-tooltip';
  tooltip.className = 'seat-name-tooltip';
  tooltip.role = 'tooltip';
  tooltip.hidden = true;
  document.body.append(tooltip);
  let timer, pendingLabel, anchor, origin, pressed, observer;
  const on = (target, event, fn, options = {}) =>
    target.addEventListener(event, fn, { ...options, signal: events.signal });
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    pendingLabel = null;
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
    const style = label.matches('.seat-style-label');
    const text = label.getAttribute('data-full-name')?.trim() || label.textContent.trim();
    if (
      !label.isConnected ||
      !text ||
      (!style && (label.scrollWidth <= label.clientWidth + 1 || label.dataset.nameFit === 'true'))
    )
      return;
    close();
    anchor = label;
    tooltip.textContent = text;
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
  const labelAt = (event) => {
    const target = event.target;
    const label = target.closest?.('.seat-name-label, .seat-style-label');
    if (label) return label;
    // Expand the gesture target without moving the dense seat layout or
    // intercepting adjacent controls. Coordinates include table transforms.
    if (target.closest?.('button, a, input, select, textarea')) return null;
    const arena = target.closest?.('.arena');
    if (!arena) return null;
    return [...arena.querySelectorAll('.seat-style-label')].find((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        event.clientX >= r.left - 10 &&
        event.clientX <= r.right + 10 &&
        event.clientY >= r.top - 6 &&
        event.clientY <= r.bottom + 6
      );
    });
  };
  on(document, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    if (!tooltip.contains(event.target)) close();
    pressed = false;
    const label = labelAt(event);
    if (!label) return;
    event.preventDefault();
    origin = { x: event.clientX, y: event.clientY };
    pendingLabel = label;
    timer = setTimeout(() => show(label), 450);
  });
  on(
    document,
    'pointermove',
    (event) => {
      if (
        (timer || (anchor && event.buttons & 1)) &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10
      )
        close();
    },
    { passive: true },
  );
  on(document, 'pointerup', cancel);
  on(document, 'pointercancel', cancel);
  on(document, 'selectstart', (event) => {
    if (labelAt(event)) event.preventDefault();
  });
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
    else if (['Enter', ' '].includes(event.key) && event.target.matches?.('.seat-style-label')) {
      event.preventDefault();
      show(event.target);
    }
  });
  on(
    document,
    'scroll',
    (event) => {
      const label = anchor || pendingLabel;
      if (label && (event.target === document || event.target?.contains?.(label))) close();
    },
    { capture: true, passive: true },
  );
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
