import { COMPACT_PLAY_QUERY } from './play-geometry.js';
import { profileDetailBounds } from './profile-layout.js';
import { setLocalizedHTML, setLocalizedText } from '../i18n/index.js';
import {
  BOT_PROFILES,
  PROFILE_AXES,
  getBotProfile,
  sanitizeBotSettings,
  defaultBotSettings,
  assignBotSeat,
  toggleMixedLineup,
} from '../engine/bot-profiles.js';
import { portraitContent, preparePortraits } from './portraits.js';
import { playerResearchMarkup } from './player-research.js';
import { preferenceStorage } from '../platform/storage.js';
const STORAGE_KEY = 'noir-opponents-v1';
export function loadBotSettings() {
  try {
    return sanitizeBotSettings(JSON.parse(preferenceStorage.getItem(STORAGE_KEY)));
  } catch {
    return defaultBotSettings();
  }
}
export function createOpponentsController({ getGame, getCount, getSettings, onSave }) {
  const dialog = document.querySelector('#opponents-dialog');
  const stage = document.querySelector('#profile-stage');
  const cards = document.querySelector('#profile-cards');
  const panel = document.querySelector('#profile-detail');
  const body = dialog.querySelector('.opponents-body');
  const compact = window.matchMedia(COMPACT_PLAY_QUERY);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let draft = null,
    selected = 'balanced';
  let detailOpen = false,
    returnProfile = null,
    savedScroll = null,
    reveal = null;

  function markSelection() {
    cards.querySelectorAll('[data-profile-preview]').forEach((button) => {
      const active = button.dataset.profilePreview === selected;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
      if (compact.matches) button.setAttribute('aria-expanded', String(detailOpen && active));
      else button.removeAttribute('aria-expanded');
    });
  }
  function choices() {
    setLocalizedHTML(
      cards,
      BOT_PROFILES.map(
        (p) =>
          `<button type="button" class="profile-card ${p.id === selected ? 'selected' : ''}" data-profile-preview="${p.id}" data-profile-choice="${p.id}" aria-pressed="${p.id === selected}" aria-controls="profile-detail" aria-expanded="false"><span class="profile-portrait" aria-hidden="true">${portraitContent(p.id, p.short.slice(0, 1), p.short)}</span><strong>${p.short}</strong><span class="profile-card-tag">${p.tag}</span></button>`,
      ).join(''),
    );
    markSelection();
    preparePortraits(cards);
  }
  function detail() {
    const profile = getBotProfile(selected);
    panel.dataset.profileId = profile.id;
    setLocalizedHTML(
      panel,
      `<div class="profile-detail-heading"><div class="profile-identity"><span class="profile-portrait" aria-hidden="true">${portraitContent(profile.id, profile.short.slice(0, 1), profile.short)}</span><h3>${profile.name}</h3></div><span class="profile-detail-kind">训练风格</span><button type="button" class="profile-detail-close icon-button" data-close-profile-detail aria-label="关闭风格详细介绍"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div><div class="profile-detail-content"><p>${profile.description}</p><div class="profile-axes">${PROFILE_AXES.map((label, i) => `<div><span>${label}</span><span class="profile-axis-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${profile.axes[i]}" aria-label="${label}" style="--axis-value:${profile.axes[i]}%"></span><strong>${profile.axes[i]}</strong></div>`).join('')}</div><p class="profile-sizing">常用翻后下注：<strong>${Math.round(profile.sizing[0] * 100)}–${Math.round(profile.sizing[1] * 100)}% 池</strong></p>${playerResearchMarkup(profile) || `<p class="profile-evidence">${profile.evidence}</p>`}</div>`,
    );
    const comparison = document.querySelector('#profile-comparison');
    if (comparison)
      setLocalizedHTML(
        comparison,
        `<table><caption>所有风格的训练参数（0–100）</caption><thead><tr><th scope="col">风格</th>${PROFILE_AXES.map((l) => `<th scope="col">${l}</th>`).join('')}<th scope="col">下注 / 池</th></tr></thead><tbody>${BOT_PROFILES.map((p) => `<tr><th scope="row">${p.short}</th>${p.axes.map((v) => `<td>${v}</td>`).join('')}<td>${Math.round(p.sizing[0] * 100)}–${Math.round(p.sizing[1] * 100)}%</td></tr>`).join('')}</tbody></table>`,
      );
    preparePortraits(panel);
  }
  function positionDetail() {
    if (!compact.matches || !detailOpen || !dialog.open) return;
    const region = stage.getBoundingClientRect();
    const viewport = body.getBoundingClientRect();
    const { top, height } = profileDetailBounds({
      region,
      viewport,
      clientHeight: body.clientHeight,
    });
    // Keep the introduction in the currently visible choices area, even when a lower row
    // was clicked. The choices keep their dimensions and the settings body does not move.
    panel.style.setProperty('--profile-detail-top', `${top}px`);
    panel.style.setProperty('--profile-detail-height', `${height}px`);
  }
  function cancelReveal() {
    reveal?.cancel();
    reveal = null;
    panel.classList.remove('is-revealing');
  }
  function closeDetail({ focus = true, restoreScroll = true } = {}) {
    cancelReveal();
    detailOpen = false;
    stage.dataset.detailOpen = 'false';
    cards.inert = false;
    cards.removeAttribute('aria-hidden');
    panel.hidden = compact.matches;
    panel.style.removeProperty('--profile-detail-top');
    panel.style.removeProperty('--profile-detail-height');
    markSelection();
    if (restoreScroll && savedScroll) {
      body.scrollTop = savedScroll.body;
      cards.scrollTop = savedScroll.cards;
    }
    savedScroll = null;
    if (focus && dialog.open && returnProfile)
      cards
        .querySelector(`[data-profile-preview="${returnProfile}"]`)
        ?.focus({ preventScroll: true });
    returnProfile = null;
  }
  function showDetail(button) {
    cancelReveal();
    const origin = button.getBoundingClientRect();
    savedScroll = { body: body.scrollTop, cards: cards.scrollTop };
    returnProfile = button.dataset.profilePreview;
    detailOpen = true;
    stage.dataset.detailOpen = 'true';
    panel.hidden = false;
    panel.scrollTop = 0;
    positionDetail();
    const bounds = panel.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, origin.left + origin.width / 2 - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, origin.top + origin.height / 2 - bounds.top));
    const radius = Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y));
    panel.style.setProperty('--profile-reveal-x', `${x}px`);
    panel.style.setProperty('--profile-reveal-y', `${y}px`);
    cards.inert = true;
    cards.setAttribute('aria-hidden', 'true');
    markSelection();
    panel.querySelector('[data-close-profile-detail]').focus({ preventScroll: true });
    if (!reducedMotion.matches && panel.animate) {
      panel.classList.add('is-revealing');
      reveal = panel.animate(
        [
          { clipPath: `circle(0px at ${x}px ${y}px)` },
          { clipPath: `circle(${radius}px at ${x}px ${y}px)` },
        ],
        { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
      reveal.onfinish = () => {
        reveal = null;
        panel.classList.remove('is-revealing');
      };
    }
  }
  function roster() {
    const mix = document.querySelector('#mix-opponents');
    mix.classList.toggle('selected', draft.mixed);
    mix.setAttribute('aria-pressed', String(draft.mixed));
    const count = getCount();
    const names = ['Mia', 'Alex', 'River', 'Kai', 'Luna', 'Theo', 'Jade', 'Leo'];
    setLocalizedHTML(
      document.querySelector('#opponent-roster'),
      names
        .map((name, i) => {
          const id = i + 1;
          return `<div class="opponent-row ${id >= count ? 'off-table' : ''}" data-opponent-row="${id}"><div class="opponent-row-title"><div class="opponent-row-person"><span class="profile-portrait opponent-portrait" aria-hidden="true">${portraitContent(draft.assignments[id], name.slice(0, 1))}</span><strong>${name}</strong></div><span class="opponent-seat-label">${id >= count ? '暂不在桌' : `座位 ${id}`}</span></div><label class="opponent-assignment-label"><span class="sr-only">${name} 的训练风格</span><select data-bot-seat="${id}">${BOT_PROFILES.map((p) => `<option value="${p.id}" ${draft.assignments[id] === p.id ? 'selected' : ''}>${p.short}</option>`).join('')}</select></label></div>`;
        })
        .join(''),
    );
    preparePortraits(document.querySelector('#opponent-roster'));
  }
  function saveSettings() {
    // Persist only assigned styles and emotion changes; profile previews are informational.
    const settings = sanitizeBotSettings(draft);
    try {
      preferenceStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
    onSave(settings);
    setLocalizedText(
      document.querySelector('#opponents-save-note'),
      '已自动保存；风格与情绪下一手生效。',
    );
  }
  function open() {
    closeDetail({ focus: false, restoreScroll: false });
    draft = sanitizeBotSettings(getSettings());
    document.querySelector('#emotion-mode').value = draft.emotionMode;
    setLocalizedText(document.querySelector('#opponents-save-note'), '设置自动保存在此设备。');
    choices();
    detail();
    roster();
    dialog.showModal();
  }
  document.querySelector('#opponents-button').onclick = open;
  cards.onclick = (event) => {
    const button = event.target.closest('[data-profile-preview]');
    if (!button) return;
    selected = button.dataset.profilePreview;
    detail();
    markSelection();
    if (compact.matches) showDetail(button);
    else button.focus({ preventScroll: true });
  };
  panel.onclick = (event) => {
    if (event.target.closest('[data-close-profile-detail]')) closeDetail();
  };
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !detailOpen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeDetail();
  });
  dialog.addEventListener('cancel', (event) => {
    if (!detailOpen) return;
    event.preventDefault();
    closeDetail();
  });
  dialog.addEventListener('close', () => closeDetail({ focus: false, restoreScroll: false }));
  compact.addEventListener('change', () => {
    const focusWasInDetail = panel.contains(document.activeElement);
    closeDetail({ focus: false, restoreScroll: false });
    if (dialog.open && focusWasInDetail)
      cards.querySelector(`[data-profile-preview="${selected}"]`)?.focus({ preventScroll: true });
  });
  body.addEventListener('scroll', positionDetail, { passive: true });
  document.addEventListener('noir:locale-changed', positionDetail);
  const resizeObserver = new ResizeObserver(positionDetail);
  resizeObserver.observe(body);
  resizeObserver.observe(stage);
  document.querySelector('#opponent-roster').onchange = (event) => {
    if (!event.target.matches('[data-bot-seat]')) return;
    draft = assignBotSeat(draft, Number(event.target.dataset.botSeat), event.target.value);
    const avatar = event.target.closest('.opponent-row').querySelector('.opponent-portrait');
    setLocalizedHTML(
      avatar,
      portraitContent(event.target.value, avatar.parentElement.textContent.trim().slice(0, 1)),
    );
    preparePortraits(avatar);
    closeDetail({ focus: false, restoreScroll: false });
    selected = event.target.value;
    markSelection();
    detail();
    saveSettings();
  };
  document.querySelector('#emotion-mode').onchange = (event) => {
    draft.emotionMode = event.target.value;
    saveSettings();
  };
  document.querySelector('#mix-opponents').onclick = () => {
    closeDetail({ focus: false, restoreScroll: false });
    draft = toggleMixedLineup(draft, getCount());
    markSelection();
    detail();
    roster();
    saveSettings();
  };
  return {
    refresh() {
      const game = getGame();
      const named = game.players.slice(1).filter((p) => p.botProfile !== 'balanced').length;
      const pending = sanitizeBotSettings(getSettings());
      const changed =
        game.emotionMode !== pending.emotionMode ||
        game.players.slice(1).some((p) => p.botProfile !== pending.assignments[p.id]);
      setLocalizedText(
        document.querySelector('#opponents-summary'),
        changed ? '下手生效' : named ? `${named} 位风格对手` : '均衡',
      );
    },
  };
}
