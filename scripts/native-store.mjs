import babel from 'prettier/plugins/babel';
import {
  STORE_PROFILE_NAMES,
  STORE_PROFILE_NOTICE,
  STORE_PROFILE_TITLE,
} from '../src/engine/store-profiles.js';
export function storeProfileSource(source) {
  const ast = babel.parsers.babel.parse(source);
  const declaration = ast.program.body.find(
    (n) =>
      n.type === 'ExportNamedDeclaration' &&
      n.declaration?.declarations?.some((d) => d.id.name === 'BOT_PROFILES'),
  );
  const array = declaration?.declaration.declarations.find(
    (d) => d.id.name === 'BOT_PROFILES',
  )?.init;
  if (array?.type !== 'ArrayExpression')
    throw new Error('BOT_PROFILES structure changed; review native presentation transform');
  const edits = [];
  for (const profile of array.elements) {
    const id = profile.properties.find((p) => p.key.name === 'id').value.value;
    const name = STORE_PROFILE_NAMES[id];
    if (!name) throw new Error('Store presentation missing profile: ' + id);
    for (const property of profile.properties) {
      const key = property.key.name;
      if (['name', 'short', 'evidence', 'sources', 'research'].includes(key)) {
        const value =
          key === 'research'
            ? null
            : key === 'sources'
              ? []
              : key === 'evidence'
                ? STORE_PROFILE_NOTICE
                : name;
        edits.push({
          start: property.value.start,
          end: property.value.end,
          value: JSON.stringify(value),
        });
      }
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  return source;
}
export function storeIndexSource(source) {
  return source
    .replace(
      /<div class="persona-notice">[\s\S]*?<\/div>/,
      `<div class="persona-notice"><h4>${STORE_PROFILE_TITLE}</h4><p>${STORE_PROFILE_NOTICE}</p></div>`,
    )
    .replace(
      /<details data-persona-reference>[\s\S]*?<\/details>/,
      `<details><summary>${STORE_PROFILE_TITLE}</summary><p>${STORE_PROFILE_NOTICE}</p></details>`,
    )
    .replace(/<p data-persona-reference>[\s\S]*?<\/p>/, `<p>${STORE_PROFILE_NOTICE}</p>`);
}
