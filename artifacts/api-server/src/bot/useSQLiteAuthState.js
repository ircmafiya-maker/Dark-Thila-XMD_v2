/**
 * SQLite-backed Baileys Auth State
 *
 * Drop-in replacement for `useMultiFileAuthState`.
 * Stores all WhatsApp session credentials in a single SQLite database
 * so sessions survive across server restarts AND production re-deployments.
 *
 * Usage:
 *   const { state, saveCreds } = await useSQLiteAuthState(dbPath);
 *
 * Where dbPath is e.g. path.join(sessionDir, 'auth.db')
 */

import Database from 'better-sqlite3';
import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';

const KEY_MAP = {
  'pre-key':        'pre-key',
  'session':        'session',
  'sender-key':     'sender-key',
  'app-state-sync-key': 'app-state-sync-key',
  'app-state-sync-version': 'app-state-sync-version',
  'sender-key-memory': 'sender-key-memory',
};

function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS creds (
      id   TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS keys (
      type TEXT NOT NULL,
      id   TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (type, id)
    );
  `);
  return db;
}

export async function useSQLiteAuthState(dbPath) {
  const db = openDb(dbPath);

  // ── Creds ──────────────────────────────────────────────────────────────
  const readCreds = () => {
    const row = db.prepare('SELECT data FROM creds WHERE id = ?').get('creds');
    if (!row) return initAuthCreds();
    try {
      return JSON.parse(row.data, BufferJSON.reviver);
    } catch (_) {
      return initAuthCreds();
    }
  };

  const writeCreds = (creds) => {
    db.prepare('INSERT OR REPLACE INTO creds (id, data) VALUES (?, ?)')
      .run('creds', JSON.stringify(creds, BufferJSON.replacer));
  };

  let creds = readCreds();

  const saveCreds = () => {
    writeCreds(creds);
  };

  // ── Keys ───────────────────────────────────────────────────────────────
  const keys = {
    get: (type, ids) => {
      const data = {};
      for (const id of ids) {
        const row = db.prepare('SELECT data FROM keys WHERE type = ? AND id = ?').get(type, id);
        if (row) {
          try {
            let val = JSON.parse(row.data, BufferJSON.reviver);
            if (type === 'app-state-sync-key' && val && typeof val === 'object' && val.keyData) {
              val = proto.Message.AppStateSyncKeyData.fromObject(val);
            }
            data[id] = val;
          } catch (_) {}
        }
      }
      return data;
    },

    set: (data) => {
      const insert = db.prepare('INSERT OR REPLACE INTO keys (type, id, data) VALUES (?, ?, ?)');
      const del    = db.prepare('DELETE FROM keys WHERE type = ? AND id = ?');

      const tx = db.transaction((updates) => {
        for (const [type, ids] of Object.entries(updates)) {
          for (const [id, value] of Object.entries(ids || {})) {
            if (value == null) {
              del.run(type, id);
            } else {
              insert.run(type, id, JSON.stringify(value, BufferJSON.replacer));
            }
          }
        }
      });

      tx(data);
    },
  };

  return {
    state: {
      creds,
      keys,
    },
    saveCreds,
    close: () => {
      try { db.close(); } catch (_) {}
    },
  };
}
