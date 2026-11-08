const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const {
  PATHS,
  ASSESSMENTS,
  getAssessment,
  getQuestion,
  publicQuestion,
  publicCorrectOption,
  sanitizeAssessment
} = require("../assessments/catalog");

const CODE_RUNNER = path.join(__dirname, "../workers/assessment-code-runner.js");
const MAX_ACTIVE_GRADERS = 4;
const MAX_ACTIVE_PYTHON_GRADERS = 1;
const MAX_ANSWER_LENGTH = 6000;

module.exports = function assessmentRoutes(db, { requireAuth, requireSubscription }) {
  const router = express.Router();
  router.use(requireAuth, requireSubscription);
  let activeGraders = 0;
  let activePythonGraders = 0;

  const getSession = (id, userId) => db.get("SELECT * FROM assessment_sessions WHERE id = ? AND user_id = ?", [id, userId]);
  const getActiveSession = (userId, assessmentId) => db.get(
    "SELECT * FROM assessment_sessions WHERE user_id = ? AND assessment_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
    [userId, assessmentId]
  );

  const readJson = (value, fallback) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const shuffle = (values) => {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = crypto.randomInt(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  };

  function sessionView(session, assessment) {
    const questionIds = readJson(session.question_ids_json, []);
    const savedAnswers = readJson(session.answers_json, {});
    return {
      sessionId: session.id,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        kind: assessment.kind,
        questionCount: questionIds.length,
        passPercent: assessment.passPercent,
        timeLimitSeconds: assessment.timeLimitSeconds,
        startedAt: session.started_at,
        expiresAt: session.expires_at,
        instructions: assessment.instructions
      },
      questions: questionIds.map((id) => publicQuestion(getQuestion(assessment.slug, id))),
      answers: savedAnswers,
      status: session.status,
      result: readJson(session.result_json, null)
    };
  }

  async function getAttemptSummaries(userId, assessments) {
    const ids = assessments.map((assessment) => assessment.id);
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    const params = [userId, ...ids];
    const [stats, history, activeSessions] = await Promise.all([
      db.all(
        `SELECT assessment_id, COUNT(*) AS attempts,
                COALESCE(MAX(score * 100 / total), 0) AS best_score
           FROM assessment_attempts
          WHERE user_id = ? AND assessment_id IN (${placeholders})
          GROUP BY assessment_id`,
        params
      ),
      db.all(
        `WITH ranked AS (
           SELECT assessment_id, score, total, passed, completed_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY assessment_id ORDER BY completed_at DESC, id DESC
                  ) AS position
             FROM assessment_attempts
            WHERE user_id = ? AND assessment_id IN (${placeholders})
         )
         SELECT assessment_id, score, total, passed, completed_at
           FROM ranked WHERE position <= 5
          ORDER BY assessment_id, position`,
        params
      ),
      db.all(
        `SELECT id, assessment_id FROM assessment_sessions
          WHERE user_id = ? AND assessment_id IN (${placeholders}) AND status = 'active'
          ORDER BY started_at DESC`,
        params
      ),
    ]);

    const summaries = new Map(ids.map((id) => [id, {
      attempts: 0,
      bestScore: 0,
      lastScore: null,
      lastPassed: null,
      history: [],
      activeSessionId: null,
    }]));
    for (const row of stats) {
      const summary = summaries.get(row.assessment_id);
      summary.attempts = Number(row.attempts);
      summary.bestScore = Number(row.best_score);
    }
    for (const row of history) {
      const summary = summaries.get(row.assessment_id);
      const attempt = {
        score: row.score,
        total: row.total,
        percent: Math.round((row.score / row.total) * 100),
        passed: row.passed === 1,
        completedAt: row.completed_at,
      };
      if (summary.lastScore === null) {
        summary.lastScore = attempt.percent;
        summary.lastPassed = attempt.passed;
      }
      summary.history.push(attempt);
    }
    for (const session of activeSessions) {
      const summary = summaries.get(session.assessment_id);
      if (summary.activeSessionId === null) summary.activeSessionId = session.id;
    }
    return summaries;
  }

  function evaluateHtml(question, answer) {
    const has = (pattern) => pattern.test(answer);
    let passed = 0;
    for (const check of question.checks) {
      let ok = false;
      if (check.kind === "selector" && check.selector === "form label[for]") ok = has(/<form\b[\s\S]*?<label\b[^>]*\bfor\s*=/i);
      else if (check.kind === "selector" && check.selector === 'form input[type="email"]') ok = has(/<form\b[\s\S]*?<input\b(?=[^>]*\btype\s*=\s*["']?email\b)[^>]*>/i);
      else if (check.kind === "selector" && check.selector === 'form button[type="submit"]') ok = has(/<form\b[\s\S]*?<button\b(?=[^>]*\btype\s*=\s*["']?submit\b)[^>]*>/i);
      else if (check.kind === "label-for-input") {
        const label = answer.match(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/i);
        ok = !!label && new RegExp(`<input\\b(?=[^>]*\\bid\\s*=\\s*["']${label[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'])[^>]*>`, "i").test(answer);
      }
      if (ok) passed += 1;
    }
    return { passed, total: question.checks.length };
  }

  function evaluatePseudocode(question, answer) {
    const source = answer.toLowerCase().replace(/#.*$/gm, "").replace(/\/\/.*$/gm, "");
    const firstOccurrence = (tokens) => {
      const positions = tokens.map((token) => source.indexOf(token.toLowerCase())).filter((position) => position >= 0);
      return positions.length ? Math.min(...positions) : -1;
    };
    let passed = 0;
    for (const check of question.checks) {
      if (check.kind === "order") {
        const token = firstOccurrence(check.tokenAny || [check.token]);
        const before = firstOccurrence(check.beforeAny || [check.before]);
        if (token >= 0 && before >= 0 && token < before) passed += 1;
      } else if (check.kind === "accumulation") {
        const target = check.target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const value = check.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const expression = new RegExp(
          `\\b${target}\\s*(?:\\+=\\s*${value}|(?:←|<-|=)\\s*(?:${target}\\s*\\+\\s*${value}|${value}\\s*\\+\\s*${target}))\\b`,
          "i"
        );
        if (expression.test(source)) passed += 1;
      } else if (check.kind === "collection") {
        const values = `[${check.values.join(",")}]`;
        if (source.replace(/\s+/g, "").includes(values)) passed += 1;
      } else if (check.kind === "output") {
        const variable = check.variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const output = new RegExp(`(?:print|display|output|اطبع|اعرض)\\s*(?:\\(\\s*|\\[\\s*)?${variable}\\b`, "i");
        if (output.test(source)) passed += 1;
      }
    }
    return { passed, total: question.checks.length };
  }

  function runCode(question, answer) {
    return new Promise((resolve, reject) => {
      const isPython = question.language === "python";
      if (activeGraders >= MAX_ACTIVE_GRADERS || (isPython && activePythonGraders >= MAX_ACTIVE_PYTHON_GRADERS)) {
        reject(Object.assign(new Error("المصحح مشغول الآن. انتظر قليلًا ثم أعد التسليم."), { status: 429 }));
        return;
      }
      activeGraders += 1;
      if (isPython) activePythonGraders += 1;
      const memoryLimit = isPython ? 128 : 64;
      let child;
      try {
        const args = [];
        if (isPython) {
          args.push("--wasm-max-mem-pages=4096");
        } else {
          args.push("--permission", `--allow-fs-read=${CODE_RUNNER}`);
        }
        args.push(
          `--max-old-space-size=${memoryLimit}`,
          "--stack-size=2048",
          CODE_RUNNER
        );
        child = spawn(process.execPath, args, {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          env: { PATH: process.env.PATH || "" }
        });
      } catch (error) {
        activeGraders -= 1;
        if (isPython) activePythonGraders -= 1;
        reject(Object.assign(new Error("تعذر بدء المصحح المعزول."), { status: 503 }));
        return;
      }

      let stdout = "";
      let stderr = "";
      let settled = false;
      const done = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      };
      const timeout = question.language === "python" ? 8_000 : 2_000;
      const timer = setTimeout(() => {
        child.kill();
        done(Object.assign(new Error("تجاوز تنفيذ الكود المهلة المحددة وأُوقف."), { status: 200, timeout: true }));
      }, timeout);

      child.stdin.on("error", (error) => {
        done(Object.assign(new Error("تعذر إرسال الإجابة إلى المصحح."), { status: 503, cause: error }));
      });
      child.stdin.end(JSON.stringify({ question, answer }));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 16_384) {
          child.kill();
          done(Object.assign(new Error("تجاوزت نتيجة التنفيذ الحد المسموح."), { status: 503 }));
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 2000) stderr += chunk.slice(0, 2000 - stderr.length);
      });
      child.once("error", (error) => {
        console.error("Unable to start assessment code runner:", error);
        done(Object.assign(new Error("تعذر تشغيل المصحح المعزول."), { status: 503 }));
      });
      child.once("close", (code) => {
        activeGraders -= 1;
        if (isPython) activePythonGraders -= 1;
        if (settled) return;
        if (code !== 0) {
          console.error("Assessment code runner exited unexpectedly:", stderr || code);
          done(Object.assign(new Error("توقفت بيئة التقييم بشكل غير متوقع."), { status: 503 }));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          if (result.error) {
            done(null, { passed: 0, total: question.tests?.length || question.checks?.length || 1, feedback: "تعذر تشغيل الإجابة. راجع الصياغة وحاول مرة أخرى." });
          } else {
            done(null, result);
          }
        } catch (error) {
          console.error("Assessment code runner returned invalid output:", error);
          done(Object.assign(new Error("تعذر قراءة نتيجة التقييم."), { status: 503 }));
        }
      });
    });
  }

  async function scoreSession(session, assessment) {
    const questionIds = readJson(session.question_ids_json, []);
    const answers = readJson(session.answers_json, {});
    const reviews = [];
    for (const id of questionIds) {
      const question = getQuestion(assessment.slug, id);
      const answer = answers[id] ?? null;
      let passed = false;
      let correctAnswer = null;
      let answerLabel = null;
      if (question.type === "practical-coding" && question.tests.length + question.checks.length > 0) {
        let runResult = { passed: 0, total: question.tests.length || question.checks.length };
        if (typeof answer === "string" && answer.trim()) {
          try {
            runResult = question.language === "html"
              ? evaluateHtml(question, answer)
              : question.language === "pseudocode"
                ? evaluatePseudocode(question, answer)
                : await runCode(question, answer);
          } catch (error) {
            if (error.status === 200) runResult = { passed: 0, total: question.tests.length || question.checks.length };
            else throw error;
          }
        }
        passed = runResult.total > 0 && runResult.passed === runResult.total;
        answerLabel = typeof answer === "string" && answer.trim() ? "تم تسليم كود" : "بدون إجابة";
      } else {
        const selectedIndex = Number(String(answer).replace(/^option-/, ""));
        const selectedOption = Number.isInteger(selectedIndex) ? question.options[selectedIndex] : null;
        passed = typeof answer === "string" && answer === publicCorrectOption(question);
        correctAnswer = question.options.find((option) => option.id === question.correctOption)?.text || null;
        answerLabel = selectedOption?.text || (answer ? String(answer).slice(0, 120) : "بدون إجابة");
      }
      reviews.push({
        questionId: id,
        lessonId: question.lessonId,
        lessonTitle: question.lessonTitle,
        skill: question.skill,
        type: question.type,
        prompt: question.prompt,
        passed,
        answer: answerLabel,
        correctAnswer,
        explanation: question.explanation,
        recommendation: `lesson.html?slug=${encodeURIComponent(assessment.slug)}&lesson=${encodeURIComponent(question.lessonId)}`
      });
    }
    const correct = reviews.filter((review) => review.passed).length;
    const total = reviews.length;
    const scorePercent = total ? Math.round((correct / total) * 100) : 0;
    const skills = new Map();
    for (const review of reviews) {
      const current = skills.get(review.skill) || { skill: review.skill, total: 0, correct: 0, lessonId: review.lessonId };
      current.total += 1;
      if (review.passed) current.correct += 1;
      skills.set(review.skill, current);
    }
    const skillResults = [...skills.values()].map((item) => ({
      skill: item.skill,
      correct: item.correct,
      total: item.total,
      mastered: item.correct === item.total,
      lessonId: item.lessonId,
      recommendation: `lesson.html?slug=${encodeURIComponent(assessment.slug)}&lesson=${encodeURIComponent(item.lessonId)}`
    }));
    return {
      assessmentId: assessment.id,
      score: correct,
      total,
      scorePercent,
      correct,
      wrong: total - correct,
      passed: scorePercent >= assessment.passPercent,
      passPercent: assessment.passPercent,
      skillsMastered: skillResults.filter((item) => item.mastered).map((item) => item.skill),
      skillsToImprove: skillResults.filter((item) => !item.mastered).map((item) => item.skill),
      recommendedLessons: [...new Map(
        skillResults.filter((item) => !item.mastered).map((item) => [item.lessonId, {
          lessonId: item.lessonId,
          title: reviews.find((review) => review.lessonId === item.lessonId)?.lessonTitle || item.lessonId,
          href: item.recommendation
        }])
      ).values()],
      skills: skillResults,
      review: reviews,
      submittedAt: Date.now()
    };
  }

  async function getAttemptBySession(sessionId) {
    return db.get("SELECT result_json FROM assessment_attempts WHERE session_id = ?", [sessionId]);
  }

  async function finalize(session, assessment, userId, res) {
    if (session.status === "submitted") {
      const saved = await getAttemptBySession(session.id);
      return res.json({ result: saved ? readJson(saved.result_json, null) : readJson(session.result_json, null), alreadySubmitted: true });
    }
    const current = await getSession(session.id, userId);
    if (!current || current.status !== "active") return res.status(409).json({ error: "session_closed", message: "تم إنهاء هذه الجلسة بالفعل." });
    let result;
    try {
      result = await scoreSession(current, assessment);
    } catch (error) {
      console.error("Unable to grade assessment:", error);
      return res.status(error.status || 503).json({
        error: "grading_failed",
        message: error.message || "تعذر تصحيح الاختبار. إجاباتك ما زالت محفوظة؛ يمكنك المحاولة مجددًا."
      });
    }
    const completedAt = Date.now();
    const resultJson = JSON.stringify(result);
    const saved = await db.tx(async (t) => {
      await t.lockAssessmentSession(current.id, userId);
      const latest = await t.get("SELECT * FROM assessment_sessions WHERE id = ? AND user_id = ?", [current.id, userId]);
      if (!latest) return "missing";
      if (latest.status === "submitted") return "already_submitted";
      if (latest.status !== "active") return "session_closed";
      if (latest.answers_json !== current.answers_json) return "answers_changed";
      const inserted = await t.run(
        `INSERT INTO assessment_attempts
          (user_id, assessment_id, session_id, score, total, passed, completed_at, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        [userId, assessment.id, current.id, result.score, result.total, result.passed ? 1 : 0, completedAt, resultJson]
      );
      const updated = await t.run(
        "UPDATE assessment_sessions SET status = 'submitted', submitted_at = ?, result_json = ? WHERE id = ? AND user_id = ? AND status = 'active'",
        [completedAt, resultJson, current.id, userId]
      );
      return inserted.changes && updated.changes ? "submitted" : "already_submitted";
    });
    if (saved === "missing") return res.status(404).json({ error: "session_not_found", message: "جلسة الاختبار غير موجودة." });
    if (saved === "session_closed") return res.status(409).json({ error: "session_closed", message: "تم إنهاء هذه الجلسة بالفعل." });
    if (saved === "answers_changed")
      return res.status(409).json({ error: "answers_changed", message: "تغيرت الإجابات أثناء التصحيح. أعد إرسال الاختبار." });
    const attempt = await getAttemptBySession(current.id);
    return res.json({
      result: readJson(attempt?.result_json, result),
      alreadySubmitted: saved === "already_submitted",
    });
  }

  router.get("/", async (req, res) => {
    const slug = typeof req.query.slug === "string" ? req.query.slug : "";
    if (!PATHS.includes(slug)) return res.status(400).json({ error: "invalid_path", message: "المسار التعليمي غير صالح." });
    res.set("Cache-Control", "no-store");
    const summaries = await getAttemptSummaries(req.user.id, ASSESSMENTS[slug]);
    const list = ASSESSMENTS[slug].map((assessment) =>
      sanitizeAssessment(assessment, summaries.get(assessment.id))
    );
    res.json({ path: slug, assessments: list });
  });

  router.post("/:assessmentId/start", rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const assessment = getAssessment(req.params.assessmentId);
    if (!assessment) return res.status(404).json({ error: "assessment_not_found", message: "الاختبار غير موجود." });
    const startedAt = Date.now();
    const sessionId = crypto.randomUUID();
    const questionIds = shuffle(assessment.questionIds);
    const outcome = await db.tx(async (t) => {
      await t.lockUser(req.user.id);
      const existing = await t.get(
        "SELECT * FROM assessment_sessions WHERE user_id = ? AND assessment_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
        [req.user.id, assessment.id]
      );
      if (existing) return { session: existing, created: false };
      await t.run(
        `INSERT INTO assessment_sessions
          (id, user_id, assessment_id, question_ids_json, answers_json, status, started_at, expires_at)
         VALUES (?, ?, ?, ?, '{}', 'active', ?, ?)`,
        [sessionId, req.user.id, assessment.id, JSON.stringify(questionIds), startedAt, startedAt + assessment.timeLimitSeconds * 1000]
      );
      return {
        session: await t.get("SELECT * FROM assessment_sessions WHERE id = ? AND user_id = ?", [sessionId, req.user.id]),
        created: true,
      };
    });
    return res.status(outcome.created ? 201 : 200).json(sessionView(outcome.session, assessment));
  });

  router.get("/sessions/:sessionId", async (req, res) => {
    const session = await getSession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: "session_not_found", message: "جلسة الاختبار غير موجودة." });
    const assessment = getAssessment(session.assessment_id);
    if (!assessment) return res.status(404).json({ error: "assessment_not_found", message: "الاختبار غير موجود." });
    res.set("Cache-Control", "no-store");
    return res.json(sessionView(session, assessment));
  });

  router.put("/sessions/:sessionId/answers", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const { questionId, answer } = req.body || {};
    const outcome = await db.tx(async (t) => {
      await t.lockAssessmentSession(req.params.sessionId, req.user.id);
      const session = await t.get("SELECT * FROM assessment_sessions WHERE id = ? AND user_id = ?", [req.params.sessionId, req.user.id]);
      if (!session) return { status: 404, error: "session_not_found", message: "جلسة الاختبار غير موجودة." };
      if (session.status !== "active" || Date.now() >= session.expires_at)
        return { status: 410, error: "session_expired", message: "انتهى وقت الاختبار. أرسل الإجابات المحفوظة لعرض النتيجة." };
      const assessment = getAssessment(session.assessment_id);
      const question = assessment && getQuestion(assessment.slug, questionId);
      const allowed = readJson(session.question_ids_json, []);
      if (!question || !allowed.includes(questionId) || (answer !== null && typeof answer !== "string"))
        return { status: 400, error: "invalid_answer", message: "الإجابة أو السؤال غير صالح." };
      if (typeof answer === "string" && answer.length > MAX_ANSWER_LENGTH)
        return { status: 413, error: "answer_too_large", message: "الإجابة أطول من الحد المسموح." };
      if (answer !== null && question.options.length
        && (!/^option-\d+$/.test(answer) || Number(answer.slice(7)) >= question.options.length))
        return { status: 400, error: "invalid_option", message: "الاختيار غير موجود في هذا السؤال." };
      const answers = readJson(session.answers_json, {});
      if (answer === null || answer === "") delete answers[questionId];
      else answers[questionId] = answer;
      const saved = await t.run(
        "UPDATE assessment_sessions SET answers_json = ? WHERE id = ? AND user_id = ? AND status = 'active' AND expires_at > ?",
        [JSON.stringify(answers), session.id, req.user.id, Date.now()]
      );
      if (!saved.changes)
        return { status: 410, error: "session_expired", message: "انتهى وقت الاختبار. أرسل الإجابات المحفوظة لعرض النتيجة." };
      return { savedAt: Date.now() };
    });
    if (outcome.status) return res.status(outcome.status).json({ error: outcome.error, message: outcome.message });
    return res.json({ ok: true, savedAt: outcome.savedAt });
  });

  router.post("/sessions/:sessionId/submit", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const session = await getSession(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: "session_not_found", message: "جلسة الاختبار غير موجودة." });
    const assessment = getAssessment(session.assessment_id);
    if (!assessment) return res.status(404).json({ error: "assessment_not_found", message: "الاختبار غير موجود." });
    return finalize(session, assessment, req.user.id, res);
  });

  return router;
};
