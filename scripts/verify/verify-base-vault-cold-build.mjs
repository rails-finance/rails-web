#!/usr/bin/env node
// A cold heavy Base (MetaMorpho) vault life, built while the lane refuses.
// OFFLINE: no chain read, no dev server.
// ----------------------------------------------------------------------------
// rails-ops TO-DO-infra §5.14, the twin of verify-ethereum-vault-cold-build.mjs.
// On 2026-09-21 three of the 121 Base tails in the store held 1,608 rows whose
// share price never answered: the Base loader's chunked build rebuilt a chunk
// once when a TIMESTAMP was missing, never looked at the price, and stored a
// `sharePriceAtBlock: null` that no later request reads again.
//
// This script stands up a local JSON-RPC server that speaks the calls the
// loader makes (`eth_getLogs`, `eth_getBlockByNumber`, `eth_call` for
// `balanceOf` / `convertToAssets`), batches included, and refuses them the way
// a metered lane does: past LIMIT calls in a rolling second it answers every
// call with code 429 — per item inside a batch, HTTP 429 on a single request —
// for PENALTY_MS. Both lanes the loader reads point at it: `BASE_RPC_URL` (the
// state reads, through `chainBatchClient(8453)`, which backs off a 429) and
// `BASE_BACKFILL_RPC_URL` (the sweeps, and the allocation read, which this
// server leaves unanswered: a band is never stored). The loader under test is
// the real one, imported from source.
//
//   1  QUIET LANE, SAME CALLS. With no limit, one cold visit makes exactly the
//      calls it made before the fix (EXPECTED_QUIET_CALLS).
//   2  A REFUSING LANE STILL BUILDS: the cold visit keeps a chunk and offers a
//      tail whose every row has a timestamp and a share price.
//   3  ONE BLOCK WHOSE TIMESTAMP WILL NOT ANSWER ends the first chunk just
//      below it; the tail offered is a whole up to that cut.
//   4  A FIRST CHUNK THAT STALLS STILL GETS BUILT: the visit states the
//      building state at nothing kept (4a) and hands over a continuation that
//      waits the block out and stores the life to its finalized head (4b).
//   6  A SHARE PRICE THAT NEVER ANSWERS IS NOT STORED. Every timestamp answers;
//      only `convertToAssets` at some blocks is refused for the whole run.
//      6a the chunked build ends its chunk below the first unpriced block;
//      6b a light life built inline offers no tail while a row is unpriced,
//         and still draws every row;
//      6c a stored tail carrying a null price is refused on the way out, and
//         the life is swept whole again.
//   7  A TAIL LARGER THAN VERCEL LETS A FUNCTION RECEIVE STILL REACHES THE
//      STORE. `putVaultTail` offers the tail to this deployment's own
//      /api/vaults/positions/tail route, a Vercel function, and Vercel refuses
//      a request body above 4.5 MB with 413 FUNCTION_PAYLOAD_TOO_LARGE before
//      the route runs (measured on preview 2026-09-21: 4,404,029 bytes through,
//      5,033,174 refused). On preview the build of `0xbeef…83b2/0x25c1…9c52`
//      stored 4,514 rows and stopped: the next chunk's tail was about 4.8 MB.
//      An 11,000-row tail (the Base ceiling) goes through the real client and
//      the real route, with a stand-in for Vercel's limit in front and a
//      stand-in store behind: 7a the store accepted it, 7b the body on the
//      wire was under 4.5 MB, 7c the store received every row and the sum.
//   (There is no 5: the Ethereum script's rate-limited sweep check is about
//   `chainLogsClient`, which this loader does not read its sweeps through.)
//
// `--old[=<commit>]` is the break test: the same checks against the loader,
// rpc.ts, lib/api/fetch-vault-tail.ts and the tail route as they were at
// <commit> (default eb7cd2c1, before §5.14's fix), in a scratch copy. Measured
// 2026-09-21: 3/8 there — red on 3, 4b, 6a, 6b and 6c; 1, 2 and 4a hold on
// both. Check 7 joined the same night: 11/11 on its fix; --old=f7bfbe2a
// 8/11, red on 7a, 7b and 7c ("answer 413, 5,973,287 bytes on the wire");
// --old (eb7cd2c1) 3/11. The synthetic rows compress far better than real
// ones (81,767 bytes gzipped): the real 8,771-row tail of 0x25c1…9c52 went
// 4,818,063 → 893,233, so the 8 MB store limit gzips to about 1.5 MB. 2 holds before the fix because the refused calls
// are waited out by rpc.ts's backoff (c32a489b) before the price is read.
//
// Run:
//   node scripts/verify/verify-base-vault-cold-build.mjs
//   node scripts/verify/verify-base-vault-cold-build.mjs --old

import { spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The loader is TypeScript with `@/` path aliases. Re-exec once with type
// stripping and an alias hook, exactly as verify-ethereum-vault-cold-build.mjs does.
if (!process.execArgv.includes("--experimental-strip-types")) {
  const hook = `
    import { existsSync } from "node:fs";
    const ROOT = ${JSON.stringify(new URL("file://" + ROOT + "/").href)};
    const EXT = [".ts", ".tsx", "/index.ts", "/index.tsx", ".mjs", ".js"];
    export async function resolve(spec, ctx, next) {
      let s = spec;
      // Next's own entry points carry no exports map, so ESM wants the file.
      if (s === "next/server") s = "next/server.js";
      if (s.startsWith("@/")) s = new URL(s.slice(2), ROOT).href;
      if (s.startsWith(".") || s.startsWith("file:")) {
        const base = s.startsWith("file:") ? s : new URL(s, ctx.parentURL).href;
        if (!/\\.(ts|tsx|mjs|js|json)$/.test(base)) {
          for (const e of EXT) if (existsSync(new URL(base + e))) return next(base + e, ctx);
        }
        return next(base, ctx);
      }
      return next(s, ctx);
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

const OLD_ARG = process.argv.find((a) => a === "--old" || a.startsWith("--old="));
const OLD = OLD_ARG != null;
/** The commit `--old` pins: by default the one before §5.14's fix. */
const BEFORE_FIX = OLD_ARG?.startsWith("--old=") ? OLD_ARG.slice("--old=".length) : "eb7cd2c1";

const { toEventSelector, parseAbiItem, pad, toHex } = await import("viem");

// ── the synthetic lives ─────────────────────────────────────────────────────
// 6,000 transfers in, one per block, 10 blocks apart: above the horizon
// (5,000) and above what one request builds inline (4,000 blocks), and under
// the Base ceiling (11,000) — a Tier 1 life, built across requests. A second
// holder's 50 transfers sit between them: a light life, built inline.
const VAULT = "0x00000000000000000000000000000000000b45e1";
const HOLDER = "0x000000000000000000000000000000000000beef";
const LIGHT = "0x000000000000000000000000000000000000f00d";
const OTHER = "0x000000000000000000000000000000000000cafe";
const N = 6000;
const LIGHT_N = 50;
const FIRST_BLOCK = 30_000_000;
const CREATED = FIRST_BLOCK - 100;
const STEP = 10;
const HEAD = FIRST_BLOCK + N * STEP + 1000;
const FINALIZED = HEAD - 700;
const TRANSFER = toEventSelector(
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
);
const topicOf = (a) => pad(a, { size: 32 }).toLowerCase();
const transferIn = (holder, block, i) => ({
  address: VAULT,
  topics: [TRANSFER, topicOf(OTHER), topicOf(holder)],
  data: toHex(1000n + BigInt(i), { size: 32 }),
  blockNumber: toHex(block),
  transactionHash: pad(toHex(block), { size: 32 }),
  logIndex: "0x0",
  blockHash: pad(toHex(block + 1), { size: 32 }),
  transactionIndex: "0x0",
  removed: false,
});
const LOGS = Array.from({ length: N }, (_, i) => transferIn(HOLDER, FIRST_BLOCK + i * STEP, i));
const LIGHT_LOGS = Array.from({ length: LIGHT_N }, (_, i) => transferIn(LIGHT, FIRST_BLOCK + i * STEP + 5, i));
const ALL_LOGS = [...LOGS, ...LIGHT_LOGS];

// ── the lane ────────────────────────────────────────────────────────────────
const lane = {
  limit: Infinity, // calls per rolling second before the penalty
  penaltyMs: 2500,
  penaltyUntil: 0,
  recent: [],
  calls: 0,
  refusals: 0,
  /** block number → until when its eth_getBlockByNumber is refused */
  deadBlocks: new Map(),
  /** block number → until when its `convertToAssets` is refused */
  deadPrices: new Map(),
};
const refusal = { code: 429, message: "Your app has exceeded its compute units per second capacity." };

function refused(now) {
  if (now < lane.penaltyUntil) return true;
  lane.recent.push(now);
  while (lane.recent.length && lane.recent[0] < now - 1000) lane.recent.shift();
  if (lane.recent.length > lane.limit) {
    lane.penaltyUntil = now + lane.penaltyMs;
    return true;
  }
  return false;
}

const blockObject = (n) => ({
  number: toHex(n),
  hash: pad(toHex(n + 1), { size: 32 }),
  parentHash: pad(toHex(n), { size: 32 }),
  timestamp: toHex(1_700_000_000 + n),
  nonce: "0x0000000000000000",
  sha3Uncles: pad("0x0", { size: 32 }),
  logsBloom: pad("0x0", { size: 256 }),
  transactionsRoot: pad("0x0", { size: 32 }),
  stateRoot: pad("0x0", { size: 32 }),
  receiptsRoot: pad("0x0", { size: 32 }),
  miner: OTHER,
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x1",
  gasLimit: "0x1",
  gasUsed: "0x1",
  baseFeePerGas: "0x1",
  transactions: [],
  uncles: [],
});

function answer(req) {
  const now = Date.now();
  lane.calls++;
  const { method, params, id } = req;
  if (refused(now)) {
    lane.refusals++;
    return { jsonrpc: "2.0", id, error: refusal };
  }
  if (method === "eth_getBlockByNumber") {
    const tag = params[0];
    const n = tag === "finalized" ? FINALIZED : tag === "latest" ? HEAD : Number(BigInt(tag));
    if ((lane.deadBlocks.get(n) ?? 0) > now) return { jsonrpc: "2.0", id, error: refusal };
    return { jsonrpc: "2.0", id, result: blockObject(n) };
  }
  if (method === "eth_getLogs") {
    const f = params[0];
    const from = Number(BigInt(f.fromBlock));
    const to = Number(BigInt(f.toBlock));
    const match = ALL_LOGS.filter((l) => {
      const b = Number(BigInt(l.blockNumber));
      if (b < from || b > to) return false;
      return f.topics.every((t, i) => t == null || (l.topics[i] ?? "").toLowerCase() === t.toLowerCase());
    });
    return { jsonrpc: "2.0", id, result: match };
  }
  if (method === "eth_call") {
    const data = params[0].data ?? params[0].input;
    const selector = data.slice(0, 10);
    const block = params[1] === "latest" ? HEAD : Number(BigInt(params[1]));
    if (selector === "0x70a08231") {
      // Every synthetic log is a transfer IN, so a balance is the sum of the
      // ones addressed to the holder asked about.
      const who = `0x${data.slice(10, 74)}`.toLowerCase();
      const bal = ALL_LOGS.filter((l) => Number(BigInt(l.blockNumber)) <= block && l.topics[2] === who).reduce(
        (a, l) => a + BigInt(l.data),
        0n,
      );
      return { jsonrpc: "2.0", id, result: toHex(bal, { size: 32 }) };
    }
    if (selector === "0x07a2d13a") {
      if ((lane.deadPrices.get(block) ?? 0) > now) return { jsonrpc: "2.0", id, error: refusal };
      return { jsonrpc: "2.0", id, result: toHex(10n ** 6n, { size: 32 }) };
    }
  }
  if (method === "eth_chainId") return { jsonrpc: "2.0", id, result: "0x2105" };
  // Anything else — the allocation read's Morpho Blue calls among them — is
  // not served, and the loader states it unread.
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `mock: ${method}` } };
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(parsed.map(answer)));
      return;
    }
    const out = answer(parsed);
    res.writeHead(out.error?.code === 429 ? 429 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const LOCAL = `http://127.0.0.1:${server.address().port}`;
process.env.BASE_RPC_URL = LOCAL;
process.env.BASE_BACKFILL_RPC_URL = LOCAL;

// ── the loader under test ───────────────────────────────────────────────────
let loaderPath = resolvePath(ROOT, "lib/sources/chain/morpho-base-vault-timeline.ts");
let tailClientPath = resolvePath(ROOT, "lib/api/fetch-vault-tail.ts");
let tailRoutePath = resolvePath(ROOT, "app/api/vaults/positions/tail/route.ts");
if (OLD) {
  // The pre-fix loader AND the pre-fix rpc.ts, side by side in a scratch copy
  // inside the checkout (so `viem` resolves), removed on exit. Every other
  // relative import points back into this checkout.
  const dir = mkdtempSync(resolvePath(ROOT, ".verify-base-cold-build-old-"));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  for (const f of ["morpho-base-vault-timeline.ts", "rpc.ts"]) {
    let src = execFileSync("git", ["show", `${BEFORE_FIX}:lib/sources/chain/${f}`], { cwd: ROOT, encoding: "utf8" });
    src = src.replace(/from "\.\/(?!rpc")([^"]+)"/g, `from "file://${resolvePath(ROOT, "lib/sources/chain")}/$1"`);
    writeFileSync(resolvePath(dir, f), src);
  }
  for (const [f, name] of [
    ["lib/api/fetch-vault-tail.ts", "fetch-vault-tail.ts"],
    ["app/api/vaults/positions/tail/route.ts", "tail-route.ts"],
  ])
    writeFileSync(
      resolvePath(dir, name),
      execFileSync("git", ["show", `${BEFORE_FIX}:${f}`], { cwd: ROOT, encoding: "utf8" }),
    );
  tailClientPath = resolvePath(dir, "fetch-vault-tail.ts");
  tailRoutePath = resolvePath(dir, "tail-route.ts");
  loaderPath = resolvePath(dir, "morpho-base-vault-timeline.ts");
  console.log(`── --old: the loader at ${BEFORE_FIX}, before the fix ──`);
}
const { loadMorphoBaseVaultTimelineWithTail } = await import(loaderPath);

const load = (holder = HOLDER, tail = null) =>
  loadMorphoBaseVaultTimelineWithTail(VAULT, holder, {
    blockNumber: HEAD,
    fromBlock: CREATED,
    shareDecimals: 18,
    assetDecimals: 6,
    tail,
  });

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}
const reset = () => {
  lane.limit = Infinity;
  lane.penaltyUntil = 0;
  lane.recent = [];
  lane.calls = 0;
  lane.refusals = 0;
  lane.deadBlocks.clear();
  lane.deadPrices.clear();
};
/** A tail is a whole up to its own cut: ascending, nothing above the cut, no
 *  placeholder timestamp, no unread share price, and its rows sum to its
 *  cutBalance. */
const wholeTail = (t) =>
  t.rows.every((r, i) => i === 0 || r.blockNumber > t.rows[i - 1].blockNumber) &&
  t.rows.every((r) => r.blockNumber <= t.cut && r.timestamp > 0 && r.sharePriceAtBlock != null) &&
  t.rows.reduce((a, r) => a + BigInt(r.sharesDelta), 0n) === BigInt(t.cutBalance);
const rowsBelow = (cut) => LOGS.filter((l) => Number(BigInt(l.blockNumber)) <= cut).length;
const unpriced = (t) => (t ? t.rows.filter((r) => r.sharePriceAtBlock == null).length : 0);

// 1 — a quiet lane. Two transfer sweeps, three note sweeps, finalized,
// balanceOf, the head block's timestamp, the two asset-leg sweeps, and one
// timestamp and one price per block of the first chunk.
const EXPECTED_QUIET_CALLS = 2 + 3 + 1 + 1 + 1 + 2 + 2 * 1500;
reset();
{
  const r = await load();
  check(
    "1 a quiet lane: one cold visit makes the calls it always made",
    lane.calls === EXPECTED_QUIET_CALLS && r.store?.rows.length === 1500,
    `${lane.calls} calls (pinned ${EXPECTED_QUIET_CALLS}), ${r.store?.rows.length ?? 0} rows offered`,
  );
}

// 2 — a refusing lane: 2,000 calls in a rolling second, then 2.5 s refused.
reset();
lane.limit = 2000;
{
  const t0 = Date.now();
  const r = await load();
  const b = r.timeline.history.building;
  check(
    "2 a refusing lane: the cold visit keeps a chunk and offers its tail",
    r.timeline.unread == null &&
      b != null &&
      b.keptRows > 0 &&
      r.store != null &&
      wholeTail(r.store) &&
      r.store.rows.length === rowsBelow(r.store.cut),
    `${unpriced(r.store)} stored rows with no share price; building ${JSON.stringify(b)}, store ${r.store ? `${r.store.rows.length} rows at cut ${r.store.cut}` : "null"}, ${lane.refusals} calls refused, ${Date.now() - t0} ms`,
  );
}

// 3 — one block's timestamp will not answer for 20 s, longer than the
// client's backoff and the one retry of the misses together.
reset();
const DEAD = FIRST_BLOCK + 700 * STEP;
lane.deadBlocks.set(DEAD, Date.now() + 20_000);
{
  const r = await load();
  check(
    "3 one block whose timestamp will not answer ends the chunk below it, not the chunk",
    r.store != null && r.store.cut === DEAD - STEP && r.store.rows.length === 700 && wholeTail(r.store),
    `store ${r.store ? `${r.store.rows.length} rows at cut ${r.store.cut}` : "null"}, wanted 700 rows at cut ${DEAD - STEP}`,
  );
}

// 4 — the chunk's very first block will not answer for 20 s.
reset();
lane.deadBlocks.set(FIRST_BLOCK, Date.now() + 20_000);
{
  const r = await load();
  const b = r.timeline.history.building;
  const puts = [];
  if (r.continueBuild)
    await r.continueBuild(async (t) => {
      const last = puts[puts.length - 1];
      const ok = wholeTail(t) && (!last || t.cut > last.cut);
      puts.push(t);
      return { ok };
    });
  const last = puts[puts.length - 1];
  const buildable = LOGS.filter((l) => Number(BigInt(l.blockNumber)) <= FINALIZED).length;
  check(
    "4a a first chunk that stalls states the building state at nothing kept",
    r.timeline.unread == null && b != null && b.keptRows === 0 && b.totalRows === N && r.store == null,
    `unread ${JSON.stringify(r.timeline.unread)}, building ${JSON.stringify(b)}, store ${r.store ? "offered" : "null"}`,
  );
  check(
    "4b …and still hands over a continuation that stores the whole life to its finalized head",
    r.continueBuild != null &&
      puts.length > 0 &&
      puts.every(wholeTail) &&
      puts.every((t, i) => i === 0 || t.cut > puts[i - 1].cut) &&
      last.rows.length === buildable,
    `continuation ${r.continueBuild ? "offered" : "null"}, ${puts.length} tails stored, last ${last ? `${last.rows.length} rows at cut ${last.cut}` : "none"}, wanted ${buildable} rows`,
  );
}

// 6 — every timestamp answers; some share prices never do.
const NEVER = Number.POSITIVE_INFINITY;

// 6a — the heavy life: the 701st block's price never answers.
reset();
const DEAD_PRICE = FIRST_BLOCK + 700 * STEP;
lane.deadPrices.set(DEAD_PRICE, NEVER);
{
  const r = await load();
  check(
    "6a a share price that never answers ends the chunk below its block, and no unpriced row is stored",
    r.store != null && r.store.cut === DEAD_PRICE - STEP && r.store.rows.length === 700 && wholeTail(r.store),
    `store ${r.store ? `${r.store.rows.length} rows at cut ${r.store.cut}, ${unpriced(r.store)} with no share price` : "null"}, wanted 700 priced rows at cut ${DEAD_PRICE - STEP}`,
  );
}

// 6b — the light life, built inline: one unpriced row means no tail offered,
// and the page still draws every row, the unpriced one included.
reset();
lane.deadPrices.set(Number(BigInt(LIGHT_LOGS[20].blockNumber)), NEVER);
{
  const r = await load(LIGHT);
  const drawnUnpriced = r.timeline.events.filter((e) => e.sharePriceAtBlock == null).length;
  check(
    "6b a light life with an unpriced row offers no tail, and still draws the life",
    r.timeline.unread == null &&
      r.timeline.events.length === LIGHT_N &&
      r.store == null &&
      !r.timeline.history.storedThisRequest,
    `${r.timeline.events.length} rows drawn (${drawnUnpriced} unpriced), store ${r.store ? `offered: ${r.store.rows.length} rows, ${unpriced(r.store)} with no share price` : "null"}, storedThisRequest ${r.timeline.history.storedThisRequest}`,
  );
}

// 6c — a tail already stored with a null price (as the three v1 tails were)
// is refused on the way out: the life is swept whole again and a priced tail
// offered over it.
reset();
{
  const clean = await load(LIGHT);
  if (!clean.store) {
    check("6c a stored tail with a null share price is refused on the way out", false, "no clean tail to start from");
  } else {
    const poisoned = {
      ...clean.store,
      rows: clean.store.rows.map((row, i) => (i === 20 ? { ...row, sharePriceAtBlock: null } : row)),
    };
    const r = await load(LIGHT, poisoned);
    check(
      "6c a stored tail with a null share price is refused on the way out, and the life swept whole again",
      r.timeline.history.source === "chain" &&
        r.timeline.events.length === LIGHT_N &&
        r.store != null &&
        wholeTail(r.store),
      `source ${r.timeline.history.source}, ${r.timeline.events.length} rows drawn, store ${r.store ? `${r.store.rows.length} rows, ${unpriced(r.store)} with no share price` : "null"}`,
    );
  }
}

// 7 — a tail above Vercel's function body limit, through the real client and
// the real route. The row is a real one this loader built; the 11,000 copies
// take distinct ascending blocks and the sum is re-taken over them.
reset();
{
  const VERCEL_BODY_LIMIT = 4.5 * 1024 * 1024;
  const clean = await load(LIGHT);
  const template = clean.store?.rows?.[0];
  const N = 11_000;
  const rows = Array.from({ length: N }, (_, i) => ({
    ...template,
    id: `0x${(i + 1).toString(16).padStart(64, "0")}:0`,
    blockNumber: CREATED + 1 + i,
  }));
  const tail = {
    ...clean.store,
    cut: CREATED + N,
    cutBalance: rows.reduce((a, r) => a + BigInt(r.sharesDelta), 0n).toString(),
    rows,
  };
  // The stand-in store: records what the route forwarded and answers 200.
  let stored = null;
  const store = createServer((req, res) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => {
      stored = JSON.parse(Buffer.concat(parts).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise((r) => store.listen(0, "127.0.0.1", r));
  process.env.RAILS_API_URL = `http://127.0.0.1:${store.address().port}`;
  const { PUT } = await import(tailRoutePath);
  const { NextRequest } = await import("next/server.js");
  // The stand-in for Vercel: a body above the limit is refused before the
  // route runs; anything else is handed to the route as it arrived.
  let wireBytes = 0;
  const vercel = createServer((req, res) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(parts);
      wireBytes = body.length;
      if (body.length > VERCEL_BODY_LIMIT) {
        res.writeHead(413, { "content-type": "text/plain" });
        return res.end("FUNCTION_PAYLOAD_TOO_LARGE");
      }
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k !== "content-length"));
      const answer = await PUT(new NextRequest(`http://vercel.local${req.url}`, { method: "PUT", headers, body }));
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(await answer.text());
    });
  });
  await new Promise((r) => vercel.listen(0, "127.0.0.1", r));
  const { putVaultTail } = await import(tailClientPath);
  const put = await putVaultTail(tail, { baseUrl: `http://127.0.0.1:${vercel.address().port}` });
  const n = (v) => v.toLocaleString("en-US");
  check(
    `7a an ${n(N)}-row tail, the Base ceiling, is accepted through the route`,
    put.ok,
    `answer ${put.status}, ${n(wireBytes)} bytes on the wire`,
  );
  check(
    "7b the body on the wire is under Vercel's 4.5 MB function request limit",
    wireBytes > 0 && wireBytes <= VERCEL_BODY_LIMIT,
    `${n(wireBytes)} bytes, limit ${n(VERCEL_BODY_LIMIT)}, plain JSON ${n(Buffer.byteLength(JSON.stringify(rows)))} bytes of rows`,
  );
  check(
    "7c the store received every row and the tail's own sum",
    stored != null &&
      stored.rows?.length === N &&
      stored.cutBalance === tail.cutBalance &&
      stored.cutBlock === tail.cut &&
      JSON.stringify(stored.rows[N - 1]) === JSON.stringify(rows[N - 1]),
    stored ? `${n(stored.rows?.length ?? 0)} rows, cutBalance ${stored.cutBalance}` : "nothing reached the store",
  );
  vercel.close();
  store.close();
}

server.close();
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
