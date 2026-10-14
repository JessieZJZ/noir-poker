import { compactTableLayout } from './compact-table-layout.js';
import { COMPACT_PLAY_QUERY } from './play-geometry.js';
import { railLayout } from './rail-layout.js';
// Select the closest collision-free position to the upper felt center. Using each
// public part separately leaves usable space beside a narrow pot or caption.
export function nearestClearTop(ideal, min, max, blocked) {
  if (min > max) return null;
  const candidates = [Math.max(min, Math.min(max, ideal)), min, max, ...blocked.flat()];
  return (
    candidates
      .filter((top) => top >= min && top <= max && blocked.every(([a, b]) => top <= a || top >= b))
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal) || a - b)[0] ?? null
  );
}

// Keep the complete seat inside the arena while allowing the corridor's
// half-pixel clearance to survive the final fit transform. Reserving a full
// pixel at the arena edge can clamp a seat at exactly 12px from the pot;
// rounded visual rectangles then lose that clearance by a few millionths.
export function minimalSeatShift(leftSide, footprint, corridor, bounds) {
  const edgeInset = 0.5;
  return leftSide
    ? -Math.min(
        Math.max(0, footprint.right - corridor.left),
        Math.max(0, footprint.left - bounds.left - edgeInset),
      )
    : Math.min(
        Math.max(0, corridor.right - footprint.left),
        Math.max(0, bounds.right - footprint.right - edgeInset),
      );
}

// Measure stable wrappers, then share the same rail solver with WeChat.
export function createSettlementLayout(arena, { observe = true } = {}) {
  const center = arena.querySelector('.table-center');
  let frame = null;
  function update() {
    arena.style.removeProperty('min-height');
    arena.classList.remove('public-two-rows');
    for (const el of [
      center,
      arena.querySelector('.board'),
      arena.querySelector('.hero-area'),
      ...arena.querySelectorAll('.seat, .seat-profile'),
    ]) {
      el.style.removeProperty('width');
      el.style.removeProperty('height');
    }
    center.style.removeProperty('min-width');
    const compact = matchMedia(COMPACT_PLAY_QUERY).matches;
    if (!compact) {
      for (const key of [...arena.style].filter((key) =>
        /^--(player-|pot-detail|hero-action|hero-rank|hero-card-|action-height|rank-height|profile-width|public-card-width)/.test(
          key,
        ),
      ))
        arena.style.removeProperty(key);
    }
    const seatElements = [...arena.querySelectorAll('.seat')];
    if (!seatElements.length) return;
    for (const seat of seatElements) {
      seat.style.margin = '0';
      seat.style.transform = 'none';
    }
    const size = (el, selectors) => {
      const box = el.getBoundingClientRect();
      return {
        width: el.offsetWidth,
        height: el.offsetHeight,
        ...(selectors
          ? {
              parts: [...el.querySelectorAll(selectors)]
                .filter((p) => !p.hidden && p.offsetHeight && p.offsetWidth)
                .map((p) => {
                  const r = p.getBoundingClientRect();
                  return {
                    left: r.left - box.left,
                    top: r.top - box.top,
                    width: p.offsetWidth,
                    height: p.offsetHeight,
                  };
                }),
            }
          : {}),
      };
    };
    const publicSize = () => {
      const group = center.getBoundingClientRect();
      const board = arena.querySelector('.board').getBoundingClientRect();
      return {
        ...size(center, '.pot > div, .pot-details-trigger, .board, .board-caption'),
        centerY: board.top - group.top + board.height / 2,
      };
    };
    arena.querySelector('.board').style.removeProperty('--public-card-width');
    const single = { ...publicSize(), twoRows: false };
    arena.classList.add('public-two-rows');
    const double = { ...publicSize(), twoRows: true };
    arena.classList.remove('public-two-rows');
    for (const el of [
      center,
      arena.querySelector('.board'),
      arena.querySelector('.hero-area'),
      ...arena.querySelectorAll('.seat, .seat-profile'),
    ]) {
      el.style.removeProperty('width');
      el.style.removeProperty('height');
    }
    center.style.removeProperty('min-width');
    const rootStyle = getComputedStyle(document.documentElement);
    const insets = ['--safe-area-inset-top', '--safe-area-inset-bottom'].reduce(
      (sum, key) => sum + (parseFloat(rootStyle.getPropertyValue(key)) || 0),
      0,
    );
    let result = compact
      ? compactTableLayout({
          width: innerWidth,
          height: arena.clientHeight,
          availableWidth: arena.clientWidth,
          displayHeight: innerHeight - insets,
          seats: seatElements.map((seat, i) => ({ id: i + 1 })),
        })
      : railLayout({
          width: Math.min(arena.clientWidth, arena.clientHeight * 1.45),
          height: arena.clientHeight,
          // Bound the oval by available height, so wide windows retain a
          // rounded table and readable cards instead of an empty wide ellipse.
          proportional: true,
          angles:
            seatElements.length === 4
              ? [180, 240, 300, 360]
              : seatElements.length === 8
                ? [140, 170, 210, 250, 290, 330, 370, 400]
                : undefined,
          alternatives: seatElements.length === 8 ? [undefined] : undefined,
          seats: seatElements.map((seat) =>
            size(seat, '.mini-cards, .seat-profile, .seat-action, .seat-rank-slot'),
          ),
          hero: size(arena.querySelector('.hero-area')),
          publicRows: [single, double],
        });
    // Apply current typography before considering exceptional content. Small
    // natural text differences must not replace the stable shared footprints.
    if (compact && result) {
      for (const [key, value] of Object.entries(result.textMetrics))
        arena.style.setProperty(`--${key}`, `${value}px`);
      const required = Math.max(
        ...seatElements.map((seat) => seat.querySelector('.seat-profile').offsetHeight),
      );
      if (required > result.profileHeight + 8) {
        result = compactTableLayout({
          width: innerWidth,
          height: arena.clientHeight,
          availableWidth: arena.clientWidth,
          displayHeight: innerHeight - insets,
          seats: seatElements.map((seat, i) => ({ id: i + 1 })),
          minimumProfileHeight: required,
        });
      }
    }
    if (!result) return;
    if (compact) {
      for (const [key, value] of Object.entries(result.textMetrics))
        arena.style.setProperty(`--${key}`, `${value}px`);
      center.style.minWidth = '0';
      center.style.width = `${result.public.width}px`;
      center.style.height = `${result.public.height}px`;
      arena.querySelector('.board').style.width = `${result.public.width}px`;
      arena
        .querySelector('.board')
        .style.setProperty('--public-card-width', `${result.cardWidth}px`);
      arena.querySelector('.hero-area').style.width = `${result.hero.width}px`;
      arena.querySelector('.hero-area').style.height = `${result.hero.height}px`;
      seatElements.forEach((seat) => {
        seat.querySelector('.seat-profile').style.height = `${result.profileHeight}px`;
        seat.querySelector('.seat-profile').style.width = `${result.profileWidth}px`;
      });
    } else {
      center.style.removeProperty('width');
      center.style.removeProperty('height');
      center.style.removeProperty('min-width');
      arena.querySelector('.board').style.removeProperty('width');
      arena.querySelector('.hero-area').style.removeProperty('width');
      arena.querySelector('.hero-area').style.removeProperty('height');
      seatElements.forEach((seat) =>
        seat.querySelector('.seat-profile').style.removeProperty('height'),
      );
    }
    arena.classList.toggle('public-two-rows', result.twoRows);
    arena.style.width = `${result.arenaWidth}px`;
    arena.style.height = `${result.arenaHeight}px`;
    arena.style.minHeight = '0';
    const felt = arena.querySelector('.poker-table');
    Object.assign(felt.style, {
      inset: 'auto',
      left: `${result.table.left}px`,
      top: `${result.table.top}px`,
      width: `${result.table.width}px`,
      height: `${result.table.height}px`,
    });
    seatElements.forEach((seat, i) =>
      Object.assign(seat.style, {
        width: `${result.positioned[i].width}px`,
        height: `${result.positioned[i].height}px`,
        left: `${result.positioned[i].left}px`,
        top: `${result.positioned[i].top}px`,
      }),
    );
    Object.assign(center.style, {
      position: 'absolute',
      left: `${result.public.left}px`,
      top: `${result.public.top}px`,
      transform: 'none',
    });
    Object.assign(arena.querySelector('.hero-area').style, {
      position: 'absolute',
      left: `${result.hero.left}px`,
      top: `${result.hero.top}px`,
      bottom: 'auto',
      transform: 'none',
    });
  }
  if (observe) {
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    });
    observer.observe(arena.closest('.table-viewport') || arena);
    document.fonts.ready.then(update);
  }
  return { update };
}
