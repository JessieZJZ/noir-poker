import { compactChips } from '../engine/chip-format.js';
import { rankText } from '../engine/poker.js';
import { actionLabel } from '../engine/action-labels.js';
import { MOOD_LABELS } from '../engine/bot-profiles.js';
import { decisionContext } from './context.js';
import { drawLabel, drawCompletion, publicHistory } from './narrative.js';
import { spotFacts } from './spot-facts.js';
import { rangeNoteClauses, handMatchups } from './matchups.js';
import { actorAtPosition, actorName } from '../engine/player-identity.js';
import { foldPressure, foldWinNote } from './presentation.js';

const pct = (v) => (v * 100).toFixed(1) + '%';
const n = compactChips;
export const BOT_REASON_NAMES = {
  'outside-range': '放弃这笔跟注',
  'insufficient-equity': '放弃这笔跟注',
  'stack-pressure': '保住后手，不接大额下注',
  'loose-exception': '用边缘牌宽跟',
  'premium-continue': '用强起手牌继续防守',
  'affordable-entry': '小投入跟注入池看翻牌',
  'affordable-open': '接小开池，保留翻牌机会',
  'small-reraise-continue': '接小尺度再加注',
  'price-continue': '跟注保留获池机会',
  'value-raise': '主动加注争取价值',
  'semi-bluff': '听牌半诈唬',
  'pure-bluff': '用诈唬争取对手弃牌',
  trap: '过牌埋牌，诱导下注',
  'free-check': '选择免费观察／控制底池',
  'float-continue': '有位置低成本跟注，保留后街进攻',
  'pot-control': '中等牌力手牌控制底池',
  'thin-value': '有位置河牌小尺度薄价值',
  'small-cbet': '干燥高牌翻牌小尺度持续下注',
  'strong-trap': '强牌埋牌／诱导',
  'dirty-open': '后位脏牌开池偷盲',
  'dirty-reraise': '高牌阻断的脏牌再加注',
  'donk-lead': '向前一街进攻者主动领打（donk）',
  'seven-two-bluff': '2–7 低频诈唬',
};
function pocketComparison(v, name) {
  const rank = v.hole[0].rank;
  if (rank === 14) return `${name}的 AA 是翻前最强起手牌，领先所有其他起手牌，有很强的摊牌竞争力`;
  if (rank === 13)
    return `${name}的 KK 是翻前仅次于 AA 的顶级起手牌，领先较小对子和多数高牌，有很强的摊牌竞争力`;
  if (rank === 2) return `${name}的 22 面对未成对高牌有摊牌机会，面对其他对子则处于不利位置`;
  return `${name}的口袋 ${rankText(rank)} 领先更小对子，遇到 ${rankText(rank + 1)}${rankText(rank + 1)} 及更大对子明显落后，遇到 AK 等两高张则常接近五五开`;
}

export function explainOpponent(record, identities = []) {
  const t = record.trace,
    v = {
      ...t.view,
      name: record.name,
      botProfile: t.profile,
      identities,
      opponents: t.view.opponents?.map((p) => ({
        id: p.id,
        stack: p.stack,
        bet: p.bet,
        total: p.total,
        folded: p.folded,
        allin: p.allin,
        position: p.position,
        name: p.name || identities.find((identity) => identity.id === p.id)?.name,
        botProfile: p.botProfile || identities.find((identity) => identity.id === p.id)?.botProfile,
      })),
    },
    actorId = v.id ?? record.id ?? 1,
    name = actorAtPosition(
      {
        ...v,
        players: [
          { id: record.id, name: record.name, botProfile: t.profile, position: v.position },
        ],
      },
      record.id,
    );
  const plainName = actorName(
    { ...v, players: [{ id: record.id, name: record.name, botProfile: t.profile }] },
    record.id,
  );
  // Reuse the classifier with an actor-relative snapshot. Other hole cards stay unread.
  const opponents =
    v.opponents || Array.from({ length: v.rivals }, (_, i) => ({ id: i + 100, stack: v.stack }));
  const relativeIds = new Map([[actorId, 0], ...opponents.map((p, i) => [p.id, i + 1])]);
  const snapshot = {
    ...v,
    id: 0,
    reviewSubject: plainName,
    action: record.action,
    amount: record.amount,
    players: [
      { id: 0, name: record.name, botProfile: t.profile, position: v.position, stack: v.stack },
      ...opponents.map((p, i) => ({ ...p, id: i + 1 })),
    ],
    opponents: undefined,
    identities: identities.map((p) => ({ ...p, id: relativeIds.get(p.id) ?? p.id + 100 })),
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
    hand =
      c.handClass === 'board'
        ? '公共牌的牌力'
        : c.handClass === 'board-pair'
          ? '公共牌组成的牌型与底牌踢脚'
          : c.handLabel.split('，')[0],
    summaryHand = draw.outs ? `${c.handLabel}，带${drawLabel(draw)}` : c.handLabel,
    cost = v.legal.callAmount,
    allinCall = record.action === 'call' && cost === v.stack,
    actual =
      record.action === 'call' &&
      !allinCall &&
      !(t.reason === 'price-continue' && draw.outs && !t.allIn) &&
      [
        'affordable-entry',
        'affordable-open',
        'small-reraise-continue',
        'price-continue',
        'trap',
        'strong-trap',
        'float-continue',
      ].includes(t.reason)
        ? '跟注'
        : actionLabel(snapshot),
    aggression = f.lastAggression?.street === v.street ? f.lastAggression : null,
    actionEnd = t.reason === 'price-continue' && draw.outs && !t.allIn ? '，' : '。',
    prefix = v.street
      ? aggression && actionEnd !== '，'
        ? `面对${aggression.name}的${aggression.label}，${name}拿 ${f.holeText}，在 ${f.boardText} 上是${summaryHand}，选择${actual}`
        : `${name}拿 ${f.holeText}，在 ${f.boardText} 上是${summaryHand}，选择${actual}`
      : `${name}拿 ${f.holeText}，选择${actual}`,
    drawText = draw.outs
      ? `共有 ${draw.outs} 张牌可能补成${drawCompletion(draw)}${c.texture.maxSuit >= 2 || c.texture.paired ? '，其中有些补牌也会帮对手成更大的牌' : ''}`
      : '',
    ownOpen = f.ownPreviousActions.find((a) => a.street === 0 && a.action === 'raise'),
    pressure = foldPressure(v, actorId),
    foldNote = pressure.hasAllInOpponent ? foldWinNote(v, actorId) : '',
    previousAggression = v.history.findLast(
      (a) => a.street === v.street - 1 && a.action === 'raise' && a.id !== actorId,
    ),
    previousAggressorAllIn = !!opponents.find((p) => p.id === previousAggression?.id && p.allin);
  const subject =
    record.pronoun === '她' ||
    v.pronoun === '她' ||
    record.gender === 'female' ||
    v.gender === 'female'
      ? '她'
      : '他';
  let logic = '',
    logicParts;
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
            : '对手已经全下，不能再施压，这次退出是因为当前牌力和追牌机会不足以支持这笔跟注。';
        logic = `${subject}放弃用${drawLabel(draw)}追这笔下注，避免再投入 ${n(cost)}，保住剩下的 ${n(v.stack)}。${risk}`;
      } else
        logic = draw.outs
          ? `继续要补 ${n(cost)}，追的是${drawLabel(draw)}，${drawText}。${c.opponents > 1 ? '还有多位对手留在底池，补中也可能遇到更大的成牌。' : '若没补中，当前牌力难以接住后续下注。'}因此${subject}放弃这次追牌，保住剩下的 ${n(v.stack)}。`
          : !v.street
            ? c.tier >= 2
              ? `继续要补 ${n(cost)}，${subject}这次防守较紧，放弃用${hand}接下这条加注线，保住剩下的 ${n(v.stack)}。`
              : `${subject}拿${hand}继续要补 ${n(cost)}，${v.hole[0].rank === v.hole[1].rank ? '小对子没中暗三条时，遇到高张牌面和持续下注不容易继续' : '击中一对后仍可能被更大的对子或更好踢脚压住'}，因此选择退出底池。`
            : `继续要补 ${n(cost)}，${subject}没有用${hand}接住这笔下注。${c.handClass === 'high' ? '当前没有对子，也没有直接顺子或同花听牌托底，因此放弃继续投入。' : '当前成牌仍可能遇到更大牌，这次选择收紧防守，保住剩余筹码。'}`;
      break;
    case 'stack-pressure':
      logic = `补 ${n(cost)} 会用掉${subject}剩余 ${n(v.stack)} 的 ${pct(cost / Math.max(1, v.stack))}，${subject}选择保住后手，没有接这笔大额投入。`;
      break;
    case 'loose-exception':
      logic = `这次属于较松的跟注：${hand}的牌力支撑有限，但${subject}仍选择继续争夺底池，没有收紧防守。`;
      break;
    case 'premium-continue':
      logic = `${ownOpen ? subject + '此前开池至 ' + n(ownOpen.amount) + '，' : ''}面对这次加注，${subject}认为${hand}仍值得继续，因此选择跟注保留摊牌机会。${v.hole[0].rank === v.hole[1].rank ? pocketComparison(v, subject) : v.hole.some((card) => card.rank === 14) && v.hole.some((card) => card.rank === 13) ? 'AK 击中 A 或 K 时有顶对顶踢脚潜力，未击中时仍需结合价格和对手范围判断' : '这组高牌有击中顶对的机会，仍需结合踢脚、价格和对手范围判断'}。`;
      break;
    case 'affordable-entry':
    case 'affordable-open':
      logic = `${subject}只补 ${n(cost)}，还留 ${n(v.stack - cost)}，${v.hole[0].rank === v.hole[1].rank ? (v.hole[0].rank >= 13 ? '这手顶级对子本身已有很强的摊牌价值，平跟保留了牌力隐蔽性，也让其他玩家低成本入池' : '这手对子可以等翻牌中暗三条') : v.hole[0].suit === v.hole[1].suit ? '两张同花底牌保留了翻后买同花的机会' : '这笔小投入保留了翻牌击中底牌的机会'}。因此选择跟注入池，而没有再加注做大底池。`;
      break;
    case 'small-reraise-continue':
      logic = `这是小尺度 3-bet 防守：只需再补 ${n(cost)}，跟完还留 ${n(v.stack - cost)}，因此${subject}用${hand}继续看翻牌，${v.hole[0].rank === v.hole[1].rank ? '争取补成暗三条，也保留这手对子本身的摊牌机会' : '争取击中对子或更强的牌'}。加注更大时，这手牌需要付出更多筹码，继续的理由就会变弱。`;
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
            : '全下者已不能继续下注，只有其他尚有筹码的玩家也跟注入池时，后面才可能再争取边池。',
        ]
          .filter(Boolean)
          .join('');
        logic =
          draw.outs && !v.features?.ownMade
            ? `${subject}接下这笔下注，需要再补 ${n(cost)}，可以争夺 ${n(t.allIn.contestable)} 的底池，这次底池赔率支持继续追${drawLabel(draw)}。${continuation}`
            : `${subject}接下这笔下注，需要再补 ${n(cost)}，可以争夺 ${n(t.allIn.contestable)} 的底池，这次底池赔率支持用${hand}的摊牌价值继续。${continuation}`;
      } else
        logic = draw.outs
          ? `${v.features?.ownMade ? '当前成牌已有摊牌机会，听牌提供额外改善' : '当前主要依靠听牌改善争取获胜'}，${drawText}。${allinCall ? '跟完就全下，只能等发牌，不能再靠后街诈唬拿池。' : '跟完手里还留 ' + n(v.stack - cost) + '，下一街是否继续要看当前成牌、补牌和新的下注。'}`
          : `${v.street === 0 && v.hole[0].rank === v.hole[1].rank ? pocketComparison(v, subject) : subject + '认为当前的' + hand + '仍有摊牌机会'}，所以选择补 ${n(cost)}，继续争夺 ${n(v.contestable)} 的底池。`;
      break;
    case 'value-raise':
      if (!v.street) {
        const paired = v.hole[0].rank === v.hole[1].rank;
        const premium = paired && v.hole[0].rank >= 13;
        const support = premium
          ? pocketComparison(v, subject)
          : paired
            ? `${subject}的${hand}能压过较小对子，也能领先尚未成对的两张高牌，所以选择加注，让这些牌为看翻牌付费，但遇到更大对子仍会明显落后`
            : c.tier >= 2
              ? `${subject}的${hand}有击中顶对的机会，手里的 ${rankText(Math.max(...v.hole.map((card) => card.rank)))} 也减少了对手部分强高牌组合，所以选择再加注施压`
              : `${subject}的${hand}成牌质量较弱，这次进攻更依赖对手弃牌，被强牌跟注后会较难打`;
        logic = premium
          ? `${support}。这次额外投入 ${n(f.investment)}，希望愿意继续的较小对子、AK 等高牌付出更多筹码，同时提高其他玩家继续入池的成本，争取减少对手人数。即使有人跟注，这手强牌仍足以支持主动争夺底池。`
          : aggression
            ? `${subject}没有只补 ${n(cost)} 跟注，而是再拿出 ${n(f.investment)} 把下注抬到 ${n(record.amount)}。${support}。${foldNote || '对手若不愿继续付费，就会放弃当前 ' + n(v.pot) + ' 的底池。'}`
            : `${subject}用${hand}主动开池，拿出 ${n(f.investment)} 建立底池，希望较弱起手牌跟注入池，后面的玩家若不愿付这笔筹码，就会直接弃牌。`;
      } else if (c.made.score[0] >= 1 && !['board', 'board-pair'].includes(c.handClass))
        logic = `这是用${hand}取值：这次拿出 ${n(f.investment)}，希望更弱成牌${v.street < 3 && (draw.outs || wet) ? '或听牌' : ''}付费。${v.street === 3 ? '河牌已经发完，价值来自较弱成牌愿意跟注。' : v.hole[0].rank === v.hole[1].rank && c.made.score[0] <= 2 ? '愿意继续的高张也需要付出筹码，不能免费观察下一张。' : wet ? '牌面有同花或顺子连接，下注也让追牌的人付出成本。' : '牌面较干燥，价值主要来自更弱成牌的跟注。'}`;
      else
        logic = `${subject}只有${hand}，却按价值牌进攻了 ${n(f.investment)}，没有明确的弱成牌付费依据，这次把牌力看得过于乐观。`;
      break;
    case 'semi-bluff':
      logic = pressure.hasAllInOpponent
        ? `${subject}用${drawLabel(draw)}半诈唬，这次拿出 ${n(f.investment)}。${foldNote}听牌仍有 ${draw.outs} 张改善候选。`
        : `${subject}用${drawLabel(draw)}半诈唬，这次拿出 ${n(f.investment)}：对手弃牌就拿走 ${n(v.pot)}，被跟注后仍有 ${draw.outs} 张改善候选。${c.opponents > 1 ? '当前有 ' + c.opponents + ' 位对手，想让所有人都弃牌更难。' : ''}`;
      break;
    case 'pure-bluff':
      logic = pressure.hasAllInOpponent
        ? `${subject}用 ${n(f.investment)} 诈唬，尝试让仍有筹码的对手放弃较好的牌。${foldNote}${v.street === 3 ? '河牌已发完，不能再靠补牌改善。' : '被继续后，当前牌力本身不足以支撑价值下注。'}`
        : c.missedDraw
          ? `河牌 ${f.lastCardText} 没补成${subject}的顺子或同花，${subject}改用 ${n(f.investment)} 诈唬，目标是让更好的牌退出，已经没有下一张牌可买。`
          : `${subject}用 ${n(f.investment)} 诈唬争取 ${n(v.pot)}，主要收益来自对手弃牌，${hand}本身不足以支撑价值下注。`;
      break;
    case 'trap':
    case 'strong-trap':
      logic = !v.street
        ? `这是强牌埋牌：${subject}只补 ${n(cost)}，把强起手牌藏在平跟里，想留住开池者的弱牌和后面可能进池的人，还留 ${n(v.stack - cost)} 后手。`
        : record.action === 'check'
          ? `这是${hand}埋牌：在${c.texture.label}选择过牌，诱导对手主动下注。${v.street === 3 ? '这是河牌，收益要靠对手本轮下注，对手也过牌就直接摊牌。' : wet ? '湿润面暂时少收一街价值，还承担让听牌免费看牌的风险。' : '牌面较少直接听牌，暂时少收一街价值，换取对手继续投入的机会。'}`
          : `这是${hand}埋牌：只跟 ${n(cost)}，没有再加注赶走对手的弱牌或诈唬，还留 ${n(v.stack - cost)}，准备继续争取后街价值。`;
      break;
    case 'free-check':
      if (v.street > 0 && v.street < 3 && c.handClass === 'top-pair') {
        logic = `${subject}的${hand}仍可向较弱的一对或听牌取值，过牌暂时少收这部分价值，并把较强牌保留在过牌范围中。`;
        if (c.pendingOthers > 0)
          checkNotes.push('过牌也可能是在等后位先下注，给对手继续投入的机会。');
        if (c.opponents > 1)
          checkNotes.push('多人底池里，一对并不是坚果，应避免让大底池只留下更强的继续范围。');
        if (wet) checkNotes.push('湿润面过牌的代价，是可能让顺子或同花听牌免费看下一张。');
        checkNotes.push(
          c.pendingOthers > 0
            ? '后位仍可下注，再遇下注时，应结合价格和范围重新判断。'
            : '本轮已没有待行动的对手，过牌不能诱导本轮下注，只能等待下一街。',
        );
      } else
        logic = draw.outs
          ? `可以直接过牌，不必再投入筹码，先过牌保留${drawLabel(draw)}的补牌机会，${drawText}。`
          : `可以直接过牌，不必再投入筹码。${subject}用${hand}控池，保留摊牌机会。${c.pendingOthers ? '后面仍有玩家可以下注，再遇下注时按价格重新判断。' : v.street === 3 ? '本轮行动结束后直接摊牌。' : '本轮行动结束后免费观察下一张公共牌。'}`;
      break;
    case 'float-continue':
      logic = pressure.hasAllInOpponent
        ? `这是 float：${plainName}在 ${v.position} 有位置，先补 ${n(cost)}，保留观察仍有筹码的对手是否停止下注、再决定是否施压的机会。${foldNote}`
        : `这是 float：${plainName}在 ${v.position} 有位置，先补 ${n(cost)}，等下一街观察对手是否停止下注，牌面 ${f.boardText} 较干燥，${subject}保留在对手过牌后下注拿池的机会。`;
      break;
    case 'pot-control':
      logic = `这是${hand}控池：底池已经有 ${n(v.pot)}，${subject}过牌不再加大投入，保留当前牌力的摊牌机会。`;
      break;
    case 'thin-value':
      logic = `这是河牌薄价值下注：${subject}用${hand}投入 ${n(f.investment)}，想从更弱的一对收取跟注，河牌 ${f.lastCardText} 已发出，没有再买牌的价值。`;
      break;
    case 'small-cbet':
      logic = pressure.hasAllInOpponent
        ? `${subject}是翻前进攻者，在 ${f.boardText} 上继续下注 ${n(f.investment)}，尝试让仍有筹码、尚未击中的对手退出，${hand}不等于一定击中了顶对。${foldNote}`
        : `${subject}是翻前进攻者，在 ${f.boardText} 这张干燥高牌面继续下注 ${n(f.investment)}，小尺度争取让没击中翻牌的牌弃掉，${hand}不等于一定击中了顶对。`;
      break;
    case 'dirty-open':
      logic = pressure.hasAllInOpponent
        ? `这是脏牌主动进攻：${plainName}在 ${v.position} 用 ${n(f.investment)} 施压，${f.holeText}被跟注后，成牌质量较弱。${foldNote}`
        : `这是脏牌开池：前面无人开池或跟注入池，${plainName}在 ${v.position} 用 ${n(f.investment)} 争取盲注 ${n(v.pot)}，主要靠后面的对手弃牌获利。${f.holeText}被跟注后，成牌质量较弱。`;
      break;
    case 'dirty-reraise':
      logic = pressure.hasAllInOpponent
        ? `这是脏牌再加注：${plainName}在 ${v.position} 用 ${n(f.investment)} 向仍有筹码的对手施压。${foldNote}被跟注后，较弱踢脚仍会让${subject}难打。`
        : `这是脏牌再加注：面对一次小开池且没有跟注入池者，${plainName}在 ${v.position} 用 ${n(f.investment)} 施压，手里的 ${rankText(Math.max(...v.hole.map((card) => card.rank)))} 阻断部分对手强牌组合，想直接拿走 ${n(v.pot)}。被跟注后，较弱踢脚仍会让${subject}难打。`;
      break;
    case 'seven-two-bluff':
      logic = pressure.hasAllInOpponent
        ? `这是 2–7 诈唬：${plainName}在 ${v.position} 用 ${n(f.investment)} 施压，当前没有成牌或大听牌托底。${foldNote}`
        : t.deception?.stage === 'opening'
          ? `这是 2–7 诈唬偷盲：${plainName}在 ${v.position} 用 ${n(f.investment)} 争取 ${n(v.pot)}，前面无人入池，靠后面的人弃牌获利。`
          : `这是 2–7 诈唬：单挑、有位置，对手本轮已经过牌，${subject}在 ${f.boardText} 上用 ${n(f.investment)} 争取 ${n(v.pot)}，没有成牌或大听牌托底，主要赌对手愿意弃牌。`;
      break;
    case 'donk-lead':
      logic =
        t.deception?.kind === 'semi-bluff'
          ? pressure.hasAllInOpponent
            ? `${previousAggressorAllIn ? '前一街进攻者已全下，这次是向仍有筹码的玩家下注，' : '这是 donk 半诈唬，'}${subject}用${drawLabel(draw)}先下注 ${n(f.investment)}，${drawText}。${foldNote}`
            : `这是 donk 半诈唬：前一街进攻者还没行动，${subject}用${drawLabel(draw)}先领打 ${n(f.investment)}，${drawText}。既想直接拿池，也保留被跟注后的补牌机会。`
          : t.deception?.kind === 'value' &&
              c.made.score[0] >= 1 &&
              !['board', 'board-pair'].includes(c.handClass)
            ? pressure.hasAllInOpponent
              ? `${previousAggressorAllIn ? '前一街进攻者已全下，' : ''}${subject}用${hand}主动下注 ${n(f.investment)}，向仍有筹码的较弱成牌或听牌取值，已全下者参与的底池仍需摊牌。`
              : `这是 donk 价值下注：前一街进攻者还没行动，${subject}用${hand}先领打 ${n(f.investment)}，让弱成牌和听牌付费，避免对手过牌后免费见下一张。`
            : pressure.hasAllInOpponent
              ? `${subject}用${hand}主动下注 ${n(f.investment)}，当前没有强成牌托底。${foldNote}`
              : `这是 donk：前一街进攻者还没行动，${subject}就用${hand}领打 ${n(f.investment)}，当前没有强成牌托底，主要靠对手弃牌拿池。`;
      break;
    default:
      logic = `当前底池 ${n(v.pot)}，${subject}选择以${hand}保留这条行动路线。`;
  }
  // Exhausting this actor's stack ends their decisions even when another
  // opponent can still respond or play a side pot. Do not reuse flat-call plans.
  if (allinCall) {
    const potential =
      !v.street && v.hole[0].rank === v.hole[1].rank
        ? pocketComparison(v, subject)
        : c.handClass === 'board'
          ? '底牌没有提高公共牌的牌力，这次主要争取平分底池'
          : draw.outs && v.features?.ownMade
            ? `当前牌力是${c.handLabel}，另外还有${drawLabel(draw)}，成牌和补牌都提供摊牌机会`
            : `${subject}用当前${hand}争取摊牌获胜`;
    logicParts = [
      t.reason === 'loose-exception' ? '这次是较松的全下跟注，当前牌力支撑有限。' : '',
      potential,
      '。',
      `可争夺 ${n(t.allIn?.contestable ?? v.contestable)} 的底池。`,
      '之后不再参与下注决策。',
      v.street < 3 ? '可以看完剩余公共牌，无需再支付筹码。' : '',
    ].filter(Boolean);
    logic = logicParts.join('');
    checkNotes.length = 0;
  }
  const reasons = [];
  if (t.exceptions?.length && t.reason !== 'loose-exception')
    reasons.push(
      `面对这笔加注，${name}选择较宽地继续，这手${hand}被更强的牌跟注后，仍会承受牌力不足的风险。`,
    );
  if (t.mode && t.mode !== 'off' && t.mood && t.mood.kind !== 'steady') {
    if (t.mood.kind === 'cautious')
      reasons.push(`${name}这次带有收紧避险倾向，选择时更看重控制投入。`);
    else if (record.action === 'call' || record.action === 'raise')
      reasons.push(
        `${name}这次带有${MOOD_LABELS[t.mood.kind]}倾向，因此更愿意继续跟注或主动进攻。`,
      );
  }
  const matchups = handMatchups({ ...snapshot, reviewPronoun: subject }, c),
    recorded =
      t.basis?.version === 1 &&
      t.basis.action === record.action &&
      t.basis.reason === t.reason &&
      (record.action !== 'raise' || t.basis.amount === record.amount),
    squeeze =
      recorded && t.basis.squeeze ? '前面已有开池和跟注，这次再加注也在挤压两者的继续范围。' : '',
    paragraphParts = [
      [matchups?.text],
      ['复盘分析总结'],
      ...(matchups?.rangeNotes || []).map(rangeNoteClauses),
      [prefix, actionEnd, ...(logicParts || [logic]), ...checkNotes, squeeze].filter(Boolean),
    ].filter((parts) => parts[0]),
    paragraphs = paragraphParts.map((parts) => parts.join(''));
  return {
    basisSource: recorded ? 'recorded' : 'inferred',
    title:
      t.reason === 'donk-lead' && previousAggressorAllIn
        ? '主动下注'
        : t.reason === 'value-raise' &&
            ((!v.street && c.tier < 2) || (v.street && c.made.score[0] < 1))
          ? '弱牌主动施压'
          : BOT_REASON_NAMES[t.reason],
    detail: paragraphs.join(''),
    paragraphs,
    paragraphParts,
    matchups,
    reasons,
    metrics: [],
    history: publicHistory(v),
    made: hand,
    warning: '',
  };
}
