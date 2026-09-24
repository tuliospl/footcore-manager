// IndexedDB keeps full world careers and their recovery copy outside localStorage's small quota.
export async function openCareerRepository(factory = indexedDB) {
  let database = null;
  let opening = null;
  const connect = async () => {
    if (database) return database;
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      let request;
      try { request = factory.open('footcore-careers', 1); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('careers')) request.result.createObjectStore('careers');
      };
      request.onsuccess = () => {
        const connection = request.result;
        connection.onversionchange = () => connection.close();
        connection.onclose = () => { if (database === connection) database = null; };
        database = connection;
        resolve(connection);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('O salvamento está aberto em outra aba.'));
    });
    try { return await opening; }
    finally { opening = null; }
  };
  const isClosedConnection = error => error?.name === 'InvalidStateError' || /connection is (closing|closed)|database connection is closing/i.test(error?.message || '');
  const withConnection = async operation => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const connection = await connect();
      try { return await operation(connection); }
      catch (error) {
        if (attempt || !isClosedConnection(error)) throw error;
        if (database === connection) database = null;
        try { connection.close(); } catch {}
      }
    }
  };
  let queue = Promise.resolve();
  let hasBackup = false;
  const read = key => withConnection(connection => new Promise((resolve, reject) => {
    let request;
    try { request = connection.transaction('careers').objectStore('careers').get(key); }
    catch (error) { reject(error); return; }
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  }));
  const write = entries => {
    // Capture now: callers may change the live match before this transaction starts.
    const snapshot = structuredClone(entries);
    const operation = queue.then(() => withConnection(connection => new Promise((resolve, reject) => {
      let tx;
      try { tx = connection.transaction('careers', 'readwrite'); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Falha ao salvar a carreira.'));
      for (const [key, value] of snapshot) tx.objectStore('careers').put(value, key);
    })));
    queue = operation.catch(() => {});
    return operation;
  };
  await connect();
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
