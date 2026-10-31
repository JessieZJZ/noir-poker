import { localizeText, formatChips } from '../i18n/index.js';
import {
  PREMIUM_DELAY_MS,
  PREMIUM_DURATION_MS,
  REBUY_DURATION_MS,
  CROWN_FLIGHT_MS,
  CONFETTI_DURATION_MS,
  FAREWELL_DURATION_MS,
  premiumSparks,
  confettiPieces,
  refillCountValues,
  REFILL_COUNT_STEPS,
} from './effect-layouts.js';
import { TROPHY_MARKUP } from './table-scene.js';
import { standingLabel } from '../engine/game-records.js';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Presentation only: every effect is cancelled by `cancel()`, which the table
// calls for the next hand, a retry and a reset, so no effect outlives its hand.
export function createGameEffects() {
  const timers = new Set(),
    nodes = new Set();
  const later = (fn, ms) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };
  const mount = (parent, html, className) => {
    const node = document.createElement('div');
    node.className = className;
    node.innerHTML = html;
    parent.append(node);
    nodes.add(node);
    return node;
  };
  const unmount = (node) => {
    node.remove();
    nodes.delete(node);
  };
  return {
    cancel() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const node of nodes) node.remove();
      nodes.clear();
      document.querySelector('.hero-cards-wrap')?.classList.remove('premium-start');
      const stack = document.querySelector('#hero-stack');
      stack?.classList.remove('stack-refill');
      stack?.style.removeProperty('--refill-width');
    },
    premiumStart(wrap) {
      later(() => {
        wrap.classList.add('premium-start');
        const sparks = reducedMotion()
          ? null
          : mount(
              wrap,
              premiumSparks()
                .map((spark) => `<span class="premium-spark" style="${spark.style}"></span>`)
                .join(''),
              'premium-sparks',
            );
        later(() => {
          wrap.classList.remove('premium-start');
          if (sparks) unmount(sparks);
        }, PREMIUM_DURATION_MS);
      }, PREMIUM_DELAY_MS);
    },
    // Count the refilled stack up from zero under a rising "+amount" while the
    // next hand is already being played. The stack keeps the width of its
    // widest value, so the name row beside it does not move.
    rebuy(anchor, stack, { added, target }, done) {
      const values = refillCountValues(target);
      stack.classList.add('stack-refill');
      stack.style.removeProperty('--refill-width');
      let widest = 0;
      for (const value of [0, ...values]) {
        stack.textContent = formatChips(value);
        // Layout width, unaffected by the pill's scale animation.
        widest = Math.max(widest, stack.offsetWidth);
      }
      stack.style.setProperty('--refill-width', `${Math.ceil(widest)}px`);
      stack.textContent = formatChips(0);
      const burst = mount(anchor, `+${formatChips(added)}`, 'rebuy-burst');
      values.forEach((value, index) =>
        later(
          () => (stack.textContent = formatChips(value)),
          Math.round((REBUY_DURATION_MS * 0.7 * (index + 1)) / REFILL_COUNT_STEPS),
        ),
      );
      later(() => {
        unmount(burst);
        stack.classList.remove('stack-refill');
        stack.style.removeProperty('--refill-width');
        done();
      }, REBUY_DURATION_MS);
    },
    // The trophy rises at the centre and flies onto the champion's resting
    // trophy. The hero's own championship adds confetti from both screen edges.
    coronation({ target, caption, confetti, done }) {
      const rect = target?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 - innerWidth / 2 : 0,
        y = rect ? rect.top + rect.height / 2 - innerHeight * 0.45 : 0,
        scale = rect ? rect.height / 100 : 0.4;
      if (confetti && !reducedMotion()) {
        const layer = mount(
          document.body,
          confettiPieces()
            .map((piece) => `<span class="confetti-piece" style="${piece.style}"></span>`)
            .join(''),
          'confetti-layer',
        );
        later(() => unmount(layer), CONFETTI_DURATION_MS);
      }
      if (reducedMotion()) {
        done();
        return;
      }
      const stage = mount(
        document.body,
        `<div class="trophy-stage-rays"></div><div class="trophy-flight" style="--trophy-x:${Math.round(x)}px;--trophy-y:${Math.round(y)}px;--trophy-scale:${scale.toFixed(3)}">${TROPHY_MARKUP}</div><div class="trophy-caption">${localizeText(caption)}</div>`,
        'trophy-stage',
      );
      stage.setAttribute('aria-hidden', 'true');
      later(() => {
        unmount(stage);
        done();
      }, CROWN_FLIGHT_MS);
    },
    // The hero is out and nobody is crowned: a grey card at the table's
    // centre gives the final place.
    farewell(parent, place) {
      const stage = mount(
        parent,
        `<div class="farewell-card"><span class="farewell-ring"></span><span class="farewell-title">${localizeText('很遗憾，本局结束')}</span><strong class="farewell-place">${localizeText(standingLabel(place))}</strong><span class="farewell-note">${localizeText('补码次数已用完')}</span></div>`,
        'farewell-stage',
      );
      stage.setAttribute('role', 'status');
      later(() => unmount(stage), FAREWELL_DURATION_MS);
    },
  };
}
