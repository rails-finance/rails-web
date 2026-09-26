import type { ReactNode } from "react";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatDate } from "@/lib/date";

export type PositionOutcome = "closed" | "liquidated" | "expired" | "repaid" | "defaulted" | "denied";

// The badge is the LIFECYCLE word — every terminal card reads "CLOSED", grey
// for a wind-down (closed / repaid / denied / expired) or red for a forced
// exit (liquidated / defaulted). The Outcome column beneath it carries the
// actual outcome word, so "closed by liquidation" is legible without the
// badge itself needing a third color.
const GREY_BADGE = "bg-rb-500 text-white";
const RED_BADGE = "bg-red-500 text-white";

const OUTCOME: Record<PositionOutcome, { label: string; color: string; badge: string }> = {
  closed: { label: "Closed", color: "text-rb-500", badge: GREY_BADGE },
  liquidated: { label: "Liquidated", color: "text-red-400", badge: RED_BADGE },
  expired: { label: "Expired", color: "text-rb-500", badge: GREY_BADGE },
  repaid: { label: "Repaid", color: "text-rb-500", badge: GREY_BADGE },
  defaulted: { label: "Defaulted", color: "text-red-400", badge: RED_BADGE },
  denied: { label: "Denied", color: "text-rb-500", badge: GREY_BADGE },
};

export interface ClosedPositionStatsProps {
  outcome: PositionOutcome;
  collateral: ReactNode;
  /** Omit for supply-only positions that never carried debt — Debt column is dropped entirely. */
  debt?: ReactNode;
  collateralLabel?: string;
  debtLabel?: string;
  /** Token icon shown after the collateral column label */
  collateralIcon?: ReactNode;
  /** Token icon shown after the debt column label */
  debtIcon?: ReactNode;
  /** Larger asset cluster shown between the Collateral label and value.
   *  When set (or `debtAssetIcons` is set), the leading `icons` slot is
   *  suppressed so the cluster sits next to the data it identifies. */
  collateralAssetIcons?: ReactNode;
  /** Larger asset cluster shown between the Debt label and value. See above. */
  debtAssetIcons?: ReactNode;
  collateralFootnote?: ReactNode;
  debtFootnote?: ReactNode;
  /** Unix timestamp of closure — shown as date beneath Outcome */
  closedAt?: number;
  /** Optional 4th column (rate slot) — keeps closed cards the same width as open */
  extra?: { label: string; value: ReactNode };
  /** Optional desktop-only left column (e.g. PositionPairIcons) */
  icons?: ReactNode;
  /** Position-specific identifier (spoke name, trove ID, etc.) shown
   *  top-right opposite the outcome pill. */
  identity?: ReactNode;
  /** Identifier rendered to the right of the outcome pill on the *left* —
   *  used by surfaces (e.g. Aave spokes) that prefer the spoke name as a
   *  status-line companion rather than a top-right tag. */
  leadingIdentity?: ReactNode;
}

function formatClosureDate(unix: number): string {
  return formatDate(unix);
}

export function ClosedPositionStats({
  outcome,
  collateral,
  debt,
  collateralLabel = CARD_VOCAB.peakCollateral,
  debtLabel = CARD_VOCAB.peakDebt,
  collateralIcon,
  debtIcon,
  collateralAssetIcons,
  debtAssetIcons,
  collateralFootnote,
  debtFootnote,
  closedAt,
  extra,
  icons,
  identity,
  leadingIdentity,
}: ClosedPositionStatsProps) {
  const { label, color, badge } = OUTCOME[outcome];
  const closure = closedAt ? formatClosureDate(closedAt) : null;
  const showDebt = debt !== undefined;
  const hasInColumnAssets = collateralAssetIcons != null || debtAssetIcons != null;
  const useLeadingIcons = !!icons && !hasInColumnAssets;
  // Always 4 stat columns wide so Collateral / Debt / Outcome / Extra line up
  // across cards in a multi-card selector. Supply-only cards skip the Debt
  // cell but keep its slot empty, so Outcome stays in the same x-position as
  // it does on cards that do carry debt.
  const gridClass = useLeadingIcons
    ? "grid grid-cols-2 sm:grid-cols-[80px_repeat(4,_1fr)] lg:grid-cols-[120px_repeat(4,_1fr)] gap-4 sm:items-start"
    : "grid grid-cols-2 sm:grid-cols-4 gap-4";
  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <span className="flex items-center gap-2">
          <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${badge}`}>CLOSED</span>
          {leadingIdentity}
        </span>
        {identity}
      </div>
      <div className={gridClass}>
        {useLeadingIcons && <div className="hidden sm:flex items-center self-stretch">{icons}</div>}
        <div>
          <div className="text-rb-500 text-xs font-semibold flex items-center gap-1.5">
            {collateralLabel}
            {collateralIcon}
          </div>
          {collateralAssetIcons ? (
            <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
              {collateral}
              {collateralAssetIcons}
            </div>
          ) : (
            collateral
          )}
          {collateralFootnote}
        </div>
        {showDebt ? (
          <div>
            <div className="text-rb-500 text-xs font-semibold flex items-center gap-1.5">
              {debtLabel}
              {debtIcon}
            </div>
            {debtAssetIcons ? (
              <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                {debt}
                {debtAssetIcons}
              </div>
            ) : (
              debt
            )}
            {debtFootnote}
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div>
          <div className="text-rb-500 text-xs font-semibold">Outcome</div>
          <div className={`text-lg font-bold mt-2 ${color}`}>{label}</div>
          {closure && <div className="text-xs text-rb-500 mt-0.5">{closure}</div>}
        </div>
        {extra ? (
          <div>
            <div className="text-rb-500 text-xs font-semibold">{extra.label}</div>
            {extra.value}
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>
    </div>
  );
}
