// Keep the whole mobile table in the first screen. Measurements are made at
// scale 1 before fitting, so collision coordinates never mix CSS/visual pixels.
export function createPlayViewport(surface, { layout = () => {} } = {}) {
  const viewport = surface.querySelector('.table-viewport'),
    arena = surface.querySelector('#arena'),
    mobile = matchMedia('(max-width: 900px)');
  let frame = null;

  function fit() {
    arena.style.removeProperty('transform');
    arena.style.removeProperty('width');
    arena.style.removeProperty('--arena-height');
    arena.classList.remove('compact-landscape');
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
      baseHeight = Math.max(
        availableHeight,
        landscape ? 220 : Number(arena.dataset.playerCount) >= 7 ? 450 : 360,
      );
    arena.style.setProperty('--arena-height', `${baseHeight}px`);
    layout();

    const box = arena.getBoundingClientRect(),
      parts = [
        ...arena.querySelectorAll(
          '.seat-profile, .mini-cards, .seat-action, .hand-rank, .hero-area, .table-center',
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
