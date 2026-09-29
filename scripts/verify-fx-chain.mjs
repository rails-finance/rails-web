// ============================================================================
// VERIFY: f(x) Protocol V2 chain assumptions for the /fx explorer
// ============================================================================
//
// Read-only, assertion-based, and SELF-CONTAINED: every claim the explorer
// makes is re-derived here from the chain alone (eth_call), with no database
// sample and no block-explorer dependency. (The 2026-07-14 onboarding spike
// this replaces read a postgres-derived fx-sample.json and called Etherscan
// for its roster — neither is reachable from a clean checkout, so its cell
// stayed `verification: false`.) Alchemy's free tier caps eth_getLogs at a
// 10-block range, so nothing here reads a log: the pool's own views carry the
// whole proof.
//
// The explorer's central claim is that an f(x) position mutates with NO
// per-position event — funding, socialized tick/pool rebalances and bad-debt
// write-offs all move real collateral and debt silently — so event replay can
// never state current state and the SETTLED lane (the pool's own getPosition
// view) is the only truth. That claim is what check 6 proves outright.
//
// Checks:
//   1. Catalog & roster — each pool's own collateralToken / poolManager /
//      fxUSD getters agree with lib/fx/asset-catalog.ts, the token decimals
//      match, and the PoolManager answers getPoolInfo for the pool (i.e. it
//      is registered). A roster proof that needs no RegisterPool log.
//   2. Index accounting — the engine behind the settled lane. A pool holds
//      SHARES and two X96 indices; the amounts are derived:
//        getTotalRawDebts        == debtShares × debtIndex ÷ 2^96
//        getTotalRawCollaterals  == collShares × 2^96 ÷ collIndex
//      Both BigInt-exact. Note the asymmetry — the debt index MULTIPLIES
//      (a share owes more over time) and the collateral index DIVIDES (a
//      share holds less: funding charges collateral away).
//   3. The two unit systems — TOKEN (what Operate emits: wstETH 18dp /
//      WBTC 8dp) vs RATE-NORMALIZED 1e18 (what getPosition and the settled
//      lane quote). PoolManager.getPoolInfo returns both side by side. What
//      is asserted exact is the RATE SOURCE: the manager's registered
//      rateProvider.getRate() for wstETH is wstETH's OWN stEthPerToken,
//      identical to the wei. The book pair itself is REPORTED, not equated:
//      the manager keeps the two columns as independent running sums (each
//      operation floors its own conversion at that moment's rate and only
//      deltas accumulate — _changePoolCollateral never re-syncs one from the
//      other), so `tokenBal × liveRate ÷ 1e18` differs from the stored
//      normalized column by an irreducible floor residual PLUS the rebases
//      since the pool's last write (block 25581066 alone moved it +0.335
//      stETH with the book untouched). The exact-conversion proof lives in
//      check 2 (share × index); this check states the residual and why.
//      The WBTC pool's implied rate is reported.
//   4. Oracle — the pool oracle's three prices (anchor / min / max) are
//      ordered and positive, and the protocol's own getLiquidatePrice picks
//      the min leg. getRedeemPrice is REPORTED against the max leg, not
//      equated: it matched max at the 2026-07 calibration block and has
//      since drifted ~0.045% above it — the equality was a coincidence of
//      that block, not a contract invariant.
//   5. Debt-ratio identity — the pool's OWN getPositionDebtRatio equals
//        debts × 1e36 ÷ (colls × ANCHOR price)
//      BigInt-exact, per sampled position. This simultaneously proves the
//      1e18 price scale, that the price is quoted per NORMALIZED unit, and
//      that risk is judged at the ANCHOR price specifically.
//   6. The socialized lane, proven WITHOUT A SINGLE LOG — invert the index
//      accounting to recover a position's shares at two blocks:
//        debtShares = rawDebts × 2^96 ÷ debtIndex
//        collShares = rawColls × collIndex ÷ 2^96
//      For a position with no event in the window, the shares come back
//      IDENTICAL while getPosition's amounts have MOVED. That is eventless
//      mutation, demonstrated exactly — the reason the settled lane exists.
//   7. Config ladder — the debt-ratio range and the rebalance → liquidate
//      escalation are ordered as the explainers describe.
//   8. Index agreement (REPORTED, not asserted) — the live re-read vs the
//      backend's stamped settled sweep, the implied-vs-settled socialized
//      gap, and WHICH oracle leg the backend snapshots as pool_oracle_price.
//      The gaps are the point, not a failure. The one assertion here is the
//      LEG IDENTITY (classified with a 1e-6 band — the legs sit ~0.1%+
//      apart); byte-exactness is reported, not asserted, because the stamp
//      is the EVENT-emitted price of that block's position touch (intra-
//      block state) while the re-read is an end-of-block eth_call — a leg
//      that moves inside the stamp's own block (wstETH's Curve-EMA min on
//      any swap; WBTC's min when a Chainlink update lands later in the
//      block) leaves the stamp at the PREVIOUS block's state, so the
//      classification tests both moments.
//
// Run:  node scripts/verify-fx-chain.mjs
// Env:  .env.local — ALCHEMY_URL (chain; required),
//       RAILS_API_URL + API_BEARER_TOKEN (index samples; without them the
//       script falls back to scanning the pools for live positions).
// ============================================================================

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

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 800, batch: true }),
});

// ── the catalog under test (mirrors lib/fx/asset-catalog.ts) ────────────────
const POOL_MANAGER = "0x250893CA4Ba5d05626C785e8da758026928FCD24";
const FXUSD = "0x085780639CC2cACd35E474e71f4d000e2405d8f6";
const POOLS = {
  wsteth: {
    address: "0x6Ecfa38FeE8a5277B91eFdA204c235814F0122E8",
    tokenSymbol: "wstETH",
    tokenAddress: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    tokenDecimals: 18,
    normalizedSymbol: "stETH",
  },
  wbtc: {
    address: "0xAB709e26Fa6B0A30c119D8c55B887DeD24952473",
    tokenSymbol: "WBTC",
    tokenAddress: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    tokenDecimals: 8,
    normalizedSymbol: "WBTC",
  },
};

const X96 = 2n ** 96n;
const E18 = 10n ** 18n;
/** Window for the eventless-mutation proof (~7 days of blocks). */
const LOOKBACK = 50_000n;

const POOL_ABI = parseAbi([
  "function getPosition(uint256) view returns (uint256,uint256)",
  "function getPositionDebtRatio(uint256) view returns (uint256)",
  "function getTotalRawCollaterals() view returns (uint256)",
  "function getTotalRawDebts() view returns (uint256)",
  "function getDebtAndCollateralIndex() view returns (uint256,uint256)",
  "function getDebtAndCollateralShares() view returns (uint256,uint256)",
  "function getDebtRatioRange() view returns (uint256,uint256)",
  "function getRebalanceRatios() view returns (uint256,uint256)",
  "function getLiquidateRatios() view returns (uint256,uint256)",
  "function getNextPositionId() view returns (uint32)",
  "function priceOracle() view returns (address)",
  "function collateralToken() view returns (address)",
  "function poolManager() view returns (address)",
  "function fxUSD() view returns (address)",
]);
const ORACLE_ABI = parseAbi([
  "function getPrice() view returns (uint256,uint256,uint256)",
  "function getLiquidatePrice() view returns (uint256)",
  "function getRedeemPrice() view returns (uint256)",
]);
const PM_ABI = parseAbi([
  "function getPoolInfo(address) view returns (uint256,uint256,uint256,uint256)",
  "function tokenRates(address) view returns (uint96 scalar, address rateProvider)",
]);
const RATE_PROVIDER_ABI = parseAbi(["function getRate() view returns (uint256)"]);
const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const WSTETH_ABI = parseAbi(["function stEthPerToken() view returns (uint256)"]);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const info = (msg) => console.log(`      ${msg}`);
const same = (a, b) => getAddress(a) === getAddress(b);
/** Human-readable fixed-point render, for report lines only. */
const fmt = (v, d = 18, places = 6) => {
  const neg = v < 0n;
  const x = neg ? -v : v;
  const unit = 10n ** BigInt(d);
  const frac = (x % unit).toString().padStart(d, "0").slice(0, places);
  return `${neg ? "−" : ""}${(x / unit).toLocaleString("en-US")}.${frac}`;
};

const head = await client.getBlockNumber();
const past = head - LOOKBACK;
console.log(`f(x) V2 chain verification — head block ${head} (lookback window ${past}→${head})\n`);

// ── index samples (used to CHOOSE subjects; their agreement is reported) ────
let rows = [];
if (env.RAILS_API_URL && env.API_BEARER_TOKEN) {
  const fetchRows = async (qs) => {
    const res = await fetch(`${env.RAILS_API_URL}/api/fx/positions?${qs}`, {
      headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
    });
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    return (await res.json()).positions ?? [];
  };
  for (const key of Object.keys(POOLS)) {
    const got = await fetchRows(`status=open&pools=${key}&sortBy=debt&sortOrder=desc&limit=4`);
    rows.push(...got.filter((r) => r.pool_key === key));
  }
  info(`index sampled: ${rows.map((r) => `${r.pool_key}#${r.position}`).join(", ") || "none"}`);
} else {
  info("RAILS_API_URL / API_BEARER_TOKEN missing — falling back to a chain scan for subjects");
}

/** Chain-only fallback: walk ids until we find live positions. */
async function scanLive(poolKey, want = 3) {
  const addr = POOLS[poolKey].address;
  const next = await client.readContract({ address: addr, abi: POOL_ABI, functionName: "getNextPositionId" });
  const out = [];
  for (let id = 1n; id < BigInt(next) && out.length < want; id++) {
    try {
      const [colls, debts] = await client.readContract({
        address: addr,
        abi: POOL_ABI,
        functionName: "getPosition",
        args: [id],
      });
      if (colls > 0n && debts > 0n) out.push({ pool_key: poolKey, position: String(id) });
    } catch {
      /* non-existent id */
    }
  }
  return out;
}
for (const key of Object.keys(POOLS)) {
  if (!rows.some((r) => r.pool_key === key)) rows.push(...(await scanLive(key)));
}
console.log();

// ════════════════════════════════════════════════════════════════════════════
for (const [key, meta] of Object.entries(POOLS)) {
  const pool = meta.address;
  console.log(`── ${key} pool (${meta.tokenSymbol} → ${meta.normalizedSymbol}) ${pool} ──`);

  // ── 1. catalog & roster ───────────────────────────────────────────────────
  const [collToken, mgr, poolFxusd, tokenDec, fxusdDec, poolInfo] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "collateralToken" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "poolManager" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "fxUSD" }),
    client.readContract({ address: meta.tokenAddress, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: FXUSD, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: POOL_MANAGER, abi: PM_ABI, functionName: "getPoolInfo", args: [pool] }),
  ]);
  check(`${key}: collateralToken matches the catalog`, same(collToken, meta.tokenAddress), collToken);
  check(
    `${key}: token decimals ${meta.tokenDecimals}`,
    Number(tokenDec) === meta.tokenDecimals,
    `chain says ${tokenDec}`,
  );
  check(`${key}: poolManager points back at the registry`, same(mgr, POOL_MANAGER), mgr);
  check(`${key}: pool's fxUSD matches the catalog`, same(poolFxusd, FXUSD), poolFxusd);
  check(`${key}: fxUSD is 18dp`, Number(fxusdDec) === 18);
  // Registered with the manager: a non-zero collateral capacity is only ever
  // set by RegisterPool + the risk config. Roster proof with no log read.
  check(
    `${key}: registered with the PoolManager (getPoolInfo answers)`,
    poolInfo[0] > 0n,
    `collateral capacity ${fmt(poolInfo[0], meta.tokenDecimals, 2)} ${meta.tokenSymbol}`,
  );

  // ── 2. index accounting — the settled lane's engine ────────────────────────
  const [[debtIndex, collIndex], [debtShares, collShares], totColl, totDebt] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getDebtAndCollateralIndex" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getDebtAndCollateralShares" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getTotalRawCollaterals" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getTotalRawDebts" }),
  ]);
  const derivedDebt = (debtShares * debtIndex) / X96;
  const derivedColl = (collShares * X96) / collIndex;
  check(
    `${key}: totalRawDebts == debtShares × debtIndex ÷ 2^96 (BigInt-exact)`,
    derivedDebt === totDebt,
    `Δ=${derivedDebt - totDebt}`,
  );
  check(
    `${key}: totalRawColls == collShares × 2^96 ÷ collIndex (BigInt-exact)`,
    derivedColl === totColl,
    `Δ=${derivedColl - totColl}`,
  );
  check(
    `${key}: debt index ≥ 1.0 (a share only ever owes more)`,
    debtIndex >= X96,
    `${Number(debtIndex) / Number(X96)}`,
  );
  check(
    `${key}: collateral index ≥ 1.0 (a share only ever holds less — funding)`,
    collIndex >= X96,
    `${Number(collIndex) / Number(X96)}`,
  );
  info(`scale: ${fmt(totColl)} ${meta.normalizedSymbol} collateral / ${fmt(totDebt)} fxUSD debt`);

  // ── 3. the two unit systems ───────────────────────────────────────────────
  // getPoolInfo returns them side by side: f1 = TOKEN units, f2 = NORMALIZED.
  const tokenBal = poolInfo[1];
  const normBal = poolInfo[2];
  const decScale = 10n ** BigInt(18 - meta.tokenDecimals);
  if (key === "wsteth") {
    const [rate, [rateScalar, rateProvider]] = await Promise.all([
      client.readContract({ address: meta.tokenAddress, abi: WSTETH_ABI, functionName: "stEthPerToken" }),
      client.readContract({
        address: POOL_MANAGER,
        abi: PM_ABI,
        functionName: "tokenRates",
        args: [meta.tokenAddress],
      }),
    ]);
    const providerRate = await client.readContract({
      address: rateProvider,
      abi: RATE_PROVIDER_ABI,
      functionName: "getRate",
    });
    check(
      `${key}: the manager's rateProvider.getRate() == wstETH.stEthPerToken (BigInt-exact)`,
      providerRate === rate,
      `provider ${rateProvider} → ${fmt(providerRate)} vs ${fmt(rate)} (scalar ${rateScalar})`,
    );
    // The book pair is NOT equated — see the check-3 note in the header. The
    // stored columns are independent floor-rounded running sums; re-inflating
    // one by the LIVE rate differs by an irreducible floor residual plus all
    // rebases since the pool's last write. Stated, with the exact conversion
    // proven where it actually holds (check 2, share × index).
    const derivedNorm = (tokenBal * rate) / E18;
    info(
      `book pair (reported): ${fmt(tokenBal)} wstETH stored vs ${fmt(normBal)} stETH normalized — ` +
        `× live rate ${fmt(rate)} re-derives ${fmt(derivedNorm)}, residual Δ=${derivedNorm - normBal} wei ` +
        `(floor accumulation + rebase drift since last pool write; not an invariant)`,
    );
  } else {
    // WBTC has no stETH-style rate getter to check against; recover the rate
    // the pool actually applied and state it, rather than assert a bare ×1e10.
    const impliedRate = (normBal * E18) / (tokenBal * decScale);
    const off = impliedRate > E18 ? impliedRate - E18 : E18 - impliedRate;
    check(
      `${key}: NORMALIZED ≈ TOKEN × 1e10 (rate provider within 1e-6 of parity)`,
      off < E18 / 1_000_000n,
      `implied rate ${fmt(impliedRate)} — the ×1e10 decimal scale-up is exact to ~1e-12, NOT exactly 1`,
    );
  }
  // The systems are never interchangeable: the settled integer is not the
  // token integer. On wstETH they are different QUANTITIES (the rate); on
  // WBTC the same quantity at a different SCALE (8dp → 18dp). Either way a
  // consumer that reads one as the other is wrong — by the rate, by 1e10, or
  // by both.
  check(
    `${key}: the settled integer is never the token integer`,
    tokenBal !== normBal,
    `${tokenBal} (${meta.tokenSymbol}, ${meta.tokenDecimals}dp) vs ${normBal} (${meta.normalizedSymbol}, 18dp normalized)`,
  );

  // ── 4. oracle ─────────────────────────────────────────────────────────────
  const oracle = await client.readContract({ address: pool, abi: POOL_ABI, functionName: "priceOracle" });
  const [anchor, min, max] = await client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "getPrice" });
  const [liqPrice, redeemPrice] = await Promise.all([
    client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "getLiquidatePrice" }),
    client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "getRedeemPrice" }),
  ]);
  check(
    `${key}: oracle prices positive and ordered (min ≤ anchor ≤ max)`,
    min > 0n && min <= anchor && anchor <= max,
    `${fmt(min, 18, 2)} / ${fmt(anchor, 18, 2)} / ${fmt(max, 18, 2)} per ${meta.normalizedSymbol}`,
  );
  check(`${key}: getLiquidatePrice == the min leg`, liqPrice === min);
  // getRedeemPrice is reported, not equated to the max leg: the two matched
  // at the 2026-07 calibration block by coincidence and have since drifted
  // apart — the oracle computes the redeem leg on its own path.
  check(`${key}: getRedeemPrice positive`, redeemPrice > 0n, fmt(redeemPrice, 18, 2));
  info(
    `redeem leg (reported): ${fmt(redeemPrice, 18, 2)} vs max leg ${fmt(max, 18, 2)} — ` +
      `Δ=${fmt(redeemPrice > max ? redeemPrice - max : max - redeemPrice, 18, 6)} (${redeemPrice >= max ? "above" : "below"} max; not an invariant)`,
  );

  // ── 7. config ladder ──────────────────────────────────────────────────────
  const [[drMin, drMax], [rebalRatio], [liqRatio]] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getDebtRatioRange" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getRebalanceRatios" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getLiquidateRatios" }),
  ]);
  check(
    `${key}: debt-ratio range ordered inside (0, 1]`,
    drMin > 0n && drMin < drMax && drMax <= E18,
    `${fmt(drMin)} … ${fmt(drMax)}`,
  );
  check(
    `${key}: escalation ladder — borrow cap < rebalance < liquidate`,
    drMax < rebalRatio && rebalRatio < liqRatio,
    `open ≤ ${fmt(drMax, 18, 4)} · rebalance @ ${fmt(rebalRatio, 18, 4)} · liquidate @ ${fmt(liqRatio, 18, 4)}`,
  );

  // ── 5 + 6. per-position identities ────────────────────────────────────────
  const mine = rows.filter((r) => r.pool_key === key);
  let provenEventless = 0;
  for (const r of mine) {
    const id = BigInt(r.position);
    const [colls, debts] = await client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "getPosition",
      args: [id],
    });
    if (colls === 0n || debts === 0n) continue;
    const ratio = await client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "getPositionDebtRatio",
      args: [id],
    });
    // 5. The ratio identity — proves the price scale AND the anchor leg.
    const derivedRatio = (debts * E18 * E18) / (colls * anchor);
    check(
      `${key} #${r.position}: getPositionDebtRatio == debts × 1e36 ÷ (colls × ANCHOR)`,
      derivedRatio === ratio,
      `${fmt(ratio, 18, 4)} — Δ=${derivedRatio - ratio}`,
    );
    // Cross-check that it is NOT the min leg — the ratio's price is a distinct
    // choice from the one the backend snapshots for USD (see below). This can
    // only discriminate while the two legs actually differ: the oracle's anchor
    // and min converge whenever its sources agree, and at such a block the
    // comparison is a tautology with nothing to say. Report, don't fail.
    if (min !== anchor) {
      const viaMin = (debts * E18 * E18) / (colls * min);
      check(
        `${key} #${r.position}: the ratio is judged at the anchor, not the liquidate leg`,
        viaMin !== ratio,
        `via-min would read ${fmt(viaMin, 18, 4)}`,
      );
    } else {
      info(
        `${key} #${r.position}: the oracle's anchor and min legs coincide at this block — the anchor-vs-min discrimination cannot be made here`,
      );
    }

    // 6. Eventless mutation — shares constant across a window with no event.
    if (r.last_event_block != null && BigInt(r.last_event_block) >= past) {
      info(
        `${key} #${r.position}: touched inside the window (last event ${r.last_event_block}) — not a subject for the eventless proof`,
      );
      continue;
    }
    const [[collsPast, debtsPast], [debtIndexPast, collIndexPast]] = await Promise.all([
      client.readContract({ address: pool, abi: POOL_ABI, functionName: "getPosition", args: [id], blockNumber: past }),
      client.readContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "getDebtAndCollateralIndex",
        blockNumber: past,
      }),
    ]);
    // Invert the index accounting to recover the shares actually stored.
    const sharesNow = { debt: (debts * X96) / debtIndex, coll: (colls * collIndex) / X96 };
    const sharesPast = { debt: (debtsPast * X96) / debtIndexPast, coll: (collsPast * collIndexPast) / X96 };
    const sharesHeld = sharesNow.debt === sharesPast.debt && sharesNow.coll === sharesPast.coll;
    const amountsMoved = colls !== collsPast || debts !== debtsPast;
    if (!sharesHeld) {
      // A socialized tick rebalance re-homed the shares themselves — itself an
      // eventless mutation, but not the clean shares-constant demonstration.
      info(
        `${key} #${r.position}: shares moved with no event of its own (Δcoll=${sharesNow.coll - sharesPast.coll}, Δdebt=${sharesNow.debt - sharesPast.debt}) — a socialized rebalance re-homed them`,
      );
      continue;
    }
    check(
      `${key} #${r.position}: EVENTLESS MUTATION — shares identical over ${LOOKBACK} blocks, amounts moved`,
      amountsMoved,
      `coll ${fmt(collsPast)} → ${fmt(colls)} (Δ ${fmt(colls - collsPast)} ${meta.normalizedSymbol}) with no event since block ${r.last_event_block}`,
    );
    if (amountsMoved) provenEventless++;
  }
  if (mine.length > 0) {
    check(
      `${key}: at least one position proves eventless mutation`,
      provenEventless > 0,
      `${provenEventless} of ${mine.length} sampled`,
    );
  }

  // ── index movement over the window (the mechanism behind the above) ───────
  const [debtIndexPast, collIndexPast] = await client.readContract({
    address: pool,
    abi: POOL_ABI,
    functionName: "getDebtAndCollateralIndex",
    blockNumber: past,
  });
  check(
    `${key}: an index moved over the window with no per-position event`,
    debtIndex !== debtIndexPast || collIndex !== collIndexPast,
    `debtIndex Δ=${debtIndex - debtIndexPast} · collIndex Δ=${collIndex - collIndexPast}`,
  );
  if (debtIndex === debtIndexPast && collIndex !== collIndexPast)
    info(`funding is charging the COLLATERAL side only in this window — the debt index sat still`);
  console.log();
}

// ════════════════════════════════════════════════════════════════════════════
// 8. Index agreement — REPORTED, not asserted. The gaps are the lane's point.
// ════════════════════════════════════════════════════════════════════════════
console.log("── index agreement (reported, not asserted) ──");
let priceLegAgrees = 0;
let priceLegChecked = 0;
let priceLegExact = 0;
for (const r of rows) {
  if (r.chain_block == null) continue;
  const meta = POOLS[r.pool_key];
  const pool = meta.address;
  const oracle = await client.readContract({ address: pool, abi: POOL_ABI, functionName: "priceOracle" });
  const sweepBlock = BigInt(r.chain_block);
  const [colls, debts] = await client.readContract({
    address: pool,
    abi: POOL_ABI,
    functionName: "getPosition",
    args: [BigInt(r.position)],
    blockNumber: sweepBlock,
  });
  const dColl = colls - BigInt(r.chain_raw_colls ?? 0);
  const dDebt = debts - BigInt(r.chain_raw_debts ?? 0);
  info(
    `${r.pool_key} #${r.position}: settled sweep @${sweepBlock} vs a live re-read at the same block — Δcolls=${dColl} Δdebts=${dDebt}${dColl === 0n && dDebt === 0n ? " (exact)" : ""}`,
  );
  // The socialized gap the card renders: implied (Σ of the position's own
  // event deltas) vs the settled truth.
  if (r.implied_debt != null && r.chain_raw_debts != null) {
    const socialized = BigInt(r.implied_debt) - BigInt(r.chain_raw_debts);
    info(
      `      socialized lane: implied ${fmt(BigInt(r.implied_debt))} − settled ${fmt(BigInt(r.chain_raw_debts))} = ${fmt(socialized)} fxUSD ${socialized >= 0n ? "cleared" : "accrued"} with no per-position event`,
    );
  }
  // WHICH oracle leg does the backend snapshot as pool_oracle_price? The
  // claim under test is the LEG IDENTITY, so the leg is classified with a
  // 1e-6 relative band (the legs sit ~0.1%+ apart — no ambiguity) and
  // byte-exactness is reported alongside. The backend stamp is the
  // EVENT-emitted price from that block's position touch (intra-block state,
  // the price the protocol actually used — see the fx-copy chain-sweep's
  // fx_v2_snapshot_* read), while this re-read is an end-of-block eth_call —
  // so a stamp can straddle TWO moments: legs that move within the block
  // (wstETH's Curve-EMA min on any EMA-moving swap, and WBTC's min too — a
  // Chainlink update landing later in the stamp's own block moved it 38 ppm,
  // proven at block 25,717,734 where the stamp byte-matched the PREVIOUS
  // block's min) leave the stamp matching the pre-move moment. The stamp is
  // therefore classified against both moments' legs: the stamp block's
  // end-of-block state and the previous block's (the state the event saw if
  // nothing else touched the oracle first).
  if (r.pool_oracle_price != null && r.pool_price_block != null) {
    const [a, mn, mx] = await client.readContract({
      address: oracle,
      abi: ORACLE_ABI,
      functionName: "getPrice",
      blockNumber: BigInt(r.pool_price_block),
    });
    const [pa, pmn, pmx] = await client.readContract({
      address: oracle,
      abi: ORACLE_ABI,
      functionName: "getPrice",
      blockNumber: BigInt(r.pool_price_block) - 1n,
    });
    const snap = BigInt(r.pool_oracle_price);
    const near = (x, y) => {
      const d = x > y ? x - y : y - x;
      return d * 1_000_000n < y;
    };
    const exactOf = (x, y2) => snap === x || snap === y2;
    const nearOf = (x, y2) => near(snap, x) || near(snap, y2);
    const leg = exactOf(mn, pmn)
      ? snap === mn
        ? "min (liquidate)"
        : "min (liquidate, pre-move moment)"
      : exactOf(a, pa)
        ? "anchor"
        : exactOf(mx, pmx)
          ? "max (redeem)"
          : nearOf(mn, pmn) && !nearOf(a, pa) && !nearOf(mx, pmx)
            ? "min (liquidate, intra-block)"
            : nearOf(a, pa)
              ? "anchor (intra-block)"
              : nearOf(mx, pmx)
                ? "max (redeem, intra-block)"
                : "none of the three";
    priceLegChecked++;
    if (leg.startsWith("min")) priceLegAgrees++;
    if (snap === mn || snap === pmn) priceLegExact++;
    info(
      `      pool_oracle_price @${r.pool_price_block} is the ${leg} leg — ${fmt(snap, 18, 2)} per ${meta.normalizedSymbol}`,
    );
  }
}
if (priceLegChecked > 0) {
  check(
    "the backend snapshots the MIN (liquidate) leg as pool_oracle_price — the card's USD basis",
    priceLegAgrees === priceLegChecked,
    `${priceLegAgrees}/${priceLegChecked} rows (${priceLegExact} byte-exact against the stamp block's or the previous block's min — the stamp is the block's event-emitted intra-block price, the re-read end-of-block, and a leg that moves inside the stamp's own block leaves the stamp at the pre-move moment) — NOTE: the debt ratio is judged at the ANCHOR leg, so the card values collateral and judges risk at two different prices; both must be named where they render`,
  );
}

// ── Newcomer round 3 (2026-09-29): the claims the position page added ──────
// Receipts and eth_calls only (no eth_getLogs).
{
  const R3_POOL = "0x6ecfa38fee8a5277b91efda204c235814f0122e8";
  const LIQ_ABI = parseAbi([
    "event LiquidatePosition(address indexed pool, uint256 indexed position, uint256 colls, uint256 fxUSDDebts, uint256 stableDebts)",
    "event Liquidate(address indexed pool, uint256 colls, uint256 fxUSDDebts, uint256 stableDebts)",
  ]);
  const R3_ABI = parseAbi([
    "function getPosition(uint256) view returns (uint256,uint256)",
    "function getDebtAndCollateralIndex() view returns (uint256,uint256)",
    "function getTotalRawDebts() view returns (uint256)",
    "function positionData(uint256) view returns (int16,uint48,uint96,uint96)",
    "function tickTreeData(uint256) view returns (bytes32,bytes32)",
    "function tickData(int256) view returns (uint48)",
    "function priceOracle() view returns (address)",
  ]);
  const { decodeEventLog } = await import("viem");
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const liqLog = async (hash, position) => {
    const rc = await client.getTransactionReceipt({ hash });
    for (const l of rc.logs) {
      try {
        const d = decodeEventLog({ abi: LIQ_ABI, data: l.data, topics: l.topics });
        if (position == null ? d.eventName === "Liquidate" : d.args.position === BigInt(position)) return d.args;
      } catch {}
    }
    return null;
  };
  const pos = (id, b) =>
    client.readContract({
      address: R3_POOL,
      abi: R3_ABI,
      functionName: "getPosition",
      args: [BigInt(id)],
      blockNumber: BigInt(b),
    });

  // Z1: the manager logs a liquidation that moved nothing.
  const empty243 = await liqLog("0x67c3b352d00d5656c6895d16ca911bb808251e843f3a0c321d5103a4f94c3dff", 243);
  const [c0, d0] = await pos(243, 21763932);
  check(
    "r3 Z1: wsteth-243's LiquidatePosition at block 21,763,933 took 0 and repaid 0, the position already empty",
    empty243 != null && empty243.colls === 0n && empty243.fxUSDDebts === 0n && c0 === 0n && d0 === 0n,
  );
  const empty154 = await liqLog("0xbfb562c311a1517e3033fde872dad11a4eb5084a8b7a41290a11b7f4c06c38ba", 154);
  const [c1, d1] = await pos(154, 21764007);
  check(
    "r3 Z1: wsteth-154's LiquidatePosition at block 21,764,007 took 0 wstETH and repaid 2,477 wei; 287.882 fxUSD of debt stayed",
    empty154 != null &&
      empty154.colls === 0n &&
      empty154.fxUSDDebts === 2477n &&
      c1 === 0n &&
      d1 / 10n ** 15n === 287882n,
    `after: ${c1} / ${d1}`,
  );
  // Z1 (dust): what liquidation 1 left on 243 and 154.
  const [c2] = await pos(243, 21763470);
  const [c3] = await pos(154, 21763456);
  check(
    "r3 Z1: the collateral left by the first liquidations is under $100 at the row's price ($16 and $80)",
    (Number(c2) / 1e18) * 2531.9 < 100 && (Number(c3) / 1e18) * 2517.37 < 100,
    `${Number(c2) / 1e18} and ${Number(c3) / 1e18} stETH`,
  );

  // Z2: the pool-wide Liquidate wrote 154's debt off onto the debt index.
  const pw = await liqLog("0xcbd0ca5598d15a91a20a548cd69753ec8115eb98f1fb24916632f230a2bcd4b5", null);
  const [, dBefore] = await pos(154, 22081082);
  const [, dAfter] = await pos(154, 22081083);
  const idx = async (b) =>
    (
      await client.readContract({
        address: R3_POOL,
        abi: R3_ABI,
        functionName: "getDebtAndCollateralIndex",
        blockNumber: BigInt(b),
      })
    )[0];
  const tot = (b) =>
    client.readContract({ address: R3_POOL, abi: R3_ABI, functionName: "getTotalRawDebts", blockNumber: BigInt(b) });
  const [i0, i1, t0, t1] = await Promise.all([idx(22081082), idx(22081083), tot(22081082), tot(22081083)]);
  const repaid = Number(pw?.fxUSDDebts ?? 0n) / 1e18;
  const fell = Number(dBefore - dAfter) / 1e18;
  const poolFell = Number(t0 - t1) / 1e18;
  // The index rose by the written-off debt over the debt that stayed.
  const addedByIndex = (Number(i1 - i0) / Number(i0)) * (Number(t1) / 1e18);
  check(
    "r3 Z2: at block 22,081,083 the keeper repaid 0.028 fxUSD across the pool, 154's debt fell 287.882, and the pool's debt fell only by what was repaid",
    near(repaid, 0.028, 0.0005) && near(fell, 287.882, 0.001) && near(poolFell, repaid, 0.001),
    `repaid ${repaid}, 154 fell ${fell}, pool total fell ${poolFell}`,
  );
  check(
    "r3 Z2: the debt index rose by the written-off debt (BasePool._liquidateTick bad-debt redistribution)",
    near(addedByIndex, fell - repaid, 1),
    `index added ${addedByIndex.toFixed(3)} fxUSD vs ${(fell - repaid).toFixed(3)} written off`,
  );

  // Z4: what 243's rebalances and redemptions took, valued at the min price
  // at the block before each (the socialized row blocks, from the index).
  const r3tl = await fetch(`${process.env.BASE ?? "http://localhost:3903"}/api/fx/position/wsteth/243/timeline`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (r3tl) {
    const blocks = [
      ...new Set(r3tl.events.filter((e) => e.context.data.eventType === "tickRebalance").map((e) => e.blockNumber)),
    ];
    let coll = 0;
    let debt = 0;
    let usd = 0;
    for (let i = 0; i < blocks.length; i += 8) {
      await Promise.all(
        blocks.slice(i, i + 8).map(async (b) => {
          const [a, z, px] = await Promise.all([
            pos(243, b - 1),
            pos(243, b),
            // The pool's oracle then: it has been replaced since.
            client
              .readContract({ address: R3_POOL, abi: R3_ABI, functionName: "priceOracle", blockNumber: BigInt(b - 1) })
              .then((oracle) =>
                client.readContract({
                  address: oracle,
                  abi: ORACLE_ABI,
                  functionName: "getPrice",
                  blockNumber: BigInt(b - 1),
                }),
              ),
          ]);
          const dc = Number(a[0] - z[0]) / 1e18;
          coll += dc;
          debt += Number(a[1] - z[1]) / 1e18;
          usd += dc * (Number(px[1]) / 1e18);
        }),
      );
    }
    check(
      "r3 Z4: 243's rebalances and redemptions took 3.063 stETH for 5,923.998 fxUSD, worth about $6,070 at the min price: a $146 bonus, 2.4% of it",
      near(coll, 3.063, 0.001) && near(debt, 5923.998, 0.01) && near(usd, 6070.49, 1) && near(usd - debt, 146.5, 1),
      `${coll.toFixed(4)} stETH, ${debt.toFixed(3)} fxUSD, $${usd.toFixed(2)}, bonus $${(usd - debt).toFixed(2)} (${(((usd - debt) / usd) * 100).toFixed(2)}%)`,
    );
  } else info("      r3 Z4 skipped: no dev server for the row blocks (BASE)");

  // Z11: the position's tick, by the node walk the page makes.
  const head = await client.getBlockNumber();
  const pd = await client.readContract({
    address: R3_POOL,
    abi: R3_ABI,
    functionName: "positionData",
    args: [243n],
    blockNumber: head,
  });
  let node = BigInt(pd[1]);
  let meta = 0n;
  for (let h = 0; h < 64; h++) {
    meta = BigInt(
      (
        await client.readContract({
          address: R3_POOL,
          abi: R3_ABI,
          functionName: "tickTreeData",
          args: [node],
          blockNumber: head,
        })
      )[0],
    );
    const parent = meta & ((1n << 48n) - 1n);
    if (parent === 0n) break;
    node = parent;
  }
  let tick = Number((meta >> 48n) & 0xffffn);
  if (tick >= 0x8000) tick -= 0x10000;
  const cur = await client.readContract({
    address: R3_POOL,
    abi: R3_ABI,
    functionName: "tickData",
    args: [BigInt(tick)],
    blockNumber: head,
  });
  check(
    "r3 Z11: 243's node walk ends at the node its tick holds now (tickData(tick) == root)",
    BigInt(cur) === node,
    `tick ${tick}, node ${node}`,
  );
}

// ── round 4: wsteth-1801 and wsteth-1 ───────────────────────────────────────
{
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const R4_POOL = POOLS.wsteth.address;
  const R4_ABI = parseAbi([
    "function getPosition(uint256) view returns (uint256,uint256)",
    "function getTopTick() view returns (int16)",
    "function tickBitmap(int8) view returns (uint256)",
    "function positionData(uint256) view returns (int16 tick, uint48 nodeId, uint96 colls, uint96 debts)",
    "function tickTreeData(uint256) view returns (bytes32,bytes32)",
  ]);
  const CFG_ABI = parseAbi([
    "function getPoolFeeRatio(address,address) view returns (uint256,uint256,uint256,uint256)",
    "function getLongPoolFundingRatio(address) view returns (uint256)",
  ]);
  const ROUTER_1 = "0x33636D49FbefBE798e15e7F356E8DBef543CC708";
  const ROUTER_2 = "0xB753366082466c4B5984312f0c4Bb97554be067E";
  const OWN_ABI = parseAbi([
    "function owner() view returns (address)",
    "function facetAddresses() view returns (address[])",
  ]);

  // P3: what 0xb753…067e is and what it is charged.
  const [o1, o2, f1, f2] = await Promise.all([
    client.readContract({ address: ROUTER_1, abi: OWN_ABI, functionName: "owner" }),
    client.readContract({ address: ROUTER_2, abi: OWN_ABI, functionName: "owner" }),
    client.readContract({ address: ROUTER_1, abi: OWN_ABI, functionName: "facetAddresses" }),
    client.readContract({ address: ROUTER_2, abi: OWN_ABI, functionName: "facetAddresses" }),
  ]);
  check(
    "r4 P3: 0xb753…067e is a diamond router (facets), owned by the address that owns 0x3363…c708",
    same(o1, o2) && f2.length > 0 && f1.length > 0,
    `owner ${o1}, ${f2.length} facets (0x3363 has ${f1.length})`,
  );
  const cfg = await client.readContract({
    address: POOL_MANAGER,
    abi: parseAbi(["function configuration() view returns (address)"]),
    functionName: "configuration",
  });
  const fee = (who, block) =>
    client.readContract({
      address: cfg,
      abi: CFG_ABI,
      functionName: "getPoolFeeRatio",
      args: [R4_POOL, who],
      blockNumber: block,
    });
  const ZERO_A = "0x0000000000000000000000000000000000000000";
  const at1801 = [24490945n, 24540534n, 25791803n, 26025273n];
  let same2 = true;
  let r1 = null;
  for (const b of at1801) {
    const [a, d, r] = await Promise.all([fee(ROUTER_2, b), fee(ZERO_A, b), fee(ROUTER_1, b)]);
    same2 = same2 && a.every((x, i) => x === d[i]) && a[0] === 0n && a[2] === 5000000n;
    r1 = r;
  }
  check(
    "r4 P3: at the four deposit/borrow blocks 0xb753…067e pays the default (0 deposit, 0.5% borrow) and 0x3363…c708 pays 0.3% of a deposit",
    same2 && r1[0] === 3000000n && r1[1] === 1000000n,
    `router 2 = default ${same2}; router 1 ${r1.map((x) => Number(x) / 1e9).join(",")}`,
  );

  // P1: funding is booked inside a transaction. getPosition at block − 1 holds the old index.
  const P1801 = 1801n;
  const pp = (b) =>
    client.readContract({ address: R4_POOL, abi: R4_ABI, functionName: "getPosition", args: [P1801], blockNumber: b });
  const [b0, b1] = await Promise.all([pp(26025273n), pp(26025274n)]);
  const drop = Number(b0[0] - b1[0]) / 1e18;
  check(
    "r4 P1: the 21 Sep borrow (block 26,025,274, no collateral moved) takes 0.0072 stETH of funding inside the transaction",
    near(drop, 0.0072, 0.0002) && near(Number(b1[1] - b0[1]) / 1e18, 40000, 0.001),
    `collateral ${fmt(b0[0])} → ${fmt(b1[0])}, debt rose ${fmt(b1[1] - b0[1], 18, 3)}`,
  );

  // P7: ticks above 4920 with debt (bitmap words 19..top word).
  const head1 = await client.getBlockNumber();
  const top = Number(
    await client.readContract({ address: R4_POOL, abi: R4_ABI, functionName: "getTopTick", blockNumber: head1 }),
  );
  let above = 0;
  for (let w = Math.floor(4921 / 256); w <= Math.floor(top / 256); w++) {
    const word = await client.readContract({
      address: R4_POOL,
      abi: R4_ABI,
      functionName: "tickBitmap",
      args: [w],
      blockNumber: head1,
    });
    for (let bit = 0; bit < 256; bit++) {
      const t = w * 256 + bit;
      if (t > 4920 && t <= top && (word >> BigInt(bit)) & 1n) above++;
    }
  }
  check(
    "r4 P7: debt ticks above tick 4920 are counted from the bitmap (top tick above it)",
    top > 4920 && above > 0,
    `top ${top}, ${above} above`,
  );
}

console.log(`\n${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ""}`);
process.exit(fail ? 1 : 0);
