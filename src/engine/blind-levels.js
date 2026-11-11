// Rising blinds for one game. Every level is a whole multiple of the starting
// small blind, so the chip denomination (the starting small blind) never
// changes and every wager, pot and split stays in whole chips.
export const BLIND_LEVEL_MULTIPLIERS = Object.freeze([1, 2, 3, 4, 6, 8, 10, 12, 15]);
// Every level lasts the same number of hands, whatever the seats left.
export const HANDS_PER_LEVEL = 10;
// The cap is the highest level that still leaves the final table an average
// stack of at least this many big blinds.
export const FINAL_TABLE_AVERAGE_BB = 20;
// Five- and six-seat games play the final for first and second; larger
// games for the top three.
export const finalTableSeats = (playerCount) => (playerCount <= 6 ? 2 : 3);
export const levelLengthFor = () => HANDS_PER_LEVEL;

// The level ladder for a game's starting stakes and seat count, ending at its cap.
// The cap uses the chips dealt at the start; refills never move it.
export function blindLevels(stakes, playerCount) {
  const average = (stakes.startingStack * playerCount) / finalTableSeats(playerCount),
    capBigBlind = average / FINAL_TABLE_AVERAGE_BB;
  const levels = BLIND_LEVEL_MULTIPLIERS.map((multiplier) => ({
    smallBlind: stakes.smallBlind * multiplier,
    bigBlind: stakes.bigBlind * multiplier,
  })).filter((level, index) => index === 0 || level.bigBlind <= capBigBlind);
  return levels;
}
export const blindCap = (stakes, playerCount) => blindLevels(stakes, playerCount).at(-1);

// Applied once as each hand starts, before blinds are posted. Returns the
// table notices for this hand, in display order: the final table first, then
// the new level. Retry restores the hand's own level and notices.
export function advanceTournament(g, seated) {
  const notices = [];
  if (g.risingBlinds === false) return notices;
  const levels = blindLevels(g.stakes, g.players.length);
  g.levelIndex = Math.min(levels.length - 1, Math.max(0, g.levelIndex ?? 0));
  g.levelHands ??= 0;
  g.levelLength ??= levelLengthFor(g.players.length);
  if (!g.finalTable && seated <= finalTableSeats(g.players.length)) {
    g.finalTable = true;
    notices.push({ kind: 'final-table', seats: seated });
  }
  if (g.levelHands >= g.levelLength && g.levelIndex < levels.length - 1) {
    g.levelIndex++;
    g.levelHands = 0;
    g.levelLength = levelLengthFor(seated);
    notices.push({
      kind: 'blind-level',
      level: g.levelIndex,
      ...levels[g.levelIndex],
      last: g.levelIndex === levels.length - 1,
    });
  }
  g.levelHands++;
  g.smallBlind = levels[g.levelIndex].smallBlind;
  g.bigBlind = levels[g.levelIndex].bigBlind;
  return notices;
}

// Public stage of the game: the last elimination before the final table is
// the bubble. Heads-up has no place left to protect.
export function tournamentStage(seatsLeft, playerCount, finalTable) {
  const final = finalTableSeats(playerCount);
  if (seatsLeft <= 2) return 'heads-up';
  if (finalTable || seatsLeft <= final) return 'final';
  return seatsLeft === final + 1 ? 'bubble' : 'early';
}
