import { rankText } from '../engine/poker.js';
import { actionLabel } from '../engine/action-labels.js';
import { MOOD_LABELS } from '../engine/bot-profiles.js';
import { decisionContext } from './context.js';
import { drawLabel, situationNotes, publicHistory } from './narrative.js';
import { spotFacts } from './spot-facts.js';

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
  'strong-trap': '强牌埋牌／诱导',
  'dirty-open': '后位脏牌开池偷盲',
  'dirty-reraise': '高牌阻断的脏牌再加注',
  'donk-lead': '向前一街进攻者主动领打（donk）',
  'seven-two-bluff': '2–7 低频诈唬',
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
function pocketComparison(v) {
  const rank = v.hole[0].rank;
  if (rank === 14) return '它的 AA 翻前领先其他起手牌，跟注主要是在争取价值';
  if (rank === 13) return '它的 KK 领先 QQ 以下对子和多数高牌，但遇到 AA 仍明显落后';
  return `它的口袋 ${rankText(rank)} 领先更小对子；遇到 ${rankText(rank + 1)}${rankText(rank + 1)} 及更大对子明显落后，遇到 AK 等两高张则常接近五五开`;
}

export function explainOpponent(record) {
  const t = record.trace,
    v = t.view,
    actorId = v.id ?? record.id ?? 1;
  // Reuse the classifier with an actor-relative snapshot. Other hole cards stay unread.
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
  const f = spotFacts({ ...v, action: record.action, amount: record.amount }, c, actorId),
    draw = c.draw,
    wet =
      v.features?.wet ??
      (c.texture.maxSuit >= (v.board.length === 3 ? 2 : 3) || c.texture.connected >= 3),
    hand = c.handLabel,
    cost = v.legal.callAmount,
    allinCall = record.action === 'call' && cost === v.stack,
    actual = actionLabel(snapshot),
    prefix = v.street
      ? `它拿 ${f.holeText}，在 ${f.boardText} 上是${hand}，这次${actual}。`
      : `它拿 ${f.holeText} 在 ${v.position} ${actual}。`,
    drawText = draw.outs
      ? `它在追${drawLabel(draw)}，共有 ${draw.outs} 张顺子／同花改善候选；补中后也可能遇到更大成牌`
      : '',
    ownOpen = f.ownPreviousActions.find((a) => a.street === 0 && a.action === 'raise');
  let logic = '';
  switch (t.reason) {
    case 'outside-range':
    case 'insufficient-equity':
      logic = draw.outs
        ? `继续要补 ${n(cost)}；${drawText}。这次它选择放弃追牌。`
        : `继续要补 ${n(cost)}；这手${hand}没有通过本次防守判断，因此退出底池。`;
      break;
    case 'stack-pressure':
      logic = `补 ${n(cost)} 会用掉它剩余 ${n(v.stack)} 的 ${pct(cost / Math.max(1, v.stack))}，它选择保住后手，没有接这笔大额投入。`;
      break;
    case 'loose-exception':
      logic = `这次补 ${n(cost)} 未通过原本的防守检查，仍因模拟失误继续；这笔跟注没有可确认的赔率或牌力依据。`;
      break;
    case 'premium-continue':
      logic = `${ownOpen ? '它此前开池至 ' + n(ownOpen.amount) + '，' : ''}这次把${hand}按强起手牌处理，直接保留了跟注。${allinCall ? '但现在是投入全部剩余 ' + n(cost) + '，不是用小注看翻牌；' : '这次需要补 ' + n(cost) + '；'}底牌比较：${v.hole[0].rank === v.hole[1].rank ? pocketComparison(v) : '遇到更大对子或相同高牌配更好踢脚时，它仍可能落后'}。这说明它为什么接注，不足以证明这笔跟注是正 EV（长期能赚筹码）。`;
      break;
    case 'affordable-entry':
    case 'affordable-open':
      logic = `它只补 ${n(cost)}，还留 ${n(v.stack - cost)}；${v.hole[0].rank === v.hole[1].rank ? '这手对子可以等翻牌中暗三条。' : v.hole[0].suit === v.hole[1].suit ? '两张同花底牌保留了翻后买同花的机会。' : '它愿意用这笔小投入看翻牌是否击中底牌。'}这次是便宜跟入，当前没有付出大额再加注的成本。`;
      break;
    case 'price-continue':
      logic = draw.outs
        ? `它跟注 ${n(cost)} 的目的不是只靠${hand}摊牌。${drawText}。${allinCall ? '跟完就全下，只能等发牌，不能再靠后街诈唬拿池。' : '跟完还留 ' + n(v.stack - cost) + '，下一街是否继续要看补牌和新的下注。'}`
        : `${v.street === 0 && v.hole[0].rank === v.hole[1].rank ? pocketComparison(v) : '它想用当前的' + hand + '保留摊牌机会'}。这次付出 ${n(cost)}，跟注通过了模拟器的赔率检查；但检查没有按对手这条下注线重新构建范围，不能据此认定是正 EV。`;
      break;
    case 'value-raise':
      if (!v.street)
        logic = `它用${hand}作价值${f.lastAggression ? '再加注' : '开池'}，新增投入 ${n(f.investment)} 去建立底池，想让较弱对子或高牌付费。${c.opponents > 1 ? '仍有 ' + c.opponents + ' 位对手未弃牌，这次加注也在减少便宜看翻牌的人数。' : ''}`;
      else if (c.made.score[0] >= 1 && !['board', 'board-pair'].includes(c.handClass))
        logic = `这是用${hand}取值：新增投入 ${n(f.investment)}，希望更弱成牌${draw.outs || wet ? '或听牌' : ''}付费。${wet ? '牌面有同花或顺子连接，下注也让追牌的人付出成本。' : '牌面较干燥，价值主要来自更弱成牌的跟注。'}`;
      else
        logic = `它只有${hand}，却按价值牌进攻了 ${n(f.investment)}；没有明确的弱成牌付费依据，这次把牌力看得过于乐观。`;
      break;
    case 'semi-bluff':
      logic = `它用${drawLabel(draw)}半诈唬，新增投入 ${n(f.investment)}：对手弃牌就拿走 ${n(v.pot)}，被跟住后仍有 ${draw.outs} 张改善候选。${c.opponents > 1 ? '当前有 ' + c.opponents + ' 位对手，想让所有人都弃牌更难。' : ''}`;
      break;
    case 'pure-bluff':
      logic = c.missedDraw
        ? `河牌 ${f.lastCardText} 没补成它的顺子或同花；它改用 ${n(f.investment)} 诈唬，目标是让更好的牌退出，已经没有下一张牌可买。`
        : `它用 ${n(f.investment)} 诈唬争取 ${n(v.pot)}，主要收益来自对手弃牌，${hand}本身不足以支撑价值下注。`;
      break;
    case 'trap':
    case 'strong-trap':
      logic = !v.street
        ? `这是强牌埋牌：它只补 ${n(cost)}，把强起手牌藏在平跟里，想留住开池者的弱牌和后面可能进池的人；还留 ${n(v.stack - cost)} 后手。`
        : record.action === 'check'
          ? `这是${hand}埋牌：在${c.texture.label}选择过牌，诱导对手主动下注。${v.street === 3 ? '这是河牌，收益要靠对手本轮下注；对手也过牌就直接摊牌。' : '牌面较少直接听牌，暂时少收一街价值，换取对手继续投入的机会。'}`
          : `这是${hand}埋牌：只跟 ${n(cost)}，没有再加注赶走对手的弱牌或诈唬；还留 ${n(v.stack - cost)}，准备继续争取后街价值。`;
      break;
    case 'free-check':
      logic = draw.outs
        ? `当前不用补筹码。${drawText}。${c.pendingOthers ? '后面还有人行动，过牌不保证免费见下一张。' : '它没有主动增加买牌成本。'}`
        : `当前不用补筹码，它没有用${hand}主动做大 ${n(v.pot)} 的底池。${v.street === 3 ? '河牌已经没有补牌机会，它选择保留摊牌价值。' : ''}`;
      break;
    case 'float-continue':
      logic = `这是 float：它在 ${v.position} 有位置，先补 ${n(cost)}，等下一街观察对手是否停止下注；牌面 ${f.boardText} 较干燥，它保留在对手过牌后下注拿池的机会。`;
      break;
    case 'pot-control':
      logic = `这是${hand}控池：底池已经有 ${n(v.pot)}，它过牌不再加大投入，保留用中等成牌摊牌的机会。`;
      break;
    case 'thin-value':
      logic = `这是河牌薄价值下注：它用${hand}投入 ${n(f.investment)}，想从更弱的一对收取跟注；河牌 ${f.lastCardText} 已发出，没有再买牌的价值。`;
      break;
    case 'small-cbet':
      logic = `它是翻前进攻者，在 ${f.boardText} 这张干燥高牌面继续下注 ${n(f.investment)}；小尺度争取让没击中翻牌的牌弃掉，${hand}不等于一定击中了顶对。`;
      break;
    case 'dirty-open':
      logic = `这是脏牌开池：前面无人开池或跟入，它在 ${v.position} 用 ${n(f.investment)} 争取盲注 ${n(v.pot)}，主要靠后面的对手弃牌获利。${f.holeText}被跟住后，成牌质量较弱。`;
      break;
    case 'dirty-reraise':
      logic = `这是脏牌再加注：面对一次小开池且没有跟入者，它在 ${v.position} 用 ${n(f.investment)} 施压；手里的 ${rankText(Math.max(...v.hole.map((card) => card.rank)))} 阻断部分对手强牌组合，想直接拿走 ${n(v.pot)}。被跟住后，较弱踢脚仍会让它难打。`;
      break;
    case 'seven-two-bluff':
      logic =
        t.deception?.stage === 'opening'
          ? `这是 2–7 诈唬偷盲：它在 ${v.position} 用 ${n(f.investment)} 争取 ${n(v.pot)}，前面无人入池，靠后面的人弃牌获利。`
          : `这是 2–7 诈唬：单挑、有位置，对手本轮已经过牌；它在 ${f.boardText} 上用 ${n(f.investment)} 争取 ${n(v.pot)}，没有成牌或大听牌托底，主要赌对手愿意弃牌。`;
      break;
    case 'donk-lead':
      logic =
        t.deception?.kind === 'semi-bluff'
          ? `这是 donk 半诈唬：前一街进攻者还没行动，它先领打 ${n(f.investment)}。${drawText}。既想直接拿池，也保留被跟住后的补牌机会。`
          : t.deception?.kind === 'value' && (c.made.score[0] >= 2 || c.handClass === 'overpair')
            ? `这是 donk 价值下注：前一街进攻者还没行动，它用${hand}先领打 ${n(f.investment)}，让弱成牌和听牌付费，避免对手过牌后免费见下一张。`
            : `这是 donk：前一街进攻者还没行动，它就用${hand}领打 ${n(f.investment)}；当前没有强成牌托底，主要靠对手弃牌拿池。`;
      break;
    default:
      logic = `当前底池 ${n(v.pot)}，它选择以${hand}保留这条行动路线。`;
  }
  const reasons = situationNotes(v, c, actorId).slice(0, 2);
  if (t.reason === 'seven-two-bluff')
    reasons.push('本桌没有 2–7 奖励；这次拿池要靠对手弃牌，底牌本身没有额外收益。');
  if (t.exceptions?.length && t.reason !== 'loose-exception')
    reasons.push(`它原本未通过防守检查，仍继续付出 ${n(cost)}；之后的进攻不能消除这笔跟注的风险。`);
  if (t.sizing && !t.sizing.executed)
    reasons.push(`它曾尝试加注，但实际只${actual}，本次没有执行加注。`);
  if (t.mode !== 'off' && t.mood?.kind !== 'steady')
    reasons.push(`这次模拟情绪是${MOOD_LABELS[t.mood.kind]}，使它的跟注或进攻倾向发生偏移。`);
  // Use the engine's eligible pot including refunds, never the raw table pot as payout.
  // Random-opponent equity and trial counts are debug data, not this bettor's range equity.
  const metrics = [];
  if (cost && record.action !== 'raise') {
    const reward = Math.max(0, v.contestable - cost);
    metrics.push(
      `底池赔率 ${(reward / cost).toFixed(2)}:1；补 ${n(cost)} 争夺 ${n(v.contestable)}，跟注至少需要约 ${pct(cost / Math.max(1, v.contestable))} 的权益才能保本。权益是长期能分到的底池份额，包含平分底池。`,
    );
  }
  if (record.action === 'raise')
    metrics.push(
      `本次新增投入 ${n(f.investment)}，约为当前底池 ${n(v.pot)} 的 ${pct(f.potRatio)}；这是下注尺度，不是跟注赔率。`,
    );
  if (
    v.street > 0 &&
    c.effective > (record.action === 'call' ? cost : f.investment) &&
    !f.allOpponentsAllIn
  )
    metrics.push(
      `SPR 约 ${c.spr.toFixed(1)}（有效后手 ÷ 底池）；当前有效后手 ${n(c.effective)}，底池 ${n(v.pot)}。`,
    );
  return {
    title: BOT_REASON_NAMES[t.reason],
    detail: prefix + logic,
    paragraphs: [prefix, logic],
    reasons,
    metrics: metrics.slice(0, 2),
    history: publicHistory(v),
    made: hand,
    warning: '',
  };
}
