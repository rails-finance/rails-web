/**
 * Static gate: every page says how it stands under Focus mode (ui-jobs 557).
 *
 * Focus is strict everywhere (Miles, 9 Nov 2026), and a page nobody wired up
 * leaks: it shows other assets and chains under a focus. So each page declares
 * itself, in its own source or in a module it imports (two levels down):
 *
 *   • it filters through the shared pieces: `AimGate`, `useScopedRows`,
 *     `useScopedRoster`, `InFocusSymbol`, `useAssetScope`; or
 *   • it says why it needs none, in a line comment `// focus: <reason>`
 *     (a page about Rails itself, a legal page, a redirect).
 *
 * The shell's `FocusChainGate` (components/shared/aim-gate.tsx) already stands
 * over every route on a chain the focus leaves out, over an explorer the asset
 * focus hides and over an asset page outside it; a page inside an explorer
 * still declares what it shows.
 *
 * The pages not yet declared are listed in scripts/focus-undeclared.txt. The
 * check fails on a page that is neither declared nor listed (a new page must
 * say how it stands), and on a listed page that is now declared (the list only
 * shrinks). Run with `--write` to rewrite the list from the tree.
 *
 *   node scripts/check-focus.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIST = path.join(ROOT, "scripts", "focus-undeclared.txt");
const MARKERS = [/\bAimGate\b/, /\buseScopedRows\b/, /\buseScopedRoster\b/, /\bInFocusSymbol\b/, /\buseAssetScope\b/];
const EXEMPT = /^\s*\/\/\s*focus:\s*\S/m;
const DEPTH = 2;

function pages(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "api") continue;
      out.push(...pages(p));
    } else if (e.name === "page.tsx") out.push(p);
  }
  return out;
}

/** The route a page serves: groups `(x)` dropped, `[x]` kept as written. */
const routeOf = (file) =>
  "/" +
  path
    .relative(path.join(ROOT, "app"), path.dirname(file))
    .split(path.sep)
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .join("/");

function resolve(from, spec) {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = base + ext;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

const cache = new Map();
const read = (f) => {
  if (!cache.has(f)) cache.set(f, fs.readFileSync(f, "utf8"));
  return cache.get(f);
};

/** How a page declares itself: "filters", "exempt", or null. */
function declared(file) {
  const src = read(file);
  if (EXEMPT.test(src)) return "exempt";
  const seen = new Set([file]);
  let layer = [file];
  for (let d = 0; d <= DEPTH; d++) {
    const next = [];
    for (const f of layer) {
      const s = read(f);
      if (MARKERS.some((m) => m.test(s))) return "filters";
      if (d === DEPTH) continue;
      for (const m of s.matchAll(/from\s+"([^"]+)"/g)) {
        const r = resolve(f, m[1]);
        // The shell and the shared Focus modules mention the markers; a page
        // importing them for something else is not declared by that.
        if (!r || seen.has(r) || /components\/(nav|shared\/(asset-scope|aim-|in-focus|focus-))/.test(r)) continue;
        seen.add(r);
        next.push(r);
      }
    }
    layer = next;
  }
  return null;
}

const all = pages(path.join(ROOT, "app")).map((f) => ({ file: f, route: routeOf(f), how: declared(f) }));
const undeclared = all.filter((p) => !p.how).map((p) => p.route);
const unique = [...new Set(undeclared)].sort();

if (process.argv.includes("--write")) {
  fs.writeFileSync(
    LIST,
    "# Pages not yet declared under Focus mode (scripts/check-focus.mjs). This list only shrinks.\n" +
      unique.join("\n") +
      "\n",
  );
  console.log(`check:focus: wrote ${unique.length} undeclared page(s) to scripts/focus-undeclared.txt`);
  process.exit(0);
}

const listed = new Set(
  (fs.existsSync(LIST) ? fs.readFileSync(LIST, "utf8") : "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")),
);
const fresh = unique.filter((r) => !listed.has(r));
const gone = [...listed].filter((r) => !unique.includes(r));
const filters = all.filter((p) => p.how === "filters").length;
const exempt = all.filter((p) => p.how === "exempt").length;
console.log(
  `check:focus: ${all.length} pages: ${filters} filter, ${exempt} exempt with a reason, ${unique.length} not yet declared (listed)`,
);
for (const r of fresh) console.log(`  not declared and not listed: ${r}`);
for (const r of gone) console.log(`  declared now, take it off the list: ${r}`);
if (fresh.length || gone.length) process.exit(1);
