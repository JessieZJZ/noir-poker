import { spawnSync } from 'node:child_process';

// WDA starts xcodebuild detached. Stopping only Appium leaves that child alive
// after a failed session setup, so capture descendants before stopping Appium.
export function descendants(table, rootPid) {
  const children = new Map();
  for (const line of table.trim().split('\n')) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(parent) || parent < 0) continue;
    const siblings = children.get(parent) ?? [];
    siblings.push(pid);
    children.set(parent, siblings);
  }
  const visited = new Set([rootPid]);
  const result = [];
  const walk = (parent) => {
    for (const pid of children.get(parent) ?? []) {
      if (visited.has(pid)) continue;
      visited.add(pid);
      walk(pid);
      result.push(pid);
    }
  };
  walk(rootPid);
  return result;
}

export function stopOwnedServer(server) {
  const result = { descendants: [], errors: [] };
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return result;
  const table = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 5000 });
  if (table.status === 0) {
    result.descendants = descendants(table.stdout, server.pid);
    for (const pid of result.descendants) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') result.errors.push(`${pid}: ${error.message}`);
      }
    }
  } else result.errors.push(`Cannot inspect Appium descendants: ${table.error || table.stderr}`);
  server.kill('SIGTERM');
  return result;
}
