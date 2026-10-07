// Synthetic table pacing, not measured timings or tells of named players.
// Accept only the actor's decision view; no full game, hidden rival cards or deck.
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const BOT_THINK_LIMITS = { minimum: 1200, maximum: 8000 };

export function botThinkingTime(decision, random = Math.random) {
  const t = decision.trace,
    v = t.view,
    legal = v.legal,
    draw = v.features.draw,
    raises = v.history.filter((a) => a.action === 'raise'),
    streetRaises = raises.filter((a) => a.street === v.street),
    lastRaiser = raises.at(-1)?.id;
  const roll = () => clamp(random());
  const priceCloseness =
    legal.toCall > 0 &&
    !(v.street === 0 && (t.affordableRangePassed ?? (t.cheapEntry && t.admitted)))
      ? clamp(1 - Math.abs(t.equity + t.callTolerance - t.odds - 0.02) / 0.16)
      : 0;
  const rangeCloseness = v.street === 0 ? clamp(1 - Math.abs(t.percentile - t.range) / 0.15) : 0;
  const closeness = Math.max(priceCloseness, rangeCloseness);
  const suits = [0, 1, 2, 3].map((s) => v.board.filter((c) => c.suit === s).length),
    paired = new Set(v.board.map((c) => c.rank)).size < v.board.length;
  const texture = clamp(
    (v.features.wet ? 0.45 : 0) +
      (draw ? 0.35 : 0) +
      (paired ? 0.15 : 0) +
      (Math.max(0, ...suits) >= 4 ? 0.35 : 0) +
      (v.features.overpair && v.features.wet ? 0.2 : 0),
  );
  const aggressionStreets = new Set(raises.filter((a) => a.id !== v.id).map((a) => a.street)).size;
  const lastAction = v.history.at(-1),
    checkRaise =
      lastAction?.action === 'raise' &&
      v.history.some(
        (a) => a.id === lastAction.id && a.street === v.street && a.action === 'check',
      );
  const route = clamp(
    streetRaises.length * 0.22 +
      Math.max(0, aggressionStreets - 1) * 0.2 +
      (checkRaise ? 0.25 : 0) +
      (streetRaises.some((a) => a.id === v.id) && legal.toCall > 0 ? 0.2 : 0),
  );
  const outOfPosition =
    v.street > 0 && typeof v.inPosition === 'boolean'
      ? !v.inPosition
      : ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ'].includes(v.position);
  const position = clamp((outOfPosition ? 0.3 : 0) + Math.max(0, v.rivals - 1) * 0.12);
  const callRisk = legal.callAmount / Math.max(1, v.stack),
    raiseRisk = decision.action === 'raise' ? (decision.amount - v.bet) / Math.max(1, v.stack) : 0;
  const remaining = Math.max(0, v.stack - legal.callAmount);
  // Exclude all-in rivals from remaining-stack planning, while they still count
  // in multiway complexity. A short all-in must not collapse all other SPRs.
  const liveStacks = (v.opponents || [])
    .filter((p) => !p.allin && p.stack > 0)
    .map((p) => Math.min(remaining, p.stack));
  const facingStack = (v.opponents || []).find(
    (p) => p.id === lastRaiser && !p.allin && p.stack > 0,
  )?.stack;
  const effective = Math.min(remaining, facingStack ?? Math.max(0, ...liveStacks)),
    spr = effective / Math.max(50, v.contestable);
  const commitment = clamp(
    Math.max(callRisk, raiseRisk) * 0.7 +
      (legal.toCall > 0 && spr < 2 ? 0.25 : 0) +
      (v.street > 0 && spr > 6 ? 0.2 : 0) +
      (v.stack <= 500 && legal.toCall > 0 ? 0.15 : 0),
  );
  const sizing =
    decision.action === 'raise'
      ? clamp((decision.amount - v.currentBet) / Math.max(50, v.pot + legal.callAmount))
      : 0;
  const routine =
    (decision.action === 'fold' && t.reason === 'outside-range' && rangeCloseness < 0.15) ||
    (decision.action === 'check' && t.reason === 'free-check' && !draw && !v.features.wet);
  const [width, attack, bluff, , trap] = t.axes.map((n) => n / 100);
  const styleTempo = 1 + (0.5 - attack) * 0.18 + trap * 0.08 + ((v.id % 5) - 2) * 0.04;
  const moodStrength = t.mode === 'off' ? 0 : t.mode === 'lively' ? 1 : 0.5;
  const mood =
    ({ cautious: 450, frustrated: -300, reactive: -220, confident: -140 }[t.mood.kind] || 0) *
    moodStrength *
    (0.5 + roll());
  // Acting is sampled for every hand strength and action. Never equate a long
  // pause with a bluff, or a quick action with strength.
  const actingChance = 0.12 + trap * 0.12 + bluff * 0.06 + width * 0.02;
  const actingRoll = roll(),
    acting = actingRoll < actingChance ? 'deliberate' : actingRoll > 0.91 ? 'quick' : 'neutral',
    actingMs = acting === 'deliberate' ? 400 + roll() * 1400 : acting === 'quick' ? -600 : 0;
  const base = 1300 + roll() * 1100 + roll() * 700;
  const complexity =
    closeness * 1400 +
    texture * 750 +
    route * 1050 +
    position * 550 +
    commitment * 1050 +
    sizing * 400 +
    (v.street >= 2 ? 350 : v.street === 1 ? 150 : 0);
  const durationMs = Math.round(
    clamp(
      (base + complexity - (routine ? 450 : 0)) * styleTempo + mood + actingMs,
      BOT_THINK_LIMITS.minimum,
      BOT_THINK_LIMITS.maximum,
    ),
  );
  return {
    durationMs,
    model: 'context-pacing-v1',
    acting,
    factors: {
      closeness,
      texture,
      route,
      position,
      commitment,
      sizing,
      effectiveStack: effective,
      spr,
    },
  };
}
