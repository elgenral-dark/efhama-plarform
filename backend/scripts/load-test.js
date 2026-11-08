process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "local-load-test-secret";
process.env.ADMIN_EMAIL = "load-test-admin@example.test";
process.env.ADMIN_PASSWORD = "LocalLoadTestPassword123";
process.env.AUTH_RATE_LIMIT = "5000";
delete process.env.DATABASE_URL;
delete process.env.TEST_DATABASE_URL;

const os = require("node:os");
const { performance } = require("node:perf_hooks");
const bcrypt = require("bcryptjs");
const { openDatabase } = require("../src/database");
const { createApp } = require("../src/index");
const { seedContent, ensureAdmin } = require("../src/seed");
const passwords = require("../src/passwords");

const VUS = [10, 50, 100, 300, 500, 1000];
const PROOF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4QAAAABJRU5ErkJggg==";
const BASE_PATHS = [
  "/api/health",
  "/api/auth/me",
  "/api/assessments?slug=logic",
  "/data/curriculum.json",
  "/data/lessons/lesson-1-1.json",
];

function percentile(values, ratio) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  await response.arrayBuffer();
  return response.status;
}

async function measure(label, jobs) {
  const cpuStart = process.cpuUsage();
  const startedAt = performance.now();
  let peakRss = process.memoryUsage().rss;
  const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 50);
  const latencies = [];
  const statusCounts = {};
  let errors = 0;

  await Promise.all(jobs.map(async (job) => {
    const requestStarted = performance.now();
    try {
      const status = await job();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (status < 200 || status >= 400) errors += 1;
    } catch (error) {
      errors += 1;
      const key = `network:${error.code || error.name}`;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    } finally {
      latencies.push(performance.now() - requestStarted);
    }
  }));

  clearInterval(sample);
  const elapsedMs = performance.now() - startedAt;
  const cpu = process.cpuUsage(cpuStart);
  latencies.sort((a, b) => a - b);
  return {
    scenario: label,
    requests: jobs.length,
    requestsPerSecond: Number((jobs.length * 1000 / elapsedMs).toFixed(2)),
    averageMs: Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
    p99Ms: Number(percentile(latencies, 0.99).toFixed(2)),
    errorRatePercent: Number((errors * 100 / jobs.length).toFixed(2)),
    statusCounts,
    processCpuPercentOfMachine: Number(((cpu.user + cpu.system) / (elapsedMs * 1000 * os.cpus().length) * 100).toFixed(2)),
    rssMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
    peakRssMiB: Number((peakRss / 1024 / 1024).toFixed(1)),
  };
}

async function main() {
  const db = await openDatabase({ sqliteFile: ":memory:", databaseUrl: "" });
  let server;
  try {
    await seedContent(db, { log: () => {} });
    await ensureAdmin(db, { log: () => {} });
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;

    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    if (!login.ok) throw new Error(`Local benchmark admin login failed with HTTP ${login.status}`);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    if (!cookie) throw new Error("Local benchmark admin login did not issue a session cookie");

    const results = [];
    for (const vus of VUS) {
      const jobs = Array.from({ length: vus }, (_, index) => {
        const path = BASE_PATHS[index % BASE_PATHS.length];
        return () => request(`${base}${path}`, { headers: { cookie } });
      });
      const result = await measure(`authenticated-read-mix-${vus}-vus`, jobs);
      results.push(result);
      console.log(JSON.stringify(result));
      if (result.errorRatePercent > 5 || result.p99Ms > 10_000) {
        console.log("Stopped progressive testing after the local safety threshold was exceeded.");
        break;
      }
    }

    const registerJobs = Array.from({ length: 10 }, (_, index) => () => request(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `Load Registration ${index}`,
        email: `load-registration-${index}@example.test`,
        password: "LocalLoadTestPassword123",
        confirmPassword: "LocalLoadTestPassword123",
        proof: PROOF,
      }),
    }));
    results.push(await measure("registration-with-payment-proof-10-vus", registerJobs));
    console.log(JSON.stringify(results[results.length - 1]));

    const passwordHash = await bcrypt.hash("LocalLoadTestPassword123", 12);
    const users = await db.tx(async (transaction) => {
      const prepared = [];
      for (let index = 0; index < 20; index += 1) {
        const email = `load-student-${index}@example.test`;
        const user = await transaction.insert(
          `INSERT INTO users (email, name, password_hash, account_status, approval_status, created_at)
           VALUES (?, ?, ?, 'active', 'approved', ?)`,
          [email, `Load Student ${index}`, passwordHash, Date.now()]
        );
        if (index < 10) {
          await transaction.run(
            "INSERT INTO subscriptions (user_id, starts_at, ends_at, status, updated_at) VALUES (?, ?, ?, 'active', ?)",
            [user.id, Date.now(), Date.now() + 86_400_000, Date.now()]
          );
        }
        prepared.push({ id: user.id, email });
      }
      return prepared;
    });

    const loginStarted = performance.now();
    const logins = await Promise.all(users.map(async (user) => {
      const started = performance.now();
      const response = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email, password: "LocalLoadTestPassword123" }),
      });
      return {
        user,
        status: response.status,
        cookie: (response.headers.get("set-cookie") || "").split(";")[0],
        latencyMs: performance.now() - started,
      };
    }));
    const loginElapsedMs = performance.now() - loginStarted;
    const loginFailures = logins.filter((result) => result.status !== 200 || !result.cookie).length;
    const loginLatencies = logins.map((result) => result.latencyMs).sort((a, b) => a - b);
    const loginResult = {
      scenario: "successful-login-20-vus",
      requests: logins.length,
      requestsPerSecond: Number((logins.length * 1000 / loginElapsedMs).toFixed(2)),
      averageMs: Number((loginLatencies.reduce((sum, value) => sum + value, 0) / loginLatencies.length).toFixed(2)),
      p95Ms: Number(percentile(loginLatencies, 0.95).toFixed(2)),
      p99Ms: Number(percentile(loginLatencies, 0.99).toFixed(2)),
      errorRatePercent: Number((loginFailures * 100 / logins.length).toFixed(2)),
      statusCounts: logins.reduce((counts, result) => {
        counts[result.status] = (counts[result.status] || 0) + 1;
        return counts;
      }, {}),
    };
    results.push(loginResult);
    console.log(JSON.stringify(loginResult));

    const uploadJobs = logins.slice(10).map(({ user, cookie: userCookie }) => () => request(`${base}/api/auth/subscription-request`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ proof: PROOF, name: "Load Test Student" }),
    }));
    results.push(await measure("subscription-proof-upload-10-vus", uploadJobs));
    console.log(JSON.stringify(results[results.length - 1]));

    const examUsers = logins.slice(0, 10);
    const starts = await Promise.all(examUsers.map(async ({ cookie: userCookie }) => {
      const response = await fetch(`${base}/api/assessments/logic:lesson:logic-1/start`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: userCookie },
        body: "{}",
      });
      return {
        status: response.status,
        cookie: userCookie,
        sessionId: (await response.json()).sessionId,
      };
    }));
    const startFailures = starts.filter((result) => result.status !== 201 || !result.sessionId).length;
    const submitJobs = starts.map(({ cookie: userCookie, sessionId }) => () => request(
      `${base}/api/assessments/sessions/${sessionId}/submit`,
      { method: "POST", headers: { "content-type": "application/json", cookie: userCookie }, body: "{}" },
    ));
    results.push({
      scenario: "exam-start-10-vus",
      requests: starts.length,
      errorRatePercent: Number((startFailures * 100 / starts.length).toFixed(2)),
    });
    console.log(JSON.stringify(results[results.length - 1]));
    results.push(await measure("exam-submit-10-vus", submitJobs));
    console.log(JSON.stringify(results[results.length - 1]));

    if (results.some((result) => result.errorRatePercent > 0))
      process.exitCode = 1;
    console.log(JSON.stringify({
      summary: "Local-only benchmark; in-memory SQLite (one connection), no external services.",
      logicalCpus: os.cpus().length,
      totalMemoryMiB: Number((os.totalmem() / 1024 / 1024).toFixed(0)),
      resultCount: results.length,
    }));
  } finally {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    await passwords.close();
    await db.close();
  }
}

main().catch((error) => {
  console.error("Local load test failed:", error);
  process.exitCode = 1;
});
