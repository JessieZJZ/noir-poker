import { COMPACT_PLAY_QUERY } from './play-geometry.js';

// Browser bars and keyboards change the visible height while scrolling. A
// compact table keeps its first layout budget until its width or orientation
// changes; live and saved tables share the same budget in this document.
export function createStableViewport() {
  let baseline = null;
  return {
    read({ width, height, orientation, compact }) {
      if (!baseline || width !== baseline.width || orientation !== baseline.orientation || !compact)
        baseline = { width, height, orientation };
      return { ...baseline };
    },
    reset() {
      baseline = null;
    },
  };
}

const stable = createStableViewport();
let probe;
export function readPlayViewport() {
  const compact = matchMedia(COMPACT_PLAY_QUERY).matches;
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none;contain:strict';
    document.body.append(probe);
  }
  return stable.read({
    width: window.innerWidth,
    height: compact
      ? probe.getBoundingClientRect().height || window.innerHeight
      : window.innerHeight,
    orientation: window.screen.orientation?.type ?? '',
    compact,
  });
}

export function playSurfaceTop(surface) {
  const header = document.querySelector('.header');
  const main = surface.closest('.main');
  // A sticky header's visual bottom plus scrollY is not its original offset.
  // Use its fixed footprint so a refit never feeds page scrolling into height.
  return (
    (header?.offsetHeight || 0) +
    (parseFloat(header && getComputedStyle(header).top) || 0) +
    (parseFloat(main && getComputedStyle(main).paddingTop) || 0)
  );
}
