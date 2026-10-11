import { SEAT_ANCHORS } from '../ui/seat-geometry.js';
import { explainOpponent } from '../review/opponents.js';
import {
  newGame,
  startHand,
  restartHand,
  canRestartHand,
  applyBotSettings,
  advanceStreet,
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
import { BOT_PROFILES, EMOTION_MODES, sanitizeBotSettings } from '../engine/bot-profiles.js';
import { CHIP_UNIT, fractionRaiseTo, legalRaiseTo } from '../engine/bet-sizing.js';
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
const format = (value) => Number(value).toLocaleString('en-US');
const defaults = () => ({
  playerCount: 5,
  difficulty: 'normal',
  sound: true,
  hints: true,
  ...sanitizeBotSettings(),
});
const sanitize = (value) => ({
  ...defaults(),
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
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  let settings;
  try {
    settings = sanitize(JSON.parse(storage?.getItem(STORAGE_KEY)));
  } catch {
    settings = defaults();
  }
  let game = newGame(settings.playerCount),
    raiseTo = 150,
    timer = null,
    reviewTimer = null,
    hintTimer = null,
    epoch = 0,
    active = true,
    disposed = false,
    hintKey = '',
    hintText = '',
    reviewEpoch = 0;
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
    if (!settings.hints || !active || !legal.enabled) {
      cancelHint();
      return;
    }
    const key = `${game.hand}:${game.replayAttempt || 0}:${game.street}:${game.currentBet}:${game.players[0].bet}`;
    if (key === hintKey) return;
    hintKey = key;
    cancelHint();
    hintText =
      game.street === 0
        ? '先看位置与跟注价格，后位可以更宽；面对再次加注时，重新评估对手范围。'
        : game.street === 3
          ? '河牌先判断有多少更弱的牌会跟注，再决定取值；面对大注，比较价格和对手范围。'
          : '每张公共牌都会改变牌力。先看牌面和仍在局中的人数，再决定下注尺度。';
    hintTimer = schedule(() => {
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
    if (legal.enabled && legal.canRaise) raiseTo = legalRaiseTo(raiseTo, legal);
    const board = game.board.map(cardView);
    const seats = game.players.slice(1).map((player, index) => {
      const profile = BOT_PROFILES.find((p) => p.id === player.botProfile) || BOT_PROFILES[0];
      const revealed = game.revealed && !player.folded;
      return {
        id: player.id,
        name: player.name,
        position: seatPosition(game, player.id),
        profileId: profile.id,
        profileName: profile.short,
        portrait: profile.id === 'balanced' ? '' : `/assets/portraits/${profile.id}.jpg`,
        initial: player.name.slice(0, 1),
        stack: format(player.stack),
        action: player.folded
          ? '弃牌'
          : player.allin
            ? cleanAction(player.lastAction?.text || player.action || '全下')
            : cleanAction(
                (player.lastAction?.street === game.street ? player.lastAction.text : '') ||
                  (game.actor === player.id && !done ? '思考中' : '等待行动'),
              ),
        thinking: !done && game.actor === player.id,
        folded: player.folded,
        winner: done && game.winners.some((w) => w.id === player.id),
        cards: revealed ? player.hole.map(cardView) : [],
        rank: revealed ? evaluate([...player.hole, ...game.board]).label : '',
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
    publish({
      hand: game.hand,
      phase: game.phase,
      street: done ? '本手结束' : STREET_NAMES[game.street] || '准备发牌',
      replay: game.replayAttempt || 0,
      seats,
      board,
      boardTop: board.slice(0, 3),
      boardBottom: board.slice(3),
      heroCards: hero.hole.map(cardView),
      heroStack: format(hero.stack),
      heroPosition: seatPosition(game, 0),
      heroAction: cleanAction(
        hero.folded || hero.allin || hero.lastAction?.street === game.street
          ? hero.lastAction?.text || ''
          : '',
      ),
      heroRank: done && game.showdown ? evaluate([...hero.hole, ...game.board]).label : '',
      heroWinner: done && game.winners.some((w) => w.id === 0),
      heroFolded: hero.folded,
      heroAllin: hero.allin,
      compactActions: done || hero.folded || hero.allin,
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
      minRaise: legal.minRaiseTo || CHIP_UNIT,
      maxRaise: legal.maxRaiseTo || CHIP_UNIT,
      raiseTo,
      raiseText: format(raiseTo),
      chipUnit: CHIP_UNIT,
      callLabel: legal.canCheck ? '过牌' : '跟注',
      callText: legal.canCheck ? '' : format(legal.callAmount || 0),
      actionNotice: done
        ? ''
        : hero.folded
          ? '已弃牌，正在完成这手。'
          : hero.allin
            ? '已全下，等待摊牌。'
            : legal.enabled
              ? legal.canCheck
                ? '轮到你了，可以过牌。'
                : `轮到你了，跟注 ${format(legal.callAmount)}。`
              : `${game.players[game.actor]?.name || '对手'} 正在思考…`,
      profiles,
      settings: { ...settings, assignments: { ...settings.assignments } },
      seatSettings: game.players.slice(1).map((p) => ({
        id: p.id,
        name: p.name,
        profileIndex: Math.max(
          0,
          BOT_PROFILES.findIndex((profile) => profile.id === settings.assignments[p.id]),
        ),
        profileName:
          BOT_PROFILES.find((profile) => profile.id === settings.assignments[p.id])?.short ||
          '均衡',
      })),
      hintText,
      logs: game.logs
        .slice(0, 30)
        .reverse()
        .map((entry, index) => ({
          key: index,
          text: cleanAction(typeof entry === 'string' ? entry : entry.text),
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
        effect('deal');
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
      timer = schedule(() => {
        timer = null;
        if (disposed || !active || ticket !== epoch || !isBotTurnCurrent(game, plan)) return;
        const previousBoard = game.board.length;
        const result = executeBotTurn(game, plan, { waitedMs: Date.now() - started });
        effect(result.action);
        if (game.board.length > previousBoard) effect('deal');
        render();
        driveBots();
      }, plan.delayMs);
    }, 0);
  }
  function freshHand() {
    cancelBots();
    cancelReview();
    cancelHint();
    hintKey = '';
    if (game.players.length !== settings.playerCount) game = newGame(settings.playerCount);
    game.difficulty = settings.difficulty;
    applyBotSettings(game, settings);
    startHand(game);
    raiseTo = 150;
    effect('deal');
    render();
    driveBots();
  }
  function setPreference(key, value) {
    const next = sanitize({ ...settings, [key]: value });
    settings = next;
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
      const before = game.board.length;
      act(game, 0, action, action === 'raise' ? raiseTo : undefined);
      effect(action === 'call' && legal.canCheck ? 'check' : action);
      if (game.board.length > before) effect('deal');
      render();
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
                  { currentBet: game.currentBet, pot: potSize(game), callAmount: legal.callAmount },
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
    retry() {
      if (!canRestartHand(game)) return false;
      cancelBots();
      cancelReview();
      cancelHint();
      hintKey = '';
      restartHand(game);
      raiseTo = 150;
      render();
      driveBots();
      return true;
    },
    reset() {
      cancelBots();
      cancelReview();
      game = newGame(settings.playerCount);
      freshHand();
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
      settings = sanitize({
        ...settings,
        assignments: { ...settings.assignments, [id]: profileId },
      });
      save();
      render();
    },
    setAllProfiles(profileId) {
      if (!BOT_PROFILES.some((p) => p.id === profileId)) return;
      settings = sanitize({
        ...settings,
        assignments: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, profileId])),
      });
      save();
      render();
    },
    finishHand() {
      if (!game.players[0].folded && !game.players[0].allin) return;
      cancelBots();
      const ticket = epoch;
      function step() {
        if (disposed || !active || ticket !== epoch || game.phase === 'done') return;
        if (game.phase === 'between') {
          advanceStreet(game);
          effect('deal');
          render();
          if (game.phase !== 'done')
            timer = schedule(() => {
              timer = null;
              step();
            }, 150);
          return;
        }
        if (game.phase !== 'playing' || game.actor <= 0) return;
        const plan = planBotTurn(game);
        const result = executeBotTurn(game, plan, { expedited: true });
        effect(result.action);
        render();
        if (game.phase !== 'done')
          timer = schedule(() => {
            timer = null;
            step();
          }, 150);
      }
      step();
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
            const explanation = explainOpponent(record);
            return {
              index,
              name: record.name,
              street: STREET_NAMES[view.street],
              actual: cleanAction(
                actionLabel({ ...view, action: record.action, amount: record.amount }),
              ),
              label: record.trace.profileName,
              position: view.position,
              pot: format(view.pot),
              stack: format(view.stack),
              cards: view.hole.map(cardView),
              board: view.board.map(cardView),
              title: explanation.title,
              reason: explanation.detail,
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
            suggestion: cleanAction(r.coaching.suggestion),
            reason: r.coaching.explanation,
            followUp: r.coaching.followUp,
            ev: r.coaching.evText,
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
