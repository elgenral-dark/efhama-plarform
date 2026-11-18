// خادم تجريبي يحاكي واجهة OpenAI-compatible — للاختبار فقط (غير موجود في المنتج)
const http = require('http');
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    if (req.url !== '/chat/completions' || req.headers.authorization !== 'Bearer test-key') { res.writeHead(401); return res.end('{"error":"auth"}'); }
    const j = JSON.parse(b); const user = j.messages[1].content;
    const raw = user.split('<<<BEGIN>>>')[1].split('<<<END>>>')[0];
    let content;
    if (raw.includes('BADJSON')) content = 'هذا ليس JSON';
    else {
      const code = (raw.match(/```[^\n]*\n([\s\S]*?)```/) || [])[1] || '';
      content = JSON.stringify({
        blocks: [
          { type: 'heading', level: 2, text: 'مقدمة' },
          { type: 'paragraph', text: 'ده شرح مبسط للمتغيرات.', generated: false },
          { type: 'code', lang: 'python', caption: '', code: code.trim(), generated: false },
          { type: 'paragraph', text: 'مثال إضافي بسيط.', generated: true },
          { type: 'note', tone: 'bad-tone', title: 'تنبيه', text: 'انتبه للأسماء.', generated: false },
          { type: 'script', text: '<script>alert(1)</script>' }
        ],
        objectives: ['تفهم يعني إيه متغير'], terms: [{ ar: 'متغير', en: 'variable', definition: 'اسم يخزن قيمة', example: 'x = 5' }],
        summary: ['المتغير يخزن قيمة'],
        review: [{ type: 'mcq', text: 'إيه ناتج print(x)؟', options: ['5', '6'], answer: 1, explanation: 'لأن x = 5' }, { type: 'mcq', text: 'سؤال بإجابة غلط', options: ['a', 'b'], answer: 9, explanation: '' }, { type: 'tf', text: 'المتغير يخزن قيمة', answer: 'true', explanation: '' }],
        diagrams: [{ title: 'رسم المتغير كصندوق', description: 'صندوق عليه اسم', afterBlock: 1 }], notes: ['النص الأصلي مختصر'] });
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
}).listen(9999, '127.0.0.1');
