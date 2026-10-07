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
    name: '谈老板 · Tan Xuan',
    short: '谈老板',
    tag: '宽范围 · 多街施压',
    description: '更宽地争夺底池，弱牌与强牌共用进攻路线，偏好持续施压。',
    axes: [85, 90, 82, 70, 25],
    sizing: [0.65, 1.15],
    evidence:
      'Triton 现金桌报道记录了弱牌四下注和多街诈唬；本人短牌采访也自述喜欢宽松与诈唬。短牌频率不移植到本桌。',
    sources: [
      {
        label: 'Triton · 现金桌进攻样本',
        url: 'https://tritonpokerseries.com/en-US/news/headlines/st-wang-shows-million-dollar-class-as-cash-game-invitational-raises-stakes',
      },
      {
        label: 'Triton · 本人采访（短牌）',
        url: 'https://tritonpokerseries.com/en-US/news/headlines/tan-xuan-completes-short-deck-double-with-jeju-main-event-success',
      },
    ],
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
    sources: [
      {
        label: 'Triton · 大输后保持纪律',
        url: 'https://tritonpokerseries.com/en-US/news/headlines/ferdinand-takes-most-as-phil-ivey-and-dan-cates-land-big-cash-game-profits',
      },
      {
        label: 'Triton · 强牌诱导',
        url: 'https://tritonpokerseries.com/en-US/news/headlines/more-brilliance-from-elton-tsang-as-cash-game-invitational-gets-serious',
      },
    ],
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
    sources: [
      {
        label: 'Triton · 河牌进攻样本',
        url: 'https://tritonpokerseries.com/en-US/news/headlines/brilliant-rui-cao-and-steady-andy-ni-win-big-on-day-2-in-jeju',
      },
    ],
  },
  {
    id: 'peter',
    name: 'Peter · HCL',
    short: 'Peter',
    tag: '宽范围 · 大尺度搏杀',
    description: '更愿意跟入，强牌榨取大尺度价值，少量小口袋对子也会强力反击。',
    axes: [92, 88, 72, 84, 18],
    sizing: [0.75, 1.25],
    evidence:
      'HCL 记录了暗三条的河牌满池再加注；另一场有小口袋对子大推入。后者带 Stand-Up 附加规则，不能照搬整场频率。此处指 HCL 常客。',
    sources: [
      {
        label: 'HCL · 河牌价值加注',
        url: 'https://hustlercasinolive.com/2024/06/12/the-rematch-we-didnt-know-we-needed/',
      },
      {
        label: 'PokerNews · 小对子反击（附加规则）',
        url: 'https://www.pokernews.com/news/2025/01/poker-player-goes-all-in-for-thousands-47684.htm',
      },
    ],
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
    sources: [
      {
        label: 'Pokerati · AJ 半诈唬牌局',
        url: 'https://pokerati.com/2026/08/top-streamed-hands-of-the-week-winston-sets-the-perfect-trap-a-bao-bluffs-big/',
      },
      {
        label: 'Pokerati · 同花听牌反击',
        url: 'https://pokerati.com/2026/08/top-streamed-hands-of-the-week-malinowski-and-dwan-take-on-the-kpc-high-rollers/',
      },
    ],
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
    sources: [
      {
        label: 'PokerStars · Viktor 原访谈',
        url: 'https://www.pokerstars.com/poker/learn/news/finding-isildur1-viktor-blom-cops-to-his-077269/',
      },
      {
        label: 'PokerStars · 历史诈唬回顾',
        url: 'https://www.pokerstars.com/poker/learn/news/the-best-and-worst-poker-bluffs-ever/',
      },
    ],
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
    sources: [
      {
        label: 'Card Player · Daniel Cates 原访谈',
        url: 'https://www.cardplayer.com/cardplayer-poker-magazines/65799-poker-hall-of-fame-23-20/articles/19757-capture-the-flag-daniel-jungleman12-cates',
      },
      {
        label: 'Card Player · 对手调整访谈',
        url: 'https://www.cardplayer.com/cardplayer-poker-magazines/66315-jason-mercier-28-23/articles/22601-head-games-heads-up-cash-game-advice-from-the-best-in-the-world',
      },
    ],
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
    sources: [
      {
        label: 'Card Player · Dwan 原采访',
        url: 'https://www.cardplayer.com/cardplayer-poker-magazines/65739-tom-dwan-6-4/articles/18288-the-won-39-durrrr-39-ful-life-of-tom-dwan',
      },
      {
        label: 'PokerStars · 历史诈唬回顾',
        url: 'https://www.pokerstars.com/poker/learn/news/the-best-and-worst-poker-bluffs-ever/',
      },
    ],
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
});
export function sanitizeBotSettings(value) {
  const settings = defaultBotSettings();
  if (value && Object.hasOwn(EMOTION_MODES, value.emotionMode))
    settings.emotionMode = value.emotionMode;
  for (let id = 1; id <= 8; id++) {
    const profile = value?.assignments?.[id];
    if (BOT_PROFILES.some((p) => p.id === profile)) settings.assignments[id] = profile;
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
export function finishBotHand(player, profit, mode) {
  const mood = player.botMood;
  mood.losses = profit <= -250 ? mood.losses + 1 : 0;
  mood.wins = profit >= 250 ? mood.wins + 1 : 0;
  if (mode === 'off' || mood.cooldown) return null;
  // Both reactions are synthetic; no emotional trait is assigned to a person.
  if (profit <= -1250 || mood.losses >= 3)
    return setMood(
      mood,
      player.id % 2 ? 'frustrated' : 'cautious',
      profit <= -1250 ? '单手净损失至少 25 BB' : '连续三手各净损失至少 5 BB',
    );
  if (mood.wins >= 2 && profit >= 500)
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

export function botBoardFeatures(hole, board, score) {
  const known = [...hole, ...board],
    ranks = new Set(known.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  const suits = [0, 1, 2, 3].map((s) => board.filter((c) => c.suit === s).length);
  const connected = Math.max(
    0,
    ...Array.from(
      { length: 10 },
      (_, i) =>
        Array.from({ length: 5 }, (_, j) => i + j + 1).filter((r) =>
          board.some((c) => c.rank === r || (r === 1 && c.rank === 14)),
        ).length,
    ),
  );
  const wet =
    Math.max(0, ...suits) >= 3 ||
    connected >= 3 ||
    (board.length === 3 && Math.max(...suits) === 2);
  const flushDraw =
    board.length >= 3 &&
    board.length < 5 &&
    score[0] < 5 &&
    [0, 1, 2, 3].some(
      (s) => known.filter((c) => c.suit === s).length === 4 && hole.some((c) => c.suit === s),
    );
  const straightDraw =
    board.length >= 3 &&
    board.length < 5 &&
    score[0] < 4 &&
    Array.from({ length: 10 }, (_, i) => Array.from({ length: 5 }, (_, j) => i + j + 1)).some(
      (run) =>
        run.filter((r) => ranks.has(r)).length === 4 &&
        hole.some(
          (c) =>
            (run.includes(c.rank) || (c.rank === 14 && run.includes(1))) &&
            !board.some((b) => b.rank === c.rank),
        ),
    );
  const highBoard = Math.max(0, ...board.map((c) => c.rank));
  const overpair = hole[0].rank === hole[1].rank && hole[0].rank > highBoard;
  return { wet, draw: flushDraw || straightDraw, overpair };
}
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
  const legal = view.legal;
  if (!legal.enabled) throw Error('机器人当前不能行动。');
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
    odds = legal.callAmount / Math.max(1, view.contestable),
    pressure = legal.toCall / Math.max(1, view.stack + view.bet);
  const noise =
    (random() - 0.5) *
    (view.difficulty === 'easy' ? 0.16 : view.difficulty === 'hard' ? 0.04 : 0.08);
  const equity = Math.max(0, Math.min(1, view.equity + noise));
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
  let range = (0.16 + width * 0.42) * positionScale * (view.count >= 8 ? 0.9 : 1);
  if (raises.length) range *= raises.length === 1 ? 0.68 : 0.42;
  if (view.position === 'BB' && legal.toCall <= 50) range += 0.1;
  const openingRange = range;
  const cheapEntry =
    view.street === 0 && !raises.length && view.currentBet <= 50 && legal.toCall <= 50;
  if (cheapEntry) range = Math.min(0.95, range + 0.08 + width * 0.16);
  const premium = percentile < 0.07,
    admitted = percentile <= range,
    openingAdmitted = percentile <= openingRange,
    callTolerance = (callDown - 0.5) * 0.1;
  let sizing = null,
    value = false,
    semiBluff = false,
    pureBluff = false;
  const finish = (action, reason, amount) => ({
    action,
    ...(amount === undefined ? {} : { amount }),
    trace: {
      reason,
      profile: profile.id,
      profileName: profile.name,
      mode,
      mood: { kind: mood?.kind || 'steady', reason: mood?.reason || '' },
      axes,
      baseAxes: [...profile.axes],
      equityModel: 'random-opponents',
      trials: view.equityTrials || (view.difficulty === 'hard' ? 52 : 28),
      rawEquity: view.equity,
      noise,
      equity,
      odds,
      pressure,
      percentile,
      range,
      openingRange,
      cheapEntry,
      cheapRangePassed: cheapEntry && admitted,
      premium,
      admitted,
      callTolerance,
      checks,
      exceptions,
      sizing,
      value,
      semiBluff,
      pureBluff,
      draw: view.features.draw,
      playsBoard: view.playsBoard,
    },
  });
  if (legal.toCall > 0) {
    if (view.street === 0 && !admitted && !premium && odds > 0.09) {
      if (roll('outside-range', 0.06 * width) > 0.06 * width)
        return finish('fold', 'outside-range');
      exceptions.push('outside-range');
    }
    if ((!premium || view.street > 0) && !(cheapEntry && admitted)) {
      if (equity + callTolerance < odds + 0.02) {
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
        : exceptions.length
          ? 'loose-exception'
          : cheapEntry && admitted
            ? 'affordable-entry'
            : premium && view.street === 0
              ? 'premium-continue'
              : 'price-continue',
    );
  const headsUp = view.rivals === 1,
    features = view.features;
  const ownLastRaise =
    [...view.history].reverse().find((a) => a.action === 'raise')?.id === view.id;
  semiBluff =
    view.street > 0 &&
    features.draw &&
    view.rivals <= 2 &&
    roll('semi-bluff', (0.12 + bluff * 0.42) * (headsUp ? 1 : 0.45)) <
      (0.12 + bluff * 0.42) * (headsUp ? 1 : 0.45);
  const story =
    view.street === 0 ? ['BTN', 'CO'].includes(view.position) : ownLastRaise || !features.wet;
  pureBluff =
    !view.playsBoard &&
    view.rivals <= 2 &&
    story &&
    pressure < 0.25 &&
    roll('pure-bluff', (0.015 + bluff * 0.17) * (headsUp ? 1 : 0.2)) <
      (0.015 + bluff * 0.17) * (headsUp ? 1 : 0.2);
  value =
    view.street === 0
      ? premium || openingAdmitted
      : !view.playsBoard &&
        (equity > (headsUp ? 0.53 : 1 / (view.rivals + 1) + 0.23) ||
          (features.overpair && equity > 0.4));
  if (
    value &&
    view.street > 0 &&
    legal.canCheck &&
    !features.wet &&
    equity > 0.65 &&
    roll('trap', trap * 0.52) < trap * 0.52
  )
    return finish('check', 'trap');
  if (
    (value || semiBluff || pureBluff) &&
    roll('attack', 0.2 + attack * 0.72) < 0.2 + attack * 0.72
  ) {
    let fraction = profile.sizing[0] + random() * (profile.sizing[1] - profile.sizing[0]);
    if (profile.id === 'abao' && view.street === 1 && ownLastRaise) fraction = 0.33;
    if (profile.id === 'abao' && view.street === 2 && semiBluff) fraction = 0.9;
    if (mode !== 'off' && ['frustrated', 'confident', 'reactive'].includes(mood.kind))
      fraction *= mode === 'lively' ? 1.2 : 1.1;
    let desired =
      view.currentBet +
      Math.round(Math.max(50, (view.pot + legal.callAmount) * fraction) / 25) * 25;
    if (view.street === 0 && !raises.length)
      desired =
        125 +
        (attack > 0.8 ? 25 : 0) +
        view.history.filter((a) => a.street === 0 && a.action === 'call').length * 50;
    if (
      view.street === 0 &&
      profile.id === 'peter' &&
      view.hole[0].rank === view.hole[1].rank &&
      view.hole[0].rank <= 6 &&
      admitted &&
      headsUp &&
      roll('rare-pocket-shove', 0.04) < 0.04
    )
      desired = legal.maxRaiseTo;
    const amount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, desired));
    sizing = {
      fraction,
      desired,
      actual: amount,
      minimum: legal.minRaiseTo,
      maximum: legal.maxRaiseTo,
      opening: view.street === 0 && !raises.length,
      executed: false,
    };
    if (amount !== legal.maxRaiseTo || value || semiBluff || view.stack <= 500) {
      sizing.executed = true;
      return finish(
        'raise',
        value ? 'value-raise' : semiBluff ? 'semi-bluff' : 'pure-bluff',
        amount,
      );
    }
  }
  return finish(
    legal.canCheck ? 'check' : 'call',
    legal.canCheck
      ? 'free-check'
      : exceptions.length
        ? 'loose-exception'
        : cheapEntry && admitted
          ? 'affordable-entry'
          : premium && view.street === 0
            ? 'premium-continue'
            : 'price-continue',
  );
}
