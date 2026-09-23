/**
 * Censuses every MetaMorpho vault deployed by Morpho's two Base factories and writes
 * lib/morpho-base/vault-catalog.ts.
 *
 *   node scripts/census-morpho-base-vaults.mjs
 *
 * THE BOX KEEPS THIS ROSTER CURRENT; THIS FILE IS THE FALLBACK. Since 2026-09-21
 * rails-server writes the same roster every morning (census-vault-positions.ts
 * --chain 8453, table vault_roster, mig 283) and the pages read it over the baked
 * file (lib/morpho-base/vault-roster.ts) whenever it contains every baked row. A
 * re-run here is no longer what brings a new vault onto the site; it moves the
 * floor the pages fall back to when the box cannot be read.
 *
 * WHY A CATALOG AT ALL: a MetaMorpho vault is an independent contract, not a row in a
 * registry — neither factory exposes an enumeration (`isMetaMorpho(address)` answers for an
 * address you already hold; there is no `vaultsLength()`). The only list is the
 * `CreateMetaMorpho` log, and that cannot be read at request time. So the roster is generated
 * here and shipped as data, the same way scripts/census-morpho-markets.mjs ships the markets.
 *
 * WHY THIS ROSTER IS A FLOOR, NOT A TOTAL — the one way it differs from the market census.
 * Morpho Blue is a singleton whose only market-making entry point is `createMarket()`, so its
 * log is exhaustive. MetaMorpho is a CONTRACT: anyone can compile and deploy one directly,
 * with no factory involved and therefore no `CreateMetaMorpho` event, and the resulting vault
 * works exactly like a factory-made one. `isMetaMorpho()` on either factory answers false for
 * such a vault, so there is no membership test that would find it either. This roster is
 * therefore every vault the FACTORIES made, as of the census block — a floor on the vaults
 * that exist, never a total.
 *
 * WHAT IS BAKED. Four fields: asset, the creation block, and the name/symbol the vault
 * answered AT THE CENSUS BLOCK. Only the first two are immutable —
 *
 *   • `asset()` is `immutable` on MetaMorpho, and the census proves it: all 505 vaults'
 *     `asset()` agrees with the asset their own CreateMetaMorpho log indexed. That check is
 *     an assertion here, not a formality.
 *   • NAME AND SYMBOL ARE NOT. MetaMorpho V1.1 added owner-callable `setName`/`setSymbol`,
 *     and they are used: 44 of the 505 vaults answer a different `name()` than their creation
 *     log carries and 26 a different `symbol()` — "Ionic Ecosystem USDC" is now "Extrafi
 *     XLend USDC", and one vault created with an empty name is now "Gauntlet sUSDS Core".
 *     So the log is HISTORY, the contract is the present, and the roster bakes the contract's
 *     answer at the census block, labelled as a snapshot. Anything that must state a vault's
 *     current name reads it at its own pinned block (lib/sources/chain/morpho-base-vault.ts
 *     does; the vault page's H1 is that read, never this row).
 *
 * Everything else MUTABLE — curator, owner, the withdraw queue, totalAssets, a holder's
 * balance — is read at a pinned block by the loader and never lives here. (`decimals()` is
 * read during the census too, but as an assertion that the address really answers as a vault,
 * not as a baked field.)
 *
 * WHERE THE LOG COMES FROM, and the two lanes that could NOT serve it (measured 2026-09-05):
 *
 *   • BASE_RPC_URL — Alchemy free tier. `eth_getLogs` caps at TEN BLOCKS: 20 seconds of
 *     chain, useless for a census. (It IS a full archive for `eth_call`, which is what every
 *     state read below runs on.)
 *   • BASE_LOGS_RPC_URL — Tenderly's public Base gateway, the lane
 *     scripts/census-morpho-markets.mjs uses. It now refuses any range over 1,000 blocks
 *     ("Block range too large for public access"). Loudly, at least.
 *   • BASE_HYPERRPC_URL — HyperRPC. It answered the v1.0 whole-life query 200 OK with
 *     THIRTY-SEVEN logs where the range holds 120. No error, no truncation flag: a census
 *     built on it would have shipped a third of the roster as the whole of it.
 *   • BASE_BACKFILL_RPC_URL — a metered Alchemy Base endpoint. Answers the whole-life query
 *     in under a second, and agrees with a chunked sweep of the same range. This is the lane.
 *
 * Because a silent truncation is exactly what one lane already did, the sweep is run TWICE
 * per factory — once whole-life, once in bounded chunks — and the two sets must be identical
 * or the census refuses to write. A short roster that reads as a complete one is the failure
 * this guards; the counts alone would not have caught it, since 37 is a perfectly plausible
 * number of vaults.
 *
 * A NOTE ON TOPIC FILTERS. `CreateMetaMorpho` indexes both `metaMorpho` and `asset`, and the
 * full-archive Base endpoint silently IGNORES a second indexed-topic filter and answers every
 * topic0 match. Nothing here relies on a server-side topic1/topic2 filter: the query is
 * address + topic0 only, and every log is re-checked in code before it is taken.
 *
 * Needs BASE_RPC_URL and BASE_BACKFILL_RPC_URL in .env.local.
 */
import { createPublicClient, http, parseAbi, decodeAbiParameters } from "viem";
import { base } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.BASE_RPC_URL) throw new Error("need BASE_RPC_URL in .env.local");
if (!env.BASE_BACKFILL_RPC_URL) throw new Error("need BASE_BACKFILL_RPC_URL in .env.local — see the header");

const OUT = "lib/morpho-base/vault-catalog.ts";
const LOGS_URL = env.BASE_BACKFILL_RPC_URL;

/** The two MetaMorpho factories on Base. Both emit the same event; a vault's factory says
 *  which implementation it is, which is why it rides in the row (V1.0 has no `lostAssets()`
 *  ledger, V1.1 does, and the loader must not read a revert as a zero). */
const FACTORIES = [
  { version: "v1.0", address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101" },
  { version: "v1.1", address: "0xFf62A7c278C62eD665133147129245053Bbf5918" },
];

/** keccak("CreateMetaMorpho(address,address,address,uint256,address,string,string,bytes32)") */
const CREATE_TOPIC = "0xed8c95d05909b0f217f3e68171ef917df4b278d5addfe4dda888e90279be7d1d";

/** The event's NON-indexed parameters, in order. THREE parameters are indexed, not two —
 *  metaMorpho (topic1), caller (topic2) and asset (topic3) — which is why the asset is read
 *  off topic3 below and `caller` is absent from this list. Decoding the data against the
 *  flat signature instead throws PositionOutOfBounds on the first log, which is the loud
 *  failure that found this. */
const CREATE_DATA = [
  { name: "initialOwner", type: "address" },
  { name: "initialTimelock", type: "uint256" },
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "salt", type: "bytes32" },
];

const client = createPublicClient({
  chain: base,
  transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3, retryDelay: 900 }),
});

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

/** One JSON-RPC POST at the wide-range logs endpoint. A JSON-RPC error is a FAILED census,
 *  not an empty one — it throws rather than coercing to []. A swallowed error here would
 *  publish an empty roster as a complete one. */
async function post(method, params) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 180_000);
  try {
    const res = await fetch(LOGS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`logs endpoint HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(`RPC error: ${JSON.stringify(j.error).slice(0, 300)}`);
    if (j.result === undefined) throw new Error(`RPC envelope carried no result: ${JSON.stringify(j).slice(0, 300)}`);
    return j.result;
  } finally {
    clearTimeout(timer);
  }
}

/** The block a contract's code first exists at, by bisection on `eth_getCode` — self-
 *  verifying against any archive node, unlike a deployment block read off a docs page. */
async function firstCodeBlock(address, hi) {
  let lo = 0;
  const hasCode = async (b) => ((await client.getCode({ address, blockNumber: BigInt(b) })) ?? "0x") !== "0x";
  if (!(await hasCode(hi))) throw new Error(`${address} has no code at block ${hi} — not a deployed contract`);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await hasCode(mid)) hi = mid;
    else lo = mid + 1;
    await sleep(60);
  }
  return lo;
}

const head = Number(await client.getBlockNumber());
console.error(`Base head ${head.toLocaleString("en-US")}`);

/** Take every CreateMetaMorpho this factory emitted in [from, to], keyed by vault address.
 *  Never trusts the server-side filter: the emitter and topic0 are re-checked in code, and
 *  the indexed vault/asset are read off the topics rather than from a topic1 predicate the
 *  endpoint may have ignored. */
async function sweep(factory, from, to, chunk) {
  const found = new Map();
  for (let lo = from; lo <= to; lo += chunk) {
    const hi = Math.min(lo + chunk - 1, to);
    const logs = await post("eth_getLogs", [
      {
        address: factory.address,
        topics: [CREATE_TOPIC],
        fromBlock: `0x${lo.toString(16)}`,
        toBlock: `0x${hi.toString(16)}`,
      },
    ]);
    if (!Array.isArray(logs)) throw new Error(`getLogs did not return an array: ${JSON.stringify(logs).slice(0, 200)}`);
    for (const log of logs) {
      if ((log.address ?? "").toLowerCase() !== factory.address.toLowerCase()) continue;
      if ((log.topics?.[0] ?? "").toLowerCase() !== CREATE_TOPIC) continue;
      if (log.topics.length !== 4) continue;
      const address = `0x${log.topics[1].slice(26).toLowerCase()}`;
      if (found.has(address)) continue;
      const [, , name, symbol] = decodeAbiParameters(CREATE_DATA, log.data);
      found.set(address, {
        address,
        factory: factory.version,
        createdBlock: parseInt(log.blockNumber, 16),
        logName: name,
        logSymbol: symbol,
        asset: `0x${log.topics[3].slice(26).toLowerCase()}`,
      });
    }
    await sleep(150);
  }
  return found;
}

const vaults = [];
const perFactory = [];
for (const f of FACTORIES) {
  const from = await firstCodeBlock(f.address, head);
  console.error(`${f.version} factory ${f.address} — first code at block ${from.toLocaleString("en-US")}`);
  // Whole-life in one request, then the same range in 2M-block chunks. One lane already
  // answered a whole-life query 200 OK with a third of the logs (see the header), so the two
  // sweeps must agree before anything is written.
  const whole = await sweep(f, from, head, head - from + 1);
  const chunked = await sweep(f, from, head, 2_000_000);
  const a = [...whole.keys()].sort().join(",");
  const b = [...chunked.keys()].sort().join(",");
  if (a !== b)
    throw new Error(
      `${f.version}: whole-life sweep found ${whole.size} vaults, chunked sweep ${chunked.size} — the log lane is truncating; refusing to write`,
    );
  // A factory that answers ZERO is a failed read, not an empty factory: both of these have
  // been making vaults for over a year. Refuse to write a roster built on one.
  if (whole.size === 0) throw new Error(`${f.version} factory returned no CreateMetaMorpho logs — refusing to write`);
  vaults.push(...whole.values());
  console.error(`  ${whole.size} vaults — whole-life and chunked sweeps agree`);
  perFactory.push({ ...f, from, count: whole.size });
}
vaults.sort((a, b) => a.createdBlock - b.createdBlock || a.address.localeCompare(b.address));
console.error(`${vaults.length} vaults across both factories`);

// ── the four baked fields, read from the vaults themselves ───────────────────
// The CONTRACT is the authority for all of them. `asset()` must agree with the asset its own
// creation log indexed — it is immutable, so a disagreement means the decode is wrong and the
// census must not write. `name()`/`symbol()` are NOT asserted against the log: V1.1 lets the
// owner rename a vault, and dozens have. Their divergence is counted and reported instead, so
// a run that suddenly renamed every vault would still be visible.
const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function asset() view returns (address)",
  "function decimals() view returns (uint8)",
]);
const FACTORY_ABI = parseAbi(["function isMetaMorpho(address) view returns (bool)"]);

/** Paced, sequential chunks. Alchemy's per-second throttle cascades into account-level 429s
 *  when a census fires chunks in parallel, so this waits between calls rather than racing. */
async function pacedMulticall(contracts, size = 120, gapMs = 150) {
  const out = [];
  for (let i = 0; i < contracts.length; i += size) {
    out.push(
      ...(await client.multicall({
        contracts: contracts.slice(i, i + size),
        allowFailure: true,
        batchSize: 0,
      })),
    );
    process.stderr.write(`\r  metadata ${Math.min(i + size, contracts.length)}/${contracts.length}`);
    await sleep(gapMs);
  }
  process.stderr.write("\n");
  return out;
}

const meta = await pacedMulticall(
  vaults.flatMap((v) => [
    { address: v.address, abi: VAULT_ABI, functionName: "name" },
    { address: v.address, abi: VAULT_ABI, functionName: "symbol" },
    { address: v.address, abi: VAULT_ABI, functionName: "asset" },
    { address: v.address, abi: VAULT_ABI, functionName: "decimals" },
  ]),
);
let assetDrift = 0;
let renamed = 0;
let resymboled = 0;
let unread = 0;
vaults.forEach((v, i) => {
  const [n, s, a, d] = [meta[i * 4], meta[i * 4 + 1], meta[i * 4 + 2], meta[i * 4 + 3]];
  if (n.status !== "success" || s.status !== "success" || a.status !== "success" || d.status !== "success") {
    unread++;
    return;
  }
  if (a.result.toLowerCase() !== v.asset) assetDrift++;
  if (n.result !== v.logName) renamed++;
  if (s.result !== v.logSymbol) resymboled++;
  v.name = n.result;
  v.symbol = s.result;
  v.decimals = Number(d.result);
});
if (unread > 0) throw new Error(`${unread}/${vaults.length} vaults would not answer name/symbol/asset/decimals`);
if (assetDrift > 0)
  throw new Error(`${assetDrift}/${vaults.length} vaults' asset() disagrees with their own creation log — refusing`);
console.error(`  ✓ all ${vaults.length} vaults' asset() matches their creation log, and all answer decimals()`);
console.error(`  ${renamed} renamed and ${resymboled} re-symboled since creation (V1.1 setName/setSymbol)`);

// Cross-check a sample against the factory's own membership test: the log is history, this is
// the factory answering now. They must agree.
const sample = vaults.filter((_, i) => i % 17 === 0);
const member = await pacedMulticall(
  sample.map((v) => ({
    address: FACTORIES.find((f) => f.version === v.factory).address,
    abi: FACTORY_ABI,
    functionName: "isMetaMorpho",
    args: [v.address],
  })),
);
const notMember = sample.filter((_, i) => member[i].status !== "success" || member[i].result !== true).length;
if (notMember > 0)
  throw new Error(`${notMember}/${sample.length} sampled vaults are not isMetaMorpho on their factory — refusing`);
console.error(`  ✓ ${sample.length} sampled vaults are isMetaMorpho() on the factory that emitted them`);

const block = Number(await client.getBlockNumber());

// Assets repeat heavily — a hundred-odd vaults share one USDC. Intern them so the module
// stays a readable size; the vault addresses themselves are unique and are written out.
const interned = [];
const index = new Map();
const ref = (a) => {
  let i = index.get(a);
  if (i === undefined) {
    i = interned.length;
    interned.push(a);
    index.set(a, i);
  }
  return i;
};
const rows = vaults.map((v) => [
  v.address,
  v.factory === "v1.1" ? 1 : 0,
  v.createdBlock,
  v.name,
  v.symbol,
  ref(v.asset),
]);
const esc = (s) => JSON.stringify(s);

const out = `// GENERATED by scripts/census-morpho-base-vaults.mjs — do not edit by hand; re-run it.
//
// Every MetaMorpho vault the two Morpho factories deployed on Base, censused at block
// ${block.toLocaleString("en-US")}: ${perFactory.map((f) => `${f.count} from ${f.version}`).join(", ")}.
//
// THIS ROSTER IS A FLOOR, NOT A TOTAL. MetaMorpho is a contract, not a registry entry: anyone
// can compile and deploy one directly, with no factory involved and therefore no
// CreateMetaMorpho event, and that vault works exactly like a factory-made one.
// \`isMetaMorpho()\` answers false for it on both factories, so no membership test would find
// it either. What is written down here is every vault the FACTORIES made, as of the census
// block above — vaults deployed another way, and vaults created since, are absent. That is the
// opposite of lib/morpho-base/market-catalog.ts, whose roster IS complete because Blue is a
// singleton with one market-making entry point.
//
// FOUR FIELDS ARE BAKED, and only two of them are immutable. \`asset()\` is \`immutable\` on
// MetaMorpho and the census proves it — all ${vaults.length} vaults' \`asset()\` agrees with the asset their
// own creation log indexed — and a creation block is history. \`name\`/\`symbol\` are NOT
// immutable: MetaMorpho V1.1 added owner-callable \`setName\`/\`setSymbol\`, and at this census
// ${renamed} vaults answered a different name than their creation log carries and ${resymboled} a different
// symbol. So those two are a SNAPSHOT at the census block, fit for naming a vault in a roster
// and not for stating what a vault is called now: a surface that must say a vault's current
// name reads it at its own pinned block (lib/sources/chain/morpho-base-vault.ts does, and the
// vault page's H1 is that read).
//
// Everything else MUTABLE — curator, owner, the withdraw queue, totalAssets, a holder's
// balance — is read at a pinned block by the loader and never lives here.

/** The block this roster was censused at. Vaults created after it are absent until re-run. */
export const MORPHO_BASE_VAULT_CENSUS_BLOCK = ${block};

/** The two factories, with the block each factory's own code first appears at (bisected on
 *  eth_getCode) — the floor of the census sweep, and re-derivable against any archive node. */
export const MORPHO_BASE_METAMORPHO_FACTORIES: readonly {
  version: MorphoBaseVaultFactory;
  address: string;
  firstBlock: number;
  vaults: number;
}[] = [
${perFactory
  .map(
    (f) =>
      `  { version: "${f.version}", address: "${f.address.toLowerCase()}", firstBlock: ${f.from}, vaults: ${f.count} },`,
  )
  .join("\n")}
];

/** Vault asset addresses, interned — ${interned.length} distinct across ${vaults.length} vaults. */
const A: readonly string[] = [
${interned.map((a) => `  "${a}",`).join("\n")}
];

/** [address, factory (0 = v1.0, 1 = v1.1), createdBlock, name, symbol, asset→A] */
type Row = readonly [string, 0 | 1, number, string, string, number];

const ROWS: readonly Row[] = [
${rows.map((r) => `  [${esc(r[0])}, ${r[1]}, ${r[2]}, ${esc(r[3])}, ${esc(r[4])}, ${r[5]}],`).join("\n")}
];

/** Which MetaMorpho implementation a vault is. V1.0 has no \`lostAssets()\` ledger and reverts
 *  on the call; V1.1 answers it. The loader must read that revert as "no such ledger", never
 *  as a zero. */
export type MorphoBaseVaultFactory = "v1.0" | "v1.1";

export interface MorphoBaseVaultCatalogEntry {
  /** Lowercased vault address. */
  address: string;
  factory: MorphoBaseVaultFactory;
  /** The block its CreateMetaMorpho log was emitted at. */
  createdBlock: number;
  /** The ERC20 name and symbol of the vault's share token AS OF THE CENSUS BLOCK. Mutable on
   *  V1.1 (owner-callable setName/setSymbol) — a snapshot, not an identity. */
  name: string;
  symbol: string;
  /** The ERC-4626 underlying — \`asset()\`, immutable. Lowercased. */
  asset: string;
}

/** The roster, in creation order. A FLOOR — see the header. */
export const MORPHO_BASE_VAULTS: readonly MorphoBaseVaultCatalogEntry[] = ROWS.map((r) => ({
  address: r[0],
  factory: r[1] === 1 ? "v1.1" : "v1.0",
  createdBlock: r[2],
  name: r[3],
  symbol: r[4],
  asset: A[r[5]],
}));

const BY_ADDRESS = new Map(MORPHO_BASE_VAULTS.map((v) => [v.address, v]));

/** The catalogued vault at \`addr\`, or undefined. Case-insensitive; a miss means "not in this
 *  census", which is NOT the same as "not a MetaMorpho vault" — the roster is a floor. */
export function morphoBaseVaultByAddress(addr: string): MorphoBaseVaultCatalogEntry | undefined {
  return BY_ADDRESS.get(addr.toLowerCase());
}
`;
const outPath = path.join(ROOT, OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.error(`wrote ${OUT} — ${vaults.length} vaults, ${interned.length} distinct assets, census block ${block}`);
