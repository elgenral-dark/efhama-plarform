import express from "express";
import helmet from "helmet";
import compression from "compression";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { decide, hasSubscription, isGuardedPath, currentUser } from "./guard.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);
const require = createRequire(import.meta.url);
const qrCodeGeneratorPath = require.resolve("qrcode-generator");

async function proxyRequest(req, res, backendUrl) {
  if (!backendUrl) {
    return res.status(503).json({ error: "backend_unavailable", message: "خدمة المنصة غير متاحة حاليًا." });
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value && name !== "host" && name !== "content-length" && !HOP_BY_HOP_HEADERS.has(name)) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  timeout.unref();
  const abortOnDisconnect = () => controller.abort();
  req.once("aborted", abortOnDisconnect);
  try {
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const upstream = await fetch(`${backendUrl.replace(/\/+$/, "")}${req.originalUrl}`, {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      ...(hasBody ? { duplex: "half" } : {}),
      signal: controller.signal,
      redirect: "manual",
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!["set-cookie", "content-encoding", "content-length"].includes(name)
        && !HOP_BY_HOP_HEADERS.has(name)) res.setHeader(name, value);
    });
    const cookies = upstream.headers.getSetCookie?.();
    if (cookies?.length) res.setHeader("set-cookie", cookies);
    else if (upstream.headers.has("set-cookie")) res.setHeader("set-cookie", upstream.headers.get("set-cookie"));

    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (res.destroyed || req.aborted) return;
    if (res.headersSent) return res.destroy(error);
    const timedOut = controller.signal.aborted;
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "backend_timeout" : "backend_unavailable",
      message: timedOut ? "انتهت مهلة خدمة المنصة." : "تعذر الاتصال بخدمة المنصة.",
    });
  } finally {
    clearTimeout(timeout);
    req.off("aborted", abortOnDisconnect);
  }
}

/* ينشئ تطبيق الواجهة ويتصل بباك اند المنصة بدل محاكاة بيانات المستخدم. */
export function createFrontendApp({
  backendUrl = process.env.BACKEND_URL || "",
  publicDir,
  pyodideDir,
  isProd = false,
  trustProxy = false,
}) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
        "worker-src": ["'self'", "blob:"],
        "script-src-attr": ["'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "upgrade-insecure-requests": isProd ? [] : null,
      },
    },
    hsts: isProd,
  }));
  app.use(compression());

  app.get("/vendor/qrcode.js", (_req, res, next) => {
    res.sendFile(qrCodeGeneratorPath, (error) => {
      if (error) next(error);
    });
  });

  app.use(["/api", "/data"], (req, res) => proxyRequest(req, res, backendUrl));

  app.get("/", async (req, res, next) => {
    if (!backendUrl) return res.redirect("/explore/");
    try {
      const user = await currentUser({ backendUrl, cookie: req.headers.cookie });
      if (user && hasSubscription(user)) return next();
    } catch {
      return res.redirect("/explore/");
    }
    return res.redirect("/explore/");
  });

  app.get("/admin-subscriptions.html", (_req, res) => res.redirect(302, "/admin-dashboard.html"));

  app.use(async (req, res, next) => {
    if (!isGuardedPath(req.path)) return next();
    const result = await decide({ path: req.path, backendUrl, cookie: req.headers.cookie });
    if (result.action === "next") return next();
    if (result.action === "unavailable")
      return res.status(503).type("text/plain").send("تعذر التحقق من صلاحيات الحساب.");
    if (result.action === "forbidden")
      return res.status(403).type("text/plain").send("صلاحيات المسؤول مطلوبة.");
    if (result.action === "subscription") return res.redirect("/register.html");
    if (req.path.startsWith("/programming-paths/"))
      return res.status(401).json({ error: "unauthorized", message: "يجب تسجيل الدخول" });
    return res.redirect("/login.html");
  });

  app.use(express.json({ limit: "7mb" }));

  // ترويسات صفحة Pyodide
  app.use("/programming-paths/python-runner.html", (req, res, next) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Security-Policy", [
      "default-src 'none'",
      `script-src 'self' ${origin} blob: 'wasm-unsafe-eval'`,
      "worker-src blob:",
      `connect-src ${origin}`,
      "object-src 'none'",
      "frame-src 'none'",
      "style-src 'self'",
      "form-action 'none'",
      "base-uri 'none'",
      "frame-ancestors 'self'",
    ].join("; "));
    next();
  });
  app.use("/programming-paths/python-runner.js", (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "no-cache");
    next();
  });

  // ملفات Pyodide
  if (pyodideDir) {
    app.use("/vendor/pyodide/v314.0.7", (_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      next();
    }, express.static(pyodideDir, { index: false, dotfiles: "deny" }));
  }

  // الملفات الثابتة (بما فيها /data/ المنسوخة)
  app.use(express.static(publicDir, {
    setHeaders(res, file) {
      if (/service-worker\.js$|\.html$/.test(file)) res.setHeader("Cache-Control", "no-cache");
    },
  }));

  app.use((_req, res) => res.status(404).type("text/plain; charset=utf-8").send("الصفحة غير موجودة"));
  return app;
}
