import { deckOfCards, rankText } from '../engine/poker.js';
import { createWinRateSession } from '../engine/win-rate-session.js';
import { getLocale, setLocalizedHTML } from '../i18n/index.js';
import { renderCard } from './cards.js';
import { createDialogScrollLock } from './dialog-scroll-lock.js';

const STREETS = [
  { label: '翻牌', slots: [0, 1, 2] },
  { label: '转牌', slots: [3] },
  { label: '河牌', slots: [4] },
];
const BOARD_MARKS = ['♠', '♣', '♥', '♦', '♠'];
const SUIT_ORDER = [0, 1, 2, 3];
const PICKER_RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const deck = deckOfCards();
const percent = (value) => `${(value * 100).toFixed(2)}%`;
const cardName = (card) => `${rankText(card.rank)}${card.symbol}`;
const playerName = (player) => (player.hero ? '你' : `对手 ${player.number}`);
const samePlace = (a, b) => a?.type === b.type && a?.index === b.index && a?.id === b.id;

function slot(card, { attributes, label, empty, active }) {
  return `<button type="button" class="win-rate-slot${card ? '' : ' is-empty'}${active ? ' is-active' : ''}" ${attributes}><span class="sr-only">${label}</span>${card ? `<span class="sr-only">${cardName(card)}</span>${renderCard(card, { small: true })}` : empty}</button>`;
}
const boardSlotName = ({ label, slots }, index) =>
  slots.length > 1 ? `翻牌第 ${index + 1} 张` : label;
const holeSlotName = (player, index) =>
  player.hero ? `你的第 ${index + 1} 张底牌` : `对手 ${player.number} 的第 ${index + 1} 张底牌`;
function boardMarkup(view) {
  return STREETS.map(
    (street) =>
      `<div class="win-rate-street"><div class="win-rate-street-cards">${street.slots
        .map((index) =>
          slot(view.board[index], {
            attributes: `data-board="${index}"`,
            label: boardSlotName(street, index),
            empty: `<span class="win-rate-board-mark">${BOARD_MARKS[index]}</span>`,
            active: samePlace(view.target, { type: 'board', index }),
          }),
        )
        .join('')}</div><span>${street.label}</span></div>`,
  ).join('');
}
function oddsMarkup(player, view, ready) {
  const { result } = player;
  if (result) {
    const estimate = view.method === 'sampling' ? '≈ ' : '';
    return `<div class="win-rate-odds-values"><span>胜率：</span><strong>${estimate}${percent(result.win)}</strong></div><div class="win-rate-odds-tie">平局 ${percent(result.tie)}</div><div class="win-rate-bar" aria-hidden="true"><i style="width:${(result.equity * 100).toFixed(2)}%"></i></div>`;
  }
  if (player.complete && view.status === 'computing')
    return '<div class="win-rate-waiting is-computing"><i class="win-rate-spinner" aria-hidden="true"></i><span>计算中</span></div>';
  return `<div class="win-rate-waiting"><span>${player.complete && ready < 2 ? '等待对手底牌' : '胜率：?'}</span></div>`;
}
function outsMarkup(player) {
  const outs = player.result?.outs;
  if (!outs) return '';
  return `<div class="win-rate-outs"><div class="win-rate-outs-heading"><span>Outs <b>${outs.length}</b></span></div>${
    outs.length
      ? `<div class="win-rate-outs-cards">${outs.map((card) => renderCard(card, { small: true })).join('')}</div>`
      : ''
  }</div>`;
}
function playersMarkup(view) {
  const ready = view.players.filter((player) => player.complete).length;
  return view.players
    .map(
      (player) =>
        `<article class="win-rate-seat${player.hero ? ' is-hero' : ''}" data-win-rate-player="${player.id}"><div class="win-rate-seat-main"><div class="win-rate-hand"><strong>${playerName(player)}</strong><div class="win-rate-hole">${player.cards
          .map((card, index) =>
            slot(card, {
              attributes: `data-player="${player.id}" data-card="${index}"`,
              label: holeSlotName(player, index),
              empty: '<span class="card-back win-rate-back"></span>',
              active: samePlace(view.target, { type: 'player', id: player.id, index }),
            }),
          )
          .join(
            '',
          )}</div></div><div class="win-rate-odds">${oddsMarkup(player, view, ready)}</div>${
          player.removable
            ? `<button type="button" class="win-rate-remove" data-remove="${player.id}" aria-label="删除对手 ${player.number}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>`
            : ''
        }</div>${outsMarkup(player)}</article>`,
    )
    .join('');
}
function statusMarkup(view) {
  if (view.status === 'computing') return '正在计算全部公共牌组合…';
  if (view.status === 'idle') return '';
  const samples = new Intl.NumberFormat(getLocale()).format(view.samples);
  return view.method === 'exact'
    ? `已精确计算全部 ${samples} 种公共牌组合。`
    : `已模拟 ${samples} 次发牌，误差约 ±${(view.margin * 100).toFixed(2)}%。`;
}
function pickerTitle(view) {
  const { target } = view;
  if (target.type === 'board') {
    const street = STREETS.find(({ slots }) => slots.includes(target.index));
    return boardSlotName(street, target.index);
  }
  return holeSlotName(
    view.players.find((entry) => entry.id === target.id),
    target.index,
  );
}
function pickerMarkup(view) {
  const used = new Set(view.used);
  return SUIT_ORDER.map(
    (suit) =>
      `<div class="win-rate-suit">${PICKER_RANKS.map((rank) => {
        const card = deck.find((entry) => entry.suit === suit && entry.rank === rank),
          selected = card.key === view.selected,
          disabled = used.has(card.key) && !selected;
        return `<button type="button" class="win-rate-pick${selected ? ' is-selected' : ''}" data-pick="${card.key}" aria-label="${cardName(card)}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>${renderCard(card, { small: true })}</button>`;
      }).join('')}</div>`,
  ).join('');
}

export function createWinRatePage() {
  const dialog = document.querySelector('#win-rate-dialog'),
    picker = document.querySelector('#win-rate-picker'),
    board = document.querySelector('#win-rate-board'),
    players = document.querySelector('#win-rate-players'),
    status = document.querySelector('#win-rate-status'),
    outsNote = document.querySelector('#win-rate-outs-note'),
    add = document.querySelector('#win-rate-add'),
    title = document.querySelector('#win-rate-picker-title'),
    grid = document.querySelector('#win-rate-picker-grid'),
    remove = document.querySelector('#win-rate-delete');
  const scrollLock = createDialogScrollLock(dialog);
  const session = createWinRateSession({ onChange: render });

  // Each change rebuilds these rows, so keyboard focus follows its data key.
  function focusKey() {
    const element = document.activeElement;
    if (!element?.closest?.('#win-rate-dialog, #win-rate-picker')) return null;
    return ['board', 'player', 'card', 'pick', 'remove']
      .filter((name) => name in element.dataset)
      .map((name) => `[data-${name}="${element.dataset[name]}"]`)
      .join('');
  }
  function render() {
    if (!dialog.open) return;
    const view = session.view(),
      focus = focusKey();
    setLocalizedHTML(board, boardMarkup(view));
    setLocalizedHTML(players, playersMarkup(view));
    setLocalizedHTML(status, statusMarkup(view));
    status.hidden = view.status === 'idle';
    outsNote.hidden = !view.players.some((player) => player.result?.outs);
    add.disabled = !view.canAdd;
    dialog.dataset.status = view.status;
    if (view.target) {
      setLocalizedHTML(title, pickerTitle(view));
      setLocalizedHTML(grid, pickerMarkup(view));
      remove.hidden = !view.selected;
      if (!picker.open) picker.showModal();
      if (focus) grid.querySelector(`${focus}:not(:disabled)`)?.focus();
      if (!grid.contains(document.activeElement))
        (
          grid.querySelector('.win-rate-pick.is-selected') ??
          grid.querySelector('.win-rate-pick:not(:disabled)')
        )?.focus();
    } else {
      if (picker.open) picker.close();
      if (focus) dialog.querySelector(focus)?.focus();
    }
  }
  dialog.addEventListener('click', (event) => {
    const element = event.target.closest('button');
    if (!element) return;
    const { dataset } = element;
    if ('board' in dataset) session.openBoard(Number(dataset.board));
    else if ('player' in dataset) session.openPlayer(Number(dataset.player), Number(dataset.card));
    else if ('remove' in dataset) session.removeOpponent(Number(dataset.remove));
  });
  add.addEventListener('click', () => session.addOpponent());
  document.querySelector('#win-rate-clear').addEventListener('click', () => session.clear());
  grid.addEventListener('click', (event) => {
    const key = event.target.closest('[data-pick]')?.dataset.pick;
    if (key) session.pick(deck.find((card) => card.key === key));
  });
  remove.addEventListener('click', () => session.clearTarget());
  document
    .querySelector('#win-rate-picker-back')
    .addEventListener('click', () => session.closePicker());
  // close() reports asynchronously, so a quick reopen must outlive the old event.
  picker.addEventListener('close', () => {
    if (!picker.open) session.closePicker();
  });
  dialog.addEventListener('close', () => {
    session.closePicker();
    session.pause();
  });
  document.addEventListener('noir:locale-changed', render);
  return {
    open() {
      if (dialog.open) return;
      scrollLock.open();
      session.resume();
    },
  };
}
