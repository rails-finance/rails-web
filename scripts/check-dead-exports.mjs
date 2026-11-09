#!/usr/bin/env node
// check:dead — nothing in this repo may export something nobody imports.
// ----------------------------------------------------------------------------
// This gate exists because dead code here does not read as dead. An exported
// symbol with zero call sites sits in the tree looking exactly like live code:
// reviewers and agents describe it as live because they read the branch, not
// the callers. It cost two wrong answers in 48 hours before the gate existed.
//
// ⇒ WHY IT MATTERS MORE HERE THAN IN MOST REPOS. The product claim is that
// every rendered figure traces to a receipt. When it was first run this gate
// found SEVENTY-SEVEN orphaned provenance builders across twenty protocol
// vocabularies — receipt authorship for figures nothing renders. A graveyard
// of those makes any future audit's "the receipt exists" unverifiable, which is
// the exact statement the product sells.
//
// ⚠️ WHAT IT DOES NOT CATCH: a member of an exported type that nothing ever
// constructs. The first of the two incidents was an `InfoDisclosureTab.icon`
// variant with no call site — a union member, not an export — and knip's
// module graph cannot see it. This retires most of the class, not all of it.
//
// Config lives in knip.json. What it deliberately does NOT see:
//   • `tailwindcss` — reached through @tailwindcss/postcss, never imported, so
//     it sits in `ignoreDependencies`. The only exclusion left.
//   • exports used only inside their own file (`ignoreExportsUsedInFile`).
//     Measured before it was left on: turning it off reports ~50 names, and
//     every one is a type an api/chain reader declares and consumes locally —
//     `RawMaplePoolRow`, `CompoundV2MarketState`, the `types/api/trove*` row
//     shapes. Those are named for readability at their point of use, not for a
//     caller elsewhere, so reporting them is noise. A gate that always fails is
//     as useless as one that cannot.
//
// The verifiers (`scripts/verify/**/*.mjs` and `.ts`) are entries: a reference
// only a verifier calls, such as the scrubber's event-level adapter
// (`aaveV3FlowTimeline`) the index's day rows are tested against, is used.
//
// Both of those are the whole exclusion list. An earlier version of this
// comment also claimed `lib/shared/types/protocols/**` was excluded; `3021ebd`
// collapsed those mirrored declarations onto event-shape.ts and dropped the
// exclusion from knip.json without touching this header, so the note outlived
// the thing it described. There is no path-based exclusion now.
//
// The gate is break-tested, not assumed: add an exported function nobody
// imports and `npm run check:dead` must name it and exit 1.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Verifier imports ─────────────────────────────────────────────────────────
// knip.json lists `scripts/verify/**/*.mjs` and `.ts` as entries, so an export
// only a verifier imports counts as used (break-tested). The reverse is not
// covered: a verifier import that no longer resolves, because the export was
// deleted or the file moved, fails only when the verifier runs. This pass reads
// every verifier's literal imports (static, and `await import()` with or
// without a destructure) and names each one whose file or named export is gone.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXTS = ["", ".ts", ".tsx", ".mjs", ".js", ".json", "/index.ts", "/index.tsx", "/index.js"];
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const f = join(d, n);
    return statSync(f).isDirectory() ? walk(f) : /\.(mjs|ts)$/.test(n) ? [f] : [];
  });
const resolveSpec = (from, spec) => {
  const base = spec.startsWith("@/")
    ? join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  const swap = base.replace(/\.(m?js)$/, ".ts");
  for (const c of [base, swap]) for (const e of EXTS) if (existsSync(c + e) && statSync(c + e).isFile()) return c + e;
  return undefined;
};
const exportsOf = (file, seen = new Set()) => {
  if (seen.has(file)) return { names: new Set(), all: false };
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const names = new Set();
  let all = file.endsWith(".json");
  for (const m of src.matchAll(
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum|abstract class)\s+([A-Za-z_$][\w$]*)/gm,
  ))
    names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}(\s+from\s+["']([^"']+)["'])?/gm))
    for (const part of m[1].split(",")) {
      const n = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (n) names.add(n);
    }
  if (/^export\s+default\b/m.test(src)) names.add("default");
  for (const m of src.matchAll(/^export\s+\*\s+from\s+["']([^"']+)["']/gm)) {
    const t = resolveSpec(file, m[1]);
    if (t) {
      const sub = exportsOf(t, seen);
      sub.names.forEach((n) => names.add(n));
      all ||= sub.all;
    } else all = true;
  }
  return { names, all };
};
const verifierImportProblems = () => {
  const problems = [];
  const dir = join(ROOT, "scripts", "verify");
  for (const f of walk(dir)) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
    const uses = [];
    for (const m of src.matchAll(
      /import\s+(type\s+)?([\w$]+\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+[\w$]+|[\w$]+)?\s*from\s*["']([^"']+)["']/g,
    ))
      uses.push({ spec: m[4], named: m[1] ? [] : (m[3] ?? "").split(",") });
    for (const m of src.matchAll(/(?:const\s+\{([^}]*)\}\s*=\s*)?await\s+import\(\s*["']([^"']+)["']\s*\)/g))
      uses.push({ spec: m[2], named: (m[1] ?? "").split(",") });
    for (const u of uses) {
      const target = resolveSpec(f, u.spec);
      const rel = f.slice(ROOT.length + 1);
      if (target === undefined) {
        problems.push(`${rel}: imports "${u.spec}", which resolves to no file`);
        continue;
      }
      if (target === null || /\.json$/.test(target)) continue;
      const ex = exportsOf(target);
      for (const raw of u.named) {
        const n = raw
          .trim()
          .split(/\s+as\s+|\s*:\s*/)[0]
          .replace(/^type\s+/, "");
        if (n && !ex.names.has(n) && !ex.all)
          problems.push(`${rel}: imports { ${n} } from "${u.spec}", which does not export it`);
      }
    }
  }
  return problems;
};
const broken = verifierImportProblems();
if (broken.length) {
  console.log(broken.join("\n"));
  console.log(
    "\nFAIL — a verifier imports something the app no longer exports.\nRestore the export, or point the verifier at what replaced it.",
  );
  process.exit(1);
}

const run = spawnSync("npx", ["knip", "--reporter", "compact"], { encoding: "utf8" });
const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();

if (run.status === 0) {
  console.log("No unused exports, files or dependencies.");
  process.exit(0);
}

console.log(out);
console.log(
  "\nFAIL — every symbol above is exported and never imported.\n" +
    "Delete it, or wire it to the surface it was written for. If it is genuinely\n" +
    "reachable another way, say how in knip.json rather than leaving it to read as live.",
);
process.exit(1);
