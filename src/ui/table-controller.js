import { difficultyPolicy } from '../engine/bot-difficulty.js';
import {
  sameStakes,
  validateStakes,
  stakesFromSmallBlind,
  SMALL_BLIND_INPUT_ERROR,
} from '../engine/stakes.js';
import { createHeroTurnCue, createHeroTurnAttention } from './hero-turn.js';
import { notifyHeroTurn } from '../platform/haptics.js';
import { createDialogScrollLock } from './dialog-scroll-lock.js';
import { soundSamples, SOUND_SAMPLE_RATE, createSoundOutput } from './sound-cues.js';
import { loadFeedbackPreferences } from './feedback-preferences.js';
import { createWebBackgroundMusic } from '../platform/web-background-music.js';
import { createDealGate } from './deal-gate.js';
import {
  renderOpponentSeats,
  renderSeatAction,
  visibleRecentAction as sceneRecentAction,
} from './table-scene.js';
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
  rebuyHero,
  heroRebuysLeft,
  needsHeroRebuy,
} from '../engine/poker.js';
import { isPremiumStart } from '../engine/starting-hands.js';
import { standingLabel, standingClass } from '../engine/game-records.js';
import { recordSnapshots } from '../platform/record-snapshots.js';
import { createGameEffects } from './game-effects.js';
import { CROWN_MARKUP } from './table-scene.js';
import { ceremonySamples, CEREMONY_SAMPLE_RATE, CEREMONY_CUES } from './ceremony-sounds.js';
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
import { tableHint } from '../review/table-hint.js';
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
const coachContent = $('#coach-content');
const settlementLayout = createSettlementLayout($('#arena'), { observe: false });
const playViewport = createPlayViewport($('.game-surface'), { layout: settlementLayout.update });
const hintMarquee = createHintMarquee(coachContent, $('#coach-tip'), () => true);
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
const gameRecords = createGameRecords({ storage: preferenceStorage, snapshots: recordSnapshots });
const effects = createGameEffects();
// Each game end is celebrated once; the crown then stays on the champion.
let ceremonyKey = '',
  crownedKey = '',
  rebuying = false,
  toastTimer = null;
function showToast(message) {
  const toast = $('#app-toast');
  setLocalizedText(toast, message);
  toast.hidden = false;
  toast.classList.remove('is-leaving');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('is-leaving');
    toastTimer = setTimeout(() => (toast.hidden = true), 320);
  }, 3200);
}
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
  vibration = true,
  audio = null,
  audioOutput = null;
let newRecordSession = false;
game.history ||= [];
game.difficulty = tablePreferences.difficulty;
$('#player-count').value = String(requestedCount);
try {
  ({ sound, vibration } = loadFeedbackPreferences(preferenceStorage));
  hints = preferenceStorage.getItem('noir-hints') !== 'false';
} catch {}
const backgroundMusic = createWebBackgroundMusic({
  enabled: sound,
  active: false,
  createContext: () => {
    prepareAudio();
    return audio;
  },
  sharedContext: true,
  getOutput: () => audioOutput,
});
let pendingBotSettings = loadBotSettings();
const dealGate = createDealGate({
  active: activityClock.active,
  complete() {
    render();
    schedule();
  },
});
const opponents = createOpponentsController({
  getGame: () => game,
  getCount: () => requestedCount,
  getSettings: () => pendingBotSettings,
  onSave: (settings) => {
    pendingBotSettings = settings;
    setLocalizedText($('#difficulty-description'), difficultyPolicy(game.difficulty).description);
    if (game.phase === 'idle') {
      applyBotSettings(game, pendingBotSettings);
      render();
    } else opponents.refresh();
  },
});
let selectedPotSnapshot = null;
const recordsView = createGameRecordsView({
  records: gameRecords,
  openReview: (input, key) => handReview.openInput(input, key),
  toast: showToast,
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
      if (e.isTrusted) {
        void unlockAudio();
        backgroundMusic.unlock();
      }
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
      const ceremony = CEREMONY_CUES.includes(kind),
        samples = ceremony ? ceremonySamples(kind) : soundSamples(kind);
      buffer = audio.createBuffer(
        1,
        samples.length,
        ceremony ? CEREMONY_SAMPLE_RATE : SOUND_SAMPLE_RATE,
      );
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
const heroTurnAttention = createHeroTurnAttention({
  publish(phase) {
    for (const element of [$('.hero-cards-wrap'), $('.action-dock')]) {
      element.classList.toggle('turn-attention', !!phase);
      element.classList.toggle('turn-enter', phase === 'enter');
      element.classList.toggle('turn-reminder', phase === 'reminder');
      element.dataset.turnPhase = phase;
    }
  },
});
function syncTurnAttention() {
  heroTurnAttention.update({
    key: `${epoch}:${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.history?.length || 0}`,
    enabled: !dealGate.pending && legalActions(game, 0).enabled,
    active: activityClock.active && !document.hidden,
  });
}
const overKey = () =>
  game.over ? `${gameRecords.sessionNumber()}:${game.hand}:${game.replayAttempt || 0}` : '';
const gameEndKey = () => (game.over && game.over.championId !== null ? overKey() : '');
// The coronation runs once per decided game, after the settlement paints; a
// game the hero leaves without a champion gets the farewell card instead.
function celebrate() {
  const key = overKey();
  if (!key || ceremonyKey === key) return;
  ceremonyKey = key;
  if (game.over.championId === null) {
    soundEffect('farewell');
    effects.farewell($('.table-viewport'), game.over.heroPlace);
    return;
  }
  // Paint the hidden resting crown first; the flight lands exactly on it.
  render();
  const champion = game.over.championId,
    heroWon = champion === 0,
    crown = () => $(champion === 0 ? '.hero-champion-crown' : `.seat-${champion} .champion-crown`);
  soundEffect(heroWon ? 'champion' : 'crowned');
  effects.coronation({
    target: crown(),
    caption: heroWon ? '你获得冠军' : `${game.players[champion].name} 获得冠军`,
    confetti: heroWon,
    done: () => {
      if (gameEndKey() !== key) return;
      crownedKey = key;
      render();
      crown()?.classList.add('crown-arrive');
    },
  });
}
function render() {
  gameRecords.capture(game);
  recordsView.refresh();
  renderStakesSettings();
  const activityList = $('#activity-list');
  const waiting = game.phase === 'idle';
  const dealing = dealGate.pending;
  const nextEntryHand = gameRecords.nextHandIdentity(game, { newSession: newRecordSession });
  const entryState = waiting ? 'waiting' : dealing ? 'dealing' : 'playing';
  $('.game-surface').dataset.entryState = entryState;
  $('.activity-card').hidden = waiting;
  $('#entry-welcome').hidden = !waiting;
  $('#join-table-button').disabled = !waiting;
  const count = game.players.length;
  $('#arena').dataset.playerCount = count;
  $('#arena').classList.toggle(
    'has-full-player-names',
    game.players.slice(1).some((p) => ['knox', 'theo', 'finn'].includes(p.botProfile)),
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
  setLocalizedText($('#hand-number'), waiting ? '—' : String(game.hand).padStart(2, '0'));
  setLocalizedText($('#session-number-label'), `第 ${gameRecords.sessionNumber()} 局`);
  $('#replay-label').hidden = !game.replayAttempt;
  setLocalizedText($('#replay-label'), '重打 ' + game.replayAttempt);
  $('#replay-note').hidden = !game.replayAttempt;
  setLocalizedText(
    $('#street-label'),
    waiting
      ? `等待入座，即将开始第 ${nextEntryHand.sessionNumber} 局第 ${nextEntryHand.hand} 手`
      : game.over
        ? '本局结束'
        : dealing
          ? '正在发牌…'
          : game.phase === 'done'
            ? '本手结束'
            : streets[game.street] || '准备发牌',
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
  const endKey = gameEndKey(),
    crowned = endKey && ceremonyKey === endKey ? game.over.championId : null,
    crownPending = crowned !== null && crownedKey !== endKey;
  setLocalizedHTML(
    $('#seats'),
    renderOpponentSeats(game, {
      card,
      newHand,
      dealing,
      isSeatHandVisible,
      seatFaceSignatures,
      crownedId: crowned,
      crownPending,
    }),
  );
  preparePortraits($('#seats'));
  setLocalizedHTML(
    $('#hero-cards'),
    hero.hole
      .map((c, i) => card(c, { animate: newHand, delay: 420 + i * 130, best: heroBest.has(c.key) }))
      .join(''),
  );
  if (newHand && game.phase !== 'done' && isPremiumStart(hero.hole))
    effects.premiumStart($('.hero-cards-wrap'));
  $('.hero-name').classList.toggle('is-champion', crowned === 0);
  $('#hero-crown-slot').innerHTML =
    crowned === 0
      ? `<span class="champion-crown hero-champion-crown ${crownPending ? 'crown-pending' : ''}">${CROWN_MARKUP}</span>`
      : '';
  $('.hero-area').classList.toggle('hero-out', !!hero.out);
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
  if (!rebuying) setLocalizedText($('#hero-stack'), format(hero.stack));
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
  setLocalizedText($('#session-title'), game.over ? '本局结束' : '本局练习');
  const standing = $('#session-standing');
  standing.hidden = !game.over;
  standing.className = `standing-tag ${game.over ? standingClass(game.over.heroPlace) : ''}`;
  if (game.over) setLocalizedText(standing, standingLabel(game.over.heroPlace));
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
  const activityText = createActivityFormatter(game);
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
  $('.decision-strip').hidden = done || waiting;
  document
    .querySelectorAll('input[name="difficulty"]')
    .forEach((input) => (input.checked = input.value === game.difficulty));
  setLocalizedText($('#difficulty-description'), difficultyPolicy(game.difficulty).description);
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
  const canAct = legal.enabled && !dealing && !waiting;
  $('.bet-controls').hidden = done || hero.folded || waiting;
  $('.action-buttons').hidden = done || hero.folded || waiting;
  $('#next-button').hidden = !done;
  $('#continue-deal-button').hidden = !canFastFinish() && !finishing;
  $('#continue-deal-button').disabled = finishing;
  setLocalizedText($('#continue-deal-button'), finishing ? '正在发牌…' : '立刻发完');
  $('#action-panel').classList.toggle('folded-actions', hero.folded && !done);
  $('#restart-hand-button').hidden = !canRestartHand(game);
  // "下一局" replaces a reset once the game has ended.
  $('#reset-button').hidden = !!game.over;
  $('#action-panel').classList.toggle('settled-actions', done);
  $('.action-dock').classList.toggle('compact-actions', done || hero.folded);
  $('.action-dock').classList.toggle('is-enabled', canAct);
  // Next game after the game ends; a mandatory refill after losing every chip.
  const refill = needsHeroRebuy(game);
  $('#next-button').classList.toggle('rebuy-button', refill);
  setLocalizedHTML(
    $('#next-button'),
    game.over
      ? '下一局'
      : refill
        ? `<span>补充筹码</span><span class="rebuy-count">剩 ${heroRebuysLeft(game)} 次</span>`
        : '下一手',
  );
  setLocalizedAttribute(
    $('#next-button'),
    'aria-label',
    game.over ? '下一局' : refill ? `补充筹码，剩余 ${heroRebuysLeft(game)} 次` : '下一手',
  );
  heroTurnCue.update({
    key: `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.history?.length || 0}`,
    enabled: canAct,
    active: activityClock.active && vibration,
  });
  syncTurnAttention();
  $('#turn-prompt').hidden = !canAct;
  for (const b of [$('#fold-button'), $('#call-button')]) b.disabled = !canAct;
  $('#raise-button').disabled = !canAct || !legal.canRaise;
  $('#bet-slider').disabled = !canAct || !legal.canRaise;
  document
    .querySelectorAll('[data-preset]')
    .forEach((b) => (b.disabled = !canAct || !legal.canRaise));
  // Off turn the disabled slider rests at its minimum; its range is only
  // known on the hero's turn, so a stale range must not pin it to the right.
  if (!canAct) $('#bet-slider').value = $('#bet-slider').min;
  if (waiting || dealing) setLocalizedText($('#decision-text'), waiting ? '' : '正在发牌…');
  else if (legal.enabled) {
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
        ? '可以过牌或主动下注。'
        : `跟注需要 ${format(legal.callAmount)} 筹码。${legal.raiseReopened ? '' : '本轮加注权未重开，仅可跟注或弃牌。'}`,
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
  if (!waiting) updateBet();
  updateCoach();
  handReview.update(game, epoch);
  showdown.update(game, epoch);
  lastHand = game.hand;
  lastBoard = displayBoard.length;
  playViewport.update(game, done);
  celebrate();
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
  if (game.phase === 'idle' || dealGate.pending) {
    hintNotification.update({ enabled: false });
    return;
  }
  const p = game.players[0],
    legal = legalActions(game, 0),
    tip = tableHint(game, legal);
  const stage = game.phase === 'done' ? '本手复盘' : streets[game.street] + '策略';
  hintNotification.update({
    enabled: hints,
    key: `banner:${epoch}:${game.hand}:${game.street}:${game.phase === 'done' ? 'done' : legal.enabled ? `turn:${game.currentBet}:${p.bet}` : 'waiting'}`,
    text: tip,
    stage,
    force,
    notify:
      force ||
      game.phase === 'done' ||
      (!p.folded && (legal.enabled || game.hand !== lastHand || game.board.length !== lastBoard)),
  });
}
function schedule() {
  clearTimeout(timer);
  if (!activityClock.active || game.phase === 'idle' || dealGate.pending) return;
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
  if (!activityClock.active || dealGate.pending) return false;
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
// Resolve after the browser has painted a frame (or shortly, when frames are
// paused); a zero timeout alone can run before any paint.
const nextFrame = () =>
  new Promise((resolve) => {
    const fallback = setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    });
  });
async function continueDeal() {
  if (!canFastFinish()) return false;
  clearTimeout(timer);
  const waiting = botWait;
  botWait = null;
  const ticket = ++epoch;
  finishing = true;
  render();
  // Show "正在发牌…" before the remaining bot work starts. A settled fold-win
  // only completes its practice board and needs no wait.
  if (game.phase !== 'done') await nextFrame();
  try {
    let slice = performance.now();
    while (ticket === epoch && game.phase !== 'done') {
      // Bot decisions run in short slices so the page keeps painting. Streets
      // are not laid out one by one; the settled table renders once at the end.
      if (performance.now() - slice > 12) {
        await nextFrame();
        slice = performance.now();
      }
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
  dealGate.cancel();
  heroTurnAttention.reset();
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
  effects.cancel();
  rebuying = false;
  if (
    game.over ||
    requestedCount !== game.players.length ||
    !sameStakes(requestedStakes, game.stakes)
  ) {
    gameRecords.abandon(game);
    if (game.over) newRecordSession = true;
    const difficulty = game.difficulty;
    game = newGame(requestedCount, requestedStakes);
    game.difficulty = difficulty;
    handReview.reset();
    lastHand = 0;
  }
  // A refill left pending when the app closed is completed before dealing.
  if (needsHeroRebuy(game) && heroRebuysLeft(game)) rebuyHero(game);
  $('#table-change-note').hidden = true;
  applyBotSettings(game, pendingBotSettings);
  startHand(game);
  dealGate.begin();
  gameRecords.begin(game, { newSession: newRecordSession });
  newRecordSession = false;
  const legal = legalActions(game, 0);
  bet = legal.enabled ? legalRaiseTo(game.bigBlind * 3, legal) : game.bigBlind * 3;
  render();
  soundEffect('deal');
  schedule();
}
// Refill and deal the next hand at once; the stack counts up during it.
function refillAndDeal() {
  if (!needsHeroRebuy(game) || !heroRebuysLeft(game)) return false;
  rebuyHero(game);
  nextHand();
  rebuying = true;
  const ticket = epoch;
  effects.rebuy(
    $('.hero-identity'),
    $('#hero-stack'),
    { added: game.stakes.startingStack, target: game.players[0].stack },
    () => {
      if (ticket !== epoch) return;
      rebuying = false;
      render();
    },
  );
  return true;
}
function advanceGame() {
  if (game.phase !== 'done' && game.phase !== 'idle') return false;
  if (!game.over && needsHeroRebuy(game)) return refillAndDeal();
  nextHand();
  return true;
}
function retryHand() {
  if (!canRestartHand(game)) return false;
  dealGate.cancel();
  effects.cancel();
  rebuying = false;
  heroTurnAttention.reset();
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
  dealGate.begin();
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
$('#next-button').onclick = advanceGame;
$('#restart-hand-button').onclick = retryHand;
$('#bet-slider').oninput = (e) => {
  const legal = legalActions(game, 0);
  if (!legal.enabled || !legal.canRaise) return;
  heroTurnAttention.engage();
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
      heroTurnAttention.engage();
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
  if (!refreshWaitingTable()) renderStakesSettings();
};
function refreshWaitingTable() {
  if (game.phase !== 'idle') return false;
  if (requestedCount !== game.players.length || !sameStakes(requestedStakes, game.stakes)) {
    const difficulty = game.difficulty;
    game = newGame(requestedCount, requestedStakes);
    game.history = [];
    game.difficulty = difficulty;
  }
  applyBotSettings(game, pendingBotSettings);
  render();
  return true;
}
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
  if (!refreshWaitingTable()) renderStakesSettings();
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
    setLocalizedText($('#difficulty-description'), difficultyPolicy(game.difficulty).description);
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
  setLocalizedText($('#sound-label'), '音效与音乐');
  b.setAttribute('aria-pressed', String(sound));
  b.setAttribute('aria-checked', String(sound));
  setLocalizedAttribute(b, 'title', sound ? '音效与音乐已开启' : '音效与音乐已关闭');
}
$('#sound-button').onclick = () => {
  sound = !sound;
  backgroundMusic.setEnabled(sound);
  if (!sound) cancelSoundEffects();
  try {
    preferenceStorage.setItem('noir-sound', String(sound));
  } catch {}
  updateSound();
  if (sound) void unlockAudio().then(() => soundEffect('deal'));
};
function updateVibration() {
  const b = $('#vibration-button');
  b.setAttribute('aria-pressed', String(vibration));
  b.setAttribute('aria-checked', String(vibration));
  setLocalizedAttribute(b, 'title', vibration ? '振动已开启' : '振动已关闭');
}
$('#vibration-button').onclick = () => {
  vibration = !vibration;
  try {
    preferenceStorage.setItem('noir-vibration', String(vibration));
  } catch {}
  updateVibration();
  syncTurnAttention();
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
    entryState: game.phase === 'idle' ? 'waiting' : dealGate.pending ? 'dealing' : 'playing',
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
    rebuysLeft: heroRebuysLeft(game),
    needsRebuy: needsHeroRebuy(game),
    over: game.over ? { ...game.over } : null,
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
      out: !!p.out,
      place: p.place ?? null,
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
      'Deal the next hand after the current hand has ended. If you lost every chip, use one of your three refills first; after the game ends, start the next game.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute: (input) => {
      if (!input || typeof input !== 'object' || Object.keys(input).length)
        throw Error('请传入空对象。');
      if (game.phase !== 'done') throw Error('当前牌局尚未结束。');
      advanceGame();
      return publicState();
    },
  });
}
updateSound();
updateVibration();
function syncActivity() {
  const active = appActive && !isOrientationBlocked();
  backgroundMusic.setActive(active && !document.hidden);
  hintNotification.setActive(active && !document.hidden);
  const changed = activityClock.setActive(active);
  dealGate.setActive(active && !document.hidden);
  syncTurnAttention();
  if (!changed) return;
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
  dealGate.setActive(activityClock.active && !document.hidden);
  backgroundMusic.setActive(activityClock.active && !document.hidden);
  syncTurnAttention();
  hintNotification.setActive(activityClock.active && !document.hidden);
});
window.addEventListener('pagehide', (event) => {
  backgroundMusic.setActive(false);
  heroTurnAttention.reset();
  if (event.persisted) return;
  dealGate.cancel();
  backgroundMusic.dispose();
  hintNotification.destroy();
  hintMarquee.destroy();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    backgroundMusic.setActive(activityClock.active && !document.hidden);
    syncTurnAttention();
    updateCoach(true);
  }
});
$('#join-table-button').onclick = () => {
  if (game.phase !== 'idle' || !activityClock.active) return;
  nextHand();
};
document.addEventListener(
  'noir:ready',
  () => {
    backgroundMusic.setActive(activityClock.active && !document.hidden);
  },
  { once: true },
);
refreshWaitingTable();
recordsView.initialize();
registerTools();
