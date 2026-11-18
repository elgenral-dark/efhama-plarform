const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:8787';
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(x)]);
class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, headers = {}) {
    const h = Object.assign({ 'X-Requested-With': 'efhama' }, headers);
    if (this.cookie) h.cookie = this.cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie && r.headers.getSetCookie()[0]; if (sc) this.cookie = sc.split(';')[0];
    let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (e) { j = t; }
    return { status: r.status, body: j };
  }
  login(u, p) { return this.req('POST', '/api/login', { username: u, password: p }); }
}
(async () => {
  const admin = new Client();
  ok('admin login', (await admin.login('admin', 'test-pass-1234')).status === 200);
  ok('wrong password 401', (await new Client().login('admin', 'nope-nope-nope')).status === 401);
  // users
  const mk = async (u, role, extra = {}) => (await admin.req('POST', '/api/users', Object.assign({ username: u, displayName: 'مستخدم ' + u, role, password: 'Passw0rd-' + u }, extra))).status;
  ok('create users', [await mk('cmgr', 'content_manager'), await mk('inst', 'instructor'), await mk('anal', 'analyst'), await mk('supp', 'support'), await mk('cmgr2', 'content_manager', { sections: ['lessons'] })].every(s => s === 200));
  ok('weak password rejected', (await admin.req('POST', '/api/users', { username: 'weak', displayName: 'ضعيف', role: 'analyst', password: '123' })).status === 422);
  const cm = new Client(), ins = new Client(), ana = new Client(), sup = new Client(), cm2 = new Client();
  await cm.login('cmgr', 'Passw0rd-cmgr'); await ins.login('inst', 'Passw0rd-inst'); await ana.login('anal', 'Passw0rd-anal'); await sup.login('supp', 'Passw0rd-supp'); await cm2.login('cmgr2', 'Passw0rd-cmgr2');

  // --- content as admin
  let data = (await admin.req('GET', '/api/data')).body;
  const rev0 = data.rev;
  data.modules.push({ id: 'm_t', pathId: 'p_python', title: 'وحدة الاختبار', description: '', order: 1 });
  data.lessons.push(
    { id: 'l_a', moduleId: 'm_t', title: 'درس أ', summary: '', level: 'beginner', duration: 5, status: 'published', objectives: [], prerequisites: [], order: 1, blocks: [{ id: 'vid1', type: 'video', title: 'فيديو الدرس', src: '/uploads/t.webm' }] },
    { id: 'l_b', moduleId: 'm_t', title: 'درس ب', summary: '', level: 'beginner', duration: 5, status: 'published', objectives: [], prerequisites: [], order: 2, blocks: [] });
  data.questions.push({ id: 'q_1', type: 'mcq', text: 'سؤال 1', options: ['أ', 'ب'], answer: 1, explanation: '', hints: [], difficulty: 'easy', points: 1, pathId: 'p_python', moduleId: 'm_t', lessonId: 'l_a' },
    { id: 'q_2', type: 'tf', text: 'سؤال 2', options: [], answer: 'true', explanation: '', hints: [], difficulty: 'easy', points: 1, pathId: 'p_python', moduleId: 'm_t', lessonId: 'l_a' });
  data.quizzes.push({ id: 'z_1', title: 'اختبار 1', pathId: 'p_python', moduleId: 'm_t', questionIds: ['q_1', 'q_2'], duration: 0, passScore: 60, attempts: 3, shuffle: 'fixed', status: 'published' });
  let r = await admin.req('PUT', '/api/data', data);
  ok('admin saves content (+ audit)', r.status === 200 && r.body.logged >= 5, JSON.stringify(r.body));

  // --- permissions on data
  const tryPut = async (c, mut) => { const d = (await c.req('GET', '/api/data')).body; mut(d); return (await c.req('PUT', '/api/data', d)).status; };
  ok('support cannot edit lessons (403)', (await tryPut(sup, d => { d.lessons[0].title = 'hack'; })) === 403);
  ok('analyst cannot edit paths (403)', (await tryPut(ana, d => { d.paths[0].name = 'hack'; })) === 403);
  ok('instructor cannot add path (403)', (await tryPut(ins, d => { d.paths.push({ id: 'p_x', name: 'X', order: 9, visible: true }); })) === 403);
  ok('instructor can edit lesson (200)', (await tryPut(ins, d => { d.lessons.find(l => l.id === 'l_b').title = 'درس ب (معدل)'; })) === 200);
  ok('content manager cannot edit settings (403)', (await tryPut(cm, d => { d.settings.name = 'Hacked'; })) === 403);
  ok('content manager can add path (200)', (await tryPut(cm, d => { d.paths.push({ id: 'p_cm', name: 'مسار cm', description: '', order: 7, visible: true }); })) === 200);
  ok('restricted cm2 (lessons only) cannot add path (403)', (await tryPut(cm2, d => { d.paths.push({ id: 'p_cm2', name: 'x', order: 8, visible: true }); })) === 403);
  ok('restricted cm2 nav perms limited', Object.keys((await cm2.req('GET', '/api/me')).body.perms.sections).join() === 'lessons');
  ok('stale rev rejected (409)', (await (async () => { const d = (await admin.req('GET', '/api/data')).body; d.rev = 0; return (await admin.req('PUT', '/api/data', d)).status; })()) === 409);
  ok('CSRF header required', (await fetch(BASE + '/api/logout', { method: 'POST' })).status === 403);

  // other section perms
  ok('analyst: students 403', (await ana.req('GET', '/api/students')).status === 403);
  ok('analyst: logs 403', (await ana.req('GET', '/api/logs')).status === 403);
  ok('analyst: analytics 200', (await ana.req('GET', '/api/analytics')).status === 200);
  ok('support: subscription 403', (await sup.req('GET', '/api/subscription')).status === 403);
  ok('support: users 403', (await sup.req('GET', '/api/users')).status === 403);
  ok('cm: students 403', (await cm.req('GET', '/api/students')).status === 403);
  ok('cm: analytics 403', (await cm.req('GET', '/api/analytics')).status === 403);
  ok('unauthenticated: data 401', (await new Client().req('GET', '/api/data')).status === 401);

  // --- subscription
  ok('subscription needs confirmation', (await admin.req('PUT', '/api/subscription', { price: 100 })).status === 422);
  ok('invalid whatsapp rejected', (await admin.req('PUT', '/api/subscription', { confirmed: true, price: 100, whatsapp: 'abc' })).status === 422);
  ok('cm cannot change price (403)', (await cm.req('PUT', '/api/subscription', { confirmed: true, price: 1 })).status === 403);
  r = await admin.req('PUT', '/api/subscription', { confirmed: true, price: 199.5, currencyLabel: 'جنيه / شهريًا', cashNumber: '01011112222', whatsapp: '+201001234567' });
  ok('admin updates subscription', r.status === 200 && r.body.changed.length === 4, JSON.stringify(r.body));
  let pub = await (await fetch(BASE + '/public/efhama-data.json')).json();
  ok('subscription reflected in public JSON (central source)', pub.subscription.price === 199.5 && pub.subscription.cashNumber === '01011112222' && pub.subscription.whatsapp === '+201001234567');
  await admin.req('PUT', '/api/subscription', { confirmed: true, price: 199.5, currencyLabel: 'جنيه / شهريًا', cashNumber: '01011112222', whatsapp: '+201009998888' });
  pub = await (await fetch(BASE + '/public/efhama-data.json')).json();
  ok('whatsapp change reflected', pub.subscription.whatsapp === '+201009998888');
  ok('no subscription data hardcoded in dashboard/ site files', !/01011112222|199\.5/.test(fs.readFileSync(require('path').join(__dirname, '../preview/site-preview.js'), 'utf8')));

  // --- AI
  r = await admin.req('GET', '/api/ai/settings');
  ok('AI settings: key configured, model empty', r.body.keyConfigured === true && r.body.model === '');
  const raw = 'المتغير هو اسم يخزن قيمة في الذاكرة.\n```python\nx = 5\nprint(x)\n```\nيمكنك تغيير القيمة لاحقًا في البرنامج. هذا نص كافٍ لتجاوز الحد الأدنى للطول المطلوب.';
  ok('AI organize without model -> 503 (no fake output)', (await cm.req('POST', '/api/ai/organize', { text: raw, meta: { title: 'متغيرات' } })).status === 503);
  ok('cm cannot edit AI technical settings', (await cm.req('PUT', '/api/ai/settings', { provider: 'openai', model: 'x', baseUrl: '', maxChars: 40000 })).status === 403);
  ok('http non-localhost baseUrl rejected', (await admin.req('PUT', '/api/ai/settings', { provider: 'openai', model: 'm', baseUrl: 'http://evil.example.com', maxChars: 40000 })).status === 422);
  ok('admin sets provider (switchable w/o rebuild)', (await admin.req('PUT', '/api/ai/settings', { provider: 'openai', model: 'test-model', baseUrl: 'http://localhost:9999', maxChars: 40000 })).status === 200);
  r = await cm.req('POST', '/api/ai/organize', { text: raw, meta: { title: 'متغيرات', pathName: 'Python', moduleTitle: 'وحدة', level: 'beginner', duration: 10 } });
  ok('AI organize via server works', r.status === 200 && r.body.result.blocks.length === 5, JSON.stringify(r.body).slice(0, 200));
  if (r.status === 200) {
    const b = r.body.result.blocks;
    ok('AI output sanitized: unknown block type dropped', !b.some(x => x.type === 'script'));
    ok('AI output sanitized: bad tone normalized', b.find(x => x.type === 'note').tone === 'info');
    ok('AI generated blocks flagged', b.filter(x => x.ai).length === 1);
    ok('AI invalid review question dropped (answer out of range)', r.body.result.review.length === 2);
    ok('fidelity check reports coverage + code kept', r.body.fidelity.missingCodeBlocks === 0 && r.body.fidelity.coverage > 0);
    ok('AI key never in response', !JSON.stringify(r.body).includes('test-key'));
  }
  ok('AI bad JSON -> 502', (await cm.req('POST', '/api/ai/organize', { text: raw + ' BADJSON', meta: {} })).status === 502);
  ok('AI short text -> 422', (await cm.req('POST', '/api/ai/organize', { text: 'قصير', meta: {} })).status === 422);
  ok('analyst cannot use AI (403)', (await ana.req('POST', '/api/ai/organize', { text: raw, meta: {} })).status === 403);
  // AI publish gate (server-side)
  const gate = async reviewed => { const d = (await admin.req('GET', '/api/data')).body; d.lessons.push({ id: 'l_ai' + (reviewed ? 'r' : 'u'), moduleId: 'm_t', title: 'درس AI', status: 'published', objectives: [], prerequisites: [], order: 5, blocks: [{ id: 'b1', type: 'paragraph', text: 'x' }], aiMeta: { generated: true, reviewed } }); return (await admin.req('PUT', '/api/data', d)).status; };
  ok('server refuses publishing unreviewed AI lesson (422)', (await gate(false)) === 422);
  ok('server accepts after explicit review flag', (await gate(true)) === 200);

  // --- students
  r = await sup.req('POST', '/api/students', { name: 'أحمد علي', email: 'ahmed@example.com', phone: '01000000001', subStatus: 'active', subStart: '2026-11-01', subEnd: '2027-02-01', pathIds: ['p_python'], externalId: 'ext-1' });
  ok('support adds student', r.status === 200); const sid = r.body.id;
  ok('duplicate email rejected', (await sup.req('POST', '/api/students', { name: 'آخر', email: 'AHMED@example.com' })).status === 422);
  ok('invalid email rejected', (await sup.req('POST', '/api/students', { name: 'آخر', email: 'bad' })).status === 422);
  ok('support edits student', (await sup.req('PUT', '/api/students/' + sid, { name: 'أحمد علي محمد' })).status === 200);
  ok('support sees phone (students.contact)', (await sup.req('GET', '/api/students/' + sid)).body.student.phone === '01000000001');
  await admin.req('POST', '/api/students', { name: 'سارة', email: 'sara@example.com', pathIds: ['p_python'], externalId: 'ext-2' });
  const sid2 = (await sup.req('GET', '/api/students?q=سارة')).body.items[0].id;

  // --- tracking
  const T = async (events) => (await fetch(BASE + '/api/track', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ events }) })).json();
  const ev = (e) => Object.assign({ studentId: String(sid) }, e);
  let t = await T([ev({ type: 'session_start', sessionId: 's1' }), ev({ type: 'heartbeat', sessionId: 's1', seconds: 30 }), ev({ type: 'heartbeat', sessionId: 's1', seconds: 30 }),
    ev({ type: 'lesson_open', viewId: 'v1', lessonId: 'l_a' }), ev({ type: 'lesson_leave', viewId: 'v1', seconds: 120 }),
    ev({ type: 'video', videoId: 'vid1', lessonId: 'l_a', state: 'pause', duration: 100, position: 40, watched: 0 }),  // لا مشاهدة قبل play
    ev({ type: 'video', videoId: 'vid1', lessonId: 'l_a', state: 'play', duration: 100, position: 0, watched: 0 }),
    ev({ type: 'video', videoId: 'vid1', lessonId: 'l_a', state: 'pause', duration: 100, position: 40, watched: 40 }),
    ev({ type: 'video', videoId: 'vid1', lessonId: 'l_a', state: 'ended', duration: 100, position: 100, watched: 55 }),
    ev({ type: 'lesson_complete', lessonId: 'l_a' }), ev({ type: 'lesson_complete', lessonId: 'l_a' }),
    ev({ type: 'quiz_attempt', quizId: 'z_1', score: 50, passed: false, answers: [{ questionId: 'q_1', correct: false }, { questionId: 'q_2', correct: true }] }),
    { type: 'session_start', sessionId: 'sx', studentId: '99999' }, ev({ type: 'bogus' })]);
  ok('track accepted/ignored counts', t.accepted === 11 && t.ignored === 3, JSON.stringify(t));
  // second student
  t = await T([{ studentId: 'ext-2', type: 'session_start', sessionId: 's2' }, { studentId: 'ext-2', type: 'lesson_open', viewId: 'v2', lessonId: 'l_a' },
    { studentId: 'ext-2', type: 'video', videoId: 'vid1', lessonId: 'l_a', state: 'play', duration: 100, position: 0, watched: 0 },
    { studentId: 'ext-2', type: 'video', videoId: 'vid1', lessonId: 'l_a', state: 'pause', duration: 100, position: 20, watched: 20 },
    { studentId: 'ext-2', type: 'quiz_attempt', quizId: 'z_1', score: 90, passed: true, answers: [{ questionId: 'q_1', correct: true }, { questionId: 'q_2', correct: true }] }]);
  ok('second student events via external id', t.accepted === 5, JSON.stringify(t));
  // suspended student ignored
  await sup.req('PUT', '/api/students/' + sid2, { status: 'suspended' });
  ok('suspended student events ignored', (await T([{ studentId: 'ext-2', type: 'session_start', sessionId: 's9' }])).accepted === 0);
  ok('cm cannot suspend (no students access) / analyst cannot', (await ana.req('PUT', '/api/students/' + sid2, { status: 'active' })).status === 403);
  await sup.req('PUT', '/api/students/' + sid2, { status: 'active' });

  // --- certificates
  r = await sup.req('POST', `/api/students/${sid}/certificates`, { pathId: 'p_python' });
  ok('certificate blocked until path conditions met (422 + reasons)', r.status === 422 && r.body.reasons.length > 0, JSON.stringify(r.body));
  await T([ev({ type: 'lesson_complete', lessonId: 'l_b' })]);
  // l_ai* lessons are in the module too (published) -> must complete them as well
  const lessons = (await admin.req('GET', '/api/data')).body.lessons.filter(l => l.moduleId === 'm_t' && l.status === 'published');
  await T(lessons.map(l => ev({ type: 'lesson_complete', lessonId: l.id })));
  await T([ev({ type: 'quiz_attempt', quizId: 'z_1', score: 100, passed: true, answers: [{ questionId: 'q_1', correct: true }, { questionId: 'q_2', correct: true }] })]);
  r = await sup.req('POST', `/api/students/${sid}/certificates`, { pathId: 'p_python' });
  ok('certificate issued after conditions met', r.status === 200 && /^EFH-\d{4}-/.test(r.body.number), JSON.stringify(r.body));
  const num = r.body.number;
  ok('duplicate valid certificate -> 409', (await sup.req('POST', `/api/students/${sid}/certificates`, { pathId: 'p_python' })).status === 409);
  const v = await (await fetch(BASE + '/api/verify/' + num)).json();
  ok('public verification (valid) minimal data', v.found && v.status === 'valid' && v.studentName === 'أحمد علي محمد' && !('email' in v) && !('phone' in v) && !('studentId' in v), JSON.stringify(v));
  const vp = await (await fetch(BASE + '/verify/' + num)).text();
  ok('verify page shows name & no email', vp.includes('شهادة صحيحة') && vp.includes('أحمد علي محمد') && !vp.includes('ahmed@example.com'));
  const cp = await fetch(BASE + '/certificate/' + num); const cph = await cp.text();
  ok('certificate page: name, path, number, verify link, platform', cph.includes('أحمد علي محمد') && cph.includes('Python') && cph.includes(num) && cph.includes('/verify/' + num) && cph.includes('Efhama'));
  ok('certificate frameable only same-origin', cp.headers.get('x-frame-options') === 'SAMEORIGIN');
  ok('fake certificate number -> not found', (await (await fetch(BASE + '/api/verify/EFH-2026-AAAAA-BBBBB')).json()).found === false);
  ok('support cannot revoke (403)', (await sup.req('POST', `/api/certificates/${num}/revoke`, { reason: 'x' })).status === 403);
  r = await sup.req('POST', `/api/certificates/${num}/reissue`, { reason: 'تصحيح الاسم' });
  ok('support reissues certificate', r.status === 200 && r.body.number !== num); const num2 = r.body.number;
  const old = await (await fetch(BASE + '/api/verify/' + num)).json();
  ok('old certificate marked replaced', old.status === 'replaced' && old.replacedBy === num2 && !old.studentName);
  ok('revoke requires reason', (await admin.req('POST', `/api/certificates/${num2}/revoke`, {})).status === 422);
  ok('admin revokes', (await admin.req('POST', `/api/certificates/${num2}/revoke`, { reason: 'اختبار' })).status === 200);
  const rv = await (await fetch(BASE + '/api/verify/' + num2)).json();
  ok('revoked verification hides student name', rv.status === 'revoked' && !rv.studentName);
  const prof = (await sup.req('GET', '/api/students/' + sid)).body;
  ok('profile lists all certificates', prof.certificates.length === 2);
  ok('student without conditions cannot get certificate', (await sup.req('POST', `/api/students/${sid2}/certificates`, { pathId: 'p_python' })).status === 422);

  // --- site API
  ok('site API without key -> 401', (await fetch(BASE + '/api/site/students/upsert', { method: 'POST', body: '{}' })).status === 401);
  r = await fetch(BASE + '/api/site/students/upsert', { method: 'POST', headers: { 'x-site-key': 'site-secret' }, body: JSON.stringify({ externalId: 'ext-3', name: 'منى', email: 'mona@example.com', pathIds: ['p_python'], subStatus: 'pending' }) });
  ok('site API upsert student', r.status === 200);
  r = await fetch(BASE + '/api/site/payments', { method: 'POST', headers: { 'x-site-key': 'site-secret' }, body: JSON.stringify({ reference: 'PAY-1', amount: 199.5, currency: 'EGP', studentExternalId: 'ext-1', verified: true, paidAt: new Date().toISOString() }) });
  ok('site API verified payment', r.status === 200);

  // --- analytics
  const A = (await admin.req('GET', '/api/analytics?compare=1&tz=120')).body;
  ok('analytics: students entered = 2 (two students had sessions)', A.access.entered === 2, JSON.stringify(A.access));
  ok('analytics: avg session = 60s', A.access.avgSessionSeconds === 60, A.access.avgSessionSeconds);
  ok('analytics: DAU/WAU/MAU', A.access.dau === 2 && A.access.wau === 2 && A.access.mau === 2);
  const la = A.lessons.rows.find(l => l.lessonId === 'l_a');
  ok('analytics: lesson opened by 2, completed by 1 of openers', la.opened === 2 && la.completedByOpeners === 1 && la.completionRate === 50 && la.startedNotCompleted === 1, JSON.stringify(la));
  ok('analytics: lesson avg time uses real seconds', la.avgSeconds === 120);
  const vd = A.videos.rows.find(x => x.id === 'vid1');
  ok('analytics: video started=2 (pause-before-play ignored), completed=1', vd.started === 2 && vd.completed === 1, JSON.stringify(vd));
  ok('analytics: video common stop bucket 30-40% or 20-30%', vd.stopBuckets.reduce((a, b) => a + b, 0) === 2 && vd.stopBuckets[4] === 1 && vd.stopBuckets[2] === 1, JSON.stringify(vd.stopBuckets));
  ok('analytics: video avg watched', vd.avgWatchedSeconds === Math.round((95 + 20) / 2) , vd.avgWatchedSeconds);
  ok('analytics: video not-started counts enrolled', vd.notStarted >= 1, vd.notStarted);
  ok('analytics: quiz attempts/avg/max/min', A.quizzes.attempts === 3 && A.quizzes.max === 100 && A.quizzes.min === 50, JSON.stringify(A.quizzes));
  ok('analytics: most missed question q_1', A.quizzes.mostMissed[0] && A.quizzes.mostMissed[0].questionId === 'q_1' && A.quizzes.mostMissed[0].wrong === 1, JSON.stringify(A.quizzes.mostMissed));
  const pa = A.paths.rows.find(p => p.pathId === 'p_python');
  ok('analytics: path enrolled & completion', pa.enrolled >= 2 && pa.completedStudents >= 1, JSON.stringify(pa));
  ok('analytics: subscriptions counts', A.subscriptions.active >= 1 && A.subscriptions.pending >= 1, JSON.stringify(A.subscriptions));
  ok('analytics: verified revenue shown only with documented payments', Array.isArray(A.subscriptions.revenue) && A.subscriptions.revenue[0].total === 199.5);
  ok('analytics: comparison present', A.previous && typeof A.previous.cards.entered === 'number');
  const Af = (await admin.req('GET', '/api/analytics?pathId=p_logic')).body;
  ok('analytics: path filter excludes other path lessons', Af.lessons.rows.length === 0);
  const aAna = (await ana.req('GET', '/api/analytics?lessonId=l_a')).body;
  ok('analyst gets no student names', aAna.lessons.startedNotCompletedStudents === undefined && aAna.quizzes.failedStudents === undefined);
  const aAdm = (await admin.req('GET', '/api/analytics?lessonId=l_a')).body;
  ok('admin sees started-not-completed names', Array.isArray(aAdm.lessons.startedNotCompletedStudents) && aAdm.lessons.startedNotCompletedStudents.length === 1);
  const empty = (await admin.req('GET', '/api/analytics?from=2020-01-01&to=2020-01-31')).body;
  ok('analytics: empty period => zeros (no fake data)', empty.access.entered === 0 && empty.access.sessions === 0 && empty.quizzes.attempts === 0 && empty.quizzes.passRate === null);

  // --- audit log
  const L = (await admin.req('GET', '/api/logs?page=1')).body;
  ok('logs newest first', L.rows.length > 5 && L.rows[0].id > L.rows[1].id);
  const byCm = (await admin.req('GET', '/api/logs?q=cmgr&section=paths')).body.rows;
  ok('log records actual username/id/section/action for path creation', byCm.some(x => x.username === 'cmgr' && x.user_id > 0 && x.action === 'create' && x.target_name === 'مسار cm'), JSON.stringify(byCm[0]));
  ok('log filter by action', (await admin.req('GET', '/api/logs?action=issue')).body.rows.every(x => x.action === 'issue') && (await admin.req('GET', '/api/logs?action=issue')).body.rows.length === 1);
  ok('log filter by date', (await admin.req('GET', '/api/logs?from=2020-01-01&to=2020-01-02')).body.total === 0);
  const edit = (await admin.req('GET', '/api/logs?q=inst&action=update')).body.rows[0];
  const det = (await admin.req('GET', '/api/logs/' + edit.id)).body;
  ok('update log keeps before & after', det.before_json && det.after_json && det.before_json.includes('درس ب') && det.after_json.includes('درس ب (معدل)'));
  // delete as cm then check who deleted
  await tryPut(cm, d => { d.paths = d.paths.filter(p => p.id !== 'p_cm'); });
  const del = (await admin.req('GET', '/api/logs?action=delete&section=paths')).body.rows[0];
  ok('who deleted an item is recorded', del && del.username === 'cmgr' && del.target_name === 'مسار cm');
  const sub = (await admin.req('GET', '/api/logs?section=subscriptions')).body.rows;
  ok('subscription changes logged (price/cash/whatsapp)', ['تغيير سعر الاشتراك', 'تغيير رقم الكاش', 'تغيير رقم الواتساب'].every(s => sub.some(x => (x.details || '').startsWith(s))));
  const cash = sub.find(x => (x.details || '').startsWith('تغيير رقم الكاش'));
  const cashDet = (await admin.req('GET', '/api/logs/' + cash.id)).body;
  ok('cash number masked in log (no sensitive payment data)', !cashDet.after_json.includes('01011112222') && cashDet.after_json.includes('222'));
  ok('student/certificate/user/AI actions logged', ['students', 'users', 'ai'].every(sec => L.sections.includes(sec)) );
  ok('login & failed login logged', (await admin.req('GET', '/api/logs?action=login_failed')).body.total >= 1 && (await admin.req('GET', '/api/logs?action=login')).body.total >= 1);
  // no secrets in log
  const allLogs = []; for (let pg = 1; pg <= (L.pages || 1); pg++) { for (const x of (await admin.req('GET', '/api/logs?page=' + pg)).body.rows) allLogs.push((await admin.req('GET', '/api/logs/' + x.id)).body); }
  const blob = JSON.stringify(allLogs);
  ok('no passwords / API keys / raw AI text in logs', !/Passw0rd|test-pass-1234|test-key|site-secret|المتغير هو اسم يخزن قيمة/.test(blob));
  ok('logs: no write endpoints (PUT/DELETE/POST => 404)', (await admin.req('DELETE', '/api/logs/1')).status === 404 && (await admin.req('PUT', '/api/logs/1', {})).status === 404 && (await admin.req('POST', '/api/logs', {})).status === 404);
  ok('log chain verifies', (await admin.req('GET', '/api/logs/verify')).body.ok === true);
  // DB-level append-only
  const { DatabaseSync } = require('node:sqlite'); const dbx = new DatabaseSync((process.env.DATA_DIR || '/tmp/efdata') + '/efhama.db');
  let blocked = 0; for (const q of ["UPDATE audit_log SET username='x' WHERE id=1", 'DELETE FROM audit_log WHERE id=1']) { try { dbx.exec(q); } catch (e) { if (/append-only/.test(e.message)) blocked++; } }
  dbx.close();
  ok('DB triggers block UPDATE/DELETE of audit_log', blocked === 2);
  // tamper detection (unit, temp db)
  const dbm = require(__dirname + '/../server/db.js'), aud = require(__dirname + '/../server/audit.js');
  const tmp = fs.mkdtempSync('/tmp/auditchain-'); const tdb = dbm.open(tmp);
  for (let i = 0; i < 3; i++) aud.log(tdb, { id: 1, username: 'u', displayName: 'u' }, { action: 'create', section: 'paths', targetName: 'n' + i });
  tdb.exec('DROP TRIGGER audit_no_update'); tdb.exec("UPDATE audit_log SET username='forged' WHERE id=2");
  const vr = aud.verifyChain(tdb);
  ok('hash-chain detects direct DB tampering', vr.ok === false && vr.brokenAt === 2, JSON.stringify(vr));
  tdb.close();

  // --- sessions/disable
  ok('disable user kills session', (await admin.req('PUT', '/api/users/' + (await admin.req('GET', '/api/users')).body.users.find(u => u.username === 'anal').id, { active: false })).status === 200 && (await ana.req('GET', '/api/me')).status === 401);
  ok('cannot disable self', (await admin.req('PUT', '/api/users/1', { active: false })).status === 422);
  ok('cannot demote last super admin', (await admin.req('PUT', '/api/users/1', { role: 'analyst' })).status === 422);
  ok('disabled user cannot log in', (await new Client().login('anal', 'Passw0rd-anal')).status === 401);
  ok('permission change logged', (await admin.req('GET', '/api/logs?action=permissions')).body.total >= 1);
  // protected static
  ok('server code & DB not downloadable', (await fetch(BASE + '/server/server.js')).status === 404 && (await fetch(BASE + '/data/efhama.db')).status === 404);

  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log('TOTAL', results.length, 'FAILS', results.filter(r => r[0] === 'FAIL').length);
})().catch(e => { console.log(results.map(r => r.join(' | ')).join('\n')); console.error('CRASH', e.stack.split('\n').slice(0, 5).join('\n')); process.exit(1); });
