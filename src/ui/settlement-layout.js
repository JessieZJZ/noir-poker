import { COMPACT_PLAY_QUERY, publicGroupTop, smallestClearHeight } from './play-geometry.js';
// Select the closest collision-free position to the upper felt center. Using each
// public part separately leaves usable space beside a narrow pot or caption.
export function nearestClearTop(ideal, min, max, blocked) {
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
      compact = matchMedia(COMPACT_PLAY_QUERY).matches,
      box = arena.getBoundingClientRect(),
      gap = 12,
      // The hero's tilted cards extend beyond their untransformed wrapper.
      heroGap = 24,
      bottomPadding = 20;
    const playerParts = (seat) => {
      const parts = [
        ...seat.querySelectorAll('.mini-cards, .seat-profile, .seat-action, .seat-rank-slot'),
      ]
        .filter((el) => !el.hidden)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      return parts;
    };
    // Open the public row's actual horizontal corridor before reserving a
    // vertical band. Move side seats only by the missing clearance, bounded
    // by their full footprint; a fixed shift can leave a small collision and
    // unnecessarily grow/shrink the whole mobile table.
    const spread = compact && !arena.classList.contains('compact-landscape');
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
        // Upper seats belong around the oval's crown, away from the public
        // group. Moving them to the outside edges makes a short-handed table
        // look empty even though the middle corridor does not need their room.
        if (parseFloat(seat.style.top) === 0) continue;
        const parts = playerParts(seat);
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
      // Two upper seats can share an anchor row. Height cannot separate
      // them; use the open horizontal space symmetrically instead.
      const rowSeats = [...arena.querySelectorAll('.seat')];
      for (const [index, a] of rowSeats.entries())
        for (const b of rowSeats.slice(index + 1)) {
          if (a.style.top !== b.style.top) continue;
          const ar = a.getBoundingClientRect(),
            br = b.getBoundingClientRect();
          const [left, right, lr, rr] = ar.left < br.left ? [a, b, ar, br] : [b, a, br, ar];
          const shift = Math.max(0, (lr.right + gap - rr.left) / 2);
          left.style.marginLeft = `${(parseFloat(left.style.marginLeft) || 0) - shift}px`;
          right.style.marginLeft = `${(parseFloat(right.style.marginLeft) || 0) + shift}px`;
        }
    }
    const seats = [...arena.querySelectorAll('.seat')].map((seat) => {
      const y = parseFloat(seat.style.top) / 100;
      // Wrappers measure final layout, unaffected by a card's deal animation.
      const parts = playerParts(seat);
      return {
        y,
        left: Math.min(...parts.map((r) => r.left)),
        right: Math.max(...parts.map((r) => r.right)),
        topOffset: Math.min(...parts.map((r) => r.top)) - box.top - y * box.height,
        bottomOffset: Math.max(...parts.map((r) => r.bottom)) - box.top - y * box.height,
      };
    });
    if (settled || compact) {
      let height = box.height;
      const hero = arena.querySelector('.hero-area').getBoundingClientRect();
      for (const a of seats) {
        if (compact && a.left < hero.right + 8 && a.right > hero.left - 8)
          height = Math.max(height, (a.bottomOffset + box.bottom - hero.top + 8 + gap) / (1 - a.y));
        if (settled || compact) {
          height = Math.max(height, (a.bottomOffset + (compact ? 0 : bottomPadding)) / (1 - a.y));
          for (const b of seats) {
            if (b.y <= a.y || a.right <= b.left || a.left >= b.right) continue;
            height = Math.max(height, (a.bottomOffset - b.topOffset + gap) / (b.y - a.y));
          }
        }
      }
      arena.style.minHeight = `${Math.ceil(height)}px`;
    }

    const measure = () => {
      const table = arena.querySelector('.table-inner').getBoundingClientRect(),
        group = center.getBoundingClientRect(),
        hero = arena.querySelector('.hero-area').getBoundingClientRect(),
        // Reserve the fixed card tilt instead of sampling deal/highlight
        // animations, which otherwise move the public group frame by frame.
        heroTop = compact
          ? hero.top - 8
          : Math.min(
              hero.top,
              ...[...arena.querySelectorAll('#hero-cards .playing-card')]
                .map((el) => el.getBoundingClientRect())
                .filter((r) => r.width > 0 && r.height > 0)
                .map((r) => r.top),
            ),
        parts = [...center.querySelectorAll('.pot, #board, #board-caption')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0),
        occupied = [...arena.querySelectorAll('.seat')].flatMap(playerParts),
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
        ideal = publicGroupTop(table.top, table.height, group.height),
        top = nearestClearTop(ideal, min, max, blocked);
      return { top, table, group, heroTop };
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
      const ceiling = Math.ceil(height + 24);
      // The guaranteed band is an upper bound, not the height to display.
      // In a short six-seat phone layout it can be nearly twice the height
      // actually needed and force the entire felt into a narrow strip.
      const required = compact
        ? smallestClearHeight(current.height, ceiling, (candidate) => {
            arena.style.minHeight = `${candidate}px`;
            return measure().top !== null;
          })
        : ceiling;
      arena.style.minHeight = `${required}px`;
      space = measure();
      // The reserved band is safe even at a fractional-pixel boundary.
      space.top ??= arena.getBoundingClientRect().top + y * arena.getBoundingClientRect().height;
    }
    if (settled && !compact)
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
