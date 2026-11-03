// Original illustrations; profile IDs also preserve saved configuration.
export const PROFILE_PORTRAITS = {
  rook: {
    src: '/portraits/rook.jpg',
    position: '50% 35%',
  },
  vale: {
    src: '/portraits/vale.jpg',
    position: '50% 35%',
  },
  slate: {
    src: '/portraits/slate.jpg',
    position: '50% 35%',
  },
  jett: {
    src: '/portraits/jett.jpg',
    position: '50% 35%',
  },
  mira: {
    src: '/portraits/mira.jpg',
    position: '50% 35%',
  },
  knox: {
    src: '/portraits/knox.jpg',
    position: '50% 35%',
  },
  theo: {
    src: '/portraits/theo.jpg',
    position: '50% 35%',
  },
  finn: {
    src: '/portraits/finn.jpg',
    position: '50% 35%',
  },
  sage: {
    src: '/portraits/sage.jpg',
    position: '50% 35%',
  },
  nico: {
    src: '/portraits/nico.jpg',
    position: '50% 35%',
  },
  bram: {
    src: '/portraits/bram.jpg',
    position: '50% 35%',
  },
  leon: {
    src: '/portraits/leon.jpg',
    position: '50% 35%',
  },
  owen: {
    src: '/portraits/owen.jpg',
    position: '50% 35%',
  },
  ezra: {
    src: '/portraits/ezra.jpg',
    position: '50% 35%',
  },
  luka: {
    src: '/portraits/luka.jpg',
    position: '50% 35%',
  },
  iris: {
    src: '/portraits/iris.jpg',
    position: '50% 35%',
  },
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function portraitContent(profileId, fallback, initialSource = null) {
  const photo = PROFILE_PORTRAITS[profileId];
  return `<span class="portrait-fallback" aria-hidden="true"${initialSource ? ` data-i18n-initial="${escape(initialSource)}"` : ''}>${escape(fallback)}</span>${photo ? `<img class="persona-portrait" data-portrait-profile="${profileId}" src="${photo.src}" alt="" decoding="async" style="object-position:${photo.position || 'center'};--portrait-zoom:${photo.zoom || 1};--portrait-origin:${photo.origin || 'center'}" />` : ''}`;
}

export function portraitCredit() {
  return '';
}

export function preparePortraits(root) {
  for (const image of root.querySelectorAll('img[data-portrait-profile]')) {
    const fallback = () => (image.hidden = true);
    image.addEventListener('error', fallback, { once: true });
    if (image.complete && !image.naturalWidth) fallback();
  }
}
