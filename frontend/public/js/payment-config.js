(function () {
  "use strict";

  var paymentPhone = "01287288506";
  window.EFHAMHA_PAYMENT_CONFIG = Object.freeze({
    paymentPhone: paymentPhone,
    whatsappPhone: paymentPhone.replace(/^0/, "20")
  });
})();
