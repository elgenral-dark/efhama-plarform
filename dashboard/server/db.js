'use strict';
/* قاعدة بيانات مشتركة (SQLite مدمجة في Node 22.13+) — لا تحتاج أي مكتبة خارجية */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'efhama.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      sections TEXT,
      pw_salt BLOB NOT NULL,
      pw_hash BLOB NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions(
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      user_id INTEGER,
      username TEXT NOT NULL,
      display_name TEXT,
      action TEXT NOT NULL,
      section TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      target_name TEXT,
      before_json TEXT,
      after_json TEXT,
      details TEXT,
      ip TEXT,
      prev_hash TEXT NOT NULL,
      row_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_ts ON audit_log(ts);
    CREATE INDEX IF NOT EXISTS audit_user ON audit_log(username);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

    CREATE TABLE IF NOT EXISTS students(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      sub_status TEXT NOT NULL DEFAULT 'none',
      sub_start TEXT,
      sub_end TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      last_active TEXT
    );
    CREATE TABLE IF NOT EXISTS student_paths(
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      path_id TEXT NOT NULL,
      enrolled_at TEXT NOT NULL,
      PRIMARY KEY(student_id, path_id)
    );
    CREATE TABLE IF NOT EXISTS lesson_completions(
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL,
      path_id TEXT,
      completed_at TEXT NOT NULL,
      PRIMARY KEY(student_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS lesson_views(
      view_id TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL,
      path_id TEXT,
      opened_at TEXT NOT NULL,
      seconds INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS lv_lesson ON lesson_views(lesson_id, opened_at);
    CREATE TABLE IF NOT EXISTS web_sessions(
      session_id TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      ended_at TEXT,
      active_seconds INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ws_started ON web_sessions(started_at);
    CREATE TABLE IF NOT EXISTS quiz_attempts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      quiz_id TEXT NOT NULL,
      path_id TEXT,
      score REAL NOT NULL,
      passed INTEGER NOT NULL,
      answers TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS qa_created ON quiz_attempts(created_at);
    CREATE TABLE IF NOT EXISTS video_progress(
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL,
      lesson_id TEXT,
      path_id TEXT,
      duration REAL,
      watched_seconds REAL NOT NULL DEFAULT 0,
      max_position REAL NOT NULL DEFAULT 0,
      last_position REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(student_id, video_id)
    );
    CREATE TABLE IF NOT EXISTS video_stops(
      video_id TEXT NOT NULL,
      day TEXT NOT NULL,
      bucket INTEGER NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(video_id, day, bucket)
    );
    CREATE TABLE IF NOT EXISTS certificates(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL REFERENCES students(id),
      student_name TEXT NOT NULL,
      path_id TEXT NOT NULL,
      path_name TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      issued_by TEXT,
      status TEXT NOT NULL DEFAULT 'valid',
      revoked_at TEXT,
      revoked_by TEXT,
      revoke_reason TEXT,
      replaced_by TEXT,
      reissued_from TEXT
    );
    CREATE TABLE IF NOT EXISTS payments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      amount REAL NOT NULL,
      currency TEXT,
      reference TEXT NOT NULL UNIQUE,
      paid_at TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings_kv(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT,
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS subscription_requests(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      student_name TEXT NOT NULL,
      student_email TEXT NOT NULL,
      student_phone TEXT,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EGP',
      method TEXT DEFAULT 'فودافون كاش',
      reference TEXT,
      proof_url TEXT,
      plan_duration_months INTEGER NOT NULL DEFAULT 12,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS sr_status ON subscription_requests(status);
    CREATE INDEX IF NOT EXISTS sr_created ON subscription_requests(created_at);
  `);
  return db;
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
}

module.exports = { open, tx };
