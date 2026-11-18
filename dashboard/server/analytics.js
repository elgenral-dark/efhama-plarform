'use strict';
/* تحليلات من بيانات فعلية فقط — لا توجد أي أرقام افتراضية */
const C = require('./content');
const S = require('./students');

const DAY = 86400000;
function parseRange(q) {
  const tz = Math.max(-840, Math.min(840, parseInt(q.tz, 10) || 0));
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const todayLocal = new Date(Date.now() + tz * 60000).toISOString().slice(0, 10);
  const to = re.test(q.to || '') ? q.to : todayLocal;
  const from = re.test(q.from || '') ? q.from : new Date(Date.parse(to + 'T00:00:00Z') - 29 * DAY).toISOString().slice(0, 10);
  const startMs = Date.parse(from + 'T00:00:00Z') - tz * 60000;
  const endMs = Date.parse(to + 'T00:00:00Z') + DAY - tz * 60000;
  return { from, to, tz, start: new Date(startMs).toISOString(), end: new Date(Math.max(endMs, startMs + DAY)).toISOString(), startMs, endMs: Math.max(endMs, startMs + DAY) };
}
const mod = tz => (tz >= 0 ? '+' : '') + tz + ' minutes';
const r1 = n => (n == null ? null : Math.round(n * 10) / 10);

function core(db, R) {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const entered = one('SELECT COUNT(DISTINCT student_id) n FROM web_sessions WHERE started_at>=? AND started_at<?', R.start, R.end).n;
  const sess = one('SELECT COUNT(*) n, AVG(CASE WHEN active_seconds>0 THEN active_seconds END) avg FROM web_sessions WHERE started_at>=? AND started_at<?', R.start, R.end);
  const completions = one('SELECT COUNT(*) n FROM lesson_completions WHERE completed_at>=? AND completed_at<?', R.start, R.end).n;
  const attempts = one('SELECT COUNT(*) n FROM quiz_attempts WHERE created_at>=? AND created_at<?', R.start, R.end).n;
  return { entered, sessions: sess.n, avgSessionSeconds: sess.avg == null ? null : Math.round(sess.avg), completions, attempts };
}

function compute(db, data, q, perms) {
  const R = parseRange(q);
  const names = perms.flags.includes('students.contact') || perms.sections.students;
  const inactiveDays = Math.max(1, Math.min(365, parseInt(q.inactiveDays, 10) || 14));
  const pathId = q.pathId || '', lessonId = q.lessonId || '';
  const out = { range: { from: R.from, to: R.to, tz: R.tz }, filters: { pathId, lessonId, inactiveDays } };
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const lessonsAll = (data.lessons || []).filter(l => l.status === 'published');
  const lessonMeta = l => ({ lessonId: l.id, title: l.title, pathId: C.pathOfLesson(data, l.id), pathName: C.pathName(data, C.pathOfLesson(data, l.id)) });
  let lessonList = lessonsAll.map(lessonMeta);
  if (pathId) lessonList = lessonList.filter(l => l.pathId === pathId);
  if (lessonId) lessonList = lessonList.filter(l => l.lessonId === lessonId);
  const lessonIds = new Set(lessonList.map(l => l.lessonId));

  /* 1) الدخول والجلسات */
  const c = core(db, R);
  const endIso = R.end;
  const activeSince = d => one('SELECT COUNT(DISTINCT student_id) n FROM web_sessions WHERE started_at<? AND last_seen>=?', endIso, new Date(R.endMs - d * DAY).toISOString()).n;
  const hours = new Array(24).fill(0);
  all(`SELECT strftime('%H', started_at, ?) h, COUNT(*) n FROM web_sessions WHERE started_at>=? AND started_at<? GROUP BY h`, mod(R.tz), R.start, R.end).forEach(r => { hours[+r.h] = r.n; });
  const daily = all(`SELECT strftime('%Y-%m-%d', started_at, ?) d, COUNT(DISTINCT student_id) n FROM web_sessions WHERE started_at>=? AND started_at<? GROUP BY d ORDER BY d`, mod(R.tz), R.start, R.end).map(r => ({ day: r.d, n: r.n }));
  const left = one('SELECT COUNT(*) n FROM students WHERE last_active IS NOT NULL AND last_active<?', new Date(R.endMs - inactiveDays * DAY).toISOString()).n;
  out.access = { entered: c.entered, dau: activeSince(1), wau: activeSince(7), mau: activeSince(30), sessions: c.sessions, avgSessionSeconds: c.avgSessionSeconds, hours, daily, left, totalStudents: one('SELECT COUNT(*) n FROM students').n };

  /* 2) الدروس */
  const op = new Map(all(`SELECT lv.lesson_id id, COUNT(DISTINCT lv.student_id) opened, COUNT(DISTINCT lc.student_id) done, AVG(CASE WHEN lv.seconds>0 THEN lv.seconds END) avg
      FROM lesson_views lv LEFT JOIN lesson_completions lc ON lc.student_id=lv.student_id AND lc.lesson_id=lv.lesson_id
      WHERE lv.opened_at>=? AND lv.opened_at<? GROUP BY lv.lesson_id`, R.start, R.end).map(r => [r.id, r]));
  const cm = new Map(all('SELECT lesson_id id, COUNT(*) n FROM lesson_completions WHERE completed_at>=? AND completed_at<? GROUP BY lesson_id', R.start, R.end).map(r => [r.id, r.n]));
  const lessons = lessonList.map(l => {
    const o = op.get(l.lessonId) || { opened: 0, done: 0, avg: null };
    return Object.assign({}, l, { opened: o.opened, completedByOpeners: o.done, completionsInRange: cm.get(l.lessonId) || 0, completionRate: o.opened ? Math.round(100 * o.done / o.opened) : null, avgSeconds: o.avg == null ? null : Math.round(o.avg), startedNotCompleted: o.opened - o.done });
  });
  const viewed = lessons.filter(l => l.opened > 0);
  out.lessons = {
    rows: lessons, mostViewed: viewed.slice().sort((a, b) => b.opened - a.opened).slice(0, 5), leastViewed: lessons.slice().sort((a, b) => a.opened - b.opened).slice(0, 5),
    avgLearningSeconds: (() => { const v = viewed.filter(l => l.avgSeconds != null); return v.length ? Math.round(v.reduce((s, l) => s + l.avgSeconds, 0) / v.length) : null; })()
  };
  if (lessonId && names) {
    out.lessons.startedNotCompletedStudents = all(`SELECT DISTINCT s.id, s.name FROM lesson_views lv JOIN students s ON s.id=lv.student_id
      WHERE lv.lesson_id=? AND lv.opened_at>=? AND lv.opened_at<? AND NOT EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.student_id=lv.student_id AND lc.lesson_id=lv.lesson_id) LIMIT 100`, lessonId, R.start, R.end);
  }

  /* 3) الفيديوهات */
  let vids = C.videosOf(data);
  if (pathId) vids = vids.filter(v => v.pathId === pathId);
  if (lessonId) vids = vids.filter(v => v.lessonId === lessonId);
  const d0 = R.start.slice(0, 10), d1 = R.end.slice(0, 10);
  out.videos = { rows: vids.map(v => {
    const st = one(`SELECT COUNT(*) started, SUM(completed) completed, AVG(watched_seconds) avgw, AVG(CASE WHEN duration>0 THEN MIN(1.0, watched_seconds/duration) END) pct, MAX(duration) dur
      FROM video_progress WHERE video_id=? AND started_at>=? AND started_at<?`, v.id, R.start, R.end);
    const buckets = new Array(10).fill(0);
    all('SELECT bucket, SUM(n) n FROM video_stops WHERE video_id=? AND day>=? AND day<=? GROUP BY bucket', v.id, d0, d1).forEach(r => { buckets[r.bucket] = r.n; });
    const notStarted = v.pathId ? one(`SELECT COUNT(*) n FROM student_paths sp WHERE sp.path_id=? AND NOT EXISTS (SELECT 1 FROM video_progress vp WHERE vp.student_id=sp.student_id AND vp.video_id=?)`, v.pathId, v.id).n : 0;
    const peak = buckets.some(n => n > 0) ? buckets.indexOf(Math.max(...buckets)) : null;
    return Object.assign({}, v, { started: st.started, completed: st.completed || 0, avgWatchedSeconds: st.avgw == null ? null : Math.round(st.avgw), watchPct: st.pct == null ? null : Math.round(st.pct * 100), duration: st.dur, stopBuckets: buckets, commonStop: peak == null ? null : { from: peak * 10, to: peak * 10 + 10 }, notStarted });
  }) };

  /* 4) الاختبارات */
  const qf = pathId ? ' AND path_id=?' : '';
  const qa = pathId ? [R.start, R.end, pathId] : [R.start, R.end];
  const tot = one(`SELECT COUNT(*) attempts, AVG(score) avg, MAX(score) mx, MIN(score) mn, AVG(passed) rate FROM quiz_attempts WHERE created_at>=? AND created_at<?${qf}`, ...qa);
  const perQuiz = all(`SELECT quiz_id id, COUNT(*) attempts, AVG(score) avg, MAX(score) mx, MIN(score) mn, AVG(passed) rate FROM quiz_attempts WHERE created_at>=? AND created_at<?${qf} GROUP BY quiz_id`, ...qa)
    .map(r => ({ quizId: r.id, title: ((data.quizzes || []).find(x => x.id === r.id) || {}).title || '(محذوف)', attempts: r.attempts, avg: r1(r.avg), max: r.mx, min: r.mn, passRate: Math.round(r.rate * 100) }));
  const missed = all(`SELECT json_extract(j.value,'$.questionId') qid, COUNT(*) total, SUM(CASE WHEN json_extract(j.value,'$.correct')=0 THEN 1 ELSE 0 END) wrong
      FROM quiz_attempts qa, json_each(qa.answers) j WHERE qa.created_at>=? AND qa.created_at<?${pathId ? ' AND qa.path_id=?' : ''} AND qa.answers IS NOT NULL GROUP BY qid HAVING wrong>0
      ORDER BY (wrong*1.0/total) DESC, wrong DESC LIMIT 10`, ...qa)
    .map(r => ({ questionId: r.qid, text: ((data.questions || []).find(x => x.id === r.qid) || {}).text || '(محذوف)', total: r.total, wrong: r.wrong, wrongPct: Math.round(100 * r.wrong / r.total) }));
  const failed = all(`SELECT qa.student_id sid, s.name, qa.quiz_id qid, MAX(qa.score) best FROM quiz_attempts qa JOIN students s ON s.id=qa.student_id
      WHERE qa.created_at>=? AND qa.created_at<?${pathId ? ' AND qa.path_id=?' : ''} GROUP BY qa.student_id, qa.quiz_id HAVING SUM(qa.passed)=0`, ...qa);
  out.quizzes = {
    attempts: tot.attempts, avg: r1(tot.avg), max: tot.mx, min: tot.mn, passRate: tot.attempts ? Math.round(tot.rate * 100) : null, perQuiz, mostMissed: missed, failedCount: failed.length,
    failedStudents: names ? failed.slice(0, 100).map(r => ({ id: r.sid, name: r.name, quiz: ((data.quizzes || []).find(x => x.id === r.qid) || {}).title || '', best: r.best })) : undefined
  };

  /* 5) المسارات */
  const comp = new Map(all('SELECT student_id, path_id, COUNT(*) c, MAX(completed_at) last FROM lesson_completions GROUP BY student_id, path_id').map(r => [r.student_id + '|' + r.path_id, r]));
  const firstView = new Map(all('SELECT student_id, path_id, MIN(opened_at) f FROM lesson_views GROUP BY student_id, path_id').map(r => [r.student_id + '|' + r.path_id, r.f]));
  const act = new Map(all('SELECT path_id id, COUNT(*) n FROM lesson_views WHERE opened_at>=? AND opened_at<? GROUP BY path_id', R.start, R.end).map(r => [r.id, r.n]));
  const actC = new Map(all('SELECT path_id id, COUNT(*) n FROM lesson_completions WHERE completed_at>=? AND completed_at<? GROUP BY path_id', R.start, R.end).map(r => [r.id, r.n]));
  let pathsData = (data.paths || []).filter(p => !pathId || p.id === pathId).map(p => {
    const ls = C.publishedLessonsOfPath(data, p.id), total = ls.length;
    const enrolled = all('SELECT student_id FROM student_paths WHERE path_id=?', p.id).map(r => r.student_id);
    const need = ((p.completion || {}).lessonsPct) || 100;
    let sum = 0, completed = 0, days = [];
    for (const sid of enrolled) {
      const cr = comp.get(sid + '|' + p.id), done = cr ? cr.c : 0, pct = total ? 100 * done / total : 0;
      sum += pct;
      if (total && pct >= need) { completed++; const f = firstView.get(sid + '|' + p.id); if (f && cr) days.push((Date.parse(cr.last) - Date.parse(f)) / DAY); }
    }
    return { pathId: p.id, name: p.name, enrolled: enrolled.length, avgProgress: enrolled.length && total ? Math.round(sum / enrolled.length) : null, completedStudents: completed,
      completionRate: enrolled.length && total ? Math.round(100 * completed / enrolled.length) : null, avgDaysToComplete: days.length ? r1(days.reduce((a, b) => a + b, 0) / days.length) : null,
      activity: (act.get(p.id) || 0) + (actC.get(p.id) || 0), lessons: total };
  });
  out.paths = { rows: pathsData, mostStudied: pathsData.filter(p => p.activity > 0).slice().sort((a, b) => b.activity - a.activity).slice(0, 5), leastActive: pathsData.slice().sort((a, b) => a.activity - b.activity).slice(0, 5) };

  /* 6) الاشتراكات */
  const st = all('SELECT sub_status, sub_start, sub_end FROM students');
  const eff = st.map(s => S.effSub(s));
  const newSubs = st.filter(s => s.sub_start && s.sub_start >= R.from && s.sub_start <= R.to).length;
  const pays = all('SELECT currency, SUM(amount) total, COUNT(*) n FROM payments WHERE verified=1 AND paid_at>=? AND paid_at<? GROUP BY currency', R.start, R.end);
  const anyPay = one('SELECT COUNT(*) n FROM payments WHERE verified=1').n;
  out.subscriptions = { total: eff.filter(x => x !== 'none').length, active: eff.filter(x => x === 'active').length, pending: eff.filter(x => x === 'pending').length, expired: eff.filter(x => x === 'expired').length,
    newInPeriod: newSubs, revenue: anyPay ? pays.map(p => ({ currency: p.currency || '', total: p.total, payments: p.n })) : null };

  out.cards = { entered: c.entered, sessions: c.sessions, completions: c.completions, attempts: c.attempts, newSubs };
  if (q.compare === '1') {
    const span = R.endMs - R.startMs;
    const P = { start: new Date(R.startMs - span).toISOString(), end: new Date(R.startMs).toISOString(), startMs: R.startMs - span, endMs: R.startMs };
    const pc = core(db, P);
    const pFrom = P.start.slice(0, 10), pTo = new Date(R.startMs - 1).toISOString().slice(0, 10);
    const pNew = st.filter(s => s.sub_start && s.sub_start >= pFrom && s.sub_start <= pTo).length;
    out.previous = { range: { from: new Date(R.startMs - span + R.tz * 60000).toISOString().slice(0, 10), to: new Date(R.startMs - 1 + R.tz * 60000).toISOString().slice(0, 10) }, cards: { entered: pc.entered, sessions: pc.sessions, completions: pc.completions, attempts: pc.attempts, newSubs: pNew }, avgSessionSeconds: pc.avgSessionSeconds };
  }
  out.meta = {
    paths: (data.paths || []).map(p => ({ id: p.id, name: p.name })),
    lessons: lessonsAll.map(l => ({ id: l.id, title: l.title, pathId: C.pathOfLesson(data, l.id) })),
    canSeeNames: !!names
  };
  return out;
}

module.exports = { compute, parseRange };
