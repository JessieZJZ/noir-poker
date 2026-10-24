import { difficultyPolicy, hasBotSkill } from './bot-difficulty.js';
import { handFeatures as botBoardFeatures } from './hand-features.js';
import { decisionBasis, aggressionSupport } from './decision-basis.js';
export { handFeatures as botBoardFeatures } from './hand-features.js';
import { bigBlindOf, DEFAULT_STAKES } from './stakes.js';
import characters from '../data/characters.json' with { type: 'json' };
import { canonicalProfileId } from './profile-id.js';
import {
  botStyleContext,
  resolveBotStyle,
  valueRaiseSupported,
  safeStrongValue,
  expensiveWeakPair,
  checkedToPairValue,
  checkedThroughPairValue,
  valueBetCap,
  expensivePreflopDefense,
  checkedToPositionProbe,
} from './bot-style.js';
import { chipUnitOf, fractionRaiseTo, legalRaiseTo } from './bet-sizing.js';
import { deceptiveAction, isDonkLead } from './bot-deception.js';
import { publicResponseRisk } from './public-action-context.js';
import { preflopJamPlan } from './bot-preflop-commitment.js';

// Evidence-informed fictional training styles; numeric controls are authored.
export const BOT_PROFILES = [
  {
    id: 'balanced',
    name: '均衡',
    short: '均衡',
    tag: '稳定的基准对手',
    description: '中等范围、常规尺度，兼顾价值下注与少量诈唬。',
    axes: [50, 50, 40, 50, 20],
    sizing: [0.45, 0.8],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      unopenedRange: 0.8,
      firstInRaise: 0.98,
      potControl: 0.15,
      thinValue: 0.15,
      smallCbet: 0.55,
      valueAttack: 0.8,
    },
  },
  {
    id: 'rook',
    name: '大注强攻',
    short: '大注强攻',
    tag: '宽范围 · 后街大注',
    description: '更宽地参与底池，合适的后街偏向大尺度取值，并保留有依据的诈唬。',
    axes: [85, 96, 88, 62, 8],
    sizing: [0.65, 1.15],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      entry: 1.08,
      reraise: 1.05,
      blockerBluffs: true,
      barrel: 1.6,
      semiBluff: 0.22,
      riverBluff: 1.2,
      valueAttack: 0.9,
      streetSizing: [
        [0.6, 0.85],
        [0.9, 1.2],
        [0.95, 1.3],
      ],
    },
  },
  {
    id: 'jett',
    name: '宽松取值',
    short: '宽松取值',
    tag: '宽范围 · 大尺度搏杀',
    description: '更愿意低成本跟入，命中强牌后偏向大尺度价值下注。',
    axes: [96, 35, 25, 84, 8],
    sizing: [0.75, 1.25],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      entry: 1.24,
      reraise: 0.65,
      blockerBluffs: true,
      barrel: 0.8,
      riverBluff: 0.5,
      riverValue: 1.25,
      valueAttack: 0.8,
    },
  },
  {
    id: 'owen',
    name: '范围纪律',
    short: '范围纪律',
    tag: '范围纪律 · 分街尺度',
    description: '主动挑选适合进攻的起手牌，面对再加注时同时考虑继续成本与剩余筹码。',
    axes: [35, 80, 35, 48, 15],
    sizing: [0.33, 1.2],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      entry: 0.55,
      reraise: 1.1,
      blockerBluffs: true,
      adapt: 0.45,
      barrel: 1.05,
      streetSizing: [
        [0.5, 0.7],
        [0.7, 1],
        [0.8, 1.15],
      ],
      trapRate: 0.08,
      valueAttack: 0.9,
    },
  },
  {
    id: 'vale',
    name: '跟注诱导',
    short: '跟注诱导',
    tag: '低价跟入 · 选择性诱导',
    description: '更常用跟注进入便宜底池，安全强牌保留诱导，面对高成本仍会退出。',
    axes: [60, 45, 25, 46, 98],
    sizing: [0.45, 0.9],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      entry: 1.05,
      entryCall: 0.95,
      reraise: 0.8,
      blockerBluffs: true,
      trapRate: 0.9,
      topPairTrap: true,
      potControl: 0.5,
      barrel: 0.75,
      riverBluff: 0.5,
      riverValue: 1.15,
      valueAttack: 0.8,
    },
  },
  {
    id: 'nico',
    name: '小注控池',
    short: '小注控池',
    tag: '小尺度 · 控池',
    description: '较小尺度争夺底池，中等牌力保留过牌与薄价值。',
    axes: [55, 60, 30, 55, 10],
    sizing: [0.25, 0.45],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      entry: 1,
      reraise: 0.65,
      openingBB: 2,
      potControl: 0.9,
      thinValue: 0.8,
      smallCbet: 0.95,
      flopCbet: 0.3,
      barrel: 0.7,
      riverBluff: 0.35,
      valueAttack: 0.7,
      streetSizing: [
        [0.25, 0.4],
        [0.3, 0.45],
        [0.3, 0.5],
      ],
    },
  },
  {
    id: 'mira',
    name: '听牌施压',
    short: '听牌施压',
    tag: '选择性压迫 · 半诈唬',
    description: '有听牌权益时更积极，小翻牌下注之后可用大转牌下注继续施压。',
    axes: [58, 88, 78, 50, 12],
    sizing: [0.5, 1],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      entry: 0.92,
      reraise: 0.95,
      blockerBluffs: true,
      semiBluff: 0.95,
      barrel: 1,
      riverBluff: 0.35,
      flopCbet: 0.4,
      turnSemiBluff: 0.75,
      valueAttack: 0.8,
      streetSizing: [
        [0.35, 0.55],
        [0.6, 0.9],
        [0.6, 0.9],
      ],
    },
  },
  {
    id: 'iris',
    name: '后位争夺',
    short: '后位争夺',
    tag: '位置优先 · 择机争夺',
    description: '前位收紧、后位争夺盲注，有位置时保留小注与延迟进攻。',
    axes: [62, 70, 40, 65, 8],
    sizing: [0.4, 0.7],
    evidence: '电脑角色的策略和情绪均为游戏设定，介绍描述常见倾向，不保证每次采用相同操作。',
    sources: [],
    policy: {
      entry: 0.9,
      lateEntry: 1.6,
      earlyEntry: 0.65,
      lateOpenAttack: 0.98,
      firstInRaise: 0.98,
      isolation: 0.9,
      positionProbe: 0.8,
      reraise: 0.9,
      blockerBluffs: true,
      float: 0.95,
      delayed: 1.6,
      delayedProbe: 0.98,
      potControl: 0.2,
      barrel: 1,
      valueAttack: 0.8,
      streetSizing: [
        [0.3, 0.5],
        [0.45, 0.65],
        [0.45, 0.7],
      ],
    },
  },
].map((profile) => ({ ...profile, character: characters.characters[profile.id] }));
export const PROFILE_AXES = ['入池宽度', '进攻倾向', '诈唬倾向', '跟到底倾向', '强牌诱导'];
export const EMOTION_MODES = { off: '关闭', subtle: '轻微波动', lively: '明显波动' };
export const MOOD_LABELS = {
  steady: '平稳',
  frustrated: '急于追回',
  cautious: '收紧避险',
  confident: '连胜自信',
  reactive: '受压反击',
};
export const getBotProfile = (id) =>
  BOT_PROFILES.find((p) => p.id === canonicalProfileId(id)) || BOT_PROFILES[0];
export const defaultBotSettings = () => ({
  emotionMode: 'subtle',
  assignments: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, 'balanced'])),
  mixed: false,
  mixedSeats: [],
});
export function sanitizeBotSettings(value) {
  const settings = defaultBotSettings();
  if (value && Object.hasOwn(EMOTION_MODES, value.emotionMode))
    settings.emotionMode = value.emotionMode;
  for (let id = 1; id <= 8; id++) {
    const profile = canonicalProfileId(value?.assignments?.[id]);
    if (BOT_PROFILES.some((p) => p.id === profile)) settings.assignments[id] = profile;
  }
  settings.mixed = value?.mixed === true;
  settings.mixedSeats = settings.mixed
    ? [...new Set(Array.isArray(value?.mixedSeats) ? value.mixedSeats : [])].filter(
        (id) => Number.isInteger(id) && id >= 1 && id <= 8,
      )
    : [];
  return settings;
}

// Manual selections take ownership, including reselecting the same style.
export function assignBotSeat(value, id, profileId) {
  const settings = sanitizeBotSettings(value);
  profileId = canonicalProfileId(profileId);
  if (id < 1 || id > 8 || !Number.isInteger(id) || !BOT_PROFILES.some((p) => p.id === profileId))
    return settings;
  settings.assignments[id] = profileId;
  settings.mixedSeats = settings.mixedSeats.filter((seat) => seat !== id);
  return settings;
}
export function toggleMixedLineup(value, count = 9, random = Math.random) {
  const settings = sanitizeBotSettings(value);
  if (settings.mixed) {
    for (const id of settings.mixedSeats) settings.assignments[id] = 'balanced';
    settings.mixed = false;
    settings.mixedSeats = [];
    return settings;
  }
  settings.mixed = true;
  const styles = BOT_PROFILES.map((p) => p.id);
  let available = [...styles];
  for (let id = 1; id < Math.min(9, count); id++) {
    if (settings.assignments[id] !== 'balanced') continue;
    if (!available.length) available = [...styles];
    const index = Math.min(
      available.length - 1,
      Math.max(0, Math.floor(random() * available.length)),
    );
    settings.assignments[id] = available.splice(index, 1)[0];
    settings.mixedSeats.push(id);
  }
  return settings;
}
export const freshBotMood = () => ({
  kind: 'steady',
  remaining: 0,
  cooldown: 0,
  reason: '',
  losses: 0,
  wins: 0,
  pressureFolds: {},
});
export const freshBotStats = () => ({
  hands: 0,
  vpip: 0,
  pfr: 0,
  threeBetOpportunities: 0,
  threeBets: 0,
  facedThreeBets: 0,
  foldsToThreeBet: 0,
  postActions: 0,
  postRaises: 0,
  postCalls: 0,
});
export function decayBotMood(mood) {
  mood.cooldown = Math.max(0, mood.cooldown - 1);
  mood.remaining = Math.max(0, mood.remaining - 1);
  if (!mood.remaining) {
    mood.kind = 'steady';
    mood.reason = '';
  }
}
function setMood(mood, kind, reason) {
  mood.kind = kind;
  mood.reason = reason;
  mood.remaining = 3;
  mood.cooldown = 4;
  return { kind, reason };
}
export function recordPressureFold(mood, raiser, mode) {
  if (raiser == null || mode === 'off') return null;
  if (mood.lastPressureRaiser !== raiser) mood.pressureFolds = {};
  mood.lastPressureRaiser = raiser;
  mood.pressureFolds[raiser] = (mood.pressureFolds[raiser] || 0) + 1;
  if (mood.pressureFolds[raiser] >= 3 && !mood.cooldown) {
    mood.pressureFolds[raiser] = 0;
    return setMood(mood, 'reactive', '连续三手面对同一对手加注后弃牌');
  }
  return null;
}
export function finishBotHand(player, profit, mode, bigBlind = DEFAULT_STAKES.bigBlind) {
  const mood = player.botMood;
  mood.losses = profit <= -5 * bigBlind ? mood.losses + 1 : 0;
  mood.wins = profit >= 5 * bigBlind ? mood.wins + 1 : 0;
  if (mode === 'off' || mood.cooldown) return null;
  // Both reactions are synthetic; no emotional trait is assigned to a person.
  if (profit <= -25 * bigBlind || mood.losses >= 3)
    return setMood(
      mood,
      player.id % 2 ? 'frustrated' : 'cautious',
      profit <= -25 * bigBlind ? '单手净损失至少 25 BB' : '连续三手各净损失至少 5 BB',
    );
  if (mood.wins >= 2 && profit >= 10 * bigBlind)
    return setMood(mood, 'confident', '连续两手盈利，本手净赢至少 10 BB');
  return null;
}

// A simple, deterministic starting-hand ordering, weighted by the 1,326 actual
// combinations. This is a range-selection heuristic, not an equity table.
function startingValue(hole) {
  const [high, low] = hole.map((c) => c.rank).sort((a, b) => b - a);
  if (high === low) return 30 + high * 2;
  const suited = hole[0].suit === hole[1].suit,
    gap = high - low;
  return (
    high * 1.9 +
    low * 0.9 +
    (suited ? 4 : 0) +
    (gap === 1 ? 3 : gap === 2 ? 1 : 0) +
    (high === 14 ? 3 : 0)
  );
}
const combinations = [];
for (let a = 0; a < 52; a++)
  for (let b = a + 1; b < 52; b++)
    combinations.push(
      startingValue([a, b].map((v) => ({ rank: (v % 13) + 2, suit: Math.floor(v / 13) }))),
    );
export const startingPercentile = (hole) =>
  combinations.filter((v) => v > startingValue(hole)).length / combinations.length;

export function effectiveBotAxes(profile, mood, mode) {
  const axes = [...profile.axes],
    strength = mode === 'off' ? 0 : mode === 'lively' ? 1 : 0.5;
  const offsets = {
    frustrated: [14, 12, 10, 15, -10],
    cautious: [-14, -12, -12, -16, 5],
    confident: [8, 10, 5, 8, -5],
    reactive: [5, 16, 14, 4, -8],
    steady: [0, 0, 0, 0, 0],
  }[mood?.kind] || [0, 0, 0, 0, 0];
  return axes.map((v, i) => Math.max(0, Math.min(100, v + offsets[i] * strength)));
}

// No complete game object is accepted: the caller supplies a white-listed view.
export function chooseBotAction(view, profile, mood, mode, random = Math.random) {
  const bigBlind = bigBlindOf(view);
  const legal = view.legal;
  if (!legal.enabled) throw Error('机器人当前不能行动。');
  const capability = difficultyPolicy(view.difficulty);
  const style = resolveBotStyle(profile);
  if (!hasBotSkill(view.difficulty, 'float')) style.float = 0;
  if (!hasBotSkill(view.difficulty, 'thin-value')) style.thinValue = 0;
  if (!hasBotSkill(view.difficulty, 'pot-control')) style.potControl = 0;
  if (!hasBotSkill(view.difficulty, 'cbet')) style.smallCbet = 0;
  if (!hasBotSkill(view.difficulty, 'blocker-bluff')) style.blockerBluffs = false;
  const context = botStyleContext(view, style);
  const axes = effectiveBotAxes(profile, mood, mode);
  const [width, attack, bluff, callDown, trap] = axes.map((n) => n / 100);
  const checks = [],
    exceptions = [];
  const roll = (code, threshold) => {
    const value = random();
    checks.push({
      code,
      value,
      threshold,
      selected: ['outside-range', 'insufficient-equity', 'stack-pressure'].includes(code)
        ? value <= threshold
        : value < threshold,
    });
    return value;
  };
  const percentile = startingPercentile(view.hole),
    odds =
      view.allIn?.odds ?? view.callPrice?.odds ?? legal.callAmount / Math.max(1, view.contestable),
    pressure = legal.toCall / Math.max(1, view.stack + view.bet);
  const noiseDraw = random();
  const noise =
    view.street === 0 && view.allIn && view.difficulty !== 'easy'
      ? 0
      : (noiseDraw - 0.5) * capability.noise;
  const equity = Math.max(0, Math.min(1, view.equity + noise));
  const behind = view.actionContext?.unactedBehindCount,
    responseRisk = publicResponseRisk(view),
    assumedOpponents = view.publicEquity?.assumedOpponentIds.length ?? view.rivals;
  const positionScale =
    view.position === 'BTN'
      ? 1.35
      : view.position === 'CO'
        ? 1.18
        : ['SB', 'BB'].includes(view.position)
          ? 1.05
          : view.position === 'HJ'
            ? 0.95
            : 0.75;
  const raises = view.history.filter((a) => a.street === view.street && a.action === 'raise');
  const entryScale =
    style.entry *
    (hasBotSkill(view.difficulty, 'position')
      ? ['BTN', 'CO'].includes(view.position)
        ? (style.lateEntry ?? 1)
        : !['SB', 'BB', 'HJ'].includes(view.position)
          ? (style.earlyEntry ?? 1)
          : 1
      : 1);
  const baseRange =
    (0.16 + width * 0.42) *
    positionScale *
    (view.count >= 8 ? 0.9 : 1) *
    (behind == null ? 1 : Math.max(0.75, 1 - behind * 0.04)) *
    entryScale *
    capability.entry *
    (view.count <= 6 ? style.shortTable : 1);
  let range = baseRange;
  if (raises.length) range *= raises.length === 1 ? 0.68 : 0.42;
  if (view.position === 'BB' && legal.toCall <= bigBlind) range += 0.1;
  const openingRange = range;
  const preflopHistory = view.history.filter((a) => a.street === 0);
  const firstOpen = preflopHistory.findIndex((a) => a.action === 'raise');
  const callers = (history) =>
    new Set(
      history
        .filter(
          (a) =>
            a.action === 'call' &&
            a.amount > 0 &&
            a.id !== view.id &&
            a.id !== preflopHistory[firstOpen]?.id &&
            view.opponents?.some((p) => p.id === a.id),
        )
        .map((a) => a.id),
    ).size;
  const limpers = callers(preflopHistory.slice(0, firstOpen < 0 ? undefined : firstOpen));
  const openCallers = firstOpen < 0 ? 0 : callers(preflopHistory.slice(firstOpen + 1));
  const [high, low] = view.hole.map((c) => c.rank).sort((a, b) => b - a);
  const suited = view.hole[0].suit === view.hole[1].suit;
  const pair = high === low;
  const speculative = pair || (suited && (high === 14 || (high - low <= 2 && low >= 4)));
  const suitedHigh = suited && high >= 11 && low >= 7;
  const lastRaiser = view.opponents?.find((p) => p.id === raises.at(-1)?.id);
  const effectiveBehind = Math.max(
    0,
    Math.min(view.stack - legal.callAmount, lastRaiser?.stack ?? 0),
  );
  const lowCommitment = pressure <= 0.08 && legal.callAmount < view.stack;
  // An earlier short all-in does not turn a deep player's later small side-pot
  // bet into an all-in price. Match the live aggressor/calling commitment.
  const allInPressure =
    !!view.allIn ||
    !!lastRaiser?.allin ||
    (!lastRaiser && (view.opponents?.some((p) => p.allin) || false)) ||
    (legal.callAmount > 0 && legal.callAmount >= view.stack);
  const cheapEntry =
    view.street === 0 &&
    !raises.length &&
    view.currentBet <= bigBlind &&
    legal.toCall <= bigBlind &&
    lowCommitment &&
    !allInPressure;
  // Small single opens are a different price from 3-bets and shoves. This
  // bounded calling branch does not compare an all-players showdown estimate
  // with today's price before anyone behind has actually entered the pot.
  const affordableOpen =
    view.street === 0 &&
    Boolean(lastRaiser) &&
    raises.length === 1 &&
    raises[0].id !== view.id &&
    legal.toCall > 0 &&
    view.currentBet <= 4 * bigBlind &&
    legal.callAmount <= 4 * bigBlind &&
    lowCommitment &&
    !allInPressure &&
    effectiveBehind >= Math.max(20 * bigBlind, legal.callAmount * 15);
  // Normal/hard opponents distinguish a cheap 3-bet from a large re-raise.
  // A random showdown against every unfurled seat undervalues a priced call:
  // players still to act have not all committed to this pot. This range gate
  // uses public sizing/position and our hand only, never the raiser's cards.
  const affordableThreeBet =
    view.difficulty !== 'easy' &&
    view.street === 0 &&
    raises.length === 2 &&
    Boolean(lastRaiser) &&
    raises[1].id !== view.id &&
    view.currentBet <= 10 * bigBlind &&
    view.currentBet <= raises[0].amount * 3 &&
    legal.callAmount <= 7 * bigBlind &&
    pressure <= 0.1 &&
    odds <= 0.28 &&
    !allInPressure &&
    legal.callAmount < view.stack &&
    effectiveBehind >= Math.max(20 * bigBlind, legal.callAmount * 8);
  if (cheapEntry)
    range +=
      (0.14 + width * 0.2 + (speculative || suitedHigh ? Math.min(2, limpers) * 0.04 : 0)) *
      entryScale;
  if (cheapEntry && speculative && ['BTN', 'CO', 'HJ'].includes(view.position))
    range += (0.06 + width * 0.12) * entryScale;
  // A first-in opening uses its position range, not the extra discount meant
  // for a cheap multiway overcall. This keeps a conventional baseline from
  // repeatedly limping hands it would not choose to open.
  if (
    cheapEntry &&
    !limpers &&
    style.firstInRaise > 0 &&
    view.difficulty !== 'easy' &&
    view.stack + view.bet >= 30 * bigBlind
  )
    range = openingRange * style.unopenedRange;
  if (affordableOpen) {
    const priceScale = Math.max(0.65, 1.1 - (view.currentBet / bigBlind) * 0.08);
    const playability = speculative ? 0.14 : suitedHigh ? 0.07 : 0;
    const callerBonus = speculative || suitedHigh ? Math.min(2, openCallers) * 0.04 : 0;
    const blindDiscount = view.position === 'BB' ? 0.08 : 0;
    const dominatedAce = !suited && high === 14 && low <= 8 ? 0.08 : 0;
    range =
      baseRange * priceScale +
      (0.12 + width * 0.18) * entryScale +
      playability +
      callerBonus +
      blindDiscount -
      dominatedAce;
  }
  if (affordableThreeBet) {
    const priceScale = Math.max(0.55, 1.15 - view.currentBet / (20 * bigBlind));
    const committed = view.bet >= raises[0].amount;
    const broadway = high >= 13 && low >= 11;
    const playable = broadway || (pair && high >= 7) || (suited && high >= 11 && low >= 9);
    range = Math.max(
      range,
      (0.09 + width * 0.2) * entryScale * positionScale * priceScale +
        (committed ? 0.05 : 0) +
        (playable ? 0.055 : 0),
    );
  }
  range = Math.min(0.95, range);
  // Entering a pot is not automatically a reason to raise again. Separate the
  // value re-raising candidates so ordinary calls do not start a raise cascade.
  const raiseRange = raises.length
    ? Math.min(
        openingRange,
        (0.035 + width * 0.085) *
          style.reraise *
          capability.reraise *
          (raises.length === 1 ? 1 : 0.58) *
          (['BTN', 'CO'].includes(view.position) ? 1.15 : 1),
      )
    : openingRange;
  // The heuristic percentile ranks small pairs too highly to define a
  // premium stack-off tier. Keep the range ordering and premium tier separate.
  const premium = (pair && high >= 11) || (high === 14 && low === 13),
    admitted = percentile <= range,
    openingAdmitted = percentile <= openingRange,
    callTolerance = (callDown - 0.5) * 0.1 + context.publicAdjustment,
    requiredEquity = view.allIn ? odds + view.allIn.pendingBuffer : odds + responseRisk + 0.02,
    affordableRangePassed = (cheapEntry || affordableOpen || affordableThreeBet) && admitted;
  let sizing = null,
    deception = null,
    value = false,
    semiBluff = false,
    pureBluff = false,
    smallCbet = false,
    thinValue = false,
    positionProbe = false;
  const floatContinue = context.floatCandidate && roll('float', style.float) < style.float;
  const headsUp = assumedOpponents === 1,
    features = view.features,
    support = aggressionSupport({ ...view, equity });
  const structuredPriceContinue =
    !!view.publicEquity &&
    view.street > 0 &&
    !allInPressure &&
    (features.ownMade || features.draw) &&
    equity + callTolerance >= requiredEquity;
  const ownLastRaise =
    [...view.history].reverse().find((a) => a.action === 'raise')?.id === view.id;
  const barrelScale = view.street === 2 && ownLastRaise ? style.barrel : 1;
  // Candidate completion cards are not clean winning outs. Discount them on
  // paired/multiway boards, and only preserve calls at a small current price.
  const drawChance =
    ((features.drawOuts ?? Math.max(features.flushDraw ? 9 : 0, features.straightOuts || 0)) /
      Math.max(1, 52 - view.hole.length - view.board.length)) *
    (features.pairedBoard ? 0.7 : 0.9) *
    (view.rivals > 2 ? 0.75 : 1);
  const nearAllInDraw =
    view.street > 0 &&
    view.street < 3 &&
    features.draw &&
    features.drawOuts > 0 &&
    legal.callAmount > 0 &&
    legal.callAmount < view.stack &&
    view.stack - legal.callAmount <= chipUnitOf(legal) &&
    view.stack / Math.max(1, view.contestable) <= drawChance;
  const drawContinue =
    view.street > 0 &&
    view.street < 3 &&
    features.draw &&
    !allInPressure &&
    (lowCommitment || nearAllInDraw) &&
    odds <= drawChance &&
    legal.callAmount < view.stack;
  const pairContinue =
    view.street > 0 &&
    features.ownPair &&
    view.rivals <= 2 &&
    !allInPressure &&
    lowCommitment &&
    odds <= 0.18 &&
    equity + callTolerance >= odds - 0.06 &&
    roll('price-continue', (view.difficulty === 'easy' ? 0.12 : 0.38) + callDown * 0.36) <
      (view.difficulty === 'easy' ? 0.12 : 0.38) + callDown * 0.36;
  const semiThreshold = Math.min(
    0.95,
    (style.semiBluff ?? 0.16 + bluff * 0.42) * (headsUp ? 1 : 0.55) * barrelScale,
  );
  semiBluff =
    hasBotSkill(view.difficulty, 'semi-bluff') &&
    legal.canRaise &&
    view.street > 0 &&
    view.street < 3 &&
    features.draw &&
    view.rivals <= 2 &&
    raises.length <= 1 &&
    !allInPressure &&
    pressure <= 0.12 &&
    (legal.canCheck || drawContinue || equity + callTolerance >= odds + 0.02) &&
    roll('semi-bluff', semiThreshold) < semiThreshold;
  const lateSteal =
    hasBotSkill(view.difficulty, 'position') &&
    cheapEntry &&
    !limpers &&
    ['BTN', 'CO'].includes(view.position) &&
    admitted &&
    (speculative || suitedHigh || (suited && low >= 5) || (high - low === 1 && low >= 6)) &&
    roll('pure-bluff', (0.12 + bluff * 0.2 + attack * 0.1) * entryScale) <
      (0.12 + bluff * 0.2 + attack * 0.1) * entryScale;
  const story = view.street > 0 && (ownLastRaise || !features.wet || context.delayed);
  const lateReraise =
    hasBotSkill(view.difficulty, 'light-reraise') &&
    affordableOpen &&
    !openCallers &&
    ['BTN', 'CO'].includes(view.position) &&
    context.preflopBlocker &&
    admitted &&
    roll('pure-bluff', 0.03 + bluff * 0.1) < 0.03 + bluff * 0.1;
  const squeezeBluff =
    hasBotSkill(view.difficulty, 'squeeze') &&
    affordableOpen &&
    openCallers === 1 &&
    ['BTN', 'CO'].includes(view.position) &&
    context.preflopBlocker &&
    admitted &&
    (view.actionContext?.pendingResponseCount ?? view.rivals) <= 3 &&
    equity + callTolerance >= requiredEquity &&
    roll('squeeze', 0.02 + bluff * 0.06) < 0.02 + bluff * 0.06;
  const blockerAllowed = !style.blockerBluffs || view.street !== 3 || context.riverBlocker;
  const bluffThreshold = Math.min(
    0.28,
    (0.025 + bluff * 0.2) *
      (headsUp ? 1 : 0.35) *
      barrelScale *
      (view.street === 3
        ? style.riverBluff * (legal.toCall > 0 && odds <= 0.2 ? style.riverProbe : 1)
        : 1) *
      (context.delayed ? style.delayed : 1),
  );
  pureBluff =
    legal.canRaise &&
    (lateSteal ||
      lateReraise ||
      squeezeBluff ||
      (hasBotSkill(view.difficulty, 'blocker-bluff') &&
        view.street > 0 &&
        !(view.difficulty !== 'easy' && high === 7 && low === 2) &&
        !view.playsBoard &&
        support.bluffCandidate &&
        support.mayBluff &&
        view.rivals <= 2 &&
        story &&
        blockerAllowed &&
        !floatContinue &&
        !allInPressure &&
        pressure <= 0.08 &&
        (legal.canCheck || odds <= 0.2) &&
        raises.length <= 1 &&
        roll('pure-bluff', bluffThreshold) < bluffThreshold));
  // A priced flop float can turn into a modest stab after a public check.
  // Keep the same own-hand, price, texture and no-all-in protections. This
  // authored preference is not evidence of a particular opponent's weakness.
  if (
    style.delayedProbe > 0 &&
    hasBotSkill(view.difficulty, 'float') &&
    context.delayed &&
    headsUp &&
    legal.canRaise &&
    legal.canCheck &&
    !features.wet &&
    !view.playsBoard &&
    support.bluffCandidate &&
    support.mayBluff &&
    equity >= 0.15 &&
    !allInPressure &&
    roll('pure-bluff', style.delayedProbe) < style.delayedProbe
  )
    pureBluff = true;
  if (
    style.positionProbe > 0 &&
    hasBotSkill(view.difficulty, 'float') &&
    checkedToPositionProbe(view) &&
    roll('position-probe', style.positionProbe) < style.positionProbe
  ) {
    pureBluff = true;
    positionProbe = true;
  }
  const finish = (action, reason, amount) => ({
    action,
    ...(amount === undefined ? {} : { amount }),
    trace: {
      difficulty: view.difficulty,
      skills: [...capability.skills],
      basis: decisionBasis(view, {
        action,
        reason,
        amount,
        value,
        semiBluff,
        pureBluff,
        drawContinue,
        pairContinue,
        structuredPriceContinue,
        exceptions,
      }),
      reason,
      profile: profile.id,
      profileName: profile.name,
      mode,
      mood: { kind: mood?.kind || 'steady', reason: mood?.reason || '' },
      axes,
      baseAxes: [...profile.axes],
      equityModel: view.allIn
        ? view.allIn.isAllIn === false
          ? 'public-commitment-ranges'
          : 'public-all-in-ranges'
        : (view.publicEquity?.model ?? 'random-opponents'),
      trials: view.equityTrials || (view.difficulty === 'hard' ? 52 : 28),
      rawEquity: view.equity,
      noise,
      equity,
      odds,
      requiredEquity,
      responseRisk,
      assumedOpponents,
      actionContext: view.actionContext || null,
      structuredPriceContinue,
      allIn: view.allIn || null,
      pressure,
      percentile,
      range,
      openingRange,
      raiseRange,
      cheapEntry,
      cheapRangePassed: cheapEntry && admitted,
      affordableOpen,
      affordableThreeBet,
      affordableRangePassed,
      entryContext: { limpers, openCallers, effectiveBehind, speculative, suitedHigh },
      premium,
      admitted,
      callTolerance,
      checks,
      exceptions,
      sizing,
      deception,
      style: { controls: style, context, floatContinue, smallCbet, thinValue, positionProbe },
      value,
      semiBluff,
      pureBluff,
      draw: view.features.draw,
      drawChance,
      nearAllInDraw,
      drawContinue,
      pairContinue,
      lateSteal,
      lateReraise,
      squeezeBluff,
      playsBoard: view.playsBoard,
    },
  });
  const jamPlan = preflopJamPlan(view, profile);
  const valueJam = () => {
    if (!jamPlan || equity + callTolerance < requiredEquity) return null;
    if (roll('preflop-value-jam', jamPlan.rate) >= jamPlan.rate) return null;
    value = true;
    sizing = {
      desired: jamPlan.amount,
      actual: jamPlan.amount,
      minimum: legal.minRaiseTo,
      maximum: legal.maxRaiseTo,
      opening: !raises.length,
      executed: true,
      commitment: jamPlan,
    };
    return finish('raise', 'value-raise', jamPlan.amount);
  };
  if (!view.allIn) {
    const jam = valueJam();
    if (jam) return jam;
  }
  const special = deceptiveAction(view, profile, roll);
  if (special) {
    sizing = special.sizing;
    deception = special.deception;
    value = special.kind === 'value';
    semiBluff = special.kind === 'semi-bluff';
    pureBluff = special.kind === 'bluff';
    return finish(special.action, special.reason, special.amount);
  }
  if (view.allIn) {
    // A pocket-pair/high-card admission tier is not a licence to call every
    // shove or large re-raise. Compare additional risk and public-line ranges. Seats
    // still deciding add a small risk buffer instead of eight random hands.
    // The sampled range already prices the exposed money. Pending responses
    // have their own buffer; adding another fixed margin systematically folds
    // profitable but close strong-hand calls, especially against open shoves.
    const required = requiredEquity;
    const lockedRiver =
      view.allIn.unbeatableRiver && view.allIn.guaranteedReturn >= view.allIn.cost;
    if (!lockedRiver && equity + callTolerance < required) {
      const close = required - equity - callTolerance <= 0.12;
      const mistake = view.difficulty === 'easy' && close ? 0.025 + callDown * 0.04 : 0;
      if (!mistake || roll('insufficient-equity', mistake) > mistake)
        return finish('fold', 'insufficient-equity');
      exceptions.push('insufficient-equity');
    }
    // A large non-all-in raise still leaves an opponent able to pay a value
    // shove. Actual all-ins cannot manufacture a discretionary side-pot raise.
    const jam = valueJam();
    if (jam) return jam;
    return finish('call', exceptions.length ? 'loose-exception' : 'price-continue');
  }
  if (expensivePreflopDefense(view, equity)) return finish('fold', 'outside-range');
  if (expensiveWeakPair(view, equity)) return finish('fold', 'stack-pressure');
  if (legal.toCall > 0) {
    if (view.street === 0 && !admitted && !premium && odds > 0.09) {
      if (roll('outside-range', 0.06 * width) > 0.06 * width)
        return finish('fold', 'outside-range');
      exceptions.push('outside-range');
    }
    if (
      (!premium || view.street > 0 || view.publicEquity) &&
      !affordableRangePassed &&
      !floatContinue &&
      !drawContinue &&
      !pairContinue &&
      !structuredPriceContinue &&
      !semiBluff &&
      !pureBluff
    ) {
      if (equity + callTolerance < (view.publicEquity ? requiredEquity : odds + 0.02)) {
        const mistake =
          view.difficulty === 'easy'
            ? 0.03 + callDown * 0.1
            : view.difficulty === 'normal' && requiredEquity - equity - callTolerance <= 0.04
              ? 0.02
              : 0;
        if (!mistake || roll('insufficient-equity', mistake) > mistake)
          return finish('fold', 'insufficient-equity');
        exceptions.push('insufficient-equity');
      }
      if (pressure > 0.4 && equity + callTolerance < (view.street === 0 ? 0.38 : 0.32)) {
        const mistake = view.difficulty === 'easy' ? 0.03 + callDown * 0.07 : 0;
        if (!mistake || roll('stack-pressure', mistake) > mistake)
          return finish('fold', 'stack-pressure');
        exceptions.push('stack-pressure');
      }
    }
  }
  if (!legal.canRaise)
    return finish(
      legal.canCheck ? 'check' : 'call',
      legal.canCheck
        ? 'free-check'
        : floatContinue
          ? 'float-continue'
          : exceptions.length
            ? 'loose-exception'
            : cheapEntry && admitted
              ? 'affordable-entry'
              : affordableOpen && admitted
                ? 'affordable-open'
                : affordableThreeBet && admitted
                  ? 'small-reraise-continue'
                  : premium && view.street === 0
                    ? 'premium-continue'
                    : 'price-continue',
    );
  if (
    style.entryCall > 0 &&
    cheapEntry &&
    admitted &&
    !premium &&
    legal.callAmount > 0 &&
    roll('entry-call', style.entryCall) < style.entryCall
  )
    return finish('call', 'affordable-entry');
  value =
    view.street === 0
      ? (raises.length < 2 || (pair && high >= 12) || (high === 14 && low === 13)) &&
        (premium || percentile <= raiseRange)
      : valueRaiseSupported(view, equity) &&
        ((support.valueCandidate &&
          equity > (headsUp ? 0.53 : Math.max(0.62, 1 / (view.rivals + 1) + 0.23))) ||
          safeStrongValue(view, equity) ||
          checkedToPairValue(view, equity) ||
          checkedThroughPairValue(view, equity));
  // First-in and isolation are different from cold re-raises. Keep the
  // existing admission, commitment and all-in gates. Isolation additionally
  // needs a playable holding, late position and no more than two limpers.
  const firstIn =
    cheapEntry &&
    !limpers &&
    admitted &&
    style.firstInRaise > 0 &&
    view.difficulty !== 'easy' &&
    view.stack + view.bet >= 30 * bigBlind;
  const isolation =
    cheapEntry &&
    limpers > 0 &&
    limpers <= 2 &&
    ['BTN', 'CO'].includes(view.position) &&
    (behind == null || behind <= 3) &&
    admitted &&
    percentile <= Math.min(openingRange, 0.5) &&
    ((pair && high >= 5) ||
      (suited && (high === 14 || (low >= 7 && high - low <= 2))) ||
      (high >= 12 && low >= 10)) &&
    style.isolation > 0 &&
    hasBotSkill(view.difficulty, 'position') &&
    view.stack + view.bet >= 40 * bigBlind;
  if (firstIn || isolation) {
    const threshold = firstIn ? style.firstInRaise : style.isolation;
    if (roll(firstIn ? 'first-in' : 'position-isolation', threshold) < threshold) {
      const desired = ((firstIn ? 2.5 : 3.5) + limpers) * bigBlind;
      const amount = legalRaiseTo(desired, legal);
      if (
        amount < legal.maxRaiseTo &&
        amount - view.bet <= (view.stack + (view.total || 0)) * 0.15
      ) {
        sizing = {
          fraction: (amount - view.currentBet) / Math.max(1, view.pot + legal.callAmount),
          desired,
          actual: amount,
          minimum: legal.minRaiseTo,
          maximum: legal.maxRaiseTo,
          opening: true,
          executed: true,
        };
        if (!value) pureBluff = true;
        return finish('raise', value ? 'value-raise' : 'pure-bluff', amount);
      }
    }
  }
  thinValue =
    style.thinValue > 0 &&
    view.street === 3 &&
    headsUp &&
    view.inPosition &&
    legal.canCheck &&
    features.ownMade &&
    !view.playsBoard &&
    !features.wet &&
    equity >= 0.5 &&
    equity <= 0.6 &&
    roll('thin-value', style.thinValue) < style.thinValue;
  smallCbet =
    style.smallCbet > 0 &&
    headsUp &&
    legal.canCheck &&
    context.initiative &&
    context.highDryFlop &&
    equity >= 0.28 &&
    !view.playsBoard &&
    roll('small-cbet', style.smallCbet) < style.smallCbet;
  if (
    style.potControl > 0 &&
    !smallCbet &&
    view.street > 0 &&
    view.street < 3 &&
    headsUp &&
    legal.canCheck &&
    !features.wet &&
    !features.draw &&
    equity >= 0.4 &&
    equity <= 0.65 &&
    roll('pot-control', style.potControl) < style.potControl
  )
    return finish('check', 'pot-control');
  if (
    hasBotSkill(view.difficulty, 'trap') &&
    style.trapRate == null &&
    value &&
    headsUp &&
    features.strongMade &&
    view.street > 0 &&
    legal.canCheck &&
    !features.wet &&
    equity > 0.65 &&
    (view.street < 3 ||
      (!view.inPosition &&
        view.opponents?.some((p) => !p.allin && p.stack > 0) &&
        view.opponents.every(
          (p) => !view.history.some((a) => a.street === view.street && a.id === p.id),
        ))) &&
    roll('trap', trap * 0.52) < trap * 0.52
  )
    return finish('check', 'trap');
  const pairValue =
    value && (checkedToPairValue(view, equity) || checkedThroughPairValue(view, equity));
  let attackRate =
    value && view.street === 0 && premium
      ? Math.max(0.92, (0.2 + attack * 0.72) * capability.attack)
      : value && view.street === 0 && profile.id === 'balanced' && !raises.length
        ? Math.max(0.75, (0.2 + attack * 0.72) * capability.attack)
        : value && safeStrongValue(view, equity)
          ? Math.max(0.88, (0.2 + attack * 0.72) * capability.attack)
          : pairValue
            ? Math.max(0.75, (0.2 + attack * 0.72) * capability.attack)
            : (0.2 + attack * 0.72) * capability.attack;
  if (value && view.street > 0) attackRate = Math.max(attackRate, style.valueAttack);
  if (positionProbe) attackRate = Math.max(attackRate, style.positionProbe);
  if (
    value &&
    cheapEntry &&
    !limpers &&
    hasBotSkill(view.difficulty, 'position') &&
    ['BTN', 'CO'].includes(view.position)
  )
    attackRate = Math.max(attackRate, style.lateOpenAttack ?? 0);
  if (
    (!isDonkLead(view) || hasBotSkill(view.difficulty, 'donk')) &&
    (value || semiBluff || pureBluff || smallCbet || thinValue) &&
    roll('attack', attackRate) < attackRate
  ) {
    const interval = style.streetSizing?.[view.street - 1] || profile.sizing;
    let fraction = interval[0] + random() * (interval[1] - interval[0]);
    if (view.street === 1 && ownLastRaise && style.flopCbet != null) fraction = style.flopCbet;
    if (view.street === 2 && semiBluff && style.turnSemiBluff != null)
      fraction = style.turnSemiBluff;
    if (smallCbet) fraction = style.flopCbet ?? interval[0];
    if (positionProbe && !value && !semiBluff) fraction = Math.min(fraction, 0.5);
    if (thinValue) fraction = Math.min(fraction, 0.5);
    if (view.street === 3 && value && equity > 0.7) fraction *= style.riverValue;
    if (mode !== 'off' && ['frustrated', 'confident', 'reactive'].includes(mood.kind))
      fraction *= mode === 'lively' ? 1.2 : 1.1;
    if (view.street > 0 && value) fraction = Math.min(fraction, valueBetCap(view));
    if (pairValue) fraction = Math.min(fraction, view.rivals >= 3 ? 0.35 : 0.4);
    let desired = fractionRaiseTo(
      {
        currentBet: view.currentBet,
        pot: view.pot,
        callAmount: legal.callAmount,
        chipUnit: legal.chipUnit,
      },
      fraction,
    );
    if (view.street === 0 && !raises.length)
      desired =
        (style.openingBB == null ? 2.5 + (attack > 0.8 ? 0.5 : 0) : style.openingBB) * bigBlind +
        view.history.filter((a) => a.street === 0 && a.action === 'call').length * bigBlind;
    if (squeezeBluff) desired = Math.max(desired, view.currentBet * (view.inPosition ? 4 : 5));
    if (view.street === 0 && value && premium && raises.length > 0)
      desired = Math.max(
        desired,
        view.currentBet * (raises.length === 1 ? (view.inPosition ? 3 : 3.5) : 2.5),
      );
    const amount = legalRaiseTo(desired, legal);
    sizing = {
      fraction,
      desired,
      actual: amount,
      minimum: legal.minRaiseTo,
      maximum: legal.maxRaiseTo,
      opening: view.street === 0 && !raises.length,
      executed: false,
    };
    const bluffRiskAllowed =
      view.street === 0 ||
      value ||
      thinValue ||
      amount - view.bet <= Math.max(0, (view.stack + (view.total || 0)) * 0.25 - (view.total || 0));
    const pairRaiseRiskAllowed =
      view.street === 0 ||
      legal.canCheck ||
      !value ||
      features.strongMade ||
      amount - view.bet <= (view.stack + (view.total || 0)) * 0.2;
    if (
      (amount !== legal.maxRaiseTo || value || thinValue || semiBluff) &&
      bluffRiskAllowed &&
      pairRaiseRiskAllowed
    ) {
      sizing.executed = true;
      if (isDonkLead(view)) {
        deception = {
          strategy: 'donk-lead',
          source: 'base-policy',
          kind: value ? 'value' : semiBluff ? 'semi-bluff' : 'bluff',
        };
        return finish('raise', 'donk-lead', amount);
      }
      return finish(
        'raise',
        thinValue
          ? 'thin-value'
          : value
            ? 'value-raise'
            : semiBluff
              ? 'semi-bluff'
              : smallCbet
                ? 'small-cbet'
                : 'pure-bluff',
        amount,
      );
    }
  }
  // If a bluff was the only reason to pass the price gate, a missed attack
  // must not become an accidental low-equity call.
  if (
    legal.toCall > 0 &&
    !affordableRangePassed &&
    !floatContinue &&
    !drawContinue &&
    !pairContinue &&
    (pureBluff || semiBluff) &&
    equity + callTolerance < (view.publicEquity ? requiredEquity : odds + 0.02)
  )
    return finish('fold', 'insufficient-equity');
  return finish(
    legal.canCheck ? 'check' : 'call',
    legal.canCheck
      ? 'free-check'
      : floatContinue
        ? 'float-continue'
        : exceptions.length
          ? 'loose-exception'
          : cheapEntry && admitted
            ? 'affordable-entry'
            : affordableOpen && admitted
              ? 'affordable-open'
              : affordableThreeBet && admitted
                ? 'small-reraise-continue'
                : premium && view.street === 0
                  ? 'premium-continue'
                  : 'price-continue',
  );
}
