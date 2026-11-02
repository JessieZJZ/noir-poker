import { calculateOuts, createWinRateRun } from './win-rate.js';

export const MAX_WIN_RATE_PLAYERS = 9;
const FLOP_SLOTS = 3;
const SLICE_MS = 12;
const BATCH = 256;
// Slower runtimes fall back to labelled sampling instead of a long spinner.
const EXACT_PROBE_MS = 150;
const EXACT_BUDGET_MS = 3000;
const SAMPLE_BUDGET_MS = 1500;
const SAMPLE_TRIALS = 400000;

const emptyPlayer = (id) => ({ id, cards: [null, null] });

// Web and WeChat render this one model, so selection, auto-advance and the
// cancellation of a stale calculation cannot drift between platforms.
export function createWinRateSession({
  onChange = () => {},
  setTimer = (callback) => setTimeout(callback, 0),
  clearTimer = clearTimeout,
  now = () => Date.now(),
} = {}) {
  let nextId = 2,
    players = [emptyPlayer(0), emptyPlayer(1)],
    board = Array(5).fill(null),
    target = null,
    run = null,
    timer = null,
    startedAt = 0,
    calculatedKey = '',
    calculated = null;

  const cards = () => [...board, ...players.flatMap((player) => player.cards)].filter(Boolean);
  const targetPlayer = () => players.find((player) => player.id === target.id);
  const targetCard = () => {
    if (!target) return null;
    return target.type === 'board' ? board[target.index] : targetPlayer().cards[target.index];
  };
  const complete = (player) => player.cards.every(Boolean);
  function input() {
    const ready = players.filter(complete);
    return {
      ids: ready.map((player) => player.id),
      hands: ready.map((player) => player.cards),
      board: board.filter(Boolean),
      dead: players
        .filter((player) => !complete(player))
        .flatMap((player) => player.cards.filter(Boolean)),
    };
  }
  const keyOf = ({ ids, hands, board, dead }) =>
    JSON.stringify([ids, hands, board, dead].flat(2).map((value) => value?.key ?? value));
  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    run = null;
  }
  function finish(source) {
    const { ids } = source,
      result = run.result(),
      outs = calculateOuts(source);
    cancel();
    calculated = {
      method: result.method,
      samples: result.samples,
      margin: result.margin,
      players: new Map(ids.map((id, i) => [id, { ...result.players[i], outs: outs[i] }])),
    };
  }
  function pump(source) {
    timer = null;
    const until = now() + SLICE_MS;
    let finished;
    do finished = run.step(BATCH);
    while (!finished && now() < until);
    const elapsed = now() - startedAt;
    if (!finished && run.method === 'sampling' && elapsed >= SAMPLE_BUDGET_MS) finished = true;
    if (finished) {
      finish(source);
      return true;
    }
    if (
      run.method === 'exact' &&
      elapsed >= EXACT_PROBE_MS &&
      elapsed / run.progress() > EXACT_BUDGET_MS
    ) {
      startedAt = now();
      run = createWinRateRun(source, { trials: SAMPLE_TRIALS });
    }
    timer = setTimer(() => {
      if (pump(source)) onChange();
    });
    return false;
  }
  function refresh() {
    const source = input(),
      key = source.hands.length > 1 ? keyOf(source) : '';
    if (key === calculatedKey) return;
    cancel();
    calculatedKey = key;
    calculated = null;
    if (!key) return;
    startedAt = now();
    run = createWinRateRun(source);
    pump(source);
  }
  function changed() {
    refresh();
    onChange();
  }
  function nextTarget() {
    if (target.type === 'board') {
      if (!target.deal || target.index >= FLOP_SLOTS) return null;
      const index = board.findIndex((card, i) => !card && i < FLOP_SLOTS);
      return index >= 0 ? { ...target, index } : null;
    }
    const index = targetPlayer().cards.findIndex((card) => !card);
    return index >= 0 ? { ...target, index } : null;
  }
  function assign(card) {
    if (target.type === 'board') board[target.index] = card;
    else targetPlayer().cards[target.index] = card;
  }
  return {
    openBoard(index) {
      // A filled card is edited in place; an empty street deals in order. Only
      // an untouched flop stays open between picks, later taps are likely edits.
      const first = board.findIndex((card) => !card),
        deal = !board.slice(0, FLOP_SLOTS).some(Boolean);
      target = { type: 'board', index: board[index] ? index : first, deal };
      onChange();
    },
    openPlayer(id, index) {
      target = { type: 'player', id, index };
      onChange();
    },
    closePicker() {
      if (!target) return;
      target = null;
      onChange();
    },
    pick(card) {
      if (!target) return;
      const own = targetCard();
      if (own?.key !== card.key && cards().some((used) => used.key === card.key)) return;
      assign(card);
      target = nextTarget();
      changed();
    },
    // 删除 empties the slot and hands the page back, matching 返回 afterwards.
    clearTarget() {
      if (!target) return;
      assign(null);
      target = null;
      changed();
    },
    addOpponent() {
      if (players.length >= MAX_WIN_RATE_PLAYERS) return;
      players = [...players, emptyPlayer(nextId++)];
      changed();
    },
    removeOpponent(id) {
      if (players.length <= 2 || id === players[0].id) return;
      players = players.filter((player) => player.id !== id);
      changed();
    },
    clear() {
      nextId = 2;
      players = [emptyPlayer(0), emptyPlayer(1)];
      board = Array(5).fill(null);
      target = null;
      changed();
    },
    // Closing the page cancels the pending slice; opening it computes again.
    pause() {
      cancel();
      calculatedKey = '';
      calculated = null;
    },
    resume() {
      refresh();
      onChange();
    },
    view() {
      return {
        board: [...board],
        target: target && { ...target },
        selected: targetCard()?.key ?? null,
        used: cards().map((card) => card.key),
        canAdd: players.length < MAX_WIN_RATE_PLAYERS,
        status: run ? 'computing' : calculated ? 'ready' : 'idle',
        method: calculated?.method ?? null,
        samples: calculated?.samples ?? 0,
        margin: calculated?.margin ?? 0,
        players: players.map((player, index) => ({
          id: player.id,
          hero: index === 0,
          number: index,
          cards: [...player.cards],
          complete: complete(player),
          removable: index > 0 && players.length > 2,
          result: calculated?.players.get(player.id) ?? null,
        })),
      };
    },
  };
}
