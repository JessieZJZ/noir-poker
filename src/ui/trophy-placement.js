// Where the champion's trophy rests once the coronation lands. Rectangles
// ({ left, top, right, bottom }) share one coordinate space: Web measures its
// arena, WeChat passes its layout boxes, so both choose the same spot.
export const TROPHY_ASPECT = 0.82;
export const TROPHY_GAP = 6;
// The hero's trophy is a little shorter than the hole cards it stands above,
// and shrinks to the room below the board, down to half the cards' height.
export const HERO_TROPHY_SHARE = 0.72;
export const HERO_TROPHY_MIN_SHARE = 0.5;

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

// The hero's trophy stands centred above the hole cards, shrinking to fit
// the room below the board. Only beyond its smallest size does it sink onto
// the top of the cards instead of covering the board.
export function heroTrophy(cards, { above }) {
  const cardsHeight = cards.bottom - cards.top,
    room = cards.top - above,
    height = Math.min(
      cardsHeight * HERO_TROPHY_SHARE,
      Math.max(cardsHeight * HERO_TROPHY_MIN_SHARE, room - 2 * TROPHY_GAP),
    ),
    width = height * TROPHY_ASPECT;
  return { width, height, gap: TROPHY_GAP, drop: Math.max(0, height + 2 * TROPHY_GAP - room) };
}

// A hero who ends the game without the title sees their final place where a
// champion's trophy would stand. Sizes are on-screen, then converted to arena
// units, so a scaled-down table keeps a readable tag; `room` is on-screen too.
// Past that room it sinks onto the (dimmed) cards rather than over the board.
export const HERO_PLACE_HEIGHT = 30;
export function heroPlaceStyle({ room, scale = 1 }) {
  const drop = Math.max(0, HERO_PLACE_HEIGHT + 2 * TROPHY_GAP - room),
    px = (value) => `${value / scale}px`;
  return [
    `height:${px(HERO_PLACE_HEIGHT)}`,
    `line-height:${px(HERO_PLACE_HEIGHT - 2)}`,
    `font-size:${px(16)}`,
    `padding:0 ${px(14)}`,
    `border-width:${px(1)}`,
    `border-radius:${px(8)}`,
    `bottom:calc(100% + ${px(TROPHY_GAP - drop)})`,
  ].join(';');
}
