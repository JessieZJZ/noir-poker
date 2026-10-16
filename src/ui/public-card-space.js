// Grow cards into unused felt space after fitting the players. The arena and
// every player stay fixed, so larger cards cannot shrink text or move controls.
export function growPublicCards(
  layout,
  { cardWidth, createRow, gap = 12.5, maximumWidth = Infinity },
) {
  const parts = (box) =>
    (box.parts ?? [{ left: 0, top: 0, width: box.width, height: box.height }]).map((part) => ({
      ...part,
      left: box.left + part.left,
      top: box.top + part.top,
    }));
  const players = [...layout.positioned, layout.hero].flatMap(parts);
  const originalPot = parts(layout.public)[0];
  const cx = layout.table.left + layout.table.width / 2;
  const cy = layout.table.top + layout.table.height / 2;
  const place = (width) => {
    const row = createRow(width, layout.twoRows);
    return { ...row, left: cx - row.width / 2, top: cy - row.centerY };
  };
  const safe = (box) => {
    if (
      box.left < layout.table.left + gap ||
      box.left + box.width > layout.table.left + layout.table.width - gap ||
      box.top < layout.table.top + gap ||
      box.height + gap * 2 >= layout.table.height ||
      box.top + box.height + 32 > layout.hero.top
    )
      return false;
    const painted = parts(box);
    // The pot moves upward as cards grow. Reserve its swept region, so a
    // binary search cannot jump through a player's caption to a false gap.
    painted[0].height = Math.max(
      painted[0].height,
      originalPot.top + originalPot.height - painted[0].top,
    );
    return painted.every((a) =>
      players.every(
        (b) =>
          a.left + a.width + gap <= b.left ||
          b.left + b.width + gap <= a.left ||
          a.top + a.height + gap <= b.top ||
          b.top + b.height + gap <= a.top,
      ),
    );
  };
  let low = cardWidth;
  let high = Math.max(low, Math.floor(Math.min(layout.table.width, maximumWidth)));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (safe(place(middle))) low = middle;
    else high = middle - 1;
  }
  return { cardWidth: low, layout: { ...layout, public: place(low) } };
}
