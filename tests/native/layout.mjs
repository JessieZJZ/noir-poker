import assert from 'node:assert/strict';

// Serialized into the installed WebView. Read geometry without QA fixtures.
export function readTableLayout() {
  const rect = (selector) => {
    const box = document.querySelector(selector).getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      height: box.height,
    };
  };
  const identity = rect('.hero-identity'),
    cards = rect('#hero-cards');
  return {
    table: rect('.table-viewport'),
    arena: rect('#arena'),
    publicArea: rect('.table-center'),
    dock: rect('.action-dock'),
    width: innerWidth,
    height: innerHeight,
    tagCount: document.querySelectorAll('#hero-turn').length,
    identityOffset: (identity.left + identity.right - cards.left - cards.right) / 2,
    stack: rect('#hero-stack'),
    position: rect('#hero-position'),
    identity,
    heroAction: document.querySelector('#hero-last-action').hidden
      ? null
      : rect('#hero-last-action'),
    publicCards: [...document.querySelector('#board').children].map((el) => {
      const box = el.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }),
    inspection: [...document.querySelectorAll('.seat-peek')].map((eye) => {
      const seat = eye.closest('.seat'),
        e = eye.getBoundingClientRect(),
        badge = seat.querySelector('.position-badge').getBoundingClientRect(),
        profile = seat.querySelector('.seat-profile').getBoundingClientRect();
      return {
        id: seat.dataset.player,
        followsPosition: eye.parentElement.previousElementSibling?.className === 'position-badge',
        gap: e.left - badge.right,
        centerOffset: (e.top + e.bottom - badge.top - badge.bottom) / 2,
        contained:
          e.left >= profile.left &&
          e.right <= profile.right &&
          e.top >= profile.top &&
          e.bottom <= profile.bottom,
      };
    }),
    bottomInset:
      parseFloat(getComputedStyle(document.querySelector('.action-dock')).paddingBottom) || 0,
    settledButtons: ['#next-button', '#restart-hand-button', '#review-hand-button'].map(rect),
  };
}

export function assertTableLayout(info) {
  assert.equal(info.tagCount, 0, 'The redundant hero turn tag must be removed');
  assert.ok(
    Math.abs(info.identityOffset) <= 1,
    'Hero identity must remain centered below the cards',
  );
  assert.ok(info.table.height > 70 && info.table.bottom <= info.dock.top + 1);
  assert.ok(info.stack.left >= info.position.right, 'Hero chips must follow the position badge');
  assert.ok(info.stack.top < info.position.bottom && info.stack.bottom > info.position.top);
  if (info.heroAction)
    assert.ok(
      info.heroAction.top >= info.identity.bottom - 1,
      'Hero action belongs below the identity',
    );
  for (const eye of info.inspection) {
    assert.ok(
      eye.followsPosition && eye.gap >= -0.5 && Math.abs(eye.centerOffset) <= 0.5,
      `Seat ${eye.id} inspection must follow the position badge in the identity row`,
    );
    assert.ok(eye.contained, `Seat ${eye.id} inspection must stay inside its profile`);
  }
  assert.equal(info.publicCards.length, 5);
  if (Math.abs(info.publicCards[3].top - info.publicCards[0].top) > 1) {
    const cards = info.publicCards;
    assert.ok(cards.slice(0, 3).every((card) => Math.abs(card.top - cards[0].top) <= 1));
    assert.ok(Math.abs(cards[3].top - cards[4].top) <= 1 && cards[3].top >= cards[0].bottom);
    assert.ok(Math.abs(cards[0].left + cards[2].right - cards[3].left - cards[4].right) <= 2);
  } else {
    assert.ok(info.publicCards.every((card) => Math.abs(card.top - info.publicCards[0].top) <= 1));
  }
}
