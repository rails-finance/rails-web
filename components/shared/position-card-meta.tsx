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
import { MountedAge } from "@/components/shared/mounted-age";
import { RevealTip } from "@/components/shared/reveal-tip";
import { LiquidatedBadge } from "@/components/shared/liquidated-badge";
import { PositionCardDisclosureToggle } from "@/components/shared/position-card-disclosure";

export interface PositionCardMetaProps {
  /** Unix epoch of the most recent event. Omit/null when the protocol carries no
   *  per-position timestamp (e.g. MakerDAO). Seconds or milliseconds — normalized. */
  lastActivityAt?: number | null;
  /** Non-liquidation transaction/event count. Hidden when 0/absent. */
  eventCount?: number | null;
  /** What the count counts, singular or plural, in the hover tip ("52 transactions").
   *  Default "transaction"; a vault position counts "transfer". */
  eventCountNoun?: string;
  /** The position's events, where they differ from the count: the tip then
   *  gives both ("104 transactions · 167 events"), the timeline's figure too. */
  eventTotal?: number | null;
  /** A sentence after the count in its tip: what the count leaves out, where
   *  it differs from the timeline's event count. */
  countTip?: string;
  /** Exact liquidation count, when known (Aave, Compound). */
  liquidationCount?: number | null;
  /** Boolean-only liquidation history, when no count exists (Morpho, MakerDAO). */
  liquidated?: boolean;
  /** Liquity-only redemption count (triangle in the external-party pink). */
  redemptionCount?: number | null;
  /** What the liquidation count counts, added to its tip. */
  liquidationRule?: string;
  /** Why the events and transactions differ, added to the count's tip after
   *  the two figures (SparkLend: a liquidation's fee is its own row). */
  countNote?: string;
  /** What the count counts, added to its tip whatever the event total. */
  countRule?: string;
  /** Print the count's noun beside it ("19 transactions") rather than only in
   *  its tip. Opt-in; unset, the count is the icon and the figure as before. */
  countNounVisible?: boolean;
}

// formatDuration treats a bare number as SECONDS. Unix seconds are ~1.7e9 today;
// milliseconds ~1.7e12, so anything past 1e12 is milliseconds — normalize it to
// whole seconds before handing it over.
function toSeconds(epoch: number): number {
  return epoch > 1e12 ? Math.floor(epoch / 1000) : epoch;
}

// "2026-09-29 14:03 UTC" — UTC so server and client render the same string.
function utcStamp(sec: number): string {
  return `${new Date(sec * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function PositionCardMeta({
  lastActivityAt,
  eventCount,
  eventCountNoun = "transaction",
  eventTotal,
  countTip,
  liquidationCount,
  liquidated,
  redemptionCount,
  liquidationRule,
  countNote,
  countRule,
  countNounVisible = false,
}: PositionCardMetaProps) {
  const showTime = lastActivityAt != null && lastActivityAt > 0;
  const showEvents = eventCount != null && eventCount > 0;
  const showRedemption = redemptionCount != null && redemptionCount > 0;
  const hasLiqCount = liquidationCount != null && liquidationCount > 0;
  const showLiquidation = hasLiqCount || liquidated === true;

  // The disclosure chevron closes the cluster on a card whose shell opted in
  // (PositionCardShell `disclosureKey`); it renders nothing anywhere else.
  if (!showTime && !showEvents && !showRedemption && !showLiquidation) return <PositionCardDisclosureToggle />;

  return (
    // data-prov-exempt: activity-meta chrome — the time-ago, event count and
    // liquidation tally are the tripwire's documented "event numbers" class
    // (index row counts, not chain-state figures), stated here without a
    // receipt on every consumer. Exempted once at the cluster root.
    <span data-prov-exempt="" className="flex items-center gap-2 text-xs text-rb-500">
      {showTime && (
        <RevealTip
          tip={`Last activity ${utcStamp(toSeconds(lastActivityAt as number))}`}
          label={`Last activity ${utcStamp(toSeconds(lastActivityAt as number))}`}
          focusable
          className="gap-1 focus-ring rounded-sm"
        >
          <Icon name="clock-zap" size={12} />
          <MountedAge from={toSeconds(lastActivityAt as number)} suffix=" ago" />
        </RevealTip>
      )}
      {showEvents &&
        (() => {
          const n = eventCount as number;
          const label =
            `${n.toLocaleString("en-US")} ${eventCountNoun}${n === 1 ? "" : "s"}` +
            (eventTotal != null && eventTotal > 0 && eventTotal !== n
              ? ` · ${eventTotal.toLocaleString("en-US")} event${eventTotal === 1 ? "" : "s"}${countNote ? `: ${countNote}` : ""}`
              : "") +
            (countRule ? `. ${countRule}` : "");
          return (
            <RevealTip
              tip={countTip ? `${label}. ${countTip}` : label}
              label={label}
              focusable
              className="focus-ring rounded-sm"
            >
              <Icon name="arrow-left-right" size={12} />
              <span className="ml-1">
                {n.toLocaleString("en-US")}
                {countNounVisible ? ` ${eventCountNoun}${n === 1 ? "" : "s"}` : ""}
              </span>
            </RevealTip>
          );
        })()}
      {showRedemption &&
        (() => {
          const label = `Redeemed against ${redemptionCount} time${redemptionCount === 1 ? "" : "s"}`;
          return (
            <RevealTip
              tip={label}
              label={label}
              focusable
              className="text-pink-500 dark:text-pink-400 focus-ring rounded-sm"
            >
              <Icon name="triangle" size={12} />
              <span className="ml-1 font-semibold">{redemptionCount}</span>
            </RevealTip>
          );
        })()}
      {showLiquidation && (
        <LiquidatedBadge count={hasLiqCount ? (liquidationCount as number) : undefined} rule={liquidationRule} />
      )}
      <PositionCardDisclosureToggle />
    </span>
  );
}
