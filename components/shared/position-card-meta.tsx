// The top-right activity-meta cluster shared by every position card (listing +
// detail), across protocols. Generalizes the pattern Liquity's trove cards and
// the Aave V4 spoke cards hand-rolled: time-since-last-event, a
// non-liquidation transaction count, a Liquity redemption indicator, and the
// liquidation triangle. (The bookmark toggle used to ride this cluster too;
// it bookmarks the WALLET, so it now lives beside the address —
// WalletPill's `bookmarkProtocol`.)
//
// Each segment renders ONLY when its datum is present, so a protocol that lacks
// one simply omits it — e.g. MakerDAO carries no per-position timestamp, so it
// shows the event count + liquidation flag without a "time ago". This keeps one
// grammar across surfaces that carry different amounts of metadata.

import { Icon } from "@/components/icons/icon";
import { formatDuration } from "@/lib/date";
import { LiquidatedBadge } from "@/components/shared/liquidated-badge";

export interface PositionCardMetaProps {
  /** Unix epoch of the most recent event. Omit/null when the protocol carries no
   *  per-position timestamp (e.g. MakerDAO). Seconds or milliseconds — normalized. */
  lastActivityAt?: number | null;
  /** Non-liquidation transaction/event count. Hidden when 0/absent. */
  eventCount?: number | null;
  /** What the count IS, on hover, where the default sentence would be wrong.
   *  The two defaults below name the exclusions a LENDING position's count
   *  makes; a roster whose count is not that (a vault position counts the
   *  share-token transfers naming the address, and has no liquidations to
   *  exclude) states its own. Omitted, nothing changes for any caller. */
  eventCountTitle?: string;
  /** Exact liquidation count, when known (Aave, Compound). */
  liquidationCount?: number | null;
  /** Boolean-only liquidation history, when no count exists (Morpho, MakerDAO). */
  liquidated?: boolean;
  /** Liquity-only redemption count (caution-tier triangle). */
  redemptionCount?: number | null;
}

// formatDuration treats a bare number as SECONDS. Unix seconds are ~1.7e9 today;
// milliseconds ~1.7e12, so anything past 1e12 is milliseconds — normalize it to
// whole seconds before handing it over.
function toSeconds(epoch: number): number {
  return epoch > 1e12 ? Math.floor(epoch / 1000) : epoch;
}

export function PositionCardMeta({
  lastActivityAt,
  eventCount,
  eventCountTitle,
  liquidationCount,
  liquidated,
  redemptionCount,
}: PositionCardMetaProps) {
  const showTime = lastActivityAt != null && lastActivityAt > 0;
  const showEvents = eventCount != null && eventCount > 0;
  const showRedemption = redemptionCount != null && redemptionCount > 0;
  const hasLiqCount = liquidationCount != null && liquidationCount > 0;
  const showLiquidation = hasLiqCount || liquidated === true;

  if (!showTime && !showEvents && !showRedemption && !showLiquidation) return null;

  return (
    // data-prov-exempt: activity-meta chrome — the time-ago, event count and
    // liquidation tally are the tripwire's documented "event numbers" class
    // (index row counts, not chain-state figures), stated here without a
    // receipt on every consumer. Exempted once at the cluster root.
    <span data-prov-exempt="" className="flex items-center gap-2 text-xs text-rb-500">
      {showTime && (
        <span className="inline-flex items-center gap-1">
          <Icon name="clock-zap" size={12} />
          {formatDuration(toSeconds(lastActivityAt as number), new Date())} ago
        </span>
      )}
      {showEvents && (
        // A protocol that supplies redemptionCount (the Liquity family) also
        // excludes redemptions from its transaction count — they are not the
        // owner's transactions — so the title names both exclusions there.
        <span
          className="inline-flex items-center"
          title={
            eventCountTitle ??
            (redemptionCount != null
              ? "Transactions (excludes liquidations and redemptions)"
              : "Transactions (excludes liquidations)")
          }
        >
          <Icon name="arrow-left-right" size={12} />
          <span className="ml-1">{eventCount}</span>
        </span>
      )}
      {showRedemption && (
        <span
          className="inline-flex items-center text-caution-400"
          title={`Redeemed against ${redemptionCount} time${redemptionCount === 1 ? "" : "s"}`}
          aria-label={`Redeemed against ${redemptionCount} time${redemptionCount === 1 ? "" : "s"}`}
        >
          <Icon name="triangle" size={12} />
          <span className="ml-1 font-semibold">{redemptionCount}</span>
        </span>
      )}
      {showLiquidation && <LiquidatedBadge count={hasLiqCount ? (liquidationCount as number) : undefined} />}
    </span>
  );
}
