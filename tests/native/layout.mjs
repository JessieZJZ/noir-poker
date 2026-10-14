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
    cards = rect('#hero-cards'),
    arena = document.querySelector('#arena'),
    scale = arena.getBoundingClientRect().width / arena.offsetWidth;
  return {
    table: rect('.table-viewport'),
    arena: rect('#arena'),
    publicArea: rect('.table-center'),
    dock: rect('.action-dock'),
    width: innerWidth,
    scale,
    chrome: {
      background: getComputedStyle(document.querySelector('.header')).backgroundColor,
      safeBackground: getComputedStyle(document.querySelector('.header'), '::before')
        .backgroundColor,
    },
    height: innerHeight,
    usableBottom: innerHeight - (parseFloat(getComputedStyle(document.body).paddingBottom) || 0),
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
    inspection: [...arena.querySelectorAll('.seat-peek')].map((eye) => {
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
    profiles: [...arena.querySelectorAll('.seat-profile')].map((profile) => {
      const style = getComputedStyle(profile),
        tag = getComputedStyle(profile.querySelector('.seat-style-label')),
        tagBox = profile.querySelector('.seat-style-label').getBoundingClientRect(),
        stackBox = profile.querySelector('.seat-stack').getBoundingClientRect(),
        font = (selector) =>
          parseFloat(getComputedStyle(profile.querySelector(selector)).fontSize) * scale;
      const profileBox = profile.getBoundingClientRect();
      const content = [
        ...profile.querySelectorAll(
          '.avatar, .seat-name-label, .position-badge, .seat-peek, .seat-style-label, .seat-stack',
        ),
      ].flatMap((el) => {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) return [];
        if (el.matches('.avatar, .position-badge, .seat-peek')) return [box];
        const range = document.createRange();
        range.selectNodeContents(el);
        const glyph = range.getBoundingClientRect();
        // Ellipsized text still exposes its full hidden range horizontally.
        // Only that axis is clipped; retain the real font's ascender/descender
        // extent so a short line box cannot hide a vertical padding failure.
        const clipped = getComputedStyle(el).overflowX === 'hidden';
        return [
          {
            left: clipped ? Math.max(glyph.left, box.left) : glyph.left,
            right: clipped ? Math.min(glyph.right, box.right) : glyph.right,
            top: Math.min(glyph.top, box.top),
            bottom: Math.max(glyph.bottom, box.bottom),
          },
        ];
      });
      return {
        id: profile.closest('.seat').dataset.player,
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(
          parseFloat,
        ),
        tagPadding: [tag.paddingTop, tag.paddingRight, tag.paddingBottom, tag.paddingLeft].map(
          parseFloat,
        ),
        nameSize: font('strong'),
        styleSize: parseFloat(tag.fontSize) * scale,
        stackSize: font('.seat-stack'),
        stackBelowStyle: stackBox.top >= tagBox.bottom - 0.5,
        contentInsets: content.length
          ? {
              top: Math.min(...content.map((box) => (box.top - profileBox.top) / scale)),
              right: Math.min(...content.map((box) => (profileBox.right - box.right) / scale)),
              bottom: Math.min(...content.map((box) => (profileBox.bottom - box.bottom) / scale)),
              left: Math.min(...content.map((box) => (box.left - profileBox.left) / scale)),
            }
          : null,
      };
    }),
    rail: {
      felt: rect('.poker-table'),
      public: rect('#board'),
      hero: rect('.hero-area'),
      seats: [...arena.querySelectorAll('.seat')].map((seat) => {
        const r = seat.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    },
    presentation: {
      heroRankSpace: (() => {
        const slot = document.querySelector('.hero-rank-slot');
        const tag = document.querySelector('#hero-hand-rank');
        const slotBox = slot.getBoundingClientRect();
        const tagBox = tag.getBoundingClientRect();
        return {
          height: slot.offsetHeight,
          tag:
            tag.hidden || !tagBox.height
              ? null
              : {
                  height: tagBox.height / scale,
                  identityGap: (identity.top - tagBox.bottom) / scale,
                  bottom: (tagBox.bottom - slotBox.top) / scale,
                },
        };
      })(),
      heroGap: (identity.top - cards.bottom) / scale,
      heroInset: (rect('#arena').bottom - identity.bottom) / scale,
      heroFont: parseFloat(getComputedStyle(document.querySelector('.hero-identity')).fontSize),
      heroNameFont: parseFloat(
        getComputedStyle(document.querySelector('.hero-identity strong')).fontSize,
      ),
      actions: [...arena.querySelectorAll('.seat .seat-action')].map((el) => ({
        font: parseFloat(getComputedStyle(el).fontSize),
        margin: parseFloat(getComputedStyle(el).marginTop),
      })),
      backs: [...arena.querySelectorAll('.seat .card-back')].map((el) => {
        const back = el.getBoundingClientRect(),
          profile = el.closest('.seat').querySelector('.seat-profile').getBoundingClientRect();
        return (profile.top - back.top) / back.height;
      }),
    },
    rankSpacing: [...arena.querySelectorAll('.seat .hand-rank')].flatMap((rank) => {
      const seat = rank.closest('.seat'),
        action = seat.querySelector('.seat-action'),
        badge = rank.getBoundingClientRect();
      if (action.getBoundingClientRect().top >= badge.top) return [];
      const range = document.createRange();
      range.selectNodeContents(action);
      const lines = [...range.getClientRects()].filter((r) => r.width && r.height);
      return lines.length
        ? [
            {
              id: seat.dataset.player,
              gap: (badge.top - Math.max(...lines.map((r) => r.bottom))) / scale,
            },
          ]
        : [];
    }),
    captions: [...arena.querySelectorAll('.seat .seat-action')].map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const bounds = (box) => ({
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      });
      return {
        id: el.closest('.seat').dataset.player,
        box: bounds(el.getBoundingClientRect()),
        lines: [...range.getClientRects()].map(bounds),
      };
    }),
    revealed: [...arena.querySelectorAll('.seat .revealed-cards .playing-card')].map((el) => {
      const card = el.getBoundingClientRect(),
        profile = el.closest('.seat').querySelector('.seat-profile').getBoundingClientRect();
      return { width: el.offsetWidth, exposed: (profile.top - card.top) / card.height };
    }),
    bottomInset:
      parseFloat(getComputedStyle(document.querySelector('.action-dock')).paddingBottom) || 0,
    settledButtons: ['#next-button', '#restart-hand-button', '#review-hand-button'].map(rect),
  };
}

export function assertTableLayout(info) {
  if (info.chrome) {
    assert.equal(info.chrome.background, 'rgb(10, 16, 22)', 'Sticky header covers the table');
    assert.equal(
      info.chrome.safeBackground,
      info.chrome.background,
      'Safe area shares the opaque header background',
    );
  }
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
  const largeTablet =
    info.width >= 901 && info.width <= 1100 && info.height >= 1100 && info.height > info.width;
  if (info.rail) {
    const { felt, public: group, hero, seats } = info.rail;
    const cx = (felt.left + felt.right) / 2,
      cy = (felt.top + felt.bottom) / 2;
    assert.ok(
      Math.abs((group.left + group.right) / 2 - cx) <= 1 &&
        Math.abs((group.top + group.bottom) / 2 - cy) <= 1,
      'Public cards must remain at the felt center',
    );
    for (const seat of [...seats, hero]) {
      const x = ((seat.left + seat.right) / 2 - cx) / ((felt.right - felt.left) / 2);
      const y = ((seat.top + seat.bottom) / 2 - cy) / ((felt.bottom - felt.top) / 2);
      assert.ok(
        Math.abs(x * x + y * y - 1) <= 0.03,
        'The rail must bisect each complete player area',
      );
    }
  }
  if (info.presentation) assertSeatPresentation(info.presentation, info, largeTablet);
  for (const rank of info.rankSpacing ?? [])
    assert.ok(
      rank.gap >= 3 && rank.gap <= 6.5,
      `Seat ${rank.id} rank must sit close to the complete action caption`,
    );
  if (info.captions) assertReadableCaptions(info.captions, info.table);
  for (const card of info.revealed ?? []) {
    assert.ok(card.width >= 32, 'Revealed opponent cards need a readable face');
    assert.ok(
      card.exposed >= 0.65 && card.exposed <= 0.98,
      'Revealed cards tuck slightly into the profile',
    );
  }
  for (const profile of info.profiles) {
    if ('contentInsets' in profile)
      assert.ok(
        profile.contentInsets &&
          Object.values(profile.contentInsets).every(
            (inset) => Number.isFinite(inset) && inset >= 3.75,
          ),
        `Seat ${profile.id} visible text and controls need a border plus 3px of real padding`,
      );
    if (profile.stackBelowStyle !== undefined)
      assert.ok(profile.stackBelowStyle, `Seat ${profile.id} chips must sit below its style tag`);
    assert.ok(
      profile.padding.every((value) => value >= 3),
      `Seat ${profile.id} profile needs padding on all sides`,
    );
    assert.ok(
      profile.tagPadding.every((value, index) => value >= (index % 2 ? 3 : 1)),
      `Seat ${profile.id} style tag needs padding on all sides`,
    );
    if (largeTablet) {
      assert.ok(
        profile.nameSize >= 17 && profile.stackSize >= 17 && profile.styleSize >= 14,
        `Seat ${profile.id} tablet text must remain readable after fitting`,
      );
    }
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

export function assertReadableCaptions(captions, viewport) {
  const contained = (part, box) =>
    part.left >= box.left - 0.75 &&
    part.right <= box.right + 0.75 &&
    part.top >= box.top - 0.75 &&
    part.bottom <= box.bottom + 0.75;
  for (const caption of captions)
    assert.ok(
      caption.lines.every((line) => contained(line, caption.box) && contained(line, viewport)),
      `Seat ${caption.id} action words and chip digits must be fully visible`,
    );
}

export function assertSeatPresentation(presentation, viewport, largeTablet = false) {
  for (const visible of presentation.backs)
    assert.ok(
      visible >= 0.35 && visible <= 0.7,
      'Opponent backs must remain half tucked during the deal and subsequent renders',
    );
  if (viewport.width > 1100 || viewport.height <= viewport.width) return;
  if (presentation.heroRankSpace) {
    const { height, tag } = presentation.heroRankSpace;
    assert.ok(
      Number.isFinite(height) && height >= 18 && height <= (viewport.width > 600 ? 42 : 36),
      'Hero rank slot must reserve a bounded readable line',
    );
    assert.ok(
      tag
        ? presentation.heroGap >= height && presentation.heroGap <= height + 8
        : presentation.heroGap >= 3 && presentation.heroGap <= 10,
      'Hero identity must follow a visible rank or move close to the cards when the reserved slot is empty',
    );
    if (tag)
      assert.ok(
        tag.height > 0 &&
          tag.height <= height + 0.5 &&
          tag.bottom <= height + 0.5 &&
          tag.identityGap >= 0,
        'Hero rank must stay inside its reserved slot and clear the identity',
      );
  } else {
    assert.ok(
      presentation.heroGap >= 18 && presentation.heroGap <= (largeTablet ? 39 : 28),
      'Hero identity must stay close to the cards with space reserved for the hand rank',
    );
  }
  assert.ok(presentation.heroInset >= 0, 'Hero identity must stay inside the visible arena');
  assert.ok(
    presentation.heroFont >= 15 &&
      Math.abs(presentation.heroNameFont - presentation.heroFont) <= 0.1,
    'Hero name and chips must use the same readable type size',
  );
  for (const action of presentation.actions)
    assert.ok(
      action.font >= 11 && action.margin >= 4,
      'Seat action text needs readable type and a small top margin',
    );
}

export function assertStableSettlement(before, after) {
  for (const edge of ['top', 'left', 'right', 'height'])
    assert.ok(
      Math.abs(after.table[edge] - before.table[edge]) <= 1,
      'Table keeps its live geometry through settlement',
    );
  assert.ok(Math.abs(after.dock.top - before.dock.top) <= 1, 'Only the controls collapse');
  assertTableLayout(after);
}
