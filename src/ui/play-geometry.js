export const COMPACT_PLAY_QUERY =
  '(max-width: 900px), (max-width: 1100px) and (orientation: portrait)';

// Keep the pot and board slightly above the middle of the felt, leaving a
// comfortable gap above the hero's cards. Collision checks can move it only
// as far as needed from this preferred position.
export function publicGroupTop(tableTop, tableHeight, groupHeight) {
  return tableTop + tableHeight * 0.44 - groupHeight / 2;
}

// Five-seat waist opponents share the public corridor. Allow a 16% scale
// cost there to retain five cards in one row; denser tables keep the 8% limit.
// Crowded phones still choose two rows instead of tiny player areas.
export function preferSinglePublicRow(singleHeight, twoRowsHeight, playerCount = 9) {
  return twoRowsHeight / singleHeight >= (playerCount === 5 ? 0.84 : 0.92);
}

// Seat anchors remain in the same order as height grows, so each free band
// only expands. Find the first whole-pixel height that fits the public group.
export function smallestClearHeight(current, ceiling, fits) {
  let low = Math.ceil(current),
    high = Math.ceil(ceiling);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}
