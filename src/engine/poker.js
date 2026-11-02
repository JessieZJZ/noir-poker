import { DEFAULT_STAKES, validateStakes, bigBlindOf, sameStakes } from './stakes.js';
import { compactChips } from './chip-format.js';
import {
  getBotProfile,
  freshBotMood,
  freshBotStats,
  sanitizeBotSettings,
  decayBotMood,
  finishBotHand,
  recordPressureFold,
  MOOD_LABELS,
  botBoardFeatures,
  chooseBotAction,
  effectiveBotAxes,
} from './bot-profiles.js';
import { raiseCaption } from './action-labels.js';
import { botThinkingTime } from './bot-timing.js';
import { chipUnitOf, isChipAmount } from './bet-sizing.js';
import { allInContext, estimateAllInEquity } from './bot-allin.js';
import { publicActionContext } from './public-action-context.js';
import { preparePublicRanges } from './public-ranges.js';
import { estimatePublicEquity } from './public-equity.js';
import { assessPublicStrategy } from './public-strategy.js';
import {
  publicHandObservations,
  PUBLIC_READ_WINDOW,
  PUBLIC_READ_MODEL,
  PUBLIC_LARGE_PREFLOP_BB,
  PLAYER_OBSERVATION_VERSION,
  sanitizePlayerObservationProfile,
  publicReadForPlayer,
} from './public-observations.js';
export { publicReadForPlayer } from './public-observations.js';
export const SUITS = ['♠', '♥', '♣', '♦'];
export const RANK_NAMES = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
];
export const rankText = (r) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r);
export const deckOfCards = () =>
  SUITS.flatMap((s, suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      rank: i + 2,
      suit,
      symbol: s,
      key: suit + '-' + (i + 2),
    })),
  );
function shuffle(a, random = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
// Rank runs of the sorted five cards replace Set/filter grouping: review
// rollouts evaluate millions of five-card subsets. Scores are unchanged.
function evaluateFive(cards) {
  const ranks = [cards[0].rank, cards[1].rank, cards[2].rank, cards[3].rank, cards[4].rank].sort(
    (a, b) => b - a,
  );
  const groups = [];
  for (let i = 0; i < 5;) {
    let j = i + 1;
    while (j < 5 && ranks[j] === ranks[i]) j++;
    groups.push([ranks[i], j - i]);
    i = j;
  }
  const suit = cards[0].suit,
    flush =
      cards[1].suit === suit &&
      cards[2].suit === suit &&
      cards[3].suit === suit &&
      cards[4].suit === suit;
  let straight = groups.length === 5 && ranks[0] - ranks[4] === 4 ? ranks[0] : 0;
  if (groups.length === 5 && ranks[0] === 14 && ranks[1] === 5) straight = 5;
  groups.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return [
      2,
      Math.max(groups[0][0], groups[1][0]),
      Math.min(groups[0][0], groups[1][0]),
      groups[2][0],
    ];
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  return [0, ...ranks];
}
// For the 5–7 cards used by Hold'em, rank counts and suit masks determine the
// same best five without scoring all 21 subsets or allocating their groups.
function evaluateHoldem(cards) {
  const counts = new Uint8Array(15),
    masks = [0, 0, 0, 0],
    suits = [0, 0, 0, 0];
  let mask = 0;
  for (const card of cards) {
    counts[card.rank]++;
    masks[card.suit] |= 1 << card.rank;
    suits[card.suit]++;
    mask |= 1 << card.rank;
  }
  const straight = (bits) => {
    if (bits & (1 << 14)) bits |= 1 << 1;
    for (let high = 14; high >= 5; high--) if (((bits >> (high - 4)) & 31) === 31) return high;
    return 0;
  };
  const ranks = (minimum = 1, except = -1) => {
    const found = [];
    for (let rank = 14; rank >= 2; rank--)
      if (rank !== except && counts[rank] >= minimum) found.push(rank);
    return found;
  };
  const flushSuit = suits.findIndex((count) => count >= 5),
    straightFlush = flushSuit >= 0 ? straight(masks[flushSuit]) : 0,
    quads = ranks(4)[0],
    trips = ranks(3)[0],
    pairs = ranks(2, trips),
    run = straight(mask);
  let score;
  if (straightFlush) score = [8, straightFlush];
  else if (quads) score = [7, quads, ranks(1, quads)[0]];
  else if (trips && pairs.length) score = [6, trips, pairs[0]];
  else if (flushSuit >= 0) {
    const flush = [];
    for (let rank = 14; rank >= 2 && flush.length < 5; rank--)
      if (masks[flushSuit] & (1 << rank)) flush.push(rank);
    score = [5, ...flush];
  } else if (run) score = [4, run];
  else if (trips) score = [3, trips, ...ranks(1, trips).slice(0, 2)];
  else if (pairs.length >= 2)
    score = [2, pairs[0], pairs[1], ranks().find((rank) => rank !== pairs[0] && rank !== pairs[1])];
  else if (pairs.length) score = [1, pairs[0], ...ranks(1, pairs[0]).slice(0, 3)];
  else score = [0, ...ranks().slice(0, 5)];
  const wanted = new Uint8Array(15);
  if (score[0] === 8 || score[0] === 4) {
    for (let i = 0; i < 5; i++) wanted[score[1] - i === 1 ? 14 : score[1] - i] = 1;
  } else {
    for (const rank of score.slice(1)) wanted[rank] = 1;
    if ([1, 2].includes(score[0])) wanted[score[1]] = 2;
    if (score[0] === 2 || score[0] === 6) wanted[score[2]] = 2;
    if (score[0] === 3 || score[0] === 6) wanted[score[1]] = 3;
    if (score[0] === 7) wanted[score[1]] = 4;
  }
  const picked = [];
  for (const card of cards)
    if (wanted[card.rank] && (![5, 8].includes(score[0]) || card.suit === flushSuit)) {
      picked.push(card);
      wanted[card.rank]--;
    }
  return {
    score,
    label: score[0] === 8 && score[1] === 14 ? '皇家同花顺' : RANK_NAMES[score[0]],
    cards: picked,
  };
}
export function evaluate(cards) {
  if (cards.length < 5) {
    const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
    return {
      score: [ranks.length === 2 && ranks[0] === ranks[1] ? 1 : 0, ...ranks],
      label: ranks.length === 2 && ranks[0] === ranks[1] ? '口袋对子' : '高牌',
      cards,
    };
  }
  if (cards.length <= 7) return evaluateHoldem(cards);
  let best = null,
    bestCards = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const picked = [cards[a], cards[b], cards[c], cards[d], cards[e]],
              score = evaluateFive(picked);
            if (!best || compare(score, best) > 0) {
              best = score;
              bestCards = picked;
            }
          }
  return {
    score: best,
    label: best[0] === 8 && best[1] === 14 ? '皇家同花顺' : RANK_NAMES[best[0]],
    cards: bestCards,
  };
}
export function newGame(playerCount = 6, configuration = DEFAULT_STAKES) {
  if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 9)
    throw Error('牌桌人数须为 5–9 人。');
  const stakes = validateStakes(configuration);
  return {
    stakes,
    chipUnit: stakes.chipUnit,
    smallBlind: stakes.smallBlind,
    bigBlind: stakes.bigBlind,
    players: ['你', 'Mia', 'Alex', 'River', 'Kai', 'Luna', 'Theo', 'Jade', 'Leo']
      .slice(0, playerCount)
      .map((name, id) => ({
        id,
        name,
        stack: stakes.startingStack,
        hole: [],
        folded: false,
        allin: false,
        bet: 0,
        total: 0,
        actedTo: null,
        checked: false,
        action: '',
        lastAction: null,
        botProfile: 'balanced',
        botMood: freshBotMood(),
        botStats: freshBotStats(),
        publicReads: [],
        botHand: { vpip: false, pfr: false, pressureRecorded: false },
        out: false,
        place: null,
      })),
    dealer: playerCount - 1,
    hand: 0,
    street: -1,
    board: [],
    practiceBoard: null,
    deck: [],
    currentBet: 0,
    minRaise: stakes.bigBlind,
    pending: [],
    actor: -1,
    phase: 'idle',
    revealed: false,
    pots: [],
    refunds: [],
    logs: [],
    winners: [],
    payouts: [],
    stats: { hands: 0, wins: 0, buyin: stakes.startingStack },
    rebuys: 0,
    playerObservationRevision: 0,
    playerObservationHands: 0,
    over: null,
    difficulty: 'normal',
    emotionMode: 'subtle',
  };
}
// A stakes change starts a fresh session; callers cancel their own async work.
export function configureStakes(g, configuration) {
  const stakes = validateStakes(configuration);
  if (sameStakes(g.stakes, stakes)) return false;
  const playerProfile = exportPlayerObservations(g);
  const next = newGame(g.players.length, stakes);
  importPlayerObservations(next, playerProfile);
  next.difficulty = g.difficulty;
  next.emotionMode = g.emotionMode;
  next.players.forEach((player, id) => {
    player.botProfile = g.players[id].botProfile;
  });
  handStarts.delete(g);
  for (const key of Object.keys(g)) delete g[key];
  Object.assign(g, next);
  return true;
}
export function applyBotSettings(g, value) {
  if (!['idle', 'done'].includes(g.phase)) throw Error('对手设置在下一手开始时生效。');
  const settings = sanitizeBotSettings(value);
  for (const p of g.players.slice(1)) {
    if (p.botProfile !== settings.assignments[p.id]) {
      p.botProfile = settings.assignments[p.id];
      p.botMood = freshBotMood();
      p.botStats = freshBotStats();
      p.publicReads = [];
    }
    if (settings.emotionMode === 'off') p.botMood = freshBotMood();
  }
  g.emotionMode = settings.emotionMode;
}
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
// Seats still in the game, clockwise from the seat after `from`.
export function seatedRing(g, from = g.dealer) {
  const n = g.players.length;
  return Array.from({ length: n }, (_, i) => g.players[(from + 1 + i) % n]).filter((p) => !p.out);
}
// Positions are fixed when the hand starts; a seat eliminated at settlement
// keeps the badge it played this hand with.
export function seatPosition(g, id) {
  if (g.positions) return g.positions[id] || '';
  return POSITION_ROLES[g.players.length][(id - g.dealer + g.players.length) % g.players.length];
}
function assignPositions(g) {
  const ring = seatedRing(g),
    roles = POSITION_ROLES[ring.length];
  g.positions = g.players.map(() => '');
  // The ring ends with the button; heads-up the button is also the small blind.
  ring.forEach((p, i) => (g.positions[p.id] = roles[(i + 1) % ring.length]));
}
export const MAX_HERO_REBUYS = 3;
export const heroRebuysLeft = (g) => Math.max(0, MAX_HERO_REBUYS - (g.rebuys || 0));
export const needsHeroRebuy = (g) =>
  ['idle', 'done'].includes(g.phase) && !g.over && !g.players[0].out && g.players[0].stack === 0;
// Only the hero can refill, and only between hands after losing every chip.
export function rebuyHero(g) {
  if (!needsHeroRebuy(g)) throw Error('只有筹码输光后才能补充筹码。');
  if (!heroRebuysLeft(g)) throw Error('本局补码次数已用完。');
  g.players[0].stack = g.stakes.startingStack;
  g.rebuys = (g.rebuys || 0) + 1;
  g.stats.buyin += g.stakes.startingStack;
  g.refilled = true;
  return g;
}
export const potSize = (g) => g.players.reduce((sum, p) => sum + p.total, 0);
// Contribution layers determine eligibility. Folded chips stay in the pots;
// adjacent layers with the same eligible players belong to the same pot.
export function partitionPots(g) {
  const levels = [...new Set(g.players.map((p) => p.total).filter((n) => n > 0))].sort(
      (a, b) => a - b,
    ),
    pots = [],
    refunds = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = g.players.filter((p) => p.total >= level),
      increment = level - previous;
    previous = level;
    if (contributors.length === 1) {
      refunds.push({ id: contributors[0].id, amount: increment });
      continue;
    }
    const eligible = contributors.filter((p) => !p.folded).map((p) => p.id),
      amount = increment * contributors.length;
    if (!eligible.length) throw Error('底池没有符合条件的玩家。');
    let pot = pots.at(-1);
    if (!pot || pot.eligible.join(',') !== eligible.join(',')) {
      pot = {
        index: pots.length,
        label: pots.length ? '边池 ' + pots.length : '主池',
        amount: 0,
        eligible,
        contributions: [],
        awards: [],
      };
      pots.push(pot);
    }
    pot.amount += amount;
    for (const p of contributors) {
      const contribution = pot.contributions.find((c) => c.id === p.id);
      if (contribution) contribution.amount += increment;
      else pot.contributions.push({ id: p.id, amount: increment });
    }
  }
  return { pots, refunds };
}
// A live bet difference is not a side pot: callers may still match it.
// Only an all-in contribution cap separates live main and side pots.
export function currentPots(g) {
  if (g.phase === 'done') return { pots: g.pots, refunds: g.refunds };
  const totals = g.players.map((p) => p.total).sort((a, b) => b - a),
    ceiling = totals[1] || 0;
  const refunds = g.players
    .filter((p) => p.total > ceiling)
    .map((p) => ({ id: p.id, amount: p.total - ceiling }));
  const levels = [
    ...new Set([
      ...g.players.filter((p) => p.allin && p.total > 0 && p.total < ceiling).map((p) => p.total),
      ceiling,
    ]),
  ]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const contributions = g.players
      .map((p) => ({ id: p.id, amount: Math.max(0, Math.min(p.total, level) - previous) }))
      .filter((c) => c.amount > 0);
    const eligible = g.players
      .filter((p) => !p.folded && (p.total >= level || (!p.allin && p.total + p.stack >= level)))
      .map((p) => p.id);
    const amount = contributions.reduce((sum, c) => sum + c.amount, 0);
    previous = level;
    if (!amount) continue;
    pots.push({
      index: pots.length,
      label: pots.length ? '边池 ' + pots.length : '主池',
      amount,
      eligible,
      contributions,
      awards: [],
    });
  }
  return { pots, refunds };
}
export function contestableAfterCall(g, id, amount) {
  const cap = g.players[id].total + amount;
  return g.players.reduce((sum, p) => sum + Math.min(p.total, cap), 0) + amount;
}
const live = (g) => g.players.filter((p) => !p.folded);
const canAct = (p) => !p.folded && !p.allin && p.stack > 0;
function nextIndex(g, start, list) {
  for (let d = 1; d <= g.players.length; d++) {
    const id = (start + d) % g.players.length;
    if (list.includes(id)) return id;
  }
  return -1;
}
function log(g, text, player = null, type = 'action') {
  g.logs.unshift({ text, player, type, street: g.street });
}
function pay(p, amount, chipUnit) {
  if (!isChipAmount(amount, chipUnit)) throw Error('投入筹码必须是筹码面额的倍数。');
  const n = Math.min(p.stack, amount);
  p.stack -= n;
  p.bet += n;
  p.total += n;
  p.allin = p.stack === 0;
  return n;
}
// Public presentation only; street bet resets and settlement never overwrite it.
function rememberAction(g, p) {
  p.lastAction = { text: p.action, street: g.street, bet: p.bet };
}
// Keep the original deal private to the engine, outside public table and review data.
const handStarts = new WeakMap();
const cloneHand = (value) => JSON.parse(JSON.stringify(value));
const observationCounter = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
export function exportPlayerObservations(g) {
  const reads = g.players?.[0]?.publicReads;
  const samples = Array.isArray(reads) ? reads.slice(-PUBLIC_READ_WINDOW) : [];
  return sanitizePlayerObservationProfile({
    version: PLAYER_OBSERVATION_VERSION,
    revision: observationCounter(g.playerObservationRevision),
    totalHands: observationCounter(g.playerObservationHands),
    samples,
  });
}
export function importPlayerObservations(g, value) {
  const profile = sanitizePlayerObservationProfile(value);
  if (!profile || !g.players?.[0]) return false;
  if (observationCounter(g.playerObservationRevision) > profile.revision) return false;
  g.players[0].publicReads = profile.samples;
  g.playerObservationHands = profile.totalHands;
  g.playerObservationRevision = profile.revision;
  return true;
}
export const canRestartHand = (g) => g.phase === 'done' && handStarts.has(g);
export function startHand(g) {
  if (g.phase !== 'idle' && g.phase !== 'done') throw Error('当前牌局尚未结束。');
  if (g.over) throw Error('本局已结束，请开始下一局。');
  if (g.players.some((p) => !isChipAmount(p.stack, chipUnitOf(g))))
    throw Error('玩家筹码必须是筹码面额的倍数。');
  if (g.players.some((p) => !p.out && p.stack === 0)) throw Error('请先补充筹码。');
  g.replayAttempt = 0;
  g.potAtShowdown = 0;
  g.hand++;
  g.dealer = seatedRing(g)[0].id;
  assignPositions(g);
  g.board = [];
  g.practiceBoard = null;
  g.deck = shuffle(deckOfCards());
  g.street = 0;
  g.phase = 'playing';
  g.currentBet = bigBlindOf(g);
  g.minRaise = bigBlindOf(g);
  g.winners = [];
  g.payouts = [];
  g.pots = [];
  g.refunds = [];
  g.showdown = false;
  g.revealed = false;
  g.logs = [];
  g.result = '';
  g.decisions = [];
  g.botDecisions = [];
  g.history = [];
  log(g, `第 ${g.hand} 手开始 · 庄家 ${g.players[g.dealer].name}`, null, 'street');
  for (const p of g.players) {
    if (p.id) decayBotMood(p.botMood);
    p.botHand = { vpip: false, pfr: false, pressureRecorded: false };
    if (p.id === 0 && g.refilled)
      log(
        g,
        `${p.name} 补充 ${compactChips(g.stakes.startingStack)} 虚拟筹码 · 第 ${g.rebuys} 次补码`,
        p.id,
        'info',
      );
    p.hole = [];
    p.folded = !!p.out;
    p.allin = false;
    p.bet = 0;
    p.total = 0;
    p.actedTo = null;
    p.checked = false;
    p.action = '';
    p.lastAction = null;
  }
  g.refilled = false;
  const ring = seatedRing(g);
  for (let round = 0; round < 2; round++) for (const p of ring) p.hole.push(g.deck.pop());
  const sb = ring.length === 2 ? g.dealer : ring[0].id,
    bb = ring.length === 2 ? ring[0].id : ring[1].id;
  pay(g.players[sb], g.smallBlind, chipUnitOf(g));
  g.players[sb].action = `小盲 ${g.players[sb].bet}`;
  rememberAction(g, g.players[sb]);
  pay(g.players[bb], bigBlindOf(g), chipUnitOf(g));
  g.players[bb].action = `大盲 ${g.players[bb].bet}`;
  rememberAction(g, g.players[bb]);
  log(
    g,
    `${g.players[sb].name} 小盲 ${g.players[sb].bet} · ${g.players[bb].name} 大盲 ${g.players[bb].bet}`,
    null,
    'blind',
  );
  g.pending = g.players.filter(canAct).map((p) => p.id);
  g.actor = nextIndex(g, bb, g.pending);
  handStarts.set(g, cloneHand(g));
  return g;
}
export function restartHand(g) {
  if (!canRestartHand(g)) throw Error('请在本手结束后重打；需要本手的原始发牌记录。');
  const original = handStarts.get(g),
    attempt = (g.replayAttempt || 0) + 1,
    difficulty = g.difficulty,
    observationRevision = exportPlayerObservations(g).revision;
  // Restore the state after one blind posting, before any player action. This
  // also rolls back this attempt's awards, refunds, decisions and session stats.
  const restored = cloneHand(original);
  for (const key of Object.keys(g)) delete g[key];
  Object.assign(g, restored, {
    difficulty,
    replayAttempt: attempt,
    playerObservationRevision: Math.min(Number.MAX_SAFE_INTEGER, observationRevision + 1),
  });
  log(g, `第 ${g.hand} 手 · 第 ${attempt} 次重打，原结算已撤回`, null, 'info');
  return g;
}
export function legalActions(g, id = g.actor) {
  const p = g.players[id];
  if (g.phase !== 'playing' || g.actor !== id || !p || !canAct(p)) return { enabled: false };
  assertChipState(g);
  const owed = Math.max(0, g.currentBet - p.bet),
    max = p.bet + p.stack,
    min = g.currentBet === 0 ? bigBlindOf(g) : g.currentBet + g.minRaise;
  const reopened = p.actedTo === null || g.currentBet - p.actedTo >= g.minRaise;
  const other = g.players.some((o) => o.id !== id && canAct(o));
  return {
    enabled: true,
    chipUnit: chipUnitOf(g),
    toCall: owed,
    callAmount: Math.min(p.stack, owed),
    canCheck: owed === 0,
    raiseReopened: reopened,
    canRaise: max > g.currentBet && reopened && other,
    minRaiseTo: Math.min(min, max),
    fullRaiseTo: min,
    maxRaiseTo: max,
    isShortAllin: max < min,
  };
}
export function act(g, id, action, amount) {
  const legal = legalActions(g, id),
    p = g.players[id];
  if (!legal.enabled) throw Error('还没有轮到你行动。');
  if (!['fold', 'call', 'check', 'raise'].includes(action)) throw Error('未知的牌桌行动。');
  if (action === 'check' && !legal.canCheck) throw Error('当前需要跟注，不能过牌。');
  if (
    action === 'raise' &&
    (!legal.canRaise ||
      !isChipAmount(amount, chipUnitOf(g)) ||
      amount < legal.minRaiseTo ||
      amount > legal.maxRaiseTo)
  )
    throw Error('请选择合法的加注总额，金额必须是筹码面额的倍数。');
  // Capture only information available before the decision. Opponents' hole
  // cards, the remaining deck and future community cards never enter review.
  const normalized = action === 'call' && legal.canCheck ? 'check' : action;
  const betLabel =
    normalized === 'raise'
      ? raiseCaption(
          { street: g.street, history: g.history, currentBet: g.currentBet, legal },
          amount,
        )
      : null;
  if (id !== 0) {
    p.botStats = { ...freshBotStats(), ...p.botStats };
    const preflopRaises =
      g.street === 0 ? (g.history || []).filter((a) => a.street === 0 && a.action === 'raise') : [];
    if (
      g.street === 0 &&
      preflopRaises.length === 1 &&
      legal.canRaise &&
      !p.botHand.threeBetOpportunity
    ) {
      p.botHand.threeBetOpportunity = true;
      p.botStats.threeBetOpportunities++;
      if (normalized === 'raise') p.botStats.threeBets++;
    }
    if (
      g.street === 0 &&
      preflopRaises.length === 2 &&
      legal.toCall > 0 &&
      !p.botHand.facedThreeBet
    ) {
      p.botHand.facedThreeBet = true;
      p.botStats.facedThreeBets++;
      if (normalized === 'fold') p.botStats.foldsToThreeBet++;
    }
    if (g.street === 0 && ['call', 'raise'].includes(normalized)) p.botHand.vpip = true;
    if (g.street === 0 && normalized === 'raise') p.botHand.pfr = true;
    if (g.street > 0 && ['call', 'check', 'raise'].includes(normalized)) {
      p.botStats.postActions++;
      if (normalized === 'raise') p.botStats.postRaises++;
      if (normalized === 'call') p.botStats.postCalls++;
    }
    const facing = [...(g.history || [])]
      .reverse()
      .find((a) => a.street === g.street && a.action === 'raise');
    if (normalized === 'fold' && facing && !p.botHand.pressureRecorded) {
      p.botHand.pressureRecorded = true;
      const event = recordPressureFold(p.botMood, facing.id, g.hand, g.emotionMode);
      if (event)
        log(g, `${p.name} 模拟状态：${MOOD_LABELS[event.kind]} · ${event.reason}`, id, 'info');
    }
  }
  if (id === 0) {
    g.decisions ||= [];
    g.decisions.push({
      index: g.decisions.length,
      hand: g.hand,
      street: g.street,
      position: seatPosition(g, id),
      hole: p.hole.map((c) => ({ ...c })),
      board: g.board.map((c) => ({ ...c })),
      stack: p.stack,
      bet: p.bet,
      total: p.total,
      pot: potSize(g),
      currentBet: g.currentBet,
      minRaise: g.minRaise,
      chipUnit: chipUnitOf(g),
      smallBlind: g.smallBlind,
      bigBlind: bigBlindOf(g),
      dealer: g.dealer,
      emotionMode: g.emotionMode,
      difficulty: g.difficulty,
      publicReadModel: PUBLIC_READ_MODEL,
      legal: { ...legal },
      pending: [...g.pending],
      actionContext: publicActionContext(g, id),
      action: normalized,
      amount: normalized === 'raise' ? amount : normalized === 'call' ? legal.callAmount : 0,
      players: g.players.map((o) => ({
        id: o.id,
        name: o.name,
        position: seatPosition(g, o.id),
        stack: o.stack,
        bet: o.bet,
        total: o.total,
        folded: o.folded,
        allin: o.allin,
        action: o.action,
        botProfile: o.id ? o.botProfile : null,
        publicRead: publicReadForPlayer(g, o.id),
        publicAxes: o.id
          ? effectiveBotAxes(getBotProfile(o.botProfile), o.botMood, g.emotionMode)
          : null,
        botMoodKind: o.id ? o.botMood.kind : null,
        actedTo: o.actedTo,
        checked: o.checked,
        out: !!o.out,
      })),
      history: (g.history || []).map((a) => ({ ...a })),
    });
  }
  g.history ||= [];
  g.history.push({
    street: g.street,
    chipUnit: chipUnitOf(g),
    bigBlind: bigBlindOf(g),
    id,
    action: normalized,
    amount: normalized === 'raise' ? amount : normalized === 'call' ? legal.callAmount : 0,
    ...(betLabel ? { betLabel } : {}),
  });
  g.pending = g.pending.filter((v) => v !== id);
  if (action === 'fold') {
    p.folded = true;
    p.action = '弃牌';
    log(g, `${p.name} 弃牌`, id);
  } else if (action === 'check' || (action === 'call' && legal.toCall === 0)) {
    p.checked = true;
    p.action = '过牌';
    p.actedTo = g.currentBet;
    log(g, `${p.name} 过牌`, id);
  } else if (action === 'call') {
    const n = pay(p, legal.callAmount, chipUnitOf(g));
    p.checked = false;
    p.actedTo = g.currentBet;
    p.action = p.allin ? `全下 ${p.bet}` : `跟注 ${n}`;
    log(g, `${p.name} ${p.action}`, id);
  } else {
    const old = g.currentBet;
    pay(p, amount - p.bet, chipUnitOf(g));
    g.currentBet = amount;
    p.checked = false;
    p.actedTo = amount;
    const full = amount - old >= g.minRaise;
    if (full) {
      g.minRaise = amount - old;
      g.pending = g.players.filter((o) => o.id !== id && canAct(o)).map((o) => o.id);
    } else
      for (const o of g.players)
        if (o.id !== id && canAct(o) && o.bet < amount && !g.pending.includes(o.id))
          g.pending.push(o.id);
    p.action = `${betLabel} ${amount}`;
    log(g, `${p.name} ${p.action}`, id);
  }
  rememberAction(g, p);
  progress(g, id);
  return g;
}
function progress(g, last) {
  if (live(g).length === 1) {
    settle(g, false);
    return;
  }
  g.pending = g.pending.filter((id) => canAct(g.players[id]));
  if (
    g.pending.length === 1 &&
    g.players[g.pending[0]].bet >= g.currentBet &&
    g.players.filter(canAct).length === 1
  )
    g.pending = [];
  if (g.pending.length) {
    g.actor = nextIndex(g, last, g.pending);
    g.phase = 'playing';
  } else {
    g.actor = -1;
    g.phase = 'between';
    if (g.street === 3 || (live(g).some((p) => p.allin) && g.players.filter(canAct).length <= 1))
      g.revealed = true;
  }
}
function dealCommunityCards(board, deck, count) {
  deck.pop(); // Burn one card before each street, including practice runouts.
  for (let i = 0; i < count; i++) board.push(deck.pop());
}

export function completeBoardForPractice(g) {
  if (g.phase !== 'done') throw Error('请先完成本手结算。');
  if (g.board.length === 5 || g.practiceBoard) return g;
  if (g.showdown) throw Error('摊牌结算需要完整公共牌。');
  // These cards are a learning preview after a fold-win, not new game actions.
  // Keep the actual board, deck, settlement and review evidence untouched.
  const board = [...g.board],
    deck = [...g.deck];
  while (board.length < 5) dealCommunityCards(board, deck, board.length === 0 ? 3 : 1);
  g.practiceBoard = board;
  log(g, '练习补牌 · 五张公共牌已展示，弃牌结算不变', null, 'info');
  return g;
}

export function advanceStreet(g) {
  if (g.phase !== 'between') throw Error('本轮行动尚未结束。');
  if (g.street === 3) {
    settle(g, true);
    return g;
  }
  g.street++;
  const count = g.street === 1 ? 3 : 1;
  dealCommunityCards(g.board, g.deck, count);
  g.currentBet = 0;
  g.minRaise = bigBlindOf(g);
  for (const p of g.players) {
    p.bet = 0;
    p.actedTo = null;
    p.checked = false;
    if (!p.folded) p.action = p.allin ? '全下' : '';
  }
  log(
    g,
    ['', '翻牌', '转牌', '河牌'][g.street] +
      ' · ' +
      g.board
        .slice(-count)
        .map((c) => rankText(c.rank) + c.symbol)
        .join(' '),
    null,
    'street',
  );
  const active = g.players.filter(canAct);
  if (active.length <= 1) {
    g.pending = [];
    g.actor = -1;
    g.phase = 'between';
    if (live(g).some((p) => p.allin)) g.revealed = true;
  } else {
    g.pending = active.map((p) => p.id);
    g.actor = nextIndex(g, g.dealer, g.pending);
    g.phase = 'playing';
  }
  return g;
}
// Reject broken ledgers before any action or payout writes. Never round balances
// to repair them: doing so would create or destroy money.
function assertChipState(g) {
  const amounts = [
    g.currentBet,
    g.minRaise,
    ...g.players.flatMap((p) => [p.stack, p.bet, p.total]),
  ];
  if (amounts.some((amount) => !isChipAmount(amount, chipUnitOf(g))))
    throw Error('牌桌筹码必须是筹码面额的倍数。');
}
export function settle(g, showdown = true) {
  if (g.phase === 'done') throw Error('这手牌已经结算。');
  assertChipState(g);
  const { pots, refunds } = partitionPots(g),
    payouts = Array(g.players.length).fill(0),
    won = Array(g.players.length).fill(0);
  const ranks = new Map(
    showdown ? live(g).map((p) => [p.id, evaluate([...p.hole, ...g.board])]) : [],
  );
  for (const refund of refunds) payouts[refund.id] += refund.amount;
  for (const pot of pots) {
    const eligible = pot.eligible.map((id) => g.players[id]);
    let winners = [];
    if (!showdown) winners = [eligible[0]];
    else {
      let best = null;
      for (const p of eligible) {
        const score = ranks.get(p.id).score;
        const c = best ? compare(score, best) : 1;
        if (c > 0) {
          best = score;
          winners = [p];
        } else if (c === 0) winners.push(p);
      }
    }
    winners.sort(
      (a, b) =>
        ((a.id - g.dealer + g.players.length - 1) % g.players.length) -
        ((b.id - g.dealer + g.players.length - 1) % g.players.length),
    );
    const chips = pot.amount / chipUnitOf(g),
      share = Math.floor(chips / winners.length),
      remainder = chips % winners.length;
    pot.awards = winners.map((p, i) => ({
      id: p.id,
      amount: (share + (i < remainder ? 1 : 0)) * chipUnitOf(g),
      label: showdown ? ranks.get(p.id).label : '其余玩家均已弃牌',
    }));
    for (const award of pot.awards) {
      payouts[award.id] += award.amount;
      won[award.id] += award.amount;
    }
  }
  if (payouts.reduce((sum, n) => sum + n, 0) !== potSize(g)) throw Error('底池分配金额不一致。');
  g.pots = pots;
  g.refunds = refunds;
  g.payouts = payouts;
  g.winners = g.players
    .filter((p) => won[p.id] > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      amount: won[p.id],
      profit: payouts[p.id] - p.total,
      label: showdown ? evaluate([...p.hole, ...g.board]).label : '其余玩家均已弃牌',
    }));
  g.potAtShowdown = won.reduce((sum, n) => sum + n, 0);
  g.showdown = showdown;
  g.phase = 'done';
  g.actor = -1;
  g.stats.hands++;
  if (won[0] > 0) g.stats.wins++;
  g.players.forEach((p) => (p.stack += payouts[p.id]));
  eliminate(g);
  g.result =
    (pots.length > 1 ? '分池结算 · ' : '') +
    g.winners
      .map(
        (p) =>
          p.name +
          (showdown ? ' ' + p.label : ' 获胜') +
          ' · 获得 ' +
          compactChips(p.amount) +
          ' 筹码',
      )
      .join(' / ');
  for (const pot of pots)
    log(
      g,
      pot.label +
        ' ' +
        compactChips(pot.amount) +
        ' → ' +
        pot.awards.map((a) => g.players[a.id].name + ' ' + compactChips(a.amount)).join(' / '),
      null,
      'result',
    );
  for (const refund of refunds)
    log(
      g,
      g.players[refund.id].name + ' 未被跟注的 ' + compactChips(refund.amount) + ' 筹码已退还',
      refund.id,
      'info',
    );
  log(g, g.result, null, 'result');
  for (const p of g.players.slice(1)) {
    p.botStats.hands++;
    if (p.botHand.vpip) p.botStats.vpip++;
    if (p.botHand.pfr) p.botStats.pfr++;
    const event = finishBotHand(p, payouts[p.id] - p.total, g.emotionMode, bigBlindOf(g));
    if (event)
      log(g, `${p.name} 模拟状态：${MOOD_LABELS[event.kind]} · ${event.reason}`, p.id, 'info');
  }
  const observations = publicHandObservations({
    dealtIds: g.players.filter((p) => p.hole.length === 2).map((p) => p.id),
    history: g.history,
    bigBlind: bigBlindOf(g),
  });
  for (const p of g.players) {
    const observation = observations.get(p.id);
    if (observation) {
      if (p.id === 0) {
        const profile = exportPlayerObservations(g);
        g.playerObservationHands = Math.min(Number.MAX_SAFE_INTEGER, profile.totalHands + 1);
        g.playerObservationRevision = Math.min(Number.MAX_SAFE_INTEGER, profile.revision + 1);
      }
      p.publicReads = [...(p.publicReads || []), observation].slice(-PUBLIC_READ_WINDOW);
    }
  }
  return g;
}
// Seats that lose every chip leave the game. Seats busting in the same hand
// are ranked by the stack they started it with; equal stacks share a place.
// The hero leaves only after the last refill, which ends the game at once:
// remaining bots are not simulated. Whoever is the last seat left is the
// champion: the hero by clearing the table, a bot by taking the hero's last
// chips along with every other remaining seat.
function eliminate(g) {
  const hero = g.players[0],
    heroMayRefill = hero.stack === 0 && heroRebuysLeft(g) > 0,
    leaving = g.players.filter((p) => !p.out && p.stack === 0 && (p.id !== 0 || !heroMayRefill));
  if (!leaving.length) return;
  // Busting seats end with nothing, so everything they started with is in the pots.
  const started = (p) => p.total,
    remaining = g.players.filter((p) => !p.out).length - leaving.length;
  for (const p of leaving) {
    p.out = true;
    p.place = remaining + 1 + leaving.filter((o) => started(o) > started(p)).length;
  }
  for (const p of leaving.sort((a, b) => b.place - a.place))
    log(g, `${p.name} 筹码输光，出局 · 第 ${p.place} 名`, p.id, 'result');
  const left = g.players.filter((p) => !p.out),
    champion = left.length === 1 ? left[0] : null;
  if (champion) {
    champion.place = 1;
    log(g, `${champion.name} 获得冠军`, champion.id, 'result');
  }
  if (hero.out || champion)
    g.over = { heroPlace: hero.place, championId: champion ? champion.id : null };
}
export function estimateEquity(hole, board, rivals = 1, trials = 35, random = Math.random) {
  const known = new Set([...hole, ...board].map((c) => c.key)),
    available = deckOfCards().filter((c) => !known.has(c.key));
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    const sample = shuffle([...available], random),
      community = [...board];
    while (community.length < 5) community.push(sample.pop());
    const score = evaluate([...hole, ...community]).score;
    let tied = 1,
      lost = false;
    for (let i = 0; i < rivals; i++) {
      const enemy = evaluate([sample.pop(), sample.pop(), ...community]).score,
        c = compare(enemy, score);
      if (c > 0) {
        lost = true;
        break;
      }
      if (c === 0) tied++;
    }
    if (!lost) wins += 1 / tied;
  }
  return wins / trials;
}
export function botDecision(g, random = Math.random, { trials, allInCache } = {}) {
  const p = g.players[g.actor],
    legal = legalActions(g),
    rivals = Math.max(1, live(g).length - 1);
  if (!p || !legal.enabled) throw Error('机器人当前不能行动。');
  const score = evaluate([...p.hole, ...g.board]).score;
  const equityTrials = trials ?? (g.difficulty === 'hard' ? 52 : 28);
  if (!Number.isInteger(equityTrials) || equityTrials < 1)
    throw Error('权益抽样次数必须为正整数。');
  // Explicit actor perspective: no other hole cards, future deck, review
  // decisions or eventual winners can enter this policy.
  const view = {
    id: p.id,
    hole: p.hole.map((c) => ({ ...c })),
    board: g.board.map((c) => ({ ...c })),
    street: g.street,
    position: seatPosition(g, p.id),
    botProfile: p.id ? p.botProfile : null,
    publicRead: publicReadForPlayer(g, p.id),
    publicReadModel: PUBLIC_READ_MODEL,
    publicAxes: p.id
      ? effectiveBotAxes(getBotProfile(p.botProfile), p.botMood, g.emotionMode)
      : null,
    actionContext: publicActionContext(g, p.id),
    count: seatedRing(g).length,
    chipUnit: chipUnitOf(g),
    bigBlind: bigBlindOf(g),
    inPosition:
      Array.from(
        { length: g.players.length },
        (_, i) => g.players[(g.dealer + 1 + i) % g.players.length],
      )
        .filter(canAct)
        .at(-1)?.id === p.id,
    stack: p.stack,
    bet: p.bet,
    total: p.total,
    pot: potSize(g),
    currentBet: g.currentBet,
    difficulty: g.difficulty,
    legal,
    rivals,
    opponents: live(g)
      .filter((o) => o.id !== p.id)
      .map((o) => ({
        id: o.id,
        position: seatPosition(g, o.id),
        botProfile: o.id ? o.botProfile : null,
        publicRead: publicReadForPlayer(g, o.id),
        publicAxes: o.id
          ? effectiveBotAxes(getBotProfile(o.botProfile), o.botMood, g.emotionMode)
          : null,
        stack: o.stack,
        bet: o.bet,
        total: o.total,
        allin: o.allin,
        actedTo: o.actedTo,
      })),
    equityTrials,
    contestable: contestableAfterCall(g, p.id, legal.callAmount),
    history: (g.history || []).map(({ id, street, action, amount, betLabel }) => ({
      id,
      street,
      action,
      amount,
      ...(betLabel ? { betLabel } : {}),
    })),
    features: botBoardFeatures(p.hole, g.board, score),
    playsBoard: g.board.length === 5 && compare(score, evaluate(g.board).score) === 0,
  };
  const allIn = allInContext(view);
  // Only public ledgers enter the existing pot partitioner. Pending seats
  // contribute their chips already paid, not imaginary future calls.
  const before = {
    players: g.players.map(({ id, total, folded }) => ({ id, total, folded })),
  };
  const after = {
    players: before.players.map((o) => ({
      ...o,
      total: o.total + (o.id === p.id ? legal.callAmount : 0),
    })),
  };
  const beforeRefund = partitionPots(before).refunds.find((r) => r.id === p.id)?.amount || 0;
  const partition = partitionPots(after);
  const afterRefund = partition.refunds.find((r) => r.id === p.id)?.amount || 0;
  const refundDelta = afterRefund - beforeRefund;
  view.callPots = partition.pots
    .filter((pot) => pot.eligible.includes(p.id))
    .map(({ amount, eligible }) => ({ amount, eligible: [...eligible] }));
  const contestable = view.callPots.reduce((sum, pot) => sum + pot.amount, 0);
  const cost = Math.max(0, legal.callAmount - refundDelta);
  view.callPrice = { cost, contestable, odds: cost / Math.max(1, contestable), refundDelta };
  if (allIn) {
    view.allIn = {
      ...allIn,
      ...view.callPrice,
    };
    const allInTrials =
      trials ??
      (g.street === 0 && g.difficulty !== 'easy' ? 512 : g.difficulty === 'hard' ? 96 : 72);
    view.equityTrials = allInTrials;
    const assessment = estimateAllInEquity(view, allIn, {
      deck: deckOfCards(),
      evaluate,
      compare,
      trials: allInTrials,
      random,
      cache: allInCache,
    });
    view.equity = assessment.equity;
    Object.assign(view.allIn, assessment);
    view.publicEquity = {
      ...assessment,
      potEquity: assessment.equity,
      samples: assessment.exact ? 0 : allInTrials,
      model: allIn.isAllIn ? 'public-all-in-ranges' : 'public-commitment-ranges',
      assumedOpponentIds: [...allIn.committedIds],
    };
  } else {
    // Estimate sharing the money exposed by this call. Other live seats may
    // still cover those layers; an actual all-in retains its paid cap. Cap the
    // actor's model exposure at the call instead of inventing later actor bets.
    const equityLedger = {
      phase: 'playing',
      players: g.players.map(({ id, total, stack, folded, allin }) => ({
        id,
        total: total + (id === p.id ? legal.callAmount : 0),
        stack: stack - (id === p.id ? legal.callAmount : 0),
        folded,
        allin: id === p.id || allin,
      })),
    };
    view.equityPots = currentPots(equityLedger)
      .pots.filter((pot) => pot.eligible.includes(p.id))
      .map(({ amount, eligible }) => ({ amount, eligible: [...eligible] }));
    view.publicEquity = estimatePublicEquity(view, preparePublicRanges(view), {
      deck: deckOfCards(),
      evaluate,
      compare,
      features: botBoardFeatures,
      trials: equityTrials,
      random,
      cache: allInCache,
    });
    view.equity = view.publicEquity.priceEquity ?? view.publicEquity.equity;
  }
  if (
    g.difficulty !== 'easy' &&
    !view.allIn &&
    (g.street > 0 ||
      (p.hole[0].rank === p.hole[1].rank &&
        legal.callAmount > 0 &&
        legal.callAmount <= p.stack * 0.06))
  )
    view.publicStrategy = assessPublicStrategy(view, {
      deck: deckOfCards(),
      evaluate,
      compare,
      features: botBoardFeatures,
      cache: allInCache,
      samples: trials === 8 ? 8 : g.difficulty === 'hard' ? 48 : 32,
    });
  const decision = chooseBotAction(
    view,
    getBotProfile(p.botProfile),
    p.botMood,
    g.emotionMode,
    random,
  );
  return {
    ...decision,
    trace: {
      ...decision.trace,
      view,
      observationSizing: { version: 1, largePreflopBB: PUBLIC_LARGE_PREFLOP_BB },
    },
  };
}

// Opaque plans keep preselected actions and private timing factors off the UI.
const botPlans = new WeakMap();
export function planBotTurn(g, random = Math.random, { timingRandom = Math.random } = {}) {
  if (g.actor === 0) throw Error('玩家行动不能使用机器人执行器。');
  const decision = botDecision(g, random),
    thinking = botThinkingTime(decision, timingRandom),
    plan = Object.freeze({ delayMs: thinking.durationMs });
  botPlans.set(plan, {
    game: g,
    id: g.actor,
    hand: g.hand,
    attempt: g.replayAttempt || 0,
    street: g.street,
    sequence: g.history.length,
    difficulty: g.difficulty,
    stack: g.players[g.actor].stack,
    bet: g.currentBet,
    decision,
    thinking,
  });
  return plan;
}
export function isBotTurnCurrent(g, plan) {
  const p = botPlans.get(plan);
  return !!(
    p &&
    p.game === g &&
    g.phase === 'playing' &&
    p.id === g.actor &&
    p.hand === g.hand &&
    p.attempt === (g.replayAttempt || 0) &&
    p.street === g.street &&
    p.sequence === g.history.length &&
    p.difficulty === g.difficulty &&
    p.stack === g.players[g.actor].stack &&
    p.bet === g.currentBet
  );
}
// Only executing a current plan writes an action and its one private record.
export function executeBotTurn(g, plan, { expedited = false, waitedMs = 0 } = {}) {
  if (!isBotTurnCurrent(g, plan)) throw Error('机器人行动计划已过期。');
  const { id, decision, thinking } = botPlans.get(plan);
  const record = JSON.parse(
    JSON.stringify({
      id,
      name: g.players[id].name,
      hand: g.hand,
      sequence: g.history.length + 1,
      action: decision.action,
      amount: decision.amount,
      trace: {
        ...decision.trace,
        thinking: { ...thinking, expedited, waitedMs: Math.max(0, waitedMs) },
      },
    }),
  );
  act(g, id, decision.action, decision.amount);
  botPlans.delete(plan);
  g.botDecisions ||= [];
  g.botDecisions.push(record);
  return decision;
}
export function playBotTurn(g, random = Math.random) {
  return executeBotTurn(g, planBotTurn(g, random), { expedited: true });
}
