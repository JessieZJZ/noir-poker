// iPadOS Safari can identify itself as a Mac when requesting desktop sites.
export function isIPad({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  return /iPad/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isTablet(navigator, screen) {
  return isIPad(navigator) || Math.min(screen.width, screen.height) >= 600;
}

export function shouldBlockLandscape({
  native,
  coarsePointer,
  tablet,
  width,
  height,
  type,
  angle,
}) {
  if (tablet || (!native && !coarsePointer) || width <= height) return false;
  // Prefer physical orientation so a portrait keyboard cannot trigger this.
  if (type) return type.startsWith('landscape');
  if (typeof angle === 'number') return Math.abs(angle) % 180 === 90;
  return true;
}

export const isOrientationBlocked = () =>
  globalThis.document?.documentElement.dataset.orientationBlocked === 'true';

export function prepareOrientation(window, document) {
  const dialog = document.querySelector('#orientation-dialog');
  const pointer = window.matchMedia('(pointer: coarse)');
  const update = () => {
    const tablet = isTablet(window.navigator, window.screen);
    document.documentElement.dataset.tablet = String(tablet);
    const blocked = shouldBlockLandscape({
      native: document.documentElement.classList.contains('native-app'),
      coarsePointer: pointer.matches,
      tablet,
      width: window.innerWidth,
      height: window.innerHeight,
      type: window.screen.orientation?.type,
      angle: window.orientation,
    });
    if (blocked === isOrientationBlocked()) return;
    document.documentElement.dataset.orientationBlocked = String(blocked);
    if (blocked) dialog.showModal();
    else dialog.close();
    document.dispatchEvent(new CustomEvent('noir:orientation-state'));
  };
  // The only dismissal is returning to an allowed orientation. A modal in the
  // top layer also blocks settings/review dialogs opened before rotation.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.screen.orientation?.addEventListener('change', update);
  pointer.addEventListener('change', update);
  update();
}
