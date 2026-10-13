// Presentation geometry shared by DOM/WebView and WXML. No game state is read.
// Every complete player footprint is centered on the oval's rail; the public
// cards stay at the oval center, even when a crowded table needs two rows.
export function railLayout({
  width,
  height,
  seats,
  hero,
  publicRows,
  proportional = true,
  gap = 12.5,
  angles,
  alternatives,
}) {
  if (alternatives) {
    return [angles, ...alternatives]
      .map((candidate) =>
        railLayout({
          width,
          height,
          seats,
          hero,
          publicRows,
          proportional,
          gap,
          angles: candidate,
        }),
      )
      .filter(Boolean)
      .sort((a, b) => a.arenaHeight - b.arenaHeight)[0];
  }
  const overlaps = (a, b) =>
    a.left < b.left + b.width + gap &&
    a.left + a.width + gap > b.left &&
    a.top < b.top + b.height + gap &&
    a.top + a.height + gap > b.top;
  const parts = (box) =>
    (box.parts || [{ left: 0, top: 0, width: box.width, height: box.height }]).map((part) => ({
      ...part,
      left: box.left + part.left,
      top: box.top + part.top,
    }));
  const collides = (a, b) => parts(a).some((pa) => parts(b).some((pb) => overlaps(pa, pb)));
  const seatWidth = Math.max(...seats.map((s) => s.width));
  const seatHeight = Math.max(...seats.map((s) => s.height));
  const measure = (arenaHeight, row) => {
    const arenaWidth = proportional ? width * Math.max(1, arenaHeight / height) : width;
    const insetX = seatWidth / 2 + 4;
    const insetBottom = Math.max(hero.height, seatHeight) / 2 + 4;
    // The top players rarely sit exactly at -90 degrees. Remove the empty
    // strip their angles would otherwise leave above the reserved hole cards.
    const topSine = Math.min(
      ...seats.map((_, i) =>
        Math.sin(
          angles
            ? (angles[i] * Math.PI) / 180
            : Math.PI / 2 + ((i + 1) * 2 * Math.PI) / (seats.length + 1),
        ),
      ),
    );
    const topFactor = (1 + topSine) / 2;
    const insetTop = Math.max(
      8,
      (seatHeight / 2 + 8 - topFactor * (arenaHeight - insetBottom)) / (1 - topFactor),
    );
    const table = {
      left: insetX,
      top: insetTop,
      width: arenaWidth - insetX * 2,
      height: arenaHeight - insetTop - insetBottom,
    };
    const cx = arenaWidth / 2,
      cy = table.top + table.height / 2;
    const positioned = seats.map((seat, i) => {
      const angle = angles
        ? (angles[i] * Math.PI) / 180
        : Math.PI / 2 + ((i + 1) * 2 * Math.PI) / (seats.length + 1);
      return {
        ...seat,
        left: cx + (table.width / 2) * Math.cos(angle) - seat.width / 2,
        top: cy + (table.height / 2) * Math.sin(angle) - seat.height / 2,
      };
    });
    const heroBox = {
      ...hero,
      left: cx - hero.width / 2,
      top: table.top + table.height - hero.height / 2,
    };
    const publicBox = {
      ...row,
      left: cx - row.width / 2,
      top: cy - (row.centerY ?? row.height / 2),
    };
    const players = [...positioned, heroBox];
    const clear =
      table.width > 0 &&
      table.height > row.height + gap * 2 &&
      publicBox.left >= table.left + gap &&
      publicBox.left + row.width <= table.left + table.width - gap &&
      players.every(
        (a, i) =>
          !collides(a, publicBox) &&
          (a !== heroBox || a.top >= publicBox.top + publicBox.height + 32) &&
          players.slice(i + 1).every((b) => !collides(a, b)),
      );
    return {
      arenaWidth,
      arenaHeight,
      table,
      positioned,
      hero: heroBox,
      public: publicBox,
      twoRows: row.twoRows,
      clear,
    };
  };
  const base = Math.max(height, 450);
  const fit = (row) => {
    let low = Math.ceil(base),
      high = low;
    while (!measure(high, row).clear && high < 12000) high *= 1.25;
    high = Math.ceil(high);
    if (!measure(high, row).clear) return null;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (measure(mid, row).clear) high = mid;
      else low = mid + 1;
    }
    return measure(low, row);
  };
  const single = fit(publicRows[0]);
  if (single && single.arenaHeight === Math.ceil(base)) return single;
  const double = publicRows[1] && fit(publicRows[1]);
  // Prefer a single row unless it materially shrinks the whole player/table UI.
  return single && (!double || double.arenaHeight / single.arenaHeight >= 0.92)
    ? single
    : double || single;
}
