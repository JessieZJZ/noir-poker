// Keep the bottom card/identity slots fixed while artwork grows upward into
// the felt. Test the rotated faces, rather than their smaller unrotated boxes.
export function growHeroCards(
  layout,
  { width, height, gap = 8, maxGrowth = 1.4, minimumWidth = width, maximumWidth = Infinity },
) {
  const angle = 4;
  const radians = (angle * Math.PI) / 180;
  const cx = layout.hero.left + layout.hero.width / 2;
  const bottom = layout.hero.top + height - 1;
  const players = layout.positioned.flatMap((box) =>
    (box.parts ?? [{ left: 0, top: 0, width: box.width, height: box.height }]).map((part) => ({
      ...part,
      left: box.left + part.left,
      top: box.top + part.top,
    })),
  );
  const measure = (candidate) => {
    const cardHeight = Math.round((height * candidate) / width);
    const rotatedWidth = candidate * Math.cos(radians) + cardHeight * Math.sin(radians);
    const rotatedHeight = cardHeight * Math.cos(radians) + candidate * Math.sin(radians);
    const cardGap = Math.max(7, Math.ceil(rotatedWidth - candidate) + 2);
    const faces = [-1, 1].map((side) => ({
      left: cx + (side * (candidate + cardGap)) / 2 - rotatedWidth / 2,
      top: bottom - rotatedHeight,
      width: rotatedWidth,
      height: rotatedHeight,
    }));
    return {
      width: candidate,
      height: cardHeight,
      gap: cardGap,
      shift: cardHeight - height + (rotatedHeight - cardHeight) / 2 + 1,
      angle,
      faces,
    };
  };
  const safe = ({ faces }) =>
    faces.every(
      (face) =>
        face.left >= gap &&
        face.left + face.width <= layout.arenaWidth - gap &&
        face.top >= layout.public.top + layout.public.height + 32 &&
        players.every(
          (part) =>
            face.left + face.width + gap <= part.left ||
            part.left + part.width + gap <= face.left ||
            face.top + face.height + gap <= part.top ||
            part.top + part.height + gap <= face.top,
        ),
    );
  // A crowded rail can require smaller artwork. The original slot and card
  // bottom remain fixed, so shrinking never moves identity or action controls.
  let high = Math.max(1, Math.floor(Math.min(width * maxGrowth, maximumWidth)));
  let low = Math.max(1, Math.min(high, Math.floor(minimumWidth)));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (safe(measure(middle))) low = middle;
    else high = middle - 1;
  }
  return measure(low);
}
