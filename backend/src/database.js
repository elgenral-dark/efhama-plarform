/* طبقة قاعدة بيانات موحدة (async):
   - بدون DATABASE_URL  → SQLite محلي (node:sqlite) للتطوير
   - مع DATABASE_URL    → Postgres (Neon) للإنتاج
   الاستعمال واحد في الحالتين:
     await db.get(sql, params)      → صف واحد أو undefined
     await db.all(sql, params)      → كل الصفوف
     await db.run(sql, params)      → { changes }
     await db.insert(sql, params)   → { changes, id }   (لجمل INSERT)
     await db.tx(async (t) => {...}) → معاملة (كل الدوال متاحة على t)
   كتابة SQL: علامات ? في كل مكان. الترجمة لـ Postgres تتم تلقائيًا. */

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  active        INTEGER NOT NULL DEFAULT 1,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending','active')),
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected','suspended')),
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS subscription_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  request_code    TEXT NOT NULL UNIQUE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount           INTEGER NOT NULL DEFAULT 100 CHECK (amount = 100),
  currency         TEXT NOT NULL DEFAULT 'EGP' CHECK (currency = 'EGP'),
  proof_mime       TEXT NOT NULL CHECK (proof_mime IN ('image/png','image/jpeg','image/webp')),
  proof_blob       BLOB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rejected','approved')),
  rejection_reason TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  reviewed_at      INTEGER,
  reviewed_by      INTEGER REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_subscription_request
  ON subscription_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_subscription_requests_status
  ON subscription_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_user_latest
  ON subscription_requests(user_id, id DESC);
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_hash  TEXT NOT NULL UNIQUE,
  token_version INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT
);
CREATE TABLE IF NOT EXISTS session_transfer_attempts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email                 TEXT NOT NULL,
  attempted_at          INTEGER NOT NULL,
  resolved_at           INTEGER,
  status                TEXT NOT NULL CHECK (status IN ('confirmation_required','transferred','cancelled','expired','stale')),
  challenge_hash        TEXT UNIQUE,
  expected_session_hash TEXT,
  expected_token_version INTEGER,
  expires_at            INTEGER NOT NULL,
  ip_address            TEXT,
  user_agent            TEXT,
  previous_ip_address   TEXT,
  previous_user_agent   TEXT,
  previous_started_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_session_transfer_attempts_user
  ON session_transfer_attempts(user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_transfer_attempts_status
  ON session_transfer_attempts(status, attempted_at DESC);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  message            TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('account','subscription','education','general')),
  related_entity_id  TEXT,
  is_read            INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at         INTEGER NOT NULL,
  read_at            INTEGER,
  action_url         TEXT,
  event_key          TEXT,
  sender_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (user_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_broadcasts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('account','subscription','education','general')),
  audience        TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  idempotency_key TEXT,
  UNIQUE (sender_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_notification_broadcasts_created
  ON notification_broadcasts(created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS content (
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  json       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS user_state (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id  TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('started','completed')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS ratings (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id  TEXT NOT NULL,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_key   TEXT NOT NULL,
  score      INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  taken_at   INTEGER NOT NULL,
  UNIQUE (user_id, quiz_key, taken_at)
);
CREATE TABLE IF NOT EXISTS challenge_progress (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id  TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  best_score    INTEGER NOT NULL DEFAULT 0,
  completed     INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, challenge_id)
);
CREATE TABLE IF NOT EXISTS challenge_attempts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id   TEXT NOT NULL,
  score          INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed         INTEGER NOT NULL CHECK (passed IN (0,1)),
  attempted_at   INTEGER NOT NULL,
  UNIQUE (user_id, challenge_id, attempted_at)
);
CREATE TABLE IF NOT EXISTS assessment_sessions (
  id                 TEXT PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id      TEXT NOT NULL,
  question_ids_json  TEXT NOT NULL,
  answers_json       TEXT NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','submitted')),
  started_at         INTEGER NOT NULL,
  expires_at         INTEGER NOT NULL,
  submitted_at       INTEGER,
  result_json        TEXT
);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user
  ON assessment_sessions(user_id, assessment_id, status, started_at);
CREATE TABLE IF NOT EXISTS assessment_attempts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id    TEXT NOT NULL,
  session_id       TEXT NOT NULL UNIQUE REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  score            INTEGER NOT NULL CHECK (score >= 0),
  total            INTEGER NOT NULL CHECK (total > 0),
  passed           INTEGER NOT NULL CHECK (passed IN (0,1)),
  completed_at     INTEGER NOT NULL,
  result_json      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user
  ON assessment_attempts(user_id, assessment_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_progress_lesson ON lesson_progress(lesson_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON quiz_attempts(quiz_key);
CREATE INDEX IF NOT EXISTS idx_challenge_attempts_user ON challenge_attempts(user_id, challenge_id);
`;

/* ترجمة SQL من صيغة SQLite إلى Postgres */
function toPostgresSql(sql) {
  let out = sql;
  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  if (/^\s*INSERT\s+OR\s+IGNORE\s/i.test(out)) {
    out = out.replace(/^(\s*)INSERT\s+OR\s+IGNORE\s/i, "$1INSERT ") .replace(/;?\s*$/, "") + " ON CONFLICT DO NOTHING";
  }
  // LIKE بدون حساسية لحالة الحروف كما في SQLite
  out = out.replace(/\bLIKE\b/g, "ILIKE");
  // علامات ? → $1, $2, ...
  let i = 0;
  out = out.replace(/\?/g, () => "$" + (++i));
  return out;
}

const toBigIntNumbers = (pg) => {
  // BIGINT (أرقام الوقت بالميلي ثانية) ترجع نصًا في pg؛ نحوّلها لأرقام
  pg.types.setTypeParser(20, (v) => Number(v));
};

/* ---------- SQLite ---------- */
function openSqlite(file) {
  const fs = require("fs");
  const path = require("path");
  const { DatabaseSync } = require("node:sqlite");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  raw.exec(SQLITE_SCHEMA);
  // ترقية قواعد SQLite القديمة: نضيف الأعمدة الناقصة (مثل إصدارات قبل الاعتماد)
  const userCols = new Set(raw.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
  if (!userCols.has("account_status"))
    raw.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending','active'))");
  if (!userCols.has("approval_status"))
    raw.exec("ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected','suspended'))");
  const run = (sql, params = []) => raw.prepare(sql).run(...params);
  const rawApi = {
    async get(sql, params = []) { return raw.prepare(sql).get(...params); },
    async all(sql, params = []) { return raw.prepare(sql).all(...params); },
    async run(sql, params = []) { const r = run(sql, params); return { changes: Number(r.changes) }; },
    async insert(sql, params = []) {
      const r = run(sql, params);
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    async exec(sql) { raw.exec(sql); },
    async lockUser() {},
    async lockAssessmentSession() {},
  };
  let queue = Promise.resolve();
  const serialize = (operation) => {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const adapter = {
    dialect: "sqlite",
    get: (sql, params = []) => serialize(() => rawApi.get(sql, params)),
    all: (sql, params = []) => serialize(() => rawApi.all(sql, params)),
    run: (sql, params = []) => serialize(() => rawApi.run(sql, params)),
    insert: (sql, params = []) => serialize(() => rawApi.insert(sql, params)),
    exec: (sql) => serialize(() => rawApi.exec(sql)),
    close: () => serialize(() => raw.close()),
    lockUser: async () => {},
    lockAssessmentSession: async () => {},
  };
  adapter.tx = async (fn) => {
    return serialize(async () => {
      raw.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn(rawApi);
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    });
  };
  return adapter;
}

/* ---------- Postgres ---------- */
function openPostgres(url) {
  const { Pool, types } = require("pg");
  toBigIntNumbers({ types });
  const pool = new Pool({
    connectionString: url,
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: true },
    max: Number(process.env.PG_POOL_MAX) || 5,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 5000,
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 10000,
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 15000,
  });
  const q = (client) => async (sql, params = []) => (await client.query(toPostgresSql(sql), params));
  function makeApi(client) {
    const query = q(client);
    return {
      dialect: "postgres",
      async get(sql, params) { return (await query(sql, params)).rows[0]; },
      async all(sql, params) { return (await query(sql, params)).rows; },
      async run(sql, params) { const r = await query(sql, params); return { changes: r.rowCount || 0 }; },
      async insert(sql, params) {
        // نضيف RETURNING id تلقائيًا لو الجدول فيه عمود id ومش مكتوب بالفعل
        let text = sql.replace(/;?\s*$/, "");
        if (!/\bRETURNING\b/i.test(text)) text += " RETURNING id";
        const r = await query(text, params);
        return { changes: r.rowCount || 0, id: r.rows[0] ? Number(r.rows[0].id) : null };
      },
      async exec(sql) { await client.query(sql); },
    };
  }
  const adapter = makeApi(pool);
  const withLock = (api) => ({
    ...api,
    lockUser: async (id) => { await api.get("SELECT id FROM users WHERE id = ? FOR UPDATE", [id]); },
    lockAssessmentSession: async (id, userId) => {
      await api.get("SELECT id FROM assessment_sessions WHERE id = ? AND user_id = ? FOR UPDATE", [id, userId]);
    },
  });
  adapter.lockUser = async () => { throw new Error("lockUser يعمل داخل معاملة فقط"); };
  adapter.lockAssessmentSession = async () => { throw new Error("lockAssessmentSession يعمل داخل معاملة فقط"); };
  adapter.tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await fn(withLock(makeApi(client)));
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  };
  adapter.close = () => pool.end();
  return adapter;
}

/* افتح قاعدة البيانات: Postgres إن وُجد DATABASE_URL، وإلا SQLite */
async function openDatabase({ sqliteFile, databaseUrl } = {}) {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (url) {
    const db = openPostgres(url);
    // تحقق سريع من الاتصال قبل ما السيرفر يبدأ
    await db.get("SELECT 1 AS ok");
    await db.exec(postgresSchema());
    return db;
  }
  return openSqlite(sqliteFile);
}

function postgresSchema() {
  // نفس الجداول بصيغة Postgres: SERIAL بدل AUTOINCREMENT، BYTEA بدل BLOB،
  // والإيميل يتخزن بحروف صغيرة (السيرفر بيعمل lowercase قبل الحفظ) فيبقى UNIQUE عادي.
  return SQLITE_SCHEMA
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "SERIAL PRIMARY KEY")
    .replace(/\bBLOB\b/g, "BYTEA")
    .replace(/email\s+TEXT NOT NULL UNIQUE COLLATE NOCASE/, "email TEXT NOT NULL UNIQUE")
    .replace(/(created_at|updated_at|expires_at|last_seen_at|starts_at|ends_at|attempted_at|resolved_at|taken_at|attempted_at|started_at|submitted_at|completed_at|reviewed_at|last_login_at|previous_started_at|expected_token_version|read_at)\s+INTEGER/g, "$1 BIGINT")
    ;
}

/* أخطاء مشتركة بين SQLite وPostgres */
const isUniqueViolation = (e) => !!e && (e.code === "23505" || String(e.code || "").startsWith("SQLITE_CONSTRAINT"));
const isBusy = (e) => !!e && ["SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT", "40001", "40P01"].includes(e.code);

module.exports = { openDatabase, toPostgresSql, postgresSchema, SQLITE_SCHEMA, isUniqueViolation, isBusy };
