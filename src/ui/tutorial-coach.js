import { COMPACT_PLAY_QUERY } from './play-geometry.js';
import { setLocalizedHTML, setLocalizedText } from '../i18n/index.js';

const $ = (selector) => document.querySelector(selector);
const FOCUS_TARGETS = {
  'hero-cards': '.hero-cards-wrap',
  position: '#hero-position',
  stack: '#hero-stack',
  pot: '.pot',
  board: '#board',
  call: '#call-button',
  fold: '#fold-button',
  raise: '#raise-button',
  half: '[data-preset="half"]',
  rankings: '#hand-rankings-button',
  details: '#pot-details-button',
  finish: '#continue-deal-button',
};
const focusTarget = (key) =>
  key.startsWith('seat:')
    ? $(`.seat-${key.slice(5)} .seat-profile`)
    : $(`.main ${FOCUS_TARGETS[key]}`);
const items = (values, render) => values.map(render).join('');
const escape = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Presents the shared tutorial view on the real table. Buttons stay the table's
// own; this only spotlights them and disables whatever the lesson is not teaching.
export function createTutorialCoach({ onNext, onAnswer, onPrimary, onSecondary, onExit }) {
  const panel = $('#tutorial-coach'),
    dialog = $('#tutorial-dialog'),
    compact = matchMedia(COMPACT_PLAY_QUERY),
    portrait = matchMedia('(orientation: portrait)'),
    surfaceHome = $('.main .action-dock-slot');
  let dialogKey = null,
    optionsKey = null,
    shownText = null,
    closing = false;

  // Phones spend height on the panel; wide windows have width to spare, and the
  // practice column now starts below the first screen.
  function place() {
    if (compact.matches) surfaceHome.before(panel);
    else $('.main > .game-column').after(panel);
  }
  function clearFocus() {
    for (const element of document.querySelectorAll('[data-tutorial-focus]'))
      delete element.dataset.tutorialFocus;
  }
  function applyGate({ allowed, raiseTarget }, bet) {
    const action = allowed?.action;
    const guided = allowed !== null;
    if (!guided) {
      $('#continue-deal-button').classList.remove('tutorial-locked');
      return;
    }
    for (const button of [$('#fold-button'), $('#call-button'), $('#raise-button')])
      button.disabled = true;
    if (action === 'fold') $('#fold-button').disabled = false;
    if (action === 'call' || action === 'check') $('#call-button').disabled = false;
    $('#bet-slider').disabled = true;
    for (const button of document.querySelectorAll('[data-preset]'))
      button.disabled = action !== 'raise' || button.dataset.preset !== allowed.preset;
    if (action === 'raise') $('#raise-button').disabled = bet !== raiseTarget;
    $('#continue-deal-button').classList.toggle('tutorial-locked', action !== 'finish');
  }
  function renderOptions(options) {
    const box = $('#tutorial-options');
    box.hidden = !options.length;
    const key = JSON.stringify(options);
    if (key === optionsKey) return;
    optionsKey = key;
    setLocalizedHTML(
      box,
      items(
        options,
        (option) =>
          `<button data-tutorial-answer="${option.index}" class="${option.wrong ? 'is-wrong' : ''}">${escape(option.text)}</button>`,
      ),
    );
  }
  function renderDialog(view) {
    const copy = view.dialog;
    if (!copy) {
      dialogKey = null;
      if (dialog.open) {
        closing = true;
        dialog.close();
      }
      return;
    }
    const key = view.stage + ':' + copy.title;
    if (key === dialogKey && dialog.open) return;
    dialogKey = key;
    $('#tutorial-dialog-eyebrow').textContent = copy.eyebrow;
    setLocalizedText($('#tutorial-dialog-title'), copy.title);
    setLocalizedText($('#tutorial-dialog-lead'), copy.lead);
    const steps = $('#tutorial-dialog-steps'),
      points = $('#tutorial-dialog-points'),
      note = $('#tutorial-dialog-note');
    steps.hidden = !copy.steps;
    setLocalizedHTML(
      steps,
      items(
        copy.steps || [],
        (step) =>
          `<li><strong>${escape(step.title)}</strong><span>${escape(step.text)}</span></li>`,
      ),
    );
    points.hidden = !copy.points;
    setLocalizedHTML(
      points,
      items(copy.points || [], (point) => `<li>${escape(point)}</li>`),
    );
    note.hidden = !copy.note;
    setLocalizedText(note, copy.note || '');
    setLocalizedText($('#tutorial-dialog-primary'), copy.primary);
    setLocalizedText($('#tutorial-dialog-secondary'), copy.secondary);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    $('#tutorial-dialog-primary').focus({ preventScroll: true });
  }

  $('#tutorial-next').addEventListener('click', () => onNext());
  $('#tutorial-exit').addEventListener('click', () => onExit());
  $('#tutorial-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tutorial-answer]');
    if (button) onAnswer(Number(button.dataset.tutorialAnswer));
  });
  $('#tutorial-dialog-primary').addEventListener('click', () => onPrimary());
  $('#tutorial-dialog-secondary').addEventListener('click', () => onSecondary());
  $('#tutorial-dialog-close').addEventListener('click', () => dialog.close());
  // Escape, the backdrop and Android Back all close the dialog. Only the
  // coach's own stage changes are not a request to leave the tutorial.
  dialog.addEventListener('close', () => {
    if (closing) closing = false;
    else if (dialogKey !== null) onExit();
    dialogKey = null;
  });
  compact.addEventListener('change', place);
  // Rotation keeps the old scroll offset, which would leave the panel's text
  // behind the header and only half of the table on the first screen.
  portrait.addEventListener('change', () => {
    if (!panel.hidden) window.scrollTo(0, 0);
  });
  place();

  return {
    update(view, bet) {
      const playing = view.stage !== 'intro';
      if (playing) document.body.dataset.tutorial = view.stage;
      panel.hidden = !playing;
      renderDialog(view);
      if (!playing) return;
      setLocalizedText($('#tutorial-lesson'), view.lessonLabel);
      $('#tutorial-progress-bar').style.width = `${Math.round(view.progress * 100)}%`;
      setLocalizedText($('#tutorial-title'), view.title);
      setLocalizedText($('#tutorial-text'), view.text);
      $('#tutorial-detail').hidden = !view.detail;
      setLocalizedText($('#tutorial-detail'), view.detail || '');
      renderOptions(view.options);
      $('#tutorial-next').hidden = !view.canContinue;
      setLocalizedText($('#tutorial-next'), view.continueLabel);
      const message = panel.querySelector('.tutorial-message');
      if (view.text !== shownText) message.scrollTop = 0;
      shownText = view.text;
      message.classList.toggle('has-more', message.scrollHeight > message.clientHeight + 1);
      clearFocus();
      for (const key of view.focus) {
        const element = focusTarget(key);
        if (element) element.dataset.tutorialFocus = 'true';
      }
      applyGate(view, bet);
    },
    hide() {
      dialogKey = null;
      optionsKey = null;
      if (dialog.open) {
        closing = true;
        dialog.close();
      }
      panel.hidden = true;
      clearFocus();
      delete document.body.dataset.tutorial;
      $('#continue-deal-button').classList.remove('tutorial-locked');
    },
  };
}
