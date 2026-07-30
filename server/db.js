import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "sushi.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Better Auth core schema (email + password) with an extra `role` column,
// plus the app's per-user progress table.
db.exec(`
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS user_state (
  userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  goal INTEGER NOT NULL DEFAULT 20,
  elapsedMs INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  bestSession INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS session_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  count INTEGER NOT NULL,
  goal INTEGER NOT NULL,
  elapsedMs INTEGER NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  finishedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_log_user ON session_log(userId, finishedAt);
`);

// Migration for databases created before the ad libitum feature.
try {
  db.exec("ALTER TABLE user_state ADD COLUMN price REAL NOT NULL DEFAULT 0");
} catch {
  /* column already exists */
}

const emptyState = () => ({
  session: { count: 0, goal: 20, elapsedMs: 0, price: 0 },
  allTime: { total: 0, bestSession: 0, sessions: 0 },
});

export function getState(userId) {
  const row = db
    .prepare("SELECT count, goal, elapsedMs, price, total, bestSession, sessions FROM user_state WHERE userId = ?")
    .get(userId);
  if (!row) return emptyState();
  return {
    session: { count: row.count, goal: row.goal, elapsedMs: row.elapsedMs, price: row.price },
    allTime: { total: row.total, bestSession: row.bestSession, sessions: row.sessions },
  };
}

const clampInt = (v, min, max, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const clampPrice = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1e7, Math.max(0, Math.round(n * 100) / 100)) : 0;
};

function normalize(body) {
  const s = body?.session ?? {};
  const a = body?.allTime ?? {};
  return {
    count: clampInt(s.count, 0, 1e9, 0),
    goal: clampInt(s.goal, 1, 999, 20),
    elapsedMs: clampInt(s.elapsedMs, 0, 1e12, 0),
    price: clampPrice(s.price),
    total: clampInt(a.total, 0, 1e9, 0),
    bestSession: clampInt(a.bestSession, 0, 1e9, 0),
    sessions: clampInt(a.sessions, 0, 1e9, 0),
  };
}

const upsertState = db.prepare(`
  INSERT INTO user_state (userId, count, goal, elapsedMs, price, total, bestSession, sessions, updatedAt)
  VALUES (@userId, @count, @goal, @elapsedMs, @price, @total, @bestSession, @sessions, @updatedAt)
  ON CONFLICT(userId) DO UPDATE SET
    count = @count, goal = @goal, elapsedMs = @elapsedMs, price = @price,
    total = @total, bestSession = @bestSession, sessions = @sessions, updatedAt = @updatedAt
`);

export function saveState(userId, body) {
  upsertState.run({ userId, ...normalize(body), updatedAt: new Date().toISOString() });
  return getState(userId);
}

// Finish the current session: log it, bump the session counters, and reset
// the live session (goal is kept, price starts fresh). Atomic.
export const finishSession = db.transaction((userId, body) => {
  const st = normalize(body);
  const now = new Date().toISOString();
  const hasData = st.count > 0 || st.elapsedMs > 0;
  if (hasData) {
    db.prepare(`
      INSERT INTO session_log (userId, count, goal, elapsedMs, price, finishedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, st.count, st.goal, st.elapsedMs, st.price, now);
    st.sessions += 1;
    st.bestSession = Math.max(st.bestSession, st.count);
  }
  upsertState.run({
    userId,
    ...st,
    count: 0,
    elapsedMs: 0,
    price: 0,
    updatedAt: now,
  });
  return getState(userId);
});

// Reopen a recently finished session: remove it from the log and make it the
// live session again. Refuses when the log entry is too old or a new session
// has already been started. Atomic.
export const reopenSession = db.transaction((userId, sessionId, windowMs) => {
  const row = db
    .prepare("SELECT id, count, goal, elapsedMs, price, finishedAt FROM session_log WHERE id = ? AND userId = ?")
    .get(sessionId, userId);
  if (!row) return { error: "not_found" };
  if (Date.now() - new Date(row.finishedAt).getTime() > windowMs) return { error: "expired" };
  const cur = getState(userId);
  if (cur.session.count > 0 || cur.session.elapsedMs > 0) return { error: "live_session" };
  db.prepare("DELETE FROM session_log WHERE id = ?").run(row.id);
  upsertState.run({
    userId,
    count: row.count,
    goal: row.goal,
    elapsedMs: row.elapsedMs,
    price: row.price,
    total: cur.allTime.total,
    bestSession: cur.allTime.bestSession,
    sessions: Math.max(0, cur.allTime.sessions - 1),
    updatedAt: new Date().toISOString(),
  });
  return { state: getState(userId) };
});

export function listSessions(userId) {
  return db
    .prepare(`
      SELECT id, count, goal, elapsedMs, price, finishedAt
      FROM session_log WHERE userId = ?
      ORDER BY finishedAt DESC, id DESC
    `)
    .all(userId);
}

export function adminListUsers() {
  return db
    .prepare(`
      SELECT u.id, u.name, u.email, u.role, u.createdAt,
             COALESCE(st.count, 0) AS sessionCount,
             COALESCE(st.total, 0) AS total,
             COALESCE(st.bestSession, 0) AS bestSession,
             COALESCE(st.sessions, 0) AS sessions,
             st.updatedAt AS lastActive
      FROM user u LEFT JOIN user_state st ON st.userId = u.id
      ORDER BY u.createdAt ASC
    `)
    .all();
}

export function adminGlobalStats() {
  return db
    .prepare(`
      SELECT COUNT(u.id) AS users,
             COALESCE(SUM(st.total), 0) AS totalSushi,
             COALESCE(SUM(st.sessions), 0) AS totalSessions,
             COALESCE(MAX(st.bestSession), 0) AS bestSession
      FROM user u LEFT JOIN user_state st ON st.userId = u.id
    `)
    .get();
}

export function adminDeleteUser(userId) {
  return db.prepare("DELETE FROM user WHERE id = ?").run(userId).changes > 0;
}

export function countUsers() {
  return db.prepare("SELECT COUNT(*) AS n FROM user").get().n;
}
