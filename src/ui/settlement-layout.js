// Select the closest collision-free position to the felt's center. Using each
// public part separately leaves usable space beside a narrow pot or caption.
function nearestClearTop(ideal, min, max, blocked) {
  if (min > max) return null;
  const candidates = [Math.max(min, Math.min(max, ideal)), min, max, ...blocked.flat()];
  return (
    candidates
      .filter((top) => top >= min && top <= max && blocked.every(([a, b]) => top <= a || top >= b))
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal) || a - b)[0] ?? null
  );
}

// Absolute seat anchors preserve the oval table. Grow settlement height from
// player footprints, then center the public group without moving the hero.
export function createSettlementLayout(arena) {
  const center = arena.querySelector('.table-center');
  let width = 0,
    frame = null;
  function update() {
    arena.style.removeProperty('min-height');
    center.style.removeProperty('margin-bottom');
    center.style.removeProperty('top');
    center.style.removeProperty('transform');
    width = arena.clientWidth;
    const settled = arena.classList.contains('is-done'),
      box = arena.getBoundingClientRect(),
      gap = 12,
      // The hero's tilted cards extend beyond their untransformed wrapper.
      heroGap = 24,
      bottomPadding = 20;
    const seats = [...arena.querySelectorAll('.seat')].map((seat) => {
      const y = parseFloat(seat.style.top) / 100;
      // Wrappers measure final layout, unaffected by a card's deal animation.
      const parts = [
        ...seat.querySelectorAll('.mini-cards, .seat-profile, .hand-rank, .seat-action'),
      ]
        .filter((el) => !el.hidden)
        .map((el) => el.getBoundingClientRect());
      return {
        y,
        left: Math.min(...parts.map((r) => r.left)),
        right: Math.max(...parts.map((r) => r.right)),
        topOffset: Math.min(...parts.map((r) => r.top)) - box.top - y * box.height,
        bottomOffset: Math.max(...parts.map((r) => r.bottom)) - box.top - y * box.height,
      };
    });
    if (settled) {
      let height = box.height;
      for (const a of seats) {
        height = Math.max(height, (a.bottomOffset + bottomPadding) / (1 - a.y));
        for (const b of seats) {
          if (b.y <= a.y || a.right <= b.left || a.left >= b.right) continue;
          height = Math.max(height, (a.bottomOffset - b.topOffset + gap) / (b.y - a.y));
        }
      }
      arena.style.minHeight = `${Math.ceil(height)}px`;
    }

    const measure = () => {
      const table = arena.querySelector('.table-inner').getBoundingClientRect(),
        group = center.getBoundingClientRect(),
        hero = arena.querySelector('.hero-area').getBoundingClientRect(),
        parts = [...center.querySelectorAll('.pot, #board, #board-caption')].map((el) =>
          el.getBoundingClientRect(),
        ),
        occupied = [
          ...arena.querySelectorAll(
            '.seat .mini-cards, .seat .seat-profile, .seat .hand-rank, .seat .seat-action',
          ),
        ]
          .filter((el) => !el.hidden)
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0),
        blocked = parts.flatMap((part) =>
          occupied
            .filter((r) => r.left < part.right + gap && r.right > part.left - gap)
            .map((r) => [
              r.top - gap - (part.bottom - group.top),
              r.bottom + gap - (part.top - group.top),
            ]),
        ),
        top = nearestClearTop(
          (table.top + table.bottom - group.height) / 2,
          table.top + gap,
          Math.min(table.bottom - group.height - gap, hero.top - group.height - heroGap),
          blocked,
        );
      return { top, table, group, hero };
    };
    let space = measure();
    if (space.top === null) {
      // Guarantee a free band between two seat anchors rather than giving up
      // after an arbitrary number of incremental height adjustments.
      const anchors = [...new Set([0, ...seats.map((s) => s.y), 1])].sort((a, b) => a - b);
      const band = anchors
        .slice(1)
        .map((end, i) => [anchors[i], end])
        .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
      const y = (band[0] + band[1]) / 2,
        current = arena.getBoundingClientRect(),
        { table, group, hero } = space;
      let height = Math.max(
        current.height,
        (table.top - current.top + gap) / y,
        (current.bottom - table.bottom + group.height + gap) / (1 - y),
        (current.bottom - hero.top + group.height + heroGap) / (1 - y),
      );
      for (const seat of seats)
        height = Math.max(
          height,
          seat.y < y
            ? (seat.bottomOffset + gap) / (y - seat.y)
            : (group.height - seat.topOffset + gap) / (seat.y - y),
        );
      arena.style.minHeight = `${Math.ceil(height + 24)}px`;
      space = measure();
      // The reserved band is safe even at a fractional-pixel boundary.
      space.top ??= arena.getBoundingClientRect().top + y * arena.getBoundingClientRect().height;
    }
    if (settled) center.style.transform = `translateY(${space.top - space.group.top}px)`;
    else center.style.top = `${space.top - arena.getBoundingClientRect().top}px`;
  }
  const observer = new ResizeObserver(() => {
    // Write outside the observer's delivery phase to avoid resize feedback.
    if (arena.clientWidth !== width && frame === null)
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
  });
  observer.observe(arena);
  document.fonts.ready.then(update);
  return { update };
}
