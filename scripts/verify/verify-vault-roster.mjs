#!/usr/bin/env node
// The vault rosters the box serves, checked against the chain, and the pages
// checked to carry them.
// ----------------------------------------------------------------------------
// rails-server writes two vault rosters (mig 283): every MetaMorpho vault the
// two Base factories made (the daily Base census tick) and every Yearn V3 vault
// on Ethereum (a weekly job), and serves them at GET /api/vaults/roster. The web
// takes them over the catalogues it bakes (lib/morpho-base/vault-roster.ts,
// lib/yearn/vault-roster.ts) when they contain the baked ones. This script:
//
//   R0  the box answers both rosters
//   R1  Base: the served set is EXACTLY this script's own CreateMetaMorpho sweep
//       of both factories up to the served block, and every vault's factory,
//       creation block and asset are its own log's
//   R2  Yearn: the live release registry names exactly the served factories at
//       the served block, and the served set is EXACTLY this script's own
//       NewVault sweep of them, factory, creation block and asset included
//   R3  each served roster contains its baked catalogue, immutables equal
//       (else the web serves the baked one and says so in its log)
//   R4  each roster page states the served count, at a block after the bake's
//       and no later than the box's last run
//   R5  a vault the served roster has and the bake lacks answers 200 on its
//       page (SKIP, named, when there is none)
//
// Run:
//   BASE=http://localhost:3801 node scripts/verify/verify-vault-roster.mjs
// Needs in .env.local (read, never printed): RAILS_API_URL + API_BEARER_TOKEN
// (the box), BASE_BACKFILL_RPC_URL (Base whole-life eth_getLogs),
// ETHEREUM_LOGS_RPC_URL (mainnet wide eth_getLogs) and ALCHEMY_URL (mainnet
// eth_call). About ten log requests and three calls.

import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchServedRoster } from "./lib/served-vault-roster.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3801";
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);
for (const k of ["RAILS_API_URL", "API_BEARER_TOKEN", "BASE_BACKFILL_RPC_URL", "ETHEREUM_LOGS_RPC_URL", "ALCHEMY_URL"])
  if (!env[k]) throw new Error(`need ${k} in .env.local`);

let failures = 0;
let passes = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const skip = (name, why) => {
  console.log(`SKIP  ${name} — ${why}`);
  skipped++;
};
const n = (v) => Number(v).toLocaleString("en-US");
const topicAddress = (t) => `0x${t.slice(26).toLowerCase()}`;

/** Every log of `topic0` on `address` in [from, to], in `chunk`-block requests,
 *  each range-checked. Any JSON-RPC error throws: a short answer is a failure. */
async function logs(url, address, topic0, from, to, chunk) {
  const out = [];
  for (let lo = from; lo <= to; lo += chunk) {
    const hi = Math.min(lo + chunk - 1, to);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getLogs",
        params: [{ address, topics: [topic0], fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}` }],
      }),
    });
    const j = await res.json();
    if (j.error || !Array.isArray(j.result))
      throw new Error(`eth_getLogs [${lo},${hi}] on ${address}: error ${j.error?.code ?? res.status}`);
    for (const l of j.result) {
      const b = parseInt(l.blockNumber, 16);
      if (b < lo || b > hi) throw new Error(`eth_getLogs: a log at ${b} outside [${lo},${hi}]`);
      if (l.address.toLowerCase() !== address.toLowerCase() || l.topics[0] !== topic0) continue;
      out.push(l);
    }
  }
  return out;
}

/** The baked rows, by the parse the sibling verifiers use. */
function bakedMorpho() {
  const src = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
  const assets = src
    .match(/const A: readonly string\[\] = \[([\s\S]*?)\];/)[1]
    .match(/0x[0-9a-f]{40}/g)
    .map((a) => a.toLowerCase());
  const flat = src.match(/const ROWS[^=]*=\s*\[([\s\S]*?)\n\];/)[1].replace(/\s+/g, " ");
  const str = `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
  const re = new RegExp(`\\[ ?"(0x[0-9a-f]{40})" ?, ?(\\d) ?, ?(\\d+) ?, ?${str} ?, ?${str} ?, ?(\\d+) ?,? ?\\]`, "g");
  const rows = [...flat.matchAll(re)].map((m) => ({
    address: m[1],
    factory: m[2] === "1" ? "v1.1" : "v1.0",
    createdBlock: Number(m[3]),
    asset: assets[Number(m[6])],
  }));
  if (rows.length !== (flat.match(/\[ ?"0x/g) || []).length)
    throw new Error("morpho vault-catalog parse is incomplete");
  return { rows, block: Number(src.match(/MORPHO_BASE_VAULT_CENSUS_BLOCK = (\d+)/)[1]) };
}
function bakedYearn() {
  const src = fs.readFileSync(path.join(ROOT, "lib/yearn/vault-catalog.ts"), "utf8");
  const factories = [
    ...src
      .match(/YEARN_V3_FACTORIES: readonly \{[\s\S]*?\}\[\] = \[([\s\S]*?)\n\];/)[1]
      .matchAll(/apiVersion: "([\d.]+)",\s*address: "(0x[0-9a-f]{40})"/g),
  ].map((m) => ({ apiVersion: m[1], address: m[2] }));
  const assets = [
    ...src
      .match(/const A: readonly \[string, string \| null, number\]\[\] = \[([\s\S]*?)\n\];/)[1]
      .matchAll(/\[\s*"(0x[0-9a-f]{40})"/g),
  ].map((m) => m[1]);
  const rowBlock = src.match(/const ROWS: readonly \[[^\]]*\]\[\] = \[([\s\S]*?)\n\];/)[1];
  const rows = [
    ...rowBlock.matchAll(
      /\[\s*"(0x[0-9a-f]{40})",\s*(\d+),\s*(\d+),\s*"(?:[^"\\]|\\.)*",\s*"(?:[^"\\]|\\.)*",\s*(\d+),?\s*\]/g,
    ),
  ].map((m) => ({
    address: m[1],
    factory: factories[Number(m[2])].address,
    apiVersion: factories[Number(m[2])].apiVersion,
    createdBlock: Number(m[3]),
    asset: assets[Number(m[4])],
  }));
  if (rows.length !== (rowBlock.match(/"0x[0-9a-f]{40}"/g) || []).length)
    throw new Error("yearn vault-catalog parse is incomplete");
  return { rows, block: Number(src.match(/YEARN_VAULT_CENSUS_BLOCK = (\d+)/)[1]) };
}

/** The text of the element carrying `data-figure="<figure>"` in a page's HTML. */
async function figureText(url, figure) {
  const res = await fetch(url);
  const html = await res.text();
  const at = html.indexOf(`data-figure="${figure}"`);
  if (at < 0) return { status: res.status, text: null };
  const body = html.slice(at, html.indexOf("</p>", at));
  return {
    status: res.status,
    text: body
      .replace(/<!--.*?-->/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^[^>]*>/, "")
      .replace(/\s+/g, " "),
  };
}

// ── R0 ──────────────────────────────────────────────────────────────────────
const { roster: morpho, why: morphoWhy } = await fetchServedRoster(env, 8453, "metamorpho");
const { roster: yearn, why: yearnWhy } = await fetchServedRoster(env, 1, "yearn-v3");
check(
  "R0a the box serves the Base MetaMorpho roster",
  Boolean(morpho),
  morpho
    ? `${n(morpho.vaults.length)} vaults at block ${n(morpho.rosterBlock)}, written by ${morpho.writer} at ${morpho.loadedAt}`
    : morphoWhy,
);
check(
  "R0b the box serves the Yearn V3 roster",
  Boolean(yearn),
  yearn
    ? `${n(yearn.vaults.length)} vaults at block ${n(yearn.rosterBlock)}, written by ${yearn.writer} at ${yearn.loadedAt}`
    : yearnWhy,
);

// ── R1: Base against its own sweep ──────────────────────────────────────────
const CREATE_METAMORPHO = "0xed8c95d05909b0f217f3e68171ef917df4b278d5addfe4dda888e90279be7d1d";
if (morpho) {
  const own = new Map();
  for (const f of morpho.factories) {
    for (const l of await logs(
      env.BASE_BACKFILL_RPC_URL,
      f.address,
      CREATE_METAMORPHO,
      f.firstBlock,
      morpho.rosterBlock,
      50_000_000,
    )) {
      if (l.topics.length !== 4) continue;
      own.set(topicAddress(l.topics[1]), {
        factoryVersion: f.version,
        factory: f.address,
        createdBlock: parseInt(l.blockNumber, 16),
        asset: topicAddress(l.topics[3]),
      });
    }
  }
  const served = new Map(morpho.vaults.map((v) => [v.address, v]));
  const missing = [...own.keys()].filter((a) => !served.has(a));
  const extra = [...served.keys()].filter((a) => !own.has(a));
  check(
    "R1a the served Base set is this script's own CreateMetaMorpho sweep to the served block",
    missing.length === 0 && extra.length === 0,
    `own ${n(own.size)}, served ${n(served.size)}, missing ${missing.length}, extra ${extra.length}`,
  );
  const wrong = [...own].filter(([a, o]) => {
    const s = served.get(a);
    return (
      s &&
      (s.factory !== o.factory ||
        s.factoryVersion !== o.factoryVersion ||
        s.createdBlock !== o.createdBlock ||
        s.asset !== o.asset)
    );
  });
  check(
    "R1b every served Base vault's factory, version, creation block and asset are its own creation log's",
    wrong.length === 0,
    wrong.length ? `${wrong.length} differ, e.g. ${wrong[0][0]}` : `${n(own.size)} agree`,
  );
} else {
  skip("R1 Base against its own sweep", "no served roster");
}

// ── R2: Yearn against its own sweep ─────────────────────────────────────────
const NEW_VAULT = "0x4241302c393c713e690702c4a45a57e93cef59aa8c6e2358495853b3420551d8";
const LIVE_RELEASE_REGISTRY = "0x0377b4daDDA86C89A0091772B79ba67d0E5F7198";
if (yearn) {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3 }),
  });
  const abi = parseAbi([
    "function numReleases() view returns (uint256)",
    "function factories(uint256) view returns (address)",
  ]);
  const at = BigInt(yearn.rosterBlock);
  const count = Number(
    await client.readContract({ address: LIVE_RELEASE_REGISTRY, abi, functionName: "numReleases", blockNumber: at }),
  );
  const live = [];
  for (let i = 0; i < count; i++)
    live.push(
      (
        await client.readContract({
          address: LIVE_RELEASE_REGISTRY,
          abi,
          functionName: "factories",
          args: [BigInt(i)],
          blockNumber: at,
        })
      ).toLowerCase(),
    );
  check(
    "R2a the live release registry names exactly the served factories, in order, at the served block",
    live.join() === yearn.factories.map((f) => f.address).join(),
    `${live.length} live, ${yearn.factories.length} served`,
  );
  const own = new Map();
  for (const f of yearn.factories) {
    for (const l of await logs(
      env.ETHEREUM_LOGS_RPC_URL,
      f.address,
      NEW_VAULT,
      f.firstBlock,
      yearn.rosterBlock,
      2_000_000,
    )) {
      if (l.topics.length !== 3) continue;
      own.set(topicAddress(l.topics[1]), {
        factory: f.address,
        factoryVersion: f.apiVersion,
        createdBlock: parseInt(l.blockNumber, 16),
        asset: topicAddress(l.topics[2]),
      });
    }
  }
  const served = new Map(yearn.vaults.map((v) => [v.address, v]));
  const missing = [...own.keys()].filter((a) => !served.has(a));
  const extra = [...served.keys()].filter((a) => !own.has(a));
  check(
    "R2b the served Yearn set is this script's own NewVault sweep of those factories to the served block",
    missing.length === 0 && extra.length === 0,
    `own ${n(own.size)}, served ${n(served.size)}, missing ${missing.length}, extra ${extra.length}`,
  );
  const wrong = [...own].filter(([a, o]) => {
    const s = served.get(a);
    return (
      s &&
      (s.factory !== o.factory ||
        s.factoryVersion !== o.factoryVersion ||
        s.createdBlock !== o.createdBlock ||
        s.asset !== o.asset)
    );
  });
  check(
    "R2c every served Yearn vault's factory, api version, creation block and asset are its own log's",
    wrong.length === 0,
    wrong.length ? `${wrong.length} differ, e.g. ${wrong[0][0]}` : `${n(own.size)} agree`,
  );
} else {
  skip("R2 Yearn against its own sweep", "no served roster");
}

// ── R3: served contains baked ───────────────────────────────────────────────
const bm = bakedMorpho();
const by = bakedYearn();
const contains = (served, baked, same) => {
  if (!served) return { ok: false, detail: "no served roster" };
  const s = new Map(served.vaults.map((v) => [v.address, v]));
  const lacking = baked.rows.filter((b) => !s.has(b.address));
  const differ = baked.rows.filter((b) => s.has(b.address) && !same(s.get(b.address), b));
  return {
    ok: lacking.length === 0 && differ.length === 0 && served.rosterBlock >= baked.block,
    detail: `baked ${n(baked.rows.length)} at block ${n(baked.block)}, served ${n(served.vaults.length)} at ${n(served.rosterBlock)}; ${lacking.length} baked vaults absent, ${differ.length} differ; ${n(served.vaults.length - baked.rows.length + lacking.length)} served vaults the bake lacks`,
  };
};
const r3m = contains(
  morpho,
  bm,
  (s, b) => s.factoryVersion === b.factory && s.createdBlock === b.createdBlock && s.asset === b.asset,
);
check(
  "R3a the served Base roster contains the baked catalogue, immutables equal, at a later block",
  r3m.ok,
  r3m.detail,
);
const r3y = contains(
  yearn,
  by,
  (s, b) =>
    s.factory === b.factory &&
    s.factoryVersion === b.apiVersion &&
    s.createdBlock === b.createdBlock &&
    s.asset === b.asset,
);
check(
  "R3b the served Yearn roster contains the baked catalogue, immutables equal, at a later block",
  r3y.ok,
  r3y.detail,
);

// ── R4: the pages carry the served roster ───────────────────────────────────
// The web reuses a served roster for up to an hour (SERVED_ROSTER_REVALIDATE_
// SECONDS), and the box can write a newer run inside that hour, so the page's
// block may trail the one read here. The page must state the served count at a
// block after the bake's and no later than the box's latest run; the baked
// count at the baked block is the failure this looks for.
for (const [label, url, figure, served, baked] of [
  ["R4a /base/morpho/vaults", `${BASE}/base/morpho/vaults`, "directory-census", morpho, bm],
  ["R4b /ethereum/yearn/vaults", `${BASE}/ethereum/yearn/vaults`, "roster-census", yearn, by],
]) {
  if (!served) {
    skip(`${label} states the served roster`, "no served roster");
    continue;
  }
  const { status, text } = await figureText(url, figure);
  const m = text?.match(/([\d,]+) vaults[^.]*?at block ([\d,]+)/);
  const count = m ? Number(m[1].replace(/,/g, "")) : NaN;
  const block = m ? Number(m[2].replace(/,/g, "")) : NaN;
  check(
    `${label} states the served count at a served block, not the baked ones`,
    status === 200 && count === served.vaults.length && block > baked.block && block <= served.rosterBlock,
    m
      ? `page: ${n(count)} vaults at block ${n(block)}; served: ${n(served.vaults.length)} at ${n(served.rosterBlock)}; baked: ${n(baked.rows.length)} at ${n(baked.block)}`
      : `status ${status}, no count and block in [data-figure="${figure}"]`,
  );
}

// ── R5: a vault the bake lacks has a page ───────────────────────────────────
for (const [label, served, baked, href] of [
  ["R5a Base", morpho, bm, (a) => `${BASE}/base/morpho/vaults/${a}`],
  ["R5b Yearn", yearn, by, (a) => `${BASE}/ethereum/yearn/vaults/${a}`],
]) {
  if (!served) {
    skip(`${label}: a vault the bake lacks answers 200`, "no served roster");
    continue;
  }
  const known = new Set(baked.rows.map((r) => r.address));
  const fresh = served.vaults.filter((v) => !known.has(v.address)).slice(0, 3);
  if (!fresh.length) {
    skip(
      `${label}: a vault the bake lacks answers 200`,
      `the served roster holds no vault the bake lacks (${n(served.vaults.length)} each)`,
    );
    continue;
  }
  const statuses = [];
  for (const v of fresh) statuses.push([v.address, (await fetch(href(v.address))).status]);
  check(
    `${label}: a vault the bake lacks answers 200 on its page`,
    statuses.every(([, s]) => s === 200),
    statuses.map(([a, s]) => `${a.slice(0, 10)}… ${s}`).join(", "),
  );
}

console.log(`\n${passes} passed, ${failures} failed, ${skipped} skipped`);
process.exit(failures ? 1 : 0);
