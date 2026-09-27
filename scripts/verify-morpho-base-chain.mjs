// ============================================================================
// VERIFY: Morpho Blue on BASE (chain 8453) — the singleton's own state, AND
// the explorer's served figures, from both deployments
// ============================================================================
//
// Blue is a singleton (lib/morpho-base/asset-catalog.ts): the SAME contract,
// same ABI, as Ethereum's scripts/verify-morpho-chain.mjs already re-derives
// — only the chain, the RPC and the market roster differ, so checks 1-8 below
// are that script's checks, pointed at Base. The V3-fork core
// (scripts/lib/aave-v3-fork-verify-core.mjs) does not serve a Blue singleton
// (one Pool per market vs one contract, all markets), so this stays a
// standalone script, as the Ethereum sibling is.
//
// What is NEW here (the Ethereum script never needed it):
//   • Samples are drawn BY QUERY from the live index
//     (rails-server's /api/morpho-base/positions) — the heaviest open debt, a
//     closed position, a liquidated one — never hard-coded wallets, which
//     drift as positions close and new ones open.
//   • Check 9 reads what the EXPLORER ITSELF serves for each sampled
//     position — GET /api/morpho-base/positions?wallet=&market=, fetched from
//     BOTH production (rails.finance) and preview (dev.rails.finance, the
//     Vercel protection-bypass header) — and checks its collateral /
//     borrowShares raw figures against a live Morpho `position()` read at the
//     SAME block the row names (`listed.block`). A Base listing row is
//     already a chain read at a pinned block, so this proves rails-server's
//     sweep and this script's own eth_call agree wei-for-wei, on BOTH
//     deployments, not just that each answers something.
//
// Checks 1-8 (Morpho's own contract state, the Base singleton):
//   1. Market identity — idToMarketParams(id) reproduces the id via
//      keccak256(abi.encode(params)); lltv is governance-enabled
//      (isLltvEnabled) and so is the IRM (isIrmEnabled).
//   2. Oracle numeraire — IOracle.price() quotes the COLLATERAL asset in LOAN
//      asset terms, scaled 1e36 x 10^(loanDecimals - collateralDecimals) —
//      NOT USD, same as mainnet.
//   3. Market state — lastUpdate <= now, fee <= MAX_FEE (0.25e18),
//      totalBorrowAssets <= totalSupplyAssets.
//   4. Rates — AdaptiveCurveIRM.borrowRateView is a per-second WAD rate in a
//      plausible APR band; utilization in [0, 1].
//   5. Position state — position(id, user) collateral + borrowShares match
//      the backend replay (rails-server's Base accounts table) EXACTLY —
//      collateral doesn't accrue and shares are conserved.
//   6. Health arithmetic — Morpho has NO public health getter (_isHealthy is
//      internal), so it is REPLICATED: borrowed = toAssetsUp(borrowShares,
//      totalBorrowAssets, totalBorrowShares), maxBorrow = collateral x price
//      / 1e36 x lltv (wMulDown), healthy <=> maxBorrow >= borrowed. Every
//      OPEN sample must be healthy by this formula (it exists un-liquidated
//      on chain); debt >= replayed principal on every sample with a backend row.
//   7. Interest accrual view — the Taylor increment over the observed dt is
//      nonnegative and small relative to the totals.
//   8. Liquidation incentive — LIF = min(1.15, 1/(1-0.3x(1-lltv))) lands in
//      [1, 1.15] for every sampled market.
//
// Run:  node scripts/verify-morpho-base-chain.mjs
//       BASE=https://dev.rails.finance node scripts/verify-morpho-base-chain.mjs
// Env:  .env.local — BASE_RPC_URL (chain); RAILS_API_URL + API_BEARER_TOKEN
//       (sampling + check 5's replay; checks 5 and 9 degrade with a stated
//       reason if absent); VERCEL_AUTOMATION_BYPASS_SECRET (check 9's preview leg).

import { createPublicClient, http, parseAbi, keccak256, encodeAbiParameters, getAddress } from "viem";
import { base } from "viem/chains";
import { loadEnv } from "./lib/aave-v3-fork-verify-core.mjs";
import { hostFetch } from "./verify/lib/host.mjs";

const env = loadEnv(import.meta.url, "BASE_RPC_URL");

// lib/morpho-base/asset-catalog.ts — same singleton address as Ethereum.
const MORPHO = getAddress("0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb");

const PROD_ORIGIN = "https://rails.finance";
const PREVIEW_ORIGIN = process.env.BASE ?? "https://dev.rails.finance";

const client = createPublicClient({
  chain: base,
  batch: { multicall: { wait: 50 } },
  transport: http(env.BASE_RPC_URL, { retryCount: 8, retryDelay: 1_000 }),
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
const MAX_FEE = WAD / 4n;
const SECONDS_PER_YEAR = 31_536_000;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const toAssetsUp = (shares, totalAssets, totalShares) => {
  const den = totalShares + VIRTUAL_SHARES;
  return (shares * (totalAssets + VIRTUAL_ASSETS) + den - 1n) / den;
};
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

// ── Samples, BY QUERY, never hard-coded wallets ─────────────────────────────
async function queryPositions(qs) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return [];
  const res = await fetch(`${env.RAILS_API_URL}/api/morpho-base/positions?${qs}`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.rows ?? [];
}
async function apiRow(market, user) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  const res = await fetch(`${env.RAILS_API_URL}/api/morpho-base/positions?market=${market}&wallet=${user}&limit=1`, {
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

let samples = [];
if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) {
  console.log(
    "SKIP sampling — RAILS_API_URL / API_BEARER_TOKEN not set; chain-only checks cannot run without a market/user to seed them.",
  );
} else {
  const [heaviest, closed, liquidated] = await Promise.all([
    queryPositions("hasDebt=true&sortBy=debt&sortOrder=desc&limit=3"),
    queryPositions("status=closed&sortBy=recent&sortOrder=desc&limit=2"),
    queryPositions("status=liquidated&sortBy=recent&sortOrder=desc&limit=2"),
  ]);
  const seen = new Set();
  for (const [label, rows] of [
    ["heaviest open debt", heaviest],
    ["closed", closed],
    ["liquidated", liquidated],
  ]) {
    for (const r of rows) {
      const key = `${r.market}|${r.borrower}`;
      if (seen.has(key)) continue;
      seen.add(key);
      samples.push({ market: `0x${r.market}`, user: getAddress(r.borrower), open: r.status === "open", label });
    }
  }
}
check("indexed API returned position samples", samples.length > 0, `${samples.length} sampled`);
samples.forEach((s) =>
  console.log(
    `      · ${s.label}: ${s.market.slice(0, 10)}… / ${s.user.slice(0, 10)}… (${s.market ? (s.open ? "open" : "closed") : ""})`,
  ),
);

async function verifySample(s) {
  console.log(`\n== ${s.label}: ${s.market.slice(0, 10)}… / ${s.user.slice(0, 10)}… ==`);
  // Wall-clock "now", read FRESH per sample — not the run's start time. Base's
  // ~2s blocks mean a market can accrue (lastUpdate advances) between the
  // first sample and the last across a run that paces itself with pauses; a
  // cached "now" then reads a NEGATIVE dt against a market whose lastUpdate
  // has since moved past it, which is a stale clock in this script, not a
  // chain fact worth failing on.
  const now = Math.floor(Date.now() / 1000);

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

  const [loanDec, loanSym, collDec, collSym] = await Promise.all([
    client.readContract({ address: loanToken, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: loanToken, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
    client.readContract({ address: collateralToken, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: collateralToken, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
  ]);
  console.log(`      ${loanSym} / ${collSym} — lltv ${(Number(lltv) / 1e18) * 100}%`);

  let price = 0n;
  if (oracle !== ZERO_ADDR) {
    price = await client.readContract({ address: oracle, abi: oracleAbi, functionName: "price" }).catch(() => 0n);
    const human = price > 0n ? Number(price) / 10 ** (36 + Number(loanDec) - Number(collDec)) : 0;
    check(
      "oracle price scale 1e(36+loanDec-collDec) plausible",
      price > 0n && human > 1e-12 && human < 1e12,
      `1 ${collSym} = ${human.toPrecision(6)} ${loanSym}`,
    );
  }

  let ratePerSec = 0n;
  if (irm !== ZERO_ADDR) {
    ratePerSec = await client
      .readContract({
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
      })
      .catch(() => 0n);
    const apr = (Number(ratePerSec) / 1e18) * SECONDS_PER_YEAR;
    check(
      "borrowRateView per-second WAD, APR in (0, 10)",
      ratePerSec > 0n && apr < 10,
      `APR=${(apr * 100).toFixed(2)}%`,
    );
  }
  const util = totalSupplyAssets > 0n ? Number(totalBorrowAssets) / Number(totalSupplyAssets) : 0;
  check("utilization in [0, 1]", util >= 0 && util <= 1, `util=${(util * 100).toFixed(1)}%`);

  const dt = BigInt(Math.max(0, now - Number(lastUpdate)));
  const interest = wMulDown(totalBorrowAssets, wTaylorCompounded(ratePerSec, dt));
  check(
    "taylor-accrued interest nonnegative and < 1% of totals over dt",
    interest >= 0n && (totalBorrowAssets === 0n || Number(interest) / Number(totalBorrowAssets) < 0.01),
    `interest=${Number(interest) / 10 ** Number(loanDec)} ${loanSym} over ${dt}s`,
  );

  const row = await apiRow(s.market.replace(/^0x/, ""), s.user.toLowerCase());
  if (row) {
    // The backend row is a periodically-refreshed snapshot pinned to its OWN
    // block (`chain_block`), not head — on an actively-traded market
    // (borrowShares above matched at head only because the wallet's debt leg
    // hadn't moved in the interim) collateral can move between the row's
    // refresh and this script's head read, which is a live position changing,
    // not a mismatch. Re-read at the row's own block for the exact check.
    const atRowBlock = row.chain_block != null ? BigInt(row.chain_block) : null;
    const [, rowBorrowShares, rowCollateral] =
      atRowBlock != null
        ? await client.readContract({
            address: MORPHO,
            abi: morphoAbi,
            functionName: "position",
            args: [s.market, s.user],
            blockNumber: atRowBlock,
          })
        : [null, borrowShares, collateral];
    check(
      "chain collateral == replayed coll_raw (wei-exact, at the row's own block)",
      rowCollateral === bigintOf(row.coll_raw),
      `row block=${row.chain_block} chain=${rowCollateral} served=${row.coll_raw}`,
    );
    check(
      "chain borrowShares == replayed bsh_raw (exact, at the row's own block)",
      rowBorrowShares === bigintOf(row.bsh_raw),
      `row block=${row.chain_block} chain=${rowBorrowShares} served=${row.bsh_raw}`,
    );
  } else {
    console.log("      (no backend row — replay checks skipped)");
  }

  if (borrowShares > 0n && price > 0n) {
    const liveBorrowAssets = totalBorrowAssets + interest;
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

  const CURSOR = (3n * WAD) / 10n;
  const MAX_LIF = (115n * WAD) / 100n;
  const denom = WAD - wMulDown(CURSOR, WAD - lltv);
  const lif = denom > 0n ? (WAD * WAD) / denom : 0n;
  const lifCapped = lif > MAX_LIF ? MAX_LIF : lif;
  check("LIF in [1, 1.15]", lifCapped >= WAD && lifCapped <= MAX_LIF, `LIF=${(Number(lifCapped) / 1e18).toFixed(4)}`);

  return { loanToken, collateralToken, loanDec, collDec };
}

console.log(`Morpho Blue (Base) ${MORPHO} — head block ${await client.getBlockNumber()}`);
for (const s of samples) {
  await verifySample(s);
  await pause(1_200);
}

// ── 9. The explorer's own served figures — production AND preview ──────────
console.log(`\n## 9. Explorer-served position vs chain, at the row's own block (production + preview)`);
async function checkOrigin(origin, s) {
  const marketNoPrefix = s.market.replace(/^0x/, "");
  let res, json;
  try {
    res = await hostFetch(`${origin}/api/morpho-base/positions?wallet=${s.user}&market=${marketNoPrefix}`);
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
  const block = row.listed?.block;
  if (block == null) {
    check(`${origin}: ${s.label} row names a block`, false, "no listed.block");
    return;
  }
  const [, chainBorrowShares, chainCollateral] = await client.readContract({
    address: MORPHO,
    abi: morphoAbi,
    functionName: "position",
    args: [s.market, s.user],
    blockNumber: BigInt(block),
  });
  check(
    `${origin}: served collateral == chain position() @${block}`,
    chainCollateral === bigintOf(row.collateral?.amountRaw),
    `served=${row.collateral?.amountRaw} chain=${chainCollateral}`,
  );
  check(
    `${origin}: served borrowShares == chain position() @${block}`,
    chainBorrowShares === bigintOf(row.borrowSharesRaw),
    `served=${row.borrowSharesRaw} chain=${chainBorrowShares}`,
  );
}
for (const s of samples.slice(0, 4)) {
  await checkOrigin(PROD_ORIGIN, s);
  await checkOrigin(PREVIEW_ORIGIN, s);
  await pause(500);
}

console.log(`\n${"-".repeat(60)}\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
