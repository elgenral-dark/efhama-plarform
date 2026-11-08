const TYPES = new Set(["account", "subscription", "education", "general"]);

async function createNotification(db, userId, notification, eventKey, senderId = null, now = Date.now()) {
  if (!TYPES.has(notification.type)) throw new Error("Unsupported notification type");
  await db.run(
    `INSERT OR IGNORE INTO notifications
       (user_id, title, message, type, related_entity_id, is_read, created_at,
        action_url, event_key, sender_id)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      userId,
      notification.title,
      notification.message,
      notification.type,
      notification.relatedEntityId == null ? null : String(notification.relatedEntityId),
      now,
      notification.actionUrl || null,
      eventKey || null,
      senderId,
    ]
  );
}

async function notifyActiveSubscribers(db, notification, eventKey, now = Date.now()) {
  const users = await db.all(
    `SELECT u.id
       FROM users u JOIN subscriptions s ON s.user_id = u.id
      WHERE u.role = 'student' AND u.active = 1 AND u.approval_status = 'approved'
        AND s.status = 'active' AND s.starts_at <= ? AND s.ends_at > ?`,
    [now, now]
  );
  for (const user of users)
    await createNotification(db, user.id, notification, eventKey, null, now);
  return users.length;
}

async function runSubscriptionNotificationSweep(db, now = Date.now()) {
  const reminderLimit = 500;
  await db.tx(async (tx) => {
    const expiring = await tx.all(
      `SELECT s.user_id, s.ends_at
         FROM subscriptions s JOIN users u ON u.id = s.user_id
        WHERE s.status = 'active' AND s.starts_at <= ? AND s.ends_at > ?
          AND s.ends_at <= ?
          AND u.active = 1 AND u.approval_status = 'approved'
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
             WHERE n.user_id = s.user_id
               AND n.event_key = 'subscription-expiring:' || CAST(s.ends_at AS TEXT)
          )
        ORDER BY s.ends_at, s.user_id LIMIT ?`,
      [now, now, now + 7 * 86400000, reminderLimit]
    );
    for (const subscription of expiring) {
      await createNotification(tx, subscription.user_id, {
        title: "اقترب موعد انتهاء اشتراكك",
        message: "سينتهي اشتراكك خلال سبعة أيام. جدّد اشتراكك لمواصلة الوصول إلى المحتوى التعليمي.",
        type: "subscription",
        actionUrl: "/admin-subscriptions.html",
      }, `subscription-expiring:${subscription.ends_at}`, null, now);
    }

    const expired = await tx.all(
      `SELECT s.user_id, s.ends_at
         FROM subscriptions s JOIN users u ON u.id = s.user_id
        WHERE s.status = 'active' AND s.ends_at <= ?
          AND u.active = 1 AND u.approval_status = 'approved'
        ORDER BY s.ends_at, s.user_id LIMIT ?`,
      [now, reminderLimit]
    );
    for (const subscription of expired) {
      await tx.run(
        "UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE user_id = ? AND status = 'active' AND ends_at <= ?",
        [now, subscription.user_id, now]
      );
      await createNotification(tx, subscription.user_id, {
        title: "انتهى اشتراكك",
        message: "انتهى اشتراكك. يمكنك إرسال طلب تجديد من صفحة الاشتراك.",
        type: "subscription",
        actionUrl: "/admin-subscriptions.html",
      }, `subscription-expired:${subscription.ends_at}`, null, now);
    }
  });
}

module.exports = { createNotification, notifyActiveSubscribers, runSubscriptionNotificationSweep };
