// Rising blinds for one game. Every level is a whole multiple of the starting
// small blind, so the chip denomination (the starting small blind) never
// changes and every wager, pot and split stays in whole chips.
const EARLY_MULTIPLIERS = [1, 2, 3, 4, 6, 10];
// Every level lasts the same number of hands, whatever the seats left.
export const HANDS_PER_LEVEL = 10;
// Size the last level for the two players who decide the tournament.
const HEADS_UP_AVERAGE_BB = 14;
// Five- and six-seat games play the final for first and second; larger
// games for the top three.
export const finalTableSeats = (playerCount) => (playerCount <= 6 ? 2 : 3);
export const levelLengthFor = () => HANDS_PER_LEVEL;

// The level ladder for a game's starting stakes and seat count, ending at its cap.
// The cap uses the chips dealt at the start; refills never move it.
export function blindLevels(stakes, playerCount) {
  const cap = Math.round(
    (stakes.startingStack * playerCount) / (2 * HEADS_UP_AVERAGE_BB * stakes.bigBlind),
  );
  // Split the last two increases evenly in percentage terms, rounded to whole chips.
  const penultimate = Math.round(Math.sqrt(EARLY_MULTIPLIERS.at(-1) * cap));
  return [...EARLY_MULTIPLIERS, penultimate, cap].map((multiplier) => ({
    smallBlind: stakes.smallBlind * multiplier,
    bigBlind: stakes.bigBlind * multiplier,
  }));
}

// Use the hand’s nominal big blind so a restored hand on the previous ladder
// plays out its level, then joins the new ladder at the first higher blind.
export function nextBlindLevelIndex(game, levels) {
  return levels.findIndex((level) => level.bigBlind > game.bigBlind);
}
export const blindCap = (stakes, playerCount) => blindLevels(stakes, playerCount).at(-1);

// Applied once as each hand starts, before blinds are posted. Returns the
// table notices for this hand, in display order: the final table first, then
// the new level. Retry restores the hand's own level and notices.
export function advanceTournament(g, seated) {
  const notices = [];
  if (g.risingBlinds === false) return notices;
  const levels = blindLevels(g.stakes, g.players.length);
  const next = nextBlindLevelIndex(g, levels);
  g.levelIndex ??= 0;
  g.levelHands ??= 0;
  g.levelLength ??= levelLengthFor(g.players.length);
  if (!g.finalTable && seated <= finalTableSeats(g.players.length)) {
    g.finalTable = true;
    notices.push({ kind: 'final-table', seats: seated });
  }
  if (g.levelHands >= g.levelLength && next >= 0) {
    g.levelIndex = next;
    Object.assign(g, levels[next]);
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
