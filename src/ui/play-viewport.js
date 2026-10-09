// Keep mobile actions in their own layout space. Only the table scrolls;
// its existing collision layout and readable card sizes remain intact.
export function createPlayViewport(surface) {
  const viewport = surface.querySelector('.table-viewport'),
    mobile = matchMedia('(max-width: 900px)');
  let hand = null,
    table = null,
    settled = true,
    followBottom = true,
    frame = null,
    pointerDown = false,
    userScrollUntil = 0;

  function fit() {
    if (!mobile.matches || settled) return;
    const screen = window.visualViewport,
      top = surface.getBoundingClientRect().top + window.scrollY,
      // Pinch zoom pans the existing page; it must not squeeze its controls
      // into the magnified visual viewport and crop the action buttons.
      screenHeight = screen && screen.scale <= 1.01 ? screen.height : window.innerHeight,
      height = Math.max(0, screenHeight - top - 8);
    const value = `${height}px`;
    if (surface.style.getPropertyValue('--play-height') !== value)
      surface.style.setProperty('--play-height', value);
  }
  function schedule() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      fit();
      if (mobile.matches && !settled && followBottom)
        viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    });
  }
  viewport.addEventListener('scroll', () => {
    // Resizing the viewport also emits scroll events as its range is clamped.
    // Only a user's table gesture can turn off following the hero.
    if (mobile.matches && !settled && (pointerDown || performance.now() < userScrollUntil)) {
      userScrollUntil = performance.now() + 180;
      followBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 24;
    }
  });
  viewport.addEventListener('pointerdown', () => {
    pointerDown = true;
  });
  const endGesture = () => {
    if (pointerDown) userScrollUntil = performance.now() + 180;
    pointerDown = false;
  };
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', endGesture);
  viewport.addEventListener(
    'wheel',
    () => {
      userScrollUntil = performance.now() + 180;
    },
    { passive: true },
  );
  viewport.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
      userScrollUntil = performance.now() + 180;
  });
  const observer = new ResizeObserver(schedule);
  for (const el of [surface, viewport, surface.querySelector('#arena'), document.body])
    observer.observe(el);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  document.fonts.ready.then(schedule);
  return {
    update(nextTable, done) {
      if (nextTable !== table || nextTable.hand !== hand || (settled && !done)) {
        followBottom = true;
        userScrollUntil = 0;
        pointerDown = false;
      }
      table = nextTable;
      hand = nextTable.hand;
      settled = done;
      surface.classList.toggle('has-live-hand', !done);
      fit();
      schedule();
    },
  };
}
