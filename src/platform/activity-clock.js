// Time in the background does not count toward a bot's thinking deadline.
export function createActivityClock(readTime = () => performance.now()) {
  let pausedAt = null;
  let excluded = 0;
  const waiting = new Set();
  return {
    get active() {
      return pausedAt === null;
    },
    now() {
      return (pausedAt ?? readTime()) - excluded;
    },
    setActive(active) {
      if (active === (pausedAt === null)) return false;
      if (!active) pausedAt = readTime();
      else {
        excluded += readTime() - pausedAt;
        pausedAt = null;
        for (const resolve of waiting) resolve();
        waiting.clear();
      }
      return true;
    },
    waitUntilActive() {
      return pausedAt === null ? Promise.resolve() : new Promise((resolve) => waiting.add(resolve));
    },
  };
}
