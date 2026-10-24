// Design targets for the synthetic training styles at 5–6 handed tables,
// 100 BB, standard/advanced difficulty, measured with two seats of the style
// among balanced companions (measure-bots --targets=2 --companions=balanced).
// They are author-chosen profiles that make each style readable, not measured
// frequencies of any real player. Showdown ranges sit a little above human
// HUD norms and AF a little below: these bots check medium hands down and
// call more than people do. Loose styles enter more pots and so call more,
// which keeps their AF near 2 even when they bet most of their spots.
// Each entry is [min, max]; percentages are 0–100, AF is raises / calls after
// the flop, bet size is the postflop raise increment over pot + call.
export const STYLE_TARGETS = {
  // Standard tight-aggressive baseline.
  balanced: {
    vpip: [21, 28],
    pfr: [16, 22],
    threeBet: [5, 9],
    foldToThreeBet: [45, 65],
    af: [1.8, 3.2],
    cbet: [55, 72],
    foldToCbet: [38, 55],
    wtsd: [24, 37],
    betSize: [0.45, 0.75],
  },
  // Loose-aggressive with large sizing.
  rook: {
    vpip: [31, 42],
    pfr: [24, 33],
    threeBet: [9, 15],
    foldToThreeBet: [30, 58],
    af: [1.9, 5],
    cbet: [65, 85],
    foldToCbet: [28, 45],
    wtsd: [24, 36],
    betSize: [0.7, 1.3],
  },
  // Loose-passive: calls wide, bets big only with made value.
  jett: {
    vpip: [40, 56],
    pfr: [7, 14],
    threeBet: [1, 5],
    foldToThreeBet: [50, 80],
    af: [0.6, 1.4],
    cbet: [30, 55],
    foldToCbet: [15, 35],
    wtsd: [38, 55],
    betSize: [0.65, 1.3],
  },
  // Tight range discipline, normal value once in.
  owen: {
    vpip: [13, 20],
    pfr: [10, 16],
    threeBet: [3, 7],
    foldToThreeBet: [60, 82],
    af: [2, 3.4],
    cbet: [55, 72],
    foldToCbet: [22, 55],
    wtsd: [22, 40],
    betSize: [0.5, 0.85],
  },
  // Trapping caller: few raises, slow-plays strong hands.
  vale: {
    vpip: [30, 42],
    pfr: [4, 11],
    threeBet: [1, 5],
    foldToThreeBet: [45, 85],
    af: [0.5, 1.2],
    cbet: [20, 45],
    foldToCbet: [18, 38],
    wtsd: [36, 55],
    betSize: [0.45, 0.85],
  },
  // Small-ball pot control: frequent small bets.
  nico: {
    vpip: [24, 33],
    pfr: [16, 24],
    threeBet: [4, 8],
    foldToThreeBet: [45, 68],
    af: [1.4, 2.8],
    cbet: [65, 88],
    foldToCbet: [35, 55],
    wtsd: [28, 42],
    betSize: [0.2, 0.45],
  },
  // Draw pressure: aggressive with equity.
  mira: {
    vpip: [26, 35],
    pfr: [19, 27],
    threeBet: [7, 12],
    foldToThreeBet: [40, 60],
    af: [2, 4],
    cbet: [58, 75],
    foldToCbet: [28, 45],
    wtsd: [24, 36],
    betSize: [0.45, 0.9],
  },
  // Position fighter: tight early, wide late.
  iris: {
    vpip: [25, 35],
    pfr: [20, 28],
    threeBet: [6, 11],
    foldToThreeBet: [40, 62],
    af: [1.7, 3.2],
    cbet: [58, 78],
    foldToCbet: [32, 50],
    wtsd: [24, 38],
    betSize: [0.35, 0.7],
    earlyVpip: [8, 18],
    buttonVpip: [42, 65],
  },
};

// Two styles read as different when at least two of these stats differ by
// at least the listed amount.
export const STYLE_DISTANCE = {
  vpip: 7,
  pfr: 6,
  threeBet: 3,
  af: 0.8,
  cbet: 12,
  foldToCbet: 10,
  wtsd: 6,
  betSize: 0.2,
  lateGap: 12,
  smallBets: 25,
  largeBets: 15,
  drawRaise: 15,
};
