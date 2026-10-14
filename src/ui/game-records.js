import { currentPots } from '../engine/poker.js';
import { compactActionAmounts } from '../engine/chip-format.js';
import { createReviewInput } from '../review/analysis.js';
import { formatChips, getLocale, setLocalizedHTML, setLocalizedText } from '../i18n/index.js';
import { renderCard } from './cards.js';
import { createActivityFormatter } from './activity.js';
import { preparePortraits } from './portraits.js';
import { createSnapshotSurface } from './table-scene.js';
import { createSettlementLayout } from './settlement-layout.js';
import { createPlayViewport } from './play-viewport.js';

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
const date = (value) =>
  new Intl.DateTimeFormat(getLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
export const recordRetryLabel = (attempt) => (attempt ? `重打${attempt}` : '');
const attemptLabel = recordRetryLabel;

export function recordOutcome(attempt) {
  if (attempt.status === 'unfinished') return '未完成';
  if (attempt.status !== 'completed') return '进行中';
  if (attempt.profit === 0) return '';
  if (attempt.wonPot && attempt.profit < 0) return '获得部分底池 · 净亏损';
  if (attempt.wonPot) return '赢';
  return attempt.profit < 0 ? '输' : '';
}

export function recordsRoute(hash) {
  if (hash === '#records') return { page: 'list' };
  if (!hash.startsWith('#records/')) return { page: 'game' };
  try {
    return { page: 'hand', id: decodeURIComponent(hash.slice('#records/'.length)) };
  } catch {
    return { page: 'list' };
  }
}

function handItem(attempt) {
  const complete = attempt.status === 'completed',
    element = complete ? 'button' : 'div';
  return `<${element} class="record-hand record-attempt ${attempt.superseded ? 'record-superseded' : ''}" ${complete ? `data-record-hand="${escape(attempt.id)}"` : ''} data-record-id="${escape(attempt.id)}" data-status="${attempt.status}" data-hand="${attempt.hand}" data-attempt="${attempt.attempt}" data-superseded="${attempt.superseded}">
    <span class="record-hand-cards record-cards" aria-label="你的底牌">${attempt.hole.map((c) => renderCard(c, { small: true })).join('')}</span>
    <span class="record-hand-info"><strong>第 ${attempt.hand} 手</strong><span class="record-hand-tags">${attempt.attempt ? `<span class="record-tag record-retry">${attemptLabel(attempt.attempt)}</span>` : ''}${attempt.refill ? '<span class="record-tag record-refill">补码</span>' : ''}${attempt.superseded ? '<span class="record-tag">已被重打替代</span>' : ''}</span></span>
    <span class="record-hand-result ${complete && attempt.profit < 0 ? 'negative' : complete && attempt.profit > 0 ? 'positive' : ''}"><strong>${complete ? change(attempt.profit) : '—'}</strong>${recordOutcome(attempt) ? `<span>${recordOutcome(attempt)}</span>` : ''}</span>
    ${complete ? '<span class="record-hand-arrow" aria-hidden="true">›</span>' : ''}
  </${element}>`;
}

function sessionItem(session, expanded) {
  return `<article class="record-session" data-session-id="${escape(session.id)}" data-session-number="${session.number}">
    <button class="record-session-heading" data-record-session="${escape(session.id)}" aria-expanded="${expanded}" aria-controls="record-session-${escape(session.id)}">
      <span class="record-session-title"><strong>第 ${session.number} 局</strong><span>${escape(date(session.startedAt))}</span>${session.endedAt ? '' : '<span class="record-tag record-current">当前局</span>'}</span>
      <span class="record-session-stats"><span><small>胜率</small><strong>${session.completed ? Math.round((session.wins / session.completed) * 100) + '%' : '—'}</strong></span><span><small>净筹码变化</small><strong class="${session.profit < 0 ? 'negative' : session.profit > 0 ? 'positive' : ''}">${change(session.profit)}</strong></span><span><small>起始大小盲</small><strong>${formatChips(session.stakes.smallBlind)} / ${formatChips(session.stakes.bigBlind)}</strong></span><span><small>牌桌人数</small><strong>${session.playerCount} 人</strong></span></span>
      <span class="record-session-chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="record-session-hands" id="record-session-${escape(session.id)}" ${expanded ? '' : 'hidden'}>${session.attempts.map(handItem).join('') || '<p class="records-empty">这一局还没有对局记录。</p>'}</div>
  </article>`;
}

function historicalPots(snapshot) {
  const details = currentPots(snapshot);
  return `<section id="history-pot-settlement" class="records-settlement" aria-label="底池结算"><h2>底池结算</h2>${details.pots.map((pot) => `<div class="record-pot"><div><strong>${escape(pot.label)}</strong><span>${formatChips(pot.amount)}</span></div><ul>${pot.awards.map((award) => `<li><span>${escape(snapshot.players[award.id].name)}<small>${escape(award.label)}</small></span><strong>+${formatChips(award.amount)}</strong></li>`).join('')}</ul></div>`).join('')}${details.refunds.map((refund) => `<p class="record-refund">${escape(snapshot.players[refund.id].name)} · 未跟注退回 ${formatChips(refund.amount)}</p>`).join('')}</section>`;
}

export function createGameRecordsView({ records, openReview, onReturnGame }) {
  const liveMain = document.querySelector('main.main'),
    page = document.querySelector('#records-page'),
    content = document.querySelector('#records-content'),
    title = document.querySelector('#records-title'),
    menu = document.querySelector('#guide-menu'),
    trigger = document.querySelector('#rules-button'),
    error = document.querySelector('#records-storage-error'),
    motion = matchMedia('(prefers-reduced-motion: reduce)');
  const expanded = new Set(),
    visible = new Set();
  let route = { page: 'game' },
    listScroll = 0,
    fingerprint = '',
    archive = null,
    rotating = null,
    rotation = 0,
    hover = false,
    focus = false,
    historyViewport = null,
    defaultCurrent = null;

  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    updateRotation();
  }
  function updateRotation() {
    clearInterval(rotating);
    rotating = null;
    if (hover || focus || !menu.hidden || motion.matches || document.hidden) return;
    rotating = setInterval(() => {
      rotation = 1 - rotation;
      trigger.dataset.label = rotation ? 'records' : 'guide';
      for (const label of trigger.querySelectorAll('[data-guide-label]'))
        label.setAttribute(
          'aria-hidden',
          String(label.dataset.guideLabel !== (rotation ? 'records' : 'guide')),
        );
    }, 5000);
  }
  function navigate(next) {
    const hash =
      next.page === 'game'
        ? ''
        : next.page === 'list'
          ? '#records'
          : '#records/' + encodeURIComponent(next.id);
    if (location.hash === hash) return;
    history.pushState({ noirRecords: next }, '', location.pathname + location.search + hash);
    showRoute(next);
  }
  function renderList(force = false) {
    const sessions = records.sessions();
    const next =
      JSON.stringify(
        sessions.map((session) => [
          session.id,
          session.endedAt,
          session.profit,
          session.wins,
          session.completed,
          session.attempts.map((attempt) => [
            attempt.id,
            attempt.status,
            attempt.superseded,
            attempt.profit,
          ]),
        ]),
      ) + getLocale();
    if (!force && fingerprint === next) return;
    fingerprint = next;
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
  function renderArchive() {
    if (!archive) return;
    const snapshot = archive.snapshot,
      formatter = createActivityFormatter(snapshot.players);
    setLocalizedHTML(
      content,
      `<div id="history-page"><div class="records-history-heading"><button id="history-back-button" class="records-back" data-records-back>‹ 返回对局记录</button><span class="record-tag">历史记录</span><span class="records-history-result">${recordOutcome(archive) ? recordOutcome(archive) + ' · ' : ''}${change(archive.profit)}</span></div><div class="main records-history-grid"><section class="game-column"><div class="records-surface-slot"></div>${historicalPots(snapshot)}</section><aside class="sidebar"><section class="activity-card records-activity"><div class="section-title"><h2>本局动态</h2><span class="subtle-label">FINISHED</span></div><ol class="activity-list" aria-label="本手动态，按时间顺序排列">${snapshot.logs
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
      .sessions()
      .find((entry) => entry.attempts.some((attempt) => attempt.id === archive.id));
    const surface = createSnapshotSurface(liveMain.querySelector('.game-surface'), snapshot, {
      sessionNumber: session.number,
      visible,
    });
    content.querySelector('.records-surface-slot').replaceWith(surface);
    const layout = createSettlementLayout(surface.querySelector('.arena'), { observe: false });
    historyViewport = createPlayViewport(surface, {
      layout: layout.update,
      getSurfaceTop: () =>
        document.querySelector('.header').getBoundingClientRect().bottom +
        window.scrollY +
        parseFloat(getComputedStyle(liveMain).paddingTop),
    });
    historyViewport.update(snapshot, true);
    preparePortraits(content);
  }
  function showRoute(next) {
    if (route.page === 'list' && next.page !== 'list') listScroll = window.scrollY;
    route = next;
    closeMenu();
    liveMain.hidden = route.page !== 'game';
    page.hidden = route.page === 'game';
    document.body.dataset.recordsPage = route.page;
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
        route = { page: 'list' };
        history.replaceState(
          { noirRecords: route },
          '',
          location.pathname + location.search + '#records',
        );
      }
    }
    if (route.page === 'hand') {
      const session = records
        .sessions()
        .find((session) => session.attempts.some((attempt) => attempt.id === archive.id));
      setLocalizedHTML(
        title,
        `第 ${session.number} 局 · 第 ${archive.hand} 手${archive.attempt ? ` · <span class="record-tag record-retry">${attemptLabel(archive.attempt)}</span>` : ''}`,
      );
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
    title.focus({ preventScroll: true });
    refresh();
  }
  function refresh() {
    const message = records.error();
    error.hidden = !message;
    if (message) setLocalizedText(error, message);
    if (route.page === 'list') renderList();
  }

  trigger.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
    updateRotation();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
    updateRotation();
  });
  const wrapper = trigger.closest('.guide-menu');
  wrapper.addEventListener('pointerenter', () => {
    hover = true;
    updateRotation();
  });
  wrapper.addEventListener('pointerleave', () => {
    hover = false;
    updateRotation();
  });
  wrapper.addEventListener('focusin', () => {
    focus = true;
    updateRotation();
  });
  wrapper.addEventListener('focusout', () =>
    queueMicrotask(() => {
      focus = wrapper.contains(document.activeElement);
      updateRotation();
    }),
  );
  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) closeMenu();
  });
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('button')],
      index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      trigger.focus();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      buttons[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ].focus();
    }
  });
  document.querySelector('#guide-menu-item').addEventListener('click', () => {
    closeMenu();
    document.querySelector('#rules-dialog').showModal();
  });
  document
    .querySelector('#records-menu-item')
    .addEventListener('click', () => navigate({ page: 'list' }));
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
      document.getElementById('record-session-' + id).hidden = !expanded.has(id);
    } else if (button.dataset.recordHand) navigate({ page: 'hand', id: button.dataset.recordHand });
    else if (button.hasAttribute('data-records-back')) navigate({ page: 'list' });
    else if (button.id === 'history-review-button')
      openReview(createReviewInput(archive.snapshot), 'history:' + archive.id);
    else if (button.hasAttribute('data-history-pots'))
      content
        .querySelector('.records-settlement')
        .scrollIntoView({ block: 'start', behavior: 'smooth' });
    else if (button.dataset.historyPeek) {
      const id = Number(button.dataset.historyPeek);
      if (visible.has(id)) visible.delete(id);
      else visible.add(id);
      renderArchive();
      content.querySelector(`[data-history-peek="${id}"]`).focus({ preventScroll: true });
    }
  });
  window.addEventListener('popstate', () => showRoute(recordsRoute(location.hash)));
  window.addEventListener('hashchange', () => {
    const next = recordsRoute(location.hash);
    if (JSON.stringify(next) !== JSON.stringify(route)) showRoute(next);
  });
  document.addEventListener('noir:locale-changed', () => {
    fingerprint = '';
    if (route.page !== 'game') showRoute(route);
  });
  document.addEventListener('visibilitychange', updateRotation);
  motion.addEventListener('change', updateRotation);
  window.addEventListener('pagehide', () => {
    clearInterval(rotating);
    historyViewport?.destroy();
    historyViewport = null;
  });
  updateRotation();
  return {
    refresh,
    route: () => ({ ...route }),
    initialize: () => showRoute(recordsRoute(location.hash)),
    show: () => navigate({ page: 'list' }),
  };
}
