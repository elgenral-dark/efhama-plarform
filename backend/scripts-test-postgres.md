# تشغيل الاختبارات على Postgres محلي

1. شغّلي Postgres:           docker compose up -d
2. اضبطي متغيرات البيئة (مرة واحدة في الجلسة):
   TEST_DATABASE_URL=postgres://postgres:test@localhost:5432/efhama_test
   PGSSL=false
3. شغّلي الاختبارات:          npm test

تحذير: TEST_DATABASE_URL يُمسح بالكامل قبل كل تشغيل. لا تضعي فيه رابط Neon الإنتاجي أبدًا؛ استخدمي فرع (branch) اختبار منفصل في Neon إن أردتِ الاختبار عليه.
