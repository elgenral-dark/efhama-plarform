(function () {
  "use strict";

  var panels = Array.from(document.querySelectorAll("[data-dashboard-panel]"));
  var links = Array.from(document.querySelectorAll("[data-admin-panel]"));
  var titles = {
    overview: "نظرة عامة",
    requests: "طلبات الاشتراك",
    accounts: "الحسابات والاعتماد",
    announcements: "الإعلانات والإشعارات",
    transfers: "سجل نقل الجلسات"
  };
  var side = document.getElementById("adminSide");
  var scrim = document.getElementById("adminScrim");
  var menuButton = document.getElementById("adminMenu");

  function showPanel(name) {
    if (!titles[name]) name = "overview";
    panels.forEach(function (panel) {
      panel.hidden = panel.dataset.dashboardPanel !== name;
    });
    links.forEach(function (link) {
      if (link.dataset.adminPanel === name) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.getElementById("adminPageTitle").textContent = titles[name];
    side.classList.remove("open");
    scrim.classList.remove("show");
    menuButton.setAttribute("aria-expanded", "false");
    if (name === "overview" && statsElement) loadStats();
  }

  document.querySelector(".nav").addEventListener("click", function (event) {
    var link = event.target.closest("[data-admin-panel]");
    if (link) showPanel(link.dataset.adminPanel);
  });
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-open-panel]");
    if (button) {
      var name = button.dataset.openPanel;
      if (location.hash !== "#" + name) location.hash = name;
      showPanel(name);
    }
  });
  window.addEventListener("hashchange", function () {
    showPanel(location.hash.slice(1));
  });
  menuButton.addEventListener("click", function () {
    var open = !side.classList.contains("open");
    side.classList.toggle("open", open);
    scrim.classList.toggle("show", open);
    menuButton.setAttribute("aria-expanded", String(open));
  });
  scrim.addEventListener("click", function () {
    side.classList.remove("open");
    scrim.classList.remove("show");
    menuButton.setAttribute("aria-expanded", "false");
  });
  var statsElement = document.getElementById("dashboardStats");
  var statsNotice = document.getElementById("dashboardStatsNotice");
  var cards = [
    ["students", "الطلاب", "users"],
    ["admins", "المسؤولون", "shield"],
    ["activeSubscriptions", "الاشتراكات النشطة", "wallet"],
    ["pendingRequests", "طلبات اشتراك معلقة", "clock"],
    ["pendingAccounts", "حسابات بانتظار الاعتماد", "user"]
  ];

  function loadStats() {
    statsNotice.textContent = "جارٍ تحديث الإحصاءات…";
    return fetch("/api/admin/stats", {
      credentials: "same-origin",
      cache: "no-store"
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.message || "تعذر تحميل الإحصاءات.");
        statsElement.innerHTML = cards.map(function (card) {
          return '<article class="stat-card"><div class="stat-icon-wrap" aria-hidden="true">' +
            '<span class="admin-stat-icon">' + iconText(card[2]) + '</span></div><div class="stat-info">' +
            '<span class="n">' + Number(data[card[0]] || 0).toLocaleString("ar-EG") +
            '</span><span class="l">' + card[1] + "</span></div></article>";
        }).join("");
        statsNotice.textContent = "آخر تحديث: " + new Date().toLocaleTimeString("ar-EG");
      });
    }).catch(function (error) {
      statsNotice.textContent = error.message;
      statsNotice.classList.add("is-error");
    });
  }

  function iconText(name) {
    return { users: "♙", shield: "✓", wallet: "▣", clock: "◷", user: "◎" }[name] || "•";
  }

  document.getElementById("refreshDashboard").addEventListener("click", loadStats);
  showPanel(location.hash.slice(1));
  loadStats();
})();
