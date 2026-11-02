const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function playerResearchMarkup(profile) {
  const data = profile.character;
  if (!data) return '';
  return (
    '<section class="profile-research profile-character">' +
    data.sections
      .map(
        (section) =>
          '<section class="character-section"><h4>' +
          escape(section.title) +
          '</h4>' +
          section.paragraphs.map((text) => '<p>' + escape(text) + '</p>').join('') +
          '</section>',
      )
      .join('') +
    '</section>'
  );
}
export function playerSourcesMarkup() {
  return '';
}
