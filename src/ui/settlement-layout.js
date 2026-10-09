// Absolute seat anchors preserve the oval table. Grow its height from the
// actual card/profile/action footprints, including folded cards and long names.
export function createSettlementLayout(arena) {
  const center = arena.querySelector('.table-center');
  let width = 0,
    frame = null;
  function update() {
    arena.style.removeProperty('min-height');
    center.style.removeProperty('margin-bottom');
    width = arena.clientWidth;
    if (!arena.classList.contains('is-done')) return;
    const box = arena.getBoundingClientRect(),
      gap = 12,
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
    let height = box.height;
    for (const a of seats) {
      height = Math.max(height, (a.bottomOffset + bottomPadding) / (1 - a.y));
      for (const b of seats) {
        if (b.y <= a.y || a.right <= b.left || a.left >= b.right) continue;
        height = Math.max(height, (a.bottomOffset - b.topOffset + gap) / (b.y - a.y));
      }
    }
    arena.style.minHeight = `${Math.ceil(height)}px`;
    // The center uses normal flow. Reserve more room beneath it when its wide
    // board would touch a lower seat; keep the hero below the public caption.
    let margin = 0;
    for (let pass = 0; pass < 3; pass++) {
      const board = arena.querySelector('#board').getBoundingClientRect();
      const occupied = [
        ...arena.querySelectorAll(
          '.seat .mini-cards, .seat .seat-profile, .seat .hand-rank, .seat .seat-action',
        ),
      ]
        .filter((el) => !el.hidden)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.left < board.right && r.right > board.left)
        .sort((a, b) => b.top - a.top);
      let top = board.top;
      for (const r of occupied)
        if (top < r.bottom + gap && top + board.height > r.top - gap)
          top = r.top - gap - board.height;
      const shift = board.top - top;
      if (shift < 0.5) break;
      margin += Math.ceil(shift);
      center.style.marginBottom = `${margin}px`;
    }
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
