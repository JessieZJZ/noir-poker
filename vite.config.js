import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

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
