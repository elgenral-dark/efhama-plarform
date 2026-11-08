(function () {
  "use strict";

  var form = document.getElementById("registerForm");
  var alertBox = document.getElementById("registerAlert");
  var statusBox = document.getElementById("requestStatus");
  var statusTitle = document.getElementById("statusTitle");
  var statusMessage = document.getElementById("statusMessage");
  var statusRequest = document.getElementById("statusRequest");
  var rejectionReason = document.getElementById("rejectionReason");
  var nameInput = document.getElementById("fullName");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var confirmInput = document.getElementById("confirmPassword");
  var proofInput = document.getElementById("proof");
  var proofPreview = document.getElementById("proofPreview");
  var fileName = document.getElementById("fileName");
  var button = document.getElementById("registerBtn");
  var checkRequestButton = document.getElementById("checkRequestBtn");
  var buttonLabel = button.querySelector(".btn-label");
  var spinner = button.querySelector(".btn-spinner");
  var whatsapp = document.getElementById("whatsappLink");
  var paymentNumber = document.getElementById("paymentNumber");
  var copyPaymentNumber = document.getElementById("copyPaymentNumber");
  var paymentCopyStatus = document.getElementById("paymentCopyStatus");
  var paymentConfig = window.EFHAMA_PAYMENT_CONFIG;
  var authenticated = false;
  var initialRequest = null;
  var accountKnown = false;
  var maxFileSize = 5 * 1024 * 1024;
  var previewUrl = "";

  if (!paymentConfig) throw new Error("Payment contact settings are unavailable.");
  paymentNumber.textContent = paymentConfig.paymentPhone;

  copyPaymentNumber.addEventListener("click", async function () {
    var copied = false;
    try {
      await navigator.clipboard.writeText(paymentConfig.paymentPhone);
      copied = true;
    } catch (error) {
      var field = document.createElement("textarea");
      field.value = paymentConfig.paymentPhone;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        copied = document.execCommand("copy");
      } catch (copyError) {
        console.error("Unable to copy the payment phone number:", copyError);
      } finally {
        field.remove();
      }
    }
    paymentCopyStatus.textContent = copied ? "تم نسخ رقم الدفع." : "تعذر نسخ الرقم. يمكنك تحديده ونسخه يدويًا.";
  });

  function showError(message) {
    alertBox.textContent = message;
    alertBox.hidden = false;
  }

  function hideError() {
    alertBox.textContent = "";
    alertBox.hidden = true;
  }

  function setLoading(loading) {
    button.disabled = loading;
    spinner.hidden = !loading;
    buttonLabel.textContent = loading ? "جارٍ إرسال الطلب…" : "إرسال طلب الاشتراك";
  }

  function setWhatsapp(code) {
    if (!code) {
      whatsapp.hidden = true;
      return;
    }
    var message = [
      "مرحبًا، أرسلت طلب اشتراك على منصة افهمها.",
      "الاسم: " + nameInput.value.trim(),
      "البريد الإلكتروني: " + emailInput.value.trim(),
      "رقم الطلب: " + code,
      "قيمة الاشتراك: 100 EGP",
      "سأرفق صورة التحويل في هذه المحادثة."
    ].join("\n");
    whatsapp.href = "https://wa.me/" + paymentConfig.whatsappPhone + "?text=" + encodeURIComponent(message);
    whatsapp.hidden = false;
  }

  function showStatus(state, request) {
    statusBox.hidden = false;
    rejectionReason.hidden = true;
    if (request && request.request_code) {
      statusRequest.textContent = "رقم الطلب: " + request.request_code;
      setWhatsapp(request.request_code);
    } else {
      statusRequest.textContent = "";
      setWhatsapp(null);
    }

    if (state === "pending") {
      statusTitle.textContent = "طلبك قيد المراجعة";
      statusMessage.textContent = "تم استلام الطلب وإثبات الدفع. سيظل محتوى المنصة غير متاح حتى موافقة الإدارة.";
      form.hidden = true;
    } else if (state === "rejected") {
      statusTitle.textContent = "نحتاج إلى إثبات جديد";
      statusMessage.textContent = "تم رفض الطلب السابق. راجع السبب أدناه، ثم ارفع إثباتًا جديدًا لإعادة الإرسال.";
      if (request && request.rejection_reason) {
        rejectionReason.textContent = "سبب الرفض: " + request.rejection_reason;
        rejectionReason.hidden = false;
      }
      form.hidden = false;
    } else if (state === "approved") {
      statusTitle.textContent = "حسابك معتمد";
      statusMessage.textContent = "يمكنك تسجيل الدخول لمتابعة اشتراكك والوصول إلى المنصة.";
      form.hidden = true;
    } else {
      statusTitle.textContent = "الاشتراك غير نشط";
      statusMessage.textContent = "أرسل إثبات الدفع لبدء مراجعة اشتراكك السنوي.";
      form.hidden = false;
    }
  }

  function setAccountFields(user) {
    authenticated = true;
    accountKnown = true;
    hideError();
    nameInput.value = user.name || "";
    emailInput.value = user.email || "";
    document.getElementById("emailField").hidden = true;
    document.getElementById("passwordField").hidden = true;
    document.getElementById("confirmField").hidden = true;
    document.getElementById("rememberRow").hidden = true;
    checkRequestButton.hidden = true;
    passwordInput.required = false;
    confirmInput.required = false;
  }

  function imageData(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("تعذرت قراءة الصورة من جهازك.")); };
      reader.readAsDataURL(file);
    });
  }

  proofInput.addEventListener("change", function () {
    hideError();
    var file = proofInput.files && proofInput.files[0];
    if (!file) {
      fileName.textContent = "لم يتم اختيار صورة";
      proofPreview.hidden = true;
      proofPreview.removeAttribute("src");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      return;
    }
    fileName.textContent = file.name;
    if (file.size > maxFileSize) {
      proofInput.value = "";
      fileName.textContent = "لم يتم اختيار صورة";
      proofPreview.hidden = true;
      showError("حجم الصورة يتجاوز 5 ميجابايت.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      proofInput.value = "";
      fileName.textContent = "لم يتم اختيار صورة";
      proofPreview.hidden = true;
      showError("نوع الصورة غير مدعوم. اختر PNG أو JPEG أو WebP.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    proofPreview.src = previewUrl;
    proofPreview.hidden = false;
  });

  checkRequestButton.addEventListener("click", function () {
    hideError();
    var email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return showError("أدخل بريدًا إلكترونيًا صحيحًا.");
    if (!passwordInput.value)
      return showError("أدخل كلمة المرور لعرض حالة الطلب بأمان.");

    checkRequestButton.disabled = true;
    checkRequestButton.textContent = "جارٍ التحقق…";
    fetch("/api/auth/subscription-status", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: passwordInput.value })
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.message || "تعذر التحقق من بيانات الحساب.");
        return data;
      });
    }).then(function (data) {
      if (data.user && data.user.name) nameInput.value = data.user.name;
      if (data.user && data.user.email) emailInput.value = data.user.email;
      showStatus(data.status, data.request);
    }).catch(function (error) {
      showError(error && error.message ? error.message : "تعذر الاتصال بالخادم.");
    }).then(function () {
      checkRequestButton.disabled = false;
      checkRequestButton.textContent = "عرض حالة طلب سابق";
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    hideError();
    if (button.disabled) return;
    var name = nameInput.value.trim();
    var proofFile = proofInput.files && proofInput.files[0];
    if (name.length < 2) return showError("أدخل الاسم الكامل.");
    if (!authenticated) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim()))
        return showError("أدخل بريدًا إلكترونيًا صحيحًا.");
      if (passwordInput.value.length < 8) return showError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      if (passwordInput.value !== confirmInput.value) return showError("كلمتا المرور غير متطابقتين.");
    }
    if (!proofFile) return showError("ارفع صورة إثبات التحويل أولًا.");
    if (proofFile.size > maxFileSize) return showError("حجم الصورة يتجاوز 5 ميجابايت.");

    setLoading(true);
    imageData(proofFile).then(function (proof) {
      if (authenticated) return Auth.subscriptionRequest(name, proof);
      return Auth.register(name, emailInput.value, passwordInput.value, confirmInput.value, proof,
        document.getElementById("remember").checked);
    }).then(function (result) {
      if (!result || !result.ok) {
        showError(result && result.message ? result.message : "تعذر إرسال الطلب.");
        setLoading(false);
        return;
      }
      var code = result.requestCode || "";
      statusBox.hidden = false;
      statusTitle.textContent = "تم إرسال طلب الاشتراك";
      statusMessage.textContent = "طلبك الآن قيد المراجعة. لن يتاح محتوى المنصة قبل موافقة الإدارة.";
      statusRequest.textContent = code ? "رقم الطلب: " + code : "";
      form.hidden = true;
      setWhatsapp(code);
      setLoading(false);
    }).catch(function (error) {
      showError(error && error.message ? error.message : "تعذر قراءة أو إرسال صورة الإثبات.");
      setLoading(false);
    });
  });

  /* تم تعطيل طلبات التحقق من الخادم لتشغيل الصفحة بدون باك اند */
  var user = Auth.user();
  if (user && user.email) {
    accountKnown = true;
    setAccountFields(user);
  }
})();
