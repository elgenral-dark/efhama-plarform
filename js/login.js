/* منطق صفحة تسجيل الدخول — تحقق، تحميل، إظهار/إخفاء، Enter، منع التكرار */
(function () {
  "use strict";

  var form     = document.getElementById("loginForm");
  var email    = document.getElementById("email");
  var pass     = document.getElementById("password");
  var remember = document.getElementById("remember");
  var btn      = document.getElementById("loginBtn");
  var label    = btn.querySelector(".btn-label");
  var spinner  = btn.querySelector(".btn-spinner");
  var errBox   = document.getElementById("loginError");
  var errText  = document.getElementById("loginErrorText");
  var emailErr = document.getElementById("emailError");
  var passErr  = document.getElementById("passwordError");
  var toggle   = document.getElementById("togglePass");
  var transferDialog = document.getElementById("sessionTransferDialog");
  var confirmTransfer = document.getElementById("confirmSessionTransfer");
  var cancelTransferButton = document.getElementById("cancelSessionTransfer");
  var transferToken = null;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setLoading(on) {
    btn.disabled = on;
    spinner.hidden = !on;
    label.textContent = on ? "جارٍ التحقق…" : "تسجيل الدخول";
  }
  function fieldError(el, msg) {
    if (msg) { el.textContent = msg; }
    el.hidden = false;
  }
  function clearErrors() {
    errBox.hidden = true;
    emailErr.hidden = true;
    passErr.hidden = true;
  }

  /* إظهار/إخفاء كلمة المرور */
  toggle.addEventListener("click", function () {
    var show = pass.type === "password";
    pass.type = show ? "text" : "password";
    toggle.classList.toggle("show", show);
    toggle.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    pass.focus();
  });

  /* مسح الخطأ عند الكتابة */
  email.addEventListener("input", function () { emailErr.hidden = true; errBox.hidden = true; });
  pass.addEventListener("input", function () { passErr.hidden = true; errBox.hidden = true; });

  function showLoginError(message) {
    errText.textContent = message;
    errBox.hidden = false;
  }

  function finishLogin(result) {
    if (result.ok) {
      label.textContent = "تم التحقق — جارٍ التحويل…";
      var nextParam = new URLSearchParams(location.search).get("next");
      var defaultTarget = result.user.role === "admin" ? "admin-subscriptions.html" : "index.html";
      window.location.replace(nextParam ? decodeURIComponent(nextParam) : defaultTarget);
      return;
    }
    setLoading(false);
    showLoginError(result.message);
    if (result.status !== 409) {
      pass.value = "";
      pass.focus();
    }
  }

  function cancelTransferPrompt() {
    var pendingToken = transferToken;
    transferToken = null;
    if (transferDialog.open) transferDialog.close();
    confirmTransfer.disabled = false;
    cancelTransferButton.disabled = false;
    setLoading(false);
    if (pendingToken) Auth.cancelSessionTransfer(pendingToken);
    showLoginError("تم إلغاء تسجيل الدخول على هذا الجهاز. ما زالت الجلسة القديمة فعّالة.");
  }

  cancelTransferButton.addEventListener("click", cancelTransferPrompt);
  transferDialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    cancelTransferPrompt();
  });
  confirmTransfer.addEventListener("click", function () {
    if (!transferToken || confirmTransfer.disabled) return;
    var pendingToken = transferToken;
    transferToken = null;
    confirmTransfer.disabled = true;
    cancelTransferButton.disabled = true;
    confirmTransfer.textContent = "جارٍ نقل الجلسة…";
    Auth.transferSession(email.value, pass.value, remember.checked, pendingToken).then(function (result) {
      transferDialog.close();
      confirmTransfer.disabled = false;
      cancelTransferButton.disabled = false;
      confirmTransfer.textContent = "نعم، تسجيل الخروج من الجهاز الآخر والدخول من الجهاز الحالي";
      finishLogin(result);
    });
  });

  /* التحقق من الحقول */
  function validate() {
    var ok = true;
    var em = email.value.trim();
    if (!em) { fieldError(emailErr, "أدخل البريد الإلكتروني."); ok = false; }
    else if (!EMAIL_RE.test(em)) { fieldError(emailErr, "صيغة البريد الإلكتروني غير صحيحة."); ok = false; }
    if (!pass.value) { fieldError(passErr, "أدخل كلمة المرور."); ok = false; }
    return ok;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (btn.disabled) return; /* منع الضغط المتكرر أثناء المعالجة */

    errBox.hidden = true;
    if (!validate()) return;

    setLoading(true);
    Auth.login(email.value, pass.value, remember.checked).then(function (res) {
      if (res.requiresTransfer) {
        setLoading(false);
        transferToken = res.transferToken;
        document.getElementById("sessionTransferMessage").textContent = res.message;
        transferDialog.showModal();
        confirmTransfer.focus();
        return;
      }
      finishLogin(res);
    });
  });
})();
