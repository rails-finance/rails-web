"use client";

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { EventTime } from "@/components/shared/event-time";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { getBatchManagerName } from "@/lib/liquity/batch-managers";
import { TROVE_DELTA_EPSILON } from "@/lib/liquity/trove-ops";
import { usePreferences } from "@/lib/shared/preferences-context";
import { formatRatio, ratioLabelShort, useLiquityRatioColorClass } from "@/lib/shared/ratio-format";
import { useHeaderValueHideClass, fmtHeaderMagnitude } from "@/lib/shared/header-values";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Prov } from "@/components/shared/provenance";
import { formatUsd } from "@/lib/shared/format-event";
import { collChangeProv, debtChangeProv, rateAfterProv } from "@/lib/liquity/event-provenance";
// The rate pills live in the shared module now (the two Liquity forks render the
// identical pill through the chain-state row's rate-pill seam). Re-export
// UsersGlyph — the V2 trove page imports it from HERE (page.tsx), and that
// import should not churn.
import { UsersGlyph, RatePill, DelegateRatePill } from "@/components/shared/rate-pill";
export { UsersGlyph };

type OperationStyle = { label: string; color: string; bg: string; badge: boolean };

function getOperationStyle(operation: string, ctx?: LiquityContext): OperationStyle {
  switch (operation) {
    case "openTrove":
    case "openTroveAndJoinBatch":
      // Soft-tint pill matching the Aave V4 "Enable" header badge — the two
      // "you opened a position" actions now share one visual grammar, on the
      // semantic `positive` token (color-grammar.md §5: the Open/active green).
      return { label: "Open", color: "text-positive", bg: "bg-positive/20", badge: true };
    case "closeTrove":
      return { label: "Close", color: "", bg: "bg-rb-500/20 dark:bg-rb-500/20", badge: true };
    case "liquidate":
      return { label: "Liquidated", color: "text-foreground", bg: "bg-rb-200 dark:bg-rb-800", badge: true };
    case "adjustTrove": {
      // Server-collapsed run of zero-delta touches — one row stands in for
      // the whole stretch, so the label carries the count. Checked before the
      // delta splits: a run's SUMMED dust can exceed the display epsilon.
      if (ctx?.noChangeRun) {
        return {
          label: `No change ×${ctx.noChangeRun.count.toLocaleString("en-US")}`,
          color: "",
          bg: "",
          badge: false,
        };
      }
      if (ctx?.troveOperation) {
        const debtOp = ctx.troveOperation.debtChangeFromOperation;
        const collOp = ctx.troveOperation.collChangeFromOperation;
        const hasDebt = Math.abs(debtOp) >= TROVE_DELTA_EPSILON;
        const hasColl = Math.abs(collOp) >= TROVE_DELTA_EPSILON;
        // Zero-delta touch (bot keep-alive): nothing moved, so "Adjust" would
        // claim a change that never happened.
        if (!hasDebt && !hasColl) {
          return { label: "No change", color: "", bg: "", badge: false };
        }
        if (hasDebt && !hasColl) {
          return debtOp > 0
            ? { label: "Borrow", color: "", bg: "", badge: false }
            : { label: "Repay", color: "", bg: "", badge: false };
        }
        if (hasColl && !hasDebt) {
          return collOp > 0
            ? { label: "Add", color: "", bg: "", badge: false }
            : { label: "Withdraw", color: "", bg: "", badge: false };
        }
        // Combined: show both actions
        if (hasColl && hasDebt) {
          const collLabel = collOp > 0 ? "Add" : "Withdraw";
          const debtLabel = debtOp > 0 ? "Borrow" : "Repay";
          return { label: `${collLabel} + ${debtLabel}`, color: "", bg: "", badge: false };
        }
      }
      return { label: "Adjust", color: "", bg: "", badge: false };
    }
    case "adjustTroveInterestRate": {
      if (ctx?.stateBefore && ctx?.stateAfter) {
        return ctx.stateAfter.annualInterestRate > ctx.stateBefore.annualInterestRate
          ? { label: "Increase interest rate", color: "", bg: "", badge: false }
          : { label: "Decrease interest rate", color: "", bg: "", badge: false };
      }
      return { label: "Rate change", color: "", bg: "", badge: false };
    }
    case "applyPendingDebt":
      return { label: "Apply debt", color: "text-pink-700 dark:text-pink-400", bg: "bg-pink-500/20", badge: true };
    case "redeemCollateral":
      return { label: "Redemption", color: "text-white", bg: "bg-caution-500", badge: true };
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return { label: "Redeemed", color: "text-foreground", bg: "bg-rb-200 dark:bg-rb-800", badge: true };
    case "setInterestBatchManager":
      return { label: "Delegate", color: "", bg: "", badge: false };
    case "removeFromBatch":
      return { label: "Leave delegate", color: "", bg: "", badge: false };
    case "transferTrove":
      return { label: "Transfer", color: "", bg: "", badge: false };
    case "setBatchManagerAnnualInterestRate":
      return { label: "Interest rate", color: "", bg: "", badge: false };
    default:
      return { label: operation, color: "", bg: "", badge: false };
  }
}

function formatNumber(n: number): string {
  if (Math.abs(n) < 0.01) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Actor role (owner / redeemer / liquidator / batch_manager) is still threaded
// through ctx.actorRole — the bars provider and other downstream logic depend
// on it — but the trove view no longer renders a pill for it; the row's
// operation badge already conveys whether the wallet is acting on its own
// position or a third-party one.

export interface LiquityEventHeaderProps {
  ctx: LiquityContext;
  timestamp: number;
  protocolId?: string;
  /** Tx + block of the emitting event — threaded into the collateral / debt
   *  provenance so the dock shows the concrete coordinates (copyable tx, block)
   *  behind each moved amount. */
  txHash?: string;
  blockNumber?: number;
  /** 1-based chronological position of this event in the trove timeline.
   * Stable regardless of asc/desc display order — event #1 is always the
   * trove's openTrove. */
  eventNumber?: number;
}

export function LiquityEventHeader({ ctx, timestamp, txHash, blockNumber, eventNumber }: LiquityEventHeaderProps) {
  const style = getOperationStyle(ctx.operation, ctx);
  const { stateBefore, stateAfter, troveOperation } = ctx;
  const { showTimestamps, showEventNumbers, showCollateralRatio } = useTimelineDisplay();
  const { prefs } = usePreferences();
  const ratioMode = prefs.ratioMode;
  const crColor = useLiquityRatioColorClass();

  const groupChip = ctx.blockGrouping?.isGrouped ? (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-sunken text-rb-500"
      title={`Operation ${ctx.blockGrouping.sameBlockIndex} of ${ctx.blockGrouping.sameBlockCount} in this transaction`}
    >
      {ctx.blockGrouping.sameBlockIndex} of {ctx.blockGrouping.sameBlockCount}
    </span>
  ) : null;

  const counter =
    eventNumber != null && showEventNumbers ? (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] bg-sunken text-rb-500"
        aria-label={`Event ${eventNumber}`}
        data-prov-exempt=""
      >
        {eventNumber}
      </span>
    ) : null;

  if (!stateAfter || !stateBefore) {
    return (
      <div className="flex items-center gap-2">
        {style.badge ? (
          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${style.bg} ${style.color}`}>
            {style.label}
          </span>
        ) : (
          <span className={`text-sm font-medium ${style.color || "text-rb-500"}`}>{style.label}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          {groupChip}
          {showTimestamps && (
            <span className="text-xs ">
              {new Date(timestamp * 1000).toLocaleDateString("en-GB", { timeZone: "UTC" })}
            </span>
          )}
          {counter}
        </span>
      </div>
    );
  }

  // The change receipts are built by the shared builders (event-provenance.ts)
  // so the spine flanking value and the detail's delta toggle can echo into the
  // SAME receipt — one identity, every rendering pulses together.
  const coords = { txHash, blockNumber };
  const collCp = collChangeProv(ctx, coords);
  const debtCp = debtChangeProv(ctx, coords);
  // The rate pills echo the detail grid's after-rate receipt (same builder).
  const rateP = rateAfterProv(ctx, coords);
  const debtChange = debtCp?.change ?? 0;
  const collChange = collCp?.change ?? 0;

  const hasDebtChange = Math.abs(debtChange) >= 0.01;
  const hasCollChange = Math.abs(collChange) >= 0.01;
  const PASSIVE_OPS = new Set([
    "liquidate",
    "redeemCollateral",
    "applyPendingDebt",
    "adjustZombieTrove",
    "adjustUnredeemableZombieTrove",
  ]);
  const hideVal = useHeaderValueHideClass({ isPassive: PASSIVE_OPS.has(ctx.operation) });

  // ── Provenance threading (zero-cost when the inspector is off) ──────────────
  // Chain deltas point at the branch TroveManager (via the shared builders
  // above); the per-event CR is derived from the price at this event's block.
  const collSym = ctx.collateralType ?? "collateral";
  const debtSym = ctx.assetType ?? "BOLD";
  // The header renders the compact form; the exact figure — every decimal
  // the pipeline delivered, no re-rounding — rides the trace. The ≥sm
  // spine hand-off (hideVal) lands on the Prov wrapper itself: hiding a
  // CHILD would leave the pill box painting an empty lozenge when the
  // receipt opens with timeline values on.
  const wrapColl = (node: ReactNode) =>
    collCp ? (
      <Prov value={collCp.value} symbol={collCp.symbol} info={collCp.info} className={hideVal || undefined}>
        {node}
      </Prov>
    ) : hideVal ? (
      <span className={hideVal}>{node}</span>
    ) : (
      <>{node}</>
    );
  const wrapDebt = (node: ReactNode) =>
    debtCp ? (
      <Prov value={debtCp.value} symbol={debtCp.symbol} info={debtCp.info} className={hideVal || undefined}>
        {node}
      </Prov>
    ) : hideVal ? (
      <span className={hideVal}>{node}</span>
    ) : (
      <>{node}</>
    );
  const eventPrice = ctx.collateralPrice ?? 0;
  const derivedCr =
    stateAfter.collateralRatio === 0 && eventPrice > 0 && stateAfter.debt > 0
      ? ((stateAfter.coll * eventPrice) / stateAfter.debt) * 100
      : 0;
  const crShown = stateAfter.collateralRatio > 0 ? stateAfter.collateralRatio : derivedCr;
  const crIsDerived = stateAfter.collateralRatio === 0 && derivedCr > 0;
  const wrapCr = (node: ReactNode) =>
    crIsDerived ? (
      <Prov
        info={{
          kind: "chain-derived",
          summary:
            "Collateral ratio at this event — the collateral's dollar value divided by the debt, at Liquity's price for this block.",
          formula: "collateral × price ÷ debt × 100",
          inputs: [
            {
              label: "collateral",
              value: `${formatNumber(stateAfter.coll)} ${collSym}`,
              kind: "chain",
              note: "from log",
            },
            {
              label: "price",
              value: formatUsd(eventPrice),
              kind: "chain-derived",
              pclass: "oracle",
              note: "on-chain oracle @ event block",
            },
            { label: "debt", value: `${formatNumber(stateAfter.debt)} ${debtSym}`, kind: "chain", note: "from log" },
            ...(blockNumber != null
              ? [{ label: "block", value: String(blockNumber), kind: "chain" as const, note: "event block" }]
              : []),
          ],
        }}
      >
        {node}
      </Prov>
    ) : (
      node
    );

  return (
    <>
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ctx.operation === "setBatchManagerAnnualInterestRate" && stateAfter ? (
            <>
              <DelegateRatePill rate={stateAfter.annualInterestRate} prov={rateP} />
              {ctx.batchManager && (
                <span className="text-sm font-bold text-pink-500">{getBatchManagerName(ctx.batchManager)}</span>
              )}
            </>
          ) : ctx.operation === "setInterestBatchManager" ? (
            <>
              <span className="text-sm text-rb-500">{style.label}</span>
              {stateAfter.annualInterestRate > 0 && (
                <DelegateRatePill rate={stateAfter.annualInterestRate} prov={rateP} />
              )}
              {ctx.batchManager && (
                <span className="text-sm font-bold text-pink-500">{getBatchManagerName(ctx.batchManager)}</span>
              )}
            </>
          ) : ctx.operation === "openTrove" || ctx.operation === "openTroveAndJoinBatch" ? (
            <>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${style.bg} ${style.color}`}>
                {style.label}
              </span>
              {hasCollChange && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="text-rb-500">Supply</span>
                  {wrapColl(
                    <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(collChange))}</span>,
                  )}
                  <TokenChipIcon symbol={ctx.collateralType} size={16} />
                </span>
              )}
              {hasDebtChange && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="text-rb-500">Borrow</span>
                  {wrapDebt(
                    <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(debtChange))}</span>,
                  )}
                  <TokenChipIcon symbol={ctx.assetType ?? "BOLD"} size={16} />
                </span>
              )}
              {stateAfter.annualInterestRate > 0 &&
                (ctx.operation === "openTroveAndJoinBatch" ? (
                  <DelegateRatePill rate={stateAfter.annualInterestRate} prov={rateP} />
                ) : (
                  <RatePill rate={stateAfter.annualInterestRate} prov={rateP} />
                ))}
            </>
          ) : ctx.operation === "redeemCollateral" ? (
            // The dotted spine carries a "REDEMPTION" pill on desktop, so the
            // header badge is mobile-only here. The freed space lets the two
            // facts that matter read with labels — collateral cleared, debt
            // reduced — mirroring the Aave liquidation header grammar.
            <>
              <span
                className={`sm:hidden inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${style.bg} ${style.color}`}
              >
                {style.label}
              </span>
              {hasCollChange && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="text-caution-600 dark:text-caution-400">Cleared</span>
                  {wrapColl(
                    <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(collChange))}</span>,
                  )}
                  <TokenChipIcon symbol={ctx.collateralType} size={16} />
                </span>
              )}
              {hasDebtChange && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="text-caution-600 dark:text-caution-400">Reduced</span>
                  {wrapDebt(
                    <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(debtChange))}</span>,
                  )}
                  <TokenChipIcon symbol={ctx.assetType ?? "BOLD"} size={16} />
                </span>
              )}
            </>
          ) : ctx.operation === "liquidate" ? (
            // The dotted spine carries a critical "LIQUIDATION" pill on desktop,
            // so the header badge is mobile-only here. The freed space lets the
            // facts read with labels — collateral liquidated, debt cleared —
            // mirroring the redemption header grammar. Labels stay neutral
            // (rb-500); the red spine alone carries the critical valence.
            <>
              <span
                className={`sm:hidden inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${style.bg} ${style.color}`}
              >
                {style.label}
              </span>
              {hasCollChange && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="text-rb-500">Liquidated</span>
                  {wrapColl(
                    <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(collChange))}</span>,
                  )}
                  <TokenChipIcon symbol={ctx.collateralType} size={16} />
                </span>
              )}
              {hasDebtChange && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="text-rb-500">Cleared</span>
                  {wrapDebt(
                    <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(debtChange))}</span>,
                  )}
                  <TokenChipIcon symbol={ctx.assetType ?? "BOLD"} size={16} />
                </span>
              )}
            </>
          ) : style.badge ? (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${style.bg} ${style.color}`}
            >
              {style.label}
            </span>
          ) : style.label.includes(" + ") ? (
            // Combined action: "Withdraw + Repay" etc — show with values and token icons
            <>
              {(() => {
                const [collAction, debtAction] = style.label.split(" + ");
                return (
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span className="text-rb-500">{collAction}</span>
                    {hasCollChange &&
                      wrapColl(
                        <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(collChange))}</span>,
                      )}
                    <TokenChipIcon symbol={ctx.collateralType} size={16} />
                    <span className="text-rb-500">{debtAction}</span>
                    {hasDebtChange &&
                      wrapDebt(
                        <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(debtChange))}</span>,
                      )}
                    <TokenChipIcon symbol={ctx.assetType ?? "BOLD"} size={16} />
                  </span>
                );
              })()}
            </>
          ) : (
            <span className="text-sm text-rb-500">{style.label}</span>
          )}

          {/* Debt change (skip for open trove, redemption, liquidation, delegate, and combined — shown inline or n/a).
              Also skip rate changes: a rate adjustment moves no principal — the only thing that makes
              `hasDebtChange` true is the fee-inclusive upfront fee, which rides the detail's "incl. … fee"
              line, not the header. The header keeps just the label and the new-rate pill. */}
          {hasDebtChange &&
            !style.label.includes(" + ") &&
            ctx.operation !== "openTrove" &&
            ctx.operation !== "openTroveAndJoinBatch" &&
            ctx.operation !== "redeemCollateral" &&
            ctx.operation !== "liquidate" &&
            ctx.operation !== "adjustTroveInterestRate" &&
            ctx.operation !== "setInterestBatchManager" && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                {wrapDebt(
                  <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(debtChange))}</span>,
                )}
                <TokenChipIcon symbol={ctx.assetType ?? "BOLD"} size={16} />
              </span>
            )}

          {/* Collateral change (skip for open trove, redemption, liquidation, delegate, combined, and rate change) */}
          {hasCollChange &&
            !style.label.includes(" + ") &&
            ctx.operation !== "openTrove" &&
            ctx.operation !== "openTroveAndJoinBatch" &&
            ctx.operation !== "redeemCollateral" &&
            ctx.operation !== "liquidate" &&
            ctx.operation !== "adjustTroveInterestRate" &&
            ctx.operation !== "setInterestBatchManager" && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                {wrapColl(
                  <span className="font-bold text-foreground">{fmtHeaderMagnitude(Math.abs(collChange))}</span>,
                )}
                <TokenChipIcon symbol={ctx.collateralType} size={16} />
              </span>
            )}

          {/* Claimable collateral surplus — on a liquidation where the trove's
              collateral value exceeded its debt, the remainder is returned to
              the owner and remains claimable. Mirrors the prod liquidation
              header (and the redemption "claimable" treatment in the detail). */}
          {ctx.operation === "liquidate" && ctx.liquidation && ctx.liquidation.collSurplus > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400">
              <span>{ctx.liquidation.collSurplus.toFixed(4)}</span>
              <TokenChipIcon symbol={ctx.collateralType} size={16} />
              claimable
            </span>
          )}

          {/* Interest rate — single pill. The label already says it's a rate,
              so no second "% APR" is needed in the trailing cluster below. */}
          {(ctx.operation === "adjustTroveInterestRate" || ctx.operation === "removeFromBatch") &&
            stateAfter.annualInterestRate > 0 && <RatePill rate={stateAfter.annualInterestRate} prov={rateP} />}

          {/* Right side: CR (rate only on rate-change operations). The delegate
              row keeps its header minimal (Delegate · rate · fee · manager),
              so the trailing CR/LTV + APR are suppressed there — the rate
              already shows in the delegate pill and CR lives in the grid. */}
          <span className="inline-flex items-center gap-1.5">
            {showCollateralRatio &&
              crShown > 0 &&
              ctx.operation !== "setInterestBatchManager" &&
              wrapCr(
                <span className={`text-xs ${crColor(crShown, ctx.collateralType)}`}>
                  {formatRatio(crShown, ratioMode, 0)} {ratioLabelShort(ratioMode)}
                </span>,
              )}
          </span>
          {/* `evt-meta`: the header's own first row below sm (app/globals.css). */}
          <span className="evt-meta ml-auto inline-flex items-center gap-2">
            {ctx.operation === "redeemCollateral" && ctx.isZombieTrove && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold rounded bg-caution-500/15 text-caution-600 dark:text-caution-400"
                title={
                  stateAfter.debt === 0
                    ? "Zombie trove fully redeemed — debt cleared, collateral now claimable"
                    : "Zombie trove — debt below the minimum, redeemable until restored"
                }
              >
                <AlertTriangle className="w-3 h-3" />
                <span className="hidden md:inline">Zombie</span>
              </span>
            )}
            {groupChip}
            {timestamp > 0 && (
              <span className="text-xs ">
                <EventTime ts={timestamp} />
              </span>
            )}
            {counter}
          </span>
        </div>
      </div>
    </>
  );
}
