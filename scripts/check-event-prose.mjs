#!/usr/bin/env node
// check:prose — each family's strings file and the code that reads it agree
// (rails-ops decision 0036, TO-DO-ui-jobs 278 and 314). Every
// content/<family>/event-prose.yaml is checked against its family's entry in
// FAMILIES below (the generator, the loader and the files that print its
// words); a strings file with no entry fails:
//
//   1. The file parses, and every section and field the loader types is there,
//      each string one non-empty line.
//   2. Every id the code reads exists: template ids, the variants the
//      generator picks, the sentence ids it says (each in a template of the
//      case that says it, or shared and listed in that template's order),
//      every word id (L1_WORDS.x, L2_WORDS.x, …, an L1 group's `word`), every
//      fragment, every modal and FAQ link id.
//   3. Every placeholder in every string is one the code supplies there: a
//      template's sentences and L1 against the values the generator sets for
//      that template (read from its `v.name =` lines), a word against the
//      values its fillText / wordsAround call passes, a modal against its
//      fillWords calls and `values = {…}` objects; each placeholder has a
//      rounding, and a `{name|rounding}` names a rounding that exists.
//   4. No prose outside the file: the generator, the Markdown, the loader and
//      the renderers hold no string literal that reads as words.
//
// Each failure names the file, the template or string id, and the placeholder.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const { parseContent } = createRequire(import.meta.url)("./yaml-loader.cjs");
const read = (rel) => readFileSync(resolvePath(ROOT, rel), "utf8");

/**
 * One entry per family with a strings file. `generator` holds `entry` (the
 * generator function), whose `switch (t.id) {` runs to `switchEnd`; the
 * template ids it reads start with `prefix`, and `fallback` is the template its
 * default case says. `builtVariants` lists the variants pick() builds rather
 * than writes. `wordConsts` maps a loader constant (`L1_WORDS`) to its section;
 * `nodes` names the section read through word and node calls (`troveWords`,
 * `troveNodes`) and the files that make them. `faq` is the link table in code a
 * modal's `faq` id reads; a `doc` id reads the file's `doc_urls`.
 */
const FAMILIES = {
  "liquity-v2": {
    generator: "lib/liquity/event-prose.ts",
    loader: "lib/liquity/event-templates.ts",
    entry: "export function liquityEventProse(",
    switchEnd: "// Same block",
    prefix: "liquity2",
    fallback: "liquity2.fallback",
    builtVariants: (gen) => {
      const out = [];
      // `${c}_${d}`: add or withdraw, borrow or repay.
      if (/variant: `\$\{c\}_\$\{d\}`/.test(gen))
        for (const c of ["add", "withdraw"])
          for (const dd of ["borrow", "repay"]) out.push(["liquity2.adjust.combined", `${c}_${dd}`]);
      // The transfer's variant is the log's transferType.
      if (/ctx\.transfer \? ctx\.transfer\.transferType/.test(gen))
        for (const v of ["transfer", "mint", "burn"]) out.push(["liquity2.transfer", v]);
      return out;
    },
    wordConsts: {
      L1_WORDS: "L1_words",
      L2_WORDS: "L2_words",
      CONTEXT_WORDS: "context_words",
      FOOTER_WORDS: "footer_words",
      COPY_WORDS: "copy_words",
      ACTION_WORDS: "action_words",
      PAGE_WORDS: "page_words",
    },
    /** Sections a modal's intro fills from (read as `FILE.<section>.x`). */
    modalWords: "L5_words",
    /** Files that print the file's words, scanned for the ids they read. */
    readers: [
      "lib/liquity/event-prose.ts",
      "lib/liquity/event-templates.ts",
      "lib/liquity/event-markdown.ts",
      "lib/liquity/event-ledgers.ts",
      "lib/liquity/accrual.ts",
      "lib/liquity/event-page.ts",
      "components/protocol/liquity/event-prose-render.tsx",
      "components/protocol/liquity/liquity-head.tsx",
      "components/protocol/liquity/liquity-cells.tsx",
      "components/protocol/liquity/liquity-event-card.tsx",
      "lib/liquity/explorer.ts",
    ],
    /** The listing, the Trove and event pages, the run card and the position
     *  card's explanation print trove_words. */
    nodes: {
      section: "trove_words",
      calls: ["troveWords", "troveNodes"],
      readers: [
        "app/(app)/ethereum/liquity-v2/(views)/liquity-v2-listing.tsx",
        "app/(app)/ethereum/liquity-v2/trove/[collateralType]/[troveId]/trove-view.tsx",
        "app/(app)/ethereum/liquity-v2/trove/[collateralType]/[troveId]/event/[eventId]/event-view.tsx",
        "components/protocol/liquity/delegate-adjust-run-card.tsx",
        "components/trove/use-trove-explanation-items.tsx",
        "lib/liquity/trove-page-words.tsx",
      ],
    },
    faq: { file: "components/transaction-timeline/explanation/shared/faqUrls.ts", table: "export const FAQ_URLS" },
    /** Files that may hold no prose (the node readers too). */
    noProse: [
      "lib/liquity/trove-nodes.tsx",
      "lib/liquity/event-prose.ts",
      "lib/liquity/event-templates.ts",
      "lib/liquity/event-markdown.ts",
      "lib/liquity/event-prose-position.ts",
      "lib/liquity/event-page.ts",
      "lib/liquity/event-page-markdown.ts",
      "components/protocol/liquity/event-prose-render.tsx",
    ],
  },
  "liquity-v1": {
    generator: "lib/liquity-v1/event-prose.ts",
    loader: "lib/liquity-v1/event-templates.ts",
    entry: "export function liquityV1EventProse(",
    switchEnd: "// ── The run's sentences",
    prefix: "liquity1",
    fallback: "liquity1.fallback",
    builtVariants: (gen) => {
      const out = [];
      // [c, d].filter(Boolean).join("_"): add or withdraw, borrow or repay, either or both.
      if (/const variant = \[c, d\]\.filter\(Boolean\)\.join\("_"\)/.test(gen))
        for (const c of ["add", "withdraw", ""])
          for (const d of ["borrow", "repay", ""])
            if (c || d) out.push(["liquity1.adjust", [c, d].filter(Boolean).join("_")]);
      return out;
    },
    wordConsts: { V1_WORDS: "words" },
    modalWords: null,
    readers: [
      "lib/liquity-v1/event-prose.ts",
      "lib/liquity-v1/event-templates.ts",
      "components/protocol/liquity-v1/liquity-v1-event-explainer.tsx",
      "components/protocol/liquity-v1/liquity-v1-position-explanation.tsx",
    ],
    nodes: {
      section: "position_words",
      calls: ["positionWords", "positionNodes"],
      readers: ["components/protocol/liquity-v1/liquity-v1-position-explanation.tsx"],
    },
    faq: null,
    noProse: [
      "lib/liquity-v1/event-prose.ts",
      "lib/liquity-v1/event-templates.ts",
      "lib/liquity-v1/position-nodes.tsx",
      "components/protocol/liquity-v1/liquity-v1-event-explainer.tsx",
      "components/protocol/liquity-v1/liquity-v1-event-card.tsx",
    ],
  },
  "aave-v3": {
    generator: "lib/aave-v3/event-prose.ts",
    loader: "lib/aave-v3/event-templates.ts",
    entry: "export function aaveV3EventProse(",
    switchEnd: "// ── The run's sentences",
    prefix: "aave3",
    fallback: "aave3.fallback",
    builtVariants: (gen) =>
      // A swap's variant is its kind.
      /variant: s\.kind/.test(gen)
        ? ["debt_swap", "repay_with_collateral", "supply_from_swap", "withdraw_and_swap", "collateral_swap"].map(
            (k) => ["aave3.swap", k],
          )
        : [],
    wordConsts: { V3_WORDS: "words" },
    modalWords: null,
    readers: [
      "lib/aave-v3/event-prose.ts",
      "lib/aave-v3/event-templates.ts",
      "components/protocol/aave-v3/aave-v3-event-explainer.tsx",
      "components/protocol/aave-v3/aave-v3-position-explanation.tsx",
    ],
    nodes: {
      section: "position_words",
      calls: ["positionWords", "positionNodes"],
      readers: ["components/protocol/aave-v3/aave-v3-position-explanation.tsx"],
    },
    faq: null,
    noProse: [
      "lib/aave-v3/event-prose.ts",
      "lib/aave-v3/event-templates.ts",
      "lib/aave-v3/event-state.ts",
      "lib/aave-v3/position-nodes.tsx",
      "components/protocol/aave-v3/aave-v3-event-explainer.tsx",
    ],
  },
};

/** The engine every family runs on: no prose either. */
const SHARED_NO_PROSE = [
  "lib/shared/event-prose/engine.ts",
  "lib/shared/event-prose/roundings.ts",
  "lib/shared/event-prose/markdown.ts",
  "lib/shared/event-prose/nodes.tsx",
  "components/shared/prose-sentence-text.tsx",
];

/** A string literal that reads as words. */
const PROSE = [/(?<![\w-])[A-Za-z]{2,} [a-z]{2,}(?![\w-])/, /(?<![\w-])[A-Z][a-z]{2,}(?![\w-])/];

const failures = [];
const failIn = (file, msg) => failures.push(`${file}: ${msg}`);
const passes = [];

/** Source with comments blanked, line breaks kept. */
function stripComments(src) {
  return src
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, (_, p) => p)
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

/** The keys of the object literal that follows `at` in `src`. */
function objectKeys(src, at) {
  const open = src.indexOf("{", at);
  let depth = 0;
  let j = open;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) break;
  }
  const inner = src.slice(open + 1, j);
  // Top-level keys only: blank out nested braces and parens.
  let flat = "";
  let nest = 0;
  for (const ch of inner) {
    if (ch === "{" || ch === "(") nest++;
    if (nest === 0) flat += ch;
    if (ch === "}" || ch === ")") nest--;
  }
  return [...flat.matchAll(/(?:^|,)\s*([a-z_0-9]+)\s*(?=[:,]|$)/g)].map((m) => m[1]);
}

const contentDir = resolvePath(ROOT, "content");
const families = readdirSync(contentDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(resolvePath(contentDir, e.name, "event-prose.yaml")))
  .map((e) => e.name);
for (const family of families) {
  const F = FAMILIES[family];
  if (!F) failIn(`content/${family}/event-prose.yaml`, `has no entry in scripts/check-event-prose.mjs FAMILIES`);
  else checkFamily(family, F);
}
for (const file of SHARED_NO_PROSE) noProseIn(file, "the family's strings file");
report();

function checkFamily(family, F) {
  const DATA = `content/${family}/event-prose.yaml`;
  const GENERATOR = F.generator;
  const LOADER = F.loader;
  const READERS = F.readers;
  const before = failures.length;
  const fail = (msg) => failures.push(`${DATA}: ${msg}`);

  // ── 1. Parse and shape ───────────────────────────────────────────────────────

  let d;
  try {
    d = parseContent(read(DATA));
  } catch (e) {
    fail(`does not parse:\n${e.message}`);
    return;
  }

  const WORD_SECTIONS = [
    ...Object.values(F.wordConsts),
    "group_words",
    ...(F.modalWords ? [F.modalWords] : []),
    F.nodes.section,
  ];
  const isLine = (s) => typeof s === "string" && s.trim() !== "" && !s.includes("\n");
  const str = (where, s) => {
    if (!isLine(s)) fail(`${where} is not a one-line string (${JSON.stringify(s)})`);
    return isLine(s);
  };
  const obj = (where, o) => {
    const ok = o != null && typeof o === "object" && !Array.isArray(o);
    if (!ok) fail(`${where} is missing or not a section of ids`);
    return ok;
  };

  for (const k of ["roundings", "placeholders", ...WORD_SECTIONS, "shared_sentences", "L5"]) obj(k, d?.[k]);
  if (!Array.isArray(d?.templates)) fail("templates is missing or not a list");
  if (failures.length > before) return;
  if (d.doc_urls !== undefined && obj("doc_urls", d.doc_urls))
    for (const [k, v] of Object.entries(d.doc_urls))
      if (str(`doc_urls.${k}`, v) && !/^https:\/\//.test(v)) fail(`doc_urls.${k} is not an https url`);

  for (const [k, v] of Object.entries(d.roundings)) str(`roundings.${k}`, v);
  for (const [k, v] of Object.entries(d.placeholders)) {
    if (!obj(`placeholders.${k}`, v)) continue;
    str(`placeholders.${k}.means`, v.means);
    if (!(v.rounding in d.roundings)) fail(`placeholders.${k}: rounding "${v.rounding}" is not in roundings`);
  }
  for (const sec of WORD_SECTIONS) for (const [k, v] of Object.entries(d[sec])) str(`${sec}.${k}`, v);
  const sentenceShape = (where, s) => {
    if (!obj(where, s)) return;
    str(`${where}.when`, s.when);
    str(`${where}.text`, s.text);
  };
  for (const [k, s] of Object.entries(d.shared_sentences)) sentenceShape(`shared_sentences.${k}`, s);

  const templates = new Map();
  for (const [i, t] of d.templates.entries()) {
    const where = `templates[${i}]${t?.id ? ` (${t.id})` : ""}`;
    if (!obj(where, t)) continue;
    if (typeof t.id !== "string") fail(`${where}: no id`);
    else if (templates.has(t.id)) fail(`${where}: the id is used twice`);
    templates.set(t.id, t);
    str(`${t.id}.title`, t.title);
    str(`${t.id}.when`, t.when);
    if (!(t.L5 in d.L5)) fail(`${t.id}: L5 "${t.L5}" is not a modal in L5`);
    if (obj(`${t.id}.variants`, t.variants))
      for (const [k, v] of Object.entries(t.variants)) str(`${t.id}.variants.${k}`, v);
    if (obj(`${t.id}.sentences`, t.sentences))
      for (const [k, s] of Object.entries(t.sentences)) sentenceShape(`${t.id}.sentences.${k}`, s);
    if (t.L1 !== undefined && (!Array.isArray(t.L1) || !t.L1.every(Array.isArray)))
      fail(`${t.id}.L1 is not a list of groups`);
    for (const key of ["order", "list"]) {
      if (key === "list" && t.list === undefined) continue;
      if (!Array.isArray(t[key])) {
        fail(`${t.id}.${key} is not a list of sentence ids`);
        continue;
      }
      for (const id of t[key])
        if (!(id in (t.sentences ?? {})) && !(id in d.shared_sentences))
          fail(`${t.id}.${key}: "${id}" is neither its sentence nor a shared one`);
    }
    for (const id of Object.keys(t.sentences ?? {}))
      if (!t.order?.includes(id) && !t.list?.includes(id))
        fail(`${t.id}: sentence "${id}" is in neither order nor list`);
    // Groups: each sentence of order and list in one group_words id, and one only.
    if (obj(`${t.id}.groups`, t.groups)) {
      const seen = new Map();
      for (const [g, ids] of Object.entries(t.groups)) {
        if (!(g in (d.group_words ?? {}))) fail(`${t.id}.groups: "${g}" is not in group_words`);
        if (!Array.isArray(ids)) {
          fail(`${t.id}.groups.${g} is not a list of sentence ids`);
          continue;
        }
        for (const id of ids) {
          if (!t.order?.includes(id) && !t.list?.includes(id))
            fail(`${t.id}.groups.${g}: "${id}" is in neither order nor list`);
          if (seen.has(id)) fail(`${t.id}.groups: "${id}" is in both ${seen.get(id)} and ${g}`);
          seen.set(id, g);
        }
      }
      for (const id of [...(t.order ?? []), ...(t.list ?? [])])
        if (!seen.has(id)) fail(`${t.id}: "${id}" is in no group of groups`);
    }
    // Alternates: lists of its sentences, each in order, none in two lists.
    if (t.alternates !== undefined) {
      if (!Array.isArray(t.alternates) || !t.alternates.every(Array.isArray))
        fail(`${t.id}.alternates is not a list of lists of sentence ids`);
      else {
        const seen = new Set();
        for (const ids of t.alternates)
          for (const id of ids) {
            if (!t.order?.includes(id) && !t.list?.includes(id))
              fail(`${t.id}.alternates: "${id}" is in neither order nor list`);
            if (seen.has(id)) fail(`${t.id}.alternates: "${id}" is in two lists`);
            seen.add(id);
          }
      }
    }
  }

  let FAQ_IDS = new Set();
  if (F.faq) {
    const faqSrc = read(F.faq.file);
    const faqBlock = faqSrc.slice(faqSrc.indexOf(F.faq.table), faqSrc.indexOf("} as const"));
    FAQ_IDS = new Set([...faqBlock.matchAll(/^\s+([A-Z_]+):/gm)].map((m) => m[1]));
  }
  const linkShape = (w, l) => {
    str(`${w}.label`, l?.label);
    if (l?.faq !== undefined) {
      if (!FAQ_IDS.has(l.faq))
        fail(`${w}: faq "${l.faq}" is not in ${F.faq ? "FAQ_URLS" : "a faq table (this family has none)"}`);
    } else if (l?.doc !== undefined) {
      if (!(l.doc in (d.doc_urls ?? {}))) fail(`${w}: doc "${l.doc}" is not in doc_urls`);
    } else if (!/^https:\/\//.test(l?.url ?? "")) fail(`${w}: neither a faq or doc id nor an https url`);
  };
  const modals = [
    ...Object.entries(d.L5).map(([k, m]) => [`L5.${k}`, m]),
    ...(d.info !== undefined ? [["info", d.info]] : []),
  ];
  for (const [w, m] of modals) {
    if (!obj(w, m)) continue;
    str(`${w}.title`, m.title);
    str(`${w}.intro`, m.intro);
    if (m.intro_delegated !== undefined) str(`${w}.intro_delegated`, m.intro_delegated);
    if (m.intro_zero_debt !== undefined) str(`${w}.intro_zero_debt`, m.intro_zero_debt);
    (m.extraParagraphs ?? []).forEach((p, i) => str(`${w}.extraParagraphs[${i}]`, p));
    if (m.stepsHeading !== undefined) str(`${w}.stepsHeading`, m.stepsHeading);
    (m.steps ?? []).forEach((p, i) => str(`${w}.steps[${i}]`, p));
    if (m.detailsHeading !== undefined) str(`${w}.detailsHeading`, m.detailsHeading);
    (m.details ?? []).forEach((x, i) => {
      str(`${w}.details[${i}].bold`, x?.bold);
      str(`${w}.details[${i}].text`, x?.text);
      if (x?.text_delegated !== undefined) str(`${w}.details[${i}].text_delegated`, x.text_delegated);
      if (x?.text_zero_debt !== undefined) str(`${w}.details[${i}].text_zero_debt`, x.text_zero_debt);
      (x?.sources ?? []).forEach((l, j) => linkShape(`${w}.details[${i}].sources[${j}]`, l));
    });
    if (m.video) for (const f of ["label", "url", "description"]) str(`${w}.video.${f}`, m.video[f]);
    (m.links ?? []).forEach((l, i) => linkShape(`${w}.links[${i}]`, l));
  }
  (d.claim_links ?? []).forEach((l, i) => linkShape(`claim_links[${i}]`, l));

  // ── 2. Every id the code reads ───────────────────────────────────────────────

  const gen = read(GENERATOR);
  const fnStart = gen.indexOf(F.entry);
  const switchStart = gen.indexOf("switch (t.id) {", fnStart);
  const sameBlock = gen.indexOf(F.switchEnd, switchStart);
  const fnEnd = gen.indexOf("\n}\n", sameBlock);
  if (fnStart < 0 || switchStart < 0 || sameBlock < 0 || fnEnd < 0) {
    failIn(GENERATOR, `the check cannot find ${F.entry}'s switch (its markers moved)`);
    return;
  }
  const P = F.prefix;

  // Template ids.
  for (const m of gen.matchAll(new RegExp(`"(${P}\\.[a-z_.]+)"`, "g")))
    if (!templates.has(m[1])) failIn(GENERATOR, `reads template "${m[1]}", which ${DATA} lacks`);

  // Variants: the pairs pick() returns (every literal of a variant written as a
  // literal or a ternary of literals), and the ones it builds.
  const picked = [];
  for (const m of gen.matchAll(new RegExp(`id: "(${P}\\.[a-z_.]+)",\\s*variant:([^}]*)\\}`, "g")))
    for (const v of m[2].matchAll(/(?<![=!]== )"([a-z_]+)"/g)) picked.push([m[1], v[1]]);
  picked.push(...F.builtVariants(gen));
  for (const [id, v] of picked)
    if (templates.has(id) && !(v in (templates.get(id).variants ?? {})))
      failIn(GENERATOR, `picks variant "${v}" of ${id}, which ${DATA} lacks`);

  /** The sentence ids a template can say. */
  const sayable = (t) =>
    [...(t.order ?? []), ...(t.list ?? [])].filter((id) => id in (t.sentences ?? {}) || id in d.shared_sentences);

  /** Each `sp.say(…)` in a stretch of source: its literal ids, a template
   *  literal as a pattern. */
  function saidIn(src) {
    const out = [];
    for (const m of src.matchAll(/sp\.say\(|liqDistance\(/g)) {
      let depth = 0;
      let j = m.index + m[0].length - 1;
      for (; j < src.length; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")" && --depth === 0) break;
      }
      const args = src.slice(m.index + m[0].length, j);
      const first = args.split(/,\s*\{/)[0];
      // A literal compared against (`variant === "raised"`) is a variant.
      for (const s of first.matchAll(/(?<![=!]== )"([a-z_.]+)"|`([^`]+)`/g)) {
        if (s[1]) out.push({ id: s[1] });
        else
          out.push({
            pattern: new RegExp(`^${s[2].replace(/\./g, "\\.").replace(/\$\{[^}]+\}/g, "[a-z_]+")}$`),
            raw: s[2],
          });
      }
    }
    return out;
  }
  const checkSaid = (said, ts, where) => {
    for (const s of said) {
      const ok = ts.some((t) => (s.id ? sayable(t).includes(s.id) : sayable(t).some((id) => s.pattern.test(id))));
      if (!ok)
        failIn(
          GENERATOR,
          `${where} says "${s.id ?? s.raw}", which no template there (${ts.map((t) => t.id).join(", ")}) has in its order`,
        );
    }
  };

  // The switch, case by case: consecutive labels share a body.
  const body = gen.slice(switchStart, sameBlock);
  const cases = [];
  {
    const re = new RegExp(`case "(${P}\\.[a-z_.]+)":|default:`, "g");
    let m;
    let labels = [];
    let lastEnd = -1;
    const marks = [];
    while ((m = re.exec(body))) marks.push({ at: m.index, end: re.lastIndex, id: m[1] ?? null });
    for (let i = 0; i < marks.length; i++) {
      labels.push(marks[i].id);
      const next = marks[i + 1];
      const between = body.slice(marks[i].end, next ? next.at : body.length);
      if (between.trim() === "" && next) continue;
      cases.push({ ids: labels.filter(Boolean), isDefault: labels.includes(null), src: between });
      labels = [];
      lastEnd = marks[i].end;
    }
    void lastEnd;
  }
  const allTemplates = [...templates.values()];
  for (const c of cases) {
    const ts = c.isDefault
      ? [templates.get(F.fallback)].filter(Boolean)
      : c.ids.map((id) => templates.get(id)).filter(Boolean);
    checkSaid(saidIn(c.src), ts, c.isDefault ? "the default case" : `case ${c.ids.join(" / ")}`);
  }
  // Helpers before the switch and the same-block sentence after it: some template says each.
  checkSaid(saidIn(gen.slice(fnStart, switchStart)), allTemplates, "a helper of liquityEventProse");
  checkSaid(saidIn(gen.slice(sameBlock, fnEnd)), allTemplates, "the same-block step");

  // Word ids, in every file that prints them.
  const GROUP = F.wordConsts;
  const CONSTS = Object.keys(GROUP).join("|");
  const sources = Object.fromEntries(READERS.map((f) => [f, read(f)]));
  for (const [file, src] of Object.entries(sources)) {
    for (const m of src.matchAll(new RegExp(`\\b(${CONSTS})\\.([a-z_0-9]+)`, "g")))
      if (!(m[2] in d[GROUP[m[1]]])) failIn(file, `reads ${m[1]}.${m[2]}, which ${DATA} lacks (${GROUP[m[1]]})`);
    if (F.modalWords)
      for (const m of src.matchAll(new RegExp(`FILE\\.${F.modalWords}\\.([a-z_0-9]+)`, "g")))
        if (!(m[1] in d[F.modalWords])) failIn(file, `reads ${F.modalWords}.${m[1]}, which ${DATA} lacks`);
  }
  for (const t of allTemplates)
    for (const g of t.L1 ?? [])
      for (const p of g)
        if (p && "word" in p && !(p.word in (d.L1_words ?? {})))
          fail(`${t.id}.L1: word "${p.word}" is not in L1_words`);

  // The node section (trove_words, position_words): the ids each call reads,
  // and the values each call supplies. A ternary first argument reads the
  // literals after its `?`.
  const NODE = F.nodes.section;
  const troveSupply = new Map();
  for (const file of F.nodes.readers) {
    const src = stripComments(read(file));
    for (const m of src.matchAll(new RegExp(`\\b(?:${F.nodes.calls.join("|")})\\(`, "g"))) {
      const open = m.index + m[0].length;
      let depth = 1;
      let j = open;
      let comma = -1;
      for (; j < src.length && depth > 0; j++) {
        const ch = src[j];
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        else if (ch === "," && depth === 1 && comma < 0) comma = j;
      }
      const first = src.slice(open, comma < 0 ? j - 1 : comma);
      const idArg = first.includes("?") ? first.slice(first.indexOf("?")) : first;
      const ids = [...idArg.matchAll(/"([a-z_0-9]+)"/g)].map((x) => x[1]);
      const keys = comma < 0 ? [] : objectKeys(src, comma);
      for (const id of ids) {
        if (!(id in d[NODE])) failIn(file, `reads ${NODE}.${id}, which ${DATA} lacks`);
        const set = troveSupply.get(id) ?? new Set();
        keys.forEach((k) => set.add(k));
        troveSupply.set(id, set);
      }
    }
  }
  for (const id of Object.keys(d[NODE]))
    if (!troveSupply.has(id)) fail(`${NODE}.${id} is read by no file in FAMILIES["${family}"].nodes.readers`);

  // ── 3. Placeholders ──────────────────────────────────────────────────────────

  const TOKEN = /\{([a-z_0-9]+)(?:\|([a-z_]+))?\}/g;
  const assigned = (src) => new Set([...src.matchAll(/\bv\.([a-z_0-9]+)\s*=(?!=)/g)].map((m) => m[1]));
  const common = new Set([...assigned(gen.slice(fnStart, switchStart)), ...assigned(gen.slice(sameBlock, fnEnd))]);
  const supplied = new Map();
  for (const c of cases) {
    const names = assigned(c.src);
    const ids = c.isDefault ? [F.fallback] : c.ids;
    for (const id of ids) supplied.set(id, new Set([...common, ...names]));
  }

  function placeholders(where, text, allowed, needsRounding = true) {
    for (const m of text.matchAll(TOKEN)) {
      const [tok, name, rounding] = m;
      if (!allowed.has(name)) fail(`${where}: ${tok} is not a value the code supplies there`);
      if (rounding && !(rounding in d.roundings))
        fail(`${where}: ${tok} names rounding "${rounding}", which is not in roundings`);
      if (needsRounding && !rounding && !(name in d.placeholders))
        fail(`${where}: ${tok} has no entry in placeholders (its rounding and meaning)`);
    }
  }

  for (const t of allTemplates) {
    const allowed = supplied.get(t.id);
    if (!allowed) {
      fail(`${t.id}: no case of the generator's switch says it`);
      continue;
    }
    for (const [id, s] of Object.entries(t.sentences ?? {}))
      if (isLine(s?.text)) placeholders(`${t.id}.sentences.${id}`, s.text, allowed);
    for (const id of [...(t.order ?? []), ...(t.list ?? [])])
      if (!(id in (t.sentences ?? {})) && isLine(d.shared_sentences[id]?.text))
        placeholders(`shared_sentences.${id} (said by ${t.id})`, d.shared_sentences[id].text, allowed);
    for (const g of t.L1 ?? [])
      for (const p of g) {
        if (!p || !("figure" in p)) continue;
        const tok = `{${p.figure}}`;
        if (!allowed.has(p.figure)) fail(`${t.id}.L1: ${tok} is not a value the code supplies there`);
        if (p.symbol && !allowed.has(p.symbol))
          fail(`${t.id}.L1: {${p.symbol}} is not a value the code supplies there`);
        if (p.rounding && !(p.rounding in d.roundings))
          fail(`${t.id}.L1: ${tok} names rounding "${p.rounding}", which is not in roundings`);
        if (!p.rounding && !(p.figure in d.placeholders)) fail(`${t.id}.L1: ${tok} has no entry in placeholders`);
      }
  }

  // Words: the values each call passes.
  const wordSupply = new Map(); // "L2_words.incl" → Set
  const addSupply = (key, names) => {
    const s = wordSupply.get(key) ?? new Set();
    names.forEach((n) => s.add(n));
    wordSupply.set(key, s);
  };
  for (const src of Object.values(sources)) {
    for (const m of src.matchAll(new RegExp(`fillText\\(\\s*(${CONSTS})\\.([a-z_0-9]+),`, "g")))
      addSupply(`${GROUP[m[1]]}.${m[2]}`, objectKeys(src, m.index + m[0].length));
    for (const m of src.matchAll(
      new RegExp(`wordsAround\\(\\s*(${CONSTS})\\.([a-z_0-9]+),\\s*\\[([^\\]]*)\\](,\\s*\\{)?`, "g"),
    )) {
      const names = [...m[3].matchAll(/"([a-z_0-9]+)"/g)].map((x) => x[1]);
      if (m[4]) names.push(...objectKeys(src, m.index + m[0].length - 1));
      addSupply(`${GROUP[m[1]]}.${m[2]}`, names);
    }
  }
  for (const sec of WORD_SECTIONS.filter((s) => s !== F.modalWords && s !== NODE))
    for (const [k, v] of Object.entries(d[sec])) {
      if (!isLine(v) || !/\{/.test(v)) continue;
      const allowed = wordSupply.get(`${sec}.${k}`);
      if (!allowed) fail(`${sec}.${k} has placeholders, and no fillText or wordsAround call fills it`);
      else placeholders(`${sec}.${k}`, v, allowed, false);
    }
  for (const [k, v] of Object.entries(d[NODE]))
    if (isLine(v) && troveSupply.has(k)) placeholders(`${NODE}.${k}`, v, troveSupply.get(k), false);

  // Modals: the values the loader's fillWords calls and `values = {…}` objects pass.
  const loader = sources[LOADER];
  const modalNames = new Set();
  for (const m of loader.matchAll(/fillWords\(|\bvalues = \{/g))
    objectKeys(loader, m.index).forEach((n) => modalNames.add(n));
  if (F.modalWords)
    for (const [k, v] of Object.entries(d[F.modalWords]))
      if (isLine(v)) placeholders(`${F.modalWords}.${k}`, v, modalNames, false);
  for (const [k, m] of Object.entries(d.L5)) {
    if (!m || typeof m !== "object") continue;
    const strings = [
      ["title", m.title],
      ["intro", m.intro],
      ["intro_delegated", m.intro_delegated],
      ["intro_zero_debt", m.intro_zero_debt],
      ...(m.extraParagraphs ?? []).map((p, i) => [`extraParagraphs[${i}]`, p]),
      ["stepsHeading", m.stepsHeading],
      ...(m.steps ?? []).map((p, i) => [`steps[${i}]`, p]),
      ["detailsHeading", m.detailsHeading],
      ...(m.details ?? []).flatMap((x, i) => [
        [`details[${i}].bold`, x?.bold],
        [`details[${i}].text`, x?.text],
        [`details[${i}].text_delegated`, x?.text_delegated],
        [`details[${i}].text_zero_debt`, x?.text_zero_debt],
      ]),
      ...(m.links ?? []).map((l, i) => [`links[${i}].label`, l?.label]),
    ];
    // Only the intros are filled (modal() in the loader); a brace elsewhere would print as typed.
    for (const [f, s] of strings) {
      if (!isLine(s) || !/\{/.test(s)) continue;
      if (f === "intro" || f === "intro_delegated") placeholders(`L5.${k}.${f}`, s, modalNames, false);
      else fail(`L5.${k}.${f}: has a placeholder, and the code fills only a modal's intro`);
    }
  }

  // ── 4. No prose outside the file ─────────────────────────────────────────────

  for (const file of [...new Set([...F.nodes.readers, ...F.noProse])]) noProseIn(file, DATA);

  if (failures.length === before)
    passes.push(
      `PASS  ${DATA}: ${templates.size} templates, ${Object.keys(d.shared_sentences).length} shared sentences, ${Object.keys(d.L5).length} modals; every id the code reads is there, every placeholder is supplied, no prose outside the file`,
    );
}

function noProseIn(file, home) {
  const lines = stripComments(read(file)).split("\n");
  lines.forEach((line, i) => {
    if (
      /^\s*(import|export \* from)\b|\bthrow new Error\(|\bconsole\.|"use client"|\b(className|rel|target)=/.test(line)
    )
      return;
    for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const text = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
      if (PROSE.some((re) => re.test(text)))
        failIn(file, `line ${i + 1} holds a string that reads as prose (${m[0].slice(0, 70)}); move it to ${home}`);
    }
  });
}

function report() {
  if (failures.length === 0) {
    for (const p of passes) console.log(p);
    process.exit(0);
  }
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\n${failures.length} problem${failures.length === 1 ? "" : "s"}`);
  process.exit(1);
}
