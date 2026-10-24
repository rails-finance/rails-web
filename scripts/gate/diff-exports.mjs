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
//           family without an export adapter;
//   skip    nothing to diff, with the reason (a page whose reads need the
//           bearer token, or a page that reads no data route).
// Both hosts are rendered by THIS checkout's serializer, so the gate compares
// the data the two deployments serve; a serializer change shows up only
// through a different row of data.
//
// What is not a difference is listed once, with its reason, in
// scripts/gate/lib/normalise.mjs. Where the two hosts indexed to different
// heads, both are trimmed to the common range of events before the diff and
// the head difference is reported as information (HEAD-ONLY).
//
// Prints one line per page — SAME, HEAD-ONLY, DIFF n lines, SKIP reason, ERROR reason —
// writes each page's two texts and its unified diff under --out (default a
// new folder in the OS temp dir), and a summary. Exit 0 when every page is
// SAME, HEAD-ONLY or SKIP, 1 otherwise.
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

const { onHost, requestsSent } = await import("./lib/host-fetch.mjs");
const { bypassHeaders } = await import("../verify/lib/host.mjs");
const { planFor } = await import("./adapters/index.mjs");
const {
  normaliseMarkdownPair,
  normaliseJson,
  jsonHead,
  trimJsonEvents,
  isLiveRoute,
  settleLiveNumbers,
  settleRowOrder,
} = await import("./lib/normalise.mjs");
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One route's JSON. A sweep route answers 202 while it reads a wallet for the
 *  first time and is asked again; a 4xx is part of the answer (both hosts
 *  refusing the same request is the same page), a 5xx is a failure.
 *  `cachedFor` is how long the CDN copy served keeps (ms), on a cache hit. */
async function readRoute(route) {
  for (let i = 0; ; i++) {
    const res = await fetch(route, { cache: "no-store" });
    if (res.status === 202 && i < 5) {
      await sleep(10_000);
      continue;
    }
    if (res.status >= 500) throw new Error(`${route} answered ${res.status}`);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${route} answered ${res.status} with a body that is not JSON`);
    }
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? NaN);
    const age = Number(res.headers.get("age") ?? NaN);
    const hit = /HIT|STALE/.test(res.headers.get("x-vercel-cache") ?? "");
    const cachedFor = hit && Number.isFinite(maxAge) && Number.isFinite(age) ? Math.max(0, maxAge - age) * 1000 : null;
    return { body: res.status === 200 ? body : { answered: res.status, body }, cachedFor };
  }
}

/** The normalised lines of every route on both hosts, trimmed to the common
 *  head where the two indexed to different blocks. */
function compareRoutes(routes, reads) {
  const bodies = reads.map((list) => list.map((r) => r.body));
  const heads = bodies.map((list) => list.reduce((m, j) => Math.max(m, jsonHead(j) ?? 0), 0) || null);
  const headsDiffer = heads[0] != null && heads[1] != null && heads[0] !== heads[1];
  const maxBlock = headsDiffer ? Math.min(heads[0], heads[1]) : null;
  const trimmed = bodies.map((list) => list.map((json) => (maxBlock == null ? json : trimJsonEvents(json, maxBlock))));
  // A live route's numbers within the tolerance of preview's print as
  // preview's; a listing page holding the same rows in another order (a tie
  // on the sort key) prints in preview's order.
  trimmed[1] = trimmed[1].map((json, i) =>
    settleRowOrder(trimmed[0][i], isLiveRoute(routes[i]) ? settleLiveNumbers(trimmed[0][i], json) : json),
  );
  const perRoute = trimmed.map((list) => list.map((json, i) => [`### ${routes[i]}`, ...normaliseJson(json, ORIGINS)]));
  return { bodies, heads, headsDiffer, perRoute };
}

async function diffRoutes(plan) {
  const routes = await plan.routes();
  const reads = await onBothHosts(async () => {
    const out = [];
    for (const route of routes) out.push(await readRoute(route));
    return out;
  });
  let r = compareRoutes(routes, reads);
  // The hosts' CDNs keep a route's answer for its max-age, each from its own
  // moment: two copies of different ages differ by what happened between
  // them. A route that differs and came from a cache is read again on both
  // hosts once both copies have expired, and that answer is the one compared.
  const differs = (i) => r.perRoute[0][i].join("\n") !== r.perRoute[1][i].join("\n");
  const cached = routes.flatMap((_, i) =>
    differs(i) && (reads[0][i].cachedFor != null || reads[1][i].cachedFor != null) ? [i] : [],
  );
  if (cached.length > 0) {
    const wait = Math.max(...cached.flatMap((i) => [reads[0][i].cachedFor ?? 0, reads[1][i].cachedFor ?? 0]));
    await sleep(wait + 1_000);
    for (const i of cached) {
      const again = await onBothHosts(() => readRoute(routes[i]));
      reads[0][i] = again[0];
      reads[1][i] = again[1];
    }
    r = compareRoutes(routes, reads);
  }
  return {
    texts: r.bodies.map((list) => JSON.stringify(list, null, 2)),
    lines: r.perRoute.map((list) => list.flat()),
    ext: "json",
    heads: r.heads,
    headsDiffer: r.headsDiffer,
  };
}

async function runPage(entry) {
  const started = Date.now();
  const u = new URL(entry.page, "https://x");
  const plan = planFor(u.pathname, u.searchParams);
  const name = slug(entry.page);
  if (!plan) return { status: "ERROR", detail: `no export adapter or route map for this page`, ms: 0, failed: true };
  if (plan.kind === "skip") return { status: "SKIP", detail: `skip:${plan.id}: ${plan.reason}`, ms: 0 };
  try {
    const r = plan.kind === "export" ? await diffExport(plan, u.searchParams) : await diffRoutes(plan);
    HOSTS.forEach((h, i) => writeFileSync(join(out, `${name}.${h.name}.${r.ext}`), r.texts[i]));
    const { text, changed } = unifiedDiff(r.lines[0], r.lines[1], {
      fromLabel: `preview ${entry.page}`,
      toLabel: `production ${entry.page}`,
    });
    const approach =
      plan.kind === "export" ? plan.adapter.id : `routes:${plan.id}${plan.note ? ` (${plan.note})` : ""}`;
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
const skip = count((r) => r.status === "SKIP");
const error = count((r) => r.status === "ERROR");
const sentNow = requestsSent();
console.log(
  `gate: ${roster.length} pages — ${same} SAME, ${headOnly} HEAD-ONLY, ${diff} DIFF, ${skip} SKIP, ${error} ERROR ` +
    `in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${sentNow.all} requests (${sentNow.timeline} counted by the ` +
    `/timeline rule); diffs under ${out}`,
);
process.exit(diff + error > 0 ? 1 : 0);
