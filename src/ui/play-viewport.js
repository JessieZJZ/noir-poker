import { COMPACT_PLAY_QUERY } from './play-geometry.js';
import { playSurfaceTop, readPlayViewport } from './stable-viewport.js';
import { entryWelcomeCorridor, entryWelcomeScale } from './entry-welcome-scale.js';
// Keep the whole table in the first screen. Measurements are made at
// scale 1 before fitting, so collision coordinates never mix CSS/visual pixels.
export function createPlayViewport(surface, { layout = () => {}, settled = () => {} } = {}) {
  const viewport = surface.querySelector('.table-viewport'),
    arena = surface.querySelector('.arena'),
    mobile = matchMedia(COMPACT_PLAY_QUERY);
  let frame = null,
    destroyed = false;

  function tightenSeatRanks() {
    for (const seat of arena.querySelectorAll('.seat')) {
      const rank = seat.querySelector('.hand-rank');
      if (!rank) continue;
      const action = seat.querySelector('.seat-action');
      const badge = rank.getBoundingClientRect();
      // Compact layouts place the rank below the last action. Move artwork
      // into unused caption space, preserving the two-line slot and table fit.
      if (action.getBoundingClientRect().top >= badge.top) continue;
      const range = document.createRange();
      range.selectNodeContents(action);
      const lines = [...range.getClientRects()].filter((r) => r.width && r.height);
      if (!lines.length) continue;
      const bottom = Math.max(...lines.map((r) => r.bottom));
      rank.style.translate = `0 ${bottom + 6 - badge.top}px`;
    }
  }

  // Measured at scale 1, like the fit below: the waiting message keeps its
  // on-screen size unless the players beside it would crowd it.
  function waitingMessageScale(box, scale) {
    const welcome = arena.querySelector('.entry-welcome');
    const content = welcome ? [...welcome.children].filter((el) => el.offsetWidth) : [];
    if (surface.dataset.entryState !== 'waiting' || !content.length) return 1 / scale;
    const local = (r) => ({
      left: r.left - box.left,
      top: r.top - box.top,
      width: r.width,
      height: r.height,
    });
    const center = local(arena.querySelector('.table-center').getBoundingClientRect());
    const first = content[0],
      last = content.at(-1);
    // The message's band, in arena units at its full on-screen size.
    const halfHeight = (last.offsetTop + last.offsetHeight - first.offsetTop) / scale / 2;
    const centerY = center.top + center.height / 2;
    const corridor = entryWelcomeCorridor(
      [...arena.querySelectorAll('.seat-profile')].map((el) => local(el.getBoundingClientRect())),
      {
        centerX: center.left + center.width / 2,
        top: centerY - halfHeight,
        bottom: centerY + halfHeight,
      },
    );
    return entryWelcomeScale({
      arenaScale: scale,
      contentWidth: Math.max(...content.map((el) => el.offsetWidth)),
      corridorWidth: corridor * scale,
    });
  }

  function fit() {
    if (destroyed) return;
    if (document.documentElement.dataset.homeScrollLocked === 'true') return;
    arena.style.removeProperty('transform');
    for (const rank of arena.querySelectorAll('.seat .hand-rank'))
      rank.style.removeProperty('translate');
    arena.style.removeProperty('width');
    arena.style.removeProperty('height');
    arena.style.removeProperty('--arena-height');
    arena.classList.remove('compact-landscape');
    arena.classList.remove('public-two-rows');
    const seats = [...arena.querySelectorAll('.seat')];
    for (const seat of seats) {
      seat.dataset.originalLeft ??= seat.style.left;
      seat.dataset.originalTop ??= seat.style.top;
      seat.style.left = seat.dataset.originalLeft;
      seat.style.top = seat.dataset.originalTop;
    }
    const screen = readPlayViewport(),
      screenHeight = screen.height,
      waiting = surface.dataset.entryState === 'waiting',
      height = Math.max(160, screenHeight - playSurfaceTop(surface) - 8);
    const large = screen.width > 900 && screen.width <= 1100 && screenHeight >= 1100;
    // Tablet/desktop CSS follows the final viewport even if WebKit delays a
    // resize or animation callback. Phones retain their stable browser-bar budget.
    const budget =
      screen.width > 600
        ? `max(160px, calc(var(--play-window-height, 100vh) - ${playSurfaceTop(surface) + 8}px))`
        : `${height}px`;
    surface.style.setProperty(
      '--table-header-font',
      `${large ? 20 : screen.width > 600 && mobile.matches ? 17 : 14}px`,
    );
    surface.style.setProperty(
      '--table-hint-font',
      `${large ? 18 : screen.width > 600 ? 14 : 13}px`,
    );
    // The hidden waiting dock still reserves the exact live dock footprint,
    // including the resolved native bottom inset (which may be a CSS max()).
    surface.style.setProperty(
      '--play-height',
      waiting
        ? `max(160px, calc(${budget} - var(--live-dock-height) - var(--dock-bottom-inset)))`
        : budget,
    );
    // A translated or long session label may wrap in the waiting header.
    // Retain its footprint when the shorter live label replaces it, so joining
    // cannot move the felt. Re-measure while waiting after width/font changes.
    if (waiting) {
      const labelHeight = surface.querySelector('.hand-label').getBoundingClientRect().height;
      surface.style.setProperty('--entry-hand-row', `${Math.ceil(labelHeight)}px`);
    }
    // Hidden or rotating WebViews can briefly report a zero-sized viewport.
    // Wait for its resize notification instead of dividing by zero below.
    if (viewport.clientWidth === 0 || viewport.clientHeight === 0) return;
    arena.style.width = `${viewport.clientWidth}px`;
    const landscape = mobile.matches && viewport.clientWidth > 600 && screenHeight < 600;
    arena.classList.toggle('compact-landscape', landscape);
    if (landscape) {
      seats.forEach((seat, index) => {
        seat.style.left = `${((index + 0.5) / seats.length) * 100}%`;
        seat.style.top = '0%';
      });
    }
    const availableHeight = viewport.clientHeight;
    arena.style.height = `${availableHeight}px`;
    layout();
    tightenSeatRanks();

    const box = arena.getBoundingClientRect(),
      parts = [
        ...arena.querySelectorAll(
          '.seat-profile, .mini-cards, .seat-action, .hand-rank, .hero-area, .hero-name, .table-center',
        ),
      ]
        .filter((el) => !el.hidden)
        .map((el) => {
          if (!el.matches('.mini-cards')) return el.getBoundingClientRect();
          // Revealed artwork grows above its stable slot and may overlap the
          // coaching hint. It must not shrink or shift the whole settled table.
          const parent = el.offsetParent.getBoundingClientRect();
          return {
            left: parent.left + el.offsetLeft,
            right: parent.left + el.offsetLeft + el.offsetWidth,
            top: parent.top + el.offsetTop,
            bottom: parent.top + el.offsetTop + el.offsetHeight,
            width: el.offsetWidth,
            height: el.offsetHeight,
          };
        })
        .filter((r) => r.width > 0 && r.height > 0),
      left = Math.min(0, ...parts.map((r) => r.left - box.left)),
      right = Math.max(box.width, ...parts.map((r) => r.right - box.left)),
      topEdge = Math.min(0, ...parts.map((r) => r.top - box.top)),
      bottom = Math.max(box.height, ...parts.map((r) => r.bottom - box.top)),
      scale = Math.min(
        1,
        viewport.clientWidth / (right - left),
        availableHeight / (bottom - topEdge),
      ),
      x = (viewport.clientWidth - (right - left) * scale) / 2 - left * scale,
      y = (availableHeight - (bottom - topEdge) * scale) / 2 - topEdge * scale;
    const entryScale = waitingMessageScale(box, scale);
    arena.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    arena.style.setProperty('--entry-scale', String(entryScale));
    viewport.scrollTop = 0;
    // Sizes kept constant on screen need the arena's final scale.
    settled();
  }
  function schedule() {
    if (destroyed) return;
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      fit();
    });
  }
  function resize() {
    // WebKit can postpone paint-frame callbacks across a viewport rotation.
    // Apply its new geometry in the resize/media event, then refine next frame.
    fit();
    schedule();
  }
  // The viewport's own CSS can settle after the resize event. Do not depend
  // on another paint-frame callback to fit its final dimensions.
  const observer = new ResizeObserver(fit);
  for (const el of [
    document.body,
    document.querySelector('.header'),
    surface,
    viewport,
    surface.querySelector('.surface-top'),
    surface.querySelector('.action-dock'),
  ])
    if (el) observer.observe(el);
  // Responsive card sizes can settle after the outer frame. Refit their
  // absolute footprints next frame, keeping our own size writes out of the
  // ResizeObserver delivery and coalescing both changes into one fit.
  const contentObserver = new ResizeObserver(schedule);
  for (const el of arena.querySelectorAll('.board, .hero-area')) contentObserver.observe(el);
  // Native safe-area values can arrive after the initial document layout
  // without changing innerWidth/innerHeight or emitting a resize event.
  const insetsObserver = new MutationObserver(schedule);
  insetsObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  window.addEventListener('resize', resize);
  window.addEventListener('pageshow', resize);
  window.visualViewport?.addEventListener('resize', resize);
  mobile.addEventListener('change', resize);
  document.fonts.ready.then(schedule);
  return {
    destroy() {
      destroyed = true;
      observer.disconnect();
      contentObserver.disconnect();
      insetsObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pageshow', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      mobile.removeEventListener('change', resize);
    },
    update(nextTable, done) {
      surface.classList.toggle('has-live-hand', !done);
      fit();
      schedule();
    },
  };
}
