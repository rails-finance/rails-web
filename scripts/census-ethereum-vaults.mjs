#!/usr/bin/env node
/**
 * Who holds the shares of Aave's Ethereum vault layer: wallets, or wrappers?
 * ----------------------------------------------------------------------------
 * The Ethereum twin of `scripts/probe-morpho-base-vault-holders.mjs`, run once
 * over ALL eighteen vaults in the catalogue the Aave-vaults-on-Ethereum plan
 * (§2/§4A) pins for Ethereum's Aave vault layer — the layer
 * `lib/sources/chain/aave-ethereum-vault-directory.ts` serves:
 * sGHO (1), the four Umbrella stake tokens, and the thirteen `StataTokenV2`
 * wrappers. Unlike the Base probe this is a full census, not a study-vault
 * probe with an optional `--compare` — every vault in the catalogue is swept.
 *
 * Run:
 *   node scripts/census-ethereum-vaults.mjs [--vault=0x…]
 * `--vault` restricts the run to one address (for development); the default
 * is every vault the catalogue discovers on chain.
 *
 * ── WHAT CHANGED FROM §1 OF THE PLAN, AND WHY THIS SCRIPT CAN RUN AT ALL ──────
 * The plan's §1 originally read Ethereum as having no wide-range `eth_getLogs`
 * lane (Alchemy free tier caps it at ten blocks) — since corrected in the same
 * file (the "⚠️ CORRECTION to §1" section, appended 2026-09-06): the existing
 * `.env.local` key that already serves Base's wide sweeps
 * (`mainnet.gateway.tenderly.co`, same account) also answers Ethereum, at
 * millions of blocks per call, and no purchase was needed. `ETHEREUM_LOGS_RPC_URL`
 * now names that lane in `.env.local`. It is a LOCAL-ONLY key — the plan is
 * explicit that it must not be added to Vercel, so this script falls back to
 * `ALCHEMY_URL` when it is absent, exactly like every other one-off probe in
 * this repo that must not assume a lane the serving path does not carry.
 *
 * ── THE CATALOGUE — DISCOVERED ON CHAIN, NOT TRANSCRIBED FROM THE PLAN ────────
 * Rather than copy the plan's own pinned address table (which truncates every
 * `asset` address for readability and is therefore not a safe copy source),
 * this script re-derives the 18-vault catalogue itself, the same way the
 * serving loader `lib/sources/chain/aave-ethereum-vault-directory.ts` does
 * (there is no generated catalogue — the roster is a chain read at the page's
 * own block): `UMBRELLA.getStkTokens()` (4), `STATA_FACTORY.getStataTokens()`
 * (13), plus the one named `GhoEthereum.SGHO` constant. All three are
 * `eth_call`s at the pinned block. `name()/symbol()/decimals()/asset()` are
 * then read per vault rather than hard-coded, so a wrong transcription of an
 * asset address cannot leak into this script's output — it is chain-derived
 * or nothing.
 *
 * ── WHAT IS MEASURED, PER VAULT ───────────────────────────────────────────────
 *  1. Pin ONE block near head for the whole run (recorded in every output).
 *  2. Sweep the vault's ERC-20 `Transfer` log from a conservative floor block
 *     to the pin over the LOGS lane, collect every distinct non-zero
 *     from/to address, read `balanceOf` for all of them through Multicall3 at
 *     the pinned block, keep the non-zero ones, and PROVE the sweep is
 *     complete by asserting Σ balances == `totalSupply()` exactly, in wei.
 *  3. Classify every non-zero holder by its bytecode/storage at the pinned
 *     block, in the SAME precedence and vocabulary as this repo's own
 *     production reader (`lib/sources/chain/morpho-base-vault.ts`
 *     `readHolderShape`, ported rather than reinvented): `eoa`,
 *     `delegated-account` (EIP-7702, delegate extracted from the code),
 *     `aave-vault` (the holder IS one of this census's own 18 catalogued
 *     vaults — e.g. a stake token holding its own stata asset), `safe`
 *     (Gnosis/Safe proxy — EIP-1167 clone of a known singleton, OR storage
 *     slot 0 matching one), `erc4626` (answers `asset()` AND `totalSupply()`;
 *     `assetIsVaultShares` is the RE-WRAPPER signal — its asset IS this
 *     vault's own share token), `erc1967-proxy` (implementation slot),
 *     `eip1167-proxy` (minimal-proxy bytecode, implementation embedded), or
 *     `contract` (has code, none of the above answered anything more).
 *  4. For a small, fixed number of featured holders per vault (top 3, one
 *     stake token's cooldown pair), read `maxRedeem(holder)` — 0 means "in
 *     cooldown", not "unread"; the fixture the plan's §3.3 rests on.
 *  5. Name every distinct delegate / proxy implementation seen across the
 *     whole census via the Etherscan V2 API (chain 1, `getsourcecode`,
 *     3 calls/s) with a Sourcify check as the second source, caching so each
 *     address is looked up once regardless of how many vaults or holders
 *     share it.
 *
 * ── TRAPS PORTED FROM THE BASE PROBE, MEASURED THERE, ASSUMED LIVE HERE ───────
 *  • A metered/gatewayed `eth_getLogs` lane caps by RESPONSE SIZE, not block
 *    count, and may say so in the error with a suggested narrower range — a
 *    hint is a proposal to retry, not a promise, so the sweep below keeps
 *    shrinking until a range actually answers, and grows back up on success.
 *    Every returned log's `blockNumber` is asserted INSIDE the asked range
 *    before it is accepted — a silently short 200 (the HyperRPC trap: 37 of
 *    120 logs, 200 OK, no error) cannot pass as complete here.
 *  • Multicall3 batches, `getCode` and `getStorageAt` are PACED, never fired
 *    unbounded-concurrent, or a free/shared lane's per-second throttle
 *    escalates into account-level errors past viem's own retries.
 *  • THE CLASSIFIER PROVES ITSELF FIRST. Before any vault is probed it reads
 *    code at the pinned block for `0x…dEaD` (must read `eoa`) and for the
 *    Umbrella contract itself (must read `erc1967-proxy` whose implementation
 *    equals the address-book's own `UMBRELLA_IMPL` constant, §4A) — a positive
 *    control against a KNOWN pinned answer, not just a syntax check.
 *
 * Needs (in `.env.local`, read, never printed — only presence is logged):
 * `ALCHEMY_URL` (eth_call/eth_getCode/eth_getStorageAt/Multicall3),
 * `ETHEREUM_LOGS_RPC_URL` (wide `eth_getLogs`; falls back to `ALCHEMY_URL`
 * when absent — this key is local-only, never assumed on a server),
 * `ETHERSCAN_API_KEY` (naming pass, optional — the run degrades to unnamed
 * addresses without it, never fails).
 *
 * Output — one JSON per vault plus an aggregate, to the session scratchpad
 * (never committed; this file is the deliverable, not its output):
 * `eth-census/<vault>.json`, `eth-census/aggregate.json`,
 * `eth-census/README.md`, `eth-census/fixtures.md`.
 */

import { createPublicClient, http, parseAbi, keccak256 } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = process.env.OUT_DIR ?? path.join(os.tmpdir(), "rails-eth-census");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1 */
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const SLOT_ZERO = "0x" + "0".repeat(64);
/** Standard EIP-1167 minimal-proxy runtime bytecode, implementation embedded at [10,30). */
const EIP1167_RE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i;
/** EIP-7702 delegation indicator: code of EXACTLY 23 bytes, `0xef0100` + the
 *  20-byte delegate, anchored at both ends. */
const EIP7702_RE = /^0xef0100([0-9a-f]{40})$/i;

// Chain-1 Safe singletons, `safe-global/safe-deployments` (fetched 2026-09-06):
// versions 1.1.1/1.2.0/1.3.0/1.3.0-L2/1.4.1/1.4.1-L2, canonical AND eip155
// deployments where the two differ (a Safe deployed through the pre-CREATE2
// "eip155" factory lands at a different address than the canonical CREATE2
// one, on the SAME chain, at the SAME version). All of these are deployed
// deterministically and so read identically on Base and Ethereum — this repo's
// existing Base table already carries the four canonical rows; the rest are
// added here because Ethereum's Safe population is far older and more varied.
const SAFE_SINGLETONS = {
  "0x34cfac646f301356faa8b21e94227e3583fe3f5f": "1.1.1",
  "0x6851d6fdfafd08c0295c392436245e5bc78b0185": "1.2.0",
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "1.3.0",
  "0x69f4d1788e39c87893c980c06edf4b7f686e2938": "1.3.0 (eip155)",
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e": "1.3.0 L2",
  "0xfb1bffc9d739b8d520daf37df666da4c687191ea": "1.3.0 L2 (eip155)",
  "0x41675c099f32341bf84bfc5382af534df5c7461a": "1.4.1",
  "0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "1.4.1 L2",
};

// A fast-path label for a few addresses the plan names explicitly. NOT trusted
// on its own — every distinct delegate/implementation this census finds is
// still looked up through Etherscan/Sourcify below; this table only saves an
// API round trip when the answer is already known.
const KNOWN_NAMES = {
  "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b": "MetaMask EIP7702StatelessDeleGator",
  "0x000000005c84f8fd50b21cac312528a64437030e": "Uniswap CaliburEntry",
  "0x000000009b1d0af20d8c6d0a44e162d11f9b8f00": "Uniswap CaliburEntry",
  "0x929e21d24d3f2a529621adc248d227012b72646d": "Aave UMBRELLA_IMPL (address-book constant)",
  "0x75e8ac0c063b6966e2a9954adedf39bde9370197": "Aave UMBRELLA_STAKE_TOKEN_IMPL (address-book constant)",
  "0x487c2c53c0866f0a73ae317bd1a28f63adcd9ad1": "Aave StataTokenV2 shared implementation",
};

// The two on-chain enumerators plus the one named constant — the catalogue is
// DISCOVERED, never transcribed. Addresses from `rails-ops`
// `plans/aave-vaults-ethereum.md` §4A (the address-book constants themselves,
// not the plan's own abbreviated read-out of them).
const SGHO = "0xE1753F2e00940cC31213dd92013cF019DFE4ca1d";
const UMBRELLA = "0xD400fc38ED4732893174325693a63C30ee3881a8";
const STATA_FACTORY = "0xCb0b5cA20b6C5C02A9A3B2cE433650768eD2974F";
const UMBRELLA_IMPL_EXPECTED = "0x929e21d24d3f2a529621adc248d227012b72646d";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtN = (n) => Number(n).toLocaleString("en-US");
const lc = (a) => (a ? a.toLowerCase() : a);

// ── env ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const k = line.slice(0, line.indexOf("=")).trim();
    let v = line.slice(line.indexOf("=") + 1).trim();
    // One key in this repo's .env.local is double-quoted (ETHEREUM_LOGS_RPC_URL);
    // the rest are bare. Strip a matching pair of quotes defensively either way.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");
  const logsUrl = env.ETHEREUM_LOGS_RPC_URL || env.ALCHEMY_URL;
  console.error(
    `env: ALCHEMY_URL set, ETHEREUM_LOGS_RPC_URL ${env.ETHEREUM_LOGS_RPC_URL ? "set" : "MISSING — falling back to ALCHEMY_URL"}, ETHERSCAN_API_KEY ${env.ETHERSCAN_API_KEY ? "set" : "MISSING — naming pass will run unnamed"}`,
  );
  return { ...env, LOGS_URL: logsUrl };
}

// ── the wide-range lane: small-fixed-leaf, RATE-LIMIT-AWARE eth_getLogs sweep ──
// This is NOT the Base probe's adaptive-doubling sweep, ported unchanged — it
// started that way and was rewritten twice after this script's own dry runs
// caught two failure modes the Base probe never needed to defend against.
//
// MEASURED ON A REAL RUN (2026-09-06, waEthUSDC, this exact gateway):
//  1. `eth_getLogs` for [22,000,000, 25,920,303] (≈3.92M blocks) returned
//     HTTP 200 with a `result` of exactly 2 logs — no error, no shrink hint —
//     and repeating the IDENTICAL request moments later returned 0. The true
//     log count in that range is in the tens of thousands (a 2,000,000-block
//     sub-range of it alone answered 41,490). This is the plan's own "a 200
//     with a short result is the trap the Base census hit", and
//     non-deterministic on top: the same request disagreed with itself.
//  2. A first fix (double-fetch every leaf, split on disagreement) drove
//     enough concurrent recursive requests into a DENSE region to trip
//     `{"code":-32005,"message":"rate limit exceeded"}` — a THIRD failure
//     shape, distinct from both "too many results" (has a shrink hint) and a
//     transient HTTP error. Treating a rate limit as "the range is too wide"
//     (shrinking it) does not fix a rate limit and burns the request budget
//     on needless splitting.
//
// The defence actually shipped: requests are kept small (`LEAF_BLOCKS`, far
// under the ~50,000-result ceiling — the densest measured million-block
// window here was ~27,000 logs) and PACED (one leaf in flight at a time, with
// a gap). A rate-limit error backs off and retries the SAME range, exactly
// like a transient HTTP failure — it is never treated as a cue to shrink.
// Completeness is NOT asserted at the sweep layer at all here: the real proof
// is the vault-level invariant `probeVault` already computes (Σ balances ==
// `totalSupply()`, wei-exact), and `probeVault` retries the WHOLE sweep, at a
// smaller leaf size, before giving up on a vault — see the retry loop there.
const LEAF_BLOCKS = 100_000;
let logRequestCount = 0;

async function postLogs(url, params) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  try {
    logRequestCount++;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params }),
      signal: ac.signal,
    });
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j.error || j.result !== undefined) return j;
    } catch {
      // not JSON — fall through to the HTTP-status failure below
    }
    return { httpError: res.status, body: text.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

function parseHintTo(message) {
  const m = /\[\s*0x([0-9a-fA-F]+)\s*,\s*0x([0-9a-fA-F]+)\s*\]/.exec(message ?? "");
  return m ? parseInt(m[2], 16) : null;
}

function isRateLimitError(error) {
  return error?.code === -32005 || /rate limit/i.test(error?.message ?? "");
}

/** One logical fetch of EXACTLY [from,to]. A rate-limit error backs off and
 *  retries the SAME range (like a transient HTTP failure) — it is never a cue
 *  to shrink. An explicit "too wide"/"too many results" error follows the
 *  gateway's own hint (or halves) and recurses, concatenating — the ONLY case
 *  that changes the requested range. Every log is range-checked before being
 *  accepted, so a silently out-of-range log cannot pass as in-range. */
async function fetchExact(url, address, topic, from, to, depth = 0) {
  if (depth > 60) throw new Error(`getLogs: recursion too deep at [${from},${to}] — refusing to keep splitting`);
  for (let attempt = 1; ; attempt++) {
    const res = await postLogs(url, [
      { address, topics: [topic], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` },
    ]);
    if (res.httpError) {
      if (attempt > 8)
        throw new Error(`getLogs: HTTP ${res.httpError} persisted at [${from},${to}] — body: ${res.body}`);
      await sleep(Math.min(800 * attempt, 6000));
      continue;
    }
    if (res.error && isRateLimitError(res.error)) {
      if (attempt > 10) throw new Error(`getLogs: rate limit persisted at [${from},${to}] after ${attempt} attempts`);
      await sleep(Math.min(500 * attempt, 8000));
      continue;
    }
    if (res.error) {
      if (from === to)
        throw new Error(`getLogs: single block ${from} still errors: ${JSON.stringify(res.error).slice(0, 300)}`);
      const hintTo = parseHintTo(res.error.message);
      const mid = hintTo !== null && hintTo >= from && hintTo < to ? hintTo : from + Math.floor((to - from) / 2);
      const left = await fetchExact(url, address, topic, from, mid, depth + 1);
      await sleep(80);
      const right = await fetchExact(url, address, topic, mid + 1, to, depth + 1);
      return left.concat(right);
    }
    if (!Array.isArray(res.result)) throw new Error(`getLogs: non-array result at [${from},${to}]`);
    for (const log of res.result) {
      const bn = parseInt(log.blockNumber, 16);
      if (bn < from || bn > to)
        throw new Error(`getLogs: log blockNumber ${bn} outside asked range [${from},${to}] — refusing`);
    }
    return res.result;
  }
}

async function sweepLogs(url, address, topic, fromBlock, toBlock, leafBlocks = LEAF_BLOCKS, paceMs = 150) {
  const logs = [];
  let cur = fromBlock;
  while (cur <= toBlock) {
    const hi = Math.min(cur + leafBlocks - 1, toBlock);
    const leafLogs = await fetchExact(url, address, topic, cur, hi);
    logs.push(...leafLogs);
    cur = hi + 1;
    const pct = fromBlock === toBlock ? "100.0" : (((cur - fromBlock) / (toBlock - fromBlock + 1)) * 100).toFixed(1);
    process.stderr.write(
      `\r    sweeping ${pct}% (block ${fmtN(cur)}, ${fmtN(logs.length)} logs so far, ${fmtN(logRequestCount)} requests)   `,
    );
    await sleep(paceMs);
  }
  process.stderr.write("\n");
  return logs;
}

// ── paced, retried Multicall3 / getCode / getStorageAt over ALCHEMY_URL ─────
async function pacedMulticall(client, contracts, blockNumber, { size = 500, gapMs = 300, label = "multicall" } = {}) {
  const out = [];
  for (let i = 0; i < contracts.length; i += size) {
    const slice = contracts.slice(i, i + size);
    const res = await client.multicall({ contracts: slice, allowFailure: true, batchSize: 0, blockNumber });
    out.push(...res);
    if (contracts.length > size)
      process.stderr.write(`\r    ${label} ${fmtN(Math.min(i + size, contracts.length))}/${fmtN(contracts.length)}`);
    await sleep(gapMs);
  }
  if (contracts.length > size) process.stderr.write("\n");
  return out;
}

async function pacedGetCode(client, addresses, blockNumber, { chunk = 100, gapMs = 250 } = {}) {
  const out = new Map();
  for (let i = 0; i < addresses.length; i += chunk) {
    const slice = addresses.slice(i, i + chunk);
    const codes = await Promise.all(slice.map((a) => client.getCode({ address: a, blockNumber })));
    slice.forEach((a, j) => out.set(a, codes[j] ?? "0x"));
    if (addresses.length > chunk)
      process.stderr.write(`\r    getCode ${fmtN(Math.min(i + chunk, addresses.length))}/${fmtN(addresses.length)}`);
    await sleep(gapMs);
  }
  if (addresses.length > chunk) process.stderr.write("\n");
  return out;
}

async function pacedGetStorage(client, addresses, slot, blockNumber, { chunk = 100, gapMs = 250 } = {}) {
  const out = new Map();
  for (let i = 0; i < addresses.length; i += chunk) {
    const slice = addresses.slice(i, i + chunk);
    const vals = await Promise.all(slice.map((a) => client.getStorageAt({ address: a, slot, blockNumber })));
    slice.forEach((a, j) => out.set(a, vals[j] ?? SLOT_ZERO));
    await sleep(gapMs);
  }
  return out;
}

// ── ABIs ─────────────────────────────────────────────────────────────────
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const ASSET_ABI = parseAbi(["function asset() view returns (address)"]);
const MAX_REDEEM_ABI = parseAbi(["function maxRedeem(address) view returns (uint256)"]);
const UMBRELLA_ABI = parseAbi(["function getStkTokens() view returns (address[])"]);
const STATA_FACTORY_ABI = parseAbi(["function getStataTokens() view returns (address[])"]);

// ── classification, ported in precedence/vocabulary from
//    lib/sources/chain/morpho-base-vault.ts `readHolderShape` ──────────────
function last20(hex32) {
  return "0x" + hex32.slice(-40).toLowerCase();
}

/** The fast branches that need only the code itself — no extra read. */
function classifyFromCode(code, vaultSet) {
  if (!code || code === "0x") return { kind: "eoa", codeSize: 0 };
  const delegation = EIP7702_RE.exec(code);
  if (delegation) return { kind: "delegated-account", codeSize: 23, delegate: "0x" + delegation[1].toLowerCase() };
  const minimal = EIP1167_RE.exec(code);
  const minimalImpl = minimal ? "0x" + minimal[1].toLowerCase() : null;
  const codeSize = (code.length - 2) / 2;
  if (minimalImpl && SAFE_SINGLETONS[minimalImpl])
    return {
      kind: "safe",
      codeSize,
      singleton: minimalImpl,
      version: SAFE_SINGLETONS[minimalImpl],
      evidence: "EIP-1167 code",
    };
  return { kind: "needs-deeper-look", codeSize, minimalImpl, codeHashPrefix: keccak256(code).slice(0, 10) };
}

/** The slow branch: given the code-level partial result plus a multicall
 *  (name/symbol/asset/totalSupply) and two storage reads (slot 0, the EIP-1967
 *  slot), finish the classification. Same order as production: catalogue
 *  self-reference, then Safe-by-slot-0, then ERC-4626, then ERC-1967, then
 *  the EIP-1167 code (already known, just not a Safe), then a bare contract. */
function classifyDeep(partial, { vaultAddress, vaultAsset, name, symbol, asset, totalSupplyOk, slotZero, implSlot }) {
  // NOTE: catalogue self-reference ("this holder IS one of our 18 vaults") is
  // decided by the caller BEFORE classifyFromCode/classifyDeep even run — see
  // probeVault's `catalogueSet.has(a)` branch — so this function never needs
  // the catalogue itself.
  if (slotZero && slotZero !== SLOT_ZERO) {
    const candidate = last20(slotZero);
    if (SAFE_SINGLETONS[candidate])
      return {
        kind: "safe",
        codeSize: partial.codeSize,
        singleton: candidate,
        version: SAFE_SINGLETONS[candidate],
        evidence: "storage slot 0",
      };
  }
  if (asset && asset !== ZERO_ADDRESS && totalSupplyOk) {
    return {
      kind: "erc4626",
      codeSize: partial.codeSize,
      name: name ?? null,
      symbol: symbol ?? null,
      asset,
      assetIsVaultShares: asset === vaultAddress,
      assetIsVaultAsset: vaultAsset ? asset === vaultAsset : false,
      codeHashPrefix: partial.codeHashPrefix,
    };
  }
  if (implSlot && implSlot !== SLOT_ZERO) {
    return {
      kind: "erc1967-proxy",
      codeSize: partial.codeSize,
      implementation: last20(implSlot),
      codeHashPrefix: partial.codeHashPrefix,
    };
  }
  if (partial.minimalImpl) {
    return {
      kind: "eip1167-proxy",
      codeSize: partial.codeSize,
      implementation: partial.minimalImpl,
      codeHashPrefix: partial.codeHashPrefix,
    };
  }
  return {
    kind: "contract",
    codeSize: partial.codeSize,
    name: name ?? null,
    symbol: symbol ?? null,
    codeHashPrefix: partial.codeHashPrefix,
  };
}

// ── self-test: prove the classifier discriminates, against a KNOWN pinned answer ──
async function selfTestClassifier(client, pinned) {
  const [deadCode, umbrellaCode] = await Promise.all([
    client.getCode({ address: DEAD_ADDRESS, blockNumber: pinned }),
    client.getCode({ address: UMBRELLA, blockNumber: pinned }),
  ]);
  const deadShape = classifyFromCode(deadCode, new Set());
  if (deadShape.kind !== "eoa")
    throw new Error(`self-test FAILED: 0x…dEaD classified as ${deadShape.kind}, expected eoa`);

  const umbrellaPartial = classifyFromCode(umbrellaCode, new Set());
  let umbrellaImpl = null;
  if (umbrellaPartial.kind === "needs-deeper-look") {
    const implSlot = await client.getStorageAt({ address: UMBRELLA, slot: EIP1967_IMPL_SLOT, blockNumber: pinned });
    if (implSlot && implSlot !== SLOT_ZERO) umbrellaImpl = last20(implSlot);
  } else if (umbrellaPartial.kind === "safe") {
    umbrellaImpl = umbrellaPartial.singleton;
  }
  console.error(`self-test @ block ${fmtN(pinned)}: 0x…dEaD -> eoa; Umbrella -> implementation ${umbrellaImpl}`);
  if (umbrellaImpl !== UMBRELLA_IMPL_EXPECTED)
    throw new Error(
      `self-test FAILED: Umbrella's ERC-1967 implementation read ${umbrellaImpl}, expected the address-book's UMBRELLA_IMPL ${UMBRELLA_IMPL_EXPECTED}`,
    );

  const fakeDelegate = "0x00112233445566778899aabbccddeeff00112233";
  const delegated = classifyFromCode("0xef0100" + fakeDelegate.slice(2), new Set());
  if (delegated.kind !== "delegated-account" || delegated.delegate !== fakeDelegate)
    throw new Error(`self-test FAILED: 0xef0100||delegate classified as ${delegated.kind} (${delegated.delegate})`);
  const notDelegated = classifyFromCode("0xef0200" + fakeDelegate.slice(2), new Set());
  if (notDelegated.kind === "delegated-account")
    throw new Error("self-test FAILED: 23 bytes without the 0xef0100 prefix read as a delegation");

  console.error(
    "self-test PASSED — eoa/erc1967-proxy (against a KNOWN pinned implementation) and EIP-7702 all discriminate\n",
  );
}

// ── the catalogue: discovered on chain, not transcribed ─────────────────────
async function discoverCatalogue(client, pinned) {
  const [stkTokens, stataTokens] = await Promise.all([
    client.readContract({ address: UMBRELLA, abi: UMBRELLA_ABI, functionName: "getStkTokens", blockNumber: pinned }),
    client.readContract({
      address: STATA_FACTORY,
      abi: STATA_FACTORY_ABI,
      functionName: "getStataTokens",
      blockNumber: pinned,
    }),
  ]);
  const rows = [
    { address: lc(SGHO), family: "sgho" },
    ...stkTokens.map((a) => ({ address: lc(a), family: "umbrella-stake" })),
    ...stataTokens.map((a) => ({ address: lc(a), family: "stata" })),
  ];
  console.error(
    `catalogue discovered on chain @ block ${fmtN(pinned)}: 1 sGHO + ${stkTokens.length} Umbrella stake tokens + ${stataTokens.length} stata tokens = ${rows.length}`,
  );
  if (rows.length !== 18)
    console.error(
      `⚠️  catalogue size ${rows.length} != 18 the plan pinned — a shape change since 2026-09-06, not a script bug`,
    );

  const meta = await pacedMulticall(
    client,
    rows.flatMap((r) => [
      { address: r.address, abi: ERC20_ABI, functionName: "name" },
      { address: r.address, abi: ERC20_ABI, functionName: "symbol" },
      { address: r.address, abi: ERC20_ABI, functionName: "decimals" },
      { address: r.address, abi: ASSET_ABI, functionName: "asset" },
    ]),
    pinned,
    { label: "catalogue meta" },
  );
  rows.forEach((r, i) => {
    const [nameR, symR, decR, assetR] = meta.slice(i * 4, i * 4 + 4);
    r.name = nameR.status === "success" ? nameR.result : null;
    r.symbol = symR.status === "success" ? symR.result : null;
    r.decimals = decR.status === "success" ? decR.result : null;
    r.asset = assetR.status === "success" ? lc(assetR.result) : null;
  });
  return rows;
}

// ── naming pass: Etherscan V2 API primary, Sourcify secondary, cached ───────
function makeNamer(env) {
  const cache = new Map();
  let lastCall = 0;
  async function paceEtherscan() {
    const gap = 340; // 3 calls/s ceiling -> ~340ms between calls
    const wait = lastCall + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
  }
  return async function nameAddress(address) {
    address = lc(address);
    if (cache.has(address)) return cache.get(address);
    if (KNOWN_NAMES[address]) {
      cache.set(address, { name: KNOWN_NAMES[address], source: "plan-known" });
      return cache.get(address);
    }
    let result = { name: null, source: null };
    if (env.ETHERSCAN_API_KEY) {
      try {
        await paceEtherscan();
        const res = await fetch(
          `https://api.etherscan.io/v2/api?chainid=1&module=contract&action=getsourcecode&address=${address}&apikey=${env.ETHERSCAN_API_KEY}`,
        );
        const j = await res.json();
        const row = j?.result?.[0];
        if (row?.ContractName) {
          result = { name: row.ContractName, source: "etherscan" };
          if (row.Proxy === "1" && row.Implementation) result.proxyImplementation = lc(row.Implementation);
        }
      } catch (e) {
        console.error(`  etherscan lookup failed for ${address}: ${e.message}`);
      }
    }
    if (!result.name) {
      try {
        const res = await fetch(`https://sourcify.dev/server/v2/contract/1/${address}?fields=compilation`);
        if (res.ok) {
          const j = await res.json();
          const cn = j?.compilation?.name;
          if (cn) result = { name: cn, source: "sourcify" };
        }
      } catch (e) {
        console.error(`  sourcify lookup failed for ${address}: ${e.message}`);
      }
    }
    cache.set(address, result);
    return result;
  };
}

// ── the probe, one vault ─────────────────────────────────────────────────
async function probeVault(env, client, catalogue, catalogueByAddress, catalogueSet, vault, pinned) {
  const vaultAddress = vault.address;
  console.error(`\n════ ${vault.name ?? vault.symbol ?? vaultAddress} (${vault.family}) ${vaultAddress} ════`);

  const FLOOR = vault.family === "stata" ? 16_000_000n : pinned - 6_000_000n < 0n ? 0n : pinned - 6_000_000n;

  // The sweep's real completeness proof is Σ balances == totalSupply(), not
  // anything the sweep itself asserts about its own logs (§ the sweep's own
  // header — this gateway has been measured returning a silently short 200
  // for a wide, dense range). A failed invariant is NOT immediately fatal
  // here: it retries the WHOLE sweep with a smaller, more paced leaf size —
  // exactly the recovery this repo's other probes use when a gateway proves
  // unreliable at one granularity — before the vault is reported as failed.
  const totalSupply = await client.readContract({
    address: vaultAddress,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    blockNumber: pinned,
  });
  const sweepAttempts = [
    { leaf: 100_000, pace: 150 },
    { leaf: 25_000, pace: 250 },
    { leaf: 5_000, pace: 300 },
  ];
  let logs, addressList, balances, sum, firstMintTx;
  let invariantError = null;
  for (const { leaf, pace } of sweepAttempts) {
    const logsBefore = logRequestCount;
    logs = await sweepLogs(env.LOGS_URL, vaultAddress, TRANSFER_TOPIC, Number(FLOOR), Number(pinned), leaf, pace);
    console.error(
      `  swept ${fmtN(logs.length)} Transfer logs from block ${fmtN(FLOOR)} in ${logRequestCount - logsBefore} getLogs requests (leaf ${fmtN(leaf)})`,
    );

    const mints = logs.filter((l) => "0x" + l.topics[1].slice(26).toLowerCase() === ZERO_ADDRESS);
    firstMintTx = mints.length ? mints[0].transactionHash : null;

    const addresses = new Set();
    for (const log of logs) {
      const from = "0x" + log.topics[1].slice(26).toLowerCase();
      const to = "0x" + log.topics[2].slice(26).toLowerCase();
      if (from !== ZERO_ADDRESS) addresses.add(from);
      if (to !== ZERO_ADDRESS) addresses.add(to);
    }
    addressList = [...addresses];
    console.error(`  ${fmtN(addressList.length)} distinct non-zero-address participants`);

    const balResults = await pacedMulticall(
      client,
      addressList.map((a) => ({ address: vaultAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [a] })),
      pinned,
      { label: "balanceOf" },
    );
    balances = new Map();
    balResults.forEach((r, i) => {
      if (r.status !== "success") throw new Error(`balanceOf(${addressList[i]}) failed: ${r.error}`);
      if (r.result > 0n) balances.set(addressList[i], r.result);
    });

    sum = 0n;
    for (const v of balances.values()) sum += v;
    const sumMatches = sum === totalSupply;
    console.error(
      `  Σ balances ${sum.toString()} vs totalSupply ${totalSupply.toString()} — ${sumMatches ? "MATCH" : `DIFFER by ${(sum - totalSupply).toString()}`}`,
    );
    if (sumMatches) {
      invariantError = null;
      break;
    }
    invariantError = new Error(
      `${vault.symbol}: Σ balances (${sum}) != totalSupply (${totalSupply}), diff ${sum - totalSupply} at leaf ${leaf} — the log sweep is incomplete (or the floor block missed a mint)`,
    );
    console.error(
      `  ⚠️  invariant failed at leaf ${fmtN(leaf)} — retrying the whole sweep at a smaller leaf size before giving up`,
    );
  }
  if (invariantError) throw invariantError;

  const holderAddrs = [...balances.keys()];
  const codeMap = await pacedGetCode(client, holderAddrs, pinned);

  const partials = new Map();
  const needDeep = [];
  for (const a of holderAddrs) {
    if (catalogueSet.has(a)) {
      const row = catalogueByAddress.get(a);
      partials.set(a, {
        kind: "aave-vault",
        codeSize: (codeMap.get(a).length - 2) / 2,
        catalogueFamily: row.family,
        catalogueSymbol: row.symbol,
      });
      continue;
    }
    const partial = classifyFromCode(codeMap.get(a), catalogueSet);
    if (partial.kind === "needs-deeper-look") needDeep.push(a);
    else partials.set(a, partial);
  }

  if (needDeep.length) {
    const [deepCalls, slotZeroMap, implSlotMap] = await Promise.all([
      pacedMulticall(
        client,
        needDeep.flatMap((a) => [
          { address: a, abi: ERC20_ABI, functionName: "name" },
          { address: a, abi: ERC20_ABI, functionName: "symbol" },
          { address: a, abi: ASSET_ABI, functionName: "asset" },
          { address: a, abi: ERC20_ABI, functionName: "totalSupply" },
        ]),
        pinned,
        { label: "holder shape reads" },
      ),
      pacedGetStorage(client, needDeep, SLOT_ZERO, pinned),
      pacedGetStorage(client, needDeep, EIP1967_IMPL_SLOT, pinned),
    ]);
    needDeep.forEach((a, i) => {
      const [nameR, symR, assetR, supplyR] = deepCalls.slice(i * 4, i * 4 + 4);
      const partial = classifyFromCode(codeMap.get(a), catalogueSet); // recompute the fast-branch fields
      const shape = classifyDeep(partial, {
        vaultAddress,
        vaultAsset: vault.asset,
        name: nameR.status === "success" ? nameR.result : null,
        symbol: symR.status === "success" ? symR.result : null,
        asset: assetR.status === "success" ? lc(assetR.result) : null,
        totalSupplyOk: supplyR.status === "success",
        slotZero: slotZeroMap.get(a),
        implSlot: implSlotMap.get(a),
      });
      partials.set(a, shape);
    });
  }

  const holders = holderAddrs
    .map((address) => ({ address, balance: balances.get(address), ...partials.get(address) }))
    .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));

  // ── fixtures: top 3 (prefer one eoa, one contract, the largest), plus
  //    maxRedeem for the same set (0 = cooldown, not "unread") ──
  const largest = holders.slice(0, 1);
  const eoaHolders = holders.filter((h) => h.kind === "eoa");
  const contractHolders = holders.filter((h) => h.kind !== "eoa");
  const fixtureSet = new Map();
  for (const h of [...largest, eoaHolders[0], contractHolders.find((h) => !largest.includes(h))].filter(Boolean)) {
    fixtureSet.set(h.address, h);
  }
  // Top up to 3 fixtures if the preferred picks left room.
  for (const h of holders) {
    if (fixtureSet.size >= 3) break;
    fixtureSet.set(h.address, h);
  }
  const fixtures = [...fixtureSet.values()];
  if (fixtures.length) {
    const maxRedeemResults = await client.multicall({
      contracts: fixtures.map((h) => ({
        address: vaultAddress,
        abi: MAX_REDEEM_ABI,
        functionName: "maxRedeem",
        args: [h.address],
      })),
      allowFailure: true,
      batchSize: 0,
      blockNumber: pinned,
    });
    fixtures.forEach((h, i) => {
      h.maxRedeem = maxRedeemResults[i].status === "success" ? maxRedeemResults[i].result.toString() : null;
    });
  }

  // ── class table (for this vault) ──
  const classes = new Map();
  for (const h of holders) {
    const key = h.kind === "delegated-account" ? `delegated-account:${h.delegate}` : h.kind;
    if (!classes.has(key)) classes.set(key, { count: 0, sum: 0n });
    const c = classes.get(key);
    c.count++;
    c.sum += h.balance;
  }

  console.error(`  ✓ ${fmtN(balances.size)} non-zero holders, Σ balances == totalSupply exactly`);
  for (const [k, c] of [...classes.entries()].sort((a, b) => Number(b[1].sum - a[1].sum))) {
    console.error(`    ${k.padEnd(48)} count ${String(c.count).padStart(5)}  sum ${c.sum.toString()}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonOut = {
    vault: vaultAddress,
    family: vault.family,
    name: vault.name,
    symbol: vault.symbol,
    decimals: vault.decimals,
    asset: vault.asset,
    pinnedBlock: pinned.toString(),
    floorBlock: FLOOR.toString(),
    transferLogsSwept: logs.length,
    firstMintTxHash: firstMintTx,
    distinctParticipants: addressList.length,
    totalSupply: totalSupply.toString(),
    sumBalances: sum.toString(),
    // Always true by this point — the retry loop above throws (and probeVault
    // never reaches here) when the invariant does not hold. Recorded as an
    // explicit field anyway so a downstream reader of the JSON never has to
    // take completeness on faith.
    sumMatchesTotalSupply: true,
    holderCount: balances.size,
    fixtures: fixtures.map((h) => ({ ...h, balance: h.balance.toString() })),
    classSummary: Object.fromEntries(
      [...classes.entries()].map(([k, v]) => [k, { count: v.count, sum: v.sum.toString() }]),
    ),
    holders: holders.map((h) => ({ ...h, balance: h.balance.toString() })),
  };
  fs.writeFileSync(path.join(OUT_DIR, `${vaultAddress}.json`), JSON.stringify(jsonOut, null, 2));
  console.error(`  wrote ${vaultAddress}.json`);
  return jsonOut;
}

// ── aggregate + fixtures.md + README.md ─────────────────────────────────────
async function writeAggregateAndReports(env, results, catalogue, pinned) {
  const namer = makeNamer(env);

  // Every distinct delegate / implementation across the whole census.
  const distinctImpls = new Set();
  for (const r of results) {
    if (!r) continue;
    for (const h of r.holders) {
      if (h.delegate) distinctImpls.add(h.delegate);
      if (h.implementation) distinctImpls.add(h.implementation);
      if (h.singleton) distinctImpls.add(h.singleton);
    }
  }
  console.error(`\nnaming pass: ${distinctImpls.size} distinct delegate/implementation addresses across the census…`);
  const names = new Map();
  for (const addr of distinctImpls) {
    names.set(addr, await namer(addr));
  }

  // Per-class aggregate: distinct holders, vaults, max share of a vault.
  const classAgg = new Map(); // key -> { holders:Set, vaults:Set, maxShare: {vault, share}, label }
  function bump(key, label, holderAddr, vaultAddr, share) {
    if (!classAgg.has(key))
      classAgg.set(key, { label, holders: new Set(), vaults: new Set(), maxShare: { vault: null, share: 0 } });
    const c = classAgg.get(key);
    c.holders.add(holderAddr);
    c.vaults.add(vaultAddr);
    if (share > c.maxShare.share) c.maxShare = { vault: vaultAddr, share };
  }
  for (const r of results) {
    if (!r) continue;
    const total = BigInt(r.totalSupply) || 1n;
    for (const h of r.holders) {
      const share = total > 0n ? Number((BigInt(h.balance) * 10000n) / total) / 100 : 0;
      if (h.kind === "delegated-account") {
        const label = names.get(h.delegate)?.name
          ? `${names.get(h.delegate).name} (delegate ${h.delegate})`
          : `unnamed delegate ${h.delegate}`;
        bump(`delegated-account:${h.delegate}`, label, h.address, r.vault, share);
      } else if (h.kind === "safe") {
        bump(`safe:${h.version}`, `Safe ${h.version}`, h.address, r.vault, share);
      } else if (h.kind === "erc4626" && h.assetIsVaultShares) {
        bump("erc4626-rewrapper", "ERC-4626 re-wrapper (asset() == this vault)", h.address, r.vault, share);
      } else if (h.kind === "erc1967-proxy" || h.kind === "eip1167-proxy") {
        const impl = h.implementation;
        const label = names.get(impl)?.name
          ? `${names.get(impl).name} (impl ${impl})`
          : `unnamed implementation ${impl}`;
        bump(`${h.kind}:${impl}`, label, h.address, r.vault, share);
      } else if (h.kind === "aave-vault") {
        bump(
          "aave-vault",
          "an Umbrella/stata catalogue member holding another catalogue member",
          h.address,
          r.vault,
          share,
        );
      } else {
        bump(h.kind, h.kind, h.address, r.vault, share);
      }
    }
  }

  const aggregate = {
    pinnedBlock: pinned.toString(),
    generatedAt: new Date().toISOString(),
    vaultCount: catalogue.length,
    vaults: results.filter(Boolean).map((r) => ({
      vault: r.vault,
      family: r.family,
      symbol: r.symbol,
      holderCount: r.holderCount,
      sumMatchesTotalSupply: r.sumMatchesTotalSupply,
      totalSupply: r.totalSupply,
    })),
    failures: catalogue.filter((v) => !results.find((r) => r && r.vault === v.address)).map((v) => v.address),
    classes: [...classAgg.entries()]
      .map(([key, c]) => ({
        key,
        label: c.label,
        distinctHolders: c.holders.size,
        distinctVaults: c.vaults.size,
        maxShareOfAVault: c.maxShare,
      }))
      .sort((a, b) => b.distinctHolders - a.distinctHolders),
    names: Object.fromEntries([...names.entries()].map(([k, v]) => [k, v.name])),
  };
  fs.writeFileSync(path.join(OUT_DIR, "aggregate.json"), JSON.stringify(aggregate, null, 2));
  console.error(`wrote aggregate.json`);

  // ── README.md — the class table ──
  const readmeLines = [
    `# Ethereum Aave vault-layer holder census`,
    ``,
    `Pinned block **${fmtN(pinned)}**. ${catalogue.length} vaults discovered on chain (` +
      `\`UMBRELLA.getStkTokens()\` + \`STATA_FACTORY.getStataTokens()\` + the named \`GhoEthereum.SGHO\` constant).`,
    ``,
    `## Per-vault holder counts`,
    ``,
    `| vault | family | holders | Σ==totalSupply |`,
    `|---|---|---|---|`,
    ...results
      .filter(Boolean)
      .map(
        (r) =>
          `| ${r.symbol ?? r.vault} | ${r.family} | ${fmtN(r.holderCount)} | ${r.sumMatchesTotalSupply ? "✅" : "❌"} |`,
      ),
    ``,
    `## Class table — by implementation / singleton / delegate`,
    ``,
    `A holder's chain-code identifies the app; only the app's own deployment table (not this census) identifies the app's users. See README notes below for the distinction the Base census settled.`,
    ``,
    `| class | label | distinct holders | distinct vaults | max share of a vault |`,
    `|---|---|---|---|---|`,
    ...aggregate.classes.map(
      (c) =>
        `| ${c.key} | ${c.label} | ${c.distinctHolders} | ${c.distinctVaults} | ${c.maxShareOfAVault.share.toFixed(2)}% of ${c.maxShareOfAVault.vault} |`,
    ),
    ``,
    `## Notes`,
    ``,
    `- A verified contract NAME (Etherscan/Sourcify) identifies the CODE at an address. It does not, on its own, identify which app's customers hold these vaults — that needs the provider's own published deployment table (the Base tile rule, both prongs), which is out of scope for this one-off census.`,
    `- Names above came from the Etherscan V2 API (chain 1) with Sourcify as a second source, looked up once per distinct address and cached.`,
  ];
  fs.writeFileSync(path.join(OUT_DIR, "README.md"), readmeLines.join("\n") + "\n");
  console.error(`wrote README.md`);

  return { aggregate, names };
}

async function writeFixturesMd(env, results, pinned) {
  const lines = [
    `# Fixtures for the Ethereum Aave vault-layer build`,
    ``,
    `All read at pinned block **${fmtN(pinned)}**, from a live \`Transfer\` sweep — every fixture below is`,
    `re-derivable with \`eth_call\` alone.`,
    ``,
  ];

  for (const r of results.filter(Boolean)) {
    lines.push(`## ${r.symbol ?? r.vault} (${r.family}) — ${r.vault}`);
    lines.push(``);
    lines.push(`Holders: ${fmtN(r.holderCount)}. Σ balances ${r.sumMatchesTotalSupply ? "==" : "!="} totalSupply.`);
    lines.push(``);
    if (!r.fixtures.length) {
      lines.push(`⚠️ NO HOLDER FIXTURE FOUND for ${r.symbol} in this sweep (holderCount ${r.holderCount}).`);
    } else {
      lines.push(`| holder | kind | balance (raw) | maxRedeem (raw) |`);
      lines.push(`|---|---|---|---|`);
      for (const h of r.fixtures) {
        lines.push(
          `| ${h.address} | ${h.kind}${h.delegate ? ` (delegate ${h.delegate})` : ""} | ${h.balance} | ${h.maxRedeem ?? "n/a"} |`,
        );
      }
    }
    if (r.firstMintTxHash) lines.push(``, `First mint (deposit) tx found in this sweep: \`${r.firstMintTxHash}\``);
    lines.push(``);
  }

  // stkGHO gap check — the plan's own open question.
  const stkGho = results.find(
    (r) => r && r.symbol && r.symbol.toLowerCase().includes("gho") && r.family === "umbrella-stake",
  );
  lines.push(`## stkGHO holder gap (plan §5A)`);
  lines.push(``);
  if (stkGho) {
    lines.push(
      stkGho.holderCount > 0
        ? `**RESOLVED** — this sweep, over the wide logs lane, found **${fmtN(stkGho.holderCount)} stkGHO holder(s)**, closing the gap the plan's ten-block-window sampling could not.`
        : `**STILL A GAP** — this sweep (floor block, whole-life range, wide logs lane) found **0 non-zero stkGHO holders**, even with the corrected §1 logs lane. See the per-vault JSON for the exact swept range and log count.`,
    );
  } else {
    lines.push(`stkGHO was not in the discovered catalogue this run — see aggregate.json failures.`);
  }
  lines.push(``);

  // One deposit tx per family.
  lines.push(`## One deposit transaction hash per family`);
  lines.push(``);
  for (const family of ["sgho", "umbrella-stake", "stata"]) {
    const withMint = results.filter((r) => r && r.family === family && r.firstMintTxHash);
    if (withMint.length) {
      lines.push(`- **${family}**: \`${withMint[0].firstMintTxHash}\` (${withMint[0].symbol}, ${withMint[0].vault})`);
    } else {
      lines.push(`- **${family}**: no mint (deposit) Transfer found in any catalogued vault's swept range.`);
    }
  }
  lines.push(``);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "fixtures.md"), lines.join("\n") + "\n");
  console.error(`wrote fixtures.md`);
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const argv = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v === undefined ? true : v];
    }),
  );
  const env = loadEnv();

  const client = createPublicClient({
    chain: mainnet,
    transport: http(env.ALCHEMY_URL, { batch: { batchSize: 60, wait: 40 }, retryCount: 8, retryDelay: 1200 }),
  });

  const pinned = await client.getBlockNumber();
  console.error(`pinned block ${fmtN(pinned)} (recorded for the whole run)`);

  await selfTestClassifier(client, pinned);

  const catalogue = await discoverCatalogue(client, pinned);
  const catalogueByAddress = new Map(catalogue.map((v) => [v.address, v]));
  const catalogueSet = new Set(catalogue.map((v) => v.address));

  const targets = argv.vault ? catalogue.filter((v) => v.address === lc(argv.vault)) : catalogue;
  if (argv.vault && !targets.length) throw new Error(`--vault=${argv.vault} is not in the discovered catalogue`);

  const results = [];
  for (const vault of targets) {
    try {
      results.push(await probeVault(env, client, catalogue, catalogueByAddress, catalogueSet, vault, pinned));
    } catch (err) {
      console.error(`\n❌ ${vault.symbol ?? vault.address} FAILED: ${err.message}`);
      results.push(null);
    }
  }

  const ok = results.filter(Boolean).length;
  console.error(
    `\n${ok}/${targets.length} vaults completed with Σ balances == totalSupply; ${logRequestCount} eth_getLogs requests total.`,
  );

  if (targets.length === catalogue.length) {
    // Only build the aggregate/fixtures/README off a full run, matching the
    // task's "one JSON per vault... plus an aggregate" shape.
    await writeAggregateAndReports(env, results, catalogue, pinned);
    await writeFixturesMd(env, results, pinned);
  } else {
    console.error(`(--vault run — skipping aggregate/fixtures/README, which need the full catalogue)`);
  }

  if (ok === 0) {
    throw new Error(
      "every vault failed — the sweep cannot complete after retries; stopping (see per-vault errors above)",
    );
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err.stack || err.message || err);
  process.exit(1);
});
