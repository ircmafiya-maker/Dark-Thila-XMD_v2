/**
 * MongoDB-backed Baileys Auth State
 *
 * Drop-in replacement for `useSQLiteAuthState`.
 * Stores all WhatsApp session credentials + signal keys in MongoDB so
 * sessions survive across server restarts AND production re-deployments
 * (e.g. Render Free tier ephemeral disk wipes).
 *
 * Usage:
 *   const { state, saveCreds, close } = await useMongoAuthState({
 *     uri: process.env.MONGODB_URI,
 *     sessionId: 'abc-123',
 *   });
 *
 * Schema:
 *   collection `bot_creds` — { _id: sessionId, data: <JSON-string> }
 *   collection `bot_keys`  — { _id: `${sessionId}::${type}::${id}`,
 *                               sessionId, type, id, data: <JSON-string> }
 *
 * Performance + safety notes:
 *   - One shared MongoClient per process (cached by URI; failed connect
 *     promises are evicted so the next call retries fresh)
 *   - Per-instance ordered write queue for keys.set so concurrent calls to
 *     the same key cannot complete out-of-order. close() awaits the queue.
 *   - 50ms debounce on saveCreds; close() flushes any pending creds write.
 *   - Bounded LRU keyCache (default 5000 entries) so long sessions don't
 *     leak memory through the negative-lookup cache.
 *   - Bounded retries with backoff on write failures.
 */

import { MongoClient } from 'mongodb';
import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';

// ── Shared connection pool (one per URI) ──────────────────────────────────
const _clientCache = new Map(); // uri -> Promise<MongoClient>
const _initialized = new Set(); // db.databaseName key -> indexes ensured

function _getClient(uri) {
  if (!uri) throw new Error('useMongoAuthState: MONGODB_URI is required');
  if (_clientCache.has(uri)) return _clientCache.get(uri);
  const p = (async () => {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
    });
    await client.connect();
    console.log('[useMongoAuthState] Connected to MongoDB');
    return client;
  })();
  // If the connect promise rejects, evict it so the next caller retries fresh.
  p.catch((e) => {
    if (_clientCache.get(uri) === p) _clientCache.delete(uri);
    console.error('[useMongoAuthState] Initial connect failed:', e?.message || e);
  });
  _clientCache.set(uri, p);
  return p;
}

async function _ensureIndexes(db) {
  const key = db.databaseName;
  if (_initialized.has(key)) return;
  try {
    await db.collection('bot_keys').createIndex({ sessionId: 1, type: 1 });
  } catch (_) {}
  _initialized.add(key);
}

// ── Tiny LRU bounded map ─────────────────────────────────────────────────
class LruMap {
  constructor(max = 5000) {
    this.max = max;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  has(k) { return this.map.has(k); }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
  clear() { this.map.clear(); }
}

// Bounded retry helper for transient Mongo failures
async function _withRetry(label, fn, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const wait = Math.min(1000 * attempt, 3000);
      console.error(`[useMongoAuthState] ${label} attempt ${attempt}/${maxAttempts} failed: ${e?.message || e}`);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export async function useMongoAuthState({ uri, sessionId }) {
  if (!sessionId) throw new Error('useMongoAuthState: sessionId is required');

  const client = await _getClient(uri);
  const db = client.db();
  const credsCol = db.collection('bot_creds');
  const keysCol = db.collection('bot_keys');
  await _ensureIndexes(db);

  // ── Creds ───────────────────────────────────────────────────────────────
  const readCreds = async () => {
    const row = await _withRetry('readCreds', () => credsCol.findOne({ _id: sessionId }));
    if (!row) return initAuthCreds();
    try {
      return JSON.parse(row.data, BufferJSON.reviver);
    } catch (_) {
      return initAuthCreds();
    }
  };

  const writeCreds = async (creds) => {
    await _withRetry('writeCreds', () =>
      credsCol.updateOne(
        { _id: sessionId },
        { $set: { data: JSON.stringify(creds, BufferJSON.replacer), updatedAt: new Date() } },
        { upsert: true }
      )
    );
  };

  let creds = await readCreds();

  // Save coalescer: many quick saveCreds() calls collapse into one write
  let credsTimer = null;
  let credsPending = false;
  let credsInflight = null;
  const saveCreds = () => {
    credsPending = true;
    if (credsTimer) return Promise.resolve();
    return new Promise((resolve) => {
      credsTimer = setTimeout(async () => {
        credsTimer = null;
        if (!credsPending) return resolve();
        credsPending = false;
        credsInflight = (async () => {
          try { await writeCreds(creds); }
          catch (e) { console.error('[useMongoAuthState] writeCreds error:', e?.message || e); }
          finally { credsInflight = null; }
        })();
        await credsInflight;
        resolve();
      }, 50);
    });
  };

  // ── Keys: ordered per-session write queue ──────────────────────────────
  // Bounded LRU cache for key lookups (positive + negative)
  const keyCache = new LruMap(5000);

  // Single-channel queue: each enqueue chains onto the previous tail. This
  // guarantees writes for *this session* execute in submission order, so
  // two updates to the same key cannot complete out-of-order.
  let writeChain = Promise.resolve();
  let pendingOps = 0;

  const _docId = (type, id) => `${sessionId}::${type}::${id}`;

  const keys = {
    get: async (type, ids) => {
      const data = {};
      const missing = [];
      for (const id of ids) {
        const ck = `${type}::${id}`;
        if (keyCache.has(ck)) {
          const v = keyCache.get(ck);
          if (v != null) data[id] = v;
        } else {
          missing.push(id);
        }
      }
      if (missing.length) {
        try {
          const docIds = missing.map((id) => _docId(type, id));
          const rows = await _withRetry('keys.get', () =>
            keysCol.find({ _id: { $in: docIds } }).toArray()
          );
          const found = new Map(rows.map((r) => [r._id, r]));
          for (const id of missing) {
            const r = found.get(_docId(type, id));
            if (!r) {
              keyCache.set(`${type}::${id}`, null);
              continue;
            }
            try {
              let val = JSON.parse(r.data, BufferJSON.reviver);
              if (type === 'app-state-sync-key' && val && typeof val === 'object' && val.keyData) {
                val = proto.Message.AppStateSyncKeyData.fromObject(val);
              }
              keyCache.set(`${type}::${id}`, val);
              data[id] = val;
            } catch (_) {
              keyCache.set(`${type}::${id}`, null);
            }
          }
        } catch (e) {
          // Mongo read failed — return only what we had cached so Baileys
          // can decide whether to retry. Don't bubble — Baileys handles missing keys.
          console.error('[useMongoAuthState] keys.get failed (returning partial):', e?.message || e);
        }
      }
      return data;
    },

    set: (data) => {
      // Build bulk ops + update cache synchronously (so subsequent get() calls
      // see the new value), then enqueue the actual Mongo bulkWrite onto the
      // ordered write chain.
      const ops = [];
      for (const [type, ids] of Object.entries(data)) {
        for (const [id, value] of Object.entries(ids || {})) {
          const ck = `${type}::${id}`;
          if (value == null) {
            keyCache.set(ck, null);
            ops.push({ deleteOne: { filter: { _id: _docId(type, id) } } });
          } else {
            keyCache.set(ck, value);
            ops.push({
              updateOne: {
                filter: { _id: _docId(type, id) },
                update: {
                  $set: {
                    sessionId,
                    type,
                    id,
                    data: JSON.stringify(value, BufferJSON.replacer),
                    updatedAt: new Date(),
                  },
                },
                upsert: true,
              },
            });
          }
        }
      }
      if (ops.length === 0) return;
      pendingOps++;
      writeChain = writeChain.then(async () => {
        try {
          await _withRetry('keys.bulkWrite', () => keysCol.bulkWrite(ops, { ordered: true }));
        } catch (e) {
          console.error('[useMongoAuthState] keys.bulkWrite error (gave up):', e?.message || e);
        } finally {
          pendingOps--;
        }
      });
    },
  };

  // Wait for all pending writes to flush to Mongo
  const flush = async () => {
    if (credsTimer) {
      clearTimeout(credsTimer);
      credsTimer = null;
      if (credsPending) {
        credsPending = false;
        try { await writeCreds(creds); }
        catch (e) { console.error('[useMongoAuthState] flush writeCreds error:', e?.message || e); }
      }
    }
    if (credsInflight) { try { await credsInflight; } catch (_) {} }
    try { await writeChain; } catch (_) {}
  };

  return {
    state: { creds, keys },
    saveCreds,
    flush,
    close: async () => {
      await flush();
      keyCache.clear();
      // Note: do NOT close the shared client — other sessions may use it
    },
  };
}

/**
 * Delete every document for a session.  Call when a session is permanently
 * removed (e.g. user logs out).
 */
export async function deleteMongoAuthState({ uri, sessionId }) {
  if (!uri || !sessionId) return;
  try {
    const client = await _getClient(uri);
    const db = client.db();
    await Promise.all([
      db.collection('bot_creds').deleteOne({ _id: sessionId }),
      db.collection('bot_keys').deleteMany({ sessionId }),
    ]);
  } catch (e) {
    console.error('[deleteMongoAuthState] error:', e?.message || e);
  }
}
