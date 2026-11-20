/* يُستخدم في بناء Vercel فقط: ينسخ Pyodide إلى public/vendor حتى يقدّمه Vercel كملفات ثابتة.
   التشغيل المحلي لا يحتاجه (server.js يقدّمه من node_modules مباشرة). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "pyodide");
const dest = path.join(root, "public", "vendor", "pyodide", "v314.0.7");
const qrSource = path.join(root, "node_modules", "qrcode-generator", "dist", "qrcode.js");
const qrDestination = path.join(root, "public", "vendor", "qrcode.js");
const siteConfig = path.join(root, "public", "site-config.js");

if (!fs.existsSync(src)) {
  console.error("pyodide غير مثبت. شغّلي npm install أولًا.");
  process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`تم نسخ Pyodide إلى ${path.relative(root, dest)}`);

if (!fs.existsSync(qrSource)) {
  console.error("qrcode-generator غير مثبت. شغّلي npm install أولًا.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(qrDestination), { recursive: true });
fs.copyFileSync(qrSource, qrDestination);
fs.writeFileSync(siteConfig, `window.EFHAMHA_SITE_URL = ${JSON.stringify(process.env.EFHAMHA_SITE_URL || "")};\n`);
console.log(`تم تجهيز رمز QR ورابط المنصة في ${path.relative(root, siteConfig)}`);
