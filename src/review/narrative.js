import { compactChips } from '../engine/chip-format.js';
import { bigBlindOf } from '../engine/stakes.js';
import { rankText } from '../engine/poker.js';
import { actionLabel, historyActionLabel } from '../engine/action-labels.js';
import { boardTexture } from './context.js';
import { spotFacts } from './spot-facts.js';

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

export function publicCallsAfter(s, index, actorId = 0) {
  return (s.history || [])
    .slice(index + 1)
    .filter((a) => a.street === s.street && a.action === 'call' && a.id !== actorId)
    .map((a) => {
      const name = s.players?.find((p) => p.id === a.id)?.name || '对手';
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
  if (aggression) {
    if (aggression.street !== s.street)
      notes.push(
        `${aggression.name}此前在${streets[aggression.street]}的行动是${aggression.label}；到了${streets[s.street]}，轮到${who}行动时，${s.legal.canCheck ? '当前无需补筹码，可以免费过牌' : '这次需要再补 ' + n(s.legal.callAmount) + ' 才能继续'}。`,
      );
    else if (aggression.priorChecks.length)
      notes.push(
        `${aggression.name}此前在${aggression.priorChecks.map((street) => streets[street]).join('、')}过牌，这次在${streets[aggression.street]}的行动是${aggression.label}；这条下注线由过牌转为主动进攻。`,
      );
    else if (new Set(aggression.line.map((a) => a.street)).size >= 2)
      notes.push(
        `${aggression.name}的下注线是${aggression.line.map((a) => streets[a.street] + ' ' + a.label).join(' → ')}；${who}这次面对的是连续施压，如果选择跟注，需要再补 ${n(s.legal.callAmount)}。`,
      );
    else {
      const raises = (s.history || [])
          .map((a, index) => ({ ...a, index }))
          .filter((a) => a.street === s.street && a.action === 'raise'),
        firstRaise = (s.history || []).findIndex(
          (a) => a.street === s.street && a.action === 'raise',
        ),
        earlierCall = (s.history || [])
          .slice(0, aggression.index)
          .findIndex((a) => a.street === s.street && a.id !== actorId && a.action === 'call');
      if (s.street === 0 && raises.length >= 2) {
        const prior =
            f.ownPreviousActions.findLast(
              (a) => a.street === 0 && a.action === 'raise' && a.index < aggression.index,
            ) || raises.at(-2),
          priorName =
            s.players?.find((p) => p.id === prior.id)?.name ||
            (prior.id === actorId ? who : '对手'),
          called = publicCallsAfter(s, aggression.index, actorId);
        if (called) {
          const response =
            called + `这时，${who}选择${actionLabel(s)}，是在回应已经被其他玩家接住的再加注。`;
          notes.push(
            `${priorName}此前${historyActionLabel(s.history, prior.index)}，${aggression.name}再${aggression.label}。${response}`,
          );
        } else
          notes.push(
            `${priorName}此前${historyActionLabel(s.history, prior.index)}，${aggression.name}再${aggression.label}；${who}这次选择${actionLabel(s)}，是在决定要不要接下这笔再加注。`,
          );
      } else if (s.street === 0 && earlierCall >= 0 && earlierCall < firstRaise) {
        const caller = s.history[earlierCall],
          name = s.players?.find((p) => p.id === caller.id)?.name || '对手';
        notes.push(
          `${name}先${historyActionLabel(s.history, earlierCall)}进入底池，${aggression.name}（${aggression.position}）随后${aggression.label}；${who}这次选择${actionLabel(s)}，是在已有跟入者的底池中回应开池。`,
        );
      } else
        notes.push(
          aggression.position
            ? `${aggression.name}（${aggression.position}）已${aggression.label}；${who}这次选择${actionLabel(s)}，是在回应这笔下注。`
            : `${aggression.name}已${aggression.label}；${who}这次选择${actionLabel(s)}，是在回应这笔下注。`,
        );
    }
  } else {
    const checks = (s.history || []).filter(
      (a) => a.street === s.street && a.id !== actorId && a.action === 'check',
    );
    if (checks.length) {
      const names = checks.map(
        (a) =>
          s.players?.find((p) => p.id === a.id)?.name ||
          s.opponents?.find((p) => p.id === a.id)?.name ||
          '对手',
      );
      notes.push(
        `${names.join('、')}本轮已过牌；${who}当前不用补筹码，${s.action === 'raise' ? '这次主动下注是在已有过牌之后争取底池' : '可以保留免费机会，也可以主动下注争取价值或弃牌'}。`,
      );
    }
  }
  if (s.board.length >= 4) {
    const before = boardTexture(s.board.slice(0, -1)),
      last = s.board.at(-1);
    if (c.texture.maxSuit > before.maxSuit && c.texture.maxSuit >= 3)
      notes.push(
        `${streets[s.street]}的 ${f.lastCardText} 让牌面出现 ${c.texture.maxSuit} 张同花色；${who}当前是${c.handLabel}${c.draw.flush ? '，也有同花听牌' : ''}。`,
      );
    else if (c.texture.connected > before.connected && c.texture.connected >= 3)
      notes.push(
        c.draw.straight
          ? `${streets[s.street]}的 ${f.lastCardText} 加强了顺子连接，牌面现在是 ${f.boardText}；${who}当前是${c.handLabel}，另有${drawLabel(c.draw)}。`
          : `${streets[s.street]}的 ${f.lastCardText} 加强了顺子连接，牌面现在是 ${f.boardText}；${who}当前是${c.handLabel}。`,
      );
    else if (s.board.slice(0, -1).some((card) => card.rank === last.rank))
      notes.push(
        `${streets[s.street]}的 ${f.lastCardText} 让公共牌配对；${who}当前是${c.handLabel}，牌面上的对子也给对手留下三条或葫芦组合。`,
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

export function callOddsText(metrics) {
  const amount = metrics.callAmount ?? metrics.callCost;
  if (!metrics.callCost)
    return amount
      ? `实际再补 ${n(amount)}，但计入退回筹码后，本次没有新增风险。`
      : '当前无需补筹码，跟注成本为 0。';
  const ratio = (metrics.contestable - metrics.callCost) / metrics.callCost;
  return amount === metrics.callCost
    ? `再补 ${n(amount)}，跟注后可争夺 ${n(metrics.contestable)}，底池赔率约 ${ratio.toFixed(2)} : 1；至少需要约 ${pct(metrics.required)} 的权益才能打平。`
    : `实际再补 ${n(amount)}；算入弃牌与跟注时退回筹码的差额，本次风险为 ${n(metrics.callCost)}。跟注后可争夺 ${n(metrics.contestable)}，底池赔率约 ${ratio.toFixed(2)} : 1，至少需要约 ${pct(metrics.required)} 的权益才能打平。`;
}

export function actionReason(s, r) {
  const c = r.context,
    f = spotFacts(s, c),
    actual = actionLabel(s),
    draw = c.draw,
    hand = f.holeText;
  if (s.action === 'raise') {
    if (c.valuePlan?.kind === 'value-shove' && f.shove)
      return `你拿 ${hand} 在 ${s.position} ${actual}，这次拿出 ${n(f.investment)}。${c.valuePlan.reason}`;
    if (f.shove && f.potRatio > 4)
      return `你拿 ${hand} 在 ${s.position} ${actual}，把 ${n(f.investment)}（${(f.investment / bigBlindOf(s)).toFixed(0)} BB）投入当时 ${n(s.pot)} 的底池，是底池的 ${f.potRatio.toFixed(1)} 倍。${s.street === 0 && c.tier < 2 ? '这笔大额进攻主要靠对手弃牌获利；被强牌跟住后，这手起手牌的胜算会明显下降。' : '如此大的尺度会让对手的继续范围更集中于强牌，需要比较较小加注能留下哪些跟注牌。'}`;
    if (s.street === 0)
      return `你拿 ${hand} 在 ${s.position} ${actual}，这次拿出 ${n(f.investment)} 去争取底池 ${n(s.pot)}。${c.tier >= 2 ? '这手牌有价值加注的牌力，可以让较弱起手牌付费。' : f.lastAggression ? (c.opponents > 1 ? '已有开池时，这次是再加注诈唬候选；需要开池者和其他未弃牌的玩家都放弃，才能直接拿走底池。' : '已有开池时，这次是再加注诈唬候选；需要开池者愿意弃牌，才能直接拿走底池。') : '前面没有开池，这次进攻可以直接争夺盲注；被跟住后再看这手牌的翻后潜力。'}`;
    if (!draw.outs && ['pressure-bet', 'large-unbacked-bet'].includes(r.code))
      return `你拿 ${hand}，在 ${f.boardText} 上${actual}；当前${c.handLabel}，牌面${c.texture.label}${c.texture.maxSuit >= 4 && c.made.score[0] < 5 ? '，你没有同花' : ''}。这次拿出 ${n(f.investment)} 主要依赖对手弃牌，不能只按成牌标签解释为价值下注。`;
    return draw.outs
      ? `你拿 ${hand}，在 ${f.boardText} 上${actual}，这次拿出 ${n(f.investment)}；目前是${c.handLabel}加${drawLabel(draw)}，共有 ${draw.outs} 张顺子／同花改善候选。${['high', 'underpair', 'middle-pair', 'board-pair'].includes(c.handClass) ? '这次属于半诈唬，对手弃牌可直接拿池，被跟住后仍能补牌。' : '已有成牌可以向弱牌取值，同时保留听牌改善。'}`
      : `你拿 ${hand}，在 ${f.boardText} 上${actual}，这次拿出 ${n(f.investment)}。${['high', 'underpair', 'middle-pair', 'board-pair'].includes(c.handClass) ? '目前牌力偏弱，这次下注主要需要更好的牌弃掉。' : c.handClass === 'board' ? '主要牌力来自公共牌，你的底牌没有增加优势，这笔下注很难单靠价值跟注获利。' : '目前已有成牌，下注的价值来自对手用更弱成牌跟住。'}`;
  }
  if (
    s.action === 'call' &&
    draw.outs &&
    c.made.score[0] >= 1 &&
    !['board', 'board-pair'].includes(c.handClass)
  )
    return `你拿 ${hand}，在 ${f.boardText} 上跟注 ${n(s.legal.callAmount)}；已有${c.handLabel}，同时还有${drawLabel(draw)}的 ${draw.outs} 张改善候选。跟注既保留当前成牌的摊牌价值，也争取补成更强牌。`;
  if (s.action === 'call')
    return draw.outs
      ? `你拿 ${hand}，在 ${f.boardText} 上跟注 ${n(s.legal.callAmount)} 的依据是${drawLabel(draw)}，不是只靠${c.handLabel}摊牌。${draw.straightRanks?.length ? draw.straightRanks.map(rankText).join(' / ') + ' 可补顺子；' : ''}共有 ${draw.outs} 张顺子／同花改善候选，其中有些成牌仍可能输。`
      : s.street
        ? `你在 ${s.position} 拿 ${hand}，在 ${f.boardText} 上是${c.handLabel}，再补 ${n(s.legal.callAmount)} 跟注，继续争夺 ${n(r.metrics.contestable)} 的底池。`
        : `你在 ${s.position} 拿 ${hand}，再补 ${n(s.legal.callAmount)} 跟注，继续争夺 ${n(r.metrics.contestable)} 的底池。`;
  if (s.action === 'fold')
    return s.legal.canCheck
      ? `你拿 ${hand} 直接弃牌，但当时无需补筹码；过牌成本同样是 0，还能保留${s.street ? c.handLabel : '这手起手牌'}的获池机会。`
      : s.street
        ? `你在 ${s.position} 拿 ${hand}，在 ${f.boardText} 上是${c.handLabel}，选择弃牌，避免再补 ${n(s.legal.callAmount)}。${draw.outs ? '当前有' + drawLabel(draw) + '，' + draw.outs + '张改善候选，下一张约' + pct(draw.nextChance) + '。' : ''}`
        : `你在 ${s.position} 拿 ${hand}，选择弃牌，避免再补 ${n(s.legal.callAmount)}。`;
  return draw.outs
    ? `你拿 ${hand} 在 ${f.boardText} 上过牌，保留${drawLabel(draw)}的 ${draw.outs} 张改善候选，本次投入 0。${c.pendingOthers ? '本轮还有 ' + c.pendingOthers + ' 人能行动，因此不保证免费见下一张。' : '本轮没有待行动的对手，可以免费见下一张牌。'}`
    : `你拿 ${hand} 在 ${f.boardText} 上是${c.handLabel}，这次过牌没有增加投入。${s.street === 3 && r.metrics.closing ? '你是河牌最后行动者，过牌后直接摊牌。' : c.pendingOthers ? '本轮还有 ' + c.pendingOthers + ' 人能行动，过牌保留了面对他们下注再决定的机会。' : '对手本轮已行动，你选择保留当前底池大小。'}`;
}

export function continuationNote(s, c, closing) {
  if (
    s.action === 'fold' ||
    (s.action === 'raise' && s.amount === s.legal.maxRaiseTo) ||
    s.street !== 2 ||
    closing ||
    !c.draw.outs ||
    !c.inPosition ||
    c.opponents !== 1 ||
    c.effective <= s.legal.callAmount
  )
    return '';
  return `你在 ${s.position} 有位置，本次投入后还留 ${n(s.stack - c.extra)}；河牌没补成${drawLabel(c.draw)}时，若对手过牌，且河牌支持你代表顺子或同花，可以考虑转诈唬。对手继续下注时，就要按新的金额决定是否放弃。`;
}

export function publicHistory(s) {
  return (s.history || []).map((a, i) => ({
    street: streets[a.street],
    name:
      s.players?.find((p) => p.id === a.id)?.name ||
      s.opponents?.find((p) => p.id === a.id)?.name ||
      (a.id === 0 ? '你' : a.id === s.id ? s.actorName || s.name || '对手' : '对手'),
    action: historyActionLabel(s.history, i),
  }));
}
