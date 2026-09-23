// Asymmetry trove timeline — the `api` arm's presentation transform (chain-state tier).
// ----------------------------------------------------------------------------
// rails-server returns the raw mv_asymmetry_events rows for one (branch, troveId) — the
// Trove's absolute before/after collateral + USDaf debt, the on-chain actor/action,
// and the batched flag. This transform maps each to a BaseActivityEvent + AsymmetryContext
// the chain-state cards consume. Collateral scales by the branch's decimals (uniform
// 18 across every Asymmetry branch); USDaf debt is always 1e18. After-values are directly emitted; the
// deltas are after − before (chain-derived).
//
// SERVER-ONLY — imported from the /api/asymmetry/* route handlers.

import type {
  BaseActivityEvent,
  AssetFlow,
  AsymmetryContext,
  AsymmetryEventType,
  OriginEnvelope,
  LiquityForkOperationFacts,
  LiquityForkRedemptionFacts,
} from "@/lib/shared/types/event-shape";
import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import {
  resolveBranch,
  DEBT_SYMBOL,
  DEBT_ADDRESS,
  DEBT_DECIMALS,
  ASYMMETRY_BRANCHES,
} from "@/lib/asymmetry/asset-catalog";
import {
  classifyTroveAdjust,
  forkAdjustLabel,
  forkRateChangeLabel,
  FORK_DEBT_DUST,
} from "@/lib/shared/liquity-fork-ops";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface AsymmetryTimelineResult {
  collateralType: string;
  troveId: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — which is the answer
   *  whenever `recent` was not asked for, and also when the Trove holds fewer
   *  events than the window. */
  cutoffBlock?: number | null;
}

/** One row of mv_asymmetry_events, exactly as the rails timeline route projects it.
 *  numeric/bigint columns arrive as strings from pg. */
export interface MvRow {
  block_timestamp: string;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  collateral: string;
  trove_id: string;
  action: string;
  is_batched: boolean;
  /** The interest-batch manager this Trove was delegated to at this event (mig
   *  153) — lowercase 0x address, straight off the row's own
   *  BatchedTroveUpdated._interestBatchManager. Non-NULL exactly iff
   *  is_batched; absent on pre-migration responses. */
  batch_manager?: string | null;
  /** The PREVIOUS event's batchedness (mig 085) — NULL for the Trove's first
   *  event; absent on pre-migration responses. */
  was_batched?: boolean | null;
  coll_after: string | null;
  debt_after: string | null;
  coll_before: string | null;
  debt_before: string | null;
  stake: string | null;
  annual_interest_rate: string | null;
  /** The branch's own collateral price at the event's block
   *  (PriceFeed.lastGoodPrice, mig 113) — non-NULL only on priced
   *  liquidation/redemption blocks; absent on pre-migration responses. */
  price_usd?: string | null;
  price_source?: string | null;
  /** TroveOperation's account of WHY this event's balances moved — NULL where
   *  no operation row matched the event, absent on pre-migration responses (mig 169).
   *  The debt legs are USDaf (18); the collateral legs are in the branch's own
   *  units, which every Asymmetry branch sets to 18. */
  debt_change_from_operation?: string | null;
  debt_increase_from_upfront_fee?: string | null;
  debt_increase_from_redist?: string | null;
  coll_change_from_operation?: string | null;
  coll_increase_from_redist?: string | null;
  /** The branch-wide redemption this event was one Trove's slice of — all NULL
   *  off a redeemCollateral row, absent on pre-migration responses (mig 169).
   *  `redemption_fee_coll` is this Trove's own keep; the rest describe the whole
   *  act. Asymmetry is redeemed against constantly (tens of thousands of rows),
   *  so this join is the busiest thing on the timeline. */
  redemption_fee_coll?: string | null;
  redemption_attempted?: string | null;
  redemption_actual?: string | null;
  redemption_coll_sent?: string | null;
  redemption_branch_price?: string | null;
  /** The `_redemptionPrice` leg. The transform reads `redemption_branch_price`
   *  alone and ignores this one; it is declared so that a deployment where the
   *  two diverge shows up as a column nobody reads rather than a silent
   *  substitution. */
  redemption_price_used?: string | null;
}

const LABELS: Record<AsymmetryEventType, string> = {
  openTrove: "Open Trove",
  closeTrove: "Close Trove",
  adjustTrove: "Adjust Trove",
  adjustTroveInterestRate: "Adjust Interest Rate",
  applyPendingDebt: "Apply Pending Debt",
  liquidate: "Liquidation",
  redeemCollateral: "Redemption",
  openTroveAndJoinBatch: "Open Trove + Join Batch",
  setInterestBatchManager: "Set Batch Manager",
  removeFromBatch: "Remove From Batch",
};

const ZERO = BigInt(0);
const RATE_DECIMALS = 16; // annual_interest_rate is 1e18-scaled ratio → 1e16 = 1%
// The debt-movement epsilon (≈ $0.01 for the 18-decimal USDaf) is hoisted to the
// shared fork ops as FORK_DEBT_DUST, so the no-change predicate below and the
// derived header verb share ONE definition.

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string (trims trailing zeros). */
function fmtUnits(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Origin envelope for a value that IS one decoded log param — {event, param,
 *  raw, scale}, declared HERE beside the MV-row mapping so the claim can't
 *  drift (mirrors the reference lane's rails-server stamping; the fork route
 *  ships raw MV rows, so the envelope is built in this transform instead).
 *  The raw string passes through untouched — never rebuilt from scaled floats.
 *  Undefined when the column is NULL; derived values get NO envelope. */
function originVal(event: string, param: string, scale: number, v: string | null): OriginEnvelope | undefined {
  if (v == null || v === "") return undefined;
  return { event, param, raw: String(v).split(".")[0], scale };
}

/** The at-block PriceFeed figure → ctx shape; undefined keeps the event
 *  token-only (unpriced block, or a plain trove op the filler never targets). */
function priceOf(
  usd: string | null | undefined,
  source: string | null | undefined,
): { usd: number; source: "pricefeed-lastgoodprice" } | undefined {
  if (usd == null || source !== "pricefeed-lastgoodprice") return undefined;
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? { usd: n, source } : undefined;
}

/** The TroveOperation decomposition → ctx shape. Undefined when the MV carried
 *  no operation row for this event (the same absence tx_from already shows) —
 *  "no decomposition captured" is a different claim from "a decomposition of
 *  zero", and the explainer says a different thing to each.
 *
 *  `accruedInterest` is the residual of the identity the columns satisfy:
 *      debtAfter − debtBefore = fromOperation + upfrontFee + fromRedist + interest
 *  It is computed for REGULAR rows only. A batched Trove's after-debt is derived
 *  from batch shares rather than emitted, so its residual would carry
 *  share-rounding as well as interest, and withholding it is the correct read.
 *  Sub-dust residuals are dropped too — an interest figure of 0.000003 USDaf is
 *  noise, and stating it would put a number on the card no reader can use.
 *
 *  `collDecimals` comes from the branch rather than a constant. Asymmetry's are
 *  uniformly 18 today, including the BTC branches (wrapped up from 8), but the
 *  scale belongs to the branch and reading it there keeps a future 8-decimal
 *  branch correct on arrival. */
function operationOf(
  r: MvRow,
  debtDelta: bigint,
  isBatched: boolean,
  collDecimals: number,
): LiquityForkOperationFacts | undefined {
  if (r.debt_change_from_operation == null && r.debt_increase_from_upfront_fee == null) return undefined;
  const fromOp = bigintOf(r.debt_change_from_operation ?? null);
  const fee = bigintOf(r.debt_increase_from_upfront_fee ?? null);
  const redist = bigintOf(r.debt_increase_from_redist ?? null);
  const residual = debtDelta - fromOp - fee - redist;
  return {
    debtFromOperation: fmtUnits(fromOp, DEBT_DECIMALS),
    debtUpfrontFee: fmtUnits(fee, DEBT_DECIMALS),
    debtFromRedist: fmtUnits(redist, DEBT_DECIMALS),
    collFromOperation: fmtUnits(bigintOf(r.coll_change_from_operation ?? null), collDecimals),
    collFromRedist: fmtUnits(bigintOf(r.coll_increase_from_redist ?? null), collDecimals),
    ...(!isBatched && residual > FORK_DEBT_DUST ? { accruedInterest: fmtUnits(residual, DEBT_DECIMALS) } : {}),
  };
}

/** The redemption facts → ctx shape. Undefined off a redemption row. Both
 *  `feeKeptColl` and `collSent` are collateral, so they take the branch's
 *  decimals rather than the debt token's. */
function redemptionOf(r: MvRow, collDecimals: number): LiquityForkRedemptionFacts | undefined {
  if (r.redemption_actual == null) return undefined;
  return {
    feeKeptColl: fmtUnits(bigintOf(r.redemption_fee_coll ?? null), collDecimals),
    attempted: fmtUnits(bigintOf(r.redemption_attempted ?? null), DEBT_DECIMALS),
    actual: fmtUnits(bigintOf(r.redemption_actual ?? null), DEBT_DECIMALS),
    collSent: fmtUnits(bigintOf(r.redemption_coll_sent ?? null), collDecimals),
  };
}

/** The price the branch acted at, preferring the figure the protocol EMITTED.
 *
 *  A Redemption log carries `_price` in the same event as the act, so on a
 *  redemption row nothing needs re-reading: that leaf is stronger provenance
 *  than the archive-node re-read behind mig 113. On Asymmetry that upgrade
 *  covers nearly the whole timeline — redemptions are the dominant event and
 *  the branches have never been liquidated — but the filler's figure stays the
 *  fallback for the first liquidation block that does arrive. */
function forkPriceOf(
  r: MvRow,
  collDecimals: number,
): { usd: number; source: "pricefeed-lastgoodprice" | "redemption-event-price" } | undefined {
  if (r.redemption_branch_price != null) {
    // The Liquity-fork price scale is 1e(36 − collateral decimals). Every
    // Asymmetry branch is 18, so this divides by 1e18 today — but it is read off
    // the branch, not written as a constant, because the same expression has to
    // stay right for a branch that isn't.
    const n = Number(fmtUnits(bigintOf(r.redemption_branch_price), 36 - collDecimals));
    if (Number.isFinite(n) && n > 0) return { usd: n, source: "redemption-event-price" };
  }
  return priceOf(r.price_usd, r.price_source);
}

function flowFor(token: string, symbol: string, decimals: number, raw: bigint, direction: "in" | "out"): AssetFlow {
  const mag = raw < ZERO ? -raw : raw;
  return {
    token,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    amount: mag.toString(),
    amountFormatted: Number(fmtUnits(mag, decimals)),
    direction,
  };
}

/** Transform raw mv_asymmetry_events rows → { collateralType, troveId, events, totalEvents }. */
export function buildAsymmetryTimeline(
  rows: MvRow[],
  collateralType: string,
  troveId: string,
): AsymmetryTimelineResult {
  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const block = Number(r.block_number);
    const ts = Number(r.block_timestamp);
    const kind = r.action as AsymmetryEventType;
    const branch = resolveBranch(r.collateral) ?? ASYMMETRY_BRANCHES.ysybold;
    const collDec = branch.decimals;

    const collAfter = bigintOf(r.coll_after);
    const debtAfter = bigintOf(r.debt_after);
    const collBefore = bigintOf(r.coll_before);
    const debtBefore = bigintOf(r.debt_before);
    const collDelta = collAfter - collBefore;
    const debtDelta = debtAfter - debtBefore;

    // The previous event's rate — the join only this transform can see, so the
    // header can name a rate move's DIRECTION (Increase / Decrease).
    const prevRate = idx > 0 ? rows[idx - 1].annual_interest_rate : null;
    const rateBefore = prevRate != null ? fmtUnits(bigintOf(prevRate), RATE_DECIMALS) : undefined;

    const ctx: AsymmetryContext = {
      eventType: kind,
      collateralSymbol: branch.symbol,
      collDelta: fmtUnits(collDelta, collDec),
      debtDelta: fmtUnits(debtDelta, DEBT_DECIMALS),
      collAfter: fmtUnits(collAfter, collDec),
      debtAfter: fmtUnits(debtAfter, DEBT_DECIMALS),
      collBefore: fmtUnits(collBefore, collDec),
      debtBefore: fmtUnits(debtBefore, DEBT_DECIMALS),
      interestRate:
        r.annual_interest_rate != null ? fmtUnits(bigintOf(r.annual_interest_rate), RATE_DECIMALS) : undefined,
      rateBefore,
      isBatched: r.is_batched,
      batchManager: r.batch_manager ?? undefined,
      isOpen: idx === 0,
      ...(kind === "liquidate" || kind === "redeemCollateral" ? { priceAtBlock: forkPriceOf(r, collDec) } : {}),
      // Why the balances moved, and — on a redemption — the branch-wide act
      // this Trove was a slice of. Both undefined where the read path does not
      // carry the columns, which is what a pre-migration response looks like.
      operation: operationOf(r, debtDelta, r.is_batched, collDec),
      redemption: kind === "redeemCollateral" ? redemptionOf(r, collDec) : undefined,
      // Mirrors mig 071's two arms. Batched rows: coll comes off the trove's
      // own BatchedTroveUpdated, the rate off the batch's BatchUpdated, and
      // the debt is shares/total × batch debt — derived, so NO envelope.
      // Regular rows: all three are TroveUpdated params.
      origin: r.is_batched
        ? {
            coll: originVal("BatchedTroveUpdated", "_coll", collDec, r.coll_after),
            annualInterestRate: originVal("BatchUpdated", "_annualInterestRate", RATE_DECIMALS, r.annual_interest_rate),
          }
        : {
            debt: originVal("TroveUpdated", "_debt", DEBT_DECIMALS, r.debt_after),
            coll: originVal("TroveUpdated", "_coll", collDec, r.coll_after),
            annualInterestRate: originVal("TroveUpdated", "_annualInterestRate", RATE_DECIMALS, r.annual_interest_rate),
          },
      // The same arms one event back, keyed on the PREVIOUS event's
      // batchedness (was_batched). NULL/absent (first event, or a
      // pre-migration response) = no claim at all. The before-rate has no
      // per-row raw on this MV, so its envelope is omitted rather than
      // fabricated.
      originBefore:
        r.was_batched == null
          ? undefined
          : r.was_batched
            ? {
                coll: originVal("BatchedTroveUpdated", "_coll", collDec, r.coll_before),
              }
            : {
                debt: originVal("TroveUpdated", "_debt", DEBT_DECIMALS, r.debt_before),
                coll: originVal("TroveUpdated", "_coll", collDec, r.coll_before),
              },
    };

    // Zero-delta adjust: automated managers re-try operations the protocol
    // clamps to nothing (typically a repay against a trove at the minimum debt
    // floor, capped to accrued-interest dust). Collateral must be exactly zero
    // — the BTC branches make a native-unit epsilon unsafe — and the debt delta
    // below the 0.01 display epsilon. Labelling these "Adjust Trove" would
    // claim a change that never happened; a distinct actionType gives the
    // filter its own (demoted) bucket.
    const absDebtDelta = debtDelta < ZERO ? -debtDelta : debtDelta;
    const isNoChange = kind === "adjustTrove" && collDelta === ZERO && absDebtDelta < FORK_DEBT_DUST;

    // Derive the verb where the event type underdetermines it (mirrors
    // fx-timeline). AFTER the isNoChange check — a run's summed dust can exceed
    // the epsilon, so a no-change row must never take an adjust verb. Deriving
    // here (not in the header) keeps the CSV Action column in step with the card,
    // and the rate-direction verb needs the previous event's rate, which only
    // this transform can see. The static map is the fallback.
    const actionLabel = isNoChange
      ? "No change"
      : kind === "adjustTrove"
        ? (forkAdjustLabel(classifyTroveAdjust({ collDelta, debtDelta })) ?? LABELS[kind])
        : kind === "adjustTroveInterestRate"
          ? forkRateChangeLabel(rateBefore, ctx.interestRate, r.is_batched)
          : (LABELS[kind] ?? kind);

    // Spine flows: branch collateral + USDaf debt, signed by which way each moved.
    // "out" = leaves the wallet toward the protocol (collateral deposit / debt repay);
    // "in" = comes to the wallet (collateral withdraw / debt draw).
    const flows: AssetFlow[] = [];
    if (collDelta !== ZERO)
      flows.push(flowFor(branch.collateralAddr, branch.symbol, collDec, collDelta, collDelta > ZERO ? "out" : "in"));
    if (debtDelta !== ZERO)
      flows.push(flowFor(DEBT_ADDRESS, DEBT_SYMBOL, DEBT_DECIMALS, debtDelta, debtDelta > ZERO ? "in" : "out"));

    return {
      id: `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: block,
      timestamp: ts,
      wallet: r.tx_from ?? "",
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      actionType: isNoChange ? "adjustTrove_noChange" : kind,
      actionLabel,
      flows,
      context: { protocol: "asymmetry", data: ctx },
    };
  });

  return { collateralType, troveId, events, totalEvents: events.length };
}
