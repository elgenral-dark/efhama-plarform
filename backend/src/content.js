/* إدارة محتوى المنهج داخل قاعدة البيانات + بناء فهرس البحث */
const now = () => Date.now();

function makeContent(db) {
  const api = {
    async raw(kind, id) {
      const row = await db.get("SELECT json FROM content WHERE kind = ? AND id = ?", [kind, String(id)]);
      return row ? row.json : null;
    },
    async get(kind, id) {
      const r = await api.raw(kind, id);
      return r ? JSON.parse(r) : null;
    },
    async exists(kind, id) {
      return !!(await db.get("SELECT 1 AS x FROM content WHERE kind = ? AND id = ?", [kind, String(id)]));
    },
    async set(kind, id, obj) {
      await db.run(
        `INSERT INTO content (kind, id, json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
        [kind, String(id), JSON.stringify(obj), now()]
      );
    },
    async lessonIds() {
      const c = await api.get("curriculum", "main");
      if (!c) return [];
      return c.chapters.flatMap((ch) => ch.lessons.map((l) => l.id));
    },
    /* يُعيد بناء search-index بنفس صيغة الملف الأصلي */
    async buildSearchIndex() {
      const cur = await api.get("curriculum", "main");
      const out = { lessons: [], terms: [], questions: [] };
      if (!cur) return out;
      for (const ch of cur.chapters) {
        for (const l of ch.lessons) {
          const lesson = await api.get("lesson", l.id);
          if (!lesson) continue;
          out.lessons.push({
            id: lesson.id,
            title: lesson.title,
            desc: lesson.desc,
            headings: (lesson.sections || []).map((s) => s.heading).filter(Boolean),
          });
          for (const t of lesson.terms || []) {
            out.terms.push({ term: t.term, definition: t.definition, lesson: lesson.id });
          }
        }
      }
      for (const ch of cur.chapters) {
        const quiz = await api.get("quiz", ch.id);
        for (const q of (quiz && quiz.questions) || []) {
          out.questions.push({ q: q.q, lesson: q.lesson });
        }
      }
      return out;
    },
    async rebuildSearchIndex() {
      await api.set("search_index", "main", await api.buildSearchIndex());
    },
  };
  return api;
}

/* ---------- التحقق من صحة المحتوى (للوحة الإدارة) ---------- */
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

function validateLesson(id, d) {
  const errs = [];
  if (!d || typeof d !== "object") return ["المحتوى يجب أن يكون كائن JSON"];
  if (d.id !== id) errs.push(`حقل id يجب أن يساوي ${id}`);
  if (!isStr(d.title)) errs.push("title مطلوب");
  if (!Array.isArray(d.sections) || !d.sections.length) errs.push("sections مصفوفة غير فارغة مطلوبة");
  else d.sections.forEach((s, i) => {
    if (!s || !isStr(s.type)) errs.push(`sections[${i}].type مطلوب`);
    if (!s || !isStr(s.heading)) errs.push(`sections[${i}].heading مطلوب`);
  });
  if (d.terms !== undefined && !Array.isArray(d.terms)) errs.push("terms يجب أن تكون مصفوفة");
  return errs;
}

function validateQuiz(chapterId, d) {
  const errs = [];
  if (!d || !Array.isArray(d.questions) || !d.questions.length) return ["questions مصفوفة غير فارغة مطلوبة"];
  d.questions.forEach((q, i) => {
    if (!isStr(q.q)) errs.push(`questions[${i}].q مطلوب`);
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isStr))
      errs.push(`questions[${i}].options يجب أن تحتوي خيارين نصيين على الأقل`);
    else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length)
      errs.push(`questions[${i}].answer فهرس غير صالح`);
  });
  return errs;
}

function validateCurriculum(d) {
  const errs = [];
  if (!d || !Array.isArray(d.chapters) || !d.chapters.length) return ["chapters مطلوبة"];
  const seen = new Set();
  d.chapters.forEach((ch, i) => {
    if (!Number.isInteger(ch.id)) errs.push(`chapters[${i}].id رقم صحيح مطلوب`);
    if (!isStr(ch.title)) errs.push(`chapters[${i}].title مطلوب`);
    if (!Array.isArray(ch.lessons)) errs.push(`chapters[${i}].lessons مصفوفة مطلوبة`);
    else ch.lessons.forEach((l, j) => {
      if (!isStr(l.id) || !/^[\w-]{1,20}$/.test(l.id)) errs.push(`chapters[${i}].lessons[${j}].id غير صالح`);
      else if (seen.has(l.id)) errs.push(`معرّف الدرس ${l.id} مكرر`);
      else seen.add(l.id);
      if (!isStr(l.title)) errs.push(`chapters[${i}].lessons[${j}].title مطلوب`);
    });
  });
  return errs;
}

module.exports = { makeContent, validateLesson, validateQuiz, validateCurriculum };
