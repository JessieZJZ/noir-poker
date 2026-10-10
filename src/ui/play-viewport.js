import { COMPACT_PLAY_QUERY, preferSinglePublicRow, smallestClearHeight } from './play-geometry.js';
// Keep the whole mobile table in the first screen. Measurements are made at
// scale 1 before fitting, so collision coordinates never mix CSS/visual pixels.
export function createPlayViewport(surface, { layout = () => {} } = {}) {
  const viewport = surface.querySelector('.table-viewport'),
    arena = surface.querySelector('#arena'),
    mobile = matchMedia(COMPACT_PLAY_QUERY);
  let frame = null;

  function fit() {
    arena.style.removeProperty('transform');
    arena.style.removeProperty('width');
    arena.style.removeProperty('--arena-height');
    arena.classList.remove('compact-landscape');
    arena.classList.remove('public-two-rows');
    const seats = [...arena.querySelectorAll('.seat')];
    for (const seat of seats) {
      seat.dataset.originalLeft ??= seat.style.left;
      seat.dataset.originalTop ??= seat.style.top;
      seat.style.left = seat.dataset.originalLeft;
      seat.style.top = seat.dataset.originalTop;
    }
    if (!mobile.matches) {
      surface.style.removeProperty('--play-height');
      layout();
      return;
    }
    const screen = window.visualViewport,
      // Pinch zoom magnifies/pans the page without shrinking its layout.
      screenHeight = screen && screen.scale <= 1.01 ? screen.height : window.innerHeight,
      top = surface.getBoundingClientRect().top + window.scrollY,
      height = Math.max(160, screenHeight - top - 8);
    surface.style.setProperty('--play-height', `${height}px`);
    // Hidden or rotating WebViews can briefly report a zero-sized viewport.
    // Wait for its resize notification instead of dividing by zero below.
    if (viewport.clientWidth === 0 || viewport.clientHeight === 0) return;
    arena.style.width = `${viewport.clientWidth}px`;
    const landscape = viewport.clientWidth > 600 && screenHeight < 600;
    arena.classList.toggle('compact-landscape', landscape);
    if (landscape) {
      seats.forEach((seat, index) => {
        seat.style.left = `${((index + 0.5) / seats.length) * 100}%`;
        seat.style.top = '0%';
      });
    }
    const availableHeight = viewport.clientHeight,
      // A two-row board and the hero need the same vertical budget at every
      // player count. A shorter six-seat base can make the corridor solver
      // grow an unnecessary seat band, shrinking the whole table on SE.
      baseHeight = Math.max(availableHeight, landscape ? 220 : 450);
    // Fit height without narrowing the felt. A short phone uses a wider
    // logical arena so its scaled table still spans the available viewport.
    const sizeArena = (height) => {
      arena.style.width = `${viewport.clientWidth * Math.max(1, height / availableHeight)}px`;
      arena.style.setProperty('--arena-height', `${height}px`);
      layout();
      return arena.getBoundingClientRect().height;
    };
    const fittingHeight = () => {
      const required = sizeArena(baseHeight);
      if (required <= baseHeight + 0.5) return baseHeight;
      // Widening removes some horizontal collisions. Find the smallest
      // proportional arena instead of keeping the narrow first pass's bound.
      return smallestClearHeight(
        baseHeight,
        required,
        (candidate) => sizeArena(candidate) <= candidate + 0.5,
      );
    };
    let fittedHeight = fittingHeight();
    if (!landscape && viewport.clientWidth <= 600 && fittedHeight > baseHeight + 0.5) {
      arena.classList.add('public-two-rows');
      const twoRowsHeight = fittingHeight();
      if (preferSinglePublicRow(fittedHeight, twoRowsHeight))
        arena.classList.remove('public-two-rows');
      else fittedHeight = twoRowsHeight;
    }
    sizeArena(fittedHeight);

    const box = arena.getBoundingClientRect(),
      parts = [
        ...arena.querySelectorAll(
          '.seat-profile, .mini-cards, .seat-action, .hand-rank, .hero-area, .hero-name, .table-center',
        ),
      ]
        .filter((el) => !el.hidden)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0),
      left = Math.min(0, ...parts.map((r) => r.left - box.left)),
      right = Math.max(box.width, ...parts.map((r) => r.right - box.left)),
      topEdge = Math.min(0, ...parts.map((r) => r.top - box.top)),
      bottom = Math.max(box.height, ...parts.map((r) => r.bottom - box.top)),
      scale = Math.min(
        1,
        viewport.clientWidth / (right - left),
        availableHeight / (bottom - topEdge),
      ),
      x = (viewport.clientWidth - (right - left) * scale) / 2 - left * scale,
      y = (availableHeight - (bottom - topEdge) * scale) / 2 - topEdge * scale;
    arena.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    viewport.scrollTop = 0;
  }
  function schedule() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      fit();
    });
  }
  const observer = new ResizeObserver(schedule);
  for (const el of [
    surface,
    viewport,
    surface.querySelector('.surface-top'),
    surface.querySelector('.action-dock'),
  ])
    observer.observe(el);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  document.fonts.ready.then(schedule);
  return {
    update(nextTable, done) {
      surface.classList.toggle('has-live-hand', !done);
      fit();
      schedule();
    },
  };
}
