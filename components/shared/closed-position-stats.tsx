import { Fragment, type ComponentType, type ReactNode } from "react";
import { TipLabel } from "@/components/shared/tip-label";
import { PositionCardHeader, PositionCardRegion } from "@/components/shared/position-card-disclosure";
import { RevealTip } from "@/components/shared/reveal-tip";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatDate } from "@/lib/date";

export type PositionOutcome = "closed" | "liquidated" | "expired" | "repaid" | "defaulted" | "denied";

// The badge is the LIFECYCLE word — a terminal card reads "CLOSED", grey
// for a wind-down (closed / repaid / denied / expired) or red for a forced
// exit (liquidated / defaulted). The Outcome column beneath it carries the
// actual outcome word, so "closed by liquidation" is legible without the
// badge itself needing a third color. One ending names itself on the badge:
// a Trove a redemption closed reads "REDEEMED" in caution orange
// (color-grammar §5), since "CLOSED" reads as the owner closing it.
const GREY_BADGE = "bg-rb-500 text-white";
const RED_BADGE = "bg-red-500 text-white";
const CAUTION_BADGE = "bg-caution-500 text-white";
const CAUTION_TEXT = "text-caution-600 dark:text-caution-400";

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
  /** With no `debt`, let Outcome take the second column instead of keeping the
   *  empty debt slot (a liquidated Trove's card while its surplus is
   *  claimable, where the claimable figure stands alone). */
  outcomeFollows?: boolean;
  collateralLabel?: string;
  debtLabel?: string;
  /** What each heading means, shown on hover or tap (MakerDAO). */
  labelTips?: { collateral?: string; debt?: string; outcome?: string };
  /** A hover/tap tip on the CLOSED badge (opt-in). */
  badgeTip?: string;
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
  /** A line under Outcome that stays in view on a disclosing card's closed
   *  layer: what the owner can still claim (a liquidated Trove's surplus). */
  outcomeFootnote?: ReactNode;
  /** The Outcome column's word when the protocol names how the position
   *  ended more finely than `outcome` (Liquity V1's "Fully redeemed"). The
   *  badge and colour still follow `outcome`. */
  outcomeLabel?: string;
  /** A closed position whose last debt a redemption cancelled: the badge
   *  reads "REDEEMED" and the badge and Outcome take caution orange. */
  redeemed?: boolean;
  /** Unix timestamp of closure — shown as date beneath Outcome */
  closedAt?: number;
  /** Dated lines beneath Outcome in place of the one closure date, where the
   *  outcome and the closing happened on different days ("Liquidated
   *  16 Sep 2025", "Closed 26 Sep 2026"). */
  outcomeDates?: { label: string; at: number }[];
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
  /** A card with progressive disclosure (ui-jobs 209) passes its detail gate
   *  (`PositionCardDetail`): every cell but Outcome then draws only while the
   *  card is open, so the closed card is its header and the outcome. */
  detailGate?: ComponentType<{ children: ReactNode }>;
  /** Drawn in place of the CLOSED badge: a card that names its ending in its
   *  own tag (ui-jobs 270's "Closed" / "Liquidated"). */
  tag?: ReactNode;
}

function formatClosureDate(unix: number): string {
  return formatDate(unix);
}

export function ClosedPositionStats({
  outcome,
  collateral,
  debt,
  outcomeFollows,
  outcomeLabel,
  redeemed = false,
  labelTips,
  collateralLabel = CARD_VOCAB.peakCollateral,
  debtLabel = CARD_VOCAB.peakDebt,
  collateralIcon,
  debtIcon,
  collateralAssetIcons,
  debtAssetIcons,
  collateralFootnote,
  debtFootnote,
  outcomeFootnote,
  closedAt,
  outcomeDates,
  extra,
  icons,
  identity,
  leadingIdentity,
  badgeTip,
  detailGate,
  tag,
}: ClosedPositionStatsProps) {
  const Gate = detailGate ?? Fragment;
  const base = OUTCOME[outcome];
  const { label, color, badge } = redeemed
    ? { label: "Fully redeemed", color: CAUTION_TEXT, badge: CAUTION_BADGE }
    : base;
  const badgeWord = redeemed ? "REDEEMED" : "CLOSED";
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
    <div data-anatomy="C11">
      <PositionCardHeader className="flex items-center justify-between gap-2 flex-wrap" spacing="mb-3" anatomy="C5">
        {/* Wraps between pieces: at 390px the owner address used to break in
            two beside a squeezed pair label. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          {tag !== undefined ? (
            tag
          ) : badgeTip ? (
            <RevealTip
              tip={badgeTip}
              label={`${redeemed ? "Redeemed" : "Closed"}: ${badgeTip}`}
              focusable
              className="focus-ring rounded-xs"
            >
              <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${badge}`}>{badgeWord}</span>
            </RevealTip>
          ) : (
            <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${badge}`}>{badgeWord}</span>
          )}
          {leadingIdentity}
        </span>
        {identity}
      </PositionCardHeader>
      <PositionCardRegion className={gridClass} anatomy="C10">
        {useLeadingIcons && <div className="hidden sm:flex items-center self-stretch">{icons}</div>}
        <Gate>
          <div>
            <div className="text-rb-500 text-xs font-semibold flex items-center gap-1.5">
              <TipLabel text={collateralLabel} tip={labelTips?.collateral} />
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
                <TipLabel text={debtLabel} tip={labelTips?.debt} />
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
          ) : outcomeFollows ? null : (
            <div className="hidden sm:block" />
          )}
        </Gate>
        <div>
          <div className="text-rb-500 text-xs font-semibold">
            <TipLabel text="Outcome" tip={labelTips?.outcome} />
          </div>
          <div className={`text-lg font-bold mt-2 ${color}`}>{outcomeLabel ?? label}</div>
          {outcomeDates && outcomeDates.length > 0
            ? outcomeDates.map((d) => (
                <div key={d.label} className="text-xs text-rb-500 mt-0.5">
                  {d.label} {formatClosureDate(d.at)}
                </div>
              ))
            : closure && <div className="text-xs text-rb-500 mt-0.5">{closure}</div>}
          {outcomeFootnote}
        </div>
        <Gate>
          {extra ? (
            <div>
              <div className="text-rb-500 text-xs font-semibold">{extra.label}</div>
              {extra.value}
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}
        </Gate>
      </PositionCardRegion>
    </div>
  );
}
