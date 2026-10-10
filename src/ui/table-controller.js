import {
  newGame,
  startHand,
  act,
  advanceStreet,
  completeBoardForPractice,
  legalActions,
  potSize,
  currentPots,
  contestableAfterCall,
  playBotTurn,
  planBotTurn,
  executeBotTurn,
  isBotTurnCurrent,
  evaluate,
  rankText,
  seatPosition,
  restartHand,
  canRestartHand,
  applyBotSettings,
} from '../engine/poker.js';
import { raiseCaption } from '../engine/action-labels.js';
import { getBotProfile, MOOD_LABELS } from '../engine/bot-profiles.js';
import { loadBotSettings, createOpponentsController } from './opponents-controller.js';
import { loadTablePreferences, saveTablePreferences } from './preferences.js';
import { createReviewController } from './review-controller.js';
import { renderCard } from './cards.js';
import { createShowdownController } from './showdown.js';
import { createActivityFormatter } from './activity.js';
import { portraitContent, preparePortraits } from './portraits.js';
import { presetRaiseTo } from './bet-sizing.js';
import { CHIP_UNIT, legalRaiseTo } from '../engine/bet-sizing.js';
import { createSettlementLayout } from './settlement-layout.js';
import { createPlayViewport } from './play-viewport.js';
import { createHintNotification } from './hint-notification.js';
import { createHintMarquee } from './hint-marquee.js';
import { preferenceStorage } from '../platform/storage.js';
import { createActivityClock } from '../platform/activity-clock.js';
import { isAppActive } from '../platform/native.js';
const activityClock = createActivityClock();
activityClock.setActive(isAppActive());
let dealWait = null;
const $ = (s) => document.querySelector(s);
const compactCoach = window.matchMedia('(max-width: 900px)');
const coachContent = $('#coach-content');
function positionCoach() {
  const compact = compactCoach.matches;
  (compact ? $('.surface-top') : $('#coach-desktop-body')).append(coachContent);
  (compact ? $('#hint-setting-row') : $('#coach-toggle-slot')).append($('#hint-toggle'));
  $('#hint-setting-row').hidden = !compact;
  $('#coach-desktop-card').hidden = compact;
  $('#hint-toggle').setAttribute('aria-labelledby', compact ? 'hint-label' : 'coach-card-title');
}
const settlementLayout = createSettlementLayout($('#arena'), { observe: false });
const playViewport = createPlayViewport($('.game-surface'), { layout: settlementLayout.update });
const hintMarquee = createHintMarquee(coachContent, $('#coach-tip'), () => compactCoach.matches);
const hintNotification = createHintNotification({
  publish({ visible, text, stage }) {
    $('#coach-content').hidden = !visible;
    if (text !== undefined && $('#coach-tip').textContent !== text) {
      $('#coach-tip').textContent = text;
      $('#coach-content').scrollLeft = 0;
    }
    if (stage !== undefined && $('#coach-stage').textContent !== stage)
      $('#coach-stage').textContent = stage;
    const duration = hintMarquee.update(visible);
    if (visible) coachContent.dataset.hintDuration = String(duration);
    return duration;
  },
});
hintNotification.setActive(isAppActive() && !document.hidden);
const handReview = createReviewController({ card });
const showdown = createShowdownController({ card });
// Display preferences belong to this hand's UI, never to settlement or review.
const seatHandVisibility = new Map();
function isSeatHandVisible(player) {
  if (game.phase === 'done' && seatHandVisibility.has(player.id)) {
    return seatHandVisibility.get(player.id);
  }
  return (game.showdown || game.revealed) && !player.folded;
}
const tablePreferences = loadTablePreferences();
let requestedCount = tablePreferences.playerCount;
let game = newGame(requestedCount),
  timer = null,
  botWait = null,
  epoch = 0,
  lastBoard = 0,
  lastHand = 0,
  bet = 150,
  finishing = false,
  hints = true,
  sound = true,
  audio = null;
game.difficulty = tablePreferences.difficulty;
$('#player-count').value = String(requestedCount);
try {
  sound = preferenceStorage.getItem('noir-sound') !== 'false';
  hints = preferenceStorage.getItem('noir-hints') !== 'false';
} catch {}
let pendingBotSettings = loadBotSettings();
const opponents = createOpponentsController({
  getGame: () => game,
  getCount: () => requestedCount,
  getSettings: () => pendingBotSettings,
  onSave: (settings) => {
    pendingBotSettings = settings;
    opponents.refresh();
  },
});
const format = (n) => n.toLocaleString('en-US'),
  streets = ['翻牌前', '翻牌', '转牌', '河牌'],
  profiles = ['YOU', 'M', 'A', 'R', 'K', 'L', 'T', 'J', 'L'];
const winnerIcon =
  '<svg class="winner-icon" viewBox="0 0 20 16" aria-hidden="true"><path d="M2 4 6 7 10 2 14 7 18 4 16 12H4Z"/><path d="M4 15H16"/></svg>';
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

async function unlockAudio() {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running' && audio.state !== 'closed') await audio.resume();
  } catch {}
}
for (const event of ['pointerdown', 'pointerup', 'keydown']) {
  document.addEventListener(
    event,
    (e) => {
      if (e.isTrusted) void unlockAudio();
    },
    { capture: true },
  );
}
function soundEffect(kind = 'chip') {
  // Skip sounds until a user gesture unlocks audio; never queue stale table sounds.
  if (!activityClock.active || !sound || audio?.state !== 'running') return;
  try {
    const now = audio.currentTime;
    if (kind === 'check') {
      // Two knuckle taps: a short wooden attack and a low, quickly damped body.
      const attack = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.025), audio.sampleRate);
      const samples = attack.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = (Math.random() * 2 - 1) * Math.exp((-6 * i) / samples.length);
      [0, 0.14].forEach((offset, i) => {
        const at = now + offset,
          strength = i === 0 ? 1 : 0.8,
          noise = audio.createBufferSource(),
          filter = audio.createBiquadFilter(),
          attackGain = audio.createGain(),
          body = audio.createOscillator(),
          bodyGain = audio.createGain();
        noise.buffer = attack;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(850, at);
        filter.Q.setValueAtTime(0.7, at);
        attackGain.gain.setValueAtTime(0.08 * strength, at);
        noise.connect(filter);
        filter.connect(attackGain);
        attackGain.connect(audio.destination);
        body.type = 'triangle';
        body.frequency.setValueAtTime(165, at);
        body.frequency.exponentialRampToValueAtTime(80, at + 0.045);
        bodyGain.gain.setValueAtTime(0.0001, at);
        bodyGain.gain.exponentialRampToValueAtTime(0.035 * strength, at + 0.002);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
        body.connect(bodyGain);
        bodyGain.connect(audio.destination);
        noise.start(at);
        noise.stop(at + 0.025);
        body.start(at);
        body.stop(at + 0.08);
      });
      return;
    }
    if (kind === 'fold') {
      // A quiet falling swish, distinct from chip, deal and winning notes.
      const o = audio.createOscillator(),
        v = audio.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(260, now);
      o.frequency.exponentialRampToValueAtTime(75, now + 0.14);
      v.gain.setValueAtTime(0.0001, now);
      v.gain.exponentialRampToValueAtTime(0.02, now + 0.012);
      v.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.connect(v);
      v.connect(audio.destination);
      o.start(now);
      o.stop(now + 0.18);
      return;
    }
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
function visibleRecentAction(p) {
  return game.phase === 'done' || p.folded || p.allin || p.lastAction?.street === game.street
    ? p.lastAction
    : null;
}
function seatAction(p, { recent = false } = {}) {
  if (!recent && game.actor === p.id)
    return '<span class="seat-action-label thinking-dots">思考中</span>';
  const retained = visibleRecentAction(p);
  const action = retained?.text ?? p.action;
  const match =
    /^(?:(\d+-bet) )?(小盲|大盲|跟注|开池至|加注至|下注至|下注|短全下至|全下至|全下) (\d+)$/.exec(
      action,
    );
  if (!match)
    return `<span class="seat-action-label">${action || (game.phase === 'done' ? '未行动' : '等待行动')}</span>`;
  const label =
      p.allin && (match[2] === '小盲' || match[2] === '大盲')
        ? '全下'
        : match[1]
          ? match[1] +
            (match[2] === '短全下至'
              ? ' 短全下'
              : match[2] === '全下至'
                ? ' 全下'
                : recent
                  ? ' ' + match[2].replace(/至$/, '')
                  : '')
          : match[2].replace(/至$/, ''),
    amount = Number(match[3]);
  const meaning =
    (retained ? `${streets[retained.street]} · ` : '') +
    (match[2] === '跟注'
      ? `本次补入 ${format(amount)}，本轮累计投入 ${format(retained?.bet ?? p.bet)}`
      : `${action} · 本轮累计投入 ${format(amount)}`);
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
  const activityList = $('#activity-list'),
    activityScrollTop = activityList.scrollTop,
    followActivity =
      game.hand !== lastHand ||
      activityList.scrollHeight - activityList.clientHeight - activityScrollTop <= 24;
  const count = game.players.length;
  $('#arena').dataset.playerCount = count;
  $('#arena').classList.toggle(
    'has-full-player-names',
    game.players.slice(1).some((p) => ['viktor', 'jungleman', 'dwan'].includes(p.botProfile)),
  );
  $('#table-size-label').textContent = count + ' 人无限注';
  const displayBoard = game.practiceBoard || game.board;
  const hero = game.players[0],
    newHand = game.hand !== lastHand,
    boardChanged = displayBoard.length > lastBoard;
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
    displayBoard[i]
      ? card(displayBoard[i], {
          animate: i >= lastBoard && boardChanged,
          delay: (i - lastBoard) * 140,
          best: heroBest.has(displayBoard[i].key),
        })
      : `<div class="board-slot" aria-label="未发出的公共牌">${['♠', '♣', '♥', '♦', '♠'][i]}</div>`,
  ).join('');
  $('#seats').innerHTML = game.players
    .slice(1)
    .map((p) => {
      const winner = game.winners.find((w) => w.id === p.id),
        isWinner = !!winner,
        reveal = isSeatHandVisible(p),
        rank =
          reveal && !p.folded && game.board.length === 5
            ? evaluate([...p.hole, ...game.board])
            : null,
        [x, y] = layouts[count][p.id - 1];
      const rankMarkup =
        rank || winner
          ? `<div class="hand-rank ${winner ? 'rank-winner winner-indicator' : ''}"${winner ? ` aria-label="${p.name} 获得底池 ${format(winner.amount)} 筹码" title="${winner.label} · 获得 ${format(winner.amount)} 筹码"` : ''}>${winner ? winnerIcon : ''}${rank?.label ?? '获胜'}</div>`
          : '';
      const profile = getBotProfile(p.botProfile),
        mood = game.emotionMode === 'off' ? 'steady' : p.botMood.kind,
        title = `${p.name} · ${profile.short}（训练原型） · 模拟状态：${MOOD_LABELS[mood]}`;
      return `<div class="seat seat-${p.id} ${x < 25 ? 'seat-left' : x > 75 ? 'seat-right' : ''} ${p.folded ? 'folded' : ''} ${game.actor === p.id ? 'thinking' : ''} ${isWinner ? 'winner' : ''}" data-player="${p.id}" data-profile="${p.botProfile}" data-mood="${mood}" style="left:${x}%;top:${y}%"><div id="seat-hand-${p.id}" class="mini-cards ${reveal ? 'revealed-cards' : ''}">${reveal ? p.hole.map((c) => card(c, { small: true, best: !!rank && rank.cards.some((best) => best.key === c.key) })).join('') : p.hole.map((c, i) => `<span class="card-back ${newHand ? 'card-deal' : ''}" style="--delay:${p.id * 65 + i * 140}ms" aria-label="对手底牌"></span>`).join('')}</div><div class="seat-profile"><span class="avatar avatar-${p.id - 1}" title="${title}" aria-label="${title}">${portraitContent(profile.id, profiles[p.id])}</span><div><strong>${p.name}${positionBadge(p.id)}</strong><span class="seat-style-label" data-style-profile="${profile.id}" title="${profile.name} · ${profile.tag}" aria-label="${p.name} 本手风格：${profile.name}">${profile.short}</span><span class="seat-bankroll"><span class="seat-stack">${format(p.stack)}</span>${game.phase === 'done' ? `<button class="seat-peek" data-peek-player="${p.id}" title="${reveal ? '收起底牌' : '查看底牌'}" aria-label="${reveal ? '收起' : '查看'} ${p.name} 的底牌" aria-pressed="${!!reveal}" aria-controls="seat-hand-${p.id}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10C4 6 7 5 10 5C13 5 16 6 18 10C16 14 13 15 10 15C7 15 4 14 2 10Z"/><circle cx="10" cy="10" r="2.5"/></svg></button>` : ''}</span></div></div>${rankMarkup}<div class="seat-action" aria-label="${p.name} 的最近行动">${seatAction(p)}</div></div>`;
    })
    .join('');
  preparePortraits($('#seats'));
  $('#hero-cards').innerHTML = hero.hole
    .map((c, i) => card(c, { animate: newHand, delay: 420 + i * 130, best: heroBest.has(c.key) }))
    .join('');
  const heroRank = $('#hero-hand-rank'),
    heroWinner = game.winners.find((w) => w.id === 0),
    showHeroRank = game.board.length === 5 && (game.revealed || game.showdown);
  heroRank.hidden = !showHeroRank && !heroWinner;
  heroRank.innerHTML =
    (heroWinner ? winnerIcon : '') +
    (showHeroRank
      ? (hero.folded ? '已弃牌 · ' : '') + evaluate([...hero.hole, ...game.board]).label
      : '获胜');
  heroRank.classList.toggle('rank-winner', !!heroWinner);
  heroRank.classList.toggle('winner-indicator', !!heroWinner);
  if (heroWinner) {
    heroRank.setAttribute('aria-label', `你 获得底池 ${format(heroWinner.amount)} 筹码`);
    heroRank.title = `${heroWinner.label} · 获得 ${format(heroWinner.amount)} 筹码`;
  } else {
    heroRank.removeAttribute('aria-label');
    heroRank.removeAttribute('title');
  }
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
  const heroRecentAction = visibleRecentAction(hero);
  $('#hero-last-action').hidden = !heroRecentAction;
  $('#hero-turn').hidden = false;
  $('#hero-last-action').innerHTML = heroRecentAction ? seatAction(hero, { recent: true }) : '';
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
  const activityText = createActivityFormatter(game.players);
  activityList.innerHTML = game.logs
    .slice()
    .reverse()
    .map(
      (l, i) =>
        `<li value="${i + 1}" class="log-${l.type} ${l.player === 0 ? 'log-hero' : ''}">${activityText(l.text)}</li>`,
    )
    .join('');
  $('#activity-count').textContent = game.phase === 'done' ? 'FINISHED' : 'LIVE';
  const done = game.phase === 'done';
  $('#arena').classList.toggle('is-done', done);
  $('.decision-strip').hidden = done;
  document
    .querySelectorAll('input[name="difficulty"]')
    .forEach((input) => (input.checked = input.value === game.difficulty));
  opponents.refresh();
  $('#board-caption').textContent = game.practiceBoard
    ? '练习补牌 · 五张公共牌，不影响结算'
    : done && game.showdown
      ? hero.folded
        ? '摊牌 · 对手亮出底牌'
        : '摊牌 · 最佳组合已高亮'
      : game.street === 0
        ? '等待翻牌'
        : game.street === 1
          ? 'FLOP · 三张公共牌'
          : game.street === 2
            ? 'TURN · 第四张公共牌'
            : 'RIVER · 最后的决定';
  const details = potDetails();
  const potButton = $('#pot-details-button');
  potButton.textContent = '明细';
  potButton.setAttribute(
    'aria-label',
    details.pots.length > 1
      ? '查看底池明细：主池及 ' + (details.pots.length - 1) + ' 个边池'
      : '查看底池明细',
  );
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
  $('#continue-deal-button').hidden = !canFastFinish() && !finishing;
  $('#continue-deal-button').disabled = finishing;
  $('#continue-deal-button').textContent = finishing ? '正在发牌…' : '立刻发完';
  $('#action-panel').classList.toggle('folded-actions', hero.folded && !done);
  $('#restart-hand-button').hidden = !canRestartHand(game);
  $('#action-panel').classList.toggle('settled-actions', done);
  $('#next-button').textContent = hero.stack === 0 ? '补充筹码，继续练习' : '下一手';
  $('#next-button').classList.toggle('has-mobile-label', hero.stack === 0);
  $('#next-button').dataset.mobileLabel = '补充筹码';
  $('#next-button').setAttribute('aria-label', hero.stack === 0 ? '补充筹码，继续练习' : '下一手');
  for (const b of [$('#fold-button'), $('#call-button')]) b.disabled = !legal.enabled;
  $('#raise-button').disabled = !legal.enabled || !legal.canRaise;
  $('#bet-slider').disabled = !legal.enabled || !legal.canRaise;
  document
    .querySelectorAll('[data-preset]')
    .forEach((b) => (b.disabled = !legal.enabled || !legal.canRaise));
  if (legal.enabled) {
    const min = legal.minRaiseTo,
      max = legal.maxRaiseTo;
    bet = legalRaiseTo(bet, legal);
    const slider = $('#bet-slider');
    slider.min = min;
    slider.max = max;
    slider.step = CHIP_UNIT;
    slider.value = bet;
    $('#call-button').innerHTML = legal.canCheck
      ? '<span>过牌</span>'
      : `<span class="button-label-desktop">${legal.callAmount < legal.toCall ? '全下跟注' : '跟注'}</span><span class="button-label-mobile" aria-hidden="true">${legal.callAmount < legal.toCall ? '全下' : '跟注'}</span><strong>${format(legal.callAmount)}</strong>`;
    $('#call-button').setAttribute(
      'aria-label',
      legal.canCheck
        ? '过牌'
        : `${legal.callAmount < legal.toCall ? '全下跟注' : '跟注'} ${format(legal.callAmount)}`,
    );
    $('#decision-text').textContent = legal.canCheck
      ? '轮到你了，可以过牌或主动下注。'
      : `轮到你了，跟注需要 ${format(legal.callAmount)} 筹码。${legal.raiseReopened ? '' : '本轮加注权未重开，仅可跟注或弃牌。'}`;
  } else if (done) $('#decision-text').textContent = '';
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
  updateCoach();
  handReview.update(game, epoch);
  showdown.update(game, epoch);
  lastHand = game.hand;
  lastBoard = displayBoard.length;
  playViewport.update(game, done);
  // Desktop history is bounded by the table. Keep following new actions only
  // while the reader is at the bottom; reviewing earlier actions keeps its place.
  if (!compactCoach.matches)
    activityList.scrollTop = followActivity ? activityList.scrollHeight : activityScrollTop;
}
function updateBet() {
  const legal = legalActions(game, 0);
  $('#bet-value').textContent = format(bet);
  const action = raiseCaption(
    { street: game.street, history: game.history, currentBet: game.currentBet, legal },
    bet,
  );
  $('#raise-button').innerHTML =
    `<span class="button-label-desktop">${action}</span><span class="button-label-mobile" aria-hidden="true">${bet === legal.maxRaiseTo ? '全下' : '加注'}</span><strong>${format(bet)}</strong>`;
  $('#raise-button').setAttribute('aria-label', action + ' ' + format(bet));
}

function updateCoach(force = false) {
  const toggle = $('#hint-toggle');
  toggle.setAttribute('aria-pressed', String(hints));
  toggle.setAttribute('aria-checked', String(hints));
  toggle.title = hints ? '牌桌提示已开启' : '牌桌提示已关闭';
  $('#coach-disabled').hidden = hints || compactCoach.matches;
  const p = game.players[0],
    e = evaluate([...p.hole, ...game.board]);
  let tip = '';
  if (game.phase === 'done')
    tip = p.folded
      ? '回看弃牌时的价格与对手范围，判断是否值得继续。'
      : game.showdown
        ? `你以${e.label}摊牌。复盘关键下注，区分决策质量与发牌运气。`
        : '复盘本手加注，判断对手弃牌能否让这条路线长期盈利。';
  else if (game.street === 0) {
    const [a, b] = p.hole;
    if (a?.rank === b?.rank) tip = '口袋对子有成三条的潜力；面对大额加注，先考虑跟注成本。';
    else if (a?.rank >= 11 && b?.rank >= 11)
      tip = '两张高牌可主动争夺底池；面对大额加注，仍要判断对手范围。';
    else if (a?.suit === b?.suit) tip = '同花底牌有成牌潜力，仍需结合位置和跟注价格。';
    else tip = '前位谨慎选牌，后位利用更多信息；结合价格决定是否入池。';
  } else if (e.score[0] >= 3) tip = `你已形成${e.label}，可考虑价值下注，并留意牌面上更强的组合。`;
  else if (e.score[0] >= 1) tip = `目前是${e.label}；多人底池或持续大额加注时，谨慎判断。`;
  else tip = '尚未成对，结合成牌机会、跟注价格与对手范围决定。';
  const legal = legalActions(game, 0);
  if (legal.enabled && legal.toCall > 0)
    tip += ` 跟注占可争夺底池约 ${Math.round((legal.callAmount / contestableAfterCall(game, 0, legal.callAmount)) * 100)}%。`;
  const stage = game.phase === 'done' ? '本手复盘' : streets[game.street] + '策略';
  hintNotification.update({
    enabled: hints,
    key: `${compactCoach.matches ? 'banner' : 'card'}:${epoch}:${game.hand}:${game.street}:${game.phase === 'done' ? 'done' : legal.enabled ? `turn:${game.currentBet}:${p.bet}` : 'waiting'}`,
    text: tip,
    stage,
    force,
    persistent: !compactCoach.matches,
    notify:
      !compactCoach.matches ||
      force ||
      game.phase === 'done' ||
      (!p.folded && (legal.enabled || game.hand !== lastHand || game.board.length !== lastBoard)),
  });
}
function changeCoachLayout() {
  positionCoach();
  updateCoach(true);
}
compactCoach.addEventListener('change', changeCoachLayout);
function schedule() {
  clearTimeout(timer);
  if (!activityClock.active) return;
  const ticket = epoch;
  if (game.phase === 'done' || finishing) {
    botWait = null;
    dealWait = null;
    return;
  }
  if (game.phase === 'between') {
    botWait = null;
    if (!dealWait || dealWait.ticket !== ticket || dealWait.street !== game.street)
      dealWait = {
        ticket,
        street: game.street,
        deadline: activityClock.now() + (game.board.length === 5 ? 850 : 1000),
      };
    timer = setTimeout(
      () => {
        if (!activityClock.active || ticket !== epoch || game.phase !== 'between' || finishing)
          return;
        dealWait = null;
        advanceStreet(game);
        soundEffect(game.phase === 'done' ? 'win' : 'deal');
        render();
        schedule();
      },
      Math.max(0, dealWait.deadline - activityClock.now()),
    );
  } else if (game.actor !== 0) {
    dealWait = null;
    if (!botWait || !isBotTurnCurrent(game, botWait.plan)) {
      const plan = planBotTurn(game),
        startedAt = activityClock.now();
      botWait = { plan, startedAt, deadline: startedAt + plan.delayMs };
    }
    const waiting = botWait;
    timer = setTimeout(
      () => {
        if (!activityClock.active || ticket !== epoch || botWait !== waiting || finishing) return;
        if (!isBotTurnCurrent(game, waiting.plan)) {
          botWait = null;
          schedule();
          return;
        }
        botWait = null;
        const id = game.actor,
          canCheck = legalActions(game, id).canCheck,
          d = executeBotTurn(game, waiting.plan, {
            waitedMs: activityClock.now() - waiting.startedAt,
          });
        const checked = d.action === 'check' || (d.action === 'call' && canCheck);
        if (d.action !== 'fold' && !checked) {
          flyChips(id);
          soundEffect();
        }
        if (checked) soundEffect('check');
        if (d.action === 'fold') soundEffect('fold');
        if (game.phase === 'done') soundEffect('win');
        render();
        schedule();
      },
      Math.max(0, waiting.deadline - activityClock.now()),
    );
  } else botWait = null;
}
function heroAction(action, amount) {
  if (!activityClock.active) return false;
  if (!legalActions(game, 0).enabled) return false;
  const legal = legalActions(game, 0);
  act(game, 0, action, amount);
  if (action === 'raise' || (action === 'call' && legal.toCall > 0)) {
    flyChips(0);
    soundEffect();
  }
  if (action === 'check' || (action === 'call' && legal.canCheck)) soundEffect('check');
  if (action === 'fold') soundEffect('fold');
  if (game.phase === 'done') soundEffect('win');
  render();
  schedule();
  return true;
}
function canFastFinish() {
  return (
    game.players[0].folded &&
    !finishing &&
    (game.phase !== 'done' || (game.board.length < 5 && !game.practiceBoard))
  );
}
async function continueDeal() {
  if (!canFastFinish()) return false;
  clearTimeout(timer);
  const waiting = botWait;
  botWait = null;
  const ticket = ++epoch;
  finishing = true;
  render();
  try {
    while (ticket === epoch && game.phase !== 'done') {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await activityClock.waitUntilActive();
      if (ticket !== epoch) return false;
      if (game.phase === 'between') advanceStreet(game);
      else {
        if (waiting && isBotTurnCurrent(game, waiting.plan))
          executeBotTurn(game, waiting.plan, {
            expedited: true,
            waitedMs: activityClock.now() - waiting.startedAt,
          });
        else playBotTurn(game);
      }
      if (game.phase === 'between') render();
    }
    await activityClock.waitUntilActive();
    if (ticket === epoch) completeBoardForPractice(game);
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
  botWait = null;
  seatHandVisibility.clear();
  finishing = false;
  clearTimeout(timer);
  showdown.reset();
  epoch++;
  lastBoard = 0;
  $('#pot-dialog').close();
  if (requestedCount !== game.players.length) {
    const difficulty = game.difficulty;
    game = newGame(requestedCount);
    game.difficulty = difficulty;
    handReview.reset();
    lastHand = 0;
  }
  $('#table-change-note').hidden = true;
  applyBotSettings(game, pendingBotSettings);
  startHand(game);
  const legal = legalActions(game, 0);
  bet = legal.enabled ? legalRaiseTo(150, legal) : 150;
  render();
  soundEffect('deal');
  schedule();
}
function retryHand() {
  if (!canRestartHand(game)) return false;
  botWait = null;
  seatHandVisibility.clear();
  finishing = false;
  clearTimeout(timer);
  showdown.reset();
  handReview.rollback(game, epoch);
  epoch++;
  $('#pot-dialog').close();
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
    dialog = $('#pot-dialog'),
    expanded = new Set(
      dialog.open
        ? [...dialog.querySelectorAll('.pot-distribution[open]')].map((el) =>
            Number(el.dataset.potIndex),
          )
        : [],
    ),
    eligibilityLabel = (pot) =>
      pot.eligible.includes(0)
        ? '你可争夺'
        : done || hero.folded
          ? '你不参与此池'
          : hero.allin
            ? '超出你的全下额度'
            : '你尚未投入此池',
    contributions = (pot) =>
      pot.contributions
        .map(
          (c) =>
            `<li><span>${game.players[c.id].name}${game.players[c.id].folded ? ' · 已弃牌' : game.players[c.id].allin ? ' · 全下' : ''}</span><b>${format(c.amount)}</b></li>`,
        )
        .join(''),
    crown = winnerIcon.replace('winner-icon', 'pot-winner-icon');
  dialog.classList.toggle('is-settled', done);
  $('#pot-dialog-title').textContent = done ? '本手结算' : '主池与边池';
  $('#pot-dialog-note').hidden = done;
  $('#pot-dialog-note').textContent = done
    ? ''
    : '金额按当前投入显示；尚未行动的玩家需跟注才能保留相应资格。仅全下额度形成边池，未被跟注的部分待跟注或退还。';
  $('#pot-dialog-content').innerHTML =
    details.pots
      .map((pot) => {
        const participants = pot.eligible.map((id) => game.players[id].name).join('、');
        if (done) {
          const split = pot.awards.length > 1;
          return `<section class="pot-detail-card settled-pot" data-pot-index="${pot.index}">
        <div class="pot-detail-heading"><h3>${pot.label}</h3>${split ? `<span class="pot-split-total">${format(pot.amount)} 筹码 · 平分</span>` : ''}</div>
        <div class="pot-awards">${pot.awards.map((a) => `<div class="pot-award" data-award-player="${a.id}"><span class="pot-award-player">${crown}<span><b>${game.players[a.id].name}${split ? '' : ' 获胜'}</b><small>${a.label}</small></span></span><strong>+${format(a.amount)}<small>筹码</small></strong></div>`).join('')}</div>
        <details class="pot-distribution" data-pot-index="${pot.index}"${expanded.has(pot.index) ? ' open' : ''}><summary>查看分配详情</summary><div class="pot-distribution-body"><p>${eligibilityLabel(pot)} · 结算资格：${participants}</p><h4>本池投入</h4><ul class="pot-contribution-list">${contributions(pot)}</ul>${split ? '<p class="pot-rounding-note">零头筹码按庄家左侧顺序分配。</p>' : ''}</div></details>
      </section>`;
        }
        return `<section class="pot-detail-card" data-pot-index="${pot.index}"><div class="pot-detail-heading"><h3>${pot.label}</h3><strong>${format(pot.amount)}<span>筹码</span></strong></div><div class="pot-eligibility ${pot.eligible.includes(0) ? 'hero-eligible' : ''}">${eligibilityLabel(pot)}<span> · ${pot.eligible.length} 人</span></div><p class="pot-player-list">可争夺：${participants}</p><details class="pot-contributions"><summary>查看本池投入</summary><ul>${contributions(pot)}</ul></details></section>`;
      })
      .join('') +
    details.refunds
      .map((r) =>
        done
          ? `<div class="pot-refund compact-refund" data-refund-player="${r.id}" aria-label="${game.players[r.id].name} 未跟注的 ${format(r.amount)} 筹码已退还"><span>未跟注退还 <b>${game.players[r.id].name}</b></span><strong>${format(r.amount)}</strong></div>`
          : `<div class="pot-refund"><span>待跟注或退还<b>${game.players[r.id].name}</b></span><strong>${format(r.amount)}</strong></div>`,
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
  if (!legal.enabled || !legal.canRaise) return;
  bet = legalRaiseTo(Number(e.target.value), legal);
  updateBet();
};
document.querySelectorAll('[data-preset]').forEach(
  (button) =>
    (button.onclick = () => {
      const legal = legalActions(game, 0);
      const target = presetRaiseTo(
        { currentBet: game.currentBet, pot: potSize(game), legal },
        button.dataset.preset,
      );
      if (target === null) return;
      bet = target;
      $('#bet-slider').value = bet;
      updateBet();
    }),
);
$('#player-count').onchange = (e) => {
  const count = Number(e.target.value);
  if (!Number.isInteger(count) || count < 5 || count > 9) return;
  requestedCount = count;
  saveTablePreferences({ playerCount: requestedCount, difficulty: game.difficulty });
  const note = $('#table-change-note');
  note.hidden = requestedCount === game.players.length;
  note.textContent = `下一手切换为 ${requestedCount} 人桌 · 筹码恢复 5,000，统计重新开始`;
};
function toggleOpponentHand(id) {
  const p = game.players[id];
  if (game.phase !== 'done' || !Number.isInteger(id) || id === 0 || !p) return false;
  const visible = !isSeatHandVisible(p);
  seatHandVisibility.set(id, visible);
  render();
  $(`[data-peek-player="${id}"]`).focus({ preventScroll: true });
  if (visible && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $(`#seat-hand-${id}`).animate([{ opacity: 0.2 }, { opacity: 1 }], {
      duration: 180,
      easing: 'ease-out',
    });
  }
  return true;
}
$('#seats').onclick = (e) => {
  const button = e.target.closest('[data-peek-player]');
  if (button) toggleOpponentHand(Number(button.dataset.peekPlayer));
};
$('#continue-deal-button').onclick = continueDeal;
$('#difficulty').onchange = (e) => {
  if (
    e.target.matches('input[name="difficulty"]') &&
    ['easy', 'normal', 'hard'].includes(e.target.value)
  ) {
    game.difficulty = e.target.value;
    saveTablePreferences({ playerCount: requestedCount, difficulty: game.difficulty });
    if (game.phase === 'playing' && game.actor !== 0 && !finishing) schedule();
  }
};
function updateSound() {
  const b = $('#sound-button');
  b.setAttribute('aria-pressed', String(sound));
  b.setAttribute('aria-checked', String(sound));
  b.title = sound ? '音效已开启' : '音效已关闭';
}
$('#sound-button').onclick = () => {
  sound = !sound;
  try {
    preferenceStorage.setItem('noir-sound', String(sound));
  } catch {}
  updateSound();
  if (sound) void unlockAudio().then(() => soundEffect('deal'));
};
$('#hint-toggle').onclick = () => {
  hints = !hints;
  try {
    preferenceStorage.setItem('noir-hints', String(hints));
  } catch {}
  updateCoach(true);
};
$('#rules-button').onclick = () => $('#rules-dialog').showModal();
$('#reset-button').onclick = () => $('#reset-dialog').showModal();
$('#pot-details-button').onclick = () => $('#pot-dialog').showModal();
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
    emotionMode: game.emotionMode,
    canContinue: canFastFinish(),
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
    board: (game.practiceBoard || game.board).map((c) => rankText(c.rank) + c.symbol),
    settlementBoard: game.board.map((c) => rankText(c.rank) + c.symbol),
    practiceRunout: !!game.practiceBoard,
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
      action: p.action,
      lastAction: p.lastAction ? { ...p.lastAction } : null,
      ...(p.id
        ? {
            botProfile: p.botProfile,
            mood: game.emotionMode === 'off' ? 'steady' : p.botMood.kind,
            botStats: { ...p.botStats },
          }
        : {}),
      ...(isSeatHandVisible(p) ? { cards: p.hole.map((c) => rankText(c.rank) + c.symbol) } : {}),
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
positionCoach();
document.addEventListener('noir:app-state', ({ detail }) => {
  if (typeof detail?.active !== 'boolean') return;
  hintNotification.setActive(detail.active && !document.hidden);
  if (detail.active && !document.hidden && !compactCoach.matches) updateCoach(true);
  if (!activityClock.setActive(detail.active)) return;
  if (!detail.active) {
    clearTimeout(timer);
    if (audio?.state === 'running') void audio.suspend().catch(() => {});
  } else schedule();
});
document.addEventListener('visibilitychange', () => {
  hintNotification.setActive(activityClock.active && !document.hidden);
  if (activityClock.active && !document.hidden && !compactCoach.matches) updateCoach(true);
});
window.addEventListener(
  'pagehide',
  () => {
    compactCoach.removeEventListener('change', changeCoachLayout);
    hintNotification.destroy();
    hintMarquee.destroy();
  },
  { once: true },
);
nextHand();
registerTools();
