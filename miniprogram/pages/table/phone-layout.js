// Logical phone component sizes mirror src/styles/play-viewport.css. Fit the
// complete seat footprints and public cards before scaling the entire arena.
function phoneLayout({ width, height, seats }) {
  const availableWidth = Math.max(1, width - 26);
  const availableHeight = Math.max(1, height);
  const cardWidth = width <= 360 ? 50 : Math.max(44, Math.min(54, width * 0.12));
  const heroWidth = width <= 360 ? 72 : Math.max(61, Math.min(72, width * 0.12));
  const heroHeight = width <= 360 ? 104 : Math.max(88, Math.min(104, width * 0.174));
  const heroFoot = heroHeight + 66;
  const seatWidth = 92,
    seatHeight = 157,
    gap = 12;
  const findTop = (ideal, min, max, blocked) => {
    if (min > max) return null;
    return (
      [Math.max(min, Math.min(max, ideal)), min, max, ...blocked.flat()]
        .filter(
          (top) => top >= min && top <= max && blocked.every(([a, b]) => top <= a || top >= b),
        )
        .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal) || a - b)[0] ?? null
    );
  };
  const measure = (arenaHeight, twoRows) => {
    const arenaWidth = availableWidth * Math.max(1, arenaHeight / availableHeight);
    const boardWidth = (twoRows ? 3 : 5) * cardWidth + (twoRows ? 8 : 16);
    const publicHeight = 38 + (twoRows ? 2 : 1) * cardWidth * 1.44 + (twoRows ? 10 : 0);
    const publicLeft = (arenaWidth - boardWidth) / 2;
    const positioned = seats.map((seat) => {
      let left = (arenaWidth * seat.x) / 100 - seatWidth / 2;
      if (seat.y && seat.x < 25)
        left -= Math.min(
          Math.max(0, left + seatWidth - publicLeft + gap + 0.5),
          Math.max(0, left - 0.5),
        );
      if (seat.y && seat.x > 75)
        left += Math.min(
          Math.max(0, publicLeft + boardWidth + gap + 0.5 - left),
          Math.max(0, arenaWidth - left - seatWidth - 0.5),
        );
      return {
        ...seat,
        left,
        top: (arenaHeight * seat.y) / 100 + (seat.x === 50 && seat.y === 0 ? 12 : 0),
      };
    });
    for (let i = 0; i < positioned.length; i++)
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i],
          b = positioned[j];
        if (a.y !== b.y) continue;
        const [l, r] = a.left < b.left ? [a, b] : [b, a];
        const shift = Math.max(0, (l.left + seatWidth + gap - r.left) / 2);
        l.left -= shift;
        r.left += shift;
      }
    const heroTop = arenaHeight - 24 - heroFoot;
    const heroLeft = (arenaWidth - (2 * heroWidth + 7)) / 2;
    const parts = positioned.flatMap((seat) =>
      [
        [68, 0, 39],
        [92, 43, 60],
        [88, 107, 30],
        [88, 137, 20],
      ].map(([w, y, h]) => ({
        seat,
        left: seat.left + (92 - w) / 2,
        right: seat.left + (92 + w) / 2,
        top: seat.top + y,
        bottom: seat.top + y + h,
      })),
    );
    const ordered = positioned.every((a) =>
      positioned.every(
        (b) =>
          b.top <= a.top ||
          a.left + seatWidth <= b.left ||
          a.left >= b.left + seatWidth ||
          a.top + seatHeight + gap <= b.top,
      ),
    );
    const clear =
      ordered &&
      positioned.every(
        (seat) =>
          seat.top + seatHeight <= arenaHeight &&
          (!(seat.left < arenaWidth - heroLeft + 8 && seat.left + seatWidth > heroLeft - 8) ||
            seat.top + seatHeight + gap + 8 <= heroTop),
      );
    const blocked = parts
      .filter((part) => part.left < publicLeft + boardWidth + gap && part.right > publicLeft - gap)
      .map((part) => [part.top - gap - publicHeight, part.bottom + gap]);
    const crowned = seats.length === 5 || seats.length === 7;
    const tableTop = crowned ? 73 : 40;
    const ideal = tableTop + (arenaHeight - tableTop - 44) * 0.44 - publicHeight / 2;
    const publicTop = findTop(ideal, 52, heroTop - 8 - publicHeight - 24, blocked);
    return {
      arenaHeight,
      arenaWidth,
      boardWidth,
      boardTwoRows: twoRows,
      publicTop,
      positioned,
      clear,
      publicHeight,
    };
  };
  const fit = (twoRows) => {
    let low = Math.max(450, Math.ceil(availableHeight)),
      high = Math.max(low, 2400);
    while (low < high) {
      const mid = Math.floor((low + high) / 2),
        layout = measure(mid, twoRows);
      if (layout.clear && layout.publicTop !== null) high = mid;
      else low = mid + 1;
    }
    return measure(low, twoRows);
  };
  const single = fit(false),
    double = fit(true);
  const fitted =
    double.arenaHeight / single.arenaHeight >= (seats.length === 4 ? 0.84 : 0.92) ? single : double;
  return {
    ...fitted,
    arenaScale: Math.min(1, height / fitted.arenaHeight),
    cardWidth,
    cardHeight: cardWidth * 1.44,
    heroWidth,
    heroHeight,
  };
}
module.exports = { phoneLayout };
