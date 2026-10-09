#!/usr/bin/env node
// check:prose-limits — the prose limits and zones standard, enforced over the
// strings files (rails-ops standards/prose-limits-and-zones.md, sections 2, 3,
// 6 and 7.1; ui-jobs item 314).
//
// STRICT (item 314): every family with a strings file (Liquity V2 and Liquity
// V1 today) is inside the limits, and `pnpm check` fails on the next string
// over them. The other families' extracted sentences are a heuristic read of
// JSX, so they are listed for each family's sweep job and do not fail the check.
//
//   node scripts/check-prose-limits.mjs              strict: exit 1 on any failure
//   node scripts/check-prose-limits.mjs --report     list failures, exit 0
//   node scripts/check-prose-limits.mjs --summary    counts per zone and rule, worst strings
//   node scripts/check-prose-limits.mjs --self-test  feed over-limit strings through every rule
//   node scripts/check-prose-limits.mjs --root DIR   read another tree (tests)
//
// Every failure names the file, the string id, the zone, the rule and the count.
//
// What it reads
//   Z2 event sentences, shared sentences, payout legs: content/*/event-prose.yaml
//       `templates`, `shared_sentences`. The pane's worst case is computed from
//       each template's `order`, `list` and `groups`.
//   Z1 position card explanation: the family's Z1 strings (Z1_STRINGS below:
//       Liquity V2's listed `trove_words`, Liquity V1's `position_words`).
//   Z4 modals: the `L5` section. Links also from `info`, `claim_links` and a
//       concept's `sources`; a `doc` id resolves through the file's `doc_urls`.
//   Z3 Lifetime flows: skipped, the pane is TSX (lib/liquity/economics-explanation.tsx).
//   Other families: the sentences the register scan extracts
//       (scripts/lib/register-scan.mjs extractCopyUnits) from lib/<proto>/explainer-clauses.tsx
//       (Z2) and components/protocol/<proto>/*-position-explanation.tsx (Z1). These
//       are JSX, so the text is a heuristic extraction (unwrapJsx); only the
//       words-per-sentence rule runs on them, and a sentence over it is listed,
//       not failed, until the family's words move into a strings file.
//   Links: every url or faq id in a modal or strings file, every URL literal in
//       the learn-more TS files, against content/official-docs.json.
//
// Word counting is the standard's rule: split on spaces, a {placeholder} and a
// figure with its unit ("0.0375 ETH", "{added} {coll_symbol}") are one word each,
// punctuation is dropped.
//
// Exceptions: `# prose-limit: words N (reason)` on the line above the string's
// key line, or trailing the `key: |-` line (a comment between the `|-` and the
// string would be string content in YAML). It lifts a words limit by at most 5.
// At most 3 per zone per file; a stale or unneeded one fails.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverGenericCopyFiles, extractCopyUnits } from "./lib/register-scan.mjs";

const require_ = createRequire(import.meta.url);
const YAML = require_("yaml");
const { parseContent } = require_("./yaml-loader.cjs");

const args = process.argv.slice(2);
const REPORT = args.includes("--report");
const SUMMARY = args.includes("--summary");
const SELF_TEST = args.includes("--self-test");
const rootIdx = args.indexOf("--root");
const ROOT =
  rootIdx >= 0
    ? resolvePath(args[rootIdx + 1])
    : resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// ── The numbers (standard section 2) ─────────────────────────────────────────

const PLAIN = {
  Z1: { bullet: 20, lead: 25, figures: 2, joins: 2, perGroup: 4, groups: 4, bullets: 8, words: 150, heading: 3 },
  Z2: { bullet: 20, lead: null, figures: 2, joins: 2, perGroup: 3, groups: 3, bullets: 5, words: 100, heading: 5 },
  Z3: { bullet: 15, lead: null, figures: 2, joins: 2, perGroup: 4, groups: 7, bullets: 16, words: 190, heading: 3 },
};
const REVEAL = {
  Z1: { reveals: 1, words: 120, paragraphs: 3, paragraphSentences: 2, sentence: 25, openWords: 270 },
  Z2: { reveals: 0 },
  Z3: { reveals: 1, words: 120, paragraphs: 3, paragraphSentences: 2, sentence: 25, openWords: 310 },
};
const MODAL = {
  introSentences: 2,
  introWords: 40,
  conceptMin: 2,
  conceptMax: 5,
  conceptWords: 25,
  linksMin: 1,
  linksMax: 4,
  steps: 5,
  stepWords: 20,
  eventParagraphs: 3,
  eventParagraphSentences: 3,
  eventParagraphWords: 55,
  sentenceWords: 25,
  totalWords: 200,
};
const EXCEPTION_MARGIN = 5;
const EXCEPTIONS_PER_ZONE = 3;

/** Section 3.2: the Z2 heading set, in order. Section 3.3: the Z1 proposal. */
const Z2_HEADINGS = [
  ["happened", "What happened"],
  ["adds_up", "How it adds up"],
  ["leaves", "Where it leaves the position"],
];
const Z1_HEADINGS = ["Holdings", "Risk", "Rate", "History"];

/** Liquity V2's position card explanation strings in trove_words (Z1). A lead ends in a colon. */
const Z1_IDS = [
  "liq_lead", "liq_lifecycle", "liq_nft", "closed_lead_redeemed", "closed_lead_repaid",
  "closed_peak_debt", "closed_peak_coll", "closed_lifecycle", "open_lead", "debt_breakdown",
  "debt_breakdown_fee", "coll_worth", "coll_secures", "coll_ratio", "liq_runway", "liq_runway_now",
  "rate_cost_delegate", "rate_cost_owner", "debt_in_front", "queue_share", "nft_held",
  "counts_both", "counts_owner", "counts_redeemed",
];
/** Liquity V2's Z1 placeholders that are names or links. Every other one ({coll}, {debt}, {range}, ...) is a figure. */
const Z1_NAME_PLACEHOLDERS = new Set(["id", "owner", "nft", "coll_type", "delegate", "name", "time_word", "tx_word", "manager", "by"]);
/**
 * Each family's Z1 strings: the section, the ids (null: every id of the section
 * but its headings) and how a placeholder is told to be a figure ("names": every
 * placeholder but Z1_NAME_PLACEHOLDERS; "placeholders": the file's placeholders
 * table, as Z2 reads it). A family missing here has no Z1 strings in its file.
 */
const Z1_STRINGS = {
  "liquity-v2": { section: "trove_words", ids: Z1_IDS, figures: "names" },
  "liquity-v1": { section: "position_words", ids: null, figures: "placeholders" },
  morpho: { section: "position_words", ids: null, figures: "placeholders" },
  "aave-v3": { section: "position_words", ids: null, figures: "placeholders" },
  compound: { section: "position_words", ids: null, figures: "placeholders" },
  "compound-v2": { section: "position_words", ids: null, figures: "placeholders" },
  spark: { section: "position_words", ids: null, figures: "placeholders" },
};
const z1Ids = (family, d) => {
  const z = Z1_STRINGS[family];
  if (!z) return [];
  return z.ids ?? Object.keys(d[z.section] ?? {}).filter((k) => !/^(group|heading)_/.test(k));
};

/** Modal placeholders that are branch or mode constants (modal grammar 1). Any other placeholder is an instance figure. */
const MODAL_CONSTANT_PLACEHOLDERS = new Set(["min_cr", "max_ltv", "coll_type", "delegate", "delegate_name"]);
/** Roundings whose placeholder is a name or a link. */
const NAME_ROUNDINGS = new Set(["text", "manager", "address"]);

const UNITS = new Set([
  "ETH", "WETH", "wstETH", "rETH", "BOLD", "USD", "USDC", "USDT", "DAI", "ZCHF", "LUSD",
  "day", "days", "hour", "hours", "week", "weeks", "block", "blocks", "%",
]);

// ── Findings ─────────────────────────────────────────────────────────────────

const failures = [];
const warnings = [];
const listings = [];
/** The collector the checks write to; --self-test swaps it. */
let sink = { failures, warnings, listings };
const fail = (f) => sink.failures.push(f);
const warn = (w) => sink.warnings.push(w);

// ── Counting ─────────────────────────────────────────────────────────────────

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const DATE_RE = new RegExp(`\\b\\d{1,2} (?:${MONTHS})[a-z]* \\d{4}\\b`, "g");
const PH_RE = /\{([a-z0-9_]+)(?:\|[a-z0-9_]+)?\}/gi;
const NUM_RE = /(?<![\p{L}\p{N}_.\-–])\$?\d[\d,]*(?:\.\d+)?%?/gu;

const core = (tok) => tok.replace(/^[^\p{L}\p{N}{$+−-]+|[^\p{L}\p{N}}%]+$/gu, "");
const phName = (tok) => {
  const m = /^[+−-]?\{([a-z0-9_]+)(?:\|[a-z0-9_]+)?\}$/i.exec(tok);
  return m ? m[1] : null;
};

/** Words by the standard's rule. `isFig(name)` says whether a placeholder is a figure. */
export function countWords(text, isFig = () => false) {
  const toks = text
    .replace(DATE_RE, "{date}")
    .split(/\s+/)
    .map(core)
    .filter((t) => /[\p{L}\p{N}{]/u.test(t));
  let n = 0;
  for (let i = 0; i < toks.length; i++) {
    n++;
    const name = phName(toks[i]);
    const figure = (name && isFig(name)) || /^\$?\d[\d,]*(?:\.\d+)?%?$/.test(toks[i]);
    const next = toks[i + 1];
    if (figure && next && (UNITS.has(next) || /^\{[a-z0-9_]*symbol\}$/i.test(next))) i++;
  }
  return n;
}

export function sentencesOf(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z{“"‘(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Figures: figure placeholders, a number with its unit, a percentage, a date. */
export function countFigures(text, isFig) {
  let n = 0;
  let t = text.replace(DATE_RE, () => (n++, " "));
  t = t.replace(PH_RE, (_, name) => (isFig(name) && n++, " "));
  n += (t.match(NUM_RE) ?? []).length;
  return n;
}

/** Marks that join clauses: comma, semicolon, colon, dash. Digit grouping, placeholders and a closing colon do not count. */
export function countJoins(text) {
  const t = text
    .replace(PH_RE, " ")
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/[:.]\s*$/, "");
  return (t.match(/[,;:—–]/g) ?? []).length;
}

// ── Exceptions ───────────────────────────────────────────────────────────────

const EXC_RE = /#\s*prose-limit:\s*words\s+(\d+)\s*\((.+)\)\s*$/;

/** One strings file: its lines, the YAML document, and the exception comments. */
class Source {
  constructor(rel, src) {
    this.rel = rel;
    this.lines = src.split("\n");
    this.lc = new YAML.LineCounter();
    this.doc = YAML.parseDocument(src, { lineCounter: this.lc, uniqueKeys: true });
    this.used = new Map();
    this.byZone = new Map();
    for (const [i, l] of this.lines.entries())
      if (/prose-limit:/.test(l) && !EXC_RE.test(l))
        fail({ file: rel, id: `line ${i + 1}`, zone: "-", rule: "malformed prose-limit comment (words N (reason))", count: 0, limit: 0 });
  }
  /** The 1-based line of the key whose value sits at `path`. */
  lineOf(path) {
    const node = this.doc.getIn(path, true);
    return node?.range ? this.lc.linePos(node.range[0]).line : 0;
  }
  /** The exception comment on the key line (trailing) or the line above it. */
  exception(line) {
    for (const ln of [line, line - 1]) {
      const l = this.lines[ln - 1];
      const m = l && EXC_RE.exec(l);
      if (m && (ln === line || /^\s*#/.test(l))) return { n: Number(m[1]), reason: m[2], line: ln };
    }
    return null;
  }
  /** Mark an exception as attached to a string of `zone`. */
  attach(zone, exc, id) {
    this.used.set(exc.line, { zone, id });
    const z = this.byZone.get(zone) ?? [];
    z.push(id);
    this.byZone.set(zone, z);
  }
  finish() {
    for (const [i, l] of this.lines.entries())
      if (EXC_RE.test(l) && !this.used.has(i + 1))
        fail({ file: this.rel, id: `line ${i + 1}`, zone: "-", rule: "prose-limit comment sits above no checked string", count: 0, limit: 0 });
    for (const [zone, ids] of this.byZone)
      if (ids.length > EXCEPTIONS_PER_ZONE)
        fail({ file: this.rel, id: ids.join(", "), zone, rule: "exceptions per zone per file", count: ids.length, limit: EXCEPTIONS_PER_ZONE });
  }
}

/**
 * Check a words limit on one string, with the exception rule. Returns the words.
 * `where` = { src, path, file, id, zone }.
 */
function checkWords(where, text, limit, rule, isFig) {
  const words = countWords(text, isFig);
  const exc = where.src?.exception(where.src.lineOf(where.path));
  if (exc) where.src.attach(where.zone, exc, where.id);
  const base = { file: where.file, id: where.id, zone: where.zone, line: where.src?.lineOf(where.path) };
  if (exc) {
    if (words <= limit) {
      fail({ ...base, rule: `${rule}: exception not needed`, count: words, limit });
    } else if (words > limit + EXCEPTION_MARGIN) {
      fail({ ...base, rule: `${rule}: past the exception margin`, count: words, limit: limit + EXCEPTION_MARGIN });
    } else if (words !== exc.n) {
      fail({ ...base, rule: `${rule}: exception says ${exc.n}`, count: words, limit: exc.n });
    }
  } else if (words > limit) {
    fail({ ...base, rule, count: words, limit });
  }
  return words;
}

// ── Plain-zone strings: bullets and leads ────────────────────────────────────

/** Words, figures and joins of one bullet or lead. */
export function checkBullet(where, text, zone, { lead = false, isFig }) {
  const L = PLAIN[zone];
  const limit = lead ? L.lead : L.bullet;
  const words = checkWords(where, text, limit, lead ? "words per lead sentence" : "words per bullet", isFig);
  const base = { file: where.file, id: where.id, zone, line: where.src?.lineOf(where.path) };
  const figures = countFigures(text, isFig);
  if (figures > L.figures) fail({ ...base, rule: `figures per ${lead ? "lead" : "bullet"}`, count: figures, limit: L.figures });
  if (!lead) {
    const joins = countJoins(text);
    if (joins > L.joins) fail({ ...base, rule: "joining marks per bullet", count: joins, limit: L.joins });
  }
  return words;
}

/** Section 2.1 reveal rules, for a pane that has a reveal. `paragraphs` = array of strings. */
export function checkReveal(where, zone, paragraphs) {
  const R = REVEAL[zone];
  const base = { file: where.file, id: where.id, zone, line: where.src?.lineOf(where.path) };
  if (!R.reveals) return fail({ ...base, rule: "reveals per pane", count: 1, limit: 0 });
  const total = paragraphs.reduce((s, p) => s + countWords(p), 0);
  if (total > R.words) fail({ ...base, rule: "words per reveal", count: total, limit: R.words });
  if (paragraphs.length > R.paragraphs) fail({ ...base, rule: "paragraphs per reveal", count: paragraphs.length, limit: R.paragraphs });
  for (const p of paragraphs) {
    const ss = sentencesOf(p);
    if (ss.length > R.paragraphSentences) fail({ ...base, rule: "sentences per reveal paragraph", count: ss.length, limit: R.paragraphSentences });
    for (const s of ss) {
      const w = countWords(s);
      if (w > R.sentence) fail({ ...base, rule: "words per reveal sentence", count: w, limit: R.sentence });
    }
  }
}

// ── Z2: templates, shared sentences, the pane's worst case ───────────────────

/** Sentences that cannot be said together: the pane holds the longest of each family. */
function exclusiveKey(id) {
  if (/^market\./.test(id)) return "market";
  if (/^redist\.(debt|coll|both)$/.test(id)) return "redist-amount";
  if (/^accrual\./.test(id)) return "accrual";
  if (/^liq\.after/.test(id)) return "liq.after";
  return id.replace(/_(unpriced|pos|neg)$/, "");
}

/**
 * The pane's worst case for one template: per variant, the members of `order`
 * and `list` that variant can say, the longest of each exclusive family, grouped
 * by `groups`. Returns the maxima over variants. It is an upper bound: a
 * sentence whose `when` names no variant counts in every variant. A template's
 * `alternates` (lists of sentence ids the generator says at most one of) are
 * exclusive families too; a family whose members sit in different groups
 * counts one bullet in each of those groups for the per-group limit, and once
 * in the pane's bullets and words.
 */
export function worstCase(t, shared, headingWords) {
  const variants = Object.keys(t.variants ?? { default: "" });
  const members = [...t.order, ...(t.list ?? [])];
  const textOf = (id) => t.sentences?.[id] ?? shared[id];
  const groupOf = new Map();
  for (const [g, ids] of Object.entries(t.groups ?? {})) for (const id of ids) groupOf.set(id, g);
  const altOf = new Map();
  for (const [i, ids] of (t.alternates ?? []).entries()) for (const id of ids) altOf.set(id, `alt${i}`);
  const keyOf = (id) => altOf.get(id) ?? exclusiveKey(id);
  let best = { bullets: 0, groups: 0, perGroup: 0, words: 0, shown: false };
  for (const v of variants) {
    const inVariant = (id) => {
      const when = t.sentences?.[id]?.when ?? "";
      const named = variants.filter((x) => new RegExp(`\\b${x}\\b`).test(when));
      return named.length === 0 || named.includes(v);
    };
    const pick = new Map();
    for (const id of members) {
      const s = textOf(id);
      if (!s || !groupOf.has(id) || !inVariant(id)) continue;
      const w = countWords(s.text, () => true);
      const key = keyOf(id);
      const e = pick.get(key) ?? { id, w: -1, groups: new Set() };
      e.groups.add(groupOf.get(id));
      if (e.w < w) Object.assign(e, { id, w });
      pick.set(key, e);
    }
    const perGroup = new Map();
    for (const { id, w, groups } of pick.values()) {
      for (const g of groups) {
        const e = perGroup.get(g) ?? { n: 0, w: 0, counted: 0 };
        e.n++;
        perGroup.set(g, e);
      }
      const e = perGroup.get(groupOf.get(id));
      e.w += w;
      e.counted++;
    }
    // The pane's bullets count each family once, in the group of its longest member.
    const bullets = [...perGroup.values()].reduce((s, e) => s + e.counted, 0);
    const dense = [...perGroup.values()].filter((e) => e.n >= 2).length;
    const shown = dense >= 2;
    const words =
      [...perGroup.values()].reduce((s, e) => s + e.w, 0) +
      (shown ? [...perGroup.keys()].reduce((s, g) => s + (headingWords[g] ?? 0), 0) : 0);
    best = {
      bullets: Math.max(best.bullets, bullets),
      groups: Math.max(best.groups, perGroup.size),
      perGroup: Math.max(best.perGroup, ...[...perGroup.values()].map((e) => e.n), 0),
      words: Math.max(best.words, words),
      shown: best.shown || shown,
    };
  }
  return best;
}

export function checkPane(where, zone, wc) {
  const L = PLAIN[zone];
  const base = { file: where.file, id: where.id, zone };
  if (wc.perGroup > L.perGroup) fail({ ...base, rule: "bullets per group", count: wc.perGroup, limit: L.perGroup });
  if (wc.groups > L.groups) fail({ ...base, rule: "groups per pane", count: wc.groups, limit: L.groups });
  if (wc.bullets > L.bullets) fail({ ...base, rule: "bullets per pane, closed (worst case)", count: wc.bullets, limit: L.bullets });
  if (wc.words > L.words) fail({ ...base, rule: "words per pane, closed (worst case)", count: wc.words, limit: L.words });
}

/** Section 3: the group words are the standard's, in order, none renamed. */
export function checkHeadingSet(file, groupWords, templates) {
  for (const [key, heading] of Z2_HEADINGS) {
    if (groupWords?.[key] !== heading)
      fail({ file, id: `group_words.${key}`, zone: "Z2", rule: `heading is "${heading}"`, count: 0, limit: 0, got: groupWords?.[key] });
  }
  for (const k of Object.keys(groupWords ?? {}))
    if (!Z2_HEADINGS.some(([key]) => key === k))
      fail({ file, id: `group_words.${k}`, zone: "Z2", rule: "heading outside the standard set", count: 1, limit: 0 });
  for (const [k, h] of Object.entries(groupWords ?? {})) {
    const w = h.trim().split(/\s+/).length;
    if (w > PLAIN.Z2.heading) fail({ file, id: `group_words.${k}`, zone: "Z2", rule: "words per heading", count: w, limit: PLAIN.Z2.heading });
    if (/:$/.test(h) || h !== h[0].toUpperCase() + h.slice(1) || /[A-Z]/.test(h.slice(1)))
      fail({ file, id: `group_words.${k}`, zone: "Z2", rule: "heading is sentence case, no colon", count: 1, limit: 0 });
  }
  const order = Z2_HEADINGS.map(([k]) => k);
  for (const t of templates) {
    const keys = Object.keys(t.groups ?? {});
    const idx = keys.map((k) => order.indexOf(k));
    if (idx.includes(-1)) fail({ file, id: t.id, zone: "Z2", rule: "group outside the heading set", count: keys.length, limit: order.length });
    else if (idx.some((v, i) => i && v < idx[i - 1])) fail({ file, id: t.id, zone: "Z2", rule: "groups out of heading order", count: keys.length, limit: order.length });
  }
}

// ── Z4: the modal ────────────────────────────────────────────────────────────

export function checkModal(where, name, m, { faq = () => null } = {}) {
  const zone = "Z4";
  const id = (s) => `L5.${name}.${s}`;
  const at = (s, path) => ({ ...where, id: id(s), zone, path: ["L5", name, ...path] });
  const base = (s) => ({ file: where.file, id: id(s), zone });
  const sentenceCheck = (w, text) => {
    for (const s of sentencesOf(text)) checkWords(w, s, MODAL.sentenceWords, "words per modal sentence", () => false);
  };
  const place = (s, text) => {
    for (const [, ph] of text.matchAll(PH_RE))
      if (!MODAL_CONSTANT_PLACEHOLDERS.has(ph)) fail({ ...base(s), rule: `instance placeholder {${ph}}`, count: 1, limit: 0 });
  };
  const wordsOf = (t) => countWords(t);
  let totals = [0];
  const add = (n) => (totals = totals.map((x) => x + n));

  // Intro, with its variants: the total takes the longest.
  const intros = [["intro", m.intro], ...Object.entries(m).filter(([k]) => /^intro_/.test(k))];
  for (const [k, text] of intros) {
    if (typeof text !== "string") continue;
    const ss = sentencesOf(text);
    if (ss.length > MODAL.introSentences) fail({ ...base(k), rule: "sentences in the intro", count: ss.length, limit: MODAL.introSentences });
    checkWords(at(k, [k]), text, MODAL.introWords, "words in the intro", () => false);
    sentenceCheck(at(k, [k]), text);
    place(k, text);
  }
  add(Math.max(0, ...intros.map(([, t]) => (typeof t === "string" ? wordsOf(t) : 0))));

  // Paragraphs after the intro (event modals).
  const extras = m.extraParagraphs ?? [];
  if (extras.length && 1 + extras.length > MODAL.eventParagraphs)
    fail({ ...base("extraParagraphs"), rule: "paragraphs in the modal", count: 1 + extras.length, limit: MODAL.eventParagraphs });
  for (const [i, p] of extras.entries()) {
    const s = `extraParagraphs[${i}]`;
    const ss = sentencesOf(p);
    if (ss.length > MODAL.eventParagraphSentences) fail({ ...base(s), rule: "sentences per modal paragraph", count: ss.length, limit: MODAL.eventParagraphSentences });
    checkWords(at(s, ["extraParagraphs", i]), p, MODAL.eventParagraphWords, "words per modal paragraph", () => false);
    sentenceCheck(at(s, ["extraParagraphs", i]), p);
    place(s, p);
    add(wordsOf(p));
  }

  // Key concepts.
  const details = m.details ?? [];
  if (details.length) {
    if (details.length < MODAL.conceptMin || details.length > MODAL.conceptMax)
      fail({ ...base("details"), rule: "key concepts", count: details.length, limit: details.length < MODAL.conceptMin ? MODAL.conceptMin : MODAL.conceptMax });
    for (const [i, d] of details.entries()) {
      for (const key of Object.keys(d).filter((k) => /^text/.test(k))) {
        const s = `details[${i}].${key}`;
        const ss = sentencesOf(d[key]);
        if (ss.length > 1) fail({ ...base(s), rule: "sentences per key concept", count: ss.length, limit: 1 });
        checkWords(at(s, ["details", i, key]), d[key], MODAL.conceptWords, "words per key concept", () => false);
        sentenceCheck(at(s, ["details", i, key]), d[key]);
        place(s, d[key]);
      }
      const longest = Math.max(...Object.keys(d).filter((k) => /^text/.test(k)).map((k) => wordsOf(d[k])));
      add(wordsOf(d.bold) + longest);
    }
  }

  // Steps (only where sequence matters).
  if (m.steps) {
    if (m.steps.length > MODAL.steps) fail({ ...base("steps"), rule: "steps", count: m.steps.length, limit: MODAL.steps });
    for (const [i, st] of m.steps.entries()) {
      checkWords(at(`steps[${i}]`, ["steps", i]), st, MODAL.stepWords, "words per step", () => false);
      add(wordsOf(st));
    }
  }

  // Quick Links.
  const links = m.links ?? [];
  if (links.length < MODAL.linksMin || links.length > MODAL.linksMax)
    fail({ ...base("links"), rule: "quick links", count: links.length, limit: links.length < MODAL.linksMin ? MODAL.linksMin : MODAL.linksMax });
  void faq;

  const total = Math.max(...totals);
  if (total > MODAL.totalWords) fail({ ...base("total"), rule: "words in the modal, links excluded", count: total, limit: MODAL.totalWords });
}

// ── Reading the strings files ────────────────────────────────────────────────

function contentFiles() {
  const dir = join(ROOT, "content");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "event-prose.yaml")))
    .map((e) => ({ family: e.name, rel: `content/${e.name}/event-prose.yaml` }));
}

/** FAQ id -> url, from components/transaction-timeline/explanation/shared/faqUrls.ts. */
function faqTable() {
  const rel = "components/transaction-timeline/explanation/shared/faqUrls.ts";
  if (!existsSync(join(ROOT, rel))) return {};
  const src = read(rel);
  const out = {};
  for (const m of src.matchAll(/^\s*([A-Z0-9_]+):\s*\n?\s*"(https?:[^"]+)"/gm)) out[m[1]] ??= m[2];
  return out;
}

const cardLabelWords = (family, d) => {
  const set = new Set();
  const add = (s) => typeof s === "string" && set.add(s.toLowerCase());
  for (const sec of ["L1_words", "page_words", "group_words", "words"]) Object.values(d[sec] ?? {}).forEach(add);
  const z = Z1_STRINGS[family];
  const ids = z1Ids(family, d);
  for (const [k, v] of Object.entries(z ? (d[z.section] ?? {}) : {}))
    if (!ids.includes(k) && typeof v === "string" && v.split(/\s+/).length <= 4) add(v);
  return set;
};

function checkStringsFile({ family, rel }) {
  const src = new Source(rel, read(rel));
  const d = parseContent(read(rel));
  const out = { sentences: 0, pane: [], z1: 0 };
  const figNameZ2 = (name) => {
    const r = d.placeholders?.[name]?.rounding;
    return r != null && !NAME_ROUNDINGS.has(r);
  };
  const z1 = Z1_STRINGS[family];
  const figNameZ1 = z1?.figures === "placeholders" ? figNameZ2 : (name) => !Z1_NAME_PLACEHOLDERS.has(name);

  // Z2: shared sentences, then each template's own sentences and payout legs.
  for (const [id, s] of Object.entries(d.shared_sentences ?? {})) {
    out.sentences++;
    checkBullet({ src, file: rel, id: `shared_sentences.${id}`, zone: "Z2", path: ["shared_sentences", id, "text"] }, s.text, "Z2", { isFig: figNameZ2 });
  }
  const headingWords = Object.fromEntries(
    Object.entries(d.group_words ?? {}).map(([k, v]) => [k, v.trim().split(/\s+/).length]),
  );
  for (const [i, t] of (d.templates ?? []).entries()) {
    for (const [id, s] of Object.entries(t.sentences ?? {})) {
      out.sentences++;
      checkBullet({ src, file: rel, id: `${t.id}/${id}`, zone: "Z2", path: ["templates", i, "sentences", id, "text"] }, s.text, "Z2", { isFig: figNameZ2 });
    }
    const wc = worstCase(t, d.shared_sentences ?? {}, headingWords);
    out.pane.push({ id: t.id, ...wc });
    checkPane({ file: rel, id: t.id }, "Z2", wc);
  }
  checkHeadingSet(rel, d.group_words, d.templates ?? []);

  // Z1: the position card's strings.
  const sec = z1?.section;
  for (const id of z1Ids(family, d)) {
    const text = d[sec]?.[id];
    if (typeof text !== "string") {
      fail({ file: rel, id: `${sec}.${id}`, zone: "Z1", rule: "Z1 string listed in the check is gone (update Z1_STRINGS)", count: 0, limit: 0 });
      continue;
    }
    out.z1++;
    checkBullet({ src, file: rel, id: `${sec}.${id}`, zone: "Z1", path: [sec, id] }, text, "Z1", { lead: text.trim().endsWith(":"), isFig: figNameZ1 });
  }
  for (const k of Object.keys((sec && d[sec]) ?? {}))
    if (/^(group|heading)_/.test(k) && !Z1_HEADINGS.includes(d[sec][k]))
      fail({ file: rel, id: `${sec}.${k}`, zone: "Z1", rule: `heading outside ${Z1_HEADINGS.join(", ")}`, count: 1, limit: 0 });

  // Z4: modals.
  const faq = faqTable();
  for (const [name, m] of Object.entries(d.L5 ?? {})) checkModal({ src, file: rel, id: "", zone: "Z4" }, name, m, { faq });

  src.finish();
  return { d, src, out };
}

// ── Term check, first half (listing only) ────────────────────────────────────

function termListing(family, rel, d) {
  const glossary = new Map();
  for (const [name, m] of Object.entries(d.L5 ?? {}))
    for (const x of m.details ?? []) glossary.set(x.bold.toLowerCase().replace(/&/g, "and"), `L5.${name}`);
  const card = cardLabelWords(family, d);
  const strings = [
    ...Object.entries(d.shared_sentences ?? {}).map(([id, s]) => [`shared_sentences.${id}`, s.text]),
    ...(d.templates ?? []).flatMap((t) => Object.entries(t.sentences ?? {}).map(([id, s]) => [`${t.id}/${id}`, s.text])),
    ...z1Ids(family, d).map((id) => [`${Z1_STRINGS[family].section}.${id}`, d[Z1_STRINGS[family].section]?.[id] ?? ""]),
  ];
  for (const [id, text] of strings)
    for (const [term, modal] of glossary) {
      if (card.has(term)) continue;
      if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
        listings.push({ file: rel, id, term, modal });
    }
}

// ── Other families: the register scan's extracted sentences ─────────────────

function skipString(src, j) {
  const q = src[j];
  if (q === "'" && j > 0 && /\p{L}/u.test(src[j - 1])) return j;
  for (j++; j < src.length; j++) {
    if (src[j] === "\\") j++;
    else if (src[j] === q) return j;
  }
  return src.length;
}
const hasProse = (s) => /[A-Za-z’']+\s+[A-Za-z’']+\s+[A-Za-z’']+\s+[A-Za-z’']+/.test(s.replace(/\([^)]*\)/g, ""));

/** JSX and ternaries to text segments: braces with prose unwrapped, other braces one {x}. Heuristic. */
export function unwrapJsx(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "{") {
      out += raw[i];
      continue;
    }
    let d = 0;
    let j = i;
    for (; j < raw.length; j++) {
      const ch = raw[j];
      if (ch === '"' || ch === "`" || ch === "'") {
        j = skipString(raw, j);
        continue;
      }
      if (ch === "{") d++;
      else if (ch === "}" && --d === 0) break;
    }
    const inner = raw.slice(i + 1, j);
    if (/^\s*(?:"\s*"|`\s*`|'\s*')\s*$/.test(inner)) out += " ";
    else if (hasProse(inner)) out += "\n" + unwrapJsx(inner) + "\n";
    else out += " {x} ";
    i = j;
  }
  return out;
}

function proseSegments(raw) {
  const t = unwrapJsx(raw)
    .replace(/\?\s*\(|\)\s*:\s*\(|&&\s*\(|\)\s*:\s*null|\s\?\s*"|"\s*:\s*"|"\s*:\s*\(|\)\s*:\s*"/g, "\n")
    .replace(/[“”"`]/g, "")
    .replace(/<[^>]*>/g, " ");
  return t
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => hasProse(s) && !/===|!==|&&|\|\||=>|\w\.\w+\(|\bnull\b/.test(s.split(" ").slice(0, 8).join(" ")));
}

function otherFamilies() {
  const files = discoverGenericCopyFiles(ROOT).filter((f) => /\.tsx$/.test(f) && !/use-trove-explanation-items/.test(f));
  const found = [];
  let units = 0;
  for (const f of files) {
    const rel = relative(ROOT, f);
    const zone = /position-explanation/.test(rel) ? "Z1" : "Z2";
    for (const u of extractCopyUnits(readFileSync(f, "utf8"))) {
      units++;
      for (const seg of proseSegments(u.raw))
        for (const s of sentencesOf(seg)) {
          const lead = zone === "Z1" && /:$/.test(s);
          const limit = lead ? PLAIN.Z1.lead : PLAIN[zone].bullet;
          const words = countWords(s);
          if (words > limit)
            found.push({ file: rel, id: `line ${u.line}`, zone, rule: `words per ${lead ? "lead sentence" : "sentence"} (extracted)`, count: words, limit, text: s });
        }
    }
  }
  return { files: files.length, units, found };
}

// ── Links: official documentation only ───────────────────────────────────────

function linkChecks(parsed) {
  const docsRel = "content/official-docs.json";
  if (!existsSync(join(ROOT, docsRel))) {
    fail({ file: docsRel, id: "-", zone: "Z4", rule: "official-docs.json missing", count: 0, limit: 0 });
    return { checked: 0, notDocs: [] };
  }
  const docs = JSON.parse(read(docsRel));
  const union = new Set(Object.values(docs.families).flat());
  const notDocs = [];
  let checked = 0;
  const judge = ({ file, id, url, family }) => {
    let host;
    try {
      host = new URL(url).host;
    } catch {
      return fail({ file, id, zone: "Z4", rule: "link is not a URL", count: 0, limit: 0, got: url });
    }
    checked++;
    if (docs.notDocumentation.includes(host)) return notDocs.push({ file, id, url, family, host });
    const allowed = family ? docs.families[family] : null;
    if (family && !allowed) return fail({ file, id, zone: "Z4", rule: `family "${family}" has no official hosts in official-docs.json`, count: 0, limit: 0, got: url });
    const ok = allowed ? allowed.includes(host) : union.has(host);
    if (!ok) fail({ file, id, zone: "Z4", rule: family ? `link host is not ${family}'s official documentation` : "link host is in no family's official documentation list", count: 0, limit: 0, got: url });
  };

  // Strings files: modal links, concept sources, video, faq and doc ids.
  const faq = faqTable();
  for (const { family, rel, d } of parsed) {
    const link = (id, l) => {
      const url = l.url ?? (l.faq !== undefined ? faq[l.faq] : d.doc_urls?.[l.doc]);
      if (!url) fail({ file: rel, id, zone: "Z4", rule: `${l.faq !== undefined ? `faq id ${l.faq}` : `doc id ${l.doc}`} resolves to no url`, count: 0, limit: 0 });
      else judge({ file: rel, id, url, family });
    };
    const modals = [...Object.entries(d.L5 ?? {}).map(([n, m]) => [`L5.${n}`, m]), ...(d.info ? [["info", d.info]] : [])];
    for (const [name, m] of modals) {
      for (const [i, l] of (m.links ?? []).entries()) link(`${name}.links[${i}]`, l);
      for (const [i, x] of (m.details ?? []).entries())
        for (const [j, l] of (x.sources ?? []).entries()) link(`${name}.details[${i}].sources[${j}]`, l);
      if (m.video?.url) judge({ file: rel, id: `${name}.video`, url: m.video.url, family });
    }
    for (const [i, l] of (d.claim_links ?? []).entries()) link(`claim_links[${i}]`, l);
  }

  // TS modals: URL literals in the learn-more files, attributed to the family
  // of the nearest preceding official-docs link (heuristic).
  const files = [
    "lib/shared/learn-more-content.ts",
    "components/transaction-timeline/explanation/shared/faqUrls.ts",
    ...(existsSync(join(ROOT, "lib"))
      ? readdirSync(join(ROOT, "lib"), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .flatMap((e) => readdirSync(join(ROOT, "lib", e.name)).filter((f) => /^learn-more.*\.ts$/.test(f)).map((f) => `lib/${e.name}/${f}`))
      : []),
  ].filter((f, i, a) => existsSync(join(ROOT, f)) && a.indexOf(f) === i);
  const hostFamily = (host) => {
    const fams = Object.entries(docs.families).filter(([, hs]) => hs.includes(host)).map(([f]) => f);
    return fams.length ? fams.join("/") : null;
  };
  for (const rel of files) {
    let last = null;
    for (const [i, line] of read(rel).split("\n").entries()) {
      for (const m of line.matchAll(/https?:\/\/[^\s"'`)\]},]+/g)) {
        let host;
        try {
          host = new URL(m[0]).host;
        } catch {
          continue;
        }
        const fam = hostFamily(host);
        if (fam) last = fam;
        judge({ file: rel, id: `line ${i + 1}`, url: m[0], family: null });
        const row = notDocs[notDocs.length - 1];
        if (row && row.file === rel && row.id === `line ${i + 1}` && row.url === m[0]) row.family = last ?? "unattributed";
      }
    }
  }
  return { checked, notDocs };
}

// ── Self-test: every rule must be able to fail ───────────────────────────────

function selfTest() {
  const results = [];
  const run = (name, fn, expectRule) => {
    const caught = { failures: [], warnings: [], listings: [] };
    const prev = sink;
    sink = caught;
    try {
      fn();
    } finally {
      sink = prev;
    }
    const hit = caught.failures.some((f) => f.rule.startsWith(expectRule));
    results.push({ name, hit });
  };
  const where = { file: "self-test", id: "x", zone: "Z2" };
  const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  const isFig = () => true;
  run("words per bullet", () => checkBullet(where, words(21) + ".", "Z2", { isFig }), "words per bullet");
  run("words per lead sentence", () => checkBullet(where, words(26) + ":", "Z1", { lead: true, isFig }), "words per lead sentence");
  run("figures per bullet", () => checkBullet(where, "Debt {a} at {b} and 5% now.", "Z2", { isFig }), "figures per bullet");
  run("joining marks per bullet", () => checkBullet(where, "One, two, three, and four.", "Z2", { isFig }), "joining marks");
  run("bullets per group / groups / bullets / words per pane", () => checkPane(where, "Z2", { perGroup: 9, groups: 9, bullets: 99, words: 999 }), "bullets per group");
  run("groups per pane", () => checkPane(where, "Z2", { perGroup: 1, groups: 9, bullets: 1, words: 1 }), "groups per pane");
  run("words per pane", () => checkPane(where, "Z2", { perGroup: 1, groups: 1, bullets: 1, words: 999 }), "words per pane");
  run("reveal size", () => checkReveal(where, "Z1", [words(130), words(10), words(10), words(10)]), "words per reveal");
  run("reveals in Z2", () => checkReveal(where, "Z2", ["One."]), "reveals per pane");
  run("heading set", () => checkHeadingSet("self-test", { happened: "What happens", adds_up: "How it adds up", leaves: "Where it leaves the position" }, []), "heading is");
  run("heading order", () => checkHeadingSet("self-test", Object.fromEntries(Z2_HEADINGS), [{ id: "t", groups: { leaves: [], happened: [] } }]), "groups out of heading order");
  const cap = (n) => "Word " + words(n - 1);
  const modal = { intro: cap(30) + ". " + cap(30) + ". " + cap(3) + ".", extraParagraphs: [words(60) + "{coll_x}", "B.", "C."], details: [{ bold: "A", text: words(30) + ". Two." }], links: [] };
  for (const [rule, name] of [
    ["words in the intro", "intro"],
    ["sentences in the intro", "intro sentences"],
    ["words per modal sentence", "modal sentence"],
    ["paragraphs in the modal", "paragraph count"],
    ["words per modal paragraph", "paragraph words"],
    ["instance placeholder", "instance placeholder"],
    ["key concepts", "concept count"],
    ["sentences per key concept", "concept sentences"],
    ["words per key concept", "concept words"],
    ["quick links", "link count"],
  ])
    run(`modal: ${name}`, () => checkModal(where, "t", modal), rule);
  run("modal: words in the modal", () => checkModal(where, "t", { intro: "One.", extraParagraphs: [words(54), words(54)], details: ["A", "B", "C", "D"].map((b) => ({ bold: b, text: words(25) })), links: [{}] }), "words in the modal");
  const exc = (s) => new Source("self-test.yaml", s);
  run("exception: stale", () => {
    const s = exc("a:\n  # prose-limit: words 40 (reason)\n  b: |-\n    " + words(22) + "\n");
    checkWords({ src: s, path: ["a", "b"], file: "self-test.yaml", id: "a.b", zone: "Z2" }, words(22), 20, "words per bullet", () => false);
  }, "words per bullet: exception says");
  run("exception: margin", () => {
    const s = exc("a:\n  # prose-limit: words 30 (reason)\n  b: |-\n    " + words(30) + "\n");
    checkWords({ src: s, path: ["a", "b"], file: "self-test.yaml", id: "a.b", zone: "Z2" }, words(30), 20, "words per bullet", () => false);
  }, "words per bullet: past the exception margin");
  run("exception: four in a zone", () => {
    const body = [1, 2, 3, 4].map((i) => `  # prose-limit: words 22 (r)\n  s${i}: |-\n    ${words(22)}\n`).join("");
    const s = exc("a:\n" + body);
    for (let i = 1; i <= 4; i++) checkWords({ src: s, path: ["a", `s${i}`], file: "self-test.yaml", id: `a.s${i}`, zone: "Z2" }, words(22), 20, "words per bullet", () => false);
    s.finish();
  }, "exceptions per zone per file");
  run("exception: orphan comment", () => {
    exc("a:\n  # prose-limit: words 22 (r)\n\n\n  b: |-\n    x\n").finish();
  }, "prose-limit comment sits above no checked string");
  console.log("self-test: each rule must produce a failure on an over-limit input");
  for (const r of results) console.log(`${r.hit ? "ok  " : "MISS"}  ${r.name}`);
  const miss = results.filter((r) => !r.hit);
  console.log(`\n${results.length - miss.length} of ${results.length} rules failed as they should`);
  process.exit(miss.length ? 1 : 0);
}

// ── Run ──────────────────────────────────────────────────────────────────────

if (SELF_TEST) selfTest();

const parsed = [];
const panes = [];
let sentenceCount = 0;
let z1Count = 0;
for (const f of contentFiles()) {
  const { d, out } = checkStringsFile(f);
  parsed.push({ ...f, d });
  panes.push(...out.pane.map((p) => ({ ...p, file: f.rel })));
  sentenceCount += out.sentences;
  z1Count += out.z1;
  termListing(f.family, f.rel, d);
}
const others = otherFamilies();
const links = linkChecks(parsed);
for (const n of links.notDocs) warn({ ...n, rule: "not documentation" });

// ── Report ───────────────────────────────────────────────────────────────────

const loc = (f) => `${f.file}${f.line ? `:${f.line}` : ""}`;
const fmt = (f) =>
  `${f.id} :: ${f.zone} :: ${f.rule} :: ${f.count > 0 || f.limit > 0 ? `${f.count} (limit ${f.limit})` : f.got ?? ""}`;

if (!SUMMARY) {
  for (const f of failures) console.log(`FAIL  ${loc(f)} :: ${fmt(f)}`);
  for (const f of others.found) console.log(`LIST  ${loc(f)} :: ${fmt(f)}\n        "${f.text.slice(0, 160)}"`);
  for (const w of warnings) console.log(`WARN  ${w.file} :: ${w.id} :: ${w.family ?? ""} :: not documentation :: ${w.url}`);
}

const tally = (rows, key) => {
  const m = new Map();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};
console.log(`\ncheck:prose-limits${REPORT ? " (report mode)" : ""}`);
console.log(`  scanned: ${contentFiles().length} strings file(s), ${sentenceCount} event/shared sentences, ${z1Count} Z1 strings, ${panes.length} templates (Z2 panes), ${others.files} clause/pane files with ${others.units} units for other families, ${links.checked} links`);
console.log("  Z3 Lifetime flows: skipped, the pane is TSX (lib/liquity/economics-explanation.tsx) until its words move into a strings file");
console.log("  Reveal size: no reveal exists in a strings file yet; the rule is exercised by --self-test");
console.log(`  failures: ${failures.length}`);
for (const [zone, n] of tally(failures, (f) => f.zone)) console.log(`    ${zone}: ${n}`);
console.log("  per rule:");
for (const [rule, n] of tally(failures, (f) => `${f.zone} ${f.rule}`)) console.log(`    ${String(n).padStart(4)}  ${rule}`);
const worst = [...failures].filter((f) => f.count > f.limit && f.limit > 0).sort((a, b) => b.count - b.limit - (a.count - a.limit)).slice(0, 12);
console.log("  worst strings (count over limit):");
for (const f of worst) console.log(`    ${f.count}/${f.limit}  ${f.zone}  ${f.rule}  ${f.id}`);
console.log(`  other families, extracted sentences over the limit (listed only): ${others.found.length}`);
for (const [fam, n] of tally(others.found, (f) => f.file.split("/").slice(0, -1).join("/"))) console.log(`    ${String(n).padStart(3)}  ${fam}`);
console.log(`  not documentation (listed only): ${warnings.length}`);
for (const [fam, n] of tally(warnings, (w) => `${w.family ?? "-"} ${w.host}`)) console.log(`    ${String(n).padStart(3)}  ${fam}`);
console.log(`  term check, first half (listed for review only): ${listings.length}`);
if (!SUMMARY) for (const l of listings) console.log(`    ${l.id}  uses "${l.term}" (modal ${l.modal}), which is not among the file's short card labels`);

if (failures.length && !REPORT) {
  console.log("\nFAIL  check:prose-limits (strict). Run with --report to list without failing.");
  process.exit(1);
}
process.exit(0);
