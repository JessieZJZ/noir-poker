// Read both views through their visible DOM, without consulting the layout solver.
// Coordinates are relative to the arena so page headings/scroll do not affect parity.
export function readRecordTableGeometry(selector) {
  const arena = document.querySelector(selector);
  const bounds = arena.getBoundingClientRect();
  const box = (element) => {
    if (!element || element.hidden) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: rect.left - bounds.left,
      y: rect.top - bounds.top,
      width: rect.width,
      height: rect.height,
    };
  };
  const at = (selector) => box(arena.querySelector(selector));
  return {
    arena: { width: bounds.width, height: bounds.height },
    felt: at('.poker-table'),
    center: at('.table-center'),
    pot: at('.pot > div'),
    potDetails: at('.pot-details-trigger'),
    board: at('.board'),
    boardCards: [...arena.querySelectorAll('.board > *')].map(box),
    boardCaption: at('.board-caption'),
    hero: {
      area: at('.hero-area'),
      cards: at('.hero-cards'),
      cardFaces: [...arena.querySelectorAll('.hero-cards > *')].map(box),
      name: at('.hero-name'),
      identity: at('.hero-identity'),
      stack: at('.hero-stack'),
      rank: at('.hero-hand-rank'),
      action: at('.hero-last-action'),
    },
    seats: [...arena.querySelectorAll('.seat')].map((seat) => ({
      id: seat.dataset.player,
      area: box(seat),
      cards: box(seat.querySelector('.mini-cards')),
      cardFaces: [...seat.querySelectorAll('.mini-cards > *')].map(box),
      profile: box(seat.querySelector('.seat-profile')),
      avatar: box(seat.querySelector('.avatar')),
      stack: box(seat.querySelector('.seat-stack')),
      rank: box(seat.querySelector('.hand-rank')),
      action: box(seat.querySelector('.seat-action')),
    })),
  };
}

export function recordGeometryDifferences(actual, expected, tolerance = 1.5) {
  const differences = [];
  const compare = (a, b, path) => {
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > tolerance)
        differences.push(`${path}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);
    } else if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      if (a !== b) differences.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    } else if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) differences.push(`${path}.length: ${a.length} vs ${b.length}`);
      a.forEach((value, index) => compare(value, b[index], `${path}[${index}]`));
    } else {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        compare(a[key], b[key], `${path}.${key}`);
    }
  };
  compare(actual, expected, 'table');
  return differences;
}
