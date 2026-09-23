// ============================================================================
// VERIFY: Moonwell (Ethereum L1) chain assumptions for the reference-depth pass
// ============================================================================
//
// Read-only. The live-dashboard chain lane rests on Compound-v2 contract
// assumptions; this script checks each one directly against mainnet before
// (and after) the build:
//
//   1. Market catalog integrity — Comptroller.getAllMarkets() is exactly the
//      four catalog mTokens; each mToken's underlying()/decimals match the
//      catalog; every mToken is 8 dp.
//   2. Comptroller config — oracle() matches the catalog; markets(mToken)
//      collateral factors match the catalog constants (0.80 WETH/cbBTC, 0.85
//      stables); closeFactor 0.5; liquidationIncentive 1.10.
//   3. Accrual convention — borrowRatePerTimestamp() answers and
//      borrowRatePerBlock() REVERTS (Moonwell kept its Base/Moonbeam
//      per-second convention); supply < borrow and the v2 identity
//      supplyRate ~= borrowRate x utilization x (1 - reserveFactor) holds.
//   4. Exchange-rate identity — exchangeRateStored ==
//      (cash + totalBorrows - totalReserves) x 1e18 / totalSupply, BigInt-
//      exact: the rate IS the pool's own book, not an oracle.
//   5. Price numeraire — getUnderlyingPrice scale is 1e(36 - underlying
//      decimals) and prices land in sane USD bands (stables ~1).
//   6. Account state — getAccountSnapshot mirrors the individual balanceOf /
//      borrowBalanceStored / exchangeRateStored reads; every market with a
//      nonzero BORROW is in getAssetsIn (borrowing requires membership).
//      Supplies can legitimately sit OUTSIDE getAssetsIn — mint alone does
//      not enter a market (verified live: a plain lender with 700 USDC
//      supplied and no membership has getAccountLiquidity == $0), so an
//      un-entered supply backs nothing and the dashboard must say so.
//   7. Health arithmetic — a BigInt-exact replica of the Comptroller's
//      hypothetical-liquidity walk (CF x exchangeRate x price per Exp-mul
//      truncation order) reproduces getAccountLiquidity's (liquidity,
//      shortfall) EXACTLY — so the dashboard can ship the Comptroller's own
//      verdict as kind "chain" and derive HF from the same legs.
//   8. Index agreement — the replayed mToken balance (supply side) is
//      wei-exact vs chain balanceOf, and the emitted accountBorrows debt
//      reproduces borrowBalanceStored EXACTLY under the protocol's own
//      accrual arithmetic: stored == accountBorrows × borrowIndex(pinned
//      head) ÷ borrowIndex(last debt event's block). Not a tolerance band —
//      a flat ceiling reds on any borrower quiet a few weeks.
//
// Run:  node scripts/verify-moonwell-chain.mjs
// Env:  .env.local — ALCHEMY_URL (chain), RAILS_API_URL + API_BEARER_TOKEN
//       (live-index samples; skipped if missing)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

// Must mirror lib/moonwell/asset-catalog.ts.
const COMPTROLLER = "0xdec80bb934397575594e91970b37baf65f5b21be";
const ORACLE = "0x599a01297fc181558bdfa1737cafee513694b654";
const MARKETS = [
  {
    key: "weth",
    mtoken: "0xb85ca1decc4971f8094da7676f8b71002a9590c4",
    underlying: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    decimals: 18,
    collateralFactor: 0.8,
  },
  {
    key: "usdc",
    mtoken: "0xe655790552c68f2871eb44b2cfe3dcfe6a63e62e",
    underlying: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
    collateralFactor: 0.85,
  },
  {
    key: "usdt",
    mtoken: "0xeddc25b67d474eeecfa4f69227b81d870c467011",
    underlying: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
    collateralFactor: 0.85,
  },
  {
    key: "cbbtc",
    mtoken: "0x636080eb65f1b665b646f47d31f21901cdaaee9f",
    underlying: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    decimals: 8,
    collateralFactor: 0.8,
  },
];

// Sample accounts from the live index (2026-07-14): a four-market
// cross-collateral borrower, a two-sided USDT position (supply + borrow in
// the same market), a router-proxied WETH supplier with USDT debt, and a
// plain USDC lender.
const SAMPLES = [
  "0x33a7ec1055edd4cc35ef289156c7a7a078043474",
  "0xbbd72dd26f7196940e155da95e3ed3b5248c5c9c",
  "0xf7c8a4a99ba34b4744d08999dd017b5faa4d3378",
  "0xd4cd90b50b1e3630ea9ddeb408411dd1a36d44d2",
];

// Batch + pace: a free-tier endpoint 429s on bare parallel eth_calls.
const client = createPublicClient({
  chain: mainnet,
  batch: { multicall: { wait: 50 } },
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 1_000 }),
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const comptrollerAbi = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function oracle() view returns (address)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
  "function markets(address mToken) view returns (bool isListed, uint256 collateralFactorMantissa)",
  "function getAssetsIn(address account) view returns (address[])",
  "function getAccountLiquidity(address account) view returns (uint256 err, uint256 liquidity, uint256 shortfall)",
]);
const mtokenAbi = parseAbi([
  "function borrowIndex() view returns (uint256)",
  "function underlying() view returns (address)",
  "function decimals() view returns (uint8)",
  "function exchangeRateStored() view returns (uint256)",
  "function getCash() view returns (uint256)",
  "function totalBorrows() view returns (uint256)",
  "function totalReserves() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function reserveFactorMantissa() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function borrowRatePerBlock() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function getAccountSnapshot(address account) view returns (uint256 err, uint256 mTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa)",
]);
const oracleAbi = parseAbi(["function getUnderlyingPrice(address mToken) view returns (uint256)"]);

const E18 = 10n ** 18n;
// Compound v2 Exp mul_: truncating 1e18 fixed-point multiply.
const expMul = (a, b) => (a * b) / E18;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const atC = (functionName, args = []) =>
  client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName, args });
const atM = (mtoken, functionName, args = []) =>
  client.readContract({ address: mtoken, abi: mtokenAbi, functionName, args });

async function apiMarkets(wallet) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  const res = await fetch(`${env.RAILS_API_URL}/api/moonwell/positions?wallet=${wallet}&limit=5`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const row = json.rows?.find((r) => r.wallet?.toLowerCase() === wallet.toLowerCase());
  return row?.markets ?? null; // [{market, supplyPrincipalRaw, mtokenBalanceRaw, debtBalanceRaw}]
}

/** Block of the wallet's last debt-writing event (borrow/repay/liquidation)
 *  per market — the block whose end-of-block borrowIndex the emitted
 *  accountBorrows is denominated in (one accrual per timestamp, so the
 *  event's own accrual IS the block's closing index). */
async function apiLastDebtEventBlocks(wallet) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  const res = await fetch(`${env.RAILS_API_URL}/api/moonwell/timeline?wallet=${wallet}`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const out = new Map();
  for (const r of json.rows ?? []) {
    if (r.action !== "borrow" && r.action !== "repay" && r.action !== "liquidation") continue;
    const prev = out.get(r.market) ?? 0;
    if (Number(r.block_number) > prev) out.set(r.market, Number(r.block_number));
  }
  return out;
}

// ── 1+2. Catalog + Comptroller config ───────────────────────────────────────

console.log("== Comptroller + catalog ==");
const [allMarkets, oracleAddr, closeFactor, liqIncentive] = await Promise.all([
  atC("getAllMarkets"),
  atC("oracle"),
  atC("closeFactorMantissa"),
  atC("liquidationIncentiveMantissa"),
]);
check(
  "getAllMarkets() == the four catalog mTokens, in order",
  allMarkets.length === MARKETS.length && allMarkets.every((a, i) => a.toLowerCase() === MARKETS[i].mtoken),
  allMarkets.join(", "),
);
check("oracle() matches catalog", oracleAddr.toLowerCase() === ORACLE, oracleAddr);
check("closeFactor == 0.5", closeFactor === E18 / 2n, closeFactor.toString());
check("liquidationIncentive == 1.10", liqIncentive === (E18 * 110n) / 100n, liqIncentive.toString());

for (const m of MARKETS) {
  const [underlying, decimals, [isListed, cfMantissa]] = await Promise.all([
    atM(m.mtoken, "underlying"),
    atM(m.mtoken, "decimals"),
    atC("markets", [m.mtoken]),
  ]);
  check(
    `${m.key}: listed, underlying + CF match catalog`,
    isListed && underlying.toLowerCase() === m.underlying && Number(cfMantissa) / 1e18 === m.collateralFactor,
    `CF ${Number(cfMantissa) / 1e18}`,
  );
  check(`${m.key}: mToken is 8 dp`, decimals === 8);
}
await pause(1_000);

// ── 3-5. Rates, exchange-rate identity, oracle numeraire ────────────────────

const marketCtx = {}; // key -> { exchangeRate, price } (BigInt raws)
for (const m of MARKETS) {
  console.log(`\n== Market ${m.key} (${m.mtoken}) ==`);
  const [rate, cash, borrows, reserves, supply, reserveFactor, borrowRate, supplyRate, priceRaw] = await Promise.all([
    atM(m.mtoken, "exchangeRateStored"),
    atM(m.mtoken, "getCash"),
    atM(m.mtoken, "totalBorrows"),
    atM(m.mtoken, "totalReserves"),
    atM(m.mtoken, "totalSupply"),
    atM(m.mtoken, "reserveFactorMantissa"),
    atM(m.mtoken, "borrowRatePerTimestamp"),
    atM(m.mtoken, "supplyRatePerTimestamp"),
    client.readContract({ address: ORACLE, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [m.mtoken] }),
  ]);

  check(
    `${m.key}: exchangeRateStored == (cash + borrows - reserves) x 1e18 / totalSupply (exact)`,
    supply > 0n && rate === ((cash + borrows - reserves) * E18) / supply,
    rate.toString(),
  );

  const util = cash + borrows - reserves > 0n ? Number(borrows) / Number(cash + borrows - reserves) : 0;
  const identity = (Number(borrowRate) / 1e18) * util * (1 - Number(reserveFactor) / 1e18);
  const supplyR = Number(supplyRate) / 1e18;
  check(
    `${m.key}: supplyRate ~= borrowRate x util x (1 - reserveFactor)`,
    borrows === 0n || Math.abs(supplyR - identity) / identity < 0.01,
    `${supplyR.toExponential(3)} vs ${identity.toExponential(3)} @ util ${(util * 100).toFixed(1)}%`,
  );

  const priceUsd = Number(priceRaw) / 10 ** (36 - m.decimals);
  const band =
    m.key === "usdc" || m.key === "usdt"
      ? Math.abs(priceUsd - 1) < 0.02
      : m.key === "weth"
        ? priceUsd > 500 && priceUsd < 50_000
        : priceUsd > 10_000 && priceUsd < 1_000_000;
  check(`${m.key}: oracle price sane at scale 1e(36-${m.decimals})`, band, `$${priceUsd.toFixed(2)}`);

  marketCtx[m.key] = { exchangeRate: rate, price: priceRaw, m };
}

// The per-BLOCK getter must revert — accrual is per-timestamp on this deploy.
const perBlock = await atM(MARKETS[0].mtoken, "borrowRatePerBlock").then(
  () => "answered",
  () => "reverted",
);
check("borrowRatePerBlock REVERTS (per-timestamp accrual convention)", perBlock === "reverted");
await pause(1_000);

// ── 6-8. Accounts: snapshot mirror, liquidity replica, index agreement ──────

for (const wallet of SAMPLES) {
  const account = getAddress(wallet);
  console.log(`\n== Account ${wallet} ==`);

  const [assetsIn, [liqError, liquidity, shortfall]] = await Promise.all([
    atC("getAssetsIn", [account]),
    atC("getAccountLiquidity", [account]),
  ]);
  check(`${wallet.slice(0, 8)}: getAccountLiquidity error == 0`, liqError === 0n);

  const perMarket = await Promise.all(
    MARKETS.map((m) =>
      Promise.all([
        atM(m.mtoken, "balanceOf", [account]),
        atM(m.mtoken, "borrowBalanceStored", [account]),
        atM(m.mtoken, "getAccountSnapshot", [account]),
      ]),
    ),
  );

  let snapshotOk = true;
  let membershipOk = true;
  // The Comptroller's hypothetical-liquidity walk, BigInt-exact in its own
  // Exp-mul truncation order: tokensToDenom = ((CF . rate) . price);
  // sumCollateral += tokensToDenom . mTokens; sumBorrow += price . borrow.
  // It walks ONLY the markets the account has entered (getAssetsIn).
  let sumCollateral = 0n;
  let sumBorrow = 0n;
  const entered = new Set(assetsIn.map((a) => a.toLowerCase()));
  perMarket.forEach(([bal, borrow, snap], i) => {
    const m = MARKETS[i];
    const [snapErr, snapTokens, snapBorrow, snapRate] = snap;
    const { exchangeRate, price } = marketCtx[m.key];
    if (snapErr !== 0n || snapTokens !== bal || snapBorrow !== borrow || snapRate !== exchangeRate) snapshotOk = false;
    if (borrow > 0n && !entered.has(m.mtoken)) membershipOk = false;
    if (bal > 0n && !entered.has(m.mtoken))
      console.log(`      ${m.key}: ${Number(bal) / 1e8} mTokens NOT entered — backs nothing in the liquidity walk`);
    if (!entered.has(m.mtoken)) return;
    const cf = BigInt(Math.round(m.collateralFactor * 1e18));
    sumCollateral += expMul(expMul(expMul(cf, exchangeRate), price), bal);
    sumBorrow += expMul(price, borrow);
    if (bal > 0n || borrow > 0n)
      console.log(
        `      ${m.key}: ${Number(bal) / 1e8} mTokens${borrow > 0n ? ` / borrow ${Number(borrow) / 10 ** m.decimals}` : ""}`,
      );
  });
  check(`${wallet.slice(0, 8)}: getAccountSnapshot mirrors individual reads`, snapshotOk);
  check(`${wallet.slice(0, 8)}: every nonzero borrow is in getAssetsIn`, membershipOk);

  const expLiquidity = sumCollateral > sumBorrow ? sumCollateral - sumBorrow : 0n;
  const expShortfall = sumBorrow > sumCollateral ? sumBorrow - sumCollateral : 0n;
  check(
    `${wallet.slice(0, 8)}: liquidity replica EXACT vs getAccountLiquidity`,
    liquidity === expLiquidity && shortfall === expShortfall,
    `liquidity $${(Number(liquidity) / 1e18).toFixed(2)} / shortfall $${(Number(shortfall) / 1e18).toFixed(2)}` +
      (sumBorrow > 0n ? ` / HF ${(Number(sumCollateral) / Number(sumBorrow)).toFixed(4)}` : ""),
  );

  // Index agreement (skipped without API creds).
  const rows = await apiMarkets(wallet);
  if (rows && rows.length > 0) {
    let supplyExact = true;
    let debtDriftOk = true;
    let matched = 0; // markets actually compared — the checks below assert over THIS, not over an empty loop
    // The gap between emitted accountBorrows and borrowBalanceStored is not a
    // tolerance band — it is the protocol's own arithmetic:
    //   borrowBalanceStored == accountBorrows × borrowIndex(now) ÷
    //   borrowIndex(last debt event), truncating.
    // A flat drift ceiling reds on any borrower quiet for a few weeks (the
    // 0x33a7ec usdc lane hit 0.65% over 19 quiet days with a wei-exact
    // identity), so the check asserts the identity itself: all reads pinned
    // to one block, the event-side index read at the last debt event's own
    // block (one accrual per timestamp → the event's accrual IS that block's
    // closing borrowIndex).
    const anyDebt = rows.some((r) => BigInt(r.debtBalanceRaw ?? "0") > 0n) || perMarket.some(([, b]) => b > 0n);
    const lastDebtBlocks = anyDebt ? await apiLastDebtEventBlocks(wallet) : null;
    const pinnedBlock = anyDebt ? await client.getBlockNumber() : null;
    for (const r of rows) {
      const i = MARKETS.findIndex((m) => m.key === r.market);
      if (i < 0) continue;
      matched++;
      const [bal, borrow] = perMarket[i];
      if (BigInt(r.mtokenBalanceRaw ?? "0") !== bal) supplyExact = false;
      const indexed = BigInt(r.debtBalanceRaw ?? "0");
      if (indexed > 0n || borrow > 0n) {
        const eventBlock = lastDebtBlocks?.get(r.market);
        if (indexed === 0n || !eventBlock) {
          // Chain carries debt the index never recorded an event for — a real
          // gap, not accrual.
          debtDriftOk = false;
          console.log(`      ${r.market}: indexed debt ${indexed} with no debt event — chain ${borrow}`);
          continue;
        }
        const [idxAtEvent, idxNow, liveNow] = await Promise.all([
          client.readContract({
            address: MARKETS[i].mtoken,
            abi: mtokenAbi,
            functionName: "borrowIndex",
            blockNumber: BigInt(eventBlock),
          }),
          client.readContract({
            address: MARKETS[i].mtoken,
            abi: mtokenAbi,
            functionName: "borrowIndex",
            blockNumber: pinnedBlock,
          }),
          client.readContract({
            address: MARKETS[i].mtoken,
            abi: mtokenAbi,
            functionName: "borrowBalanceStored",
            args: [account],
            blockNumber: pinnedBlock,
          }),
        ]);
        const scaled = (indexed * idxNow) / idxAtEvent;
        const ok = liveNow === scaled;
        if (!ok) debtDriftOk = false;
        console.log(
          `      ${r.market}: indexed ${indexed} × idx ratio = ${scaled} vs chain ${liveNow} @${pinnedBlock}` +
            (ok ? " (identity EXACT)" : ` (residual ${liveNow - scaled})`),
        );
      }
    }
    check(`${wallet.slice(0, 8)}: replayed mToken balances wei-exact vs chain`, matched > 0 && supplyExact);
    check(
      `${wallet.slice(0, 8)}: emitted debt is the stored balance at the event's own borrowIndex`,
      matched > 0 && debtDriftOk,
    );
  } else {
    console.log("      (no live-index row — API creds missing or row absent; index checks skipped)");
  }
  await pause(1_200);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
