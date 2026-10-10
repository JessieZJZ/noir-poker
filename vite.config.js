import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { storeProfileSource, storeIndexSource } from './scripts/native-store.mjs';

export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    port: 4173,
    strictPort: true,
    // Native copies are build outputs, not changes to the shared Web source.
    watch: { ignored: ['**/.artifacts/**', '**/android/**', '**/ios/**'] },
  },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' },
  // Controlled scenarios exist only in the test development server. The
  // production build contains neither fixtures nor access to hidden cards.
  plugins: [
    ...(mode === 'native'
      ? [
          {
            name: 'native-offline-store-presentation',
            enforce: 'pre',
            transformIndexHtml: { order: 'pre', handler: storeIndexSource },
            transform(source, id) {
              if (id.endsWith('/src/engine/bot-profiles.js')) return storeProfileSource(source);
              if (!id.endsWith('/src/styles/base.css')) return;
              return source.replace(/^@import url\('https:\/\/fonts\.googleapis\.com[^\n]+\n/, '');
            },
          },
        ]
      : []),
    ...(mode === 'test'
      ? [
          {
            name: 'poker-test-fixtures',
            apply: 'serve',
            transform(source, id) {
              if (!id.endsWith('/src/ui/table-controller.js')) return;
              const helpers = readFileSync(
                new URL('./tests/fixtures/table-fixtures.js', import.meta.url),
                'utf8',
              );
              return source + '\n' + helpers + '\nclearTimeout(timer);';
            },
          },
        ]
      : []),
  ],
}));
