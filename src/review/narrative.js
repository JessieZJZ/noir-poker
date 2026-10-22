import { compactChips } from '../engine/chip-format.js';
import { bigBlindOf } from '../engine/stakes.js';
import { rankText } from '../engine/poker.js';
import { actionLabel, historyActionLabel } from '../engine/action-labels.js';
import { boardTexture } from './context.js';
import { spotFacts } from './spot-facts.js';
import { actorAtPosition } from '../engine/player-identity.js';
import {
  exhaustsStack,
  heavyPreflopPressure,
  plannedValueShove,
  foldPressure,
  foldWinNote,
} from './presentation.js';

const n = compactChips;
const pct = (value) => (value * 100).toFixed(1) + '%';
const streets = ['翻牌前', '翻牌', '转牌', '河牌'];
export function drawLabel(draw) {
  const straight =
    { 'open-ended': '两头顺听牌', 'double-gutshot': '双卡顺听牌', gutshot: '卡顺听牌' }[
      draw.straightType
    ] || '顺子听牌';
  return [draw.flush ? '同花听牌' : '', draw.straight ? straight : ''].filter(Boolean).join(' + ');
}

export function drawCompletion(draw) {
  return draw.flush && draw.straight ? '顺子或同花' : draw.flush ? '同花' : '顺子';
}

export function preflopPotential(s, subject = '你', showdownOnly = exhaustsStack(s)) {
  const [high, low] = s.hole.map((card) => card.rank).sort((a, b) => b - a);
  if (s.street || high === low) return [];
  const suited = s.hole[0].suit === s.hole[1].suit;
  if (suited && high - low === 1 && high <= 8)
    return ['这是低张同花连接牌，有机会在翻后形成顺子、同花听牌。'];
  const flush = !suited
    ? ''
    : high === 14
      ? `${subject}持有 A 同花底牌，翻牌出现两张与你底牌同花色的牌时可形成坚果同花听牌，补成同花后能领先更低的同花。`
      : `${subject}的两张同花底牌能争取同花听牌和成花机会。`;
  const pair =
    high === 14
      ? `${subject}若击中 A，可形成顶对${low >= 10 ? (showdownOnly ? '，较高踢脚有机会领先较弱 Ax' : '，较高踢脚有机会领先较弱 Ax，并向它们取值') : showdownOnly ? '，但仍可能输给更大踢脚的 Ax' : '，但面对更大踢脚的 Ax 时仍需控制投入'}。`
      : '';
  const connected =
    high - low === 1 ? `${subject}的两张底牌点数相连，能争取顺子听牌和成顺机会。` : '';
  return [flush, connected, pair].filter(Boolean);
}

export function investmentText(s, c, price) {
  const before = `行动前你手里有 ${n(s.stack)}`;
  const ratio = price.cost ? (price.contestable - price.cost) / price.cost : 0;
  if (s.action === 'fold')
    return `${before}，这次弃牌不再投入，保留 ${n(s.stack)}，行动前底池 ${n(s.pot)}${price.cost ? '，底池赔率约 ' + ratio.toFixed(2) + ':1' : ''}${price.contestable - price.cost !== s.pot && price.cost ? '（赔率只计算你可争夺的部分）' : ''}`;
  if (s.action === 'check') return `${before}，这次过牌无需投入，当前底池 ${n(s.pot)}`;
  if (s.action === 'raise')
    return `${before}，这次${c.extra === s.stack ? '全下' : '加注'}拿出 ${n(c.extra)}，${actionLabel(s)}，行动前底池 ${n(s.pot)}`;
  return `${before}，这次${s.legal.callAmount === s.stack ? '跟注全下' : '跟注'}拿出 ${n(c.extra)}，跟注前底池 ${n(s.pot)}${price.cost ? '，底池赔率约 ' + ratio.toFixed(2) + ':1' : ''}${price.contestable - price.cost !== s.pot ? '（赔率只计算你可争夺的部分）' : ''}`;
}

export function publicCallsAfter(s, index, actorId = 0) {
  return (s.history || [])
    .slice(index + 1)
    .filter((a) => a.street === s.street && a.action === 'call' && a.id !== actorId)
    .map((a) => {
      const name = actorAtPosition(s, a.id);
      return `随后，${name}又补 ${n(a.amount)} 跟注。`;
    })
    .join('');
}

// This module reads only the actor's before-action cards and public history.
// The opponent panel supplies that bot's own view after settlement.
export function situationNotes(s, c, actorId = 0) {
  const notes = [],
    f = spotFacts(s, c, actorId),
    who =
      actorId === 0
        ? '你'
        : s.players?.find((p) => p.id === actorId)?.name || s.actorName || s.name || '对手',
    aggression = f.lastAggression;
  if (aggression?.street === s.street) {
    if (aggression.priorChecks.length)
      notes.push(
        `${aggression.name}此前在${aggression.priorChecks.map((street) => streets[street]).join('、')}过牌，这次在${streets[aggression.street]}的行动是${aggression.label}，之前的过牌不能排除慢打的强牌，现在也可能是新公共牌带来的取值或诈唬，因此要重新判断这笔下注。`,
      );
    else if (new Set(aggression.line.map((a) => a.street)).size >= 2)
      notes.push(
        `${aggression.name}的下注线是${aggression.line.map((a) => streets[a.street] + ' ' + a.label).join(' → ')}，${who}这次面对的是连续施压，需要结合这条下注线判断对手的价值牌和诈唬。`,
      );
  }
  if (s.board.length >= 4) {
    const before = boardTexture(s.board.slice(0, -1)),
      last = s.board.at(-1);
    if (c.texture.maxSuit > before.maxSuit && c.texture.maxSuit >= 3)
      notes.push(
        `${streets[s.street]}的 ${f.lastCardText} 让牌面出现 ${c.texture.maxSuit} 张同花色，${who}当前是${c.handLabel}${c.draw.flush ? '，也有同花听牌' : ''}。`,
      );
    else if (c.texture.connected > before.connected && c.texture.connected >= 3)
      notes.push(
        c.draw.straight
          ? `${streets[s.street]}的 ${f.lastCardText} 加强了顺子连接，牌面现在是 ${f.boardText}，${who}当前是${c.handLabel}，另有${drawLabel(c.draw)}。`
          : `${streets[s.street]}的 ${f.lastCardText} 加强了顺子连接，牌面现在是 ${f.boardText}，${who}当前是${c.handLabel}。`,
      );
    else if (s.board.slice(0, -1).some((card) => card.rank === last.rank))
      notes.push(
        `${streets[s.street]}的 ${f.lastCardText} 让公共牌配对，${who}当前是${c.handLabel}，牌面上的对子也给对手留下三条或葫芦组合。`,
      );
    else if (s.hole.some((card) => card.rank === last.rank))
      notes.push(
        `${streets[s.street]}的 ${f.lastCardText} 击中了${who}的底牌，现在是${c.handLabel}。`,
      );
  }
  if (f.allOpponentsAllIn)
    notes.push(
      `剩下的 ${f.activeOpponents.length} 位对手都已全下，没有后手可再弃牌，也没有对他们继续诈唬的空间。`,
    );
  else if (s.street > 0 && c.pendingOthers > 0 && s.action === 'call')
    notes.push(
      `${who}在 ${s.position} 跟注 ${n(s.legal.callAmount)} 时，本轮尚未封口，后面的玩家若再加注，${who}还要重新决定是否补筹码。`,
    );
  return notes;
}

export function callOddsText(metrics, action = 'call') {
  const amount = metrics.callAmount ?? metrics.callCost;
  if (!metrics.callCost)
    return amount
      ? `实际再补 ${n(amount)}，但计入退回筹码后，本次没有新增风险。`
      : '可以直接过牌，不必再投入筹码。';
  const ratio = (metrics.contestable - metrics.callCost) / metrics.callCost;
  return amount === metrics.callCost
    ? `${action === 'fold' ? '若跟注' : '跟注'} ${n(amount)} 后可争夺 ${n(metrics.contestable)} 底池，需要至少 ${pct(metrics.required)} 的胜率，风险和收益才能持平。`
    : `实际再补 ${n(amount)}，算入弃牌与跟注时退回筹码的差额，本次风险为 ${n(metrics.callCost)}。跟注后可争夺 ${n(metrics.contestable)}，底池赔率约 ${ratio.toFixed(2)} : 1，需要至少 ${pct(metrics.required)} 的胜率，风险和收益才能持平。`;
}

export function actionReason(s, r) {
  const c = r.context,
    f = spotFacts(s, c),
    actual = actionLabel(s),
    draw = c.draw,
    hand = f.holeText,
    pressure = foldPressure(s),
    foldNote = pressure.hasAllInOpponent ? foldWinNote(s) : '';
  if (exhaustsStack(s) && s.action === 'call')
    return `你在 ${s.position} 拿 ${hand}，用剩下的 ${n(s.stack)} 全下跟注，可争夺 ${n(r.metrics.contestable)} 的底池。`;
  if (s.action === 'raise') {
    if (r.code === 'unbacked-pair-reraise')
      return `你拿 ${hand}，在 ${f.boardText} 上${actual}，这次拿出 ${n(f.investment)}。`;
    if (heavyPreflopPressure(s, c))
      return `你拿 ${hand} 在 ${s.position} ${actual}，这次拿出 ${n(f.investment)} 争取 ${n(s.pot)} 的底池。${foldNote || '面对多次再加注，不能只凭起手牌较强就当作价值加注，继续进攻需要对手有足够会弃牌的组合，被大对子或 AK 等强牌跟注时要承担明显风险。'}`;
    if (plannedValueShove(s, c) && f.shove)
      return `你拿 ${hand} 在 ${s.position} ${actual}，这次拿出 ${n(f.investment)}。${c.valuePlan.reason}`;
    if (f.shove && f.potRatio > 4) {
      let rationale;
      if (
        s.street > 0 &&
        draw.outs &&
        (c.made.score[0] === 0 ||
          ['board', 'board-pair', 'middle-pair', 'underpair'].includes(c.handClass))
      )
        rationale = foldNote
          ? `这次进攻有半诈唬的依据。${foldNote}听牌仍提供${drawLabel(draw)}的补牌机会，但如此大的投入需要足够的弃牌率，单靠听牌不能证明这个尺度划算。`
          : `这次进攻有半诈唬的依据，对手弃牌可以直接获利，被跟注后仍有${drawLabel(draw)}的补牌机会，但如此大的投入需要足够的弃牌率，单靠听牌不能证明这个尺度划算。`;
      else if (
        s.street > 0 &&
        (c.made.score[0] === 0 || ['board', 'board-pair'].includes(c.handClass))
      )
        rationale = foldNote
          ? `当前缺少能独占底池的强成牌和直接听牌。${foldNote}被跟注时要承担整笔筹码的风险。`
          : '当前缺少能独占底池的强成牌和直接听牌，这次全下主要依赖对手弃掉更好的牌，被跟注时要承担整笔筹码的风险。';
      else if (!s.street && c.tier < 2)
        rationale = foldNote
          ? `${foldNote}被强牌跟注后，这手起手牌的胜算会明显下降。`
          : '这笔大额进攻主要靠对手弃牌获利，被强牌跟注后，这手起手牌的胜算会明显下降。';
      else
        rationale =
          '如此大的尺度会让对手的继续范围更集中于强牌，需要比较较小加注能留下哪些跟注牌。';
      return `你拿 ${hand} 在 ${s.position} ${actual}，把 ${n(f.investment)}（${(f.investment / bigBlindOf(s)).toFixed(0)} BB）投入当时 ${n(s.pot)} 的底池，是底池的 ${f.potRatio.toFixed(1)} 倍。${rationale}`;
    }
    if (s.street === 0)
      return `你拿 ${hand} 在 ${s.position} ${actual}，这次拿出 ${n(f.investment)} 去争取底池 ${n(s.pot)}。${c.tier >= 2 ? '这手牌有价值加注的牌力，可以让较弱起手牌付费。' : foldNote ? '这次是再加注诈唬。' + foldNote : f.lastAggression ? '已有加注时，这次是再加注诈唬，需要所有仍在底池里的对手都弃牌，才能直接拿走底池。' : '前面没有开池，这次进攻可以直接争夺盲注，被跟注后再看这手牌的翻后潜力。'}`;
    if (
      !draw.outs &&
      ['pressure-bet', 'large-unbacked-bet'].includes(r.code) &&
      (c.made.score[0] === 0 ||
        ['board', 'board-pair'].includes(c.handClass) ||
        c.texture.maxSuit >= 4)
    )
      return foldNote
        ? `你拿 ${hand}，在 ${f.boardText} 上${actual}，当前${c.handLabel}，牌面${c.texture.label}${c.texture.maxSuit >= 4 && c.made.score[0] < 5 ? '，你没有同花' : ''}。这次拿出 ${n(f.investment)} 是在尝试诈唬。${foldNote}被跟注后，当前牌力很难赢到摊牌。`
        : `你拿 ${hand}，在 ${f.boardText} 上${actual}，当前${c.handLabel}，牌面${c.texture.label}${c.texture.maxSuit >= 4 && c.made.score[0] < 5 ? '，你没有同花' : ''}。这次拿出 ${n(f.investment)} 是在尝试诈唬，想让更好的牌弃掉，被跟注后，当前牌力很难赢到摊牌。`;
    if (
      s.street < 3 &&
      !draw.outs &&
      s.hole[0].rank === s.hole[1].rank &&
      s.hole[0].rank < 14 &&
      c.made.score[0] <= 2
    ) {
      const checked = (s.history || [])
        .filter((a) => a.street === s.street && a.id !== 0 && a.action === 'check')
        .map((a) => actorAtPosition(s, a.id));
      return `你拿 ${hand}，在 ${f.boardText} 上${actual}，这次拿出 ${n(f.investment)}。${checked.length ? checked.join('、') + '过牌后，' : ''}下注可以让${s.hole[0].rank > 2 ? '更小对子或尚未成对的高张' : '尚未成对的高张'}付费，高张若弃牌，也就失去了免费看下一张反超你的机会。这并不保证你领先：对手仍可能用更大的对子或慢打的强牌继续。${s.legal.canCheck ? '过牌可以控制底池，但也可能让这些牌免费改善。' : ''}`;
    }
    return draw.outs
      ? `你拿 ${hand}，在 ${f.boardText} 上${actual}，这次拿出 ${n(f.investment)}，目前是${c.handLabel}加${drawLabel(draw)}，共有 ${draw.outs} 张牌可以补成${drawCompletion(draw)}。${['high', 'underpair', 'middle-pair', 'board-pair'].includes(c.handClass) ? (foldNote ? '这次属于半诈唬。' + foldNote + '听牌仍提供改善机会。' : '这次属于半诈唬，对手弃牌可直接拿池，被跟注后仍能补牌。') : '已有成牌可以向弱牌取值，同时保留听牌改善。'}`
      : `你拿 ${hand}，在 ${f.boardText} 上${actual}，这次拿出 ${n(f.investment)}。${['high', 'underpair', 'middle-pair', 'board-pair'].includes(c.handClass) ? (foldNote ? '目前牌力偏弱。' + foldNote : '目前牌力偏弱，这次下注主要需要更好的牌弃掉。') : c.handClass === 'board' ? '主要牌力来自公共牌，你的底牌没有增加优势，这笔下注很难单靠价值跟注获利。' : '目前已有成牌，下注的价值来自对手用更弱成牌跟注。'}`;
  }
  if (s.action === 'call')
    return s.street
      ? `你在 ${s.position} 拿 ${hand}，在 ${f.boardText} 上是${c.handLabel}，再补 ${n(s.legal.callAmount)} 跟注，继续争夺 ${n(r.metrics.contestable)} 的底池。`
      : `你在 ${s.position} 拿 ${hand}，再补 ${n(s.legal.callAmount)} 跟注，继续争夺 ${n(r.metrics.contestable)} 的底池。`;
  if (s.action === 'fold')
    return s.legal.canCheck
      ? `你拿 ${hand} 直接弃牌，但当时可以直接过牌，过牌成本同样是 0，还能保留${s.street ? c.handLabel : '这手起手牌'}的获池机会。`
      : s.street
        ? `你在 ${s.position} 拿 ${hand}，在 ${f.boardText} 上是${c.handLabel}，选择弃牌，避免再补 ${n(s.legal.callAmount)}。${draw.outs ? '当前有' + drawLabel(draw) + '，' + draw.outs + '张改善候选，下一张约' + pct(draw.nextChance) + '。' : ''}`
        : `你在 ${s.position} 拿 ${hand}，选择弃牌。`;
  if (!s.street) return `你在 ${s.position} 拿 ${hand}，这次可以免费过牌，保留看翻牌的机会。`;
  return draw.outs
    ? `你拿 ${hand}，在 ${f.boardText} 上是${c.handLabel}，过牌保留${drawLabel(draw)}的 ${draw.outs} 张改善候选，本次投入 0。${c.pendingOthers ? '本轮还有 ' + c.pendingOthers + ' 人能行动，因此不保证免费见下一张。' : '本轮没有待行动的对手，可以免费见下一张牌。'}`
    : `你拿 ${hand} 在 ${f.boardText} 上是${c.handLabel}，这次过牌没有增加投入。${s.street === 3 && r.metrics.closing ? '你是河牌最后行动者，过牌后直接摊牌。' : c.pendingOthers ? '本轮还有 ' + c.pendingOthers + ' 人能行动，过牌保留了面对他们下注再决定的机会。' : '对手本轮已行动，你选择保留当前底池大小。'}`;
}

export function continuationNote(s, c, closing) {
  if (
    s.action === 'fold' ||
    exhaustsStack(s) ||
    (s.action === 'raise' && s.amount === s.legal.maxRaiseTo) ||
    s.street !== 2 ||
    closing ||
    !c.draw.outs ||
    c.made.score[0] > 0 ||
    !c.inPosition ||
    c.opponents !== 1 ||
    c.effective <= s.legal.callAmount
  )
    return '';
  return `你在 ${s.position} 有位置，本次投入后还留 ${n(s.stack - c.extra)}，河牌没补成${drawLabel(c.draw)}时，若对手过牌，且河牌支持你代表更强的成牌，可以考虑转诈唬。对手继续下注时，就要按新的金额决定是否放弃。`;
}

export function publicHistory(s) {
  return (s.history || []).map((a, i) => ({
    street: streets[a.street],
    name: actorAtPosition(s, a.id),
    action: historyActionLabel(s.history, i),
  }));
}
