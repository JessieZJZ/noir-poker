import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function reviewRevision(root = fileURLToPath(new URL('../', import.meta.url))) {
  const hash = createHash('sha256');
  function visit(directory) {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(name);
      else hash.update(name + '\0').update(readFileSync(path.join(root, name)));
    }
  }
  for (const directory of ['src/engine', 'src/review']) visit(directory);
  return hash.digest('hex');
}

// Vite keeps config.define for the lifetime of a dev server. Recompute this
// module's stamp on reload too, including when only a strategy dependency changed.
export function reviewRevisionPlugin(root = fileURLToPath(new URL('../', import.meta.url))) {
  const cacheFile = path.join(root, 'src/review/result-cache.js');
  const directories = ['src/engine', 'src/review'].map((name) => path.join(root, name) + path.sep);
  return {
    name: 'review-cache-source-revision',
    enforce: 'pre',
    configureServer(server) {
      server.watcher.on('change', (file) => {
        if (!directories.some((directory) => file.startsWith(directory))) return;
        const module = server.moduleGraph.getModuleById(cacheFile);
        if (module) server.moduleGraph.invalidateModule(module);
      });
    },
    transform(source, id) {
      if (id.split('?')[0] !== cacheFile) return null;
      return source.replaceAll('__NOIR_REVIEW_REVISION__', JSON.stringify(reviewRevision(root)));
    },
  };
}
