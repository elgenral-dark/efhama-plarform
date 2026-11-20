var AUTH_KEY = "efhamha_auth";
var USER_KEY = "efhamha_user";
var SESSION_USER_KEY = "efhamha_session_user";

var Sync = {
  pull: function () { return Promise.resolve(false); },
  flush: function () { return Promise.resolve(); },
  wipe: function () {
    var rm = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (/^efhamha_(completed|started|last_lesson|quiz_results|quiz_best|mistakes)$/.test(key)) rm.push(key);
    }
    rm.forEach(function (key) { localStorage.removeItem(key); });
  },
  hasPending: function () { return false; }
};

function authRequest(path, method, body) {
  return fetch(path, {
    method: method || "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(function (response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      return { ok: response.ok, status: response.status, data: data };
    });
  });
}

function clearCachedUser() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
}

function cacheAuthenticatedUser(user, remember) {
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
  if (remember) {
    localStorage.setItem(AUTH_KEY, "1");
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.removeItem(AUTH_KEY);
  } else {
    sessionStorage.setItem(AUTH_KEY, "1");
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    localStorage.removeItem(AUTH_KEY);
  }
}

function loginResult(result) {
  if (result.ok) {
    return { ok: true, user: result.data.user };
  }
  if (result.status === 409 && result.data.error === "active_session") {
    return {
      ok: false,
      requiresTransfer: true,
      transferToken: result.data.transferToken,
      message: result.data.message,
      status: result.status
    };
  }
  return {
    ok: false,
    status: result.status,
    error: result.data.error,
    message: result.data.message || "تعذر تسجيل الدخول."
  };
}

var Auth = {
  isLoggedIn: function () {
    return !!(localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY));
  },
  user: function () {
    try {
      var value = localStorage.getItem(USER_KEY) || sessionStorage.getItem(SESSION_USER_KEY);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      clearCachedUser();
      return null;
    }
  },
  login: function (email, password, remember) {
    return authRequest("/api/auth/login", "POST", {
      email: email,
      password: password,
      remember: !!remember
    }).then(function (result) {
      if (result.ok) cacheAuthenticatedUser(result.data.user, !!remember);
      return loginResult(result);
    }).catch(function () {
      return { ok: false, status: 0, message: "تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مجددًا." };
    });
  },
  transferSession: function (email, password, remember, transferToken) {
    return authRequest("/api/auth/login/transfer", "POST", {
      email: email,
      password: password,
      remember: !!remember,
      transferToken: transferToken
    }).then(function (result) {
      if (result.ok) {
        cacheAuthenticatedUser(result.data.user, !!remember);
        return { ok: true, user: result.data.user };
      }
      return {
        ok: false,
        status: result.status,
        error: result.data.error,
        message: result.data.message || "تعذر نقل الجلسة."
      };
    }).catch(function () {
      return { ok: false, status: 0, message: "تعذر الاتصال بالخادم. حاول مجددًا." };
    });
  },
  cancelSessionTransfer: function (transferToken) {
    return authRequest("/api/auth/login/cancel-transfer", "POST", { transferToken: transferToken })
      .then(function (result) { return result.ok && result.data.cancelled; })
      .catch(function (error) {
        console.error("Unable to cancel session transfer:", error);
        return false;
      });
  },
  register: function (name, email, password, confirmPassword, proof) {
    return authRequest("/api/auth/register", "POST", {
      name: name,
      email: email,
      password: password,
      confirmPassword: confirmPassword,
      proof: proof
    }).then(function (result) {
      return result.ok
        ? { ok: true, user: result.data.user, requestCode: result.data.requestCode, message: result.data.message }
        : { ok: false, status: result.status, error: result.data.error, message: result.data.message || "تعذر إنشاء الحساب." };
    });
  },
  subscriptionRequest: function (name, proof) {
    return authRequest("/api/auth/subscription-request", "POST", { name: name, proof: proof })
      .then(function (result) {
        return result.ok
          ? { ok: true, requestCode: result.data.requestCode, message: result.data.message }
          : { ok: false, status: result.status, error: result.data.error, message: result.data.message || "تعذر إرسال الطلب." };
      });
  },
  check: function () {
    return authRequest("/api/auth/me").then(function (result) {
      if (result.status === 401) {
        clearCachedUser();
        return null;
      }
      if (!result.ok) throw new Error(result.data.message || "تعذر التحقق من الحساب.");
      var remember = !!localStorage.getItem(AUTH_KEY);
      cacheAuthenticatedUser(result.data.user, remember);
      return result.data.user;
    });
  },
  expired: function () {
    clearCachedUser();
    window.location.replace("/login.html");
  },
  logout: function () {
    return authRequest("/api/auth/logout", "POST").then(function (result) {
      if (!result.ok) throw new Error(result.data.message || "تعذر تسجيل الخروج.");
      clearCachedUser();
      window.location.replace("/login.html");
      return true;
    }).catch(function (error) {
      console.error("Logout failed:", error);
      window.alert("تعذر تسجيل الخروج من الخادم. تحقق من اتصالك وحاول مجددًا.");
      return false;
    });
  },
  guard: function () {
    return Auth.isLoggedIn();
  },
  verify: function () {
    return Auth.check().then(function (user) {
      var pathname = window.location.pathname;
      var page = (pathname.split("/").pop() || "index.html").toLowerCase();
      var isExplore = pathname.startsWith("/explore/") || pathname === "/explore";
      var isOpen = isExplore || ["login.html", "register.html", "offline.html"].includes(page);

      if (!user) {
        if (!isOpen) {
          var target = window.location.pathname.replace(/^\/+/, "") + window.location.search;
          window.location.replace("/login.html?next=" + encodeURIComponent(target));
        }
        return null;
      }

      var hasSub = ["admin","super_admin","instructor","content_manager","analyst","support"].includes(user.role)
        || user.subscriptionStatus === "active";
      if (!hasSub && !isOpen && !["admin", "super_admin", "instructor"].includes(user.role)) {
        window.location.replace("/register.html");
        return null;
      }

      return user;
    });
  }
};

// تفعيل التحقق التلقائي والفوري من تسجيل الدخول والاشتراك للصفحات المحمية
(function () {
  var pathname = window.location.pathname;
  var page = (pathname.split("/").pop() || "index.html").toLowerCase();
  var isExplore = pathname.startsWith("/explore/") || pathname === "/explore";
  var isOpen = isExplore || ["login.html", "register.html", "offline.html"].includes(page);
  var isAdmin = pathname.startsWith("/admin");

  if (!isOpen && !isAdmin) {
    if (!Auth.isLoggedIn()) {
      var target = window.location.pathname.replace(/^\/+/, "") + window.location.search;
      window.location.replace("/login.html?next=" + encodeURIComponent(target));
      return;
    }
    Auth.verify();
  }
})();

var whatsappSupportScript = document.createElement("script");
whatsappSupportScript.src = "/js/whatsapp-support.js";
whatsappSupportScript.defer = true;
document.head.append(whatsappSupportScript);
