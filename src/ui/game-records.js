import { recordResult } from '../engine/game-records.js';
import { createRecordsNavigation } from './records-navigation.js';
import { createGuideMenu } from './guide-menu.js';
export { recordsRoute } from './records-navigation.js';
import { createReviewInput } from '../review/analysis.js';
import { formatChips, getLocale, setLocalizedHTML, setLocalizedText } from '../i18n/index.js';
import { renderCard } from './cards.js';
import { createActivityFormatter } from './activity.js';
import { preparePortraits } from './portraits.js';
import { createSnapshotSurface } from './table-scene.js';
import { createSettlementLayout } from './settlement-layout.js';
import { createPlayViewport } from './play-viewport.js';
import { createShowdownController } from './showdown.js';

const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export function formatRecordChange(value) {
  const amount = Math.round(Number(value));
  return `${amount < 0 ? '-' : '+'}${formatChips(Math.abs(amount))}`;
}
const change = formatRecordChange;
export const formatRecordStart = (value, locale = getLocale()) =>
  new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
export const recordRetryLabel = (attempt) => (attempt ? `重打${attempt}` : '');
const attemptLabel = recordRetryLabel;

export function recordOutcome(attempt) {
  const result = recordResult(attempt);
  if (result === 'unfinished') return '未完成';
  if (result === 'playing') return '进行中';
  if (result === 'win' && attempt.profit < 0) return '获得部分底池 · 净亏损';
  return result === 'win' ? '赢' : '输';
}

function handItem(attempt) {
  const complete = attempt.status === 'completed',
    element = complete ? 'button' : 'div';
  return `<${element} class="record-hand record-attempt ${attempt.superseded ? 'record-superseded' : ''}" ${complete ? `data-record-hand="${escape(attempt.id)}"` : ''} data-record-id="${escape(attempt.id)}" data-status="${attempt.status}" data-hand="${attempt.hand}" data-attempt="${attempt.attempt}" data-superseded="${attempt.superseded}">
    <span class="record-hand-cards record-cards" aria-label="你的底牌">${attempt.hole.map((c) => renderCard(c, { small: true })).join('')}</span>
    <span class="record-hand-info"><strong>第 ${attempt.hand} 手</strong><span class="record-hand-tags">${attempt.attempt ? `<span class="record-tag record-retry">${attemptLabel(attempt.attempt)}</span>` : ''}${attempt.refill ? '<span class="record-tag record-refill">补码</span>' : ''}</span></span>
    <span class="record-hand-result ${complete && attempt.profit < 0 ? 'negative' : complete && attempt.profit > 0 ? 'positive' : ''}"><strong>${complete ? change(attempt.profit) : '—'}</strong>${recordOutcome(attempt) ? `<span>${recordOutcome(attempt)}</span>` : ''}</span>
    ${complete ? '<span class="record-hand-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span>' : ''}
  </${element}>`;
}

function sessionItem(session, expanded) {
  return `<article class="record-session" data-session-id="${escape(session.id)}" data-session-number="${session.number}">
    <button class="record-session-heading" data-record-session="${escape(session.id)}" aria-expanded="${expanded}" aria-controls="record-session-${escape(session.id)}">
      <span class="record-session-title"><strong>第 ${session.number} 局</strong><time datetime="${new Date(session.startedAt).toISOString()}">${escape(formatRecordStart(session.startedAt))}</time>${session.endedAt ? '' : '<span class="record-tag record-current">当前局</span>'}</span>
      <span class="record-session-stats"><span><small>胜率</small><strong>${session.completed ? Math.round((session.wins / session.completed) * 100) + '%' : '—'}</strong></span><span><small>净筹码变化</small><strong class="${session.profit < 0 ? 'negative' : session.profit > 0 ? 'positive' : ''}">${change(session.profit)}</strong></span><span><small>起始大小盲</small><strong>${formatChips(session.stakes.smallBlind)} / ${formatChips(session.stakes.bigBlind)}</strong></span><span><small>牌桌人数</small><strong>${session.playerCount} 人</strong></span></span>
      <span class="record-session-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="record-session-hands" id="record-session-${escape(session.id)}" ${expanded ? '' : 'hidden'}>${expanded ? session.attempts.map(handItem).join('') || '<p class="records-empty">这一局还没有对局记录。</p>' : ''}</div>
  </article>`;
}

export function createGameRecordsView({ records, openReview, openPots, onReturnGame }) {
  const liveMain = document.querySelector('main.main'),
    page = document.querySelector('#records-page'),
    content = document.querySelector('#records-content'),
    title = document.querySelector('#records-title'),
    started = document.querySelector('#records-hand-start'),
    note = page.querySelector('.records-live-note'),
    error = document.querySelector('#records-storage-error');
  const expanded = new Set(),
    visible = new Set();
  let route = { page: 'game' },
    listScroll = 0,
    fingerprint = '',
    archive = null,
    historyViewport = null,
    defaultCurrent = null,
    listSessions = new Map();

  const navigation = createRecordsNavigation({ window, show: showRoute }),
    guideMenu = createGuideMenu({ onRecords: () => navigate({ page: 'list' }) });
  function navigate(next) {
    navigation.navigate(next);
  }
  function renderList(force = false) {
    const next = `${records.revision()}:${getLocale()}`;
    if (!force && fingerprint === next) return;
    fingerprint = next;
    const sessions = records.summaries();
    listSessions = new Map(sessions.map((session) => [session.id, session]));
    const current = sessions.find((session) => !session.endedAt)?.id;
    if (current && current !== defaultCurrent) {
      expanded.add(current);
      defaultCurrent = current;
    }
    const scroll = window.scrollY;
    setLocalizedHTML(
      content,
      sessions.length
        ? sessions.map((session) => sessionItem(session, expanded.has(session.id))).join('')
        : '<div class="records-empty"><h2>还没有对局记录</h2><p>完成一手后，可以在这里查看结算和复盘。</p></div>',
    );
    window.scrollTo(0, scroll);
  }
  function renderArchive(peekPlayer) {
    if (!archive) return;
    const snapshot = archive.snapshot,
      formatter = createActivityFormatter(snapshot.players);
    setLocalizedHTML(
      content,
      `<div id="history-page"><div class="main records-history-grid"><section class="game-column"><div class="records-surface-slot"></div><div class="records-showdown-slot"></div></section><aside class="sidebar"><section class="activity-card records-activity"><div class="section-title"><h2>本局动态</h2><span class="subtle-label">FINISHED</span></div><ol class="activity-list" aria-label="本手动态，按时间顺序排列">${snapshot.logs
        .slice()
        .reverse()
        .map(
          (log, i) =>
            `<li value="${i + 1}" class="log-${escape(log.type)} ${log.player === 0 ? 'log-hero' : ''}">${formatter(log.text)}</li>`,
        )
        .join('')}</ol></section></aside></div></div>`,
    );
    historyViewport?.destroy();
    const session = records
      .summaries()
      .find((entry) => entry.attempts.some((attempt) => attempt.id === archive.id));
    const surface = createSnapshotSurface(liveMain.querySelector('.game-surface'), snapshot, {
      sessionNumber: session.number,
      visible,
      peekPlayer,
    });
    content.querySelector('.records-surface-slot').replaceWith(surface);
    const showdown = liveMain.querySelector('#showdown-stage').cloneNode(true);
    for (const element of [showdown, ...showdown.querySelectorAll('[id]')])
      element.id = `history-${element.id}`;
    content.querySelector('.records-showdown-slot').replaceWith(showdown);
    createShowdownController({
      card: renderCard,
      root: content,
      prefix: 'history-',
      animate: false,
    }).update(snapshot, 0);
    const layout = createSettlementLayout(surface.querySelector('.arena'), { observe: false });
    historyViewport = createPlayViewport(surface, {
      layout: layout.update,
    });
    historyViewport.update(snapshot, true);
    preparePortraits(content);
  }
  function showRoute(next) {
    if (route.page === 'list' && next.page !== 'list') listScroll = window.scrollY;
    if (route.page !== next.page || route.id !== next.id)
      for (const dialog of document.querySelectorAll('dialog[open]'))
        if (dialog.id !== 'orientation-dialog') dialog.close();
    route = next;
    guideMenu.close();
    liveMain.hidden = route.page !== 'game';
    page.hidden = route.page === 'game';
    document.body.dataset.recordsPage = route.page;
    title.classList.toggle('sr-only', route.page === 'hand');
    started.hidden = route.page !== 'hand';
    note.hidden = route.page === 'hand';
    historyViewport?.destroy();
    historyViewport = null;
    if (route.page === 'game') {
      archive = null;
      window.scrollTo(0, 0);
      onReturnGame?.();
      return;
    }
    if (route.page === 'hand') {
      archive = records.getAttempt(route.id);
      if (!archive || archive.status !== 'completed' || !archive.snapshot) {
        navigate({ page: 'list' });
        return;
      }
    }
    if (route.page === 'hand') {
      setLocalizedText(title, '对局记录');
      started.dateTime = new Date(archive.startedAt).toISOString();
      started.textContent = formatRecordStart(archive.startedAt);
      visible.clear();
      archive.snapshot.players
        .slice(1)
        .filter(
          (player) => (archive.snapshot.showdown || archive.snapshot.revealed) && !player.folded,
        )
        .forEach((player) => visible.add(player.id));
      renderArchive();
      window.scrollTo(0, 0);
    } else {
      archive = null;
      setLocalizedText(title, '对局记录');
      renderList(true);
      requestAnimationFrame(() => window.scrollTo(0, listScroll));
    }
    (route.page === 'hand' ? started : title).focus({ preventScroll: true });
    refresh();
  }
  function refresh() {
    const message = records.error();
    error.hidden = !message;
    if (message) setLocalizedText(error, message);
    if (route.page === 'list') renderList();
  }

  document
    .querySelector('#records-back-button')
    .addEventListener('click', () => navigate({ page: 'game' }));
  content.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.recordSession) {
      const id = button.dataset.recordSession;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      button.setAttribute('aria-expanded', String(expanded.has(id)));
      const hands = document.getElementById('record-session-' + id);
      if (expanded.has(id) && !hands.childElementCount)
        setLocalizedHTML(
          hands,
          listSessions.get(id).attempts.map(handItem).join('') ||
            '<p class="records-empty">这一局还没有对局记录。</p>',
        );
      hands.hidden = !expanded.has(id);
    } else if (button.dataset.recordHand) navigate({ page: 'hand', id: button.dataset.recordHand });
    else if (button.id === 'history-review-button')
      openReview(createReviewInput(archive.snapshot), 'history:' + archive.id);
    else if (button.hasAttribute('data-history-pots')) openPots?.(archive.snapshot);
    else if (button.dataset.historyPeek) {
      const id = Number(button.dataset.historyPeek);
      if (visible.has(id)) visible.delete(id);
      else visible.add(id);
      renderArchive(visible.has(id) ? id : undefined);
      content.querySelector(`[data-history-peek="${id}"]`).focus({ preventScroll: true });
    }
  });
  document.addEventListener('noir:locale-changed', () => {
    fingerprint = '';
    if (route.page !== 'game') showRoute(route);
  });
  window.addEventListener('pagehide', () => {
    guideMenu.suspend();
    historyViewport?.destroy();
    historyViewport = null;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && route.page === 'hand') showRoute(route);
  });
  return {
    refresh,
    route: () => ({ ...route }),
    initialize: () => navigation.initialize(),
    show: () => navigate({ page: 'list' }),
  };
}
