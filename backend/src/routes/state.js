const express = require("express");

/* مزامنة حالة الطالب: نفس مفاتيح localStorage في الواجهة.
   المصدر الأساسي جدول user_state، وتُشتق منه جداول التقارير (التقدم/التقييم/الاختبارات). */
const MAX_VALUE = 100 * 1024;
const MAX_BULK = 300;

const json = (v) => { try { return JSON.parse(v); } catch { return undefined; } };
const isId = (s) => typeof s === "string" && /^[\w-]{1,20}$/.test(s);

const SIMPLE = {
  efhama_completed: (v) => Array.isArray(json(v)) && json(v).length <= 500 && json(v).every(isId),
  efhama_started: (v) => Array.isArray(json(v)) && json(v).length <= 500 && json(v).every(isId),
  efhama_last_lesson: (v) => { const j = json(v); return j && typeof j === "object" && !Array.isArray(j) && isId(String(j.id)); },
  efhama_quiz_results: (v) => { const j = json(v); return j && typeof j === "object" && !Array.isArray(j); },
  efhama_quiz_best: (v) => { const j = json(v); return j && typeof j === "object" && !Array.isArray(j); },
  efhama_mistakes: (v) => Array.isArray(json(v)) && json(v).length <= 2000,
  efhama_fontsize: (v) => /^\d{1,2}$/.test(v),
  efhama_theme: (v) => v === "light" || v === "dark",
  efhama_sound: (v) => v === "on" || v === "off",
};

function validate(key, value) {
  if (typeof value !== "string") return "القيمة يجب أن تكون نصًا";
  if (value.length > MAX_VALUE) return "القيمة كبيرة جدًا";
  if (SIMPLE[key]) return SIMPLE[key](value) ? null : "قيمة غير صالحة";
  if (/^efhama_challenge_[\w-]{1,60}$/.test(key)) {
    const record = json(value);
    return record
      && Number.isInteger(record.attempts) && record.attempts >= 0 && record.attempts <= 100000
      && Number.isInteger(record.bestScore) && record.bestScore >= 0 && record.bestScore <= 100
      && Number.isInteger(record.lastScore) && record.lastScore >= 0 && record.lastScore <= 100
      && typeof record.completed === "boolean"
      && typeof record.lastPassed === "boolean"
      && Number.isSafeInteger(record.lastAttemptAt) && record.lastAttemptAt >= 0
      && Number.isSafeInteger(record.updatedAt) && record.updatedAt >= 0
      ? null : "سجل تحدٍ غير صالح";
  }
  let m;
  if ((m = /^efhama_pos_([\w-]{1,20})$/.exec(key))) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? null : "موضع غير صالح";
  }
  if ((m = /^efhama_rating_([\w-]{1,20})$/.exec(key))) {
    const j = json(value);
    return j && Number.isInteger(j.stars) && j.stars >= 1 && j.stars <= 5 ? null : "تقييم غير صالح";
  }
  return "مفتاح غير مسموح";
}

module.exports = function stateRoutes(db, content, { requireAuth, requireSubscription }) {
  const r = express.Router();
  r.use(requireAuth, requireSubscription);

  // كل الدوال تستقبل d = الاتصال الحالي (قاعدة البيانات أو معاملة)
  async function derive(d, uid, key, value, ts) {
    let m;
    if (key === "efhama_completed" || key === "efhama_started") {
      const known = new Set(await content.lessonIds());
      const ids = json(value).filter((id) => !known.size || known.has(id));
      if (key === "efhama_completed") {
        await d.run("DELETE FROM lesson_progress WHERE user_id = ? AND status = ?", [uid, "completed"]);
        for (const id of ids) {
          await d.run(
            `INSERT INTO lesson_progress (user_id, lesson_id, status, updated_at) VALUES (?, ?, 'completed', ?)
             ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'completed', updated_at = excluded.updated_at`,
            [uid, id, ts]
          );
        }
      } else {
        await d.run("DELETE FROM lesson_progress WHERE user_id = ? AND status = ?", [uid, "started"]);
        for (const id of ids) {
          await d.run(
            `INSERT INTO lesson_progress (user_id, lesson_id, status, updated_at) VALUES (?, ?, 'started', ?)
             ON CONFLICT(user_id, lesson_id) DO NOTHING`,
            [uid, id, ts]
          );
        }
      }
    } else if ((m = /^efhama_rating_([\w-]+)$/.exec(key))) {
      await d.run(
        `INSERT INTO ratings (user_id, lesson_id, stars, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, lesson_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at`,
        [uid, m[1], json(value).stars, ts]
      );
    } else if (key === "efhama_quiz_results") {
      for (const [k, v] of Object.entries(json(value))) {
        if (v && Number.isInteger(v.score) && Number.isInteger(v.total) && v.total > 0 && v.score >= 0 && v.score <= v.total) {
          await d.run(
            "INSERT INTO quiz_attempts (user_id, quiz_key, score, total, taken_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
            [uid, String(k).slice(0, 60), v.score, v.total, Number.isFinite(v.at) ? v.at : ts]
          );
        }
      }
    } else if ((m = /^efhama_challenge_([\w-]{1,60})$/.exec(key))) {
      const record = json(value);
      await d.run(
        `INSERT INTO challenge_progress (user_id, challenge_id, attempts, best_score, completed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, challenge_id) DO UPDATE SET
           attempts = CASE WHEN excluded.attempts > challenge_progress.attempts THEN excluded.attempts ELSE challenge_progress.attempts END,
           best_score = CASE WHEN excluded.best_score > challenge_progress.best_score THEN excluded.best_score ELSE challenge_progress.best_score END,
           completed = CASE WHEN excluded.completed > challenge_progress.completed THEN excluded.completed ELSE challenge_progress.completed END,
           updated_at = excluded.updated_at`,
        [uid, m[1], record.attempts, record.bestScore, record.completed ? 1 : 0, ts]
      );
      if (record.lastAttemptAt > 0) {
        await d.run(
          "INSERT INTO challenge_attempts (user_id, challenge_id, score, passed, attempted_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
          [uid, m[1], record.lastScore, record.lastPassed ? 1 : 0, record.lastAttemptAt]
        );
      }
    }
  }

  async function saveOne(d, uid, key, value, ts) {
    const err = validate(key, value);
    if (err) return err;
    await d.run(
      `INSERT INTO user_state (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [uid, key, value, ts]
    );
    await derive(d, uid, key, value, ts);
    return null;
  }

  r.get("/", async (req, res) => {
    const state = {};
    for (const row of await db.all("SELECT key, value, updated_at FROM user_state WHERE user_id = ?", [req.user.id])) {
      state[row.key] = row.value;
    }
    res.set("Cache-Control", "no-store");
    res.json({ state, serverTime: Date.now() });
  });

  r.put("/:key", async (req, res) => {
    const err = await saveOne(db, req.user.id, req.params.key, (req.body || {}).value, Date.now());
    if (err) return res.status(400).json({ error: "invalid_state", message: err });
    res.json({ ok: true });
  });

  r.put("/", async (req, res) => {
    const items = (req.body || {}).items;
    if (!items || typeof items !== "object" || Array.isArray(items))
      return res.status(400).json({ error: "invalid_body", message: "items مطلوب" });
    const entries = Object.entries(items);
    if (entries.length > MAX_BULK) return res.status(400).json({ error: "too_many", message: "عدد كبير من العناصر" });
    const rejected = {};
    const ts = Date.now();
    await db.tx(async (t) => {
      for (const [k, v] of entries) {
        const err = await saveOne(t, req.user.id, k, v, ts);
        if (err) rejected[k] = err;
      }
    });
    res.json({ ok: true, saved: entries.length - Object.keys(rejected).length, rejected });
  });

  r.delete("/:key", async (req, res) => {
    await db.run("DELETE FROM user_state WHERE user_id = ? AND key = ?", [req.user.id, req.params.key]);
    res.json({ ok: true });
  });

  return r;
};
