import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const portable = await stat(path.join(here, 'assets'))
  .then((x) => x.isDirectory())
  .catch(() => false);
const output = portable
  ? path.join(here, 'output')
  : path.resolve(repo, '.artifacts/art-direction-pr64/green-v2');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 4394;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.md': 'text/plain; charset=utf-8',
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const raw = decodeURIComponent(url.pathname);
      let base = here,
        rel = raw;
      if (raw.startsWith('/assets/')) {
        base = portable ? path.join(here, 'assets') : path.join(repo, 'public');
        rel = raw.slice(8);
      } else if (raw.startsWith('/output/')) {
        base = output;
        rel = raw.slice(8);
      } else if (raw.startsWith('/runtime/')) {
        base = portable ? path.join(here, 'runtime') : path.join(repo, 'src');
        rel = raw.slice(9);
      }
      const file = path.resolve(base, '.' + (rel.startsWith('/') ? rel : '/' + rel));
      if (file !== base && !file.startsWith(base + path.sep)) throw Error('path');
      let target = (await stat(file)).isDirectory() ? path.join(file, 'index.html') : file;
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type': types[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log('NOIR design preview http://127.0.0.1:' + port));
