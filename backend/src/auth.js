const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const config = require("./config");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    accountStatus: u.account_status || "active",
    approvalStatus: u.approval_status || "approved",
    subscriptionStatus: u.subscriptionStatus || "none",
    subscriptionStartsAt: u.subscriptionStartsAt || null,
    subscriptionEndsAt: u.subscriptionEndsAt || null,
    subscriptionRequestStatus: u.subscriptionRequestStatus || null,
    subscriptionRequestCode: u.subscriptionRequestCode || null,
    subscriptionRejectionReason: u.subscriptionRejectionReason || null,
  };
}

function hashSessionId(sessionId) {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

function issueToken(res, user, remember, sessionId) {
  const days = config.rememberDays;
  const token = jwt.sign({ sub: user.id, tv: user.token_version, sid: sessionId }, config.jwtSecret, {
    expiresIn: remember ? `${days}d` : `${config.sessionHours}h`,
  });
  const opts = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
  };
  if (remember) opts.maxAge = days * 86400 * 1000; // بدون maxAge = كوكي جلسة (حتى إغلاق المتصفح)
  res.cookie(config.cookieName, token, opts);
}

function clearToken(res) {
  res.clearCookie(config.cookieName, { path: "/", httpOnly: true, sameSite: "lax", secure: config.isProd });
}

/* يقرأ المستخدم من الكوكي (أو Authorization: Bearer) ويضعه في req.user */
function makeAuth(db) {
  async function resolve(req) {
    let token = req.cookies && req.cookies[config.cookieName];
    if (!token) {
      const h = req.headers.authorization || "";
      if (h.startsWith("Bearer ")) token = h.slice(7);
    }
    if (!token) return null;
    let p;
    try {
      p = jwt.verify(token, config.jwtSecret);
    } catch {
      return null;
    }
    if (typeof p.sid !== "string" || p.sid.length < 32) return null;
    const u = await db.get(
      `SELECT u.*,
         (SELECT session_hash FROM user_sessions WHERE user_id = u.id) AS auth_session_hash,
         (SELECT token_version FROM user_sessions WHERE user_id = u.id) AS auth_session_token_version,
         (SELECT expires_at FROM user_sessions WHERE user_id = u.id) AS auth_session_expires_at,
         (SELECT last_seen_at FROM user_sessions WHERE user_id = u.id) AS auth_session_last_seen_at,
         (SELECT starts_at FROM subscriptions WHERE user_id = u.id) AS subscription_starts_at,
         (SELECT ends_at FROM subscriptions WHERE user_id = u.id) AS subscription_ends_at,
         (SELECT status FROM subscriptions WHERE user_id = u.id) AS subscription_status,
         (SELECT request_code FROM subscription_requests WHERE user_id = u.id ORDER BY id DESC LIMIT 1) AS request_code,
         (SELECT status FROM subscription_requests WHERE user_id = u.id ORDER BY id DESC LIMIT 1) AS request_status,
         (SELECT rejection_reason FROM subscription_requests WHERE user_id = u.id ORDER BY id DESC LIMIT 1) AS request_rejection_reason
       FROM users u WHERE u.id = ?`,
      [p.sub]
    );
    if (!u || !u.active || u.approval_status !== "approved" || u.token_version !== p.tv) return null;
    const sessionHash = hashSessionId(p.sid);
    if (!u.auth_session_hash || u.auth_session_token_version !== p.tv || u.auth_session_expires_at <= Date.now()
      || u.auth_session_hash.length !== sessionHash.length
      || !crypto.timingSafeEqual(Buffer.from(u.auth_session_hash), Buffer.from(sessionHash))) return null;
    u.sessionId = p.sid;
    if (u.auth_session_last_seen_at < Date.now() - 30000)
      await db.run("UPDATE user_sessions SET last_seen_at = ? WHERE user_id = ? AND session_hash = ?",
        [Date.now(), u.id, u.auth_session_hash]);
    const now = Date.now();
    const subscriptionActive = u.subscription_status === "active"
      && u.subscription_starts_at <= now && u.subscription_ends_at > now;
    u.subscriptionStatus = subscriptionActive
      ? "active"
      : u.request_status === "pending" ? "pending"
        : u.request_status === "rejected" ? "rejected"
          : u.subscription_status ? "expired" : "none";
    u.subscriptionStartsAt = u.subscription_starts_at || null;
    u.subscriptionEndsAt = u.subscription_ends_at || null;
    u.subscriptionRequestStatus = u.request_status || null;
    u.subscriptionRequestCode = u.request_code || null;
    u.subscriptionRejectionReason = u.request_rejection_reason || null;
    return u;
  }
  const attach = async (req, _res, next) => {
    try { req.user = await resolve(req); } catch (error) { return next(error); }
    next();
  };
  const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "unauthorized", message: "يجب تسجيل الدخول" });
    next();
  };
  const requireSubscription = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "unauthorized", message: "يجب تسجيل الدخول" });
    if (req.user.role === "admin" || req.user.subscriptionStatus === "active") return next();
    return res.status(403).json({
      error: "subscription_required",
      message: "يلزم وجود اشتراك سنوي نشط للوصول إلى محتوى المنصة.",
      subscriptionStatus: req.user.subscriptionStatus || "none",
    });
  };
  const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "unauthorized", message: "يجب تسجيل الدخول" });
    if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden", message: "صلاحيات المسؤول مطلوبة" });
    next();
  };
  return { attach, requireAuth, requireSubscription, requireAdmin };
}

module.exports = {
  EMAIL_RE, publicUser, issueToken, clearToken, makeAuth, hashSessionId
};
