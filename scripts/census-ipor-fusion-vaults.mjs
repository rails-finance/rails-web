#!/usr/bin/env node
/**
 * Censuses every vault the IPOR Fusion factory proxies made on Ethereum, Arbitrum
 * and Base, and writes lib/ipor-fusion/vault-catalog.ts.
 *
 *   node scripts/census-ipor-fusion-vaults.mjs
 *
 * rails-ops `TO-DO-ipor-scoping.md` §6.1; the ownership rule is decision `0027`
 * (the deploying factory proves whose vault it is; endorsement is a badge).
 *
 * ── WHICH VAULTS ─────────────────────────────────────────────────────────────
 * `FusionFactory` is a proxy per chain. `clone()` and `cloneSupervised()` build a
 * vault stack in one transaction and emit
 *   FusionInstanceCreated(uint256 index, uint256 version, string assetName,
 *     string assetSymbol, uint8 assetDecimals, address underlyingToken,
 *     string underlyingTokenSymbol, uint8 underlyingTokenDecimals,
 *     address initialOwner, address plasmaVault, address plasmaVaultBase,
 *     address feeManager)
 * with no indexed field. That log is the enumeration. The sweep asks for every
 * log the proxy emitted (address filter only, no topic) from its creation block to
 * the census block, so a creation event under another signature cannot slip past
 * a topic filter; it shows as an unrecognised topic and leaves a gap in the index
 * check below.
 *
 * TWO SIGNATURES ARE DECODED. Factory builds from ipor-fusion PR #269 until #276
 * (June 2025) emitted `FusionInstanceCreated(uint256 index, FusionInstance)`, the
 * fields in a struct and no `version`; Base's clones 1 to 4 carry it (census
 * 2026-11-18). Those rows have `version: null`.
 *
 * `isFusionVault(vault)` is a registry the factory gained after launch: the
 * source says vaults created before that upgrade answer false. It is recorded as a
 * badge at the census block and decides nothing here.
 *
 * WHY THIS ROSTER IS A FLOOR. A `PlasmaVault` can be deployed by hand, and the
 * earliest IPOR vaults predate the factory; neither emits `FusionInstanceCreated`.
 * Vaults created after the census block are absent until a re-run.
 *
 * ── HOW THE SWEEP IS CHECKED ─────────────────────────────────────────────────
 * The factory counts its clones (`getFusionFactoryIndex()`), and each event
 * carries the index the clone took. At the census block the events found must
 * number the index and carry each of 1..index once; any gap or surplus refuses
 * to write. Emitter and block range are re-checked on every log. Every vault must
 * answer `asset()` with the `underlyingToken` its event named.
 *
 * ── THE FIRST BLOCK ─────────────────────────────────────────────────────────
 * Each sweep starts at the proxy's creation block. On Ethereum and Base that is
 * the block of the creation transaction the explorer's contract page names
 * (Etherscan, Basescan; hashes below), read back with `eth_getTransactionReceipt`
 * and checked against the receipt's `contractAddress`. Arbiscan refused the page
 * (HTTP 403, 2026-11-18), so on Arbitrum it is the first block with the proxy's
 * code, by bisection on `eth_getCode`.
 *
 * ── THE BUDGET ──────────────────────────────────────────────────────────────
 * Hard caps, counted per call: `eth_getLogs` Ethereum 5, Base 10, Arbitrum 50;
 * `eth_call` 3,000 across the run. Each sweep is tried as one whole-range request;
 * a lane that refuses the range is walked in `chunk`-block windows only when the
 * window count fits the chain's cap, and otherwise the run stops before the first
 * window. A rate limit backs off and retries the same request, and each retry
 * counts. Vault reads go through Multicall3, 50 vaults to a call.
 *
 * Needs (in `.env.local`, read, never printed — only presence is logged):
 * `ALCHEMY_URL` and `ETHEREUM_LOGS_RPC_URL` (Ethereum state and logs),
 * `BASE_RPC_URL` and `BASE_BACKFILL_RPC_URL` (Base), `ARBITRUM_RPC_URL` and
 * optionally `ARBITRUM_LOGS_RPC_URL` (Arbitrum; logs fall back to the state lane).
 * These are the lanes `lib/shared/chains.ts` names for each chain.
 */

import { decodeEventLog, decodeFunctionResult, encodeFunctionData, parseAbi, toEventSelector } from "viem";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "lib/ipor-fusion/vault-catalog.ts";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const VAULTS_PER_MULTICALL = 50;
const ETH_CALL_CAP = 3000;

const CHAINS = [
  {
    key: "ethereum",
    name: "Ethereum",
    chainId: 1,
    factory: "0xcd05909C4A1F8E501e4ED554cEF4Ed5E48D9b852",
    stateEnv: "ALCHEMY_URL",
    logsEnvs: ["ETHEREUM_LOGS_RPC_URL", "ALCHEMY_URL"],
    creationTx: "0xc39069959a9c29667a790fa256a5c5ad7d9c2c55b53ca9b07e70231bdb2e4385",
    creationSource: "Etherscan contract page, creation transaction",
    logsCap: 5,
    chunk: 2_000_000,
    pinDepth: 5n,
  },
  {
    key: "arbitrum",
    name: "Arbitrum",
    chainId: 42161,
    factory: "0x134fCAce7a2C7Ef3dF2479B62f03ddabAEa922d5",
    stateEnv: "ARBITRUM_RPC_URL",
    logsEnvs: ["ARBITRUM_LOGS_RPC_URL", "ARBITRUM_RPC_URL"],
    creationTx: null,
    creationSource: "first block with the proxy's code (eth_getCode bisection; Arbiscan answered 403)",
    logsCap: 50,
    chunk: 10_000_000,
    pinDepth: 100n,
  },
  {
    key: "base",
    name: "Base",
    chainId: 8453,
    factory: "0x1455717668fA96534f675856347A973fA907e922",
    stateEnv: "BASE_RPC_URL",
    logsEnvs: ["BASE_BACKFILL_RPC_URL"],
    creationTx: "0xd2379ab619c4152f845da30c42e51aa294d7f99adfacf474e6021da01466ba96",
    creationSource: "Basescan contract page, creation transaction",
    logsCap: 10,
    chunk: 2_500_000,
    pinDepth: 10n,
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtN = (n) => Number(n).toLocaleString("en-US");
const lc = (a) => (a ? a.toLowerCase() : a);
const hex = (n) => `0x${BigInt(n).toString(16)}`;

// ── env ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const k = line.slice(0, line.indexOf("=")).trim();
    let v = line.slice(line.indexOf("=") + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  for (const c of CHAINS) {
    if (!env[c.stateEnv]) throw new Error(`need ${c.stateEnv} in .env.local`);
    c.logsEnv = c.logsEnvs.find((k) => env[k]);
    if (!c.logsEnv) throw new Error(`need one of ${c.logsEnvs.join(", ")} in .env.local`);
    c.stateUrl = env[c.stateEnv];
    c.logsUrl = env[c.logsEnv];
    console.error(`env: ${c.name} state ${c.stateEnv} set, logs ${c.logsEnv} set`);
  }
}

// ── ABIs ─────────────────────────────────────────────────────────────────
const CREATED_EVENT = parseAbi([
  "event FusionInstanceCreated(uint256 index, uint256 version, string assetName, string assetSymbol, uint8 assetDecimals, address underlyingToken, string underlyingTokenSymbol, uint8 underlyingTokenDecimals, address initialOwner, address plasmaVault, address plasmaVaultBase, address feeManager)",
]);
const CREATED_TOPIC = toEventSelector(CREATED_EVENT[0]);
const LEGACY_CREATED_EVENT = parseAbi([
  "struct FusionInstance { string assetName; string assetSymbol; uint8 assetDecimals; address underlyingToken; string underlyingTokenSymbol; uint8 underlyingTokenDecimals; address initialOwner; address plasmaVault; address plasmaVaultBase; address accessManager; address feeManager; address rewardsManager; address withdrawManager; address contextManager; address priceManager; }",
  "event FusionInstanceCreated(uint256 index, FusionInstance fusionInstance)",
]);
const LEGACY_CREATED_TOPIC = toEventSelector(LEGACY_CREATED_EVENT.find((x) => x.type === "event"));
const FACTORY_ABI = parseAbi([
  "function getFusionFactoryIndex() view returns (uint256)",
  "function getFusionFactoryVersion() view returns (uint256)",
  "function isFusionVault(address) view returns (bool)",
]);
const VAULT_ABI = parseAbi([
  "function asset() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalAssets() view returns (uint256)",
]);
const MULTICALL3_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);

// ── counted JSON-RPC ─────────────────────────────────────────────────────
const counts = {}; // counts[chainKey][method]
let ethCallsTotal = 0;

function isRateLimit(status, error) {
  return (
    status === 429 || error?.code === -32005 || /rate limit|compute units|too many requests/i.test(error?.message ?? "")
  );
}

/** One counted JSON-RPC request. Every attempt counts, retries included, and each is
 *  checked against its cap before it goes out. Errors other than a rate limit come
 *  back to the caller as `{ error }` so a range refusal can be told apart. */
async function rpc(chain, url, method, params) {
  for (let attempt = 1; ; attempt++) {
    const c = (counts[chain.key] ??= {});
    if (method === "eth_getLogs" && (c[method] ?? 0) + 1 > chain.logsCap)
      throw new Error(`${chain.name}: eth_getLogs cap ${chain.logsCap} would be crossed — stopping`);
    if (method === "eth_call" && ethCallsTotal + 1 > ETH_CALL_CAP)
      throw new Error(`eth_call cap ${ETH_CALL_CAP} would be crossed — stopping`);
    c[method] = (c[method] ?? 0) + 1;
    if (method === "eth_call") ethCallsTotal++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    let status, j;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ac.signal,
      });
      status = res.status;
      j = JSON.parse(await res.text());
    } catch (e) {
      if (attempt >= 3) throw new Error(`${chain.name} ${method}: ${e.message} after ${attempt} attempts`);
      await sleep(1000 * attempt);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (isRateLimit(status, j?.error)) {
      if (attempt >= 4) throw new Error(`${chain.name} ${method}: rate limit persisted after ${attempt} attempts`);
      await sleep(1500 * attempt);
      continue;
    }
    return j;
  }
}

async function call(chain, to, data, block) {
  const j = await rpc(chain, chain.stateUrl, "eth_call", [{ to, data }, hex(block)]);
  if (j.error) throw new Error(`${chain.name} eth_call ${to}: ${JSON.stringify(j.error).slice(0, 200)}`);
  return j.result;
}

async function readFactory(chain, functionName, args, block) {
  const data = encodeFunctionData({ abi: FACTORY_ABI, functionName, args });
  return decodeFunctionResult({ abi: FACTORY_ABI, functionName, data: await call(chain, chain.factory, data, block) });
}

// ── the first block ──────────────────────────────────────────────────────
async function firstBlock(chain, pinned) {
  if (chain.creationTx) {
    const j = await rpc(chain, chain.stateUrl, "eth_getTransactionReceipt", [chain.creationTx]);
    const r = j.result;
    if (!r) throw new Error(`${chain.name}: no receipt for ${chain.creationTx}`);
    if (lc(r.contractAddress) !== lc(chain.factory))
      throw new Error(`${chain.name}: ${chain.creationTx} created ${r.contractAddress}, not the factory proxy`);
    return parseInt(r.blockNumber, 16);
  }
  const hasCode = async (b) => {
    const j = await rpc(chain, chain.stateUrl, "eth_getCode", [chain.factory, hex(b)]);
    if (j.error) throw new Error(`${chain.name} eth_getCode: ${JSON.stringify(j.error).slice(0, 200)}`);
    return (j.result ?? "0x") !== "0x";
  };
  let lo = 0;
  let hi = Number(pinned);
  if (!(await hasCode(hi))) throw new Error(`${chain.name}: factory has no code at ${hi}`);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await hasCode(mid)) hi = mid;
    else lo = mid + 1;
    await sleep(60);
  }
  return lo;
}

// ── the sweep ────────────────────────────────────────────────────────────
async function getLogs(chain, from, to) {
  return rpc(chain, chain.logsUrl, "eth_getLogs", [{ address: chain.factory, fromBlock: hex(from), toBlock: hex(to) }]);
}

/** Every log the proxy emitted in [from,to]: one whole-range request, or `chunk`-block
 *  windows when the lane refuses the range and the windows fit the cap. */
async function sweep(chain, from, to) {
  const whole = await getLogs(chain, from, to);
  let windows = [[from, to, whole]];
  if (whole.error) {
    const n = Math.ceil((to - from + 1) / chain.chunk);
    const used = counts[chain.key].eth_getLogs;
    console.error(
      `  ${chain.name}: whole-range getLogs refused (${JSON.stringify(whole.error).slice(0, 160)}); ${n} windows of ${fmtN(chain.chunk)}`,
    );
    if (used + n > chain.logsCap)
      throw new Error(
        `${chain.name}: ${n} windows would take eth_getLogs to ${used + n}, over the cap of ${chain.logsCap} — stopping`,
      );
    windows = [];
    for (let lo = from; lo <= to; lo += chain.chunk) {
      const hi = Math.min(lo + chain.chunk - 1, to);
      const j = await getLogs(chain, lo, hi);
      if (j.error) throw new Error(`${chain.name} getLogs [${lo},${hi}]: ${JSON.stringify(j.error).slice(0, 200)}`);
      windows.push([lo, hi, j]);
      await sleep(200);
    }
  }
  const logs = [];
  for (const [lo, hi, j] of windows) {
    if (!Array.isArray(j.result)) throw new Error(`${chain.name} getLogs [${lo},${hi}]: non-array result`);
    for (const log of j.result) {
      if (lc(log.address) !== lc(chain.factory))
        throw new Error(`${chain.name}: log from ${log.address}, not the proxy`);
      const block = parseInt(log.blockNumber, 16);
      if (block < lo || block > hi) throw new Error(`${chain.name}: log at ${block} outside asked [${lo},${hi}]`);
      logs.push(log);
    }
  }
  return logs;
}

// ── Multicall3 at the census block ───────────────────────────────────────
async function multicall(chain, calls, block) {
  const data = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [calls.map((c) => ({ target: c.target, allowFailure: true, callData: c.data }))],
  });
  const res = decodeFunctionResult({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    data: await call(chain, MULTICALL3, data, block),
  });
  return res.map((r, i) => {
    if (!r.success || r.returnData === "0x") return null;
    try {
      return decodeFunctionResult({ abi: calls[i].abi, functionName: calls[i].functionName, data: r.returnData });
    } catch {
      return null;
    }
  });
}

// ── one chain ────────────────────────────────────────────────────────────
async function censusChain(chain) {
  const headJ = await rpc(chain, chain.stateUrl, "eth_blockNumber", []);
  const pinned = BigInt(headJ.result) - chain.pinDepth;
  const blockJ = await rpc(chain, chain.stateUrl, "eth_getBlockByNumber", [hex(pinned), false]);
  const pinnedIso = new Date(parseInt(blockJ.result.timestamp, 16) * 1000).toISOString();
  console.error(`${chain.name}: census block ${fmtN(pinned)} (${pinnedIso})`);

  const factoryIndex = Number(await readFactory(chain, "getFusionFactoryIndex", [], pinned));
  const factoryVersion = Number(await readFactory(chain, "getFusionFactoryVersion", [], pinned));
  const first = await firstBlock(chain, pinned);
  console.error(
    `  first block ${fmtN(first)} (${chain.creationSource}); factory index ${factoryIndex}, version ${factoryVersion}`,
  );

  const logs = await sweep(chain, first, Number(pinned));
  const otherTopics = new Map();
  let legacyCount = 0;
  const vaults = [];
  for (const log of logs) {
    const topic = lc(log.topics?.[0]);
    let args;
    if (topic === CREATED_TOPIC) {
      args = decodeEventLog({ abi: CREATED_EVENT, data: log.data, topics: log.topics }).args;
    } else if (topic === LEGACY_CREATED_TOPIC) {
      const legacy = decodeEventLog({ abi: LEGACY_CREATED_EVENT, data: log.data, topics: log.topics }).args;
      args = { index: legacy.index, version: null, ...legacy.fusionInstance };
      legacyCount++;
    } else {
      otherTopics.set(topic, (otherTopics.get(topic) ?? 0) + 1);
      continue;
    }
    vaults.push({
      address: lc(args.plasmaVault),
      index: Number(args.index),
      version: args.version === null ? null : Number(args.version),
      createdBlock: parseInt(log.blockNumber, 16),
      createdTx: lc(log.transactionHash),
      eventName: args.assetName,
      eventSymbol: args.assetSymbol,
      shareDecimals: args.assetDecimals,
      asset: {
        address: lc(args.underlyingToken),
        symbol: args.underlyingTokenSymbol,
        decimals: args.underlyingTokenDecimals,
      },
      initialOwner: lc(args.initialOwner),
      plasmaVaultBase: lc(args.plasmaVaultBase),
      feeManager: lc(args.feeManager),
    });
  }
  console.error(
    `  ${logs.length} proxy logs: ${vaults.length} FusionInstanceCreated (${legacyCount} under the struct signature); other topics ${otherTopics.size ? [...otherTopics].map(([t, n]) => `${t.slice(0, 10)}×${n}`).join(", ") : "none"}`,
  );

  // The index proves the sweep: each of 1..factoryIndex once.
  const seen = new Map(vaults.map((v) => [v.index, v]));
  if (seen.size !== vaults.length) throw new Error(`${chain.name}: an index appears twice — refusing`);
  if (new Set(vaults.map((v) => v.address)).size !== vaults.length)
    throw new Error(`${chain.name}: one vault address appears in two events — refusing`);
  const missing = [];
  for (let i = 1; i <= factoryIndex; i++) if (!seen.has(i)) missing.push(i);
  const extra = vaults.filter((v) => v.index < 1 || v.index > factoryIndex).map((v) => v.index);
  if (missing.length || extra.length)
    throw new Error(
      `${chain.name}: events do not match getFusionFactoryIndex() ${factoryIndex} — missing ${missing.length} (${missing.slice(0, 10).join(",")}), outside ${extra.length} (${extra.slice(0, 10).join(",")}); refusing`,
    );
  vaults.sort((a, b) => a.index - b.index);

  // Each vault's answers, and the factory's registry answer about it.
  const PER = 5;
  const reads = [];
  for (let i = 0; i < vaults.length; i += VAULTS_PER_MULTICALL) {
    const slice = vaults.slice(i, i + VAULTS_PER_MULTICALL);
    const calls = slice.flatMap((v) => [
      ...["asset", "name", "symbol", "totalAssets"].map((functionName) => ({
        target: v.address,
        abi: VAULT_ABI,
        functionName,
        data: encodeFunctionData({ abi: VAULT_ABI, functionName }),
      })),
      {
        target: chain.factory,
        abi: FACTORY_ABI,
        functionName: "isFusionVault",
        data: encodeFunctionData({ abi: FACTORY_ABI, functionName: "isFusionVault", args: [v.address] }),
      },
    ]);
    reads.push(...(await multicall(chain, calls, pinned)));
    process.stderr.write(`\r  vault reads ${Math.min(i + VAULTS_PER_MULTICALL, vaults.length)}/${vaults.length}`);
    await sleep(250);
  }
  process.stderr.write("\n");
  const problems = [];
  vaults.forEach((v, i) => {
    const [asset, name, symbol, totalAssets, isFusionVault] = reads.slice(i * PER, i * PER + PER);
    if (lc(asset) !== v.asset.address)
      problems.push(`${v.address}: asset() ${asset} != its event's underlyingToken ${v.asset.address}`);
    if (isFusionVault === null) problems.push(`${v.address}: isFusionVault() unread`);
    Object.assign(v, { name, symbol, totalAssets, isFusionVault });
  });
  if (problems.length) throw new Error(`${chain.name}: refusing to write:\n  ${problems.join("\n  ")}`);

  return {
    key: chain.key,
    name: chain.name,
    chainId: chain.chainId,
    factory: lc(chain.factory),
    factoryVersion,
    factoryIndex,
    firstBlock: first,
    firstBlockSource: chain.creationSource,
    creationTx: chain.creationTx,
    censusBlock: Number(pinned),
    censusBlockIso: pinnedIso,
    vaults,
  };
}

// ── the catalogue, as a TypeScript module ────────────────────────────────────
const ts = (s) => JSON.stringify(s);

function renderChain(c) {
  const assets = [];
  const assetAt = new Map();
  for (const v of c.vaults) {
    if (assetAt.has(v.asset.address)) continue;
    assetAt.set(v.asset.address, assets.length);
    assets.push(v.asset);
  }
  const rows = c.vaults.map(
    (v) =>
      `      [${ts(v.address)}, ${v.index}, ${v.version}, ${v.createdBlock}, ${ts(v.createdTx)}, ${ts(v.name)}, ${ts(v.symbol)}, ${v.shareDecimals}, ${assetAt.get(v.asset.address)}, ${ts(v.initialOwner)}, ${ts(v.plasmaVaultBase)}, ${ts(v.feeManager)}, ${v.totalAssets === null ? "null" : ts(v.totalAssets.toString())}, ${v.isFusionVault}],`,
  );
  return `  ${c.key}: {
    chainId: ${c.chainId},
    factory: ${ts(c.factory)},
    factoryVersion: ${c.factoryVersion},
    factoryIndex: ${c.factoryIndex},
    firstBlock: ${c.firstBlock},
    firstBlockSource: ${ts(c.firstBlockSource)},
    censusBlock: ${c.censusBlock},
    censusBlockIso: ${ts(c.censusBlockIso)},
    assets: [
${assets.map((a) => `      [${ts(a.address)}, ${ts(a.symbol)}, ${a.decimals}],`).join("\n")}
    ],
    // One vault per line, so a re-run diffs by row.
    // prettier-ignore
    rows: [
${rows.join("\n")}
    ],
  },`;
}

function renderCatalogue(chains) {
  const summary = chains
    .map(
      (c) =>
        `//   ${c.name}: ${fmtN(c.vaults.length)} vaults at block ${fmtN(c.censusBlock)} (${c.censusBlockIso}), factory ${c.factory}`,
    )
    .join("\n");
  return `// GENERATED by scripts/census-ipor-fusion-vaults.mjs — do not edit by hand; re-run it.
//
// Every vault the IPOR Fusion factory proxies made on Ethereum, Arbitrum and Base,
// read from each proxy's \`FusionInstanceCreated\` log (rails-ops
// TO-DO-ipor-scoping.md §6.1, decision 0027):
${summary}
//
// THE ROSTER IS A FLOOR. It holds the factory-made vaults whose creation event the
// sweep found. Earlier or hand-deployed \`PlasmaVault\`s emit no such event and are
// absent, as are vaults created after the census block. On each chain the events
// matched the factory's \`getFusionFactoryIndex()\` one for one at the census block.
//
// \`isFusionVault\` IS A BADGE. The factory's registry was added after launch and
// answers false for vaults created before that upgrade; a false here does not
// make a vault any less factory-made. Clone is permissionless, so neither field
// says IPOR curates the vault.
//
// WHAT MOVES. Address, index, version, creation block and transaction, asset,
// share decimals, initial owner, vault base and fee manager come from the event
// and do not change. \`name\`, \`symbol\`, \`totalAssets\` (in the asset's base
// units) and \`isFusionVault\` are snapshots at the chain's census block; \`null\`
// marks a read that did not answer.
// \`version\` is null where the event used the struct signature of mid-2025
// factory builds, which carried none.

type Row = [
  address: string,
  index: number,
  version: number | null,
  createdBlock: number,
  createdTx: string,
  name: string | null,
  symbol: string | null,
  shareDecimals: number,
  asset: number,
  initialOwner: string,
  plasmaVaultBase: string,
  feeManager: string,
  totalAssets: string | null,
  isFusionVault: boolean,
];

interface ChainCensus {
  chainId: number;
  /** The \`IporFusionFactoryProxy\` whose events make the roster, lowercased. */
  factory: string;
  factoryVersion: number;
  /** \`getFusionFactoryIndex()\` at the census block: the clones the proxy counts. */
  factoryIndex: number;
  /** The block the sweep starts at, and where that number came from. */
  firstBlock: number;
  firstBlockSource: string;
  censusBlock: number;
  censusBlockIso: string;
  /** Interned assets: [address, symbol from the event, decimals]. */
  assets: readonly [string, string, number][];
  rows: readonly Row[];
}

interface IporFusionVault {
  address: string;
  index: number;
  /** The factory version the event stamped; null under the struct signature, which carried none. */
  version: number | null;
  createdBlock: number;
  createdTx: string;
  name: string | null;
  symbol: string | null;
  shareDecimals: number;
  asset: { address: string; symbol: string; decimals: number };
  initialOwner: string;
  plasmaVaultBase: string;
  feeManager: string;
  /** Base units of the asset at the census block, as a decimal string. */
  totalAssets: string | null;
  isFusionVault: boolean;
}

const CENSUS = {
${chains.map(renderChain).join("\n")}
} satisfies Record<string, ChainCensus>;

function expand({ assets, rows, ...census }: ChainCensus) {
  return {
    ...census,
    vaults: rows.map(
      (r): IporFusionVault => ({
        address: r[0],
        index: r[1],
        version: r[2],
        createdBlock: r[3],
        createdTx: r[4],
        name: r[5],
        symbol: r[6],
        shareDecimals: r[7],
        asset: { address: assets[r[8]][0], symbol: assets[r[8]][1], decimals: assets[r[8]][2] },
        initialOwner: r[9],
        plasmaVaultBase: r[10],
        feeManager: r[11],
        totalAssets: r[12],
        isFusionVault: r[13],
      }),
    ),
  };
}

/** Per chain: the census block, the factory, and the vault roster in index order. A FLOOR — see the header. */
export const IPOR_FUSION_CENSUS = {
${chains.map((c) => `  ${c.key}: expand(CENSUS.${c.key}),`).join("\n")}
};
`;
}

// ── report ───────────────────────────────────────────────────────────────
function report(c) {
  const funded = c.vaults.filter((v) => v.totalAssets !== null && v.totalAssets > 0n);
  const unread = c.vaults.filter((v) => v.totalAssets === null).length;
  const notRegistered = c.vaults.filter((v) => !v.isFusionVault).length;
  const fmtUnits = (v) => {
    const d = BigInt(10) ** BigInt(v.asset.decimals);
    const whole = v.totalAssets / d;
    const frac = ((v.totalAssets % d) * 100n) / d;
    return `${whole.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")} ${v.asset.symbol}`;
  };
  console.error(
    `\n${c.name}: first block ${fmtN(c.firstBlock)} (${c.firstBlockSource}), census block ${fmtN(c.censusBlock)}; ${c.vaults.length} events (index ${c.factoryIndex}); ${funded.length} with totalAssets > 0, ${unread} unread; ${notRegistered} answer isFusionVault false`,
  );
  // Ranked by asset units with no price, so vaults of different assets compare only roughly.
  const top = [...funded].sort((a, b) => {
    const x = Number(a.totalAssets) / 10 ** a.asset.decimals;
    const y = Number(b.totalAssets) / 10 ** b.asset.decimals;
    return y - x;
  });
  for (const v of top.slice(0, 5)) console.error(`  ${v.address} ${ts(v.name)} — ${fmtUnits(v)}`);
  const cnt = Object.entries(counts[c.key]);
  console.error(
    `  calls this run: ${cnt.length ? cnt.map(([m, n]) => `${m} ${n}`).join(", ") : "none (from the cache)"}`,
  );
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  loadEnv();
  // IPOR_CENSUS_CACHE=<file> keeps each finished chain, so a run that stops on a
  // later chain does not spend a finished chain's budget again.
  const cacheFile = process.env.IPOR_CENSUS_CACHE;
  const cache = cacheFile && fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
  const results = [];
  for (const chain of CHAINS) {
    if (cache[chain.key]) {
      const c = cache[chain.key];
      for (const v of c.vaults) v.totalAssets = v.totalAssets === null ? null : BigInt(v.totalAssets);
      counts[chain.key] = {};
      console.error(`${chain.name}: from ${cacheFile}, census block ${fmtN(c.censusBlock)}`);
      results.push(c);
      continue;
    }
    const c = await censusChain(chain);
    results.push(c);
    if (cacheFile) {
      cache[chain.key] = c;
      fs.writeFileSync(
        cacheFile,
        JSON.stringify(cache, (_, x) => (typeof x === "bigint" ? x.toString() : x)),
      );
    }
  }
  const outPath = path.join(ROOT, OUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderCatalogue(results));
  for (const c of results) report(c);
  const liquity = "0xb9e806e8f2d94c015ffefa90cd24ecce18f1663c";
  const hit = results[0].vaults.find((v) => v.address === liquity);
  console.error(
    `\nLiquity ETH Carry ${liquity}: ${hit ? `in the Ethereum roster, index ${hit.index}, isFusionVault ${hit.isFusionVault}` : "NOT in the Ethereum roster"}`,
  );
  console.error(`eth_call total ${ethCallsTotal} (cap ${ETH_CALL_CAP}); wrote ${OUT}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.stack || err.message || err);
  for (const [k, v] of Object.entries(counts)) console.error(`  ${k} calls: ${JSON.stringify(v)}`);
  console.error(`  eth_call total ${ethCallsTotal}`);
  process.exit(1);
});
