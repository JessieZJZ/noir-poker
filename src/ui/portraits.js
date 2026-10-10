// Presentation-only assets: profile IDs stay stable in saved settings and hands.
export const PROFILE_PORTRAITS = {
  tan: {
    src: '/portraits/tan.jpeg',
    source: 'https://cash-game-invitational-1.triton-series.com/',
    credit: 'Triton Poker Series',
  },
  st: {
    src: '/portraits/st.jpeg',
    source: 'https://cash-game-invitational-1.triton-series.com/',
    credit: 'Triton Poker Series',
  },
  zang: {
    src: '/portraits/zang.jpeg',
    source: 'https://cash-game-invitational-1.triton-series.com/',
    credit: 'Triton Poker Series',
  },
  peter: {
    src: '/portraits/peter.webp',
    source: 'https://toppokerstreamers.com/player/peter-entrepreneur/',
    credit: 'Top Poker Streamers · HCL',
    position: '65% top',
    zoom: 1.65,
    origin: '50% top',
  },
  abao: {
    src: '/portraits/abao.png',
    source:
      'https://pokerati.com/2026/08/top-streamed-hands-of-the-week-malinowski-and-dwan-take-on-the-kpc-high-rollers/',
    credit: 'KPC Live · Pokerati',
    // Use the explicitly labelled A BAO headshot within the original frame.
    position: 'left center',
    zoom: 8,
    origin: '10.9% 54.8%',
  },
  viktor: {
    src: '/portraits/viktor.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Viktor_Blom_at_a_poker_event.jpg',
    credit: 'Danny Maxwell Photography · CC BY-SA 4.0',
    position: '50% 10%',
  },
  jungleman: {
    src: '/portraits/jungleman.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Daniel_Cates_2018.jpg',
    credit: '888poker Spain · CC BY 3.0',
    position: '50% 5%',
    zoom: 1.35,
    origin: '50% top',
  },
  dwan: {
    src: '/portraits/dwan.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Tom_Dwan_2021.jpg',
    credit: 'World Poker Tour · CC BY 3.0',
    position: '50% top',
  },
};

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function portraitContent(profileId, fallback, initialSource = null) {
  const photo = import.meta.env?.MODE === 'native' ? null : PROFILE_PORTRAITS[profileId];
  return `<span class="portrait-fallback" aria-hidden="true"${initialSource ? ` data-i18n-initial="${escape(initialSource)}"` : ''}>${escape(fallback)}</span>${photo ? `<img class="persona-portrait" data-portrait-profile="${profileId}" src="${photo.src}" alt="" decoding="async" style="object-position:${photo.position || 'center'};--portrait-zoom:${photo.zoom || 1};--portrait-origin:${photo.origin || 'center'}" />` : ''}`;
}

export function portraitCredit(profileId) {
  const photo = import.meta.env?.MODE === 'native' ? null : PROFILE_PORTRAITS[profileId];
  return photo
    ? `<a class="profile-photo-credit" href="${photo.source}" target="_blank" rel="noopener noreferrer">头像：${photo.credit}</a>`
    : '';
}

export function preparePortraits(root) {
  for (const image of root.querySelectorAll('img[data-portrait-profile]')) {
    const fallback = () => (image.hidden = true);
    image.addEventListener('error', fallback, { once: true });
    if (image.complete && !image.naturalWidth) fallback();
  }
}
