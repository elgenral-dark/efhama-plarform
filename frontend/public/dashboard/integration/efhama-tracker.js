/*
 * Efhama Tracker — يُضاف إلى الموقع التعليمي لإرسال أحداث حقيقية للوحة التحليلات.
 *
 *   <script src="/dashboard/integration/efhama-tracker.js"></script>
 *   <script>
 *     EfhamaTracker.init({ endpoint: '/api/track', studentId: '<id الطالب أو external_id>' });
 *     EfhamaTracker.lessonOpen(lessonId);        // عند فتح درس
 *     EfhamaTracker.lessonComplete(lessonId);    // عند إكماله
 *     EfhamaTracker.quizAttempt({quizId, score, passed, answers:[{questionId, correct}]});
 *     EfhamaTracker.bindVideos(document);        // يربط كل <video data-efhama-video="..."> تلقائيًا
 *   </script>
 *
 * الفيديو: لا يُحتسب فتح الصفحة مشاهدة. يُرسل التقدم فقط عند play/pause/ended/مغادرة الصفحة
 * وكل 20 ثانية مشاهدة فعلية، ويتم تجميع أحداث timeupdate محليًا (لا يُرسل حدث لكل timeupdate).
 */
(function (root) {
  'use strict';
  var cfg = null, queue = [], timer = null, sessionId = null, activeSec = 0, lastBeat = 0, view = null;
  var rid = function () { return (root.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); };

  function send(events, beacon) {
    if (!cfg || !events.length) return;
    var body = JSON.stringify({ events: events });
    if (beacon && navigator.sendBeacon) { navigator.sendBeacon(cfg.endpoint, new Blob([body], { type: 'text/plain' })); return; }
    fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true, credentials: 'omit' }).catch(function () {});
  }
  function push(ev) {
    ev.studentId = cfg.studentId; queue.push(ev);
    if (queue.length >= 20) flush(); else if (!timer) timer = setTimeout(flush, 3000);
  }
  function flush(beacon) { clearTimeout(timer); timer = null; var q = queue; queue = []; send(q, beacon); }

  var visible = function () { return document.visibilityState === 'visible'; };
  function tickActive() { if (visible()) activeSec++; }
  function heartbeat(type) {
    var d = activeSec - lastBeat; lastBeat = activeSec;
    push({ type: type || 'heartbeat', sessionId: sessionId, seconds: d });
  }
  function leaveView() { if (view) { push({ type: 'lesson_leave', viewId: view.id, seconds: activeSec - view.start }); view = null; } }

  var T = root.EfhamaTracker = {
    init: function (c) {
      if (cfg) return; cfg = { endpoint: c.endpoint || '/api/track', studentId: String(c.studentId || '') };
      if (!cfg.studentId) { cfg = null; return; }
      sessionId = rid();
      push({ type: 'session_start', sessionId: sessionId });
      setInterval(tickActive, 1000);
      setInterval(function () { if (visible()) heartbeat(); }, 30000);
      document.addEventListener('visibilitychange', function () { if (!visible()) { heartbeat(); flush(true); } });
      root.addEventListener('pagehide', function () { leaveView(); heartbeat('session_end'); flush(true); });
    },
    lessonOpen: function (lessonId) { if (!cfg) return; leaveView(); view = { id: rid(), start: activeSec }; push({ type: 'lesson_open', viewId: view.id, lessonId: lessonId }); },
    lessonLeave: leaveView,
    lessonComplete: function (lessonId) { if (cfg) push({ type: 'lesson_complete', lessonId: lessonId }); },
    quizAttempt: function (a) { if (cfg) push({ type: 'quiz_attempt', quizId: a.quizId, score: a.score, passed: !!a.passed, answers: a.answers || [] }); },
    flush: function () { flush(); },
    bindVideos: function (scope) {
      (scope || document).querySelectorAll('video[data-efhama-video]').forEach(function (v) {
        if (v.__efh) return; v.__efh = true;
        var id = v.getAttribute('data-efhama-video'), lessonId = v.getAttribute('data-efhama-lesson') || '';
        var watched = 0, lastT = null, sinceSend = 0;
        function report(state) {
          if (!cfg) return;
          var d = watched; watched = 0; sinceSend = 0;
          if (state !== 'play' && d <= 0 && state !== 'ended') { /* لا شيء جديد لكن نرسل نقطة التوقف */ }
          push({ type: 'video', videoId: id, lessonId: lessonId, state: state, duration: isFinite(v.duration) ? v.duration : 0, position: v.currentTime || 0, watched: Math.min(d, 120) });
        }
        v.addEventListener('play', function () { lastT = v.currentTime; report('play'); });
        v.addEventListener('timeupdate', function () {
          // تجميع محلي: نحتسب الزيادة الطبيعية فقط (تجاهل القفز/التقديم)
          if (lastT != null) { var dt = v.currentTime - lastT; if (dt > 0 && dt < 1.5) { watched += dt; sinceSend += dt; } }
          lastT = v.currentTime;
          if (sinceSend >= 20) report('play');
        });
        v.addEventListener('pause', function () { if (!v.ended) report('pause'); lastT = null; });
        v.addEventListener('ended', function () { report('ended'); lastT = null; });
        root.addEventListener('pagehide', function () { if (!v.paused && !v.ended) report('leave'); });
      });
    }
  };
})(window);
