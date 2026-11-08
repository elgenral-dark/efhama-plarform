window.EfhamaGamificationConfig = Object.freeze({
  version: 1,
  xp: Object.freeze({
    lesson: 10,
    challenge: 25,
    assessment: 40,
    project: 60,
    unit: 25
  }),
  levels: Object.freeze([
    { id: "beginner", title: "Beginner", minimumXp: 0 },
    { id: "learner", title: "Learner", minimumXp: 100 },
    { id: "coder", title: "Coder", minimumXp: 300 },
    { id: "developer", title: "Developer", minimumXp: 650 },
    { id: "advanced-developer", title: "Advanced Developer", minimumXp: 1000 }
  ]),
  badges: Object.freeze([
    { id: "first-lesson", title: "First Lesson", description: "أكمل أول درس.", requirement: "إكمال درس تعليمي للمرة الأولى.", icon: "📘" },
    { id: "first-challenge", title: "First Challenge", description: "اجتز أول تحدٍ برمجي.", requirement: "اجتياز جميع اختبارات تحدٍ برمجي واحد.", icon: "🧩" },
    { id: "python-beginner", title: "Python Beginner", description: "أكمل الوحدة التأسيسية في مسار Python.", requirement: "إكمال كل دروس الوحدة الأولى في مسار Python.", icon: "🐍" },
    { id: "web-explorer", title: "Web Explorer", description: "أكمل الوحدة التأسيسية في مسار HTML.", requirement: "إكمال كل دروس الوحدة الأولى في مسار HTML.", icon: "🌐" },
    { id: "css-designer", title: "CSS Designer", description: "أكمل الوحدة التأسيسية في مسار CSS.", requirement: "إكمال كل دروس الوحدة الأولى في مسار CSS.", icon: "🎨" },
    { id: "javascript-starter", title: "JavaScript Starter", description: "أكمل الوحدة التأسيسية في مسار JavaScript.", requirement: "إكمال كل دروس الوحدة الأولى في مسار JavaScript.", icon: "⚡" },
    { id: "project-builder", title: "Project Builder", description: "أكمل أول مشروع عملي.", requirement: "استيفاء متطلبات مشروع عملي وتقييمه بنجاح.", icon: "🛠️" },
    { id: "consistent-learner", title: "Consistent Learner", description: "تعلّم في سبعة أيام متتالية.", requirement: "إتمام نشاط تعليمي حقيقي في سبعة أيام تقويمية متتالية.", icon: "🔥" }
  ])
});
