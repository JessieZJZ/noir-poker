// Seat IDs follow the physical table clockwise, starting at the hero.
// Eliminated seats leave the ring, so a game may finish short-handed.
export const POSITION_ROLES = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'CO'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
};
// Seats still to act behind a first-in preflop decision at this position.
// Preflop starts after the big blind (the button acts first heads-up).
export function preflopSeatsBehind(position, seated) {
  const roles = POSITION_ROLES[seated];
  if (!roles || !position) return null;
  const order = seated === 2 ? roles : [...roles.slice(3), ...roles.slice(0, 3)],
    index = order.indexOf(position);
  return index < 0 ? null : seated - 1 - index;
}
