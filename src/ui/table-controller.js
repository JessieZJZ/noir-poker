import {
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  potSize,
  currentPots,
  contestableAfterCall,
  botDecision,
  evaluate,
  rankText,
  seatPosition,
  restartHand,
  canRestartHand,
} from '../engine/poker.js';
import { createReviewController } from './review-controller.js';
import { renderCard } from './cards.js';
import { createShowdownController } from './showdown.js';
const $ = (s) => document.querySelector(s);
const handReview = createReviewController({ card });
const showdown = createShowdownController({ card });
let requestedCount = 6;
let game = newGame(),
  timer = null,
  epoch = 0,
  lastBoard = 0,
  lastHand = 0,
  bet = 150,
  finishing = false,
  hints = true,
  sound = false,
  audio = null;
try {
  sound = localStorage.getItem('noir-sound') === 'true';
  hints = localStorage.getItem('noir-hints') !== 'false';
} catch {}
const format = (n) => n.toLocaleString('en-US'),
  streets = ['翻牌前', '翻牌', '转牌', '河牌'],
  profiles = ['YOU', 'M', 'A', 'R', 'K', 'L', 'T', 'J', 'L'];
function card(c, options) {
  return renderCard(c, options);
}
const positionNames = {
  BTN: '庄家（按钮位）',
  SB: '小盲',
  BB: '大盲',
  UTG: '枪口位',
  'UTG+1': '枪口位后一席',
  MP: '中位',
  LJ: '低劫位',
  HJ: '劫位',
  CO: '关煞位',
};
function positionBadge(id) {
  const role = seatPosition(game, id);
  return `<span class="position-badge" data-position="${role}" title="${positionNames[role]}">${role}</span>`;
}

function soundEffect(kind = 'chip') {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    const notes = kind === 'win' ? [440, 554, 659] : kind === 'deal' ? [820, 570] : [310];
    notes.forEach((hz, i) => {
      const o = audio.createOscillator(),
        v = audio.createGain();
      o.type = kind === 'deal' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(hz, now + i * 0.08);
      v.gain.setValueAtTime(0.0001, now + i * 0.08);
      v.gain.exponentialRampToValueAtTime(0.025, now + i * 0.08 + 0.015);
      v.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.16);
      o.connect(v);
      v.connect(audio.destination);
      o.start(now + i * 0.08);
      o.stop(now + i * 0.08 + 0.2);
    });
  } catch {}
}
function flyChips(id) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const source = id === 0 ? $('.hero-name') : $(`.seat-${id} .seat-profile`),
    target = $('.pot');
  if (!source || !target) return;
  const a = source.getBoundingClientRect(),
    b = target.getBoundingClientRect();
  for (let i = 0; i < 3; i++) {
    const chip = document.createElement('span');
    chip.className = 'flying-chip';
    document.body.append(chip);
    chip.style.left = a.left + a.width / 2 + i * 3 + 'px';
    chip.style.top = a.top + a.height / 2 - i * 3 + 'px';
    const anim = chip.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        {
          transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px,${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.7)`,
          opacity: 0,
        },
      ],
      { duration: 520, delay: i * 60, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    anim.onfinish = () => chip.remove();
  }
}
function seatAction(p) {
  if (game.actor === p.id) return '<span class="seat-action-label thinking-dots">思考中</span>';
  const match = /^(小盲|大盲|跟注|加注至|下注|全下) (\d+)$/.exec(p.action);
  if (!match) return `<span class="seat-action-label">${p.action || '等待行动'}</span>`;
  const label = match[1] === '加注至' ? '加注' : match[1],
    amount = Number(match[2]);
  const meaning =
    match[1] === '跟注'
      ? `本次补入 ${format(amount)}，本轮累计投入 ${format(p.bet)}`
      : `本轮累计投入 ${format(amount)}`;
  return `<span class="seat-action-label">${label}</span><strong class="seat-action-amount" title="${meaning}">${format(amount)}</strong>`;
}
const layouts = {
  5: [
    [15, 59],
    [23, 0],
    [77, 0],
    [85, 59],
  ],
  6: [
    [14, 60],
    [17, 14],
    [50, 0],
    [83, 14],
    [86, 60],
  ],
  7: [
    [14, 63],
    [11.5, 27],
    [35, 0],
    [65, 0],
    [88.5, 27],
    [86, 63],
  ],
  8: [
    [14, 68],
    [11.5, 36],
    [23, 6],
    [50, 0],
    [77, 6],
    [88.5, 36],
    [86, 68],
  ],
  9: [
    [14, 72],
    [13, 45],
    [16, 18],
    [36, 0],
    [64, 0],
    [84, 18],
    [87, 45],
    [86, 72],
  ],
};
function render() {
  const count = game.players.length;
  $('#arena').dataset.playerCount = count;
  $('#table-tag').textContent = count + '-MAX';
  $('#table-size-label').textContent = count + ' 人无限注';
  const hero = game.players[0],
    newHand = game.hand !== lastHand,
    boardChanged = game.board.length > lastBoard;
  const heroBest =
    game.showdown && !hero.folded
      ? new Set(evaluate([...hero.hole, ...game.board]).cards.map((c) => c.key))
      : new Set();
  $('#hand-number').textContent = String(game.hand).padStart(2, '0');
  $('#replay-label').hidden = !game.replayAttempt;
  $('#replay-label').textContent = '重打 ' + game.replayAttempt;
  $('#replay-note').hidden = !game.replayAttempt;
  $('#street-label').textContent =
    game.phase === 'done' ? '本手结束' : streets[game.street] || '准备发牌';
  $('#pot-value').textContent = format(game.phase === 'done' ? game.potAtShowdown : potSize(game));
  $('.pot').classList.toggle('pot-changed', boardChanged);
  $('#board').innerHTML = Array.from({ length: 5 }, (_, i) =>
    game.board[i]
      ? card(game.board[i], {
          animate: i >= lastBoard && boardChanged,
          delay: (i - lastBoard) * 140,
          best: heroBest.has(game.board[i].key),
        })
      : `<div class="board-slot" aria-label="未发出的公共牌">${['♠', '♣', '♥', '♦', '♠'][i]}</div>`,
  ).join('');
  $('#seats').innerHTML = game.players
    .slice(1)
    .map((p) => {
      const isWinner = game.winners.some((w) => w.id === p.id),
        reveal = (game.showdown || game.revealed) && !p.folded,
        rank = reveal && game.board.length === 5 ? evaluate([...p.hole, ...game.board]) : null,
        [x, y] = layouts[count][p.id - 1];
      return `<div class="seat seat-${p.id} ${p.folded ? 'folded' : ''} ${game.actor === p.id ? 'thinking' : ''} ${isWinner ? 'winner' : ''}" data-player="${p.id}" style="left:${x}%;top:${y}%"><div class="mini-cards ${reveal ? 'revealed-cards' : ''}">${reveal ? p.hole.map((c) => card(c, { small: true, best: !!rank && rank.cards.some((best) => best.key === c.key) })).join('') : p.hole.map((c, i) => `<span class="card-back ${newHand ? 'card-deal' : ''}" style="--delay:${p.id * 65 + i * 140}ms" aria-label="对手底牌"></span>`).join('')}</div><div class="seat-profile"><span class="avatar avatar-${p.id - 1}">${profiles[p.id]}</span><div><strong>${p.name}${positionBadge(p.id)}</strong><span class="seat-bankroll"><span class="seat-stack">${format(p.stack)}</span>${game.phase === 'done' ? `<button class="seat-peek" data-peek-player="${p.id}" title="查看底牌" aria-label="查看 ${p.name} 的底牌" aria-haspopup="dialog" aria-controls="hands-dialog"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2.5"/></svg></button>` : ''}</span></div></div>${rank ? `<div class="hand-rank ${isWinner ? 'rank-winner' : ''}">${isWinner ? '♛ ' : ''}${rank.label}</div>` : ''}${game.phase === 'done' ? '' : `<div class="seat-action">${seatAction(p)}</div>`}</div>`;
    })
    .join('');
  $('#hero-cards').innerHTML = hero.hole
    .map((c, i) => card(c, { animate: newHand, delay: 420 + i * 130, best: heroBest.has(c.key) }))
    .join('');
  const heroRank = $('#hero-hand-rank');
  heroRank.hidden = game.board.length !== 5 || !(game.revealed || game.showdown);
  heroRank.textContent =
    (hero.folded ? '已弃牌 · ' : '') + evaluate([...hero.hole, ...game.board]).label;
  heroRank.classList.toggle(
    'rank-winner',
    game.winners.some((w) => w.id === 0),
  );
  $('.hero-area').classList.toggle('hero-folded', hero.folded);
  $('.hero-name').classList.toggle('is-active', game.actor === 0);
  $('#hero-stack').textContent = format(hero.stack);
  const heroPosition = seatPosition(game, 0);
  $('#hero-position').textContent = heroPosition;
  $('#hero-position').dataset.position = heroPosition;
  $('#hero-position').title = positionNames[heroPosition];
  $('#hero-turn').textContent =
    game.actor === 0
      ? '你的回合'
      : hero.folded
        ? '已弃牌'
        : hero.allin
          ? '已全下'
          : game.phase === 'done'
            ? '本手结束'
            : '等待行动';
  $('#session-stack').innerHTML = `${format(hero.stack)}<span>CHIPS</span>`;
  const diff = hero.stack - game.stats.buyin;
  $('#session-change').textContent = game.stats.hands
    ? `${diff >= 0 ? '+' : ''}${format(diff)} 筹码 · 本次练习净变化`
    : '从这一手开始积累经验';
  $('#session-change').classList.toggle('negative', diff < 0);
  $('#stat-hands').textContent = game.stats.hands;
  $('#stat-wins').textContent = game.stats.wins;
  $('#stat-winrate').textContent = game.stats.hands
    ? Math.round((game.stats.wins / game.stats.hands) * 100) + '%'
    : '—';
  $('#activity-list').innerHTML = game.logs
    .map((l) => `<li class="log-${l.type} ${l.player === 0 ? 'log-hero' : ''}">${l.text}</li>`)
    .join('');
  $('#activity-count').textContent = game.phase === 'done' ? 'FINISHED' : 'LIVE';
  const done = game.phase === 'done';
  $('#arena').classList.toggle('is-done', done);
  $('#result-banner').hidden = !done;
  $('#result-banner').classList.toggle(
    'hero-win',
    game.winners.some((w) => w.id === 0),
  );
  document
    .querySelectorAll('input[name="difficulty"]')
    .forEach((input) => (input.checked = input.value === game.difficulty));
  if (done) {
    const winner = game.winners.find((w) => w.id === 0) || game.winners[0],
      multiple = game.pots.length > 1,
      split = game.pots.some((p) => p.awards.length > 1);
    const title = multiple
        ? '主池与边池已分别结算'
        : split
          ? '本池平分'
          : winner.name + ' 获得底池',
      label = multiple ? game.pots.length + ' 个底池' : game.showdown ? winner.label : '弃牌获胜';
    $('#result-banner').innerHTML =
      `<span class="result-copy"><span class="result-kicker">本手结束</span><strong>${title}</strong></span><span class="result-amount"><strong>${format(multiple || split ? game.potAtShowdown : winner.amount)}</strong><span>${label} · 筹码</span></span><span class="result-link">底池明细 <span aria-hidden="true">→</span></span>`;
  }
  $('#board-caption').textContent =
    done && game.showdown
      ? hero.folded
        ? '摊牌 · 对手亮出底牌'
        : '摊牌 · 亮起的牌组成你的最佳牌型'
      : game.street === 0
        ? '等待翻牌'
        : game.street === 1
          ? 'FLOP · 三张公共牌'
          : game.street === 2
            ? 'TURN · 第四张公共牌'
            : 'RIVER · 最后的决定';
  const details = potDetails();
  $('#pot-details-button').textContent =
    details.pots.length > 1 ? '总底池 · ' + (details.pots.length - 1) + ' 个边池' : '底池 · 明细';
  if (details.pots.length > 1)
    $('#board-caption').textContent =
      (done ? '已分别结算' : '当前投入') +
      ' · 主池 ' +
      format(details.pots[0].amount) +
      ' + ' +
      (details.pots.length - 1) +
      ' 个边池';
  renderPotDetails(details);
  const legal = legalActions(game, 0);
  $('.bet-controls').hidden = done || hero.folded;
  $('.action-buttons').hidden = done || hero.folded;
  $('#next-button').hidden = !done;
  $('#continue-deal-button').hidden = done || !hero.folded;
  $('#continue-deal-button').disabled = finishing;
  $('#continue-deal-button').textContent = finishing ? '正在发牌…' : '继续发牌';
  $('#action-panel').classList.toggle('folded-actions', hero.folded && !done);
  $('#restart-hand-button').hidden = !canRestartHand(game);
  $('#action-panel').classList.toggle('settled-actions', done);
  $('#next-button').innerHTML =
    hero.stack === 0 ? '补充筹码，继续练习 <span>♠</span>' : '下一手 <span>♠</span>';
  for (const b of [$('#fold-button'), $('#call-button')]) b.disabled = !legal.enabled;
  $('#raise-button').disabled = !legal.enabled || !legal.canRaise;
  $('#bet-slider').disabled = !legal.enabled || !legal.canRaise;
  document
    .querySelectorAll('[data-preset]')
    .forEach((b) => (b.disabled = !legal.enabled || !legal.canRaise));
  if (legal.enabled) {
    const min = legal.minRaiseTo,
      max = legal.maxRaiseTo;
    bet = Math.min(max, Math.max(min, bet));
    const slider = $('#bet-slider');
    slider.min = min;
    slider.max = max;
    slider.step = 1;
    slider.value = bet;
    $('#call-button').innerHTML = legal.canCheck
      ? '<span>过牌</span>'
      : `<span>${legal.callAmount < legal.toCall ? '全下跟注' : '跟注'}</span><strong>${format(legal.callAmount)}</strong>`;
    $('#call-button').setAttribute(
      'aria-label',
      legal.canCheck
        ? '过牌'
        : `${legal.callAmount < legal.toCall ? '全下跟注' : '跟注'} ${format(legal.callAmount)}`,
    );
    $('#decision-text').textContent = legal.canCheck
      ? '轮到你了，可以过牌或主动下注。'
      : `轮到你了，跟注需要 ${format(legal.callAmount)} 筹码。${legal.raiseReopened ? '' : '本轮加注权未重开，仅可跟注或弃牌。'}`;
  } else if (done) $('#decision-text').textContent = game.result;
  else if (game.phase === 'between')
    $('#decision-text').textContent = game.revealed
      ? game.board.length === 5
        ? '摊牌 · 底牌已亮出，正在结算各底池…'
        : '全下行动结束 · 底牌已亮出，等待剩余公共牌…'
      : '本轮下注结束，正在翻开公共牌…';
  else
    $('#decision-text').textContent = hero.folded
      ? `${game.players[game.actor]?.name || '对手'} 正在行动，你可以观察这一手。`
      : `${game.players[game.actor]?.name || '对手'} 正在思考，请稍候。`;
  updateBet();
  $('#hand-strength').textContent = hero.hole.length
    ? evaluate([...hero.hole, ...game.board]).label
    : '';
  updateCoach();
  handReview.update(game, epoch);
  showdown.update(game, epoch);
  lastHand = game.hand;
  lastBoard = game.board.length;
}
function updateBet() {
  const legal = legalActions(game, 0);
  $('#bet-value').textContent = format(bet);
  const action =
    legal.enabled && bet === legal.maxRaiseTo ? '全下' : game.currentBet === 0 ? '下注' : '加注至';
  $('#raise-button').innerHTML = `<span>${action}</span><strong>${format(bet)}</strong>`;
  $('#raise-button').setAttribute('aria-label', action + ' ' + format(bet));
}

function updateCoach() {
  $('#coach-content').hidden = !hints;
  $('#hint-toggle').textContent = hints ? '已开启' : '已关闭';
  $('#hint-toggle').setAttribute('aria-pressed', String(hints));
  const p = game.players[0],
    e = evaluate([...p.hole, ...game.board]);
  let tip = '';
  if (game.phase === 'done')
    tip = p.folded
      ? '弃牌也是好决策的一部分。观察对手最后亮出的牌，回想本手的下注节奏。'
      : game.showdown
        ? `你的最佳牌型是${e.label}。复盘时注意：对手在哪一轮开始加注？公共牌是否改变了牌面强度？`
        : '让对手弃牌也能赢得底池。下一手，继续关注位置和下注尺度。';
  else if (game.street === 0) {
    const [a, b] = p.hole;
    if (a?.rank === b?.rank)
      tip = '口袋对子有机会在翻牌形成三条。小对子面对大额加注时，也要考虑跟注成本。';
    else if (a?.rank >= 11 && b?.rank >= 11)
      tip = '两张高牌拥有不错的起手潜力。主动加注能缩小对手范围，也要留意前面的大额加注。';
    else if (a?.suit === b?.suit)
      tip = '同花底牌增加了成牌潜力，但不代表可以跟注任何价格。留意牌张距离和你的行动位置。';
    else tip = '起手牌不必手手参与。越早行动，选牌越要谨慎；后位则能利用更多信息。';
  } else if (e.score[0] >= 3)
    tip = `你已形成${e.label}。考虑通过下注获得价值，同时注意公共牌上可能出现的更强牌型。`;
  else if (e.score[0] >= 1)
    tip = `目前是${e.label}。多位对手参与时，谨慎面对持续的大额加注；一对不总能赢到最后。`;
  else tip = '目前尚未成对。别只看能否追到牌，也要考虑跟注价格，以及对手的下注强度。';
  const legal = legalActions(game, 0);
  if (legal.enabled && legal.toCall > 0)
    tip += ` 这次跟注占你可争夺底池约 ${Math.round((legal.callAmount / contestableAfterCall(game, 0, legal.callAmount)) * 100)}%。`;
  $('#coach-stage').textContent =
    game.phase === 'done' ? '本手复盘' : streets[game.street] + '策略';
  $('#coach-tip').textContent = tip;
}
function schedule() {
  clearTimeout(timer);
  const ticket = epoch;
  if (game.phase === 'done' || finishing) return;
  if (game.phase === 'between') {
    timer = setTimeout(
      () => {
        if (ticket !== epoch) return;
        advanceStreet(game);
        soundEffect(game.phase === 'done' ? 'win' : 'deal');
        render();
        schedule();
      },
      game.board.length === 5 ? 850 : 1000,
    );
  } else if (game.actor !== 0) {
    timer = setTimeout(
      () => {
        if (ticket !== epoch) return;
        const id = game.actor,
          d = botDecision(game);
        act(game, id, d.action, d.amount);
        if (d.action !== 'fold' && d.action !== 'check') {
          flyChips(id);
          soundEffect();
        }
        if (game.phase === 'done') soundEffect('win');
        render();
        schedule();
      },
      650 + Math.random() * 450,
    );
  }
}
function heroAction(action, amount) {
  if (!legalActions(game, 0).enabled) return false;
  const legal = legalActions(game, 0);
  act(game, 0, action, amount);
  if (action === 'raise' || (action === 'call' && legal.toCall > 0)) {
    flyChips(0);
    soundEffect();
  }
  if (game.phase === 'done') soundEffect('win');
  render();
  schedule();
  return true;
}
async function continueDeal() {
  if (!game.players[0].folded || game.phase === 'done' || finishing) return false;
  clearTimeout(timer);
  const ticket = ++epoch;
  finishing = true;
  render();
  try {
    while (ticket === epoch && game.phase !== 'done') {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (ticket !== epoch) return false;
      if (game.phase === 'between') advanceStreet(game);
      else {
        const id = game.actor,
          d = botDecision(game);
        act(game, id, d.action, d.amount);
      }
      if (game.phase === 'between' || game.phase === 'done') render();
    }
    return ticket === epoch && game.phase === 'done';
  } finally {
    if (ticket === epoch) {
      finishing = false;
      render();
      if (game.phase === 'done') soundEffect('win');
      schedule();
    }
  }
}
function nextHand() {
  finishing = false;
  clearTimeout(timer);
  showdown.reset();
  epoch++;
  lastBoard = 0;
  $('#pot-dialog').close();
  $('#hands-dialog').close();
  $('#hands-grid').innerHTML = '';
  if (requestedCount !== game.players.length) {
    const difficulty = game.difficulty;
    game = newGame(requestedCount);
    game.difficulty = difficulty;
    handReview.reset();
    lastHand = 0;
  }
  $('#table-change-note').hidden = true;
  startHand(game);
  const legal = legalActions(game, 0);
  bet = legal.enabled ? Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, 150)) : 150;
  render();
  soundEffect('deal');
  schedule();
}
function retryHand() {
  if (!canRestartHand(game)) return false;
  finishing = false;
  clearTimeout(timer);
  showdown.reset();
  handReview.rollback(game, epoch);
  epoch++;
  $('#pot-dialog').close();
  $('#hands-dialog').close();
  $('#hands-grid').innerHTML = '';
  document.querySelectorAll('.flying-chip').forEach((e) => {
    e.getAnimations().forEach((a) => a.cancel());
    e.remove();
  });
  restartHand(game);
  lastHand = 0;
  lastBoard = 0;
  bet = 150;
  render();
  soundEffect('deal');
  schedule();
  return true;
}
function potDetails() {
  return currentPots(game);
}
function renderPotDetails(details) {
  const done = game.phase === 'done',
    hero = game.players[0],
    eligibilityLabel = (pot) =>
      pot.eligible.includes(0)
        ? '你可争夺'
        : done || hero.folded
          ? '你不参与此池'
          : hero.allin
            ? '超出你的全下额度'
            : '你尚未投入此池';
  $('#pot-dialog-title').textContent = done ? '本手分池结算' : '主池与边池';
  $('#pot-dialog-note').textContent = done
    ? '每个底池仅在有资格的玩家之间比较牌型并独立分配。'
    : '金额按当前投入显示；尚未行动的玩家需跟注才能保留相应资格。仅全下额度形成边池，未被跟注的部分待跟注或退还。';
  $('#pot-dialog-content').innerHTML =
    details.pots
      .map(
        (pot) =>
          `<section class="pot-detail-card"><div class="pot-detail-heading"><h3>${pot.label}</h3><strong>${format(pot.amount)}<span>筹码</span></strong></div><div class="pot-eligibility ${pot.eligible.includes(0) ? 'hero-eligible' : ''}">${eligibilityLabel(pot)}<span> · ${pot.eligible.length} 人</span></div><p class="pot-player-list">可争夺：${pot.eligible.map((id) => game.players[id].name).join('、')}</p><details class="pot-contributions"><summary>查看各家投入</summary><ul>${pot.contributions.map((c) => `<li><span>${game.players[c.id].name}${game.players[c.id].folded ? ' · 已弃牌' : game.players[c.id].allin ? ' · 全下' : ''}</span><b>${format(c.amount)}</b></li>`).join('')}</ul></details>${done ? `<div class="pot-awards">${pot.awards.length > 1 ? '<div class="pot-split-label">本池平分 · 零头筹码按庄家左侧顺序分配</div>' : ''}${pot.awards.map((a) => `<div class="pot-award"><span>${game.players[a.id].name}<small>${a.label}</small></span><strong>+${format(a.amount)}</strong></div>`).join('')}</div>` : ''}</section>`,
      )
      .join('') +
    details.refunds
      .map(
        (r) =>
          `<div class="pot-refund"><span>${done ? '未被跟注 · 已退还' : '待跟注或退还'}<b>${game.players[r.id].name}</b></span><strong>${format(r.amount)}</strong></div>`,
      )
      .join('');
}
$('#fold-button').onclick = () => heroAction('fold');
$('#call-button').onclick = () => heroAction('call');
$('#raise-button').onclick = () => heroAction('raise', bet);
$('#next-button').onclick = nextHand;
$('#restart-hand-button').onclick = retryHand;
$('#bet-slider').oninput = (e) => {
  const legal = legalActions(game, 0);
  let v = Number(e.target.value);
  bet = v === legal.maxRaiseTo ? v : Math.max(legal.minRaiseTo, Math.round(v / 25) * 25);
  bet = Math.min(legal.maxRaiseTo, bet);
  updateBet();
};
document.querySelectorAll('[data-preset]').forEach(
  (button) =>
    (button.onclick = () => {
      const legal = legalActions(game, 0);
      if (!legal.canRaise) return;
      const value = button.dataset.preset;
      bet =
        value === 'all'
          ? legal.maxRaiseTo
          : value === 'min'
            ? legal.minRaiseTo
            : game.currentBet +
              Math.max(
                game.minRaise,
                Math.round((potSize(game) * (value === 'half' ? 0.5 : 1)) / 25) * 25,
              );
      bet = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, bet));
      $('#bet-slider').value = bet;
      updateBet();
    }),
);
$('#player-count').onchange = (e) => {
  requestedCount = Number(e.target.value);
  const note = $('#table-change-note');
  note.hidden = requestedCount === game.players.length;
  note.textContent = `下一手切换为 ${requestedCount} 人桌 · 筹码恢复 5,000，统计重新开始`;
};
function showOpponentHand(id) {
  const p = game.players[id];
  if (game.phase !== 'done' || !Number.isInteger(id) || id === 0 || !p) return false;
  const winner = game.winners.find((w) => w.id === id),
    rank = game.board.length === 5 ? evaluate([...p.hole, ...game.board]) : null;
  $('#hands-dialog-title').textContent = p.name + ' 的底牌';
  $('#hands-note').textContent = p.folded
    ? '已弃牌 · 仅供本手结束后的训练查看，不参与结算。'
    : '本手已结束 · 牌型由底牌与本手公共牌组成。';
  $('#hands-grid').innerHTML =
    `<section class="hands-player ${winner ? 'hands-winner' : ''}"><div class="hands-player-heading"><strong>${p.name} ${positionBadge(id)}</strong><span>${p.folded ? '已弃牌' : winner ? '获得 ' + format(winner.amount) : '未获底池'}</span></div><div class="hands-cards">${p.hole.map((c) => card(c, { best: !p.folded && !!rank && rank.cards.some((best) => best.key === c.key) })).join('')}</div><div class="hand-rank ${winner ? 'rank-winner' : ''}">${rank ? rank.label : '公共牌不足五张'}</div></section>`;
  $('#hands-dialog').showModal();
  return true;
}
$('#seats').onclick = (e) => {
  const button = e.target.closest('[data-peek-player]');
  if (button) showOpponentHand(Number(button.dataset.peekPlayer));
};
$('#continue-deal-button').onclick = continueDeal;
$('#difficulty').onchange = (e) => {
  if (
    e.target.matches('input[name="difficulty"]') &&
    ['easy', 'normal', 'hard'].includes(e.target.value)
  )
    game.difficulty = e.target.value;
};
function updateSound() {
  const b = $('#sound-button');
  b.setAttribute('aria-label', sound ? '关闭音效' : '开启音效');
  b.setAttribute('aria-pressed', String(sound));
  b.title = sound ? '音效已开启' : '音效已关闭';
  b.innerHTML = sound
    ? '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8q6 4 0 8m3-11q9 7 0 14"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>';
}
$('#sound-button').onclick = () => {
  sound = !sound;
  try {
    localStorage.setItem('noir-sound', String(sound));
  } catch {}
  updateSound();
  if (sound) soundEffect('deal');
};
$('#hint-toggle').onclick = () => {
  hints = !hints;
  try {
    localStorage.setItem('noir-hints', String(hints));
  } catch {}
  updateCoach();
};
$('#rules-button').onclick = () => $('#rules-dialog').showModal();
$('#reset-button').onclick = () => $('#reset-dialog').showModal();
$('#pot-details-button').onclick = () => $('#pot-dialog').showModal();
$('#result-banner').onclick = () => $('#pot-dialog').showModal();
document
  .querySelectorAll('.close-dialog')
  .forEach((b) => (b.onclick = () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) =>
  d.addEventListener('click', (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        d.close();
    }
  }),
);
$('#confirm-reset').onclick = () => {
  handReview.reset();
  const difficulty = game.difficulty;
  clearTimeout(timer);
  game = newGame(requestedCount);
  game.difficulty = difficulty;
  lastHand = 0;
  $('#reset-dialog').close();
  nextHand();
};
function publicState() {
  const details = potDetails();
  return {
    playerCount: game.players.length,
    canContinue: game.players[0].folded && game.phase !== 'done' && !finishing,
    replayAttempt: game.replayAttempt || 0,
    canRestart: canRestartHand(game),
    hand: game.hand,
    dealer: game.players[game.dealer].name,
    seatOrder: 'clockwise',
    street: streets[game.street],
    phase: game.phase,
    actor: game.actor === 0 ? '你' : game.players[game.actor]?.name || null,
    pot: game.phase === 'done' ? game.potAtShowdown : potSize(game),
    pots: details.pots.map((p) => ({
      label: p.label,
      amount: p.amount,
      eligible: p.eligible.map((id) => game.players[id].name),
      awards: p.awards.map((a) => ({
        name: game.players[a.id].name,
        amount: a.amount,
        label: a.label,
      })),
    })),
    uncalled: details.refunds.map((r) => ({
      name: game.players[r.id].name,
      amount: r.amount,
      returned: game.phase === 'done',
    })),
    board: game.board.map((c) => rankText(c.rank) + c.symbol),
    hole: game.players[0].hole.map((c) => rankText(c.rank) + c.symbol),
    stack: game.players[0].stack,
    legal: legalActions(game, 0),
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      position: seatPosition(game, p.id),
      stack: p.stack,
      folded: p.folded,
      allin: p.allin,
      bet: p.bet,
      ...((game.showdown || game.revealed) && !p.folded
        ? { cards: p.hole.map((c) => rankText(c.rank) + c.symbol) }
        : {}),
    })),
    result: game.result || null,
  };
}
window.noir = { getState: publicState };
function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const register = (tool) => {
    try {
      Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {}
  };
  register({
    name: 'read_poker_table',
    title: '读取当前牌桌',
    description:
      'Read the public poker table and your legal actions. Does not reveal opponents hidden cards.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: (input) => {
      if (!input || typeof input !== 'object' || Object.keys(input).length)
        throw Error('请传入空对象。');
      return publicState();
    },
  });
  register({
    name: 'play_poker_action',
    title: '在牌桌行动',
    description:
      'Complete your turn by folding, checking, calling or raising to a total street amount. Only succeeds on your turn.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['fold', 'check', 'call', 'raise'] },
        amount: { type: 'integer', minimum: 0 },
      },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: (input) => {
      if (
        !input ||
        typeof input !== 'object' ||
        Object.keys(input).some((k) => !['action', 'amount'].includes(k)) ||
        !['fold', 'check', 'call', 'raise'].includes(input.action)
      )
        throw Error('无效的行动。');
      if (!legalActions(game, 0).enabled) throw Error('还没有轮到你。');
      if (input.action === 'raise' && !Number.isInteger(input.amount))
        throw Error('加注需要整数总额。');
      heroAction(input.action, input.amount);
      return publicState();
    },
  });
  register({
    name: 'restart_current_poker_hand',
    title: '重打这手牌',
    description:
      'Restart a completed hand with the same original hole cards, deck order, button and starting stacks. Undo its previous payout and statistics. The bots respond again to your choices. Does not reveal hidden cards.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute: (input) => {
      if (!input || typeof input !== 'object' || Object.keys(input).length)
        throw Error('请传入空对象。');
      if (!retryHand()) throw Error('本手尚未结束，或缺少原始发牌记录。');
      return publicState();
    },
  });
  register({
    name: 'start_next_poker_hand',
    title: '开始下一手',
    description:
      'Deal the next hand after the current hand has ended. Refills any empty virtual chip stack.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute: (input) => {
      if (!input || typeof input !== 'object' || Object.keys(input).length)
        throw Error('请传入空对象。');
      if (game.phase !== 'done') throw Error('当前牌局尚未结束。');
      nextHand();
      return publicState();
    },
  });
}
updateSound();
nextHand();
registerTools();
