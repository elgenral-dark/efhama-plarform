const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const passwords = require("../passwords");
const {
  EMAIL_RE, publicUser, issueToken, clearToken, hashSessionId
} = require("../auth");
const { isUniqueViolation, isBusy } = require("../database");
const { createNotification } = require("../notifications");

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);
const MIN_PASS = 8;
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function parseProof(value) {
  const match = typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_PROOF_BYTES || buffer.toString("base64") !== match[2]) return null;
  const mime = `image/${match[1]}`;
  const pngEnd = Buffer.from("0000000049454e44ae426082", "hex");
  const valid = mime === "image/png"
    ? buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && buffer.subarray(-12).equals(pngEnd)
    : mime === "image/jpeg"
      ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9
      : buffer.subarray(0, 4).toString("ascii") === "RIFF"
        && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return valid ? { buffer, mime } : null;
}

function requestCode() {
  return `EFH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

module.exports = function authRoutes(db, { requireAuth }) {
  const r = express.Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", message: "محاولات كثيرة، حاول مرة أخرى بعد قليل" },
  });

  const byEmail = (em) => db.get("SELECT * FROM users WHERE email = ?", [em]);
  const byId = (id) => db.get("SELECT * FROM users WHERE id = ?", [id]);
  const activeSessionByUser = (id) => db.get("SELECT * FROM user_sessions WHERE user_id = ?", [id]);
  const transferLifetimeMs = 2 * 60 * 1000;
  const latestRequest = (userId) => db.get(
    `SELECT id, request_code, amount, currency, status, rejection_reason, created_at, updated_at, reviewed_at
       FROM subscription_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  const subscription = (userId) => db.get(
    "SELECT starts_at, ends_at, status FROM subscriptions WHERE user_id = ?", [userId]
  );

  async function decorateUser(user) {
    const sub = await subscription(user.id);
    const request = await latestRequest(user.id);
    const active = sub && sub.status === "active" && sub.starts_at <= Date.now() && sub.ends_at > Date.now();
    user.subscriptionStatus = active ? "active"
      : request?.status === "pending" ? "pending"
        : request?.status === "rejected" ? "rejected"
          : sub ? "expired" : "none";
    user.subscriptionStartsAt = sub?.starts_at || null;
    user.subscriptionEndsAt = sub?.ends_at || null;
    user.subscriptionRequestStatus = request?.status || null;
    user.subscriptionRequestCode = request?.request_code || null;
    user.subscriptionRejectionReason = request?.rejection_reason || null;
    return { public: publicUser(user), request };
  }

  // d = قاعدة البيانات أو معاملة
  async function insertRequest(d, userId, proof) {
    const code = requestCode();
    const now = Date.now();
    await d.run(
      `INSERT INTO subscription_requests
        (request_code, user_id, amount, currency, proof_mime, proof_blob, status, created_at, updated_at)
       VALUES (?, ?, 100, 'EGP', ?, ?, 'pending', ?, ?)`,
      [code, userId, proof.mime, proof.buffer, now, now]
    );
    await createNotification(d, userId, {
      title: "تم استلام طلب الاشتراك وإثبات الدفع",
      message: "وصل طلبك وإثبات الدفع بنجاح، وسيظهر لك تحديث بعد مراجعته.",
      type: "subscription",
      actionUrl: "/register.html",
    }, `subscription-request:${code}`, null, now);
    return code;
  }

  function accountLoginError(user) {
    if (!user || !user.active || user.approval_status === "suspended")
      return { status: 403, error: "account_suspended", message: "تم إيقاف هذا الحساب. يرجى التواصل مع الإدارة." };
    if (user.approval_status === "rejected")
      return { status: 403, error: "account_rejected", message: "تم رفض اعتماد هذا الحساب. أعد إرسال طلب الاشتراك وإثبات الدفع من صفحة التسجيل أو تواصل مع الإدارة." };
    if (user.approval_status !== "approved")
      return { status: 403, error: "approval_pending", message: "حسابك في انتظار موافقة الإدارة. لن تتمكن من تسجيل الدخول قبل اعتماد الحساب." };
    return null;
  }

  function sessionExpiry(remember, now) {
    return now + (remember ? config.rememberDays * 86400000 : config.sessionHours * 3600000);
  }

  async function startSession(d, userId, remember, req) {
    const now = Date.now();
    const sessionId = crypto.randomBytes(32).toString("base64url");
    const expiresAt = sessionExpiry(remember, now);
    await d.run("UPDATE users SET last_login_at = ?, token_version = token_version + 1 WHERE id = ?", [now, userId]);
    const sessionUser = await d.get("SELECT * FROM users WHERE id = ?", [userId]);
    await d.run(
      `INSERT INTO user_sessions
        (user_id, session_hash, token_version, created_at, last_seen_at, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET session_hash = excluded.session_hash,
         token_version = excluded.token_version, created_at = excluded.created_at,
         last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at,
         ip_address = excluded.ip_address, user_agent = excluded.user_agent`,
      [
        userId, hashSessionId(sessionId), sessionUser.token_version, now, now, expiresAt,
        req.ip || null, String(req.get("user-agent") || "").slice(0, 500),
      ]
    );
    return { user: sessionUser, sessionId };
  }

  async function issueSessionResponse(res, session, remember) {
    issueToken(res, session.user, remember, session.sessionId);
    return res.json({ user: (await decorateUser(session.user)).public });
  }

  r.get("/config", (_req, res) => res.json({ allowRegistration: config.allowRegistration }));

  r.post("/register", limiter, async (req, res) => {
    if (!config.allowRegistration)
      return res.status(403).json({ error: "registration_closed", message: "التسجيل مغلق حاليًا" });
    const { name = "", email = "", password = "", confirmPassword = "", proof = "" } = req.body || {};
    const em = String(email).trim().toLowerCase();
    const pw = String(password);
    const nm = String(name).trim().slice(0, 80);
    if (!EMAIL_RE.test(em)) return res.status(400).json({ error: "invalid_email", message: "صيغة البريد الإلكتروني غير صحيحة" });
    if (nm.length < 2) return res.status(400).json({ error: "invalid_name", message: "أدخل الاسم الكامل" });
    if (typeof password !== "string" || pw.trim().length < MIN_PASS)
      return res.status(400).json({ error: "weak_password", message: `كلمة المرور يجب ألا تقل عن ${MIN_PASS} أحرف` });
    if (pw !== confirmPassword) return res.status(400).json({ error: "password_mismatch", message: "كلمتا المرور غير متطابقتين" });
    const image = parseProof(proof);
    if (!image) return res.status(400).json({ error: "invalid_proof", message: "ارفع صورة PNG أو JPEG أو WebP صالحة، بحد أقصى 5 ميجابايت" });
    const existing = await byEmail(em);
    if (existing) {
      if (existing.approval_status !== "rejected" || !existing.active
        || !await passwords.compare(pw, existing.password_hash)) {
        return res.status(409).json({ error: "email_taken", message: "هذا البريد مسجل بالفعل. سجّل الدخول أو تواصل مع الإدارة." });
      }
    }

    let userId = existing ? Number(existing.id) : null, code;
    const passwordHash = existing ? null : await passwords.hash(pw, 12);
    try {
      await db.tx(async (t) => {
        const now = Date.now();
        if (existing) {
          await t.run(
            `UPDATE users SET name = ?, account_status = 'pending', approval_status = 'pending',
               active = 1, token_version = token_version + 1 WHERE id = ?`,
            [nm, userId]
          );
        } else {
          const info = await t.insert(
            `INSERT INTO users
              (email, name, password_hash, account_status, approval_status, created_at, last_login_at)
             VALUES (?, ?, ?, 'pending', 'pending', ?, ?)`,
            [em, nm, passwordHash, now, now]
          );
          userId = info.id;
        }
        code = await insertRequest(t, userId, image);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        return res.status(409).json({ error: "duplicate_request", message: "يوجد حساب أو طلب اشتراك مسجل بهذه البيانات." });
      throw error;
    }

    const user = await byId(userId);
    user.subscriptionStatus = "pending";
    user.approval_status = "pending";
    user.subscriptionRequestStatus = "pending";
    user.subscriptionRequestCode = code;
    res.status(201).json({
      user: publicUser(user),
      requestCode: code,
      message: existing ? "تمت إعادة إرسال إثبات الدفع للمراجعة." : "تم إنشاء طلبك. لن تتمكن من تسجيل الدخول قبل موافقة الإدارة.",
    });
  });

  r.post("/subscription-status", limiter, async (req, res) => {
    const { email = "", password = "" } = req.body || {};
    const em = String(email).trim().toLowerCase();
    const user = await byEmail(em);
    const pw = String(password);
    const valid = await passwords.compare(pw, user ? user.password_hash : DUMMY_HASH);
    if (!user || !valid)
      return res.status(401).json({
        error: "bad_credentials",
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      });

    const request = await latestRequest(user.id);
    const status = request?.status === "pending" || request?.status === "rejected"
      ? request.status
      : user.approval_status === "approved" ? "approved" : "pending";
    res.set("Cache-Control", "no-store");
    res.json({
      status,
      user: { name: user.name, email: user.email },
      request: request ? {
        request_code: request.request_code,
        status: request.status,
        rejection_reason: request.rejection_reason,
        created_at: request.created_at,
      } : null,
    });
  });

  r.post("/login", limiter, async (req, res) => {
    const { email = "", password = "", remember = false } = req.body || {};
    const em = String(email).trim().toLowerCase();
    const pw = String(password);
    const user = await byEmail(em);
    const ok = await passwords.compare(pw, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok)
      return res.status(401).json({ error: "bad_credentials", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    const accountError = accountLoginError(user);
    if (accountError)
      return res.status(accountError.status).json({
        error: accountError.error,
        message: accountError.message,
      });

    let result;
    try {
      result = await db.tx(async (t) => {
        await t.lockUser(user.id);
        const now = Date.now();
        const freshUser = await t.get("SELECT * FROM users WHERE id = ?", [user.id]);
        const freshAccountError = accountLoginError(freshUser);
        if (freshAccountError) return { kind: "account_error", ...freshAccountError };
        if (freshUser.password_hash !== user.password_hash)
          return {
            kind: "account_error",
            status: 401,
            error: "credentials_changed",
            message: "تم تغيير كلمة المرور. أعد إدخال بيانات الدخول.",
          };
        const active = await t.get("SELECT * FROM user_sessions WHERE user_id = ?", [user.id]);
        if (active && active.token_version === freshUser.token_version && active.expires_at > now) {
          const currentSessionHash = req.user?.id === user.id && req.user.sessionId
            ? hashSessionId(req.user.sessionId) : "";
          if (currentSessionHash && currentSessionHash === active.session_hash) {
            const expiresAt = sessionExpiry(!!remember, now);
            await t.run("UPDATE user_sessions SET expires_at = ?, last_seen_at = ? WHERE user_id = ?", [expiresAt, now, user.id]);
            await t.run("UPDATE users SET last_login_at = ? WHERE id = ?", [now, user.id]);
            return { kind: "same_session", sessionId: req.user.sessionId, user: await t.get("SELECT * FROM users WHERE id = ?", [user.id]) };
          }

          const challenge = crypto.randomBytes(32).toString("base64url");
          await t.run(
            `UPDATE session_transfer_attempts
                SET status = 'expired', resolved_at = ?, challenge_hash = NULL,
                    expected_session_hash = NULL, expected_token_version = NULL
              WHERE user_id = ? AND status = 'confirmation_required'`,
            [now, user.id]
          );
          await t.run(
            `INSERT INTO session_transfer_attempts
              (user_id, email, attempted_at, status, challenge_hash, expected_session_hash,
               expected_token_version, expires_at, ip_address, user_agent,
               previous_ip_address, previous_user_agent, previous_started_at)
             VALUES (?, ?, ?, 'confirmation_required', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id, em, now, hashSessionId(challenge), active.session_hash, active.token_version,
              now + transferLifetimeMs, req.ip || null,
              String(req.get("user-agent") || "").slice(0, 500),
              active.ip_address, active.user_agent, active.created_at,
            ]
          );
          return { kind: "transfer_confirmation", challenge };
        }

        return { kind: "new_session", ...(await startSession(t, user.id, !!remember, req)) };
      });
    } catch (error) {
      if (isBusy(error))
        return res.status(409).json({
          error: "login_race",
          message: "تم تنفيذ محاولة دخول متزامنة. أعد المحاولة بعد لحظات.",
        });
      throw error;
    }

    if (result.kind === "account_error")
      return res.status(result.status).json({ error: result.error, message: result.message });
    if (result.kind === "transfer_confirmation") {
      res.set("Cache-Control", "no-store");
      return res.status(409).json({
        error: "active_session",
        message: "هذا الحساب مستخدم حاليًا على جهاز آخر. هل تريد تسجيل الخروج من الجهاز الآخر والدخول من الجهاز الحالي؟",
        transferToken: result.challenge,
      });
    }
    return issueSessionResponse(res, result, !!remember);
  });

  r.post("/login/transfer", limiter, async (req, res) => {
    const { email = "", password = "", remember = false, transferToken = "" } = req.body || {};
    const em = String(email).trim().toLowerCase();
    const user = await byEmail(em);
    const pw = String(password);
    const valid = await passwords.compare(pw, user ? user.password_hash : DUMMY_HASH);
    if (!user || !valid)
      return res.status(401).json({ error: "bad_credentials", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    const accountError = accountLoginError(user);
    if (accountError)
      return res.status(accountError.status).json({ error: accountError.error, message: accountError.message });
    if (typeof transferToken !== "string" || transferToken.length < 32)
      return res.status(400).json({ error: "invalid_transfer", message: "انتهت صلاحية تأكيد نقل الجلسة. أعد تسجيل الدخول." });

    const now = Date.now();
    const sessionId = crypto.randomBytes(32).toString("base64url");
    const expiresAt = sessionExpiry(!!remember, now);
    let outcome;
    try {
      outcome = await db.tx(async (t) => {
        await t.lockUser(user.id);
        const freshUser = await t.get("SELECT * FROM users WHERE id = ?", [user.id]);
        const freshAccountError = accountLoginError(freshUser);
        if (freshAccountError) return { kind: "account_error", ...freshAccountError };
        if (freshUser.password_hash !== user.password_hash)
          return {
            kind: "account_error",
            status: 401,
            error: "credentials_changed",
            message: "تم تغيير كلمة المرور. أعد إدخال بيانات الدخول.",
          };
        const attempt = await t.get(
          "SELECT * FROM session_transfer_attempts WHERE challenge_hash = ? AND user_id = ?",
          [hashSessionId(transferToken), user.id]
        );
        if (!attempt || attempt.status !== "confirmation_required")
          return { kind: "invalid" };
        if (attempt.expires_at <= now) {
          await t.run(
            `UPDATE session_transfer_attempts SET status = 'expired', resolved_at = ?,
               challenge_hash = NULL, expected_session_hash = NULL, expected_token_version = NULL
             WHERE id = ? AND status = 'confirmation_required'`,
            [now, attempt.id]
          );
          return { kind: "expired" };
        }
        const active = await t.get("SELECT * FROM user_sessions WHERE user_id = ?", [user.id]);
        if (!active || active.session_hash !== attempt.expected_session_hash
          || active.token_version !== attempt.expected_token_version
          || active.token_version !== freshUser.token_version || active.expires_at <= now) {
          await t.run(
            `UPDATE session_transfer_attempts SET status = 'stale', resolved_at = ?,
               challenge_hash = NULL, expected_session_hash = NULL, expected_token_version = NULL
             WHERE id = ? AND status = 'confirmation_required'`,
            [now, attempt.id]
          );
          return { kind: "stale" };
        }

        await t.run("UPDATE users SET last_login_at = ?, token_version = token_version + 1 WHERE id = ?", [now, user.id]);
        const currentUser = await t.get("SELECT * FROM users WHERE id = ?", [user.id]);
        await t.run(
          `UPDATE user_sessions SET session_hash = ?, token_version = ?, created_at = ?,
             last_seen_at = ?, expires_at = ?, ip_address = ?, user_agent = ?
           WHERE user_id = ? AND session_hash = ?`,
          [
            hashSessionId(sessionId), currentUser.token_version, now, now, expiresAt,
            req.ip || null, String(req.get("user-agent") || "").slice(0, 500),
            user.id, active.session_hash,
          ]
        );
        await t.run(
          `UPDATE session_transfer_attempts SET status = 'transferred', resolved_at = ?,
             challenge_hash = NULL, expected_session_hash = NULL, expected_token_version = NULL
           WHERE id = ? AND status = 'confirmation_required'`,
          [now, attempt.id]
        );
        return { kind: "transferred", sessionId, user: currentUser };
      });
    } catch (error) {
      if (isBusy(error))
        return res.status(409).json({
          error: "login_race",
          message: "حدث تعارض أثناء نقل الجلسة. أعد تسجيل الدخول وحاول مجددًا.",
        });
      throw error;
    }

    if (outcome.kind === "account_error")
      return res.status(outcome.status).json({ error: outcome.error, message: outcome.message });
    if (outcome.kind === "expired" || outcome.kind === "invalid")
      return res.status(409).json({
        error: "transfer_expired",
        message: "انتهت صلاحية تأكيد نقل الجلسة. أعد تسجيل الدخول وحاول مجددًا.",
      });
    if (outcome.kind === "stale")
      return res.status(409).json({
        error: "session_changed",
        message: "تغيرت الجلسة النشطة قبل التأكيد. أعد تسجيل الدخول للتحقق من حالتها.",
      });
    return issueSessionResponse(res, outcome, !!remember);
  });

  r.post("/login/cancel-transfer", async (req, res) => {
    const transferToken = req.body?.transferToken;
    if (typeof transferToken !== "string" || transferToken.length < 32)
      return res.status(400).json({ error: "invalid_transfer", message: "رمز نقل الجلسة غير صالح." });
    const now = Date.now();
    const result = await db.tx(async (t) => {
      const attempt = await t.get(
        "SELECT id, user_id, status, expires_at FROM session_transfer_attempts WHERE challenge_hash = ?",
        [hashSessionId(transferToken)]
      );
      if (!attempt || attempt.status !== "confirmation_required") return false;
      const status = attempt.expires_at <= now ? "expired" : "cancelled";
      await t.run(
        `UPDATE session_transfer_attempts SET status = ?, resolved_at = ?,
           challenge_hash = NULL, expected_session_hash = NULL, expected_token_version = NULL
         WHERE id = ? AND status = 'confirmation_required'`,
        [status, now, attempt.id]
      );
      return status === "cancelled";
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, cancelled: result });
  });

  r.post("/logout", async (req, res) => {
    if (req.user?.sessionId) {
      await db.tx(async (t) => {
        const removed = await t.run("DELETE FROM user_sessions WHERE user_id = ? AND session_hash = ?",
          [req.user.id, hashSessionId(req.user.sessionId)]);
        if (removed.changes)
          await t.run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [req.user.id]);
      });
    }
    clearToken(res);
    res.json({ ok: true });
  });

  r.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  r.get("/subscription", async (req, res) => {
    if (!req.user) {
      res.set("Cache-Control", "no-store");
      return res.json({ user: null, request: null });
    }
    const { public: user, request } = await decorateUser(req.user);
    res.set("Cache-Control", "no-store");
    res.json({ user, request });
  });

  r.post("/subscription-request", requireAuth, limiter, async (req, res) => {
    if (req.user.role !== "student")
      return res.status(403).json({ error: "student_only", message: "هذا الإجراء مخصص لحسابات الطلاب." });
    if (req.user.subscriptionStatus === "active")
      return res.status(409).json({ error: "subscription_active", message: "لديك اشتراك نشط بالفعل." });
    const { proof = "", name = req.user.name } = req.body || {};
    const nm = String(name).trim().slice(0, 80);
    if (nm.length < 2) return res.status(400).json({ error: "invalid_name", message: "أدخل الاسم الكامل" });
    const image = parseProof(proof);
    if (!image) return res.status(400).json({ error: "invalid_proof", message: "ارفع صورة PNG أو JPEG أو WebP صالحة، بحد أقصى 5 ميجابايت" });
    if ((await latestRequest(req.user.id))?.status === "pending")
      return res.status(409).json({ error: "request_pending", message: "طلبك قيد المراجعة بالفعل." });

    let code;
    try {
      await db.tx(async (t) => {
        await t.run("UPDATE users SET name = ? WHERE id = ?", [nm, req.user.id]);
        code = await insertRequest(t, req.user.id, image);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        return res.status(409).json({ error: "request_pending", message: "يوجد طلب قيد المراجعة بالفعل." });
      throw error;
    }
    res.status(201).json({ ok: true, requestCode: code, message: "تم إرسال طلب الاشتراك للمراجعة." });
  });

  r.post("/change-password", requireAuth, limiter, async (req, res) => {
    const { currentPassword = "", newPassword = "" } = req.body || {};
    if (!await passwords.compare(String(currentPassword), req.user.password_hash))
      return res.status(401).json({ error: "bad_credentials", message: "كلمة المرور الحالية غير صحيحة" });
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASS)
      return res.status(400).json({ error: "weak_password", message: `كلمة المرور يجب ألا تقل عن ${MIN_PASS} أحرف` });
    await db.run("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
      [await passwords.hash(newPassword, 12), req.user.id]);
    const current = await byId(req.user.id);
    await db.run("UPDATE user_sessions SET token_version = ? WHERE user_id = ? AND session_hash = ?",
      [current.token_version, req.user.id, hashSessionId(req.user.sessionId)]);
    issueToken(res, current, true, req.user.sessionId);
    res.json({ ok: true });
  });

  return r;
};
