// Training capabilities, not fixed HUD targets or measured human frequencies.
const basic = ['value', 'price'];
const standard = [...basic, 'position', 'cbet', 'semi-bluff', 'pot-control', 'trap'];
const advanced = [
  ...standard,
  'float',
  'thin-value',
  'blocker-bluff',
  'light-reraise',
  'squeeze',
  'donk',
  'rare-bluff',
];
export const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    skills: Object.freeze(basic),
    entry: 1.12,
    reraise: 0.6,
    attack: 0.78,
    noise: 0.16,
    description: '偏宽入池、更多跟注、较少再加注；以基础取值和赔率判断为主。',
  }),
  normal: Object.freeze({
    skills: Object.freeze(standard),
    entry: 1,
    reraise: 1,
    attack: 1,
    noise: 0.08,
    description: '结合位置选择入池，加入持续下注、听牌半诈唬、控池和强牌埋牌。',
  }),
  hard: Object.freeze({
    skills: Object.freeze(advanced),
    entry: 0.96,
    reraise: 1.12,
    attack: 1.08,
    noise: 0.04,
    description: '在标准策略上加入阻断诈唬、薄价值、挤压、延迟进攻和选择性领打。',
  }),
});
export const difficultyPolicy = (difficulty) =>
  BOT_DIFFICULTIES[difficulty] || BOT_DIFFICULTIES.normal;
export const hasBotSkill = (difficulty, skill) =>
  difficultyPolicy(difficulty).skills.includes(skill);

// Undefined ratios stay null; zero calls must not become an invented finite AF.
export function observedBotMetrics(stats) {
  const ratio = (n, d) => (d > 0 ? n / d : null);
  return {
    hands: stats.hands,
    vpip: ratio(stats.vpip, stats.hands),
    pfr: ratio(stats.pfr, stats.hands),
    threeBet: ratio(stats.threeBets || 0, stats.threeBetOpportunities || 0),
    foldToThreeBet: ratio(stats.foldsToThreeBet || 0, stats.facedThreeBets || 0),
    af: ratio(stats.postRaises, stats.postCalls),
    afInfinite: stats.postCalls === 0 && stats.postRaises > 0,
  };
}
