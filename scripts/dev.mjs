import { spawn } from 'node:child_process';
import { root } from './mobile-lib.mjs';

const children = [
  spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', ...process.argv.slice(2)],
    { cwd: root, stdio: 'inherit' },
  ),
  spawn(process.execPath, ['scripts/wechat.mjs', 'watch'], { cwd: root, stdio: 'inherit' }),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!closing) stop(code || (signal ? 1 : 0));
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
