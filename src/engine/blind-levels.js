// Rising blinds for one game. Every level is a whole multiple of the starting
// small blind, so the chip denomination (the starting small blind) never
// changes and every wager, pot and split stays in whole chips. Each level is
// about 1.5 times the one before, up to the game's cap.
const LEVEL_MULTIPLIERS = [1, 2, 3, 5, 8, 12, 18, 27, 40, 60, 90, 135, 200, 300];
// Hands per level before the final table, and once it is reached: fewer
// seats deal a round faster, so the last levels rise sooner.
export const HANDS_PER_LEVEL = 8;
export const FINAL_TABLE_HANDS_PER_LEVEL = 5;
// Size the last level for the two players who decide the tournament.
const HEADS_UP_AVERAGE_BB = 6;
// The last regular step sits at least this far below the cap; a wider gap
// is split at its rounded geometric mean.
const LAST_STEP_MIN_RATIO = 1.4;
const LAST_STEP_MAX_RATIO = 1.75;
// Five- and six-seat games play the final for first and second; larger
// games for the top three.
export const finalTableSeats = (playerCount) => (playerCount <= 6 ? 2 : 3);
export const levelLengthFor = (seated, playerCount) =>
  seated <= finalTableSeats(playerCount) ? FINAL_TABLE_HANDS_PER_LEVEL : HANDS_PER_LEVEL;

// The level ladder for a game's starting stakes and seat count, ending at its cap.
// The cap uses the chips dealt at the start; refills never move it.
export function blindLevels(stakes, playerCount) {
  const cap = Math.round(
    (stakes.startingStack * playerCount) / (2 * HEADS_UP_AVERAGE_BB * stakes.bigBlind),
  );
  const steps = LEVEL_MULTIPLIERS.filter((multiplier) => multiplier * LAST_STEP_MIN_RATIO <= cap);
  if (cap / steps.at(-1) > LAST_STEP_MAX_RATIO)
    steps.push(Math.round(Math.sqrt(steps.at(-1) * cap)));
  return [...steps, cap].map((multiplier) => ({
    smallBlind: stakes.smallBlind * multiplier,
    bigBlind: stakes.bigBlind * multiplier,
  }));
}

// The ladder used before the current one (10 hands per level, capped for a
// 14 BB heads-up). Saved games dealt on it stay valid and join the current
// ladder at its first higher blind.
export function previousBlindLevels(stakes, playerCount) {
  const cap = Math.round((stakes.startingStack * playerCount) / (2 * 14 * stakes.bigBlind));
  return [1, 2, 3, 4, 6, 10, Math.round(Math.sqrt(10 * cap)), cap].map((multiplier) => ({
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
  g.levelLength ??= levelLengthFor(seated, g.players.length);
  if (!g.finalTable && seated <= finalTableSeats(g.players.length)) {
    g.finalTable = true;
    notices.push({ kind: 'final-table', seats: seated });
    // The level in progress shortens too; if it already ran that long, the
    // blinds rise on this hand.
    g.levelLength = Math.min(g.levelLength, FINAL_TABLE_HANDS_PER_LEVEL);
  }
  if (g.levelHands >= g.levelLength && next >= 0) {
    g.levelIndex = next;
    Object.assign(g, levels[next]);
    g.levelHands = 0;
    g.levelLength = levelLengthFor(seated, g.players.length);
    notices.push({
      kind: 'blind-level',
      level: g.levelIndex,
      ...levels[g.levelIndex],
      hands: g.levelLength,
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
