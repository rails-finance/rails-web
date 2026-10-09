#!/usr/bin/env node
// Liquity V2 event prose: the test exports, the coverage sweep and the
// manifest (rails-ops TO-DO-ui-jobs 273, 278). Everything is written by the
// generator the page runs (lib/liquity/event-prose.ts, its strings in
// content/liquity-v2/event-prose.yaml), so a string on the site comes out here
// character for character.
//
//   BASE=http://localhost:3000 pnpm exports:liquity-v2   (a dev server must be serving BASE)
//
// reads each fixture trove's whole history through a running dev server's
// /api routes, and writes, under --out (default exports/liquity-v2/, which git
// ignores):
//
//   ethereum/<troveId>.md    the position's card, then each event as its Copy
//                            for LLM block, oldest first; a run of more than
//                            three events of one template and variant shows
//                            the first and last in full and a table for the
//                            rest; each "?" modal once, at the end
//   ethereum/<troveId>.json  per event: every value the generator read,
//                            unrounded, its template, variant and version, the
//                            levels as text and each sentence with its id
//   ethereum/coverage.json   every template and variant, its live examples
//                            among the fixtures and the sweep list, and the
//                            variants and sentences with none
//   catalogue.md             a reader's view of the strings file: every
//                            template, its condition, variants, L1, L4 and L5
//                            strings with their placeholders and roundings
//
// and the committed manifest, scripts/exports/liquity-v2-ethereum.manifest.json:
// per fixture event its id, template, variant, version and the hash of its
// block, and the coverage counts. A regeneration that changes no output leaves
// it byte for byte; a change to a string or to a trove's history shows there.
// verify-liquity-v2-event-prose.mjs fails on a stale one.
//
// The fixtures and the sweep list are scripts/exports/liquity-v2-fixtures.json,
// each trove with the reason it is there. "Today" is pinned in that file (the
// date and the oracle prices the redemption's "today" sentence reads):
//
//   --today          re-read today's oracle prices and date into the fixtures
//   --catalogue      write only the catalogue (no server needed)
//   --fixtures-only  skip the sweep; writes no coverage and no manifest
//   --out <dir>      write the exports there

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { withTypeStripping } from "./lib/strip-types.mjs";

withTypeStripping(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const outAt = argv.indexOf("--out");
const OUT = outAt >= 0 ? resolvePath(argv[outAt + 1]) : resolvePath(ROOT, "exports/liquity-v2");
const CHAIN_DIR = resolvePath(OUT, "ethereum");
const FIXTURES = resolvePath(ROOT, "scripts/exports/liquity-v2-fixtures.json");
const MANIFEST = resolvePath(ROOT, "scripts/exports/liquity-v2-ethereum.manifest.json");
const STRINGS = "content/liquity-v2/event-prose.yaml";
const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const SITE = "https://rails.finance";

const prose = await import("../lib/liquity/event-prose.ts");
const templates = await import("../lib/liquity/event-templates.ts");
const md = await import("../lib/liquity/event-markdown.ts");
const positionProse = await import("../lib/liquity/event-prose-position.ts");
const summary = await import("../lib/liquity/trove-to-markdown.ts");

mkdirSync(CHAIN_DIR, { recursive: true });
writeFileSync(resolvePath(OUT, "catalogue.md"), catalogue());
console.log(`wrote ${resolvePath(OUT, "catalogue.md")}`);
if (args.has("--catalogue")) process.exit(0);

const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8"));
if (args.has("--today")) {
  const o = await get("/api/oracle/liquity-v2");
  const now = new Date();
  fixtures.today = {
    date: now.toISOString().slice(0, 10),
    note: fixtures.today?.note,
    prices: { WETH: o.data.weth, wstETH: o.data.wsteth, rETH: o.data.reth },
  };
  writeFileSync(FIXTURES, JSON.stringify(fixtures, null, 2) + "\n");
  console.log(`pinned today: ${fixtures.today.date}`);
}
const todayTs = Date.parse(`${fixtures.today.date}T00:00:00Z`) / 1000;

// ── Reads, through the dev server's proxies ──────────────────────────────────

async function get(path, tries = 4) {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) return res.json();
    if (i + 1 >= tries || (res.status !== 429 && res.status < 500)) throw new Error(`${path} → ${res.status}`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
}

const dailyCache = new Map();
async function daily(branch) {
  if (!dailyCache.has(branch)) {
    const d = await get(`/api/liquity-v2/prices/daily?collateralType=${branch}`).catch(() => null);
    dailyCache.set(branch, d?.obs?.length ? d.obs : null);
  }
  return dailyCache.get(branch);
}

async function history(branch, troveId) {
  const seen = new Map();
  for (let offset = 0; offset <= 20_000; offset += 1_000) {
    const page = await get(`/api/trove/${branch}/${troveId}/timeline?limit=1000&offset=${offset}`);
    for (const e of page.events ?? []) seen.set(e.id, e);
    if (!page.pagination?.hasMore) break;
  }
  return positionProse.liquityTroveHistory([...seen.values()]);
}

// ── One position ─────────────────────────────────────────────────────────────

async function position(branch, troveId) {
  const [events, trovesResp, obs] = await Promise.all([
    history(branch, troveId),
    get(`/api/troves?troveId=${troveId}&collateralType=${branch}`),
    daily(branch),
  ]);
  const trove = trovesResp.data?.[0] ?? null;
  const rows = positionProse.liquityPositionProse({
    branch,
    troveId,
    events,
    trove,
    dailyColl: obs,
    priceToday: fixtures.today.prices[branch],
    now: todayTs,
    site: SITE,
  });
  return { trove, events, rows, branch, troveId };
}

const ledgerRows = (l) =>
  l
    ? {
        symbol: l.ledger.symbol,
        rows: l.ledger.rows.map((r) => [r.label, r.tokens?.text ?? null, r.usd?.text ?? null]),
        total: [l.ledger.tokens?.before ?? null, l.ledger.tokens?.after ?? null, l.ledger.usd?.after ?? null],
        exact: l.exact,
      }
    : null;

function sidecar({ event, p, l3, c }) {
  const said = prose.explanationRuns(p).flatMap((r) => r.sentences);
  return {
    n: c.n,
    id: event.id,
    utc: prose.utcStamp(event.timestamp),
    block: event.blockNumber,
    tx: event.txHash,
    template: p.template,
    levels: {
      L1: p.L1,
      L2: p.L2?.lines ?? [],
      L3: l3 ? { collateral: ledgerRows(l3.collateral), debt: ledgerRows(l3.debt) } : null,
      L4: said.map((s) => s.text),
      L5: p.L5.key,
    },
    values: p.values,
    sentences: said.map((s) => ({
      text: s.text,
      sentence_id: s.sentence_id,
      uses: s.uses,
      ...(s.group ? { group: s.group } : {}),
    })),
  };
}

function positionMarkdown(pos, why) {
  const out = [];
  if (pos.trove)
    out.push(
      ...summary.troveSummaryMarkdown({
        trove: pos.trove,
        events: pos.events,
        debtInFront: null,
        trovesAhead: null,
        generatedAt: new Date(todayTs * 1000),
      }),
    );
  out.push(`Chosen for the exports: ${why}`, "", `## Events (${pos.rows.length}, oldest first)`, "");
  // Runs of more than three events of one template and variant: the first
  // and the last in full, the rest as a table.
  const key = (r) => `${r.p.template.id}:${r.p.template.variant}`;
  let i = 0;
  const blocks = [];
  while (i < pos.rows.length) {
    let j = i + 1;
    while (j < pos.rows.length && key(pos.rows[j]) === key(pos.rows[i])) j++;
    const run = pos.rows.slice(i, j);
    const full = (r) => md.liquityEventMarkdown(r.p, r.c, r.l3, "ref");
    if (run.length > 3) {
      const coll = run[0].p.values.coll_symbol;
      const debt = run[0].p.values.debt_symbol;
      const table = [
        `${run.length - 2} more ${run[0].p.template.id} (${run[0].p.template.variant}) events between #${run[0].c.n} and #${run.at(-1).c.n}:`,
        "",
        `| # | UTC | Debt after (${debt}) | Collateral after (${coll}) |`,
        "|---|---|---|---|",
        ...run
          .slice(1, -1)
          .map(
            (r) =>
              `| ${r.c.n} | ${prose.utcStamp(r.event.timestamp)} | ${prose.fillText("{debt_after}", r.p.values)} | ${prose.fillText("{coll_after}", r.p.values)} |`,
          ),
      ].join("\n");
      blocks.push(full(run[0]), table, full(run.at(-1)));
    } else blocks.push(...run.map(full));
    i = j;
  }
  out.push(blocks.join("\n\n---\n\n"));
  // Each "?" modal once.
  const l5 = new Map();
  for (const r of pos.rows) if (!l5.has(r.p.L5.content.title)) l5.set(r.p.L5.content.title, r.p.L5.content);
  out.push("", "---", "", "## Learn more (L5)", "");
  for (const c of l5.values()) out.push(md.l5Heading(c.title), ...md.learnMoreMarkdown(c), "");
  return out.join("\n").replace(/\n+$/, "\n");
}

// ── Run ──────────────────────────────────────────────────────────────────────

const coverage = new Map(); // template:variant → examples
const sentenceSeen = new Map(); // sentence id → count
const variantCount = new Map(); // template:variant → events
const consider = (pos) => {
  for (const r of pos.rows) {
    const k = `${r.p.template.id}:${r.p.template.variant}`;
    variantCount.set(k, (variantCount.get(k) ?? 0) + 1);
    const list = coverage.get(k) ?? [];
    // Keep two: the first seen, then the one with the largest debt moved.
    const ex = {
      trove: `${pos.branch}/${pos.troveId}`,
      n: r.c.n,
      utc: prose.utcStamp(r.event.timestamp),
      url: r.c.url,
      debt_moved: Math.abs(Number(r.p.values.debt_change ?? 0)),
    };
    if (list.length < 2) list.push(ex);
    else if (ex.debt_moved > list[1].debt_moved) list[1] = ex;
    coverage.set(k, list);
    for (const s of [...r.p.L4, ...r.p.list])
      sentenceSeen.set(s.sentence_id, (sentenceSeen.get(s.sentence_id) ?? 0) + 1);
  }
};

/** The hash of an event's block as the export prints it (its L5 named, not
 *  printed): sha256, the first 16 hex. */
const blockHash = (r) =>
  createHash("sha256")
    .update(md.liquityEventMarkdown(r.p, r.c, r.l3, "ref"))
    .digest("hex")
    .slice(0, 16);

const manifestFixtures = [];
for (const f of fixtures.fixtures) {
  const pos = await position(f.branch, f.troveId);
  writeFileSync(resolvePath(CHAIN_DIR, `${f.troveId}.md`), positionMarkdown(pos, f.why));
  writeFileSync(resolvePath(CHAIN_DIR, `${f.troveId}.json`), JSON.stringify(pos.rows.map(sidecar), null, 2) + "\n");
  consider(pos);
  manifestFixtures.push({
    branch: f.branch,
    troveId: f.troveId,
    events: pos.rows.map((r) => ({
      id: r.event.id,
      template: r.p.template.id,
      variant: r.p.template.variant,
      version: r.p.template.version,
      block: blockHash(r),
    })),
  });
  console.log(`wrote ${f.branch} ${f.troveId.slice(0, 8)}…: ${pos.rows.length} events`);
}
if (args.has("--fixtures-only")) process.exit(0);
for (const f of fixtures.sweep ?? []) {
  const pos = await position(f.branch, f.troveId);
  consider(pos);
  console.log(`swept ${f.branch} ${f.troveId.slice(0, 8)}…: ${pos.rows.length} events`);
}

const variants = [];
for (const t of templates.TEMPLATES)
  for (const v of Object.keys(t.variants)) {
    const k = `${t.id}:${v}`;
    variants.push({
      template: t.id,
      variant: v,
      when: t.variants[v],
      examples: (coverage.get(k) ?? []).map(({ debt_moved, ...e }) => e),
    });
  }
const sentenceIds = [];
for (const t of templates.TEMPLATES)
  for (const id of [...t.order, ...(t.list ?? [])]) if (!sentenceIds.includes(id)) sentenceIds.push(id);
const cov = {
  protocol: "liquity-v2",
  chain: "ethereum",
  today: fixtures.today.date,
  troves: [...fixtures.fixtures, ...(fixtures.sweep ?? [])].map((f) => `${f.branch}/${f.troveId}`),
  variants,
  variants_with_no_example: variants.filter((v) => v.examples.length === 0).map((v) => `${v.template}:${v.variant}`),
  sentences_with_no_example: sentenceIds.filter((id) => !sentenceSeen.has(id)),
};
writeFileSync(resolvePath(CHAIN_DIR, "coverage.json"), JSON.stringify(cov, null, 2) + "\n");
console.log(
  `coverage: ${variants.length - cov.variants_with_no_example.length}/${variants.length} variants have a live example; none for ${cov.variants_with_no_example.join(", ") || "—"}`,
);

// ── The manifest ─────────────────────────────────────────────────────────────
// Fixed key order, one event or variant per line, so a regeneration that
// changes nothing changes no byte.

{
  const j = JSON.stringify;
  const list = (items, indent) =>
    items.length ? `[\n${items.map((x) => `${indent}  ${x}`).join(",\n")}\n${indent}]` : "[]";
  const fixtureLines = manifestFixtures.map(
    (f) =>
      `{\n      "branch": ${j(f.branch)},\n      "troveId": ${j(f.troveId)},\n      "events": ${list(
        f.events.map(
          (e) =>
            `{ "id": ${j(e.id)}, "template": ${j(e.template)}, "variant": ${j(e.variant)}, "version": ${j(e.version)}, "block": ${j(e.block)} }`,
        ),
        "      ",
      )}\n    }`,
  );
  const variantLines = variants.map(
    (v) =>
      `{ "template": ${j(v.template)}, "variant": ${j(v.variant)}, "events": ${variantCount.get(`${v.template}:${v.variant}`) ?? 0} }`,
  );
  const text = [
    "{",
    `  "protocol": "liquity-v2",`,
    `  "chain": "ethereum",`,
    `  "today": ${j(fixtures.today.date)},`,
    `  "strings": ${j(STRINGS)},`,
    `  "block_hash": "sha256 of the event's block as the export prints it (L5 by reference), first 16 hex",`,
    `  "fixtures": ${list(fixtureLines, "  ")},`,
    `  "coverage": {`,
    `    "troves": ${[...fixtures.fixtures, ...(fixtures.sweep ?? [])].length},`,
    `    "variants": ${list(variantLines, "    ")},`,
    `    "variants_with_no_example": ${list(cov.variants_with_no_example.map(j), "    ")},`,
    `    "sentences_with_no_example": ${list(cov.sentences_with_no_example.map(j), "    ")}`,
    "  }",
    "}",
    "",
  ].join("\n");
  JSON.parse(text);
  writeFileSync(MANIFEST, text);
  console.log(`wrote ${MANIFEST.slice(ROOT.length + 1)}`);
}

// ── The catalogue ────────────────────────────────────────────────────────────

function catalogue() {
  const {
    TEMPLATES,
    SHARED_SENTENCES,
    PLACEHOLDERS,
    ROUNDINGS,
    L1_WORDS,
    L2_WORDS,
    FOOTER_WORDS,
    CONTEXT_WORDS,
    COPY_WORDS,
    L5,
  } = templates;
  const ph = (text) =>
    prose
      .placeholdersOf(text)
      .map((p) => `\`{${p.name}}\` ${p.rounding}`)
      .filter((x, i, a) => a.indexOf(x) === i)
      .join(", ");
  const out = [
    "# Liquity V2 event templates",
    "",
    `A reader's view of \`${STRINGS}\`, written by \`pnpm exports:liquity-v2 --catalogue\`.`,
    `Edit the strings in \`${STRINGS}\`: each string keeps its id, and a placeholder keeps its \`{name}\`.`,
    "`{name|rounding}` prints a placeholder at another rounding for that sentence alone.",
    'Prices are at the event unless a sentence names "today".',
    "",
    "## Roundings",
    "",
    "| Rounding | Prints |",
    "|---|---|",
    ...Object.entries(ROUNDINGS).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "## Placeholders",
    "",
    "| Placeholder | Rounding | Stands for |",
    "|---|---|---|",
    ...Object.entries(PLACEHOLDERS).map(([k, v]) => `| \`{${k}}\` | ${v.rounding} | ${v.means} |`),
    "",
    "## Header words (L1)",
    "",
    'Each template\'s L1 line joins its groups with " · "; a group whose figure the event lacks is left out.',
    "",
    "| Id | Word |",
    "|---|---|",
    ...Object.entries(L1_WORDS).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "## Opened-card words (L2)",
    "",
    "| Id | Words |",
    "|---|---|",
    ...Object.entries(L2_WORDS).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "## Copy for LLM header and footer",
    "",
    "| Id | Words |",
    "|---|---|",
    ...Object.entries(CONTEXT_WORDS).map(([k, v]) => `| context.${k} | ${v} |`),
    ...Object.entries(FOOTER_WORDS).map(([k, v]) => `| footer.${k} | ${v} |`),
    ...Object.entries(COPY_WORDS).map(([k, v]) => `| copy.${k} | ${v} |`),
    "",
    "## Shared sentences",
    "",
  ];
  for (const [id, s] of Object.entries(SHARED_SENTENCES))
    out.push(`- **${id}** (when ${s.when}): ${s.text}`, `  - placeholders: ${ph(s.text) || "none"}`);
  out.push("");
  for (const t of TEMPLATES) {
    out.push(`## ${t.id}`, "", `**Title:** ${t.title}  `, `**Selected when:** ${t.when}  `, `**L5:** ${t.L5}`, "");
    out.push("**Variants:**", "", ...Object.entries(t.variants).map(([k, v]) => `- \`${k}\`: ${v}`), "");
    const l1 = t.L1.map((g) =>
      g.map((p) => ("word" in p ? L1_WORDS[p.word] : `{${p.figure}}${p.symbol ? ` {${p.symbol}}` : ""}`)).join(" "),
    ).join(" · ");
    out.push(`**L1:** ${l1}`, "", "**L4, in order:**", "");
    for (const id of [...t.order, ...(t.list ?? [])]) {
      const s = t.sentences[id] ?? SHARED_SENTENCES[id];
      const shared = !t.sentences[id];
      const listed = t.list?.includes(id) ? " (list)" : "";
      const group = Object.entries(t.groups).find(([, ids]) => ids.includes(id))?.[0];
      out.push(`- **${id}**${shared ? " (shared)" : ""}${listed} [${group}] — when ${s.when}`);
      if (!shared) out.push(`  > ${s.text}`, `  - placeholders: ${ph(s.text) || "none"}`);
    }
    out.push("");
  }
  out.push("## L5 modals", "");
  for (const [key, fn] of Object.entries(L5)) {
    const c = fn({ collateralType: "WETH" });
    out.push(`### ${key}`, "", md.l5Heading(c.title), ...md.learnMoreMarkdown(c), "");
  }
  return out.join("\n").replace(/\n+$/, "\n");
}
