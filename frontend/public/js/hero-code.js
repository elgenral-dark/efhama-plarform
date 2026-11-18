/* ============================================================
   محاكي كتابة الكود التفاعلي في الهيرو — منصة افهمها
   ============================================================ */
(function () {
  function initializeHeroTypewriter() {
    const container = document.getElementById("heroCodeBody");
    if (!container) return;

    const codeData = [
      { ln: 1, tokens: [{ text: "# ", cls: "tok-comment" }, { text: "البرمجة تفكير وتطبيق مش مجرد سطور", cls: "tok-comment", isBdi: true }] },
      { ln: 2, tokens: [{ text: "def", cls: "tok-kw" }, { text: " " }, { text: "efhamha", cls: "tok-fn" }, { text: "(" }, { text: "concept", cls: "tok-param" }, { text: "):" }] },
      { ln: 3, tokens: [{ text: "  " }, { text: "skills", cls: "tok-var" }, { text: " = [" }, { text: '"Logic"', cls: "tok-str" }, { text: ", " }, { text: '"Python"', cls: "tok-str" }, { text: ", " }, { text: '"AI"', cls: "tok-str" }, { text: "]" }] },
      { ln: 4, tokens: [{ text: "  " }, { text: "if", cls: "tok-kw" }, { text: " " }, { text: "understand", cls: "tok-fn" }, { text: "(" }, { text: "concept", cls: "tok-param" }, { text: "):" }] },
      { ln: 5, tokens: [{ text: "    " }, { text: "return", cls: "tok-kw" }, { text: ' "' }, { text: "تفكير منطقي وحل مشكلات", cls: "tok-str", isBdi: true }, { text: '"', cls: "tok-str" }] },
      { ln: 6, tokens: [] },
      { ln: 7, tokens: [{ text: "print", cls: "tok-kw" }, { text: "(" }, { text: "efhamha", cls: "tok-fn" }, { text: "(" }, { text: '"Logic"', cls: "tok-str" }, { text: "))" }], active: true }
    ];

    const terminalText = "تفكير منطقي وحل مشكلات — النتيجة: إتقان حقيقي";

    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Render static code when reduced motion is preferred
      container.innerHTML = "";
      codeData.forEach(line => {
        const lineDiv = document.createElement("div");
        lineDiv.className = "code-line";
        const lnSpan = document.createElement("span");
        lnSpan.className = "code-ln";
        lnSpan.textContent = String(line.ln);
        const textDiv = document.createElement("div");
        textDiv.className = "code-text";
        line.tokens.forEach(tok => {
          const s = tok.isBdi ? document.createElement("bdi") : document.createElement("span");
          if (tok.cls) s.className = tok.cls;
          s.textContent = tok.text;
          textDiv.appendChild(s);
        });
        lineDiv.append(lnSpan, textDiv);
        container.appendChild(lineDiv);
      });
      return;
    }

    let activeTimeout = null;

    function runTypewriter() {
      container.innerHTML = "";

      const lineElements = codeData.map((line) => {
        const lineDiv = document.createElement("div");
        lineDiv.className = "code-line";

        const lnSpan = document.createElement("span");
        lnSpan.className = "code-ln";
        lnSpan.textContent = String(line.ln);

        const textDiv = document.createElement("div");
        textDiv.className = "code-text";

        lineDiv.append(lnSpan, textDiv);
        container.append(lineDiv);
        return { lineDiv, textDiv, lineData: line };
      });

      const terminalDiv = document.createElement("div");
      terminalDiv.className = "code-terminal";
      terminalDiv.innerHTML = `<span class="terminal-prompt">❯</span><span class="terminal-result"><bdi>${terminalText}</bdi></span>`;
      container.append(terminalDiv);

      const cursor = document.createElement("span");
      cursor.className = "type-cursor";

      let currentLineIndex = 0;
      let currentTokenIndex = 0;
      let currentCharIndex = 0;

      function typeNextChar() {
        if (currentLineIndex >= lineElements.length) {
          const lastLine = lineElements[lineElements.length - 1];
          if (lastLine) lastLine.lineDiv.classList.add("code-active");
          terminalDiv.classList.add("visible");

          activeTimeout = setTimeout(() => {
            container.style.transition = "opacity 0.4s ease";
            container.style.opacity = "0";
            setTimeout(() => {
              container.style.opacity = "1";
              runTypewriter();
            }, 450);
          }, 5000);
          return;
        }

        const { textDiv, lineData } = lineElements[currentLineIndex];

        if (!lineData.tokens || lineData.tokens.length === 0) {
          currentLineIndex++;
          activeTimeout = setTimeout(typeNextChar, 100);
          return;
        }

        const token = lineData.tokens[currentTokenIndex];

        if (!cursor.parentNode || cursor.parentNode !== textDiv) {
          textDiv.append(cursor);
        }

        let tokenSpan = textDiv.querySelector(`[data-tok="${currentTokenIndex}"]`);
        if (!tokenSpan) {
          tokenSpan = token.isBdi ? document.createElement("bdi") : document.createElement("span");
          if (token.cls) tokenSpan.className = token.cls;
          tokenSpan.dataset.tok = String(currentTokenIndex);
          cursor.before(tokenSpan);
        }

        tokenSpan.textContent += token.text[currentCharIndex];
        currentCharIndex++;

        if (currentCharIndex >= token.text.length) {
          currentTokenIndex++;
          currentCharIndex = 0;

          if (currentTokenIndex >= lineData.tokens.length) {
            currentLineIndex++;
            currentTokenIndex = 0;
            const linePause = currentLineIndex === 1 ? 400 : 180;
            activeTimeout = setTimeout(typeNextChar, linePause);
            return;
          }
        }

        const charSpeed = Math.floor(Math.random() * 25) + 20;
        activeTimeout = setTimeout(typeNextChar, charSpeed);
      }

      activeTimeout = setTimeout(typeNextChar, 500);
    }

    runTypewriter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHeroTypewriter);
  } else {
    initializeHeroTypewriter();
  }
})();
