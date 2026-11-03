// The waiting message keeps its natural on-screen size while the players
// beside it leave a 32px margin on each side. A shorter table that brings them
// closer shrinks it, never below 70% so the title and button stay readable.
// Returns the scale in arena units (the arena itself is drawn at arenaScale).
export const ENTRY_WELCOME_MARGIN = 32;
export const ENTRY_WELCOME_MINIMUM = 0.7;

export function entryWelcomeScale({ arenaScale, contentWidth, corridorWidth }) {
  const fit = (corridorWidth - ENTRY_WELCOME_MARGIN * 2) / contentWidth;
  return Math.min(1, Math.max(ENTRY_WELCOME_MINIMUM, fit)) / (arenaScale || 1);
}

// Horizontal room, in arena units, between the players whose boxes overlap
// the message's band; Infinity when nobody sits beside it.
export function entryWelcomeCorridor(boxes, { centerX, top, bottom }) {
  const beside = boxes.filter((box) => box.top < bottom && box.top + box.height > top);
  const left = Math.max(
    -Infinity,
    ...beside
      .filter((box) => box.left + box.width / 2 < centerX)
      .map((box) => box.left + box.width),
  );
  const right = Math.min(
    Infinity,
    ...beside.filter((box) => box.left + box.width / 2 >= centerX).map((box) => box.left),
  );
  return right - left;
}
