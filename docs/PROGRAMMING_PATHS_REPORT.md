# تقرير التعديلات: مسارات تعلم البرمجة

## ما تم إنشاؤه
- صفحة رئيسية مستقلة: `public/programming-paths/index.html`
- صفحة تفاصيل المسار: `public/programming-paths/path.html`
- ملفات الأنماط: `public/programming-paths/styles.css`
- منطق JavaScript: `public/programming-paths/app.js`
- بيانات المسارات بتنسيق JSON: `public/data/programming-paths.json`
- معاينة مستقلة: `preview.html`

## المزايا
- تصميم RTL باللغة العربية، متوافق مع هوية Efhama.
- ألوان المشروع الأساسية: `#3C4AE8`، أبيض، أسود.
- بطاقات احترافية لكل مسار مع مستوى، عدد الدروس، نسبة التقدم، وزر البدء.
- حفظ تقدم كل مسار داخل Local Storage.
- تفاصيل المسار مع قائمة دروس placeholder مرتبة تسلسليًا.
- تصميم متجاوب للموبايل والكمبيوتر.
- لا تمس الصفحات الحالية ولا تؤثر على وظائف المنصة الأساسية.

## الملاحظات
- المحتوى التعليمي التفصيلي لكل درس لم يضاف بعد، لأن الطلب كان يطلب إنشاء هيكل القسم فقط في هذه المرحلة.
- تم ترك البنية مفتوحة للتوسيع بسهولة في المرحلتين القادمة.

## Visual Learning System

The programming lesson renderer supports reusable image-based visual blocks. Add an
SVG, PNG, JPEG, or WebP file below `public/assets/images/lessons/<path>/<lesson>/`,
then insert a block at the desired position in that lesson's `content` array:

```json
{
  "type": "diagram",
  "visualType": "concept",
  "title": "How a function works",
  "description": "Inputs are processed and a result is returned.",
  "image": "assets/images/lessons/logic/functions/example.svg",
  "alt": "Inputs enter a function, are processed, and produce a returned result."
}
```

Supported `visualType` values: `concept`, `flowchart`, `diagram`, `step-by-step`,
`infographic`, and `code-visualization`. The renderer preserves aspect ratio, uses
lazy image loading, provides descriptive alternative text, and opens images in an
accessible zoom dialog. Keep image paths under the lesson assets directory; the
renderer rejects paths outside that location. SVGs are loaded as images rather
than injected markup.

The sample gallery lesson is `58338`; its six SVG examples live in
`public/assets/images/lessons/logic/visual-learning-demo/`. These are demonstrations
of the system, not a claim that every lesson has finished artwork.
