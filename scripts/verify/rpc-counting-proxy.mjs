// rpc-counting-proxy — a record-and-replay JSON-RPC proxy for the verifier pass.
// ----------------------------------------------------------------------------
// The verifier suite reads a `next dev` server, and every position page it opens
// runs the live chain overlays against the Alchemy key again: about 600
// block-pinned reads a page, the same reads on every pass. Three passes in four
// days spent the dev app's month (ui-jobs 432). Almost all of those reads are at
// an explicit block and never change, so this proxy answers them from disk and
// forwards only what it has not seen.
//
// ⇒ WHAT IT DOES
//   · One lane per URL, at a path: /ethereum, /base, /sepolia, /ens, and the
//     wide-range logs lanes /ethereum-logs and /base-logs. Each lane forwards to
//     the real URL it was started with (ALCHEMY_URL, BASE_RPC_URL,
//     SEPOLIA_RPC_URL, ENS_RPC_URL, ETHEREUM_LOGS_RPC_URL, BASE_BACKFILL_RPC_URL;
//     the legacy single UPSTREAM serves `/`). Lanes on one chain share a cache
//     and a pin.
//   · A response is cached on disk by chain, method and params, and replayed
//     on the next identical call. Only a clean result is cached: an error body,
//     a null result (a block or receipt not yet there) and a non-200 upstream
//     answer pass through uncached.
//   · `eth_blockNumber` and every read at "latest" are PINNED to one block per
//     chain per run: the first head read of a run goes upstream once, and from
//     then on "latest" means that block, so the page's head, its recency stamp
//     and its at-head state agree with each other and replay from disk.
//     "finalized" and "safe" are pinned the same way, at or below the latest
//     pin; "earliest" is genesis; "pending" is not pinned and not cached.
//   · A miss is forwarded upstream and counted. The count is what a pass costs
//     the key: GET /__count prints it as JSON, and the proxy prints it on exit.
//
// ⇒ WHAT IT DOES NOT DO. It caches; it never rotates keys or providers. A 429
//   from upstream is passed to the server as a 429 (rails-ops, the
//   no-routing-around-free-tiers rule).
//
// ⇒ THE CACHE lives outside the checkout, in $RPC_CACHE_DIR (default
//   ~/.cache/rails-web/rpc-replay), so every worktree and the standing preview
//   checkout share one warm cache and removing a worktree keeps it. Layout:
//   <dir>/<chain>/<method>/<hash[0..2]>/<hash>.json. Delete the directory to
//   start cold. Pins are written to <dir>/pins.json after each run; RPC_PIN=keep
//   reuses the last run's pins, so a rerun of one script costs nothing upstream.
//
// Usage — run-all.mjs starts it and points the dev server at it. By hand:
//
//   node scripts/verify/rpc-counting-proxy.mjs            # lanes from .env.local's names in the env
//   PORT=8899 RPC_PIN=keep node scripts/verify/rpc-counting-proxy.mjs
//   UPSTREAM=https://… node scripts/verify/rpc-counting-proxy.mjs   # the old single-lane rig
//
// then start the server with the four variables pointed at it:
//   ALCHEMY_URL=http://127.0.0.1:8899/ethereum BASE_RPC_URL=http://127.0.0.1:8899/base \
//   ENS_RPC_URL=http://127.0.0.1:8899/ens SEPOLIA_RPC_URL=http://127.0.0.1:8899/sepolia \
//   ETHEREUM_LOGS_RPC_URL=http://127.0.0.1:8899/ethereum-logs BASE_BACKFILL_RPC_URL=http://127.0.0.1:8899/base-logs npx next dev
//
// GET /__count — the counters; GET /__reset — zero them; GET /__pins — the pins.
// Not a verifier; run-all lists it as a SKIP.

import http from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 8899);
const CACHE_DIR = process.env.RPC_CACHE_DIR ?? join(homedir(), ".cache", "rails-web", "rpc-replay");
const PINS_FILE = join(CACHE_DIR, "pins.json");
const KEEP_PINS = process.env.RPC_PIN === "keep";
const QUIET = process.env.RPC_QUIET === "1";

// ── the lanes ───────────────────────────────────────────────────────────────

/** Sepolia's endpoint is the mainnet key on another host (lib/sources/chain/rpc.ts
 *  derives it the same way), so a run that sets only ALCHEMY_URL still gets a
 *  Sepolia lane. The URL is never logged: it carries the key. */
function sepoliaUrl() {
  const own = process.env.SEPOLIA_RPC_URL;
  if (own) return own;
  const mainnet = process.env.ALCHEMY_URL;
  if (!mainnet || !mainnet.includes("eth-mainnet.g.alchemy.com")) return undefined;
  return mainnet.replace("eth-mainnet.g.alchemy.com", "eth-sepolia.g.alchemy.com");
}

/** lane → { upstream, chain }. The chain names the cache namespace and the pin:
 *  the ENS lane reads mainnet, so it shares Ethereum's. */
const LANES = {};
if (process.env.UPSTREAM) LANES.upstream = { upstream: process.env.UPSTREAM, chain: "upstream" };
if (process.env.ALCHEMY_URL) LANES.ethereum = { upstream: process.env.ALCHEMY_URL, chain: "ethereum" };
if (process.env.BASE_RPC_URL) LANES.base = { upstream: process.env.BASE_RPC_URL, chain: "base" };
const sepolia = sepoliaUrl();
if (sepolia) LANES.sepolia = { upstream: sepolia, chain: "sepolia" };
if (process.env.ENS_RPC_URL || process.env.ALCHEMY_URL)
  LANES.ens = { upstream: process.env.ENS_RPC_URL ?? process.env.ALCHEMY_URL, chain: "ethereum" };
if (process.env.ETHEREUM_LOGS_RPC_URL)
  LANES["ethereum-logs"] = { upstream: process.env.ETHEREUM_LOGS_RPC_URL, chain: "ethereum" };
if (process.env.BASE_BACKFILL_RPC_URL)
  LANES["base-logs"] = { upstream: process.env.BASE_BACKFILL_RPC_URL, chain: "base" };

if (!Object.keys(LANES).length) {
  console.error(
    "no upstream to forward to — set ALCHEMY_URL (and BASE_RPC_URL, ENS_RPC_URL, SEPOLIA_RPC_URL) or UPSTREAM",
  );
  process.exit(1);
}

// ── what may be cached ──────────────────────────────────────────────────────

/** Methods whose answer is not a function of (chain, params) at a block. */
const NEVER_CACHE = new Set([
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_estimateGas",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_syncing",
  "eth_subscribe",
  "eth_unsubscribe",
  "eth_newFilter",
  "eth_newBlockFilter",
  "eth_newPendingTransactionFilter",
  "eth_getFilterChanges",
  "eth_getFilterLogs",
  "eth_uninstallFilter",
  "net_peerCount",
  "eth_mining",
  "eth_hashrate",
]);

/** The tags pinned for the run. "finalized" and "safe" are pinned too, at or
 *  below the latest pin: left live, a run older than the finality lag answers a
 *  finalized block ABOVE the pinned head, and a reader that cuts its tail at
 *  finalized then refuses the tail as being ahead of the head it is serving
 *  (the vault timelines, 23 Oct 2026, every warm load swept the chain again).
 *  "earliest" is the genesis block and needs no pin. "pending" is unpinned and
 *  uncached. */
const PINNED_TAGS = ["latest", "finalized", "safe"];
const UNPINNED_TAGS = new Set(["pending"]);

function tagsIn(params) {
  const s = stable(params);
  return PINNED_TAGS.filter((t) => s.includes(`"${t}"`));
}

/** Replace each pinned tag wherever a block tag can sit — a positional string
 *  param, or a `blockTag` / `toBlock` / `fromBlock` / `blockNumber` key in an
 *  object — with its pinned hex. Returns [params, sawUnpinnedTag]. */
function pinParams(params, pinHexByTag) {
  let unpinned = false;
  const walk = (v, key) => {
    if (typeof v === "string") {
      if (pinHexByTag[v] !== undefined) return pinHexByTag[v];
      if (v === "earliest") return "0x0";
      if (UNPINNED_TAGS.has(v) && (key === undefined || /block/i.test(key))) unpinned = true;
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, undefined));
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v)) out[k] = walk(v[k], k);
      return out;
    }
    return v;
  };
  return [walk(params, undefined), unpinned];
}

/** JSON with object keys sorted, so two spellings of one call share a key. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

function cachePath(chain, method, params) {
  const hash = createHash("sha256").update(stable(params)).digest("hex");
  return join(CACHE_DIR, chain, method.replace(/[^\w]/g, "_"), hash.slice(0, 2), `${hash}.json`);
}

function readCache(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8")).result;
  } catch {
    return undefined;
  }
}

function writeCache(path, method, params, result) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ method, params, result }));
  renameSync(tmp, path);
}

// ── the pins ────────────────────────────────────────────────────────────────

/** chain → hex block. Taken on the first head read of the run, or carried over
 *  from the last run with RPC_PIN=keep. */
const pins = {};
if (KEEP_PINS) {
  try {
    Object.assign(pins, JSON.parse(readFileSync(PINS_FILE, "utf8")));
  } catch {
    /* no pins yet: the first head read takes them */
  }
}

function savePins() {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(PINS_FILE, JSON.stringify(pins, null, 2));
  } catch {
    /* a cache that cannot be written is a cold run, nothing worse */
  }
}

const pinning = new Map(); // pin key → Promise<hex>, so a burst of first reads pins once

/** The pin for a tag on a lane's chain: `pins[chain]` is the latest block,
 *  `pins["<chain>:finalized"]` and `pins["<chain>:safe"]` the other two, each
 *  taken once on first use and clamped to the latest pin. */
async function pinFor(lane, tag = "latest") {
  const { chain, upstream } = lane;
  const key = tag === "latest" ? chain : `${chain}:${tag}`;
  if (pins[key]) return pins[key];
  if (!pinning.has(key)) {
    pinning.set(
      key,
      (async () => {
        const latest = tag === "latest" ? null : await pinFor(lane, "latest");
        const body =
          tag === "latest"
            ? { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }
            : { jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: [tag, false] };
        count(lane, "upstream", body.method);
        const { status, json } = await forward(upstream, body);
        let hex = tag === "latest" ? json?.result : json?.result?.number;
        if (status !== 200 || typeof hex !== "string" || !/^0x[0-9a-f]+$/i.test(hex)) {
          pinning.delete(key);
          throw new Error(
            `${body.method} ${tag} on ${chain} answered ${status}: ${JSON.stringify(json).slice(0, 200)}`,
          );
        }
        if (latest && parseInt(hex, 16) > parseInt(latest, 16)) hex = latest;
        pins[key] = hex;
        savePins();
        if (!QUIET) console.log(`· ${chain} ${tag} pinned at ${hex} (${parseInt(hex, 16)})`);
        return hex;
      })(),
    );
  }
  return pinning.get(key);
}

// ── counting ────────────────────────────────────────────────────────────────

const counters = {};
function laneCounters(name) {
  return (counters[name] ??= {
    requests: 0,
    calls: 0,
    replayed: 0,
    pinned: 0,
    upstream: 0,
    cached: 0,
    errors: 0,
    byMethod: {},
  });
}
/** `upstream` is every call sent to the real endpoint, whatever came back:
 *  that is what the key is charged for. `cached` is the subset whose answer
 *  was written for next time. */
function count(lane, kind, method) {
  const c = laneCounters(lane.name);
  c[kind] += 1;
  if (kind === "upstream") c.byMethod[method] = (c.byMethod[method] ?? 0) + 1;
}

function totals() {
  const t = { calls: 0, replayed: 0, pinned: 0, upstream: 0, cached: 0, errors: 0 };
  for (const c of Object.values(counters)) for (const k of Object.keys(t)) t[k] += c[k];
  return t;
}

function summaryLines() {
  const t = totals();
  const lines = [
    `rpc-counting-proxy: ${t.calls} calls — ${t.replayed} replayed from cache, ${t.pinned} answered from the pin, ` +
      `${t.upstream} sent upstream (${t.cached} of them cached for next time), ${t.errors} upstream errors`,
  ];
  for (const [name, c] of Object.entries(counters)) {
    const top = Object.entries(c.byMethod)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([m, n]) => `${m} ${n}`)
      .join(", ");
    lines.push(`  ${name}: ${c.calls} calls, ${c.upstream} upstream${top ? ` (${top})` : ""}`);
  }
  const pinned = Object.entries(pins).map(([c, h]) => `${c} ${parseInt(h, 16)}`);
  if (pinned.length) lines.push(`  pins: ${pinned.join(", ")}`);
  return lines;
}

// ── forwarding ──────────────────────────────────────────────────────────────

async function forward(upstream, body) {
  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
}

/** One JSON-RPC call through the cache. Returns the response object for it,
 *  or a marker that it must go upstream (with the pinned params to send). */
async function resolveOne(lane, call) {
  const { method, params = [], id, jsonrpc = "2.0" } = call;
  lane.counters.calls += 1;

  if (typeof method !== "string") return { response: call };

  if (method === "eth_blockNumber") {
    const hex = await pinFor(lane);
    count(lane, "pinned", method);
    return { response: { jsonrpc, id, result: hex } };
  }

  const pinHexByTag = {};
  for (const tag of tagsIn(params)) pinHexByTag[tag] = await pinFor(lane, tag);
  const [pinnedParams, unpinned] = pinParams(params, pinHexByTag);

  if (NEVER_CACHE.has(method) || unpinned) return { upstream: { jsonrpc, id, method, params: pinnedParams } };

  const path = cachePath(lane.chain, method, pinnedParams);
  const hit = readCache(path);
  if (hit !== undefined) {
    count(lane, "replayed", method);
    return { response: { jsonrpc, id, result: hit } };
  }
  return { upstream: { jsonrpc, id, method, params: pinnedParams }, path };
}

async function handle(lane, body, res) {
  const batch = Array.isArray(body);
  const calls = batch ? body : [body];
  lane.counters.requests += 1;

  let resolved;
  try {
    resolved = await Promise.all(calls.map((c) => resolveOne(lane, c)));
  } catch (err) {
    // The pin could not be taken: the key is refusing, or the lane is down.
    // Answer as the upstream would have, so viem's own handling applies.
    lane.counters.errors += 1;
    const msg = String(err?.message ?? err);
    const status = /answered 429/.test(msg) ? 429 : 502;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  const toSend = resolved.filter((r) => r.upstream).map((r) => r.upstream);
  for (const c of toSend) count(lane, "upstream", c.method);
  const answers = new Map();
  if (toSend.length) {
    let up;
    try {
      up = await forward(lane.upstream, batch ? toSend : toSend[0]);
    } catch (err) {
      lane.counters.errors += 1;
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return;
    }
    if (up.status !== 200 || up.json === undefined) {
      // A refusal or a non-JSON answer is handed back whole, uncached, with
      // its status: the server's retry and rate-limit handling read it.
      lane.counters.errors += 1;
      res.writeHead(up.status, { "content-type": "application/json" });
      res.end(up.text);
      return;
    }
    for (const item of Array.isArray(up.json) ? up.json : [up.json]) answers.set(item?.id, item);
    for (const r of resolved) {
      if (!r.upstream) continue;
      const item = answers.get(r.upstream.id);
      if (!item) continue;
      if (item.error !== undefined) {
        lane.counters.errors += 1;
        continue;
      }
      if (r.path && item.result !== null && item.result !== undefined) {
        try {
          writeCache(r.path, r.upstream.method, r.upstream.params, item.result);
          count(lane, "cached", r.upstream.method);
        } catch {
          /* unwritable cache: still answered */
        }
      }
    }
  }

  const out = resolved.map((r) =>
    r.response
      ? r.response
      : (answers.get(r.upstream.id) ?? {
          jsonrpc: "2.0",
          id: r.upstream.id,
          error: { code: -32603, message: "no answer from upstream" },
        }),
  );
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(batch ? out : out[0]));
}

// ── the server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET") {
    const json = (o) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (url.pathname === "/__count")
      return json({
        proxy: "rpc-counting-proxy",
        lanes: Object.keys(LANES),
        cacheDir: CACHE_DIR,
        pins,
        totals: totals(),
        lanesCount: counters,
      });
    if (url.pathname === "/__pins") return json(pins);
    if (url.pathname === "/__reset") {
      for (const k of Object.keys(counters)) delete counters[k];
      return json({ reset: true });
    }
    res.writeHead(404);
    return res.end();
  }

  const name = url.pathname.replace(/^\/+|\/+$/g, "") || (LANES.upstream ? "upstream" : "ethereum");
  const lane = LANES[name];
  if (!lane) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: `no lane "${name}" — lanes: ${Object.keys(LANES).join(", ")}` }));
  }
  lane.name = name;
  lane.counters = laneCounters(name);

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end('{"error":"body is not JSON"}');
    }
    handle(lane, body, res).catch((err) => {
      lane.counters.errors += 1;
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    });
  });
});

server.on("error", (err) => {
  console.error(`rpc-counting-proxy could not listen on :${PORT} — ${err.message}`);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `rpc-counting-proxy listening on http://127.0.0.1:${PORT} — lanes ${Object.keys(LANES).join(", ")}; cache ${CACHE_DIR}${KEEP_PINS ? "; pins kept from the last run" : ""}`,
  );
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const line of summaryLines()) console.log(line);
    savePins();
    process.exit(0);
  });
}
