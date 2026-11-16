# افهمها — الباك اند والفرونت اند (مقسّمين)

```
efhama/
  backend/    Express + Postgres (Neon) — API، المحتوى المدفوع، الاختبارات
  frontend/   صفحات HTML/CSS/JS + حارس الصفحات + vercel.json + middleware.js
  docs/       تقارير قديمة وملف README الأصلي
  render.yaml نشر الباك اند على Render
```

## التشغيل المحلي
افتحي طرفيتين:

```powershell
# الباك اند (منفذ 4000)
cd backend
npm install
npm start

# الواجهة (منفذ 8000 — هذا ما تفتحينه في المتصفح)
cd frontend
npm install
$env:BACKEND_URL="http://localhost:4000"
npm start
```

بدون `DATABASE_URL` يستخدم الباك اند SQLite محليًا (`backend/data/efhama.db`).

## الاختبارات
```powershell
# الباك اند على SQLite (الافتراضي)
cd backend ; npm test

# الباك اند على Postgres محلي (انظري backend/scripts-test-postgres.md)
cd backend ; docker compose up -d ; npm test   # مع TEST_DATABASE_URL و PGSSL=false

# الواجهة
cd frontend ; npm test

# اختبار تحميل محلي معزول بقاعدة SQLite داخل الذاكرة (10 إلى 500 مستخدم افتراضي)
cd backend ; npm run load-test
```
اختبار التحميل ينشئ خدمة وقاعدة بيانات مؤقتتين داخل العملية نفسها، يستخدم بيانات المحتوى الحقيقية المزروعة، ولا يتصل بقاعدة بيانات أو خادم خارجي.
نتائجه تقيس بيئة التطوير المحلية فقط ولا تثبت سعة الإنتاج.
`npm test` في الباك اند يتوقع فشل اختبارين (11 و21) إذا كانت نسخة Node لا تدعم `setAuthorizer` في `node:sqlite`. تحققي بالأمر:
`node -e "console.log(typeof require('node:sqlite').DatabaseSync.prototype.setAuthorizer)"` — يجب أن تكون النتيجة `function`.

## الإشعارات
- تستخدم الإشعارات قاعدة البيانات الحالية (SQLite محليًا أو PostgreSQL في النشر)، وتُنشأ جداولها وفهارسها عند تشغيل الباك اند؛ لا يلزم تثبيت خدمة إضافية أو تنفيذ ترحيل يدوي.
- جميع المسارات محمية بكوكي الجلسة الحالية وتعمل تحت `/api/notifications`:
  - `GET /` مع `limit` و`offset` ومرشحي `category` و`read` والبحث `q`.
  - `GET /unread-count` و`GET /:id`.
  - `PATCH /:id/read` و`PATCH /read-all`.
  - `DELETE /:id` و`DELETE /` لحذف إشعارات المستخدم فقط.
  - للمسؤول فقط: `POST /` لإرسال إعلان إلى مستخدمين أو أدوار أو جميع الحسابات النشطة، و`GET /announcements` لسجل الإعلانات وإحصاءات التسليم والقراءة. يقبل POST ترويسة `Idempotency-Key` لمنع تكرار الإرسال عند إعادة المحاولة.
- تُنشأ الإشعارات ضمن معاملات أحداث التسجيل وطلبات الاشتراك ومراجعتها (موافقة/رفض) وتسليم نتيجة الاختبار. لا توجد حاليًا كيانات تسجيل بالدورات أو معلمون أو مزود دفع في هذا المشروع؛ لم تُنشأ إشعارات وهمية لهذه الأحداث.
- يحدّث الجرس العدد كل 30 ثانية أثناء ظهور الصفحة، ويتوقف عند إخفائها؛ يمكن ضبط `window.EFHAMA_NOTIFICATION_POLL_MS` قبل تحميل `js/navigation.js` (الحد المسموح 10–300 ثانية). لا يوجد وسيط WebSocket/SSE مشترك ضمن البنية الحالية، لذا يُستخدم الاستطلاع.
- صفحة المستخدم هي `/notifications.html`، وإدارة الإعلانات مدمجة في لوحة مراجعة الاشتراكات.

## لوحة الإدارة الكاملة
- تفتح لوحة الإدارة من `/admin-dashboard.html`، وتنتقل أقسامها داخل الصفحة عبر مسارات `#/...` دون إعادة تحميل.
- تعديلات نموذج محتوى لوحة الـ ZIP تُحفظ في جدول قاعدة المنصة (`admin_dashboard/main`) مع رقم إصدار يمنع الكتابة فوق تعديل أحدث؛ لا تُحوَّل تلقائيًا إلى منهج الموقع الحالي لأن شكل بيانات المنهجين مختلف.
- الدخول والحفظ محميان بجلسة المسؤول الحالية. ملفات قاعدة البيانات والنسخ الاحتياطية الموجودة في حزمة لوحة الـ ZIP لا تُنشر كملفات عامة.
- بعض أقسام اللوحة الأصلية (مثل إدارة المستخدمين المستقلة، سجلاتها، وخدمات AI/الطلاب) تعتمد على API خاص بالحزمة وغير موجود في باك اند المنصة؛ واجهتها موجودة، لكن عملياتها لا تُفعّل تلقائيًا أو تُحاكى.

## النشر
### 1) Neon (قاعدة البيانات)
أنشئي مشروعًا في Neon وانسخي رابط الاتصال (`postgres://...?sslmode=require`).

### 2) Render (الباك اند)
- New → Blueprint → اختاري هذا المستودع (يقرأ `render.yaml`).
- في الإعدادات ضعي: `DATABASE_URL` (رابط Neon)، `ADMIN_EMAIL`، `ADMIN_PASSWORD`.
- بعد النشر انسخي عنوان الخدمة (مثل `https://efhama-backend.onrender.com`).
- الخطة المجانية تنام بعد فترة، فأول طلب قد يتأخر 30–50 ثانية.

### 3) Vercel (الواجهة)
- استوردي المستودع واضبطي **Root Directory = `frontend`**.
- في `frontend/vercel.json` استبدلي `REPLACE-WITH-RENDER-HOST.onrender.com` بعنوان Render الفعلي (في الـ rewrites، مرتين).
- أضيفي متغير البيئة `BACKEND_URL` = عنوان Render (يستخدمه `middleware.js` للتحقق من الجلسة).
- للواجهة المحلية، اضبطي `BACKEND_URL` على عنوان الباك اند؛ لا توجد استجابات مستخدم وهمية عند غياب الباك اند.
- Build Command تُقرأ من `vercel.json` (تنسخ Pyodide إلى `public/vendor`).

### ملاحظات مهمة للنشر
- الدومين الواحد: المتصفح يكلم Vercel فقط، وVercel يمرر `/api` و`/data` إلى Render، فكوكي الجلسة تشتغل.
- بعد النشر تأكدي من: تسجيل الدخول يعمل، وصفحة `index.html` تفتح بعد الاشتراك، وصفحة Python تحمّل Pyodide.
- الحارس على Vercel هو `frontend/middleware.js`، ويستخدم نفس منطق `lib/guard.js` المحلي.
- اتصالات Postgres تستخدم pool افتراضيًا بحجم 5 لكل نسخة؛ اضبطي `PG_POOL_MAX` وفق حد اتصالات قاعدة البيانات وعدد النسخ، مع مهلات قابلة للضبط عبر `PG_CONNECTION_TIMEOUT_MS` و`PG_IDLE_TIMEOUT_MS` و`PG_STATEMENT_TIMEOUT_MS`.
