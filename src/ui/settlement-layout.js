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

// Keep the complete seat inside the arena while allowing the corridor's
// half-pixel clearance to survive the final fit transform. Reserving a full
// pixel at the arena edge can clamp a seat at exactly 12px from the pot;
// rounded visual rectangles then lose that clearance by a few millionths.
export function minimalSeatShift(leftSide, footprint, corridor, bounds) {
  const edgeInset = 0.5;
  return leftSide
    ? -Math.min(
        Math.max(0, footprint.right - corridor.left),
        Math.max(0, footprint.left - bounds.left - edgeInset),
      )
    : Math.min(
        Math.max(0, corridor.right - footprint.left),
        Math.max(0, bounds.right - footprint.right - edgeInset),
      );
}

// Absolute seat anchors preserve the oval table. Grow settlement height from
// player footprints, then center the public group without moving the hero.
export function createSettlementLayout(arena, { observe = true } = {}) {
  const center = arena.querySelector('.table-center');
  const viewport = arena.closest('.table-viewport');
  let width = 0,
    viewportHeight = 0,
    frame = null;
  function update() {
    arena.style.removeProperty('min-height');
    center.style.removeProperty('margin-bottom');
    center.style.removeProperty('top');
    center.style.removeProperty('transform');
    width = arena.clientWidth;
    viewportHeight = viewport?.clientHeight ?? 0;
    const settled = arena.classList.contains('is-done'),
      bounded = arena.dataset.bounded === 'true',
      compact = matchMedia('(max-width: 900px)').matches,
      box = arena.getBoundingClientRect(),
      gap = 12,
      // The hero's tilted cards extend beyond their untransformed wrapper.
      heroGap = 24,
      bottomPadding = 20;
    // Open the public row's actual horizontal corridor before reserving a
    // vertical band. Move side seats only by the missing clearance, bounded
    // by their full footprint; a fixed shift can leave a small collision and
    // unnecessarily grow/shrink the whole mobile table.
    const spread =
      Number(arena.dataset.playerCount) >= 7 &&
      compact &&
      !arena.classList.contains('compact-landscape');
    for (const seat of arena.querySelectorAll('.seat')) seat.style.removeProperty('margin-left');
    if (spread) {
      const publicParts = [...center.querySelectorAll('.pot, #board, #board-caption')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      // CSS layout rounds offsets to fractional pixels. Leave half a pixel
      // beyond exact clearance so the final fit transform keeps it clear.
      const clearLeft = Math.min(...publicParts.map((r) => r.left)) - gap - 0.5,
        clearRight = Math.max(...publicParts.map((r) => r.right)) + gap + 0.5;
      for (const seat of arena.querySelectorAll('.seat-left, .seat-right')) {
        const parts = [
          ...seat.querySelectorAll('.mini-cards, .seat-profile, .seat-action, .hand-rank'),
        ]
          .filter((el) => !el.hidden)
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);
        const left = Math.min(...parts.map((r) => r.left)),
          right = Math.max(...parts.map((r) => r.right));
        const shift = minimalSeatShift(
          seat.classList.contains('seat-left'),
          { left, right },
          { left: clearLeft, right: clearRight },
          box,
        );
        seat.style.marginLeft = `${shift}px`;
      }
    }
    const seats = [...arena.querySelectorAll('.seat')].map((seat) => {
      const y = parseFloat(seat.style.top) / 100;
      // Wrappers measure final layout, unaffected by a card's deal animation.
      const parts = [
        ...seat.querySelectorAll('.mini-cards, .seat-profile, .hand-rank, .seat-action'),
      ]
        .filter((el) => !el.hidden)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      return {
        y,
        left: Math.min(...parts.map((r) => r.left)),
        right: Math.max(...parts.map((r) => r.right)),
        topOffset: Math.min(...parts.map((r) => r.top)) - box.top - y * box.height,
        bottomOffset: Math.max(...parts.map((r) => r.bottom)) - box.top - y * box.height,
      };
    });
    if (settled && !bounded) {
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
        heroTop = Math.min(
          hero.top,
          ...[...arena.querySelectorAll('#hero-cards .playing-card')]
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0)
            .map((r) => r.top),
        ),
        parts = [...center.querySelectorAll('.pot, #board, #board-caption')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0),
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
        min = table.top + gap,
        heroBlocks = parts.some(
          (part) => part.left < hero.right + gap && part.right > hero.left - gap,
        ),
        max = Math.min(
          table.bottom - group.height - gap,
          heroBlocks ? heroTop - group.height - heroGap : Infinity,
        ),
        ideal = (table.top + table.bottom - group.height) / 2,
        top = nearestClearTop(ideal, min, max, blocked);
      return { top, table, group, heroTop };
    };
    let space = measure();
    if (space.top === null && bounded) {
      space.top = Math.max(
        arena.getBoundingClientRect().top + 3,
        Math.min(
          (space.table.top + space.table.bottom - space.group.height) / 2,
          space.heroTop - space.group.height - heroGap,
        ),
      );
    }
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
        { table, group, heroTop } = space;
      let height = Math.max(
        current.height,
        (table.top - current.top + gap) / y,
        (current.bottom - table.bottom + group.height + gap) / (1 - y),
        (current.bottom - heroTop + group.height + heroGap) / (1 - y),
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
    if (settled && !compact && !bounded)
      center.style.transform = `translateY(${space.top - space.group.top}px)`;
    else center.style.top = `${space.top - arena.getBoundingClientRect().top}px`;
  }
  if (!observe) return { update };
  const observer = new ResizeObserver(() => {
    // Write outside the observer's delivery phase to avoid resize feedback.
    if (
      (arena.clientWidth !== width || (viewport?.clientHeight ?? 0) !== viewportHeight) &&
      frame === null
    )
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
  });
  observer.observe(arena);
  if (viewport) observer.observe(viewport);
  document.fonts.ready.then(update);
  return { update };
}
