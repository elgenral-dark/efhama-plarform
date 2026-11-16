/* المحاضر الذكي - افهمها
   يطلب شرحًا شفهيًا من الـ AI (لو متاح)، وإلا يقرأ نص الدرس الأصلي.
   الصوت كله من الخادم (/api/tts) بصوت واحد. لو فشل، الشرح يقف بوضوح من غير تبديل للصوت.
*/
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var play = $("lecturePlay");
  var pause = $("lecturePause");
  var stop = $("lectureStop");
  var status = $("lectureStatus");
  var speed = $("lectureSpeed");
  var body = $("lessonBody");

  var form = $("aiAskForm");
  var input = $("aiQuestion");
  var log = $("aiChatLog");
  var mic = $("aiMic");

  if (!play || !body) return;

  var FIRST_CHUNK_LENGTH = 320;  // أول جزء قصير شوية عشان الصوت يبدأ بسرعة
  var MAX_CHUNK_LENGTH = 900;    // أجزاء أطول = نبرة أطبع (السيرفر بيقبل لحد 1000 حرف)
  var PREFETCH_AHEAD = 1;        // جزء واحد مقدمًا (السيرفر بيعمل الطلبات واحد واحد)
  var FETCH_RETRIES = 3;         // إعادة المحاولة قبل ما الشرح يقف

  var queue = [];          // أجزاء النص
  var prepared = {};       // index -> Promise للجزء الجاهز
  var itemsReady = {};     // index -> { index, audio, url, started }
  var currentItem = null;
  var paused = false;
  var sessionId = 0;
  var lessonText = "";
  var lessonTitle = "الدرس الحالي";
  var recognition = null;
  var busy = false;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setPlaying(on) {
    if (play) play.disabled = on;
    if (pause) pause.disabled = !on;
    if (stop) stop.disabled = !on;
  }

  function currentSpeed() {
    return Number(speed && speed.value) || 1;
  }

  // بنحافظ على فواصل الفقرات (سطر جديد) عشان التقسيم والنطق يبقوا أطبع
  function refreshLessonText() {
    var titleElement = $("lessonTitle");
    lessonTitle = ((titleElement ? titleElement.textContent : document.title) || "").trim() || "الدرس الحالي";

    var raw = body.innerText || body.textContent || "";
    lessonText = raw
      .split(/\n+/)
      .map(function (line) { return line.replace(/\s+/g, " ").trim(); })
      .filter(Boolean)
      .join("\n");

    if (lessonText.length > 26000) lessonText = lessonText.slice(0, 26000);
  }

  // طلب شرح شفهي مترابط من الـ AI. لو فشل أو مش متاح بيرجع null ونقرأ النص الأصلي
  async function buildLectureText() {
    try {
      var res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          task: "lecture",
          lessonTitle: lessonTitle,
          lessonContent: lessonText.slice(0, 18000)
        })
      });
      var data = await res.json();
      if (!res.ok || !data.answer) return null;
      return data.answer;
    } catch (err) {
      return null;
    }
  }

  // تقسيم النص لأجزاء: الأولوية للفقرات، وبعدين الجمل، وبعدين الكلمات
  function splitSpeech(text) {
    var chunks = [];
    var current = "";

    function limit() {
      return chunks.length === 0 ? FIRST_CHUNK_LENGTH : MAX_CHUNK_LENGTH;
    }

    function flush() {
      if (current) {
        chunks.push(current);
        current = "";
      }
    }

    // إضافة قطعة (فقرة أو جملة) للجزء الحالي من غير ما نتعدى الحد
    function push(piece) {
      var candidate = current ? current + "\n" + piece : piece;
      if (candidate.length > limit() && current) {
        chunks.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }

    // كلام طويل جدًا بدون علامات ترقيم: نقسمه على حدود الكلمات
    function splitByWords(text) {
      flush();
      var part = "";
      text.split(/\s+/).forEach(function (word) {
        var candidate = part ? part + " " + word : word;
        if (candidate.length > limit() && part) {
          chunks.push(part);
          part = word;
        } else {
          part = candidate;
        }
      });
      if (part) current = part;
    }

    var paragraphs = text.split(/\n+/).map(function (p) { return p.trim(); }).filter(Boolean);

    paragraphs.forEach(function (paragraph) {
      if (paragraph.length <= limit()) {
        push(paragraph);
        return;
      }

      // الفقرة أطول من الحد: نقسمها على الجمل
      var sentences = paragraph.match(/[^.!؟?]+[.!؟?]*/g) || [paragraph];
      sentences.forEach(function (sentence) {
        sentence = sentence.trim();
        if (!sentence) return;

        if (sentence.length > limit()) {
          splitByWords(sentence);
        } else {
          push(sentence);
        }
      });
    });

    flush();
    return chunks;
  }

  function releaseItem(item) {
    if (!item) return;
    var audio = item.audio;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch (e) {}
      audio.removeAttribute("src");
    }
    if (item.url) {
      URL.revokeObjectURL(item.url);
      item.url = null;
    }
    if (currentItem === item) currentItem = null;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // تحميل الصوت من الخادم مع إعادة المحاولة بتأخير أطول
  function fetchAudio(text, attempt) {
    return fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ text: text })
    }).then(function (response) {
      if (response.status === 401) {
        var authError = new Error("unauthorized");
        authError.noRetry = true;
        throw authError;
      }
      if (!response.ok) throw new Error("tts " + response.status);
      return response.blob();
    }).then(function (blob) {
      if (!blob || !blob.size) throw new Error("empty audio");
      return blob;
    }).catch(function (err) {
      if (err.noRetry || attempt >= FETCH_RETRIES) throw err;
      return wait(2000 * (attempt + 1)).then(function () {
        return fetchAudio(text, attempt + 1);
      });
    });
  }

  // تجهيز جزء: تحميل الصوت + إنشاء عنصر Audio جاهز
  function prepare(id, index) {
    if (index >= queue.length) return Promise.resolve(null);
    if (prepared[index]) return prepared[index];

    prepared[index] = fetchAudio(queue[index], 0).then(function (blob) {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(blob);
        var audio = new Audio();
        audio.preload = "auto";
        if ("preservesPitch" in audio) audio.preservesPitch = true;
        var item = { index: index, audio: audio, url: url, started: false };
        var done = false;

        function ready() {
          if (done) return;
          done = true;
          audio.removeEventListener("canplay", ready);
          if (id !== sessionId) { releaseItem(item); resolve(null); return; }
          itemsReady[index] = item;
          resolve(item);
        }

        audio.addEventListener("canplay", ready);
        setTimeout(ready, 2000);  // احتياطي لو الحدث ما اتبعتش
        audio.src = url;
        audio.load();
      });
    }).catch(function (err) {
      delete prepared[index];  // نسمح بمحاولة تانية وقت التشغيل الفعلي
      throw err;
    });

    return prepared[index];
  }

  function stopAll() {
    Object.keys(itemsReady).forEach(function (k) { releaseItem(itemsReady[k]); });
    itemsReady = {};
    prepared = {};
    releaseItem(currentItem);
    currentItem = null;
  }

  function finish() {
    stopAll();
    paused = false;
    if (pause) pause.textContent = "Ⅱ إيقاف مؤقت";
    setPlaying(false);
    setStatus("انتهى شرح الدرس بالكامل. تقدر تسأل عن أي نقطة.");
  }

  // لو الصوت من الخادم فشل بعد كل المحاولات: نوقف بوضوح بدل ما نغيّر الصوت
  function stopOnTtsError(id) {
    if (id !== sessionId) return;
    stopAll();
    paused = false;
    if (pause) pause.textContent = "Ⅱ إيقاف مؤقت";
    setPlaying(false);
    setStatus("تعذر تحميل الصوت من الخادم، جرّب بعد دقيقة.");
  }

  // تشغيل عنصر جاهز (مرة واحدة بس لكل جزء)
  function startItem(id, item) {
    if (id !== sessionId || item.started) return;
    item.started = true;
    currentItem = item;
    var audio = item.audio;
    audio.playbackRate = currentSpeed();

    audio.onended = function () {
      if (id !== sessionId) return;
      delete itemsReady[item.index];
      releaseItem(item);
      playChunk(id, item.index + 1);  // الجزء الجاي يبدأ بعد ما الحالي يخلص تمامًا
    };

    audio.onerror = function () {
      if (id !== sessionId) return;
      delete itemsReady[item.index];
      releaseItem(item);
      stopOnTtsError(id);
    };

    if (!paused) {
      audio.play().catch(function () {
        if (id !== sessionId) return;
        delete itemsReady[item.index];
        releaseItem(item);
        stopOnTtsError(id);
      });
    }
  }

  // تشغيل جزء من الدرس
  function playChunk(id, index) {
    if (id !== sessionId) return;
    if (index >= queue.length) { finish(); return; }

    setStatus("المحاضر بيشرح الجزء " + (index + 1) + " من " + queue.length);

    if (itemsReady[index]) {
      startItem(id, itemsReady[index]);
    } else {
      prepare(id, index).then(function (item) {
        if (id !== sessionId || !item) return;
        startItem(id, item);
      }).catch(function () {
        stopOnTtsError(id);
      });
    }

    // تحميل مسبق للجزء الجاي (بعد ما الحالي يتجهز عشان ما نزاحمش الطلبات)
    for (var k = 1; k <= PREFETCH_AHEAD; k++) {
      prepare(id, index + k).catch(function () {});
    }
  }

  // زر التشغيل: بيجهز الشرح الشفهي من الـ AI، ولو فشل بيقرأ النص الأصلي
  play.addEventListener("click", async function () {
    refreshLessonText();

    if (!lessonText) {
      setStatus("محتوى الدرس لم يتم تحميله بعد.");
      return;
    }

    sessionId++;
    var thisSession = sessionId;

    stopAll();
    paused = false;
    setPlaying(true);
    setStatus("المحاضر بيجهز الشرح...");

    var lecture = await buildLectureText();
    if (thisSession !== sessionId) return; // المستخدم وقف قبل ما الشرح يجهز

    queue = splitSpeech(lecture || lessonText);
    if (pause) pause.textContent = "Ⅱ إيقاف مؤقت";
    setStatus("جاري تجهيز المحاضر...");

    playChunk(thisSession, 0);
  });

  // إيقاف مؤقت واستكمال
  if (pause) {
    pause.addEventListener("click", function () {
      if (!paused) {
        paused = true;
        if (currentItem) currentItem.audio.pause();
        pause.textContent = "▶ استكمال";
        setStatus("الشرح متوقف مؤقتًا.");
      } else {
        paused = false;
        if (currentItem) currentItem.audio.play().catch(function () {});
        pause.textContent = "Ⅱ إيقاف مؤقت";
        setStatus("تم استكمال الشرح...");
      }
    });
  }

  // إيقاف كامل
  if (stop) {
    stop.addEventListener("click", function () {
      sessionId++;
      stopAll();
      paused = false;
      queue = [];
      if (pause) pause.textContent = "Ⅱ إيقاف مؤقت";
      setPlaying(false);
      setStatus("تم إيقاف المحاضرة.");
    });
  }

  // تغيير السرعة أثناء التشغيل
  if (speed) {
    speed.addEventListener("change", function () {
      Object.keys(itemsReady).forEach(function (k) {
        itemsReady[k].audio.playbackRate = currentSpeed();
      });
      if (currentItem) currentItem.audio.playbackRate = currentSpeed();
    });
  }

  function addBubble(text, who, note) {
    if (!log) return null;
    var div = document.createElement("div");
    div.className = "ai-chat-bubble " + who;
    div.textContent = text;
    if (note) {
      var small = document.createElement("small");
      small.textContent = note;
      div.appendChild(small);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function normalize(text) {
    return (text || "").toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[ً-ْ]/g, "");
  }

  function localAnswer(question) {
    var words = normalize(question).split(/\s+/).filter(function (word) {
      return word.length > 2 &&
        !/^(ممكن|يعني|ازاي|كيف|ايه|اشرح|لي|من|في|عن|هذا|هذه|اللي|هو|هي)$/.test(word);
    });

    var sections = Array.prototype.slice.call(body.querySelectorAll(".ls-sec"));

    var candidates = sections.map(function (element) {
      var text = (element.innerText || "").trim();
      var haystack = normalize(text);
      var score = words.reduce(function (total, word) {
        return total + (haystack.indexOf(word) !== -1 ? 1 : 0);
      }, 0);
      return { text: text, score: score };
    }).filter(function (item) {
      return item.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    if (candidates.length) {
      return "خلينا نرجع لمحتوى الدرس:\n\n" +
        candidates.slice(0, 2).map(function (item) {
          return item.text.slice(0, 850);
        }).join("\n\n");
    }

    return "مش لاقي إجابة واضحة في محتوى الدرس الحالي. جرب تسأل بكلمات موجودة في المحاضرة.";
  }

  function answerQuestion(question) {
    refreshLessonText();

    var thinking = addBubble("ثواني، براجع محتوى الدرس...", "assistant");

    fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        task: "question",
        question: question,
        lessonTitle: lessonTitle,
        lessonContent: lessonText.slice(0, 18000)
      })
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.message || "تعذر الاتصال بالمساعد");
          return data;
        });
      })
      .then(function (data) {
        if (thinking) thinking.remove();
        var answer = data.answer || localAnswer(question);
        addBubble(answer, "assistant",
          data.mode === "ai" ? "إجابة من الذكاء الاصطناعي" : "إجابة من محتوى الدرس");
      })
      .catch(function () {
        if (thinking) thinking.remove();
        addBubble(localAnswer(question), "assistant", "الوضع المجاني المحلي");
      })
      .finally(function () {
        busy = false;
      });
  }

  if (form && input) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var question = input.value.trim();
      if (!question || busy) return;
      busy = true;
      addBubble(question, "user");
      input.value = "";
      answerQuestion(question);
    });
  }

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (mic && SpeechRecognition && form && input) {
    recognition = new SpeechRecognition();
    recognition.lang = "ar-EG";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {
      mic.classList.add("listening");
      mic.textContent = "⏺";
      mic.title = "جاري الاستماع";
    };
    recognition.onend = function () {
      mic.classList.remove("listening");
      mic.textContent = "🎙";
      mic.title = "اسأل بصوتك";
    };
    recognition.onerror = function () {
      setStatus("تأكد من السماح باستخدام الميكروفون.");
    };
    recognition.onresult = function (event) {
      input.value = event.results[0][0].transcript;
      form.requestSubmit();
    };

    mic.addEventListener("click", function () {
      try {
        recognition.start();
      } catch (error) {
        setStatus("الميكروفون يعمل بالفعل أو غير متاح.");
      }
    });
  } else if (mic) {
    mic.disabled = true;
    mic.title = "التعرف على الصوت غير مدعوم في هذا المتصفح";
  }

  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (body.children.length) refreshLessonText();
    }).observe(body, { childList: true, subtree: true });
  }

  window.addEventListener("beforeunload", function () {
    sessionId++;
    stopAll();
    if (recognition) {
      try { recognition.stop(); } catch (error) {}
    }
  });

  setPlaying(false);
  refreshLessonText();
})();