/**
 * Static gate: a caught error reaches a response only through
 * publicErrorMessage (lib/api/public-error.ts), which removes RPC URLs and keys.
 *
 * Rule: in app/api/**\/*.ts, in any lib file that imports next/server, and in
 * the READERS a route returns whole, a line outside a console.* call fails if
 * it reads `<caught>.message`, `String(<caught>)` or `${<caught>}`, where
 * <caught> is a catch binding or a settled result's `.reason`.
 *
 *   node scripts/check-error-bodies.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// lib readers whose result a route answers with as it stands.
const READERS = ["lib/wallet/read-wallet.ts"];

const walk = (rel) =>
  fs
    .readdirSync(path.join(ROOT, rel), { recursive: true })
    .map((f) => path.join(rel, f))
    .filter((f) => f.endsWith(".ts") && fs.statSync(path.join(ROOT, f)).isFile());

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const files = [
  ...new Set([...walk("app/api"), ...walk("lib").filter((f) => /from "next\/server"/.test(read(f))), ...READERS]),
].sort();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let failures = 0;
for (const file of files) {
  const src = read(file);
  const bound = new Set();
  for (const m of src.matchAll(/\bcatch\s*\(\s*(\w+)/g)) bound.add(m[1]);
  for (const m of src.matchAll(/\.catch\(\s*(?:async\s*)?\(?\s*(\w+)/g)) bound.add(m[1]);
  const names = [...[...bound].map(esc), "\\w+\\.reason"];
  const alt = names.join("|");
  const bad = new RegExp(`\\b(?:${alt})\\.message\\b|\\bString\\(\\s*(?:${alt})\\s*\\)|\\$\\{\\s*(?:${alt})\\s*\\}`);
  let consoleDepth = 0;
  src.split("\n").forEach((line, i) => {
    let inConsole = consoleDepth > 0;
    const start = line.search(/\bconsole\.\w+\(/);
    if (consoleDepth === 0 && start >= 0) {
      inConsole = true;
      consoleDepth = 0;
      for (const ch of line.slice(start)) consoleDepth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
      if (consoleDepth < 0) consoleDepth = 0;
    } else if (consoleDepth > 0) {
      for (const ch of line) consoleDepth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
      if (consoleDepth < 0) consoleDepth = 0;
    }
    if (inConsole || !bad.test(line)) return;
    failures++;
    console.log(`FAIL  ${file}:${i + 1} — a caught error reaches a body without publicErrorMessage: ${line.trim()}`);
  });
}

console.log(`\n${files.length} files checked, ${failures} failure(s).`);
if (files.length === 0) {
  console.log("FAIL  no files matched");
  process.exit(1);
}
process.exit(failures > 0 ? 1 : 0);
