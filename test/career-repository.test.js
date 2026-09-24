import test from 'node:test';
import assert from 'node:assert/strict';
import { openCareerRepository } from '../src/career-repository.js';

function closingFactory() {
  const values = new Map();
  let opens = 0;
  let firstTransactions = 0;
  return {
    get opens() { return opens; },
    values,
    open() {
      const request = {};
      queueMicrotask(() => {
        opens += 1;
        const currentOpen = opens;
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            if (currentOpen === 1 && firstTransactions++ === 1) {
              const error = new Error('The database connection is closing.');
              error.name = 'InvalidStateError';
              throw error;
            }
            const transaction = {
              error: null,
              objectStore() {
                return {
                  get(key) {
                    const read = {};
                    queueMicrotask(() => { read.result = values.get(key); read.onsuccess?.(); });
                    return read;
                  },
                  put(value, key) { values.set(key, value); }
                };
              }
            };
            queueMicrotask(() => transaction.oncomplete?.());
            return transaction;
          }
        };
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('reopens IndexedDB when a mobile browser closes the connection before saving', async () => {
  const factory = closingFactory();
  const repository = await openCareerRepository(factory);
  const career = { userClubId: 'botafogo', clubs: [], schedule: [] };
  await repository.save(career);
  assert.equal(factory.opens, 2);
  assert.deepEqual(factory.values.get('current'), career);
});
