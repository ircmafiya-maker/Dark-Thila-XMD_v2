import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, "../../../sessions/users.json");

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
  createdAt: string;
}

// ── DB pool (optional) ────────────────────────────────────────────────────────
let pool: pg.Pool | null = null;
let dbReady = false;

const getPool = () => {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
};

const ensureTable = async (): Promise<boolean> => {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS dashboard_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    dbReady = true;
    return true;
  } catch (e) {
    console.error("[userStore] DB table init failed, using file fallback:", e);
    return false;
  }
};

// Initialize DB table on module load
ensureTable().then(ok => {
  if (ok) console.log("[userStore] PostgreSQL users table ready");
  else console.log("[userStore] Using file-based user storage");
});

// ── File fallback helpers ─────────────────────────────────────────────────────
const fileReadUsers = (): User[] => {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch { return []; }
};

const fileWriteUsers = (users: User[]) => {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// ── Row mapper ────────────────────────────────────────────────────────────────
const rowToUser = (row: any): User => ({
  id: row.id,
  username: row.username,
  email: row.email,
  passwordHash: row.password_hash,
  role: row.role as "admin" | "user",
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
});

// ── Public async API ──────────────────────────────────────────────────────────
export const getAllUsers = async (): Promise<User[]> => {
  if (dbReady) {
    try {
      const { rows } = await pool!.query("SELECT * FROM dashboard_users ORDER BY created_at ASC");
      return rows.map(rowToUser);
    } catch (e) {
      console.error("[userStore] getAllUsers DB error, falling back to file:", e);
    }
  }
  return fileReadUsers();
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  if (dbReady) {
    try {
      const { rows } = await pool!.query(
        "SELECT * FROM dashboard_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [email]
      );
      return rows[0] ? rowToUser(rows[0]) : null;
    } catch (e) {
      console.error("[userStore] getUserByEmail DB error:", e);
    }
  }
  const users = fileReadUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
};

export const getUserByUsername = async (username: string): Promise<User | null> => {
  if (dbReady) {
    try {
      const { rows } = await pool!.query(
        "SELECT * FROM dashboard_users WHERE LOWER(username) = LOWER($1) LIMIT 1",
        [username]
      );
      return rows[0] ? rowToUser(rows[0]) : null;
    } catch (e) {
      console.error("[userStore] getUserByUsername DB error:", e);
    }
  }
  const users = fileReadUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase()) ?? null;
};

export const getUserById = async (id: string): Promise<User | null> => {
  if (dbReady) {
    try {
      const { rows } = await pool!.query("SELECT * FROM dashboard_users WHERE id = $1", [id]);
      return rows[0] ? rowToUser(rows[0]) : null;
    } catch (e) {
      console.error("[userStore] getUserById DB error:", e);
    }
  }
  const users = fileReadUsers();
  return users.find(u => u.id === id) ?? null;
};

export const countUsers = async (): Promise<number> => {
  if (dbReady) {
    try {
      const { rows } = await pool!.query("SELECT COUNT(*) AS cnt FROM dashboard_users");
      return parseInt(rows[0].cnt, 10);
    } catch (e) {
      console.error("[userStore] countUsers DB error:", e);
    }
  }
  return fileReadUsers().length;
};

export const createUser = async (user: User): Promise<void> => {
  if (dbReady) {
    try {
      await pool!.query(
        `INSERT INTO dashboard_users (id, username, email, password_hash, role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.username, user.email, user.passwordHash, user.role, user.createdAt]
      );
      return;
    } catch (e) {
      console.error("[userStore] createUser DB error:", e);
    }
  }
  const users = fileReadUsers();
  users.push(user);
  fileWriteUsers(users);
};

export const updateUserRole = async (id: string, role: "admin" | "user"): Promise<User | null> => {
  if (dbReady) {
    try {
      const { rows } = await pool!.query(
        "UPDATE dashboard_users SET role = $1 WHERE id = $2 RETURNING *",
        [role, id]
      );
      return rows[0] ? rowToUser(rows[0]) : null;
    } catch (e) {
      console.error("[userStore] updateUserRole DB error:", e);
    }
  }
  const users = fileReadUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx].role = role;
  fileWriteUsers(users);
  return users[idx];
};

export const updateUserPassword = async (id: string, passwordHash: string): Promise<boolean> => {
  if (dbReady) {
    try {
      const { rowCount } = await pool!.query(
        "UPDATE dashboard_users SET password_hash = $1 WHERE id = $2",
        [passwordHash, id]
      );
      return (rowCount ?? 0) > 0;
    } catch (e) {
      console.error("[userStore] updateUserPassword DB error:", e);
    }
  }
  const users = fileReadUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  users[idx].passwordHash = passwordHash;
  fileWriteUsers(users);
  return true;
};

export const deleteUser = async (id: string): Promise<boolean> => {
  if (dbReady) {
    try {
      const { rowCount } = await pool!.query(
        "DELETE FROM dashboard_users WHERE id = $1",
        [id]
      );
      return (rowCount ?? 0) > 0;
    } catch (e) {
      console.error("[userStore] deleteUser DB error:", e);
    }
  }
  const users = fileReadUsers();
  const before = users.length;
  const filtered = users.filter(u => u.id !== id);
  if (filtered.length === before) return false;
  fileWriteUsers(filtered);
  return true;
};
