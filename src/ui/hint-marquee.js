import { copyLocalizedText } from '../i18n/index.js';

// Keep one accessible copy of each hint. A second visual copy lets an
// overflowing compact banner loop continuously without jumping back to its start.
export function createHintMarquee(element, textElement, compact) {
  const track = document.createElement('div');
  track.className = 'hint-marquee-track';
  textElement.before(track);
  track.append(textElement);
  const copy = document.createElement('p');
  copy.className = 'hint-marquee-copy';
  copy.setAttribute('aria-hidden', 'true');
  copy.hidden = true;
  track.append(copy);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)'),
    speed = 35,
    pause = 1200,
    gap = 36;
  let active = false,
    frame = null,
    lap = 0,
    position = 0,
    applied = 0,
    start = 0,
    previous = 0,
    hovered = false,
    focused = false,
    touching = false;

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    element.dataset.scrolling = 'false';
  }
  function tick(now) {
    frame = null;
    if (!active || !compact() || motion.matches || lap === 0) return;
    if (!start) start = now;
    const elapsed = Math.min(100, now - (previous || now));
    previous = now;
    if (element.scrollLeft !== applied) position = element.scrollLeft;
    if (now - start >= pause && !hovered && !focused && !touching) {
      position = (position + (elapsed * speed) / 1000) % lap;
      element.scrollLeft = position;
      applied = element.scrollLeft;
    }
    frame = requestAnimationFrame(tick);
  }
  function refresh(reset = false) {
    const wasScrolling = frame !== null;
    stop();
    if (!active || !compact()) {
      copy.hidden = true;
      lap = 0;
      element.scrollLeft = 0;
      return 18000;
    }
    const width = textElement.getBoundingClientRect().width,
      overflow = width > element.clientWidth + 1,
      duration = Math.ceil(Math.max(18000, pause + (2 * (width + gap) * 1000) / speed));
    // Reserve the same reading budget before overflow starts, so making the
    // viewport narrower does not give a previously short timer to a long hint.
    if (!overflow || motion.matches) {
      copy.hidden = true;
      lap = 0;
      element.scrollLeft = 0;
      return duration;
    }
    lap = width + gap;
    copy.hidden = false;
    if (reset) {
      element.scrollLeft = 0;
      position = applied = 0;
    } else if (!wasScrolling || element.scrollLeft !== applied) {
      position = applied = element.scrollLeft;
    }
    element.dataset.scrolling = 'true';
    // ResizeObserver's first delivery must not restart the initial pause.
    if (reset || !wasScrolling) start = previous = 0;
    frame = requestAnimationFrame(tick);
    // Allow two complete laps, including the brief pause before motion begins.
    return duration;
  }
  const onMotion = () => refresh(true),
    onEnter = () => (hovered = true),
    onLeave = () => (hovered = false),
    onFocus = () => (focused = true),
    onBlur = () => (focused = false),
    onDown = () => (touching = true),
    onUp = () => (touching = false);
  const onLocale = () => refresh();
  document.addEventListener('noir:locale-changed', onLocale);
  motion.addEventListener('change', onMotion);
  element.addEventListener('pointerenter', onEnter);
  element.addEventListener('pointerleave', onLeave);
  element.addEventListener('focusin', onFocus);
  element.addEventListener('focusout', onBlur);
  element.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  const observer = new ResizeObserver(() => refresh());
  observer.observe(element);

  return {
    update(visible) {
      active = visible;
      copyLocalizedText(copy, textElement);
      return refresh(true);
    },
    destroy() {
      active = false;
      stop();
      observer.disconnect();
      document.removeEventListener('noir:locale-changed', onLocale);
      motion.removeEventListener('change', onMotion);
      element.removeEventListener('pointerenter', onEnter);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('focusin', onFocus);
      element.removeEventListener('focusout', onBlur);
      element.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}
