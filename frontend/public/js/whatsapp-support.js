(() => {
  if (document.getElementById("efhama-whatsapp-support")) return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/css/whatsapp-support.css";
  document.head.append(stylesheet);

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith("en");
  const label = isEnglish ? "Contact technical support" : "تواصل مع الدعم الفني";
  const message = "مرحباً، أحتاج إلى المساعدة بخصوص منصة افهمها بسهولة.";
  const link = document.createElement("a");
  link.id = "efhama-whatsapp-support";
  link.className = "whatsapp-support-button";
  link.href = "https://wa.me/201287288506?text=" + encodeURIComponent(message);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", label);
  link.setAttribute("data-tooltip", label);

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 32 32");
  icon.setAttribute("width", "32");
  icon.setAttribute("height", "32");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const background = document.createElementNS("http://www.w3.org/2000/svg", "path");
  background.setAttribute("fill", "currentColor");
  background.setAttribute("d", "M16 3a12.7 12.7 0 0 0-10.9 19.2L3.5 29l7-1.8A12.7 12.7 0 1 0 16 3Z");
  icon.append(background);

  const handset = document.createElementNS("http://www.w3.org/2000/svg", "path");
  handset.setAttribute("fill", "#fff");
  handset.setAttribute("d", "M22.4 19.2c-.35-.18-2.08-1.03-2.4-1.15-.32-.12-.55-.18-.78.18-.23.35-.9 1.15-1.1 1.38-.2.23-.4.26-.75.09-.35-.18-1.48-.55-2.82-1.75-1.04-.93-1.75-2.08-1.95-2.43-.2-.35-.02-.55.15-.72.16-.16.35-.41.53-.61.17-.21.23-.35.35-.58.12-.23.06-.44-.03-.62-.09-.17-.78-1.88-1.07-2.58-.28-.68-.57-.59-.78-.6h-.67c-.24 0-.62.09-.94.44-.32.35-1.23 1.2-1.23 2.9s1.26 3.37 1.43 3.6c.18.23 2.48 3.78 6.02 5.3.84.36 1.5.58 2.02.74.85.27 1.63.23 2.24.14.68-.1 2.08-.85 2.37-1.67.29-.82.29-1.53.2-1.68-.09-.15-.32-.24-.67-.41Z");
  icon.append(handset);

  link.append(icon);
  document.body.append(link);
})();
