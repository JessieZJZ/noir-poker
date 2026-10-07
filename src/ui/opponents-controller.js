import {
  BOT_PROFILES,
  PROFILE_AXES,
  getBotProfile,
  sanitizeBotSettings,
  defaultBotSettings,
  MOOD_LABELS,
} from '../engine/bot-profiles.js';
const STORAGE_KEY = 'noir-opponents-v1';
export function loadBotSettings() {
  try {
    return sanitizeBotSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return defaultBotSettings();
  }
}
export function createOpponentsController({ getGame, getCount, getSettings, onSave }) {
  const dialog = document.querySelector('#opponents-dialog');
  let draft = null,
    selected = 'tan';
  function detail() {
    const profile = getBotProfile(selected);
    document.querySelector('#profile-cards').innerHTML = BOT_PROFILES.map(
      (p) =>
        `<button type="button" class="profile-card ${p.id === selected ? 'selected' : ''}" data-profile-preview="${p.id}" aria-pressed="${p.id === selected}"><strong>${p.short}</strong><span>${p.tag}</span></button>`,
    ).join('');
    document.querySelector('#profile-detail').innerHTML =
      `<div class="profile-detail-heading"><h3>${profile.name}</h3><span>训练原型</span></div><p>${profile.description}</p><div class="profile-axes">${PROFILE_AXES.map((label, i) => `<div><span>${label}</span><meter min="0" max="100" value="${profile.axes[i]}" aria-label="${label}"></meter><strong>${profile.axes[i]}</strong></div>`).join('')}</div><p class="profile-sizing">常用翻后下注：<strong>${Math.round(profile.sizing[0] * 100)}–${Math.round(profile.sizing[1] * 100)}% 池</strong></p><p class="profile-evidence">${profile.evidence}</p><div class="profile-sources">${profile.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>`).join('')}</div>`;
    document.querySelector('#profile-comparison').innerHTML =
      `<table><caption>所有原型的训练参数（0–100）</caption><thead><tr><th scope="col">原型</th>${PROFILE_AXES.map((l) => `<th scope="col">${l}</th>`).join('')}<th scope="col">下注 / 池</th></tr></thead><tbody>${BOT_PROFILES.map((p) => `<tr><th scope="row">${p.short}</th>${p.axes.map((v) => `<td>${v}</td>`).join('')}<td>${Math.round(p.sizing[0] * 100)}–${Math.round(p.sizing[1] * 100)}%</td></tr>`).join('')}</tbody></table>`;
  }
  function roster() {
    const game = getGame(),
      count = getCount();
    const names = ['Mia', 'Alex', 'River', 'Kai', 'Luna', 'Theo', 'Jade', 'Leo'];
    document.querySelector('#opponent-roster').innerHTML = names
      .map((name, i) => {
        const id = i + 1,
          player = game.players[id],
          stats = player?.botStats;
        const ratio = (key) =>
          stats?.hands ? `${Math.round((stats[key] / stats.hands) * 100)}%` : '—';
        const mood =
          player && game.emotionMode !== 'off' ? MOOD_LABELS[player.botMood.kind] : '平稳';
        return `<div class="opponent-row ${id >= count ? 'off-table' : ''}" data-opponent-row="${id}"><div class="opponent-row-title"><strong>${name}</strong><span>${id >= count ? '暂不在桌' : `座位 ${id}`} · ${mood}</span></div><label class="opponent-assignment-label"><span class="sr-only">${name} 的训练风格</span><select data-bot-seat="${id}">${BOT_PROFILES.map((p) => `<option value="${p.id}" ${draft.assignments[id] === p.id ? 'selected' : ''}>${p.short} · ${p.tag.split(' · ')[0]}</option>`).join('')}</select></label><p class="opponent-observed" title="本次练习的机器人已完成手数，换风格后从零累计">${stats?.hands || 0} 手 · VPIP ${ratio('vpip')} · PFR ${ratio('pfr')}</p>${player?.botMood.reason && game.emotionMode !== 'off' ? `<p class="opponent-mood-reason">${player.botMood.reason}</p>` : ''}</div>`;
      })
      .join('');
  }
  function open() {
    draft = sanitizeBotSettings(getSettings());
    document.querySelector('#emotion-mode').value = draft.emotionMode;
    document.querySelector('#opponents-save-note').textContent =
      '设置在下一手开始时生效；重打本手保留原来的对手。';
    detail();
    roster();
    dialog.showModal();
  }
  document.querySelector('#opponents-button').onclick = open;
  document.querySelector('#profile-cards').onclick = (event) => {
    const button = event.target.closest('[data-profile-preview]');
    if (!button) return;
    selected = button.dataset.profilePreview;
    detail();
    document.querySelector(`[data-profile-preview="${selected}"]`).focus({ preventScroll: true });
  };
  document.querySelector('#opponent-roster').onchange = (event) => {
    if (!event.target.matches('[data-bot-seat]')) return;
    draft.assignments[event.target.dataset.botSeat] = event.target.value;
    selected = event.target.value;
    detail();
  };
  document.querySelector('#emotion-mode').onchange = (event) => {
    draft.emotionMode = event.target.value;
  };
  document.querySelector('#mix-opponents').onclick = () => {
    draft.assignments = {
      1: 'tan',
      2: 'st',
      3: 'zang',
      4: 'peter',
      5: 'abao',
      6: 'viktor',
      7: 'jungleman',
      8: 'dwan',
    };
    selected = 'tan';
    detail();
    roster();
  };
  document.querySelector('#save-opponents').onclick = () => {
    const settings = sanitizeBotSettings(draft);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
    onSave(settings);
    dialog.close();
    document.querySelector('#opponents-button').focus({ preventScroll: true });
  };
  return {
    refresh() {
      const game = getGame();
      const named = game.players.slice(1).filter((p) => p.botProfile !== 'balanced').length;
      const pending = sanitizeBotSettings(getSettings());
      const changed =
        game.emotionMode !== pending.emotionMode ||
        game.players.slice(1).some((p) => p.botProfile !== pending.assignments[p.id]);
      document.querySelector('#opponents-summary').textContent = changed
        ? '下手更新'
        : named
          ? `${named} 位风格对手`
          : '自定义';
    },
  };
}
