import { railLayout } from './rail-layout.js';
// Match the responsive Web wrapper sizes, not platform text measurements.
export function compactTableLayout({ width, height, seats, displayHeight = 759, availableWidth }) {
  const count = seats.length + 1;
  const tablet = width > 600 && width <= 1100;
  const large = width > 900 && displayHeight >= 1100 && displayHeight > width;
  const roomy = width <= 600 && displayHeight >= 740 && count <= 6;
  const cardWidth = tablet
    ? large
      ? 82
      : width <= 900
        ? 98
        : 82
    : width <= 360
      ? 50
      : Math.max(44, Math.min(54, width * 0.12));
  const cardHeight = tablet ? (large ? 118 : width <= 900 ? 141 : 118) : cardWidth * 1.44;
  const heroWidth = tablet
    ? large
      ? 94
      : width <= 900
        ? 112
        : 94
    : roomy
      ? 68
      : width <= 360
        ? 72
        : Math.max(61, Math.min(72, width * 0.12));
  const heroHeight = tablet
    ? large
      ? 136
      : width <= 900
        ? 161
        : 136
    : roomy
      ? 98
      : width <= 360
        ? 104
        : Math.max(88, Math.min(104, width * 0.174));
  const profileWidth = tablet
    ? large
      ? 176
      : width <= 900
        ? 160
        : 132
    : roomy
      ? Math.max(108, Math.min(122, width * 0.277))
      : 92;
  const profileHeight = tablet ? (large ? 112 : 92) : roomy ? 72 : 60;
  const seatWidth = Math.round(Math.max(profileWidth, tablet ? (large ? 180 : 136) : 88));
  const seatHeight = tablet ? (large ? 258 : 223) : roomy ? 169 : 157;
  const heroFoot = Math.round(heroHeight + (tablet ? (large ? 92 : 71) : 66));
  const potHeight = tablet ? (large ? 50 : 40) : 32;
  const rowGap = 4;
  const fitted = railLayout({
    width:
      availableWidth ?? Math.round(Math.max(1, width - (width <= 600 ? 26 : width * 0.06 + 2))),
    height: Math.max(1, height),
    alternatives: count === 9 ? [undefined] : undefined,
    angles:
      count === 5
        ? [180, 240, 300, 360]
        : count === 9
          ? [140, 170, 210, 250, 290, 330, 370, 400]
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
          left: (seatWidth - (tablet ? (large ? 180 : 136) : roomy ? profileWidth : 88)) / 2,
          top: (tablet ? 58 : 39) + 8 + profileHeight,
          width: tablet ? (large ? 180 : 136) : roomy ? profileWidth : 88,
          height: tablet ? (large ? 80 : 65) : 50,
        },
      ],
    })),
    hero: { width: Math.round(heroWidth * 2 + 7), height: heroFoot },
    publicRows: [false, true].map((twoRows) => {
      const boardWidth = Math.ceil((twoRows ? 3 : 5) * cardWidth + (twoRows ? 8 : 16));
      const potWidth = Math.min(boardWidth, tablet ? (large ? 260 : 220) : 160);
      return {
        twoRows,
        centerY: potHeight + 6 + (cardHeight * (twoRows ? 2 : 1) + (twoRows ? 10 : 0)) / 2,
        width: Math.ceil((twoRows ? 3 : 5) * cardWidth + (twoRows ? 8 : 16)),
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
    }),
  });
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
    heroFoot,
    seatWidth,
    seatHeight,
    profileWidth,
    profileHeight,
    potHeight,
    rowGap,
    roomy,
    large,
    tablet,
    feltStyle: `left:${fitted.table.left}px;top:${fitted.table.top}px;width:${fitted.table.width}px;height:${fitted.table.height}px;right:auto;bottom:auto;`,
    heroStyle: `left:${fitted.hero.left}px;top:${fitted.hero.top}px;width:${fitted.hero.width}px;height:${fitted.hero.height}px;bottom:auto;transform:none;`,
  };
}
