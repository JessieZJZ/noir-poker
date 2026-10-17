// Generate the Chinese guide from the same source shown by Web and native.
// Only this known, local HTML fragment is converted; it is never remote input.
export function guideTemplate(html) {
  const dialog = html.match(/<dialog id="rules-dialog"[\s\S]*?<\/dialog>/)[0];
  const guideBody = dialog.match(/<div class="guide-body">([\s\S]*)<\/div>\s*<\/dialog>/);
  const body = guideBody
    ? guideBody[1]
    : dialog.slice(dialog.indexOf('<h2'), dialog.lastIndexOf('</dialog>'));
  let detail = -1;
  let current = -1;
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[\w-]+\b[^>]*>/g, (tag) => {
      const closing = tag.startsWith('</');
      const name = tag.match(/^<\/?([\w-]+)/)[1];
      const classes = tag.match(/class="([^"]+)"/)?.[1] || '';
      if (closing) {
        if (name === 'details') return '</view></view>';
        if (name === 'summary') return `</view><view wx:if="{{guideExpanded[${current}]}}">`;
        return `</${['span', 'i', 'b', 'a'].includes(name) ? 'text' : name === 'button' ? 'button' : 'view'}>`;
      }
      if (name === 'details') {
        current = ++detail;
        return '<view class="guide-details">';
      }
      if (name === 'summary')
        return `<view class="guide-summary" data-index="${current}" bindtap="toggleGuide">`;
      if (name === 'a') {
        const href = tag.match(/href="([^"]+)"/)?.[1];
        return `<text class="guide-link" data-url="${href}" bindtap="copyGuideSource">`;
      }
      if (name === 'button') return '<button class="primary return-button" bindtap="closeGuide">';
      const target = ['span', 'i', 'b'].includes(name) ? 'text' : 'view';
      return `<${target} class="guide-${name}${classes ? ' ' + classes : ''}">`;
    })
    .replace(/>[^<]+</g, (text) => text.replace(/\s+/g, ' '));
}
