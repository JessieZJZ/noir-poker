import { compactChips } from '../engine/chip-format.js';
import { rankText } from '../engine/poker.js';
import { actionLabel } from '../engine/action-labels.js';
import { MOOD_LABELS } from '../engine/bot-profiles.js';
import { decisionContext } from './context.js';
import { drawLabel, publicHistory } from './narrative.js';
import { spotFacts } from './spot-facts.js';
import { handMatchups } from './matchups.js';

const pct = (v) => (v * 100).toFixed(1) + '%';
const n = compactChips;
export const BOT_REASON_NAMES = {
  'outside-range': '放弃这笔跟注',
  'insufficient-equity': '放弃这笔跟注',
  'stack-pressure': '保住后手，不接大额下注',
  'loose-exception': '用边缘牌宽跟',
  'premium-continue': '用强起手牌继续防守',
  'affordable-entry': '小投入跟入看翻牌',
  'affordable-open': '接小开池，保留翻牌机会',
  'small-reraise-continue': '接小尺度再加注',
  'price-continue': '跟注保留获池机会',
  'value-raise': '主动加注争取价值',
  'semi-bluff': '听牌半诈唬',
  'pure-bluff': '用诈唬争取对手弃牌',
  trap: '过牌埋牌，诱导下注',
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
function pocketComparison(v, name) {
  const rank = v.hole[0].rank;
  if (rank === 14) return `${name}的 AA 翻前领先其他起手牌，跟注可以留住对手较弱的牌`;
  if (rank === 13) return `${name}的 KK 领先 QQ 以下对子和多数高牌，但遇到 AA 仍明显落后`;
  return `${name}的口袋 ${rankText(rank)} 领先更小对子；遇到 ${rankText(rank + 1)}${rankText(rank + 1)} 及更大对子明显落后，遇到 AK 等两高张则常接近五五开`;
}

export function explainOpponent(record, identities = []) {
  const t = record.trace,
    v = {
      ...t.view,
      opponents: t.view.opponents?.map((p) => ({
        id: p.id,
        stack: p.stack,
        bet: p.bet,
        total: p.total,
        folded: p.folded,
        allin: p.allin,
        position: p.position,
        name: p.name || identities.find((identity) => identity.id === p.id)?.name,
      })),
    },
    actorId = v.id ?? record.id ?? 1,
    name = record.name || '对手';
  // Reuse the classifier with an actor-relative snapshot. Other hole cards stay unread.
  const opponents =
    v.opponents || Array.from({ length: v.rivals }, (_, i) => ({ id: i + 100, stack: v.stack }));
  const relativeIds = new Map([[actorId, 0], ...opponents.map((p, i) => [p.id, i + 1])]);
  const snapshot = {
    ...v,
    id: 0,
    action: record.action,
    amount: record.amount,
    players: [
      { id: 0, name, position: v.position, stack: v.stack },
      ...opponents.map((p, i) => ({ ...p, id: i + 1 })),
    ],
    opponents: undefined,
    allIn: v.allIn
      ? {
          ...v.allIn,
          aggressorId: relativeIds.get(v.allIn.aggressorId) ?? v.allIn.aggressorId,
          committedIds: v.allIn.committedIds?.map((id) => relativeIds.get(id) ?? id + 100),
          waitingIds: v.allIn.waitingIds?.map((id) => relativeIds.get(id) ?? id + 100),
          ranges: v.allIn.ranges.map((r) => ({ ...r, id: relativeIds.get(r.id) ?? r.id + 100 })),
        }
      : undefined,
    pending: (v.actionContext?.pendingResponseIds || [])
      .map((id) => relativeIds.get(id))
      .filter((id) => id !== undefined),
    history: v.history.map((a) => ({ ...a, id: relativeIds.get(a.id) ?? a.id + 100 })),
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
    aggression = f.lastAggression?.street === v.street ? f.lastAggression : null,
    prefix = v.street
      ? aggression
        ? `面对${aggression.name}的${aggression.label}，${name}在 ${v.position} 拿 ${f.holeText}，在 ${f.boardText} 上是${hand}，选择${actual}。`
        : `${name}在 ${v.position} 拿 ${f.holeText}，在 ${f.boardText} 上是${hand}，选择${actual}。`
      : aggression
        ? `面对${aggression.name}的${aggression.label}，${name}在 ${v.position} 拿 ${f.holeText}，选择${actual}。`
        : `${name}在 ${v.position} 拿 ${f.holeText}，选择${actual}。`,
    drawText = draw.outs
      ? `${name}在追${drawLabel(draw)}，共有 ${draw.outs} 张牌可能补成顺子／同花；其中有些补牌也会帮对手成更大的牌`
      : '',
    ownOpen = f.ownPreviousActions.find((a) => a.street === 0 && a.action === 'raise');
  let logic = '';
  const checkNotes = [];
  switch (t.reason) {
    case 'outside-range':
    case 'insufficient-equity':
      if (
        draw.outs &&
        (cost >= v.stack || (c.opponents === 1 && v.opponents?.every((p) => p.allin)))
      ) {
        const risk =
          cost >= v.stack
            ? '这笔跟注会把剩余筹码全部投入，当前牌力和补牌机会不足以承担这次风险。'
            : '对手已经全下，不能再施压；这次退出是因为当前牌力和追牌机会不足以支持这笔跟注。';
        logic = `${name}放弃用${drawLabel(draw)}追这笔下注，避免再投入 ${n(cost)}，保住剩下的 ${n(v.stack)}。${risk}`;
      } else
        logic = draw.outs
          ? `继续要补 ${n(cost)}；${drawText}。${c.opponents > 1 ? '还有多位对手留在底池，补中也可能遇到更大的成牌。' : '若没补中，当前牌力难以接住后续下注。'}因此${name}放弃这次追牌，保住剩下的 ${n(v.stack)}。`
          : !v.street
            ? c.tier >= 2
              ? `继续要补 ${n(cost)}，${name}这次防守较紧，放弃用${hand}接下这条加注线，保住剩下的 ${n(v.stack)}。`
              : `${name}拿${hand}继续要补 ${n(cost)}；${v.hole[0].rank === v.hole[1].rank ? '小对子没中暗三条时，遇到高张牌面和持续下注不容易继续' : '击中一对后仍可能被更大的对子或更好踢脚压住'}，因此选择退出底池。`
            : `继续要补 ${n(cost)}，${name}没有用${hand}接住这笔下注。${c.handClass === 'high' ? '当前没有对子，也没有直接顺子或同花听牌托底，因此放弃继续投入。' : '当前成牌仍可能遇到更大牌，这次选择收紧防守，保住剩余筹码。'}`;
      break;
    case 'stack-pressure':
      logic = `补 ${n(cost)} 会用掉${name}剩余 ${n(v.stack)} 的 ${pct(cost / Math.max(1, v.stack))}，${name}选择保住后手，没有接这笔大额投入。`;
      break;
    case 'loose-exception':
      logic = `这次补 ${n(cost)} 属于较松的跟注：${hand}的牌力支撑有限，但${name}仍选择留下来看牌，没有收紧防守。`;
      break;
    case 'premium-continue':
      logic = `${ownOpen ? name + '此前开池至 ' + n(ownOpen.amount) + '，' : ''}面对这次加注，${name}认为${hand}仍值得继续，因此${allinCall ? '把剩下的 ' + n(cost) + ' 全部跟进去' : '补上 ' + n(cost) + ' 保留摊牌机会'}。${v.hole[0].rank === v.hole[1].rank ? pocketComparison(v, name) : '这组高牌有机会击中顶对，但遇到大对子或相同高牌配更好踢脚时仍可能落后'}。`;
      break;
    case 'affordable-entry':
    case 'affordable-open':
      logic = `${name}只补 ${n(cost)}，还留 ${n(v.stack - cost)}；${v.hole[0].rank === v.hole[1].rank ? '这手对子可以等翻牌中暗三条' : v.hole[0].suit === v.hole[1].suit ? '两张同花底牌保留了翻后买同花的机会' : '这笔小投入保留了翻牌击中底牌的机会'}。因此选择跟入，而没有再加注做大底池。`;
      break;
    case 'small-reraise-continue':
      logic = `这是小尺度 3-bet 防守：只需再补 ${n(cost)}，跟完还留 ${n(v.stack - cost)}，因此${name}用${hand}继续看翻牌，争取击中对子或更强的牌。加注更大时，这手牌需要付出更多筹码，继续的理由就会变弱。`;
      break;
    case 'price-continue':
      if (
        t.allIn &&
        (allinCall || v.opponents?.some((p) => p.id === t.allIn.aggressorId && p.allin))
      ) {
        const continuation = [
          draw.outs && v.features?.ownMade ? `当前牌力是${hand}，另外还有${drawLabel(draw)}。` : '',
          allinCall
            ? '跟完就已全下，之后只能等发牌或摊牌，不能再靠下注赶走对手。'
            : '全下者已不能继续下注；只有其他尚有筹码的玩家也跟入时，后面才可能再争取边池。',
        ]
          .filter(Boolean)
          .join('');
        logic =
          draw.outs && !v.features?.ownMade
            ? `${name}接下这笔下注，需要再补 ${n(cost)}，可以争夺 ${n(t.allIn.contestable)} 的底池；这次底池赔率支持继续追${drawLabel(draw)}。${continuation}`
            : `${name}接下这笔下注，需要再补 ${n(cost)}，可以争夺 ${n(t.allIn.contestable)} 的底池；这次底池赔率支持用${hand}的摊牌价值继续。${continuation}`;
      } else
        logic = draw.outs
          ? `${name}跟注 ${n(cost)} 的目的不是只靠${hand}摊牌。${drawText}。${allinCall ? '跟完就全下，只能等发牌，不能再靠后街诈唬拿池。' : '跟完手里还留 ' + n(v.stack - cost) + '，下一街是否继续要看补牌和新的下注。'}`
          : `${v.street === 0 && v.hole[0].rank === v.hole[1].rank ? pocketComparison(v, name) : name + '认为当前的' + hand + '仍有摊牌机会'}，所以选择补 ${n(cost)}，继续争夺 ${n(v.contestable)} 的底池。`;
      break;
    case 'value-raise':
      if (!v.street) {
        const paired = v.hole[0].rank === v.hole[1].rank;
        const support = paired
          ? `${name}的${hand}能压过较小对子，所以选择加注，让较弱起手牌付费`
          : c.tier >= 2
            ? `${name}的${hand}有击中顶对的机会，手里的 ${rankText(Math.max(...v.hole.map((card) => card.rank)))} 也减少了对手部分强高牌组合，所以选择再加注施压`
            : `${name}的${hand}成牌质量较弱，这次进攻更依赖对手弃牌，被强牌跟住后会较难打`;
        logic = aggression
          ? `${name}没有只补 ${n(cost)} 跟注，而是再拿出 ${n(f.investment)} 把下注抬到 ${n(record.amount)}。${support}；对手若不愿继续付费，就会放弃当前 ${n(v.pot)} 的底池。`
          : `${name}用${hand}主动开池，拿出 ${n(f.investment)} 建立底池，希望较弱起手牌跟入；后面的玩家若不愿付这笔筹码，就会直接弃牌。`;
      } else if (c.made.score[0] >= 1 && !['board', 'board-pair'].includes(c.handClass))
        logic = `这是用${hand}取值：这次拿出 ${n(f.investment)}，希望更弱成牌${draw.outs || wet ? '或听牌' : ''}付费。${wet ? '牌面有同花或顺子连接，下注也让追牌的人付出成本。' : '牌面较干燥，价值主要来自更弱成牌的跟注。'}`;
      else
        logic = `${name}只有${hand}，却按价值牌进攻了 ${n(f.investment)}；没有明确的弱成牌付费依据，这次把牌力看得过于乐观。`;
      break;
    case 'semi-bluff':
      logic = `${name}用${drawLabel(draw)}半诈唬，这次拿出 ${n(f.investment)}：对手弃牌就拿走 ${n(v.pot)}，被跟住后仍有 ${draw.outs} 张改善候选。${c.opponents > 1 ? '当前有 ' + c.opponents + ' 位对手，想让所有人都弃牌更难。' : ''}`;
      break;
    case 'pure-bluff':
      logic = c.missedDraw
        ? `河牌 ${f.lastCardText} 没补成${name}的顺子或同花；${name}改用 ${n(f.investment)} 诈唬，目标是让更好的牌退出，已经没有下一张牌可买。`
        : `${name}用 ${n(f.investment)} 诈唬争取 ${n(v.pot)}，主要收益来自对手弃牌，${hand}本身不足以支撑价值下注。`;
      break;
    case 'trap':
    case 'strong-trap':
      logic = !v.street
        ? `这是强牌埋牌：${name}只补 ${n(cost)}，把强起手牌藏在平跟里，想留住开池者的弱牌和后面可能进池的人；还留 ${n(v.stack - cost)} 后手。`
        : record.action === 'check'
          ? `这是${hand}埋牌：在${c.texture.label}选择过牌，诱导对手主动下注。${v.street === 3 ? '这是河牌，收益要靠对手本轮下注；对手也过牌就直接摊牌。' : wet ? '湿润面暂时少收一街价值，还承担让听牌免费看牌的风险。' : '牌面较少直接听牌，暂时少收一街价值，换取对手继续投入的机会。'}`
          : `这是${hand}埋牌：只跟 ${n(cost)}，没有再加注赶走对手的弱牌或诈唬；还留 ${n(v.stack - cost)}，准备继续争取后街价值。`;
      break;
    case 'free-check':
      if (v.street > 0 && v.street < 3 && c.handClass === 'top-pair') {
        logic = `${name}的${hand}仍可向较弱的一对或听牌取值；过牌暂时少收这部分价值，并把较强牌保留在过牌范围中。`;
        checkNotes.push('过牌可以用于控池或诱导，但这次记录没有确认埋牌意图。');
        if (c.opponents > 1)
          checkNotes.push('多人底池里，一对并不是坚果，应避免让大底池只留下更强的继续范围。');
        if (wet) checkNotes.push('湿润面过牌的代价，是可能让顺子或同花听牌免费看下一张。');
        checkNotes.push(
          c.pendingOthers > 0
            ? '后位仍可下注；再遇下注时，应结合价格和范围重新判断。'
            : '本轮已没有待行动的对手，过牌不能诱导本轮下注，只能等待下一街。',
        );
      } else
        logic = draw.outs
          ? `当前不用补筹码。${drawText}，因此选择先过牌，没有主动增加追牌成本。`
          : `当前不用补筹码，${name}没有用${hand}主动做大 ${n(v.pot)} 的底池。${v.street === 3 ? '河牌已经没有补牌机会，因此选择保留摊牌价值。' : ''}`;
      break;
    case 'float-continue':
      logic = `这是 float：${name}在 ${v.position} 有位置，先补 ${n(cost)}，等下一街观察对手是否停止下注；牌面 ${f.boardText} 较干燥，${name}保留在对手过牌后下注拿池的机会。`;
      break;
    case 'pot-control':
      logic = `这是${hand}控池：底池已经有 ${n(v.pot)}，${name}过牌不再加大投入，保留当前牌力的摊牌机会。`;
      break;
    case 'thin-value':
      logic = `这是河牌薄价值下注：${name}用${hand}投入 ${n(f.investment)}，想从更弱的一对收取跟注；河牌 ${f.lastCardText} 已发出，没有再买牌的价值。`;
      break;
    case 'small-cbet':
      logic = `${name}是翻前进攻者，在 ${f.boardText} 这张干燥高牌面继续下注 ${n(f.investment)}；小尺度争取让没击中翻牌的牌弃掉，${hand}不等于一定击中了顶对。`;
      break;
    case 'dirty-open':
      logic = `这是脏牌开池：前面无人开池或跟入，${name}在 ${v.position} 用 ${n(f.investment)} 争取盲注 ${n(v.pot)}，主要靠后面的对手弃牌获利。${f.holeText}被跟住后，成牌质量较弱。`;
      break;
    case 'dirty-reraise':
      logic = `这是脏牌再加注：面对一次小开池且没有跟入者，${name}在 ${v.position} 用 ${n(f.investment)} 施压；手里的 ${rankText(Math.max(...v.hole.map((card) => card.rank)))} 阻断部分对手强牌组合，想直接拿走 ${n(v.pot)}。被跟住后，较弱踢脚仍会让${name}难打。`;
      break;
    case 'seven-two-bluff':
      logic =
        t.deception?.stage === 'opening'
          ? `这是 2–7 诈唬偷盲：${name}在 ${v.position} 用 ${n(f.investment)} 争取 ${n(v.pot)}，前面无人入池，靠后面的人弃牌获利。`
          : `这是 2–7 诈唬：单挑、有位置，对手本轮已经过牌；${name}在 ${f.boardText} 上用 ${n(f.investment)} 争取 ${n(v.pot)}，没有成牌或大听牌托底，主要赌对手愿意弃牌。`;
      break;
    case 'donk-lead':
      logic =
        t.deception?.kind === 'semi-bluff'
          ? `这是 donk 半诈唬：前一街进攻者还没行动，${name}先领打 ${n(f.investment)}。${drawText}。既想直接拿池，也保留被跟住后的补牌机会。`
          : t.deception?.kind === 'value' &&
              c.made.score[0] >= 1 &&
              !['board', 'board-pair'].includes(c.handClass)
            ? `这是 donk 价值下注：前一街进攻者还没行动，${name}用${hand}先领打 ${n(f.investment)}，让弱成牌和听牌付费，避免对手过牌后免费见下一张。`
            : `这是 donk：前一街进攻者还没行动，${name}就用${hand}领打 ${n(f.investment)}；当前没有强成牌托底，主要靠对手弃牌拿池。`;
      break;
    default:
      logic = `当前底池 ${n(v.pot)}，${name}选择以${hand}保留这条行动路线。`;
  }
  const reasons = [];
  if (t.exceptions?.length && t.reason !== 'loose-exception')
    reasons.push(
      `面对这笔加注，${name}选择较宽地继续；这手${hand}被更强的牌跟住后，仍会承受牌力不足的风险。`,
    );
  if (t.mode && t.mode !== 'off' && t.mood && t.mood.kind !== 'steady') {
    if (t.mood.kind === 'cautious')
      reasons.push(`${name}这次带有收紧避险倾向，选择时更看重控制投入。`);
    else if (record.action === 'call' || record.action === 'raise')
      reasons.push(
        `${name}这次带有${MOOD_LABELS[t.mood.kind]}倾向，因此更愿意继续跟注或主动进攻。`,
      );
  }
  const matchups = handMatchups(snapshot, c),
    recorded =
      t.basis?.version === 1 &&
      t.basis.action === record.action &&
      t.basis.reason === t.reason &&
      (record.action !== 'raise' || t.basis.amount === record.amount),
    source = recorded
      ? '依据当时记录的决策条件。'
      : '旧记录未保存完整决策依据，以下为当时信息下的推断。',
    squeeze =
      recorded && t.basis.squeeze ? '前面已有开池和跟注，这次再加注也在挤压两者的继续范围。' : '',
    paragraphs = [
      matchups?.text,
      '复盘分析总结',
      source,
      prefix,
      logic,
      ...checkNotes,
      squeeze,
    ].filter(Boolean);
  return {
    title:
      t.reason === 'value-raise' && ((!v.street && c.tier < 2) || (v.street && c.made.score[0] < 1))
        ? '弱牌主动施压'
        : BOT_REASON_NAMES[t.reason],
    detail: paragraphs.join(''),
    paragraphs,
    matchups,
    reasons,
    metrics: [],
    history: publicHistory(v),
    made: hand,
    warning: '',
  };
}
