/* Builds static assets without publishing the private data copies under public/data. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "pyodide");
const publicDir = path.join(root, "public");
const outputDir = path.join(root, "dist");
const dest = path.join(outputDir, "vendor", "pyodide", "v314.0.7");

if (!fs.existsSync(src)) {
  console.error("pyodide is not installed. Run npm install first.");
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.cpSync(publicDir, outputDir, {
  recursive: true,
  filter(source) {
    const relative = path.relative(publicDir, source);
    return relative === "" || relative.split(path.sep)[0] !== "data";
  },
});
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Built static assets in ${path.relative(root, outputDir)} (excluding private data copies).`);
