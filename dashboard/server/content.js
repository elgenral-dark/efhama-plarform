'use strict';
/* أدوات قراءة بيانات المحتوى (JSON) على الخادم */
function pathOfLesson(data, lessonId) {
  const l = (data.lessons || []).find(x => x.id === lessonId);
  if (!l) return null;
  const m = (data.modules || []).find(x => x.id === l.moduleId);
  return m ? m.pathId : null;
}
function publishedLessonsOfPath(data, pathId) {
  const mods = new Set((data.modules || []).filter(m => m.pathId === pathId).map(m => m.id));
  return (data.lessons || []).filter(l => l.status === 'published' && mods.has(l.moduleId));
}
function videosOf(data) {
  const out = [];
  for (const l of data.lessons || []) {
    if (l.status !== 'published') continue;
    for (const b of l.blocks || []) if (b.type === 'video') out.push({ id: b.id, title: b.title || b.src || b.id, lessonId: l.id, lessonTitle: l.title, pathId: pathOfLesson(data, l.id) });
  }
  return out;
}
const pathName = (data, id) => ((data.paths || []).find(p => p.id === id) || {}).name || '';
module.exports = { pathOfLesson, publishedLessonsOfPath, videosOf, pathName };
