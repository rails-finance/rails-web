#!/usr/bin/env node
// Moonwell Base serves its history as ROWS, and the rows are the whole history.
// ----------------------------------------------------------------------------
// Subject: leg C of the `0019` timeline-windowing programme. The page asks
// `/api/chain/moonwell-base/timeline?group=1`; the route replays EVERY row and
// only then groups the events into folders (lib/moonwell-base/timeline-folders.ts),
// trims to the row cap at a block boundary, and serves the ungrouped events with
// a row plan. `/timeline/folder` opens one folder. Rationale: rails-ops
// decisions/0019, "Implementation note 2026-09-13 — leg C".
//
// ── WHERE THE EXPECTATIONS COME FROM ───────────────────────────────────────
// THE WHOLE REPLAY, IN THIS PROCESS. `loadMoonwellEventsFromIndex` with the
// render cut lifted reads rails-server's rows and replays all of them — every
// event the position has, with the balances a replay over the whole list gives
// it. The grouped answer is compared against that: its members, opened one
// folder at a time, must BE those events in that order, and every figure the
// route states must be the one the whole replay reaches. The folder headers are
// re-derived from their own members by code written out HERE, not imported, so
// a header and a member list that agree are two computations agreeing.
//
// No count is pinned — the wallets are live. What is pinned is SHAPE (F0): each
// fixture must still produce the partition it is here for, or its comparisons
// are skipped and the guard says the fixture drifted.
//
//   exploiter   0x719e…be919d — 21 owner-signed rows and 2,386 keeper events
//               in folders; the position decision 0019 was decided from. Flat,
//               its page draws 1,021 rows and a boundary card over 1,386.
//   all-folders 0x11a0…520a — every event third-party-signed, so every event is
//               inside a folder and `events` is EMPTY; its folders' members are
//               mostly of kinds the header does not name (`other`).
//   seeded      0xbc8d…fa80b — a heavy wallet served from a stored seed: the
//               seed's rows sit below every cut and stay in `omitted`, so this
//               is the arm where the partition has a third part and the
//               numbering starts past 20,000.
//
// ── THE CHECKS ─────────────────────────────────────────────────────────────
//   G1  the answer is grouped, and its plan names exactly its events
//   G2  the partition: Σ folder members + events = eventsServed, and
//       eventsServed + omitted = totalEvents
//   G3  ordinals run contiguously from omitted + 1, a folder spanning its count
//   G4  every folder opened, in plan order, IS the whole replay's event list —
//       id for id and field for field
//   G5  every header is its members' arithmetic: count, transactions, span,
//       kind counts and `other`, legs to the base unit, actors, days, state
//   G6  no owner-signed event is inside a folder
//   G7  grouping is complete: no third-party event stands beside a folder and
//       no four of them stand in a row
//   G8  no transaction is split across two adjacent folders
//   G9  the replay's figures — counts, positions, peaks, lifetime flows — are
//       the whole replay's, to the wei
//   G10 the coverage states the seed's rows and nothing else, with no anchor
//   G11 the members route refuses what it cannot open, with its own sentence
//   G12 the flat answer is still flat
//   N1  (exploiter) the historical market notes the grouped page draws are the
//       ones the whole history yields
//   N2  a folder that could move the balance withholds a note; one that could
//       not leaves it
//   H0–H4 (exploiter, in a browser) the page asks for rows, the count line
//       states the whole history where the flat page states a cut, no boundary
//       is drawn, the heatmap counts every event, and the export note counts
//       the folders' members
//
// ── PROVED IT CAN FAIL, 2026-09-13, BASE=http://localhost:3000 ─────────────
// Green: 48 checks with the browser arm, 42 without. Each break applied ALONE
// and restored by checksum (API arm, BROWSER=0):
//
//  (a) Repaid as Σ repay + Σ liquidation instead of the larger —
//      FAIL G5 "24 of 24: legs members [Repaid 0x4200… 22037505859183385519 ×2
//      WETH/18 … ≠ header [Repaid 0x4200… 44075011718366771038 ×4 …"
//  (b) `byDay: []` in the grouper — FAIL G5 "byDay members
//      [{count:100,key:1787788800}] ≠ header []"
//  (c) ordinalBase one late — FAIL G3 "claims 23–122 at 22 (100)"
//  (d) the members route drops a folder's first member — FAIL G4 "2386 id
//      gap(s)" and G5 "count members 99 ≠ header 100"
//  (e) the cut's second replay anchoring again — FAIL T1 on the exploiter
//      ("grouped cut disagrees with the replay's: 2407 events … against
//      2386") and on all-folders ("anchored 0")
//  (f) the market-note folder rule off — FAIL N2 "a Sent folder over the step
//      leaves 1"
//
// 🔑 (e) and (f) also reported (d)'s G4/G5 failure: the dev server was still
// answering the members route from the break-(d) compile a minute after its
// restore. Re-run after a restore before reading a green, and read an extra
// red next to a break as possibly the previous one's.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-moonwell-base-folders.mjs
//   FIXTURES=exploiter BROWSER=0 node scripts/verify/verify-moonwell-base-folders.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The replay is TypeScript with `@/` aliases: re-exec once with type stripping
// and an alias resolver, as verify-moonwell-base-heavy-timeline.mjs does.
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
        if (!/\\.(ts|tsx|mjs|js|json)$/.test(base)) {
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
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}

const envFile = resolvePath(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const { loadMoonwellEventsFromIndex, readMoonwellIndex } = await import(
  "../../lib/sources/api/moonwell-base-timeline.ts"
);
const { groupMoonwellReplay } = await import("../../lib/moonwell-base/timeline-folders.ts");
const { marketMapFromRoster } = await import("../../lib/sources/chain/moonwell-events.ts");
const { resolveMoonwellRoster } = await import("../../lib/sources/chain/moonwell-roster.ts");
const { rehydrateChainTimelineWire } = await import("../../lib/shared/timeline-wire.ts");
const { shareRateNotesFor } = await import("../../lib/shared/market-note.ts");
const { MOONWELL_BASE_DEPLOYMENT, MOONWELL_BASE_DEPLOY_BLOCK, MOONWELL_BASE_WETH_ROUTER } = await import(
  "../../lib/moonwell-base/asset-catalog.ts"
);

const BASE = process.env.BASE ?? "http://localhost:3000";
const BROWSER = process.env.BROWSER !== "0";
const ONLY = process.env.FIXTURES ? new Set(process.env.FIXTURES.split(",")) : null;

const FIXTURES = [
  { id: "exploiter", wallet: "0x719eae70d4a83f35bf82a2740699f5db84be919d", shape: "churn", page: true },
  { id: "all-folders", wallet: "0x11a020d80b0a4468bf45888a0ab33cf4169f520a", shape: "no-singletons" },
  { id: "seeded", wallet: "0xbc8dd54d1ae1b738b40ffddccee1428b178fa80b", shape: "seeded" },
].filter((f) => !ONLY || ONLY.has(f.id));

let failures = 0;
let passes = 0;
let skips = 0;
function check(name, cond, detail = "") {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return cond;
}
function skip(name, why) {
  skips++;
  console.log(`SKIP  ${name} — ${why}`);
}
const fmt = (n) => Number(n).toLocaleString("en-US");

/** JSON with object keys sorted, so two objects built in different orders
 *  compare by content. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  return { status: res.status, body: body ? rehydrateChainTimelineWire(body) : null };
}

const roster = await resolveMoonwellRoster(MOONWELL_BASE_DEPLOYMENT);
if (!roster) {
  console.log("FAIL  the Moonwell Base roster could not be read — BASE_RPC_URL?");
  process.exit(1);
}
const marketByMtoken = marketMapFromRoster(roster);

// ── The expectation's own arithmetic, written out ──────────────────────────

const NOISE = new Set(["liquidation", "repay", "transfer_out", "transfer_in"]);
const thirdParty = (e) => {
  const d = e.context?.data ?? {};
  return d.txFrom ? d.txFrom !== e.wallet : NOISE.has(d.eventType);
};

function headerOf(members) {
  const kinds = new Map();
  const days = new Map();
  const txs = new Set();
  const actors = new Map();
  let external = 0;
  const sums = { repay: new Map(), liq: new Map(), seized: new Map(), sent: new Map(), received: new Map() };
  const repaidOrder = [];
  const bump = (map, key, raw) => {
    if (!key || raw == null) return;
    const cur = map.get(key) ?? { amount: 0n, count: 0 };
    cur.amount += BigInt(String(raw).replace(/^-/, ""));
    cur.count += 1;
    map.set(key, cur);
  };
  const before = {};
  const after = {};
  for (const e of members) {
    const d = e.context.data;
    kinds.set(d.eventType, (kinds.get(d.eventType) ?? 0) + 1);
    const day = String(Math.floor(e.timestamp / 86400) * 86400);
    days.set(day, (days.get(day) ?? 0) + 1);
    txs.add(e.txHash);
    if (d.txFrom && d.caller && d.txFrom !== e.wallet && d.caller !== e.wallet) {
      external++;
      actors.set(d.txFrom, (actors.get(d.txFrom) ?? 0) + 1);
    }
    const raw = d.raw ?? {};
    if (d.eventType === "repay" || d.eventType === "liquidation") {
      if (!repaidOrder.includes(d.market)) repaidOrder.push(d.market);
    }
    if (d.eventType === "repay") bump(sums.repay, d.market, raw.amount);
    if (d.eventType === "liquidation") {
      bump(sums.liq, d.market, raw.amount);
      bump(sums.seized, d.collateralMarket, raw.seizeTokens);
    }
    if (d.eventType === "transfer_out") bump(sums.sent, d.market, raw.mTokens);
    if (d.eventType === "transfer_in") bump(sums.received, d.market, raw.mTokens);
    for (const [lane, b, a] of [
      ["supply", raw.supplyBefore, raw.supplyAfter],
      ["mtokens", raw.mTokensBefore, raw.mTokensAfter],
      ["debt", raw.debtBefore, raw.debtAfter],
    ]) {
      const key = `${lane}:${d.market}`;
      if (b != null && !(key in before)) before[key] = b;
      if (a != null) after[key] = a;
    }
  }
  const legs = [];
  for (const key of repaidOrder) {
    const m = marketByMtoken.get(key);
    const r = sums.repay.get(key);
    const l = sums.liq.get(key);
    const chosen = r && (!l || r.amount >= l.amount) ? r : l;
    if (!m || !chosen) continue;
    legs.push(`Repaid ${m.underlying.toLowerCase()} ${chosen.amount} ×${chosen.count} ${m.symbol}/${m.decimals}`);
  }
  for (const [verb, map] of [
    ["Seized", sums.seized],
    ["Sent", sums.sent],
    ["Received", sums.received],
  ]) {
    for (const [key, s] of map) {
      const m = marketByMtoken.get(key);
      if (!m) continue;
      legs.push(`${verb} ${m.mtoken.toLowerCase()} ${s.amount} ×${s.count} ${m.symbol}/8 m${m.symbol}`);
    }
  }
  const named = ["liquidation", "repay", "transfer_out", "transfer_in"];
  const counts = named.filter((k) => kinds.get(k)).map((key) => ({ key, count: kinds.get(key) }));
  return {
    count: members.length,
    txCount: txs.size,
    firstAt: members[0].timestamp,
    lastAt: members[members.length - 1].timestamp,
    firstBlock: members[0].blockNumber,
    lastBlock: members[members.length - 1].blockNumber,
    counts,
    other: members.length - counts.reduce((n, c) => n + c.count, 0),
    legs,
    actors: {
      external,
      actors: [...actors]
        .map(([address, count]) => ({ address, count }))
        .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address)),
    },
    byDay: [...days].map(([key, count]) => ({ key, count })).sort((a, b) => Number(a.key) - Number(b.key)),
    stateBefore: Object.keys(before).length ? before : null,
    stateAfter: Object.keys(after).length ? after : null,
  };
}

const servedHeader = (f) => ({
  count: f.count,
  txCount: f.txCount,
  firstAt: f.firstAt,
  lastAt: f.lastAt,
  firstBlock: f.firstBlock,
  lastBlock: f.lastBlock,
  counts: f.counts,
  other: f.other,
  legs: f.legs.map(
    (l) =>
      `${l.verb} ${l.asset} ${l.amount} ×${l.count} ${l.symbol}/${l.decimals}${l.displaySymbol ? ` ${l.displaySymbol}` : ""}`,
  ),
  actors: f.actors,
  byDay: f.byDay,
  stateBefore: f.stateBefore,
  stateAfter: f.stateAfter,
});

// ── One fixture ────────────────────────────────────────────────────────────

async function wholeReplay(wallet) {
  const read = await loadMoonwellEventsFromIndex({
    wallet,
    deployment: MOONWELL_BASE_DEPLOYMENT,
    deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
    router: MOONWELL_BASE_WETH_ROUTER,
    apiPrefix: "/api/moonwell-base",
    maxRendered: Number.MAX_SAFE_INTEGER,
  });
  return read?.result ?? null;
}

async function runFixture(f) {
  const id = (s) => `${s} [${f.id}]`;
  // A live wallet can move between two reads; both are taken again until they
  // describe the same history, at most three times.
  let grouped;
  let whole;
  for (let attempt = 0; attempt < 3; attempt++) {
    grouped = (await getJson(`/api/chain/moonwell-base/timeline?wallet=${f.wallet}&group=1`)).body;
    whole = await wholeReplay(f.wallet);
    if (grouped && whole && grouped.totalEvents === whole.totalEvents) break;
  }
  if (!grouped || !whole) {
    check(id("G0 both reads answered"), false, `grouped ${grouped ? "ok" : "none"}, whole ${whole ? "ok" : "none"}`);
    return null;
  }
  const plan = Array.isArray(grouped.rowPlan) ? grouped.rowPlan : [];
  const folders = plan.filter((r) => r.kind === "folder").map((r) => r.folder);
  const events = grouped.events ?? [];
  const omitted = grouped.coverage?.omitted?.count ?? 0;

  const guard =
    f.shape === "churn"
      ? folders.length > 0 && events.length > 0
      : f.shape === "no-singletons"
        ? folders.length > 0 && events.length === 0
        : omitted > 0 && folders.length + events.length > 0;
  check(
    id("F0 the fixture still has the shape it is here for"),
    guard,
    `${folders.length} folder(s), ${events.length} ungrouped event(s), ${fmt(omitted)} omitted`,
  );
  if (!guard) {
    skip(id("G1–G12"), "fixture guard tripped — the FIXTURE drifted, not the code");
    return null;
  }

  check(
    id("G1 the answer is grouped and its plan names exactly its events"),
    grouped.grouped === true && plan.filter((r) => r.kind === "event").length === events.length,
    `${plan.length} rows: ${folders.length} folders + ${events.length} events`,
  );

  const members = folders.reduce((n, x) => n + x.count, 0);
  check(
    id("G2 the partition closes: members + events = served, served + omitted = total"),
    members + events.length === grouped.eventsServed && grouped.eventsServed + omitted === grouped.totalEvents,
    `${fmt(members)} + ${fmt(events.length)} = ${fmt(grouped.eventsServed)} served; + ${fmt(omitted)} omitted = ${fmt(grouped.totalEvents)} total`,
  );

  {
    let cursor = omitted + 1;
    const bad = [];
    for (const row of plan) {
      if (row.kind === "event") {
        cursor += 1;
        continue;
      }
      const x = row.folder;
      if (x.ordinalFirst !== cursor || x.ordinalLast !== cursor + x.count - 1)
        bad.push(`${x.responseId.slice(0, 24)}… claims ${x.ordinalFirst}–${x.ordinalLast} at ${cursor} (${x.count})`);
      cursor += x.count;
    }
    check(
      id("G3 ordinals run contiguously from omitted + 1"),
      bad.length === 0 && cursor - 1 === grouped.totalEvents,
      bad.length ? bad.slice(0, 2).join("; ") : `ends at ${fmt(cursor - 1)}`,
    );
  }

  // G4 — open every folder, in order.
  const stream = [];
  const membersOf = new Map();
  let evAt = 0;
  let refused = 0;
  for (const row of plan) {
    if (row.kind === "event") {
      stream.push(events[evAt++]);
      continue;
    }
    const opened = await getJson(
      `/api/chain/moonwell-base/timeline/folder?wallet=${f.wallet}&folder=${encodeURIComponent(row.folder.responseId)}`,
    );
    if (opened.status !== 200 || !opened.body?.events) {
      refused++;
      continue;
    }
    membersOf.set(row.folder.responseId, opened.body.events);
    stream.push(...opened.body.events);
  }
  const expected = grouped.boundBy === "rows" ? whole.events.slice(-grouped.eventsServed) : whole.events;
  const idGaps = [];
  const fieldGaps = [];
  for (let i = 0; i < Math.max(stream.length, expected.length); i++) {
    const a = stream[i];
    const b = expected[i];
    if (a?.id !== b?.id) {
      idGaps.push(`#${i}: served ${a?.id ?? "—"} ≠ whole ${b?.id ?? "—"}`);
      continue;
    }
    if (canonical(a) !== canonical(b)) fieldGaps.push(a.id);
  }
  check(
    id("G4 every folder opened, in plan order, IS the whole replay's event list"),
    refused === 0 && idGaps.length === 0 && fieldGaps.length === 0,
    refused || idGaps.length || fieldGaps.length
      ? `${refused} refused open(s); ${idGaps.length} id gap(s) (${idGaps.slice(0, 2).join("; ")}); ${fieldGaps.length} event(s) differing field for field (${fieldGaps.slice(0, 2).join(", ")})`
      : `${fmt(stream.length)} events, id for id and field for field`,
  );

  {
    const bad = [];
    for (const x of folders) {
      const m = membersOf.get(x.responseId);
      if (!m || m.length === 0) {
        bad.push(`${x.responseId.slice(0, 24)}…: not opened`);
        continue;
      }
      const mine = canonical(headerOf(m));
      const theirs = canonical(servedHeader(x));
      if (mine !== theirs) {
        const a = headerOf(m);
        const b = servedHeader(x);
        const keys = Object.keys(a).filter((k) => canonical(a[k]) !== canonical(b[k]));
        bad.push(
          `${x.responseId.slice(0, 24)}…: ${keys.map((k) => `${k} members ${canonical(a[k]).slice(0, 90)} ≠ header ${canonical(b[k]).slice(0, 90)}`).join(" | ")}`,
        );
      }
    }
    check(
      id("G5 every folder header is its own members' arithmetic"),
      bad.length === 0,
      bad.length
        ? `${bad.length} of ${folders.length}: ${bad.slice(0, 2).join(" ;; ")}`
        : `${folders.length} folder(s)`,
    );
  }

  {
    const signed = [...membersOf.values()].flat().filter((e) => !thirdParty(e));
    check(
      id("G6 no owner-signed event is inside a folder"),
      signed.length === 0,
      signed.length
        ? signed
            .slice(0, 3)
            .map((e) => e.id)
            .join(", ")
        : `${fmt(members)} members, all third-party`,
    );
  }

  {
    const bad = [];
    let run = 0;
    plan.forEach((row, i) => {
      if (row.kind === "folder") {
        run = 0;
        return;
      }
      const e = stream[plan.slice(0, i).reduce((n, r) => n + (r.kind === "folder" ? r.folder.count : 1), 0)];
      if (!thirdParty(e)) {
        run = 0;
        return;
      }
      run++;
      const prev = plan[i - 1];
      const next = plan[i + 1];
      if (prev?.kind === "folder" || next?.kind === "folder") bad.push(`${e.id} stands beside a folder`);
      if (run >= 4) bad.push(`${e.id} is the fourth third-party event in a row`);
    });
    check(
      id("G7 grouping is complete"),
      bad.length === 0,
      bad.length ? bad.slice(0, 3).join("; ") : "no third-party event left beside a folder or in a run of four",
    );
  }

  {
    const bad = [];
    for (let i = 1; i < plan.length; i++) {
      if (plan[i].kind !== "folder" || plan[i - 1].kind !== "folder") continue;
      const a = new Set((membersOf.get(plan[i - 1].folder.responseId) ?? []).map((e) => e.txHash));
      const shared = (membersOf.get(plan[i].folder.responseId) ?? []).find((e) => a.has(e.txHash));
      if (shared) bad.push(shared.txHash);
    }
    check(id("G8 no transaction is split across two adjacent folders"), bad.length === 0, bad.slice(0, 2).join(", "));
  }

  {
    const keys = [
      "totalEvents",
      "txCount",
      "liquidationCount",
      "lastActivityAt",
      "positions",
      "lifetime",
      "lifetimeRaw",
    ];
    const differ = keys.filter((k) => canonical(grouped[k]) !== canonical(whole[k]));
    check(
      id("G9 every figure the route states is the whole replay's, to the wei"),
      differ.length === 0,
      differ.length
        ? differ
            .map((k) => `${k}: ${canonical(grouped[k]).slice(0, 80)} ≠ ${canonical(whole[k]).slice(0, 80)}`)
            .join(" | ")
        : `${keys.join(", ")}`,
    );
  }

  {
    const g = grouped.coverage ?? {};
    const w = whole.coverage ?? {};
    const same =
      (g.omitted?.count ?? 0) === (w.omitted?.count ?? 0) &&
      g.fromDeployment === w.fromDeployment &&
      g.fromBlock === w.fromBlock &&
      canonical(g.gaps) === canonical(w.gaps);
    check(
      id("G10 the coverage states the seed's rows and nothing else, with no anchor"),
      same && g.omitted?.anchored === undefined && grouped.boundBy == null,
      `omitted ${fmt(g.omitted?.count ?? 0)} (whole ${fmt(w.omitted?.count ?? 0)}), anchored ${g.omitted?.anchored ?? "absent"}, boundBy ${grouped.boundBy}`,
    );
  }

  {
    const outcomes = [];
    const firstFolder = folders[0];
    const member = membersOf.get(firstFolder.responseId)?.[1] ?? membersOf.get(firstFolder.responseId)?.[0];
    const byMember = await getJson(
      `/api/chain/moonwell-base/timeline/folder?wallet=${f.wallet}&event=${encodeURIComponent(member.id)}`,
    );
    outcomes.push(byMember.status === 200 && byMember.body?.folder?.responseId === firstFolder.responseId);
    const bogus = await getJson(`/api/chain/moonwell-base/timeline/folder?wallet=${f.wallet}&folder=activity:nope`);
    outcomes.push(bogus.status === 404 && bogus.body?.code === "UNKNOWN_FOLDER" && !!bogus.body?.message);
    if (events.length > 0) {
      const own = await getJson(
        `/api/chain/moonwell-base/timeline/folder?wallet=${f.wallet}&event=${encodeURIComponent(events[0].id)}`,
      );
      outcomes.push(own.status === 404 && own.body?.code === "NOT_IN_A_FOLDER");
    }
    check(
      id("G11 the members route opens by event key and refuses what it cannot open"),
      outcomes.every(Boolean),
      `by member key ${outcomes[0] ? "same folder" : "WRONG"}; bogus id ${outcomes[1] ? "UNKNOWN_FOLDER" : "WRONG"}${events.length ? `; an ungrouped event ${outcomes[2] ? "NOT_IN_A_FOLDER" : "WRONG"}` : ""}`,
    );
  }

  {
    const flat = (await getJson(`/api/chain/moonwell-base/timeline?wallet=${f.wallet}`)).body;
    check(
      id("G12 the flat answer is still flat and states the same position"),
      !!flat &&
        flat.grouped === undefined &&
        flat.rowPlan === undefined &&
        flat.totalEvents === grouped.totalEvents &&
        canonical(flat.positions) === canonical(grouped.positions),
      flat ? `flat lists ${fmt(flat.events.length)} of ${fmt(flat.totalEvents)}` : "no flat answer",
    );
  }

  // T1 — THE TRIM. No fixture here exceeds the row cap once grouped (that is
  // the point of grouping), so the cut is reached by lowering the cap on the
  // same pipeline the route runs: the rows below it must be stated by the
  // replay's own `omitted` — its count, its breakdown and its state — for
  // exactly the events the kept rows do not cover, with no anchor.
  if (f.shape !== "seeded") {
    const prepared = await readMoonwellIndex({
      wallet: f.wallet,
      deployment: MOONWELL_BASE_DEPLOYMENT,
      deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
      router: MOONWELL_BASE_WETH_ROUTER,
      apiPrefix: "/api/moonwell-base",
    });
    const cap = Math.max(2, Math.floor(plan.length / 2));
    let t;
    try {
      t = groupMoonwellReplay(prepared, { cap });
    } catch (e) {
      t = e;
    }
    if (t instanceof Error) {
      check(id(`T1 a trim at ${cap} rows states what is below it`), false, String(t.message ?? t));
    } else {
      const om = t.result.coverage.omitted;
      const below = whole.events.slice(0, whole.events.length - t.trimmed.eventsKept);
      const byType = new Map();
      for (const e of below) byType.set(e.context.data.eventType, (byType.get(e.context.data.eventType) ?? 0) + 1);
      const statedTypes = new Map((om?.summary?.byType ?? []).map((b) => [b.key, b.count]));
      const firstKeptBlock = t.trimmed.cutoffBlock;
      // Not `rows ≤ cap`: the trim walks its cut back to a block boundary and
      // re-admits whatever shares the oldest kept block, as the server's own
      // `trimToRowCap` does — the exploiter's first run went 22 → 24.
      const ok =
        t.trimmed.rows.length >= cap &&
        om?.count === below.length &&
        below.length > 0 &&
        om.anchored === undefined &&
        canonical([...byType].sort()) === canonical([...statedTypes].sort()) &&
        below.every((e) => e.blockNumber < firstKeptBlock) &&
        canonical(t.result.events.map((e) => e.id)) === canonical(whole.events.slice(below.length).map((e) => e.id)) &&
        om.summary?.stateAtCut != null;
      check(
        id(`T1 a trim at ${cap} rows states exactly what is below it`),
        ok,
        `${t.trimmed.rows.length} rows keep ${fmt(t.trimmed.eventsKept)} events from block ${fmt(firstKeptBlock ?? 0)}; omitted ${fmt(om?.count ?? 0)} of ${fmt(below.length)} below, types ${canonical([...statedTypes].sort())} vs ${canonical([...byType].sort())}, anchored ${om?.anchored ?? "absent"}, state ${om?.summary?.stateAtCut ? "stated" : "absent"}`,
      );
    }
  }

  return { grouped, whole, folders, events };
}

// ── N — the market notes on a grouped page ─────────────────────────────────

async function notesExpectation(whole) {
  const markets = new Map();
  for (const e of whole.events) {
    const d = e.context.data;
    if (d.side !== "supply") continue;
    const address = d.market.toLowerCase();
    if (!markets.has(address)) markets.set(address, { address, key: d.market, symbol: d.marketSymbol });
  }
  const ids = [];
  const steps = new Map();
  for (const m of markets.values()) {
    const r = await getJson(`/api/chain/moonwell-base/share-rate?market=${m.address}`);
    const s = Array.isArray(r.body?.steps) ? r.body.steps : [];
    steps.set(m.address, s);
    for (const n of shareRateNotesFor(s, m, whole.events)) ids.push(n.id);
  }
  return { ids: ids.sort(), markets, steps };
}

// ── H — the page ───────────────────────────────────────────────────────────

async function runPage(f, got, noteIds) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const id = (s) => `${s} [${f.id}]`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const countLine = async (page) =>
    page
      .waitForFunction(
        () => {
          for (const el of document.querySelectorAll("span.tabular-nums")) {
            const s = (el.textContent || "").trim();
            if (/^(Showing )?[\d,]+( of (at least )?[\d,]+)? (events?|listed)/.test(s)) return s;
          }
          return false;
        },
        null,
        { timeout: 240_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);

  try {
    const page = await ctx.newPage();
    const asked = page
      .waitForResponse((r) => r.url().includes("/api/chain/moonwell-base/timeline?") && /[?&]group=1/.test(r.url()), {
        timeout: 240_000,
      })
      .then(() => true)
      .catch(() => false);
    await page.goto(`${BASE}/base/moonwell/${f.wallet}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    check(id("H0 the position page asks for its history as rows"), await asked);
    const line = await countLine(page);

    const flatPage = await ctx.newPage();
    await flatPage.goto(`${BASE}/base/moonwell/${f.wallet}?folders=0`, {
      waitUntil: "domcontentloaded",
      timeout: 300_000,
    });
    const flatLine = await countLine(flatPage);
    await flatPage.close();
    const total = fmt(got.grouped.totalEvents);
    check(
      id("H1 the count line states the whole history, where the flat page states a cut"),
      line === `${total} events` &&
        typeof flatLine === "string" &&
        flatLine.startsWith("Showing ") &&
        flatLine.includes(`of ${total}`),
      `grouped "${line}", flat "${flatLine}"`,
    );

    await page.waitForTimeout(1500);
    const boundaries = await page.evaluate(
      () => document.querySelectorAll('[data-figure="timeline-boundary"], [data-boundary-row="cut"]').length,
    );
    check(id("H2 no boundary is drawn"), line != null && boundaries === 0, `${boundaries} boundary element(s)`);

    // H3 — the heatmap, at whatever grain the grid chose.
    await page.click("[data-date-control]");
    await page.waitForSelector("[data-heatmap-grain] [data-cell-at]", { timeout: 60_000 });
    let grid = null;
    let prev = "";
    for (let i = 0; i < 10; i++) {
      const read = await page.evaluate(() => {
        const root = document.querySelector("[data-heatmap-grain]");
        return {
          grain: root?.getAttribute("data-heatmap-grain") ?? null,
          cells: [...(root?.querySelectorAll("[data-cell-at][data-cell-live]") ?? [])].map((el) => {
            const m = /·\s*([\d,]+)\s*event/.exec(el.getAttribute("title") ?? "");
            return [el.getAttribute("data-cell-at"), m ? Number(m[1].replace(/,/g, "")) : 0];
          }),
        };
      });
      const s = JSON.stringify(read);
      if (s === prev) {
        grid = read;
        break;
      }
      prev = s;
      await page.waitForTimeout(700);
    }
    if (!grid) grid = JSON.parse(prev);
    const bucketOf = (ts) => {
      if (grid.grain === "months") {
        const d = new Date(ts * 1000);
        return String(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
      }
      return String(Math.floor(ts / 86400) * 86400);
    };
    const want = new Map();
    for (const e of got.whole.events) want.set(bucketOf(e.timestamp), (want.get(bucketOf(e.timestamp)) ?? 0) + 1);
    const drawn = new Map(grid.cells.filter(([, n]) => n > 0));
    const keys = new Set([...want.keys(), ...drawn.keys()]);
    const gaps = [...keys].filter((k) => (want.get(k) ?? 0) !== (drawn.get(k) ?? 0));
    const sum = [...drawn.values()].reduce((a, n) => a + n, 0);
    check(
      id("H3 the heatmap counts every event, each on its own day"),
      gaps.length === 0 && sum === got.whole.events.length,
      `grain ${grid.grain}: draws ${fmt(sum)} over ${drawn.size} cell(s), the history has ${fmt(got.whole.events.length)}${
        gaps.length
          ? ` — ${gaps.length} cell(s) differ (e.g. ${gaps
              .slice(0, 3)
              .map((k) => `${k}: ${drawn.get(k) ?? 0} vs ${want.get(k) ?? 0}`)
              .join(", ")})`
          : ""
      }`,
    );
    await page.keyboard.press("Escape");

    // H4 — the export menu's scope note.
    const members = got.folders.reduce((n, x) => n + x.count, 0);
    await page.click("[data-export-menu] button");
    const note = await page
      .waitForSelector("[data-export-scope-note]", { timeout: 30_000 })
      .then((h) => h.textContent())
      .catch(() => null);
    check(
      id("H4 the export note counts the whole history and the folders' members"),
      typeof note === "string" &&
        note.includes(`of ${total} events`) &&
        note.includes(`${fmt(members)} inside collapsed groups`),
      note ?? "no scope note",
    );
    await page.keyboard.press("Escape");

    // N1 — the notes on this page.
    if (noteIds) {
      await page.waitForTimeout(1500);
      const drawnIds = (
        await page.$$eval("[data-market-note]", (els) => els.map((el) => el.getAttribute("data-market-note")))
      )
        .filter((x) => x && !x.endsWith("-head"))
        .sort();
      check(
        id("N1 the grouped page draws the historical notes the whole history yields"),
        noteIds.length > 0 && canonical(drawnIds) === canonical(noteIds),
        `page ${drawnIds.join(", ") || "none"} · whole history ${noteIds.join(", ") || "none"}`,
      );
    }
    await page.close();
  } finally {
    await browser.close();
  }
}

// ── Run ────────────────────────────────────────────────────────────────────

for (const f of FIXTURES) {
  console.log(`\n── ${f.id} ${f.wallet}`);
  const got = await runFixture(f);
  if (!got || !f.page) continue;

  const expectation = await notesExpectation(got.whole);
  // N2 — the rule, on this position's own notes: a folder over the held row
  // withholds the note, one after the step leaves it.
  {
    const [address, steps] = [...expectation.steps].find(([, s]) => s.length > 0) ?? [];
    const market = address ? expectation.markets.get(address) : null;
    const notes = market ? shareRateNotesFor(steps, market, got.whole.events) : [];
    if (notes.length === 0) {
      skip("N2 a folder that could move the balance withholds a note", "this position yields no historical note");
    } else {
      const step = steps.find((s) =>
        notes.some((n) => n.id === `share-rate-step:${address}:${s.fromBlock}-${s.toBlock}`),
      );
      const synthetic = (firstBlock, lastBlock) => ({
        responseId: "synthetic",
        firstBlock,
        lastBlock,
        other: 0,
        legs: [{ verb: "Sent", asset: address }],
      });
      const over = shareRateNotesFor(steps, market, got.whole.events, [synthetic(step.fromBlock - 1, step.fromBlock)]);
      const after = shareRateNotesFor(steps, market, got.whole.events, [synthetic(step.toBlock + 1, step.toBlock + 2)]);
      const elsewhere = shareRateNotesFor(steps, market, got.whole.events, [
        {
          ...synthetic(step.fromBlock - 1, step.fromBlock),
          legs: [{ verb: "Sent", asset: "0x0000000000000000000000000000000000000001" }],
        },
      ]);
      check(
        "N2 a folder that could move the balance withholds a note; one that could not leaves it",
        over.length === notes.length - 1 && after.length === notes.length && elsewhere.length === notes.length,
        `${notes.length} note(s); a Sent folder over the step leaves ${over.length}, one after it ${after.length}, one in another market ${elsewhere.length}`,
      );
    }
  }

  if (BROWSER) await runPage(f, got, expectation.ids);
  else skip(`H0–H4, N1 [${f.id}]`, "BROWSER=0");
}

const counted = passes + failures;
console.log(
  failures === 0
    ? `\nALL ${counted} CHECKS PASS${skips ? ` (${skips} skipped)` : ""}`
    : `\n${failures} CHECK(S) FAILED of ${counted}${skips ? ` (${skips} skipped)` : ""}`,
);
if (counted === 0) process.exit(2);
process.exit(failures === 0 ? 0 : 1);
