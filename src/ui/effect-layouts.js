import { blindCap, blindLevels, finalTableSeats, HANDS_PER_LEVEL } from '../engine/blind-levels.js';
// Deterministic particle layouts and timings shared by Web, native and WeChat.
// Every platform renders the same elements with the same CSS custom
// properties, so the motion is identical without platform-specific physics.
export const PREMIUM_DELAY_MS = 1150;
export const PREMIUM_DURATION_MS = 2600;
export const REBUY_DURATION_MS = 1300;
// The trophy holds at the centre for about 2.3 s before its flight, and the
// confetti keeps falling for most of the 5.7 s championship cheer.
export const CROWN_FLIGHT_MS = 4200;
export const CONFETTI_DURATION_MS = 5800;
export const FAREWELL_DURATION_MS = 2800;
// Each table notice (final table, new blind level) holds about 1.2 s at the
// centre before the hand is dealt; two notices play one after another.
export const TABLE_NOTICE_MS = 1800;

// The blind structure of a game before it starts, for the ready table and
// settings: levels rise every ten hands up to a cap; the final table size.
export function blindStructureText(stakes, playerCount, format) {
  const cap = blindCap(stakes, playerCount),
    seats = finalTableSeats(playerCount),
    top = `${format(cap.smallBlind)} / ${format(cap.bigBlind)}`;
  return {
    levels: `每 ${HANDS_PER_LEVEL} 手涨盲，最高 ${top}`,
    final: `剩 ${seats} 人进入决赛圈`,
    settings: `每 ${HANDS_PER_LEVEL} 手升一级，最高 ${top}，剩 ${seats} 人进入决赛圈。`,
  };
}
// levelHands includes this hand already. State the remaining count after it,
// so retry and a settled hand show the same progress without advancing rules.
export function blindProgressText(game) {
  if (game.phase === 'idle' || game.risingBlinds === false) return '';
  const levels = blindLevels(game.stakes, game.players.length);
  if ((game.levelIndex ?? 0) >= levels.length - 1) return '盲注已封顶';
  const remaining = Math.max(0, (game.levelLength ?? HANDS_PER_LEVEL) - (game.levelHands ?? 0));
  return remaining ? `本手后再打 ${remaining} 手涨盲` : '下一手涨盲';
}
// Text of a hand's table notices, in display order. Callers localize it.
export function tableNoticeText(notice, format) {
  if (notice.kind === 'final-table')
    return {
      kind: notice.kind,
      sound: 'finaltable',
      title: '进入决赛圈',
      caption: `剩余 ${notice.seats} 人争夺冠军 · 不能再补码`,
    };
  return {
    kind: notice.kind,
    sound: 'levelup',
    title: `盲注升至 ${format(notice.smallBlind)} / ${format(notice.bigBlind)}`,
    caption: notice.last ? '已到最高级别，不再上涨' : `每 ${HANDS_PER_LEVEL} 手升一级`,
  };
}

function sequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const round = (value) => Math.round(value * 10) / 10;

// The refill count shows these ten values on every platform. Values before the
// last are rounded to two significant digits, so they never print wider than
// necessary, and the last is the exact stack.
export const REFILL_COUNT_STEPS = 10;
export function refillCountValues(target) {
  const unit = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, target))) - 1));
  return Array.from({ length: REFILL_COUNT_STEPS }, (_, index) => {
    const step = index + 1;
    if (step === REFILL_COUNT_STEPS) return target;
    const eased = 1 - Math.pow(1 - step / REFILL_COUNT_STEPS, 3);
    return Math.round((target * eased) / unit) * unit;
  });
}

// Sparks leave the outline of the two hole cards and fly outward.
export function premiumSparks(count = 18) {
  const random = sequence(97);
  return Array.from({ length: count }, (_, index) => {
    const side = index % 4,
      along = random() * 100,
      x = side === 0 ? along : side === 1 ? 100 : side === 2 ? along : 0,
      y = side === 0 ? 0 : side === 1 ? along : side === 2 ? 100 : along,
      distance = 18 + random() * 26,
      angle = Math.atan2(y - 50, x - 50) + (random() - 0.5) * 0.9;
    return {
      key: index,
      style: [
        `left:${round(x)}%`,
        `top:${round(y)}%`,
        `--spark-x:${round(Math.cos(angle) * distance)}px`,
        `--spark-y:${round(Math.sin(angle) * distance)}px`,
        `--spark-delay:${Math.round(random() * 900)}ms`,
        `--spark-size:${round(3 + random() * 3)}px`,
      ].join(';'),
    };
  });
}

const CONFETTI_COLORS = ['#6ee7c5', '#f4d06f', '#b4a2ff', '#ff8fab', '#7cc6ff', '#ffffff'];
// Two cannons at the lower screen edges arc pieces up and inward, then they fall.
export function confettiPieces(perSide = 56) {
  const random = sequence(4211);
  return Array.from({ length: perSide * 2 }, (_, index) => {
    const left = index < perSide,
      direction = left ? 1 : -1,
      reach = 18 + random() * 46,
      rise = 38 + random() * 42,
      drift = reach + 6 + random() * 18;
    return {
      key: index,
      side: left ? 'left' : 'right',
      style: [
        `${left ? 'left' : 'right'}:-2vw`,
        `--confetti-color:${CONFETTI_COLORS[index % CONFETTI_COLORS.length]}`,
        `--confetti-peak-x:${round(direction * reach)}vw`,
        `--confetti-peak-y:${round(-rise)}vh`,
        `--confetti-end-x:${round(direction * drift)}vw`,
        `--confetti-end-y:${round(8 + random() * 20)}vh`,
        `--confetti-spin:${Math.round((random() - 0.5) * 1440)}deg`,
        `--confetti-delay:${Math.round(random() * 1200)}ms`,
        `--confetti-width:${round(5 + random() * 5)}px`,
        `--confetti-height:${round(8 + random() * 8)}px`,
      ].join(';'),
    };
  });
}
