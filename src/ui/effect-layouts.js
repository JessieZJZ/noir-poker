// Deterministic particle layouts and timings shared by Web, native and WeChat.
// Every platform renders the same elements with the same CSS custom
// properties, so the motion is identical without platform-specific physics.
export const PREMIUM_DELAY_MS = 1150;
export const PREMIUM_DURATION_MS = 2600;
export const REBUY_DURATION_MS = 1300;
export const CROWN_FLIGHT_MS = 2300;
export const CONFETTI_DURATION_MS = 3800;

function sequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const round = (value) => Math.round(value * 10) / 10;

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
        `--confetti-delay:${Math.round(random() * 700)}ms`,
        `--confetti-width:${round(5 + random() * 5)}px`,
        `--confetti-height:${round(8 + random() * 8)}px`,
      ].join(';'),
    };
  });
}
