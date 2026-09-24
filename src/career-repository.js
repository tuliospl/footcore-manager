// IndexedDB keeps full world careers and their recovery copy outside localStorage's small quota.
export async function openCareerRepository(factory = indexedDB) {
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('footcore-careers', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('careers');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let queue = Promise.resolve();
  let hasBackup = false;
  const read = key => new Promise((resolve, reject) => {
    const request = db.transaction('careers').objectStore('careers').get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  const write = entries => {
    // Capture now: callers may change the live match before this transaction starts.
    const snapshot = structuredClone(entries);
    const operation = queue.then(() => new Promise((resolve, reject) => {
      const tx = db.transaction('careers', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Falha ao salvar a carreira.'));
      for (const [key, value] of snapshot) tx.objectStore('careers').put(value, key);
    }));
    queue = operation.catch(() => {});
    return operation;
  };
  hasBackup = !!await read('previous');
  return {
    get hasBackup() { return hasBackup; },
    async load(storage, legacyKey) {
      const saved = await read('current');
      if (saved) return saved;
      const legacy = storage.getItem(legacyKey);
      if (!legacy) return null;
      const current = JSON.parse(legacy);
      const previous = storage.getItem(`${legacyKey}-previous`);
      await write([['current', current], ...(previous ? [['previous', JSON.parse(previous)]] : [])]);
      hasBackup = !!previous;
      // Keep the legacy copy intact as an additional recovery path.
      return current;
    },
    save(game) { return write([['current', game]]); },
    async replace(current, next) {
      await write([['current', next], ...(current ? [['previous', current]] : [])]);
      if (current) hasBackup = true;
    },
    async restore(current) {
      await queue;
      const previous = await read('previous');
      if (!previous?.clubs?.some(c => c.id === previous.userClubId) || !Array.isArray(previous.schedule)) throw new Error('Nenhuma carreira anterior válida está disponível.');
      if (previous.activeMatch?.phase === 'playing') previous.activeMatch.phase = 'paused';
      await this.replace(current, previous);
      return previous;
    }
  };
}
