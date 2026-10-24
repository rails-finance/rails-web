#!/usr/bin/env node
// The pre-production gate's data half: for each page of a roster, the text a
// visitor's "Copy for LLM" export would hold, on preview and on production,
// normalised and diffed. No browser, no RPC key: every figure comes from the
// two hosts' own data routes, the same GETs the page makes.
//
//   node scripts/gate/diff-exports.mjs [--roster scripts/gate/roster.json]
//        [--only <substring>] [--out <dir>]
//        [--production https://rails.finance] [--preview https://dev.rails.finance]
//
// Per page, by the map in scripts/gate/adapters/index.mjs:
//   export  the app's own serializer (lib/<proto>/position-to-markdown.ts) run
//           here under tsx over each host's data, with the inputs built the
//           way the page builds them (approach 1);
//   routes  the normalised JSON of the page's data routes (approach 2), for a
//           family without an export adapter.
// Both hosts are rendered by THIS checkout's serializer, so the gate compares
// the data the two deployments serve; a serializer change shows up only
// through a different row of data.
//
// What is not a difference is listed once, with its reason, in
// scripts/gate/lib/normalise.mjs. Where the two hosts indexed to different
// heads, both are trimmed to the common range of events before the diff and
// the head difference is reported as information (HEAD-ONLY).
//
// Prints one line per page — SAME, HEAD-ONLY, DIFF n lines, ERROR reason —
// writes each page's two texts and its unified diff under --out (default a
// new folder in the OS temp dir), and a summary. Exit 0 when every page is
// SAME or HEAD-ONLY, 1 otherwise.
//
// Requests are paced (scripts/gate/lib/host-fetch.mjs): PAGE_CONCURRENCY pages
// at once, the /timeline paths spaced under the Vercel Firewall rule. The
// preview host's Vercel protection is passed with the bypass secret from
// .env.local (scripts/verify/lib/host.mjs), never printed.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

// The app's TypeScript (and its `.tsx` card helpers) load under tsx; the
// script re-runs itself once with the loaders in place.
if (!process.env.GATE_UNDER_TSX) {
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      join(HERE, "lib/register.mjs"),
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", cwd: ROOT, env: { ...process.env, GATE_UNDER_TSX: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { onHost } = await import("./lib/host-fetch.mjs");
const { bypassHeaders } = await import("../verify/lib/host.mjs");
const { planFor } = await import("./adapters/index.mjs");
const { normaliseMarkdownPair, normaliseJson, jsonHead, trimJsonEvents } = await import("./lib/normalise.mjs");
const { unifiedDiff } = await import("./lib/unified-diff.mjs");

const PAGE_CONCURRENCY = 2;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const rosterPath = resolve(ROOT, arg("--roster", "scripts/gate/roster.json"));
const only = arg("--only", null);
const PREVIEW = arg("--preview", "https://dev.rails.finance").replace(/\/$/, "");
const PRODUCTION = arg("--production", "https://rails.finance").replace(/\/$/, "");
const out = arg("--out", null) ? resolve(arg("--out")) : mkdtempSync(join(tmpdir(), "rails-gate-"));
mkdirSync(out, { recursive: true });

const HOSTS = [
  { name: "preview", base: PREVIEW },
  { name: "production", base: PRODUCTION },
];
const ORIGINS = HOSTS.map((h) => h.base);
/** One snapshot time for every render, so the stamp never differs. */
const GENERATED_AT = new Date();

const roster = JSON.parse(readFileSync(rosterPath, "utf8")).filter((p) => !only || p.page.includes(only));
if (roster.length === 0) {
  console.error(`no page in ${rosterPath}${only ? ` matches "${only}"` : ""}`);
  process.exit(1);
}
if (/rails\.finance$/.test(new URL(PREVIEW).hostname) && !bypassHeaders(PREVIEW)["x-vercel-protection-bypass"])
  console.error(
    "(no VERCEL_AUTOMATION_BYPASS_SECRET in .env.local or the env: the preview host will answer its login)",
  );

const slug = (page) =>
  page
    .replace(/^\//, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .slice(0, 120);

const short = (err) => (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 160);

/** Read one page on both hosts with `load`; an error names the host. */
async function onBothHosts(load) {
  return Promise.all(
    HOSTS.map(async (h) => {
      try {
        return (await onHost(h.base, load)).value;
      } catch (err) {
        throw new Error(`${h.name}: ${short(err)}`);
      }
    }),
  );
}

async function diffExport(plan, query) {
  const { adapter, match } = plan;
  const states = await onBothHosts(() => adapter.load(match, query));
  const heads = states.map((s) => adapter.head(s));
  const headsDiffer = heads[0] != null && heads[1] != null && heads[0] !== heads[1];
  const maxBlock = headsDiffer ? Math.min(heads[0], heads[1]) : null;
  const rendered = states.map((s) => adapter.render(s, { generatedAt: GENERATED_AT, maxBlock }));
  const [a, b] = normaliseMarkdownPair(rendered[0].markdown, rendered[1].markdown, {
    origins: ORIGINS,
    dropLines: rendered.map((r) => r.dropLines),
    headsDiffer,
  });
  return { texts: rendered.map((r) => r.markdown), lines: [a, b], ext: "md", heads, headsDiffer };
}

async function diffRoutes(plan) {
  const bodies = await onBothHosts(async () => {
    const out = [];
    for (const route of plan.routes) {
      const res = await fetch(route, { cache: "no-store" });
      if (!res.ok) throw new Error(`${route} answered ${res.status}`);
      out.push(await res.json());
    }
    return out;
  });
  const heads = bodies.map((list) => list.reduce((m, j) => Math.max(m, jsonHead(j) ?? 0), 0) || null);
  const headsDiffer = heads[0] != null && heads[1] != null && heads[0] !== heads[1];
  const maxBlock = headsDiffer ? Math.min(heads[0], heads[1]) : null;
  const lines = bodies.map((list) =>
    list.flatMap((json, i) => [
      `### ${plan.routes[i]}`,
      ...normaliseJson(maxBlock == null ? json : trimJsonEvents(json, maxBlock), ORIGINS),
    ]),
  );
  return {
    texts: bodies.map((list) => JSON.stringify(list, null, 2)),
    lines,
    ext: "json",
    heads,
    headsDiffer,
  };
}

async function runPage(entry) {
  const started = Date.now();
  const u = new URL(entry.page, "https://x");
  const plan = planFor(u.pathname);
  const name = slug(entry.page);
  if (!plan) return { status: "ERROR", detail: `no export adapter or route map for this page`, ms: 0 };
  try {
    const r = plan.kind === "export" ? await diffExport(plan, u.searchParams) : await diffRoutes(plan);
    HOSTS.forEach((h, i) => writeFileSync(join(out, `${name}.${h.name}.${r.ext}`), r.texts[i]));
    const { text, changed } = unifiedDiff(r.lines[0], r.lines[1], {
      fromLabel: `preview ${entry.page}`,
      toLabel: `production ${entry.page}`,
    });
    const approach = plan.kind === "export" ? plan.adapter.id : `routes:${plan.id}`;
    const headNote = r.headsDiffer ? `heads: preview ${r.heads[0]}, production ${r.heads[1]}` : "";
    if (changed > 0) {
      writeFileSync(join(out, `${name}.diff`), text);
      return {
        status: `DIFF ${changed} lines`,
        detail: [approach, headNote].filter(Boolean).join("; "),
        ms: Date.now() - started,
        failed: true,
      };
    }
    return {
      status: r.headsDiffer ? "HEAD-ONLY" : "SAME",
      detail: [approach, headNote].filter(Boolean).join("; "),
      ms: Date.now() - started,
    };
  } catch (err) {
    return { status: "ERROR", detail: short(err), ms: Date.now() - started, failed: true };
  }
}

// ── Run, printing in roster order as results arrive ────────────────────────
console.log(`gate: ${roster.length} pages, preview ${PREVIEW} against production ${PRODUCTION}`);
console.log(`gate: diffs and texts under ${out}`);
const t0 = Date.now();
const results = new Array(roster.length);
let printed = 0;
const flush = () => {
  while (printed < roster.length && results[printed]) {
    const r = results[printed];
    const status = r.status.padEnd(15);
    console.log(`${status} ${roster[printed].page}  (${r.detail}, ${(r.ms / 1000).toFixed(1)} s)`);
    printed++;
  }
};
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(PAGE_CONCURRENCY, roster.length) }, async () => {
    while (next < roster.length) {
      const i = next++;
      results[i] = await runPage(roster[i]);
      flush();
    }
  }),
);

const count = (pred) => results.filter(pred).length;
const same = count((r) => r.status === "SAME");
const headOnly = count((r) => r.status === "HEAD-ONLY");
const diff = count((r) => r.status.startsWith("DIFF"));
const error = count((r) => r.status === "ERROR");
console.log(
  `gate: ${roster.length} pages — ${same} SAME, ${headOnly} HEAD-ONLY, ${diff} DIFF, ${error} ERROR ` +
    `in ${((Date.now() - t0) / 1000).toFixed(0)} s; diffs under ${out}`,
);
process.exit(diff + error > 0 ? 1 : 0);
