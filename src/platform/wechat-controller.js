import { compactChips, compactActionAmounts } from '../engine/chip-format.js';
import {
  sanitizeStakes,
  validateStakes,
  stakesFromSmallBlind,
  sameStakes,
} from '../engine/stakes.js';
import { createHeroTurnCue } from '../ui/hero-turn.js';
import { SEAT_ANCHORS } from '../ui/seat-geometry.js';
import { explainOpponent } from '../review/opponents.js';
import { publicHistory } from '../review/narrative.js';
import { reviewCommentary } from '../review/matchups.js';
import {
  newGame,
  configureStakes,
  startHand,
  restartHand,
  canRestartHand,
  applyBotSettings,
  advanceStreet,
  completeBoardForPractice,
  legalActions,
  act,
  planBotTurn,
  isBotTurnCurrent,
  executeBotTurn,
  seatPosition,
  potSize,
  contestableAfterCall,
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
import { chipUnitOf, fractionRaiseTo, legalRaiseTo } from '../engine/bet-sizing.js';
import {
  createReviewInput,
  analyzeDecision,
  summarizeReview,
  STREET_NAMES,
  actionLabel,
} from '../review/analysis.js';

const STORAGE_KEY = 'noir-wechat-settings-v1';
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
  hints: value?.hints !== false,
  ...sanitizeBotSettings(value),
});

// All game mutations go through the same rule engine as Web/iOS/Android.
// Only this platform adapter owns timers, preferences, and display data.
export function createWechatController({
  publish,
  storage,
  sound = () => {},
  wager = () => {},
  notifyTurn = () => {},
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  let settings;
  let stakesError = '';
  try {
    settings = sanitize(JSON.parse(storage?.getItem(STORAGE_KEY)));
  } catch {
    settings = defaults();
  }
  const peeked = new Map();
  const turnCue = createHeroTurnCue(notifyTurn);
  let game = newGame(settings.playerCount, settings.stakes),
    raiseTo = game.bigBlind * 3,
    timer = null,
    pendingBot = null,
    reviewTimer = null,
    hintTimer = null,
    epoch = 0,
    active = true,
    disposed = false,
    hintKey = '',
    hintText = '',
    reviewEpoch = 0;
  let sliderMin = game.bigBlind * 2,
    sliderMax = game.stakes.startingStack,
    callCaption = '跟注',
    callAmountText = format(game.bigBlind);
  game.difficulty = settings.difficulty;

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
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
    if (!settings.hints || !active || (!legal.enabled && game.phase !== 'done')) {
      cancelHint();
      return;
    }
    const key = `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.phase}:${game.currentBet}:${game.players[0].bet}`;
    if (key === hintKey) return;
    hintKey = key;
    cancelHint();
    // Keep the Chinese presentation copy and public price calculation used by Web.
    const hero = game.players[0],
      rank = evaluate([...hero.hole, ...game.board]);
    if (game.phase === 'done')
      hintText = hero.folded
        ? '回看弃牌时的价格与对手范围，判断是否值得继续。'
        : game.showdown
          ? `你以${rank.label}摊牌。复盘关键下注，区分决策质量与发牌运气。`
          : '复盘本手加注，判断对手弃牌能否让这条路线长期盈利。';
    else if (game.street === 0) {
      const [a, b] = hero.hole;
      hintText =
        a?.rank === b?.rank
          ? '口袋对子有成三条的潜力；面对大额加注，先考虑跟注成本。'
          : a?.rank >= 11 && b?.rank >= 11
            ? '两张高牌可主动争夺底池；面对大额加注，仍要判断对手范围。'
            : a?.suit === b?.suit
              ? '同花底牌有成牌潜力，仍需结合位置和跟注价格。'
              : '前位谨慎选牌，后位利用更多信息；结合价格决定是否入池。';
    } else
      hintText =
        rank.score[0] >= 3
          ? `你已形成${rank.label}，可考虑价值下注，并留意牌面上更强的组合。`
          : rank.score[0] >= 1
            ? `目前是${rank.label}；多人底池或持续大额加注时，谨慎判断。`
            : '尚未成对，结合成牌机会、跟注价格与对手范围决定。';
    if (legal.enabled && legal.toCall > 0)
      hintText += ` 跟注占可争夺底池约 ${Math.round((legal.callAmount / contestableAfterCall(game, 0, legal.callAmount)) * 100)}%。`;
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
    updateHint();
    const hero = game.players[0],
      legal = legalActions(game, 0),
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
      const retained =
        done || player.folded || player.allin || player.lastAction?.street === game.street
          ? player.lastAction
          : null;
      const rawAction =
        game.actor === player.id && !done
          ? '思考中'
          : retained?.text || player.action || (done ? '未行动' : '等待行动');
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
      return {
        id: player.id,
        name: player.name,
        position: seatPosition(game, player.id),
        profileId: profile.id,
        profileName: profile.short,
        portrait: profile.id === 'balanced' ? '' : `/assets/portraits/${profile.id}.jpg`,
        initial: player.name.slice(0, 1),
        stack: format(player.stack),
        action: actionLabel + (match ? ' ' + format(Number(match[3])) : ''),
        actionLabel,
        actionAmount: match ? format(Number(match[3])) : '',
        thinking: !done && game.actor === player.id,
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
    const profiles = BOT_PROFILES.map((p) => ({
      ...p,
      portrait: p.id === 'balanced' ? '' : `/assets/portraits/${p.id}.jpg`,
    }));
    const pot = done ? game.potAtShowdown || potSize(game) : potSize(game);
    const breakdown = currentPots(game);
    turnCue.update({
      key: `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.history.length}`,
      enabled: legal.enabled,
      active: active && !disposed && settings.sound,
    });
    publish({
      hand: game.hand,
      phase: game.phase,
      street: done ? '本手结束' : STREET_NAMES[game.street] || '准备发牌',
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
      heroStack: format(hero.stack),
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
      heroPosition: seatPosition(game, 0),
      heroAction: compactActionAmounts(
        cleanAction(
          hero.folded || hero.allin || hero.lastAction?.street === game.street
            ? hero.lastAction?.text || ''
            : '',
        ),
      ),
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
      waiting: !done && !legal.enabled,
      canRaise: !!(legal.enabled && legal.canRaise),
      canAct: !!legal.enabled,
      minRaise: sliderMin,
      maxRaise: sliderMax,
      raiseTo,
      raiseText: format(raiseTo),
      chipUnit: chipUnitOf(game),
      callLabel: callCaption,
      callText: callAmountText,
      actionNotice: done
        ? ''
        : hero.folded
          ? '已弃牌，正在完成这手。'
          : hero.allin
            ? '已全下，等待摊牌。'
            : legal.enabled
              ? legal.canCheck
                ? '轮到你了，可以过牌或主动下注。'
                : `轮到你了，跟注需要 ${format(legal.callAmount)} 筹码。${legal.raiseReopened ? '' : '本轮加注权未重开，仅可跟注或弃牌。'}`
              : `${game.players[game.actor]?.name || '对手'} 正在思考，请稍候。`,
      profiles,
      settings: { ...settings, assignments: { ...settings.assignments } },
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
        .map((entry, index) => ({
          key: index,
          text: compactActionAmounts(cleanAction(typeof entry === 'string' ? entry : entry.text)),
        })),
      stats: {
        hands: game.stats.hands,
        wins: game.stats.wins,
        profit: format(hero.stack - game.stats.buyin),
      },
    });
  }
  function driveBots() {
    if (disposed || !active || game.phase === 'done' || timer !== null) return;
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
      const plan = planBotTurn(game),
        started = Date.now();
      pendingBot = { plan, started };
      timer = schedule(() => {
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
      }, plan.delayMs);
    }, 0);
  }
  function freshHand() {
    turnCue.reset();
    peeked.clear();
    cancelBots();
    cancelReview();
    cancelHint();
    hintKey = '';
    if (game.players.length !== settings.playerCount || !sameStakes(settings.stakes, game.stakes))
      game = newGame(settings.playerCount, settings.stakes);
    game.difficulty = settings.difficulty;
    applyBotSettings(game, settings);
    startHand(game);
    raiseTo = game.bigBlind * 3;
    render();
    effect('deal');
    driveBots();
  }
  function setStakes(value) {
    try {
      const stakes = validateStakes(value);
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
  function setPreference(key, value) {
    if (key === 'stakes') return requestStakes(value);
    const enablingSound = key === 'sound' && !settings.sound && value === true;
    const next = sanitize({ ...settings, [key]: value });
    settings = next;
    if (enablingSound) effect('deal');
    save();
    if (key === 'difficulty') {
      cancelBots();
      game.difficulty = settings.difficulty;
    }
    if (key === 'hints') {
      cancelHint();
      hintKey = '';
    }
    render();
    driveBots();
  }
  return {
    start: freshHand,
    show() {
      if (disposed) return;
      active = true;
      render();
      driveBots();
    },
    hide() {
      active = false;
      cancelBots();
      cancelReview();
      cancelHint();
      render();
    },
    destroy() {
      disposed = true;
      active = false;
      cancelBots();
      cancelReview();
      cancelHint();
    },
    action(action) {
      const legal = legalActions(game, 0);
      if (!active || !legal.enabled) return false;
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
      const legal = legalActions(game, 0);
      if (!legal.enabled || !legal.canRaise) return;
      const target =
        name === 'min'
          ? legal.minRaiseTo
          : name === 'all'
            ? legal.maxRaiseTo
            : ['half', 'pot'].includes(name)
              ? fractionRaiseTo(
                  {
                    currentBet: game.currentBet,
                    pot: potSize(game),
                    callAmount: legal.callAmount,
                    chipUnit: legal.chipUnit,
                  },
                  name === 'half' ? 0.5 : 1,
                )
              : null;
      if (target === null) return;
      raiseTo = legalRaiseTo(target, legal);
      render();
    },
    setRaise(value) {
      const legal = legalActions(game, 0);
      if (legal.enabled && legal.canRaise) {
        raiseTo = legalRaiseTo(Number(value), legal);
        render();
      }
    },
    nextHand() {
      if (game.phase === 'done') freshHand();
    },
    peek(id) {
      if (game.phase !== 'done' || !game.players[id] || id === 0) return false;
      peeked.set(id, !(peeked.get(id) ?? (game.revealed && !game.players[id].folded)));
      render();
      return true;
    },
    retry() {
      peeked.clear();
      if (!canRestartHand(game)) return false;
      turnCue.reset();
      cancelBots();
      cancelReview();
      cancelHint();
      hintKey = '';
      restartHand(game);
      raiseTo = game.bigBlind * 3;
      render();
      effect('deal');
      driveBots();
      return true;
    },
    reset() {
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
      if (
        !Number.isInteger(id) ||
        id < 1 ||
        id > 8 ||
        !BOT_PROFILES.some((p) => p.id === profileId)
      )
        return;
      settings = sanitize({ ...settings, ...assignBotSeat(settings, id, profileId) });
      save();
      render();
    },
    setAllProfiles(profileId) {
      if (!BOT_PROFILES.some((p) => p.id === profileId)) return;
      settings = sanitize({
        ...settings,
        assignments: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, profileId])),
        mixed: false,
        mixedSeats: [],
      });
      save();
      render();
    },
    toggleMixedProfiles() {
      settings = sanitize({ ...settings, ...toggleMixedLineup(settings, settings.playerCount) });
      save();
      render();
    },
    finishHand() {
      if (disposed || !active || (!game.players[0].folded && !game.players[0].allin)) return false;
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
        if (game.phase === 'between') render();
        // Yield to lifecycle/reset handlers, without painting every intermediate
        // turn or adding simulated thinking delays to an explicit fast finish.
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
        results = [];
      onProgress({
        loading: true,
        hand: input.hand,
        steps: [],
        profit: format(input.outcome.profit),
      });
      function step() {
        if (disposed || !active || ticket !== reviewEpoch) return;
        if (results.length < input.decisions.length) {
          results.push(
            analyzeDecision(input.decisions[results.length], { trials: 120, rolloutTrials: 12 }),
          );
          reviewTimer = schedule(step, 0);
          return;
        }
        reviewTimer = null;
        const report = summarizeReview(input, results);
        onProgress({
          loading: false,
          hand: input.hand,
          scope: report.overview.scope,
          profit: format(input.outcome.profit),
          resultContext: input.outcome.folded
            ? '你已弃牌，按弃牌前的信息评价。'
            : '只按行动前可见的信息评价决策。',
          opponents: input.opponents.map((record, index) => {
            const view = record.trace.view;
            const explanation = explainOpponent(
              record,
              input.opponents.map(({ id, name }) => ({ id, name })),
            );
            return {
              index,
              name: record.name,
              id: record.id,
              profileName: record.trace.profileName?.replace(/\s*·\s*/g, '，'),
              named: !!getBotProfile(record.trace.profile).research,
              street: STREET_NAMES[view.street],
              actual: cleanAction(
                actionLabel({ ...view, action: record.action, amount: record.amount }),
              ),
              label: record.trace.profileName?.replace(/\s*·\s*/g, '，'),
              position: view.position,
              pot: format(view.pot),
              stack: format(view.stack),
              cards: view.hole.map(cardView),
              board: view.board.map(cardView),
              title: explanation.title,
              reason: explanation.detail,
              paragraphs: explanation.paragraphs,
              commentary: reviewCommentary(
                explanation.paragraphs,
                explanation.matchups,
                view.street,
              ),
              reasons: explanation.reasons,
              warning: explanation.warning,
            };
          }),
          steps: results.map((r, index) => ({
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
            paragraphs: [...r.coaching.paragraphs, ...(input.publicResponses?.[index] || [])],
            commentary: reviewCommentary(
              [...r.coaching.paragraphs, ...(input.publicResponses?.[index] || [])],
              r.context.matchups,
              input.decisions[index].street,
            ),
            publicResponses: input.publicResponses?.[index] || [],
            followUp: r.coaching.followUp,
            evidence: r.evidence,
            history: publicHistory(input.decisions[index]).map(
              (a) => `${a.street}，${a.name}，${a.action}`,
            ),
            cards: input.decisions[index].hole.map(cardView),
            board: input.decisions[index].board.map(cardView),
          })),
        });
      }
      reviewTimer = schedule(step, 0);
    },
    cancelReview,
    getGame: () => game,
    getSettings: () => ({ ...settings, assignments: { ...settings.assignments } }),
  };
}
