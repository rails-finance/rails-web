/**
 * Static gate: every components/**\/*-view*.tsx must be able to self-report
 * its own provenance. `<Prov>` outside a `<ProvReceiptsScope>` renders its
 * children verbatim and registers nothing, and the dev tripwire only sweeps
 * between a scope's bookends — so an unscoped market/system view can never
 * surface its own gaps, and a bare `<Prov>` tag proves nothing about it.
 *
 * This is a pure source-tree read: no RPC, no dev server. A file passes if
 * it contains a `<ProvReceiptsScope` usage, exports `PROV_EXEMPT = "<reason>"`,
 * or is named on the ALLOWLIST below with a reason comment. Anything else is
 * a silent gap the tripwire cannot see, and fails the gate.
 *
 *   node scripts/check-prov-scope.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENTS_DIR = path.join(ROOT, "components");

// Views still unscoped after the market-surface provenance rollout. Each entry
// names the reason it isn't scoped yet, not a TODO to silence the gate — remove
// an entry the same change that adds its `<ProvReceiptsScope>`.
//
// The list is now EMPTY: aave-v4-hub-views was the last holdout (its LT figure
// is a range aggregated over N spokes, which needed a receipt-shape decision
// before it could be scoped). It gained a <ProvReceiptsScope> + the computed
// range receipts in lib/aave-v4/hub-provenance.ts, so its entry is gone. The
// gate handles an empty allowlist — the object is kept so the next unscoped
// view has an obvious, documented place to land.
const ALLOWLIST = {};

function findViewFiles(dir) {
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/-view.*\.tsx$/.test(entry.name)) continue;
    matches.push(path.join(entry.parentPath ?? entry.path, entry.name));
  }
  return matches.sort();
}

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const files = findViewFiles(COMPONENTS_DIR);

// A glob that matches nothing is not a green result — it means the check
// ran over an empty set and every downstream `.every()`-style assertion
// would have been vacuously true. Fail loudly instead of passing quietly.
check("components/**/*-view*.tsx glob matched at least one file", files.length > 0, `matched ${files.length}`);

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const name = path.basename(file, ".tsx");
  const source = fs.readFileSync(file, "utf8");

  const hasScope = /<ProvReceiptsScope[\s>]/.test(source);
  const hasExempt = /export\s+const\s+PROV_EXEMPT\s*=\s*["'`]/.test(source);
  const allowlisted = Object.prototype.hasOwnProperty.call(ALLOWLIST, name);

  const cond = hasScope || hasExempt || allowlisted;
  const detail = hasScope
    ? "has <ProvReceiptsScope>"
    : hasExempt
      ? "exports PROV_EXEMPT"
      : allowlisted
        ? `allowlisted — ${ALLOWLIST[name]}`
        : "no scope, no PROV_EXEMPT, not on the allowlist";
  check(rel, cond, detail);
}

// Every allowlist entry should correspond to a file that actually exists and
// actually needs it — an entry for a file that's since been scoped is a
// stale exemption, not a real one.
const foundNames = new Set(files.map((f) => path.basename(f, ".tsx")));
for (const name of Object.keys(ALLOWLIST)) {
  check(
    `allowlist entry "${name}" still points at an unscoped file`,
    foundNames.has(name) &&
      !/<ProvReceiptsScope[\s>]/.test(
        fs.readFileSync(
          files.find((f) => path.basename(f, ".tsx") === name),
          "utf8",
        ),
      ),
    foundNames.has(name) ? "" : "no matching file — remove this entry",
  );
}

console.log(`\n${checked - failures} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
