// f(x) V2 SYSTEM-lane provenance vocabulary — the /fx/pools protocol view.
// ----------------------------------------------------------------------------
// The position lane (event-provenance.ts) traces one xPOSITION through captured
// events and the settled sweep. This lane traces the OTHER direction: the
// pool/tick system itself, read live at one head block — the level f(x)
// actually operates on, since funding, rebalances, liquidations and
// redemptions all consume whole ticks with no per-position event. Different
// route, different reads, so it gets its own file and its own `via` prefix.
//
// The kinds follow the house rule. A value a pool getter returns is `chain`.
// A value we compute out of pool slots is `chain-derived`, carrying its
// formula and inputs — including the per-tick amounts, which pass through the
// X96 index identities scripts/verify-fx-chain.mjs proves BigInt-exact.
//
// PRICE LEGS — named wherever one is used, because the protocol itself uses
// three: a position's stated debt ratio is judged at the ANCHOR leg; the
// rebalance/liquidation sweeps judge a TICK at the MIN leg; redemption prices
// collateral at the MAX leg. Every ratio on this page is a tick's, so it is
// judged at the MIN leg and its receipt says so.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { FX_ADDRESSES } from "./asset-catalog";

/** The route every figure on this page arrives through. */
const SYSTEM_VIA = "GET /api/chain/fx/pools";

const POOL_MANAGER = { name: "PoolManager", address: FX_ADDRESSES.POOL_MANAGER };
const pool = (label: string, address: string) => ({ name: `AaveFundingPool (${label})`, address });

/** Every value here is a pinned-block eth_call: re-running it IS the check. */
const STATE_VERIFY: ProvVerify = {
  kind: "recompute",
  text: "Re-run the eth_call against any node at the stamped block",
};

// ── The roster ───────────────────────────────────────────────────────────────

export const poolRosterProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    "The pool roster — exactly two AaveFundingPools hang off the one PoolManager (wstETH and WBTC; chain-verified complete, two RegisterPool events ever). Each pool answers the manager's getPoolInfo with a live capacity, which is only ever set at registration — a roster proof that needs no log scan.",
  contract: POOL_MANAGER,
  via: `${SYSTEM_VIA} · PoolManager.getPoolInfo per pool @ pinned block`,
  verify: STATE_VERIFY,
});

// ── Pool totals (the pool's own getters) ─────────────────────────────────────

export const poolCollateralProv = (label: string, address: string, normalizedSym: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `All collateral the ${label} holds — the pool's own getTotalRawCollaterals view at the pinned block. NORMALIZED units (${normalizedSym}, 1e18; rate-converted via the pool's token-rate provider), NOT the token as deposited — the two unit systems never mix, and the manager's token-unit balance is shown separately and named as such. Funding charges collateral away through the collateral index, so this figure falls between touches with no event.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.getTotalRawCollaterals() (eth_call)`,
  verify: STATE_VERIFY,
});

export const poolDebtProv = (label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `All fxUSD debt owed to the ${label} — the pool's own getTotalRawDebts view at the pinned block. An fxUSD token amount, not a USD figure (fxUSD is not $1-pinned). The tick ladder below decomposes this exactly: every debt share sits in one tick, and the sum is re-checked in integer share space on every read.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.getTotalRawDebts() (eth_call)`,
  verify: STATE_VERIFY,
});

export const totalDebtAllPoolsProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "fxUSD debt summed across both pools. Debt is one unit system everywhere (fxUSD, 1e18), so this sum is safe — unlike collateral, which the two pools hold in different units and which is deliberately never summed here.",
  contract: POOL_MANAGER,
  via: `${SYSTEM_VIA} · Σ pool.getTotalRawDebts() across the roster`,
  formula: "Σ getTotalRawDebts over both pools",
  verify: STATE_VERIFY,
});

export const positionsMintedProv = (label: string, address: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Positions ever minted in the ${label} — the pool's own getNextPositionId minus one (ids are assigned sequentially from 1; the pool contract is itself the position ERC721). A count of everything ever opened, not of positions still live.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.getNextPositionId() − 1`,
  formula: "getNextPositionId − 1",
  verify: STATE_VERIFY,
});

export const treeNodesProv = (label: string, address: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Tick-tree nodes ever allocated in the ${label} — getNextTreeNodeId minus one. Every rebalance, tick liquidation and redemption retires a tick's node and re-homes the survivors under a fresh one (the TickMovement mechanics), so the gap between this and the tick count is a fossil record of how often the ladder has been rearranged without any position signing anything.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.getNextTreeNodeId() − 1`,
  formula: "getNextTreeNodeId − 1",
  verify: STATE_VERIFY,
});

// ── The funding engine ───────────────────────────────────────────────────────

export const indexProv = (side: "debt" | "coll", label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    side === "debt"
      ? `The ${label}'s debt index — one of the two dials the socialized lane turns, read from the pool's own getDebtAndCollateralIndex and rendered as a plain multiplier (the slot stores it × 2^96, starting at exactly 1.0). A position's real debt is its debt shares × this index, so when the index rises every debt in the pool grows at once, with no per-position event. Chain-verified BigInt-exact: totalRawDebts == debtShares × debtIndex ÷ 2^96 (scripts/verify-fx-chain.mjs).`
      : `The ${label}'s collateral index — the dial funding turns, read from the pool's own getDebtAndCollateralIndex and rendered as a plain multiplier (× 2^96, starting at exactly 1.0). The collateral index DIVIDES: a position's real collateral is its shares × 2^96 ÷ this index, so when it rises every position in the pool holds less — that division IS funding being charged, and it emits nothing per position. Chain-verified BigInt-exact (scripts/verify-fx-chain.mjs).`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.getDebtAndCollateralIndex() · ${side === "debt" ? "debt" : "collateral"} half ÷ 2^96`,
  verify: STATE_VERIFY,
});

export const indexIdentityProv = (label: string, address: string, exact: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: exact
    ? `The index identities re-checked on THIS read, in integers: totalRawDebts == debtShares × debtIndex ÷ 2^96 and totalRawCollaterals == collShares × 2^96 ÷ collIndex, both exact. These are the same identities every per-tick amount below is derived through, so the check covers the ladder's arithmetic, not just the headline.`
    : `The index identities did NOT close on this read — shares × index disagrees with the pool's own raw totals. The per-tick amounts below pass through this same arithmetic, so treat them as suspect until a later block closes it.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · derived check`,
  formula: "debtShares × debtIndex ÷ 2^96 == getTotalRawDebts (and the collateral twin)",
  inputs: [
    { label: "shares", kind: "chain", pclass: "state", note: "pool.getDebtAndCollateralShares()" },
    { label: "indices", kind: "chain", pclass: "state", note: "pool.getDebtAndCollateralIndex()" },
    { label: "raw totals", kind: "chain", pclass: "state", note: "pool.getTotalRawCollaterals/Debts()" },
  ],
  verify: STATE_VERIFY,
});

export const fundingRateProv = (label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The ${label}'s funding rate — the protocol's own configuration getter (getLongPoolFundingRatio), an annualized fraction of the pool's collateral. AaveFundingPool charges it INTO the collateral index at each checkpoint: funding = totalRawColls × this rate × elapsed time ÷ one year, taken from every position's collateral pro-rata, with no event. Funding charges the collateral side, never the debt side.`,
  contract: { name: "PoolConfiguration", address: "" },
  via: `${SYSTEM_VIA} · configuration.getLongPoolFundingRatio(pool) (eth_call) ÷ 1e18`,
  verify: STATE_VERIFY,
});

export const fundingCheckpointProv = (label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `When the ${label} last checkpointed funding — the timestamp half of the pool's own borrowRateSnapshot slot. Every operate, rebalance, liquidation or redemption on the pool rolls funding forward to its own block first, so this is also the last moment the collateral index moved.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.borrowRateSnapshot() · timestamp`,
  verify: STATE_VERIFY,
});

// ── The oracle's three legs ──────────────────────────────────────────────────

export const oracleLegProv = (
  leg: "anchor" | "min" | "max",
  label: string,
  address: string,
  oracleAddr: string,
  normalizedSym: string,
): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  summary:
    leg === "anchor"
      ? `The oracle's ANCHOR leg — USD per NORMALIZED unit (${normalizedSym}, 1e18), read from the ${label}'s own price oracle at the pinned block. The leg a POSITION's stated debt ratio is judged at (chain-verified: getPositionDebtRatio == debts × 1e36 ÷ (colls × anchor), BigInt-exact). Not the leg this page's tick ratios use — ticks are judged the way the engines judge them, at the min leg.`
      : leg === "min"
        ? `The oracle's MIN leg — the lowest of its price sources, USD per NORMALIZED unit (${normalizedSym}). The leg the protocol's own rebalance and liquidation sweeps judge a TICK at (its getLiquidatePrice getter returns exactly this leg), which is why every tick ratio on this page uses it and says so.`
        : `The oracle's MAX leg — the highest of its price sources, USD per NORMALIZED unit (${normalizedSym}). The leg redemption prices collateral at (getRedeemPrice returns exactly this leg): a redeemer surrenders fxUSD and receives collateral valued at the max, the leg least favorable to them.`,
  contract: { name: "PriceOracle", address: oracleAddr },
  via: `${SYSTEM_VIA} · oracle.getPrice() · ${leg} leg ÷ 1e18`,
  verify: STATE_VERIFY,
});

// ── The escalation ladder (governance config) ────────────────────────────────

export const rungProv = (which: "open" | "rebalance" | "liquidate", label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    which === "open"
      ? `The borrow cap — the top of the ${label}'s own getDebtRatioRange. A position can only be opened or adjusted while its debt ratio (judged at the anchor leg) stays at or under this; it is the only rung a position holder ever interacts with voluntarily.`
      : which === "rebalance"
        ? `The rebalance rung — the ${label}'s own getRebalanceRatios. From this debt ratio (judged at the MIN leg) the whole TICK can be rebalanced: a keeper repays enough of the tick's debt to bring it back to this line and takes collateral plus the bonus. Every position in the tick loses collateral and debt pro-rata, and none of them emits an event.`
        : `The liquidation rung — the ${label}'s own getLiquidateRatios. From this debt ratio (judged at the MIN leg) the whole tick is liquidatable; past it a rebalance is refused (ErrorRebalanceOnLiquidatableTick) and the tick clears through liquidation with the larger bonus. Any bad debt beyond the collateral is written off against every remaining position — the terminal, eventless socialization.`,
  contract: pool(label, address),
  via:
    which === "open"
      ? `${SYSTEM_VIA} · pool.getDebtRatioRange() · max ÷ 1e18`
      : which === "rebalance"
        ? `${SYSTEM_VIA} · pool.getRebalanceRatios() ÷ 1e18 (bonus ÷ 1e9)`
        : `${SYSTEM_VIA} · pool.getLiquidateRatios() ÷ 1e18 (bonus ÷ 1e9)`,
  verify: STATE_VERIFY,
});

export const maxRedeemProv = (label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `Redemption's per-tick cap — the ${label}'s own getMaxRedeemRatioPerTick. Redemption walks the ladder from the top tick down, taking at most this fraction of a tick's debt per pass before moving to the next, pricing collateral at the oracle's max leg. It skips underwater ticks and dust ticks (below 1e9 debt shares) — the same skip lines this page's dust count is drawn on.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.getMaxRedeemRatioPerTick() ÷ 1e9`,
  verify: STATE_VERIFY,
});

export const pausedProv = (which: "borrow" | "redeem", label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `Whether ${which === "borrow" ? "borrowing" : "redemption"} is paused on the ${label} — the pool's own ${
    which === "borrow" ? "isBorrowPaused" : "isRedeemPaused"
  } flag, a governance switch read at the pinned block.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.${which === "borrow" ? "isBorrowPaused" : "isRedeemPaused"}()`,
  verify: STATE_VERIFY,
});

// ── The manager's book (capacity; TOKEN units) ───────────────────────────────

export const capacityProv = (side: "collateral" | "debt", label: string, tokenSym: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    side === "collateral"
      ? `The ${label}'s collateral capacity and current balance on the PoolManager's book — TOKEN units (${tokenSym} as deposited), NOT the rate-normalized unit the pool's own totals are in. The manager keeps the two columns as independent running sums, each operation converting at its own moment's rate — so neither column re-derives from the other at the live rate; the rate source itself is chain-verified (scripts/verify-fx-chain.mjs). Shown for the cap; the pool's normalized total above is the accounting truth.`
      : `The ${label}'s fxUSD debt capacity on the PoolManager's book — the most fxUSD this pool may mint, set by governance at registration and since.`,
  contract: POOL_MANAGER,
  via: `${SYSTEM_VIA} · PoolManager.getPoolInfo(pool) · ${side} capacity`,
  verify: STATE_VERIFY,
});

// ── The ladder itself ────────────────────────────────────────────────────────

export const occupiedTicksProv = (label: string, address: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Ticks currently holding debt in the ${label} — enumerated from the pool's own tickBitmap, all 256 words of it (ticks are int16, so the sweep is exhaustive by construction). The pool flips a tick's bit exactly when its debt crosses zero, so the bitmap IS the ladder's roster: no catalog, no log scan, nothing inferred.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.tickBitmap(word) × 256 words · set bits`,
  formula: "set bits across tickBitmap[-128..127]",
  verify: STATE_VERIFY,
});

export const totalPositionsMintedProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "Positions ever minted across both pools — Σ of each pool's own getNextPositionId minus one (ids are sequential from 1 per pool; each pool is its own ERC721). Everything ever opened, not positions still live.",
  contract: POOL_MANAGER,
  via: `${SYSTEM_VIA} · Σ pool.getNextPositionId() − 1 across the roster`,
  formula: "Σ (getNextPositionId − 1) over both pools",
  verify: STATE_VERIFY,
});

export const tickIdProv = (label: string, address: string, tick: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `Tick ${tick} of the ${label} — one 0.15%-wide debt-ratio bucket (tick boundaries step by ×1.0015 in the pool's share-ratio space; TickMath). Its presence on this page is a chain fact: the pool keeps a bit per tick with debt in tickBitmap, and this tick's bit is set at the pinned block. Positions land in a tick when opened or adjusted and are then carried WITH it — rebalances, liquidations and redemptions consume the tick wholesale and migrate the survivors (TickMovement), all without a per-position event.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.tickBitmap · set bit ${tick}`,
  verify: STATE_VERIFY,
});

export const topTickProv = (label: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The ${label}'s top tick — the pool's own getTopTick slot: the highest tick with debt, i.e. the highest debt-to-collateral bucket anyone currently occupies. Redemption starts here and walks down; a pool-wide rebalance sweep starts here too. The top of the ladder is where the protocol bites first.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · pool.getTopTick()`,
  verify: STATE_VERIFY,
});

const tickNodeInputs = (tick: number, sharesRaw: string, side: "debt" | "coll"): ProvInput[] => [
  {
    label: `tick ${tick} ${side} shares`,
    value: sharesRaw,
    kind: "chain",
    pclass: "state",
    note: `tickTreeData(tickData(${tick})).value · ${side === "debt" ? "high" : "low"} 128 bits`,
  },
  {
    label: side === "debt" ? "debt index" : "collateral index",
    kind: "chain",
    pclass: "state",
    note: "pool.getDebtAndCollateralIndex()",
  },
];

export const tickDebtProv = (label: string, address: string, tick: number, sharesRaw: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `fxUSD debt sitting in tick ${tick} of the ${label} — the tick's current tree node read from the pool's own storage (tickData → tickTreeData; the debt half of the node's packed value), converted through the debt index exactly as the pool converts it: shares × debtIndex ÷ 2^96. These node totals are the very operands the rebalance/liquidation engines consume, and their sum across the ladder is re-checked against the pool's total debt shares in integers on every read.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · tickTreeData value · debt shares × debtIndex ÷ 2^96`,
  formula: "debt shares × debtIndex ÷ 2^96",
  inputs: tickNodeInputs(tick, sharesRaw, "debt"),
  verify: STATE_VERIFY,
});

export const tickCollProv = (
  label: string,
  address: string,
  tick: number,
  sharesRaw: string,
  normalizedSym: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Collateral sitting in tick ${tick} of the ${label} — the collateral half of the tick node's packed value, converted through the collateral index exactly as the pool converts it: shares × 2^96 ÷ collIndex. NORMALIZED units (${normalizedSym}, 1e18). Note the division — the collateral index divides, which is funding.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · tickTreeData value · coll shares × 2^96 ÷ collIndex`,
  formula: "coll shares × 2^96 ÷ collIndex",
  inputs: tickNodeInputs(tick, sharesRaw, "coll"),
  verify: STATE_VERIFY,
});

export const tickRatioProv = (label: string, address: string, tick: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Tick ${tick}'s current debt ratio, judged the way the protocol's own engines judge a tick: raw debt × 1e36 ÷ (raw collateral × the oracle's MIN leg) — the exact comparison the rebalance and liquidation sweeps run (their code takes the min price; getLiquidatePrice IS the min leg). Deliberately NOT the anchor leg a position's stated ratio uses; the two judgments coexist in the protocol and are named apart here. Funding moves this ratio for every tick at once — the ladder drifts toward the rungs while every position stands still.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · derived ratio at the min leg`,
  formula: "tick raw debt × 1e36 ÷ (tick raw coll × min price)",
  inputs: [
    { label: "tick raw debt", kind: "chain-derived", pclass: "state", note: "node debt shares through the debt index" },
    { label: "tick raw coll", kind: "chain-derived", pclass: "state", note: "node coll shares through the coll index" },
    { label: "min price", kind: "chain", pclass: "oracle", note: "oracle.getPrice() min leg" },
  ],
  verify: STATE_VERIFY,
});

export const tickShareProv = (label: string, address: string, tick: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Tick ${tick}'s slice of the ${label}'s total fxUSD debt — the tick's raw debt over the pool's own getTotalRawDebts, both from this same pinned-block read.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · derived share`,
  formula: "tick raw debt ÷ getTotalRawDebts",
  verify: STATE_VERIFY,
});

// ── The reconciliation — the page's spine ────────────────────────────────────

export const ladderReconcileProv = (label: string, address: string, ok: boolean, tickCount: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: ok
    ? `The ladder accounts for every unit of debt: Σ debt shares across all ${tickCount} occupied ticks equals the ${label}'s own total debt shares EXACTLY, checked in raw integer share space before anything is scaled or rounded. This is the pool-level statement of the socialized lane: the position pages reconcile implied vs settled one position at a time; here the whole book reconciles tick by tick, from the same storage the engines operate on.`
    : `The ladder does NOT account for the ${label}'s debt on this read — Σ tick debt shares differs from the pool's total debt shares. Either a tick was missed by the bitmap sweep or the pool mutated between reads despite the block pin. The figures below stand, but this failed check is the headline.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · derived check (integer share space)`,
  formula: "Σ tickTreeData debt shares over the bitmap == getDebtAndCollateralShares().debtShares",
  inputs: [
    { label: "Σ tick debt shares", kind: "chain-derived", pclass: "state", note: "summed over every set bitmap bit" },
    { label: "total debt shares", kind: "chain", pclass: "state", note: "pool.getDebtAndCollateralShares()" },
  ],
  verify: STATE_VERIFY,
});

export const collOutsideLadderProv = (label: string, address: string, normalizedSym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Collateral sitting OUTSIDE the tick ladder in the ${label} — the pool's total collateral shares minus the sum over every occupied tick, converted through the collateral index (NORMALIZED ${normalizedSym}). A position with no debt belongs to no tick (its stored nodeId is 0), so its collateral is in the pool's total but on no rung. The gap is that bucket, stated rather than smoothed: debt reconciles to zero residual, collateral reconciles to exactly this.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · derived difference (integer share space, then ÷ collIndex)`,
  formula: "(total coll shares − Σ tick coll shares) × 2^96 ÷ collIndex",
  inputs: [
    { label: "total coll shares", kind: "chain", pclass: "state", note: "pool.getDebtAndCollateralShares()" },
    { label: "Σ tick coll shares", kind: "chain-derived", pclass: "state", note: "summed over every set bitmap bit" },
  ],
  verify: STATE_VERIFY,
});

export const dustTicksProv = (label: string, address: string, pastLiquidate: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Ticks below the protocol's own dust line in the ${label} — raw debt under 1e9 wei of fxUSD (10^-9 fxUSD), the exact threshold the rebalance and liquidation sweeps skip a tick at (redemption skips the same figure in debt shares). Their bits stay set in the bitmap because their debt is not zero, so they are counted here and included in the reconciliation${
    pastLiquidate > 0
      ? `; ${pastLiquidate} of them sit(s) past the liquidation rung and will simply never be cleared — not worth any keeper's transaction, which is itself a statement about how the engines work`
      : ""
  }. Excluded from the distribution drawing only, never from the arithmetic.`,
  contract: pool(label, address),
  via: `${SYSTEM_VIA} · derived count · raw debt < 1e9 wei (the engines' skip line)`,
  formula: "count of ticks with raw debt < MIN_DEBT (1e9)",
  verify: STATE_VERIFY,
});
