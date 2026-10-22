import { localizeText, formatChips } from '../i18n/index.js';
import {
  PREMIUM_DELAY_MS,
  PREMIUM_DURATION_MS,
  REBUY_DURATION_MS,
  CROWN_FLIGHT_MS,
  CONFETTI_DURATION_MS,
  premiumSparks,
  confettiPieces,
} from './effect-layouts.js';
import { CROWN_MARKUP } from './table-scene.js';
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
  let counting = null;
  return {
    cancel() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const node of nodes) node.remove();
      nodes.clear();
      if (counting) cancelAnimationFrame(counting);
      counting = null;
      document.querySelector('.hero-cards-wrap')?.classList.remove('premium-start');
      document.querySelector('#hero-stack')?.classList.remove('stack-refill');
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
    // Count the refilled stack up from zero under a rising "+amount".
    rebuy(anchor, stack, amount, done) {
      stack.classList.add('stack-refill');
      const burst = mount(anchor, `+${formatChips(amount)}`, 'rebuy-burst');
      const started = performance.now(),
        countFor = REBUY_DURATION_MS * 0.7;
      const step = (now) => {
        const progress = Math.min(1, (now - started) / countFor);
        stack.textContent = formatChips(
          Math.round((amount * (1 - Math.pow(1 - progress, 3))) / 100) * 100,
        );
        counting = progress < 1 ? requestAnimationFrame(step) : null;
      };
      counting = requestAnimationFrame(step);
      later(() => {
        unmount(burst);
        stack.classList.remove('stack-refill');
        done();
      }, REBUY_DURATION_MS);
    },
    // The crown rises at the centre and flies onto the champion. The hero's
    // own championship adds confetti from both screen edges.
    coronation({ target, caption, confetti, done }) {
      const rect = target?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 - innerWidth / 2 : 0,
        y = rect ? rect.top + rect.height / 2 - innerHeight * 0.45 : 0,
        scale = rect ? rect.width / 96 : 0.25;
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
        `<div class="crown-rays"></div><div class="crown-flight" style="--crown-x:${Math.round(x)}px;--crown-y:${Math.round(y)}px;--crown-scale:${scale.toFixed(3)}">${CROWN_MARKUP}</div><div class="crown-caption">${localizeText(caption)}</div>`,
        'crown-stage',
      );
      stage.setAttribute('aria-hidden', 'true');
      later(() => {
        unmount(stage);
        done();
      }, CROWN_FLIGHT_MS);
    },
  };
}
