const express = require("express");
const { rateLimit } = require("express-rate-limit");

const TYPES = new Set(["account", "subscription", "education", "general"]);

module.exports = function notificationRoutes(db, { requireAuth }) {
  const router = express.Router();
  router.use(requireAuth, rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  const owned = (userId, id) => db.get(
    "SELECT id, is_read AS \"isRead\" FROM notifications WHERE id = ? AND user_id = ?",
    [id, userId]
  );

  router.get("/unread-count", async (req, res) => {
    const row = await db.get(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0",
      [req.user.id]
    );
    res.set("Cache-Control", "private, no-store");
    res.json({ count: Number(row.count) });
  });

  router.get("/", async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 100000));
    const conditions = ["user_id = ?"];
    const params = [req.user.id];
    if (req.query.unread === "true") conditions.push("is_read = 0");
    if (req.query.type) {
      if (!TYPES.has(String(req.query.type)))
        return res.status(400).json({ error: "invalid_type", message: "نوع الإشعار غير صالح." });
      conditions.push("type = ?");
      params.push(String(req.query.type));
    }
    const where = conditions.join(" AND ");
    const [notifications, total, unread] = await Promise.all([
      db.all(
        `SELECT id, title, message, type, related_entity_id AS "relatedEntityId",
                is_read AS "isRead", created_at AS "createdAt", read_at AS "readAt",
                action_url AS "actionUrl"
           FROM notifications WHERE ${where}
          ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      db.get(`SELECT COUNT(*) AS count FROM notifications WHERE ${where}`, params),
      db.get("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0", [req.user.id]),
    ]);
    res.set("Cache-Control", "private, no-store");
    res.json({
      notifications,
      total: Number(total.count),
      unreadCount: Number(unread.count),
      nextOffset: offset + notifications.length < Number(total.count) ? offset + notifications.length : null,
    });
  });

  router.patch("/read-all", async (req, res) => {
    const now = Date.now();
    const result = await db.run(
      "UPDATE notifications SET is_read = 1, read_at = ? WHERE user_id = ? AND is_read = 0",
      [now, req.user.id]
    );
    res.json({ ok: true, updated: result.changes });
  });

  router.delete("/", async (req, res) => {
    const result = await db.run("DELETE FROM notifications WHERE user_id = ?", [req.user.id]);
    res.json({ ok: true, deleted: result.changes });
  });

  router.patch("/:id/read", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(404).json({ error: "not_found", message: "الإشعار غير موجود." });
    const notification = await owned(req.user.id, id);
    if (!notification)
      return res.status(404).json({ error: "not_found", message: "الإشعار غير موجود." });
    const result = notification.isRead ? { changes: 0 } : await db.run(
      "UPDATE notifications SET is_read = 1, read_at = ? WHERE id = ? AND user_id = ? AND is_read = 0",
      [Date.now(), id, req.user.id]
    );
    res.json({ ok: true, changed: result.changes > 0 });
  });

  router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(404).json({ error: "not_found", message: "الإشعار غير موجود." });
    const result = await db.run("DELETE FROM notifications WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!result.changes)
      return res.status(404).json({ error: "not_found", message: "الإشعار غير موجود." });
    res.json({ ok: true });
  });

  return router;
};
