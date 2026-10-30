import { compactChips as n } from '../engine/chip-format.js';

export function currentStreetCallers(snapshot) {
  const actions = (snapshot.history || []).filter((a) => a.street === snapshot.street);
  const lastRaise = actions.findLastIndex((a) => a.action === 'raise');
  if (lastRaise < 0) return 0;
  return new Set(
    actions
      .slice(lastRaise + 1)
      .filter((a) => a.action === 'call' && a.id !== (snapshot.id ?? 0) && a.amount > 0)
      .map((a) => a.id),
  ).size;
}

export function straightSplitReason(snapshot, context, matchups) {
  const stronger = new Set(matchups?.strongerMadeCategories || []);
  return snapshot.street === 3 &&
    context.made?.score[0] === 4 &&
    stronger.size === 1 &&
    stronger.has(4) &&
    matchups.tied?.length
    ? `${snapshot.reviewSubject || '对手'}的顺子可与 ${matchups.tied[0].text} 平分，只输给更高顺子，这次弃牌也放弃了平分底池的机会。`
    : '';
}

// Explain the recorded range/price decision without pretending its heuristic
// is a solved fold or knowing which candidate the opponent actually holds.
export function defenseReason(snapshot, context, matchups) {
  const cost = snapshot.callPrice?.cost ?? snapshot.legal.callAmount;
  const pot = snapshot.callPrice?.contestable ?? snapshot.contestable;
  const clauses = [
    `继续要补 ${n(cost)}，可争夺跟注后的 ${n(pot)} 底池，当前保本门槛为 ${((cost / Math.max(1, pot)) * 100).toFixed(1)}%。`,
  ];
  if (!snapshot.street) {
    if (
      snapshot.reviewAudience === 'observer' &&
      snapshot.allIn?.pendingBuffer > 0 &&
      context.pendingOthers > 0
    )
      clauses.push(
        `${snapshot.reviewSubject || '对手'}担心后面 ${context.pendingOthers} 位尚未回应这次全下的玩家会用强牌跟入，因此收紧了继续范围。`,
      );
    else clauses.push('这次没有用当前起手牌接下这条加注线。');
    if (snapshot.allIn?.line === 'multi-raise-shove' && snapshot.allIn.depthBB > 110)
      clauses.push('这次弃牌侧重防守前面多次加注后的强范围，没有接下深筹码全下。');
    return clauses;
  }
  const examples = (matchups?.behind || []).slice(0, 2);
  const subject = snapshot.reviewSubject || '对手';
  const represented = new Set(examples.map((hand) => hand.score[0]));
  const stronger = new Set(matchups?.strongerMadeCategories || []);
  const split = straightSplitReason(snapshot, context, matchups);
  if (split) clauses.push(split);
  const streetActions = snapshot.history.filter((a) => a.street === snapshot.street);
  const lastRaise = streetActions.findLastIndex((a) => a.action === 'raise');
  const callers = currentStreetCallers(snapshot);
  if (lastRaise >= 0 && callers)
    clauses.push(
      `${subject}看到本街下注后已有 ${callers} 位对手跟注，把这条多人继续路线估得偏强，因此收紧了防守范围。`,
    );
  const remaining = [
    [5, '同花'],
    [4, '顺子'],
    [6, '葫芦'],
    [7, '四条'],
  ]
    .filter(([category]) => stronger.has(category) && !represented.has(category))
    .slice(0, 2)
    .map(([, label]) => label);
  if (examples.length) {
    const extra = remaining.length ? `，也可能落后于${remaining.join('、')}` : '';
    clauses.push(
      `${subject}判断自己可能落后于 ${examples.map((example) => `${example.text}（${example.label}）`).join('、')}${extra}。`,
    );
  }
  const postflop = snapshot.history.filter((a) => a.street > 0);
  const previous = postflop.slice(
    0,
    postflop.findLastIndex((a) => a.action === 'raise'),
  );
  if (previous.length && previous.every((a) => a.action === 'check'))
    clauses.push('此前一路过牌，当前下注范围仍可能同时包含慢打强牌、较弱成牌和诈唬。');
  if (
    callers &&
    snapshot.street < 3 &&
    cost < snapshot.stack &&
    !snapshot.callPrice?.closing &&
    (snapshot.players || []).some(
      (p) => p.id !== (snapshot.id ?? 0) && !p.folded && !p.allin && p.stack > 0,
    )
  )
    clauses.push(
      `${subject}也把跟注后仍可能面对的后街下注计入了这次收紧的考虑，没有只按眼前的跟注门槛继续。`,
    );
  if (context.pendingOthers)
    clauses.push(
      cost >= snapshot.stack
        ? `${subject}若跟注即已全下，其余玩家仍可回应，但本人不再需要补筹码。`
        : '其余玩家仍可跟注或加注，当前底池赔率不代表后续投入已经封顶。',
    );
  return clauses;
}
