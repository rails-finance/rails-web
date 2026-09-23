// check:receipts — every provenance `summary:` must split cleanly into the
// receipt bar's name clause and the expanded receipt's prose.
//
// The receipt header (receiptLabel) and the embedded body (splitSummary in
// components/shared/provenance.tsx) both derive from the ONE prose field,
// `summary`. Its required shape is "<short name clause> — <fuller sentence>"
// (rails-ops/standards/provenance-receipts-grammar.md §7). This gate asserts:
//
//   A — the summary contains a separator (" — ", " – ", or ". "), so the
//       embedded body never restates the header verbatim;
//   B — the literal portion of the name clause is ≤ 72 chars, so the header
//       never truncates with an ellipsis.
//
//   C — the summary is written once, in plain words
//       (rails-ops/standards/language-and-tone.md "Say it once"): no contrast
//       tail (", not a …", "rather than …") and no filler word. Enforced on
//       every file outside scripts/plain-words-pending.mjs; a negative that
//       carries a fact is kept by naming its sentence in C_KEEP below.
//
// Name clauses behind a ${…} interpolation resolve at runtime and are
// unjudgeable statically — they are SKIPPED and the count reported out loud,
// so "all clear" never quietly means "two-thirds unchecked".

import { execSync } from "node:child_process";
import fs from "node:fs";
import { PLAIN_WORDS_PENDING } from "./plain-words-pending.mjs";

const files = execSync(`grep -rlE "summary( =|:)" --include="*.ts" --include="*.tsx" lib components app`, {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);

// summary: followed by one or more adjacent/concatenated string literals
const RE = /summary:\s*((?:(?:"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*\+?\s*)+),?\s*\n/g;
const SEPS = [" — ", " – ", ". "];

// Earliest-separator cut — must match splitSummary() in provenance.tsx.
const nameClause = (s) => {
  let cut = -1;
  for (const sep of SEPS) {
    const i = s.indexOf(sep);
    if (i > 0 && (cut < 0 || i < cut)) cut = i;
  }
  return cut < 0 ? s.replace(/\.$/, "") : s.slice(0, cut);
};

// Known false positives for rule A: the separator lives inside an interpolated
// constant, so the runtime string is well-formed even though the source scans
// as separator-less. Keyed on content, not file:line. Kept deliberately
// narrow — a blanket "skip any interpolated summary" would also excuse
// genuinely broken sites.
const A_ALLOW = [
  // lib/fluid/event-provenance.ts — SIGMA_SUMMARY's own text contains " — ".
  (text) => text.startsWith("${SIGMA_SUMMARY"),
];

// ── C — plain words ─────────────────────────────────────────────────────────
// Rule C reads a wider net than A and B: every string literal in the expression
// after `summary:` or `summary =`, so both arms of a ternary and a summary built
// into a const are judged. Literals joined by `+` are one text, and the match
// runs on that joined text with whitespace collapsed — Prettier wraps a phrase
// across source lines, where a per-line regex would miss it. A summary passed
// through a helper's argument is outside this net; write it as `summary:`.
const CONTRAST = [/[,;—–]\s+not\s+(?:a|an|the)\b/gi, /\brather than\b/gi];
const FILLER = /\b(?:itself|own|exactly|straight|actually)\b/gi;

// A negative or a flagged word that carries a fact. Keyed on content like
// A_ALLOW: `phrase` is a run of the summary's words around the hit, `why` is
// what a reader would get wrong without it. An entry that no longer matches
// anything fails the check, so a rewritten sentence takes its entry with it.
const C_KEEP = [];

/** The literal texts of the expression starting at `from`: one entry per run of
 *  string/template literals joined by `+`. Stops at the `,` `;` or closer that
 *  ends the expression. A template's `\${…}` stays in the text as written. */
function literalRuns(src, from) {
  const runs = [];
  let cur = null; // the run being joined, or null after any non-`+` token
  let depth = 0;
  let i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let nest = 0;
      while (j < src.length) {
        if (src[j] === "\\") j++;
        else if (c === "`" && src[j] === "$" && src[j + 1] === "{") nest++;
        else if (c === "`" && nest > 0 && src[j] === "}") nest--;
        else if (src[j] === c && nest === 0) break;
        j++;
      }
      const lit = src.slice(i + 1, j);
      if (cur === null) runs.push((cur = { text: lit, index: i }));
      else cur.text += lit;
      i = j + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if ((c === "," || c === ";") && depth === 0) break;
    if (c !== "+" && !/\s/.test(c)) cur = null;
    i++;
  }
  return runs;
}

const plain = []; // rule C hits in enforced files
const pendingHits = new Map(); // pending file -> hit count
const keepUsed = new Set();
let plainScanned = 0;

function scanPlainWords(f, src) {
  for (const m of src.matchAll(/\bsummary\s*(?::|=(?!=))\s*/g)) {
    for (const run of literalRuns(src, m.index + m[0].length)) {
      const text = run.text.replace(/\s+/g, " ");
      if (!text.includes(" ")) continue;
      plainScanned++;
      const line = src.slice(0, run.index).split("\n").length;
      for (const re of [...CONTRAST, FILLER]) {
        for (const hit of text.matchAll(re)) {
          const kept = C_KEEP.findIndex((k) => {
            if (k.file !== f) return false;
            const at = text.indexOf(k.phrase);
            return at >= 0 && hit.index >= at && hit.index < at + k.phrase.length;
          });
          if (kept >= 0) {
            keepUsed.add(kept);
            continue;
          }
          if (PLAIN_WORDS_PENDING.includes(f)) {
            pendingHits.set(f, (pendingHits.get(f) ?? 0) + 1);
            continue;
          }
          const lo = Math.max(0, hit.index - 40);
          plain.push({
            at: `${f}:${line}`,
            word: hit[0].replace(/^[,;—–]\s+/, ""),
            near: text.slice(lo, hit.index + hit[0].length + 40),
          });
        }
      }
    }
  }
}

const repeat = [];
const truncate = [];
let total = 0;
let skipped = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  scanPlainWords(f, src);
  for (const m of src.matchAll(RE)) {
    total++;
    const text = m[1]
      .replace(/"\s*\+\s*"/g, "")
      .replace(/^["`]|["`],?\s*$/g, "")
      .replace(/\s+/g, " ");
    const line = src.slice(0, m.index).split("\n").length;
    const at = `${f}:${line}`;
    // A: no separator at all -> the embedded body restates the header verbatim.
    if (!SEPS.some((s) => text.includes(s)) && !A_ALLOW.some((ok) => ok(text))) {
      repeat.push({ at, text });
    }
    // B: name clause over 72 chars -> the header truncates with an ellipsis.
    // Judge only the literal portion — a ${…} resolves short at runtime, and
    // scoring the source text instead inflates the count.
    const h = nameClause(text);
    if (h.includes("${")) {
      skipped++;
      continue;
    }
    if (h.length > 72) truncate.push({ at, h, n: h.length });
  }
}

const show = (title, rows, fmt) => {
  console.log(`\n${title}: ${rows.length}`);
  rows.forEach((r) => console.log(`  ${r.at}\n     ${fmt(r)}`));
};
show("A — body repeats header (no separator)", repeat, (r) => r.text.slice(0, 120));
show("B — name clause > 72 chars (header truncates)", truncate, (r) => `[${r.n}] ${r.h}`);
show("C — said once, in plain words (contrast tail or filler word)", plain, (r) => `"${r.word}" in: …${r.near}…`);

// The ratchet shrinks only: a pending file with nothing left to flag, or one
// that is gone, must leave the list.
const stalePending = PLAIN_WORDS_PENDING.filter((f) => !pendingHits.has(f));
show(
  "C — pending file with nothing left to flag (remove it from plain-words-pending.mjs)",
  stalePending.map((f) => ({ at: f })),
  () => "clean, or no longer scanned",
);
const staleKeep = C_KEEP.filter((_, i) => !keepUsed.has(i));
show(
  "C — C_KEEP entry that matches no flagged phrase (remove it)",
  staleKeep.map((k) => ({ at: k.file, k })),
  (r) => r.k.phrase,
);

console.log(`\nscanned ${total} summaries; ${skipped} name clauses skipped (behind \${…} interpolation)`);
const left = [...pendingHits.values()].reduce((a, b) => a + b, 0);
console.log(
  `rule C read ${plainScanned} summary texts; ${C_KEEP.length} kept by name; ${PLAIN_WORDS_PENDING.length} files pending with ${left} phrases left to rewrite`,
);
if (repeat.length || truncate.length || plain.length || stalePending.length || staleKeep.length) process.exit(1);
