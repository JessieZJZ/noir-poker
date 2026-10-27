// Visual geometry only. Game rules and settlements stay in the production engine.
export function sceneGeometry(width, height, count, small) {
  const tight = small && height < 410;
  const profileWidth = small
    ? count <= 6 && width >= 370
      ? 96
      : 86
    : height < 500
      ? 120
      : width < 850
        ? 112
        : 130;
  const inset = profileWidth / 2 + (small ? 5 : 14);
  const map = {
    5: [
      [12, 52],
      [26, 15],
      [74, 15],
      [88, 52],
    ],
    6: [
      [12, 72],
      [14, 35],
      [50, 12],
      [86, 35],
      [88, 72],
    ],
    7: [
      [12, 76],
      [12, 44],
      [29, 12],
      [71, 12],
      [88, 44],
      [88, 76],
    ],
    8: [
      [12, 78],
      [12, 51],
      [18, 25],
      [50, 10],
      [82, 25],
      [88, 51],
      [88, 78],
    ],
    9: [
      [12, 78],
      [12, 53],
      [16, 29],
      [29, 9],
      [71, 9],
      [84, 29],
      [88, 53],
      [88, 78],
    ],
  }[count];
  const seats = map.map(([x, y], index) => ({
    x: Math.max(inset, Math.min(width - inset, (width * x) / 100)),
    y:
      !small && height < 500 && ((count === 6 && index === 2) || (count === 8 && index === 3))
        ? 38
        : Math.max(tight ? 40 : height < 500 && !small ? 38 : 49, (height * y) / 100),
  }));
  return {
    tight,
    profileWidth,
    seats,
    publicY: height * (tight ? 0.45 : 0.46),
    heroY: height * (tight ? 0.85 : 0.86),
    twoRows: small,
    cardWidth: small ? (tight ? 32 : 36) : height < 500 || width < 850 ? 48 : 58,
  };
}
export function installSceneLayout(root = document) {
  const arena = root.querySelector('.felt-area');
  if (!arena) return () => {};
  const apply = () => {
    const doc = document.documentElement;
    const safeTop = parseFloat(doc.style.getPropertyValue('--top')) || 0;
    const safeBottom = parseFloat(doc.style.getPropertyValue('--bottom')) || 0;
    doc.dataset.tight = innerHeight - safeTop - safeBottom < 720 ? 'true' : 'false';
    const { width, height } = arena.getBoundingClientRect();
    const count = arena.querySelectorAll('.seat').length + 1;
    const g = sceneGeometry(width, height, count, innerWidth <= 600);
    doc.dataset.lowDesktop = innerWidth > 600 && height < 500 ? 'true' : 'false';
    doc.dataset.compactScene =
      (innerWidth <= 600 && height < 540) || doc.dataset.lowDesktop === 'true' ? 'true' : 'false';
    document.documentElement.dataset.compact = g.tight ? 'true' : 'false';
    arena.style.setProperty('--profile-width', g.profileWidth + 'px');
    arena.style.setProperty('--card-width', g.cardWidth + 'px');
    const heroHeight = arena.querySelector('.hero')?.offsetHeight || 0;
    const publicHeight = arena.querySelector('.center-board')?.offsetHeight || 0;
    const heroY = Math.min(g.heroY, height - heroHeight / 2 - 9);
    const publicY = Math.min(g.publicY, heroY - heroHeight / 2 - 18 - publicHeight / 2);
    arena.style.setProperty('--public-y', publicY + 'px');
    arena.style.setProperty('--hero-y', heroY + 'px');
    arena.querySelectorAll('.seat').forEach((seat, i) => {
      seat.style.setProperty('--x', g.seats[i].x + 'px');
      seat.style.setProperty('--y', g.seats[i].y + 'px');
    });
    if (count === 6 || count === 8) {
      const topIndex = count === 6 ? 2 : 3;
      const obstacle = arena.querySelectorAll('.seat-action')[topIndex].getBoundingClientRect();
      const potParts = [...arena.querySelectorAll('.pot>span,.pot>strong,.pot>button')].map((el) =>
        el.getBoundingClientRect(),
      );
      const baseY = arena.getBoundingClientRect().top;
      const delta = Math.max(
        0,
        ...potParts
          .filter((p) => p.right > obstacle.left && p.left < obstacle.right)
          .map((p) => obstacle.bottom + 9 - p.top),
      );
      if (delta > 0) arena.style.setProperty('--public-y', publicY + delta + 'px');
    }
  };
  const observer = new ResizeObserver(apply);
  observer.observe(arena);
  apply();
  return () => observer.disconnect();
}
