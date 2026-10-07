import {
  getBotProfile,
  freshBotMood,
  freshBotStats,
  sanitizeBotSettings,
  decayBotMood,
  finishBotHand,
  recordPressureFold,
  MOOD_LABELS,
  botBoardFeatures,
  chooseBotAction,
  effectiveBotAxes,
} from './bot-profiles.js';
import { raiseCaption } from './action-labels.js';
export const SUITS = ['♠', '♥', '♣', '♦'];
export const RANK_NAMES = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
];
export const rankText = (r) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r);
export const deckOfCards = () =>
  SUITS.flatMap((s, suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      rank: i + 2,
      suit,
      symbol: s,
      key: suit + '-' + (i + 2),
    })),
  );
function shuffle(a, random = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
function evaluateFive(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a),
    unique = [...new Set(ranks)];
  const flush = cards.every((c) => c.suit === cards[0].suit);
  let straight = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0] : 0;
  if (unique.join(',') === '14,5,4,3,2') straight = 5;
  const groups = [...new Set(ranks)]
    .map((r) => [r, ranks.filter((v) => v === r).length])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return [
      2,
      Math.max(groups[0][0], groups[1][0]),
      Math.min(groups[0][0], groups[1][0]),
      groups[2][0],
    ];
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  return [0, ...ranks];
}
export function evaluate(cards) {
  if (cards.length < 5) {
    const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
    return {
      score: [ranks.length === 2 && ranks[0] === ranks[1] ? 1 : 0, ...ranks],
      label: ranks.length === 2 && ranks[0] === ranks[1] ? '口袋对子' : '高牌',
      cards,
    };
  }
  let best = null,
    bestCards = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const picked = [cards[a], cards[b], cards[c], cards[d], cards[e]],
              score = evaluateFive(picked);
            if (!best || compare(score, best) > 0) {
              best = score;
              bestCards = picked;
            }
          }
  return {
    score: best,
    label: best[0] === 8 && best[1] === 14 ? '皇家同花顺' : RANK_NAMES[best[0]],
    cards: bestCards,
  };
}
export function newGame(playerCount = 6) {
  if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 9)
    throw Error('牌桌人数须为 5–9 人。');
  return {
    players: ['你', 'Mia', 'Alex', 'River', 'Kai', 'Luna', 'Theo', 'Jade', 'Leo']
      .slice(0, playerCount)
      .map((name, id) => ({
        id,
        name,
        stack: 5000,
        hole: [],
        folded: false,
        allin: false,
        bet: 0,
        total: 0,
        actedTo: null,
        checked: false,
        action: '',
        botProfile: 'balanced',
        botMood: freshBotMood(),
        botStats: freshBotStats(),
        botHand: { vpip: false, pfr: false, pressureRecorded: false },
      })),
    dealer: playerCount - 1,
    hand: 0,
    street: -1,
    board: [],
    deck: [],
    currentBet: 0,
    minRaise: 50,
    pending: [],
    actor: -1,
    phase: 'idle',
    revealed: false,
    pots: [],
    refunds: [],
    logs: [],
    winners: [],
    payouts: [],
    stats: { hands: 0, wins: 0, buyin: 5000 },
    difficulty: 'normal',
    emotionMode: 'subtle',
  };
}
export function applyBotSettings(g, value) {
  if (!['idle', 'done'].includes(g.phase)) throw Error('对手设置在下一手开始时生效。');
  const settings = sanitizeBotSettings(value);
  for (const p of g.players.slice(1)) {
    if (p.botProfile !== settings.assignments[p.id]) {
      p.botProfile = settings.assignments[p.id];
      p.botMood = freshBotMood();
      p.botStats = freshBotStats();
    }
    if (settings.emotionMode === 'off') p.botMood = freshBotMood();
  }
  g.emotionMode = settings.emotionMode;
}
// Seat IDs follow the physical table clockwise, starting at the hero.
export const POSITION_ROLES = {
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
};
export const seatPosition = (g, id) =>
  POSITION_ROLES[g.players.length][(id - g.dealer + g.players.length) % g.players.length];
export const potSize = (g) => g.players.reduce((sum, p) => sum + p.total, 0);
// Contribution layers determine eligibility. Folded chips stay in the pots;
// adjacent layers with the same eligible players belong to the same pot.
export function partitionPots(g) {
  const levels = [...new Set(g.players.map((p) => p.total).filter((n) => n > 0))].sort(
      (a, b) => a - b,
    ),
    pots = [],
    refunds = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = g.players.filter((p) => p.total >= level),
      increment = level - previous;
    previous = level;
    if (contributors.length === 1) {
      refunds.push({ id: contributors[0].id, amount: increment });
      continue;
    }
    const eligible = contributors.filter((p) => !p.folded).map((p) => p.id),
      amount = increment * contributors.length;
    if (!eligible.length) throw Error('底池没有符合条件的玩家。');
    let pot = pots.at(-1);
    if (!pot || pot.eligible.join(',') !== eligible.join(',')) {
      pot = {
        index: pots.length,
        label: pots.length ? '边池 ' + pots.length : '主池',
        amount: 0,
        eligible,
        contributions: [],
        awards: [],
      };
      pots.push(pot);
    }
    pot.amount += amount;
    for (const p of contributors) {
      const contribution = pot.contributions.find((c) => c.id === p.id);
      if (contribution) contribution.amount += increment;
      else pot.contributions.push({ id: p.id, amount: increment });
    }
  }
  return { pots, refunds };
}
// A live bet difference is not a side pot: callers may still match it.
// Only an all-in contribution cap separates live main and side pots.
export function currentPots(g) {
  if (g.phase === 'done') return { pots: g.pots, refunds: g.refunds };
  const totals = g.players.map((p) => p.total).sort((a, b) => b - a),
    ceiling = totals[1] || 0;
  const refunds = g.players
    .filter((p) => p.total > ceiling)
    .map((p) => ({ id: p.id, amount: p.total - ceiling }));
  const levels = [
    ...new Set([
      ...g.players.filter((p) => p.allin && p.total > 0 && p.total < ceiling).map((p) => p.total),
      ceiling,
    ]),
  ]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const contributions = g.players
      .map((p) => ({ id: p.id, amount: Math.max(0, Math.min(p.total, level) - previous) }))
      .filter((c) => c.amount > 0);
    const eligible = g.players
      .filter((p) => !p.folded && (p.total >= level || (!p.allin && p.total + p.stack >= level)))
      .map((p) => p.id);
    const amount = contributions.reduce((sum, c) => sum + c.amount, 0);
    previous = level;
    if (!amount) continue;
    pots.push({
      index: pots.length,
      label: pots.length ? '边池 ' + pots.length : '主池',
      amount,
      eligible,
      contributions,
      awards: [],
    });
  }
  return { pots, refunds };
}
export function contestableAfterCall(g, id, amount) {
  const cap = g.players[id].total + amount;
  return g.players.reduce((sum, p) => sum + Math.min(p.total, cap), 0) + amount;
}
const live = (g) => g.players.filter((p) => !p.folded);
const canAct = (p) => !p.folded && !p.allin && p.stack > 0;
function nextIndex(g, start, list) {
  for (let d = 1; d <= g.players.length; d++) {
    const id = (start + d) % g.players.length;
    if (list.includes(id)) return id;
  }
  return -1;
}
function log(g, text, player = null, type = 'action') {
  g.logs.unshift({ text, player, type, street: g.street });
  g.logs = g.logs.slice(0, 70);
}
function pay(p, amount) {
  const n = Math.min(p.stack, amount);
  p.stack -= n;
  p.bet += n;
  p.total += n;
  p.allin = p.stack === 0;
  return n;
}
// Keep the original deal private to the engine, outside public table and review data.
const handStarts = new WeakMap();
const cloneHand = (value) => JSON.parse(JSON.stringify(value));
export const canRestartHand = (g) => g.phase === 'done' && handStarts.has(g);
export function startHand(g) {
  if (g.phase !== 'idle' && g.phase !== 'done') throw Error('当前牌局尚未结束。');
  g.replayAttempt = 0;
  g.potAtShowdown = 0;
  g.hand++;
  g.dealer = (g.dealer + 1) % g.players.length;
  g.board = [];
  g.deck = shuffle(deckOfCards());
  g.street = 0;
  g.phase = 'playing';
  g.currentBet = 50;
  g.minRaise = 50;
  g.winners = [];
  g.payouts = [];
  g.pots = [];
  g.refunds = [];
  g.showdown = false;
  g.revealed = false;
  g.logs = [];
  g.result = '';
  g.decisions = [];
  g.botDecisions = [];
  g.history = [];
  for (const p of g.players) {
    if (p.id) decayBotMood(p.botMood);
    p.botHand = { vpip: false, pfr: false, pressureRecorded: false };
    if (p.stack === 0) {
      p.stack = 5000;
      if (p.id === 0) g.stats.buyin += 5000;
      log(g, `${p.name} 补充 5,000 虚拟筹码`, p.id, 'info');
    }
    p.hole = [];
    p.folded = false;
    p.allin = false;
    p.bet = 0;
    p.total = 0;
    p.actedTo = null;
    p.checked = false;
    p.action = '';
  }
  for (let round = 0; round < 2; round++)
    for (let i = 1; i <= g.players.length; i++)
      g.players[(g.dealer + i) % g.players.length].hole.push(g.deck.pop());
  const sb = (g.dealer + 1) % g.players.length,
    bb = (g.dealer + 2) % g.players.length;
  pay(g.players[sb], 25);
  g.players[sb].action = `小盲 ${g.players[sb].bet}`;
  pay(g.players[bb], 50);
  g.players[bb].action = `大盲 ${g.players[bb].bet}`;
  log(
    g,
    `${g.players[sb].name} 小盲 ${g.players[sb].bet} · ${g.players[bb].name} 大盲 ${g.players[bb].bet}`,
    null,
    'blind',
  );
  log(g, `第 ${g.hand} 手开始 · 庄家 ${g.players[g.dealer].name}`, null, 'street');
  g.pending = g.players.filter(canAct).map((p) => p.id);
  g.actor = nextIndex(g, bb, g.pending);
  handStarts.set(g, cloneHand(g));
  return g;
}
export function restartHand(g) {
  if (!canRestartHand(g)) throw Error('请在本手结束后重打；需要本手的原始发牌记录。');
  const original = handStarts.get(g),
    attempt = (g.replayAttempt || 0) + 1,
    difficulty = g.difficulty;
  // Restore the state after one blind posting, before any player action. This
  // also rolls back this attempt's awards, refunds, decisions and session stats.
  const restored = cloneHand(original);
  for (const key of Object.keys(g)) delete g[key];
  Object.assign(g, restored, { difficulty, replayAttempt: attempt });
  log(g, `第 ${g.hand} 手 · 第 ${attempt} 次重打，原结算已撤回`, null, 'info');
  return g;
}
export function legalActions(g, id = g.actor) {
  const p = g.players[id];
  if (g.phase !== 'playing' || g.actor !== id || !p || !canAct(p)) return { enabled: false };
  const owed = Math.max(0, g.currentBet - p.bet),
    max = p.bet + p.stack,
    min = g.currentBet === 0 ? 50 : g.currentBet + g.minRaise;
  const reopened = p.actedTo === null || g.currentBet - p.actedTo >= g.minRaise;
  const other = g.players.some((o) => o.id !== id && canAct(o));
  return {
    enabled: true,
    toCall: owed,
    callAmount: Math.min(p.stack, owed),
    canCheck: owed === 0,
    raiseReopened: reopened,
    canRaise: max > g.currentBet && reopened && other,
    minRaiseTo: Math.min(min, max),
    fullRaiseTo: min,
    maxRaiseTo: max,
    isShortAllin: max < min,
  };
}
export function act(g, id, action, amount) {
  const legal = legalActions(g, id),
    p = g.players[id];
  if (!legal.enabled) throw Error('还没有轮到你行动。');
  if (!['fold', 'call', 'check', 'raise'].includes(action)) throw Error('未知的牌桌行动。');
  if (action === 'check' && !legal.canCheck) throw Error('当前需要跟注，不能过牌。');
  if (
    action === 'raise' &&
    (!legal.canRaise ||
      !Number.isInteger(amount) ||
      amount < legal.minRaiseTo ||
      amount > legal.maxRaiseTo)
  )
    throw Error('请选择合法的加注总额。');
  // Capture only information available before the decision. Opponents' hole
  // cards, the remaining deck and future community cards never enter review.
  const normalized = action === 'call' && legal.canCheck ? 'check' : action;
  const betLabel =
    normalized === 'raise'
      ? raiseCaption(
          { street: g.street, history: g.history, currentBet: g.currentBet, legal },
          amount,
        )
      : null;
  if (id !== 0) {
    if (g.street === 0 && ['call', 'raise'].includes(normalized)) p.botHand.vpip = true;
    if (g.street === 0 && normalized === 'raise') p.botHand.pfr = true;
    if (g.street > 0 && ['call', 'check', 'raise'].includes(normalized)) {
      p.botStats.postActions++;
      if (normalized === 'raise') p.botStats.postRaises++;
      if (normalized === 'call') p.botStats.postCalls++;
    }
    const facing = [...(g.history || [])]
      .reverse()
      .find((a) => a.street === g.street && a.action === 'raise');
    if (normalized === 'fold' && facing && !p.botHand.pressureRecorded) {
      p.botHand.pressureRecorded = true;
      const event = recordPressureFold(p.botMood, facing.id, g.emotionMode);
      if (event)
        log(g, `${p.name} 模拟状态：${MOOD_LABELS[event.kind]} · ${event.reason}`, id, 'info');
    } else if (normalized !== 'fold' && facing) p.botMood.pressureFolds[facing.id] = 0;
  }
  if (id === 0) {
    g.decisions ||= [];
    g.decisions.push({
      index: g.decisions.length,
      hand: g.hand,
      street: g.street,
      position: seatPosition(g, id),
      hole: p.hole.map((c) => ({ ...c })),
      board: g.board.map((c) => ({ ...c })),
      stack: p.stack,
      bet: p.bet,
      total: p.total,
      pot: potSize(g),
      currentBet: g.currentBet,
      minRaise: g.minRaise,
      dealer: g.dealer,
      emotionMode: g.emotionMode,
      legal: { ...legal },
      pending: [...g.pending],
      action: normalized,
      amount: normalized === 'raise' ? amount : normalized === 'call' ? legal.callAmount : 0,
      players: g.players.map((o) => ({
        id: o.id,
        name: o.name,
        position: seatPosition(g, o.id),
        stack: o.stack,
        bet: o.bet,
        total: o.total,
        folded: o.folded,
        allin: o.allin,
        action: o.action,
        botProfile: o.id ? o.botProfile : null,
        publicAxes: o.id
          ? effectiveBotAxes(getBotProfile(o.botProfile), o.botMood, g.emotionMode)
          : null,
        botMoodKind: o.id ? o.botMood.kind : null,
        actedTo: o.actedTo,
        checked: o.checked,
      })),
      history: (g.history || []).map((a) => ({ ...a })),
    });
  }
  g.history ||= [];
  g.history.push({
    street: g.street,
    id,
    action: normalized,
    amount: normalized === 'raise' ? amount : normalized === 'call' ? legal.callAmount : 0,
    ...(betLabel ? { betLabel } : {}),
  });
  g.pending = g.pending.filter((v) => v !== id);
  if (action === 'fold') {
    p.folded = true;
    p.action = '弃牌';
    log(g, `${p.name} 弃牌`, id);
  } else if (action === 'check' || (action === 'call' && legal.toCall === 0)) {
    p.checked = true;
    p.action = '过牌';
    p.actedTo = g.currentBet;
    log(g, `${p.name} 过牌`, id);
  } else if (action === 'call') {
    const n = pay(p, legal.callAmount);
    p.checked = false;
    p.actedTo = g.currentBet;
    p.action = p.allin ? `全下 ${p.bet}` : `跟注 ${n}`;
    log(g, `${p.name} ${p.action}`, id);
  } else {
    const old = g.currentBet;
    pay(p, amount - p.bet);
    g.currentBet = amount;
    p.checked = false;
    p.actedTo = amount;
    const full = amount - old >= g.minRaise;
    if (full) {
      g.minRaise = amount - old;
      g.pending = g.players.filter((o) => o.id !== id && canAct(o)).map((o) => o.id);
    } else
      for (const o of g.players)
        if (o.id !== id && canAct(o) && o.bet < amount && !g.pending.includes(o.id))
          g.pending.push(o.id);
    p.action = `${betLabel} ${amount}`;
    log(g, `${p.name} ${p.action}`, id);
  }
  progress(g, id);
  return g;
}
function progress(g, last) {
  if (live(g).length === 1) {
    settle(g, false);
    return;
  }
  g.pending = g.pending.filter((id) => canAct(g.players[id]));
  if (
    g.pending.length === 1 &&
    g.players[g.pending[0]].bet >= g.currentBet &&
    g.players.filter(canAct).length === 1
  )
    g.pending = [];
  if (g.pending.length) {
    g.actor = nextIndex(g, last, g.pending);
    g.phase = 'playing';
  } else {
    g.actor = -1;
    g.phase = 'between';
    if (g.street === 3 || (live(g).some((p) => p.allin) && g.players.filter(canAct).length <= 1))
      g.revealed = true;
  }
}
export function advanceStreet(g) {
  if (g.phase !== 'between') throw Error('本轮行动尚未结束。');
  if (g.street === 3) {
    settle(g, true);
    return g;
  }
  g.street++;
  g.deck.pop();
  const count = g.street === 1 ? 3 : 1;
  for (let i = 0; i < count; i++) g.board.push(g.deck.pop());
  g.currentBet = 0;
  g.minRaise = 50;
  for (const p of g.players) {
    p.bet = 0;
    p.actedTo = null;
    p.checked = false;
    if (!p.folded) p.action = p.allin ? '全下' : '';
  }
  log(
    g,
    ['', '翻牌', '转牌', '河牌'][g.street] +
      ' · ' +
      g.board
        .slice(-count)
        .map((c) => rankText(c.rank) + c.symbol)
        .join(' '),
    null,
    'street',
  );
  const active = g.players.filter(canAct);
  if (active.length <= 1) {
    g.pending = [];
    g.actor = -1;
    g.phase = 'between';
    if (live(g).some((p) => p.allin)) g.revealed = true;
  } else {
    g.pending = active.map((p) => p.id);
    g.actor = nextIndex(g, g.dealer, g.pending);
    g.phase = 'playing';
  }
  return g;
}
export function settle(g, showdown = true) {
  if (g.phase === 'done') throw Error('这手牌已经结算。');
  const { pots, refunds } = partitionPots(g),
    payouts = Array(g.players.length).fill(0),
    won = Array(g.players.length).fill(0);
  const ranks = new Map(
    showdown ? live(g).map((p) => [p.id, evaluate([...p.hole, ...g.board])]) : [],
  );
  for (const refund of refunds) payouts[refund.id] += refund.amount;
  for (const pot of pots) {
    const eligible = pot.eligible.map((id) => g.players[id]);
    let winners = [];
    if (!showdown) winners = [eligible[0]];
    else {
      let best = null;
      for (const p of eligible) {
        const score = ranks.get(p.id).score;
        const c = best ? compare(score, best) : 1;
        if (c > 0) {
          best = score;
          winners = [p];
        } else if (c === 0) winners.push(p);
      }
    }
    winners.sort(
      (a, b) =>
        ((a.id - g.dealer + g.players.length - 1) % g.players.length) -
        ((b.id - g.dealer + g.players.length - 1) % g.players.length),
    );
    const share = Math.floor(pot.amount / winners.length),
      remainder = pot.amount % winners.length;
    pot.awards = winners.map((p, i) => ({
      id: p.id,
      amount: share + (i < remainder ? 1 : 0),
      label: showdown ? ranks.get(p.id).label : '其他玩家弃牌',
    }));
    for (const award of pot.awards) {
      payouts[award.id] += award.amount;
      won[award.id] += award.amount;
    }
  }
  if (payouts.reduce((sum, n) => sum + n, 0) !== potSize(g)) throw Error('底池分配金额不一致。');
  g.pots = pots;
  g.refunds = refunds;
  g.payouts = payouts;
  g.winners = g.players
    .filter((p) => won[p.id] > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      amount: won[p.id],
      profit: payouts[p.id] - p.total,
      label: showdown ? evaluate([...p.hole, ...g.board]).label : '其他玩家弃牌',
    }));
  g.potAtShowdown = won.reduce((sum, n) => sum + n, 0);
  g.showdown = showdown;
  g.phase = 'done';
  g.actor = -1;
  g.stats.hands++;
  if (won[0] > 0) g.stats.wins++;
  g.players.forEach((p) => (p.stack += payouts[p.id]));
  g.result =
    (pots.length > 1 ? '分池结算 · ' : '') +
    g.winners
      .map((p) => p.name + ' ' + p.label + ' · 获得 ' + p.amount.toLocaleString())
      .join(' / ');
  for (const pot of [...pots].reverse())
    log(
      g,
      pot.label +
        ' ' +
        pot.amount.toLocaleString() +
        ' → ' +
        pot.awards.map((a) => g.players[a.id].name + ' ' + a.amount.toLocaleString()).join(' / '),
      null,
      'result',
    );
  for (const refund of refunds)
    log(
      g,
      g.players[refund.id].name + ' 未被跟注的 ' + refund.amount.toLocaleString() + ' 筹码已退还',
      refund.id,
      'info',
    );
  log(g, g.result, null, 'result');
  for (const p of g.players.slice(1)) {
    p.botStats.hands++;
    if (p.botHand.vpip) p.botStats.vpip++;
    if (p.botHand.pfr) p.botStats.pfr++;
    if (!p.botHand.pressureRecorded) {
      p.botMood.pressureFolds = {};
      p.botMood.lastPressureRaiser = null;
    }
    const event = finishBotHand(p, payouts[p.id] - p.total, g.emotionMode);
    if (event)
      log(g, `${p.name} 模拟状态：${MOOD_LABELS[event.kind]} · ${event.reason}`, p.id, 'info');
  }
  return g;
}
export function estimateEquity(hole, board, rivals = 1, trials = 35, random = Math.random) {
  const known = new Set([...hole, ...board].map((c) => c.key)),
    available = deckOfCards().filter((c) => !known.has(c.key));
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    const sample = shuffle([...available], random),
      community = [...board];
    while (community.length < 5) community.push(sample.pop());
    const score = evaluate([...hole, ...community]).score;
    let tied = 1,
      lost = false;
    for (let i = 0; i < rivals; i++) {
      const enemy = evaluate([sample.pop(), sample.pop(), ...community]).score,
        c = compare(enemy, score);
      if (c > 0) {
        lost = true;
        break;
      }
      if (c === 0) tied++;
    }
    if (!lost) wins += 1 / tied;
  }
  return wins / trials;
}
export function botDecision(g, random = Math.random, { trials } = {}) {
  const p = g.players[g.actor],
    legal = legalActions(g),
    rivals = Math.max(1, live(g).length - 1);
  if (!p || !legal.enabled) throw Error('机器人当前不能行动。');
  const score = evaluate([...p.hole, ...g.board]).score;
  const equityTrials = trials ?? (g.difficulty === 'hard' ? 52 : 28);
  if (!Number.isInteger(equityTrials) || equityTrials < 1)
    throw Error('权益抽样次数必须为正整数。');
  // Explicit actor perspective: no other hole cards, future deck, review
  // decisions or eventual winners can enter this policy.
  const view = {
    id: p.id,
    hole: p.hole.map((c) => ({ ...c })),
    board: g.board.map((c) => ({ ...c })),
    street: g.street,
    position: seatPosition(g, p.id),
    count: g.players.length,
    stack: p.stack,
    bet: p.bet,
    pot: potSize(g),
    currentBet: g.currentBet,
    difficulty: g.difficulty,
    legal,
    rivals,
    equity: estimateEquity(p.hole, g.board, rivals, equityTrials, random),
    equityTrials,
    contestable: contestableAfterCall(g, p.id, legal.callAmount),
    history: (g.history || []).map(({ id, street, action, amount, betLabel }) => ({
      id,
      street,
      action,
      amount,
      ...(betLabel ? { betLabel } : {}),
    })),
    features: botBoardFeatures(p.hole, g.board, score),
    playsBoard: g.board.length === 5 && compare(score, evaluate(g.board).score) === 0,
  };
  const decision = chooseBotAction(
    view,
    getBotProfile(p.botProfile),
    p.botMood,
    g.emotionMode,
    random,
  );
  return { ...decision, trace: { ...decision.trace, view } };
}

// Record only executed bot actions. Querying a policy never mutates history.
// Private actor cards/traces are not part of publicState or hero snapshots.
export function playBotTurn(g, random = Math.random) {
  const id = g.actor;
  if (id === 0) throw Error('玩家行动不能使用机器人执行器。');
  const decision = botDecision(g, random);
  const record = JSON.parse(
    JSON.stringify({
      id,
      name: g.players[id].name,
      hand: g.hand,
      sequence: g.history.length + 1,
      action: decision.action,
      amount: decision.amount,
      trace: decision.trace,
    }),
  );
  act(g, id, decision.action, decision.amount);
  g.botDecisions ||= [];
  g.botDecisions.push(record);
  return decision;
}
