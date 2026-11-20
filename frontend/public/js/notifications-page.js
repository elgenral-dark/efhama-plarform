(function () {
  "use strict";

  var list = document.getElementById("notificationList");
  var status = document.getElementById("notificationStatus");
  var empty = document.getElementById("notificationEmpty");
  var errorBox = document.getElementById("notificationError");
  var pageInfo = document.getElementById("notificationPageInfo");
  var previous = document.getElementById("previousNotifications");
  var next = document.getElementById("nextNotifications");
  var readFilter = document.getElementById("readFilter");
  var categoryFilter = document.getElementById("categoryFilter");
  var search = document.getElementById("notificationSearch");
  var pageSize = 20;
  var offset = 0;
  var searchTimer = null;
  var categories = {
    general: "عام", course: "دورة", lesson: "درس", exam: "اختبار",
    assignment: "واجب", grade: "درجة", subscription: "اشتراك",
    payment: "دفع", account: "حساب", system: "النظام",
    teacher: "المعلم", admin: "الإدارة"
  };

  function api(path, method) {
    return fetch(path, { method: method || "GET", credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            var failure = new Error(data.message || "تعذر تنفيذ الطلب.");
            failure.status = response.status;
            throw failure;
          }
          return data;
        });
      });
  }

  function setLoading() {
    status.textContent = "جارٍ تحميل الإشعارات…";
    list.replaceChildren();
    for (var i = 0; i < 3; i++) {
      var skeleton = document.createElement("div");
      skeleton.className = "notification-skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      list.appendChild(skeleton);
    }
    empty.hidden = true;
    errorBox.hidden = true;
  }

  function formatDate(timestamp) {
    return new Date(Number(timestamp)).toLocaleString("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function createNotificationRow(notification) {
    var article = document.createElement("article");
    article.className = "notification-card" + (notification.isRead ? " is-read" : " is-unread");
    var content = document.createElement("div");
    content.className = "notification-card-content";
    var title = document.createElement("h2");
    title.textContent = notification.title;
    var message = document.createElement("p");
    message.textContent = notification.message;
    var meta = document.createElement("p");
    meta.className = "notification-card-meta";
    meta.textContent = (categories[notification.category] || "عام") + " · " + formatDate(notification.createdAt)
      + " · " + (notification.isRead ? "مقروء" : "غير مقروء");
    content.append(title, message, meta);

    var controls = document.createElement("div");
    controls.className = "notification-card-actions";
    if (!notification.isRead) {
      var markRead = document.createElement("button");
      markRead.type = "button";
      markRead.className = "btn btn-outline btn-sm";
      markRead.textContent = "تحديد كمقروء";
      markRead.setAttribute("aria-label", "تحديد " + notification.title + " كمقروء");
      markRead.addEventListener("click", function () {
        markRead.disabled = true;
        api("/api/notifications/" + encodeURIComponent(notification.id) + "/read", "PATCH")
          .then(load)
          .catch(handleFailure);
      });
      controls.appendChild(markRead);
    }
    if (notification.actionUrl) {
      var action = document.createElement("a");
      action.className = "btn btn-outline btn-sm";
      action.href = notification.actionUrl;
      action.textContent = "فتح";
      action.addEventListener("click", function (event) {
        event.preventDefault();
        if (!notification.isRead) {
          api("/api/notifications/" + encodeURIComponent(notification.id) + "/read", "PATCH")
            .catch(function (failure) { console.error("Unable to mark notification as read:", failure); })
            .then(function () { window.location.assign(notification.actionUrl); });
        } else {
          window.location.assign(notification.actionUrl);
        }
      });
      controls.appendChild(action);
    }
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-sm";
    remove.textContent = "حذف";
    remove.setAttribute("aria-label", "حذف " + notification.title);
    remove.addEventListener("click", function () {
      remove.disabled = true;
      api("/api/notifications/" + encodeURIComponent(notification.id), "DELETE")
        .then(load)
        .catch(handleFailure);
    });
    controls.appendChild(remove);
    article.append(content, controls);
    return article;
  }

  function handleFailure(failure) {
    if (failure.status === 401) {
      Auth.expired();
      return;
    }
    console.error("Notification request failed:", failure);
    status.textContent = "";
    list.replaceChildren();
    errorBox.hidden = false;
    previous.disabled = true;
    next.disabled = true;
    pageInfo.textContent = "";
  }

  function load() {
    setLoading();
    var params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (readFilter.value) params.set("read", readFilter.value);
    if (categoryFilter.value) params.set("category", categoryFilter.value);
    if (search.value.trim()) params.set("q", search.value.trim());
    return api("/api/notifications?" + params.toString()).then(function (data) {
      list.replaceChildren();
      status.textContent = "";
      errorBox.hidden = true;
      empty.hidden = data.notifications.length > 0;
      data.notifications.forEach(function (item) { list.appendChild(createNotificationRow(item)); });
      window.dispatchEvent(new CustomEvent("efhamha:notifications-updated", {
        detail: { unreadCount: data.unreadCount }
      }));
      var total = data.pagination.total;
      pageInfo.textContent = total
        ? (offset + 1) + "–" + Math.min(offset + data.notifications.length, total) + " من " + total
        : "";
      previous.disabled = offset === 0;
      next.disabled = !data.pagination.hasMore;
      return data;
    }).catch(handleFailure);
  }

  document.getElementById("notificationFilters").addEventListener("submit", function (event) {
    event.preventDefault();
    offset = 0;
    load();
  });
  readFilter.addEventListener("change", function () { offset = 0; load(); });
  categoryFilter.addEventListener("change", function () { offset = 0; load(); });
  search.addEventListener("input", function () {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () { offset = 0; load(); }, 250);
  });
  previous.addEventListener("click", function () { offset = Math.max(0, offset - pageSize); load(); });
  next.addEventListener("click", function () { offset += pageSize; load(); });
  document.getElementById("retryNotifications").addEventListener("click", load);
  document.getElementById("markAllRead").addEventListener("click", function (event) {
    var button = event.currentTarget;
    button.disabled = true;
    api("/api/notifications/read-all", "PATCH").then(load).catch(handleFailure)
      .finally(function () { button.disabled = false; });
  });
  document.getElementById("clearAll").addEventListener("click", function (event) {
    if (!window.confirm("هل تريد حذف جميع إشعاراتك؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    var button = event.currentTarget;
    button.disabled = true;
    api("/api/notifications", "DELETE").then(function () {
      offset = 0;
      return load();
    }).catch(handleFailure).finally(function () { button.disabled = false; });
  });

  Auth.check().then(function (user) {
    if (!user) {
      Auth.expired();
      return;
    }
    load();
  }).catch(handleFailure);
})();
