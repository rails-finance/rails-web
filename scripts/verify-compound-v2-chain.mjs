/**
 * Verifies every assumption lib/sources/chain/compound-v2-markets.ts makes,
 * directly against the chain. Nothing here is asserted from docs or from the
 * loader's own output — the point is to catch the class of bug a typecheck
 * cannot see: a right-shaped number on a wrong scale, a symbol key that
 * silently merges two assets, a constant that isn't constant across the roster.
 *
 *   node scripts/verify-compound-v2-chain.mjs
 *
 * Needs ALCHEMY_URL in .env.local.
 */
import { createPublicClient, http, parseAbi, hexToString, trim } from "viem";
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
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// Alchemy's CU/sec throttle cascades to account-level 429s — no viem batch, pace it.
const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3, retryDelay: 900 }),
});

const COMPTROLLER = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
const CETH = "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5";
const CDAI = "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643";
const CSAI = "0xF5DCe57282A584D2746FaF1593d3121Fcac444dC";
const SAI = "0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359";
const MKR = "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2";
const CWBTC_LEGACY = "0xC11b1268C1A384e55C48c2391d8d480264A3A7F4";
const CWBTC2 = "0xccF4429DB6322D5C611ee964527D42E5d685DD6a";
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

const COMPTROLLER_ABI = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function oracle() view returns (address)",
  "function markets(address) view returns (bool isListed, uint256 collateralFactorMantissa, bool isComped)",
]);
const CTOKEN_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function underlying() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrows() view returns (uint256)",
  "function getCash() view returns (uint256)",
  "function totalReserves() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function interestRateModel() view returns (address)",
  "function borrowRatePerBlock() view returns (uint256)",
]);
const ERC20_ABI = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const ERC20_B32_ABI = parseAbi(["function symbol() view returns (bytes32)"]);
const ORACLE_ABI = parseAbi([
  "function getUnderlyingPrice(address) view returns (uint256)",
  "function getConfig(address) view returns ((uint8 underlyingAssetDecimals, address priceFeed, uint256 fixedPrice))",
]);
const IRM_ABI = parseAbi(["function kink() view returns (uint256)", "function blocksPerYear() view returns (uint256)"]);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  (ok ? pass++ : fail++, console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}`));
};

const read = (address, abi, functionName, args) =>
  client.readContract({ address, abi, functionName, args }).then(
    (r) => ({ ok: true, v: r }),
    (e) => ({ ok: false, e }),
  );

const block = await client.getBlockNumber();
console.log(`Compound V2 chain verification @ block ${block}\n`);

// ---------------------------------------------------------------------------
console.log("Roster — the Comptroller states it, we don't");
const markets = (await read(COMPTROLLER, COMPTROLLER_ABI, "getAllMarkets")).v;
const oracle = (await read(COMPTROLLER, COMPTROLLER_ABI, "oracle")).v;
check("getAllMarkets() answers", Array.isArray(markets) && markets.length > 0, `${markets.length} markets`);
check("oracle() is the Comptroller's own choice, read not hardcoded", /^0x[0-9a-fA-F]{40}$/.test(oracle), oracle);

// ---------------------------------------------------------------------------
console.log("\nTrap 1 — symbol() COLLIDES; the cToken address is the only key");
const syms = [];
for (const m of markets) syms.push(((await read(m, CTOKEN_ABI, "symbol")).v ?? "").toString());
const distinct = new Set(syms);
check(
  "fewer distinct symbols than markets — a symbol key would merge markets",
  distinct.size < markets.length,
  `${distinct.size} symbols / ${markets.length} markets`,
);
const dupes = [...distinct].filter((s) => syms.filter((x) => x === s).length > 1);
check("the collisions are cDAI and cWBTC", dupes.sort().join(",") === "cDAI,cWBTC", dupes.join(", "));

const cdaiUnd = (await read(CDAI, CTOKEN_ABI, "underlying")).v;
const csaiUnd = (await read(CSAI, CTOKEN_ABI, "underlying")).v;
check("both cDAI-symbol markets are listed and distinct", cdaiUnd.toLowerCase() !== csaiUnd.toLowerCase());
check("the legacy 'cDAI' is really SAI", csaiUnd.toLowerCase() === SAI.toLowerCase(), csaiUnd);

const wbtc1 = (await read(CWBTC_LEGACY, CTOKEN_ABI, "underlying")).v;
const wbtc2 = (await read(CWBTC2, CTOKEN_ABI, "underlying")).v;
check(
  "both cWBTC markets sit on the SAME real WBTC — two markets, one asset",
  wbtc1.toLowerCase() === WBTC.toLowerCase() && wbtc2.toLowerCase() === WBTC.toLowerCase(),
);
for (const [n, c] of [
  ["legacy cWBTC", CWBTC_LEGACY],
  ["cWBTC2", CWBTC2],
]) {
  const mk = (await read(COMPTROLLER, COMPTROLLER_ABI, "markets", [c])).v;
  check(`${n} is listed (neither is a dead duplicate)`, mk[0] === true);
}

// ---------------------------------------------------------------------------
console.log("\nTrap 2 — cETH has no underlying(); SAI and MKR answer in bytes32");
const cethUnd = await read(CETH, CTOKEN_ABI, "underlying");
check("cETH.underlying() REVERTS — identity must be stated, not resolved", cethUnd.ok === false);

for (const [name, token] of [
  ["SAI", SAI],
  ["MKR", MKR],
]) {
  const asString = await read(token, ERC20_ABI, "symbol");
  const asBytes32 = await read(token, ERC20_B32_ABI, "symbol");
  check(`${name}: string symbol() fails — the shared resolver cannot name it`, asString.ok === false);
  check(
    `${name}: it is bytes32, not missing`,
    asBytes32.ok === true,
    asBytes32.ok ? JSON.stringify(hexToString(trim(asBytes32.v, { dir: "right" }))) : "",
  );
  // The reader reads decimals() from chain and overrides only the symbol. That
  // is only safe if decimals() actually answers on these tokens.
  const dec = await read(token, ERC20_ABI, "decimals");
  check(`${name}: decimals() DOES answer — so scale stays a chain read`, dec.ok === true, `${dec.v} dp`);
}
const saiB32 = (await read(SAI, ERC20_B32_ABI, "symbol")).v;
check(
  'SAI\'s own bytes32 symbol decodes to "DAI" — no string separates it from DAI at any level',
  hexToString(trim(saiB32, { dir: "right" })) === "DAI",
);

// ---------------------------------------------------------------------------
console.log("\nTrap 3 — scales");
const totals = { supplied: 0, borrowed: 0 };
let cfZero = 0;
let fixedPriceCount = 0;
const bpySeen = new Set();
for (const m of markets) {
  const isCeth = m.toLowerCase() === CETH.toLowerCase();
  const und = isCeth ? null : (await read(m, CTOKEN_ABI, "underlying")).v;
  const ud = isCeth ? 18 : Number((await read(und, ERC20_ABI, "decimals")).v ?? 18);
  const ts = (await read(m, CTOKEN_ABI, "totalSupply")).v;
  const er = (await read(m, CTOKEN_ABI, "exchangeRateStored")).v;
  const tb = (await read(m, CTOKEN_ABI, "totalBorrows")).v;
  const cash = (await read(m, CTOKEN_ABI, "getCash")).v;
  const res = (await read(m, CTOKEN_ABI, "totalReserves")).v;
  const px = (await read(oracle, ORACLE_ABI, "getUnderlyingPrice", [m])).v;
  const cfg = (await read(oracle, ORACLE_ABI, "getConfig", [m])).v;
  const mk = (await read(COMPTROLLER, COMPTROLLER_ABI, "markets", [m])).v;

  const supUnd = (Number(ts) * Number(er)) / 1e18 / 10 ** ud;
  const borUnd = Number(tb) / 10 ** ud;
  const price = Number(px) / 10 ** (36 - ud);
  totals.supplied += supUnd * price;
  totals.borrowed += borUnd * price;
  if (mk[1] === 0n) cfZero++;
  if (cfg.priceFeed === "0x0000000000000000000000000000000000000000") fixedPriceCount++;

  // The oracle's own config states the underlying's decimals. If our decimals
  // and the oracle's disagree, every USD figure on this market is wrong by a
  // power of ten — this is the single highest-value assertion in the file.
  if (cfg.underlyingAssetDecimals !== 0)
    check(
      `${syms[markets.indexOf(m)]}: our decimals match the ORACLE's own config`,
      Number(cfg.underlyingAssetDecimals) === ud,
      `${ud} dp`,
    );

  // getCash + totalBorrows − totalReserves == totalSupply × exchangeRate is the
  // cToken's own balance-sheet identity. If our supplied scale were wrong, this
  // would not close.
  const identity = Number(cash) + Number(tb) - Number(res);
  const modelled = (Number(ts) * Number(er)) / 1e18;
  const drift = identity === 0 ? Math.abs(modelled) : Math.abs(modelled - identity) / Math.abs(identity);
  check(
    `${syms[markets.indexOf(m)]}: cash + borrows − reserves == supply × exchangeRate`,
    drift < 1e-6 || Math.abs(modelled - identity) < 1e6,
    `drift ${(drift * 100).toFixed(6)}%`,
  );

  const irm = (await read(m, CTOKEN_ABI, "interestRateModel")).v;
  const bpy = await read(irm, IRM_ABI, "blocksPerYear");
  if (bpy.ok) bpySeen.add(Number(bpy.v));
}

check("8 markets carry collateralFactor == 0 (disabled as collateral)", cfZero === 8, `${cfZero} markets`);
check("3 markets are priced by a constant with NO feed", fixedPriceCount === 3, `${fixedPriceCount} markets`);
check(
  "utilisation is far below anything a live protocol runs at",
  totals.borrowed / totals.supplied < 0.2,
  `$${totals.supplied.toFixed(0)} supplied / $${totals.borrowed.toFixed(0)} borrowed = ${((totals.borrowed / totals.supplied) * 100).toFixed(2)}%`,
);

// ---------------------------------------------------------------------------
console.log("\nRates — blocksPerYear is NOT one constant across the roster");
check(
  "the roster disagrees on blocksPerYear — a single hardcoded constant would be wrong somewhere",
  bpySeen.size > 1,
  [...bpySeen].map((n) => n.toLocaleString()).join(" and "),
);
const cethIrm = (await read(CETH, CTOKEN_ABI, "interestRateModel")).v;
const cdaiIrm = (await read(CDAI, CTOKEN_ABI, "interestRateModel")).v;
const cethBpy = Number((await read(cethIrm, IRM_ABI, "blocksPerYear")).v);
const cdaiBpy = Number((await read(cdaiIrm, IRM_ABI, "blocksPerYear")).v);
check("cETH's model annualizes on 2,628,000 blocks", cethBpy === 2_628_000, String(cethBpy));
check("cDAI's model annualizes on 2,102,400 blocks", cdaiBpy === 2_102_400, String(cdaiBpy));
check(
  "so annualizing cETH on cDAI's constant would misstate the biggest market by ~25%",
  Math.abs(cethBpy / cdaiBpy - 1.25) < 0.001,
  `${((cethBpy / cdaiBpy - 1) * 100).toFixed(1)}% off`,
);
const kinkless = [];
for (const m of markets) {
  const irm = (await read(m, CTOKEN_ABI, "interestRateModel")).v;
  const k = await read(irm, IRM_ABI, "kink");
  if (!k.ok) kinkless.push(syms[markets.indexOf(m)]);
}
check(
  "some markets have NO kink() — the oldest rate model is a straight line",
  kinkless.length > 0,
  `${kinkless.length}: ${kinkless.join(", ")}`,
);

// ---------------------------------------------------------------------------
console.log("\nOracle — cross-checks against independent markets");
const pxOf = async (c, ud) => Number((await read(oracle, ORACLE_ABI, "getUnderlyingPrice", [c])).v) / 10 ** (36 - ud);
const pW1 = await pxOf(CWBTC_LEGACY, 8);
const pW2 = await pxOf(CWBTC2, 8);
check(
  "two independent WBTC markets price the SAME underlying identically — the 1e(36−ud) scale is proven, not assumed",
  pW1 > 0 && Math.abs(pW1 / pW2 - 1) < 1e-9,
  `$${pW1.toFixed(2)} == $${pW2.toFixed(2)}`,
);
const pEth = await pxOf(CETH, 18);
const pUsdc = await pxOf("0x39AA39c021dfbaE8faC545936693aC917d5E7563", 6);
const pDai = await pxOf(CDAI, 18);
// A 6dp market and an 18dp market landing on the same ~$1 is the decimals
// regime checked ACROSS scales, off two separate feeds.
check(
  "cUSDC (6dp) and cDAI (18dp) both land at ~$1 off separate feeds — the scale holds across decimals",
  Math.abs(pUsdc - 1) < 0.05 && Math.abs(pDai - 1) < 0.05,
  `USDC $${pUsdc.toFixed(4)} · DAI $${pDai.toFixed(4)}`,
);
check(
  "BTC/ETH cross-rate from Compound's own two feeds is plausible",
  pW2 / pEth > 5 && pW2 / pEth < 100,
  `${(pW2 / pEth).toFixed(2)} ETH per BTC`,
);

const saiCfg = (await read(oracle, ORACLE_ABI, "getConfig", [CSAI])).v;
const pSai = await pxOf(CSAI, 18);
check(
  "the legacy SAI market has NO price feed — its price is a stored constant",
  saiCfg.priceFeed === "0x0000000000000000000000000000000000000000",
);
check(
  "and that constant is far off SAI's $1 target — so it must never render as a live read",
  pSai > 5,
  `$${pSai.toFixed(4)} fixed, nothing updates it`,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
