import { formatChips, setLocalizedHTML } from '../i18n/index.js';
import { explainOpponent } from '../review/opponents.js';
import { getBotProfile } from '../engine/bot-profiles.js';
import { actionLabel, STREET_NAMES } from '../review/analysis.js';
import { reviewPlayerLabel } from './review-label.js';
import { renderReviewParagraphs } from './review-matchups.js';
const esc = (v) =>
  String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const n = (v) => formatChips(Math.round(v));
export function createOpponentReview({ card, onSelection = () => {} }) {
  const panel = document.querySelector('#review-opponents');
  const explanations = new WeakMap();
  let records = [],
    identities = [],
    selected = 0,
    filter = 'all';
  const step = (r) => ({ ...r.trace.view, action: r.action, amount: r.amount });
  const visibleRecords = () => records.filter((r) => filter === 'all' || r.id === Number(filter));
  function renderSelection() {
    const visible = visibleRecords();
    selected = Math.max(0, Math.min(selected, visible.length - 1));
    panel.querySelectorAll('[data-opponent-index]').forEach((button, i) => {
      button.classList.toggle('selected', i === selected);
      button.setAttribute('aria-current', i === selected ? 'step' : 'false');
    });
    const record = visible[selected];
    onSelection(
      record
        ? { actorId: record.id, sequence: record.sequence }
        : { actorId: null, sequence: null },
    );
    setLocalizedHTML(
      panel.querySelector('#review-opponent-detail'),
      record
        ? detail(record)
        : '<p class="review-empty">本手没有机器人决策记录。无法还原的行为不会编造理由；下一手会记录实际判断。</p>',
    );
  }
  function render() {
    const visible = visibleRecords();
    selected = Math.min(selected, Math.max(0, visible.length - 1));
    const players = [
      ...new Map(
        records.map((r) => [
          r.id,
          {
            name: r.name,
            profile: r.trace.profileName,
            named: !!getBotProfile(r.trace.profile).research,
          },
        ]),
      ).entries(),
    ];
    setLocalizedHTML(
      panel,
      `<div class="review-opponent-heading"><label>查看对手<select id="review-opponent-filter"><option value="all">全部对手</option>${players.map(([id, player]) => `<option value="${id}">${esc(player.name)}${player.named && player.profile ? `，${esc(reviewPlayerLabel(player.profile))}` : ''}</option>`).join('')}</select></label></div><div class="review-layout"><nav aria-label="对手决策时间线"><div class="review-timeline-title"><strong>对手的实际行动</strong><span>${visible.length} 次</span></div><div class="review-timeline">${visible.map((r, i) => `<button class="review-step ${i === selected ? 'selected' : ''}" data-opponent-index="${i}" aria-current="${i === selected ? 'step' : 'false'}"><span class="review-step-number">${i + 1}</span><span><small>${esc(r.name)}，${STREET_NAMES[r.trace.view.street]}</small><strong>${actionLabel(step(r))}</strong></span></button>`).join('')}</div></nav><div id="review-opponent-detail"></div></div>`,
    );
    panel
      .querySelector('.review-layout')
      .classList.toggle('has-horizontal-review', visible.length > 2);
    panel.querySelector('.review-timeline').classList.toggle('has-overflow', visible.length > 2);
    renderSelection();
    const select = panel.querySelector('select');
    select.value = filter;
    select.onchange = () => {
      filter = select.value;
      selected = 0;
      render();
    };
  }
  function detail(r) {
    const v = r.trace.view,
      e = explanations.get(r) || explainOpponent(r, identities);
    explanations.set(r, e);
    return `<div class="review-detail-header"><h3>${esc(r.name)}，${STREET_NAMES[v.street]}</h3></div><div class="review-scene"><div class="review-card-rows"><div class="review-card-group"><span>${esc(r.name)} 当时的底牌</span><div class="review-cards">${v.hole.map((c) => card(c, { small: true })).join('')}</div></div><div class="review-card-group"><span>当时的公共牌</span><div class="review-cards">${v.board.length ? v.board.map((c) => card(c, { small: true })).join('') : '<span class="review-no-board">公共牌尚未发出</span>'}</div></div></div><div class="review-scene-meta"><div><span>位置</span><strong>${v.position}</strong></div><div><span>当时底池</span><strong>${n(v.pot)}</strong></div><div><span>剩余筹码</span><strong>${n(v.stack)}</strong></div></div></div><div class="review-explanation opponent-reason">${renderReviewParagraphs(e.paragraphs || [e.detail], e.matchups, v.street, e.paragraphParts)}${e.reasons.map((s) => `<p>${esc(s)}</p>`).join('')}</div>`;
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opponent-index]');
    if (!b) return;
    selected = Number(b.dataset.opponentIndex);
    renderSelection();
  });
  document.addEventListener('noir:locale-changed', render);
  return {
    update(input) {
      records = input.opponents || [];
      identities =
        input.players ||
        records.map(({ id, name, trace }) => ({
          id,
          name,
          botProfile: trace.profile,
          position: trace.view.position,
        }));
      selected = 0;
      filter = 'all';
      render();
    },
  };
}
