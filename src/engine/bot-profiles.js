import { difficultyPolicy, hasBotSkill } from './bot-difficulty.js';
import { handFeatures as botBoardFeatures } from './hand-features.js';
import { decisionBasis, aggressionSupport } from './decision-basis.js';
export { handFeatures as botBoardFeatures } from './hand-features.js';
import { bigBlindOf, DEFAULT_STAKES } from './stakes.js';
import research from '../data/player-research.json' with { type: 'json' };
import { botStyleContext, resolveBotStyle } from './bot-style.js';
import { chipUnitOf, fractionRaiseTo, legalRaiseTo } from './bet-sizing.js';
import { deceptiveAction, isDonkLead } from './bot-deception.js';
import { publicResponseRisk } from './public-action-context.js';

// These are training controls inferred from a few public examples, not measured
// statistics of the named players. Emotions are a separate synthetic layer.
export const BOT_PROFILES = [
  {
    id: 'balanced',
    name: '均衡练习',
    short: '均衡',
    tag: '稳定的基准对手',
    description: '中等范围、常规尺度，兼顾价值下注与少量诈唬。',
    axes: [50, 50, 40, 50, 20],
    sizing: [0.45, 0.8],
    evidence: '基准训练策略，不对应任何真人。',
    sources: [],
  },
  {
    id: 'tan',
    name: '谭老板 · Tan Xuan',
    short: '谭老板',
    tag: '宽范围 · 多街施压',
    description: '更宽地争夺底池，弱牌与强牌共用进攻路线，偏好持续施压。',
    axes: [85, 90, 82, 70, 25],
    sizing: [0.65, 1.15],
    evidence:
      'Triton 现金桌报道记录了弱牌四下注和多街诈唬；本人短牌采访也自述喜欢宽松与诈唬。短牌频率不移植到本桌。',
    sources: research.players.tan.sources,
    research: research.players.tan,
    policy: {
      entry: 1.08,
      reraise: 1.05,
      blockerBluffs: true,
      barrel: 1.3,
      riverBluff: 1.2,
      streetSizing: [
        [0.5, 0.8],
        [0.85, 1.2],
        [0.9, 1.3],
      ],
    },
  },
  {
    id: 'st',
    name: 'ST Wang',
    short: 'ST 王',
    tag: '选择性进攻 · 价值诱导',
    description: '收紧边缘入池，强牌在安全牌面诱导，也能面对大注及时止损。',
    axes: [40, 65, 43, 42, 78],
    sizing: [0.45, 0.9],
    evidence: '官方报道中，大池失利后的 AQ 仍能在河牌弃牌；另一手 AA 使用河牌过牌全下的价值陷阱。',
    sources: research.players.st.sources,
    research: research.players.st,
    policy: {
      entry: 0.85,
      reraise: 0.85,
      blockerBluffs: true,
      barrel: 0.8,
      riverBluff: 0.65,
      riverValue: 1.15,
    },
  },
  {
    id: 'zang',
    name: '臧书奴 · Aaron Zang',
    short: '臧书奴',
    tag: '经验进攻 · 河牌争夺',
    description: '中宽范围，有位置时争夺底池，河牌保留主动加注与抓诈路线。',
    axes: [63, 75, 62, 63, 50],
    sizing: [0.6, 1.0],
    evidence: 'Triton 记录了河牌把 23k 小注加到 105k 的诈唬样本。单手不能说明其长期频率。',
    sources: research.players.zang.sources,
    research: research.players.zang,
    policy: {
      entry: 1,
      reraise: 0.95,
      blockerBluffs: true,
      riverBluff: 1.25,
      riverProbe: 1.35,
      streetSizing: [
        [0.5, 0.8],
        [0.6, 1],
        [0.9, 1.3],
      ],
    },
  },
  {
    id: 'peter',
    name: 'Peter · HCL',
    short: 'Peter',
    tag: '宽范围 · 大尺度搏杀',
    description: '更愿意低成本跟入，强牌榨取大尺度价值；普通桌不使用附加规则的特殊推入。',
    axes: [92, 88, 72, 84, 18],
    sizing: [0.75, 1.25],
    evidence:
      'HCL 记录了暗三条的河牌满池再加注；另一场有小口袋对子大推入。后者带 Stand-Up 附加规则，不能照搬整场频率。此处指 HCL 常客。',
    sources: research.players.peter.sources,
    research: research.players.peter,
    policy: {
      entry: 1.12,
      reraise: 0.8,
      blockerBluffs: true,
      barrel: 1,
      riverBluff: 0.8,
      riverValue: 1.25,
    },
  },
  {
    id: 'abao',
    name: '阿宝 · KPC A Bao',
    short: '阿宝',
    tag: '选择性压迫 · 半诈唬',
    description: '有听牌权益时更积极，小翻牌下注之后可用大转牌下注继续施压。',
    axes: [55, 82, 72, 50, 34],
    sizing: [0.5, 1.0],
    evidence:
      'KPC 详细牌局报道中，AJ 同花使用约 31% 池翻牌下注、90% 池转牌半诈唬；另有 98 同花听牌推入样本。本名未可靠确认。',
    sources: research.players.abao.sources,
    research: research.players.abao,
    policy: {
      entry: 0.95,
      reraise: 0.95,
      blockerBluffs: true,
      barrel: 1.2,
      flopCbet: 0.33,
      turnSemiBluff: 0.9,
    },
  },
  {
    id: 'viktor',
    name: 'Viktor Blom',
    short: 'Viktor Blom',
    tag: '松凶施压 · 宽范围争夺',
    description: '更宽地争夺后位和低成本底池，听牌与价值牌共用积极进攻路线，偏好较大尺度。',
    axes: [90, 94, 88, 70, 18],
    sizing: [0.7, 1.25],
    evidence:
      'PokerStars 原访谈与官方回顾支持其历史松凶风格。这里归纳的是训练原型，不是实时打法或真人频率；单挑经验不直接移植成多人精确参数。',
    sources: research.players.viktor.sources,
    research: research.players.viktor,
    policy: {
      entry: 1.08,
      reraise: 1.1,
      blockerBluffs: true,
      barrel: 1.35,
      riverBluff: 1.2,
      streetSizing: [
        [0.6, 1],
        [0.85, 1.3],
        [0.95, 1.4],
      ],
    },
  },
  {
    id: 'jungleman',
    name: 'Daniel Cates',
    short: 'Daniel Cates',
    tag: '计算型进攻 · 强牌诱导',
    description: '保留有价格的防守，兼顾主动施压与强牌诱导；大额继续仍要通过权益和筹码压力检查。',
    axes: [65, 82, 66, 64, 72],
    sizing: [0.45, 0.95],
    evidence:
      '本人原访谈强调计算、观察实际行为并调整，避免机械平衡。当前机器人用范围和价格近似这些思路，未复刻职业级读人或动态学习。',
    sources: research.players.jungleman.sources,
    research: research.players.jungleman,
    policy: {
      entry: 0.98,
      reraise: 1,
      blockerBluffs: true,
      adapt: 0.7,
      barrel: 1.1,
      potControl: 0.1,
      streetSizing: [
        [0.4, 0.65],
        [0.65, 1],
        [0.7, 1.1],
      ],
    },
  },
  {
    id: 'dwan',
    name: 'Tom Dwan',
    short: 'Tom Dwan',
    tag: '创造性施压 · 多街诈唬',
    description:
      '更积极争夺有位置的底池，在有进攻叙事或听牌时混合多街施压，也能用强牌保留对手范围。',
    axes: [85, 90, 85, 75, 55],
    sizing: [0.65, 1.2],
    evidence:
      '原采访、同行评价和 PokerStars 回顾支持其历史创造性与多街诈唬风格。参数仅为可调的模拟倾向，不推断真人真实 VPIP 或心理状态。',
    sources: research.players.dwan.sources,
    research: research.players.dwan,
    policy: {
      entry: 1.06,
      reraise: 1.05,
      blockerBluffs: true,
      barrel: 1.3,
      riverBluff: 1.25,
      potControl: 0.15,
      streetSizing: [
        [0.5, 0.85],
        [0.8, 1.25],
        [0.9, 1.4],
      ],
    },
  },

  {
    id: 'ivey',
    name: 'Phil Ivey',
    short: 'Phil Ivey',
    tag: '选择性进攻 · 价值诱导',
    description: '中宽范围，兼顾强牌诱导与河牌价值，按公开行动小幅调整。',
    axes: [62, 82, 63, 65, 75],
    sizing: [0.4, 1.2],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.ivey.sources,
    research: research.players.ivey,
    policy: {
      entry: 0.98,
      reraise: 1,
      blockerBluffs: true,
      adapt: 0.8,
      potControl: 0.1,
      riverValue: 1.2,
      streetSizing: [
        [0.4, 0.7],
        [0.65, 1],
        [0.75, 1.2],
      ],
    },
  },
  {
    id: 'negreanu',
    name: 'Daniel Negreanu',
    short: 'Daniel Negreanu',
    tag: '历史 small-ball · 控池',
    description: '较小尺度争夺底池，中等牌力保留过牌与薄价值。',
    axes: [60, 62, 42, 62, 55],
    sizing: [0.3, 0.75],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.negreanu.sources,
    research: research.players.negreanu,
    policy: {
      entry: 0.95,
      reraise: 0.7,
      blockerBluffs: true,
      openingBB: 2,
      potControl: 0.4,
      thinValue: 0.5,
      barrel: 0.8,
      riverBluff: 0.7,
      streetSizing: [
        [0.3, 0.5],
        [0.4, 0.65],
        [0.45, 0.75],
      ],
    },
  },
  {
    id: 'hellmuth',
    name: 'Phil Hellmuth',
    short: 'Phil Hellmuth',
    tag: '耐心防守 · 强牌诱导',
    description: '谨慎面对再加注与大额投入，安全牌面保留强牌诱导。',
    axes: [35, 55, 30, 42, 82],
    sizing: [0.4, 1],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.hellmuth.sources,
    research: research.players.hellmuth,
    policy: {
      entry: 0.8,
      reraise: 0.65,
      blockerBluffs: true,
      potControl: 0.25,
      barrel: 0.7,
      riverBluff: 0.55,
      streetSizing: [
        [0.4, 0.65],
        [0.5, 0.85],
        [0.65, 1],
      ],
    },
  },
  {
    id: 'antonius',
    name: 'Patrik Antonius',
    short: 'Patrik Antonius',
    tag: '稳健短桌 · 权益进攻',
    description: '短桌稍宽，听牌积极，转河牌变化后重新检查风险。',
    axes: [58, 80, 58, 65, 48],
    sizing: [0.5, 1.25],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.antonius.sources,
    research: research.players.antonius,
    policy: {
      entry: 0.94,
      reraise: 0.95,
      shortTable: 1.12,
      blockerBluffs: true,
      barrel: 1.1,
      riverValue: 1.15,
      streetSizing: [
        [0.5, 0.8],
        [0.7, 1.1],
        [0.8, 1.25],
      ],
    },
  },
  {
    id: 'koon',
    name: 'Jason Koon',
    short: 'Jason Koon',
    tag: '范围纪律 · 分街尺度',
    description: '有纪律的范围与阻断牌选择，小翻牌下注配合较大后街尺度。',
    axes: [53, 83, 60, 56, 42],
    sizing: [0.33, 1.2],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.koon.sources,
    research: research.players.koon,
    policy: {
      entry: 0.9,
      reraise: 1.1,
      blockerBluffs: true,
      adapt: 0.45,
      smallCbet: 0.3,
      barrel: 1.1,
      streetSizing: [
        [0.33, 0.55],
        [0.7, 1],
        [0.8, 1.2],
      ],
    },
  },
  {
    id: 'chidwick',
    name: 'Stephen Chidwick',
    short: 'Stephen Chidwick',
    tag: '理论启发 · 公开调整',
    description: '按范围和街次选择行动，公开样本足够后做小幅调整。',
    axes: [52, 80, 58, 58, 48],
    sizing: [0.35, 1.25],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.chidwick.sources,
    research: research.players.chidwick,
    policy: {
      entry: 0.9,
      reraise: 1.05,
      blockerBluffs: true,
      adapt: 0.55,
      smallCbet: 0.25,
      barrel: 1.05,
      streetSizing: [
        [0.35, 0.6],
        [0.65, 1],
        [0.8, 1.25],
      ],
    },
  },
  {
    id: 'holz',
    name: 'Fedor Holz',
    short: 'Fedor Holz',
    tag: '小注持续 · 选择性施压',
    description: '干燥高牌翻牌偏小注，中等牌力控池，后街选择性施压。',
    axes: [57, 85, 65, 51, 40],
    sizing: [0.35, 1.2],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.holz.sources,
    research: research.players.holz,
    policy: {
      entry: 0.93,
      reraise: 1,
      blockerBluffs: true,
      smallCbet: 0.55,
      potControl: 0.25,
      flopCbet: 0.4,
      barrel: 1.1,
      streetSizing: [
        [0.35, 0.55],
        [0.65, 1],
        [0.8, 1.2],
      ],
    },
  },
  {
    id: 'haxton',
    name: 'Isaac Haxton',
    short: 'Isaac Haxton',
    tag: '有位置 Float · 延迟进攻',
    description: '低价格干燥翻牌可少量先跟，下一街对手过牌后争夺底池。',
    axes: [62, 84, 70, 65, 50],
    sizing: [0.4, 1.3],
    evidence: '公开资料与模拟改编见下方；数字为训练参数。',
    sources: research.players.haxton.sources,
    research: research.players.haxton,
    policy: {
      entry: 1,
      reraise: 1.05,
      blockerBluffs: true,
      adapt: 0.6,
      float: 0.3,
      delayed: 1.4,
      barrel: 1.1,
      streetSizing: [
        [0.4, 0.7],
        [0.75, 1.1],
        [0.85, 1.3],
      ],
    },
  },
];
export const PROFILE_AXES = ['入池宽度', '进攻倾向', '诈唬倾向', '跟到底倾向', '强牌诱导'];
export const EMOTION_MODES = { off: '关闭', subtle: '轻微波动', lively: '明显波动' };
export const MOOD_LABELS = {
  steady: '平稳',
  frustrated: '急于追回',
  cautious: '收紧避险',
  confident: '连胜自信',
  reactive: '受压反击',
};
export const getBotProfile = (id) => BOT_PROFILES.find((p) => p.id === id) || BOT_PROFILES[0];
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
    const profile = value?.assignments?.[id];
    if (BOT_PROFILES.some((p) => p.id === profile)) settings.assignments[id] = profile;
  }
  settings.mixed = value?.mixed === true;
  settings.mixedSeats = settings.mixed
    ? [...new Set(Array.isArray(value?.mixedSeats) ? value.mixedSeats : [])].filter(
        (id) =>
          Number.isInteger(id) && id >= 1 && id <= 8 && settings.assignments[id] !== 'balanced',
      )
    : [];
  return settings;
}

// Manual selections take ownership, including reselecting the same style.
export function assignBotSeat(value, id, profileId) {
  const settings = sanitizeBotSettings(value);
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
  const available = BOT_PROFILES.filter((p) => p.id !== 'balanced').map((p) => p.id);
  for (let id = 1; id < Math.min(9, count); id++) {
    if (settings.assignments[id] !== 'balanced') continue;
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
  const noise = (random() - 0.5) * capability.noise;
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
  const baseRange =
    (0.16 + width * 0.42) *
    positionScale *
    (view.count >= 8 ? 0.9 : 1) *
    (behind == null ? 1 : Math.max(0.75, 1 - behind * 0.04)) *
    style.entry *
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
      style.entry;
  if (cheapEntry && speculative && ['BTN', 'CO', 'HJ'].includes(view.position))
    range += (0.06 + width * 0.12) * style.entry;
  if (affordableOpen) {
    const priceScale = Math.max(0.65, 1.1 - (view.currentBet / bigBlind) * 0.08);
    const playability = speculative ? 0.14 : suitedHigh ? 0.07 : 0;
    const callerBonus = speculative || suitedHigh ? Math.min(2, openCallers) * 0.04 : 0;
    const blindDiscount = view.position === 'BB' ? 0.08 : 0;
    const dominatedAce = !suited && high === 14 && low <= 8 ? 0.08 : 0;
    range =
      baseRange * priceScale +
      (0.12 + width * 0.18) * style.entry +
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
      (0.09 + width * 0.2) * style.entry * positionScale * priceScale +
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
  const premium = percentile < 0.07,
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
    thinValue = false;
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
  const semiThreshold = Math.min(0.7, (0.16 + bluff * 0.42) * (headsUp ? 1 : 0.55) * barrelScale);
  semiBluff =
    hasBotSkill(view.difficulty, 'semi-bluff') &&
    legal.canRaise &&
    view.street > 0 &&
    view.street < 3 &&
    features.draw &&
    view.rivals <= 2 &&
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
    roll('pure-bluff', (0.12 + bluff * 0.2 + attack * 0.1) * style.entry) <
      (0.12 + bluff * 0.2 + attack * 0.1) * style.entry;
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
      style: { controls: style, context, floatContinue, smallCbet, thinValue },
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
    // Calling commits to the priced showdown. Do not manufacture a side-pot
    // raise merely because an old opening-range label called this hand premium.
    return finish('call', exceptions.length ? 'loose-exception' : 'price-continue');
  }
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
        if (roll('insufficient-equity', 0.03 + callDown * 0.1) > 0.03 + callDown * 0.1)
          return finish('fold', 'insufficient-equity');
        exceptions.push('insufficient-equity');
      }
      if (pressure > 0.4 && equity + callTolerance < (view.street === 0 ? 0.38 : 0.32)) {
        if (roll('stack-pressure', 0.03 + callDown * 0.07) > 0.03 + callDown * 0.07)
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
  value =
    view.street === 0
      ? premium || percentile <= raiseRange
      : support.valueCandidate &&
        equity > (headsUp ? 0.53 : Math.max(0.62, 1 / (view.rivals + 1) + 0.23));
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
  if (
    (!isDonkLead(view) || hasBotSkill(view.difficulty, 'donk')) &&
    (value || semiBluff || pureBluff || smallCbet || thinValue) &&
    roll('attack', (0.2 + attack * 0.72) * capability.attack) <
      (0.2 + attack * 0.72) * capability.attack
  ) {
    const interval = style.streetSizing?.[view.street - 1] || profile.sizing;
    let fraction = interval[0] + random() * (interval[1] - interval[0]);
    if (view.street === 1 && ownLastRaise && style.flopCbet != null) fraction = style.flopCbet;
    if (view.street === 2 && semiBluff && style.turnSemiBluff != null)
      fraction = style.turnSemiBluff;
    if (smallCbet) fraction = style.flopCbet ?? interval[0];
    if (thinValue) fraction = Math.min(fraction, 0.5);
    if (view.street === 3 && value && equity > 0.7) fraction *= style.riverValue;
    if (mode !== 'off' && ['frustrated', 'confident', 'reactive'].includes(mood.kind))
      fraction *= mode === 'lively' ? 1.2 : 1.1;
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
    if (amount !== legal.maxRaiseTo || value || thinValue || semiBluff) {
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
