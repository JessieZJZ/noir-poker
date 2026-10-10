export const COMPACT_PLAY_QUERY =
  '(max-width: 900px), (max-width: 1100px) and (orientation: portrait)';

// Keep the pot and board slightly above the middle of the felt, leaving a
// comfortable gap above the hero's cards. Collision checks can move it only
// as far as needed from this preferred position.
export function publicGroupTop(tableTop, tableHeight, groupHeight) {
  return tableTop + tableHeight * 0.44 - groupHeight / 2;
}

// Prefer the five-card row when it costs at most 8% of the overall scale.
// A crowded short phone still chooses two rows instead of tiny player areas.
export function preferSinglePublicRow(singleHeight, twoRowsHeight) {
  return twoRowsHeight / singleHeight >= 0.92;
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
