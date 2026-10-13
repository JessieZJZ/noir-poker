import { evaluate } from '../engine/poker.js';
import { MOOD_LABELS } from '../engine/bot-profiles.js';
import { decisionContext } from './context.js';
import { drawLabel, situationNotes, publicHistory } from './narrative.js';

const pct = (v) => (v * 100).toFixed(1) + '%';
const n = (v) => Math.round(v).toLocaleString('en-US');
export const BOT_REASON_NAMES = {
  'outside-range': '起手牌未进入本次防守范围',
  'insufficient-equity': '估计权益未达到跟注门槛',
  'stack-pressure': '筹码压力触发收紧',
  'loose-exception': '随机容错保留了边缘行动',
  'premium-continue': '强起手牌分支保留继续',
  'affordable-entry': '低成本入池范围保留了继续',
  'affordable-open': '小开池的价格与有效后手支持跟入',
  'small-reraise-continue': '小尺度再加注的价格支持防守',
  'price-continue': '通过了价格与压力检查',
  'value-raise': '主动加注范围触发进攻',
  'semi-bluff': '听牌半诈唬触发进攻',
  'pure-bluff': '诈唬抽样触发主动施压',
  trap: '干燥牌面强牌触发诱导过牌',
  'free-check': '选择免费观察／控制底池',
  'float-continue': '有位置低成本跟注，保留后街进攻',
  'pot-control': '中等权益手牌控制底池',
  'thin-value': '有位置河牌小尺度薄价值',
  'small-cbet': '干燥高牌翻牌小尺度持续下注',
};
export const BOT_CHECK_NAMES = {
  ...BOT_REASON_NAMES,
  'outside-range': '超出范围时的容错抽样',
  'insufficient-equity': '权益不足时的容错抽样',
  'stack-pressure': '高压力时的容错抽样',
  attack: '进攻频率抽样',
  trap: '诱导过牌抽样',
  'rare-pocket-shove': '小对子特殊全下抽样',
  float: '低成本 Float 抽样',
  'pot-control': '控制底池抽样',
  'thin-value': '河牌薄价值抽样',
  'small-cbet': '小尺度持续下注抽样',
};
export function explainOpponent(record) {
  const t = record.trace,
    v = t.view;
  const actorId = v.id ?? record.id ?? 1;
  // Reuse the hand classifier with an actor-relative, public-only snapshot.
  const opponents =
    v.opponents || Array.from({ length: v.rivals }, (_, i) => ({ id: i + 100, stack: v.stack }));
  const snapshot = {
    ...v,
    action: record.action,
    amount: record.amount,
    players: [{ id: 0, stack: v.stack }, ...opponents.map((p, i) => ({ ...p, id: i + 1 }))],
    pending: [],
    history: v.history.map((a) => ({ ...a, id: a.id === actorId ? 0 : a.id + 100 })),
  };
  const c = decisionContext(snapshot);
  c.inPosition = !!v.inPosition;
  const draw = c.draw,
    hand = c.handLabel;
  const reasons = situationNotes(v, c, actorId);
  const copies = {
    'outside-range': `它拿${hand}面对当前加注线选择退出，避免用容易被压制的牌继续付费。`,
    'insufficient-equity': `它拿${hand}，认为改善或摊牌机会抵不上这笔跟注价格，因而弃牌。`,
    'stack-pressure': '这笔投入会占掉太多后手，继续后很难再应对加注，因此它先退出。',
    'loose-exception':
      '它本来未通过范围、价格或筹码压力检查，却被随机容错保留了继续。这是模拟失误，不能把它包装成合理的赔率跟注。',
    'premium-continue': `它把${hand}当作强起手牌继续，跳过了普通价格检查；面对多人或大额全下，这种简化仍可能高估牌力。`,
    'affordable-entry': `它用${hand}低成本入池，想保留翻后成牌机会；这不是接大额再加注的理由。`,
    'affordable-open': `面对一次小开池，它用${hand}跟入，后手较深，愿意用较小投入保留翻后潜力；同花、连张或对子改善后才有机会争取更大底池。`,
    'small-reraise-continue':
      '这是标准或进阶难度的小尺度 3-bet 防守：总额、补入价格、底池赔率与有效后手通过边界检查，再按自己的起手牌、位置和风格选择跟注。普通的全桌随机摊牌权益弃牌检查没有执行；它是有边界的策略近似，不证明跟注盈利，也不适用于大额再加注或全下。',
    'price-continue': draw.outs
      ? `它跟注是在追${drawLabel(draw)}，并通过了模型价格检查；成牌候选不全是干净的获胜牌。`
      : `它用${hand}跟注，通过了模型价格检查，想保留摊牌机会；这不证明能打赢按下注线收紧后的范围。`,
    'value-raise':
      v.street === 0
        ? `它用${hand}主动建池；已有开池时，这是独立的价值再加注范围，平跟范围不会自动变成加注范围。`
        : c.made.score[0] >= 1 && c.handClass !== 'board' && c.handClass !== 'board-pair'
          ? `它用${hand}主动取值，想让更弱成牌${draw.outs ? '和听牌' : ''}付费，同时减少对手便宜改善的机会；牌面越湿，越要警惕被强牌继续。`
          : `它只有${hand}，却被宽随机范围估计归入取值分支。这次进攻可能过于乐观，不能把程序标签当成已成强牌。`,
    'semi-bluff': `它在用${drawLabel(draw)}半诈唬：先争取直接拿池，被跟注后仍可改善；多人或非坚果听牌会削弱这条路线。`,
    'pure-bluff': c.missedDraw
      ? '它的听牌在河牌落空，转而靠下注让更好牌退出；这次是诈唬，不能再靠下一张牌改善。'
      : `它拿${hand}施压，主要靠对手弃牌；位置、此前进攻和牌面提供了模型的施压条件，但没有证明对手一定会退出。`,
    trap: `它拿${hand}在较干燥牌面过牌诱导，想让对手主动投入；对手也过牌时会少收一笔价值。`,
    'free-check': draw.outs
      ? `它免费过牌保留${drawLabel(draw)}，没有主动抬高追牌成本。`
      : `它拿${hand}免费过牌，保留摊牌或观察机会；过牌不等于一定弱。`,
    'float-continue':
      '它有位置、价格较低，在干燥翻牌先跟住；希望观察后街是否能在对手示弱时进攻，并非已经成强牌。',
    'pot-control': `它用${hand}控制底池，避免把中等牌力打成大底池；后面有人下注仍需重新判断。`,
    'thin-value': `它在河牌用${hand}小额取值，希望更弱的一对等成牌付费；更强牌加注时不能沿用原来的轻松跟注。`,
    'small-cbet':
      '它延续翻前主动性，在干燥高牌翻牌小额下注；这种牌面给开池范围提供施压候选，但不证明它一定有高牌成对或真实范围优势。',
  };
  if (t.exceptions.length && t.reason !== 'loose-exception')
    reasons.push(
      '它曾未通过检查，靠随机容错继续后才进入当前分支；最终的取值或诈唬标签不能消除之前的风险。',
    );
  if (t.sizing && !t.sizing.executed)
    reasons.push('模型曾尝试加注，但全下保护阻止了执行；这一步实际没有加注。');
  if (t.mode !== 'off' && t.mood.kind !== 'steady')
    reasons.push(
      `本次模拟情绪是${MOOD_LABELS[t.mood.kind]}，可能使范围或进攻更激进；不代表真人心理。`,
    );
  const comparison = t.equity + t.callTolerance;
  const metrics = [
    v.legal.callAmount
      ? `跟注 ${n(v.legal.callAmount)}，可争夺 ${n(v.contestable)}；当前价格门槛约 ${pct(t.odds)}。`
      : `无需补筹码；当前底池 ${n(v.pot)}。`,
  ];
  if (t.affordableRangePassed)
    metrics.push(
      t.affordableThreeBet
        ? BOT_REASON_NAMES['small-reraise-continue']
        : '使用低成本跟入范围，普通的全桌随机摊牌权益弃牌检查没有执行。',
    );
  else
    metrics.push(
      `随机范围估计约 ${pct(t.equity)}，抽样 ${t.trials} 次；只是模型估计，不是对真实继续范围的胜率。`,
    );
  return {
    title:
      record.action === 'fold'
        ? '价格与继续风险'
        : draw.outs
          ? drawLabel(draw)
          : BOT_REASON_NAMES[t.reason],
    detail: copies[t.reason] || `它用${hand}按当前公开局面行动。`,
    reasons,
    metrics,
    history: publicHistory(v),
    made: hand,
    warning:
      record.action === 'call' &&
      (t.exceptions.length ||
        (!t.affordableRangePassed && comparison < t.odds + 0.02) ||
        (v.history.filter((a) => a.street === v.street && a.action === 'raise').length > 1 &&
          !t.affordableThreeBet))
        ? '随机范围和容错可能高估这次继续的价值，实际行动不等于合理打法。'
        : '',
  };
}
