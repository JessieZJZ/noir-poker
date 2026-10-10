// Size from the screen, never from the current action or result text. Portrait
// keeps physical pixels, so result labels cannot shrink every card on the felt.
export function portraitMetrics(width, height, count = 6) {
  // Budget for bright cards, outlines and the profile before the hand starts.
  // Revealing an opponent must not change density or shrink the whole felt.
  const dense = height < 390 || Math.ceil((count - 1) / 2) * 140 > height;
  const seatWidth = width < 330 ? 64 : 76;
  const heroWidth = dense ? (height < 330 ? 48 : 52) : Math.min(76, Math.floor(width * 0.18));
  const heroHeight = Math.ceil(heroWidth * 1.44) + (dense ? 54 : 62);
  const corridor = width - seatWidth * 2 - 32;
  const cardWidth = Math.max(
    38,
    Math.min(
      58,
      Math.floor(width * 0.14),
      Math.floor((corridor - 12) / 3),
      Math.floor((height - heroHeight - 78) / 2.88),
    ),
  );
  return { dense, seatWidth, heroWidth, cardWidth, rails: height < 520 };
}

export function createPlayViewport(surface, { layout = () => {} } = {}) {
  const viewport = surface.querySelector('.table-viewport'),
    arena = surface.querySelector('#arena'),
    mobile = matchMedia('(max-width: 900px)');
  let frame = null;

  function fitOversizedContent() {
    // Accessibility font overrides can exceed the physical portrait budget.
    // Keep the measured collision fallback for that exceptional case only.
    delete arena.dataset.bounded;
    layout();
    const box = arena.getBoundingClientRect(),
      parts = [...arena.querySelectorAll('.seat, .hero-area, .hero-name, .table-center')].map(
        (el) => el.getBoundingClientRect(),
      ),
      left = Math.min(0, ...parts.map((r) => r.left - box.left)),
      right = Math.max(box.width, ...parts.map((r) => r.right - box.left)),
      bottom = Math.max(box.height, ...parts.map((r) => r.bottom - box.top)),
      scale = Math.min(1, viewport.clientWidth / (right - left), viewport.clientHeight / bottom);
    arena.style.transform = `translate(${(viewport.clientWidth - (right - left) * scale) / 2 - left * scale}px, 0px) scale(${scale})`;
  }

  function fitLandscape(seats) {
    // Short landscape screens retain a final fit after placing seats above
    // the board. Portrait never runs this uniform scale path.
    arena.classList.add('compact-landscape');
    seats.forEach((seat, index) => {
      seat.style.left = `${((index + 0.5) / seats.length) * 100}%`;
      seat.style.top = '0%';
    });
    arena.style.setProperty('--arena-height', '260px');
    delete arena.dataset.bounded;
    layout();
    const box = arena.getBoundingClientRect(),
      parts = [...arena.querySelectorAll('.seat, .hero-area, .table-center')].map((el) =>
        el.getBoundingClientRect(),
      ),
      left = Math.min(0, ...parts.map((r) => r.left - box.left)),
      right = Math.max(box.width, ...parts.map((r) => r.right - box.left)),
      bottom = Math.max(box.height, ...parts.map((r) => r.bottom - box.top)),
      scale = Math.min(1, viewport.clientWidth / (right - left), viewport.clientHeight / bottom);
    arena.style.transform = `translate(${(viewport.clientWidth - (right - left) * scale) / 2 - left * scale}px, 0px) scale(${scale})`;
  }

  function fit() {
    arena.style.removeProperty('transform');
    arena.style.removeProperty('min-height');
    arena.classList.remove('compact-landscape', 'dense-table');
    const seats = [...arena.querySelectorAll('.seat')];
    for (const seat of seats) {
      seat.dataset.originalLeft ??= seat.style.left;
      seat.dataset.originalTop ??= seat.style.top;
      seat.style.left = seat.dataset.originalLeft;
      seat.style.top = seat.dataset.originalTop;
      seat.style.removeProperty('margin-left');
    }
    const screen = window.visualViewport,
      screenHeight = screen && screen.scale <= 1.01 ? screen.height : window.innerHeight,
      top = surface.getBoundingClientRect().top + window.scrollY,
      header = surface.querySelector('.surface-top').offsetHeight,
      inset =
        parseFloat(getComputedStyle(surface.querySelector('.action-dock')).paddingBottom) || 0,
      landscape = mobile.matches && viewport.clientWidth > 600 && screenHeight < 600,
      dockBudget = (mobile.matches ? (landscape ? 112 : 116) : 152) + inset,
      // Tall tablets use their blank lower area. Short desktop monitors keep
      // normal document scrolling rather than hiding table content.
      height = mobile.matches
        ? Math.max(landscape ? 80 : 180, screenHeight - top - header - dockBudget - 8)
        : Math.max(
            Number(arena.dataset.playerCount) >= 7 ? 860 : 620,
            screenHeight - top - header - dockBudget - 70,
          );
    surface.style.removeProperty('--play-height');
    viewport.style.setProperty('--table-height', `${height}px`);
    arena.style.width = '100%';
    arena.style.setProperty('--arena-height', `${height}px`);
    arena.dataset.bounded = 'true';
    if (landscape) {
      fitLandscape(seats);
      return;
    }
    if (!mobile.matches) {
      layout();
      return;
    }
    const metrics = portraitMetrics(
      viewport.clientWidth,
      height,
      Number(arena.dataset.playerCount),
    );
    arena.classList.toggle('dense-table', metrics.dense);
    arena.style.setProperty('--seat-width', `${metrics.seatWidth}px`);
    arena.style.setProperty('--public-card-width', `${metrics.cardWidth}px`);
    arena.style.setProperty('--hero-card-width', `${metrics.heroWidth}px`);
    if (seats.some((seat) => seat.offsetHeight > 150)) {
      fitOversizedContent();
      return;
    }
    const corners = new Set([seats[0], seats.at(-1)]);
    const cornerInset = Math.min(24, Math.max(0, (viewport.clientWidth - 280) / 4));
    if (metrics.rails) {
      // Clockwise from the lower-left around the upper seats to the right.
      // Two bounded rails leave a clear corridor, even on a nine-seat SE.
      const split = Math.ceil(seats.length / 2),
        left = seats.slice(0, split).reverse(),
        right = seats.slice(split),
        rowHeight = Math.max(...seats.map((seat) => seat.offsetHeight)),
        span = Math.max(0, height - rowHeight - 5),
        x = metrics.seatWidth / 2 + 4;
      for (const [side, group] of [left, right].entries())
        group.forEach((seat, index) => {
          const corner = index === 0 || index === group.length - 1,
            anchor = x + (corner ? cornerInset : 0);
          if (corner) corners.add(seat);
          seat.style.left = `${side === 0 ? anchor : viewport.clientWidth - anchor}px`;
          seat.style.top = `${group.length > 1 ? (index * span) / (group.length - 1) : span / 2}px`;
        });
    } else {
      // The upper seats already follow the oval. Pull the lower pair in
      // toward the hero while retaining room for both tilted hole cards.
      const upperPair = seats.filter((seat) => parseFloat(seat.dataset.originalTop) === 0);
      if (upperPair.length === 2) {
        const separation =
          ((parseFloat(upperPair[1].dataset.originalLeft) -
            parseFloat(upperPair[0].dataset.originalLeft)) /
            100) *
          viewport.clientWidth;
        const upperInset = Math.min(
          cornerInset,
          Math.max(0, (separation - metrics.seatWidth - 12) / 2),
        );
        upperPair.forEach((seat, index) => {
          corners.add(seat);
          const x = (parseFloat(seat.dataset.originalLeft) / 100) * viewport.clientWidth;
          seat.style.left = `${x + (index === 0 ? upperInset : -upperInset)}px`;
        });
      }
      for (const seat of [seats[0], seats.at(-1)]) {
        const x = (parseFloat(seat.dataset.originalLeft) / 100) * viewport.clientWidth;
        const heroWidth = arena.querySelector('.hero-area').offsetWidth;
        const clearance = Math.max(
          0,
          Math.abs(viewport.clientWidth / 2 - x) - heroWidth / 2 - metrics.seatWidth / 2 - 4,
        );
        const inset = Math.min(cornerInset, clearance);
        seat.style.left = `${x + (x < viewport.clientWidth / 2 ? inset : -inset)}px`;
      }
    }
    layout();
    // Keep the inward pose where the current board and hero leave room.
    // A short native viewport can put a corner beside the public card row.
    const bounds = arena.getBoundingClientRect();
    const blockers = [...arena.querySelectorAll('.pot, #board, #board-caption, .hero-area')]
      .filter((el) => !el.hidden)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height);
    for (const seat of corners) {
      const r = seat.getBoundingClientRect();
      const leftSide = r.left + r.width / 2 < bounds.left + bounds.width / 2;
      const overlapping = blockers.filter(
        (b) => r.top < b.bottom && r.bottom > b.top && r.left < b.right && r.right > b.left,
      );
      const missing = Math.max(
        0,
        ...overlapping.map((b) => (leftSide ? r.right - b.left + 4 : b.right - r.left + 4)),
      );
      const shift = Math.min(missing, leftSide ? r.left - bounds.left : bounds.right - r.right);
      if (shift > 0)
        seat.style.left = `${parseFloat(seat.style.left) + (leftSide ? -shift : shift)}px`;
    }
    layout();
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
  for (const el of [surface, viewport, surface.querySelector('.surface-top')]) observer.observe(el);
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
