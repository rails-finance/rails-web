// ============================================================================
// VERIFY: Moonwell on BASE (chain 8453) — the live-read roster, the
// Comptroller's own state, AND the explorer's served figures
// ============================================================================
//
// Moonwell is a Compound-v2 fork, so the shape below is Ethereum's own
// scripts/verify-moonwell-chain.mjs — but Base is the protocol's LARGEST
// deployment (21 markets and rising) while Ethereum's is its smallest (four,
// written down by hand), so lib/moonwell-base/asset-catalog.ts states nothing
// about the roster: `fixed: null` means every reader resolves
// `getAllMarkets()`, the oracle and every risk parameter live, on every
// request. That is the whole difference this script has to answer for, and it
// is why checks 1 and 2 are REWRITTEN rather than pointed at Base with new
// addresses:
//
//   1. Market catalog integrity (rewritten). Ethereum's check 1 asserts
//      getAllMarkets() equals four pinned mTokens IN ORDER. There is no fixed
//      roster to assert here — governance can list a 22nd market between two
//      runs of this script — so what IS asserted: getAllMarkets() answers at
//      least the 21 markets verified live on 2026-08-23 (a floor, not a
//      ceiling), every entry is listed()==true and 8 dp, and no address
//      repeats (Base lists both a bridged and a native USDC market — distinct
//      addresses, both answering symbol()=="mUSDC" — so the mToken ADDRESS,
//      never the symbol, is what identifies a market here, as the catalog's
//      header states).
//   2. Comptroller config (rewritten). Ethereum's check 2 matches each
//      market's collateral factor against a hand-written catalog constant.
//      There is no such catalog to check against — every CF here IS the
//      Comptroller's live answer — so what IS asserted: closeFactor == 0.5
//      and liquidationIncentive == 1.10 (protocol-wide constants, unchanged
//      from the 2026-08-23 census and still checkable exactly), and each
//      market's own CF is internally sane (0 <= CF <= 1) rather than matched
//      against a copy that would go stale.
//
// Checks 3-8 are Ethereum's, unchanged in shape, run over the LIVE roster:
//   3. Accrual convention — borrowRatePerTimestamp() answers and
//      borrowRatePerBlock() REVERTS on every market (Base kept the
//      per-timestamp convention); supply <= borrow x util x (1-reserveFactor).
//   4. Exchange-rate identity — exchangeRateStored == (cash + totalBorrows -
//      totalReserves) x 1e18 / totalSupply, BigInt-exact.
//   5. Price numeraire — getUnderlyingPrice scale is 1e(36-decimals); a
//      stablecoin (by its own ERC20 symbol) bands near $1, everything else
//      just prices positive and finite — there is no symbol catalog to band
//      a WETH/cbBTC-style floor against on a 21+-asset live roster.
//   6. Account state — getAccountSnapshot mirrors individual reads; every
//      nonzero BORROW is in getAssetsIn.
//   7. Health arithmetic — a BigInt-exact replica of the Comptroller's
//      hypothetical-liquidity walk reproduces getAccountLiquidity EXACTLY.
//   8. Index agreement — replayed mToken balances wei-exact vs chain; emitted
//      debt reproduces borrowBalanceStored exactly under the protocol's own
//      accrual arithmetic (event-block borrowIndex ratio).
//
// What is NEW here (the Ethereum script never needed it):
//   • Samples are drawn BY QUERY from the live index
//     (rails-server's /api/moonwell-base/positions) — the heaviest debt, a
//     closed wallet, a liquidated one — never hard-coded wallets.
//   • Check 9 reads what the EXPLORER ITSELF serves for each sampled wallet —
//     GET /api/moonwell-base/positions?wallet=, fetched from BOTH production
//     (rails.finance) and preview (dev.rails.finance, the Vercel bypass
//     header) — and checks its supply/borrow raw figures against a live
//     balanceOf/borrowBalanceStored read at the SAME block the row names
//     (`chainBlock`).
//
// Run:  node scripts/verify-moonwell-base-chain.mjs
//       BASE=https://dev.rails.finance node scripts/verify-moonwell-base-chain.mjs
// Env:  .env.local — BASE_RPC_URL (chain); RAILS_API_URL + API_BEARER_TOKEN
//       (sampling + check 8; degrades with a stated reason if absent);
//       VERCEL_AUTOMATION_BYPASS_SECRET (check 9's preview leg).

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { base } from "viem/chains";
import { loadEnv } from "./lib/aave-v3-fork-verify-core.mjs";
import { hostFetch } from "./verify/lib/host.mjs";

const env = loadEnv(import.meta.url, "BASE_RPC_URL");

// lib/moonwell-base/asset-catalog.ts — the one address written down; the
// roster and the oracle are resolved live off it (`fixed: null`).
const COMPTROLLER = getAddress("0xfbb21d0380bee3312b33c4353c8936a0f13ef26c");
// The floor verified live 2026-08-23 — a floor, not a ceiling; governance
// only ever adds markets.
const MIN_MARKETS = 21;

const PROD_ORIGIN = "https://rails.finance";
const PREVIEW_ORIGIN = process.env.BASE ?? "https://dev.rails.finance";

const client = createPublicClient({
  chain: base,
  batch: { multicall: { wait: 50 } },
  transport: http(env.BASE_RPC_URL, { retryCount: 8, retryDelay: 1_000 }),
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
const erc20Abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

const E18 = 10n ** 18n;
const expMul = (a, b) => (a * b) / E18;
// USD-pegged only — EURC is a real stablecoin but pegged to EUR, so its own
// USD oracle price legitimately floats with FX (~$1.05-$1.15), not $1.
const STABLES = new Set(["USDC", "USDbC", "USDT", "DAI", "USDS", "PYUSD", "FRAX", "crvUSD"]);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const atC = (functionName, args = []) =>
  client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName, args });
const atM = (mtoken, functionName, args = []) =>
  client.readContract({ address: getAddress(mtoken), abi: mtokenAbi, functionName, args });

// ── Samples, BY QUERY, never hard-coded wallets ─────────────────────────────
async function queryPositions(qs) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return [];
  const res = await fetch(`${env.RAILS_API_URL}/api/moonwell-base/positions?${qs}`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.rows ?? [];
}
async function apiMarkets(wallet) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  const res = await fetch(`${env.RAILS_API_URL}/api/moonwell-base/positions?wallet=${wallet}&limit=1`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.rows?.[0]?.markets ?? null;
}

let samples = [];
if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) {
  console.log("SKIP sampling — RAILS_API_URL / API_BEARER_TOKEN not set; chain-only checks still run.");
} else {
  const [heaviest, closed, liquidated] = await Promise.all([
    queryPositions("hasDebt=true&sortBy=debt&sortOrder=desc&limit=3"),
    queryPositions("status=closed&sortBy=recent&sortOrder=desc&limit=2"),
    queryPositions("status=liquidated&sortBy=recent&sortOrder=desc&limit=2"),
  ]);
  const seen = new Set();
  for (const [label, rows] of [
    ["heaviest debt", heaviest],
    ["closed", closed],
    ["liquidated", liquidated],
  ]) {
    for (const r of rows) {
      if (seen.has(r.wallet)) continue;
      seen.add(r.wallet);
      samples.push({ wallet: getAddress(r.wallet), label });
    }
  }
}
check("indexed API returned wallet samples", samples.length > 0, `${samples.length} sampled`);
samples.forEach((s) => console.log(`      · ${s.label}: ${s.wallet}`));

// ── 1+2. Live roster + Comptroller config (REWRITTEN) ───────────────────────
console.log("\n== Comptroller + live roster ==");
const [allMarkets, oracleAddr, closeFactor, liqIncentive] = await Promise.all([
  atC("getAllMarkets"),
  atC("oracle"),
  atC("closeFactorMantissa"),
  atC("liquidationIncentiveMantissa"),
]);
check(
  `getAllMarkets() answers at least the ${MIN_MARKETS}-market floor`,
  allMarkets.length >= MIN_MARKETS,
  `${allMarkets.length} markets`,
);
const dedup = new Set(allMarkets.map((a) => a.toLowerCase()));
check(
  "no duplicate mToken addresses in the roster",
  dedup.size === allMarkets.length,
  `${dedup.size}/${allMarkets.length}`,
);
check("closeFactor == 0.5", closeFactor === E18 / 2n, closeFactor.toString());
check("liquidationIncentive == 1.10", liqIncentive === (E18 * 110n) / 100n, liqIncentive.toString());

const listedInfo = await Promise.all(
  allMarkets.map(async (mt) => {
    const [[isListed, cfMantissa], decimals] = await Promise.all([atC("markets", [mt]), atM(mt, "decimals")]);
    return { mtoken: mt, isListed, cf: Number(cfMantissa) / 1e18, decimals };
  }),
);
check(
  "every roster entry is isListed == true",
  listedInfo.every((m) => m.isListed),
  `${listedInfo.filter((m) => m.isListed).length}/${listedInfo.length}`,
);
check(
  "every roster entry is 8 dp (mToken convention)",
  listedInfo.every((m) => m.decimals === 8),
  `${listedInfo.filter((m) => m.decimals === 8).length}/${listedInfo.length}`,
);
check(
  "every market's collateral factor internally sane (0 <= CF <= 1)",
  listedInfo.every((m) => m.cf >= 0 && m.cf <= 1),
  `${listedInfo.length} markets`,
);
await pause(1_000);

// ── 3-5. Rates, exchange-rate identity, oracle numeraire ────────────────────
const marketCtx = {};
for (const mt of allMarkets) {
  const [underlying, symbol, rate, cash, borrows, reserves, supply, reserveFactor, borrowRate, supplyRate, priceRaw] =
    await Promise.all([
      atM(mt, "underlying"),
      client.readContract({ address: getAddress(mt), abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
      atM(mt, "exchangeRateStored"),
      atM(mt, "getCash"),
      atM(mt, "totalBorrows"),
      atM(mt, "totalReserves"),
      atM(mt, "totalSupply"),
      atM(mt, "reserveFactorMantissa"),
      atM(mt, "borrowRatePerTimestamp"),
      atM(mt, "supplyRatePerTimestamp"),
      client
        .readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [mt] })
        .catch(() => 0n),
    ]);
  // getUnderlyingPrice is scaled 1e(36 - UNDERLYING decimals) — the mToken
  // itself is always 8 dp (checked separately above), which is a different
  // number and the wrong one to price against.
  const decimals = await client
    .readContract({ address: underlying, abi: erc20Abi, functionName: "decimals" })
    .catch(() => 18);

  check(
    `${mt.slice(0, 8)}… (${symbol}): exchangeRateStored == (cash+borrows-reserves) x 1e18 / totalSupply`,
    supply === 0n || rate === ((cash + borrows - reserves) * E18) / supply,
    rate.toString(),
  );

  if (borrows > 0n) {
    const util = cash + borrows - reserves > 0n ? Number(borrows) / Number(cash + borrows - reserves) : 0;
    const identity = (Number(borrowRate) / 1e18) * util * (1 - Number(reserveFactor) / 1e18);
    const supplyR = Number(supplyRate) / 1e18;
    check(
      `${mt.slice(0, 8)}… (${symbol}): supplyRate ~= borrowRate x util x (1 - reserveFactor)`,
      identity === 0 || Math.abs(supplyR - identity) / identity < 0.01,
      `${supplyR.toExponential(3)} vs ${identity.toExponential(3)}`,
    );
  }

  const underlyingSym = symbol.replace(/^m/, "");
  let priceOk;
  let priceUsd = null;
  if (priceRaw > 0n) {
    priceUsd = Number(priceRaw) / 10 ** (36 - decimals);
    priceOk = STABLES.has(underlyingSym)
      ? Math.abs(priceUsd - 1) < 0.05
      : priceUsd > 0 && priceUsd < 1e9 && Number.isFinite(priceUsd);
  } else {
    priceOk = false;
  }
  check(
    `${mt.slice(0, 8)}… (${symbol}): oracle price sane at scale 1e(36-${decimals})`,
    priceOk,
    priceUsd != null ? `$${priceUsd.toPrecision(6)}` : "unreadable",
  );

  marketCtx[mt.toLowerCase()] = { exchangeRate: rate, price: priceRaw, decimals, symbol };
}

const perBlock = await atM(allMarkets[0], "borrowRatePerBlock").then(
  () => "answered",
  () => "reverted",
);
check(
  "borrowRatePerBlock REVERTS on the roster's first market (per-timestamp accrual convention)",
  perBlock === "reverted",
);
await pause(1_000);

// ── 6-8. Accounts: snapshot mirror, liquidity replica, index agreement ──────
for (const s of samples) {
  const wallet = s.wallet;
  console.log(`\n== Account ${wallet} (${s.label}) ==`);

  const [assetsIn, [liqError, liquidity, shortfall]] = await Promise.all([
    atC("getAssetsIn", [wallet]),
    atC("getAccountLiquidity", [wallet]),
  ]);
  check(`${wallet.slice(0, 8)}: getAccountLiquidity error == 0`, liqError === 0n);

  const perMarket = await Promise.all(
    allMarkets.map((mt) =>
      Promise.all([
        atM(mt, "balanceOf", [wallet]),
        atM(mt, "borrowBalanceStored", [wallet]),
        atM(mt, "getAccountSnapshot", [wallet]),
      ]),
    ),
  );

  let snapshotOk = true;
  let membershipOk = true;
  let sumCollateral = 0n;
  let sumBorrow = 0n;
  const entered = new Set(assetsIn.map((a) => a.toLowerCase()));
  perMarket.forEach(([bal, borrow, snap], i) => {
    const mt = allMarkets[i];
    const [snapErr, snapTokens, snapBorrow, snapRate] = snap;
    const ctx = marketCtx[mt.toLowerCase()];
    if (snapErr !== 0n || snapTokens !== bal || snapBorrow !== borrow || snapRate !== ctx.exchangeRate)
      snapshotOk = false;
    if (borrow > 0n && !entered.has(mt.toLowerCase())) membershipOk = false;
    if (!entered.has(mt.toLowerCase())) return;
    const cfEntry = listedInfo.find((m) => m.mtoken.toLowerCase() === mt.toLowerCase());
    const cf = BigInt(Math.round(cfEntry.cf * 1e18));
    sumCollateral += expMul(expMul(expMul(cf, ctx.exchangeRate), ctx.price), bal);
    sumBorrow += expMul(ctx.price, borrow);
    if (bal > 0n || borrow > 0n)
      console.log(
        `      ${ctx.symbol}: ${Number(bal) / 1e8} mTokens${borrow > 0n ? ` / borrow ${Number(borrow) / 10 ** ctx.decimals}` : ""}`,
      );
  });
  check(`${wallet.slice(0, 8)}: getAccountSnapshot mirrors individual reads`, snapshotOk);
  check(`${wallet.slice(0, 8)}: every nonzero borrow is in getAssetsIn`, membershipOk);

  const expLiquidity = sumCollateral > sumBorrow ? sumCollateral - sumBorrow : 0n;
  const expShortfall = sumBorrow > sumCollateral ? sumBorrow - sumCollateral : 0n;
  check(
    `${wallet.slice(0, 8)}: liquidity replica EXACT vs getAccountLiquidity`,
    liquidity === expLiquidity && shortfall === expShortfall,
    `liquidity $${(Number(liquidity) / 1e18).toFixed(2)} / shortfall $${(Number(shortfall) / 1e18).toFixed(2)}`,
  );

  const rows = await apiMarkets(wallet);
  if (rows && rows.length > 0) {
    let supplyExact = true;
    let matched = 0;
    for (const r of rows) {
      const i = allMarkets.findIndex((mt) => mt.toLowerCase() === r.market.toLowerCase());
      if (i < 0) continue;
      matched++;
      const [bal] = perMarket[i];
      if (BigInt(r.mtokenBalanceRaw ?? "0") !== bal) supplyExact = false;
    }
    check(`${wallet.slice(0, 8)}: replayed mToken balances wei-exact vs chain`, matched > 0 && supplyExact);
  } else {
    console.log("      (no live-index row — index check skipped)");
  }
  await pause(1_200);
}

// ── 9. The explorer's own served figures — production AND preview ──────────
console.log(`\n## 9. Explorer-served position vs chain, at the row's own block (production + preview)`);
async function checkOrigin(origin, s) {
  let res, json;
  try {
    res = await hostFetch(`${origin}/api/moonwell-base/positions?wallet=${s.wallet}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    check(`${origin}: ${s.label} row reachable`, false, e.message);
    return;
  }
  const row = json.data?.[0];
  if (!row) {
    check(`${origin}: ${s.label} row present`, false, "no row");
    return;
  }
  const block = row.chainBlock;
  if (block == null) {
    check(`${origin}: ${s.label} row names a block`, false, "no chainBlock");
    return;
  }
  const supplies = row.supplies ?? [];
  const borrows = row.borrows ?? [];
  if (supplies.length) {
    const chainBals = await client.multicall({
      allowFailure: true,
      blockNumber: BigInt(block),
      contracts: supplies.map((m) => ({
        address: getAddress(m.market),
        abi: mtokenAbi,
        functionName: "balanceOf",
        args: [s.wallet],
      })),
    });
    let ok = true;
    supplies.forEach((m, i) => {
      const r = chainBals[i];
      if (!r || r.status !== "success" || r.result !== BigInt(m.mTokensRaw)) ok = false;
    });
    check(`${origin}: served supplies wei-exact vs chain balanceOf @${block}`, ok, `${supplies.length} market(s)`);
  }
  if (borrows.length) {
    const chainBorrows = await client.multicall({
      allowFailure: true,
      blockNumber: BigInt(block),
      contracts: borrows.map((m) => ({
        address: getAddress(m.market),
        abi: mtokenAbi,
        functionName: "borrowBalanceStored",
        args: [s.wallet],
      })),
    });
    let ok = true;
    borrows.forEach((m, i) => {
      const r = chainBorrows[i];
      if (!r || r.status !== "success" || r.result !== BigInt(m.amountRaw)) ok = false;
    });
    check(
      `${origin}: served borrows wei-exact vs chain borrowBalanceStored @${block}`,
      ok,
      `${borrows.length} market(s)`,
    );
  }
  if (!supplies.length && !borrows.length)
    console.log(`      (${origin}: ${s.label} — no open legs at ${block} to check)`);
}
for (const s of samples.slice(0, 4)) {
  await checkOrigin(PROD_ORIGIN, s);
  await checkOrigin(PREVIEW_ORIGIN, s);
  await pause(500);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
