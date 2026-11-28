export function chainProfileTouchScroll(detail, settings, isOpen) {
  let previous = null;
  const track = ({ touches }) => {
    previous = touches.length === 1 ? touches[0] : null;
  };
  detail.addEventListener('touchstart', track, { passive: true });
  detail.addEventListener('touchend', track, { passive: true });
  detail.addEventListener('touchcancel', () => (previous = null), { passive: true });
  detail.addEventListener(
    'touchmove',
    (event) => {
      const prior = previous;
      track(event);
      if (!isOpen() || !prior || !previous || prior.identifier !== previous.identifier) return;
      const delta = prior.clientY - previous.clientY;
      if (Math.abs(delta) <= Math.abs(prior.clientX - previous.clientX)) return;
      const end = detail.scrollHeight - detail.clientHeight;
      if (delta > 0 ? detail.scrollTop < end - 1 : detail.scrollTop > 1) return;

      // WKWebView keeps vertical touch gestures latched to the detail at its
      // limits. Hand off movement there and keep native scrolling inside it.
      if (event.cancelable) event.preventDefault();
      settings.scrollTop += delta;
    },
    { passive: false },
  );
}
