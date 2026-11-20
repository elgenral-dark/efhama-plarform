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
  dbPath: process.env.DB_PATH || path.join(ROOT, "data", "efhamha.db"),
  contentDir: path.join(ROOT, "content"),
  seedDir: path.join(ROOT, "seed"),
  get jwtSecret() { return loadSecret(); },
  allowRegistration: process.env.ALLOW_REGISTRATION !== "false",
  trustProxy: process.env.TRUST_PROXY || false,
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  demoAdminName: process.env.EFHAMHA_DEMO_ADMIN_NAME || "admin",
  demoAdminEmail: process.env.EFHAMHA_DEMO_ADMIN_EMAIL || "admin@efhamha.local",
  demoAdminPassword: process.env.EFHAMHA_DEMO_ADMIN_PASSWORD || "admin123456",
  demoInstructorName: process.env.EFHAMHA_DEMO_INSTRUCTOR_NAME || "instructor",
  demoInstructorEmail: process.env.EFHAMHA_DEMO_INSTRUCTOR_EMAIL || "instructor@efhamha.local",
  demoInstructorPassword: process.env.EFHAMHA_DEMO_INSTRUCTOR_PASSWORD || "Instructor123456",
  demoStudentName: process.env.EFHAMHA_DEMO_STUDENT_NAME || "student",
  demoStudentEmail: process.env.EFHAMHA_DEMO_STUDENT_EMAIL || "student@efhamha.local",
  demoStudentPassword: process.env.EFHAMHA_DEMO_STUDENT_PASSWORD || "Student123456",
  cookieName: "efhamha_token",
  rememberDays: 30,
  sessionHours: 12,
};
