import { newGame } from './poker.js';
import { sameStakes, validateStakes } from './stakes.js';

export const GAME_RECORDS_KEY = 'noir-game-records-v1';
// A settled hand has a result even when no chips were invested or net chips
// balance to zero. Pot ownership and net change remain separate facts.
export function recordResult(attempt) {
  if (attempt.status === 'unfinished') return 'unfinished';
  if (attempt.status !== 'completed') return 'playing';
  return attempt.wonPot ? 'win' : 'loss';
}
const VERSION = 1;
const copy = (value) => JSON.parse(JSON.stringify(value));
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const timestamp = (value) => integer(value) && Number.isFinite(new Date(value).getTime());
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () => {
  throw Error('Invalid game records');
};
const assert = (condition) => {
  if (!condition) fail();
};
const playerId = (value, count) => integer(value) && value < count;
const chipAmount = (value, unit) => integer(value) && value % unit === 0;
const hasDeck = (value) =>
  object(value)
    ? Object.entries(value).some(([key, child]) => key === 'deck' || hasDeck(child))
    : Array.isArray(value) && value.some(hasDeck);
const withoutDeck = (value) =>
  Array.isArray(value)
    ? value.map(withoutDeck)
    : object(value)
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'deck')
            .map(([key, child]) => [key, withoutDeck(child)]),
        )
      : value;
function cards(value, maximum = 5) {
  assert(Array.isArray(value) && value.length <= maximum);
  const keys = new Set();
  for (const card of value) {
    assert(
      object(card) &&
        integer(card.rank, 2) &&
        card.rank <= 14 &&
        integer(card.suit) &&
        card.suit <= 3 &&
        card.symbol === ['♠', '♥', '♣', '♦'][card.suit] &&
        card.key === `${card.suit}-${card.rank}` &&
        !keys.has(card.key),
    );
    keys.add(card.key);
  }
}
function gameShape(game, stakes, playerCount, phase) {
  assert(object(game) && !hasDeck(game) && game.phase === phase);
  assert(sameStakes(validateStakes(game.stakes), stakes));
  assert(
    game.smallBlind === stakes.smallBlind &&
      game.bigBlind === stakes.bigBlind &&
      game.chipUnit === stakes.chipUnit,
  );
  assert(
    integer(game.hand) &&
      integer(game.dealer) &&
      game.dealer < playerCount &&
      Array.isArray(game.players) &&
      game.players.length === playerCount,
  );
  assert(
    object(game.stats) &&
      integer(game.stats.hands) &&
      integer(game.stats.wins) &&
      game.stats.wins <= game.stats.hands &&
      integer(game.stats.buyin) &&
      game.stats.buyin % stakes.chipUnit === 0,
  );
  for (const [id, player] of game.players.entries()) {
    assert(object(player) && player.id === id && typeof player.name === 'string');
    for (const key of ['stack', 'bet', 'total'])
      assert(integer(player[key]) && player[key] % stakes.chipUnit === 0);
    assert(typeof player.botProfile === 'string');
    assert(typeof player.folded === 'boolean' && typeof player.allin === 'boolean');
    assert(typeof player.action === 'string' && typeof player.checked === 'boolean');
    assert(player.actedTo === null || chipAmount(player.actedTo, stakes.chipUnit));
    assert(object(player.botMood) && object(player.botMood.pressureFolds));
    assert(typeof player.botMood.kind === 'string' && typeof player.botMood.reason === 'string');
    for (const key of ['remaining', 'cooldown', 'losses', 'wins'])
      assert(integer(player.botMood[key]));
    assert(Object.values(player.botMood.pressureFolds).every((number) => integer(number)));
    assert(object(player.botStats));
    for (const key of ['hands', 'vpip', 'pfr', 'postActions', 'postRaises', 'postCalls'])
      assert(integer(player.botStats[key]));
    cards(player.hole, 2);
    assert(player.hole.length === (phase === 'done' ? 2 : 0));
  }
  assert(['easy', 'normal', 'hard'].includes(game.difficulty));
  assert(['off', 'subtle', 'lively'].includes(game.emotionMode));
  assert(typeof game.revealed === 'boolean');
  cards(game.board);
  if (game.practiceBoard !== null) cards(game.practiceBoard);
  for (const key of [
    'decisions',
    'botDecisions',
    'history',
    'pots',
    'refunds',
    'payouts',
    'winners',
    'logs',
  ])
    assert(Array.isArray(game[key]));
  for (const entry of game.logs)
    assert(
      object(entry) &&
        typeof entry.text === 'string' &&
        typeof entry.type === 'string' &&
        integer(entry.street, -1) &&
        entry.street <= 3 &&
        (entry.player === null || playerId(entry.player, playerCount)),
    );
  const publicAction = (entry) => {
    assert(
      object(entry) &&
        playerId(entry.id, playerCount) &&
        integer(entry.street) &&
        entry.street <= 3,
    );
    assert(['fold', 'check', 'call', 'raise'].includes(entry.action));
    assert(chipAmount(entry.amount, stakes.chipUnit));
  };
  game.history.forEach(publicAction);
  for (const [index, pot] of game.pots.entries()) {
    assert(object(pot) && typeof pot.label === 'string' && chipAmount(pot.amount, stakes.chipUnit));
    assert(Array.isArray(pot.eligible) && pot.eligible.every((id) => playerId(id, playerCount)));
    assert(pot.index === index && Array.isArray(pot.contributions));
    for (const contribution of pot.contributions)
      assert(
        object(contribution) &&
          playerId(contribution.id, playerCount) &&
          chipAmount(contribution.amount, stakes.chipUnit),
      );
    assert(
      pot.contributions.reduce((sum, contribution) => sum + contribution.amount, 0) === pot.amount,
    );
    assert(Array.isArray(pot.awards));
    for (const award of pot.awards)
      assert(
        object(award) &&
          playerId(award.id, playerCount) &&
          chipAmount(award.amount, stakes.chipUnit) &&
          typeof award.label === 'string',
      );
    assert(pot.awards.reduce((sum, award) => sum + award.amount, 0) === pot.amount);
  }
  for (const refund of game.refunds)
    assert(
      object(refund) &&
        playerId(refund.id, playerCount) &&
        chipAmount(refund.amount, stakes.chipUnit),
    );
  for (const winner of game.winners)
    assert(
      object(winner) &&
        playerId(winner.id, playerCount) &&
        typeof winner.name === 'string' &&
        chipAmount(winner.amount, stakes.chipUnit) &&
        typeof winner.label === 'string',
    );
  if (phase === 'idle') {
    assert(game.players.every((player) => player.bet === 0 && player.total === 0));
    assert(game.board.length === 0 && game.practiceBoard === null);
  } else {
    assert(game.payouts.length === playerCount);
    assert(game.payouts.every((amount) => integer(amount) && amount % stakes.chipUnit === 0));
    assert(
      game.payouts.reduce((sum, amount) => sum + amount, 0) ===
        game.players.reduce((sum, player) => sum + player.total, 0),
    );
    for (const decision of game.decisions) {
      assert(object(decision) && decision.hand === game.hand);
      cards(decision.hole, 2);
      assert(decision.hole.length === 2);
      cards(decision.board);
      assert(Array.isArray(decision.players) && decision.players.length === playerCount);
      assert(
        decision.players.every(
          (player) =>
            object(player) &&
            !('hole' in player) &&
            playerId(player.id, playerCount) &&
            typeof player.name === 'string',
        ),
      );
      for (const [id, player] of decision.players.entries()) {
        assert(player.id === id && typeof player.position === 'string');
        for (const key of ['stack', 'bet', 'total'])
          assert(chipAmount(player[key], stakes.chipUnit));
        assert(typeof player.folded === 'boolean' && typeof player.allin === 'boolean');
      }
      assert(
        Array.isArray(decision.pending) &&
          decision.pending.every((id) => playerId(id, playerCount)),
      );
      assert(
        typeof decision.position === 'string' && integer(decision.street) && decision.street <= 3,
      );
      assert(['fold', 'check', 'call', 'raise'].includes(decision.action));
      for (const key of ['stack', 'bet', 'total', 'pot', 'currentBet', 'minRaise', 'amount'])
        assert(chipAmount(decision[key], stakes.chipUnit));
      assert(object(decision.legal) && decision.legal.enabled === true);
      for (const key of ['toCall', 'callAmount', 'minRaiseTo', 'maxRaiseTo', 'fullRaiseTo'])
        assert(chipAmount(decision.legal[key], stakes.chipUnit));
      for (const key of ['canCheck', 'canRaise', 'raiseReopened', 'isShortAllin'])
        assert(typeof decision.legal[key] === 'boolean');
      assert(Array.isArray(decision.history));
      decision.history.forEach(publicAction);
    }
    for (const decision of game.botDecisions) {
      assert(
        object(decision) &&
          playerId(decision.id, playerCount) &&
          decision.id !== 0 &&
          decision.hand === game.hand &&
          typeof decision.name === 'string' &&
          object(decision.trace) &&
          object(decision.trace.view),
      );
      const view = decision.trace.view;
      cards(view.hole, 2);
      assert(view.hole.length === 2);
      cards(view.board);
      assert(Array.isArray(view.history));
      view.history.forEach(publicAction);
      assert(
        Array.isArray(view.opponents) &&
          view.opponents.every(
            (player) =>
              object(player) &&
              playerId(player.id, playerCount) &&
              chipAmount(player.stack, stakes.chipUnit),
          ),
      );
      assert(object(view.legal) && chipAmount(view.legal.callAmount, stakes.chipUnit));
      for (const key of ['stack', 'bet', 'total', 'pot', 'currentBet'])
        assert(chipAmount(view[key], stakes.chipUnit));
      assert(typeof view.position === 'string' && integer(view.street) && view.street <= 3);
      assert(
        typeof decision.trace.reason === 'string' && typeof decision.trace.profileName === 'string',
      );
    }
  }
}
function validateState(value) {
  assert(
    object(value) &&
      value.version === VERSION &&
      integer(value.nextNumber, 1) &&
      Array.isArray(value.sessions),
  );
  const ids = new Set(),
    numbers = new Set();
  let maximum = 0;
  for (const session of value.sessions) {
    assert(object(session) && typeof session.id === 'string' && session.id && !ids.has(session.id));
    ids.add(session.id);
    assert(integer(session.number, 1) && !numbers.has(session.number));
    numbers.add(session.number);
    maximum = Math.max(maximum, session.number);
    assert(
      timestamp(session.startedAt) && (session.endedAt === null || timestamp(session.endedAt)),
    );
    const stakes = validateStakes(session.stakes);
    assert(integer(session.playerCount, 5) && session.playerCount <= 9);
    assert(Array.isArray(session.attempts));
    const positions = new Set();
    for (const attempt of session.attempts) {
      assert(
        object(attempt) && typeof attempt.id === 'string' && attempt.id && !ids.has(attempt.id),
      );
      ids.add(attempt.id);
      assert(integer(attempt.hand, 1) && integer(attempt.attempt));
      const position = `${attempt.hand}:${attempt.attempt}`;
      assert(!positions.has(position));
      positions.add(position);
      assert(['playing', 'completed', 'unfinished'].includes(attempt.status));
      assert(typeof attempt.superseded === 'boolean' && typeof attempt.refill === 'boolean');
      assert(
        timestamp(attempt.startedAt) && (attempt.endedAt === null || timestamp(attempt.endedAt)),
      );
      cards(attempt.hole, 2);
      assert(attempt.hole.length === 2);
      if (attempt.status === 'completed') {
        assert(Number.isSafeInteger(attempt.profit) && attempt.profit % stakes.chipUnit === 0);
        assert(typeof attempt.wonPot === 'boolean');
        gameShape(attempt.snapshot, stakes, session.playerCount, 'done');
        assert(
          attempt.snapshot.hand === attempt.hand &&
            (attempt.snapshot.replayAttempt || 0) === attempt.attempt &&
            JSON.stringify(attempt.snapshot.players[0].hole) === JSON.stringify(attempt.hole),
        );
        assert(
          attempt.profit === attempt.snapshot.payouts[0] - attempt.snapshot.players[0].total &&
            attempt.wonPot === attempt.snapshot.winners.some((winner) => winner.id === 0),
        );
      } else
        assert(attempt.profit === null && attempt.wonPot === null && attempt.snapshot === null);
    }
  }
  assert(value.nextNumber > maximum);
  const current = value.sessions.find((session) => session.id === value.currentId);
  assert(value.currentId === null || (current && current.endedAt === null));
  if (value.checkpoint !== null) {
    assert(current);
    gameShape(value.checkpoint, current.stakes, current.playerCount, 'idle');
  }
  const playing = value.sessions.flatMap((session) =>
    session.attempts.filter((a) => a.status === 'playing'),
  );
  if (value.active === null) assert(playing.length === 0);
  else {
    assert(object(value.active) && current && value.active.sessionId === current.id);
    const attempt = current.attempts.find((row) => row.id === value.active.attemptId);
    assert(attempt?.status === 'playing' && playing.length === 1 && !attempt.superseded);
    gameShape(value.active.baseline, current.stakes, current.playerCount, 'idle');
    assert(value.active.baseline.hand === attempt.hand);
  }
  return value;
}
// Recovery carries only settled bankrolls or the active attempt's post-refill,
// pre-blind bankrolls. No original deal, opponent cards or future deck survives.
function checkpoint(game, beforeAttempt = false) {
  const restored = newGame(game.players.length, game.stakes);
  restored.hand = game.hand;
  restored.dealer = game.dealer;
  restored.stats = copy(game.stats);
  restored.difficulty = game.difficulty;
  restored.emotionMode = game.emotionMode;
  restored.decisions = [];
  restored.botDecisions = [];
  restored.history = [];
  for (const [id, player] of game.players.entries()) {
    restored.players[id] = {
      ...copy(player),
      stack: player.stack + (beforeAttempt ? player.total : 0),
      hole: [],
      bet: 0,
      total: 0,
      folded: false,
      allin: false,
      actedTo: null,
      checked: false,
      action: '',
      lastAction: null,
      botHand: { vpip: false, pfr: false, pressureRecorded: false },
    };
  }
  delete restored.deck;
  return restored;
}
const emptyState = () => ({
  version: VERSION,
  nextNumber: 1,
  currentId: null,
  checkpoint: null,
  active: null,
  sessions: [],
});

export function createGameRecords({ storage, now = Date.now, id } = {}) {
  let state = emptyState(),
    storageError = null,
    readError = null,
    serial = 0;
  const identity =
    id || (() => `${now().toString(36)}-${++serial}-${Math.random().toString(36).slice(2, 10)}`);
  const adapter = () => storage ?? globalThis.localStorage;
  const nextId = () => {
    const base = String(identity());
    let candidate = base,
      suffix = 0;
    const exists = (value) =>
      state.sessions.some(
        (session) =>
          session.id === value || session.attempts.some((attempt) => attempt.id === value),
      );
    while (exists(candidate)) candidate = `${base}-${++suffix}`;
    return candidate;
  };
  const current = () => state.sessions.find((session) => session.id === state.currentId);
  const findAttempt = (attemptId) =>
    state.sessions.flatMap((s) => s.attempts).find((a) => a.id === attemptId);
  const write = () => {
    try {
      const target = adapter();
      if (!target) throw Error('Storage unavailable');
      target.setItem(GAME_RECORDS_KEY, JSON.stringify(state));
      storageError = target.error?.(GAME_RECORDS_KEY) ? '对局记录保存失败，关闭后可能丢失。' : null;
    } catch {
      storageError = '对局记录保存失败，关闭后可能丢失。';
    }
  };
  try {
    const target = adapter();
    if (!target) throw Error('Storage unavailable');
    const saved = target.getItem(GAME_RECORDS_KEY);
    if (target.error?.(GAME_RECORDS_KEY)) throw Error('Storage unavailable');
    if (saved !== null && saved !== undefined) state = validateState(JSON.parse(saved));
  } catch {
    readError = '本机对局记录读取失败，已开始新的记录。';
  }
  const finishUnfinished = () => {
    if (!state.active) return;
    const attempt = findAttempt(state.active.attemptId);
    attempt.status = 'unfinished';
    attempt.endedAt = now();
    state.checkpoint = copy(state.active.baseline);
    state.active = null;
  };
  return {
    resume() {
      finishUnfinished();
      write();
      return state.checkpoint ? { ...copy(state.checkpoint), deck: [] } : null;
    },
    begin(game, { newSession = false } = {}) {
      if (!['playing', 'between'].includes(game.phase)) throw Error('发牌后才能开始记录本手。');
      const attemptNumber = game.replayAttempt || 0;
      const session = current();
      const existing = state.active && findAttempt(state.active.attemptId);
      if (
        !newSession &&
        existing?.hand === game.hand &&
        existing.attempt === attemptNumber &&
        session.playerCount === game.players.length &&
        sameStakes(session.stakes, game.stakes)
      )
        return copy(existing);
      const fresh =
        newSession ||
        !session ||
        session.playerCount !== game.players.length ||
        !sameStakes(session.stakes, game.stakes) ||
        (attemptNumber === 0 && session.attempts.some((a) => a.hand >= game.hand));
      finishUnfinished();
      if (fresh) {
        if (session) session.endedAt = now();
        const next = {
          id: nextId(),
          number: state.nextNumber++,
          startedAt: now(),
          endedAt: null,
          stakes: validateStakes(game.stakes),
          playerCount: game.players.length,
          attempts: [],
        };
        state.sessions.push(next);
        state.currentId = next.id;
      }
      const target = current();
      for (const previous of target.attempts)
        if (previous.hand === game.hand) previous.superseded = true;
      const attempt = {
        id: nextId(),
        hand: game.hand,
        attempt: attemptNumber,
        startedAt: now(),
        endedAt: null,
        status: 'playing',
        superseded: false,
        refill: !!game.logs?.some((entry) => entry.player === 0 && entry.text.includes('补充')),
        hole: copy(game.players[0].hole),
        profit: null,
        wonPot: null,
        snapshot: null,
      };
      target.attempts.push(attempt);
      const baseline = checkpoint(game, true);
      state.checkpoint = copy(baseline);
      state.active = { sessionId: target.id, attemptId: attempt.id, baseline };
      write();
      return copy(attempt);
    },
    capture(game) {
      if (game.phase !== 'done') return null;
      if (!state.active) {
        const settled = current()?.attempts.find(
          (row) =>
            row.hand === game.hand &&
            row.attempt === (game.replayAttempt || 0) &&
            row.status === 'completed' &&
            !row.superseded,
        );
        if (!settled) return null;
        // Post-settlement practice runout and reveal controls update presentation
        // only. They never replace the recorded award, decisions or statistics.
        const presentation = {
          practiceBoard: game.practiceBoard,
          revealed: game.revealed,
          logs: game.logs,
        };
        if (
          Object.entries(presentation).every(
            ([key, value]) => JSON.stringify(value) === JSON.stringify(settled.snapshot[key]),
          )
        )
          return null;
        Object.assign(settled.snapshot, copy(presentation));
        write();
        return copy(settled);
      }
      const attempt = findAttempt(state.active.attemptId);
      if (
        attempt.hand !== game.hand ||
        attempt.attempt !== (game.replayAttempt || 0) ||
        current().playerCount !== game.players.length ||
        !sameStakes(current().stakes, game.stakes)
      )
        return null;
      attempt.status = 'completed';
      attempt.endedAt = now();
      attempt.profit = (game.payouts[0] || 0) - game.players[0].total;
      attempt.wonPot = game.winners.some((winner) => winner.id === 0);
      attempt.snapshot = withoutDeck(copy(game));
      state.checkpoint = checkpoint(game);
      state.active = null;
      write();
      return copy(attempt);
    },
    abandon(game) {
      if (game?.phase === 'done') this.capture(game);
      finishUnfinished();
      write();
    },
    sessions() {
      return copy(state.sessions)
        .sort((a, b) => b.number - a.number)
        .map((session) => {
          const counted = session.attempts.filter((a) => a.status === 'completed' && !a.superseded);
          return {
            ...session,
            profit: counted.reduce((sum, a) => sum + a.profit, 0),
            wins: counted.filter((a) => a.wonPot).length,
            completed: counted.length,
            attempts: session.attempts.sort((a, b) => a.hand - b.hand || a.attempt - b.attempt),
          };
        });
    },
    sessionNumber: () => current()?.number || 0,
    getAttempt: (attemptId) => {
      const attempt = findAttempt(attemptId);
      return attempt ? copy(attempt) : null;
    },
    error() {
      if (storageError) return storageError;
      try {
        if (adapter()?.error?.(GAME_RECORDS_KEY)) return '对局记录保存失败，关闭后可能丢失。';
      } catch {
        return '对局记录保存失败，关闭后可能丢失。';
      }
      return readError;
    },
  };
}
