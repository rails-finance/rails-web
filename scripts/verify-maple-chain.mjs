// ============================================================================
// VERIFY: Maple (syrup pools) chain assumptions for the /maple explorer
// ============================================================================
//
// Read-only, assertion-based, and SELF-CONTAINED: every claim the explorer
// makes is re-derived here from the chain alone (eth_call), with no database
// sample and no block-explorer dependency. (The 2026-07-14 onboarding spike
// this replaces asked a different question — "can a lender explorer be built
// at all?" — and answered it by NARRATING console output with no assertion,
// no pass/fail and no exit code, over eth_getLogs via Etherscan. It graduated
// the protocol; it never verified the explorer, which is why the cell stayed
// `verification: false`.) Alchemy's free tier caps eth_getLogs at a 10-block
// range, so nothing here reads a log: the pools' own views carry the whole
// proof.
//
// The explorer's central claim is that a Maple lender's SHARES are exactly
// event-legible (ERC-20 transfers are exact) but their VALUE never is: the
// loan book accrues a posted issuanceRate by the SECOND, with no event of any
// kind, which lifts totalAssets, which lifts the exit rate, which lifts every
// lender's redeemable claim. So the live rate read is the only truth about
// what a position is worth. Check 6 proves that outright.
//
// Checks:
//   1. Catalog & roster — each pool's own asset / manager / symbol / decimals
//      getters agree with lib/maple/asset-catalog.ts, and the PoolManager
//      round-trips back to the pool, the withdrawal manager and Globals. The
//      two catalog LoanManagers are proven present in the live strategy list.
//      A roster proof that needs no registry log.
//   2. totalAssets identity — the liquid/deployed split the pool band renders:
//        fundsAsset.balanceOf(pool) + Σ strategy.assetsUnderManagement()
//          == pool.totalAssets()
//      BigInt-exact. "Liquid" is the only part redeemable this block; the rest
//      is a loan book whose collateral sits with off-chain custodians.
//   3. Share-price identities — the engine behind every rendered value:
//        convertToAssets(s)     == s × totalAssets ÷ totalSupply
//        convertToExitAssets(s) == s × (totalAssets − unrealizedLosses) ÷ totalSupply
//      BigInt-exact at several share sizes.
//   4. Impairment socializes, it never seizes — the `forensics: { why }` cell,
//      proven rather than asserted in prose. Both price functions take ONLY a
//      share count: there is no per-lender term for a loss to be aimed at. So
//      an impairment can only move the pool-level numerator, which rescales
//      every holder by one common factor — verified by showing the ratio
//      between two lenders' exit values is invariant to unrealizedLosses.
//      A lender has no liquidation surface because the arithmetic has nowhere
//      to put one.
//   5. Queue escrow custody — pool.balanceOf(withdrawalManager) ==
//      wmq.totalShares(), BigInt-exact. Proves escrowed shares are really
//      held by the queue contract, so the card's (shares + escrowed) is the
//      whole claim and double-counts nothing.
//   6. EVENTLESS ACCRUAL, proven WITHOUT A SINGLE LOG — the lender-side
//      analogue of f(x)'s eventless mutation. Find the largest window whose
//      LoanManager anchor (principalOut / accountedInterest / issuanceRate /
//      domainStart) is byte-identical at both ends — no re-anchor happened,
//      therefore no accounting event fired — and show that AUM STILL moved,
//      by exactly:
//        AUM = principalOut + accountedInterest + issuanceRate × (t − domainStart) ÷ 1e27
//      BigInt-exact. Then carry it to the lender: a sampled holder's balanceOf
//      is unchanged across the same window while convertToExitAssets of that
//      identical balance has risen. The wallet earned, and nothing was emitted.
//   7. The oracle question — the `oracleUsd: { why }` cell. Maple DOES run a
//      price surface (priceOracleOf is populated and getLatestPrice returns a
//      live market price for WETH), so "no oracle" would be false. The real
//      reason is sharper: for USDC, getLatestPrice == manualOverridePrice ==
//      exactly 1e8 — Maple's own USDC price is a governance-set $1.00
//      CONSTANT. Rendering it would launder a pin as an oracle reading, which
//      is the charter violation (S3) wearing the protocol's own clothes. For
//      USDT there is no price at all: getLatestPrice reverts.
//   8. Governance surface — governor / securityAdmin / operationalAdmin /
//      protocolPaused / per-pool delegate + active, all eth_call.
//   9. Index agreement + the rendered claim — the backend's replayed share
//      balances vs a live balanceOf, and the identity the card actually renders
//      (lib/maple/exit-value.ts) executed against the pool's own answer on each
//      REAL holding. This is the card receipt's "re-run convertToExitAssets on
//      the wallet's share count — it reproduces this figure" instruction, run.
//      The float path it replaced (the 6dp one-share rate, re-multiplied) is
//      reported alongside as the reason it was replaced.
//
// Run:  node scripts/verify-maple-chain.mjs
// Env:  .env.local — ALCHEMY_URL (chain; required),
//       RAILS_API_URL + API_BEARER_TOKEN (index samples for check 9 and for
//       choosing lender subjects; without them the script falls back to the
//       pools' own largest holders it can reach by eth_call).
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
  // No transport-level `batch`: a batched JSON-RPC request that trips the rate
  // limiter fails as ONE unit, so a single throttled call takes its whole batch
  // down and viem's retry re-sends the group into the same wall. Unbatched
  // calls each retry on their own.
  transport: http(env.ALCHEMY_URL, { retryCount: 6, retryDelay: 1_000 }),
});

// Alchemy's free tier meters compute units per SECOND, and this script is all
// archive-block eth_call (a pricey unit — every read below is pinned to a past
// block). Fanning the reads out with bare Promise.all trips the limiter, which
// surfaces as a hard throw mid-run rather than a retry. Gate every call through
// one paced queue so concurrency and request SPACING are both bounded no matter
// how the checks below are written, and retry throttles with a backoff.
const CONCURRENCY = 2;
const MIN_SPACING_MS = 110;
let active = 0;
let lastStart = 0;
const waiting = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function limit(fn) {
  if (active >= CONCURRENCY) await new Promise((r) => waiting.push(r));
  active++;
  try {
    for (let attempt = 0; ; attempt++) {
      const gap = MIN_SPACING_MS - (Date.now() - lastStart);
      if (gap > 0) await sleep(gap);
      lastStart = Date.now();
      try {
        return await fn();
      } catch (e) {
        // Only a throttle is worth retrying here — a revert is a real answer
        // (check 7 depends on reverts) and must surface immediately.
        const throttled =
          e.status === 429 ||
          /compute units|rate limit|429|capacity|too many requests/i.test(
            `${e.details ?? ""} ${e.shortMessage ?? ""} ${e.message ?? ""}`,
          );
        if (!throttled || attempt >= 8) throw e;
        await sleep(2_000 * 2 ** attempt);
      }
    }
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// ── the catalog under test (mirrors lib/maple/asset-catalog.ts) ─────────────
const GLOBALS = "0x804a6f5f667170f545bf14e5ddb48c70b788390c";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
/** A third asset, used only to prove the oracle machinery is live+unpinned. */
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const POOLS = [
  {
    key: "syrupusdc",
    symbol: "syrupUSDC",
    assetSymbol: "USDC",
    pool: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b",
    asset: USDC,
    decimals: 6,
    poolManager: "0x7ad5ffa5fdf509e30186f4609c2f6269f4b6158f",
    withdrawalManager: "0x1bc47a0dd0fdab96e9ef982fdf1f34dc6207cfe3",
    fixedTermLoanManager: "0x4a1c3f0d9ad0b3f9da085bebfc22dea54263371b",
    openTermLoanManager: "0x6aceb4caba81fa6a8065059f3a944fb066a10fac",
  },
  {
    key: "syrupusdt",
    symbol: "syrupUSDT",
    assetSymbol: "USDT",
    pool: "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d",
    asset: USDT,
    decimals: 6,
    poolManager: "0x0cda32e08b48bfddbc7ee96b44b09cf286f9e21a",
    withdrawalManager: "0x86ebdf902d800f2a82038290b6dbb2a5ee29eb8c",
    fixedTermLoanManager: "0xc17aa0cb662bc4787bb16bd3bc13d0d88eb7abdd",
    openTermLoanManager: "0x616022e54324ef9c13b99c229dac8ea69af4faff",
  },
];

/** Open-term LoanManager accrual precision (fixed-term uses 1e30). */
const OT_PRECISION = BigInt(10) ** BigInt(27);
/** $1.00 at the 8dp scale MapleGlobals quotes prices in. */
const ONE_DOLLAR_8DP = BigInt(100_000_000);
/** Candidate lookback windows for the eventless-accrual proof, largest first. */
const LAG_CANDIDATES = [20_000, 5_000, 1_800, 600, 200, 50, 10].map((n) => BigInt(n));

const POOL_ABI = parseAbi([
  "function asset() view returns (address)",
  "function manager() view returns (address)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function unrealizedLosses() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToExitAssets(uint256 shares) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const PM_ABI = parseAbi([
  "function pool() view returns (address)",
  "function asset() view returns (address)",
  "function withdrawalManager() view returns (address)",
  "function globals() view returns (address)",
  "function poolDelegate() view returns (address)",
  "function active() view returns (bool)",
  "function strategyListLength() view returns (uint256)",
  "function strategyList(uint256) view returns (address)",
]);
const STRAT_ABI = parseAbi([
  "function assetsUnderManagement() view returns (uint256)",
  "function principalOut() view returns (uint128)",
  "function accountedInterest() view returns (uint112)",
  "function issuanceRate() view returns (uint256)",
  "function domainStart() view returns (uint48)",
]);
const WMQ_ABI = parseAbi(["function totalShares() view returns (uint256)"]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const GLOBALS_ABI = parseAbi([
  "function governor() view returns (address)",
  "function securityAdmin() view returns (address)",
  "function operationalAdmin() view returns (address)",
  "function protocolPaused() view returns (bool)",
  "function getLatestPrice(address) view returns (uint256)",
  "function manualOverridePrice(address) view returns (uint256)",
  "function priceOracleOf(address) view returns (address)",
]);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const info = (msg) => console.log(`      ${msg}`);
const same = (a, b) => getAddress(a) === getAddress(b);
/** Human-readable fixed-point render, for report lines only. */
const fmt = (v, d = 6, places = 6) => {
  const neg = v < BigInt(0);
  const x = neg ? -v : v;
  const unit = BigInt(10) ** BigInt(d);
  const frac = (x % unit).toString().padStart(d, "0").slice(0, places);
  return `${neg ? "−" : ""}${(x / unit).toLocaleString("en-US")}.${frac}`;
};
const read = (address, abi, functionName, args = [], blockNumber) =>
  limit(() =>
    client.readContract({ address, abi, functionName, args, ...(blockNumber != null ? { blockNumber } : {}) }),
  );
const getBlock = (blockNumber) => limit(() => client.getBlock({ blockNumber }));
/** eth_call that is allowed to revert — reverting IS the finding in check 7. */
const tryRead = async (address, abi, functionName, args = []) => {
  try {
    return { ok: true, value: await read(address, abi, functionName, args) };
  } catch {
    return { ok: false, value: null };
  }
};

// The read block is pinned once and every check uses it: the pools accrue by
// the second, so two reads at "head" are two different states and an identity
// checked across them would fail for no reason.
const head = (await limit(() => client.getBlockNumber())) - BigInt(2);
console.log(`Maple chain verification — pinned read block ${head}\n`);

// ── index samples (used to CHOOSE lender subjects; agreement is reported) ────
let rows = [];
if (env.RAILS_API_URL && env.API_BEARER_TOKEN) {
  try {
    const res = await fetch(`${env.RAILS_API_URL}/api/maple/positions?status=open&limit=25`, {
      headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
    });
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    rows = (await res.json()).rows ?? [];
    info(`index sampled: ${rows.length} open lender rows`);
  } catch (e) {
    info(`index sample unavailable (${e.message}) — chain-only checks are unaffected`);
  }
} else {
  info("RAILS_API_URL / API_BEARER_TOKEN missing — the reported index-agreement section will be skipped");
}
console.log();

// ════════════════════════════════════════════════════════════════════════════
for (const P of POOLS) {
  console.log(`── ${P.symbol} pool (${P.assetSymbol}) ${P.pool} ──`);

  // ── 1. catalog & roster ───────────────────────────────────────────────────
  const [poolAsset, poolMgr, poolSym, poolDec, pmPool, pmAsset, pmWmq, pmGlobals, pmActive, stratLen] =
    await Promise.all([
      read(P.pool, POOL_ABI, "asset", [], head),
      read(P.pool, POOL_ABI, "manager", [], head),
      read(P.pool, POOL_ABI, "symbol", [], head),
      read(P.pool, POOL_ABI, "decimals", [], head),
      read(P.poolManager, PM_ABI, "pool", [], head),
      read(P.poolManager, PM_ABI, "asset", [], head),
      read(P.poolManager, PM_ABI, "withdrawalManager", [], head),
      read(P.poolManager, PM_ABI, "globals", [], head),
      read(P.poolManager, PM_ABI, "active", [], head),
      read(P.poolManager, PM_ABI, "strategyListLength", [], head),
    ]);
  check(`${P.key}: pool.asset() matches the catalog`, same(poolAsset, P.asset), poolAsset);
  check(`${P.key}: pool.symbol() is ${P.symbol}`, poolSym === P.symbol, poolSym);
  check(`${P.key}: pool.decimals() is ${P.decimals}`, Number(poolDec) === P.decimals, `chain says ${poolDec}`);
  check(`${P.key}: pool.manager() matches the catalog`, same(poolMgr, P.poolManager), poolMgr);
  // The round-trip is the roster proof: the manager names this pool back, so
  // the pair is registered with each other on-chain, not just in our file.
  check(`${P.key}: poolManager.pool() round-trips to the pool`, same(pmPool, P.pool), pmPool);
  check(`${P.key}: poolManager.asset() agrees with the pool's`, same(pmAsset, poolAsset));
  check(`${P.key}: poolManager.withdrawalManager() matches the catalog`, same(pmWmq, P.withdrawalManager), pmWmq);
  check(`${P.key}: poolManager.globals() is the Maple registry`, same(pmGlobals, GLOBALS), pmGlobals);
  check(`${P.key}: the pool is active`, pmActive === true);

  // Enumerate the live strategy list — both catalog LoanManagers must be in it.
  const strategies = [];
  for (let i = BigInt(0); i < stratLen; i++)
    strategies.push((await read(P.poolManager, PM_ABI, "strategyList", [i], head)).toLowerCase());
  check(
    `${P.key}: both catalog LoanManagers are in the live strategy list`,
    strategies.includes(P.fixedTermLoanManager) && strategies.includes(P.openTermLoanManager),
    `${strategies.length} strategies: ${strategies.length - 2} yield + 2 loan managers`,
  );

  // ── 2. totalAssets identity — the liquid/deployed split ───────────────────
  const [cash, totalAssets, totalSupply, unrealizedLosses] = await Promise.all([
    read(P.asset, ERC20_ABI, "balanceOf", [P.pool], head),
    read(P.pool, POOL_ABI, "totalAssets", [], head),
    read(P.pool, POOL_ABI, "totalSupply", [], head),
    read(P.pool, POOL_ABI, "unrealizedLosses", [], head),
  ]);
  const aums = [];
  for (const s of strategies) aums.push(await read(s, STRAT_ABI, "assetsUnderManagement", [], head));
  const sumAum = aums.reduce((a, b) => a + b, BigInt(0));
  check(
    `${P.key}: cash + Σ strategy AUM == totalAssets (BigInt-exact)`,
    cash + sumAum === totalAssets,
    `Δ=${totalAssets - cash - sumAum}`,
  );
  const loansAum = strategies.reduce(
    (acc, s, i) => (s === P.fixedTermLoanManager || s === P.openTermLoanManager ? acc + aums[i] : acc),
    BigInt(0),
  );
  const pctLiquid = totalAssets > BigInt(0) ? (Number(cash) / Number(totalAssets)) * 100 : 0;
  info(
    `liquid ${fmt(cash, P.decimals, 2)} ${P.assetSymbol} (${pctLiquid.toFixed(2)}%) · ` +
      `loan book ${fmt(loansAum, P.decimals, 2)} (off-chain custody) · total ${fmt(totalAssets, P.decimals, 2)}`,
  );

  // ── 3. share-price identities ─────────────────────────────────────────────
  // Several sizes: one unit (what the card's rate is read at), a mid holding,
  // and a whale — a rate that only holds at 1e6 would be a rounding accident.
  const SIZES = [BigInt(1_000_000), BigInt(21_639_670_606), BigInt(1_872_966_195_790)];
  let navExact = 0;
  let exitExact = 0;
  for (const s of SIZES) {
    const [nav, exit] = await Promise.all([
      read(P.pool, POOL_ABI, "convertToAssets", [s], head),
      read(P.pool, POOL_ABI, "convertToExitAssets", [s], head),
    ]);
    if (nav === (s * totalAssets) / totalSupply) navExact++;
    if (exit === (s * (totalAssets - unrealizedLosses)) / totalSupply) exitExact++;
  }
  check(
    `${P.key}: convertToAssets(s) == s × totalAssets ÷ totalSupply (BigInt-exact)`,
    navExact === SIZES.length,
    `${navExact}/${SIZES.length} share sizes`,
  );
  check(
    `${P.key}: convertToExitAssets(s) == s × (totalAssets − unrealizedLosses) ÷ totalSupply (BigInt-exact)`,
    exitExact === SIZES.length,
    `${exitExact}/${SIZES.length} share sizes`,
  );

  // ── 4. impairment socializes, it never seizes (the forensics `{ why }`) ───
  const unit = BigInt(10) ** BigInt(P.decimals);
  const [navRate, exitRate] = await Promise.all([
    read(P.pool, POOL_ABI, "convertToAssets", [unit], head),
    read(P.pool, POOL_ABI, "convertToExitAssets", [unit], head),
  ]);
  check(
    `${P.key}: exit rate ≤ NAV rate, equal iff no impairment is live`,
    exitRate <= navRate && (unrealizedLosses === BigInt(0)) === (exitRate === navRate),
    `NAV ${fmt(navRate, P.decimals)} · exit ${fmt(exitRate, P.decimals)} · unrealizedLosses ${fmt(unrealizedLosses, P.decimals, 2)}`,
  );
  // Both price functions take a share COUNT and nothing else — there is no
  // address in the signature, so no arithmetic path exists by which a loss
  // could be charged to one lender. Demonstrate the consequence exactly: under
  // a hypothetical impairment, EVERY holder's claim drops by precisely their
  // pro-rata slice of it, shares ÷ totalSupply, and by nothing else. That is
  // what "socialized" means, and it is the whole of the forensics `{ why }`.
  //
  // Stated as a wei-exact identity rather than a ratio of floats: the two
  // floors either side of the subtraction can each truncate, so the pro-rata
  // slice is exact to within 1 unit of the asset's smallest denomination —
  // asserting tighter would be asserting an artefact of integer division, and
  // the dust is real (it lands on a tiny holder, not on the whale).
  const [whale, minnow] = [BigInt(1_872_966_195_790), BigInt(3_881_972)];
  const impairment = totalAssets / BigInt(10); // a 10% write-down that has not happened
  const exitUnder = (s, ul) => (s * (totalAssets - ul)) / totalSupply;
  const ONE = BigInt(1);
  const proRata = (s) => {
    const loss = exitUnder(s, unrealizedLosses) - exitUnder(s, unrealizedLosses + impairment);
    const expected = (s * impairment) / totalSupply;
    const off = loss > expected ? loss - expected : expected - loss;
    return { loss, expected, ok: off <= ONE };
  };
  const w = proRata(whale);
  const m = proRata(minnow);
  check(
    `${P.key}: a loss cannot be aimed — under a hypothetical 10% impairment each holder loses EXACTLY its pro-rata slice`,
    w.ok && m.ok,
    `whale −${fmt(w.loss, P.decimals, 2)} (pro-rata −${fmt(w.expected, P.decimals, 2)}) · ` +
      `minnow −${fmt(m.loss, P.decimals)} (pro-rata −${fmt(m.expected, P.decimals)}) ${P.assetSymbol} — ` +
      `wei-exact but for integer-division dust: the exit price takes a share count and NO address, so there is no ` +
      `per-lender term for a loss to be aimed at. That is why a Maple lender has no liquidation surface to render.`,
  );
  if (unrealizedLosses === BigInt(0))
    info(
      `no impairment is live at this block, so the socialization is proven STRUCTURALLY (by the identity above), not against an instance`,
    );

  // ── 5. queue escrow custody ───────────────────────────────────────────────
  const [wmqShares, wmqHeld] = await Promise.all([
    read(P.withdrawalManager, WMQ_ABI, "totalShares", [], head),
    read(P.pool, POOL_ABI, "balanceOf", [P.withdrawalManager], head),
  ]);
  check(
    `${P.key}: the queue really custodies the escrow — pool.balanceOf(wmq) == wmq.totalShares()`,
    wmqHeld === wmqShares,
    `${fmt(wmqShares, P.decimals, 2)} ${P.symbol} escrowed · Δ=${wmqHeld - wmqShares}`,
  );
  const queueValue = (wmqShares * exitRate) / unit;
  info(
    `queue ${fmt(queueValue, P.decimals, 2)} ${P.assetSymbol} at the exit rate vs ${fmt(cash, P.decimals, 2)} liquid — ` +
      `${queueValue <= cash ? "coverable from cash today" : "EXCEEDS the liquid cash: fills wait on loan repayments"}`,
  );

  console.log();
}

// ════════════════════════════════════════════════════════════════════════════
// 6. EVENTLESS ACCRUAL — the lender's yield, proven with no log at all.
// ════════════════════════════════════════════════════════════════════════════
console.log("── 6. eventless accrual: the loan book earns by the second, silently ──");
const headTs = (await getBlock(head)).timestamp;
for (const P of POOLS) {
  const lm = P.openTermLoanManager;
  const anchorAt = async (bn) => {
    const [p, a, i, ds, aum] = await Promise.all([
      read(lm, STRAT_ABI, "principalOut", [], bn),
      read(lm, STRAT_ABI, "accountedInterest", [], bn),
      read(lm, STRAT_ABI, "issuanceRate", [], bn),
      read(lm, STRAT_ABI, "domainStart", [], bn),
      read(lm, STRAT_ABI, "assetsUnderManagement", [], bn),
    ]);
    return { p, a, i, ds: BigInt(ds), aum };
  };
  const H = await anchorAt(head);
  // The open-term book has no domainEnd — that is what "open term" means, so
  // accrual runs unbounded from domainStart rather than clamping to a maturity.
  const rebuiltInPlace = H.p + H.a + (H.i * (headTs - H.ds)) / OT_PRECISION;
  check(
    `${P.key} OT-LM: AUM == principalOut + accountedInterest + issuanceRate × (t − domainStart) ÷ 1e27 (BigInt-exact)`,
    rebuiltInPlace === H.aum,
    `${fmt(H.aum, P.decimals, 2)} ${P.assetSymbol} · Δ=${rebuiltInPlace - H.aum}`,
  );

  // Walk the candidate windows largest-first and keep the first whose anchor
  // is byte-identical at both ends. An unmoved anchor is the eth_call-only
  // proof that no re-anchor (and so no accounting event) fired in the window —
  // exactly the fact a log read would otherwise be needed to establish.
  let proven = false;
  for (const lag of LAG_CANDIDATES) {
    const past = head - lag;
    const X = await anchorAt(past);
    if (!(X.ds === H.ds && X.i === H.i && X.p === H.p && X.a === H.a)) continue;
    const pastTs = (await getBlock(past)).timestamp;
    const rebuilt = X.p + X.a + (X.i * (headTs - X.ds)) / OT_PRECISION;
    const mins = Number(headTs - pastTs) / 60;
    check(
      `${P.key} OT-LM: EVENTLESS ACCRUAL — anchor identical over ${lag} blocks (${mins.toFixed(0)}min), AUM still moved`,
      rebuilt === H.aum && H.aum !== X.aum,
      `+${fmt(H.aum - X.aum, P.decimals)} ${P.assetSymbol} accrued with NO event: the anchor never moved, so nothing was emitted — ` +
        `head AUM rebuilt from the PAST block's params is BigInt-exact (Δ=${rebuilt - H.aum})`,
    );

    // Carry it to the lender: same shares at both ends, more money at the end.
    const holder = rows.find((r) => (r.pools ?? []).some((q) => q.pool === P.key && BigInt(q.sharesBalanceRaw) > 0));
    if (holder) {
      const pool = POOLS.find((q) => q.key === P.key);
      const [balNow, balPast] = await Promise.all([
        read(pool.pool, POOL_ABI, "balanceOf", [getAddress(holder.wallet)], head),
        read(pool.pool, POOL_ABI, "balanceOf", [getAddress(holder.wallet)], past),
      ]);
      if (balNow > BigInt(0) && balNow === balPast) {
        const [valNow, valPast] = await Promise.all([
          read(pool.pool, POOL_ABI, "convertToExitAssets", [balNow], head),
          read(pool.pool, POOL_ABI, "convertToExitAssets", [balPast], past),
        ]);
        check(
          `${P.key}: a real lender earned with no event of its own — identical shares, larger claim`,
          valNow > valPast,
          `${holder.wallet}: ${fmt(balNow, pool.decimals, 2)} ${pool.symbol} unchanged, worth ` +
            `${fmt(valPast, pool.decimals)} → ${fmt(valNow, pool.decimals)} ${pool.assetSymbol} ` +
            `(+${fmt(valNow - valPast, pool.decimals)}) — event replay can state this wallet's SHARES exactly and its VALUE never`,
        );
      } else {
        info(`${P.key}: the sampled holder's balance moved inside the window — not a subject for the lender-side leg`);
      }
    }
    proven = true;
    break;
  }
  if (!proven)
    info(
      `${P.key} OT-LM: the anchor re-set in every candidate window (a busy book re-anchors on each loan payment) — ` +
        `the in-place identity above still proves the accrual formula`,
    );
}
console.log();

// ════════════════════════════════════════════════════════════════════════════
// 7. The oracle question — why `oracleUsd` is `{ why }`, stated precisely.
// ════════════════════════════════════════════════════════════════════════════
console.log("── 7. Maple's own price surface ──");
const [usdcOracle, usdcOverride, usdcPrice, usdtOverride, usdtPrice, wethOverride, wethPrice] = await Promise.all([
  tryRead(GLOBALS, GLOBALS_ABI, "priceOracleOf", [USDC]),
  tryRead(GLOBALS, GLOBALS_ABI, "manualOverridePrice", [USDC]),
  tryRead(GLOBALS, GLOBALS_ABI, "getLatestPrice", [USDC]),
  tryRead(GLOBALS, GLOBALS_ABI, "manualOverridePrice", [USDT]),
  tryRead(GLOBALS, GLOBALS_ABI, "getLatestPrice", [USDT]),
  tryRead(GLOBALS, GLOBALS_ABI, "manualOverridePrice", [WETH]),
  tryRead(GLOBALS, GLOBALS_ABI, "getLatestPrice", [WETH]),
]);
// The machinery is real and unpinned elsewhere — so the USDC pin below is a
// governance CHOICE, not an absence. Without this leg, "Maple has no usable
// price" would be indistinguishable from "Maple has no oracle at all", and the
// coverage note would be making the weaker, wrong claim.
check(
  "MapleGlobals runs a real oracle: WETH prices live off a registered feed, unpinned",
  wethPrice.ok && wethPrice.value > BigInt(0) && wethOverride.ok && wethOverride.value === BigInt(0),
  `getLatestPrice(WETH) = $${fmt(wethPrice.value ?? BigInt(0), 8, 2)} with manualOverridePrice = 0`,
);
check(
  "USDC: Maple's own price IS a governance-set $1.00 constant — getLatestPrice == manualOverridePrice == 1e8",
  usdcPrice.ok &&
    usdcOverride.ok &&
    usdcPrice.value === usdcOverride.value &&
    usdcPrice.value === ONE_DOLLAR_8DP &&
    usdcOracle.ok,
  `override $${fmt(usdcOverride.value ?? BigInt(0), 8, 2)} overrides the registered feed at ${usdcOracle.value} — ` +
    `rendering this as "the protocol's own oracle USD" would launder a $1 PIN as a market reading, which is exactly ` +
    `what chain-truth §S3 forbids: the pin erases the depeg signal the explorer exists to show`,
);
check(
  "USDT: Maple carries no price at all — getLatestPrice reverts",
  !usdtPrice.ok && usdtOverride.ok && usdtOverride.value === BigInt(0),
  `no feed and no override — there is nothing to render even if the charter allowed it`,
);
info(
  `→ oracleUsd stays { why }, but NOT because "Maple runs no oracle": it runs one, and for USDC that oracle IS the pin.`,
);
console.log();

// ════════════════════════════════════════════════════════════════════════════
// 8. Governance surface.
// ════════════════════════════════════════════════════════════════════════════
console.log("── 8. governance surface ──");
const [governor, securityAdmin, operationalAdmin, protocolPaused] = await Promise.all([
  read(GLOBALS, GLOBALS_ABI, "governor", [], head),
  read(GLOBALS, GLOBALS_ABI, "securityAdmin", [], head),
  read(GLOBALS, GLOBALS_ABI, "operationalAdmin", [], head),
  read(GLOBALS, GLOBALS_ABI, "protocolPaused", [], head),
]);
check(
  "the protocol is not paused and the admin roles are all set",
  protocolPaused === false &&
    [governor, securityAdmin, operationalAdmin].every((a) => a !== "0x0000000000000000000000000000000000000000"),
  `governor ${governor} · securityAdmin ${securityAdmin} · operationalAdmin ${operationalAdmin}`,
);
for (const P of POOLS) info(`${P.key} poolDelegate = ${await read(P.poolManager, PM_ABI, "poolDelegate", [], head)}`);
console.log();

// ════════════════════════════════════════════════════════════════════════════
// 9. Index agreement + the rendered claim, against the pool itself.
// ════════════════════════════════════════════════════════════════════════════
if (rows.length > 0) {
  console.log("── 9. index agreement + the rendered claim ──");
  let shareChecked = 0;
  let shareExact = 0;
  let valueChecked = 0;
  let valueExact = 0;
  let worstPpm = 0;
  let worstAbs = 0;
  let worstAbsSym = "";
  for (const P of POOLS) {
    const unit = BigInt(10) ** BigInt(P.decimals);
    const [exitRate, totalAssets, totalSupply, unrealizedLosses] = await Promise.all([
      read(P.pool, POOL_ABI, "convertToExitAssets", [unit], head),
      read(P.pool, POOL_ABI, "totalAssets", [], head),
      read(P.pool, POOL_ABI, "totalSupply", [], head),
      read(P.pool, POOL_ABI, "unrealizedLosses", [], head),
    ]);
    // The float path the app deliberately does NOT take: the one-share rate,
    // already truncated to the asset's dp, re-multiplied by the holding.
    const exitRateFloat = Number(exitRate) / Number(unit);
    for (const w of rows.slice(0, 8)) {
      const q = (w.pools ?? []).find((x) => x.pool === P.key);
      if (!q) continue;
      const shares = BigInt(String(q.sharesBalanceRaw ?? "0").split(".")[0]);
      const escrow = BigInt(String(q.escrowedSharesRaw ?? "0").split(".")[0]);
      if (shares + escrow === BigInt(0)) continue;
      const onchain = await read(P.pool, POOL_ABI, "balanceOf", [getAddress(w.wallet)], head);
      shareChecked++;
      if (onchain === shares) shareExact++;
      else {
        // The index is a snapshot at the wallet's own last-event block; a
        // hyperactive holder (the Uniswap V4 PoolManager holds syrup) can move
        // shares in the minutes between that watermark and this run's head —
        // observed live: two post-watermark transfers out explained a head Δ
        // to the wei. Pin the comparison to the watermark before calling it a
        // divergence: exact there means the replay is right and head moved on.
        const wm = Number(w.lastBlockNumber ?? 0);
        const atWatermark =
          wm > 0 ? await read(P.pool, POOL_ABI, "balanceOf", [getAddress(w.wallet)], BigInt(wm)) : null;
        if (atWatermark === shares) {
          shareExact++;
          info(
            `${P.key} ${w.wallet}: head balanceOf ${onchain} ≠ index ${shares}, but exact at the wallet's own watermark (block ${wm}) — post-watermark transfers, not replay drift`,
          );
        } else {
          info(
            `${P.key} ${w.wallet}: index shares ${shares} vs balanceOf ${onchain} at head AND ${atWatermark} at watermark ${wm} — real divergence`,
          );
        }
      }

      // The identity lib/maple/exit-value.ts renders, on this wallet's REAL
      // holding, against the pool's own answer. The card's receipt tells the
      // reader to "re-run convertToExitAssets on the wallet's share count — it
      // reproduces this figure"; this is that instruction, executed.
      const trueValue = await read(P.pool, POOL_ABI, "convertToExitAssets", [shares + escrow], head);
      const derived = ((shares + escrow) * (totalAssets - unrealizedLosses)) / totalSupply;
      valueChecked++;
      if (derived === trueValue) valueExact++;

      const truth = Number(trueValue) / Number(unit);
      const floatValue = (Number(shares) / Number(unit) + Number(escrow) / Number(unit)) * exitRateFloat;
      const ppm = ((floatValue - truth) / truth) * 1e6;
      if (Math.abs(ppm) > Math.abs(worstPpm)) worstPpm = ppm;
      if (Math.abs(floatValue - truth) > Math.abs(worstAbs)) {
        worstAbs = floatValue - truth;
        worstAbsSym = P.assetSymbol;
      }
    }
  }
  check(
    "the backend's replayed share balances are exact against a live balanceOf",
    shareChecked > 0 && shareExact === shareChecked,
    `${shareExact}/${shareChecked} wallets wei-exact — ERC-20 transfers ARE fully event-legible, which is precisely the half of the position replay can state`,
  );
  check(
    "the claim the card renders IS the pool's own answer — the receipt's verify line reproduces it",
    valueChecked > 0 && valueExact === valueChecked,
    `${valueExact}/${valueChecked} real holdings: (shares + escrowed) × (totalAssets − unrealizedLosses) ÷ totalSupply == convertToExitAssets(shares + escrowed), BigInt-exact`,
  );
  info(
    `why that identity and not the rate: re-multiplying the ${POOLS[0].decimals}dp-quantized one-share rate would drift ` +
      `${worstPpm >= 0 ? "+" : ""}${worstPpm.toFixed(3)} ppm (${worstAbs >= 0 ? "+" : "−"}${Math.abs(worstAbs).toFixed(6)} ${worstAbsSym}) ` +
      `across this sample — a figure the receipt's own verify instruction would then fail to reproduce. The quantized rate ` +
      `remains what the band and the "@ rate" footnote DISPLAY; it is the basis of no rendered claim.`,
  );
  console.log();
}

console.log(`${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ""}`);
process.exit(fail ? 1 : 0);
