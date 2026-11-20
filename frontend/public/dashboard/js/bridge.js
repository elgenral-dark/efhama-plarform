(function () {
  "use strict";

  var E = window.Efhamha;
  var Store = E.Store;
  var dashboardSections = [
    "paths", "modules", "lessons", "questions", "quizzes", "projects", "assets",
    "glossary", "gamification", "ai", "students", "analytics", "subscriptions",
    "users", "logs", "settings", "data"
  ];

  E.showLogin = function () {
    window.location.replace("/login.html?next=" + encodeURIComponent("admin-dashboard.html"));
  };

  Store.init = function () {
    return fetch("/api/auth/me", {
      credentials: "same-origin",
      cache: "no-store"
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.status === 401) return "login";
        if (!response.ok) throw new Error(data.message || "تعذر التحقق من صلاحيات المسؤول.");
        if (!data.user || data.user.role !== "admin") throw new Error("هذه الصفحة مخصصة للمسؤولين.");
        Store.mode = "server";
        Store.authRequired = true;
        Store.authenticated = true;
        return Store.loadMe().then(function () {
          return Store.load();
        }).then(function () {
          return "ready";
        });
      });
    });
  };

  Store.api = function (method, path, body) {
    var url;
    if (path === "/me") {
      url = "/api/auth/me";
    } else if (path === "/data") {
      url = "/api/admin/dashboard/data";
    } else if (path === "/logout") {
      url = "/api/auth/logout";
    } else {
      return Promise.reject(new Error("القسم ظاهر في اللوحة، لكن عملياته تحتاج API غير موجود في الباك اند الحالي."));
    }

    var options = {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {}
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    return fetch(url, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.status === 401) {
          Store.authenticated = false;
          E.showLogin();
          throw new Error("انتهت الجلسة؛ أعد تسجيل الدخول.");
        }
        if (response.status === 404 && path === "/data") {
          throw new Error("خادم الباك اند لم يُحدّث بعد لدعم لوحة التحكم. أعد تشغيله محليًا أو أعد نشر خدمة Render.");
        }
        if (!response.ok) {
          var error = new Error(data.message || "تعذر تنفيذ الطلب.");
          error.status = response.status;
          throw error;
        }
        if (path !== "/me") return data;
        var sections = {};
        dashboardSections.forEach(function (section) { sections[section] = "edit"; });
        return {
          user: {
            id: data.user.id,
            username: data.user.email,
            displayName: data.user.name,
            roleLabel: "مسؤول"
          },
          perms: { sections: sections, flags: [] },
          sectionLabels: {}
        };
      });
    });
  };
})();
