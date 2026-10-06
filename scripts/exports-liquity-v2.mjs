#!/usr/bin/env node
// Liquity V2 event prose: the test exports, the coverage sweep and the
// template catalogue (rails-ops TO-DO-ui-jobs 273; the prose project's brief of
// 5 Oct 2026). Everything is written by the generator the page runs
// (lib/liquity/event-prose.ts, its strings in lib/liquity/event-templates.ts),
// so a string on the site comes out here character for character.
//
//   BASE=http://localhost:3000 pnpm exports:liquity-v2   (a dev server must be serving BASE)
//
// reads each fixture trove's whole history through a running dev server's
// /api routes, and writes, under exports/liquity-v2/:
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
//   catalogue.md             every template from the code: its condition,
//                            variants, L1, L4 and L5 strings with their
//                            placeholders and roundings
//
// The fixtures and the sweep list are exports/liquity-v2/ethereum/fixtures.json,
// each trove with the reason it is there. "Today" is pinned in that file (the
// date and the oracle prices the redemption's "today" sentence reads), so a
// regeneration differs only where a template or the history did:
//
//   --today      re-read today's oracle prices and date into fixtures.json
//   --catalogue  write only the catalogue (no server needed)

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");

// TypeScript with `@/` aliases: re-exec once with type stripping and a
// resolver (the verifiers' pattern), JSON imports given their attribute.
if (!process.execArgv.includes("--experimental-strip-types")) {
  const hook = `
    import { existsSync } from "node:fs";
    const ROOT = ${JSON.stringify(new URL("file://" + ROOT + "/").href)};
    const EXT = [".ts", ".tsx", "/index.ts", "/index.tsx", ".mjs", ".js"];
    export async function resolve(spec, ctx, next) {
      let s = spec;
      if (s.startsWith("@/")) s = new URL(s.slice(2), ROOT).href;
      if (s.startsWith(".") || s.startsWith("file:")) {
        const base = s.startsWith("file:") ? s : new URL(s, ctx.parentURL).href;
        if (base.endsWith(".json")) {
          const r = await next(base, ctx);
          return { ...r, importAttributes: { type: "json" } };
        }
        if (!/\\.(ts|tsx|mjs|js)$/.test(base)) {
          for (const e of EXT) if (existsSync(new URL(base + e))) return next(base + e, ctx);
        }
        return next(base, ctx);
      }
      return next(spec, ctx);
    }`;
  const register = `import{register}from'node:module';register(${JSON.stringify(
    "data:text/javascript," + encodeURIComponent(hook),
  )},import.meta.url);`;
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      "data:text/javascript," + encodeURIComponent(register),
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env: process.env },
  );
  process.exit(r.status ?? 1);
}

const OUT = resolvePath(ROOT, "exports/liquity-v2");
const CHAIN_DIR = resolvePath(OUT, "ethereum");
const FIXTURES = resolvePath(CHAIN_DIR, "fixtures.json");
const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const SITE = "https://rails.finance";
const args = new Set(process.argv.slice(2));

const prose = await import("../lib/liquity/event-prose.ts");
const templates = await import("../lib/liquity/event-templates.ts");
const md = await import("../lib/liquity/event-markdown.ts");
const ledgers = await import("../lib/liquity/event-ledgers.ts");
const flows = await import("../lib/shared/liquity-flows.ts");
const timeline = await import("../lib/shared/flows-timeline.ts");
const summary = await import("../lib/liquity/trove-to-markdown.ts");
const { isLiquityEvent } = await import("../lib/shared/types/event-shape.ts");

mkdirSync(CHAIN_DIR, { recursive: true });
writeFileSync(resolvePath(OUT, "catalogue.md"), catalogue());
console.log("wrote exports/liquity-v2/catalogue.md");
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
  const logIndex = (e) => {
    const n = Number(e.id.split("_").pop());
    return Number.isFinite(n) ? n : 0;
  };
  // The trove page's order: block, time, then the log's index in the block.
  return [...seen.values()]
    .filter(isLiquityEvent)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp || logIndex(a) - logIndex(b));
}

// ── One position ─────────────────────────────────────────────────────────────

async function position(branch, troveId) {
  const [events, trovesResp, obs] = await Promise.all([
    history(branch, troveId),
    get(`/api/troves?troveId=${troveId}&collateralType=${branch}`),
    daily(branch),
  ]);
  const trove = trovesResp.data?.[0] ?? null;
  const collSym = trove?.collateralType ?? branch;
  const debtSym = events[0]?.context.data.assetType || "BOLD";
  const priceToday = fixtures.today.prices[branch];
  const flowEvents = flows.liquityV2FlowEvents(events);
  const tl = flows.liquityFlowTimeline(flowEvents, {
    collSymbol: collSym,
    debtSymbol: debtSym,
    surplusClaimed: false,
    now: todayTs,
    dailyColl: obs,
    live: trove?.status === "open" ? { price: priceToday ?? null } : null,
  });
  const model = tl ? timeline.buildFlowModel(tl) : null;
  const focusEvents = flows.liquityFocusEvents(flowEvents, collSym, debtSym);
  const owner = trove ? (trove.status === "open" ? trove.owner : trove.lastOwner) : null;
  const rows = events.map((event, i) => {
    const previousEvent = i > 0 ? events[i - 1] : undefined;
    const p = prose.liquityEventProse({
      ctx: event.context.data,
      event,
      previousEvent,
      currentEvent: event,
      currentPrice: priceToday,
      ledger: focusEvents.find((e) => e.id === event.id) ?? null,
      collDecimals: model ? ledgers.liquityEventDecimals(model, focusEvents, event.id, "collateral") : null,
      debtDecimals: model ? ledgers.liquityEventDecimals(model, focusEvents, event.id, "debt") : null,
    });
    const l3 = model
      ? {
          collateral: ledgers.liquityEventLedger(
            model,
            focusEvents,
            event.id,
            "collateral",
            prose.DEFAULT_USD_SWITCHES,
          ),
          debt: ledgers.liquityEventLedger(model, focusEvents, event.id, "debt", prose.DEFAULT_USD_SWITCHES),
        }
      : null;
    const url = `${SITE}/ethereum/liquity-v2/trove/${branch}/${troveId}/event/${encodeURIComponent(event.id)}`;
    const c = { troveId, owner, n: i + 1, total: events.length, url, timestamp: event.timestamp };
    return { event, p, l3, c };
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
      L4: [...p.L4, ...p.list].map((s) => s.text),
      L5: p.L5.key,
    },
    values: p.values,
    sentences: [...p.L4, ...p.list].map((s) => ({ text: s.text, sentence_id: s.sentence_id, uses: s.uses })),
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
const consider = (pos) => {
  for (const r of pos.rows) {
    const k = `${r.p.template.id}:${r.p.template.variant}`;
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

for (const f of fixtures.fixtures) {
  const pos = await position(f.branch, f.troveId);
  writeFileSync(resolvePath(CHAIN_DIR, `${f.troveId}.md`), positionMarkdown(pos, f.why));
  writeFileSync(resolvePath(CHAIN_DIR, `${f.troveId}.json`), JSON.stringify(pos.rows.map(sidecar), null, 2) + "\n");
  consider(pos);
  console.log(`wrote ${f.branch} ${f.troveId.slice(0, 8)}…: ${pos.rows.length} events`);
}
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
    FRAGMENTS,
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
    "Generated from `lib/liquity/event-templates.ts` by `pnpm exports:liquity-v2`; do not edit by hand.",
    "Send changes as edits to this file: each string keeps its id, and a placeholder keeps its `{name}`.",
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
    "",
    "## Fragments",
    "",
    "| Id | Words |",
    "|---|---|",
    ...Object.entries(FRAGMENTS).map(([k, v]) => `| ${k} | ${v} |`),
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
      out.push(`- **${id}**${shared ? " (shared)" : ""}${listed} — when ${s.when}`);
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
