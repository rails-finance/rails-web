/**
 * Shared register-scan machinery for the explanation-copy gate and the
 * intro-copy dump. One home for the banned-term lists, the text-normalization
 * pipeline, and the roster-driven discovery of intro surfaces, so
 * check-explainer-register.mjs and dump-intro-copy.mjs can never drift apart.
 *
 * The pipeline exists because two silent holes let register drift through the
 * old gate: /\breplay\b/i does not match "replayed" (the trailing \b fails
 * before the "e"), and Prettier wraps JSX text so a multi-word phrase split
 * across lines evades any single-line ban. Every scan therefore runs the full
 * pre-pass: stripComments → stripImports → decodeEntities → stripTags →
 * whitespace-normalize. Comments are stripped FIRST deliberately — the parent
 * CLAUDE.md language rule prescribes "replay"/"reconcile" as the approved
 * replacements for the banned word "fold", so code comments keep those words
 * freely; only rendered copy is held to the register.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, for the roster reads below. */
const SCAN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Banned terms
// ---------------------------------------------------------------------------

// Banned register terms — each entry: [label, regex]. Case-insensitive where
// the term is prose; word-bounded where an identifier could contain it.
export const BANNED = [
  ["Σ (sum machinery)", /Σ/],
  ["settled read", /settled read/i],
  ["head block", /head block/i],
  ["settlement math", /settlement math/i],
  ["resolver", /\bresolver\b/i],
  ["at the same block", /at the same block/i],
  // Repaired: /\breplay\b/i missed "replayed" — the dominant form in the copy.
  ["replay lane talk", /\breplay(s|ed|ing)?\b/i],
  ["lane", /\blanes?\b/i],
  ["MV talk", /\bmaterialized view\b|\bMV\b/],
  ["eth_call", /eth_call/],
  ["getLogs", /getLogs/],
  ["multicall", /multicall/i],
  ["live read", /live read/i],
  ["wei-exact", /wei-exact/i],
  ["verified against the chain", /verified against the chain/i],
  ["trace each number", /trace each number/i],
  ["every receipt says so", /every receipt says so/i],
  ["balanceOf", /balanceOf/],
  // Narrowed deliberately: /\breconcil\w*/ false-positives on identifiers
  // like reconcileAaveV4Assets.
  ["reconciled", /\breconciled\b|\breconciliation\b/i],
  // Contract-method names that leak the pipeline into prose.
  [
    "contract method name",
    /getUserAccountData|balanceOfUnderlying|convertToExitAssets|user_state|exchangePricesAndRates|getAccountLiquidity|getAdjustedAccountValues|getCurrentICR\(|getAssetPrice|getMarketPrice|\bgetPrice\b|\bgetPosition\b|\btotalAssets\b|get_sum_xy|getUtilization|getSupplyRate|getBorrowRate/,
  ],
];

// Intro surfaces (listing blurbs, view-page intros, view components, card
// labels) additionally ban "chain-derived". INTRO-scope only: ten green
// economics.ts files carry "chain-derived" as a data token
// (priceKind: "chain-derived"), not copy — a global ban would fail all ten.
export const INTRO_BANNED = [...BANNED, ["chain-derived", /chain-derived/i]];

// ---------------------------------------------------------------------------
// Normalization pipeline
// ---------------------------------------------------------------------------

/** Strip block + line comments (naive but sufficient for these files: no
 *  comment markers inside the copy strings themselves). */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^:])\/\/(?![^\n]*["'`]).*$/gm, "$1");
}

/** Remove import/re-export statements: module paths and imported identifiers
 *  carry resolver/getLogs-style names and never carry copy. */
export function stripImports(src) {
  return src
    .replace(/^import\b[^;'"]*?["'][^"'\n]*["'];?\s*$/gm, "")
    .replace(/^import\s+["'][^"'\n]*["'];?\s*$/gm, "")
    .replace(/^export\s+(?:\*|\{[^}]*\})\s+from\s+["'][^"'\n]*["'];?\s*$/gm, "");
}

const ENTITIES = {
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&apos;": "'",
  "&quot;": '"',
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&nbsp;": " ",
  "&thinsp;": " ",
  "&times;": "×",
  "&rarr;": "→",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

/** Decode HTML entities so a ban is not evadable by writing e.g. "&rsquo;"
 *  inside a phrase (Prettier-authored JSX copy uses them heavily). */
export function decodeEntities(src) {
  return src
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

/** Remove tag-shaped sequences (an inline <span> must not split a banned
 *  phrase). Only strips real tag shapes — comparisons and arrows survive. */
export function stripTags(src) {
  return src.replace(/<\/?[a-zA-Z][^<>]*>/g, " ").replace(/<\/?>/g, " ");
}

/** Collapse all whitespace to single spaces — what makes multi-word bans work
 *  at all under Prettier's line wrapping. */
export function normalizeWhitespace(src) {
  return src.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Hover text is a receipt
// ---------------------------------------------------------------------------
// ⚠️ THE GATE ALREADY EXEMPTED HOVER TEXT — BY ACCIDENT, AND ONLY IN ONE
// SYNTAX. `stripTags` removes whole tag shapes, attributes included, so
// `<span title="Comet.getUtilization — totalBorrow ÷ totalSupply…">` has never
// been scanned. The identical sentence written as a PROP — `title:` on a
// <VitalsBand> vital, which is how the band requires a usage figure to state
// its quotient — was scanned, and failed. Six market views were red on exactly
// that asymmetry: the same words, the same reader-facing behaviour (a hover),
// legal in an attribute and banned in an object.
//
// The charter settles which way to resolve it: a receipt keeps its own
// register, and hover text stating a derivation IS a receipt — "Σ borrowed ÷ Σ
// supplied, both in USD at the Comptroller's own oracle price" is the
// epistemics of the figure, which is what a receipt is for and what an
// Explanation pane may not say. So hover text is stripped in every syntax it is
// written in, and the asymmetry closes in the direction the charter names.
//
// Measured before it was applied, across all 21 swept protocols: 105 surfaces,
// 208 title-bound strings, 14 carrying a banned term — every one of the 14 a
// hover stating a derivation (Σ quotients, `Comet.getBorrowRate`,
// `IAaveOracle getAssetPrice`, one "resolver", one "live read"). Nothing
// visible is silenced by this, because visible copy is never a `title`.
//
// What is NOT stripped: everything else in the file. A banned term in a label,
// a blurb, a heading or body text still fails, in the same file, on the same
// run. The bindings matched are `title:`, `title=`, `title={…}` and a const
// whose name ends in Title (dolomite writes its price hover that way), and only
// the STRING LITERALS inside such a binding's expression are removed — the code
// around them is left for the other rules to read.
const TITLE_BINDING = /\b\w*[Tt]itle\s*[:=]\s*/g;

/** Where a bound expression ends: the first `;`, or the first `,`/closing
 *  bracket at the depth the expression started at. Quotes and template
 *  literals are skipped whole so a comma inside copy never ends it. */
function expressionEnd(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length; i++) {
        if (src[i] === "\\") i++;
        else if (src[i] === c) break;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return i;
      depth--;
    } else if (depth === 0 && (c === ";" || c === ",")) return i;
  }
  return src.length;
}

/** Blank the contents of every string / template literal in a span. */
function blankStrings(span) {
  return span.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/gs, '""');
}

/** Remove the text of hover strings, wherever the syntax puts them. */
export function stripHoverText(src) {
  let out = "";
  let last = 0;
  TITLE_BINDING.lastIndex = 0;
  let m;
  while ((m = TITLE_BINDING.exec(src)) !== null) {
    const start = m.index + m[0].length;
    if (start < last) continue; // already inside a span we consumed
    const end = expressionEnd(src, start);
    out += src.slice(last, start) + blankStrings(src.slice(start, end));
    last = end;
    TITLE_BINDING.lastIndex = end;
  }
  return out + src.slice(last);
}

/** The full prose pre-pass, in the required order. */
export function prosePipeline(src) {
  return normalizeWhitespace(stripTags(decodeEntities(stripHoverText(stripImports(stripComments(src))))));
}

/** Extract quoted string + template literals (for economics.ts note strings). */
export function stringLiterals(src) {
  const out = [];
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[0]);
  return out.join("\n");
}

/** Run a target's mode-appropriate extraction. Modes:
 *  - "full":    comments stripped, otherwise raw (the legacy explainer scan);
 *  - "strings": string literals only (economics.ts);
 *  - "prose":   the full pipeline (intro surfaces — whole file, normalized). */
export function extractText(raw, mode) {
  if (mode === "strings") return normalizeWhitespace(decodeEntities(stringLiterals(stripComments(raw))));
  if (mode === "prose") return prosePipeline(raw);
  return prosePipeline(raw); // "full" gets the hardened pipeline too
}

/** Scan extracted text against a banned list → [{label, match}]. */
export function scanText(text, banned) {
  const hits = [];
  for (const [label, re] of banned) {
    const m = text.match(re);
    if (m) hits.push({ label, match: String(m[0]) });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Tier-A generic-sentence tripwire (the Layer-2-in-Layer-1 gate)
// ---------------------------------------------------------------------------
// The learn-more-modal grammar's boundary rule: a sentence that states a
// protocol rule true of every position — and cites no instance figure — is
// Layer-2 (the "?" modal), not a Layer-1 pane bullet. The 2026-07-25 audit
// swept every explanation surface with exactly this detector (the plan's
// tier-a.mjs); the sweep removed the defects, and this tripwire keeps them
// out. Detection is heuristic, so it is paired with a finite, human-reviewed
// allowlist seeded from the audit's Miles-approved KEEP rows: a flagged
// sentence is either allowlisted (a reviewed state-keyed moral or §5
// mechanic-why that happens to read generic) or a NEW defect that fails the
// gate. Never silence a hit by widening the regexes — add the sentence to
// GENERIC_ALLOWLIST only after the same review the audit rows got.

// An indefinite/plural class subject — the grammatical tell of a rule about
// the protocol in general ("Redemptions exchange…", "A redeemed trove…").
export const GENERIC_SUBJECT =
  /^(A|An|Any|Anyone|Each|Every|Some|Most|Redemptions?|Liquidations?|Borrowers|Lenders|Interest|Troves|Positions|Vaults|Loans|Markets|Depositors)\b/i;
// Instance anchors — a sentence about THIS position/event is Layer-1 by
// definition, whatever its subject.
export const INSTANCE_MARKER = /\b(this|its|it|the position|the trove|the vault|the loan|the account)\b/i;
// Interpolations permitted in a generic sentence: structural type/mode
// constants (the modal grammar's one allowed variable) and string/entity
// tokens. Anything else (a live figure) makes the unit instance-bound and
// out of the tripwire's scope.
export const STRUCTURAL_INTERP = /collateralType|symbol|stablecoin|protocolName|assetName|cfg\.|p\.|"|’|rsquo/;

/** Balanced-paren extraction of copy units — clause( / cont( / items.push(
 *  call bodies. NOT line-based: Prettier wraps sentences across lines, and a
 *  wrapped tail line reads as a standalone fragment (the trap that defeated
 *  the earlier per-line multi-word bans). */
export function extractCopyUnits(src) {
  const out = [];
  const re = /\b(clause|cont|items\.push)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let d = 0;
    const i = re.lastIndex - 1;
    let j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "(") d++;
      else if (c === ")") {
        d--;
        if (d === 0) break;
      }
    }
    out.push({ raw: src.slice(i + 1, j), line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** A unit's reader-facing text: tags out, entities decoded, whitespace
 *  collapsed, leading quote/comma noise trimmed. */
export function normalizeUnitText(raw) {
  return decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/^[\s,"“]+/, "")
    .trim();
}

/** Run the Tier-A detector over one file's source → [{ line, text }]. */
export function genericRuleHits(src) {
  const hits = [];
  for (const u of extractCopyUnits(src)) {
    const t = normalizeUnitText(u.raw);
    if (t.length < 35) continue;
    const interp = [...u.raw.matchAll(/\{([^{}]*)\}/g)].map((x) => x[1]);
    if (!interp.every((s) => STRUCTURAL_INTERP.test(s))) continue;
    if (!GENERIC_SUBJECT.test(t) || INSTANCE_MARKER.test(t)) continue;
    hits.push({ line: u.line, text: t });
  }
  return hits;
}

// The audit's approved KEEP rows that are Tier-A-shaped (the detector flags
// them; Miles reviewed and kept every one on 2026-07-25). Keys are
// repo-relative files; values are decoded sentences (’ not &rsquo;) matched
// as substrings of a flagged unit's normalized text. KEEP rows the detector
// never flags (state-keyed morals with instance subjects) need no entry.
// A stale entry — one no unit matches any more — fails the gate, mirroring
// check-prov-scope.mjs, so a removed sentence cannot leave a dead row.
export const GENERIC_ALLOWLIST = {
  // Signed-balance mode-teller: why a deposit was a repayment (×2 variants).
  "lib/dolomite/explainer-clauses.tsx": ["A negative balance IS the debt here."],
  // §5.2 mechanic-why on the mint fee; the factory-handoff mode explanation
  // (gated on ctx.initialization; no modal covers the handoff — Miles's
  // JUDGMENT ruling, KEEP).
  "lib/frankencoin/explainer-clauses.tsx": [
    "Interest for the remaining term is charged up front at minting, and a fixed share of each mint is held back in the system reserve; the borrower receives the rest.",
    "Every position starts life owned by the factory for a single transaction.",
  ],
  // §2 misleading-figure caveat on the repay card's gap.
  "lib/compound-v2/explainer-clauses.tsx": [
    "Interest accrues continuously, so any gap from the previous event’s figure is that interest, not new borrowing.",
  ],
  // §5.2 — gated on the event exhibiting a draw.
  "lib/liquity-v1/explainer-clauses.tsx": ["A one-time borrowing fee is included in the amount drawn."],
  // The no-change-adjust mode's moral (zero-delta bot retries).
  "lib/liquity/explainer-clauses.tsx": ["Each attempt costs the sender only gas."],
  // §5.3 forward path after cancelling a withdrawal request.
  "lib/maple/explainer-clauses.tsx": ["A new request would join the back of the line."],
};

/** The tripwire's file roster — the same four filename classes the audit
 *  swept: per-protocol clause vocabularies, the shared fork vocabulary,
 *  position-explanation components, and the V2 trove pane's bullet builder.
 *  Shared by the gate and the review dump (dump-intro-copy.mjs --generic). */
export function discoverGenericCopyFiles(ROOT) {
  const files = [];
  const libDir = path.join(ROOT, "lib");
  for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const f = path.join(libDir, entry.name, "explainer-clauses.tsx");
    if (fs.existsSync(f)) files.push(f);
  }
  const shared = path.join(ROOT, "lib", "shared", "liquity-fork-explainer-clauses.tsx");
  if (fs.existsSync(shared)) files.push(shared);
  const protoDir = path.join(ROOT, "components", "protocol");
  for (const entry of fs.readdirSync(protoDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(protoDir, entry.name))) {
      if (/-position-explanation\.tsx$/.test(name)) files.push(path.join(protoDir, entry.name, name));
    }
  }
  const trovePane = path.join(ROOT, "components", "trove", "use-trove-explanation-items.tsx");
  if (fs.existsSync(trovePane)) files.push(trovePane);
  return files.sort();
}

// ---------------------------------------------------------------------------
// Intro-surface discovery — roster-driven, walking rather than hardcoded
// ---------------------------------------------------------------------------

// A protocol id → its route directory under app/(app).
//
// Read from the roster rather than guessed at. Every explorer now lives at
// `app/(app)/<chain-slug>/<protocol-slug>` (rails-ops decision 0016), so the
// directory is a function of two roster fields and NOT of the id — `compound`
// routes to `ethereum/compound-v3`, `aave-v3-base` to `base/aave-v3`. Deriving
// it means this gate follows an explorer that moves; the previous hardcoded map
// would simply have stopped finding one and reported "0 files", which reads as
// a missing surface rather than as a stale path.
function readRouteDirs() {
  const chains = new Map();
  const chainSrc = fs.readFileSync(path.join(SCAN_ROOT, "lib", "shared", "chains.ts"), "utf8");
  const chainBody = chainSrc.slice(chainSrc.indexOf("export const CHAINS"));
  for (const m of chainBody.matchAll(/^ {2}(\d+): \{[\s\S]*?slug: "([^"]+)"/gm)) {
    chains.set(Number(m[1]), m[2]);
  }
  const dirs = {};
  const rosterSrc = fs.readFileSync(path.join(SCAN_ROOT, "lib", "shared", "protocols.ts"), "utf8");
  const rosterBody = rosterSrc.slice(rosterSrc.indexOf("const SPECS"), rosterSrc.indexOf("const SEEN"));
  for (const m of rosterBody.matchAll(/id: "([^"]+)",[\s\S]*?chainId: (\d+),[\s\S]*?slug: "([^"]+)",/g)) {
    dirs[m[1]] = `${chains.get(Number(m[2]))}/${m[3]}`;
  }
  return dirs;
}
export const APP_DIR = readRouteDirs();
// Clause families with no route of their own.
export const NO_APP_DIR = new Set(["liquity-fork"]);
// View components that live outside components/protocol/<proto>/ because a
// family shares them.
export const SHARED_VIEW_COMPONENTS = {
  "aave-v3": ["components/shared/aave-market-views.tsx"],
  spark: ["components/shared/aave-market-views.tsx"],
};
// The hoist escape hatch: files whose CODE legitimately carries a banned
// identifier (maple-pools-view reads the pools' totalAssets field) keep their
// reader-facing prose in a sibling copy module, and discovery scans that
// module in the file's place. New visible copy for a swapped file must live
// in its copy module — the view file itself is deliberately unscanned.
export const INTRO_SCAN_SWAPS = {
  "components/protocol/maple/maple-pools-view.tsx": "components/protocol/maple/maple-pools-copy.tsx",
};
// Position-card files carry visible face labels (fluid's "Σ replay") AND
// provenance-receipt builder strings — and receipts keep their own register
// (the charter exempts them; ebisu/asymmetry cards say "replayed collateral"
// inside a receipt summary and carry the `kind: "chain-derived"` data token).
// Whole-file scanning cannot tell the two apart, so card discovery is scoped
// to the protocols whose cards carry in-scope face labels. Extend this list —
// or hoist the labels into an intro-copy module — when another card grows one.
export const CARD_LABEL_PROTOCOLS = new Set(["fluid", "fx", "llamalend"]);

function fileIfExists(p) {
  return fs.existsSync(p) ? p : null;
}

/** Walk app/(app)/<dir> for nested view page.tsx files — subdirectories only
 *  (the root page.tsx is the listing route), excluding any dynamic `[` segment. */
function walkViewPages(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("[")) continue;
    const sub = path.join(dir, entry.name);
    const stack = [sub];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!e.name.startsWith("[")) stack.push(path.join(d, e.name));
        } else if (e.name === "page.tsx") {
          out.push(path.join(d, e.name));
        }
      }
    }
  }
  return out.sort();
}

/**
 * Discover every intro surface for one protocol id. Returns
 * [{ file, mode: "prose", banned: INTRO_BANNED }].
 *
 * Surfaces: the listing (<dir>-listing.tsx), nested view page.tsx files,
 * the protocol's view components (components/protocol/<proto>/*-view(s).tsx),
 * shared family view components, and — for CARD_LABEL_PROTOCOLS — the card face
 * plus the risk surfaces that ride on it (visible labels — e.g. fluid's
 * "Σ replay" card label, llamalend's band-axis label row).
 */
export function discoverIntroSurfaces(ROOT, proto) {
  const targets = [];
  const add = (file) => {
    if (!file) return;
    const rel = path.relative(ROOT, file);
    const swap = INTRO_SCAN_SWAPS[rel];
    targets.push({ file: swap ? path.join(ROOT, swap) : file, mode: "prose", banned: INTRO_BANNED });
  };

  if (!NO_APP_DIR.has(proto)) {
    const dir = APP_DIR[proto] ?? proto;
    const appDir = path.join(ROOT, "app", "(app)", dir);
    // Found by shape, not by name. The listing file keeps the name it was
    // written under (`compound-listing.tsx` sits in `ethereum/compound-v3/`),
    // so constructing the name from the directory would miss it — and miss it
    // silently, since a listing that isn't discovered simply isn't scanned.
    //
    // Route groups are searched too. A listing whose `loading.tsx` must not
    // cover the protocol's detail routes moves into a `(views)` group so the
    // Suspense boundary stops pinning a missing position's status at 200, and
    // it takes its `-listing.tsx` with it — a routing move that changes no URL
    // and should change no register coverage.
    if (fs.existsSync(appDir)) {
      const searchDirs = [appDir];
      for (const e of fs.readdirSync(appDir, { withFileTypes: true })) {
        if (e.isDirectory() && e.name.startsWith("(")) searchDirs.push(path.join(appDir, e.name));
      }
      for (const d of searchDirs) {
        const listing = fs.readdirSync(d).find((f) => /-listing\.tsx$/.test(f));
        if (listing) add(path.join(d, listing));
      }
    }
    for (const p of walkViewPages(appDir)) add(p);
  }

  const compDir = path.join(ROOT, "components", "protocol", proto);
  if (fs.existsSync(compDir)) {
    for (const entry of fs.readdirSync(compDir).sort()) {
      if (/-views?\.tsx$/.test(entry)) add(path.join(compDir, entry));
      // Card faces AND the risk surfaces that ride them. The risk files were
      // added 2026-07-26: LlamaLend's soft-liquidation block shipped with three
      // paragraphs, of which three strings were on INTRO_BANNED, because
      // `llamalend-risk-card.tsx` / `llamalend-bands-axis.tsx` matched no
      // pattern here — the gate never read a word of the file. Same scoping
      // reason as the card face itself: these carry visible label-led copy.
      if (CARD_LABEL_PROTOCOLS.has(proto) && /-(position-card|risk-slot|risk-card|bands-axis)\.tsx$/.test(entry)) {
        add(path.join(compDir, entry));
      }
    }
  }
  for (const rel of SHARED_VIEW_COMPONENTS[proto] ?? []) add(fileIfExists(path.join(ROOT, rel)));

  return targets;
}
