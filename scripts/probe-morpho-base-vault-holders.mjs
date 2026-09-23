#!/usr/bin/env node
/**
 * Who holds the shares of a Base MetaMorpho vault: wallets, or wrappers?
 * ----------------------------------------------------------------------------
 * `/base/morpho/vaults/<vault>/<holder>` states a holder's attributed exposure to
 * the Morpho Blue markets a vault lends into, and the product copy deliberately
 * avoids the word "depositor" — nobody had measured whether the addresses that
 * hold a Base vault's shares are people's wallets or contracts (wrappers, other
 * vaults, Safes, bundlers). On Ethereum the largest holders of the big
 * MetaMorpho vaults are known to be wrappers. This script measures Base, one
 * vault at a time, from a single pinned block.
 *
 * Run:
 *   node scripts/probe-morpho-base-vault-holders.mjs [--vault=0x…] [--compare]
 * `--vault` defaults to Steakhouse Prime USDC (the case-study vault). `--compare`
 * additionally finds the two other largest USDC-asset vaults in the catalog (by
 * `totalAssets` at the same pinned block that started the run — see the CAVEAT
 * below) and probes those too, so the study vault has something to sit next to.
 * Needs BASE_RPC_URL (eth_call/eth_getCode/eth_getStorageAt/Multicall3, Alchemy
 * free tier) and BASE_BACKFILL_RPC_URL (metered Alchemy, wide eth_getLogs only)
 * in .env.local — read, never printed; only the presence of each key is logged.
 *
 * ── WHAT IS MEASURED, PER VAULT ───────────────────────────────────────────────
 *  1. Pin one block. Every read below is at that block, no exceptions.
 *  2. Sweep the vault's ERC-20 Transfer log from its creation block to the pin,
 *     collect every distinct non-zero from/to address, read balanceOf for all of
 *     them through Multicall3, keep the non-zero ones, and PROVE the sweep is
 *     complete by asserting Σ balances == totalSupply exactly, in wei. A sweep
 *     that missed a transfer would still produce a plausible-looking holder set
 *     — this is the only check that would catch it, so it is not a nicety.
 *  3. Classify every non-zero holder by its bytecode/storage at the pinned
 *     block: eoa, delegated-account (EIP-7702 — code of exactly 23 bytes,
 *     `0xef0100` followed by the delegate, which is IN the code), metamorpho-
 *     vault (this repo's own catalog), safe (Gnosis Safe proxy — read storage
 *     slot 0 and match a known singleton), erc1967-proxy (EIP-1967
 *     implementation slot), eip1167-proxy (minimal-proxy bytecode,
 *     implementation embedded in the code itself, no extra read needed), or
 *     other-contract. `0x…dEaD` is flagged as a known sink independent of class.
 *  4. Report holder count, a table per class (count, share of supply), a table
 *     of delegated accounts with ONE ROW PER DELEGATE, the top 20 holders with
 *     class, and the smallest holder count that covers 50%/90% of supply — the
 *     concentration figure, stated without a Gini coefficient.
 *
 * ── WHY THE DELEGATE IS ITS OWN UNIT ─────────────────────────────────────────
 * The first Base census (2026-09-06) ran WITHOUT the EIP-7702 branch, and every
 * such holder fell through to "other-contract (shared bytecode)": thousands of
 * delegated EOAs — the largest single population on some vaults — read as
 * anonymous 23-byte contracts, and the classes that distinguish one app's
 * wallet from another's were invisible. A delegate address is the only thing on
 * chain that separates them, so it is what the report counts by; the name of
 * whatever sits at that address is not this script's to give.
 *
 * ── TRAPS HIT, MEASURED 2026-09-05 ────────────────────────────────────────────
 *  • BASE_BACKFILL_RPC_URL (metered Alchemy) caps eth_getLogs by RESPONSE SIZE,
 *    not block count, and says so in the error: "Log response size exceeded …
 *    this block range should work: [0x…, 0x…]". The suggested upper bound is
 *    itself sometimes still too wide (a second call at the first hint's own
 *    bound also errored, with a NARROWER second hint) — so the sweep below
 *    treats a hint as a proposal to retry, not a promise, and keeps shrinking
 *    until a range actually answers. Un-hinted errors fall back to halving.
 *    Every returned log's blockNumber is asserted inside the asked range before
 *    it is accepted, so a silently short answer (the failure mode that sank
 *    HyperRPC for the vault census — 37 of 120 logs, 200 OK, no error) cannot
 *    pass as complete here either.
 *  • BASE_RPC_URL (free tier) is a full archive for eth_call/eth_getCode but its
 *    eth_getLogs is capped at ten blocks — unusable for the sweep, which is why
 *    the metered lane exists at all. This script never calls eth_getLogs on it.
 *  • Multicall3 batches must be PACED (not fired concurrently) or the free
 *    lane's per-second throttle escalates into account-level 429s — the same
 *    finding scripts/census-morpho-base-vaults.mjs recorded. Every batched loop
 *    here (balanceOf, getCode, getStorageAt, totalAssets, identify) sleeps
 *    between chunks. MEASURED ON A REAL RUN: even at a 150-per-chunk/180ms-gap
 *    pace, a sustained run of getCode + two getStorageAt passes over ~11,000
 *    contract holders (Gauntlet USDC Prime, then Spark USDC Vault) eventually
 *    tripped "exceeded compute units per second" mid-sweep, past viem's 5
 *    built-in retries — a SUSTAINED-rate problem, not a burst one, so the fix
 *    was a slower steady-state pace (80/350ms) and more/longer retries (8
 *    attempts, 1.2s base), not just a bigger burst allowance.
 *  • THE CLASSIFIER PROVES ITSELF FIRST. Before any vault is probed, it reads
 *    code at the current head for 0x…dEaD (a known EOA — no code, despite
 *    holding a real balance on the study vault: verify-morpho-base-vault-
 *    exposure.mjs already found this and corrected a "presumed zero-balance"
 *    fixture over it) and for the Morpho Blue singleton (a known contract, not a
 *    proxy). The run refuses to start unless dEaD reads `eoa` and Blue reads
 *    something other than `eoa` — a positive control that the eoa/contract
 *    branch actually discriminates, not just a syntax check.
 *  • CAVEAT ON `--compare`'s vault PICK: totalAssets() extrapolates interest to
 *    the block timestamp and is read once per catalog USDC vault to RANK them;
 *    it is not re-read as each comparison vault's own totalAssets in the report
 *    below (the report is about holders, not vault size) — see
 *    lib/sources/chain/morpho-base-vault.ts for why totalAssets and the sum of
 *    stored Blue legs are two different numbers on this family of vault.
 *
 * ── SELF-TEST RESULT (recorded, not asserted at every run to save a read) ────
 *  2026-09-05, Base head ~50,905,000: 0x…dEaD → eoa (empty code). Morpho Blue
 *  singleton 0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb → other-contract (has
 *  code, not in the vault catalog, not an EIP-1167/1967 proxy pattern, storage
 *  slot 0 does not match any known Safe singleton). Both as expected; the
 *  self-test below re-proves this live on every run.
 */

import { createPublicClient, http, parseAbi, keccak256 } from "viem";
import { base } from "viem/chains";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = process.env.OUT_DIR ?? path.join(os.tmpdir(), "rails-holder-probe");

const STUDY_VAULT = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";
const MORPHO_BLUE = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1 */
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
/** Standard EIP-1167 minimal-proxy runtime bytecode, implementation embedded at [10,30). */
const EIP1167_RE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3(?:[0-9a-f]{0,})?$/i;
/** The EIP-7702 delegation indicator: code of EXACTLY 23 bytes, the three-byte
 *  prefix `0xef0100` followed by the 20-byte delegate. Anchored at both ends —
 *  a longer code that merely begins this way is not a delegation. */
const EIP7702_RE = /^0xef0100([0-9a-f]{40})$/i;

const SAFE_SINGLETONS = {
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "Safe 1.3.0",
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e": "Safe 1.3.0 L2",
  "0x41675c099f32341bf84bfc5382af534df5c7461a": "Safe 1.4.1",
  "0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "Safe 1.4.1 L2",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtN = (n) => Number(n).toLocaleString("en-US");
const fmtUSDC = (raw) => (Number(raw) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
// Share balances: every MetaMorpho share token has 18 decimals (asset decimals + offset).
const fmtShares = (raw) => (Number(raw) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtPct = (x, d = 2) => `${(x * 100).toFixed(d)}%`;

// ── env ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = Object.fromEntries(
    raw
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  for (const k of ["BASE_RPC_URL", "BASE_BACKFILL_RPC_URL"]) {
    if (!env[k]) throw new Error(`need ${k} in .env.local`);
  }
  console.error(
    `env: BASE_RPC_URL ${env.BASE_RPC_URL ? "set" : "MISSING"}, BASE_BACKFILL_RPC_URL ${env.BASE_BACKFILL_RPC_URL ? "set" : "MISSING"}`,
  );
  return env;
}

// ── catalog: extract ROWS and A out of the generated .ts without tsx ────────
// A NAME/SYMBOL TRAP, HIT WHILE WRITING THIS: the catalog is written with every
// string double-quoted (`esc = JSON.stringify`), but `pnpm format` (Prettier)
// runs over it afterwards and Prettier's default rule is to re-quote a string
// SINGLE if that avoids escaping — and at least one vault's name is a crafted
// string containing a literal `"` (`GW7B-quote-"<tag>`), so its row in the
// shipped file reads `'GW7B-quote-"<tag>', "GW7B"` — single- and double-quoted
// strings on the SAME line. That is not valid JSON (JSON.parse rejected it
// outright), but it IS valid JavaScript, so the block below is scanned with a
// quote-type-aware bracket matcher (tracks which of `'`/`"` opened the current
// string, not just "in a string or not") and evaluated with `new Function`
// rather than JSON.parse — trailing commas are legal JS too, so nothing needs
// stripping either.
function loadCatalog() {
  const text = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
  const block = (marker) => {
    const start = text.indexOf(marker);
    if (start === -1) throw new Error(`catalog: could not find ${marker}`);
    // `marker` ends with the array's own opening "[" — searching for the next "["
    // from `start` would instead find the one inside "string[]"/"Row[]" in the
    // marker text itself, so the bracket IS the marker's last character.
    const open = start + marker.length - 1;
    let depth = 0;
    let quote = null; // null | "'" | '"' — which quote character opened the current string
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          const raw = text.slice(open, i + 1);
          // eslint-disable-next-line no-new-func — trusted, repo-local generated file
          return new Function(`"use strict"; return (${raw});`)();
        }
      }
    }
    throw new Error(`catalog: unmatched bracket for ${marker}`);
  };
  const A = block("const A: readonly string[] = [");
  const ROWS = block("const ROWS: readonly Row[] = [");
  const vaults = ROWS.map((r) => ({
    address: r[0].toLowerCase(),
    factory: r[1] === 1 ? "v1.1" : "v1.0",
    createdBlock: r[2],
    name: r[3],
    symbol: r[4],
    asset: A[r[5]].toLowerCase(),
  }));
  const byAddress = new Map(vaults.map((v) => [v.address, v]));
  const vaultSet = new Set(vaults.map((v) => v.address));
  console.error(`catalog: ${vaults.length} vaults loaded from lib/morpho-base/vault-catalog.ts`);
  return { vaults, byAddress, vaultSet };
}

// ── the metered lane: adaptive, hint-following eth_getLogs sweep ────────────
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
    // TRAP: a big-enough "response too large" overage comes back as a plain
    // HTTP 400 (not 200) — but the body still carries the same JSON-RPC error
    // and shrink-hint a smaller overage returns with HTTP 200. So the body is
    // always parsed first, on ANY status, and only a body that isn't JSON (or
    // carries no error/result) falls back to a bare HTTP-status failure.
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

/** Parses Alchemy's "this block range should work: [0x…, 0x…]" hint out of an
 *  error message. Returns the suggested upper bound (a Number) or null. */
function parseHintTo(message) {
  const m = /\[\s*0x([0-9a-fA-F]+)\s*,\s*0x([0-9a-fA-F]+)\s*\]/.exec(message ?? "");
  return m ? parseInt(m[2], 16) : null;
}

/** Sweeps [fromBlock, toBlock] for `topic` logs at `address`, shrinking the
 *  range on a "response too large" error (following the server's own hint when
 *  it gives one, halving otherwise) and growing it back up on success. Every
 *  log's blockNumber is asserted inside the range that was actually asked for —
 *  a silently short answer is refused, not accepted. */
async function sweepLogs(url, address, topic, fromBlock, toBlock) {
  const logs = [];
  let cur = fromBlock;
  let chunk = Math.min(2_000_000, toBlock - fromBlock + 1);
  let stalls = 0;
  while (cur <= toBlock) {
    let hi = Math.min(cur + chunk - 1, toBlock);
    let attempt = 0;
    for (;;) {
      attempt++;
      const res = await postLogs(url, [
        { address, topics: [topic], fromBlock: `0x${cur.toString(16)}`, toBlock: `0x${hi.toString(16)}` },
      ]);
      if (res.httpError) {
        if (attempt > 6)
          throw new Error(`getLogs: HTTP ${res.httpError} persisted at block ${cur} — body: ${res.body}`);
        await sleep(800 * attempt);
        continue;
      }
      if (res.error) {
        const hintTo = parseHintTo(res.error.message);
        if (hintTo !== null && hintTo >= cur && hintTo < hi) {
          hi = hintTo;
        } else if (hi > cur) {
          hi = cur + Math.floor((hi - cur) / 2);
        } else {
          throw new Error(`getLogs: single block ${cur} still errors: ${JSON.stringify(res.error).slice(0, 300)}`);
        }
        if (attempt > 20) throw new Error(`getLogs: ${attempt} attempts without success at block ${cur}`);
        continue;
      }
      if (!Array.isArray(res.result)) throw new Error(`getLogs: non-array result at [${cur},${hi}]`);
      for (const log of res.result) {
        const bn = parseInt(log.blockNumber, 16);
        if (bn < cur || bn > hi)
          throw new Error(`getLogs: log blockNumber ${bn} outside asked range [${cur},${hi}] — refusing`);
        logs.push(log);
      }
      break;
    }
    cur = hi + 1;
    stalls = hi === Math.min(cur - 1, toBlock) && chunk === 1 ? stalls + 1 : 0;
    chunk = Math.max(1, Math.min(chunk * 2, 5_000_000, toBlock - cur + 1));
    const pct = (((cur - fromBlock) / (toBlock - fromBlock + 1)) * 100).toFixed(1);
    process.stderr.write(
      `\r  sweeping logs ${pct}% (block ${cur.toLocaleString("en-US")}, ${logs.length.toLocaleString("en-US")} logs so far)   `,
    );
    await sleep(120);
  }
  process.stderr.write("\n");
  return logs;
}

// ── paced, retried Multicall3 / getCode / getStorageAt over BASE_RPC_URL ────
async function pacedMulticall(client, contracts, blockNumber, { size = 500, gapMs = 300, label = "multicall" } = {}) {
  const out = [];
  for (let i = 0; i < contracts.length; i += size) {
    const slice = contracts.slice(i, i + size);
    const res = await client.multicall({ contracts: slice, allowFailure: true, batchSize: 0, blockNumber });
    out.push(...res);
    process.stderr.write(`\r  ${label} ${fmtN(Math.min(i + size, contracts.length))}/${fmtN(contracts.length)}`);
    await sleep(gapMs);
  }
  if (contracts.length) process.stderr.write("\n");
  return out;
}

async function pacedGetCode(client, addresses, blockNumber, { chunk = 150, gapMs = 200 } = {}) {
  const out = new Map();
  for (let i = 0; i < addresses.length; i += chunk) {
    const slice = addresses.slice(i, i + chunk);
    const codes = await Promise.all(slice.map((a) => client.getCode({ address: a, blockNumber })));
    slice.forEach((a, j) => out.set(a, codes[j] ?? "0x"));
    process.stderr.write(`\r  getCode ${fmtN(Math.min(i + chunk, addresses.length))}/${fmtN(addresses.length)}`);
    await sleep(gapMs);
  }
  if (addresses.length) process.stderr.write("\n");
  return out;
}

async function pacedGetStorage(client, addresses, slot, blockNumber, { chunk = 150, gapMs = 200 } = {}) {
  const out = new Map();
  for (let i = 0; i < addresses.length; i += chunk) {
    const slice = addresses.slice(i, i + chunk);
    const vals = await Promise.all(slice.map((a) => client.getStorageAt({ address: a, slot, blockNumber })));
    slice.forEach((a, j) => out.set(a, vals[j] ?? "0x" + "0".repeat(64)));
    process.stderr.write(
      `\r  storage(${slot.slice(0, 10)}…) ${fmtN(Math.min(i + chunk, addresses.length))}/${fmtN(addresses.length)}`,
    );
    await sleep(gapMs);
  }
  if (addresses.length) process.stderr.write("\n");
  return out;
}

// ── classification ───────────────────────────────────────────────────────
function last20(hex32) {
  return "0x" + hex32.slice(-40).toLowerCase();
}

function classifyByCode(address, code, vaultSet) {
  if (!code || code === "0x") return { class: "eoa" };
  // EIP-7702 FIRST among the code branches. These accounts carry 23 bytes and
  // answer nothing; the first Base holder census read them as "other-contract
  // (shared bytecode)" and so counted thousands of delegated EOAs as anonymous
  // contracts. The delegate is IN the code, so no extra read is needed, and it
  // is kept per holder: one class per delegate is the unit the census reports.
  const delegation = EIP7702_RE.exec(code);
  if (delegation) return { class: "delegated-account", delegate: "0x" + delegation[1].toLowerCase(), codeSize: 23 };
  if (vaultSet.has(address)) return { class: "metamorpho-vault" };
  const m = EIP1167_RE.exec(code);
  if (m) {
    const implementation = "0x" + m[1].toLowerCase();
    // A Safe deployed through the 1.4.1 factory is a minimal proxy whose
    // implementation IS the singleton; it is a Safe, not an anonymous proxy.
    if (SAFE_SINGLETONS[implementation])
      return {
        class: "safe",
        singleton: SAFE_SINGLETONS[implementation],
        implementation,
        codeSize: (code.length - 2) / 2,
      };
    return { class: "eip1167-proxy", implementation, codeSize: (code.length - 2) / 2 };
  }
  return { class: "needs-storage", codeSize: (code.length - 2) / 2 };
}

function classifyByStorage(implSlotVal, slot0Val) {
  const zero = "0x" + "0".repeat(64);
  if (implSlotVal && implSlotVal !== zero) {
    return { class: "erc1967-proxy", implementation: last20(implSlotVal) };
  }
  if (slot0Val && slot0Val !== zero) {
    const candidate = last20(slot0Val);
    const singleton = SAFE_SINGLETONS[candidate];
    if (singleton) return { class: "safe", singleton, singletonAddress: candidate };
  }
  return { class: "other-contract" };
}

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);
const ASSET_ABI = parseAbi(["function asset() view returns (address)"]);
const VAULT_TOTAL_ASSETS_ABI = parseAbi(["function totalAssets() view returns (uint256)"]);

// ── self-test: prove the eoa/contract branch actually discriminates ─────────
async function selfTestClassifier(client, vaultSet, head) {
  const [deadCode, blueCode] = await Promise.all([
    client.getCode({ address: DEAD_ADDRESS, blockNumber: head }),
    client.getCode({ address: MORPHO_BLUE, blockNumber: head }),
  ]);
  const deadClass = classifyByCode(DEAD_ADDRESS, deadCode, vaultSet).class;
  const blueInfo = classifyByCode(MORPHO_BLUE, blueCode, vaultSet);
  let blueClass = blueInfo.class;
  if (blueClass === "needs-storage") {
    const [impl, slot0] = await Promise.all([
      client.getStorageAt({ address: MORPHO_BLUE, slot: EIP1967_IMPL_SLOT, blockNumber: head }),
      client.getStorageAt({ address: MORPHO_BLUE, slot: "0x0", blockNumber: head }),
    ]);
    blueClass = classifyByStorage(impl, slot0).class;
  }
  console.error(`self-test @ head ${head}: 0x…dEaD -> ${deadClass}; Morpho Blue singleton -> ${blueClass}`);
  if (deadClass !== "eoa") throw new Error(`self-test FAILED: 0x…dEaD classified as ${deadClass}, expected eoa`);
  if (blueClass === "eoa") throw new Error(`self-test FAILED: Morpho Blue singleton classified as eoa — it has code`);

  // The EIP-7702 branch, on SYNTHETIC code rather than on a live account: an
  // account's delegation can be revoked in any later block, so a live fixture
  // would go red for a reason that is not this classifier. Both directions are
  // asserted — the indicator classifies AND reports the delegate, and 23 bytes
  // that are not the indicator do not.
  const fakeDelegate = "0x00112233445566778899aabbccddeeff00112233";
  const delegated = classifyByCode("0x" + "11".repeat(20), "0xef0100" + fakeDelegate.slice(2), vaultSet);
  if (delegated.class !== "delegated-account" || delegated.delegate !== fakeDelegate)
    throw new Error(`self-test FAILED: 0xef0100||delegate classified as ${delegated.class} (${delegated.delegate})`);
  const notDelegated = classifyByCode("0x" + "22".repeat(20), "0xef0200" + fakeDelegate.slice(2), vaultSet);
  if (notDelegated.class === "delegated-account")
    throw new Error("self-test FAILED: 23 bytes without the 0xef0100 prefix read as a delegation");

  console.error("self-test PASSED — classifier discriminates eoa vs contract, and reads EIP-7702 delegations\n");
}

// ── the probe, one vault ─────────────────────────────────────────────────
async function probeVault(env, client, catalog, vaultAddress) {
  vaultAddress = vaultAddress.toLowerCase();
  const entry = catalog.byAddress.get(vaultAddress);
  if (!entry) throw new Error(`${vaultAddress} is not in lib/morpho-base/vault-catalog.ts`);

  console.error(`\n════ ${entry.name} (${entry.symbol}) ${vaultAddress} ════`);
  console.error(`  factory ${entry.factory}, created block ${fmtN(entry.createdBlock)}`);

  const pinned = await client.getBlockNumber();
  console.error(`  pinned block ${fmtN(pinned)}`);

  const logsBefore = logRequestCount;
  const logs = await sweepLogs(
    env.BASE_BACKFILL_RPC_URL,
    vaultAddress,
    TRANSFER_TOPIC,
    entry.createdBlock,
    Number(pinned),
  );
  console.error(`  swept ${fmtN(logs.length)} Transfer logs in ${logRequestCount - logsBefore} getLogs requests`);

  const addresses = new Set();
  for (const log of logs) {
    const from = "0x" + log.topics[1].slice(26).toLowerCase();
    const to = "0x" + log.topics[2].slice(26).toLowerCase();
    if (from !== ZERO_ADDRESS) addresses.add(from);
    if (to !== ZERO_ADDRESS) addresses.add(to);
  }
  const addressList = [...addresses];
  console.error(`  ${fmtN(addressList.length)} distinct non-zero-address participants across this vault's life`);

  const balResults = await pacedMulticall(
    client,
    addressList.map((a) => ({ address: vaultAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [a] })),
    pinned,
    { size: 500, gapMs: 300, label: "balanceOf" },
  );
  const balances = new Map();
  balResults.forEach((r, i) => {
    if (r.status !== "success") throw new Error(`balanceOf(${addressList[i]}) failed: ${r.error}`);
    if (r.result > 0n) balances.set(addressList[i], r.result);
  });

  const totalSupply = await client.readContract({
    address: vaultAddress,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    blockNumber: pinned,
  });
  let sum = 0n;
  for (const v of balances.values()) sum += v;
  const sumMatches = sum === totalSupply;
  console.error(
    `  Σ balances ${sum.toString()} vs totalSupply ${totalSupply.toString()} — ${sumMatches ? "MATCH" : `DIFFER by ${(sum - totalSupply).toString()}`}`,
  );
  if (!sumMatches) {
    throw new Error(
      `${entry.symbol}: Σ balances (${sum}) != totalSupply (${totalSupply}), diff ${sum - totalSupply} — the log sweep is incomplete; refusing to report on it`,
    );
  }
  console.error(`  ✓ ${fmtN(balances.size)} non-zero holders, Σ balances == totalSupply exactly`);

  const holderAddrs = [...balances.keys()];
  const codeMap = await pacedGetCode(client, holderAddrs, pinned, { chunk: 80, gapMs: 350 });

  const partial = new Map();
  const needStorage = [];
  for (const a of holderAddrs) {
    const info = classifyByCode(a, codeMap.get(a), catalog.vaultSet);
    if (info.class === "needs-storage") needStorage.push(a);
    else partial.set(a, info);
  }

  const implSlotMap = await pacedGetStorage(client, needStorage, EIP1967_IMPL_SLOT, pinned, {
    chunk: 80,
    gapMs: 350,
  });
  const slot0Map = await pacedGetStorage(client, needStorage, "0x0", pinned, { chunk: 80, gapMs: 350 });
  for (const a of needStorage) {
    const info = classifyByStorage(implSlotMap.get(a), slot0Map.get(a));
    if (info.class === "other-contract") {
      const code = codeMap.get(a);
      info.codeSize = (code.length - 2) / 2;
      info.codeHashPrefix = keccak256(code).slice(0, 10);
    }
    partial.set(a, info);
  }

  const holders = holderAddrs.map((address) => ({
    address,
    balance: balances.get(address),
    sink: address === DEAD_ADDRESS,
    ...partial.get(address),
  }));
  holders.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));

  // ── class table ──
  const classes = new Map();
  for (const h of holders) {
    if (!classes.has(h.class)) classes.set(h.class, { count: 0, sum: 0n, members: [] });
    const c = classes.get(h.class);
    c.count++;
    c.sum += h.balance;
    c.members.push(h);
  }

  // ── delegated accounts, ONE CLASS PER DELEGATE ──
  // "delegated-account" is one classifier branch but many populations: every
  // app that ships a 7702 wallet has its own delegate, and the delegate is the
  // only thing on chain that tells them apart. Rolling them into a single row
  // would hide exactly the split the census exists to measure.
  const delegates = new Map();
  for (const h of holders) {
    if (h.class !== "delegated-account") continue;
    if (!delegates.has(h.delegate)) delegates.set(h.delegate, { count: 0, sum: 0n, members: [] });
    const d = delegates.get(h.delegate);
    d.count++;
    d.sum += h.balance;
    d.members.push(h);
  }
  const delegatesRanked = [...delegates.entries()].sort((a, b) => b[1].count - a[1].count);

  // ── identify() on demand, for a curated set of addresses ──
  const identifyCache = new Map();
  async function identify(address) {
    if (identifyCache.has(address)) return identifyCache.get(address);
    const res = await client.multicall({
      contracts: [
        { address, abi: ERC20_ABI, functionName: "name" },
        { address, abi: ERC20_ABI, functionName: "symbol" },
        { address, abi: ASSET_ABI, functionName: "asset" },
      ],
      allowFailure: true,
      batchSize: 0,
      blockNumber: pinned,
    });
    const name = res[0].status === "success" ? res[0].result : null;
    const symbol = res[1].status === "success" ? res[1].result : null;
    const asset = res[2].status === "success" ? res[2].result.toLowerCase() : null;
    const info = { name, symbol, asset, isRewrapper: asset === vaultAddress };
    identifyCache.set(address, info);
    return info;
  }

  const top20 = holders.slice(0, 20);
  const contractOrProxyTop10 = holders
    .filter((h) => h.class === "other-contract" || h.class === "eip1167-proxy" || h.class === "erc1967-proxy")
    .slice(0, 10);
  const top3PerClass = [...classes.values()].flatMap((c) => c.members.slice(0, 3));
  const toIdentify = new Set([...top20, ...contractOrProxyTop10, ...top3PerClass].map((h) => h.address));

  console.error(`  identifying ${toIdentify.size} featured holders (name/symbol/asset)…`);
  let idDone = 0;
  for (const a of toIdentify) {
    const info = await identify(a);
    const h = holders.find((x) => x.address === a);
    Object.assign(h, info);
    idDone++;
    process.stderr.write(`\r  identify ${idDone}/${toIdentify.size}`);
    await sleep(120);
  }
  if (toIdentify.size) process.stderr.write("\n");

  // Shared-implementation note, among identified proxies. TRAP HIT ON A REAL
  // RUN: a per-holder `.filter()` over the full holder list (O(n²), and each
  // hit storing every peer address) blew the later JSON.stringify past V8's
  // string-length ceiling on a 23k-holder vault whose shares are dominated by
  // one widely-reused proxy implementation (Coinbase Smart Wallet-shaped:
  // thousands of holders share one implementation address). A single O(n)
  // pass builds the implementation→addresses index instead, and only a
  // five-address SAMPLE (never the full peer list) is kept per holder.
  const byImplementation = new Map();
  for (const h of holders) {
    if (h.class !== "eip1167-proxy" && h.class !== "erc1967-proxy") continue;
    if (!byImplementation.has(h.implementation)) byImplementation.set(h.implementation, []);
    byImplementation.get(h.implementation).push(h.address);
  }
  for (const h of holders) {
    if (h.class !== "eip1167-proxy" && h.class !== "erc1967-proxy") continue;
    const group = byImplementation.get(h.implementation);
    h.sharedImplementationCount = group.length - 1;
    // A small fixed-size slice, filtered for self, rather than filtering the
    // whole (possibly huge) group per holder — O(1) per holder, not O(group).
    h.sharedImplementationSample = group
      .slice(0, 6)
      .filter((a) => a !== h.address)
      .slice(0, 5);
  }

  // ── concentration: smallest holder count covering 50% / 90% of supply ──
  let running = 0n;
  let holders50 = null;
  let holders90 = null;
  for (let i = 0; i < holders.length; i++) {
    running += holders[i].balance;
    if (holders50 === null && running * 2n >= totalSupply) holders50 = i + 1;
    if (holders90 === null && running * 10n >= totalSupply * 9n) {
      holders90 = i + 1;
      break;
    }
  }

  // ── build the printed report ──
  const lines = [];
  const p = (s = "") => {
    lines.push(s);
  };
  p(`${entry.name} (${entry.symbol}) — ${vaultAddress}`);
  p(`factory ${entry.factory}, created block ${fmtN(entry.createdBlock)}, pinned block ${fmtN(pinned)}`);
  p(`Transfer logs swept: ${fmtN(logs.length)}; distinct participants: ${fmtN(addressList.length)}`);
  p(
    `Σ balances ${sum.toString()} == totalSupply ${totalSupply.toString()} — CONFIRMED (${fmtN(balances.size)} non-zero holders)`,
  );
  p();
  p("Class table:");
  const classOrder = [
    "eoa",
    "delegated-account",
    "metamorpho-vault",
    "safe",
    "erc1967-proxy",
    "eip1167-proxy",
    "other-contract",
  ];
  for (const cls of classOrder) {
    const c = classes.get(cls);
    if (!c) continue;
    const share = Number(c.sum) / Number(totalSupply);
    p(`  ${cls.padEnd(18)} count ${String(c.count).padStart(6)}   share ${fmtPct(share).padStart(7)}`);
    for (const m of c.members.slice(0, 3)) {
      const label = [
        m.name ? `"${m.name}"` : null,
        m.symbol ? `(${m.symbol})` : null,
        m.singleton ? `[${m.singleton}]` : null,
        m.implementation ? `impl ${m.implementation}` : null,
        m.delegate ? `delegate ${m.delegate}` : null,
        m.isRewrapper ? "RE-WRAPPER (asset()==this vault)" : null,
        m.sink ? "KNOWN SINK" : null,
      ]
        .filter(Boolean)
        .join(" ");
      p(
        `      ${m.address}  ${fmtShares(m.balance).padStart(14)} ${entry.symbol}  ${fmtPct(Number(m.balance) / Number(totalSupply)).padStart(7)}  ${label}`,
      );
    }
  }
  if (delegatesRanked.length) {
    p();
    p("Delegated accounts (EIP-7702) — one row per delegate:");
    for (const [delegate, d] of delegatesRanked) {
      const share = Number(d.sum) / Number(totalSupply);
      p(`  ${delegate}  count ${String(d.count).padStart(6)}   share ${fmtPct(share).padStart(7)}`);
      for (const m of d.members.slice(0, 3)) {
        p(
          `      ${m.address}  ${fmtShares(m.balance).padStart(14)} ${entry.symbol}  ${fmtPct(Number(m.balance) / Number(totalSupply)).padStart(7)}`,
        );
      }
    }
    p("  (a delegate is an address, not a name: what it is takes reading it.)");
  }
  p();
  p("Top 20 holders overall:");
  top20.forEach((h, i) => {
    const label = [h.name ? `"${h.name}"` : null, h.singleton, h.sink ? "SINK" : null].filter(Boolean).join(" ");
    p(
      `  ${String(i + 1).padStart(2)}. ${h.address}  ${h.class.padEnd(16)}  ${fmtShares(h.balance).padStart(14)} ${entry.symbol}  ${fmtPct(Number(h.balance) / Number(totalSupply)).padStart(7)}  ${label}`,
    );
  });
  p();
  p(`Concentration: ${fmtN(holders50)} holders cover 50% of supply; ${fmtN(holders90)} cover 90%.`);
  p();
  p("Top contract/proxy holders — identification notes:");
  for (const h of contractOrProxyTop10) {
    const shared = h.sharedImplementationCount
      ? `shared with ${h.sharedImplementationCount} other holder(s): ${h.sharedImplementationSample.join(", ")}`
      : h.implementation
        ? "implementation not shared with any other holder here"
        : null;
    const bits = [
      h.name || h.symbol ? `name/symbol: ${h.name ?? "?"} / ${h.symbol ?? "?"}` : "name()/symbol() did not answer",
      h.asset ? `asset(): ${h.asset}${h.isRewrapper ? " — RE-WRAPPER of this vault" : ""}` : null,
      h.implementation ? `implementation ${h.implementation}` : null,
      shared,
      h.codeHashPrefix ? `codeHash ${h.codeHashPrefix}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    const verdict = h.name || h.symbol || h.asset ? bits : `unidentified — ${bits}`;
    p(`  ${h.address} (${h.class}): ${verdict}`);
  }

  const report = lines.join("\n");
  console.log("\n" + report + "\n");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonOut = {
    vault: vaultAddress,
    name: entry.name,
    symbol: entry.symbol,
    factory: entry.factory,
    createdBlock: entry.createdBlock,
    pinnedBlock: pinned.toString(),
    transferLogsSwept: logs.length,
    distinctParticipants: addressList.length,
    totalSupply: totalSupply.toString(),
    sumBalances: sum.toString(),
    holderCount: balances.size,
    concentration: { holders50, holders90 },
    classes: Object.fromEntries([...classes.entries()].map(([k, v]) => [k, { count: v.count, sum: v.sum.toString() }])),
    delegates: Object.fromEntries(delegatesRanked.map(([k, v]) => [k, { count: v.count, sum: v.sum.toString() }])),
    holders: holders.map((h) => ({ ...h, balance: h.balance.toString() })),
  };
  fs.writeFileSync(path.join(OUT_DIR, `${vaultAddress}.json`), JSON.stringify(jsonOut, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${vaultAddress}.txt`), report + "\n");
  console.error(`  wrote ${vaultAddress}.json and .txt to ${OUT_DIR}`);

  return jsonOut;
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
  const catalog = loadCatalog();

  const client = createPublicClient({
    chain: base,
    transport: http(env.BASE_RPC_URL, {
      batch: { batchSize: 60, wait: 40 },
      retryCount: 8,
      retryDelay: 1200,
    }),
  });

  const head = await client.getBlockNumber();
  await selfTestClassifier(client, catalog.vaultSet, head);

  const targetVault = (argv.vault || STUDY_VAULT).toLowerCase();
  const results = [];
  results.push(await probeVault(env, client, catalog, targetVault));

  if (argv.compare) {
    console.error(`\n── --compare: ranking USDC-asset catalog vaults by totalAssets at block ${fmtN(head)} ──`);
    const usdcVaults = catalog.vaults.filter((v) => v.asset === USDC_BASE);
    console.error(`  ${usdcVaults.length} USDC-asset vaults in the catalog`);
    const taResults = await pacedMulticall(
      client,
      usdcVaults.map((v) => ({ address: v.address, abi: VAULT_TOTAL_ASSETS_ABI, functionName: "totalAssets" })),
      head,
      { size: 500, gapMs: 300, label: "totalAssets" },
    );
    const ranked = usdcVaults
      .map((v, i) => ({ ...v, totalAssets: taResults[i].status === "success" ? taResults[i].result : null }))
      .filter((v) => v.totalAssets !== null && v.address !== targetVault)
      .sort((a, b) => (b.totalAssets > a.totalAssets ? 1 : b.totalAssets < a.totalAssets ? -1 : 0));
    const top2 = ranked.slice(0, 2);
    console.error(
      `  top 2 (excluding study vault): ${top2.map((v) => `${v.name} (${v.symbol}) ${v.address} — ${fmtUSDC(v.totalAssets)} USDC`).join("; ")}`,
    );
    for (const v of top2) {
      results.push(await probeVault(env, client, catalog, v.address));
    }
  }

  console.error(`\nDone. ${logRequestCount} eth_getLogs requests made on the metered lane (BASE_BACKFILL_RPC_URL).`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.stack || err.message || err);
  process.exit(1);
});
