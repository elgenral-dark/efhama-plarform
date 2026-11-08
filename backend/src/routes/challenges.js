const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { rateLimit } = require("express-rate-limit");

const MAX_QUERY_LENGTH = 4000;
const MAX_WORKER_OUTPUT = 16_384;
const MAX_ACTIVE_RUNNERS = 4;
const SQL_CHALLENGES_PATH = path.join(__dirname, "../../content/challenges.json");
const SQL_RUNNER_PATH = path.join(__dirname, "../workers/sql-challenge-runner.js");
let activeRunners = 0;

module.exports = function challengeRoutes({ requireAuth, requireSubscription }) {
  const router = express.Router();
  router.use(requireAuth, requireSubscription);
  const bank = JSON.parse(fs.readFileSync(SQL_CHALLENGES_PATH, "utf8"));
  const challenges = new Map(
    Object.values(bank).flat().filter((challenge) => challenge.language === "sql" && Array.isArray(challenge.sqlTests))
      .map((challenge) => [challenge.id, challenge])
  );

  router.post("/sql", rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
  }), (req, res) => {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    const rawQuery = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const query = rawQuery.endsWith(";") ? rawQuery.slice(0, -1).trim() : rawQuery;
    const challenge = challenges.get(challengeId);
    if (!challenge || !query || query.length > MAX_QUERY_LENGTH || query.includes(";")
      || !/^(?:SELECT|WITH)\b/i.test(query) || /\bRECURSIVE\b/i.test(query)) {
      return res.status(400).json({ error: "invalid_query", message: "أرسل تحديًا معروفًا واستعلام SELECT واحدًا لا يتجاوز 4,000 حرف." });
    }
    if (activeRunners >= MAX_ACTIVE_RUNNERS) {
      return res.status(429).json({ error: "runner_limit", message: "مشغل SQL مشغول الآن. انتظر قليلًا ثم أعد المحاولة." });
    }

    let child;
    try {
      child = spawn(process.execPath, [
        "--max-old-space-size=32",
        "--max-semi-space-size=8",
        "--stack-size=2048",
        SQL_RUNNER_PATH
      ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      console.error("Unable to start isolated SQL challenge process:", error);
      return res.status(503).json({ error: "runner_unavailable", message: "تعذر بدء بيئة SQL المعزولة." });
    }

    activeRunners += 1;
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      finish(200, {
        score: 0,
        passed: 0,
        total: challenge.sqlTests.length,
        message: "أُوقف الاستعلام لتجاوز مهلة التنفيذ."
      });
    }, 5000);
    const finish = (status, body) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.status(status).json(body);
    };

    child.stdin.on("error", (error) => {
      if (settled) return;
      console.error("Unable to send isolated SQL challenge input:", error);
      finish(503, { error: "runner_input_failed", message: "تعذر إرسال الاستعلام إلى بيئة SQL المعزولة." });
    });
    child.stdin.end(JSON.stringify({ query, tests: challenge.sqlTests }));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_WORKER_OUTPUT) {
        child.kill();
        finish(503, { error: "runner_output_limit", message: "تجاوزت نتيجة SQL الحد المسموح." });
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 2000) stderr += chunk.slice(0, 2000 - stderr.length);
    });
    child.once("error", (error) => {
      console.error("Isolated SQL challenge process failed:", error);
      finish(503, { error: "runner_failed", message: "تعذر تشغيل اختبار SQL المعزول." });
    });
    child.once("close", (code) => {
      activeRunners -= 1;
      if (settled) return;
      if (code !== 0) {
        console.error("Isolated SQL challenge process exited unexpectedly:", stderr || code);
        finish(503, { error: "runner_failed", message: "توقفت بيئة SQL المعزولة بشكل غير متوقع." });
        return;
      }
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (error) {
        console.error("Isolated SQL challenge process returned invalid output:", error);
        finish(503, { error: "runner_invalid_output", message: "تعذر قراءة نتيجة اختبار SQL المعزول." });
        return;
      }
      if (result.error) {
        finish(200, {
          score: 0,
          passed: 0,
          total: challenge.sqlTests.length,
          message: "تعذر تنفيذ الاستعلام. تأكد أنه SELECT مسموح ويستخدم جداول التحدي فقط."
        });
        return;
      }
      const score = Math.round((result.passed / result.total) * 100);
      finish(200, {
        score,
        passed: result.passed,
        total: result.total,
        message: score === 100
          ? "أحسنت! نجح الاستعلام مع كل مجموعات البيانات."
          : "النتيجة لا تطابق كل حالات الاختبار. راجع شرط التصفية أو الربط والترتيب."
      });
    });
  });

  return router;
};
