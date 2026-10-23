// Settled-hand snapshots for Web and native WebViews. IndexedDB holds far more
// than localStorage; the records engine reads synchronously, so every saved
// snapshot is loaded into memory once before the game starts.
const DATABASE = 'noir-records';
const STORE = 'snapshots';
// A WebView may take long to open a new database (first launch after install).
// The game starts after this wait; the store attaches when the database opens.
const OPEN_WAIT_MS = 2500;

export function createRecordSnapshots(indexedDB = globalThis.indexedDB) {
  const items = new Map(),
    removed = new Set();
  let database = null,
    opening = !!indexedDB,
    failed = () => {},
    queue = Promise.resolve();
  const request = (operation) =>
    new Promise((resolve, reject) => {
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
    });
  const persist = (change) => {
    if (!database) return;
    // Writes keep their order; a failure is reported but the copy in memory
    // stays usable for the rest of this run.
    queue = queue
      .then(
        () =>
          new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE, 'readwrite');
            change(transaction.objectStore(STORE));
            transaction.oncomplete = resolve;
            transaction.onerror = transaction.onabort = () => reject(transaction.error);
          }),
      )
      .catch(() => failed());
  };
  async function connect() {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    const connection = await request(open);
    const store = connection.transaction(STORE, 'readonly').objectStore(STORE);
    const [keys, values] = await Promise.all([
      request(store.getAllKeys()),
      request(store.getAll()),
    ]);
    const written = new Set(items.keys());
    keys.forEach((key, index) => {
      const id = String(key);
      if (!items.has(id) && !removed.has(id)) items.set(id, values[index]);
    });
    database = connection;
    opening = false;
    // Catch up with anything this run saved or deleted before the database opened.
    if (written.size || removed.size)
      persist((target) => {
        for (const id of written) if (items.has(id)) target.put(items.get(id), id);
        for (const id of removed) target.delete(id);
      });
  }
  return {
    async prepare() {
      if (!indexedDB) return;
      const connecting = connect().catch(() => {
        opening = false;
        failed();
      });
      await Promise.race([connecting, new Promise((resolve) => setTimeout(resolve, OPEN_WAIT_MS))]);
    },
    available: () => !!database || opening,
    keys: () => [...items.keys()],
    get: (id) => items.get(id) ?? null,
    set(id, text) {
      items.set(id, text);
      removed.delete(id);
      persist((store) => store.put(text, id));
    },
    remove(id) {
      items.delete(id);
      removed.add(id);
      persist((store) => store.delete(id));
    },
    onError(listener) {
      failed = listener;
    },
    flush: () => queue,
  };
}

export const recordSnapshots = createRecordSnapshots();
