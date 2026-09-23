/**
 * Static gate: every locale-sensitive format call names its locale.
 *
 * `n.toLocaleString()` and `n.toLocaleString(undefined, …)` do not mean "the
 * default format" — they mean "whatever locale the runtime happens to be set
 * to". Since the detail pages render on the server, that is two different
 * runtimes for the same markup: a server that speaks en-US writes "1,234" and
 * a browser set to de-DE writes "1.234", and React discards the server's
 * markup for that subtree and redraws it client-side (error #418). The reader
 * sees a flash; the page is no longer the document the server sent.
 *
 * So the locale is written at the call site, never inferred:
 *
 *   numbers → "en-US"   grouping "," decimal "." — what the 27 already-pinned
 *                       number sites use, and what every figure on the site
 *                       has always rendered as
 *   dates   → "en-GB"   day-first "7 Feb 2026" — what lib/date.ts formatDate
 *                       pins and what the prose around the dates writes
 *
 * This gate does not check WHICH locale, only that one is named: a call whose
 * first argument is a string literal passes. Picking the wrong one is a review
 * question; picking none is a hydration bug, and that is what fails here.
 *
 * ── THE SAME BUG WEARS A SECOND FACE: THE TIME ZONE ────────────────────────
 * Naming the locale is only half of it. `toLocaleDateString("en-GB", { … })`
 * with no `timeZone` still formats in whatever zone the RUNTIME sits in, and
 * so do `getHours()`, `getFullYear()` and `toDateString()`. A server in London
 * and a browser in Berlin write 19:19 and 20:19 into the same span — the same
 * repaint, from a different axis — and near midnight they disagree about the
 * DAY. Every timestamp this site renders is a block timestamp, which is a UTC
 * instant, and two readers of one event must be given one time. So:
 *
 *   every date/time format call passes  timeZone: "UTC"
 *   date parts are read with the UTC getters — getUTCHours, getUTCFullYear,
 *     toISOString — never the local ones
 *
 *   node scripts/check-locale.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["lib", "components", "app"];

// A locale argument is a string literal in the first position. Anything else —
// `undefined`, nothing at all, a variable — is unpinned.
const CALLS = [
  { what: "toLocaleString", re: /\.toLocaleString\((?!["'])/g },
  { what: "toLocaleDateString", re: /\.toLocaleDateString\((?!["'])/g },
  { what: "toLocaleTimeString", re: /\.toLocaleTimeString\((?!["'])/g },
  { what: "Intl.NumberFormat", re: /\bIntl\.NumberFormat\((?!["'])/g },
  { what: "Intl.DateTimeFormat", re: /\bIntl\.DateTimeFormat\((?!["'])/g },
  { what: "Intl.RelativeTimeFormat", re: /\bIntl\.RelativeTimeFormat\((?!["'])/g },
  { what: "Intl.ListFormat", re: /\bIntl\.ListFormat\((?!["'])/g },
  { what: "Intl.PluralRules", re: /\bIntl\.PluralRules\((?!["'])/g },
];

// Reading a date part in the runtime's own zone. Each has a getUTC* twin; a day
// key wants `toISOString().slice(0, 10)`.
const LOCAL_ZONE_READS = [
  /\.getHours\(\)/,
  /\.getMinutes\(\)/,
  /\.getSeconds\(\)/,
  /\.getFullYear\(\)/,
  /\.getMonth\(\)/,
  /\.getDate\(\)/,
  /\.getDay\(\)/,
  /\.toDateString\(\)/,
  /\.toTimeString\(\)/,
];

// A date/time format call must carry a zone. The options object can run over
// several lines, so the call is read to its matching close paren rather than
// grepped a line at a time.
const ZONED_CALLS = [
  { what: "toLocaleDateString", token: ".toLocaleDateString(" },
  { what: "toLocaleTimeString", token: ".toLocaleTimeString(" },
  { what: "Intl.DateTimeFormat", token: "Intl.DateTimeFormat(" },
];

/** The source of one call, from its open paren to the matching close. */
function callText(src, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(openParenIndex, i + 1);
    }
  }
  return src.slice(openParenIndex);
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function sourceFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const entries = fs.readdirSync(abs, { recursive: true, withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    matches.push(path.join(entry.parentPath ?? entry.path, entry.name));
  }
  return matches.sort();
}

let scanned = 0;
let failures = 0;

for (const dir of DIRS) {
  for (const file of sourceFiles(dir)) {
    scanned += 1;
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (const { what, re } of CALLS) {
      lines.forEach((line, i) => {
        re.lastIndex = 0;
        if (!re.test(line)) return;
        failures += 1;
        console.log(`FAIL ${path.relative(ROOT, file)}:${i + 1} — ${what} with no locale`);
        console.log(`     ${line.trim()}`);
      });
    }

    for (const re of LOCAL_ZONE_READS) {
      lines.forEach((line, i) => {
        if (!re.test(line)) return;
        failures += 1;
        console.log(`FAIL ${path.relative(ROOT, file)}:${i + 1} — reads a date part in the runtime's zone`);
        console.log(`     ${line.trim()}`);
      });
    }

    for (const { what, token } of ZONED_CALLS) {
      let from = 0;
      for (;;) {
        const at = src.indexOf(token, from);
        if (at === -1) break;
        from = at + token.length;
        const open = at + token.length - 1;
        const call = callText(src, open);
        if (call.includes("timeZone")) continue;
        failures += 1;
        const line = lineOf(src, at);
        console.log(`FAIL ${path.relative(ROOT, file)}:${line} — ${what} with no timeZone`);
        console.log(`     ${lines[line - 1].trim()}`);
      }
    }
  }
}

console.log(
  `\n${scanned} files scanned, ${failures} unpinned ${failures === 1 ? "call" : "calls"}` +
    (failures
      ? `\nName the locale ("en-US" numbers, "en-GB" dates) and the zone (timeZone: "UTC", or the getUTC* twin).`
      : ""),
);
process.exit(failures > 0 ? 1 : 0);
