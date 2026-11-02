import { railLayout } from './rail-layout.js';
import { growPublicCards } from './public-card-space.js';
import { growHeroCards } from './hero-card-space.js';
// Board and hole cards on crowded phone tables: at most this share of a
// player's profile width (Web's own nine-seat phone tables sit near 0.6).
export const CROWDED_CARD_SHARE = 0.68;
// Match the responsive Web wrapper sizes, not platform text measurements.
export function compactTableLayout({
  width,
  height,
  seats,
  displayHeight = 759,
  availableWidth,
  minimumProfileHeight = 0,
  wideProfiles = false,
}) {
  const count = seats.length + 1;
  const tablet = width > 600 && width <= 1100;
  const large = width > 900 && displayHeight >= 1100 && displayHeight > width;
  const roomy = width <= 600 && displayHeight >= 740 && count <= 6;
  const short = width <= 600 && displayHeight < 740;
  let cardWidth = tablet
    ? large
      ? 94
      : width <= 900
        ? 106
        : 94
    : count <= 6
      ? 58
      : width <= 360
        ? 66
        : 61;
  let cardHeight = cardWidth * 1.44;
  let heroWidth = tablet ? 94 : 72;
  let heroHeight = tablet ? 136 : 104;
  const heroSlotHeight = heroHeight;
  const captionWidth = tablet ? (large ? 180 : 160) : count <= 6 ? 116 : 112;
  const profileWidth = tablet
    ? large
      ? 176
      : width <= 900
        ? 160
        : 132
    : count <= 6
      ? roomy
        ? 116
        : 120
      : wideProfiles
        ? 132
        : 116;
  let profileHeight = Math.max(
    minimumProfileHeight,
    tablet ? (large ? 120 : 100) : short ? 87 : 82,
  );
  const textMetrics = {
    'player-name': large ? 28 : tablet ? 24 : short ? 22 : 20,
    'player-stack': large ? 28 : tablet ? 24 : short ? 21 : 19,
    'player-persona': large ? 23 : tablet ? 20 : short ? 18 : 17,
    'player-position': large ? 17 : short ? 15 : 14,
    'player-eye-size': large ? 26 : tablet ? 24 : 20,
    'player-action': large ? 25 : tablet ? 22 : short ? 20 : 19,
    'player-rank': large ? 22 : tablet ? 18 : short ? 18 : 17,
    'pot-detail': large ? 24 : tablet ? 20 : short ? 20 : 18,
    'pot-number': large ? 50 : tablet ? 42 : 32,
    'hero-identity': large ? 28 : tablet ? 24 : 22,
    'hero-position': large ? 20 : tablet ? 17 : short ? 18 : 17,
    'hero-action': large ? 25 : tablet ? 22 : short ? 20 : 19,
    'hero-rank': large ? 22 : tablet ? 18 : short ? 18 : 17,
    'action-height': large ? 68 : tablet ? 56 : short ? 52 : 48,
    'caption-padding': large ? 4 : 2,
    'rank-height': large ? 36 : tablet ? 32 : 30,
    'hero-rank-empty-lift': large ? 34 : tablet ? 30 : 28,
    'caption-width': captionWidth,
    'profile-width': profileWidth,
    'profile-padding': large ? 8 : tablet || roomy ? 6 : 5,
    'player-avatar': large ? 60 : tablet ? 48 : roomy ? 36 : 32,
    'player-face-width': tablet ? 54 : 44,
    'player-face-height': tablet ? 78 : 63,
    'player-face-shift': tablet ? 12 : 10,
    'player-back-width': tablet ? 33 : 32,
    'player-back-height': tablet ? 46 : 42,
    'player-back-shift': tablet ? 28 : 22,
    'public-card-width': cardWidth,
    'hero-card-width': heroWidth,
    'hero-card-height': heroHeight,
  };
  // Wider nine-seat players (below) also get larger name, style and stack text.
  if (wideProfiles) {
    for (const key of ['player-name', 'player-stack', 'player-persona', 'player-position'])
      textMetrics[key] = Math.round(textMetrics[key] * 1.1);
    // Name, style and stack rows plus their gaps and padding stay inside it.
    profileHeight = Math.max(
      profileHeight,
      Math.ceil(
        textMetrics['player-name'] +
          textMetrics['player-stack'] +
          textMetrics['player-persona'] * 1.15 +
          8 +
          textMetrics['profile-padding'] * 2 +
          2,
      ),
    );
  }
  textMetrics['hero-identity-height'] = Math.ceil(textMetrics['hero-identity'] * 1.2);
  textMetrics['player-avatar'] = Math.ceil(
    textMetrics['player-persona'] * 1.15 + 4 + textMetrics['player-stack'] + 2,
  );
  // Four CJK characters share the original right column. Keep the avatar's
  // original size and expose a single-line font budget for the WeChat renderer.
  textMetrics['player-persona-fit'] = Math.max(
    1,
    Math.min(
      textMetrics['player-persona'] * 0.82,
      Math.floor(
        ((profileWidth - textMetrics['profile-padding'] * 2 - textMetrics['player-avatar'] - 15) /
          4) *
          100,
      ) / 100,
    ),
  );
  textMetrics['hero-action-height'] = Math.ceil(textMetrics['hero-action'] * 1.2);
  textMetrics['hero-info-height'] =
    textMetrics['hero-identity-height'] + textMetrics['hero-action-height'] + 2;
  textMetrics['pot-height'] = Math.ceil(textMetrics['pot-number'] * 1.2);
  const captionHeight = textMetrics['action-height'] + textMetrics['rank-height'];
  const seatWidth = Math.round(Math.max(profileWidth, tablet ? (large ? 180 : 136) : 88));
  const seatHeight = (tablet ? 58 : 39) + 8 + profileHeight + captionHeight;
  const heroFoot = Math.round(
    heroHeight + textMetrics['rank-height'] + textMetrics['hero-info-height'] + 4,
  );
  const potHeight = textMetrics['pot-height'];
  const rowGap = 4;
  const publicRow = (width, twoRows) => {
    const cardHeight = width * 1.44;
    const boardWidth = Math.ceil((twoRows ? 3 : 5) * width + (twoRows ? 8 : 16));
    const potWidth = Math.min(boardWidth, tablet ? (large ? 260 : 220) : 160);
    return {
      twoRows,
      centerY: potHeight + 6 + (cardHeight * (twoRows ? 2 : 1) + (twoRows ? 10 : 0)) / 2,
      width: boardWidth,
      height: Math.round(potHeight + 6 + cardHeight * (twoRows ? 2 : 1) + (twoRows ? 10 : 0)),
      parts: [
        { left: (boardWidth - potWidth) / 2, top: 0, width: potWidth, height: potHeight },
        {
          left: 0,
          top: potHeight + 6,
          width: boardWidth,
          height: Math.round(cardHeight * (twoRows ? 2 : 1) + (twoRows ? 10 : 0)),
        },
      ],
    };
  };
  const railOptions = {
    width:
      availableWidth ?? Math.round(Math.max(1, width - (width <= 600 ? 18 : width * 0.06 + 2))),
    height: Math.max(1, height),
    gap: 16,
    seats: seats.map((s) => ({
      ...s,
      width: s.width ?? seatWidth,
      height: s.height ?? seatHeight,
      parts: s.parts ?? [
        {
          left: (seatWidth - (tablet ? 92 : roomy ? 76 : 68)) / 2,
          top: 0,
          width: tablet ? 92 : roomy ? 76 : 68,
          height: tablet ? 58 : 39,
        },
        {
          left: (seatWidth - profileWidth) / 2,
          top: (tablet ? 58 : 39) + 4,
          width: profileWidth,
          height: profileHeight,
        },
        {
          left: (seatWidth - textMetrics['caption-width']) / 2,
          top: (tablet ? 58 : 39) + 8 + profileHeight,
          width: textMetrics['caption-width'],
          height: captionHeight,
        },
      ],
    })),
    hero: { width: Math.round(heroWidth * 2 + 7), height: heroFoot },
  };
  // On phones, eight and nine seats also try rails that pull the lowest seats
  // toward the hero, which spaces the side columns and fits larger players.
  const nineAngles = tablet
    ? [120, 160, 200, 240, 300, 340, 380, 420]
    : [150, 180, 210, 240, 300, 330, 360, 390];
  const rails =
    count === 5
      ? [{ angles: [180, 240, 300, 360], alternatives: [[160, 230, 310, 380]] }]
      : count === 9 && width <= 600
        ? // Each nine-seat phone rail is scored on its own, below: the newer
          // ones spread the four top players evenly along the upper rail.
          [
            nineAngles,
            undefined,
            [122, 166, 226, 256, 284, 314, 374, 418],
            [118, 170, 230, 256, 284, 310, 370, 422],
            [122, 166, 214, 254, 286, 326, 374, 418],
            [118, 170, 214, 254, 286, 326, 370, 422],
          ].map((angles) => ({ angles }))
        : count === 9
          ? [{ angles: nineAngles, alternatives: [undefined] }]
          : count === 8 && width <= 600
            ? [{ alternatives: [undefined, [126, 178, 234, 270, 306, 362, 414]] }]
            : [{}];
  // Board and hole cards should read as one card size. Grow both for each row
  // arrangement, keep the arrangement whose smaller face is largest, then keep
  // either size within 10% of the other. A cap on the on-screen size (after
  // the arena is scaled to fit) stops faces from crowding the felt.
  const faceCap = tablet ? (large ? 84 : 76) : 62;
  // Crowded phone tables (not tablets or desktops) show board and hole cards
  // at one size, and hold the hole cards further from the neighbouring players.
  const crowded = width <= 600 && count >= 7;
  // There the cards also stay in proportion to the players: at most this share
  // of a player's width, so spare space never only enlarges the cards.
  const cardShare = crowded ? CROWDED_CARD_SHARE : Infinity;
  const heroOptions = (boardWidth, cap) => ({
    width: heroWidth,
    height: heroHeight,
    maxGrowth: tablet ? 1 : 1.4,
    minimumWidth: heroWidth * 0.65,
    maximumWidth: Math.min(cap, crowded ? boardWidth : Math.round(boardWidth * 1.1)),
    gap: crowded ? 20 : 18,
  });
  // On crowded phone tables the cards also keep a visible clearance from the
  // players on screen, not only in arena units, so a scaled-down table does
  // not look squeezed. The clearance never costs readability: below the
  // readable face size the tighter arena gaps apply instead.
  const readableFace = 34;
  const arrange = (rail) => {
    const candidates = [false, true].map((twoRows) => {
      const layout = railLayout({
        ...railOptions,
        ...rail,
        publicRows: [publicRow(cardWidth, twoRows)],
      });
      const scale = Math.min(1, height / layout.arenaHeight),
        cap = Math.floor(Math.min(faceCap / scale, profileWidth * cardShare));
      const grow = (boardGap, heroGap) => {
        const grown = growPublicCards(layout, {
          cardWidth,
          createRow: publicRow,
          gap: boardGap,
          maximumWidth: cap,
        });
        return {
          grown,
          hero: growHeroCards(grown.layout, { ...heroOptions(grown.cardWidth, cap), gap: heroGap }),
        };
      };
      const tight = grow(16, crowded ? 20 : 18);
      const spaced = crowded && grow(Math.max(16, 12 / scale), Math.max(20, 13 / scale));
      const { grown, hero } =
        spaced && Math.min(spaced.grown.cardWidth, spaced.hero.width) * scale >= readableFace
          ? spaced
          : tight;
      return {
        ...grown,
        hero,
        scale,
        readable: Math.min(grown.cardWidth, hero.width) * scale,
      };
    });
    const [single, double] = candidates;
    // Two rows when they make both faces clearly larger, or when one row would
    // leave the board cards below a readable on-screen width.
    const readableWidth = tablet ? 52 : Math.max(36, Math.min(44, width * 0.11));
    const tooSmall =
      single.cardWidth * single.scale < readableWidth &&
      double.cardWidth * double.scale > single.cardWidth * single.scale * 1.1;
    return tooSmall ||
      (double.readable > single.readable * 1.08 && double.scale >= single.scale * 0.9)
      ? double
      : single;
  };
  // The narrowest on-screen gap between side-by-side players.
  const seatSpacing = ({ layout, scale }) => {
    let narrowest = Infinity;
    const boxes = layout.positioned;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const shared = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
        if (shared > a.height * 0.3)
          narrowest = Math.min(
            narrowest,
            Math.max(b.left - a.left - a.width, a.left - b.left - b.width),
          );
      }
    return narrowest * scale;
  };
  // Keep the table within 10% of the largest rail and the cards within 6% of
  // the most readable of those, then prefer the rail that spaces the players
  // most evenly: readable cards and spacing outweigh a slightly smaller table.
  const arranged = rails.map(arrange);
  const bestScale = Math.max(...arranged.map((option) => option.scale));
  const fullSize = arranged.filter((option) => option.scale >= bestScale * 0.9);
  const bestReadable = Math.max(...fullSize.map((option) => option.readable));
  const chosen = fullSize
    .filter((option) => option.readable >= bestReadable * 0.94)
    .sort((a, b) => seatSpacing(b) - seatSpacing(a) || b.scale - a.scale)[0];
  // A short nine-seat phone table (WeChat's, below its status and navigation
  // bars) has room for larger cards than its players. Give that room to the
  // players instead: wider profiles with larger text, cards still in proportion.
  if (
    crowded &&
    count === 9 &&
    !wideProfiles &&
    Math.min(chosen.cardWidth, chosen.hero.width) >= Math.floor(profileWidth * cardShare)
  ) {
    const wide = compactTableLayout({
      width,
      height,
      seats,
      displayHeight,
      availableWidth,
      minimumProfileHeight,
      wideProfiles: true,
    });
    // Only when the table keeps nearly its size, the opponents' card backs
    // keep their 15px on-screen target, and the board and hole cards stay as
    // readable: wider players never squeeze the cards smaller.
    if (
      wide.arenaScale >= chosen.scale * 0.97 &&
      wide.textMetrics['player-back-width'] * wide.arenaScale >= 15 &&
      Math.min(wide.cardWidth, wide.heroWidth) * wide.arenaScale >= chosen.readable * 0.95
    )
      return wide;
  }
  let fitted = chosen.layout;
  cardWidth = chosen.cardWidth;
  const heroCards = chosen.hero;
  heroWidth = heroCards.width;
  heroHeight = heroCards.height;
  // Elsewhere readability wins on small screens: the board keeps a readable
  // on-screen width even if the hero is held smaller by the seats.
  const boardLimit = crowded
    ? heroWidth
    : Math.max(Math.round(heroWidth * 1.1), Math.ceil((tablet ? 52 : 40) / chosen.scale));
  if (cardWidth > boardLimit) {
    const balanced = growPublicCards(fitted, {
      cardWidth: boardLimit,
      maximumWidth: boardLimit,
      createRow: publicRow,
      gap: 16,
    });
    fitted = balanced.layout;
    cardWidth = balanced.cardWidth;
  }
  cardHeight = cardWidth * 1.44;
  textMetrics['public-card-width'] = cardWidth;
  textMetrics['hero-card-width'] = heroWidth;
  textMetrics['hero-card-height'] = heroHeight;
  textMetrics['hero-card-slot-height'] = heroSlotHeight;
  textMetrics['hero-card-shift'] = heroCards.shift;
  textMetrics['hero-card-gap'] = heroCards.gap;
  const textStyle =
    Object.entries(textMetrics)
      .map(([key, value]) => `--${key}:${value}px;`)
      .join('') +
    `--hero-card-left-angle:-${heroCards.angle}deg;--hero-card-right-angle:${heroCards.angle}deg;`;
  return {
    ...fitted,
    arenaScale: Math.min(1, height / fitted.arenaHeight),
    publicTop: fitted.public.top,
    publicLeft: fitted.public.left,
    publicHeight: fitted.public.height,
    boardWidth: fitted.public.width,
    boardTwoRows: fitted.twoRows,
    cardWidth,
    cardHeight,
    heroWidth,
    heroHeight,
    heroSlotHeight,
    heroCardGeometry: heroCards,
    heroFoot,
    seatWidth,
    seatHeight,
    profileWidth,
    profileHeight,
    textMetrics,
    textStyle,
    potHeight,
    rowGap,
    roomy,
    large,
    tablet,
    feltStyle: `left:${fitted.table.left}px;top:${fitted.table.top}px;width:${fitted.table.width}px;height:${fitted.table.height}px;right:auto;bottom:auto;`,
    heroStyle: `left:${fitted.hero.left}px;top:${fitted.hero.top}px;width:${fitted.hero.width}px;height:${fitted.hero.height}px;bottom:auto;transform:none;`,
  };
}
