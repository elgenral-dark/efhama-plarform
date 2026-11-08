import express from "express";
import helmet from "helmet";
import compression from "compression";
import http from "node:http";
import https from "node:https";
import { decide } from "./guard.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function createBackendProxy(backendUrl, trustProxy) {
  if (!backendUrl) {
    return (_req, res) => res.status(503).json({ error: "backend_unavailable", message: "خدمة المنصة غير متاحة." });
  }
  const backend = new URL(backendUrl);
  if (backend.protocol !== "http:" && backend.protocol !== "https:")
    throw new Error("BACKEND_URL must use HTTP or HTTPS");
  const transport = backend.protocol === "https:" ? https : http;
  const basePath = backend.pathname.replace(/\/+$/, "");

  return (req, res) => {
    const headers = { ...req.headers, host: backend.host };
    for (const header of HOP_BY_HOP_HEADERS) delete headers[header];
    headers["x-forwarded-for"] = trustProxy ? req.ip : req.socket.remoteAddress;
    headers["x-forwarded-proto"] = req.protocol;
    headers["x-forwarded-host"] = req.get("host");

    let timedOut = false;
    const upstream = transport.request({
      hostname: backend.hostname,
      port: backend.port || undefined,
      method: req.method,
      path: `${basePath}${req.originalUrl}`,
      headers,
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      upstream.destroy(new Error("Backend request timed out"));
    }, 35_000);
    upstream.on("response", (response) => {
      res.status(response.statusCode || 502);
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase()))
          res.setHeader(name, value);
      }
      response.pipe(res);
    });
    upstream.on("error", (error) => {
      clearTimeout(timeout);
      if (res.headersSent) return res.destroy(error);
      console.error("Backend proxy request failed:", error.message);
      return res.status(timedOut ? 504 : 502).json({
        error: timedOut ? "backend_timeout" : "backend_unavailable",
        message: "تعذر إكمال الطلب إلى خدمة المنصة.",
      });
    });
    upstream.on("close", () => clearTimeout(timeout));
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream);
  };
}

export function createFrontendApp({ backendUrl = "", publicDir, pyodideDir, isProd = false, trustProxy = false }) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  const proxyBackend = createBackendProxy(backendUrl, trustProxy);

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

  app.use(["/api", "/data"], proxyBackend);

  app.use(async (req, res, next) => {
    try {
      const access = await decide({ path: req.path, backendUrl, cookie: req.get("cookie") || "" });
      if (access.action === "next") return next();
      if (access.action === "redirect") return res.redirect(302, access.location);
      if (access.action === "unauthorized")
        return res.status(401).json({ error: "unauthorized", message: "يجب تسجيل الدخول." });
      if (access.action === "subscription_required")
        return res.status(403).json({ error: "subscription_required", message: "يلزم وجود اشتراك نشط." });
      if (access.action === "forbidden")
        return res.status(403).json({ error: "forbidden", message: "صلاحيات المسؤول مطلوبة." });
      return res.status(403).json({ error: "forbidden" });
    } catch (error) {
      console.error("Page authorization failed:", error.message);
      return res.status(503).type("text/plain; charset=utf-8").send("خدمة التحقق من الحساب غير متاحة.");
    }
  });

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
  app.use(compression());
  app.use(express.static(publicDir, {
    setHeaders(res, file) {
      if (/service-worker\.js$|\.html$/.test(file)) res.setHeader("Cache-Control", "no-cache");
    },
  }));

  app.use((_req, res) => res.status(404).type("text/plain; charset=utf-8").send("الصفحة غير موجودة"));
  return app;
}
