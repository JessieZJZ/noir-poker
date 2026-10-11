const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function playerResearchMarkup(profile) {
  const data = profile.research;
  if (!data) return '';
  const references = (ids) =>
    ids
      .map((id) => {
        const index = profile.sources.findIndex((s) => s.id === id);
        const source = profile.sources[index];
        return source
          ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(source.label)}">[${index + 1}]</a>`
          : '';
      })
      .join(' ');
  const claims = (items) =>
    `<ul>${items.map((item) => `<li>${escape(item.text)} ${references(item.sourceIds)}</li>`).join('')}</ul>`;
  return `<section class="profile-research"><div class="profile-overview"><h4>公开资料</h4><p class="profile-evidence">${escape(profile.evidence)}</p><p>${escape(data.identity)}<br>${data.formats.map((format) => `<span>${escape(format)}</span>`).join(' · ')}</p><p class="profile-limits">${escape(data.limits)}</p><p class="profile-research-date"><span>资料核对日期</span> · ${escape(data.reviewedAt)}</p></div>${data.career.length ? `<h4>履历摘录</h4>${claims(data.career)}` : ''}<h4>公开打法样本</h4>${claims(data.observations)}<h4>本地策略改编</h4><ul>${data.adaptation.map((text) => `<li>${escape(text)}</li>`).join('')}</ul></section>`;
}

export function playerSourcesMarkup(profile) {
  return `<div class="profile-source-records">${profile.sources.map((source, i) => `<div><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">[${i + 1}] <span>${escape(source.label)}</span></a><small><span>${escape(source.kind || '')}</span>${source.publishedAt ? ` · ${escape(source.publishedAt)}` : ''}</small>${source.context ? `<p>${escape(source.context)}</p>` : ''}</div>`).join('')}</div>`;
}
