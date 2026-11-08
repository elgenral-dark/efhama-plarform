const { DatabaseSync, constants } = require("node:sqlite");

const MAX_READ_ACTIONS = 24;
const FUNCTION_ALLOWLIST = new Set([
  "avg", "coalesce", "count", "ifnull", "length", "lower", "max", "min",
  "round", "sum", "upper"
]);

const normalize = (row) => Object.fromEntries(
  Object.keys(row).sort().map((key) => [key, row[key]])
);

const normalizeRows = (rows, ordered) => {
  const result = rows.map(normalize);
  return ordered ? result : result.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
};

function runTest(query, test) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE students (id INTEGER, name TEXT, score REAL, course_id INTEGER);
      CREATE TABLE courses (id INTEGER, title TEXT);
    `);
    const addStudent = db.prepare("INSERT INTO students (id, name, score, course_id) VALUES (?, ?, ?, ?)");
    for (const student of test.students) {
      addStudent.run(student.id, student.name, student.score, student.course_id);
    }
    const addCourse = db.prepare("INSERT INTO courses (id, title) VALUES (?, ?)");
    for (const course of test.courses) addCourse.run(course.id, course.title);

    db.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
    if (typeof db.enableDefensive === "function") db.enableDefensive(true);
    // فشل مغلق: لا نشغّل أي استعلام بدون authorizer لأنه الحاجز الذي يحصر القراءة في جداول التحدي
    if (typeof db.setAuthorizer !== "function") {
      throw new Error("نسخة Node.js الحالية لا تدعم العزل المطلوب لتشغيل SQL. حدّثي Node.js ثم أعيدي المحاولة.");
    }
    let readActions = 0;
    db.setAuthorizer((action, arg1, arg2, databaseName) => {
      if (action === constants.SQLITE_SELECT) return constants.SQLITE_OK;
      if (action === constants.SQLITE_READ) {
        readActions += 1;
        if (readActions > MAX_READ_ACTIONS) return constants.SQLITE_DENY;
        return (databaseName === "main" || databaseName === null)
          && (arg1 === "students" || arg1 === "courses")
          ? constants.SQLITE_OK : constants.SQLITE_DENY;
      }
      if (action === constants.SQLITE_FUNCTION) {
        return FUNCTION_ALLOWLIST.has(String(arg2 || arg1 || "").toLowerCase())
          ? constants.SQLITE_OK : constants.SQLITE_DENY;
      }
      return constants.SQLITE_DENY;
    });

    const rows = db.prepare(`SELECT * FROM (${query}) LIMIT 201`).all();
    if (rows.length > 200) throw new Error("أعاد الاستعلام صفوفًا أكثر من الحد المسموح.");
    const actual = normalizeRows(rows, test.orderMatters === true);
    const expected = normalizeRows(test.expected, test.orderMatters === true);
    return JSON.stringify(actual) === JSON.stringify(expected);
  } finally {
    db.close();
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.once("end", () => {
  try {
    const { query, tests } = JSON.parse(input);
    let passed = 0;
    for (const test of tests) {
      if (runTest(query, test)) passed += 1;
    }
    process.stdout.write(JSON.stringify({ passed, total: tests.length }));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      error: error.message || "تعذر تنفيذ استعلام SQL في قاعدة بيانات التحدي المعزولة."
    }));
  }
});
