const express = require("express");

/* نفس المسارات التي تطلبها الواجهة (data/...) + مسارات /api مكافئة */
module.exports = function contentRoutes(content, { requireSubscription }) {
  const r = express.Router();
  const send = (res, raw) => {
    if (!raw) return res.status(404).json({ error: "not_found", message: "المحتوى غير موجود" });
    res.set("Cache-Control", "private, no-cache");
    res.type("application/json; charset=utf-8").send(raw);
  };

  const curriculum = async (_req, res) => send(res, await content.raw("curriculum", "main"));
  const searchIndex = async (_req, res) => send(res, await content.raw("search_index", "main"));
  const lesson = async (req, res) => send(res, await content.raw("lesson", req.params.id));
  const quiz = async (req, res) => send(res, await content.raw("quiz", req.params.n));

  const ID = /^[\w-]{1,20}$/;
  r.param("id", (req, res, next, v) => (ID.test(v) ? next() : res.status(404).json({ error: "not_found" })));
  r.param("n", (req, res, next, v) => (/^\d{1,4}$/.test(v) ? next() : res.status(404).json({ error: "not_found" })));

  for (const prefix of ["/data", "/api"]) {
    const isData = prefix === "/data";
    r.get(`${prefix}/${isData ? "curriculum.json" : "curriculum"}`, requireSubscription, curriculum);
    r.get(`${prefix}/${isData ? "search-index.json" : "search-index"}`, requireSubscription, searchIndex);
    r.get(isData ? "/data/lessons/lesson-:id.json" : "/api/lessons/:id", requireSubscription, lesson);
    r.get(isData ? "/data/quizzes/chapter-:n-quiz.json" : "/api/quizzes/:n", requireSubscription, quiz);
  }
  return r;
};
