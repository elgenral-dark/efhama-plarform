# اختبارات Efhamha Dashboard

تحتاج: Node 22.13+ و`npm i playwright` + `npx playwright install chromium` (Linux/macOS).
كلها تعمل على **بيانات مؤقتة** — لا تشغّلها على `data/` الحيّة. استعمل `DATA_DIR` مؤقتًا ونسخة من `data/efhamha-data.json`.

1. مزوّد AI تجريبي (للاختبار فقط، غير موجود في المنتج): `node tests/mock-ai.js` (المنفذ 9999)
2. خادم نظيف:
   `mkdir -p /tmp/efdata/uploads && cp data/efhamha-data.json /tmp/efdata/`
   `ADMIN_USERNAME=admin ADMIN_PASSWORD='test-pass-1234' DATA_DIR=/tmp/efdata AI_API_KEY=test-key SITE_API_KEY=site-secret node server/server.js`
   (لاختبار الفيديو ضع `t.webm` في `/tmp/efdata/uploads/`)
3. بالترتيب على نفس الخادم: `api-test.js` ← `ui-admin-flows.js` ← `ui-tracking-analytics-roles.js`
4. اختبار التصميم الجديد: `redesign.js` (هوية، تخطيط، طيّ القائمة، القوائم المنبثقة، تباين الداكن، حالات التحميل/الخطأ، الأدوار) و`responsive-matrix.js 320,360,375,390,414,430,768,820,1024,1280,1440,1920 light` (وكذلك `dark`)
5. الميزات القديمة (CRUD، المحرر، الرفع، الإعدادات، الاستيراد/التصدير) على خادم **جديد**: `regression-original-features.js`
6. الوضع المحلي: `python3 -m http.server 8790` داخل `dashboard/` ثم `node tests/local-mode.js`

ملاحظة: فحص واحد في `api-test.js` يتوقع أن اسم المنصة في صفحة الشهادة يحتوي `Efham` — عدّله إذا تغيّر الاسم الرسمي.
