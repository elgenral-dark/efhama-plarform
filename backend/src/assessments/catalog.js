const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../../content/paths");
const PATHS = ["logic", "python", "html", "css", "javascript", "sql"];
const DIFFICULTY = {
  logic: "سهل إلى متوسط",
  python: "سهل إلى متوسط",
  html: "سهل",
  css: "سهل إلى متوسط",
  javascript: "متوسط",
  sql: "متوسط"
};
const LANGUAGES = {
  logic: "pseudocode",
  python: "python",
  html: "html",
  css: "css",
  javascript: "javascript",
  sql: "sql"
};

const PRACTICAL_QUESTIONS = {
  logic: [{
    id: "logic-practical-pseudocode",
    lessonId: "logic-7",
    type: "practical-coding",
    skill: "كتابة الخوارزميات",
    prompt: "اكتب pseudocode يمر على [2, 4, 6]، يجمع القيم في total، ثم يعرض المجموع.",
    starterCode: "اكتب خطوات الحل هنا",
    language: "pseudocode",
    checks: [
      { kind: "order", token: "total", beforeAny: ["for", "لكل", "loop"] },
      { kind: "order", tokenAny: ["for", "لكل", "loop"], beforeAny: ["print", "display", "output", "اطبع", "اعرض"] },
      { kind: "accumulation", target: "total", value: "number" },
      { kind: "collection", values: [2, 4, 6] },
      { kind: "output", variable: "total" }
    ],
    explanation: "يجب تهيئة المتغير، ثم المرور على القيم وجمعها، ثم عرض الناتج."
  },
  {
    id: "logic-practical-trace",
    lessonId: "logic-13",
    type: "code-output",
    skill: "تتبّع تنفيذ الخوارزميات",
    prompt: "تتبّع قيمة total بعد تنفيذ الخطوات التالية.",
    code: "total ← 0\nكرر لكل number في [2, 4, 6]\n    total ← total + number\nاطبع total",
    options: [{ id: "a", text: "12" }, { id: "b", text: "10" }, { id: "c", text: "6" }],
    correctOption: "a",
    explanation: "نجمع القيم الثلاث: 2 + 4 + 6 = 12."
  }, {
    id: "logic-practical-error",
    lessonId: "logic-9",
    type: "find-error",
    skill: "اختبار الحلول",
    prompt: "تريد خوارزمية إيجاد أكبر رقم في قائمة. ما التعديل الذي يصلح الخطأ؟",
    code: "largest ← 0\nلكل value في values\n    إذا value < largest\n        largest ← value",
    options: [
      { id: "a", text: "ابدأ بأول قيمة، ثم حدّث largest عندما تكون value أكبر منها." },
      { id: "b", text: "احذف الحلقة واترك largest مساويًا للصفر." },
      { id: "c", text: "غيّر المقارنة إلى value = largest." }
    ],
    correctOption: "a",
    explanation: "التهيئة من أول عنصر والتحديث عند العثور على قيمة أكبر يعملان أيضًا مع الأعداد السالبة."
  }],
  python: [{
    id: "python-true-false-string",
    lessonId: "python-2",
    type: "true-false",
    skill: "أنواع البيانات",
    prompt: "القيمة \"Efhama\" من النوع str في Python.",
    options: [{ id: "a", text: "صح" }, { id: "b", text: "خطأ" }],
    correctOption: "a",
    explanation: "النصوص في Python تكون من النوع str."
  }, {
    id: "python-practical-sum",
    lessonId: "python-6",
    type: "practical-coding",
    skill: "Lists والحلقات",
    prompt: "اكتب الدالة sum_positive(values) التي تجمع الأعداد الأكبر من صفر فقط.",
    starterCode: "def sum_positive(values):\n    # اكتب الحل هنا\n    pass",
    language: "python",
    functionName: "sum_positive",
    tests: [
      { input: [[2, -1, 4, 0]], expected: 6 },
      { input: [[-3, -2]], expected: 0 },
      { input: [[7]], expected: 7 }
    ],
    explanation: "تُختبر القيم الموجبة والسالبة والصفر والقائمة ذات العنصر الواحد."
  }, {
    id: "python-complete-range",
    lessonId: "python-5",
    type: "code-completion",
    skill: "Loops وrange",
    prompt: "أكمل range كي تطبع الحلقة الأعداد من 1 إلى 5 شاملًا.",
    code: "for number in range(1, ___):\n    print(number)",
    options: [{ id: "a", text: "5" }, { id: "b", text: "6" }, { id: "c", text: "4" }],
    correctOption: "b",
    explanation: "قيمة نهاية range غير مشمولة، لذلك نستخدم 6."
  }, {
    id: "python-output-loop",
    lessonId: "python-5",
    type: "code-output",
    skill: "Loops",
    prompt: "ما القيم التي يطبعها الكود بالترتيب؟",
    code: "total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)",
    options: [{ id: "a", text: "6" }, { id: "b", text: "123" }, { id: "c", text: "3" }],
    correctOption: "a",
    explanation: "تضيف الحلقة 1 ثم 2 ثم 3 إلى total، فتكون قيمته النهائية 6."
  }],
  html: [{
    id: "html-complete-heading",
    lessonId: "html-2",
    type: "code-completion",
    skill: "العناصر الدلالية",
    prompt: "اختر العنصر المناسب ليكون العنوان الرئيسي للصفحة.",
    code: "<___>عنوان الصفحة</___>",
    options: [{ id: "a", text: "h1" }, { id: "b", text: "span" }, { id: "c", text: "small" }],
    correctOption: "a",
    explanation: "يمثل h1 العنوان الرئيسي للمحتوى."
  }, {
    id: "html-practical-form",
    lessonId: "html-5",
    type: "practical-coding",
    skill: "Forms وإمكانية الوصول",
    prompt: "اكتب نموذجًا يحتوي على تسمية مرتبطة بحقل بريد إلكتروني وزر إرسال.",
    starterCode: "<form>\n  <!-- أضف label وinput وbutton -->\n</form>",
    language: "html",
    checks: [
      { kind: "selector", selector: "form label[for]" },
      { kind: "selector", selector: "form input[type=\"email\"]" },
      { kind: "label-for-input" },
      { kind: "selector", selector: "form button[type=\"submit\"]" }
    ],
    explanation: "يُحلل HTML دون تشغيل JavaScript أو تحميل موارد، وتُفحص بنية الحقل والتسمية."
  }, {
    id: "html-error-image",
    lessonId: "html-4",
    type: "find-error",
    skill: "الصور وإمكانية الوصول",
    prompt: "ما النقص الأهم في وسم الصورة التالي؟",
    code: "<img src=\"assets/logo.png\">",
    options: [
      { id: "a", text: "إضافة وصف بديل مناسب في الخاصية alt." },
      { id: "b", text: "استبدال src بالخاصية href." },
      { id: "c", text: "إضافة وسم إغلاق </img>." }
    ],
    correctOption: "a",
    explanation: "النص البديل يصف الصورة لمن لا يستطيع رؤيتها."
  }],
  css: [{
    id: "css-complete-color",
    lessonId: "css-2",
    type: "code-completion",
    skill: "الألوان والخطوط",
    prompt: "أكمل الخاصية لتغيير لون النص.",
    code: "h1 { ___: #3C4AE8; }",
    options: [{ id: "a", text: "color" }, { id: "b", text: "background-image" }, { id: "c", text: "display" }],
    correctOption: "a",
    explanation: "الخاصية color تضبط لون النص."
  }, {
    id: "css-practical-layout",
    lessonId: "css-5",
    type: "practical-coding",
    skill: "Grid والتخطيط",
    prompt: "اكتب قاعدة CSS تجعل .gallery شبكة بثلاثة أعمدة متساوية مع مسافة بينها.",
    starterCode: ".gallery {\n  /* أضف خصائص التخطيط */\n}",
    language: "css",
    checks: [
      { selector: ".gallery", property: "display", value: "grid" },
      { selector: ".gallery", property: "grid-template-columns", includes: "repeat" },
      { selector: ".gallery", property: "gap", nonEmpty: true }
    ],
    explanation: "يُفحص المحدد وخصائص CSS المطلوبة من دون تطبيق الأنماط على المنصة."
  }, {
    id: "css-error-selector",
    lessonId: "css-4",
    type: "find-error",
    skill: "Selectors",
    prompt: "تريد استهداف كل العناصر التي تحمل class باسم card. ما التصحيح؟",
    code: "card { color: navy; }",
    options: [
      { id: "a", text: "اكتب .card { color: navy; }" },
      { id: "b", text: "اكتب #.card { color: navy; }" },
      { id: "c", text: "اكتب card. { color: navy; }" }
    ],
    correctOption: "a",
    explanation: "تبدأ محددات class بنقطة."
  }],
  javascript: [{
    id: "javascript-complete-loop",
    lessonId: "js-4",
    type: "code-completion",
    skill: "Loops",
    prompt: "أكمل التحديث كي تزيد قيمة i في كل دورة وتنتهي الحلقة.",
    code: "for (let i = 0; i < 3; ___) {\n  console.log(i);\n}",
    options: [{ id: "a", text: "i++" }, { id: "b", text: "i--" }, { id: "c", text: "i = 0" }],
    correctOption: "a",
    explanation: "يجب زيادة i حتى يصل إلى 3 وتنتهي الحلقة."
  }, {
    id: "javascript-practical-even",
    lessonId: "js-3",
    type: "practical-coding",
    skill: "Functions والشروط",
    prompt: "اكتب الدالة isEven(n) التي تُرجع true إذا كان العدد زوجيًا وfalse خلاف ذلك.",
    starterCode: "function isEven(n) {\n  // اكتب الحل هنا\n}",
    language: "javascript",
    functionName: "isEven",
    tests: [
      { input: [4], expected: true },
      { input: [7], expected: false },
      { input: [0], expected: true },
      { input: [-2], expected: true }
    ],
    explanation: "يشغّل الخادم الدالة في عملية منفصلة ويختبر أعدادًا موجبة وسالبة وصفرًا."
  }, {
    id: "javascript-output-array",
    lessonId: "js-6",
    type: "code-output",
    skill: "Arrays",
    prompt: "ما القيمة الناتجة عن التعبير؟",
    code: "const values = [3, 5, 7];\nvalues[1] + values.length",
    options: [{ id: "a", text: "8" }, { id: "b", text: "9" }, { id: "c", text: "5" }],
    correctOption: "a",
    explanation: "العنصر عند الفهرس 1 يساوي 5، وطول المصفوفة 3؛ المجموع 8."
  }],
  sql: [{
    id: "sql-true-false-select",
    lessonId: "sql-4",
    type: "true-false",
    skill: "SELECT",
    prompt: "استعلام SELECT من دون WHERE يعرض كل الصفوف التي يطابقها المصدر.",
    options: [{ id: "a", text: "صح" }, { id: "b", text: "خطأ" }],
    correctOption: "a",
    explanation: "عند عدم إضافة WHERE لا تُطبّق تصفية على الصفوف."
  }, {
    id: "sql-practical-query",
    lessonId: "sql-5",
    type: "practical-coding",
    skill: "Filtering & Sorting",
    prompt: "اختر الاستعلام الصحيح لعرض أسماء الطلاب الحاصلين على 80 فأكثر بترتيب تنازلي حسب الدرجة.",
    options: [
      { id: "a", text: "SELECT name FROM students WHERE score >= 80 ORDER BY score DESC;" },
      { id: "b", text: "SELECT name FROM students ORDER BY score WHERE score >= 80;" },
      { id: "c", text: "DELETE FROM students WHERE score >= 80;" }
    ],
    correctOption: "a",
    explanation: "يرشح WHERE الصفوف، ثم يرتب ORDER BY النتائج تنازليًا."
  }, {
    id: "sql-practical-write",
    lessonId: "sql-5",
    type: "practical-coding",
    skill: "Filtering & Sorting",
    prompt: "اكتب استعلامًا يعرض اسم الطلاب ذوي الدرجة 80 فأكثر بترتيب تنازلي.",
    starterCode: "SELECT name\nFROM students\n-- أكمل شرط WHERE وORDER BY",
    language: "sql",
    tests: [
      {
        students: [
          { id: 1, name: "Mona", score: 90, course_id: 1 },
          { id: 2, name: "Adam", score: 70, course_id: 1 },
          { id: 3, name: "Noor", score: 85, course_id: 2 }
        ],
        courses: [],
        expected: [{ name: "Mona" }, { name: "Noor" }],
        orderMatters: true
      },
      {
        students: [
          { id: 1, name: "Lina", score: 80, course_id: 1 },
          { id: 2, name: "Omar", score: 99, course_id: 1 }
        ],
        courses: [],
        expected: [{ name: "Omar" }, { name: "Lina" }],
        orderMatters: true
      }
    ],
    explanation: "يُشغّل الاستعلام على مجموعتي بيانات منفصلتين داخل SQLite مؤقتة للقراءة فقط."
  }, {
    id: "sql-output-count",
    lessonId: "sql-4",
    type: "code-output",
    skill: "SELECT وWHERE",
    prompt: "كم صفًا يرجعه الاستعلام إذا كانت الدرجات 90 و75 و80؟",
    code: "SELECT name FROM students WHERE score >= 80;",
    options: [{ id: "a", text: "صفان" }, { id: "b", text: "ثلاثة صفوف" }, { id: "c", text: "صف واحد" }],
    correctOption: "a",
    explanation: "الدرجتان 90 و80 تحققان الشرط."
  }]
};

const escapeMarkup = (text) => String(text)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const loadPaths = () => Object.fromEntries(PATHS.map((slug) => [
  slug,
  JSON.parse(fs.readFileSync(path.join(ROOT, `${slug}.json`), "utf8"))
]));

const PATH_DATA = loadPaths();
const QUESTION_BANK = {};
const ASSESSMENTS = {};

function optionQuestion(question, slug, lessonId, lessonTitle, unitId) {
  return {
    id: question.id,
    slug,
    lessonId,
    lessonTitle,
    unitId,
    skill: question.skill || lessonTitle,
    type: question.type,
    prompt: question.prompt,
    code: question.code || "",
    starterCode: question.starterCode || "",
    language: question.language || LANGUAGES[slug],
    functionName: question.functionName || "",
    tests: question.tests || [],
    checks: question.checks || [],
    options: question.options || [],
    correctOption: question.correctOption || "",
    explanation: question.explanation || ""
  };
}

function baseQuestion(slug, lesson, unitId, otherSummaries) {
  const distractors = otherSummaries.filter((summary) => summary && summary !== lesson.summary).slice(0, 3);
  const choices = [
    { sourceId: "correct", text: lesson.summary || lesson.title },
    ...distractors.map((text, index) => ({ sourceId: `d${index}`, text }))
  ];
  const offset = [...lesson.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % choices.length;
  const ordered = choices.slice(offset).concat(choices.slice(0, offset))
    .map((option, index) => ({ id: `option-${index}`, text: option.text, sourceId: option.sourceId }));
  const correctOption = ordered.find((option) => option.sourceId === "correct").id;
  const options = ordered.map(({ id, text }) => ({ id, text }));
  return {
    id: `lesson-${lesson.id}`,
    slug,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    unitId,
    skill: lesson.title,
    type: "multiple-choice",
    prompt: `أي عبارة تصف بدقة هدف درس «${lesson.title}»؟`,
    code: "",
    starterCode: "",
    language: LANGUAGES[slug],
    functionName: "",
    tests: [],
    checks: [],
    options,
    correctOption,
    explanation: lesson.summary || `راجع درس «${lesson.title}» لتثبيت المهارة.`
  };
}

function publicQuestion(question) {
  return {
    id: question.id,
    lessonId: question.lessonId,
    lessonTitle: question.lessonTitle,
    skill: question.skill,
    type: question.type,
    prompt: question.prompt,
    code: question.code,
    starterCode: question.starterCode,
    language: question.language,
    functionName: question.functionName,
    options: question.options.map((option, index) => ({ id: `option-${index}`, text: option.text })),
    responseType: question.type === "practical-coding" && (question.tests.length > 0 || question.checks.length > 0)
      ? "code" : "choice"
  };
}

function publicCorrectOption(question) {
  const index = question.options.findIndex((option) => option.id === question.correctOption);
  return index < 0 ? null : `option-${index}`;
}

for (const slug of PATHS) {
  const pathData = PATH_DATA[slug];
  const lessons = pathData.levels.flatMap((unit) => unit.lessons.map((lesson) => ({ ...lesson, unitId: unit.id, unitName: unit.name })));
  const summaries = lessons.map((lesson) => lesson.summary || lesson.title);
  const questionMap = new Map();
  for (const lesson of lessons) {
    const question = baseQuestion(slug, lesson, lesson.unitId, summaries);
    questionMap.set(question.id, question);
  }
  for (const raw of PRACTICAL_QUESTIONS[slug]) {
    const lesson = lessons.find((item) => item.id === raw.lessonId);
    if (!lesson) throw new Error(`Unknown assessment lesson ${slug}/${raw.lessonId}`);
    const question = optionQuestion(raw, slug, lesson.id, lesson.title, lesson.unitId);
    questionMap.set(question.id, question);
  }
  QUESTION_BANK[slug] = questionMap;

  const exams = [];
  for (const lesson of lessons) {
    const questions = [`lesson-${lesson.id}`];
    for (const question of questionMap.values()) {
      if (question.lessonId === lesson.id && question.id !== `lesson-${lesson.id}`) questions.push(question.id);
    }
    exams.push({
      id: `${slug}:lesson:${lesson.id}`,
      slug,
      kind: "lesson",
      title: `اختبار درس: ${lesson.title}`,
      description: `اختبار قصير على المهارات الواردة في درس «${lesson.title}».`,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      unitId: lesson.unitId,
      unitName: lesson.unitName,
      questionIds: questions,
      timeLimitSeconds: 300,
      passPercent: 70,
      difficulty: DIFFICULTY[slug],
      instructions: "أجب بنفسك؛ الإجابات محفوظة تلقائيًا. لن تظهر الإجابات الصحيحة قبل تسليم الاختبار."
    });
  }

  for (const unit of pathData.levels) {
    const questionIds = unit.lessons.map((lesson) => `lesson-${lesson.id}`);
    for (const question of questionMap.values()) {
      if (question.unitId === unit.id && question.id !== `lesson-${question.lessonId}`) questionIds.push(question.id);
    }
    exams.push({
      id: `${slug}:unit:${unit.id}`,
      slug,
      kind: "unit",
      title: `اختبار الوحدة: ${unit.name}`,
      description: `اختبر فهمك لدروس وحدة «${unit.name}» ومهاراتها العملية.`,
      unitId: unit.id,
      unitName: unit.name,
      questionIds,
      timeLimitSeconds: 600,
      passPercent: 70,
      difficulty: DIFFICULTY[slug],
      instructions: "يمكنك التنقل بين الأسئلة ومراجعة إجاباتك قبل التسليم. تنتهي الجلسة عند انتهاء الوقت."
    });
  }

  const finalQuestionIds = lessons.slice(0, 12).map((lesson) => `lesson-${lesson.id}`);
  for (const question of questionMap.values()) {
    if (question.id !== `lesson-${question.lessonId}`) finalQuestionIds.push(question.id);
  }
  exams.push({
    id: `${slug}:path:final`,
    slug,
    kind: "path",
    title: `الاختبار الشامل: ${pathData.titleAr || pathData.title}`,
    description: `تقييم شامل للمهارات الأساسية في مسار ${pathData.titleAr || pathData.title}.`,
    questionIds: finalQuestionIds,
    timeLimitSeconds: 900,
    passPercent: 70,
    difficulty: DIFFICULTY[slug],
    instructions: "اقرأ كل سؤال بعناية. يمكنك التنقل بين الأسئلة، وستُحفظ الإجابات على الخادم حتى عند تحديث الصفحة."
  });
  ASSESSMENTS[slug] = exams;
}

function getAssessment(id) {
  for (const slug of PATHS) {
    const assessment = ASSESSMENTS[slug].find((item) => item.id === id);
    if (assessment) return assessment;
  }
  return null;
}

function getQuestion(slug, id) {
  return QUESTION_BANK[slug]?.get(id) || null;
}

function sanitizeAssessment(assessment, summary) {
  return {
    id: assessment.id,
    slug: assessment.slug,
    kind: assessment.kind,
    title: assessment.title,
    description: assessment.description,
    lessonId: assessment.lessonId || null,
    lessonTitle: assessment.lessonTitle || null,
    unitId: assessment.unitId || null,
    unitName: assessment.unitName || null,
    questionCount: assessment.questionIds.length,
    timeLimitSeconds: assessment.timeLimitSeconds,
    passPercent: assessment.passPercent,
    difficulty: assessment.difficulty,
    instructions: assessment.instructions,
    attempts: summary.attempts,
    bestScore: summary.bestScore,
    lastScore: summary.lastScore,
    lastPassed: summary.lastPassed,
    history: summary.history,
    activeSessionId: summary.activeSessionId
  };
}

module.exports = {
  PATHS,
  PATH_DATA,
  ASSESSMENTS,
  getAssessment,
  getQuestion,
  publicQuestion,
  publicCorrectOption,
  sanitizeAssessment,
  escapeMarkup
};
