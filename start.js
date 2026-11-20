import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const backend = spawn(process.execPath, ["src/index.js"], {
  cwd: join(__dirname, "backend"),
  stdio: "inherit",
});

backend.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Backend] exited with code ${code}`);
  }
});

const frontend = spawn(process.execPath, ["server.js"], {
  cwd: join(__dirname, "frontend"),
  env: Object.assign({}, process.env, { BACKEND_URL: "http://localhost:4000" }),
  stdio: "inherit",
});

frontend.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Frontend] exited with code ${code}`);
  }
});

function shutdown() {
  try { backend.kill(); } catch (_) {}
  try { frontend.kill(); } catch (_) {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Keep event loop alive
setInterval(() => {}, 1000 * 60 * 60);
