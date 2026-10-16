import { formatChips, setLocalizedText, setLocalizedHTML } from '../i18n/index.js';
import {
  createReviewInput,
  actionLabel,
  STREET_NAMES,
  analyzeDecision,
  summarizeReview,
} from '../review/analysis.js';
import { createOpponentReview } from './opponent-review.js';
import { selectedActivity } from '../review/activity.js';
import { renderReviewParagraphs } from './review-matchups.js';
import { renderActivityParts } from './activity.js';
const $ = (selector) => document.querySelector(selector),
  format = (n) => formatChips(Math.round(n));
const statusNames = { attention: '重点改进', consider: '值得讨论', sound: '有合理依据' };

export function createReviewController({ card }) {
  let last = null,
    live = null,
    historical = false,
    seen = '',
    worker = null,
    job = 0,
    selected = 0,
    selectionTouched = false,
    timelineKey = '';
  const dialog = $('#review-dialog');
  let opponentPerspective = false,
    opponentSelection = { actorId: null, sequence: null };
  function renderActivity() {
    if (!last) return;
    const selection = opponentPerspective
      ? opponentSelection
      : { actorId: 0, sequence: last.input.decisions[selected]?.history.length + 1 };
    setLocalizedHTML(
      $('#review-activity-list'),
      selectedActivity(last.input, selection.actorId, selection.sequence)
        .map(
          (event) =>
            `<li class="${event.emphasized ? 'review-activity-emphasis' : ''} ${event.current ? 'review-activity-current' : ''}" ${event.current ? 'aria-current="step"' : ''}>${event.parts ? renderActivityParts(event.parts) : esc(event.text)}</li>`,
        )
        .join(''),
    );
  }
  const opponents = createOpponentReview({
    card,
    onSelection(selection) {
      opponentSelection = selection;
      renderActivity();
    },
  });
  function perspective(opponent) {
    opponentPerspective = opponent;
    renderActivity();
    $('#review-hero-tab').setAttribute('aria-selected', String(!opponent));
    $('#review-opponents-tab').setAttribute('aria-selected', String(opponent));
    $('#review-hero-panel').hidden = opponent;
    $('#review-opponents').hidden = !opponent;
    setLocalizedText(
      dialog.querySelector('.review-scope'),
      '按当时信息判断，单手输赢不直接决定操作好坏。',
    );
  }
  $('#review-hero-tab').onclick = () => perspective(false);
  $('#review-opponents-tab').onclick = () => perspective(true);
  dialog.querySelector('.review-tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const opponent =
      e.key === 'End' ||
      (e.key !== 'Home' && $('#review-hero-tab').getAttribute('aria-selected') === 'true');
    perspective(opponent);
    $(opponent ? '#review-opponents-tab' : '#review-hero-tab').focus();
  });
  const esc = (v) =>
    String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const coachingStatus = (r) =>
    r?.coaching
      ? { improve: 'consider', value: 'consider', keep: 'sound', compare: 'consider' }[
          r.coaching.kind
        ]
      : r?.status;
  function renderDialog() {
    if (!last) return;
    dialog.dataset.analysisStatus = last.status;
    const input = last.input,
      steps = input.decisions,
      analysis = last.analysis,
      decision = steps[selected],
      result = analysis?.steps[selected] || last.partial?.[selected];
    setLocalizedText($('#review-dialog-title'), '第 ' + input.hand + ' 手，决策复盘');
    setLocalizedText(
      $('#review-result-change'),
      input.outcome.profit < 0
        ? format(input.outcome.profit) + ' 筹码'
        : input.outcome.profit > 0
          ? '+' + format(input.outcome.profit) + ' 筹码'
          : '0 筹码',
    );
    setLocalizedText(
      $('#review-result-context'),
      analysis?.overview.settlement ||
        (input.outcome.folded
          ? '本手已弃牌'
          : input.outcome.wonPot
            ? input.outcome.profit < 0
              ? '获得部分底池，整手净亏损'
              : '本手获得底池'
            : '本手未获得底池'),
    );
    setLocalizedText(
      $('#review-analysis-state'),
      last.status === 'error'
        ? '分析未完成，可以重试。'
        : analysis
          ? ''
          : last.status === 'running'
            ? '正在分析决策 ' + last.progress + ' / ' + steps.length + '…'
            : '正在准备这手的决策快照…',
    );
    dialog.querySelector('.review-analysis-status').hidden = !!analysis;
    $('#review-retry').hidden = last.status !== 'error';
    const timeline = $('#review-timeline'),
      sameHand = timelineKey === last.key,
      scrollLeft = sameHand ? timeline.scrollLeft : 0,
      scrollTop = sameHand ? timeline.scrollTop : 0,
      focusedIndex = timeline.contains(document.activeElement)
        ? document.activeElement.dataset.reviewIndex
        : null;
    setLocalizedHTML(
      timeline,
      steps
        .map((s, i) => {
          const r = analysis?.steps[i] || last.partial?.[i],
            status = coachingStatus(r);
          return `<button class="review-step ${selected === i ? 'selected' : ''}" data-review-index="${i}" aria-current="${selected === i ? 'step' : 'false'}"><span class="review-step-number">${i + 1}</span><span><small>${STREET_NAMES[s.street]}，${s.position}</small><strong>${actionLabel(s)}</strong></span>${r?.coaching.kind === 'keep' ? '' : `<span class="review-status ${status || 'pending'}">${r?.coaching.label || (status ? statusNames[status] : '待分析')}</span>`}</button>`;
        })
        .join(''),
    );
    timeline.classList.toggle('has-overflow', steps.length > 2);
    timeline.closest('.review-layout').classList.toggle('has-horizontal-review', steps.length > 2);
    timelineKey = last.key;
    timeline.scrollTo({ left: scrollLeft, top: scrollTop });
    if (focusedIndex !== null)
      timeline
        .querySelector(`[data-review-index="${focusedIndex}"]`)
        ?.focus({ preventScroll: true });
    setLocalizedText($('#review-step-count'), steps.length + ' 次行动');
    $('#review-empty').hidden = !!decision;
    $('#review-detail').hidden = !decision;
    renderActivity();
    if (!decision) return;
    setLocalizedText(
      $('#review-detail-title'),
      '第 ' + (selected + 1) + ' 步，' + STREET_NAMES[decision.street],
    );
    setLocalizedText(
      $('#review-selected-status'),
      result?.coaching.label || (result ? statusNames[result.status] : '分析中'),
    );
    $('#review-selected-status').className =
      'review-status ' + (coachingStatus(result) || 'pending');
    setLocalizedHTML(
      $('#review-hole'),
      decision.hole.map((c) => card(c, { small: true })).join(''),
    );
    setLocalizedHTML(
      $('#review-board'),
      decision.board.length
        ? decision.board.map((c) => card(c, { small: true })).join('')
        : '<span class="review-no-board">公共牌尚未发出</span>',
    );
    setLocalizedText($('#review-position'), decision.position);
    setLocalizedText($('#review-pot'), format(decision.pot));
    setLocalizedText($('#review-stack'), format(decision.stack));
    setLocalizedHTML(
      $('#review-coach-explanation'),
      renderReviewParagraphs(
        result?.coaching.paragraphs || ['正在比较当时的合法选择…'],
        result?.context.matchups,
        decision.street,
      ),
    );
    $('#review-practice-focus').hidden = !result || result.coaching.kind === 'keep';
    setLocalizedText($('#review-coach-followup'), result?.coaching.followUp || '');
    setLocalizedHTML(
      $('#review-evidence'),
      result ? result.evidence.map((fact) => `<li>${esc(fact)}</li>`).join('') : '',
    );
  }
  function receive(message, id) {
    if (id !== job || !last) return;
    if (message.type === 'progress') {
      last.progress = message.done;
      if (message.result) {
        (last.partial ||= [])[message.done - 1] = message.result;
        renderDialog();
      }
      setLocalizedText(
        $('#review-analysis-state'),
        '正在分析决策 ' + message.done + ' / ' + message.total + '…',
      );
      return;
    }
    if (message.type === 'complete') {
      last.analysis = message.analysis;
      last.status = 'done';
      if (!selectionTouched) selected = message.analysis.priorityIndex;
      worker?.terminate();
      worker = null;
    } else {
      last.status = 'error';
      worker?.terminate();
      worker = null;
    }
    renderDialog();
  }
  async function fallback(id, input) {
    worker?.terminate();
    worker = null;
    try {
      const steps = [];
      for (const s of input.decisions) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (id !== job) return;
        steps.push(analyzeDecision(s));
        receive(
          {
            type: 'progress',
            done: steps.length,
            total: input.decisions.length,
            result: steps.at(-1),
          },
          id,
        );
      }
      receive({ type: 'complete', analysis: summarizeReview(input, steps) }, id);
    } catch {
      receive({ type: 'error' }, id);
    }
  }
  async function analyze() {
    if (!last || last.status === 'running' || last.analysis) return;
    const id = ++job,
      input = last.input;
    last.status = 'running';
    last.progress = 0;
    renderDialog();
    if (typeof Worker === 'undefined') {
      await fallback(id, input);
      return;
    }
    try {
      worker = new Worker(new URL('../review/worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => receive(e.data, id);
      worker.onerror = (e) => {
        e.preventDefault();
        if (id === job) fallback(id, input);
      };
      // Opponent private traces belong to their own explanation panel only.
      worker.postMessage({
        id,
        input: { hand: input.hand, decisions: input.decisions, outcome: input.outcome },
      });
    } catch {
      await fallback(id, input);
    }
  }
  function open() {
    if (live && last !== live) selectInput(live, false);
    if (!last) return;
    $('#review-activity').open = false;
    opponents.update(last.input);
    renderDialog();
    if (!dialog.open) dialog.showModal();
    analyze();
  }
  function selectInput(entry, archive) {
    worker?.terminate();
    worker = null;
    job++;
    if (last?.status === 'running') last.status = 'idle';
    last = entry;
    historical = archive;
    selected = 0;
    selectionTouched = false;
    $('#review-activity').open = false;
    perspective(false);
    opponents.update(entry.input);
  }
  // An archived review has its own input. A live hand may finish while this
  // dialog is open without replacing the historical decision snapshots.
  function openInput(input, key) {
    if (!input?.outcome || !Array.isArray(input.decisions)) return false;
    selectInput(
      {
        key: 'archive:' + key,
        input: structuredClone(input),
        status: 'idle',
        progress: 0,
        analysis: null,
      },
      true,
    );
    renderDialog();
    if (!dialog.open) dialog.showModal();
    analyze();
    return true;
  }
  dialog.addEventListener('close', () => {
    if (!historical) return;
    worker?.terminate();
    worker = null;
    job++;
    historical = false;
    last = live;
    selected = 0;
    selectionTouched = false;
  });
  $('#review-hand-button').onclick = open;
  $('#review-retry').onclick = analyze;
  dialog.addEventListener('click', (e) => {
    const button = e.target.closest('[data-review-index]');
    if (!button || !last) return;
    const index = Number(button.dataset.reviewIndex);
    if (!Number.isInteger(index) || index < 0 || index >= last.input.decisions.length) return;
    const fromTimeline = $('#review-timeline').contains(button);
    selected = index;
    selectionTouched = true;
    perspective(false);
    renderDialog();
    if (!fromTimeline)
      $('#review-detail-title').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  return {
    openInput,
    update(g, token) {
      const key = token + ':' + g.hand;
      if (g.phase === 'done' && key !== seen) {
        seen = key;
        const input = createReviewInput(g);
        {
          live = { key, input, status: 'idle', progress: 0, analysis: null };
          if (!historical) {
            selectInput(live, false);
            if (dialog.open) {
              renderDialog();
              analyze();
            }
          }
        }
      }
      $('#review-hand-button').hidden = !(g.phase === 'done' && live?.key === key);
    },
    rollback(g, token) {
      const key = token + ':' + g.hand;
      if (live?.key === key) live = null;
      if (!historical && last?.key === key) {
        worker?.terminate();
        worker = null;
        job++;
        last = null;
        selected = 0;
        selectionTouched = false;
      }
      if (seen === key) seen = '';
      if (!historical) dialog.close();
      $('#review-hand-button').hidden = true;
    },
    reset() {
      live = null;
      seen = '';
      if (historical) {
        $('#review-hand-button').hidden = true;
        return;
      }
      worker?.terminate();
      worker = null;
      job++;
      last = null;
      seen = '';
      selected = 0;
      selectionTouched = false;
      perspective(false);
      dialog.close();
      $('#review-hand-button').hidden = true;
    },
  };
}
