import { createWinRatePage } from './win-rate.js';

// Every menu choice takes a turn in the label, in menu order, and the slot keeps
// the widest one's width while it rolls downward. Hover, keyboard focus, an open
// menu and reduced motion stop the rotation.
export function createGuideMenu({ onRecords, onTutorial }) {
  const trigger = document.querySelector('#rules-button');
  const menu = document.querySelector('#guide-menu');
  const wrapper = trigger.closest('.guide-menu');
  const labels = [...trigger.querySelectorAll('[data-guide-label]')];
  const order = labels.map((label) => label.dataset.guideLabel);
  const choices = [...menu.querySelectorAll('[role="menuitem"]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const winRate = createWinRatePage();
  let interval, animationEnd;
  let suspended = false,
    hovered = false,
    focused = false,
    destroyed = false;
  const on = (target, name, handler) =>
    target.addEventListener(name, handler, { signal: events.signal });

  function finishAnimation() {
    clearTimeout(animationEnd);
    animationEnd = null;
    delete trigger.dataset.animating;
    labels.forEach((label) => label.classList.remove('guide-label-enter', 'guide-label-leave'));
  }
  function setLabel(next, animate = false) {
    finishAnimation();
    const previous = trigger.dataset.label || order[0];
    trigger.dataset.label = next;
    for (const label of labels)
      label.setAttribute('aria-hidden', String(label.dataset.guideLabel !== next));
    if (!animate || motion.matches || previous === next) return;
    trigger.dataset.animating = 'true';
    labels
      .find((label) => label.dataset.guideLabel === previous)
      ?.classList.add('guide-label-leave');
    labels.find((label) => label.dataset.guideLabel === next)?.classList.add('guide-label-enter');
    animationEnd = setTimeout(finishAnimation, 400);
  }
  function updateRotation() {
    clearInterval(interval);
    interval = null;
    if (
      destroyed ||
      suspended ||
      hovered ||
      focused ||
      !menu.hidden ||
      motion.matches ||
      document.hidden
    ) {
      finishAnimation();
      return;
    }
    interval = setInterval(() => {
      const index = order.indexOf(trigger.dataset.label || order[0]);
      setLabel(order[(index + 1) % order.length], true);
    }, 5000);
  }
  function close(restoreFocus = false) {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
    updateRotation();
  }
  function open() {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    updateRotation();
    choices[0]?.focus({ preventScroll: true });
  }
  on(trigger, 'click', () => (menu.hidden ? open() : close(true)));
  on(trigger, 'keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });
  on(wrapper, 'pointerenter', () => {
    hovered = true;
    updateRotation();
  });
  on(wrapper, 'pointerleave', () => {
    hovered = false;
    updateRotation();
  });
  on(wrapper, 'focusin', () => {
    focused = true;
    updateRotation();
  });
  on(wrapper, 'focusout', (event) => {
    if (!wrapper.contains(event.relatedTarget)) {
      focused = false;
      updateRotation();
    }
  });
  on(menu, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') close();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const index = choices.indexOf(document.activeElement);
      choices[(index + direction + choices.length) % choices.length]?.focus({
        preventScroll: true,
      });
    }
  });
  on(document, 'pointerdown', (event) => {
    if (!menu.hidden && !wrapper.contains(event.target)) close();
  });
  on(document, 'keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) close(true);
  });
  function openGuide(section) {
    close();
    const dialog = document.querySelector('#rules-dialog');
    if (!dialog.open) dialog.showModal();
    const body = dialog.querySelector('.guide-body');
    body.scrollTop = 0;
    if (section) {
      const target = dialog.querySelector(`#${section}`);
      target.focus({ preventScroll: true });
      body.scrollTop = target.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
    }
  }
  on(document.querySelector('#guide-menu-item'), 'click', () => openGuide());
  on(document.querySelector('#hand-rankings-button'), 'click', () => openGuide('hand-rankings'));
  on(document.querySelector('#tutorial-menu-item'), 'click', () => {
    close();
    onTutorial();
  });
  on(document.querySelector('#records-menu-item'), 'click', () => {
    close();
    onRecords();
  });
  on(document.querySelector('#win-rate-menu-item'), 'click', () => {
    close();
    winRate.open();
  });
  on(document, 'visibilitychange', updateRotation);
  on(document, 'noir:locale-changed', finishAnimation);
  on(motion, 'change', updateRotation);
  on(window, 'pageshow', () => {
    suspended = false;
    updateRotation();
  });
  setLabel(trigger.dataset.label || order[0]);
  updateRotation();
  return {
    close,
    suspend() {
      suspended = true;
      updateRotation();
    },
    destroy() {
      destroyed = true;
      events.abort();
      clearInterval(interval);
      finishAnimation();
    },
  };
}
