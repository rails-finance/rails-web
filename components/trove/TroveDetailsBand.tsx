"use client";

import { Users } from "lucide-react";
import { TroveSummary } from "@/types/api/trove";
import { TroveStateData } from "@/types/api/troveState";
import { formatPrice, formatApproximate, formatExact } from "@/lib/utils/format";
import { FadeNumber } from "@/components/ui/FadeNumber";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { troveDebtInFrontProv, troveTrovesAheadProv } from "@/lib/liquity/trove-queue-provenance";

interface TroveDetailsBandProps {
  trove: TroveSummary;
  liveState?: TroveStateData;
  debtInFront?: number | null;
  trovesAhead?: number | null;
  debtInFrontLoading?: boolean;
}

/**
 * Two shorthand stat-line items beneath the headline grid: the labelled cost
 * cluster (`Costs: ~595.18 BOLD / year +0.3%`) and the debt-in-front cluster
 * (`Debt in front: 2.7M BOLD 41`). Each leads with its label; the footnote
 * directly below spells both out in plain language, so the card carries only
 * the glanceable figures. The delegate fee rides on inline with the cost
 * figure as a bare percentage + pink people glyph — the name and its BOLD/day
 * cost live in the footnote; the peak-collateral and debt-breakdown columns
 * this band used to carry were dropped because the economics chart shows
 * them.
 *
 * Returns a Fragment of its two items rather than wrapping them in a shared
 * container: they ride as siblings inside the caller's <RiskFooterStrip>, so
 * the strip's own row/stacked-column rule (one container-query breakpoint,
 * every item right-aligned) applies to them exactly as it does to the
 * runways beside them — no independent wrapping of its own.
 */
export function TroveDetailsBand({
  trove,
  liveState,
  debtInFront,
  trovesAhead,
  debtInFrontLoading,
}: TroveDetailsBandProps) {
  if (trove.status !== "open") return null;

  const displayRecordedDebt = liveState?.debt.recorded ?? trove.debt.current;
  const displayInterestRate = liveState?.rates.annualInterestRate ?? trove.metrics.interestRate;

  // Only the annual base interest surfaces on the card; the per-day figure and
  // the delegate fee's BOLD/day cost both live in the footnote below.
  const annualInterestCost = (displayRecordedDebt * displayInterestRate) / 100;

  // ── Receipts ────────────────────────────────────────────────────────────────
  // The two figure legs come from different deliveries: with the second-wave
  // chain read in, debt + rate are live TroveManager.getLatestTroveData state;
  // until it lands they're the indexed summary (as of the trove's last event).
  const legNote = liveState ? "TroveManager.getLatestTroveData()" : "as of the trove's last change";
  const costsProv: Provenance = {
    kind: "derived",
    summary:
      "Estimated interest cost per year — the debt at the trove's last change multiplied by its annual interest rate. It is a year's interest at today's rate; the rate can change.",
    formula: "recorded debt × rate ÷ 100",
    inputs: [
      { label: "recorded debt", value: `${formatExact(displayRecordedDebt)} BOLD`, kind: "chain", note: legNote },
      { label: "rate", value: `${formatExact(displayInterestRate)}%`, kind: "chain", note: legNote },
    ],
  };
  const feeProv: Provenance = {
    kind: "chain",
    summary:
      "The delegate's annual management fee — the fee rate the contract logged for the batch this trove is in. The delegate charges it on top of the interest the trove pays.",
    via: "the batch's most recent BatchUpdated log: _annualManagementFee",
  };
  // Both figures are computed server-side per request: a MultiTroveGetter walk
  // over the branch's live sorted troves, summing accrued-inclusive entireDebt
  // at rates at or below this trove's (excluding the trove itself). The
  // receipts are the shared queue vocabulary (lib/liquity/trove-queue-
  // provenance) so the Explanation pane's bullets trace identically.
  const debtInFrontProv = troveDebtInFrontProv(trove.collateralType);
  const trovesAheadProv = troveTrovesAheadProv(trove.collateralType);

  return (
    <>
      {/* Costs — annual base interest plus the delegate's fee percentage, one
          band item. `justify-end` on its own internal wrap keeps the fee
          badge flush right under the cost figure rather than trailing at the
          box's left edge, should the two need their own line. */}
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-xs text-rb-500 leading-relaxed">
        <div className="tabular-nums">
          Costs:{" "}
          <Prov info={costsProv} value={formatExact(annualInterestCost)}>
            <span className="text-foreground/80 font-semibold">
              ~<FadeNumber value={annualInterestCost} formatFn={formatPrice} animateOnMount={true} />
            </span>
          </Prov>{" "}
          BOLD / year
        </div>
        {trove.batch.isMember && (
          <div className="text-rb-500 inline-flex items-center gap-1 tabular-nums">
            <Prov info={feeProv} value={formatExact(trove.batch.managementFee)}>
              <span className="text-foreground/80 font-semibold">+{trove.batch.managementFee}%</span>
            </Prov>
            <Users className="w-3 h-3 shrink-0 text-pink-500" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Debt in front — its own band item, flowing on from costs. */}
      {debtInFrontLoading ? (
        <div className="h-3 w-48 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
      ) : debtInFront !== null && debtInFront !== undefined ? (
        <div className="text-right text-xs text-rb-500 leading-relaxed tabular-nums">
          Debt in front:{" "}
          <Prov info={debtInFrontProv} value={formatExact(debtInFront)} symbol="BOLD">
            <span className="text-foreground/80 font-semibold">{formatApproximate(debtInFront)}</span>
          </Prov>{" "}
          BOLD
          {trovesAhead !== null && trovesAhead !== undefined && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-rb-200 dark:bg-rb-700 px-1.5 py-px text-[0.7rem] font-semibold text-rb-500 align-middle">
              <Prov info={trovesAheadProv} value={String(trovesAhead)}>
                {trovesAhead}
              </Prov>
            </span>
          )}
        </div>
      ) : (
        <div className="text-right text-xs text-rb-500/70 leading-relaxed">Debt in front unavailable.</div>
      )}
    </>
  );
}
