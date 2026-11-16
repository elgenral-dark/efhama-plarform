/* تشغيل محلي للواجهة: node server.js (يفتح http://localhost:8000) */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createFrontendApp } from "./lib/app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

const app = createFrontendApp({
  backendUrl: process.env.BACKEND_URL || "",
  publicDir: path.join(here, "public"),
  pyodideDir: path.join(here, "node_modules", "pyodide"),
  isProd: process.env.NODE_ENV === "production",
  trustProxy: process.env.TRUST_PROXY === "true",
});

app.listen(PORT, () => {
  console.log(`منصة افهمها (الواجهة) تعمل على http://localhost:${PORT}`);
  console.log(process.env.BACKEND_URL
    ? "الاتصال بالباك اند مفعل."
    : "BACKEND_URL غير مضبوط؛ واجهات API والصفحات المحمية غير متاحة.");
});
