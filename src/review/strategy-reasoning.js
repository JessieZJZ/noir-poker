import { compactChips } from '../engine/chip-format.js';
import { publicPostflopLine } from '../engine/public-story.js';
import { cardText } from './spot-facts.js';
import { REVIEW_TOPICS as TOPIC, proseCoverage } from './prose-topics.js';

const finite = (value) => Number.isFinite(value);
const mass = (value) => (finite(value) ? Math.max(0, value) : 0);
const suits = ['黑桃', '红桃', '梅花', '方块'];
const note = (topic, text, parts = [text]) => (text ? { topic, text, parts } : null);

function publicFacts(s, assessment, action, amount, plan, subject, includeAction) {
  const id = s.id ?? 0;
  const players = s.players || s.opponents || [];
  const opponents = players
    .filter((p) => p.id !== id && !p.folded && !p.out)
    .map((p) => ({ id: p.id, stack: p.stack ?? 0, allin: p.allin === true }));
  const stack = s.stack ?? players.find((p) => p.id === id)?.stack ?? 0;
  const call = Math.max(0, s.legal?.callAmount ?? assessment.call?.amount ?? 0);
  const street = s.street;
  const board = street > 0 ? (s.board || []).slice(0, street + 2) : [];
  const history = (s.history || [])
    .filter((a) => a.street <= street)
    .map(({ id, street, action, amount }) => ({ id, street, action, amount }));
  const own = history.filter((a) => a.id === id && a.street === street).at(-1);
  const checkRaise =
    action === 'raise' &&
    call > 0 &&
    own?.action === 'check' &&
    history
      .slice(history.indexOf(own) + 1)
      .some((a) => a.street === street && a.action === 'raise');
  const live = opponents.filter((p) => !p.allin && p.stack > 0);
  const closed =
    street >= 3 ||
    (call > 0 && call >= stack) ||
    (opponents.length > 0 && live.length === 0) ||
    ['actor-all-in', 'no-eligible-future-stack', 'no-future-street'].includes(
      assessment.call?.reason,
    );
  const draw = street > 0 && street < 3 ? assessment.draw || {} : {};
  return {
    id,
    subject,
    includeAction,
    street,
    board,
    history,
    opponents,
    live,
    canFaceCurrentBet:
      !Array.isArray(s.pending) || s.pending.some((id) => live.some((p) => p.id === id)),
    stack,
    call,
    cost: finite(assessment.call?.cost) ? assessment.call.cost : call,
    closed,
    allInAction:
      action === 'call'
        ? call >= stack
        : action === 'raise' && finite(amount) && amount - (s.bet ?? 0) >= stack,
    draw,
    hasDraw: !!(draw.flushDraw || draw.straightDraw || draw.comboDraw),
    checkRaise,
    action,
    amount,
    plan:
      plan?.action === action
        ? { kind: plan.kind, motive: plan.motive, rangeRead: plan.rangeRead }
        : null,
    label: checkRaise ? '过牌加注至' : call > 0 ? '加注至' : '下注至',
  };
}

function rangeNote(s, assessment, f) {
  const range = assessment.range;
  if (
    f.street < 1 ||
    f.opponents.length !== 1 ||
    !finite(range?.advantage) ||
    !finite(range?.uncertainty) ||
    range.uncertainty < 0 ||
    Math.abs(range.advantage) <= range.uncertainty + 0.02
  )
    return null;
  const preflop = f.history.filter((a) => a.street === 0);
  const own = preflop.findLast((a) => a.id === f.id && ['call', 'raise'].includes(a.action));
  const other = preflop.findLast((a) => a.id !== f.id && ['call', 'raise'].includes(a.action));
  if (!own || !other) return null;
  const ownLine = own.action === 'raise' ? '翻前加注' : '翻前跟注';
  const otherLine = other.action === 'raise' ? '加注' : '跟注';
  const ahead = range.advantage > 0;
  const context = `此前${f.subject}${ownLine}、对手${otherLine}，在 ${cardText(f.board)} 上，按这两条行动线估计，${f.subject}可能持有的整组牌整体${ahead ? '更强' : '较弱'}`;
  const consequence =
    f.action === 'raise'
      ? ahead
        ? '这次下注有整组牌的优势支持，仍要给较弱牌留下继续空间。'
        : '这次加注需要当前手牌的取值或弃牌空间支持，不能只靠前面的主动权。'
      : f.action === 'fold'
        ? '弃牌保留还未投入的筹码，不为前面的投入继续付费。'
        : f.action === 'call'
          ? f.closed
            ? '跟注后只按最终摊牌结果分配底池。'
            : '跟注先限制这次投入，后续若再加压仍要重新比较价格。'
          : f.closed
            ? '过牌不增加投入，之后按最终摊牌结果分配底池。'
            : '过牌保留后手，后续按新的牌面和下注决定是否继续。';
  return note('range', `${context}；${consequence}`, [context, '；', consequence]);
}

function payingNote(assessment, f) {
  if (f.action !== 'raise' || !finite(f.amount)) return null;
  const options = assessment.options || [];
  const selected = options.find((o) => o.amount === f.amount);
  if (!selected) return null;
  const made = mass(selected.worseMadeCallMass);
  const draw = f.street < 3 ? mass(selected.drawCallMass) : 0;
  const targets =
    made >= 0.04 && draw >= 0.04
      ? '较弱成牌和听牌'
      : made >= 0.04
        ? '较弱成牌'
        : draw >= 0.04
          ? '听牌'
          : '';
  if (!targets) return null;
  const larger = options
    .filter((o) => o.amount > selected.amount)
    .sort((a, b) => a.amount - b.amount)
    .find(
      (o) =>
        (made >= 0.04 && made - mass(o.worseMadeCallMass) > 0.04) ||
        (draw >= 0.04 && draw - mass(o.drawCallMass) > 0.04),
    );
  if (!larger) return null;
  const lost = larger ? (made - mass(larger.worseMadeCallMass) > 0.04 ? '较弱成牌' : '听牌') : '';
  const main = `按这个尺度的继续范围估计，仍有${targets}可能付费。`;
  const comparison = larger ? `再加大到 ${compactChips(larger.amount)}，会更容易赶走${lost}。` : '';
  const prefix = f.includeAction ? `${f.label} ${compactChips(f.amount)}，` : '';
  const parts = [prefix, main, comparison].filter(Boolean);
  return note('paying-range', parts.join(''), parts);
}

function checkedReadingNote(assessment, f) {
  if (f.action !== 'raise' || !f.plan || !f.live.length) return null;
  const selected = assessment.options?.find((option) => option.amount === f.amount);
  if (!selected) return null;
  const current = f.history.filter((event) => event.street === f.street);
  const checkedTo =
    !current.some((event) => event.action === 'raise') &&
    f.live.every((player) =>
      current.some((event) => event.id === player.id && event.action === 'check'),
    );
  if (f.plan.kind === 'checked-value-protection' && checkedTo) {
    const draw = f.street < 3 && mass(selected.drawCallMass) >= 0.04;
    const made = mass(selected.worseMadeCallMass) >= 0.04;
    if (!draw && !made) return null;
    const targets = draw && made ? '较弱成牌和听牌' : draw ? '听牌' : '较弱成牌';
    return note(
      'checked-range',
      `对手本轮均已过牌，${f.subject}估计${targets}仍可能付费，因此主动下注取值${draw ? '并收取看下一张的成本' : ''}。`,
    );
  }
  const previous = f.history.filter((event) => event.street === f.street - 1);
  const prior =
    f.plan.rangeRead === 'prior-checkthrough-marginal-or-unmade' &&
    !previous.some((event) => event.action === 'raise') &&
    !current.some((event) => event.action === 'raise') &&
    f.live.every((player) =>
      previous.some((event) => event.id === player.id && event.action === 'check'),
    );
  if (
    !f.hasDraw ||
    (!checkedTo && !prior) ||
    !['checked-marginal-or-unmade', 'prior-checkthrough-marginal-or-unmade'].includes(
      f.plan.rangeRead,
    )
  )
    return null;
  const prefix = prior ? '对手上一街均未下注，本轮也尚未加压' : '对手本轮均已过牌';
  return note(
    'checked-range',
    `${prefix}，${f.subject}按这些行动估计对手仍有较多中等成牌和未成牌，带听牌主动施压，争取直接收池或补牌改善。`,
  );
}

function impliedNote(assessment, f) {
  if (!['call', 'fold'].includes(f.action) || !f.call || f.street >= 3) return null;
  const call = assessment.call || {};
  if (!f.hasDraw && !call.pairMining) return null;
  if (f.closed && f.covered.has(TOPIC.CLOSURE)) return null;
  if (f.closed)
    return note(
      'implied-odds',
      f.action === 'call'
        ? `跟注 ${compactChips(f.cost)} 后已没有后续下注，必须靠当前底池的最终获胜机会支持，不能指望补中后再收筹码。`
        : `这次跟注要付 ${compactChips(f.cost)}，之后已没有额外筹码可赚；弃牌保留这笔钱，不把补中后的取值当作继续理由。`,
    );
  if (!call.eligible || !(call.futurePayBound > 0) || !(call.impliedValue > 0)) return null;
  const short = finite(call.equity) && finite(call.price) && call.equity < call.price;
  const improvement = call.pairMining ? '中暗三条' : '补中';
  if (f.action === 'fold')
    return short
      ? note(
          'implied-odds',
          `按当前范围估计，跟注 ${compactChips(f.cost)} 还依赖${improvement}后有人付费；弃牌避免把这笔不确定的未来收入当作已经到手的筹码。`,
        )
      : null;
  if (f.covered.has(TOPIC.FUTURE_COST))
    return note(
      'implied-odds',
      short
        ? `按当前范围估计，这次跟注还需要${improvement}后从较弱牌收取筹码。`
        : `${improvement}后的额外收入取决于较弱牌是否愿意付费。`,
    );
  return note(
    'implied-odds',
    !f.includeAction && !short
      ? '补中后的额外收入取决于较弱牌是否愿意付费，当前跟注只补齐本轮。'
      : short
        ? `按当前范围估计，跟注 ${compactChips(f.cost)} 还需要${improvement}后从较弱牌收取筹码；这笔钱只补齐本轮，下一街再被下注仍要另算成本。`
        : `跟注 ${compactChips(f.cost)} 先按当前底池的价格判断，${improvement}后的额外收入取决于较弱牌是否愿意付费；这笔钱只补齐本轮，下一街再被下注仍要另算成本。`,
  );
}

function drawNote(s, f) {
  if (!f.hasDraw) return null;
  const name = f.draw.nutFlushDraw
    ? f.draw.comboDraw
      ? '最大同花听牌兼顺子听牌'
      : '最大同花听牌'
    : f.draw.comboDraw
      ? '顺子和同花双听牌'
      : f.draw.flushDraw
        ? '同花听牌'
        : '顺子听牌';
  const target = f.draw.comboDraw ? '同花或顺子' : f.draw.flushDraw ? '同花' : '顺子';
  const risk = f.draw.pairedBoard
    ? `公共牌已配对，补成${target}仍可能输给葫芦、四条。`
    : f.draw.nutFlushDraw
      ? '补中时能争取最大同花，仍要随新牌面判断。'
      : '补成目标牌型后，仍要确认有没有更强的牌。';
  const standaloneHeading = `${cardText(s.hole)} 带${name}。`;
  // The primary reason already gave the actual outs and improvement chances.
  // Add only genuinely new draw quality or paired-board risk in this layer.
  if (f.covered.has(TOPIC.DRAW)) {
    const parts = [
      f.draw.nutFlushDraw && !f.covered.has(TOPIC.NUT_DRAW) ? standaloneHeading : '',
      f.draw.pairedBoard && !f.covered.has(TOPIC.PAIRED_DRAW_RISK) ? risk : '',
    ].filter(Boolean);
    // These are complete facts, not a heading waiting for a route. In
    // particular, a paired-board risk must never be replaced by a draw label.
    return parts.length ? { ...note('draw-plan', parts.join(''), parts), drawRisk: risk } : null;
  }
  let route;
  if (f.action === 'raise')
    route = f.live.length
      ? f.allInAction
        ? f.includeAction
          ? `${f.label} ${compactChips(f.amount)}，可向仍有筹码的对手争取弃牌；被跟注后就按最终摊牌结果分池。`
          : '可向仍有筹码的对手争取弃牌；被跟注后就按最终摊牌结果分池。'
        : f.includeAction
          ? `${finite(f.amount) ? f.label + ' ' + compactChips(f.amount) : f.label.replace(/至$/, '')}，既保留改善机会，也向仍有筹码的对手施压；被跟注后，下一张没改善或再遭加注时要重新比较价格。`
          : '既保留改善机会，也向仍有筹码的对手施压；被跟注后，下一张没改善或再遭加注时要重新比较价格。'
      : '这次加注无法让已全下的对手弃牌，仍要靠最终摊牌获胜。';
  else if (f.action === 'call')
    route = f.closed
      ? '跟注后直接比较最终摊牌机会。'
      : '跟注保留改善机会，下一张没改善且再遇大额下注时，可重新比较弃牌。';
  else if (f.action === 'check')
    route =
      !f.live.length || f.stack <= 0
        ? '无需追加筹码，等待后续公共牌与摊牌。'
        : !f.canFaceCurrentBet
          ? '本轮已无人再行动，过牌可免费见下一张；进入下一街后再按牌面与下注判断。'
          : f.plan?.kind === 'check-for-raise'
            ? '先过牌；若对手下注，再按价格与弃牌空间比较过牌加注，对手过牌则在下一张后重估。'
            : '先过牌保留改善机会；对手随后下注时，再按金额和继续范围比较跟注、加注或弃牌。';
  else route = '弃牌保留尚未投入的筹码，不因听牌潜力承诺继续付费。';
  if (
    f.action === 'call' &&
    ((f.closed && f.covered.has(TOPIC.CLOSURE)) || (!f.closed && f.covered.has(TOPIC.FUTURE_COST)))
  )
    route = '';
  if (!f.includeAction && f.action === 'raise' && f.opponents.every((p) => !p.allin))
    route = f.allInAction
      ? '对手全部弃牌可直接拿池；被跟注后就按最终摊牌结果分池。'
      : '对手全部弃牌可直接拿池；被跟注后，下一张没改善或再遭加注时要重新比较价格。';
  const heading = `${cardText(s.hole)} 带${name}，`;
  const parts = route ? [heading, route, risk] : [standaloneHeading, risk];
  return {
    ...note('draw-plan', parts.join(''), parts),
    headingPrefix: parts[0],
    standaloneHeading,
    drawRisk: risk,
  };
}

function continuationNote(f) {
  if (f.hasDraw || f.closed || f.allInAction || f.covered.has(TOPIC.FUTURE_COST)) return null;
  if (f.action === 'check' && f.canFaceCurrentBet && f.plan?.kind === 'check-for-raise')
    return note(
      'continuation',
      '先过牌给对手下注的机会；只有他下注后仍有较弱牌会继续，且价格合适，再比较过牌加注，若他过牌就在下一张后重估。',
    );
  if (f.action === 'raise' && f.checkRaise && f.plan?.kind === 'check-raise-value')
    return note(
      'continuation',
      f.includeAction
        ? `过牌加注至 ${compactChips(f.amount)}，向愿意继续的较弱牌取值；被跟注后若新牌补出明显听牌，或再遇大额加注，要重新判断牌力与价格。`
        : '向愿意继续的较弱牌取值；被跟注后若新牌补出明显听牌，或再遇大额加注，要重新判断牌力与价格。',
    );
  if (f.action === 'raise' && ['range-bet', 'checkraise-followthrough'].includes(f.plan?.kind))
    return note(
      'continuation',
      '这次下注尝试让更好的牌弃掉；若被跟注，下一张必须重新判断对手留下的范围，不自动继续下注。',
    );
  return null;
}

function bluffCatchNote(s, assessment, f, observer = false) {
  if (f.covered.has(TOPIC.RIVER_RANGE)) return null;
  if (f.street !== 3 || !f.call || !['call', 'fold'].includes(f.action)) return null;
  const category = assessment.draw?.madeCategory;
  if (!finite(category) || category < 1 || category > 3) return null;
  const last = f.history.findLast((a) => a.id !== f.id && a.street === 3 && a.action === 'raise');
  if (!last) return null;
  const line = publicPostflopLine(
    { street: f.street, board: f.board, history: f.history, pot: s.pot, bigBlind: s.bigBlind },
    last.id,
  );
  if (new Set(line.map((a) => a.street)).size < 2) return null;
  const suit = [0, 1, 2, 3].find(
    (value) => f.board.slice(0, 4).filter((c) => c.suit === value).length === 2,
  );
  if (suit === undefined) return null;
  const completed = f.board.filter((c) => c.suit === suit).length === 3;
  const story = completed
    ? `河牌补出第三张${suits[suit]}，此前的同花听牌可成为价值牌`
    : `河牌没有补出第三张${suits[suit]}，对手这条线仍可能有落空同花听牌转成的诈唬`;
  const value = line.some((a) => a.action === 'check-raise')
    ? '前面的过牌加注也可能来自强成牌'
    : '同一条下注线也保留强成牌';
  const route =
    f.action === 'call'
      ? completed
        ? observer
          ? '这次跟注依靠范围中仍存在的诈唬或较弱取值，已补成的同花属于更强价值牌。'
          : `跟注 ${compactChips(f.cost)} 需要其余诈唬或较弱取值支撑，不能再把这些同花当作落空牌。`
        : `跟注 ${compactChips(f.cost)} 是抓这些诈唬，仍会输给其中的强成牌。`
      : `弃牌放弃抓诈唬，保留还需支付的 ${compactChips(f.cost)}。`;
  if (observer) {
    const parts = [story, '，', value, '。', route];
    return note('bluff-catch', parts.join(''), parts);
  }
  return note('bluff-catch', `${story}，${value}；${route}`);
}

// An observer gets the recorded action's support and tradeoffs, never a list
// of instructions for what that opponent should do on the next card.
function observerNotes(s, assessment, f) {
  const reading = checkedReadingNote(assessment, f);
  const paying = payingNote(assessment, f);
  const range = rangeNote(s, assessment, f);
  const rangeFact = range && note('range', range.parts[0] + '。', [range.parts[0], '。']);
  const call = assessment.call || {};
  const implied =
    f.action === 'call' &&
    !f.closed &&
    call.eligible &&
    call.futurePayBound > 0 &&
    call.impliedValue > 0 &&
    (f.hasDraw || call.pairMining)
      ? note(
          'implied-odds',
          `${f.subject}这次跟注还保留了${call.pairMining ? '中暗三条' : '补中'}后向较弱牌取值的机会。`,
        )
      : null;
  const sourceDraw = drawNote(s, f);
  const drawRoute =
    f.action === 'raise'
      ? f.live.length
        ? '这次进攻同时争取对手弃牌和补牌改善。'
        : '这次加注无法让已全下的对手弃牌。'
      : f.action === 'call'
        ? '这次跟注保留了听牌的改善机会。'
        : f.action === 'check'
          ? '过牌保留改善机会，也没有主动扩大底池。'
          : '这次弃牌放弃了听牌的改善机会。';
  const drawParts =
    sourceDraw &&
    (f.covered.has(TOPIC.DRAW)
      ? sourceDraw.parts
      : [sourceDraw.headingPrefix, drawRoute, f.draw.pairedBoard ? sourceDraw.drawRisk : '']);
  const draw = drawParts && {
    ...note('draw-plan', drawParts.join(''), drawParts.filter(Boolean)),
    headingPrefix: sourceDraw.headingPrefix,
    standaloneHeading: sourceDraw.standaloneHeading,
  };
  const continuation =
    !f.closed &&
    !f.allInAction &&
    f.action === 'check' &&
    f.canFaceCurrentBet &&
    f.plan?.kind === 'check-for-raise'
      ? note('continuation', '这次过牌保留了对手下注后再加注的空间。')
      : f.action === 'raise' && f.checkRaise && f.plan?.kind === 'check-raise-value'
        ? note('continuation', '这次过牌加注向愿意继续的较弱牌取值。')
        : null;
  const bluffCatch = bluffCatchNote(s, assessment, f, true);
  const ordered =
    f.action === 'raise'
      ? [reading || draw, paying, continuation, rangeFact]
      : f.action === 'check'
        ? [continuation, draw, rangeFact]
        : f.action === 'fold'
          ? [bluffCatch]
          : [bluffCatch, implied, draw];
  return ordered.filter(Boolean).slice(0, 2);
}

/**
 * At most two mergeable player-facing clauses. `assessment` is a public
 * strategy assessment; only its named range/response/draw fields are read.
 * `plan` contributes kind/action/motive only, never a private trace or prose.
 * Topics: range, paying-range, implied-odds, draw-plan, continuation, bluff-catch.
 */
export function strategyNotes(
  s,
  assessment,
  {
    action = s.action,
    amount = s.amount,
    plan,
    subject = '你',
    includeAction = true,
    audience = 'decision',
    coveredTopics = [],
  } = {},
) {
  if (!assessment || !['check', 'call', 'fold', 'raise'].includes(action)) return [];
  const f = publicFacts(s, assessment, action, amount, plan, subject, includeAction);
  f.covered = proseCoverage(coveredTopics);
  if (audience === 'observer') return observerNotes(s, assessment, f);
  const reading = checkedReadingNote(assessment, f);
  const paying = payingNote(assessment, f);
  const implied = impliedNote(assessment, f);
  // Standalone callers also get the closing fact only once. The host coaching
  // paragraph normally owns it, but an implied-odds warning can own it here.
  if (implied && f.closed) f.covered.add(TOPIC.CLOSURE);
  if (implied && !f.closed && includeAction) f.covered.add(TOPIC.FUTURE_COST);
  const draw = drawNote(s, f);
  const bluffCatch = bluffCatchNote(s, assessment, f);
  const continuation = continuationNote(f);
  const range = rangeNote(s, assessment, f);
  const ordered =
    action === 'raise'
      ? [reading || draw, paying, continuation, range]
      : action === 'check'
        ? [draw, continuation, range]
        : action === 'fold'
          ? [bluffCatch, implied]
          : [bluffCatch, implied, draw];
  return ordered.filter(Boolean).slice(0, 2);
}
