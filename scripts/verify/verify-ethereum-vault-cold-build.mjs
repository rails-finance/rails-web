#!/usr/bin/env node
// A cold heavy Ethereum vault life, built while the lane refuses on its rate
// limit. OFFLINE: no chain read, no dev server.
// ----------------------------------------------------------------------------
// rails-ops TO-DO-infra §5.11. On 2026-09-21, right after the loader-version
// bump left every stored tail cold, the first visit to two heavy lives painted
// no timeline and stored nothing: the position page's MILES said "0 rows kept
// at block 0" with the store answering 404, and the timeline suite's 1f2 page
// painted no rows a moment after its own route had drawn the life. Both are
// what `ALCHEMY_URL` does after a heavy wave: it refuses the next calls with
// 429 "exceeded its compute units per second capacity", and inside a JSON-RPC
// batch that refusal is a per-item error body viem does not retry. The first
// chunk's wave (3,000 calls) was enough to cause it; the loader then built the
// same chunk a second time into the same refusal, dropped it, and offered no
// continuation, so nothing was stored until a later visit got lucky.
//
// This script stands up a local JSON-RPC server that speaks the three calls the
// loader makes (`eth_getLogs`, `eth_getBlockByNumber`, `eth_call` for
// `balanceOf` / `convertToAssets`), batches included, and refuses them the way
// the lane does: past LIMIT calls in a rolling second it answers every call
// with code 429 — per item inside a batch, HTTP 429 on a single request — for
// PENALTY_MS. `ALCHEMY_URL` points at it, and the loader under test is the
// real one, imported from source.
//
//   1  QUIET LANE, SAME CALLS. With no limit, one cold visit makes exactly the
//      calls it made before this fix: the retry spends nothing while the lane
//      answers. The count is pinned (EXPECTED_QUIET_CALLS).
//   2  A REFUSING LANE STILL BUILDS. With the limit on, the cold visit states
//      the building state with a chunk KEPT (rows > 0, cut > 0) and offers a
//      tail for it, and every row in that tail has a real timestamp AND a share
//      price. (Before the fix the refused calls were the wave's last ones — the
//      prices — and the chunk was stored with a thousand rows' price unread,
//      for good: a stored row is never read again.)
//   3  ONE BLOCK THAT WILL NOT ANSWER costs the blocks after it, not the chunk:
//      a block refused for longer than the client's backoff ends the first
//      chunk just below it, and the tail offered is a whole up to that cut.
//   4  A FIRST CHUNK THAT STALLS STILL GETS BUILT. When the chunk's very first
//      block will not answer for 20 s, the visit states the building state at nothing
//      kept — true — and still hands the caller a continuation, which waits the
//      block out and stores the life to its finalized head, every cut
//      advancing and every tail summing to its own cutBalance.
//   5  A RATE-LIMITED SWEEP IS NOT A SIZE FACT: with every call refused for
//      longer than the backoff, the loader states the history unread — never a
//      withheld count with a floor it did not count.
//   6  A SHARE PRICE THAT NEVER ANSWERS IS NOT STORED (rails-ops TO-DO-infra
//      §5.13). Every block's timestamp answers; only `convertToAssets` at some
//      blocks is refused for the whole run. A null price in a stored row is
//      never read again, so:
//      6a the chunked build ends its chunk below the first unpriced block, as
//         it does below a block whose timestamp did not answer;
//      6b a light life built inline offers no tail while a row is unpriced,
//         and still draws every row;
//      6c a stored tail carrying a null price is refused on the way out, and
//         the life is swept whole again.
//
// `--old[=<commit>]` is the break test: the same checks against the loader and
// rpc.ts as they were at <commit> (`git show <commit>:…` into a scratch copy).
//   --old            089756f9, before §5.13's fix. 6a, 6b and 6c go red there;
//                    1–5 hold, because that fix leaves them as they were.
//   --old=1487eb7b   before §5.11's fix. 2, 3 and 4b go red there, and 6a–6c
//                    with them; 1, 4a and 5 hold on both, because a quiet lane,
//                    a building line at nothing kept and an unread history were
//                    already true statements before either fix.
//
// Run:
//   node scripts/verify/verify-ethereum-vault-cold-build.mjs
//   node scripts/verify/verify-ethereum-vault-cold-build.mjs --old
//   node scripts/verify/verify-ethereum-vault-cold-build.mjs --old=1487eb7b

import { spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The loader is TypeScript with `@/` path aliases. Re-exec once with type
// stripping and an alias hook, exactly as verify-aave-v3-lifetime-bigint.mjs does.
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

const OLD_ARG = process.argv.find((a) => a === "--old" || a.startsWith("--old="));
const OLD = OLD_ARG != null;
/** The commit `--old` pins: by default the one before §5.13's fix (a null share
 *  price could be stored); `--old=1487eb7b` is the one before §5.11's. */
const BEFORE_FIX = OLD_ARG?.startsWith("--old=") ? OLD_ARG.slice("--old=".length) : "089756f9";

const { toEventSelector, parseAbiItem, pad, toHex } = await import("viem");

// ── the synthetic life ──────────────────────────────────────────────────────
// 6,000 transfers in, one per block, 10 blocks apart: above the horizon
// (5,000) and above what one request builds inline (4,000 blocks), and under
// the chain-1 ceiling — a Tier 1 life, built across requests.
const VAULT = "0x00000000000000000000000000000000000a4e11";
const HOLDER = "0x000000000000000000000000000000000000beef";
const OTHER = "0x000000000000000000000000000000000000cafe";
/** A second holder with a light life (check 6b, 6c): built inline, whole. */
const LIGHT = "0x000000000000000000000000000000000000f00d";
const LIGHT_N = 50;
const N = 6000;
const FIRST_BLOCK = 20_000_000;
const STEP = 10;
const HEAD = FIRST_BLOCK + N * STEP + 500;
const FINALIZED = HEAD - 64;
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
// The light life sits between the heavy one's blocks, so no block is shared.
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
  /** until when every call is refused */
  allDeadUntil: 0,
};
const refusal = { code: 429, message: "Your app has exceeded its compute units per second capacity." };

function refused(now) {
  if (now < lane.allDeadUntil) return true;
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
  if (method === "eth_chainId") return { jsonrpc: "2.0", id, result: "0x1" };
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
    // A single request the lane refuses is an HTTP 429, as Alchemy sends it.
    res.writeHead(out.error?.code === 429 ? 429 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.ALCHEMY_URL = `http://127.0.0.1:${server.address().port}`;

// ── the loader under test ───────────────────────────────────────────────────
let loaderPath = resolvePath(ROOT, "lib/sources/chain/aave-ethereum-vault-timeline.ts");
if (OLD) {
  // The pre-fix loader AND the pre-fix rpc.ts, side by side in a scratch copy
  // that resolves every other import into this checkout.
  // Inside the checkout, so `viem` resolves from its node_modules; removed on exit.
  const dir = mkdtempSync(resolvePath(ROOT, ".verify-cold-build-old-"));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  for (const f of ["aave-ethereum-vault-timeline.ts", "rpc.ts"]) {
    let src = execFileSync("git", ["show", `${BEFORE_FIX}:lib/sources/chain/${f}`], { cwd: ROOT, encoding: "utf8" });
    // Relative imports other than ./rpc point back into this checkout.
    src = src.replace(/from "\.\/(?!rpc")([^"]+)"/g, `from "file://${resolvePath(ROOT, "lib/sources/chain")}/$1"`);
    writeFileSync(resolvePath(dir, f), src);
  }
  loaderPath = resolvePath(dir, "aave-ethereum-vault-timeline.ts");
  console.log(`── --old: the loader at ${BEFORE_FIX}, before the fix ──`);
}
const { loadAaveEthereumVaultTimelineWithTail } = await import(loaderPath);

const load = (holder = HOLDER, tail = null) =>
  loadAaveEthereumVaultTimelineWithTail(VAULT, holder, {
    blockNumber: HEAD,
    family: "stata",
    shareDecimals: 6,
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
  lane.allDeadUntil = 0;
};
/** A tail is a whole up to its own cut: ascending, nothing above the cut, no
 *  placeholder timestamp, no unread share price, and its rows sum to its
 *  cutBalance. */
const wholeTail = (t) =>
  t.rows.every((r, i) => i === 0 || r.blockNumber > t.rows[i - 1].blockNumber) &&
  t.rows.every((r) => r.blockNumber <= t.cut && r.timestamp > 0 && r.sharePriceAtBlock != null) &&
  t.rows.reduce((a, r) => a + BigInt(r.sharesDelta), 0n) === BigInt(t.cutBalance);
const rowsBelow = (cut) => LOGS.filter((l) => Number(BigInt(l.blockNumber)) <= cut).length;

// 1 — a quiet lane: the same calls as before the fix.
// Two sweeps + deposit + withdraw, finalized, balanceOf, the head block's
// timestamp, and one timestamp and one price per block of the first chunk.
const EXPECTED_QUIET_CALLS = 4 + 1 + 1 + 1 + 2 * 1500;
reset();
{
  const r = await load();
  check(
    "1 a quiet lane: one cold visit makes the calls it always made",
    lane.calls === EXPECTED_QUIET_CALLS && r.store?.rows.length === 1500,
    `${lane.calls} calls (pinned ${EXPECTED_QUIET_CALLS}), ${r.store?.rows.length ?? 0} rows offered`,
  );
}

// 2 — a refusing lane. 2,000 calls in a rolling second, then 2.5 s refused:
// the first chunk's 3,000-call wave trips it.
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
      b.keptCut > 0 &&
      r.store != null &&
      wholeTail(r.store) &&
      r.store.rows.length === rowsBelow(r.store.cut) &&
      r.store.rows.every((row) => row.sharePriceAtBlock != null),
    `${r.store ? r.store.rows.filter((row) => row.sharePriceAtBlock == null).length : "-"} stored rows with no share price; unread ${JSON.stringify(r.timeline.unread)}, building ${JSON.stringify(b)}, store ${r.store ? `${r.store.rows.length} rows at cut ${r.store.cut}` : "null"}, ${lane.refusals} calls refused, ${Date.now() - t0} ms`,
  );
}

// 3 — one block in the first chunk will not answer for 20 s (longer than the
// client's backoff): the chunk is kept to just below it.
reset();
const DEAD = FIRST_BLOCK + 700 * STEP;
lane.deadBlocks.set(DEAD, Date.now() + 20_000);
{
  const r = await load();
  check(
    "3 one block that will not answer ends the chunk below it, not the chunk",
    r.store != null && r.store.cut === DEAD - STEP && r.store.rows.length === 700 && wholeTail(r.store),
    `store ${r.store ? `${r.store.rows.length} rows at cut ${r.store.cut}` : "null"}, wanted 700 rows at cut ${DEAD - STEP}`,
  );
}

// 4 — the chunk's very first block will not answer for 20 s, longer than the
// visit's own backoff and its one retry of the misses (about 15 s together):
// nothing kept on the visit, and the continuation stores the life anyway.
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

// 5 — every call refused for 30 s: the sweeps are a busy lane, not a size fact.
reset();
lane.allDeadUntil = Date.now() + 30_000;
{
  const r = await load();
  check(
    "5 a sweep the lane refuses on its rate limit is stated unread, never counted as a withheld floor",
    r.timeline.unread != null && r.timeline.coverage.withheldAbove == null,
    `unread ${JSON.stringify(r.timeline.unread)}, withheldAbove ${r.timeline.coverage.withheldAbove}`,
  );
}

// 6 — every timestamp answers; some share prices never do (refused for the
// whole run, longer than any backoff or retry). A stored row is never read
// again, so an unpriced row must not reach the store.
const NEVER = Number.POSITIVE_INFINITY;
const unpriced = (t) => (t ? t.rows.filter((r) => r.sharePriceAtBlock == null).length : 0);

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
const LIGHT_DEAD = Number(BigInt(LIGHT_LOGS[20].blockNumber));
lane.deadPrices.set(LIGHT_DEAD, NEVER);
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

// 6c — a tail already stored with a null price (as v2 tails were before
// 089756f9) is refused on the way out: the life is swept whole again and a
// priced tail offered over it.
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

server.close();
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
