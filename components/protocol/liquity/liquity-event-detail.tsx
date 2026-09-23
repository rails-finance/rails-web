"use client";

import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { calculateInterestBetweenTransactions } from "@/lib/liquity/utils/interest-calculator";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { LinkedAddress } from "@/components/shared/linked-address";
import { usePreferences } from "@/lib/shared/preferences-context";
import { formatRatio, ratioLabel, useLiquityRatioColorClass } from "@/lib/shared/ratio-format";
import {
  TransitionArrow,
  DeltaToggle,
  ClosedLabel,
  StatCard,
  StateTransition,
} from "@/components/shared/state-transition";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import type { ReactNode } from "react";
import { Prov, type Provenance, type ProvVerify } from "@/components/shared/provenance";
import {
  streamVia,
  eventInputs,
  originSeg,
  scalingOf,
  fieldSumSeg,
  collChangeProv,
  debtChangeProv,
  rateAfterProv,
  upfrontFeeProv,
  eventPriceProv,
  TROVE_MANAGER,
  type ChangeProv,
  type FigureProv,
} from "@/lib/liquity/event-provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const tmContractOf = (addr?: string) => ({ name: "TroveManager", address: addr });

// Optional-prov wrapper — pass no prov → plain children (keeps metric bodies
// readable). <Prov> is zero-cost when the inspector is off. `value` threads
// the exact figure into the receipt key so other surfaces can echo it.
const P = ({
  info,
  value,
  icon,
  children,
}: {
  info?: Provenance;
  value?: string;
  icon?: ReactNode;
  children: ReactNode;
}) =>
  info ? (
    <Prov info={info} value={value} icon={icon}>
      {children}
    </Prov>
  ) : icon ? (
    <span className="inline-flex items-center gap-1">
      {children}
      {icon}
    </span>
  ) : (
    <>{children}</>
  );

// ── Formatters ──────────────────────────────────────────────────────

function toLocaleStringHelper(n: number): string {
  if (Math.abs(n) < 0.01) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatColl(n: number): string {
  if (n === 0) return "0";
  return n.toFixed(4);
}

function formatUsd(value: number | undefined | null): string {
  if (value == null || isNaN(value) || value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ── Metric components ───────────────────────────────────────────────

function DebtMetric({
  before,
  after,
  isClose,
  isLiquidation,
  upfrontFee,
  accruedInterest,
  accruedManagementFees,
  stablecoinSymbol = "BOLD",
  provBefore,
  provAfter,
  feeProv,
  changeEcho,
}: {
  before: number;
  after: number;
  isClose: boolean;
  isLiquidation: boolean;
  upfrontFee?: number;
  accruedInterest: number;
  accruedManagementFees: number;
  stablecoinSymbol?: string;
  provBefore?: Provenance;
  provAfter?: Provenance;
  /** Receipt for the "N fee" sub-line — the TroveOperation log's upfront fee. */
  feeProv?: FigureProv;
  changeEcho?: ChangeProv;
}) {
  const hasChange = isClose ? before !== after : before !== 0 && before !== after;
  const totalAccruedFees = accruedInterest + accruedManagementFees;

  // The arrow doubles as a toggle (see DeltaToggle). The header headline and
  // timeline spine both show the borrowed/repaid *principal*; the fee-inclusive
  // total debt change (principal + fee + interest = after − before) is the one
  // thing they don't surface, so clicking swaps `before →` for `+delta =`.
  // When the parent found it indistinguishable from the header's change figure
  // (changeEcho — no interest/redist separating them at display precision), it
  // ECHOES into that receipt so the locator pulse reaches it; otherwise it's a
  // genuinely different derived figure and carries its own (derived) provenance.
  const delta = after - before;
  const deltaStr = `${delta >= 0 ? "+" : "−"}${toLocaleStringHelper(Math.abs(delta))}`;
  const deltaProv: Provenance = {
    kind: "derived",
    summary: `Trove debt (${stablecoinSymbol}) change at this event — the debt after minus the debt before, including any interest and fee.`,
    via: "after − before",
    formula: "after debt − before debt",
  };
  const deltaNode = changeEcho ? (
    <Prov echo info={changeEcho.info} value={changeEcho.value} symbol={changeEcho.symbol}>
      {deltaStr}
    </Prov>
  ) : (
    <P info={deltaProv}>{deltaStr}</P>
  );

  return (
    <StatCard label="Debt">
      <div>
        <StateTransition>
          {hasChange && (
            <DeltaToggle
              before={<P info={provBefore}>{toLocaleStringHelper(before)}</P>}
              delta={isClose ? null : deltaNode}
            />
          )}
          {isClose ? (
            <>
              <ClosedLabel />
              <TokenChipIcon symbol={stablecoinSymbol} size={16} />
            </>
          ) : (
            <P info={provAfter} icon={<TokenChipIcon symbol={stablecoinSymbol} size={16} />}>
              <span className={hasChange ? "text-sm font-semibold" : "text-sm font-semibold text-rb-500"}>
                {toLocaleStringHelper(after)}
              </span>
            </P>
          )}
        </StateTransition>
        {((upfrontFee !== undefined && upfrontFee > 0) || totalAccruedFees > 0.01) && (
          <div className="text-xs  mt-0.5">
            {totalAccruedFees > 0.01 && <span>incl. +{totalAccruedFees.toFixed(2)} interest</span>}
            {upfrontFee !== undefined && upfrontFee > 0 && (
              <>
                {totalAccruedFees > 0.01 && <span> +</span>}
                <span>
                  <P info={feeProv?.info} value={feeProv?.value}>
                    {toLocaleStringHelper(upfrontFee)}
                  </P>{" "}
                  fee
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </StatCard>
  );
}

function CollateralMetric({
  collateralType,
  before,
  after,
  beforeInUsd,
  afterInUsd,
  isClose,
  isLiquidation,
  provBefore,
  provAfter,
  usdProvBefore,
  usdProvAfter,
  changeEcho,
}: {
  collateralType: string;
  before: number;
  after: number;
  beforeInUsd: number;
  afterInUsd: number;
  isClose: boolean;
  isLiquidation: boolean;
  provBefore?: Provenance;
  provAfter?: Provenance;
  usdProvBefore?: Provenance;
  usdProvAfter?: Provenance;
  changeEcho?: ChangeProv;
}) {
  const { showUsdValues } = useTimelineDisplay();
  const hasChange = isClose ? before !== after : before !== 0 && before !== after;

  // Same arrow-as-toggle as Debt: `before →` ⟷ `+delta =` (delta in collateral
  // units). Disabled on close, where the "after" is the CLOSED label, not a
  // number to diff against. Echoes the header's change receipt when the parent
  // found them indistinguishable (changeEcho); otherwise derived figure →
  // derived provenance.
  const collDelta = after - before;
  const collDeltaStr = `${collDelta >= 0 ? "+" : "−"}${formatColl(Math.abs(collDelta))}`;
  const deltaProv: Provenance = {
    kind: "derived",
    summary: `Collateral (${collateralType}) change at this event — the collateral after minus the collateral before.`,
    via: "after − before",
    formula: "after collateral − before collateral",
  };
  const deltaNode = changeEcho ? (
    <Prov echo info={changeEcho.info} value={changeEcho.value} symbol={changeEcho.symbol}>
      {collDeltaStr}
    </Prov>
  ) : (
    <P info={deltaProv}>{collDeltaStr}</P>
  );

  return (
    <StatCard label="Collateral">
      <StateTransition>
        {hasChange && (
          <DeltaToggle
            before={<P info={provBefore}>{formatColl(before)}</P>}
            delta={isClose ? null : deltaNode}
            beforeExtra={
              showUsdValues && isLiquidation && beforeInUsd > 0 ? (
                <P info={usdProvBefore}>
                  <span className="text-xs flex font-bold items-center text-rb-500 border-l-2 border-r-2 border-rb-500 rounded-sm px-1 py-0">
                    {formatUsd(beforeInUsd)}
                  </span>
                </P>
              ) : undefined
            }
          />
        )}
        {isClose ? (
          <>
            <ClosedLabel />
            <TokenChipIcon symbol={collateralType} size={16} />
          </>
        ) : (
          <P info={provAfter} icon={<TokenChipIcon symbol={collateralType} size={16} />}>
            <span className={hasChange ? "text-sm font-semibold" : "text-sm font-semibold text-rb-500"}>
              {after === 0 ? "0" : formatColl(after)}
            </span>
          </P>
        )}
        {showUsdValues && !isClose && after > 0 && (
          <P info={usdProvAfter}>
            <span className="text-xs flex font-bold items-center text-rb-500 border-l-2 border-r-2 border-rb-500 rounded-sm px-1 py-0">
              {formatUsd(afterInUsd)}
            </span>
          </P>
        )}
      </StateTransition>
    </StatCard>
  );
}

function InterestRateMetric({
  before,
  after,
  isClose,
  afterDebt,
  stablecoinSymbol = "BOLD",
  provBefore,
  provAfter,
  afterExact,
}: {
  before: number;
  after: number;
  isClose: boolean;
  afterDebt?: number;
  stablecoinSymbol?: string;
  provBefore?: Provenance;
  provAfter?: Provenance;
  /** Exact after-rate for the receipt key — the header's rate pills echo this
   *  receipt, and their display precision differs (the delegate pill is 2dp),
   *  so the key must not lean on the rendered text. */
  afterExact?: string;
}) {
  const hasBeforeValue = before > 0;
  const hasAfterValue = after > 0;
  const hasChange = hasBeforeValue && before !== after;
  // annualInterestRate is in percent units (3.4 = 3.4% APR), so divide by 100
  // to get the fractional rate for the BOLD/year cost.
  const yearlyCost = afterDebt && hasAfterValue ? afterDebt * (after / 100) : 0;

  return (
    <StatCard label="Interest Rate">
      <StateTransition>
        {hasChange && (
          <>
            <P info={provBefore}>
              <span className="text-sm font-semibold">
                {before.toFixed(1)}
                <span className="ml-0.5">%</span>
              </span>
            </P>
            <TransitionArrow />
          </>
        )}
        {isClose ? (
          <ClosedLabel />
        ) : !hasAfterValue ? (
          <span className="text-sm font-semibold text-rb-500">N/A</span>
        ) : (
          <P info={provAfter} value={afterExact}>
            <span className={hasChange ? "text-sm font-semibold" : "text-sm font-semibold text-rb-500"}>
              {after.toFixed(1)}
              <span className="ml-0.5">%</span>
            </span>
          </P>
        )}
      </StateTransition>
      {!isClose && yearlyCost > 0.01 && (
        <div className="text-xs  mt-0.5 tabular-nums">
          {toLocaleStringHelper(yearlyCost)} {stablecoinSymbol} / year
        </div>
      )}
    </StatCard>
  );
}

function CollateralRatioMetric({
  before,
  after,
  afterDebt,
  isClose,
  collateralType,
  provBefore,
  provAfter,
}: {
  before: number;
  after: number;
  afterDebt: number;
  isClose: boolean;
  collateralType: string;
  provBefore?: Provenance;
  provAfter?: Provenance;
}) {
  const { prefs } = usePreferences();
  const mode = prefs.ratioMode;
  const crColor = useLiquityRatioColorClass();
  const hasChange = before !== 0 && before !== after;

  // Delta in the displayed mode's own units (percentage points). CR is linear
  // so the delta is just after − before; LTV is 1/CR, so we diff the converted
  // values (`10000/cr`) rather than the raw CR. Disabled on close and when the
  // after side is N/A (debt fully repaid → no meaningful ratio to diff).
  const beforeDisp = mode === "ltv" ? 10000 / before : before;
  const afterDisp = mode === "ltv" ? 10000 / after : after;
  const ratioDelta = afterDisp - beforeDisp;
  const ratioDeltaStr = `${ratioDelta >= 0 ? "+" : "−"}${Math.abs(ratioDelta).toFixed(2)}%`;
  const ratioCanToggle = !isClose && afterDebt !== 0 && isFinite(afterDisp);
  const deltaProv: Provenance = {
    kind: "derived",
    summary: `${ratioLabel(mode)} change at this event, in percentage points — the ratio after minus the ratio before.`,
    via: "after − before",
    formula: mode === "ltv" ? "(10000 ÷ after) − (10000 ÷ before)" : "after − before",
  };

  return (
    <StatCard label={ratioLabel(mode)}>
      <StateTransition>
        {hasChange && (
          <DeltaToggle
            before={<P info={provBefore}>{formatRatio(before, mode, 2)}</P>}
            delta={ratioCanToggle ? <P info={deltaProv}>{ratioDeltaStr}</P> : null}
            beforeClass={`text-sm font-semibold ${crColor(before, collateralType)}`}
          />
        )}
        {isClose ? (
          <ClosedLabel />
        ) : afterDebt === 0 ? (
          <span className="text-sm font-semibold text-rb-500">N/A</span>
        ) : (
          <P info={provAfter}>
            <span
              className={
                hasChange
                  ? `text-sm font-semibold ${crColor(after, collateralType)}`
                  : "text-sm font-semibold text-rb-500"
              }
            >
              {formatRatio(after, mode, 2)}
            </span>
          </P>
        )}
      </StateTransition>
    </StatCard>
  );
}

// ── Main component ──────────────────────────────────────────────────

export interface LiquityEventDetailProps {
  ctx: LiquityContext;
  txHash: string;
  /** Block of the emitting event — threaded into the after-state provenance so
   *  the dock shows the concrete coordinates behind each decoded value. */
  blockNumber?: number;
  previousEvent?: BaseActivityEvent;
  currentEvent?: BaseActivityEvent;
  /** Live oracle price for this collateral — drives the "today" leg of the
   * redemption P/L shown alongside the historic price pill. */
  currentPrice?: number;
}

export function LiquityEventDetail({
  ctx,
  txHash,
  blockNumber,
  previousEvent,
  currentEvent,
  currentPrice,
}: LiquityEventDetailProps) {
  const { stateBefore, stateAfter, troveOperation, liquidation, redemption } = ctx;

  if (!stateBefore || !stateAfter) {
    return null;
  }

  const isClose = ctx.operation === "closeTrove";
  const isLiquidation = ctx.operation === "liquidate";
  const isRedemption =
    ctx.operation === "redeemCollateral" ||
    ctx.operation === "adjustZombieTrove" ||
    ctx.operation === "adjustUnredeemableZombieTrove";
  const isBatchManagerOp = ctx.operation === "setBatchManagerAnnualInterestRate";
  const collPrice = ctx.collateralPrice ?? 0;

  // Calculate accrued interest
  let accruedInterest = 0;
  let accruedManagementFees = 0;
  if (previousEvent && currentEvent) {
    const calc = calculateInterestBetweenTransactions(currentEvent, previousEvent);
    accruedInterest = calc.accruedInterest;
    accruedManagementFees = calc.accruedManagementFees;
  }

  // Upfront fee
  const upfrontFee = troveOperation?.debtIncreaseFromUpfrontFee;

  // Reconstruct before state
  let beforeDebt = stateBefore.debt;
  let beforeColl = stateBefore.coll;
  let beforeCollInUsd = stateBefore.collateralInUsd;
  let beforeInterestRate = stateBefore.annualInterestRate;
  let beforeCollRatio = stateBefore.collateralRatio;

  if (isClose && troveOperation && stateBefore.debt === 0 && stateBefore.coll === 0) {
    beforeDebt = Math.abs(troveOperation.debtChangeFromOperation);
    beforeColl = Math.abs(troveOperation.collChangeFromOperation);
    beforeCollInUsd = beforeColl * collPrice;
  }

  if (isLiquidation && liquidation) {
    beforeDebt = liquidation.debtOffsetBySP + liquidation.debtRedistributed;
    beforeColl =
      liquidation.collSentToSP +
      liquidation.collRedistributed +
      liquidation.collSurplus +
      liquidation.collGasCompensation;
    beforeCollInUsd = beforeColl * liquidation.price;
    if (beforeCollInUsd > 0 && beforeDebt > 0) {
      beforeCollRatio = (beforeCollInUsd / beforeDebt) * 100;
    }
  }

  if (isRedemption && troveOperation) {
    const debtChange = Math.abs(troveOperation.debtChangeFromOperation);
    const collChange = Math.abs(troveOperation.collChangeFromOperation);
    beforeDebt = stateAfter.debt + debtChange;
    beforeColl = stateAfter.coll + collChange;
    beforeCollInUsd = beforeColl * collPrice;
    if (beforeCollInUsd > 0 && beforeDebt > 0) {
      beforeCollRatio = (beforeCollInUsd / beforeDebt) * 100;
    }
  }

  const afterCollInUsd = stateAfter.coll * collPrice;

  // Derived-CR fallback: the API source fills collateralRatio; the chain source
  // leaves it 0 but sets collateralPrice, so recompute CR from price ONLY when
  // absent (fires solely on the chain source — API rows are unchanged).
  let afterCollRatio = stateAfter.collateralRatio;
  if (afterCollRatio === 0 && collPrice > 0 && stateAfter.debt > 0)
    afterCollRatio = (afterCollInUsd / stateAfter.debt) * 100;
  if (beforeCollRatio === 0 && collPrice > 0 && beforeColl > 0 && beforeDebt > 0)
    beforeCollRatio = ((beforeColl * collPrice) / beforeDebt) * 100;

  const showGrid = beforeDebt > 0 || stateAfter.debt > 0 || isClose;

  // ── Provenance ──────────────────────────────────────────────────────────────
  // The AFTER value is what this event records; the BEFORE value is the trove's
  // prior state — carried from the PREVIOUS transaction for a normal adjust, or
  // RECONSTRUCTED for events that only report the post-change state (redemption /
  // liquidation / close). So before and after get distinct provenance.
  const tm = TROVE_MANAGER[(ctx.collateralType ?? "").toLowerCase()];
  const tmContract = tmContractOf(tm);
  const collSym = ctx.collateralType;
  const debtSym = ctx.assetType ?? "BOLD";
  // Carries the concrete tx / block coordinates into the after-state provenance.
  const coords = { txHash, blockNumber };
  // Emitted log fields carry a real third-party proof: the tx's own event logs.
  // Point the spine's verify at Etherscan (a link-out, never a live read on our
  // side) instead of the generic "rolls up" default the context asset triggers.
  const txVerify: ProvVerify | undefined = txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;
  // The per-event price is the on-chain oracle value at THIS event's block: the
  // indexer reads the Chainlink feeds + LST canonical rates at the event block
  // (getOraclePricesAtBlock) and applies Liquity's own MIN/MAX-of-market-vs-
  // canonical math (calculateLiquityV2Prices). Every leaf is on-chain, so the
  // price — and the USD / ratio derived from it — is chain-derived, not an
  // off-chain quote. (On the live-chain source lane collPrice is 0, so these
  // gate out rather than assert an unpriced figure.)
  const priceInput =
    collPrice > 0
      ? [
          {
            label: "price",
            value: formatUsd(collPrice),
            kind: "chain-derived" as const,
            pclass: "oracle" as const,
            note: "on-chain oracle @ event block",
          },
        ]
      : [];
  const opCollChange = troveOperation ? Math.abs(troveOperation.collChangeFromOperation) : 0;
  const opDebtChange = troveOperation ? Math.abs(troveOperation.debtChangeFromOperation) : 0;
  const isCloseRecon = isClose && !!troveOperation && stateBefore.debt === 0 && stateBefore.coll === 0;

  // The delta toggle's `after − before` figure usually IS the header's change
  // figure — they only part when accrued interest (or a redistribution share)
  // wedges between them. When they agree to display precision (debt renders
  // 2dp, collateral 4dp), the delta ECHOES the header's change receipt so the
  // locator pulse reaches it; when they genuinely differ, it keeps its own
  // derived after − before receipt.
  const collCp = collChangeProv(ctx, coords);
  const debtCp = debtChangeProv(ctx, coords);
  const collDeltaEcho =
    collCp && Math.abs(Math.abs(stateAfter.coll - beforeColl) - Math.abs(collCp.change)) < 0.00005 ? collCp : undefined;
  const debtDeltaEcho =
    debtCp && Math.abs(Math.abs(stateAfter.debt - beforeDebt) - Math.abs(debtCp.change)) < 0.005 ? debtCp : undefined;

  const collAfterProv: Provenance = {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify,
    summary: `Collateral (${collSym}) held by the trove after this event — every time a trove changes, the TroveManager contract writes the trove's full ${collSym} balance into its log. This is that balance as it stood after this event.`,
    contract: tmContract,
    via: `${streamVia()} · ${originSeg(stateAfter.origin?.coll, {
      event: "TroveUpdated",
      param: "_coll",
      scale: 18,
      raw: stateAfter.raw?.coll,
    })}`,
    scaling: scalingOf(stateAfter.origin?.coll, { scale: 18, raw: stateAfter.raw?.coll }, { token: collSym }),
    inputs: eventInputs({ ...coords, asset: collSym }),
  };
  // A batched trove's debt is NOT one emitted field: it is shares/total × the
  // batch's recorded debt. The backend's origin{} says so by omission (an
  // envelope section with no debt entry); pre-envelope responses fall back to
  // the batch-shares signal. Either way the receipt drops the fake _debt claim.
  const batchedDebt = stateAfter.origin ? !stateAfter.origin.debt : stateAfter.batchDebtShares != null;
  // Same omission signal one event back: stateBefore.origin arrives only when
  // the MV knows the PREVIOUS event's batchedness (was_batched, mig 083) — an
  // origin section with no debt entry means the previous state was batched and
  // its debt share-derived. No origin at all (first event / pre-083 response)
  // keeps the plain-TroveUpdated fallback.
  const batchedDebtBefore = stateBefore.origin != null && !stateBefore.origin.debt;
  const debtAfterProv: Provenance = batchedDebt
    ? {
        kind: "chain-derived",
        pclass: "indexed",
        verify: txVerify,
        summary: `Trove debt (${debtSym}) after this event — this trove is in a delegate's batch, so the contract logs the trove's share of the batch and the batch's total debt. The trove's debt is that share of the total, including interest and any upfront fee.`,
        contract: tmContract,
        via: `${streamVia()} · BatchedTroveUpdated + BatchUpdated logs · _batchDebtShares ∕ total shares × batch debt · ÷10^18`,
        inputs: eventInputs({ ...coords, asset: debtSym }),
      }
    : {
        kind: "chain",
        pclass: "emitted",
        verify: txVerify,
        summary: `Trove debt (${debtSym}) after this event — every time a trove changes, the TroveManager contract writes the trove's full debt into its log. This is that figure after this event, including the interest built up since the last change and any upfront fee.`,
        contract: tmContract,
        via: `${streamVia()} · ${originSeg(stateAfter.origin?.debt, {
          event: "TroveUpdated",
          param: "_debt",
          scale: 18,
          raw: stateAfter.raw?.debt,
        })}`,
        scaling: scalingOf(stateAfter.origin?.debt, { scale: 18, raw: stateAfter.raw?.debt }, { token: debtSym }),
        inputs: eventInputs({ ...coords, asset: debtSym }),
      };
  // The after-rate, upfront-fee and historic-price receipts come from the
  // shared builders (event-provenance.ts): the header's rate pills echo the
  // rate receipt, so the identity must be built in one place.
  const rateP = rateAfterProv(ctx, coords);
  const feeP = upfrontFeeProv(ctx, coords);
  const priceP = eventPriceProv(ctx, coords);
  const collBeforeProv: Provenance =
    isRedemption && troveOperation
      ? {
          kind: "derived",
          summary:
            "Collateral before this redemption — the collateral left after the redemption plus the collateral redeemed.",
          formula: "collateral after + collateral redeemed",
          inputs: [
            {
              label: "collateral after",
              value: `${formatColl(stateAfter.coll)} ${collSym}`,
              kind: "chain",
              note: "this event",
            },
            {
              label: "collateral redeemed",
              value: `${formatColl(opCollChange)} ${collSym}`,
              kind: "chain",
              note: "operation Δ",
            },
          ],
        }
      : isLiquidation && liquidation
        ? {
            kind: "derived",
            summary:
              "Collateral before liquidation — the sum of where the liquidation sent it: the Stability Pool, other troves, the surplus the owner can claim, and the liquidator's gas compensation.",
            formula: "collSentToSP + collRedistributed + collSurplus + collGasComp",
            contract: tmContract,
            via: "Liquidation event",
          }
        : isCloseRecon
          ? {
              kind: "derived",
              summary:
                "Collateral before close — closing returns all of a trove's collateral, so this is the amount the close moved.",
              formula: "|operation collateral change|",
              contract: tmContract,
              via: "TroveOperation log",
            }
          : {
              kind: "chain",
              summary: `Collateral (${collSym}) before this event — the balance the contract logged at the trove's previous change.`,
              contract: tmContract,
              via: `${streamVia()} · ${originSeg(
                stateBefore.origin?.coll,
                { event: "TroveUpdated", param: "_coll", scale: 18, raw: stateBefore.raw?.coll },
                true,
              )}`,
              scaling: scalingOf(
                stateBefore.origin?.coll,
                { scale: 18, raw: stateBefore.raw?.coll },
                { token: collSym },
              ),
              inputs: [{ label: "asset", value: collSym, kind: "chain" }],
            };
  const debtBeforeProv: Provenance =
    isRedemption && troveOperation
      ? {
          kind: "derived",
          summary: "Debt before this redemption — the debt left after the redemption plus the debt redeemed.",
          formula: "debt after + debt redeemed",
          inputs: [
            {
              label: "debt after",
              value: `${toLocaleStringHelper(stateAfter.debt)} ${debtSym}`,
              kind: "chain",
              note: "this event",
            },
            {
              label: "debt redeemed",
              value: `${toLocaleStringHelper(opDebtChange)} ${debtSym}`,
              kind: "chain",
              note: "operation Δ",
            },
          ],
        }
      : isLiquidation && liquidation
        ? {
            kind: "derived",
            summary:
              "Debt before liquidation — the part the Stability Pool paid off plus the part shared out to other troves.",
            formula: "debtOffsetBySP + debtRedistributed",
            contract: tmContract,
            via: "Liquidation event",
          }
        : isCloseRecon
          ? {
              kind: "derived",
              summary:
                "Debt before close — closing repays all of a trove's debt, so this is the amount the close repaid.",
              formula: "|operation debt change|",
              contract: tmContract,
              via: "TroveOperation log",
            }
          : batchedDebtBefore
            ? {
                kind: "chain-derived",
                pclass: "indexed",
                summary: `Debt (${debtSym}) before this event — the trove's share of its delegate batch's total debt, as the contract logged it at the trove's previous change.`,
                contract: tmContract,
                via: `${streamVia()} · previous BatchedTroveUpdated + BatchUpdated logs · _batchDebtShares ∕ total shares × batch debt · ÷10^18`,
                inputs: [{ label: "asset", value: debtSym, kind: "chain" }],
              }
            : {
                kind: "chain",
                summary: `Debt (${debtSym}) before this event — the debt the contract logged at the trove's previous change.`,
                contract: tmContract,
                via: `${streamVia()} · ${originSeg(
                  stateBefore.origin?.debt,
                  { event: "TroveUpdated", param: "_debt", scale: 18, raw: stateBefore.raw?.debt },
                  true,
                )}`,
                scaling: scalingOf(
                  stateBefore.origin?.debt,
                  { scale: 18, raw: stateBefore.raw?.debt },
                  { token: debtSym },
                ),
                inputs: [{ label: "asset", value: debtSym, kind: "chain" }],
              };
  const rateBeforeProv: Provenance = {
    kind: "chain",
    summary: `Annual interest rate before this event — the rate the contract logged for the trove at its previous change.`,
    contract: tmContract,
    // A batched previous state's envelope names the batch's BatchUpdated —
    // the rate a batched trove actually accrues at.
    via: `${streamVia()} · ${originSeg(
      stateBefore.origin?.annualInterestRate,
      { event: "TroveUpdated", param: "_annualInterestRate", scale: 16, raw: stateBefore.raw?.annualInterestRate },
      true,
    )}`,
    scaling: scalingOf(
      stateBefore.origin?.annualInterestRate,
      { scale: 16, raw: stateBefore.raw?.annualInterestRate },
      "rate",
    ),
  };
  const usdAfterProv: Provenance | undefined =
    collPrice > 0
      ? {
          kind: "chain-derived",
          summary: `Collateral value (after) in USD — the collateral after this event, multiplied by Liquity's price for ${collSym} at this block.`,
          formula: "collateral × price",
          inputs: [
            {
              label: "collateral",
              value: `${toLocaleStringHelper(stateAfter.coll)} ${collSym}`,
              kind: "chain",
              note: "after",
            },
            ...priceInput,
          ],
        }
      : undefined;
  const usdBeforeProv: Provenance | undefined =
    collPrice > 0
      ? {
          kind: "chain-derived",
          summary: `Collateral value (before) in USD — the collateral before this event, multiplied by Liquity's price for ${collSym} at this block.`,
          formula: "collateral × price",
          inputs: [
            {
              label: "collateral",
              value: `${toLocaleStringHelper(beforeColl)} ${collSym}`,
              kind: "chain",
              note: "before",
            },
            ...priceInput,
          ],
        }
      : undefined;
  const crAfterProv: Provenance = {
    kind: "chain-derived",
    summary:
      "Collateral ratio after this event — the collateral's dollar value divided by the debt, at Liquity's price for this block.",
    formula: "collateral × price ÷ debt × 100",
    inputs: [
      {
        label: "collateral",
        value: `${toLocaleStringHelper(stateAfter.coll)} ${collSym}`,
        kind: "chain",
        note: "after",
      },
      ...priceInput,
      { label: "debt", value: `${toLocaleStringHelper(stateAfter.debt)} ${debtSym}`, kind: "chain", note: "after" },
    ],
  };
  const crBeforeProv: Provenance = {
    kind: "chain-derived",
    summary:
      "Collateral ratio before this event — the collateral's dollar value divided by the debt before this event, at Liquity's price for this block.",
    formula: "collateral × price ÷ debt × 100",
    inputs: [
      { label: "collateral", value: `${toLocaleStringHelper(beforeColl)} ${collSym}`, kind: "chain", note: "before" },
      ...priceInput,
      { label: "debt", value: `${toLocaleStringHelper(beforeDebt)} ${debtSym}`, kind: "chain", note: "before" },
    ],
  };
  const addrProv: Provenance = {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify,
    summary: "Redeemer — the wallet that made the redemption.",
    contract: tmContract,
    via: `${streamVia()} · redemption event`,
    inputs: eventInputs(coords),
  };

  return (
    <>
      {/* 2×2 State Grid — rails-web pattern */}
      {showGrid && (
        <div className="px-5 py-2">
          {isBatchManagerOp ? (
            <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-2">
              <InterestRateMetric
                before={beforeInterestRate}
                after={stateAfter.annualInterestRate}
                isClose={false}
                afterDebt={stateAfter.debt}
                stablecoinSymbol={ctx.assetType}
                provBefore={rateBeforeProv}
                provAfter={rateP?.info}
                afterExact={rateP?.value}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-2">
              <CollateralMetric
                collateralType={ctx.collateralType}
                before={beforeColl}
                after={stateAfter.coll}
                beforeInUsd={beforeCollInUsd}
                afterInUsd={afterCollInUsd}
                isClose={isClose}
                isLiquidation={isLiquidation}
                provBefore={collBeforeProv}
                provAfter={collAfterProv}
                usdProvBefore={usdBeforeProv}
                usdProvAfter={usdAfterProv}
                changeEcho={collDeltaEcho}
              />
              <DebtMetric
                before={beforeDebt}
                after={stateAfter.debt}
                isClose={isClose}
                isLiquidation={isLiquidation}
                upfrontFee={upfrontFee}
                accruedInterest={accruedInterest}
                accruedManagementFees={accruedManagementFees}
                stablecoinSymbol={ctx.assetType}
                provBefore={debtBeforeProv}
                provAfter={debtAfterProv}
                feeProv={feeP}
                changeEcho={debtDeltaEcho}
              />
              <CollateralRatioMetric
                before={beforeCollRatio}
                after={afterCollRatio}
                afterDebt={stateAfter.debt}
                isClose={isClose}
                collateralType={ctx.collateralType}
                provBefore={crBeforeProv}
                provAfter={crAfterProv}
              />
              <InterestRateMetric
                before={beforeInterestRate}
                after={stateAfter.annualInterestRate}
                isClose={isClose}
                afterDebt={stateAfter.debt}
                stablecoinSymbol={ctx.assetType}
                provBefore={rateBeforeProv}
                provAfter={rateP?.info}
                afterExact={rateP?.value}
              />
            </div>
          )}
        </div>
      )}

      {/* Redemption counterparty — claimable + P/L now live inline in the
          header; only the redeemer link remains here (when present). The
          redemption-wide totals and fee detail live in the explainer. */}
      {isRedemption && ctx.redeemer && (
        <div className="px-5 py-2">
          <span className="text-xs text-rb-500">
            Redeemed by:{" "}
            <Prov info={addrProv}>
              <LinkedAddress address={ctx.redeemer} />
            </Prov>
          </span>
        </div>
      )}

      {/* Liquidation breakdown intentionally lives only in the event footnote
          (explainer) now — the per-line detail (debt cleared, collateral
          liquidated, claimable surplus, SP/liquidator splits) is generated
          there by generateLiquidateItems, so it no longer appears in the
          details body. */}

      {/* Historic collateral price pill, sharing its row with the redemption
          P/L (net outcome) on the left. P/L reconciles with the Cleared /
          Reduced figures in the header: debt cleared minus the value of
          collateral given up, at the redemption-time price and (when
          available) at today's price. (Batch membership is conveyed by the
          "Delegate" treatment on interest-rate events, so no standalone
          "Batched" badge here.) */}
      {collPrice > 0 && (
        <div className="flex items-center gap-2 px-4 py-2">
          {ctx.operation === "redeemCollateral" &&
            (() => {
              const debtChange = troveOperation
                ? troveOperation.debtChangeFromOperation +
                  troveOperation.debtIncreaseFromRedist +
                  troveOperation.debtIncreaseFromUpfrontFee
                : stateAfter.debt - stateBefore.debt;
              const collChange = troveOperation
                ? troveOperation.collChangeFromOperation + troveOperation.collIncreaseFromRedist
                : stateAfter.coll - stateBefore.coll;
              const showClaimable = ctx.isZombieTrove && stateAfter.debt === 0 && stateAfter.coll > 0;
              const debtCleared = Math.abs(debtChange);
              const collLost = Math.abs(collChange);
              const plHistoric = debtCleared - collLost * collPrice;
              const plToday = currentPrice ? debtCleared - collLost * currentPrice : null;
              const showPl = debtCleared > 0.01;
              // Only surface "today" when it diverges from the historic figure.
              const showToday = plToday != null && Math.abs(plToday - plHistoric) > 0.01;
              const plStr = (n: number) => `${n >= 0 ? "+" : "−"}${formatUsd(Math.abs(n))}`;
              const plColor = (n: number) => (n >= 0 ? "text-green-400" : "text-red-400");
              if (!showClaimable && !showPl) return null;
              return (
                <div className="inline-flex items-center gap-4 flex-wrap text-xs">
                  {showClaimable && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-bold text-foreground">{stateAfter.coll.toFixed(4)}</span>
                      <TokenChipIcon symbol={ctx.collateralType} size={14} />
                      <span className="font-semibold text-green-600 dark:text-green-400">claimable</span>
                    </span>
                  )}
                  {showPl && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-rb-500">P/L</span>
                      <span className={`font-bold ${plColor(plHistoric)}`}>{plStr(plHistoric)}</span>
                      {showToday && (
                        <>
                          <span className="text-rb-500">or</span>
                          <span className={`font-bold ${plColor(plToday!)}`}>{plStr(plToday!)}</span>
                          <span className="text-rb-500">today</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })()}
          <span
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-rb-500 bg-background px-2 py-1 rounded-md"
            title={`${ctx.collateralType} price at the time of this event`}
          >
            <P info={priceP?.info} value={priceP?.value} icon={<TokenChipIcon symbol={ctx.collateralType} size={14} />}>
              {formatUsd(collPrice)}
            </P>
          </span>
        </div>
      )}
    </>
  );
}
