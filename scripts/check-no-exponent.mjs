/**
 * Static gate: no amount on the site renders in exponent form ("2.07e-8").
 *
 * A figure too small to state reads "<0.000001" (formatTinyNonZero in
 * lib/utils/format.ts), with its exact decimal in a tooltip. The calls that
 * can print an exponent are the ones this gate refuses in lib/, components/
 * and app/:
 *
 *   .toExponential(…)                     always exponent form
 *   .toPrecision(…)                       exponent form below 1e-6
 *   notation: "scientific" / "engineering" in an Intl format
 *
 * A call whose output never reaches the page (parsed straight back into a
 * number) passes with `exponent-safe: <why>` in a comment on its line or the
 * line above. `String(n)` and `${n}` on a small float print an exponent too,
 * but the gate cannot tell a float from an integer or a raw string, so those
 * stay a review question: route a displayed amount through formatNumber.
 *
 *   node scripts/check-no-exponent.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["lib", "components", "app"];
const CALLS = [
  { what: ".toExponential()", re: /\.toExponential\(/ },
  { what: ".toPrecision()", re: /\.toPrecision\(/ },
  { what: 'Intl notation "scientific"/"engineering"', re: /notation:\s*["'](scientific|engineering)["']/ },
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) yield* walk(p);
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) yield p;
  }
}

const failures = [];
for (const d of DIRS) {
  for (const file of walk(path.join(ROOT, d))) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      for (const c of CALLS) {
        if (!c.re.test(code)) continue;
        if (/exponent-safe:/.test(line) || /exponent-safe:/.test(lines[i - 1] ?? "")) continue;
        failures.push(`${path.relative(ROOT, file)}:${i + 1}  ${c.what}  ${line.trim()}`);
      }
    });
  }
}

if (failures.length) {
  console.error(`check:exponent — ${failures.length} call(s) can print an amount in exponent form:\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nRoute the figure through formatNumber / formatTinyNonZero (lib/utils/format.ts), or mark a call whose" +
      "\noutput never reaches the page with `exponent-safe: <why>` on its line or the line above.",
  );
  process.exit(1);
}
console.log("check:exponent — no exponent-form amount formatting.");
