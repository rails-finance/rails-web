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

console.log(`\n${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ""}`);
process.exit(fail ? 1 : 0);
