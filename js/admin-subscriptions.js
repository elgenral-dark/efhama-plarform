(function () {
  "use strict";

  var list = document.getElementById("requestList");
  var notice = document.getElementById("adminNotice");
  var filter = document.getElementById("requestFilter");
  var template = document.getElementById("requestTemplate");
  var pageInfo = document.getElementById("pageInfo");
  var previousPage = document.getElementById("previousPage");
  var nextPage = document.getElementById("nextPage");
  var managedUsers = document.getElementById("managedUsers");
  var sessionTransfers = document.getElementById("sessionTransfers");
  var broadcastHistory = document.getElementById("notificationBroadcastHistory");
  var broadcastStatus = document.getElementById("notificationBroadcastStatus");
  var pageSize = 50;
  var offset = 0;

  function setNotice(message, error) {
    notice.textContent = message || "";
    notice.style.color = error ? "#B91C1C" : "var(--text-muted)";
  }

  function formatDate(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleString("ar-EG") : "—";
  }

  function api(url, method, body, extraHeaders) {
    return fetch(url, {
      method: method || "GET",
      credentials: "same-origin",
      headers: Object.assign(body ? { "Content-Type": "application/json" } : {}, extraHeaders || {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.message || "تعذر تنفيذ الطلب.");
        return data;
      });
    });
  }

  function addText(parent, selector, text) {
    parent.querySelector(selector).textContent = text || "";
  }

  function renderRequest(request) {
    var node = template.content.firstElementChild.cloneNode(true);
    addText(node, ".request-name", request.name);
    addText(node, ".request-email", request.email);
    addText(node, ".request-code", "رقم الطلب: " + request.requestCode);
    addText(node, ".request-amount", "المبلغ: " + request.amount + " " + request.currency);
    addText(node, ".request-date", "تاريخ الطلب: " + formatDate(request.createdAt));
    addText(node, ".request-status-badge", request.status === "pending" ? "قيد المراجعة" : request.status === "approved" ? "تمت الموافقة" : "مرفوض");
    addText(node, ".request-subscription", request.subscriptionStartsAt
      ? "حالة الاشتراك: " + (request.subscriptionStatus === "active" ? "نشط" : "منتهٍ")
        + " — " + formatDate(request.subscriptionStartsAt) + " إلى " + formatDate(request.subscriptionEndsAt)
      : "حالة الاشتراك: غير مفعل");
    addText(node, ".request-rejection", request.rejectionReason ? "سبب الرفض: " + request.rejectionReason : "");
    var image = node.querySelector(".proof-image");
    image.src = "/api/admin/subscription-requests/" + encodeURIComponent(request.id) + "/proof";
    image.alt = "إثبات دفع " + request.name;

    var approve = node.querySelector(".approve-button");
    var reject = node.querySelector(".reject-button");
    var reason = node.querySelector(".reject-reason");
    if (request.status !== "pending") {
      approve.hidden = true;
      reject.hidden = true;
      node.querySelector(".reject-reason-label").hidden = true;
    } else {
      approve.addEventListener("click", function () {
        if (!window.confirm("هل راجعت إثبات الدفع وتريد تفعيل الاشتراك السنوي؟")) return;
        approve.disabled = true;
        api("/api/admin/subscription-requests/" + request.id + "/approve", "POST", {})
          .then(function () {
            setNotice("تمت الموافقة وتفعيل الاشتراك لمدة سنة.");
            loadRequests();
            loadUsers();
          })
          .catch(function (error) { approve.disabled = false; setNotice(error.message, true); });
      });
      reject.addEventListener("click", function () {
        if (reason.value.trim().length < 3) {
          setNotice("اكتب سبب الرفض قبل متابعة الإجراء.", true);
          reason.focus();
          return;
        }
        reject.disabled = true;
        api("/api/admin/subscription-requests/" + request.id + "/reject", "POST", { reason: reason.value })
          .then(function () {
            setNotice("تم رفض الطلب وإظهار السبب للمستخدم.");
            loadRequests();
            loadUsers();
          })
          .catch(function (error) { reject.disabled = false; setNotice(error.message, true); });
      });
    }
    return node;
  }

  function loadUsers() {
    managedUsers.replaceChildren();
    return api("/api/admin/users?limit=100").then(function (data) {
      if (!data.users.length) {
        managedUsers.textContent = "لا توجد حسابات.";
        return;
      }
      data.users.forEach(function (user) {
        var row = document.createElement("article");
        row.className = "managed-user";
        var info = document.createElement("div");
        info.className = "managed-user-main";
        var name = document.createElement("strong");
        name.textContent = user.name || user.email;
        var details = document.createElement("span");
        var statusText = {
          pending: "في انتظار الموافقة",
          approved: "معتمد",
          rejected: "مرفوض",
          suspended: "موقوف"
        }[user.approvalStatus] || user.approvalStatus;
        details.textContent = user.email + " — " + statusText
          + (user.sessionStartedAt ? " — جلسة نشطة منذ " + formatDate(user.sessionStartedAt)
            + " — آخر نشاط " + formatDate(user.sessionLastSeenAt) : " — لا توجد جلسة نشطة");
        info.append(name, details);

        var status = document.createElement("select");
        status.setAttribute("aria-label", "حالة اعتماد " + user.email);
        ["pending", "approved", "rejected", "suspended"].forEach(function (value) {
          var option = document.createElement("option");
          option.value = value;
          option.textContent = { pending: "قيد الموافقة", approved: "معتمد", rejected: "مرفوض", suspended: "موقوف" }[value];
          option.selected = user.approvalStatus === value;
          status.appendChild(option);
        });
        status.addEventListener("change", function () {
          status.disabled = true;
          api("/api/admin/users/" + user.id, "PATCH", { approvalStatus: status.value })
            .then(function () { setNotice("تم تحديث حالة الحساب والجلسات."); loadUsers(); })
            .catch(function (error) { setNotice(error.message, true); status.value = user.approvalStatus; status.disabled = false; });
        });

        row.append(info, status);
        managedUsers.appendChild(row);
      });
    }).catch(function (error) { managedUsers.textContent = error.message; });
  }

  function loadSessionTransfers() {
    sessionTransfers.replaceChildren();
    return api("/api/admin/session-transfers?limit=100").then(function (data) {
      if (!data.attempts.length) {
        sessionTransfers.textContent = "لا توجد محاولات نقل جلسة.";
        return;
      }

      data.attempts.forEach(function (attempt) {
        var row = document.createElement("article");
        row.className = "device-attempt";
        var info = document.createElement("div");
        info.className = "device-attempt-main";
        var title = document.createElement("strong");
        title.textContent = (attempt.name || attempt.email) + " — " + attempt.email;
        var details = document.createElement("span");
        var statusText = {
          confirmation_required: "بانتظار تأكيد المستخدم",
          transferred: "تم نقل الجلسة",
          cancelled: "ألغى المستخدم النقل",
          expired: "انتهت مهلة التأكيد",
          stale: "تغيرت الجلسة قبل التأكيد"
        }[attempt.status] || attempt.status;
        details.textContent = "الحالة: " + statusText + " — طلب النقل: " + formatDate(attempt.attemptedAt)
          + (attempt.resolvedAt ? " — النتيجة: " + formatDate(attempt.resolvedAt) : "");
        var ua = document.createElement("span");
        ua.textContent = "الجلسة السابقة: " + formatDate(attempt.previousStartedAt)
          + (attempt.previousIpAddress ? " — IP: " + attempt.previousIpAddress : "")
          + " — المتصفح: " + (attempt.previousUserAgent || "غير متاح");
        var requestingDevice = document.createElement("span");
        requestingDevice.textContent = "طلب النقل من: " + (attempt.ipAddress || "IP غير متاح")
          + " — المتصفح: " + (attempt.userAgent || "غير متاح");
        info.append(title, details, ua, requestingDevice);
        row.append(info);
        sessionTransfers.appendChild(row);
      });
    }).catch(function (error) { sessionTransfers.textContent = error.message; });
  }

  function loadNotificationBroadcasts() {
    broadcastHistory.replaceChildren();
    return api("/api/admin/notifications?limit=30").then(function (data) {
      if (!data.broadcasts.length) {
        var empty = document.createElement("p");
        empty.className = "admin-empty";
        empty.textContent = "لم يتم إرسال إشعارات إدارية بعد.";
        broadcastHistory.appendChild(empty);
        return;
      }
      var audienceLabels = {
        "all-active": "كل الحسابات المعتمدة النشطة",
        subscribed: "الطلاب ذوو الاشتراك النشط",
        students: "الطلاب المعتمدون النشطون",
        admins: "المسؤولون النشطون",
        user: "مستخدم محدد"
      };
      var typeLabels = { account: "الحساب", subscription: "الاشتراك", education: "التعليم", general: "عام" };
      data.broadcasts.forEach(function (item) {
        var row = document.createElement("article");
        row.className = "notification-broadcast-row";
        var heading = document.createElement("strong");
        heading.textContent = item.title;
        var message = document.createElement("p");
        message.textContent = item.message;
        var details = document.createElement("span");
        details.textContent = "الفئة: " + (audienceLabels[item.audience] || item.audience)
          + " — المستلمون: " + item.recipientCount
          + " — النوع: " + (typeLabels[item.type] || item.type) + " — " + formatDate(item.createdAt)
          + " — أرسله: " + (item.senderName || item.senderEmail);
        row.append(heading, message, details);
        broadcastHistory.appendChild(row);
      });
    }).catch(function (error) {
      broadcastHistory.textContent = error.message;
    });
  }

  function setBroadcastStatus(message, isError) {
    broadcastStatus.textContent = message || "";
    broadcastStatus.style.color = isError ? "#B91C1C" : "var(--text-muted)";
  }

  function createIdempotencyKey() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : "notice-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  var broadcastIdempotencyKey = createIdempotencyKey();

  function loadRequests() {
    setNotice("جارٍ تحميل الطلبات…");
    list.replaceChildren();
    return api("/api/admin/subscription-requests?status=" + encodeURIComponent(filter.value)
      + "&limit=" + pageSize + "&offset=" + offset)
      .then(function (data) {
        if (!data.requests.length) {
          var empty = document.createElement("p");
          empty.className = "empty-requests";
          empty.textContent = "لا توجد طلبات في هذه الحالة.";
          list.appendChild(empty);
        } else {
          data.requests.forEach(function (request) { list.appendChild(renderRequest(request)); });
        }
        var first = data.total ? offset + 1 : 0;
        var last = Math.min(offset + data.requests.length, data.total);
        pageInfo.textContent = first + "–" + last + " من " + data.total;
        previousPage.disabled = offset === 0;
        nextPage.disabled = offset + pageSize >= data.total;
        setNotice("عدد الطلبات في الصفحة: " + data.requests.length);
      })
      .catch(function (error) {
        pageInfo.textContent = "";
        previousPage.disabled = true;
        nextPage.disabled = true;
        setNotice(error.message, true);
      });
  }

  Auth.check().then(function (user) {
    if (!user || user.role !== "admin") {
      window.location.replace(user ? "register.html" : "login.html");
      return;
    }
    loadRequests();
    loadUsers();
    loadSessionTransfers();
    loadNotificationBroadcasts();
  }).catch(function () {
    setNotice("تعذر التحقق من صلاحيات المسؤول. سجّل الدخول مجددًا.", true);
  });

  filter.addEventListener("change", function () { offset = 0; loadRequests(); });
  document.getElementById("refreshRequests").addEventListener("click", loadRequests);
  document.getElementById("refreshUsers").addEventListener("click", loadUsers);
  document.getElementById("refreshSessionTransfers").addEventListener("click", loadSessionTransfers);
  previousPage.addEventListener("click", function () { offset = Math.max(0, offset - pageSize); loadRequests(); });
  nextPage.addEventListener("click", function () { offset += pageSize; loadRequests(); });
  document.getElementById("adminLogout").addEventListener("click", Auth.logout);
  var audience = document.getElementById("notificationAudience");
  var targetLabel = document.getElementById("notificationTargetLabel");
  var targetEmail = document.getElementById("notificationTargetEmail");
  audience.addEventListener("change", function () {
    var targeted = audience.value === "user";
    targetLabel.hidden = !targeted;
    targetEmail.required = targeted;
  });
  document.getElementById("refreshNotificationBroadcasts").addEventListener("click", loadNotificationBroadcasts);
  document.getElementById("notificationBroadcastForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var submit = document.getElementById("sendNotificationBroadcast");
    var body = {
      audience: audience.value,
      type: document.getElementById("notificationBroadcastType").value,
      title: document.getElementById("notificationBroadcastTitle").value,
      message: document.getElementById("notificationBroadcastMessage").value,
      actionUrl: document.getElementById("notificationBroadcastUrl").value
    };
    if (audience.value === "user") body.userEmail = targetEmail.value;
    submit.disabled = true;
    setBroadcastStatus("جارٍ إرسال الإشعار…");
    api("/api/admin/notifications", "POST", body, { "Idempotency-Key": broadcastIdempotencyKey })
      .then(function (result) {
        broadcastIdempotencyKey = createIdempotencyKey();
        document.getElementById("notificationBroadcastTitle").value = "";
        document.getElementById("notificationBroadcastMessage").value = "";
        document.getElementById("notificationBroadcastUrl").value = "";
        setBroadcastStatus("تم إرسال الإشعار إلى " + result.recipientCount + " مستخدم.");
        loadNotificationBroadcasts();
      })
      .catch(function (error) { setBroadcastStatus(error.message, true); })
      .finally(function () { submit.disabled = false; });
  });
})();
