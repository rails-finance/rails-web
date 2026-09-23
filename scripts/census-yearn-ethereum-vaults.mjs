#!/usr/bin/env node
/**
 * Censuses every vault the Yearn V3 factories deployed on Ethereum and writes
 * lib/yearn/vault-catalog.ts.
 *
 *   node scripts/census-yearn-ethereum-vaults.mjs
 *
 * THE BOX KEEPS THIS ROSTER CURRENT; THIS FILE IS THE FALLBACK. Since 2026-09-21
 * rails-server runs the same census weekly (census-vault-roster.ts, table
 * vault_roster, mig 283) and the pages read it over the baked file
 * (lib/yearn/vault-roster.ts) whenever it contains every baked row. A re-run here
 * is no longer what brings a new vault onto the site; it moves the floor the
 * pages fall back to when the box cannot be read.
 *
 * The rule this implements is rails-ops decision `0027` point 5: the roster is
 * everything the factories made, and "endorsed" is a badge read at a pinned block.
 *
 * ── THE ROSTER IS TWO STEPS, AND ONLY THE FIRST IS AN `eth_call` ───────────────
 *  1. WHICH FACTORIES. `ReleaseRegistry.numReleases()` then `factories(i)` on the
 *     LIVE release registry `0x0377b4da…7198`. NOT the address
 *     `Registry.releaseRegistry()` returns: that pointer (`0x99008917…d17B`) stops
 *     at three releases and knows nothing of the 3.0.4 and 3.1.0 factories, which
 *     made more than half the vaults (130 of 247 at 2026-09-19, none of them
 *     endorsed, one of them holding 70M USDC). The stale pointer is still read
 *     here, so the output states per factory whether it would have been seen
 *     through it, and the run fails loudly if the pointer ever overtakes the live
 *     registry (that would mean Yearn moved registries again and the constant
 *     below is the stale one).
 *  2. WHICH VAULTS. A `VaultFactory` keeps no list: `deploy_new_vault()` makes a
 *     minimal proxy and emits `NewVault(vault_address indexed, asset indexed)`, and
 *     that log is the only enumeration. The Registry is no substitute —
 *     `getAllEndorsedVaults()` answers the endorsed subset alone, and it mixes in
 *     tokenized strategies no factory made (90 endorsed addresses at 2026-09-19,
 *     42 of them factory vaults).
 *
 * WHY THIS ROSTER IS A FLOOR. The factories are permissionless, so the log holds
 * every vault they made; but `VaultV3` is a contract anyone can deploy without a
 * factory, and that vault emits no `NewVault`. Vaults created after the census
 * block are absent until a re-run. The 2026-07-15 census counted 246, so a run
 * that finds fewer has lost logs and refuses to write.
 *
 * ── THE LOG SWEEP PROVES ITSELF THREE WAYS ───────────────────────────────────
 * A logs lane has answered a whole-life query 200 OK with a third of the logs
 * before (scripts/census-morpho-base-vaults.mjs header), and 120 is as plausible a
 * vault count as 247. So per factory: one whole-life request and one chunked sweep
 * of the same range must return the same vault set; where `ETHERSCAN_API_KEY` is
 * set, Etherscan's log index must agree too; and every vault must answer
 * `FACTORY()` with the factory whose log named it, `apiVersion()` with that
 * factory's release, and `asset()` with the asset its log indexed. Any
 * disagreement refuses to write. Only address + topic0 are filtered server-side;
 * emitter, topic0 and topic count are re-checked in code on every log.
 *
 * ── WHAT IS BAKED, AND WHICH OF IT MOVES ─────────────────────────────────────
 * Immutable: address, factory, apiVersion, asset, createdBlock. A SNAPSHOT at the
 * pinned block: name and symbol (3.0.4 and 3.1.0 vaults answer `setName`; a 3.0.2
 * vault has no such function), totalAssets, totalSupply, and `endorsed` — Yearn
 * can remove an endorsement, so the boolean is only ever true "at block N" and the
 * file carries N beside it.
 * Every state read runs at ONE pinned block. The pin sits a few blocks behind
 * head so the logs lane and the state lane have both seen it.
 *
 * A vault whose `totalAssets()` does not answer is written as `null`, never as
 * zero. An asset whose `symbol()` does not decode as a string (the bytes32
 * generation of ERC-20s) is `null` the same way.
 *
 * PACING. Multicall3 chunks run one at a time with a gap, without viem's `batch`:
 * Alchemy's per-second throttle escalates into account-level 429s when chunks
 * race. A 429 or rate-limit error on the logs lane backs off and retries the same
 * range; it is not a cue to shrink it.
 *
 * Needs (in `.env.local`, read, never printed — only presence is logged):
 * `ALCHEMY_URL` (eth_call / eth_getCode / Multicall3, archive),
 * `ETHEREUM_LOGS_RPC_URL` (wide `eth_getLogs`; LOCAL-ONLY, falls back to
 * `ALCHEMY_URL`, whose ten-block cap will then fail the sweep loudly),
 * `ETHERSCAN_API_KEY` (the second log source; optional, and the run says so when
 * it goes without).
 *
 * THE OUTPUT IS A TYPESCRIPT MODULE, `lib/yearn/vault-catalog.ts`, imported by
 * lib/sources/chain/yearn-ethereum-vault-directory.ts — the roster the Yearn
 * explorer reads state over. It carries only what does not move (address,
 * factory, apiVersion, asset, createdBlock) plus the name and symbol snapshot;
 * `totalAssets`, `totalSupply` and `endorsed` are read live at the loader's own
 * pinned block and are counted here for the run's own report, not written down.
 */

import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "lib/yearn/vault-catalog.ts";

/** The release registry Yearn's deployer writes new releases to. */
const LIVE_RELEASE_REGISTRY = "0x0377b4daDDA86C89A0091772B79ba67d0E5F7198";
/** Yearn's V3 vault registry: `isEndorsed()`, and the stale `releaseRegistry()` pointer. */
const REGISTRY = "0xff31A1B020c868F6eA3f61Eb953344920EeCA3af";

/** The 2026-07-15 census (rails-ops register spec §3). A catalogue only grows. */
const FLOOR_COUNT = 246;

/** keccak256("NewVault(address,address)") — both parameters indexed, no data. */
const NEW_VAULT_TOPIC = "0x4241302c393c713e690702c4a45a57e93cef59aa8c6e2358495853b3420551d8";

/** How far behind head the run pins, so both lanes have the block. */
const PIN_DEPTH = 5n;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtN = (n) => Number(n).toLocaleString("en-US");
const lc = (a) => (a ? a.toLowerCase() : a);
const topicAddress = (t) => `0x${t.slice(26).toLowerCase()}`;

// ── env ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const k = line.slice(0, line.indexOf("=")).trim();
    let v = line.slice(line.indexOf("=") + 1).trim();
    // ETHEREUM_LOGS_RPC_URL is double-quoted in this repo's .env.local; the rest are bare.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");
  console.error(
    `env: ALCHEMY_URL set, ETHEREUM_LOGS_RPC_URL ${env.ETHEREUM_LOGS_RPC_URL ? "set" : "MISSING — falling back to ALCHEMY_URL"}, ETHERSCAN_API_KEY ${env.ETHERSCAN_API_KEY ? "set" : "MISSING — the Etherscan cross-check will not run"}`,
  );
  return { ...env, LOGS_URL: env.ETHEREUM_LOGS_RPC_URL || env.ALCHEMY_URL };
}

// ── ABIs ─────────────────────────────────────────────────────────────────
const RELEASE_REGISTRY_ABI = parseAbi([
  "function numReleases() view returns (uint256)",
  "function factories(uint256) view returns (address)",
]);
const REGISTRY_ABI = parseAbi([
  "function releaseRegistry() view returns (address)",
  "function isEndorsed(address) view returns (bool)",
  "function getAllEndorsedVaults() view returns (address[][])",
]);
const FACTORY_ABI = parseAbi(["function apiVersion() view returns (string)"]);
const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function apiVersion() view returns (string)",
  "function FACTORY() view returns (address)",
]);
const ERC20_ABI = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

// ── the logs lane ────────────────────────────────────────────────────────
function isRateLimit(status, error) {
  return status === 429 || error?.code === -32005 || /rate limit|compute units/i.test(error?.message ?? "");
}

/** One `eth_getLogs` of EXACTLY [from,to]. A rate limit backs off and retries the same
 *  range. Any other JSON-RPC error is a FAILED census and throws: coercing it to [] would
 *  publish a short roster as a complete one. */
async function getLogs(url, address, from, to) {
  for (let attempt = 1; ; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    let status, j;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getLogs",
          params: [
            {
              address,
              topics: [NEW_VAULT_TOPIC],
              fromBlock: `0x${from.toString(16)}`,
              toBlock: `0x${to.toString(16)}`,
            },
          ],
        }),
        signal: ac.signal,
      });
      status = res.status;
      j = JSON.parse(await res.text());
    } catch (e) {
      if (attempt > 6) throw new Error(`getLogs [${from},${to}]: ${e.message} after ${attempt} attempts`);
      await sleep(800 * attempt);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (isRateLimit(status, j.error)) {
      if (attempt > 10) throw new Error(`getLogs [${from},${to}]: rate limit persisted after ${attempt} attempts`);
      await sleep(Math.min(500 * attempt, 8000));
      continue;
    }
    if (j.error) throw new Error(`getLogs [${from},${to}]: ${JSON.stringify(j.error).slice(0, 300)}`);
    if (!Array.isArray(j.result)) throw new Error(`getLogs [${from},${to}]: non-array result`);
    return j.result;
  }
}

/** Every NewVault this factory emitted in [from,to], keyed by vault address, in `chunk`-block
 *  requests. Emitter, topic0, topic count and block range are re-checked on every log. */
async function sweep(url, factory, from, to, chunk) {
  const found = new Map();
  for (let lo = from; lo <= to; lo += chunk) {
    const hi = Math.min(lo + chunk - 1, to);
    for (const log of await getLogs(url, factory, lo, hi)) {
      if (lc(log.address) !== lc(factory)) continue;
      if (lc(log.topics?.[0]) !== NEW_VAULT_TOPIC || log.topics.length !== 3) continue;
      const block = parseInt(log.blockNumber, 16);
      if (block < lo || block > hi) throw new Error(`getLogs: log at block ${block} outside asked [${lo},${hi}]`);
      const address = topicAddress(log.topics[1]);
      if (found.has(address)) throw new Error(`${factory} emitted NewVault twice for ${address}`);
      found.set(address, { address, createdBlock: block, logAsset: topicAddress(log.topics[2]) });
    }
    await sleep(150);
  }
  return found;
}

/** Etherscan's log index for the same factory and topic, as a vault-address set. The
 *  envelope throws on anything but a result array or its own "No records found". */
async function etherscanVaults(apiKey, factory, to) {
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs&address=${factory}&topic0=${NEW_VAULT_TOPIC}&fromBlock=0&toBlock=${to}&apikey=${apiKey}`;
  const j = await (await fetch(url)).json();
  if (j.message === "No records found") return new Set();
  if (j.status !== "1" || !Array.isArray(j.result))
    throw new Error(`etherscan getLogs for ${factory}: ${String(j.message)} ${String(j.result).slice(0, 120)}`);
  // One page holds 1,000 logs. A full page means there may be a second, and this does not page.
  if (j.result.length >= 1000) throw new Error(`etherscan returned a full page for ${factory} — add paging`);
  return new Set(j.result.map((l) => topicAddress(l.topics[1])));
}

// ── paced Multicall3 over ALCHEMY_URL, at the pinned block ───────────────────
async function pacedMulticall(client, contracts, blockNumber, { size = 240, gapMs = 250, label = "multicall" } = {}) {
  const out = [];
  for (let i = 0; i < contracts.length; i += size) {
    out.push(
      ...(await client.multicall({
        contracts: contracts.slice(i, i + size),
        allowFailure: true,
        batchSize: 0,
        blockNumber,
      })),
    );
    process.stderr.write(`\r  ${label} ${fmtN(Math.min(i + size, contracts.length))}/${fmtN(contracts.length)}`);
    await sleep(gapMs);
  }
  process.stderr.write("\n");
  return out;
}

/** The block a contract's code first exists at, by bisection on `eth_getCode` — the floor
 *  of that factory's sweep, re-derivable against any archive node. */
async function firstCodeBlock(client, address, hi) {
  let lo = 0;
  const hasCode = async (b) => ((await client.getCode({ address, blockNumber: BigInt(b) })) ?? "0x") !== "0x";
  if (!(await hasCode(hi))) throw new Error(`${address} has no code at block ${hi}`);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await hasCode(mid)) hi = mid;
    else lo = mid + 1;
    await sleep(60);
  }
  return lo;
}

async function walkFactories(client, releaseRegistry, pinned) {
  const n = await client.readContract({
    address: releaseRegistry,
    abi: RELEASE_REGISTRY_ABI,
    functionName: "numReleases",
    blockNumber: pinned,
  });
  const out = [];
  for (let i = 0n; i < n; i++) {
    out.push(
      lc(
        await client.readContract({
          address: releaseRegistry,
          abi: RELEASE_REGISTRY_ABI,
          functionName: "factories",
          args: [i],
          blockNumber: pinned,
        }),
      ),
    );
  }
  return out;
}

// ── the catalogue, as a TypeScript module ────────────────────────────────────
// A `.ts` and not JSON because the loader imports it: the asset's decimals and
// the api version reach the loader as types, and a hand-edit that broke the
// shape would be a compile error rather than a runtime surprise. The assets are
// interned (72 of them across 247 vaults) and each vault is a tuple, so the
// file is a table a reader can scan rather than 247 nested objects.
//
// WHAT IS LEFT OUT ON PURPOSE. `totalAssets`, `totalSupply` and `endorsed` were
// in the JSON this replaced. They move — Yearn can remove an endorsement, and a
// balance moves every block — and the directory loader reads all three live at
// its own pinned block, so writing them down would put a second, older answer in
// the tree beside the one the page draws.

const ts = (s) => JSON.stringify(s);

/** The catalogue module's source text, from the same `out` object the run built. */
export function renderCatalogue(out) {
  const assets = [];
  const assetAt = new Map();
  for (const v of out.vaults) {
    if (assetAt.has(v.asset.address)) continue;
    assetAt.set(v.asset.address, assets.length);
    assets.push(v.asset);
  }
  const factoryAt = new Map(out.factories.map((f, i) => [f.address, i]));
  const c = out.counts;
  const versions = out.factories.map((f) => ts(f.apiVersion)).join(" | ");

  return `// GENERATED by scripts/census-yearn-ethereum-vaults.mjs — do not edit by hand; re-run it.
//
// Every vault the ${out.factories.length} Yearn V3 factories deployed on Ethereum, censused at block
// ${fmtN(out.pinnedBlock)} (${out.pinnedBlockIso}): ${out.factories.map((f) => `${fmtN(f.vaults)} from ${f.apiVersion}`).join(", ")}.
//
// THIS ROSTER IS A FLOOR, NOT A TOTAL. \`VaultV3\` is a contract anyone can deploy
// directly, and a vault deployed without a factory emits no \`NewVault\` log, so no
// enumeration finds it; vaults created after the census block are absent until this
// script runs again. Two things that look like rosters are not: the pointer
// \`Registry.releaseRegistry()\` returns (${out.registries.staleReleaseRegistryPointer})
// stops at three releases and hides ${fmtN(c.hiddenByStalePointer)} of these vaults, and
// \`Registry.getAllEndorsedVaults()\` answers the endorsed subset mixed with
// ${fmtN(c.endorsedAddressesNoFactoryMade)} tokenized strategies no factory made. The live release registry
// ${out.registries.releaseRegistry} is what the sweep walks.
//
// FIVE FIELDS ARE BAKED AND THREE OF THEM CANNOT MOVE. \`asset()\` is immutable and
// the census proves it — every vault's \`asset()\` agrees with the asset its own
// \`NewVault\` log indexed — a creation block is history, and a vault's factory and
// its \`apiVersion()\` are both checked against the log's emitter. \`name\`/\`symbol\`
// are a SNAPSHOT at the census block: 3.0.4 and 3.1.0 vaults answer \`setName\`, so a
// surface that states what a vault is called now reads it at its own pinned block,
// as lib/sources/chain/yearn-ethereum-vault-directory.ts does.
//
// ENDORSEMENT IS NOT HERE. It is a badge Yearn can remove, true only "at block N",
// so it is read live beside the totals rather than written down. At the census
// block ${fmtN(c.endorsed)} of these ${fmtN(c.total)} were endorsed.

/** The block this roster was censused at. Vaults created after it are absent until re-run. */
export const YEARN_VAULT_CENSUS_BLOCK = ${out.pinnedBlock};

/** When that block was mined, ISO-8601 UTC — what a page prints beside the number. */
export const YEARN_VAULT_CENSUS_BLOCK_ISO = ${ts(out.pinnedBlockIso)};

/** Yearn's V3 vault registry — \`isEndorsed()\`, read live at the loader's block. */
export const YEARN_REGISTRY = ${ts(out.registries.registry)};

/** The api version a factory stamps on every vault it makes. */
export type YearnApiVersion = ${versions};

/** The factories, in release order, with the block each factory's own code first
 *  appears at and whether the stale \`releaseRegistry()\` pointer knows it. */
export const YEARN_V3_FACTORIES: readonly {
  release: number;
  apiVersion: YearnApiVersion;
  address: string;
  firstBlock: number;
  vaults: number;
  onStalePointer: boolean;
}[] = [
${out.factories
  .map(
    (f) =>
      `  { release: ${f.release}, apiVersion: ${ts(f.apiVersion)}, address: ${ts(f.address)}, firstBlock: ${f.firstBlock}, vaults: ${f.vaults}, onStalePointer: ${f.onStalePointer} },`,
  )
  .join("\n")}
];

/** Vault assets, interned — ${fmtN(c.distinctAssets)} distinct across ${fmtN(c.total)} vaults. [address, symbol, decimals] */
const A: readonly [string, string | null, number][] = [
${assets.map((a) => `  [${ts(a.address)}, ${ts(a.symbol)}, ${a.decimals}],`).join("\n")}
];

/** One vault per row, in creation order. [address, factory index, created block, name, symbol, asset index] */
const ROWS: readonly [string, number, number, string, string, number][] = [
${out.vaults
  .map(
    (v) =>
      `  [${ts(v.address)}, ${factoryAt.get(v.factory)}, ${v.createdBlock}, ${ts(v.name)}, ${ts(v.symbol)}, ${assetAt.get(v.asset.address)}],`,
  )
  .join("\n")}
];

export interface YearnVaultCatalogEntry {
  /** Lowercased vault address — the row's identity and its page's route. */
  address: string;
  /** The factory that emitted this vault's \`NewVault\` log, lowercased. */
  factory: string;
  /** That factory's release, which is also the vault's own \`apiVersion()\`. */
  apiVersion: YearnApiVersion;
  createdBlock: number;
  /** \`name()\` at the census block — a snapshot, not what it is called now. */
  name: string;
  /** \`symbol()\` at the census block — a snapshot, as \`name\` is. */
  symbol: string;
  /** The ERC-4626 underlying. \`symbol\` is null where it does not decode as a
   *  string (the bytes32 generation of ERC-20s); the address always stands. */
  asset: { address: string; symbol: string | null; decimals: number };
}

/** The roster, in creation order. A FLOOR — see the header. */
export const YEARN_VAULTS: readonly YearnVaultCatalogEntry[] = ROWS.map((r) => ({
  address: r[0],
  factory: YEARN_V3_FACTORIES[r[1]].address,
  apiVersion: YEARN_V3_FACTORIES[r[1]].apiVersion,
  createdBlock: r[2],
  name: r[3],
  symbol: r[4],
  asset: { address: A[r[5]][0], symbol: A[r[5]][1], decimals: A[r[5]][2] },
}));

// A vault is looked up through lib/yearn/vault-roster.ts, which serves the box's
// roster over this one.
`;
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnv();
  const client = createPublicClient({
    chain: mainnet,
    transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 8, retryDelay: 1200 }),
  });

  const pinned = (await client.getBlockNumber()) - PIN_DEPTH;
  const pinnedBlock = await client.getBlock({ blockNumber: pinned });
  const pinnedIso = new Date(Number(pinnedBlock.timestamp) * 1000).toISOString();
  console.error(`pinned block ${fmtN(pinned)} (${pinnedIso}) — every read below runs at it`);

  // 1. The factories, from the live release registry; the stale pointer beside them.
  const factoryAddresses = await walkFactories(client, LIVE_RELEASE_REGISTRY, pinned);
  if (factoryAddresses.length === 0) throw new Error("the live release registry answered zero releases — refusing");
  const stalePointer = lc(
    await client.readContract({
      address: REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "releaseRegistry",
      blockNumber: pinned,
    }),
  );
  const staleFactories = new Set(
    stalePointer === lc(LIVE_RELEASE_REGISTRY) ? factoryAddresses : await walkFactories(client, stalePointer, pinned),
  );
  const unknownToLive = [...staleFactories].filter((f) => !factoryAddresses.includes(f));
  if (unknownToLive.length)
    throw new Error(
      `Registry.releaseRegistry() ${stalePointer} names factories the "live" registry does not (${unknownToLive.join(", ")}) — LIVE_RELEASE_REGISTRY is no longer the live one; refusing`,
    );
  console.error(
    `${factoryAddresses.length} releases on the live registry; Registry.releaseRegistry() -> ${stalePointer} knows ${staleFactories.size} of them`,
  );

  // 2. The vaults each factory made, from its NewVault log.
  const factories = [];
  const vaults = [];
  for (const [i, address] of factoryAddresses.entries()) {
    const apiVersion = await client.readContract({
      address,
      abi: FACTORY_ABI,
      functionName: "apiVersion",
      blockNumber: pinned,
    });
    const firstBlock = await firstCodeBlock(client, address, Number(pinned));
    const whole = await sweep(env.LOGS_URL, address, firstBlock, Number(pinned), Number(pinned) - firstBlock + 1);
    const chunked = await sweep(env.LOGS_URL, address, firstBlock, Number(pinned), 500_000);
    const key = (m) => [...m.keys()].sort().join(",");
    if (key(whole) !== key(chunked))
      throw new Error(
        `${apiVersion}: whole-life sweep found ${whole.size} vaults, chunked sweep ${chunked.size} — the log lane is truncating; refusing to write`,
      );
    let etherscanChecked = false;
    if (env.ETHERSCAN_API_KEY) {
      const theirs = await etherscanVaults(env.ETHERSCAN_API_KEY, address, Number(pinned));
      if ([...theirs].sort().join(",") !== key(whole))
        throw new Error(
          `${apiVersion}: the logs lane found ${whole.size} vaults, Etherscan ${theirs.size} — refusing to write`,
        );
      etherscanChecked = true;
      await sleep(400);
    }
    console.error(
      `  release ${i} ${apiVersion} ${address} — first code at ${fmtN(firstBlock)}, ${whole.size} vaults (whole-life == chunked${etherscanChecked ? " == Etherscan" : ""})${staleFactories.has(address) ? "" : " — NOT on the stale pointer"}`,
    );
    factories.push({
      release: i,
      apiVersion,
      address,
      firstBlock,
      vaults: whole.size,
      onStalePointer: staleFactories.has(address),
    });
    for (const v of whole.values()) vaults.push({ ...v, factory: address, factoryApiVersion: apiVersion });
  }
  vaults.sort((a, b) => a.createdBlock - b.createdBlock || a.address.localeCompare(b.address));
  if (new Set(vaults.map((v) => v.address)).size !== vaults.length)
    throw new Error("one vault address appears under two factories — refusing");
  console.error(`${vaults.length} vaults across ${factories.length} factories`);
  if (vaults.length < FLOOR_COUNT)
    throw new Error(
      `${vaults.length} vaults is fewer than the ${FLOOR_COUNT} the 2026-07-15 census counted — logs are missing; refusing to write`,
    );

  // 3. Each vault's own answers, and the Registry's answer about it, at the pinned block.
  const PER = 9;
  const reads = await pacedMulticall(
    client,
    vaults.flatMap((v) => [
      ...["name", "symbol", "decimals", "asset", "totalAssets", "totalSupply", "apiVersion", "FACTORY"].map(
        (functionName) => ({ address: v.address, abi: VAULT_ABI, functionName }),
      ),
      { address: REGISTRY, abi: REGISTRY_ABI, functionName: "isEndorsed", args: [v.address] },
    ]),
    pinned,
    { label: "vault reads" },
  );
  const ok = (r) => (r.status === "success" ? r.result : null);
  const problems = [];
  vaults.forEach((v, i) => {
    const [name, symbol, decimals, asset, totalAssets, totalSupply, apiVersion, factory, endorsed] = reads
      .slice(i * PER, i * PER + PER)
      .map(ok);
    if (name === null || symbol === null || decimals === null)
      problems.push(`${v.address}: name/symbol/decimals unread`);
    if (lc(asset) !== v.logAsset) problems.push(`${v.address}: asset() ${asset} != its NewVault log's ${v.logAsset}`);
    if (lc(factory) !== v.factory) problems.push(`${v.address}: FACTORY() ${factory} != the emitter ${v.factory}`);
    if (apiVersion !== v.factoryApiVersion)
      problems.push(`${v.address}: apiVersion() ${apiVersion} != its factory's ${v.factoryApiVersion}`);
    if (endorsed === null) problems.push(`${v.address}: Registry.isEndorsed() unread`);
    Object.assign(v, { name, symbol, decimals, asset: lc(asset), totalAssets, totalSupply, endorsed });
  });
  if (problems.length) throw new Error(`refusing to write:\n  ${problems.join("\n  ")}`);
  console.error(
    `  ✓ all ${vaults.length} answer asset() as logged, FACTORY() as their emitter, apiVersion() as its release`,
  );

  // The Registry's own list must tell the same story as the per-vault isEndorsed() reads.
  const endorsedList = new Set(
    (
      await client.readContract({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "getAllEndorsedVaults",
        blockNumber: pinned,
      })
    )
      .flat()
      .map(lc),
  );
  const mismatch = vaults.filter((v) => v.endorsed !== endorsedList.has(v.address));
  if (mismatch.length)
    throw new Error(
      `isEndorsed() and getAllEndorsedVaults() disagree on ${mismatch.length} vaults (${mismatch[0].address}…) — refusing`,
    );
  const rosterSet = new Set(vaults.map((v) => v.address));
  const endorsedOffRoster = [...endorsedList].filter((a) => !rosterSet.has(a)).length;

  // 4. The assets. Shared heavily, so read once each.
  const assetAddresses = [...new Set(vaults.map((v) => v.asset))];
  const assetReads = await pacedMulticall(
    client,
    assetAddresses.flatMap((a) => [
      { address: a, abi: ERC20_ABI, functionName: "symbol" },
      { address: a, abi: ERC20_ABI, functionName: "decimals" },
    ]),
    pinned,
    { label: "asset reads" },
  );
  const assets = new Map(
    assetAddresses.map((a, i) => [a, { symbol: ok(assetReads[i * 2]), decimals: ok(assetReads[i * 2 + 1]) }]),
  );
  const unreadAssets = assetAddresses.filter((a) => assets.get(a).decimals === null);
  if (unreadAssets.length) throw new Error(`assets without decimals(): ${unreadAssets.join(", ")} — refusing`);
  for (const v of vaults) {
    if (v.decimals !== assets.get(v.asset).decimals)
      throw new Error(
        `${v.address}: decimals() ${v.decimals} != its asset's ${assets.get(v.asset).decimals} — refusing`,
      );
  }

  // ── write ──
  const endorsed = vaults.filter((v) => v.endorsed).length;
  const unreadTotalAssets = vaults.filter((v) => v.totalAssets === null).length;
  const empty = vaults.filter((v) => v.totalAssets === 0n).length;
  const hidden = vaults.filter((v) => !staleFactories.has(v.factory)).length;
  const out = {
    generatedBy: "scripts/census-yearn-ethereum-vaults.mjs — do not edit by hand; re-run it",
    family: "Yearn V3",
    chainId: 1,
    note: "Every vault the Yearn V3 factories deployed on Ethereum, as of the pinned block. A floor: a VaultV3 deployed without a factory emits no NewVault log, and vaults created after the pinned block are absent. name, symbol, totalAssets, totalSupply and endorsed are snapshots at the pinned block; address, factory, apiVersion, asset and createdBlock do not change.",
    pinnedBlock: Number(pinned),
    pinnedBlockTimestamp: Number(pinnedBlock.timestamp),
    pinnedBlockIso: pinnedIso,
    registries: {
      releaseRegistry: lc(LIVE_RELEASE_REGISTRY),
      registry: lc(REGISTRY),
      staleReleaseRegistryPointer: stalePointer,
    },
    counts: {
      total: vaults.length,
      endorsed,
      unendorsed: vaults.length - endorsed,
      empty,
      totalAssetsUnread: unreadTotalAssets,
      hiddenByStalePointer: hidden,
      endorsedAddressesNoFactoryMade: endorsedOffRoster,
      distinctAssets: assetAddresses.length,
    },
    factories,
    vaults: vaults.map((v) => ({
      address: v.address,
      factory: v.factory,
      apiVersion: v.factoryApiVersion,
      createdBlock: v.createdBlock,
      name: v.name,
      symbol: v.symbol,
      asset: { address: v.asset, symbol: assets.get(v.asset).symbol, decimals: assets.get(v.asset).decimals },
      totalAssets: v.totalAssets === null ? null : v.totalAssets.toString(),
      totalSupply: v.totalSupply === null ? null : v.totalSupply.toString(),
      endorsed: v.endorsed,
    })),
  };
  const outPath = path.join(ROOT, OUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderCatalogue(out));
  console.error(
    `wrote ${OUT} — ${vaults.length} vaults at block ${fmtN(pinned)}: ${endorsed} endorsed, ${vaults.length - endorsed} unendorsed; ${empty} hold nothing, ${unreadTotalAssets} would not answer totalAssets(); ${hidden} sit under factories the stale pointer omits; ${endorsedOffRoster} endorsed addresses are not factory vaults`,
  );
}

// The census runs when the file is RUN. Imported — which is how the catalogue's
// renderer is re-used without a chain sweep — it defines and does nothing.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("\nFAILED:", err.stack || err.message || err);
    process.exit(1);
  });
}
