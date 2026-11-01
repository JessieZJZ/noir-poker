import { deckOfCards } from './poker.js';

// A full preflop runout scores millions of hands, so ranks are read from one
// 13-bit mask per suit and packed into an integer. Settlement stays in
// poker.js; a regression keeps this ordering identical to its evaluate().
const MASKS = 1 << 13;
const STRAIGHT_RUNS = [...Array(9).keys()].map((low) => [low + 4, 0b11111 << low]);
const WHEEL = 0b1000000001111;
const POP = new Uint8Array(MASKS),
  TOP = new Uint8Array(MASKS),
  STRAIGHT = new Uint8Array(MASKS);
for (let mask = 1; mask < MASKS; mask++) {
  POP[mask] = POP[mask >> 1] + (mask & 1);
  TOP[mask] = mask > 1 ? TOP[mask >> 1] + 1 : 0;
  let high = -1;
  if ((mask & WHEEL) === WHEEL) high = 3;
  for (const [top, run] of STRAIGHT_RUNS) if ((mask & run) === run) high = top;
  STRAIGHT[mask] = high + 1;
}
function ranked(mask, count) {
  let packed = 0;
  while (count--) {
    const rank = TOP[mask];
    packed = (packed << 4) | rank;
    mask &= ~(1 << rank);
  }
  return packed;
}
export function handStrength(a, b, c, d) {
  const all = a | b | c | d;
  const flush = POP[a] > 4 ? a : POP[b] > 4 ? b : POP[c] > 4 ? c : POP[d] > 4 ? d : 0;
  if (flush && STRAIGHT[flush]) return (8 << 20) | ((STRAIGHT[flush] - 1) << 16);
  const quads = a & b & c & d;
  if (quads) {
    const rank = TOP[quads];
    return (7 << 20) | (rank << 16) | (TOP[all & ~(1 << rank)] << 12);
  }
  const trips = (a & b & c) | (a & b & d) | (a & c & d) | (b & c & d),
    pairs = (a & b) | (a & c) | (a & d) | (b & c) | (b & d) | (c & d);
  if (trips) {
    const rank = TOP[trips],
      rest = pairs & ~(1 << rank);
    if (rest) return (6 << 20) | (rank << 16) | (TOP[rest] << 12);
  }
  if (flush) return (5 << 20) | ranked(flush, 5);
  if (STRAIGHT[all]) return (4 << 20) | ((STRAIGHT[all] - 1) << 16);
  if (trips) {
    const rank = TOP[trips];
    return (3 << 20) | (rank << 16) | (ranked(all & ~(1 << rank), 2) << 8);
  }
  if (pairs) {
    const high = TOP[pairs],
      low = pairs & ~(1 << high);
    if (low) {
      const second = TOP[low];
      return (
        (2 << 20) | (high << 16) | (second << 12) | (TOP[all & ~(1 << high) & ~(1 << second)] << 8)
      );
    }
    return (1 << 20) | (high << 16) | (ranked(all & ~(1 << high), 3) << 4);
  }
  return ranked(all, 5);
}
export function cardMasks(cards) {
  const masks = [0, 0, 0, 0];
  for (const card of cards) masks[card.suit] |= 1 << (card.rank - 2);
  return masks;
}
const scoreHand = (hand, board) =>
  handStrength(hand[0] | board[0], hand[1] | board[1], hand[2] | board[2], hand[3] | board[3]);
function combinations(n, k) {
  let total = 1;
  for (let i = 1; i <= k; i++) total = (total * (n - k + i)) / i;
  return Math.round(total);
}
function mulberry(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let x = value;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
// Cards held on a half-filled row can never appear on the board either.
const unseenCards = ({ hands, board, dead = [] }) => {
  const known = new Set([...hands.flat(), ...board, ...dead].map((card) => card.key));
  return deckOfCards().filter((card) => !known.has(card.key));
};
// Trials above zero sample random runouts; otherwise every runout is counted.
export function createWinRateRun(
  { hands, board, dead = [] },
  { trials = 0, seed = 0x9e3779b9 } = {},
) {
  const deck = unseenCards({ hands, board, dead }),
    suits = deck.map((card) => card.suit),
    bits = deck.map((card) => 1 << (card.rank - 2)),
    needed = 5 - board.length,
    total = trials || combinations(deck.length, needed),
    base = cardMasks(board),
    masks = hands.map(cardMasks),
    wins = hands.map(() => 0),
    ties = hands.map(() => 0),
    shares = hands.map(() => 0),
    winners = new Int32Array(hands.length),
    picked = [...Array(needed).keys()],
    order = deck.map((_, index) => index),
    random = mulberry(seed),
    runout = [0, 0, 0, 0];
  let done = 0;

  function tally() {
    let best = -1,
      count = 0;
    for (let i = 0; i < masks.length; i++) {
      const hand = masks[i],
        score = handStrength(
          hand[0] | runout[0],
          hand[1] | runout[1],
          hand[2] | runout[2],
          hand[3] | runout[3],
        );
      if (score > best) {
        best = score;
        count = 0;
      }
      if (score === best) winners[count++] = i;
    }
    if (count === 1) wins[winners[0]]++;
    else for (let i = 0; i < count; i++) ties[winners[i]]++;
    for (let i = 0; i < count; i++) shares[winners[i]] += 1 / count;
    done++;
  }
  function deal(index) {
    runout[suits[index]] |= bits[index];
  }
  function resetRunout() {
    runout[0] = base[0];
    runout[1] = base[1];
    runout[2] = base[2];
    runout[3] = base[3];
  }
  function enumerate() {
    resetRunout();
    for (let i = 0; i < needed; i++) deal(picked[i]);
    tally();
    let i = needed - 1;
    while (i >= 0 && picked[i] === deck.length - needed + i) i--;
    if (i < 0) return;
    picked[i]++;
    for (let j = i + 1; j < needed; j++) picked[j] = picked[j - 1] + 1;
  }
  function sample() {
    resetRunout();
    for (let i = 0; i < needed; i++) {
      const j = i + Math.floor(random() * (deck.length - i)),
        card = order[j];
      order[j] = order[i];
      order[i] = card;
      deal(card);
    }
    tally();
  }
  return {
    method: trials ? 'sampling' : 'exact',
    // Scores at most `limit` runouts and reports whether the run has finished.
    step(limit) {
      const stop = Math.min(total, done + limit);
      while (done < stop) trials ? sample() : enumerate();
      return done >= total;
    },
    progress: () => done / total,
    result: () => ({
      method: trials ? 'sampling' : 'exact',
      samples: done,
      margin: trials ? 0.98 / Math.sqrt(done) : 0,
      players: hands.map((_, i) => ({
        win: wins[i] / done,
        tie: ties[i] / done,
        equity: shares[i] / done,
      })),
    }),
  };
}
// An out is an unseen card that makes a hand win outright on the next street.
// The sole leader needs none, so it reports null like a street without outs.
export function calculateOuts({ hands, board, dead = [] }) {
  if (board.length !== 3 && board.length !== 4) return hands.map(() => null);
  const base = cardMasks(board),
    masks = hands.map(cardMasks),
    current = masks.map((hand) => scoreHand(hand, base)),
    best = Math.max(...current),
    leaders = current.filter((score) => score === best).length,
    outs = current.map((score) => (score === best && leaders === 1 ? null : []));
  const cards = unseenCards({ hands, board, dead }).sort(
    (a, b) => a.suit - b.suit || b.rank - a.rank,
  );
  for (const card of cards) {
    const next = [...base];
    next[card.suit] |= 1 << (card.rank - 2);
    const scores = masks.map((hand) => scoreHand(hand, next)),
      top = Math.max(...scores);
    if (scores.filter((score) => score === top).length === 1) outs[scores.indexOf(top)]?.push(card);
  }
  return outs;
}
