import { compactTableLayout } from './compact-table-layout.js';
import { COMPACT_PLAY_QUERY } from './play-geometry.js';
import { railLayout } from './rail-layout.js';
import { readPlayViewport } from './stable-viewport.js';
import { numericWidthScale } from './numeric-width.js';
import { styleFontSize } from './style-font.js';
import { heroTrophy, seatTrophy } from './trophy-placement.js';
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
  const numberWidths = new Map();
  const fitNumbers = () => {
    const entries = [...arena.querySelectorAll('.seat-profile')].map((profile) => {
      const stack = profile.querySelector('.seat-stack');
      const style = getComputedStyle(stack);
      const key = `${stack.textContent}|${style.font}|${document.fonts.status}`;
      return { profile, stack, key };
    });
    // Clear unknown widths together, then measure in one layout phase.
    for (const { stack, key } of entries)
      if (!numberWidths.has(key)) stack.style.removeProperty('--stack-width-scale');
    const measured = [];
    const arenaScale = arena.getBoundingClientRect().width / arena.offsetWidth || 1;
    for (const { profile, stack, key } of entries) {
      let width = numberWidths.get(key);
      if (width === undefined) {
        const range = document.createRange();
        range.selectNodeContents(stack);
        width = Math.max(stack.offsetWidth, range.getBoundingClientRect().width / arenaScale);
        if (numberWidths.size > 256) numberWidths.clear();
        numberWidths.set(key, width);
      }
      const profileStyle = getComputedStyle(profile);
      const available =
        profile.clientWidth -
        parseFloat(profileStyle.paddingLeft) -
        parseFloat(profileStyle.paddingRight) -
        profile.querySelector('.avatar').offsetWidth -
        parseFloat(profileStyle.columnGap) -
        0.25;
      measured.push({ stack, scale: numericWidthScale(width, available) });
    }
    // Reads precede writes; unchanged amounts reuse their measured font width.
    for (const { stack, scale } of measured) stack.style.setProperty('--stack-width-scale', scale);
  };
  const fitNames = () => {
    const arenaScale = arena.getBoundingClientRect().width / arena.offsetWidth || 1;
    const fitted = [...arena.querySelectorAll('.seat-name-label')].map((label) => {
      const range = document.createRange();
      range.selectNodeContents(label);
      const transform = getComputedStyle(label).transform;
      const currentScale = transform === 'none' ? 1 : new DOMMatrix(transform).a;
      const width = range.getBoundingClientRect().width / arenaScale / currentScale;
      const scale = numericWidthScale(width, label.clientWidth - 0.25);
      const fit = !label.parentElement.querySelector('.seat-peek') && scale >= 0.75 && scale < 1;
      return { label, scale: fit ? scale : 1, fit };
    });
    for (const { label, scale, fit } of fitted) {
      label.dataset.nameFit = String(fit);
      label.style.setProperty('--name-width-scale', scale);
    }
  };
  const fitStyles = () => {
    const labels = [...arena.querySelectorAll('.seat-style-label')];
    // Start from the intended font each time: a resize or locale switch can
    // make room for larger text again. Batch writes before measuring glyphs.
    for (const label of labels) label.style.removeProperty('--style-font');
    const arenaScale = arena.getBoundingClientRect().width / arena.offsetWidth || 1;
    const entries = labels.map((label) => {
      const style = getComputedStyle(label);
      const profileStyle = getComputedStyle(label.closest('.seat-profile'));
      // Use the stable grid track, not the badge's rounded, intrinsic width.
      // A short badge must not shrink itself further on each layout pass.
      const column = parseFloat(profileStyle.gridTemplateColumns.split(' ').at(-1));
      const available =
        column -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth) -
        0.5;
      const range = document.createRange();
      range.selectNodeContents(label);
      return {
        label,
        range,
        available,
        spacing: (parseFloat(style.letterSpacing) || 0) * [...label.textContent].length,
        font: parseFloat(style.fontSize),
      };
    });
    // Fonts need not scale exactly proportionally at small sizes. Verify real
    // rendered glyphs after each correction, batching reads before writes.
    let pending = entries;
    for (let pass = 0; pass < 4 && pending.length; pass++) {
      pending = pending.filter((entry) => {
        const width = entry.range.getBoundingClientRect().width / arenaScale;
        const height = entry.label.scrollHeight;
        const rowHeight = entry.label.clientHeight;
        if (width <= entry.available && height <= rowHeight) return false;
        // A fallback font's baseline can overflow the fixed row even when a
        // short name fits horizontally. Keep the row, and fit those glyphs too.
        entry.font = Math.min(
          styleFontSize(entry.font, width, entry.available, entry.spacing),
          styleFontSize(entry.font, height, rowHeight),
        );
        return true;
      });
      for (const { label, font } of pending) label.style.setProperty('--style-font', `${font}px`);
    }
  };
  const center = arena.querySelector('.table-center');
  let frame = null;
  function update() {
    // Locale refresh also reaches the live table while a records page hides
    // it. Keep its geometry until the visible viewport can be measured again.
    if (!arena.clientWidth || !arena.clientHeight) return;
    const heroRank = arena.querySelector('.hero-hand-rank');
    arena
      .querySelector('.hero-area')
      .classList.toggle('has-hero-rank', !!heroRank && !heroRank.hidden);
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
        /^--(player-|pot-|hero-|action-height|rank-height|caption-|profile-|public-card-width)/.test(
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
                    left: p.matches('.mini-cards') ? p.offsetLeft : r.left - box.left,
                    top: p.matches('.mini-cards') ? p.offsetTop : r.top - box.top,
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
          displayHeight: readPlayViewport().height - insets,
          seats: seatElements.map((seat, i) => ({ id: i + 1 })),
        })
      : railLayout({
          width: Math.min(arena.clientWidth, arena.clientHeight * 1.45),
          height: arena.clientHeight,
          gap: 16,
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
          displayHeight: readPlayViewport().height - insets,
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
    fitStyles();
    fitNumbers();
    fitNames();
    placeTrophy();
  }
  // Rest the champion's trophy where the shared rules choose. Rectangles are
  // read on screen, then sizes are written back in the arena's own units.
  function placeTrophy() {
    const trophy = arena.querySelector('.champion-trophy');
    if (!trophy) return;
    const box = arena.getBoundingClientRect(),
      scale = box.width / arena.offsetWidth || 1,
      rect = (el) => el.getBoundingClientRect(),
      visible = (el) => el && !el.hidden && el.offsetWidth > 0 && el.offsetHeight > 0;
    if (trophy.matches('.hero-champion-trophy')) {
      const cards = rect(arena.querySelector('.hero-cards')),
        board = arena.querySelector('.table-center .board'),
        place = heroTrophy(cards, { above: visible(board) ? rect(board).bottom : box.top });
      Object.assign(trophy.style, {
        width: `${place.width / scale}px`,
        height: `${place.height / scale}px`,
        left: `${-place.width / scale / 2}px`,
        bottom: `calc(100% + ${(place.gap - place.drop) / scale}px)`,
      });
      return;
    }
    const seat = trophy.closest('.seat'),
      profile = seat.querySelector('.seat-profile'),
      obstacles = [
        ...[...arena.querySelectorAll('.seat')]
          .filter((other) => other !== seat)
          .flatMap((other) => [
            ...other.querySelectorAll('.seat-profile, .mini-cards, .seat-action'),
          ]),
        arena.querySelector('.table-center'),
        arena.querySelector('.hero-cards-wrap'),
        arena.querySelector('.hero-name'),
      ]
        .filter(visible)
        .map(rect);
    const place = seatTrophy(rect(profile), {
      bounds: { left: box.left, right: box.right },
      obstacles,
    });
    trophy.classList.toggle('trophy-left', place.side === 'left');
    trophy.classList.toggle('trophy-right', place.side === 'right');
    Object.assign(trophy.style, {
      width: `${place.width / scale}px`,
      height: `${place.height / scale}px`,
    });
    trophy.style.setProperty('--trophy-gap', `${place.gap / scale}px`);
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
  return { update, placeTrophy };
}
