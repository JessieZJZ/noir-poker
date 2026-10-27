import { evaluate, seatPosition, currentPots } from '../engine/poker.js';
import { compactActionAmounts } from '../engine/chip-format.js';
import { getBotProfile, MOOD_LABELS } from '../engine/bot-profiles.js';
import {
  formatChips,
  setLocalizedText,
  setLocalizedHTML,
  setLocalizedAttribute,
} from '../i18n/index.js';
import { renderCard } from './cards.js';
import { portraitContent } from './portraits.js';
import { SEAT_ANCHORS } from './seat-geometry.js';
import { visibleRecentAction } from './recent-action.js';
export { visibleRecentAction } from './recent-action.js';
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const format = (value) => formatChips(value);
const streets = ['翻牌前', '翻牌', '转牌', '河牌'];
const profiles = ['YOU', 'M', 'A', 'R', 'K', 'L', 'T', 'J', 'L'];
const winnerIcon =
  '<svg class="winner-icon" viewBox="0 0 20 16" aria-hidden="true"><path d="M2 4 6 7 10 2 14 7 18 4 16 12H4Z"/><path d="M4 15H16"/></svg>';
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
// The champion's trophy: a gold cup that shimmers with a halo, turning rays
// and twinkling stars. WeChat renders the same class names as views.
export const TROPHY_MARKUP =
  '<span class="trophy-shape" aria-hidden="true"><span class="trophy-rays"></span><span class="trophy-glow"></span><span class="trophy-handle handle-left"></span><span class="trophy-handle handle-right"></span><span class="trophy-cup"></span><span class="trophy-stem"></span><span class="trophy-base"></span><span class="trophy-spark spark-1"></span><span class="trophy-spark spark-2"></span><span class="trophy-spark spark-3"></span><span class="trophy-spark spark-4"></span></span>';
function positionBadge(g, id) {
  if (g.phase === 'idle') return '';
  const role = seatPosition(g, id);
  if (!role) return '';
  return `<span class="position-badge" data-position="${role}" title="${positionNames[role]}">${role}</span>`;
}

export function renderSeatAction(g, p, { recent = false, dealing = false } = {}) {
  if (g.phase === 'idle') return '<span class="seat-action-label">已就位</span>';
  if (p.out && !p.hole.length)
    return `<span class="seat-action-label">出局 · 第${p.place}名</span>`;
  if (!recent && g.actor === p.id && !dealing)
    return '<span class="seat-action-label thinking-dots">思考中</span>';
  const retained = visibleRecentAction(g, p);
  const action = retained?.text ?? p.action;
  const match =
    /^(?:(\d+-bet) )?(小盲|大盲|跟注|开池至|加注至|下注至|下注|短全下至|全下至|全下)\s*(\d+)$/.exec(
      action,
    );
  if (!match)
    return `<span class="seat-action-label">${escape(compactActionAmounts(action) || (g.phase === 'done' ? '未行动' : '等待行动'))}</span>`;
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
      : `${compactActionAmounts(action)} · 本轮累计投入 ${format(amount)}`);
  return `<span class="seat-action-label">${label}</span><strong class="seat-action-amount" title="${escape(meaning)}">${format(amount)}</strong>`;
}

// Live and archived tables share the complete seat structure and action layout.
export function renderOpponentSeats(
  g,
  {
    card = renderCard,
    newHand = false,
    dealing = false,
    isSeatHandVisible = (player) => (g.showdown || g.revealed) && !player.folded,
    isSeatHandAnimated = () => true,
    seatFaceSignatures = new Map(),
    crownedId = g.over?.championId ?? null,
    crownPending = false,
  } = {},
) {
  const count = g.players.length;
  return g.players
    .slice(1)
    .map((p) => {
      const winner = g.winners.find((w) => w.id === p.id),
        isWinner = !!winner,
        reveal = isSeatHandVisible(p),
        rank =
          reveal && !p.folded && g.board.length === 5 ? evaluate([...p.hole, ...g.board]) : null,
        [x, y] = SEAT_ANCHORS[count][p.id - 1];
      const rankMarkup =
        rank || winner
          ? `<div class="hand-rank ${winner ? 'rank-winner winner-indicator' : ''}"${winner ? ` aria-label="${escape(p.name)} 获得底池 ${format(winner.amount)} 筹码" title="${escape(winner.label)} · 获得 ${format(winner.amount)} 筹码"` : ''}>${winner ? winnerIcon : ''}${rank?.label ?? '获胜'}</div>`
          : '';
      const profile = getBotProfile(p.botProfile),
        mood = g.emotionMode === 'off' ? 'steady' : p.botMood.kind,
        title = `${p.name} · ${profile.short}（电脑角色） · 模拟状态：${MOOD_LABELS[mood]}`;
      // Emotions show on the avatar while they last; steady and eliminated seats show none.
      const moodShown = mood !== 'steady' && !(p.out && !p.hole.length);
      const faceSignature = `${g.hand}:${g.replayAttempt || 0}:${reveal ? p.hole.map((c) => c.key).join(',') : 'hidden'}`;
      const arriving =
        reveal && isSeatHandAnimated(p) && seatFaceSignatures.get(p.id) !== faceSignature;
      seatFaceSignatures.set(p.id, faceSignature);
      // Layout picks the trophy's side; until then it faces the table centre.
      const trophy =
        crownedId === p.id
          ? `<span class="champion-trophy seat-champion-trophy ${x < 50 ? 'trophy-right' : 'trophy-left'} ${crownPending ? 'trophy-pending' : ''}" title="冠军">${TROPHY_MARKUP}</span>`
          : '';
      return `<div class="seat seat-${p.id} ${y === 0 ? 'seat-crown' : ''} ${x < 25 ? 'seat-left' : x > 75 ? 'seat-right' : ''} ${p.folded ? 'folded' : ''} ${p.out && !p.hole.length ? 'seat-out' : ''} ${crownedId === p.id ? 'is-champion' : ''} ${g.actor === p.id && !dealing ? 'thinking' : ''} ${isWinner ? 'winner' : ''}" data-player="${p.id}" data-profile="${escape(p.botProfile)}" data-mood="${escape(mood)}" style="left:${x}%;top:${y}%"><div id="seat-hand-${p.id}" class="mini-cards ${reveal ? 'revealed-cards' : ''}">${reveal ? p.hole.map((c, i) => card(c, { small: true, animate: arriving, delay: i * 140, best: !!rank && rank.cards.some((best) => best.key === c.key) })).join('') : p.hole.map((c, i) => `<span class="card-back ${newHand ? 'card-deal' : ''}" style="--delay:${p.id * 65 + i * 140}ms" aria-label="对手底牌"></span>`).join('')}</div><div class="seat-profile">${trophy}<span class="avatar avatar-${p.id - 1} ${moodShown ? `has-mood mood-${mood}` : ''}" title="${escape(title)}" aria-label="${escape(title)}">${portraitContent(profile.id, profiles[p.id])}${moodShown ? `<i class="mood-badge mood-live mood-${mood}" aria-hidden="true"></i>` : ''}</span><div><strong><span class="seat-name-label">${escape(p.name)}</span>${positionBadge(g, p.id)}<span class="seat-inspect-slot">${g.phase === 'done' && p.hole.length ? `<button class="seat-peek" data-peek-player="${p.id}" title="${reveal ? '收起底牌' : '查看底牌'}" aria-label="${reveal ? '收起' : '查看'} ${escape(p.name)} 的底牌" aria-pressed="${!!reveal}" aria-controls="seat-hand-${p.id}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10C4 6 7 5 10 5C13 5 16 6 18 10C16 14 13 15 10 15C7 15 4 14 2 10Z"/><circle cx="10" cy="10" r="2.5"/></svg></button>` : ''}</span></strong><span class="seat-style-label" data-style-profile="${profile.id}" data-full-name="${escape(profile.name)}" aria-label="${escape(p.name)} 本手风格：${profile.name}">${profile.short}</span><span class="seat-bankroll"><span class="seat-stack">${format(p.stack)}</span></span></div></div><div class="seat-rank-slot">${rankMarkup}</div><div class="seat-action" aria-label="${escape(p.name)} 的最近行动">${renderSeatAction(g, p, { dealing })}</div></div>`;
    })
    .join('');
}

// Clone the shared structural template, then render only the archived state.
// No event handlers, live game object, engine action or timer is carried over.
export function createSnapshotSurface(template, g, { sessionNumber, visible, peekPlayer } = {}) {
  const surface = template.cloneNode(true),
    query = (selector) => surface.querySelector(selector),
    arena = query('.arena'),
    hero = g.players[0],
    board = g.practiceBoard || g.board,
    best =
      g.showdown && !hero.folded
        ? new Set(evaluate([...hero.hole, ...g.board]).cards.map((card) => card.key))
        : new Set();
  surface.classList.add('records-game-surface');
  surface.classList.remove('has-live-hand');
  delete surface.dataset.entryState;
  query('#entry-welcome')?.remove();
  for (const element of surface.querySelectorAll('.hero-cards-wrap, .action-dock')) {
    element.classList.remove('turn-attention', 'turn-enter', 'turn-reminder');
    delete element.dataset.turnPhase;
  }
  arena.removeAttribute('style');
  query('.poker-table').removeAttribute('style');
  arena.className = 'arena records-arena is-done';
  arena.dataset.playerCount = g.players.length;
  arena.classList.toggle(
    'has-full-player-names',
    g.players.slice(1).some((p) => ['knox', 'theo', 'finn'].includes(p.botProfile)),
  );
  setLocalizedText(query('#session-number-label'), `第 ${sessionNumber} 局`);
  setLocalizedText(query('#hand-number'), String(g.hand).padStart(2, '0'));
  query('#street-label').remove();
  query('#street-divider').remove();
  setLocalizedText(query('#blind-values'), `${format(g.smallBlind)} / ${format(g.bigBlind)}`);
  query('#replay-label').hidden = !g.replayAttempt;
  setLocalizedText(query('#replay-label'), '重打 ' + (g.replayAttempt || 0));
  if (query('#coach-content')) query('#coach-content').hidden = true;
  setLocalizedHTML(
    query('.seats'),
    renderOpponentSeats(g, {
      isSeatHandVisible: (p) => visible.has(p.id),
      isSeatHandAnimated: (p) => p.id === peekPlayer,
    }),
  );
  setLocalizedText(query('#pot-value'), format(g.potAtShowdown));
  query('.pot').classList.remove('pot-changed');
  setLocalizedHTML(
    query('.board'),
    Array.from({ length: 5 }, (_, index) =>
      board[index]
        ? renderCard(board[index], { best: best.has(board[index].key) })
        : `<div class="board-slot" aria-label="未发出的公共牌">${['♠', '♣', '♥', '♦', '♠'][index]}</div>`,
    ).join(''),
  );
  const pots = currentPots(g);
  setLocalizedText(
    query('.board-caption'),
    pots.pots.length > 1
      ? (g.phase === 'done' ? '已分别结算' : '当前投入') +
          ' · 主池 ' +
          format(pots.pots[0].amount) +
          ' + ' +
          (pots.pots.length - 1) +
          ' 个边池'
      : g.practiceBoard
        ? '练习补牌 · 五张公共牌，不影响结算'
        : g.showdown
          ? hero.folded
            ? '摊牌 · 对手亮出底牌'
            : '摊牌 · 最佳组合已高亮'
          : ['等待翻牌', 'FLOP · 三张公共牌', 'TURN · 第四张公共牌', 'RIVER · 最后的决定'][
              g.street
            ],
  );
  setLocalizedHTML(
    query('.hero-cards'),
    hero.hole.map((card) => renderCard(card, { best: best.has(card.key) })).join(''),
  );
  const rank = query('.hero-hand-rank'),
    winner = g.winners.find((w) => w.id === 0),
    showRank = g.board.length === 5 && (g.revealed || g.showdown);
  rank.hidden = !showRank && !winner;
  rank.classList.toggle('rank-winner', !!winner);
  rank.classList.toggle('winner-indicator', !!winner);
  rank.style.removeProperty('translate');
  setLocalizedHTML(
    rank,
    (winner ? winnerIcon : '') +
      (showRank
        ? (hero.folded ? '已弃牌 · ' : '') + evaluate([...hero.hole, ...g.board]).label
        : '获胜'),
  );
  if (winner) {
    setLocalizedAttribute(rank, 'aria-label', `你 获得底池 ${format(winner.amount)} 筹码`);
    setLocalizedAttribute(rank, 'title', `${winner.label} · 获得 ${format(winner.amount)} 筹码`);
  } else {
    rank.removeAttribute('aria-label');
    rank.removeAttribute('title');
  }
  query('.hero-area').classList.toggle('hero-folded', hero.folded);
  query('.hero-area').removeAttribute('style');
  query('.hero-name').classList.toggle('is-champion', g.over?.championId === 0);
  query('#hero-trophy-slot').innerHTML =
    g.over?.championId === 0
      ? `<span class="champion-trophy hero-champion-trophy">${TROPHY_MARKUP}</span>`
      : '';
  query('.hero-name').classList.toggle('is-active', g.actor === 0);
  setLocalizedText(query('#hero-stack'), format(hero.stack));
  const position = seatPosition(g, 0);
  setLocalizedText(query('#hero-position'), position);
  query('#hero-position').dataset.position = position;
  setLocalizedAttribute(query('#hero-position'), 'title', positionNames[position]);
  query('#hero-last-action').hidden = !visibleRecentAction(g, hero);
  setLocalizedHTML(
    query('#hero-last-action'),
    visibleRecentAction(g, hero) ? renderSeatAction(g, hero, { recent: true }) : '',
  );
  query('.table-center').removeAttribute('style');
  query('.board').removeAttribute('style');
  query('.decision-strip').hidden = true;
  query('.bet-controls').hidden = true;
  query('.action-buttons').hidden = true;
  query('#continue-deal-button').hidden = true;
  query('#next-button').hidden = true;
  query('#restart-hand-button').hidden = true;
  query('#review-hand-button').hidden = false;
  query('.action-panel').className = 'action-panel settled-actions';
  query('.action-dock').className = 'action-dock compact-actions';
  for (const node of surface.querySelectorAll('.flying-chip')) node.remove();
  const ids = new Map(
    [...surface.querySelectorAll('[id]')].map((node) => [node.id, 'history-' + node.id]),
  );
  for (const node of surface.querySelectorAll('[id]')) node.id = ids.get(node.id);
  for (const node of surface.querySelectorAll(
    '[aria-controls], [aria-labelledby], [aria-describedby], [for]',
  ))
    for (const attribute of ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for']) {
      const value = node.getAttribute(attribute);
      if (value)
        node.setAttribute(
          attribute,
          value
            .split(' ')
            .map((id) => ids.get(id) || id)
            .join(' '),
        );
    }
  query('.table-viewport').id = 'history-table';
  query('#history-review-hand-button').id = 'history-review-button';
  for (const button of surface.querySelectorAll('[data-peek-player]')) {
    button.dataset.historyPeek = button.dataset.peekPlayer;
    delete button.dataset.peekPlayer;
  }
  query('.pot-details-trigger').dataset.historyPots = '';
  query('.pot-details-trigger').setAttribute('aria-haspopup', 'dialog');
  query('.pot-details-trigger').setAttribute('aria-controls', 'pot-dialog');
  return surface;
}
