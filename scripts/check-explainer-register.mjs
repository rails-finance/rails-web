/**
 * Static gate: Explanation surfaces keep the plain-words register.
 * ----------------------------------------------------------------------------
 * The explanation-copy charter (rails-ops/standards/explanation-copy-charter.md)
 * splits every traced number into two stories: what it means (the Explanation
 * pane) and how we know it (the provenance receipt). Data epistemics — lane and
 * machinery names, block talk, derivation talk, contract-method names — must
 * never appear in Explanation copy. This gate is the charter's enforcement,
 * modeled on scripts/check-prov-scope.mjs: a pure source-tree read, no RPC, no
 * dev server.
 *
 * Two scopes, two rosters:
 *
 *  1. Explanation surfaces (CONVERTED — complete):
 *     • lib/<proto>/explainer-clauses.tsx
 *     • components/protocol/<proto>/<proto>-event-explainer.tsx
 *     • components/protocol/<proto>/*-position-explanation.tsx
 *     • lib/<proto>/economics.ts        (string literals only — the footnote
 *       strings; identifiers and code stay out of scope)
 *     • EXTRA_EXPLANATION_SURFACES      (surfaces matching none of the above
 *       patterns — e.g. the V2 trove pane in trove-economics.tsx)
 *
 *  2. Intro surfaces (INTRO_SWEPT — grows per sweep wave): listing blurbs,
 *     view-page intros + metadata, view components, and the named card-label
 *     files, discovered roster-first by scripts/lib/register-scan.mjs and
 *     scanned whole-file through the normalization pipeline (which is what
 *     defeats Prettier line-wrapping and HTML entities). Intro surfaces ban
 *     everything BANNED does plus "chain-derived" (INTRO_BANNED) — that term
 *     stays legal in economics.ts where it is a priceKind data token.
 *
 * The banned lists, pipeline, and discovery live in scripts/lib/register-scan.mjs
 * (shared with scripts/dump-intro-copy.mjs so the gate and the review dump can
 * never drift apart).
 *
 *   node scripts/check-explainer-register.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BANNED,
  GENERIC_ALLOWLIST,
  INTRO_BANNED,
  NO_APP_DIR,
  discoverGenericCopyFiles,
  discoverIntroSurfaces,
  extractText,
  genericRuleHits,
  scanText,
} from "./lib/register-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Protocols whose Explanation surfaces have been converted to the charter.
// Grows per rollout wave; the full roster is the end state.
const CONVERTED = [
  "fluid",
  "liquity-v1",
  "liquity-fork",
  "ebisu",
  "asymmetry",
  "compound",
  "compound-v2",
  "moonwell",
  "aave-v3",
  "spark",
  "aave-v4",
  "makerdao",
  "frankencoin",
  "llamalend",
  "fx",
  "morpho",
  "dolomite",
  "maple",
  "pwn",
  "liquity",
  "polaris",
];

// Protocols whose listing blurb, view intros, view components and card labels
// have been swept to the plain-words register (the intro slot grammar in the
// charter). Independent of CONVERTED; grows per sweep wave. End state: all 19
// routed protocols (liquity-fork has no route of its own).
const INTRO_SWEPT = [
  "aave-v3",
  "aave-v4",
  "spark",
  "compound",
  "compound-v2",
  "moonwell",
  "dolomite",
  "liquity-v1",
  "liquity",
  "liquity-fork",
  "asymmetry",
  "ebisu",
  "makerdao",
  "frankencoin",
  "llamalend",
  "morpho",
  "pwn",
  "fluid",
  "fx",
  "maple",
  "polaris",
];

// Clause vocabularies that live outside lib/<proto>/ (shared across a family).
const SHARED_CLAUSES = {
  "liquity-fork": "lib/shared/liquity-fork-explainer-clauses.tsx",
};

// Explanation surfaces that match none of the standard filename patterns. The
// V2 trove pane's economics footnote lives in trove-economics.tsx — it matched
// no roster pattern, so the file sat outside the gate entirely (which is how a
// hand-rolled bold drifted in unenforced). Σ is exempted for this file only:
// its in-card provenance receipts (the sumProv via/formula strings) carry the
// sum notation legitimately — receipts keep their epistemics; every other ban
// still applies to the whole file, pane prose included.
const EXTRA_EXPLANATION_SURFACES = {
  liquity: [
    {
      file: "components/protocol/liquity/trove-economics.tsx",
      mode: "full",
      banned: BANNED.filter(([label]) => label !== "Σ (sum machinery)"),
    },
    // The V2 trove position pane's bullet builder — it matches no roster
    // pattern (not an explainer-clauses/-position-explanation file), so it
    // sat outside the gate entirely, which is how Layer-2 modal copy drifted
    // into its Layer-1 bullets unnoticed (the 2026-07-25 audit). Σ is
    // exempted for the same reason as trove-economics above: the file's one
    // Σ lives in debtInFrontProv's formula string — a provenance receipt,
    // which keeps its epistemics; every other ban applies to the whole file,
    // pane prose included.
    {
      file: "components/trove/use-trove-explanation-items.tsx",
      mode: "full",
      banned: BANNED.filter(([label]) => label !== "Σ (sum machinery)"),
    },
  ],
};

function fileIfExists(p) {
  return fs.existsSync(p) ? p : null;
}

let failures = 0;
let checked = 0;
// `detail` is failure context — printed only on FAIL. Printing it on PASS
// made seven green allowlist checks each read "remove the entry", advice
// that, followed, would have stripped a healthy allowlist.
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const scanTargets = (proto, targets, kind) => {
  for (const { file, mode, banned } of targets) {
    const raw = fs.readFileSync(file, "utf8");
    const hits = scanText(extractText(raw, mode), banned ?? BANNED).map(
      ({ label, match }) => `${label} ("${match.slice(0, 40)}")`,
    );
    check(
      `${path.relative(ROOT, file)} keeps the ${kind} register`,
      hits.length === 0,
      hits.length ? hits.join("; ") : mode === "strings" ? "string literals only" : "",
    );
  }
};

check("converted roster is non-empty", CONVERTED.length > 0, `${CONVERTED.length} protocols`);

// --- Scope 1: Explanation surfaces (panes, clauses, economics footnotes) ----
for (const proto of CONVERTED) {
  const protoDir = path.join(ROOT, "components", "protocol", proto);
  const targets = [];

  const clauses = fileIfExists(path.join(ROOT, "lib", proto, "explainer-clauses.tsx"));
  if (clauses) targets.push({ file: clauses, mode: "full", banned: BANNED });
  const shared = SHARED_CLAUSES[proto] && fileIfExists(path.join(ROOT, SHARED_CLAUSES[proto]));
  if (shared) targets.push({ file: shared, mode: "full", banned: BANNED });

  if (fs.existsSync(protoDir)) {
    for (const entry of fs.readdirSync(protoDir)) {
      if (/-event-explainer\.tsx$/.test(entry) || /-position-explanation\.tsx$/.test(entry)) {
        targets.push({ file: path.join(protoDir, entry), mode: "full", banned: BANNED });
      }
    }
  }

  const economics = fileIfExists(path.join(ROOT, "lib", proto, "economics.ts"));
  if (economics) targets.push({ file: economics, mode: "strings", banned: BANNED });

  for (const extra of EXTRA_EXPLANATION_SURFACES[proto] ?? []) {
    const f = fileIfExists(path.join(ROOT, extra.file));
    if (f) targets.push({ file: f, mode: extra.mode, banned: extra.banned });
  }

  check(`${proto}: found explanation surfaces`, targets.length > 0, `${targets.length} files`);
  scanTargets(proto, targets, "explanation");
}

// --- Scope 1b: the Tier-A generic-sentence tripwire -------------------------
// The learn-more-modal grammar's boundary rule, enforced: a figure-free
// sentence with a class subject ("Redemptions exchange…", "A redeemed trove
// loses…") states a protocol rule, which is Layer-2 modal material, not a
// Layer-1 pane bullet. Detector + allowlist live in lib/register-scan.mjs
// (shared with dump-intro-copy.mjs --generic). The allowlist is seeded from
// the 2026-07-25 audit's Miles-approved KEEP rows; a new unallowlisted hit is
// a fresh Layer-2-in-Layer-1 defect — move the sentence into the surface's
// "?" modal (authored to the modal register, not pasted) and delete the
// bullet, per the audit's dispositions.
{
  const files = discoverGenericCopyFiles(ROOT);
  check("generic-sentence tripwire found copy files", files.length > 0, `${files.length} files`);
  const hitsByFile = new Map();
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const hits = genericRuleHits(fs.readFileSync(file, "utf8"));
    hitsByFile.set(rel, hits);
    const allowed = GENERIC_ALLOWLIST[rel] ?? [];
    const fresh = hits.filter((h) => !allowed.some((s) => h.text.includes(s)));
    check(
      `${rel} carries no unallowlisted generic-rule sentence`,
      fresh.length === 0,
      fresh.map((h) => `:${h.line} "${h.text.slice(0, 80)}"`).join("; "),
    );
  }
  // Stale-entry flagging (the check-prov-scope.mjs idiom): every allowlist
  // sentence must still match a flagged unit in its file — a removed or
  // rewritten sentence must take its allowlist row with it.
  for (const [rel, sentences] of Object.entries(GENERIC_ALLOWLIST)) {
    const hits = hitsByFile.get(rel);
    check(`allowlist file "${rel}" is on the tripwire roster`, hits != null);
    for (const s of sentences) {
      check(
        `allowlist entry still matches a flagged unit — "${s.slice(0, 60)}"`,
        (hits ?? []).some((h) => h.text.includes(s)),
        hits == null ? "file not scanned" : "no unit flags this sentence any more — remove the entry",
      );
    }
  }
}

// --- Scope 2: intro surfaces (listing blurbs, view intros, card labels) -----
// Discovery + the found-surfaces assertion run for the FULL roster, so a new
// protocol (or a renamed listing file) cannot silently escape the walk; only
// INTRO_SWEPT protocols are actually scanned.
const introSurfaces = new Map();
for (const proto of CONVERTED) {
  const targets = discoverIntroSurfaces(ROOT, proto);
  introSurfaces.set(proto, targets);
  check(`${proto}: found intro surfaces`, targets.length > 0, `${targets.length} files`);
  if (!NO_APP_DIR.has(proto)) {
    check(
      `${proto}: intro surfaces include the listing`,
      targets.some(({ file }) => /-listing\.tsx$/.test(file)),
    );
  }
}

for (const proto of INTRO_SWEPT) {
  check(`${proto}: INTRO_SWEPT id is in the roster`, CONVERTED.includes(proto));
  scanTargets(proto, introSurfaces.get(proto) ?? [], "intro");
}

// Reverse-completeness: the sweep is finished, so the two rosters must match —
// a protocol added to CONVERTED without joining INTRO_SWEPT (or vice versa) is
// a gap, not a wave.
{
  const missing = CONVERTED.filter((p) => !INTRO_SWEPT.includes(p));
  const extra = INTRO_SWEPT.filter((p) => !CONVERTED.includes(p));
  check(
    "INTRO_SWEPT covers the full roster (reverse-completeness)",
    missing.length === 0 && extra.length === 0,
    missing.length || extra.length ? `missing: [${missing}] extra: [${extra}]` : `${INTRO_SWEPT.length} protocols`,
  );
}

console.log(`\n${checked - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
