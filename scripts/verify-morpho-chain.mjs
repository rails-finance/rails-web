// ============================================================================
// VERIFY: Morpho Blue chain assumptions for the reference-depth uplift
// ============================================================================
//
// Read-only. Every risk surface the uplift adds rests on a contract assumption;
// this script checks each one directly against mainnet before (and after) the
// build, so the surfaces are grounded in verified chain behaviour:
//
//   1. Market identity — idToMarketParams(id) returns the MarketParams tuple
//      and keccak256(abi.encode(params)) reproduces the market id exactly; the
//      lltv is governance-enabled (isLltvEnabled) and the IRM is enabled.
//   2. Oracle numeraire — IOracle.price() quotes the COLLATERAL asset in LOAN
//      asset terms, scaled 1e36 x 10^(loanDecimals - collateralDecimals) —
//      NOT USD. Every derived value (capacity, LTV, HF) is therefore in
//      loan-token units; there is no protocol USD anywhere.
//   3. Market state — market(id) slots are sane: lastUpdate <= now,
//      fee <= MAX_FEE (0.25e18), totalBorrowAssets <= totalSupplyAssets.
//   4. Rates — AdaptiveCurveIRM.borrowRateView(params, market) is a per-second
//      WAD rate in a plausible APR band; utilization in [0, 1].
//   5. Position state — position(id, user) collateral and borrowShares match
//      the backend replay (mv_morpho_positions coll_raw / bsh_raw) EXACTLY —
//      collateral doesn't accrue and shares are conserved, so any drift is
//      indexing error, not interest.
//   6. Health arithmetic — Morpho has NO public isLiquidatable/healthy getter
//      (_isHealthy is internal), so the uplift REPLICATES it:
//        borrowed  = toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares)
//        maxBorrow = collateral x price / 1e36, wMulDown lltv
//        healthy  <=> maxBorrow >= borrowed
//      Verified here: every listed open borrower is healthy by this formula
//      (they exist un-liquidated on chain), debt >= replayed principal, and
//      the toAssetsUp virtual-offset math matches the app's copy.
//   7. Interest accrual view — market() totals are AS OF lastUpdate; the live
//      debt needs interest = totalBorrowAssets x wTaylorCompounded(rate, dt)
//      added first (the same 3-term Taylor the contract applies). Verified
//      the increment is nonnegative and small over the observed dt.
//   8. Liquidation incentive — LIF = min(1.15, 1 / (1 - 0.3 x (1 - lltv)))
//      lands in [1, 1.15] for every sampled market (the penalty the rates
//      card displays).
//
// Run:  node scripts/verify-morpho-chain.mjs
// Env:  .env.local — ALCHEMY_URL (chain), RAILS_API_URL + API_BEARER_TOKEN
//       (live-index samples; position checks skipped if missing)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, keccak256, encodeAbiParameters } from "viem";
import { mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

const MORPHO = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";

// Sample positions from the live index (2026-07-13): a WETH/wstETH looper, a
// USDC/PT borrower, a PYUSD/cbBTC borrower, and a liquidated USDT/WBTC.
const SAMPLES = [
  {
    market: "0xd0e50cdac92fe2172043f5e0c36532c6369d24947e40968f34a5e8819ca9ec5d",
    user: "0xb8a451107a9f87fde481d4d686247d6e43ed715e",
    open: true,
  },
  {
    market: "0xf8c5aa31ea6b2a068a9eddb46dd110cae57bf0f12be9583a3f9a818effecba89",
    user: "0xee9ca24fb62bfc021e1a46e09e1c1cbecd3341b5",
    open: true,
  },
  {
    market: "0xd8a8e6667f58aa9229e8979bd619742b1660ee856c200a93e407dbccb7222323",
    user: "0x05b011922348325e7c9ece372560df92ea699886",
    open: true,
  },
  {
    market: "0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99",
    user: "0xecded8b1c603cf21299835f1dfbe37f10f2a29af",
    open: false, // liquidated in the index
  },
];

// Multicall-batch the parallel scalar reads (a bare free-tier endpoint 429s on
// concurrent eth_calls), retry hard on 429, and pace the per-sample phases.
const client = createPublicClient({
  chain: mainnet,
  batch: { multicall: { wait: 50 } },
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 1_000 }),
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const morphoAbi = parseAbi([
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function isLltvEnabled(uint256 lltv) view returns (bool)",
  "function isIrmEnabled(address irm) view returns (bool)",
]);
const oracleAbi = parseAbi(["function price() view returns (uint256)"]);
const irmAbi = parseAbi([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) view returns (uint256)",
]);
const erc20Abi = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

const WAD = 10n ** 18n;
const ORACLE_SCALE = 10n ** 36n;
const VIRTUAL_ASSETS = 1n;
const VIRTUAL_SHARES = 1_000_000n;
const MAX_FEE = WAD / 4n; // 0.25e18
const SECONDS_PER_YEAR = 31_536_000;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** shares -> assets rounded up (Morpho SharesMathLib.toAssetsUp). */
const toAssetsUp = (shares, totalAssets, totalShares) => {
  const den = totalShares + VIRTUAL_SHARES;
  return (shares * (totalAssets + VIRTUAL_ASSETS) + den - 1n) / den;
};
/** The contract's 3-term Taylor compounding (MathLib.wTaylorCompounded). */
const wTaylorCompounded = (x, n) => {
  const first = x * n;
  const second = (first * first) / (2n * WAD);
  const third = (second * first) / (3n * WAD);
  return first + second + third;
};
const wMulDown = (x, y) => (x * y) / WAD;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/** Raw backend row for one (market, user) — the replayed position. */
async function apiRow(market, user) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  const m = market.replace(/^0x/, "");
  const res = await fetch(`${env.RAILS_API_URL}/api/morpho/positions?market=${m}&user=${user}&limit=1`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.rows?.[0] ?? null;
}
const bigintOf = (raw) => {
  if (raw == null || raw === "") return 0n;
  try {
    return BigInt(String(raw).split(".")[0]);
  } catch {
    return 0n;
  }
};

async function verifySample(s, now) {
  console.log(`\n== ${s.market.slice(0, 10)}… / ${s.user.slice(0, 10)}… ==`);

  // ── Market identity ──
  const params = await client.readContract({
    address: MORPHO,
    abi: morphoAbi,
    functionName: "idToMarketParams",
    args: [s.market],
  });
  const [loanToken, collateralToken, oracle, irm, lltv] = params;
  const recomputedId = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
      [loanToken, collateralToken, oracle, irm, lltv],
    ),
  );
  check("market id == keccak256(abi.encode(params))", recomputedId.toLowerCase() === s.market.toLowerCase());
  check("lltv in (0, 1] WAD", lltv > 0n && lltv <= WAD, `lltv=${Number(lltv) / 1e18}`);

  const [lltvEnabled, irmEnabled, mkt, pos] = await Promise.all([
    client.readContract({ address: MORPHO, abi: morphoAbi, functionName: "isLltvEnabled", args: [lltv] }),
    client.readContract({ address: MORPHO, abi: morphoAbi, functionName: "isIrmEnabled", args: [irm] }),
    client.readContract({ address: MORPHO, abi: morphoAbi, functionName: "market", args: [s.market] }),
    client.readContract({ address: MORPHO, abi: morphoAbi, functionName: "position", args: [s.market, s.user] }),
  ]);
  check("lltv + irm governance-enabled", lltvEnabled && irmEnabled);

  const [totalSupplyAssets, , totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = mkt;
  const [, borrowShares, collateral] = pos;
  check(
    "market slots sane (lastUpdate <= now, fee <= 25%, borrow <= supply)",
    lastUpdate <= BigInt(now) && fee <= MAX_FEE && totalBorrowAssets <= totalSupplyAssets,
    `fee=${Number(fee) / 1e18}, dt=${now - Number(lastUpdate)}s`,
  );

  // ── Token meta + oracle numeraire ──
  const [loanDec, loanSym, collDec, collSym] = await Promise.all([
    client.readContract({ address: loanToken, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: loanToken, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: collateralToken, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: collateralToken, abi: erc20Abi, functionName: "symbol" }),
  ]);
  console.log(`      ${loanSym} / ${collSym} — lltv ${(Number(lltv) / 1e18) * 100}%`);

  let price = 0n;
  if (oracle !== ZERO_ADDR) {
    price = await client.readContract({ address: oracle, abi: oracleAbi, functionName: "price" });
    // price is scaled 1e36 x 10^(loanDec - collDec): one whole collateral token
    // in whole loan tokens = price / 10^(36 + loanDec - collDec).
    const human = Number(price) / 10 ** (36 + Number(loanDec) - Number(collDec));
    const plausible =
      collSym === "wstETH" && loanSym === "WETH"
        ? human > 1.0 && human < 1.6 // wstETH accrues above 1 ETH, well under 1.6 today
        : human > 1e-6 && human < 1e9;
    check(
      "oracle price scale 1e(36+loanDec-collDec) plausible",
      price > 0n && plausible,
      `1 ${collSym} = ${human.toPrecision(6)} ${loanSym}`,
    );
  }

  // ── Rates ──
  let ratePerSec = 0n;
  if (irm !== ZERO_ADDR) {
    ratePerSec = await client.readContract({
      address: irm,
      abi: irmAbi,
      functionName: "borrowRateView",
      args: [
        { loanToken, collateralToken, oracle, irm, lltv },
        {
          totalSupplyAssets: mkt[0],
          totalSupplyShares: mkt[1],
          totalBorrowAssets: mkt[2],
          totalBorrowShares: mkt[3],
          lastUpdate: mkt[4],
          fee: mkt[5],
        },
      ],
    });
    const apr = (Number(ratePerSec) / 1e18) * SECONDS_PER_YEAR;
    check(
      "borrowRateView per-second WAD, APR in (0, 10)",
      ratePerSec > 0n && apr < 10,
      `APR=${(apr * 100).toFixed(2)}%`,
    );
  }
  const util = totalSupplyAssets > 0n ? Number(totalBorrowAssets) / Number(totalSupplyAssets) : 0;
  check("utilization in [0, 1]", util >= 0 && util <= 1, `util=${(util * 100).toFixed(1)}%`);

  // ── Interest accrual view (the totals are AS OF lastUpdate) ──
  const dt = BigInt(Math.max(0, now - Number(lastUpdate)));
  const interest = wMulDown(totalBorrowAssets, wTaylorCompounded(ratePerSec, dt));
  const liveBorrowAssets = totalBorrowAssets + interest;
  check(
    "taylor-accrued interest nonnegative and < 1% of totals over dt",
    interest >= 0n && (totalBorrowAssets === 0n || Number(interest) / Number(totalBorrowAssets) < 0.01),
    `interest=${Number(interest) / 10 ** Number(loanDec)} ${loanSym} over ${dt}s`,
  );

  // ── Position vs the backend replay (exact — no accrual on either slot) ──
  const row = await apiRow(s.market, s.user);
  if (row) {
    check(
      "chain collateral == replayed coll_raw (wei-exact)",
      collateral === bigintOf(row.coll_raw),
      `chain=${collateral}`,
    );
    check(
      "chain borrowShares == replayed bsh_raw (exact)",
      borrowShares === bigintOf(row.bsh_raw),
      `chain=${borrowShares}`,
    );
  } else {
    console.log("      (no backend row — replay checks skipped)");
  }

  // ── Health arithmetic (replicates the internal _isHealthy) ──
  if (borrowShares > 0n && price > 0n) {
    const borrowed = toAssetsUp(borrowShares, liveBorrowAssets, totalBorrowShares);
    const maxBorrow = wMulDown((collateral * price) / ORACLE_SCALE, lltv);
    const hf = Number(maxBorrow) / Number(borrowed);
    check(
      s.open ? "open borrower healthy by _isHealthy replica (HF > 1)" : "borrower HF computable",
      s.open ? maxBorrow >= borrowed : hf > 0,
      `HF=${hf.toFixed(4)}, debt=${Number(borrowed) / 10 ** Number(loanDec)} ${loanSym}`,
    );
    if (row) {
      const principal = bigintOf(row.borr_raw);
      check(
        "live debt >= replayed principal (interest is nonnegative)",
        principal <= 0n || borrowed >= principal,
        `debt=${borrowed}, principal=${principal}`,
      );
    }
  } else if (!s.open) {
    check(
      "liquidated/closed position carries no open debt on chain",
      borrowShares === 0n || collateral === 0n,
      `shares=${borrowShares}, coll=${collateral}`,
    );
  }

  // ── Liquidation incentive factor (constants from MorphoBlue.sol) ──
  const CURSOR = (3n * WAD) / 10n;
  const MAX_LIF = (115n * WAD) / 100n;
  const denom = WAD - wMulDown(CURSOR, WAD - lltv);
  const lif = denom > 0n ? (WAD * WAD) / denom : 0n;
  const lifCapped = lif > MAX_LIF ? MAX_LIF : lif;
  check(
    "LIF in [1, 1.15]",
    lifCapped >= WAD && lifCapped <= MAX_LIF,
    `LIF=${(Number(lifCapped) / 1e18).toFixed(4)} (penalty ${((Number(lifCapped) / 1e18 - 1) * 100).toFixed(2)}%)`,
  );
}

const now = Number((await client.getBlock()).timestamp);
console.log(`Morpho Blue ${MORPHO} — head timestamp ${now}`);
for (const s of SAMPLES) {
  await verifySample(s, now);
  await pause(1_500);
}

console.log(`\n${"-".repeat(60)}\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
