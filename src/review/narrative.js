import { rankText } from '../engine/poker.js';
import { historyActionLabel } from '../engine/action-labels.js';
import { boardTexture } from './context.js';

const n = (value) => Math.round(value).toLocaleString('en-US');
const streets = ['翻牌前', '翻牌', '转牌', '河牌'];
export function drawLabel(draw) {
  const straight =
    { 'open-ended': '两头顺听牌', 'double-gutshot': '双卡顺听牌', gutshot: '卡顺听牌' }[
      draw.straightType
    ] || '顺子听牌';
  return [draw.flush ? '同花听牌' : '', draw.straight ? straight : ''].filter(Boolean).join(' + ');
}

// This module reads only the actor's before-action cards and public history.
// The opponent panel supplies that bot's own view after settlement.
export function situationNotes(s, c, actorId = 0) {
  const notes = [],
    draw = c.draw;
  if (draw.outs) {
    if (draw.straightRanks?.length)
      notes.push(`${draw.straightRanks.map(rankText).join(' / ')} 可补顺子。`);
    notes.push(
      `${drawLabel(draw)}共有 ${draw.outs} 张顺子／同花改善候选，重叠只算一次，成牌仍可能输。`,
    );
  }
  if (s.board.length)
    notes.push(
      `牌面是${c.texture.label}；当前${c.handLabel}${draw.outs ? '，同时保留听牌潜力' : ''}。`,
    );
  if (s.board.length >= 4) {
    const before = boardTexture(s.board.slice(0, -1)),
      last = s.board.at(-1);
    notes.push(
      c.texture.maxSuit > before.maxSuit && c.texture.maxSuit >= 3
        ? '新牌增加了同花威胁，之前的一对不能沿用原来的安全感。'
        : c.texture.connected > before.connected && c.texture.connected >= 3
          ? '新牌加强了顺子连接，先区分自己改善和对手也可能改善。'
          : s.board.slice(0, -1).some((card) => card.rank === last.rank)
            ? '新牌让公共牌配对，三条或葫芦风险需要重新考虑。'
            : s.hole.some((card) => card.rank === last.rank)
              ? '新牌击中底牌，但仍要核对踢脚和对手的更强成牌。'
              : '新牌没有直接配对底牌，也没有增加主要顺子或同花连接。',
    );
  }
  const history = s.history || [],
    aggression = history.filter((a) => a.id !== actorId && a.action === 'raise').at(-1);
  if (aggression) {
    const name = s.players?.find((p) => p.id === aggression.id)?.name || '对手';
    const prior = history
      .slice(0, history.indexOf(aggression))
      .filter((a) => a.id === aggression.id);
    const checks = [
      ...new Set(
        prior
          .filter((a) => a.action === 'check' && a.street < aggression.street)
          .map((a) => streets[a.street]),
      ),
    ];
    const streetRaises = history.filter((a) => a.id === aggression.id && a.action === 'raise');
    if (checks.length)
      notes.push(
        `${name}此前在${checks.join('、')}过牌，这次在${streets[aggression.street]}转为下注；可能是新牌改善、延迟取值或诈唬，过牌本身不能排除强牌。`,
      );
    else if (new Set(streetRaises.map((a) => a.street)).size >= 2)
      notes.push(`${name}已跨轮持续施压；继续时要考虑下一笔下注，不能只看眼前价格。`);
    else
      notes.push(
        `${name}的公开进攻是${historyActionLabel(history, history.indexOf(aggression))}；先前跟注不能替这次新增风险买单。`,
      );
  }
  if (s.street > 0)
    notes.push(
      c.inPosition
        ? '有最后行动优势，可以先观察对手再决定取值或施压；位置不会让对手必然弃牌。'
        : '没有最后行动优势，过牌或跟注后仍可能被后位施压。',
    );
  if (c.opponents > 1)
    notes.push(`还有 ${c.opponents} 位对手，下注更难让所有人退出，一对和非坚果听牌要更谨慎。`);
  const contestableOpponents =
    s.players?.filter((p) => p.id !== actorId && !p.folded) || s.opponents || [];
  if (contestableOpponents.length && contestableOpponents.every((p) => p.allin))
    notes.push('其余对手都已全下，之后没有向他们诈唬或继续取值的空间。');
  else if (c.effective <= (s.legal.callAmount || 0) && s.legal.callAmount)
    notes.push('有效后手接近这次跟注金额，后续隐含收益和诈唬空间都很有限。');
  return notes;
}

export function actionReason(s, r) {
  const c = r.context,
    cost = n(r.metrics.callCost),
    draw = c.draw;
  if (s.action === 'call' && draw.outs) {
    return `跟注 ${cost} 的支点是${drawLabel(draw)}，而非单靠${c.handLabel}摊牌。当前底池 ${n(s.pot)}、后手 ${n(s.stack)}。`;
  }
  if (s.action === 'raise' && draw.outs)
    return `这次进攻同时争取对手弃牌和${drawLabel(draw)}改善；被跟注后有退路，但非坚果成牌仍可能被反超。`;
  if (s.action === 'check' && draw.outs)
    return `过牌保留${drawLabel(draw)}的改善机会，避免主动做大底池；后面还有人能行动时，并不保证免费见下一张。`;
  return '';
}

export function continuationNote(s, c, closing) {
  if (
    s.street !== 2 ||
    closing ||
    !c.draw.outs ||
    !c.inPosition ||
    c.opponents !== 1 ||
    c.effective <= s.legal.callAmount
  )
    return '';
  return '河牌未中时，只有对手示弱、剩余筹码能形成压力且这张牌能支持你的强牌故事，才比较转诈唬；不能把尚未发生的弃牌算成跟注的保证收益。';
}

export function publicHistory(s) {
  return (s.history || []).map((a, i) => ({
    street: streets[a.street],
    name: s.players?.find((p) => p.id === a.id)?.name || (a.id === s.id ? '它' : '对手'),
    action: historyActionLabel(s.history, i),
  }));
}
