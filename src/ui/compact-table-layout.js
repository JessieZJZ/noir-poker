import { railLayout } from './rail-layout.js';
import { growPublicCards } from './public-card-space.js';
import { growHeroCards } from './hero-card-space.js';
// Match the responsive Web wrapper sizes, not platform text measurements.
export function compactTableLayout({
  width,
  height,
  seats,
  displayHeight = 759,
  availableWidth,
  minimumProfileHeight = 0,
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
      : 116;
  const profileHeight = Math.max(
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
  textMetrics['hero-identity-height'] = Math.ceil(textMetrics['hero-identity'] * 1.2);
  textMetrics['player-avatar'] = Math.ceil(
    textMetrics['player-persona'] * 1.15 + 4 + textMetrics['player-stack'] + 2,
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
    alternatives: count === 5 ? [[160, 230, 310, 380]] : count === 9 ? [undefined] : undefined,
    angles:
      count === 5
        ? [180, 240, 300, 360]
        : count === 9
          ? tablet
            ? [120, 160, 200, 240, 300, 340, 380, 420]
            : [150, 180, 210, 240, 300, 330, 360, 390]
          : undefined,
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
  // Board and hole cards should read as one card size. Grow both for each row
  // arrangement, keep the arrangement whose smaller face is largest, then keep
  // either size within 10% of the other. A cap on the on-screen size (after
  // the arena is scaled to fit) stops faces from crowding the felt.
  const faceCap = tablet ? (large ? 84 : 76) : 62;
  const heroOptions = (boardWidth, cap) => ({
    width: heroWidth,
    height: heroHeight,
    maxGrowth: tablet ? 1 : 1.4,
    minimumWidth: heroWidth * 0.65,
    maximumWidth: Math.min(cap, Math.round(boardWidth * 1.1)),
    gap: 18,
  });
  const candidates = [false, true].map((twoRows) => {
    const layout = railLayout({
      ...railOptions,
      publicRows: [publicRow(cardWidth, twoRows)],
    });
    const scale = Math.min(1, height / layout.arenaHeight),
      cap = Math.floor(faceCap / scale);
    const grown = growPublicCards(layout, {
      cardWidth,
      createRow: publicRow,
      gap: 16,
      maximumWidth: cap,
    });
    const hero = growHeroCards(grown.layout, heroOptions(grown.cardWidth, cap));
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
  const chosen =
    tooSmall || (double.readable > single.readable * 1.08 && double.scale >= single.scale * 0.9)
      ? double
      : single;
  let fitted = chosen.layout;
  cardWidth = chosen.cardWidth;
  const heroCards = chosen.hero;
  heroWidth = heroCards.width;
  heroHeight = heroCards.height;
  // On the most crowded small screens readability wins: the board keeps a
  // readable on-screen width even if the hero is held smaller by the seats.
  const boardLimit = Math.max(
    Math.round(heroWidth * 1.1),
    Math.ceil((tablet ? 52 : 40) / chosen.scale),
  );
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
