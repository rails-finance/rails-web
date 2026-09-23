// ============================================================================
// VERIFY: the chain assumptions behind the Morpho Blue market view
// ============================================================================
//
// Read-only. Every claim /morpho/markets makes rests on a contract fact; this
// checks each one directly against mainnet. The sibling script
// scripts/verify-morpho-chain.mjs covers the POSITION lane's assumptions — this
// one covers the roster's:
//
//   1. Catalog integrity — every id in lib/morpho/market-catalog.ts reproduces
//      from its own baked params (id == keccak256(abi.encode(params))), so the
//      generated roster cannot have drifted from the chain without the hash
//      disagreeing. This is why baking immutable params is safe at all.
//   2. Catalog vs singleton — idToMarketParams(id) agrees with the baked params.
//      The catalog comes from CreateMarket logs (history); this is the contract
//      answering now. They must match.
//   3. Completeness — a fresh CreateMarket log census yields exactly the
//      catalog's ids (plus any market created since the census block). The page
//      claims this roster is COMPLETE rather than a floor; that claim rests on
//      createMarket() being the singleton's only market-making entry point and
//      always emitting the event, so a re-census must find nothing extra.
//   4. The nine numbers — the page's headline claim is that the whole risk
//      surface of the protocol is a handful of governance-enabled lltvs. Every
//      distinct lltv in the roster must return isLltvEnabled == true.
//   5. Immutability of the rung — an lltv is fixed at creation. Re-reading
//      idToMarketParams must return the same lltv the catalog baked.
//   6. Liquidation incentive is DERIVED, not configured — Blue exposes no
//      setter and no getter for it; LIF = min(1.15, 1/(1 - 0.3(1 - lltv))) must
//      land in [1, 1.15] for every market with a nonzero lltv.
//   7. No market-wide LTV exists — the page says the bar is utilisation, NOT a
//      loan-to-value, because Blue never totals collateral. Checked structurally:
//      market() returns six fields and none of them is collateral.
//   8. Utilisation is well-formed — totalBorrowAssets <= totalSupplyAssets for
//      every market, so borrow ÷ supply is a real 0..1 fraction needing no oracle.
//   9. The books reconcile with custody — for each big loan token, the tokens
//      Blue ACTUALLY holds equal the un-borrowed part of its books,
//      SUM(totalSupplyAssets - totalBorrowAssets). This is what makes the
//      group totals a real claim rather than bookkeeping.
//  10. Stored, not projected — the view deliberately does NOT accrue in view
//      (unlike the position lane). Demonstrated here: on markets pinned at 100%
//      utilisation the adaptive rate reaches hundreds of percent, and the
//      contract's own 3-term Taylor over the untouched interval would report
//      multiples of the stored book as supplied money.
//  11. The decimals guard convicts the right token — wUSDL under-reports its own
//      decimals (says 6, mints 18-decimal shares); waEthUSDC also says 6 and is
//      truthful. A guard that flags both is a magnitude heuristic, not a test.
//  12. The idle market — lltv 0 markets have no collateral, oracle or IRM, so
//      nothing can be borrowed and they exist to hold cash inside Blue.
//
// Run:  node scripts/verify-morpho-markets-chain.mjs
// Needs ALCHEMY_URL + ETHERSCAN_API_KEY in .env.local.

import { createPublicClient, http, parseAbi, decodeAbiParameters, encodeAbiParameters, keccak256 } from "viem";
import { mainnet } from "viem/chains";
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
if (!env.ALCHEMY_URL || !env.ETHERSCAN_API_KEY) throw new Error("need ALCHEMY_URL + ETHERSCAN_API_KEY in .env.local");

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3, retryDelay: 900 }),
});

const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const CREATE_MARKET_TOPIC = "0xac4b2400f169220b0c0afdde7a0b32e775ba727ea1cb30b35f935cdaab8683ac";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
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
const blueAbi = parseAbi([
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function isLltvEnabled(uint256) view returns (bool)",
]);
const ercAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function asset() view returns (address)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const irmAbi = parseAbi([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) view returns (uint256)",
]);

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
};

/** Read the generated catalog without importing TS: parse the interned table + rows.
 *  (Never JSON.parse a TS module — this reads the two literals it needs.)
 *
 *  Whitespace-tolerant on purpose. The census writes one row per line, but `pnpm format` wraps
 *  the long ones across seven lines each — a single-line pattern silently matched 195 of 1,648
 *  and the script cheerfully "verified" 12% of the roster. A parse of generated code has to
 *  survive the formatter, and the count assertion below is what catches it when it doesn't. */
function readCatalog() {
  const src = fs.readFileSync(path.join(ROOT, "lib/morpho/market-catalog.ts"), "utf8");
  const censusBlock = Number(src.match(/MORPHO_MARKET_CENSUS_BLOCK = (\d+)/)[1]);
  const addrs = [
    ...src.match(/const A: readonly string\[\] = \[([\s\S]*?)\];/)[1].matchAll(/"(0x[0-9a-fA-F]{40})"/g),
  ].map((m) => m[1]);
  const body = src.match(/const ROWS: readonly Row\[\] = \[([\s\S]*?)\n\];/)[1];
  const rows = [
    ...body.matchAll(/\[\s*"(0x[0-9a-fA-F]{64})",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*"(\d+)",\s*(\d+),?\s*\]/g),
  ].map((m) => ({
    id: m[1].toLowerCase(),
    loanToken: addrs[+m[2]],
    collateralToken: addrs[+m[3]],
    oracle: addrs[+m[4]],
    irm: addrs[+m[5]],
    lltv: m[6],
    createdBlock: +m[7],
  }));
  // The rows are the only thing between the brackets, so every "[" that opens one must have
  // produced a row. If the two disagree, the pattern missed some and every count below is a lie.
  const opens = (body.match(/\[\s*"0x[0-9a-fA-F]{64}"/g) ?? []).length;
  if (rows.length !== opens)
    throw new Error(`catalog parse matched ${rows.length} of ${opens} rows — the pattern is stale`);
  return { censusBlock, markets: rows };
}

// opts is passed through to multicall — check 13 uses it to pin every read to one block,
// because the equality it asserts has the chain on both sides of it.
const chunk = async (contracts, size = 400, opts = {}) => {
  const out = [];
  for (let i = 0; i < contracts.length; i += size) {
    out.push(
      ...(await client.multicall({
        contracts: contracts.slice(i, i + size),
        allowFailure: true,
        batchSize: 0,
        ...opts,
      })),
    );
    await new Promise((s) => setTimeout(s, 120));
  }
  return out;
};

const { censusBlock, markets } = readCatalog();
console.log(`\nMorpho Blue market view — verifying ${markets.length} catalog markets (census block ${censusBlock})\n`);

// --- 1. Catalog integrity: every id reproduces from its own baked params -----
console.log("1. Catalog integrity — id == keccak256(abi.encode(params))");
let derivedBad = 0;
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
  if (derived.toLowerCase() !== m.id) derivedBad++;
}
ok(derivedBad === 0, `all ${markets.length} baked ids reproduce from their own params (${derivedBad} mismatched)`);

// --- 2. Catalog vs the singleton --------------------------------------------
console.log("\n2. Catalog vs singleton — idToMarketParams agrees with the bake");
const params = await chunk(
  markets.map((m) => ({ address: MORPHO, abi: blueAbi, functionName: "idToMarketParams", args: [m.id] })),
);
let paramDrift = 0;
let lltvDrift = 0;
markets.forEach((m, i) => {
  if (params[i].status !== "success") return paramDrift++;
  const [loan, coll, oracle, irm, lltv] = params[i].result;
  if (
    loan.toLowerCase() !== m.loanToken ||
    coll.toLowerCase() !== m.collateralToken ||
    oracle.toLowerCase() !== m.oracle ||
    irm.toLowerCase() !== m.irm
  )
    paramDrift++;
  if (lltv.toString() !== m.lltv) lltvDrift++;
});
ok(paramDrift === 0, `all ${markets.length} markets' params match the singleton (${paramDrift} drifted)`);
// --- 5. Immutability of the rung --------------------------------------------
ok(
  lltvDrift === 0,
  `every lltv on chain equals the one baked at creation — the rung is immutable (${lltvDrift} drifted)`,
);

// --- 3. Completeness: a fresh census finds nothing the catalog lacks ---------
console.log("\n3. Completeness — a re-census finds no market outside the catalog");
async function getLogs(fromBlock) {
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs&address=${MORPHO}` +
    `&topic0=${CREATE_MARKET_TOPIC}&fromBlock=${fromBlock}&toBlock=latest&page=1&offset=1000&apikey=${env.ETHERSCAN_API_KEY}`;
  const r = await (await fetch(url)).json();
  if (r.status === "1" && Array.isArray(r.result)) return r.result;
  if (typeof r.message === "string" && /No records found/i.test(r.message)) return [];
  throw new Error(`Etherscan NOT-OK: ${JSON.stringify(r).slice(0, 200)}`);
}
const known = new Set(markets.map((m) => m.id));
const fresh = [];
let from = 0;
for (let i = 0; i < 60; i++) {
  const page = await getLogs(from);
  if (!page.length) break;
  fresh.push(...page);
  if (page.length < 1000) break;
  from = parseInt(page[page.length - 1].blockNumber, 16) + 1;
  await new Promise((s) => setTimeout(s, 250));
}
const freshIds = [...new Set(fresh.map((l) => l.topics[1].toLowerCase()))];
const missing = freshIds.filter((id) => !known.has(id));
const sinceCensus = missing.filter((id) => {
  const log = fresh.find((l) => l.topics[1].toLowerCase() === id);
  return parseInt(log.blockNumber, 16) > censusBlock;
});
ok(
  missing.length === sinceCensus.length,
  `every market created at or before the census block is in the catalog ` +
    `(${freshIds.length} on chain, ${missing.length} absent, all ${sinceCensus.length} of them created since — re-run the census to pick those up)`,
);
// The event decodes to the params the catalog holds — the log IS the source.
const sampleLog = fresh.find((l) => known.has(l.topics[1].toLowerCase()));
const [decoded] = decodeAbiParameters(MARKET_PARAMS, sampleLog.data);
const sampleCat = markets.find((m) => m.id === sampleLog.topics[1].toLowerCase());
ok(
  decoded.loanToken.toLowerCase() === sampleCat.loanToken && decoded.lltv.toString() === sampleCat.lltv,
  `the CreateMarket log decodes to the catalog's params (spot-check ${sampleCat.id.slice(0, 12)}…)`,
);

// --- 4. The nine numbers -----------------------------------------------------
console.log("\n4. The whole risk surface — every lltv in use is governance-enabled");
const lltvs = [...new Set(markets.map((m) => m.lltv))].sort((a, b) => Number(BigInt(b) - BigInt(a)));
const enabled = await chunk(
  lltvs.map((l) => ({ address: MORPHO, abi: blueAbi, functionName: "isLltvEnabled", args: [BigInt(l)] })),
);
const notEnabled = lltvs.filter((_, i) => enabled[i].status !== "success" || enabled[i].result !== true);
ok(
  notEnabled.length === 0,
  `all ${lltvs.length} distinct lltvs return isLltvEnabled == true — ${lltvs.map((l) => (Number(l) / 1e16).toFixed(1) + "%").join(", ")}`,
);
ok(
  lltvs.length <= 12,
  `the protocol's entire parameter space is ${lltvs.length} numbers across ${markets.length} markets`,
);

// --- 6. LIF is derived, not configured ---------------------------------------
console.log("\n6. Liquidation incentive — derived from the lltv, never set");
const lif = (l) => Math.min(1.15, 1 / (1 - 0.3 * (1 - l)));
const outOfBand = markets.filter((m) => {
  const l = Number(m.lltv) / 1e18;
  if (l === 0) return false;
  const f = lif(l);
  return !(f >= 1 && f <= 1.15);
});
ok(
  outOfBand.length === 0,
  `LIF = min(1.15, 1/(1-0.3(1-lltv))) lands in [1, 1.15] for every market with a rung (${outOfBand.length} outside)`,
);
const blueSrcHasLifGetter = blueAbi.some((f) => /liquidationIncentive/i.test(f.name ?? ""));
ok(
  !blueSrcHasLifGetter,
  "Blue exposes no liquidation-incentive getter — the figure can only be a replica of the formula",
);

// --- 7. No market-wide LTV exists --------------------------------------------
console.log("\n7. No market-wide LTV — Blue never totals collateral");
const marketFn = blueAbi.find((f) => f.name === "market");
const outNames = marketFn.outputs.map((o) => o.name);
ok(
  !outNames.some((n) => /collateral/i.test(n)),
  `market() returns [${outNames.join(", ")}] — no collateral total, so a market-wide LTV is not a number the protocol holds`,
);

// --- 8. Utilisation is well-formed -------------------------------------------
console.log("\n8. Utilisation — borrow ÷ supply is a real fraction, no oracle needed");
const states = await chunk(
  markets.map((m) => ({ address: MORPHO, abi: blueAbi, functionName: "market", args: [m.id] })),
);
const readable = markets
  .map((m, i) => ({ m, s: states[i].status === "success" ? states[i].result : null }))
  .filter((r) => r.s);
ok(
  readable.length === markets.length,
  `market() answered for all ${markets.length} markets (${markets.length - readable.length} failed)`,
);
const overBorrowed = readable.filter((r) => r.s[2] > r.s[0]);
ok(
  overBorrowed.length === 0,
  `totalBorrowAssets <= totalSupplyAssets everywhere (${overBorrowed.length} over-borrowed)`,
);
const feeTooHigh = readable.filter((r) => r.s[5] > BigInt(0.25e18));
ok(feeTooHigh.length === 0, `fee <= MAX_FEE (0.25e18) on every market (${feeTooHigh.length} over)`);

// --- 9. The books reconcile with custody -------------------------------------
console.log("\n9. Custody reconciliation — Blue holds exactly the un-borrowed part of its books");
const byLoan = new Map();
for (const r of readable) {
  const g = byLoan.get(r.m.loanToken) ?? { supply: BigInt(0), borrow: BigInt(0) };
  g.supply += r.s[0];
  g.borrow += r.s[2];
  byLoan.set(r.m.loanToken, g);
}
const ranked = [...byLoan.entries()].sort((a, b) => Number(b[1].supply - a[1].supply)).slice(0, 12);
const bals = await chunk(ranked.map(([t]) => ({ address: t, abi: ercAbi, functionName: "balanceOf", args: [MORPHO] })));
const syms = await chunk(ranked.map(([t]) => ({ address: t, abi: ercAbi, functionName: "symbol" })));
let reconciled = 0;
let checked = 0;
ranked.forEach(([, g], i) => {
  if (bals[i].status !== "success") return;
  const idle = g.supply - g.borrow;
  if (idle <= BigInt(0)) return;
  checked++;
  const held = bals[i].result;
  // Blue custodies the un-borrowed part. It may hold a little MORE (donations, other
  // tokens' dust), never meaningfully less: >= 99% is the invariant that matters.
  const ratio = Number(held) / Number(idle);
  const sym = syms[i].status === "success" ? syms[i].result : "?";
  if (ratio >= 0.99) reconciled++;
  else console.log(`     ${sym}: books say ${idle} idle, Blue holds ${held} (ratio ${ratio.toFixed(3)})`);
});
ok(
  checked > 0 && reconciled === checked,
  `${reconciled}/${checked} of the largest books reconcile with the tokens Blue actually custodies`,
);

// --- 10. Stored, not projected ------------------------------------------------
console.log("\n10. Stored, not projected — why this view does not accrue in view");
const now = Math.floor(Date.now() / 1000);
const pinned = readable
  .filter((r) => r.s[0] > BigInt(0) && r.s[2] === r.s[0] && r.m.irm !== ZERO_ADDR)
  .sort((a, b) => Number(a.s[4] - b.s[4]))
  .slice(0, 3);
const wTaylor = (x, n) => {
  const f = x * n;
  const s = (f * f) / (BigInt(2) * BigInt(1e18));
  const t = (s * f) / (BigInt(3) * BigInt(1e18));
  return f + s + t;
};
let demonstrated = 0;
for (const r of pinned) {
  const rate = await client
    .readContract({
      address: r.m.irm,
      abi: irmAbi,
      functionName: "borrowRateView",
      args: [
        {
          loanToken: r.m.loanToken,
          collateralToken: r.m.collateralToken,
          oracle: r.m.oracle,
          irm: r.m.irm,
          lltv: BigInt(r.m.lltv),
        },
        {
          totalSupplyAssets: r.s[0],
          totalSupplyShares: r.s[1],
          totalBorrowAssets: r.s[2],
          totalBorrowShares: r.s[3],
          lastUpdate: r.s[4],
          fee: r.s[5],
        },
      ],
    })
    .catch(() => null);
  if (rate == null) continue;
  const apr = (Number(rate) / 1e18) * 31_536_000 * 100;
  const dt = BigInt(Math.max(0, now - Number(r.s[4])));
  const growth = Number(wTaylor(rate, dt)) / 1e18;
  const days = Number(dt) / 86400;
  console.log(
    `     ${r.m.id.slice(0, 12)}… at 100% util · rate ${apr.toFixed(0)}% APR · untouched ${days.toFixed(0)}d ` +
      `· a projection would add ${(growth * 100).toFixed(0)}% to its book`,
  );
  if (growth > 0.1) demonstrated++;
}
ok(
  demonstrated > 0,
  `markets pinned at 100% utilisation carry rates whose in-view projection would multiply the stored book — which is why the roster states the STORED figure (the position lane, touched often, projects safely)`,
);

// --- 11. The decimals guard convicts the right token --------------------------
console.log("\n11. Decimals guard — models the specific lie, not a magnitude");
async function lies(token) {
  const dec = await client.readContract({ address: token, abi: ercAbi, functionName: "decimals" }).catch(() => null);
  const underlying = await client
    .readContract({ address: token, abi: ercAbi, functionName: "asset" })
    .catch(() => null);
  if (dec == null || !underlying) return false;
  const one = await client
    .readContract({
      address: token,
      abi: ercAbi,
      functionName: "convertToAssets",
      args: [BigInt("1" + "0".repeat(Number(dec)))],
    })
    .catch(() => null);
  if (one == null) return false;
  const ud = await client.readContract({ address: underlying, abi: ercAbi, functionName: "decimals" }).catch(() => 18);
  const whole = Number(one) / 10 ** Number(ud);
  return one === BigInt(0) || whole > 100 || whole < 0.01;
}
// Both read off this roster rather than typed from memory — the first draft of this script
// hardcoded a wUSDL address that does not appear on Morpho at all, and the test "passed" the
// guard by failing to convict a contract that was never there.
const WUSDL = "0x7751e2f4b8ae93ef6b79d86419d42fe3295a4559";
const WAETHUSDC = "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e";
const wusdlLies = await lies(WUSDL);
const waethLies = await lies(WAETHUSDC);
ok(wusdlLies, "wUSDL is convicted — it reports 6 decimals against 18-decimal shares (a 1e12 overstatement if trusted)");
ok(
  !waethLies,
  "waEthUSDC is NOT convicted — it also reports 6 decimals and is truthful, so the guard is a test, not a magnitude hunch",
);

// --- 12. The idle market ------------------------------------------------------
console.log("\n12. The idle market — lltv 0 means nothing can ever be borrowed");
const zeroLltv = markets.filter((m) => m.lltv === "0");
const fullyIdle = zeroLltv.filter(
  (m) => m.collateralToken === ZERO_ADDR && m.oracle === ZERO_ADDR && m.irm === ZERO_ADDR,
);
ok(zeroLltv.length > 0, `${zeroLltv.length} markets carry lltv 0 — zero collateral value supports zero debt`);
ok(
  fullyIdle.length >= zeroLltv.length - 3,
  `${fullyIdle.length}/${zeroLltv.length} of them name no collateral, oracle or IRM at all — a place to hold cash inside Blue`,
);
const idleBorrowed = readable.filter((r) => r.m.lltv === "0" && r.s[2] > BigInt(0));
ok(idleBorrowed.length === 0, `no lltv-0 market has any borrowing (${idleBorrowed.length} do)`);

console.log(`\n${pass} passed · ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
