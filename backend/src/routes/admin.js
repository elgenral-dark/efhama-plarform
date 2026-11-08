const express = require("express");
const crypto = require("node:crypto");
const { rateLimit } = require("express-rate-limit");
const passwords = require("../passwords");
const { publicUser } = require("../auth");
const { makeContent, validateLesson, validateQuiz, validateCurriculum } = require("../content");
const { createNotification, notifyActiveSubscribers } = require("../notifications");

/* ملاحظة: الاستعلامات هنا مكتوبة لتعمل على SQLite و Postgres معًا:
   - لا SUM(boolean)، بل SUM(CASE WHEN ... THEN 1 ELSE 0 END)
   - الكسور تُحوَّل إلى DOUBLE PRECISION عشان pg ما يرجعهاش نصوص */
module.exports = function adminRoutes(db, content, { requireAdmin }) {
  const r = express.Router();
  r.use(requireAdmin);
  const broadcastLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  r.get("/notifications", async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
    const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 100000));
    const [broadcasts, total] = await Promise.all([
      db.all(
        `SELECT b.id, b.title, b.message, b.type, b.audience,
                b.recipient_count AS "recipientCount", b.created_at AS "createdAt",
                u.name AS "senderName", u.email AS "senderEmail"
           FROM notification_broadcasts b LEFT JOIN users u ON u.id = b.sender_id
          ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      ),
      db.get("SELECT COUNT(*) AS count FROM notification_broadcasts"),
    ]);
    res.set("Cache-Control", "private, no-store");
    res.json({ broadcasts, total: Number(total.count), nextOffset: offset + broadcasts.length < Number(total.count) ? offset + broadcasts.length : null });
  });

  r.post("/notifications", broadcastLimiter, async (req, res) => {
    const { title, message, type = "general", audience, userId, userEmail, actionUrl } = req.body || {};
    if (typeof title !== "string" || title.trim().length < 2 || title.trim().length > 120)
      return res.status(400).json({ error: "invalid_title", message: "عنوان الإشعار مطلوب (2 إلى 120 حرفًا)." });
    if (typeof message !== "string" || message.trim().length < 2 || message.trim().length > 2000)
      return res.status(400).json({ error: "invalid_message", message: "محتوى الإشعار مطلوب (2 إلى 2000 حرف)." });
    if (!["account", "subscription", "education", "general"].includes(type))
      return res.status(400).json({ error: "invalid_type", message: "نوع الإشعار غير صالح." });
    if (!["user", "all-active", "students", "subscribed", "admins"].includes(audience))
      return res.status(400).json({ error: "invalid_audience", message: "الفئة المستهدفة غير صالحة." });
    const validUserId = Number(userId);
    const targetEmail = typeof userEmail === "string" ? userEmail.trim().toLowerCase() : "";
    if (audience === "user" && ((!Number.isSafeInteger(validUserId) || validUserId < 1)
      && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)))
      return res.status(400).json({ error: "invalid_user", message: "أدخل بريدًا إلكترونيًا أو رقم مستخدم صالحًا." });
    const safeActionUrl = actionUrl == null || actionUrl === "" ? null : String(actionUrl);
    if (safeActionUrl && (safeActionUrl.length > 300 || !safeActionUrl.startsWith("/")
      || safeActionUrl.startsWith("//") || safeActionUrl.includes("\\")))
      return res.status(400).json({ error: "invalid_action_url", message: "رابط الإشعار يجب أن يكون مسارًا داخليًا." });
    const idempotencyKey = req.get("Idempotency-Key") || null;
    if (idempotencyKey && !/^[\w.-]{8,100}$/.test(idempotencyKey))
      return res.status(400).json({ error: "invalid_idempotency_key", message: "مفتاح العملية غير صالح." });
    if (idempotencyKey) {
      const previous = await db.get(
        `SELECT id, recipient_count AS "recipientCount"
           FROM notification_broadcasts WHERE sender_id = ? AND idempotency_key = ?`,
        [req.user.id, idempotencyKey]
      );
      if (previous) return res.json({ ok: true, ...previous, duplicate: true });
    }

    const now = Date.now();
    const audienceQuery = {
      "all-active": ["SELECT id FROM users WHERE active = 1 AND approval_status = 'approved' ORDER BY id", []],
      students: ["SELECT id FROM users WHERE role = 'student' AND active = 1 AND approval_status = 'approved' ORDER BY id", []],
      admins: ["SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY id", []],
      subscribed: [
        `SELECT u.id FROM users u JOIN subscriptions s ON s.user_id = u.id
          WHERE u.role = 'student' AND u.active = 1 AND u.approval_status = 'approved'
            AND s.status = 'active' AND s.starts_at <= ? AND s.ends_at > ? ORDER BY u.id`,
        [now, now],
      ],
      user: Number.isSafeInteger(validUserId) && validUserId > 0
        ? ["SELECT id FROM users WHERE id = ? AND active = 1", [validUserId]]
        : ["SELECT id FROM users WHERE email = ? AND active = 1", [targetEmail]],
    }[audience];
    const recipients = await db.all(audienceQuery[0], audienceQuery[1]);
    if (!recipients.length)
      return res.status(audience === "user" ? 404 : 409).json({
        error: "no_recipients",
        message: audience === "user" ? "المستخدم غير موجود أو غير نشط." : "لا يوجد مستخدمون في هذه الفئة حاليًا.",
      });
    if (recipients.length > 10000)
      return res.status(413).json({ error: "audience_too_large", message: "الفئة أكبر من الحد المسموح؛ أرسل الإشعار إلى فئة أصغر." });

    try {
      const broadcast = await db.tx(async (tx) => {
        const inserted = await tx.insert(
          `INSERT INTO notification_broadcasts
             (sender_id, title, message, type, audience, recipient_count, created_at, idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.user.id, title.trim(), message.trim(), type, audience, recipients.length, now, idempotencyKey]
        );
        for (let start = 0; start < recipients.length; start += 200) {
          const batch = recipients.slice(start, start + 200);
          const values = [];
          const placeholders = batch.map(({ id }) => {
            values.push(id, title.trim(), message.trim(), type, now, safeActionUrl, `admin-broadcast:${inserted.id}:${id}`, req.user.id);
            return "(?, ?, ?, ?, ?, ?, ?, ?)";
          });
          await tx.run(
            `INSERT OR IGNORE INTO notifications
               (user_id, title, message, type, created_at, action_url, event_key, sender_id)
             VALUES ${placeholders.join(", ")}`,
            values
          );
        }
        return { id: inserted.id, recipientCount: recipients.length };
      });
      res.status(201).json({ ok: true, ...broadcast });
    } catch (error) {
      if (idempotencyKey && (error.code === "23505" || String(error.code || "").startsWith("SQLITE_CONSTRAINT"))) {
        const previous = await db.get(
          `SELECT id, recipient_count AS "recipientCount"
             FROM notification_broadcasts WHERE sender_id = ? AND idempotency_key = ?`,
          [req.user.id, idempotencyKey]
        );
        if (previous) return res.json({ ok: true, ...previous, duplicate: true });
      }
      throw error;
    }
  });

  r.get("/subscription-requests", async (req, res) => {
    const status = ["pending", "rejected", "approved"].includes(req.query.status) ? req.query.status : "pending";
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const now = Date.now();
    const requests = await db.all(
      `SELECT sr.id, sr.request_code AS "requestCode", sr.user_id AS "userId", u.name, u.email,
              sr.amount, sr.currency, sr.proof_mime AS "proofMime", sr.status,
              sr.rejection_reason AS "rejectionReason", sr.created_at AS "createdAt",
              sr.reviewed_at AS "reviewedAt", s.starts_at AS "subscriptionStartsAt",
              s.ends_at AS "subscriptionEndsAt",
              CASE WHEN s.user_id IS NULL THEN 'none'
                   WHEN s.starts_at <= ? AND s.ends_at > ? THEN 'active'
                   ELSE 'expired' END AS "subscriptionStatus"
         FROM subscription_requests sr
         JOIN users u ON u.id = sr.user_id
         LEFT JOIN subscriptions s ON s.user_id = u.id
        WHERE sr.status = ?
        ORDER BY sr.created_at ASC LIMIT ? OFFSET ?`,
      [now, now, status, limit, offset]
    );
    const total = (await db.get("SELECT COUNT(*) AS count FROM subscription_requests WHERE status = ?", [status])).count;
    res.set("Cache-Control", "no-store");
    res.json({ total, requests });
  });

  r.get("/subscription-requests/:id/proof", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: "not_found" });
    const proof = await db.get("SELECT proof_mime, proof_blob FROM subscription_requests WHERE id = ?", [id]);
    if (!proof) return res.status(404).json({ error: "not_found", message: "إثبات الدفع غير موجود." });
    res.set({
      "Content-Type": proof.proof_mime,
      "Content-Disposition": `inline; filename="payment-proof-${id}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(Buffer.from(proof.proof_blob));
  });

  r.post("/subscription-requests/:id/approve", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: "not_found" });
    const request = await db.get("SELECT * FROM subscription_requests WHERE id = ?", [id]);
    if (!request) return res.status(404).json({ error: "not_found", message: "طلب الاشتراك غير موجود." });
    if (request.status !== "pending")
      return res.status(409).json({ error: "request_reviewed", message: "تمت مراجعة هذا الطلب بالفعل." });

    const now = Date.now();
    const startsAt = now;
    const startDate = new Date(startsAt);
    const year = startDate.getUTCFullYear() + 1;
    const month = startDate.getUTCMonth();
    const day = startDate.getUTCDate();
    const monthEnd = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const endsAt = Date.UTC(year, month, Math.min(day, monthEnd), startDate.getUTCHours(),
      startDate.getUTCMinutes(), startDate.getUTCSeconds(), startDate.getUTCMilliseconds());

    const approved = await db.tx(async (t) => {
      const previousSubscription = await t.get("SELECT user_id FROM subscriptions WHERE user_id = ?", [request.user_id]);
      const result = await t.run(
        `UPDATE subscription_requests SET status = 'approved', rejection_reason = NULL,
           reviewed_at = ?, updated_at = ?, reviewed_by = ?
         WHERE id = ? AND status = 'pending'`,
        [now, now, req.user.id, id]
      );
      if (!result.changes) return false;
      await t.run("UPDATE users SET account_status = 'active' WHERE id = ?", [request.user_id]);
      await t.run(
        "UPDATE users SET approval_status = 'approved', active = 1, token_version = token_version + 1 WHERE id = ?",
        [request.user_id]
      );
      await t.run(
        `INSERT INTO subscriptions (user_id, starts_at, ends_at, status, updated_at)
         VALUES (?, ?, ?, 'active', ?)
         ON CONFLICT(user_id) DO UPDATE SET starts_at = excluded.starts_at,
           ends_at = excluded.ends_at, status = 'active', updated_at = excluded.updated_at`,
        [request.user_id, startsAt, endsAt, now]
      );
      await createNotification(t, request.user_id, {
        title: "تم اعتماد حسابك",
        message: "تمت مراجعة طلبك واعتماد حسابك بنجاح.",
        type: "account",
        relatedEntityId: id,
        actionUrl: "/index.html",
      }, `account-approved-request:${id}`, req.user.id, now);
      await createNotification(t, request.user_id, {
        title: previousSubscription ? "تم تجديد اشتراكك" : "تم تفعيل اشتراكك",
        message: previousSubscription
          ? "تمت الموافقة على طلبك وتجديد اشتراكك بنجاح."
          : "تمت الموافقة على إثبات الدفع وأصبح اشتراكك نشطًا.",
        type: "subscription",
        relatedEntityId: id,
        actionUrl: "/index.html",
      }, `subscription-approved-request:${id}`, req.user.id, now);
      return { renewed: !!previousSubscription };
    });
    if (!approved)
      return res.status(409).json({ error: "request_reviewed", message: "تمت مراجعة هذا الطلب بالفعل." });
    res.json({ ok: true, startsAt, endsAt });
  });

  r.post("/subscription-requests/:id/reject", async (req, res) => {
    const id = Number(req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "";
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: "not_found" });
    if (reason.length < 3)
      return res.status(400).json({ error: "invalid_reason", message: "اكتب سببًا واضحًا للرفض (3 أحرف على الأقل)." });
    const now = Date.now();
    const rejected = await db.tx(async (t) => {
      const request = await t.get("SELECT user_id FROM subscription_requests WHERE id = ?", [id]);
      if (!request) return false;
      const result = await t.run(
        `UPDATE subscription_requests SET status = 'rejected', rejection_reason = ?,
           reviewed_at = ?, updated_at = ?, reviewed_by = ?
         WHERE id = ? AND status = 'pending'`,
        [reason, now, now, req.user.id, id]
      );
      if (!result.changes) return false;
      await t.run(
        "UPDATE users SET approval_status = 'rejected', account_status = 'pending', token_version = token_version + 1 WHERE id = ?",
        [request.user_id]
      );
      await createNotification(t, request.user_id, {
        title: "لم تتم الموافقة على الحساب",
        message: `سبب الرفض: ${reason}`,
        type: "account",
        relatedEntityId: id,
        actionUrl: "/register.html",
      }, `account-rejected-request:${id}`, req.user.id, now);
      await createNotification(t, request.user_id, {
        title: "تم رفض إثبات الدفع",
        message: `سبب الرفض: ${reason}`,
        type: "subscription",
        relatedEntityId: id,
        actionUrl: "/register.html",
      }, `subscription-rejected-request:${id}`, req.user.id, now);
      return true;
    });
    if (!rejected)
      return res.status(409).json({ error: "request_reviewed", message: "الطلب غير موجود أو تمت مراجعته بالفعل." });
    res.json({ ok: true });
  });

  r.get("/session-transfers", async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    const now = Date.now();
    await db.run(
      `UPDATE session_transfer_attempts
          SET status = 'expired', resolved_at = ?, challenge_hash = NULL,
              expected_session_hash = NULL, expected_token_version = NULL
        WHERE status = 'confirmation_required' AND expires_at <= ?`,
      [now, now]
    );
    const attempts = await db.all(
      `SELECT a.id, a.user_id AS "userId", a.email, a.attempted_at AS "attemptedAt",
              a.resolved_at AS "resolvedAt", a.status, a.ip_address AS "ipAddress",
              a.user_agent AS "userAgent", a.previous_ip_address AS "previousIpAddress",
              a.previous_user_agent AS "previousUserAgent",
              a.previous_started_at AS "previousStartedAt", u.name
         FROM session_transfer_attempts a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.attempted_at DESC LIMIT ?`,
      [limit]
    );
    res.set("Cache-Control", "no-store");
    res.json({ attempts });
  });

  /* ---------- الإحصاءات ---------- */
  r.get("/stats", async (_req, res) => {
    const day = 86400000, now = Date.now();
    const users = (await db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'student'")).c;
    const active7 = (await db.get("SELECT COUNT(*) AS c FROM users WHERE last_login_at > ?", [now - 7 * day])).c;
    const lessons = await db.all(
      `SELECT l.lesson_id AS id,
              SUM(CASE WHEN l.status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN l.status = 'started' THEN 1 ELSE 0 END) AS started,
              (SELECT CAST(ROUND(CAST(AVG(stars) AS NUMERIC), 2) AS DOUBLE PRECISION) FROM ratings r WHERE r.lesson_id = l.lesson_id) AS "avgRating",
              (SELECT COUNT(*) FROM ratings r WHERE r.lesson_id = l.lesson_id) AS ratings
         FROM lesson_progress l GROUP BY l.lesson_id ORDER BY l.lesson_id`
    );
    const quizzes = await db.all(
      `SELECT quiz_key AS key, COUNT(*) AS attempts,
              CAST(ROUND(CAST(AVG(score * 100.0 / total) AS NUMERIC), 1) AS DOUBLE PRECISION) AS "avgPercent"
         FROM quiz_attempts GROUP BY quiz_key ORDER BY quiz_key`
    );
    res.json({ users, activeLast7Days: active7, lessons, quizzes });
  });

  /* ---------- المستخدمون ---------- */
  r.get("/users", async (req, res) => {
    const q = `%${String(req.query.q || "").trim()}%`;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const now = Date.now();
    const rows = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.active, u.account_status AS "accountStatus",
              u.approval_status AS "approvalStatus",
              s.created_at AS "sessionStartedAt", s.last_seen_at AS "sessionLastSeenAt",
              s.expires_at AS "sessionExpiresAt",
              u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM lesson_progress p WHERE p.user_id = u.id AND p.status = 'completed') AS "completedLessons"
         FROM users u
         LEFT JOIN user_sessions s ON s.user_id = u.id
           AND s.token_version = u.token_version AND s.expires_at > ?
        WHERE u.email LIKE ? OR u.name LIKE ?
        ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [now, q, q, limit, offset]
    );
    const total = (await db.get("SELECT COUNT(*) AS c FROM users WHERE email LIKE ? OR name LIKE ?", [q, q])).c;
    res.json({ total, users: rows });
  });

  r.patch("/users/:id", async (req, res) => {
    const id = Number(req.params.id);
    const u = await db.get("SELECT * FROM users WHERE id = ?", [id]);
    if (!u) return res.status(404).json({ error: "not_found", message: "المستخدم غير موجود" });
    const { role, active, name, approvalStatus } = req.body || {};
    if (role !== undefined && !["student", "admin"].includes(role))
      return res.status(400).json({ error: "invalid_role", message: "دور غير صالح" });
    if (approvalStatus !== undefined && !["pending", "approved", "rejected", "suspended"].includes(approvalStatus))
      return res.status(400).json({ error: "invalid_approval_status", message: "حالة اعتماد غير صالحة" });
    const nextApprovalStatus = active === false ? "suspended"
      : approvalStatus || (active === true && u.approval_status === "suspended" ? "approved" : u.approval_status);
    const demoting = (role && role !== "admin" && u.role === "admin") || active === false
      || (approvalStatus !== undefined && approvalStatus !== "approved");
    if (id === req.user.id && demoting)
      return res.status(400).json({ error: "self_lockout", message: "لا يمكنك إزالة صلاحياتك أو تعطيل حسابك" });
    const now = Date.now();
    const nextActive = active === undefined ? (nextApprovalStatus === "suspended" ? 0 : 1) : active ? 1 : 0;
    const accountReactivated = nextActive === 1 && Number(u.active) === 0;
    await db.tx(async (t) => {
      await t.run(
        `UPDATE users SET role = ?, active = ?, name = ?, approval_status = ?,
           account_status = ?, token_version = token_version + ? WHERE id = ?`,
        [
          role ?? u.role,
          nextActive,
          name === undefined ? u.name : String(name).slice(0, 80),
          nextApprovalStatus,
          nextApprovalStatus === "approved" ? "active" : "pending",
          (active !== undefined || approvalStatus !== undefined || (role && role !== u.role)) ? 1 : 0,
          id,
        ]
      );
      if ((u.approval_status !== nextApprovalStatus || accountReactivated)
        && ["suspended", "approved", "rejected"].includes(nextApprovalStatus)) {
        const messages = {
          suspended: {
            title: "تم إيقاف حسابك",
            message: "أوقف فريق المنصة حسابك. يرجى التواصل مع الإدارة إذا كنت بحاجة إلى مساعدة.",
          },
          approved: {
            title: u.approval_status === "suspended" || accountReactivated ? "تمت إعادة تفعيل حسابك" : "تم اعتماد حسابك",
            message: u.approval_status === "suspended" || accountReactivated
              ? "أعيد تفعيل حسابك ويمكنك استخدام المنصة مجددًا."
              : "تم اعتماد حسابك ويمكنك تسجيل الدخول إلى المنصة.",
          },
          rejected: {
            title: "تم رفض اعتماد الحساب",
            message: "لم تتم الموافقة على اعتماد حسابك. تواصل مع الإدارة لمعرفة التفاصيل.",
          },
        }[nextApprovalStatus];
        await createNotification(t, id, {
          ...messages,
          type: "account",
          actionUrl: nextApprovalStatus === "approved" ? "/index.html" : "/register.html",
        }, `account-status:${id}:${nextApprovalStatus}:${now}`, req.user.id, now);
      }
    });
    res.json({ user: publicUser(await db.get("SELECT * FROM users WHERE id = ?", [id])) });
  });

  r.post("/users/:id/reset-password", async (req, res) => {
    const { password } = req.body || {};
    if (typeof password !== "string" || password.length < 8)
      return res.status(400).json({ error: "weak_password", message: "كلمة المرور يجب ألا تقل عن 8 أحرف" });
    const info = await db.run(
      "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?",
      [await passwords.hash(password, 12), Number(req.params.id)]
    );
    if (!info.changes) return res.status(404).json({ error: "not_found", message: "المستخدم غير موجود" });
    res.json({ ok: true });
  });

  r.delete("/users/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: "self_delete", message: "لا يمكنك حذف حسابك" });
    const info = await db.run("DELETE FROM users WHERE id = ?", [id]);
    if (!info.changes) return res.status(404).json({ error: "not_found", message: "المستخدم غير موجود" });
    res.json({ ok: true });
  });

  /* ---------- إدارة المحتوى ---------- */
  const fail = (res, errs) => res.status(422).json({ error: "validation", message: "المحتوى غير صالح", details: errs });

  r.put("/curriculum", async (req, res) => {
    const errs = validateCurriculum(req.body);
    if (errs.length) return fail(res, errs);
    const d = req.body;
    d.totalLessons = d.chapters.reduce((n, c) => n + c.lessons.length, 0);
    const previousIds = new Set(await content.lessonIds());
    const newlyPublished = d.chapters.flatMap((chapter) => chapter.lessons
      .filter((lesson) => !previousIds.has(lesson.id))
      .map((lesson) => ({ id: lesson.id, title: lesson.title })));
    await db.tx(async (tx) => {
      const txContent = makeContent(tx);
      await txContent.set("curriculum", "main", d);
      await txContent.rebuildSearchIndex();
      for (const lesson of newlyPublished) {
        await notifyActiveSubscribers(tx, {
          title: "درس جديد متاح",
          message: `أُضيف درس جديد إلى المنهج: ${lesson.title}`,
          type: "education",
          relatedEntityId: lesson.id,
          actionUrl: `/lesson.html?id=${encodeURIComponent(lesson.id)}`,
        }, `lesson-published:${lesson.id}`);
      }
    });
    res.json({ ok: true, totalLessons: d.totalLessons });
  });

  r.put("/lessons/:id", async (req, res) => {
    const id = req.params.id;
    if (!(await content.lessonIds()).includes(id))
      return res.status(404).json({ error: "unknown_lesson", message: "الدرس غير موجود في المنهج — أضفه في curriculum أولًا" });
    const errs = validateLesson(id, req.body);
    if (errs.length) return fail(res, errs);
    const previous = await content.get("lesson", id);
    const serialized = JSON.stringify(req.body);
    if (JSON.stringify(previous) !== serialized) {
      const version = crypto.createHash("sha256").update(serialized).digest("hex");
      await db.tx(async (tx) => {
        const txContent = makeContent(tx);
        await txContent.set("lesson", id, req.body);
        await txContent.rebuildSearchIndex();
        await notifyActiveSubscribers(tx, {
          title: previous ? "تم تحديث محتوى تعليمي" : "درس جديد متاح",
          message: `تم ${previous ? "تحديث" : "نشر"} الدرس: ${req.body.title}`,
          type: "education",
          relatedEntityId: id,
          actionUrl: `/lesson.html?id=${encodeURIComponent(id)}`,
        }, `lesson-content:${id}:${version}`);
      });
    }
    res.json({ ok: true });
  });

  r.put("/quizzes/:chapter", async (req, res) => {
    const ch = Number(req.params.chapter);
    const cur = await content.get("curriculum", "main");
    if (!cur || !cur.chapters.some((c) => c.id === ch))
      return res.status(404).json({ error: "unknown_chapter", message: "الفصل غير موجود" });
    const errs = validateQuiz(ch, req.body);
    if (errs.length) return fail(res, errs);
    const quiz = { chapter: ch, demo: false, ...req.body };
    const previous = await content.get("quiz", ch);
    const serialized = JSON.stringify(quiz);
    if (JSON.stringify(previous) !== serialized) {
      const version = crypto.createHash("sha256").update(serialized).digest("hex");
      await db.tx(async (tx) => {
        const txContent = makeContent(tx);
        await txContent.set("quiz", ch, quiz);
        await txContent.rebuildSearchIndex();
        await notifyActiveSubscribers(tx, {
          title: previous ? "تم تحديث محتوى تعليمي" : "اختبار جديد متاح",
          message: previous ? `تم تحديث اختبار الفصل ${ch}.` : `أُضيف اختبار جديد للفصل ${ch}.`,
          type: "education",
          relatedEntityId: ch,
          actionUrl: `/quiz.html?chapter=${ch}`,
        }, `quiz-content:${ch}:${version}`);
      });
    }
    res.json({ ok: true });
  });

  r.post("/search-index/rebuild", async (_req, res) => { await content.rebuildSearchIndex(); res.json({ ok: true }); });

  return r;
};
