/**
 * Read-only dump of every intro surface's current text + banned-register hits.
 * ----------------------------------------------------------------------------
 * Reuses the gate's discovery + normalization pipeline
 * (scripts/lib/register-scan.mjs) so the register-sweep worksheet's "before"
 * column is mechanically true rather than transcribed, and re-running this
 * after the sweep is the completion check: every surface reports zero hits.
 *
 *   node scripts/dump-intro-copy.mjs           hits + context snippets
 *   node scripts/dump-intro-copy.mjs --full    also emit each surface's full
 *                                              pipeline text (noisy: whole-file
 *                                              prose mode includes code)
 *   node scripts/dump-intro-copy.mjs <proto>   limit to one protocol id
 *   node scripts/dump-intro-copy.mjs --generic the Tier-A generic-sentence
 *                                              tripwire's review dump: every
 *                                              flagged unit across the
 *                                              explanation copy files, marked
 *                                              ALLOWED (audit KEEP row) or NEW
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENERIC_ALLOWLIST,
  discoverGenericCopyFiles,
  discoverIntroSurfaces,
  extractText,
  genericRuleHits,
  NO_APP_DIR,
} from "./lib/register-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The routed roster (protocols.ts ids) plus the liquity-fork clause family.
const ROSTER = [
  "aave-v3",
  "aave-v4",
  "asymmetry",
  "compound-v2",
  "compound",
  "dolomite",
  "ebisu",
  "fluid",
  "frankencoin",
  "fx",
  "liquity-v1",
  "liquity",
  "liquity-fork",
  "llamalend",
  "makerdao",
  "maple",
  "moonwell",
  "morpho",
  "pwn",
  "spark",
];

const args = process.argv.slice(2);
const full = args.includes("--full");
const only = args.find((a) => !a.startsWith("--"));
const CONTEXT = 90;

// --generic: the tripwire's review dump — same detector + allowlist as the
// gate (check-explainer-register.mjs Scope 1b), read-only.
if (args.includes("--generic")) {
  let flagged = 0;
  let fresh = 0;
  for (const file of discoverGenericCopyFiles(ROOT)) {
    const rel = path.relative(ROOT, file);
    const hits = genericRuleHits(fs.readFileSync(file, "utf8"));
    if (!hits.length) continue;
    console.log(`\n${rel}`);
    const allowed = GENERIC_ALLOWLIST[rel] ?? [];
    for (const h of hits) {
      flagged++;
      const ok = allowed.some((s) => h.text.includes(s));
      if (!ok) fresh++;
      console.log(`  ${ok ? "ALLOWED" : "NEW    "} :${h.line} ${h.text}`);
    }
  }
  console.log(`\n${flagged} flagged units, ${fresh} unallowlisted`);
  process.exit(0);
}

let files = 0;
let filesWithHits = 0;
let totalHits = 0;

for (const proto of ROSTER) {
  if (only && proto !== only) continue;
  const targets = discoverIntroSurfaces(ROOT, proto);
  if (!targets.length && NO_APP_DIR.has(proto)) continue;
  console.log(`\n=== ${proto} — ${targets.length} surfaces`);
  for (const { file, mode, banned } of targets) {
    files++;
    const text = extractText(fs.readFileSync(file, "utf8"), mode);
    const labels = [];
    const snippets = [];
    for (const [label, re] of banned) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let m;
      let n = 0;
      while ((m = g.exec(text)) !== null && n < 8) {
        n++;
        totalHits++;
        const s = Math.max(0, m.index - CONTEXT);
        const e = Math.min(text.length, m.index + m[0].length + CONTEXT);
        snippets.push(`      …${text.slice(s, e).trim()}…`);
        if (m.index === g.lastIndex) g.lastIndex++;
      }
      if (n) labels.push(`${label}×${n}`);
    }
    if (labels.length) filesWithHits++;
    console.log(`\n  ${path.relative(ROOT, file)}`);
    console.log(`    hits: ${labels.length ? labels.join(" · ") : "none"}`);
    for (const s of snippets) console.log(s);
    if (full) console.log(`    text: ${text}`);
  }
}

console.log(`\n${files} surfaces, ${filesWithHits} with hits, ${totalHits} total hits`);
