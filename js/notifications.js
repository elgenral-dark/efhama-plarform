(() => {
  const root = new URL("../", document.currentScript.src);
  const pageUrl = new URL("notifications.html", root).href;
  const labels = {
    account: "الحساب",
    subscription: "الاشتراك",
    education: "التعليم",
    general: "عام",
  };
  const icons = {
    account: "👤",
    subscription: "💳",
    education: "📚",
    general: "🔔",
  };

  async function api(url, method = "GET") {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "تعذر تحميل الإشعارات.");
    return body;
  }

  function formatDate(timestamp) {
    return timestamp ? new Date(Number(timestamp)).toLocaleString("ar-EG") : "—";
  }

  function updateCount(count) {
    const badge = document.getElementById("notificationCount");
    const bell = document.getElementById("notificationBell");
    if (!badge || !bell) return;
    const number = Number(count) || 0;
    badge.textContent = number > 99 ? "99+" : String(number);
    badge.hidden = number === 0;
    bell.setAttribute("aria-label", number ? `الإشعارات، ${number} غير مقروء` : "الإشعارات");
  }

  function createNotificationRow(notification, compact = false) {
    const row = document.createElement(compact ? "button" : "article");
    row.className = `notification-item${notification.isRead ? " is-read" : " is-unread"}`;
    if (compact) row.type = "button";
    row.dataset.notificationId = String(notification.id);

    const icon = document.createElement("span");
    icon.className = "notification-item-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = icons[notification.type] || icons.general;

    const content = document.createElement("span");
    content.className = "notification-item-content";
    const title = document.createElement("strong");
    title.className = "notification-item-title";
    title.textContent = notification.title;
    const message = document.createElement("span");
    message.className = "notification-item-message";
    message.textContent = notification.message;
    const meta = document.createElement("span");
    meta.className = "notification-item-meta";
    const kind = document.createElement("span");
    kind.textContent = labels[notification.type] || labels.general;
    const date = document.createElement("time");
    date.dateTime = new Date(Number(notification.createdAt)).toISOString();
    date.textContent = formatDate(notification.createdAt);
    const status = document.createElement("span");
    status.className = "notification-read-status";
    status.textContent = notification.isRead ? "مقروء" : "غير مقروء";
    meta.append(kind, date, status);
    content.append(title, message, meta);

    row.append(icon, content);
    if (!compact) {
      const actions = document.createElement("span");
      actions.className = "notification-row-actions";
      if (notification.actionUrl) {
        const open = document.createElement("a");
        open.className = "btn btn-ghost btn-sm";
        open.textContent = "فتح";
        open.href = notification.actionUrl;
        open.dataset.action = "open";
        actions.append(open);
      }
      if (!notification.isRead) {
        const read = document.createElement("button");
        read.type = "button";
        read.className = "btn btn-outline btn-sm";
        read.textContent = "تحديد كمقروء";
        read.dataset.action = "read";
        actions.append(read);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-ghost btn-sm";
      remove.textContent = "حذف";
      remove.dataset.action = "delete";
      actions.append(remove);
      row.append(actions);
    }
    return row;
  }

  async function setupBell() {
    const actions = document.querySelector(".header-actions");
    if (!actions) return;
    const wrapper = document.createElement("div");
    wrapper.className = "notification-widget";
    wrapper.innerHTML = `
      <button class="notification-bell" id="notificationBell" type="button" aria-label="الإشعارات" aria-expanded="false" aria-controls="notificationDropdown">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>
        </svg><span class="notification-count" id="notificationCount" hidden></span>
      </button>
      <section class="notification-dropdown" id="notificationDropdown" hidden aria-label="أحدث الإشعارات">
        <header class="notification-dropdown-heading"><strong>الإشعارات</strong><span id="notificationDropdownCount"></span></header>
        <div class="notification-preview-list" id="notificationPreviewList" aria-live="polite"></div>
        <p class="notification-widget-error" id="notificationWidgetError" role="status" hidden></p>
        <a class="notification-all-link" href="${pageUrl}">عرض جميع الإشعارات</a>
      </section>`;
    actions.prepend(wrapper);

    const bell = wrapper.querySelector("#notificationBell");
    const dropdown = wrapper.querySelector("#notificationDropdown");
    const list = wrapper.querySelector("#notificationPreviewList");
    const error = wrapper.querySelector("#notificationWidgetError");
    let authenticated = false;
    let polling = null;

    function setOpen(open) {
      dropdown.hidden = !open;
      bell.setAttribute("aria-expanded", String(open));
      if (open) loadPreview();
    }

    async function refreshCount() {
      if (!authenticated || document.visibilityState === "hidden") return;
      try {
        const result = await api("/api/notifications/unread-count");
        updateCount(result.count);
      } catch {
        if (polling) {
          clearInterval(polling);
          polling = null;
        }
      }
    }

    async function loadPreview() {
      error.hidden = true;
      list.replaceChildren();
      try {
        const result = await api("/api/notifications?limit=8");
        updateCount(result.unreadCount);
        wrapper.querySelector("#notificationDropdownCount").textContent = result.unreadCount
          ? `${result.unreadCount} غير مقروء`
          : "لا توجد إشعارات غير مقروءة";
        if (!result.notifications.length) {
          const empty = document.createElement("p");
          empty.className = "notification-empty";
          empty.textContent = "لا توجد إشعارات حتى الآن.";
          list.append(empty);
          return;
        }
        result.notifications.forEach((notification) => {
          const row = createNotificationRow(notification, true);
          row.addEventListener("click", async () => {
            if (!notification.isRead) {
              await api(`/api/notifications/${notification.id}/read`, "PATCH").catch(() => {});
            }
            if (notification.actionUrl) window.location.assign(notification.actionUrl);
            else {
              notification.isRead = true;
              row.classList.replace("is-unread", "is-read");
              row.querySelector(".notification-read-status").textContent = "مقروء";
              await refreshCount();
            }
          });
          list.append(row);
        });
      } catch (requestError) {
        error.textContent = requestError.message;
        error.hidden = false;
      }
    }

    bell.addEventListener("click", () => setOpen(dropdown.hidden));
    document.addEventListener("click", (event) => {
      if (!wrapper.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });

    try {
      const account = await api("/api/auth/subscription");
      authenticated = !!account.user;
      if (!authenticated) return;
      await refreshCount();
      polling = setInterval(refreshCount, 60_000);
    } catch {
      bell.hidden = true;
    }
  }

  async function setupHistoryPage() {
    const list = document.getElementById("notificationsList");
    if (!list) return;
    const typeFilter = document.getElementById("notificationTypeFilter");
    const unreadFilter = document.getElementById("unreadOnlyFilter");
    const status = document.getElementById("notificationPageStatus");
    const loadMore = document.getElementById("loadMoreNotifications");
    let offset = 0;
    let hasMore = false;
    let loading = false;

    function setStatus(message, isError = false) {
      status.textContent = message || "";
      status.classList.toggle("is-error", isError);
    }

    async function loadPage(reset) {
      if (loading) return;
      loading = true;
      loadMore.disabled = true;
      if (reset) {
        offset = 0;
        list.replaceChildren();
      }
      setStatus("جارٍ تحميل الإشعارات…");
      const params = new URLSearchParams({ limit: "25", offset: String(offset) });
      if (typeFilter.value) params.set("type", typeFilter.value);
      if (unreadFilter.checked) params.set("unread", "true");
      try {
        const result = await api(`/api/notifications?${params}`);
        result.notifications.forEach((notification) => list.append(createNotificationRow(notification)));
        offset += result.notifications.length;
        hasMore = result.nextOffset !== null;
        loadMore.hidden = !hasMore;
        setStatus(result.total ? `عرض ${offset} من ${result.total}` : "لا توجد إشعارات تطابق هذا الاختيار.");
        const count = document.getElementById("notificationPageUnreadCount");
        count.textContent = `${result.unreadCount} غير مقروء`;
        updateCount(result.unreadCount);
      } catch (error) {
        setStatus(error.message, true);
        loadMore.hidden = true;
      } finally {
        loading = false;
        loadMore.disabled = false;
      }
    }

    list.addEventListener("click", async (event) => {
      const row = event.target.closest(".notification-item");
      if (!row) return;
      const id = encodeURIComponent(row.dataset.notificationId);
      const action = event.target.closest("[data-action]")?.dataset.action;
      try {
        if (action === "delete") {
          await api(`/api/notifications/${id}`, "DELETE");
          row.remove();
          setStatus("تم حذف الإشعار.");
        } else if (action === "read") {
          await api(`/api/notifications/${id}/read`, "PATCH");
          await loadPage(true);
          setStatus("تم تحديد الإشعار كمقروء.");
        } else if (action === "open") {
          event.preventDefault();
          if (row.classList.contains("is-unread"))
            await api(`/api/notifications/${id}/read`, "PATCH");
          window.location.assign(event.target.closest("a").href);
        }
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    typeFilter.addEventListener("change", () => loadPage(true));
    unreadFilter.addEventListener("change", () => loadPage(true));
    loadMore.addEventListener("click", () => {
      if (hasMore) loadPage(false);
    });
    document.getElementById("markAllNotificationsRead").addEventListener("click", async () => {
      try {
        await api("/api/notifications/read-all", "PATCH");
        await loadPage(true);
        setStatus("تم تحديد جميع الإشعارات كمقروءة.");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    document.getElementById("deleteAllNotifications").addEventListener("click", async () => {
      if (!window.confirm("هل تريد حذف جميع إشعاراتك؟ لا يمكن التراجع عن هذا الإجراء.")) return;
      try {
        await api("/api/notifications", "DELETE");
        await loadPage(true);
        setStatus("تم حذف جميع الإشعارات.");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    await loadPage(true);
  }

  setupBell();
  setupHistoryPage();
})();
