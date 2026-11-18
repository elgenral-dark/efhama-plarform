'use strict';
/* استقبال أحداث الموقع (جلسات، دروس، اختبارات، مشاهدة فيديو) — مع تجميع لتقليل حجم القاعدة */
const { tx } = require('./db');
const C = require('./content');

const s = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const n = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; };

function resolveStudent(db, id) {
  id = String(id == null ? '' : id).slice(0, 80);
  if (!id) return null;
  const r = /^\d+$/.test(id) ? db.prepare('SELECT id, status FROM students WHERE id=?').get(+id) : db.prepare('SELECT id, status FROM students WHERE external_id=?').get(id);
  return r || null;
}

function ingest(db, data, body) {
  const events = Array.isArray(body && body.events) ? body.events.slice(0, 50) : [];
  const res = { accepted: 0, ignored: 0 };
  tx(db, () => {
    for (const ev of events) {
      try { if (handle(db, data, ev)) res.accepted++; else res.ignored++; } catch (e) { res.ignored++; }
    }
  });
  return res;
}

function handle(db, data, ev) {
  if (!ev || typeof ev !== 'object') return false;
  const st = resolveStudent(db, ev.studentId);
  if (!st || st.status !== 'active') return false;
  const sid = st.id, now = new Date().toISOString(), day = now.slice(0, 10);
  const touch = () => db.prepare('UPDATE students SET last_active=? WHERE id=?').run(now, sid);
  switch (ev.type) {
    case 'session_start': {
      const id = s(ev.sessionId, 64); if (!id) return false;
      db.prepare('INSERT OR IGNORE INTO web_sessions(session_id,student_id,started_at,last_seen) VALUES (?,?,?,?)').run(id, sid, now, now);
      touch(); return true;
    }
    case 'heartbeat': case 'session_end': {
      const id = s(ev.sessionId, 64); if (!id) return false;
      const sec = Math.round(n(ev.seconds, 0, 120) || 0);
      db.prepare('INSERT OR IGNORE INTO web_sessions(session_id,student_id,started_at,last_seen) VALUES (?,?,?,?)').run(id, sid, now, now);
      db.prepare(`UPDATE web_sessions SET last_seen=?, active_seconds=active_seconds+?, ended_at=CASE WHEN ?='session_end' THEN ? ELSE ended_at END WHERE session_id=? AND student_id=?`)
        .run(now, sec, ev.type, now, id, sid);
      touch(); return true;
    }
    case 'lesson_open': {
      const vid = s(ev.viewId, 64), lid = s(ev.lessonId, 80); if (!vid || !lid) return false;
      const pid = C.pathOfLesson(data, lid); if (!pid) return false;
      db.prepare('INSERT OR IGNORE INTO lesson_views(view_id,student_id,lesson_id,path_id,opened_at) VALUES (?,?,?,?,?)').run(vid, sid, lid, pid, now);
      touch(); return true;
    }
    case 'lesson_leave': {
      const vid = s(ev.viewId, 64); if (!vid) return false;
      const sec = Math.round(n(ev.seconds, 0, 4 * 3600) || 0);
      db.prepare('UPDATE lesson_views SET seconds=MAX(seconds, ?) WHERE view_id=? AND student_id=?').run(sec, vid, sid);
      touch(); return true;
    }
    case 'lesson_complete': {
      const lid = s(ev.lessonId, 80); if (!lid) return false;
      const pid = C.pathOfLesson(data, lid); if (!pid) return false;
      db.prepare('INSERT OR IGNORE INTO lesson_completions(student_id,lesson_id,path_id,completed_at) VALUES (?,?,?,?)').run(sid, lid, pid, now);
      touch(); return true;
    }
    case 'quiz_attempt': {
      const qid = s(ev.quizId, 80); if (!qid) return false;
      const quiz = (data.quizzes || []).find(q => q.id === qid); if (!quiz) return false;
      const score = n(ev.score, 0, 100); if (score == null) return false;
      const answers = Array.isArray(ev.answers) ? ev.answers.slice(0, 200).map(a => ({ questionId: String(a && a.questionId || '').slice(0, 64), correct: !!(a && a.correct) })).filter(a => a.questionId) : null;
      db.prepare('INSERT INTO quiz_attempts(student_id,quiz_id,path_id,score,passed,answers,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(sid, qid, quiz.pathId || null, score, ev.passed ? 1 : 0, answers ? JSON.stringify(answers) : null, now);
      touch(); return true;
    }
    case 'video': {
      const vidId = s(ev.videoId, 80); if (!vidId) return false;
      const state = ['play', 'pause', 'ended', 'leave'].includes(ev.state) ? ev.state : null; if (!state) return false;
      const vmeta = C.videosOf(data).find(v => v.id === vidId); if (!vmeta) return false;
      const dur = n(ev.duration, 0, 86400) || 0, pos = n(ev.position, 0, 86400) || 0, delta = n(ev.watched, 0, 120) || 0;
      const row = db.prepare('SELECT * FROM video_progress WHERE student_id=? AND video_id=?').get(sid, vidId);
      if (!row) {
        if (state !== 'play' && delta <= 0) return false; // فتح الصفحة وحده لا يُحتسب مشاهدة
        db.prepare('INSERT INTO video_progress(student_id,video_id,lesson_id,path_id,duration,watched_seconds,max_position,last_position,completed,started_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(sid, vidId, vmeta.lessonId, vmeta.pathId, dur || null, delta, pos, pos, 0, now, now);
      }
      const cur = db.prepare('SELECT * FROM video_progress WHERE student_id=? AND video_id=?').get(sid, vidId);
      const duration = dur || cur.duration || 0, maxPos = Math.max(cur.max_position, pos);
      const done = cur.completed || state === 'ended' || (duration > 0 && maxPos >= duration * 0.95) ? 1 : 0;
      db.prepare('UPDATE video_progress SET duration=?, watched_seconds=watched_seconds+?, max_position=?, last_position=?, completed=?, updated_at=? WHERE student_id=? AND video_id=?')
        .run(duration || null, row ? delta : 0, maxPos, pos, done, now, sid, vidId);
      if ((state === 'pause' || state === 'leave') && duration > 0 && pos > 2 && pos < duration * 0.95) {
        const bucket = Math.min(9, Math.floor(pos / duration * 10));
        db.prepare('INSERT INTO video_stops(video_id,day,bucket,n) VALUES (?,?,?,1) ON CONFLICT(video_id,day,bucket) DO UPDATE SET n=n+1').run(vidId, day, bucket);
      }
      touch(); return true;
    }
  }
  return false;
}

module.exports = { ingest };
