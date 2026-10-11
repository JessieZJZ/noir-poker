import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { descendants, stopOwnedServer } from '../../scripts/native-process.mjs';

test('native cleanup follows only the owned server tree and visits detached children before parents', () => {
  const table = '10 1\n11 10\n12 11\n20 1\n21 20\n30 999\n';
  assert.deepEqual(descendants(table, 10), [12, 11]);
  assert.deepEqual(descendants(table, 20), [21]);
  assert.deepEqual(descendants(table, 99), []);
  assert.deepEqual(stopOwnedServer({ pid: 10, exitCode: 1, signalCode: null }), {
    descendants: [],
    errors: [],
  });
});

test('stopping Appium also stops its detached WDA-like child and leaves another server alive', async (t) => {
  let childPid;
  const root = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { spawn } from 'node:child_process';
       const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'],
         { detached: true, stdio: 'ignore' });
       console.log(child.pid);
       setInterval(() => {}, 1000);`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  t.after(() => {
    root.kill();
    other.kill();
    if (childPid) {
      try {
        process.kill(childPid, 'SIGTERM');
      } catch {}
    }
  });
  const [output] = await once(root.stdout, 'data');
  childPid = Number(output.toString().trim());
  assert.ok(Number.isInteger(childPid));
  const exited = once(root, 'exit');
  const result = stopOwnedServer(root);
  assert.ok(result.descendants.includes(childPid));
  assert.deepEqual(result.errors, []);
  await exited;
  const deadline = Date.now() + 5000;
  let alive = true;
  while (alive && Date.now() < deadline) {
    try {
      process.kill(childPid, 0);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } catch {
      alive = false;
    }
  }
  assert.equal(alive, false, 'Detached test driver must exit after server cleanup');
  assert.doesNotThrow(() => process.kill(other.pid, 0), 'Another test server must remain alive');
});
