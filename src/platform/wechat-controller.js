import { presetRaiseTo, createRaiseSliderSelection, RAISE_SLIDER_MAX } from '../ui/bet-sizing.js';
import { createDealGate } from '../ui/deal-gate.js';
import { difficultyPolicy } from '../engine/bot-difficulty.js';
import { createGameRecords, standingLabel, standingClass } from '../engine/game-records.js';
import { isPremiumStart } from '../engine/starting-hands.js';
import {
  PREMIUM_DELAY_MS,
  PREMIUM_DURATION_MS,
  REBUY_DURATION_MS,
  CROWN_FLIGHT_MS,
  CONFETTI_DURATION_MS,
  FAREWELL_DURATION_MS,
  refillCountValues,
  REFILL_COUNT_STEPS,
} from '../ui/effect-layouts.js';
import { compactChips, compactActionAmounts } from '../engine/chip-format.js';
import {
  sanitizeStakes,
  validateStakes,
  stakesFromSmallBlind,
  sameStakes,
} from '../engine/stakes.js';
import { createHeroTurnCue, createHeroTurnAttention } from '../ui/hero-turn.js';
import { tableHint } from '../review/table-hint.js';
import { SEAT_ANCHORS } from '../ui/seat-geometry.js';
import { visibleRecentAction } from '../ui/recent-action.js';
import { explainOpponent } from '../review/opponents.js';
import { createReviewCache } from '../review/result-cache.js';
import { selectedActivity } from '../review/activity.js';
import { reviewCommentary } from '../review/matchups.js';
import { createActivityParts } from '../ui/activity-parts.js';
import {
  newGame,
  configureStakes,
  startHand,
  restartHand,
  canRestartHand,
  applyBotSettings,
  rebuyHero,
  heroRebuysLeft,
  needsHeroRebuy,
  advanceStreet,
  completeBoardForPractice,
  legalActions,
  act,
  planBotTurn,
  isBotTurnCurrent,
  executeBotTurn,
  seatPosition,
  potSize,
  currentPots,
  rankText,
  evaluate,
} from '../engine/poker.js';
import {
  BOT_PROFILES,
  EMOTION_MODES,
  sanitizeBotSettings,
  getBotProfile,
  assignBotSeat,
  toggleMixedLineup,
} from '../engine/bot-profiles.js';
import { chipUnitOf, legalRaiseTo } from '../engine/bet-sizing.js';
import {
  createReviewInput,
  analyzeDecision,
  summarizeReview,
  STREET_NAMES,
  actionLabel,
} from '../review/analysis.js';

export const WECHAT_SETTINGS_KEY = 'noir-wechat-settings-v1';
const cleanAction = (text) =>
  (text || '').replace(/\b\d+-bet\s*/g, '').replace(/开池|下注/g, '加注');
const cardView = (card) => ({
  key: card.key,
  rank: rankText(card.rank),
  suit: card.symbol,
  red: card.suit === 1 || card.suit === 3,
});
const format = compactChips;
const defaults = () => ({
  playerCount: 5,
  stakes: sanitizeStakes(),
  difficulty: 'normal',
  sound: true,
  music: true,
  vibration: true,
  hints: true,
  ...sanitizeBotSettings(),
});
const sanitize = (value) => ({
  ...defaults(),
  stakes: sanitizeStakes(value?.stakes),
  playerCount:
    Number.isInteger(value?.playerCount) && value.playerCount >= 5 && value.playerCount <= 9
      ? value.playerCount
      : 5,
  difficulty: ['easy', 'normal', 'hard'].includes(value?.difficulty) ? value.difficulty : 'normal',
  sound: value?.sound !== false,
  music: value?.music !== false,
  vibration: value?.vibration !== false,
  hints: value?.hints !== false,
  ...sanitizeBotSettings(value),
});

// All game mutations go through the same rule engine as Web/iOS/Android.
// Only this platform adapter owns timers, preferences, and display data.
export function createWechatController({
  publish,
  storage,
  snapshots,
  recordsBudget,
  toast = () => {},
  sound = () => {},
  wager = () => {},
  notifyTurn = () => {},
  publishAttention = () => {},
  schedule = setTimeout,
  unschedule = clearTimeout,
  createReviewWorker = null,
  readOnlyAttempt = null,
  readOnlySessionNumber = null,
}) {
  const reviewCache = createReviewCache({ storage });
  let settings;
  let stakesError = '';
  try {
    settings = sanitize(JSON.parse(storage?.getItem(WECHAT_SETTINGS_KEY)));
  } catch {
    settings = defaults();
  }
  const records = readOnlyAttempt
    ? null
    : createGameRecords({ storage, snapshots, budget: recordsBudget });
  const resumed = records?.resume();
  if (readOnlyAttempt)
    settings = sanitize({
      ...settings,
      playerCount: readOnlyAttempt.snapshot.players.length,
      stakes: readOnlyAttempt.snapshot.stakes,
      hints: false,
      sound: false,
      music: false,
      vibration: false,
    });
  const peeked = new Map();
  const raiseSelection = createRaiseSliderSelection();
  const profiles = BOT_PROFILES.map((p) => ({
    ...p,
    portrait: p.id === 'balanced' ? '' : `/assets/portraits/${p.id}.jpg`,
  }));
  const turnCue = createHeroTurnCue(notifyTurn);
  const attention = createHeroTurnAttention({
    publish: publishAttention,
    schedule,
    unschedule,
  });
  let game = readOnlyAttempt
      ? JSON.parse(JSON.stringify(readOnlyAttempt.snapshot))
      : resumed || newGame(settings.playerCount, settings.stakes),
    raiseTo = game.bigBlind * 3,
    timer = null,
    pendingBot = null,
    reviewTimer = null,
    reviewWorker = null,
    reviewSource = null,
    opponentReviews = new Map(),
    hintTimer = null,
    epoch = 0,
    active = true,
    disposed = false,
    hintKey = '',
    hintText = '',
    reviewEpoch = 0,
    newSession = false;
  game.history ||= [];
  const dealGate = createDealGate({
    schedule,
    unschedule,
    complete() {
      render();
      driveBots();
    },
  });
  // Presentation-only effect state. Every timer is cancelled with the hand.
  const effectTimers = new Set();
  let premium = false,
    rebuying = null,
    ceremony = null,
    ceremonyKey = '',
    crownedKey = '',
    confetti = false,
    farewell = null,
    effectEpoch = 0;
  // A callback already handed to the platform cannot outlive its cancellation.
  function later(fn, ms) {
    const ticket = effectEpoch;
    const timer = schedule(() => {
      effectTimers.delete(timer);
      if (!disposed && ticket === effectEpoch) fn();
    }, ms);
    effectTimers.add(timer);
  }
  function cancelEffects() {
    effectEpoch++;
    for (const timer of effectTimers) unschedule(timer);
    effectTimers.clear();
    premium = false;
    rebuying = null;
    confetti = false;
    farewell = null;
    if (ceremony) crownedKey = ceremony.key;
    ceremony = null;
  }
  const overKey = () =>
    game.over ? `${records?.sessionNumber() || 0}:${game.hand}:${game.replayAttempt || 0}` : '';
  const gameEndKey = () => (game.over && game.over.championId !== null ? overKey() : '');
  function premiumDeal() {
    if (readOnlyAttempt || !isPremiumStart(game.players[0].hole)) return;
    later(() => {
      premium = true;
      render();
      later(() => {
        premium = false;
        render();
      }, PREMIUM_DURATION_MS);
    }, PREMIUM_DELAY_MS);
  }
  // The coronation starts once per decided game; the crown then stays on. A
  // game the hero leaves without a champion gets the farewell card instead.
  function celebrate() {
    const key = overKey();
    if (!key || ceremonyKey === key || readOnlyAttempt || !active) return false;
    ceremonyKey = key;
    if (game.over.championId === null) {
      farewell = { key, place: standingLabel(game.over.heroPlace) };
      effect('farewell');
      later(() => {
        farewell = null;
        render();
      }, FAREWELL_DURATION_MS);
      return true;
    }
    const champion = game.over.championId;
    ceremony = {
      key,
      championId: champion,
      heroWon: champion === 0,
      caption: champion === 0 ? '你获得冠军' : `${game.players[champion].name} 获得冠军`,
    };
    confetti = champion === 0;
    effect(champion === 0 ? 'champion' : 'crowned');
    later(() => {
      crownedKey = key;
      ceremony = null;
      render();
    }, CROWN_FLIGHT_MS);
    if (confetti)
      later(() => {
        confetti = false;
        render();
      }, CONFETTI_DURATION_MS);
    return true;
  }
  let sliderMin = game.bigBlind * 2,
    sliderMax = game.stakes.startingStack,
    callCaption = '跟注',
    callAmountText = format(game.bigBlind);
  if (!readOnlyAttempt) game.difficulty = settings.difficulty;

  function save() {
    try {
      storage?.setItem(WECHAT_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* Practice works without storage. */
    }
  }
  function effect(name) {
    if (active && settings.sound) sound(name);
  }
  function cancelBots() {
    epoch++;
    if (timer !== null) unschedule(timer);
    timer = null;
    pendingBot = null;
  }
  function cancelReview() {
    const worker = reviewWorker;
    reviewWorker = null;
    worker?.terminate();
    reviewSource = null;
    opponentReviews.clear();
    reviewEpoch++;
    if (reviewTimer !== null) unschedule(reviewTimer);
    reviewTimer = null;
  }
  function cancelHint() {
    if (hintTimer !== null) unschedule(hintTimer);
    hintTimer = null;
    hintText = '';
  }
  function updateHint() {
    const legal = legalActions(game, 0);
    if (
      dealGate.pending ||
      game.phase === 'idle' ||
      !settings.hints ||
      !active ||
      (!legal.enabled && game.phase !== 'done')
    ) {
      cancelHint();
      return;
    }
    const key = `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.phase}:${game.currentBet}:${game.players[0].bet}`;
    if (key === hintKey) return;
    hintKey = key;
    cancelHint();
    hintText = tableHint(game, legal);
    const ticket = epoch;
    hintTimer = schedule(() => {
      if (ticket !== epoch || !active || disposed || key !== hintKey) return;
      hintTimer = null;
      hintText = '';
      render();
    }, 24000);
  }
  function render() {
    if (disposed) return;
    records?.capture(game);
    const notice = records?.takeNotice();
    if (notice) toast(notice);
    if (celebrate()) return render();
    updateHint();
    const endKey = gameEndKey(),
      crowned =
        endKey && (ceremony?.key === endKey || crownedKey === endKey) ? game.over.championId : null;
    const hero = game.players[0],
      legal = {
        ...legalActions(game, 0),
        enabled: !dealGate.pending && legalActions(game, 0).enabled,
      },
      done = game.phase === 'done';
    if (legal.enabled && legal.canRaise) {
      raiseTo = legalRaiseTo(raiseTo, legal);
      sliderMin = legal.minRaiseTo;
      sliderMax = legal.maxRaiseTo;
    }
    if (legal.enabled) {
      callCaption = legal.canCheck ? '过牌' : legal.callAmount < legal.toCall ? '全下' : '跟注';
      callAmountText = legal.canCheck ? '' : format(legal.callAmount || 0);
    }
    const waitingForSeat = game.phase === 'idle';
    const nextEntryHand = records?.nextHandIdentity(game, { newSession });
    const dealing = dealGate.pending;
    const displayBoard = game.practiceBoard || game.board;
    const heroBest =
      done && game.board.length === 5 ? evaluate([...hero.hole, ...game.board]) : null;
    const board = displayBoard.map((card) => ({
      ...cardView(card),
      best:
        game.showdown &&
        !hero.folded &&
        !!heroBest &&
        heroBest.cards.some((c) => c.key === card.key),
    }));
    const seats = game.players.slice(1).map((player, index) => {
      const profile = BOT_PROFILES.find((p) => p.id === player.botProfile) || BOT_PROFILES[0];
      const revealed = done && (peeked.get(player.id) ?? (game.revealed && !player.folded));
      const best =
        revealed && game.board.length === 5 ? evaluate([...player.hole, ...game.board]) : null;
      const retained = visibleRecentAction(game, player);
      const rawAction =
        player.out && !player.hole.length
          ? `出局 · 第${player.place}名`
          : game.actor === player.id && !done && !dealing
            ? '思考中'
            : retained?.text ||
              player.action ||
              (waitingForSeat ? '已就位' : done ? '未行动' : '等待行动');
      const match =
        /^(?:(\d+-bet)\s+)?(小盲|大盲|跟注|开池至|加注至|下注至|下注|短全下至|全下至|全下)\s*(\d+)$/.exec(
          rawAction,
        );
      const actionLabel = match
        ? player.allin && ['小盲', '大盲'].includes(match[2])
          ? '全下'
          : match[1]
            ? match[1] +
              (match[2] === '短全下至' ? ' 短全下' : match[2] === '全下至' ? ' 全下' : '')
            : match[2].replace(/至$/, '')
        : compactActionAmounts(rawAction);
      const out = !!player.out && !player.hole.length;
      return {
        id: player.id,
        name: player.name,
        out,
        crowned: crowned === player.id,
        position: waitingForSeat ? '' : seatPosition(game, player.id),
        profileId: profile.id,
        profileName: profile.short,
        portrait: profile.id === 'balanced' ? '' : `/assets/portraits/${profile.id}.jpg`,
        initial: player.name.slice(0, 1),
        // As on Web, a non-steady emotion shows on the avatar while it lasts.
        mood:
          game.emotionMode === 'off' || out || player.botMood?.kind === 'steady'
            ? ''
            : player.botMood?.kind || '',
        stack: format(player.stack),
        action: actionLabel + (match ? ' ' + format(Number(match[3])) : ''),
        actionLabel,
        actionAmount: match ? format(Number(match[3])) : '',
        thinking: !done && !dealing && game.actor === player.id,
        folded: player.folded,
        winner: done && game.winners.some((w) => w.id === player.id),
        cards: revealed
          ? player.hole.map((card) => ({
              ...cardView(card),
              best: !!best && !player.folded && best.cards.some((c) => c.key === card.key),
            }))
          : [],
        revealed,
        rank:
          best && !player.folded
            ? best.label
            : done && game.winners.some((w) => w.id === player.id)
              ? '获胜'
              : '',
        x: SEAT_ANCHORS[game.players.length][index][0],
        y: SEAT_ANCHORS[game.players.length][index][1],
      };
    });
    const activityParts = createActivityParts(game);
    const pot = done ? game.potAtShowdown || potSize(game) : potSize(game);
    const breakdown = currentPots(game);
    turnCue.update({
      key: `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.history.length}`,
      enabled: legal.enabled,
      active: active && !disposed && settings.vibration,
    });
    attention.update({
      key: `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.history.length}`,
      enabled: legal.enabled,
      active: active && !disposed,
    });
    publish({
      entryState: waitingForSeat ? 'waiting' : dealing ? 'dealing' : 'playing',
      waitingForSeat,
      dealing,
      turnPhase: attention.phase,
      hand: game.hand,
      sessionNumber: readOnlySessionNumber || records?.sessionNumber() || 1,
      over: game.over ? { ...game.over } : null,
      sessionTitle: game.over ? '本局结束' : '本局练习',
      standingText: game.over ? standingLabel(game.over.heroPlace) : '',
      standingClass: game.over ? standingClass(game.over.heroPlace) : '',
      needsRebuy: needsHeroRebuy(game) && !game.over,
      rebuysLeft: heroRebuysLeft(game),
      rebuying: !!rebuying,
      heroStackFinal: format(hero.stack),
      rebuyBurst: rebuying ? `+${format(game.stakes.startingStack)}` : '',
      nextLabel: game.over ? '下一局' : needsHeroRebuy(game) ? '补充筹码' : '下一手',
      premium,
      ceremony: ceremony ? { ...ceremony } : null,
      confetti,
      farewell: farewell ? { ...farewell } : null,
      crownPending: !!ceremony,
      heroCrowned: crowned === 0,
      heroOut: !!hero.out,
      historyReadOnly: !!readOnlyAttempt,
      phase: game.phase,
      street: waitingForSeat
        ? `等待入座，即将开始第 ${nextEntryHand.sessionNumber} 局第 ${nextEntryHand.hand} 手`
        : game.over
          ? '本局结束'
          : dealing
            ? '正在发牌…'
            : done
              ? '本手结束'
              : STREET_NAMES[game.street] || '准备发牌',
      replay: game.replayAttempt || 0,
      seats,
      board,
      boardTop: board.slice(0, 3),
      boardBottom: board.slice(3),
      heroCards: hero.hole.map((card) => ({
        ...cardView(card),
        best:
          game.showdown &&
          !hero.folded &&
          !!heroBest &&
          heroBest.cards.some((c) => c.key === card.key),
      })),
      heroStack: rebuying ? format(rebuying.shown) : format(hero.stack),
      startingStackText: format(settings.stakes.startingStack),
      blindText: `${format(game.smallBlind)} / ${format(game.bigBlind)}`,
      configuredSmallBlindText: format(settings.stakes.smallBlind),
      configuredBigBlindText: format(settings.stakes.bigBlind),
      requestedStakes: { ...settings.stakes },
      pendingStakes: !sameStakes(settings.stakes, game.stakes),
      stakesNotice: !sameStakes(settings.stakes, game.stakes)
        ? `下一手起始盲注${format(settings.stakes.smallBlind)}/${format(settings.stakes.bigBlind)}·筹码恢复为${format(settings.stakes.startingStack)}，统计重新开始`
        : '',
      stakesError,
      heroPosition: waitingForSeat ? '' : seatPosition(game, 0),
      heroAction: compactActionAmounts(cleanAction(visibleRecentAction(game, hero)?.text || '')),
      heroRank: heroBest && (game.revealed || game.showdown) ? heroBest.label : '',
      heroWinner: done && game.winners.some((w) => w.id === 0),
      heroFolded: hero.folded,
      heroAllin: hero.allin,
      compactActions: done || hero.folded,
      pot: format(pot),
      pots: breakdown.pots.map((p) => ({
        label: p.label,
        amount: format(p.amount),
        index: p.index,
        eligible: p.eligible.map((id) => game.players[id].name).join('、'),
        eligibility: p.eligible.includes(0) ? '你可争夺' : '你无法争夺',
        heroEligible: p.eligible.includes(0),
        count: p.eligible.length,
        contributions: p.contributions.map((c) => ({
          name: game.players[c.id].name,
          amount: format(c.amount),
        })),
        awards: p.awards.map((a) => ({
          name: game.players[a.id].name,
          amount: format(a.amount),
          label: a.label,
        })),
      })),
      refunds: breakdown.refunds.map((r) => ({
        name: game.players[r.id].name,
        amount: format(r.amount),
      })),
      done,
      canRetry: canRestartHand(game),
      waiting: !done && !waitingForSeat && !legal.enabled,
      canRaise: !!(legal.enabled && legal.canRaise),
      canAct: !!legal.enabled,
      minRaise: sliderMin,
      // Off turn the disabled slider rests at its minimum, as on Web.
      sliderValue: raiseSelection.position(
        { currentBet: game.currentBet, pot: potSize(game), legal },
        raiseTo,
        game,
      ),
      sliderLimit: RAISE_SLIDER_MAX,
      sliderPot: presetRaiseTo({ currentBet: game.currentBet, pot: potSize(game), legal }, 'pot'),
      callAmount: legal.callAmount || 0,
      currentBet: game.currentBet,
      potAmount: potSize(game),
      maxRaise: sliderMax,
      raiseTo,
      raiseText: format(raiseTo),
      chipUnit: chipUnitOf(game),
      callLabel: callCaption,
      callText: callAmountText,
      actionNotice: waitingForSeat
        ? ''
        : dealing
          ? '正在发牌…'
          : done
            ? ''
            : hero.folded
              ? '已弃牌，正在完成这手。'
              : hero.allin
                ? '已全下，等待摊牌。'
                : legal.enabled
                  ? legal.canCheck
                    ? '可以过牌或主动下注。'
                    : `跟注需要 ${format(legal.callAmount)} 筹码。${legal.raiseReopened ? '' : '本轮加注权未重开，仅可跟注或弃牌。'}`
                  : `${game.players[game.actor]?.name || '对手'} 正在思考，请稍候。`,
      profiles,
      settings: { ...settings, assignments: { ...settings.assignments } },
      difficultyDescription: difficultyPolicy(settings.difficulty).description,
      seatSettings: ['Mia', 'Alex', 'River', 'Kai', 'Luna', 'Theo', 'Jade', 'Leo'].map(
        (name, i) => {
          const id = i + 1;
          const profileIndex = Math.max(
            0,
            BOT_PROFILES.findIndex((profile) => profile.id === settings.assignments[id]),
          );
          const profile = BOT_PROFILES[profileIndex];
          return {
            id,
            name,
            initial: name.slice(0, 1),
            offTable: id >= settings.playerCount,
            profileIndex,
            profileName: profile.short,
            portrait: profile.id === 'balanced' ? '' : `/assets/portraits/${profile.id}.jpg`,
          };
        },
      ),
      hintText,
      logs: game.logs
        .slice()
        .reverse()
        .map((entry, index) => {
          const parts = activityParts(entry);
          return {
            key: index,
            text: parts
              .map((part) =>
                part.actor ? part.name + (part.profile ? `（${part.profile}）` : '') : part.text,
              )
              .join(''),
            parts,
            type: entry.type,
            hero: entry.player === 0,
          };
        }),
      stats: {
        hands: game.stats.hands,
        wins: game.stats.wins,
        profit: format(hero.stack - game.stats.buyin),
        // The waiting game info card shows a signed, coloured change.
        profitSigned: `${hero.stack >= game.stats.buyin ? '+' : ''}${format(hero.stack - game.stats.buyin)}`,
        profitTone:
          hero.stack > game.stats.buyin
            ? 'positive'
            : hero.stack < game.stats.buyin
              ? 'negative'
              : '',
      },
    });
  }
  function driveBots() {
    if (
      disposed ||
      !active ||
      game.phase === 'idle' ||
      dealGate.pending ||
      game.phase === 'done' ||
      timer !== null
    )
      return;
    const ticket = epoch;
    if (game.phase === 'between') {
      timer = schedule(() => {
        timer = null;
        if (disposed || !active || ticket !== epoch || game.phase !== 'between') return;
        advanceStreet(game);
        effect(game.phase === 'done' ? 'win' : 'deal');
        render();
        driveBots();
      }, 850);
      return;
    }
    if (game.phase !== 'playing' || game.actor <= 0) return;
    // Paint the actor before doing local equity sampling on the JS service thread.
    timer = schedule(() => {
      timer = null;
      if (disposed || !active || ticket !== epoch || game.phase !== 'playing' || game.actor <= 0)
        return;
      const started = Date.now(),
        plan = planBotTurn(game);
      pendingBot = { plan, started };
      timer = schedule(
        () => {
          timer = null;
          if (disposed || !active || ticket !== epoch || !isBotTurnCurrent(game, plan)) return;
          const id = game.actor;
          const contribution = game.players[id].total;
          const result = executeBotTurn(game, plan, { waitedMs: Date.now() - started });
          pendingBot = null;
          effect(result.action);
          if (game.phase === 'done') effect('win');
          render();
          if (game.players[id].total > contribution) wager(id);
          driveBots();
        },
        Math.max(0, plan.delayMs - (Date.now() - started)),
      );
    }, 0);
  }
  function freshHand({ refilled = false } = {}) {
    if (readOnlyAttempt || disposed) return;
    dealGate.cancel();
    attention.reset();
    turnCue.reset();
    peeked.clear();
    cancelBots();
    cancelReview();
    cancelHint();
    cancelEffects();
    hintKey = '';
    if (
      game.over ||
      game.players.length !== settings.playerCount ||
      !sameStakes(settings.stakes, game.stakes)
    ) {
      records?.abandon(game);
      game = newGame(settings.playerCount, settings.stakes);
      newSession = true;
    }
    // A refill left pending when the app closed is completed before dealing.
    if (needsHeroRebuy(game) && heroRebuysLeft(game)) rebuyHero(game);
    game.difficulty = settings.difficulty;
    applyBotSettings(game, settings);
    startHand(game);
    dealGate.begin();
    records?.begin(game, { newSession });
    newSession = false;
    raiseTo = game.bigBlind * 3;
    // The first paint of a refilled hand already starts the count from zero.
    if (refilled) countRefill();
    render();
    effect('deal');
    premiumDeal();
    driveBots();
  }
  // Count the refilled stack up from zero while the new hand is played, with
  // the same ten values and timing as Web. The page lays out the final value
  // and draws the count over it, so the row beside it stays still.
  function countRefill() {
    const values = refillCountValues(game.players[0].stack);
    rebuying = { shown: 0 };
    values.forEach((value, index) =>
      later(
        () => {
          if (!rebuying) return;
          rebuying.shown = value;
          render();
        },
        Math.round((REBUY_DURATION_MS * 0.7 * (index + 1)) / REFILL_COUNT_STEPS),
      ),
    );
    later(() => {
      rebuying = null;
      render();
    }, REBUY_DURATION_MS);
  }
  // Refill and deal the next hand at once.
  function refillAndDeal() {
    if (!needsHeroRebuy(game) || !heroRebuysLeft(game)) return false;
    rebuyHero(game);
    freshHand({ refilled: true });
    return true;
  }
  function setStakes(value) {
    if (readOnlyAttempt) return false;
    try {
      const stakes = validateStakes(value);
      if (!sameStakes(game.stakes, stakes)) records?.abandon(game);
      if (!configureStakes(game, stakes)) {
        const changed = !sameStakes(settings.stakes, stakes);
        if (changed) {
          settings.stakes = stakes;
          save();
        }
        stakesError = '';
        render();
        return changed;
      }
      settings.stakes = stakes;
      stakesError = '';
      newSession = true;
      save();
      freshHand();
      return true;
    } catch (error) {
      stakesError = error.message;
      render();
      return false;
    }
  }
  function requestStakes(value) {
    if (readOnlyAttempt) return false;
    try {
      const stakes = stakesFromSmallBlind(value?.smallBlind);
      if (value?.bigBlind !== stakes.bigBlind)
        throw Error('大盲必须为小盲的两倍，起始筹码为100个大盲。');
      // Check any derived fields supplied by API callers before saving.
      validateStakes(value);
      stakesError = '';
      if (sameStakes(settings.stakes, stakes)) {
        render();
        return false;
      }
      settings.stakes = stakes;
      save();
      refreshWaitingTable();
      render();
      return true;
    } catch (error) {
      stakesError = error.message;
      render();
      return false;
    }
  }
  function requestSmallBlind(value) {
    try {
      return requestStakes(stakesFromSmallBlind(value));
    } catch (error) {
      stakesError = error.message;
      render();
      return false;
    }
  }
  function refreshWaitingTable() {
    if (game.phase !== 'idle') return;
    if (game.players.length !== settings.playerCount || !sameStakes(game.stakes, settings.stakes)) {
      game = newGame(settings.playerCount, settings.stakes);
      game.history = [];
    }
    game.difficulty = settings.difficulty;
    applyBotSettings(game, settings);
  }
  function setPreference(key, value) {
    if (readOnlyAttempt) return;
    if (key === 'stakes') return requestStakes(value);
    const enablingVibration = key === 'vibration' && !settings.vibration && value === true;
    const enablingSound = key === 'sound' && !settings.sound && value === true;
    const next = sanitize({ ...settings, [key]: value });
    settings = next;
    refreshWaitingTable();
    if (enablingSound && game.phase !== 'idle') effect('deal');
    save();
    if (key === 'difficulty') {
      cancelBots();
      game.difficulty = settings.difficulty;
    }
    if (key === 'hints') {
      cancelHint();
      hintKey = '';
    }
    if (enablingVibration)
      turnCue.acknowledge(
        `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.history.length}`,
      );
    render();
    if (enablingVibration && active) {
      try {
        Promise.resolve(notifyTurn()).catch(() => {});
      } catch {}
    }
    driveBots();
  }
  return {
    start() {
      if (disposed || readOnlyAttempt) return;
      refreshWaitingTable();
      render();
    },
    join() {
      if (disposed || readOnlyAttempt || !active || game.phase !== 'idle') return false;
      freshHand();
      return true;
    },
    show() {
      if (disposed) return;
      active = true;
      dealGate.setActive(true);
      render();
      driveBots();
    },
    hide() {
      raiseSelection.reset();
      active = false;
      dealGate.setActive(false);
      cancelBots();
      cancelReview();
      cancelHint();
      cancelEffects();
      render();
    },
    destroy() {
      disposed = true;
      active = false;
      dealGate.cancel();
      attention.reset();
      cancelBots();
      cancelReview();
      cancelHint();
      cancelEffects();
    },
    action(action) {
      const legal = legalActions(game, 0);
      if (readOnlyAttempt || !active || dealGate.pending || !legal.enabled) return false;
      cancelBots();
      const contribution = game.players[0].total;
      act(game, 0, action, action === 'raise' ? raiseTo : undefined);
      effect(action === 'call' && legal.canCheck ? 'check' : action);
      if (game.phase === 'done') effect('win');
      render();
      if (game.players[0].total > contribution) wager(0);
      driveBots();
      return true;
    },
    preset(name) {
      if (readOnlyAttempt) return;
      const legal = legalActions(game, 0);
      if (!legal.enabled || !legal.canRaise) return;
      const target = presetRaiseTo(
        { currentBet: game.currentBet, pot: potSize(game), legal },
        name,
      );
      if (target === null) return;
      attention.engage();
      raiseSelection.reset();
      raiseTo = legalRaiseTo(target, legal);
      render();
    },
    engageTurn() {
      attention.engage();
    },
    setRaisePosition(position) {
      if (readOnlyAttempt || !active || dealGate.pending) return;
      const legal = legalActions(game, 0);
      const amount = raiseSelection.select(
        { currentBet: game.currentBet, pot: potSize(game), legal },
        position,
        game,
      );
      if (amount === null) return;
      attention.engage();
      raiseTo = amount;
      render();
    },
    setRaise(value) {
      if (readOnlyAttempt) return;
      const legal = legalActions(game, 0);
      if (legal.enabled && legal.canRaise) {
        attention.engage();
        raiseSelection.reset();
        raiseTo = legalRaiseTo(Number(value), legal);
        render();
      }
    },
    nextHand() {
      if (readOnlyAttempt || game.phase !== 'done') return false;
      if (!game.over && needsHeroRebuy(game)) return refillAndDeal();
      freshHand();
      return true;
    },
    peek(id) {
      if (game.phase !== 'done' || !game.players[id] || id === 0) return false;
      peeked.set(id, !(peeked.get(id) ?? (game.revealed && !game.players[id].folded)));
      render();
      return true;
    },
    retry() {
      peeked.clear();
      if (readOnlyAttempt || !canRestartHand(game)) return false;
      dealGate.cancel();
      attention.reset();
      turnCue.reset();
      cancelBots();
      cancelReview();
      cancelHint();
      cancelEffects();
      hintKey = '';
      records?.capture(game);
      restartHand(game);
      dealGate.begin();
      records?.begin(game);
      raiseTo = game.bigBlind * 3;
      render();
      effect('deal');
      premiumDeal();
      driveBots();
      return true;
    },
    reset() {
      if (readOnlyAttempt) return;
      records?.abandon(game);
      newSession = true;
      cancelBots();
      cancelReview();
      game = newGame(settings.playerCount, settings.stakes);
      freshHand();
    },
    setStakes,
    requestStakes,
    requestSmallBlind,
    clearStakesError() {
      stakesError = '';
      render();
    },
    setPreference,
    setSeatProfile(id, profileId) {
      if (readOnlyAttempt) return;
      if (
        !Number.isInteger(id) ||
        id < 1 ||
        id > 8 ||
        !BOT_PROFILES.some((p) => p.id === profileId)
      )
        return;
      settings = sanitize({ ...settings, ...assignBotSeat(settings, id, profileId) });
      refreshWaitingTable();
      save();
      render();
    },
    setAllProfiles(profileId) {
      if (readOnlyAttempt) return;
      if (!BOT_PROFILES.some((p) => p.id === profileId)) return;
      settings = sanitize({
        ...settings,
        assignments: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, profileId])),
        mixed: false,
        mixedSeats: [],
      });
      refreshWaitingTable();
      save();
      render();
    },
    toggleMixedProfiles() {
      if (readOnlyAttempt) return;
      settings = sanitize({ ...settings, ...toggleMixedLineup(settings, settings.playerCount) });
      refreshWaitingTable();
      save();
      render();
    },
    finishHand() {
      if (
        readOnlyAttempt ||
        disposed ||
        !active ||
        (!game.players[0].folded && !game.players[0].allin)
      )
        return false;
      let waiting = pendingBot;
      cancelBots();
      const ticket = epoch;
      function step() {
        if (disposed || !active || ticket !== epoch) return;
        if (game.phase === 'done') {
          completeBoardForPractice(game);
          render();
          effect('win');
          return;
        }
        if (game.phase === 'between') advanceStreet(game);
        else if (game.phase === 'playing' && game.actor > 0) {
          const current = waiting && isBotTurnCurrent(game, waiting.plan);
          executeBotTurn(game, current ? waiting.plan : planBotTurn(game), {
            expedited: true,
            waitedMs: current ? Date.now() - waiting.started : 0,
          });
          waiting = null;
        } else return;
        if (game.phase === 'done') return step();
        // Yield to lifecycle/reset handlers. Streets are not published one by
        // one; the settled table is published once, like Web.
        timer = schedule(() => {
          timer = null;
          step();
        }, 0);
      }
      step();
      return true;
    },
    review(onProgress) {
      if (game.phase !== 'done') return;
      cancelReview();
      const ticket = reviewEpoch,
        input = createReviewInput(game),
        results = input.decisions.map((decision) => reviewCache.get('decision', decision)),
        missing = input.decisions.flatMap((_, index) => (results[index] ? [] : [index]));
      let done = results.filter(Boolean).length;
      reviewSource = input;
      opponentReviews = new Map();
      // As on Web, report each finished decision: "正在分析决策 done / total…".
      const progress = () => {
        if (done) return publishReport(true);
        onProgress({
          loading: true,
          hand: input.hand,
          steps: [],
          profit: format(input.outcome.profit),
          done,
          total: input.decisions.length,
          progressText: input.decisions.length
            ? `正在分析决策 ${done} / ${input.decisions.length}…`
            : '正在准备这手的决策快照…',
        });
      };
      if (done < input.decisions.length) progress();
      function step() {
        if (disposed || !active || ticket !== reviewEpoch) return;
        if (done < input.decisions.length) {
          const index = results.findIndex((result) => !result);
          const decision = input.decisions[index];
          const result = analyzeDecision(decision);
          reviewCache.set('decision', decision, result);
          results[index] = result;
          done++;
          progress();
          reviewTimer = schedule(step, 0);
          return;
        }
        reviewTimer = null;
        publishReport();
      }
      function publishReport(loading = false) {
        const report = loading ? null : summarizeReview(input, results);
        onProgress({
          loading,
          done,
          total: input.decisions.length,
          progressText: `正在分析决策 ${done} / ${input.decisions.length}…`,
          hand: input.hand,
          scope: report?.overview.scope || '',
          profit: format(input.outcome.profit),
          resultContext: input.outcome.folded
            ? '你已弃牌，按弃牌前的信息评价。'
            : '只按行动前可见的信息评价决策。',
          activity: selectedActivity(input),
          opponents: input.opponents.map((record, index) => {
            const view = record.trace.view;
            return {
              index,
              name: record.name,
              id: record.id,
              profileName: getBotProfile(record.trace.profile).short?.replace(/\s*·\s*/g, '，'),
              named: getBotProfile(record.trace.profile).id !== 'balanced',
              street: STREET_NAMES[view.street],
              actual: cleanAction(
                actionLabel({ ...view, action: record.action, amount: record.amount }),
              ),
              label: getBotProfile(record.trace.profile).short?.replace(/\s*·\s*/g, '，'),
              position: view.position,
              pot: format(view.pot),
              stack: format(view.stack),
              cards: view.hole.map(cardView),
              board: view.board.map(cardView),
              analyzed: false,
              sequence: record.sequence,
            };
          }),
          steps: results
            .map((r, index) =>
              r
                ? {
                    index,
                    street: STREET_NAMES[input.decisions[index].street],
                    position: input.decisions[index].position,
                    pot: format(input.decisions[index].pot),
                    stack: format(input.decisions[index].stack),
                    actual: cleanAction(actionLabel(input.decisions[index])),
                    label: r.coaching.label,
                    keep: r.coaching.kind === 'keep',
                    suggestion: cleanAction(r.coaching.suggestion),
                    reason: r.coaching.explanation,
                    sequence: input.decisions[index].history.length + 1,
                    paragraphs: r.coaching.paragraphs,
                    commentary: reviewCommentary(
                      r.coaching.paragraphs,
                      r.context.matchups,
                      input.decisions[index].street,
                      r.coaching.paragraphParts,
                    ),
                    followUp: r.coaching.followUp,
                    evidence: r.evidence,
                    cards: input.decisions[index].hole.map(cardView),
                    board: input.decisions[index].board.map(cardView),
                  }
                : null,
            )
            .filter(Boolean),
        });
      }
      if (done === input.decisions.length) {
        publishReport();
        return;
      }
      if (createReviewWorker && input.decisions.length) {
        let worker;
        let received = 0;
        const current = () =>
          !disposed && active && ticket === reviewEpoch && reviewWorker === worker;
        const fallback = () => {
          if (!current()) return;
          reviewWorker = null;
          worker.terminate();
          // Continue with the same full analysis, retaining completed steps.
          reviewTimer = schedule(step, 0);
        };
        try {
          worker = createReviewWorker();
          reviewWorker = worker;
          worker.onMessage((message) => {
            if (!current()) return;
            if (
              message.type === 'step' &&
              message.index === received &&
              received < missing.length &&
              message.result
            ) {
              const index = missing[received++];
              reviewCache.set('decision', input.decisions[index], message.result);
              results[index] = message.result;
              done++;
              progress();
            } else if (message.type === 'complete' && done === input.decisions.length) {
              reviewWorker = null;
              worker.terminate();
              publishReport();
            } else if (message.type === 'error' || message.type === 'complete') fallback();
          });
          worker.onProcessKilled?.(fallback);
          // Send only detached before-action snapshots, never the final hand,
          // opponent hole cards, future deck, outcome or display-only activity.
          worker.postMessage({ decisions: missing.map((index) => input.decisions[index]) });
          return;
        } catch {
          reviewWorker = null;
          worker?.terminate();
        }
      }
      reviewTimer = schedule(step, 0);
    },
    reviewOpponent(index) {
      const record = reviewSource?.opponents[index];
      if (!record) return null;
      if (!opponentReviews.has(index)) {
        const identities =
          reviewSource.players ||
          reviewSource.opponents.map(({ id, name, trace }) => ({
            id,
            name,
            botProfile: trace.profile,
            position: trace.view.position,
          }));
        const cached = reviewCache.get('opponent', [record, identities]);
        const explanation = cached || explainOpponent(record, identities);
        if (!cached) reviewCache.set('opponent', [record, identities], explanation);
        opponentReviews.set(index, {
          analyzed: true,
          title: explanation.title,
          reason: explanation.detail,
          paragraphs: explanation.paragraphs,
          commentary: reviewCommentary(
            explanation.paragraphs,
            explanation.matchups,
            record.trace.view.street,
            explanation.paragraphParts,
          ),
          reasons: explanation.reasons,
          warning: explanation.warning,
        });
      }
      return opponentReviews.get(index);
    },
    cancelReview,
    getRecords: () => records?.sessions() || [],
    getRecordSummaries: () => records?.summaries() || [],
    getRecordsRevision: () => records?.revision() || 0,
    takeRecordsNotice: () => records?.takeNotice() || '',
    getRecord: (id) => records?.getAttempt(id) || null,
    getGame: () => game,
    getSettings: () => ({ ...settings, assignments: { ...settings.assignments } }),
  };
}
