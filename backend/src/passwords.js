const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const requestedWorkers = Number(process.env.PASSWORD_WORKER_COUNT);
const workerCount = Number.isInteger(requestedWorkers) && requestedWorkers > 0
  ? Math.min(requestedWorkers, 32)
  : Math.min(4, Math.max(1, os.availableParallelism() - 1));
const maxPending = Math.max(1, Number(process.env.PASSWORD_QUEUE_MAX) || 500);
const workerPath = path.join(__dirname, "workers", "password-worker.js");
const queue = [];
const workers = [];
let pending = 0;
let nextId = 1;
let shuttingDown = false;

function dispatch() {
  for (const entry of workers) {
    if (entry.failed || entry.busy || !queue.length) continue;
    const job = queue.shift();
    entry.busy = true;
    entry.job = job;
    try {
      entry.worker.postMessage({ ...job.payload, id: job.id });
    } catch (error) {
      entry.job = null;
      entry.busy = false;
      pending -= 1;
      job.reject(error);
      replaceWorker(entry, error);
    }
  }
}

function replaceWorker(entry, error) {
  if (entry.failed) return;
  entry.failed = true;
  const index = workers.indexOf(entry);
  if (index >= 0) workers.splice(index, 1);
  if (entry.job) {
    pending -= 1;
    entry.job.reject(error);
    entry.job = null;
  }
  if (!shuttingDown) {
    startWorker();
    dispatch();
  }
}

function startWorker() {
  const entry = { worker: new Worker(workerPath), busy: false, job: null, failed: false };
  entry.worker.unref();
  entry.worker.on("message", (message) => {
    const job = entry.job;
    entry.job = null;
    entry.busy = false;
    if (!job) return;
    pending -= 1;
    if (message.error) job.reject(new Error(message.error));
    else job.resolve(message.result);
    dispatch();
  });
  entry.worker.on("error", (error) => replaceWorker(entry, error));
  entry.worker.on("exit", (code) => {
    if (!entry.failed) replaceWorker(entry, new Error(`Password worker exited with code ${code}`));
  });
  workers.push(entry);
}

function submit(operation, values) {
  if (shuttingDown) return Promise.reject(new Error("Password worker pool is shutting down"));
  if (pending >= maxPending) {
    const error = new Error("Password worker queue is full");
    error.code = "PASSWORD_QUEUE_FULL";
    return Promise.reject(error);
  }
  if (!workers.length) {
    for (let index = 0; index < workerCount; index += 1) startWorker();
  }
  pending += 1;
  return new Promise((resolve, reject) => {
    queue.push({ id: nextId++, payload: { operation, ...values }, resolve, reject });
    dispatch();
  });
}

function hash(password, rounds = 12) {
  return submit("hash", { password, rounds });
}

function compare(password, encodedHash) {
  return submit("compare", { password, encodedHash });
}

async function close() {
  shuttingDown = true;
  for (const job of queue.splice(0)) {
    pending -= 1;
    job.reject(new Error("Password worker pool is shutting down"));
  }
  const active = workers.splice(0);
  for (const entry of active) {
    entry.failed = true;
    if (entry.job) {
      pending -= 1;
      entry.job.reject(new Error("Password worker pool is shutting down"));
      entry.job = null;
    }
  }
  await Promise.all(active.map((entry) => entry.worker.terminate()));
}

module.exports = { hash, compare, close };
