const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProd) throw new Error("JWT_SECRET مطلوب في وضع الإنتاج (NODE_ENV=production)");
  // وضع التطوير: سر مولَّد يُحفظ محليًا حتى لا تنتهي الجلسات عند كل إعادة تشغيل
  const dir = path.join(ROOT, "data");
  const file = path.join(dir, ".jwt_secret");
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const s = require("crypto").randomBytes(48).toString("hex");
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

module.exports = {
  ROOT,
  isProd,
  port: Number(process.env.PORT) || 4000,
  dbPath: process.env.DB_PATH || path.join(ROOT, "data", "efhama.db"),
  contentDir: path.join(ROOT, "content"),
  seedDir: path.join(ROOT, "seed"),
  get jwtSecret() { return loadSecret(); },
  allowRegistration: process.env.ALLOW_REGISTRATION !== "false",
  trustProxy: process.env.TRUST_PROXY || false,
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  cookieName: "efhama_token",
  rememberDays: 30,
  sessionHours: 12,
};
