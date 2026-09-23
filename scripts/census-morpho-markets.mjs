/**
 * Censuses every Morpho Blue market on a chain and writes that chain's market-catalog.ts.
 *
 *   node scripts/census-morpho-markets.mjs              # Ethereum → lib/morpho/
 *   node scripts/census-morpho-markets.mjs --chain base # Base     → lib/morpho-base/
 *
 * WHY A CATALOG AT ALL: Morpho Blue is a singleton, not a factory, and it exposes no way to
 * enumerate its markets — `idToMarketParams(id)` answers for an id you already have, and
 * there is no `marketsLength()`. The only complete list is the `CreateMarket` log, which
 * cannot be read at request time. So the roster is generated here and shipped as data.
 *
 * WHY THIS ROSTER IS A TOTAL, NOT A FLOOR: `createMarket()` is the singleton's only entry
 * point for creating a market and it always emits `CreateMarket`. There is no direct-deploy
 * bypass of the kind that makes the vault register's factory census a floor
 * (scripts/census-vault-register.mjs). Every market that exists is in this log.
 *
 * WHY BAKING THE PARAMS IS SAFE — and self-verifying: a market's params are immutable, and
 * its id IS keccak256(abi.encode(params)). So the catalog cannot drift from the chain
 * without the hash disagreeing, and this script re-derives every id from its own baked
 * params before writing (every one must match, or it refuses to write). That is exactly the
 * opposite of the vault register, whose curator/gates/adapters are mutable and are
 * therefore never baked. Only mutable state — market() totals, rates — is read at head by
 * lib/sources/chain/morpho-markets.ts.
 *
 * Token symbols/decimals are deliberately NOT baked: lib/sources/chain/erc20-meta.ts already
 * resolves the long tail through a cached multicall, and it is the house resolver.
 *
 * The catalog is complete AS OF ITS CENSUS BLOCK. Markets created after it are absent until
 * this is re-run — re-run it; never hand-edit.
 *
 * WHERE THE LOG COMES FROM, and why it differs per chain. Ethereum reads the CreateMarket
 * log from Etherscan V2, which pages a whole-life query for free. **That key does not
 * extend to Base**: `chainid=8453` answers "Free API access is not supported for this
 * chain" (measured 2026-08-23). Base reads the log from BASE_RPC_URL: the Alchemy account
 * has been Pay As You Go since 2026-09-08, and PAYG answers a whole-life getLogs when the
 * answer is small — 4,306 CreateMarket logs in one request, measured 2026-09-19. (The first
 * census used Tenderly's public gateway, back when BASE_RPC_URL was a free tier capped at ten
 * blocks; by 2026-09-19 Tenderly refused any range over 1,000 blocks without an access key.)
 * The state cross-check runs on the same URL, which is a full archive for eth_call.
 *
 * Needs ALCHEMY_URL (+ ETHERSCAN_API_KEY on Ethereum); BASE_RPC_URL on Base.
 */
import { createPublicClient, http, parseAbi, decodeAbiParameters, encodeAbiParameters, keccak256 } from "viem";
import { base, mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// `.env.local` on the Mac; the process environment anywhere there is no file (a scheduled
// runner). A variable set in the environment wins over the file.
const envFile = path.join(ROOT, ".env.local");
const env = {
  ...(fs.existsSync(envFile)
    ? Object.fromEntries(
        fs
          .readFileSync(envFile, "utf8")
          .split("\n")
          .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
          .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
      )
    : {}),
  ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)),
};
/** Morpho Blue is the same vanity address on every chain it is deployed to — verified on
 *  Base 2026-08-23 (15,623 bytes of bytecode at the address below). It is a singleton, not
 *  a factory, so there is exactly one per chain. */
const MORPHO_BLUE = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const CHAINS = {
  ethereum: {
    id: 1,
    viem: mainnet,
    label: "Ethereum L1",
    rpcEnv: "ALCHEMY_URL",
    out: "lib/morpho/market-catalog.ts",
    reader: "lib/sources/chain/morpho-markets.ts",
    /** Etherscan V2 pages the whole-life log for free on chainid=1. */
    logs: { kind: "etherscan", chainId: 1 },
  },
  base: {
    id: 8453,
    viem: base,
    label: "Base",
    rpcEnv: "BASE_RPC_URL",
    out: "lib/morpho-base/market-catalog.ts",
    reader: "lib/sources/chain/morpho-markets.ts",
    /** See the header: Etherscan's free tier refuses Base, so the log comes from the
     *  Alchemy app itself, which answers the whole life in one request. */
    logs: { kind: "rpc", urlEnv: "BASE_RPC_URL" },
  },
};

const chainArg = (() => {
  const i = process.argv.indexOf("--chain");
  return i === -1 ? "ethereum" : (process.argv[i + 1] ?? "").toLowerCase();
})();
const CHAIN = CHAINS[chainArg];
if (!CHAIN) throw new Error(`unknown --chain "${chainArg}" — one of: ${Object.keys(CHAINS).join(", ")}`);
if (!env[CHAIN.rpcEnv]) throw new Error(`need ${CHAIN.rpcEnv} in .env.local or the environment`);
if (CHAIN.logs.kind === "etherscan" && !env.ETHERSCAN_API_KEY)
  throw new Error("need ETHERSCAN_API_KEY in .env.local or the environment");
/** keccak("CreateMarket(bytes32,(address,address,address,address,uint256))") */
const CREATE_MARKET_TOPIC = "0xac4b2400f169220b0c0afdde7a0b32e775ba727ea1cb30b35f935cdaab8683ac";
/** The canonical MarketParams struct — the tuple the id hashes. Order is load-bearing. */
const MARKET_PARAMS = [
  {
    type: "tuple",
    components: [
      { name: "loanToken", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "oracle", type: "address" },
      { name: "irm", type: "address" },
      { name: "lltv", type: "uint256" },
    ],
  },
];

const client = createPublicClient({
  chain: CHAIN.viem,
  transport: http(env[CHAIN.rpcEnv], { batch: false, retryCount: 3, retryDelay: 900 }),
});

/** Etherscan's error envelope must THROW, never coerce to [] — a swallowed NOTOK reads as
 *  "zero markets" and would publish an empty roster as a complete one. The same rule holds
 *  for the RPC path below: a JSON-RPC error is a failed census, not an empty one. */
async function getLogsEtherscan(fromBlock) {
  const url =
    `https://api.etherscan.io/v2/api?chainid=${CHAIN.logs.chainId}&module=logs&action=getLogs&address=${MORPHO_BLUE}` +
    `&topic0=${CREATE_MARKET_TOPIC}&fromBlock=${fromBlock}&toBlock=latest&page=1&offset=1000&apikey=${env.ETHERSCAN_API_KEY}`;
  const r = await (await fetch(url)).json();
  if (r.status === "1" && Array.isArray(r.result)) return r.result;
  if (typeof r.message === "string" && /No records found/i.test(r.message)) return [];
  throw new Error(`Etherscan NOT-OK: ${JSON.stringify(r).slice(0, 300)}`);
}

/** One whole-life eth_getLogs. A topic0-filtered sweep of the singleton comes back in one
 *  request — no paging, and therefore no chance of a paging bug silently truncating the
 *  roster. */
async function getLogsRpc() {
  const post = async (method, params) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180_000);
    try {
      const res = await fetch(env[CHAIN.logs.urlEnv], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ac.signal,
      });
      const j = await res.json();
      if (j.error) throw new Error(`RPC error: ${JSON.stringify(j.error).slice(0, 300)}`);
      return j.result;
    } finally {
      clearTimeout(timer);
    }
  };
  const head = parseInt(await post("eth_blockNumber", []), 16);
  const logs = await post("eth_getLogs", [
    { address: MORPHO_BLUE, topics: [CREATE_MARKET_TOPIC], fromBlock: "0x0", toBlock: `0x${head.toString(16)}` },
  ]);
  if (!Array.isArray(logs)) throw new Error(`getLogs did not return an array: ${JSON.stringify(logs).slice(0, 200)}`);
  return logs;
}

const take = (log, seen) => {
  const id = log.topics[1].toLowerCase();
  if (seen.has(id)) return;
  const [p] = decodeAbiParameters(MARKET_PARAMS, log.data);
  seen.set(id, {
    id,
    loanToken: p.loanToken.toLowerCase(),
    collateralToken: p.collateralToken.toLowerCase(),
    oracle: p.oracle.toLowerCase(),
    irm: p.irm.toLowerCase(),
    lltv: p.lltv.toString(),
    createdBlock: parseInt(log.blockNumber, 16),
  });
};

console.error(`censusing CreateMarket on ${MORPHO_BLUE} (${CHAIN.label}) …`);
const seen = new Map();
if (CHAIN.logs.kind === "rpc") {
  const logs = await getLogsRpc();
  console.error(`  ${logs.length} CreateMarket logs in one whole-life request`);
  for (const log of logs) take(log, seen);
} else {
  let from = 0;
  for (let page = 0; page < 60; page++) {
    const logs = await getLogsEtherscan(from);
    if (!logs.length) break;
    for (const log of logs) take(log, seen);
    if (logs.length < 1000) break;
    from = parseInt(logs[logs.length - 1].blockNumber, 16) + 1;
    await new Promise((s) => setTimeout(s, 250));
  }
}
const markets = [...seen.values()].sort((a, b) => a.createdBlock - b.createdBlock);
console.error(`  ${markets.length} markets`);

// The id IS the hash of the params: re-derive every one from what we are about to bake.
// A mismatch means the decode is wrong or the log lied — either way, do not write.
let bad = 0;
for (const m of markets) {
  const derived = keccak256(
    encodeAbiParameters(MARKET_PARAMS, [
      {
        loanToken: m.loanToken,
        collateralToken: m.collateralToken,
        oracle: m.oracle,
        irm: m.irm,
        lltv: BigInt(m.lltv),
      },
    ]),
  );
  if (derived.toLowerCase() !== m.id) bad++;
}
if (bad > 0) throw new Error(`${bad}/${markets.length} ids do not match keccak(params) — refusing to write`);
console.error(`  ✓ all ${markets.length} ids reproduce from their own params`);

// Cross-check a sample against the singleton's own idToMarketParams: the log is history,
// this is the contract answering now. They must agree.
const blueAbi = parseAbi([
  "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
]);
const sample = markets.filter((_, i) => i % 37 === 0);
const onChain = await client.multicall({
  contracts: sample.map((m) => ({
    address: MORPHO_BLUE,
    abi: blueAbi,
    functionName: "idToMarketParams",
    args: [m.id],
  })),
  allowFailure: true,
});
let drift = 0;
sample.forEach((m, i) => {
  const r = onChain[i];
  if (r.status !== "success") return void drift++;
  const [loan, coll, oracle, irm, lltv] = r.result;
  if (
    loan.toLowerCase() !== m.loanToken ||
    coll.toLowerCase() !== m.collateralToken ||
    oracle.toLowerCase() !== m.oracle ||
    irm.toLowerCase() !== m.irm ||
    lltv.toString() !== m.lltv
  )
    drift++;
});
if (drift > 0)
  throw new Error(`${drift}/${sample.length} sampled markets disagree with idToMarketParams — refusing to write`);
console.error(`  ✓ ${sample.length} sampled markets agree with the singleton's own idToMarketParams`);

const block = Number(await client.getBlockNumber());
const lltvs = [...new Set(markets.map((m) => m.lltv))].sort((a, b) => Number(BigInt(b) - BigInt(a)));
console.error(`  ${lltvs.length} distinct LLTVs · census block ${block}`);

// Addresses repeat heavily across the roster (a handful of IRMs serve nearly all of it,
// against ~100 loan tokens). Intern them so the module stays a readable size.
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
const rows = markets.map((m) => [
  m.id,
  ref(m.loanToken),
  ref(m.collateralToken),
  ref(m.oracle),
  ref(m.irm),
  m.lltv,
  m.createdBlock,
]);

const rerun = chainArg === "ethereum" ? "" : ` --chain ${chainArg}`;
const out = `// GENERATED by scripts/census-morpho-markets.mjs${rerun} — do not edit by hand; re-run it.
//
// Every Morpho Blue market on ${CHAIN.label}, censused at block ${block.toLocaleString()}.
//
// This roster is COMPLETE, not a floor. Morpho Blue is a singleton whose only market-creating
// entry point is createMarket(), which always emits CreateMarket — there is no direct-deploy
// bypass of the kind that makes the vault register's factory census a floor. Every market that
// exists is here, as of the census block above.
//
// The params are baked because they are IMMUTABLE, and the bake is self-verifying: a market's
// id is keccak256(abi.encode(params)), so these rows cannot drift from the chain without the
// hash disagreeing. The census script re-derives all ${markets.length} ids before writing, and
// scripts/verify-morpho-markets-chain.mjs re-checks them against the singleton. Everything
// MUTABLE — supply, borrow, rates — is read at the head by ${CHAIN.reader}
// and never lives here.
//
// Token symbols/decimals are not baked either: lib/sources/chain/erc20-meta.ts resolves them
// through its cached multicall, which is the house resolver for exactly this long tail.

/** The block this roster was censused at. Markets created after it are absent until re-run. */
export const MORPHO_MARKET_CENSUS_BLOCK = ${block};

/** Addresses interned — the same IRM and loan tokens recur across ${markets.length} markets. */
const A: readonly string[] = ${JSON.stringify(interned, null, 0).replace(/","/g, '",\n  "').replace(/^\["/, '[\n  "').replace(/"\]$/, '",\n]')};

/** [id, loanToken→A, collateralToken→A, oracle→A, irm→A, lltv (WAD), createdBlock] */
type Row = readonly [string, number, number, number, number, string, number];

const ROWS: readonly Row[] = [
${rows.map((r) => `  ["${r[0]}", ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, "${r[5]}", ${r[6]}],`).join("\n")}
];

export interface MorphoMarketCatalogEntry {
  /** 0x-prefixed market id — keccak256(abi.encode(params)). */
  id: string;
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  /** Liquidation LTV, WAD. Both the borrow limit and the liquidation line — Morpho has one. */
  lltv: string;
  createdBlock: number;
}

/** The roster, in creation order. */
export const MORPHO_MARKETS: readonly MorphoMarketCatalogEntry[] = ROWS.map((r) => ({
  id: r[0],
  loanToken: A[r[1]],
  collateralToken: A[r[2]],
  oracle: A[r[3]],
  irm: A[r[4]],
  lltv: r[5],
  createdBlock: r[6],
}));
`;
const outPath = path.join(ROOT, CHAIN.out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.error(`wrote ${CHAIN.out} — ${markets.length} markets, ${interned.length} distinct addresses`);
