import {
  sameStakes,
  validateStakes,
  stakesFromSmallBlind,
  SMALL_BLIND_INPUT_ERROR,
} from '../engine/stakes.js';
import { createHeroTurnCue } from './hero-turn.js';
import { notifyHeroTurn } from '../platform/haptics.js';
import { createDialogScrollLock } from './dialog-scroll-lock.js';
import { soundSamples, SOUND_SAMPLE_RATE, createSoundOutput } from './sound-cues.js';
import {
  renderOpponentSeats,
  renderSeatAction,
  visibleRecentAction as sceneRecentAction,
} from './table-scene.js';
import { COMPACT_PLAY_QUERY } from './play-geometry.js';
import {
  localizeText,
  formatChips,
  setLocalizedText,
  setLocalizedHTML,
  setLocalizedAttribute,
} from '../i18n/index.js';
import {
  newGame,
  configureStakes,
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
import { loadBotSettings, createOpponentsController } from './opponents-controller.js';
import { loadTablePreferences, saveTablePreferences } from './preferences.js';
import { createReviewController } from './review-controller.js';
import { renderCard } from './cards.js';
import { createShowdownController } from './showdown.js';
import { createActivityFormatter } from './activity.js';
import { preparePortraits } from './portraits.js';
import { presetRaiseTo } from './bet-sizing.js';
import { chipUnitOf, legalRaiseTo } from '../engine/bet-sizing.js';
import { createSettlementLayout } from './settlement-layout.js';
import { createPlayViewport } from './play-viewport.js';
import { createHintNotification } from './hint-notification.js';
import { createHintMarquee } from './hint-marquee.js';
import { preferenceStorage } from '../platform/storage.js';
import { createGameRecords } from '../engine/game-records.js';
import { createGameRecordsView } from './game-records.js';
import { createActivityClock } from '../platform/activity-clock.js';
import { isAppActive } from '../platform/native.js';
import { isOrientationBlocked } from '../platform/orientation.js';
const activityClock = createActivityClock();
let appActive = isAppActive();
activityClock.setActive(appActive && !isOrientationBlocked());
let dealWait = null;
const $ = (s) => document.querySelector(s);
const compactCoach = window.matchMedia(COMPACT_PLAY_QUERY);
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
    if (text !== undefined && $('#coach-tip').textContent !== localizeText(text)) {
      setLocalizedText($('#coach-tip'), text);
      $('#coach-content').scrollLeft = 0;
    }
    if (stage !== undefined && $('#coach-stage').textContent !== localizeText(stage))
      setLocalizedText($('#coach-stage'), stage);
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
const seatFaceSignatures = new Map();
function isSeatHandVisible(player) {
  if (game.phase === 'done' && seatHandVisibility.has(player.id)) {
    return seatHandVisibility.get(player.id);
  }
  return (game.showdown || game.revealed) && !player.folded;
}
const tablePreferences = loadTablePreferences();
const gameRecords = createGameRecords({ storage: preferenceStorage });
let requestedCount = tablePreferences.playerCount;
let requestedStakes = tablePreferences.stakes;
let stakesError = '',
  editingSmallBlind = false;
let game = gameRecords.resume() || newGame(requestedCount, requestedStakes),
  timer = null,
  botWait = null,
  epoch = 0,
  lastBoard = 0,
  lastHand = 0,
  bet = game.bigBlind * 3,
  finishing = false,
  hints = true,
  sound = true,
  audio = null,
  audioOutput = null;
let newRecordSession = false;
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
let selectedPotSnapshot = null;
const recordsView = createGameRecordsView({
  records: gameRecords,
  openReview: (input, key) => handReview.openInput(input, key),
  onReturnGame: () => playViewport.update(game, game.phase === 'done'),
  openPots: (snapshot) => {
    selectedPotSnapshot = snapshot;
    renderPotDetails(currentPots(snapshot), snapshot);
    potScrollLock.open();
  },
});
const format = (n) => formatChips(n),
  streets = ['翻牌前', '翻牌', '转牌', '河牌'];
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
async function unlockAudio() {
  if (!sound) return;
  try {
    prepareAudio();
    if (audio.state !== 'running' && audio.state !== 'closed') await audio.resume();
  } catch {}
}
function prepareAudio() {
  if (audio || !sound) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    audioOutput = createSoundOutput(audio);
  } catch {}
}
// Allocate the graph on entry. Resume on the first trusted gesture when the
// browser requires one; never replay effects from earlier turns.
prepareAudio();
for (const event of ['pointerdown', 'pointerup', 'keydown']) {
  document.addEventListener(
    event,
    (e) => {
      if (e.isTrusted) void unlockAudio();
    },
    { capture: true },
  );
}
const soundBuffers = new Map();
const soundSources = new Set();
function cancelSoundEffects() {
  for (const source of soundSources) {
    try {
      source.stop?.();
    } catch {}
  }
  soundSources.clear();
}
function soundEffect(kind = 'chip') {
  if (!activityClock.active || !sound || audio?.state !== 'running') return;
  try {
    let buffer = soundBuffers.get(kind);
    if (!buffer) {
      const samples = soundSamples(kind);
      buffer = audio.createBuffer(1, samples.length, SOUND_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      soundBuffers.set(kind, buffer);
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audioOutput);
    soundSources.add(source);
    source.onended = () => soundSources.delete(source);
    source.start(audio.currentTime);
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
  return sceneRecentAction(game, p);
}
function seatAction(p, options) {
  return renderSeatAction(game, p, options);
}
const heroTurnCue = createHeroTurnCue(notifyHeroTurn);
function render() {
  gameRecords.capture(game);
  recordsView.refresh();
  renderStakesSettings();
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
  setLocalizedText($('#table-size-label'), count + ' 人无限注');
  setLocalizedText($('#blind-values'), `${format(game.smallBlind)} / ${format(game.bigBlind)}`);
  const displayBoard = game.practiceBoard || game.board;
  const hero = game.players[0],
    newHand = game.hand !== lastHand,
    boardChanged = displayBoard.length > lastBoard;
  const heroBest =
    game.showdown && !hero.folded
      ? new Set(evaluate([...hero.hole, ...game.board]).cards.map((c) => c.key))
      : new Set();
  setLocalizedText($('#hand-number'), String(game.hand).padStart(2, '0'));
  setLocalizedText($('#session-number-label'), `第 ${gameRecords.sessionNumber()} 局`);
  $('#replay-label').hidden = !game.replayAttempt;
  setLocalizedText($('#replay-label'), '重打 ' + game.replayAttempt);
  $('#replay-note').hidden = !game.replayAttempt;
  setLocalizedText(
    $('#street-label'),
    game.phase === 'done' ? '本手结束' : streets[game.street] || '准备发牌',
  );
  setLocalizedText(
    $('#pot-value'),
    format(game.phase === 'done' ? game.potAtShowdown : potSize(game)),
  );
  $('.pot').classList.toggle('pot-changed', boardChanged);
  setLocalizedHTML(
    $('#board'),
    Array.from({ length: 5 }, (_, i) =>
      displayBoard[i]
        ? card(displayBoard[i], {
            animate: i >= lastBoard && boardChanged,
            delay: (i - lastBoard) * 140,
            best: heroBest.has(displayBoard[i].key),
          })
        : `<div class="board-slot" aria-label="未发出的公共牌">${['♠', '♣', '♥', '♦', '♠'][i]}</div>`,
    ).join(''),
  );
  setLocalizedHTML(
    $('#seats'),
    renderOpponentSeats(game, { card, newHand, isSeatHandVisible, seatFaceSignatures }),
  );
  preparePortraits($('#seats'));
  setLocalizedHTML(
    $('#hero-cards'),
    hero.hole
      .map((c, i) => card(c, { animate: newHand, delay: 420 + i * 130, best: heroBest.has(c.key) }))
      .join(''),
  );
  const heroRank = $('#hero-hand-rank'),
    heroWinner = game.winners.find((w) => w.id === 0),
    showHeroRank = game.board.length === 5 && (game.revealed || game.showdown);
  heroRank.hidden = !showHeroRank && !heroWinner;
  setLocalizedHTML(
    heroRank,
    (heroWinner ? winnerIcon : '') +
      (showHeroRank
        ? (hero.folded ? '已弃牌 · ' : '') + evaluate([...hero.hole, ...game.board]).label
        : '获胜'),
  );
  heroRank.classList.toggle('rank-winner', !!heroWinner);
  heroRank.classList.toggle('winner-indicator', !!heroWinner);
  if (heroWinner) {
    setLocalizedAttribute(heroRank, 'aria-label', `你 获得底池 ${format(heroWinner.amount)} 筹码`);
    setLocalizedAttribute(
      heroRank,
      'title',
      `${heroWinner.label} · 获得 ${format(heroWinner.amount)} 筹码`,
    );
  } else {
    heroRank.removeAttribute('aria-label');
    heroRank.removeAttribute('title');
  }
  $('.hero-area').classList.toggle('hero-folded', hero.folded);
  $('.hero-name').classList.toggle('is-active', game.actor === 0);
  setLocalizedText($('#hero-stack'), format(hero.stack));
  const heroPosition = seatPosition(game, 0);
  setLocalizedText($('#hero-position'), heroPosition);
  $('#hero-position').dataset.position = heroPosition;
  setLocalizedAttribute($('#hero-position'), 'title', positionNames[heroPosition]);
  const heroRecentAction = visibleRecentAction(hero);
  $('#hero-last-action').hidden = !heroRecentAction;
  setLocalizedHTML(
    $('#hero-last-action'),
    heroRecentAction ? seatAction(hero, { recent: true }) : '',
  );
  setLocalizedHTML($('#session-stack'), `${format(hero.stack)}<span>CHIPS</span>`);
  const diff = hero.stack - game.stats.buyin;
  setLocalizedText(
    $('#session-change'),
    game.stats.hands
      ? `${diff >= 0 ? '+' : ''}${format(diff)} 筹码 · 本次练习净变化`
      : '从这一手开始积累经验',
  );
  $('#session-change').classList.toggle('negative', diff < 0);
  setLocalizedText($('#stat-hands'), game.stats.hands);
  setLocalizedText($('#stat-wins'), game.stats.wins);
  setLocalizedText(
    $('#stat-winrate'),
    game.stats.hands ? Math.round((game.stats.wins / game.stats.hands) * 100) + '%' : '—',
  );
  const activityText = createActivityFormatter(game.players);
  setLocalizedHTML(
    activityList,
    game.logs
      .slice()
      .reverse()
      .map(
        (l, i) =>
          `<li value="${i + 1}" class="log-${l.type} ${l.player === 0 ? 'log-hero' : ''}">${activityText(l.text)}</li>`,
      )
      .join(''),
  );
  setLocalizedText($('#activity-count'), game.phase === 'done' ? 'FINISHED' : 'LIVE');
  const done = game.phase === 'done';
  $('#arena').classList.toggle('is-done', done);
  $('.decision-strip').hidden = done;
  document
    .querySelectorAll('input[name="difficulty"]')
    .forEach((input) => (input.checked = input.value === game.difficulty));
  opponents.refresh();
  setLocalizedText(
    $('#board-caption'),
    game.practiceBoard
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
              : 'RIVER · 最后的决定',
  );
  const details = potDetails();
  const potButton = $('#pot-details-button');
  setLocalizedText(potButton, '明细');
  setLocalizedAttribute(
    potButton,
    'aria-label',
    details.pots.length > 1
      ? '查看底池明细：主池及 ' + (details.pots.length - 1) + ' 个边池'
      : '查看底池明细',
  );
  if (details.pots.length > 1)
    setLocalizedText(
      $('#board-caption'),
      (done ? '已分别结算' : '当前投入') +
        ' · 主池 ' +
        format(details.pots[0].amount) +
        ' + ' +
        (details.pots.length - 1) +
        ' 个边池',
    );
  if (!selectedPotSnapshot) renderPotDetails(details);
  const legal = legalActions(game, 0);
  $('.bet-controls').hidden = done || hero.folded;
  $('.action-buttons').hidden = done || hero.folded;
  $('#next-button').hidden = !done;
  $('#continue-deal-button').hidden = !canFastFinish() && !finishing;
  $('#continue-deal-button').disabled = finishing;
  setLocalizedText($('#continue-deal-button'), finishing ? '正在发牌…' : '立刻发完');
  $('#action-panel').classList.toggle('folded-actions', hero.folded && !done);
  $('#restart-hand-button').hidden = !canRestartHand(game);
  $('#action-panel').classList.toggle('settled-actions', done);
  $('.action-dock').classList.toggle('compact-actions', done || hero.folded);
  $('.action-dock').classList.toggle('is-enabled', legal.enabled);
  setLocalizedText($('#next-button'), hero.stack === 0 ? '补充筹码，继续练习' : '下一手');
  $('#next-button').classList.toggle('has-mobile-label', hero.stack === 0);
  setLocalizedAttribute($('#next-button'), 'data-mobile-label', '补充筹码');
  setLocalizedAttribute(
    $('#next-button'),
    'aria-label',
    hero.stack === 0 ? '补充筹码，继续练习' : '下一手',
  );
  heroTurnCue.update({
    key: `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.history.length}`,
    enabled: legal.enabled,
    active:
      activityClock.active && (!document.documentElement.classList.contains('native-app') || sound),
  });
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
    slider.step = chipUnitOf(game);
    slider.value = bet;
    setLocalizedHTML(
      $('#call-button'),
      legal.canCheck
        ? '<span>过牌</span>'
        : `<span class="button-label-desktop">${legal.callAmount < legal.toCall ? '全下跟注' : '跟注'}</span><span class="button-label-mobile" aria-hidden="true">${legal.callAmount < legal.toCall ? '全下' : '跟注'}</span><strong>${format(legal.callAmount)}</strong>`,
    );
    setLocalizedAttribute(
      $('#call-button'),
      'aria-label',
      legal.canCheck
        ? '过牌'
        : `${legal.callAmount < legal.toCall ? '全下跟注' : '跟注'} ${format(legal.callAmount)}`,
    );
    setLocalizedText(
      $('#decision-text'),
      legal.canCheck
        ? '轮到你了，可以过牌或主动下注。'
        : `轮到你了，跟注需要 ${format(legal.callAmount)} 筹码。${legal.raiseReopened ? '' : '本轮加注权未重开，仅可跟注或弃牌。'}`,
    );
  } else if (done) setLocalizedText($('#decision-text'), '');
  else if (game.phase === 'between')
    setLocalizedText(
      $('#decision-text'),
      game.revealed
        ? game.board.length === 5
          ? '摊牌 · 底牌已亮出，正在结算各底池…'
          : '全下行动结束 · 底牌已亮出，等待剩余公共牌…'
        : '本轮下注结束，正在翻开公共牌…',
    );
  else
    setLocalizedText(
      $('#decision-text'),
      hero.folded
        ? `${game.players[game.actor]?.name || '对手'} 正在行动，你可以观察这一手。`
        : `${game.players[game.actor]?.name || '对手'} 正在思考，请稍候。`,
    );
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
  setLocalizedText($('#bet-value'), format(bet));
  const action = raiseCaption(
    { street: game.street, history: game.history, currentBet: game.currentBet, legal },
    bet,
  );
  setLocalizedHTML(
    $('#raise-button'),
    `<span class="button-label-desktop">${action}</span><span class="button-label-mobile" aria-hidden="true">${bet === legal.maxRaiseTo ? '全下' : '加注'}</span><strong>${format(bet)}</strong>`,
  );
  setLocalizedAttribute($('#raise-button'), 'aria-label', action + ' ' + format(bet));
}

function updateCoach(force = false) {
  const toggle = $('#hint-toggle');
  toggle.setAttribute('aria-pressed', String(hints));
  toggle.setAttribute('aria-checked', String(hints));
  setLocalizedAttribute(toggle, 'title', hints ? '牌桌提示已开启' : '牌桌提示已关闭');
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
  cancelSoundEffects();
  heroTurnCue.reset();
  cancelSoundEffects();
  botWait = null;
  seatHandVisibility.clear();
  finishing = false;
  clearTimeout(timer);
  showdown.reset();
  epoch++;
  lastBoard = 0;
  stakesError = '';
  editingSmallBlind = false;
  $('#pot-dialog').close();
  if (requestedCount !== game.players.length || !sameStakes(requestedStakes, game.stakes)) {
    gameRecords.abandon(game);
    const difficulty = game.difficulty;
    game = newGame(requestedCount, requestedStakes);
    game.difficulty = difficulty;
    handReview.reset();
    lastHand = 0;
  }
  $('#table-change-note').hidden = true;
  applyBotSettings(game, pendingBotSettings);
  startHand(game);
  gameRecords.begin(game, { newSession: newRecordSession });
  newRecordSession = false;
  const legal = legalActions(game, 0);
  bet = legal.enabled ? legalRaiseTo(game.bigBlind * 3, legal) : game.bigBlind * 3;
  render();
  soundEffect('deal');
  schedule();
}
function retryHand() {
  if (!canRestartHand(game)) return false;
  heroTurnCue.reset();
  cancelSoundEffects();
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
  gameRecords.begin(game);
  lastHand = 0;
  lastBoard = 0;
  bet = game.bigBlind * 3;
  render();
  soundEffect('deal');
  schedule();
  return true;
}
function potDetails() {
  return currentPots(game);
}
const escapePotText = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
function renderPotDetails(details, potGame = game) {
  const done = potGame.phase === 'done',
    hero = potGame.players[0],
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
            `<li><span>${escapePotText(potGame.players[c.id].name)}${potGame.players[c.id].folded ? ' · 已弃牌' : potGame.players[c.id].allin ? ' · 全下' : ''}</span><b>${format(c.amount)}</b></li>`,
        )
        .join(''),
    crown = winnerIcon.replace('winner-icon', 'pot-winner-icon');
  dialog.classList.toggle('is-settled', done);
  setLocalizedText($('#pot-dialog-title'), done ? '本手结算' : '主池与边池');
  $('#pot-dialog-note').hidden = done;
  setLocalizedText(
    $('#pot-dialog-note'),
    done
      ? ''
      : '金额按当前投入显示；尚未行动的玩家需跟注才能保留相应资格。仅全下额度形成边池，未被跟注的部分待跟注或退还。',
  );
  setLocalizedHTML(
    $('#pot-dialog-content'),
    details.pots
      .map((pot) => {
        const participants = pot.eligible
          .map((id) => escapePotText(potGame.players[id].name))
          .join('、');
        if (done) {
          const split = pot.awards.length > 1;
          return `<section class="pot-detail-card settled-pot" data-pot-index="${pot.index}">
        <div class="pot-detail-heading"><h3>${escapePotText(pot.label)}</h3>${split ? `<span class="pot-split-total">${format(pot.amount)} 筹码 · 平分</span>` : ''}</div>
        <div class="pot-awards">${pot.awards.map((a) => `<div class="pot-award" data-award-player="${a.id}"><span class="pot-award-player">${crown}<span><b>${escapePotText(potGame.players[a.id].name)}${split ? '' : ' 获胜'}</b><small>${escapePotText(a.label)}</small></span></span><strong>+${format(a.amount)}<small>筹码</small></strong></div>`).join('')}</div>
        <details class="pot-distribution" data-pot-index="${pot.index}"${expanded.has(pot.index) ? ' open' : ''}><summary>查看分配详情</summary><div class="pot-distribution-body"><p>${eligibilityLabel(pot)} · 结算资格：${participants}</p><h4>本池投入</h4><ul class="pot-contribution-list">${contributions(pot)}</ul>${split ? '<p class="pot-rounding-note">零头筹码按庄家左侧顺序分配。</p>' : ''}</div></details>
      </section>`;
        }
        return `<section class="pot-detail-card" data-pot-index="${pot.index}"><div class="pot-detail-heading"><h3>${escapePotText(pot.label)}</h3><strong>${format(pot.amount)}<span>筹码</span></strong></div><div class="pot-eligibility ${pot.eligible.includes(0) ? 'hero-eligible' : ''}">${eligibilityLabel(pot)}<span> · ${pot.eligible.length} 人</span></div><p class="pot-player-list">可争夺：${participants}</p><details class="pot-contributions"><summary>查看本池投入</summary><ul>${contributions(pot)}</ul></details></section>`;
      })
      .join('') +
      details.refunds
        .map((r) =>
          done
            ? `<div class="pot-refund compact-refund" data-refund-player="${r.id}" aria-label="${escapePotText(potGame.players[r.id].name)} 未跟注的 ${format(r.amount)} 筹码已退还"><span>未跟注退还 <b>${escapePotText(potGame.players[r.id].name)}</b></span><strong>${format(r.amount)}</strong></div>`
            : `<div class="pot-refund"><span>待跟注或退还<b>${escapePotText(potGame.players[r.id].name)}</b></span><strong>${format(r.amount)}</strong></div>`,
        )
        .join(''),
  );
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
  saveTablePreferences({
    playerCount: requestedCount,
    difficulty: game.difficulty,
    stakes: requestedStakes,
  });
  renderStakesSettings();
};
function renderStakesSettings() {
  const input = $('#small-blind-input');
  $('#small-blind-button').textContent = format(requestedStakes.smallBlind);
  $('#small-blind-button').hidden = editingSmallBlind;
  input.hidden = !editingSmallBlind;
  if (!editingSmallBlind) input.value = String(requestedStakes.smallBlind);
  input.setAttribute('aria-invalid', String(Boolean(stakesError)));
  $('#big-blind-value').textContent = format(requestedStakes.bigBlind);
  $('#stakes-error').hidden = !stakesError;
  setLocalizedText($('#stakes-error'), stakesError);
  const note = $('#stakes-change-note');
  note.hidden = sameStakes(requestedStakes, game.stakes);
  setLocalizedText(
    note,
    `下一手起始盲注${format(requestedStakes.smallBlind)}/${format(requestedStakes.bigBlind)}·筹码恢复为${format(requestedStakes.startingStack)}，统计重新开始`,
  );
  const countNote = $('#table-change-note');
  countNote.hidden = requestedCount === game.players.length;
  setLocalizedText(
    countNote,
    `下一手切换为 ${requestedCount} 人桌 · 筹码恢复 ${format(requestedStakes.startingStack)}，统计重新开始`,
  );
}
function requestStakes(value) {
  let stakes;
  try {
    stakes = validateStakes(value);
    if (!sameStakes(stakes, stakesFromSmallBlind(stakes.smallBlind)))
      throw Error(SMALL_BLIND_INPUT_ERROR);
  } catch {
    stakesError = SMALL_BLIND_INPUT_ERROR;
    renderStakesSettings();
    return false;
  }
  const changed = !sameStakes(requestedStakes, stakes);
  requestedStakes = stakes;
  stakesError = '';
  if (changed)
    saveTablePreferences({ playerCount: requestedCount, difficulty: game.difficulty, stakes });
  renderStakesSettings();
  return changed;
}
function requestSmallBlind(value) {
  try {
    return requestStakes(stakesFromSmallBlind(value));
  } catch {
    stakesError = SMALL_BLIND_INPUT_ERROR;
    renderStakesSettings();
    return false;
  }
}
$('#small-blind-button').onclick = () => {
  editingSmallBlind = true;
  stakesError = '';
  $('#small-blind-input').value = String(requestedStakes.smallBlind);
  renderStakesSettings();
  $('#small-blind-input').focus();
  $('#small-blind-input').select();
};
$('#small-blind-input').oninput = (e) => requestSmallBlind(e.target.value);
$('#small-blind-input').onblur = () => {
  if (stakesError) return;
  editingSmallBlind = false;
  renderStakesSettings();
};
$('#small-blind-input').onkeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    requestSmallBlind(e.target.value);
    if (!stakesError) {
      editingSmallBlind = false;
      renderStakesSettings();
      $('#small-blind-button').focus();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    stakesError = '';
    editingSmallBlind = false;
    renderStakesSettings();
    $('#small-blind-button').focus();
  }
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
    saveTablePreferences({
      playerCount: requestedCount,
      difficulty: game.difficulty,
      stakes: requestedStakes,
    });
    if (game.phase === 'playing' && game.actor !== 0 && !finishing) schedule();
  }
};
function updateSound() {
  const b = $('#sound-button');
  const native = document.documentElement.classList.contains('native-app');
  setLocalizedText($('#sound-label'), native ? '音效与振动' : '音效');
  b.setAttribute('aria-pressed', String(sound));
  b.setAttribute('aria-checked', String(sound));
  setLocalizedAttribute(
    b,
    'title',
    native
      ? sound
        ? '音效与振动已开启'
        : '音效与振动已关闭'
      : sound
        ? '音效已开启'
        : '音效已关闭',
  );
}
$('#sound-button').onclick = () => {
  sound = !sound;
  if (!sound) cancelSoundEffects();
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
$('#reset-button').onclick = () => $('#reset-dialog').showModal();
const potScrollLock = createDialogScrollLock($('#pot-dialog'));
$('#pot-details-button').onclick = () => {
  selectedPotSnapshot = null;
  renderPotDetails(potDetails());
  potScrollLock.open();
};
$('#pot-dialog').addEventListener('close', () => {
  selectedPotSnapshot = null;
  renderPotDetails(potDetails());
});
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
  gameRecords.abandon(game);
  newRecordSession = true;
  handReview.reset();
  const difficulty = game.difficulty;
  clearTimeout(timer);
  game = newGame(requestedCount, requestedStakes);
  game.difficulty = difficulty;
  lastHand = 0;
  $('#reset-dialog').close();
  nextHand();
};
function publicState() {
  const details = potDetails();
  return {
    playerCount: game.players.length,
    stakes: { ...game.stakes },
    requestedStakes: { ...requestedStakes },
    pendingStakes: !sameStakes(requestedStakes, game.stakes),
    smallBlind: game.smallBlind,
    bigBlind: game.bigBlind,
    chipUnit: chipUnitOf(game),
    emotionMode: game.emotionMode,
    canContinue: canFastFinish(),
    replayAttempt: game.replayAttempt || 0,
    canRestart: canRestartHand(game),
    hand: game.hand,
    sessionNumber: gameRecords.sessionNumber(),
    recordsRoute: recordsView.route(),
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
function setStakes(value) {
  const stakes = validateStakes(value);
  if (!sameStakes(game.stakes, stakes)) gameRecords.abandon(game);
  const changed = configureStakes(game, stakes);
  const requestedChanged = !sameStakes(requestedStakes, stakes);
  if (!changed && !requestedChanged) return false;
  requestedStakes = stakes;
  stakesError = '';
  saveTablePreferences({ playerCount: requestedCount, difficulty: game.difficulty, stakes });
  if (!changed) {
    renderStakesSettings();
    return true;
  }
  handReview.reset();
  lastHand = 0;
  nextHand();
  return true;
}
window.noir = {
  getState: publicState,
  getRecords: () => gameRecords.sessions(),
  getRecordRoute: () => recordsView.route(),
  setStakes,
  requestStakes,
  requestSmallBlind,
};
function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) lifecycle.abort();
  });
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
function syncActivity() {
  const active = appActive && !isOrientationBlocked();
  hintNotification.setActive(active && !document.hidden);
  if (active && !document.hidden && !compactCoach.matches) updateCoach(true);
  if (!activityClock.setActive(active)) return;
  if (!active) {
    clearTimeout(timer);
    cancelSoundEffects();
    if (audio?.state === 'running') void audio.suspend().catch(() => {});
  } else schedule();
}
document.addEventListener('noir:app-state', ({ detail }) => {
  if (typeof detail?.active !== 'boolean') return;
  appActive = detail.active;
  syncActivity();
});
document.addEventListener('noir:orientation-state', syncActivity);
document.addEventListener('visibilitychange', () => {
  hintNotification.setActive(activityClock.active && !document.hidden);
  if (activityClock.active && !document.hidden && !compactCoach.matches) updateCoach(true);
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  compactCoach.removeEventListener('change', changeCoachLayout);
  hintNotification.destroy();
  hintMarquee.destroy();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) updateCoach(true);
});
nextHand();
recordsView.initialize();
registerTools();
