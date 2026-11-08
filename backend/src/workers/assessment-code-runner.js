const vm = require("node:vm");
const { DatabaseSync, constants } = require("node:sqlite");
const { isDeepStrictEqual } = require("node:util");
const hostProcess = process;
const stringify = JSON.stringify;
const SQL_FUNCTIONS = new Set(["avg", "coalesce", "count", "ifnull", "length", "lower", "max", "min", "round", "sum", "upper"]);

function hideHostCapabilities() {
  for (const key of [
    "process", "require", "module", "exports", "__filename", "__dirname",
    "fetch", "WebSocket", "WebSocketStream", "EventSource", "XMLHttpRequest", "console"
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    if (!descriptor) continue;
    if (descriptor.configurable) {
      Object.defineProperty(globalThis, key, {
        value: undefined,
        configurable: false,
        writable: false
      });
    } else if (descriptor.writable) {
      globalThis[key] = undefined;
    } else if (globalThis[key] !== undefined) {
      throw new Error("تعذر عزل واجهات النظام عن كود Python.");
    }
  }
}

function runJavaScript(question, answer) {
  let passed = 0;
  for (const test of question.tests) {
    const context = vm.createContext({ __inputJson: JSON.stringify(test.input) }, {
      codeGeneration: { strings: false, wasm: false }
    });
    vm.runInContext(answer, context, { timeout: 500, displayErrors: false });
    const actual = vm.runInContext(
      `JSON.stringify(globalThis[${JSON.stringify(question.functionName)}](...JSON.parse(__inputJson)))`,
      context,
      { timeout: 500, displayErrors: false }
    );
    if (actual !== undefined && isDeepStrictEqual(JSON.parse(actual), test.expected)) passed += 1;
  }
  return { passed, total: question.tests.length };
}

async function runPython(question, answer) {
  const { loadPyodide } = require("pyodide");
  const pyodide = await loadPyodide();
  hideHostCapabilities();
  pyodide.setStdout({ batched: () => {} });
  await pyodide.runPythonAsync("import sys\nsys.modules['js'] = None");
  pyodide.globals.set("_assessment_student_source", answer);
  await pyodide.runPythonAsync("exec(_assessment_student_source, globals())");
  const fn = pyodide.globals.get(question.functionName);
  let passed = 0;
  if (fn && fn.type === "function") {
    for (const test of question.tests) {
      const args = test.input.map((value) => pyodide.toPy(value));
      let actual;
      let result;
      try {
        result = fn(...args);
        actual = result && typeof result.toJs === "function"
          ? result.toJs({ dict_converter: Object.fromEntries })
          : result;
        if (isDeepStrictEqual(actual, test.expected)) passed += 1;
      } catch {
        // A failed test case is reported as incorrect; the remaining cases still run.
      } finally {
        if (result && typeof result.destroy === "function") result.destroy();
        for (const arg of args) {
          if (arg && typeof arg.destroy === "function") arg.destroy();
        }
      }
    }
  }
  if (fn && typeof fn.destroy === "function") fn.destroy();
  return { passed, total: question.tests.length };
}

function hasTag(html, tag, attributes = "") {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<${escapedTag}\\b${attributes}[^>]*>`, "i").test(html);
}

function runHtml(question, answer) {
  const results = question.checks.map((check) => {
    if (check.kind === "selector" && check.selector === "form label[for]") return hasTag(answer, "label", "\\s+for\\s*=");
    if (check.kind === "selector" && check.selector === 'form input[type="email"]') return hasTag(answer, "input", "\\s+type\\s*=\\s*[\"']?email\\b");
    if (check.kind === "selector" && check.selector === 'form button[type="submit"]') return hasTag(answer, "button", "\\s+type\\s*=\\s*[\"']?submit\\b");
    if (check.kind === "label-for-input") {
      const label = answer.match(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/i);
      return !!label && new RegExp(`<input\\b[^>]*\\bid\\s*=\\s*["']${label[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i").test(answer);
    }
    return false;
  });
  return { passed: results.filter(Boolean).length, total: results.length };
}

function runCss(question, answer) {
  const results = question.checks.map((check) => {
    const selector = check.selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = answer.match(new RegExp(`(?:^|})\\s*${selector}\\s*\\{([^}]*)\\}`, "i"));
    if (!match) return false;
    const property = check.property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declaration = match[1].match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i"));
    if (!declaration) return false;
    const value = declaration[1].trim().toLowerCase();
    if (check.nonEmpty) return !!value;
    if (check.includes) return value.includes(check.includes.toLowerCase());
    return value === String(check.value || "").toLowerCase();
  });
  return { passed: results.filter(Boolean).length, total: results.length };
}

function runSql(question, answer) {
  const query = answer.trim().replace(/;\s*$/, "");
  if (!query || query.includes(";") || !/^(?:SELECT|WITH)\b/i.test(query) || /\bRECURSIVE\b/i.test(query)) {
    return { passed: 0, total: question.tests.length };
  }
  let passed = 0;
  for (const test of question.tests) {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE students (id INTEGER, name TEXT, score REAL, course_id INTEGER); CREATE TABLE courses (id INTEGER, title TEXT);");
      const student = db.prepare("INSERT INTO students (id, name, score, course_id) VALUES (?, ?, ?, ?)");
      for (const row of test.students) student.run(row.id, row.name, row.score, row.course_id);
      const course = db.prepare("INSERT INTO courses (id, title) VALUES (?, ?)");
      for (const row of test.courses) course.run(row.id, row.title);
      db.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
      if (typeof db.enableDefensive === "function") db.enableDefensive(true);
      let reads = 0;
      if (typeof db.setAuthorizer !== "function") {
        throw new Error("نسخة Node.js الحالية لا تدعم العزل المطلوب. حدّثي Node.js ثم أعيدي المحاولة.");
      }
      db.setAuthorizer((action, arg1, arg2, databaseName) => {
        if (action === constants.SQLITE_SELECT) return constants.SQLITE_OK;
        if (action === constants.SQLITE_READ) {
          reads += 1;
          return reads <= 24
            && (databaseName === "main" || databaseName === null)
            && (arg1 === "students" || arg1 === "courses")
            ? constants.SQLITE_OK : constants.SQLITE_DENY;
        }
        if (action === constants.SQLITE_FUNCTION) {
          return SQL_FUNCTIONS.has(String(arg2 || arg1 || "").toLowerCase()) ? constants.SQLITE_OK : constants.SQLITE_DENY;
        }
        return constants.SQLITE_DENY;
      });
      const rows = db.prepare(`SELECT * FROM (${query}) LIMIT 201`).all().map((row) =>
        Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]]))
      );
      if (rows.length <= 200) {
        if (!test.orderMatters) rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const expected = test.expected.map((row) =>
          Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]]))
        );
        if (!test.orderMatters) expected.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        if (isDeepStrictEqual(rows, expected)) passed += 1;
      }
    } finally {
      db.close();
    }
  }
  return { passed, total: question.tests.length };
}

async function main() {
  let input = "";
  for await (const chunk of hostProcess.stdin) input += chunk;
  try {
    const { question, answer } = JSON.parse(input);
    if (typeof answer !== "string" || answer.length > 6000) throw new Error("إجابة برمجية غير صالحة.");
    let result;
    if (question.language === "javascript") result = runJavaScript(question, answer);
    else if (question.language === "python") result = await runPython(question, answer);
    else if (question.language === "html") result = runHtml(question, answer);
    else if (question.language === "css") result = runCss(question, answer);
    else if (question.language === "sql") result = runSql(question, answer);
    else throw new Error("لا يدعم هذا السؤال تقييم كود مكتوب.");
    hostProcess.stdout.write(stringify(result));
  } catch (error) {
    hostProcess.stdout.write(stringify({ error: error.message || "تعذر تقييم الإجابة." }));
  }
}

main();
