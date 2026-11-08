var AUTH_KEY = "efhama_auth";
var USER_KEY = "efhama_user";

var Sync = {
  pull: function () { return Promise.resolve(false); },
  flush: function () { return Promise.resolve(); },
  wipe: function () {
    var keys = [];
    for (var index = 0; index < localStorage.length; index++) {
      var key = localStorage.key(index);
      if (/^efhama_(completed|started|last_lesson|quiz_results|quiz_best|mistakes)$/.test(key))
        keys.push(key);
    }
    keys.forEach(function (key) { localStorage.removeItem(key); });
  },
  hasPending: function () { return false; }
};

function authRequest(path, method, body) {
  return fetch("/api/auth/" + path, {
    method: method || "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(function (response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      return { response: response, data: data };
    });
  });
}

function saveAuthenticatedUser(user, remember) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (remember) {
    localStorage.setItem(AUTH_KEY, "1");
    sessionStorage.removeItem(AUTH_KEY);
  } else {
    sessionStorage.setItem(AUTH_KEY, "1");
    localStorage.removeItem(AUTH_KEY);
  }
}

function clearAuthenticatedUser() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

var pendingAuthCheck = null;
var Auth = {
  isLoggedIn: function () {
    return !!(localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY));
  },
  user: function () {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || "null");
    } catch (error) {
      clearAuthenticatedUser();
      return null;
    }
  },
  login: function (email, password, remember) {
    return authRequest("login", "POST", { email: email, password: password, remember: !!remember })
      .then(function (result) {
        var data = result.data;
        if (result.response.ok && data.user) {
          saveAuthenticatedUser(data.user, remember);
          return { ok: true, user: data.user };
        }
        return {
          ok: false,
          status: result.response.status,
          message: data.message || "تعذر تسجيل الدخول.",
          requiresTransfer: data.error === "active_session",
          transferToken: data.transferToken || null
        };
      })
      .catch(function () {
        return { ok: false, status: 0, message: "تعذر الاتصال بخدمة تسجيل الدخول." };
      });
  },
  transferSession: function (email, password, remember, transferToken) {
    return authRequest("login/transfer", "POST", {
      email: email, password: password, remember: !!remember, transferToken: transferToken
    }).then(function (result) {
      if (result.response.ok && result.data.user) {
        saveAuthenticatedUser(result.data.user, remember);
        return { ok: true, user: result.data.user };
      }
      return { ok: false, status: result.response.status, message: result.data.message || "تعذر نقل الجلسة." };
    }).catch(function () {
      return { ok: false, status: 0, message: "تعذر الاتصال بخدمة تسجيل الدخول." };
    });
  },
  cancelSessionTransfer: function (transferToken) {
    return authRequest("login/cancel-transfer", "POST", { transferToken: transferToken })
      .then(function (result) { return result.response.ok; });
  },
  register: function (name, email, password, confirmPassword, proof) {
    return authRequest("register", "POST", {
      name: name,
      email: email,
      password: password,
      confirmPassword: confirmPassword,
      proof: proof
    }).then(function (result) {
      return {
        ok: result.response.ok,
        status: result.response.status,
        user: result.data.user,
        requestCode: result.data.requestCode,
        message: result.data.message || "تعذر إرسال طلب التسجيل."
      };
    });
  },
  subscriptionRequest: function (name, proof) {
    return authRequest("subscription-request", "POST", { name: name, proof: proof })
      .then(function (result) {
        return {
          ok: result.response.ok,
          status: result.response.status,
          requestCode: result.data.requestCode,
          message: result.data.message || "تعذر إرسال طلب الاشتراك."
        };
      });
  },
  check: function () {
    if (pendingAuthCheck) return pendingAuthCheck;
    pendingAuthCheck = authRequest("me").then(function (result) {
      if (result.response.status === 401) {
        clearAuthenticatedUser();
        return null;
      }
      if (!result.response.ok) throw new Error(result.data.message || "تعذر التحقق من الحساب.");
      saveAuthenticatedUser(result.data.user, !!localStorage.getItem(AUTH_KEY));
      return result.data.user;
    }).finally(function () { pendingAuthCheck = null; });
    return pendingAuthCheck;
  },
  expired: clearAuthenticatedUser,
  logout: function () {
    return authRequest("logout", "POST").catch(function (error) {
      console.warn("Unable to notify the backend about logout:", error);
      return null;
    }).then(function () {
      clearAuthenticatedUser();
      window.location.replace("login.html");
    });
  },
  guard: function () { return Auth.isLoggedIn(); },
  verify: function () { return Auth.check(); }
};
