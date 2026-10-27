// Where the champion's trophy rests once the coronation lands. Rectangles
// ({ left, top, right, bottom }) share one coordinate space: Web measures its
// arena, WeChat passes its layout boxes, so both choose the same spot.
export const TROPHY_ASPECT = 0.82;
export const TROPHY_GAP = 6;
// The hero's trophy is a little shorter than the hole cards it stands above.
export const HERO_TROPHY_SHARE = 0.72;

// A bot's trophy stands beside its profile, as tall as the profile, on the
// side with more free room before the table edge, another player or the
// cards. When neither side has room, the roomier side may overlap cards.
export function seatTrophy(profile, { bounds, obstacles = [] }) {
  const height = profile.bottom - profile.top,
    width = height * TROPHY_ASPECT,
    inBand = (box) => box.bottom > profile.top && box.top < profile.bottom;
  let leftEdge = bounds.left,
    rightEdge = bounds.right;
  for (const box of obstacles) {
    if (!inBand(box)) continue;
    if (box.right <= profile.left) leftEdge = Math.max(leftEdge, box.right);
    else if (box.left >= profile.right) rightEdge = Math.min(rightEdge, box.left);
  }
  const room = { left: profile.left - leftEdge, right: rightEdge - profile.right },
    side = room.right > room.left ? 'right' : 'left';
  return { side, width, height, gap: TROPHY_GAP, fits: room[side] >= width + TROPHY_GAP };
}

// The hero's trophy stands centred above the hole cards. If the board leaves
// too little room, it sinks onto the top of the cards instead of the board.
export function heroTrophy(cards, { above }) {
  const height = (cards.bottom - cards.top) * HERO_TROPHY_SHARE,
    width = height * TROPHY_ASPECT,
    room = cards.top - above;
  return { width, height, gap: TROPHY_GAP, drop: Math.max(0, height + 2 * TROPHY_GAP - room) };
}
