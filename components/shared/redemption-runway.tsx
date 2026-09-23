"use client";

// <RedemptionRunway> — the compact redemption-queue mini-bar riding every
// Liquity-family trove card's heading-button row, beside the compact
// liquidation runway. ONE shared instrument for V1 (CR-ordered queue) and the
// V2 family (rate-ordered: Liquity V2, Ebisu, Asymmetry); each protocol mounts
// it from the queue figures its full redemption card already reads.
//
// The two runways answer different questions on different axes: the
// liquidation runway is a PRICE axis (how far the price can fall), this is the
// QUEUE axis (how much debt redemptions consume before reaching this
// position). Deliberately NO price marker — redemptions are ordered by queue
// position (collateral ratio in V1, user-set rate in the V2 family), not
// triggered at a price.
//
//   · Fill = debt in front ÷ the queue's entire debt: the share redeemed
//     before this position is touched. The queue's front is the bar's LEFT
//     edge, so a longer fill is a longer runway — the same fill-equals-buffer
//     read as the full redemption card's bar.
//   · The fill is neutral rb — queue depth is a fact, not a danger (numbers
//     carry meaning; no opinionated colour). The one accent is the amber
//     diamond marking this position's own place at the fill's edge: amber is
//     the family's established redemption hue (the redemption triangle in
//     PositionCardMeta), an identity cue, not an alarm.
//
// The share figure carries the SAME queue-share provenance the protocol's full
// redemption card traces — the caller passes its own vocabulary's builder.

import { Prov, type Provenance } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";

const TRACK = "bg-rb-200/60 dark:bg-rb-500/15";
const FILL = "bg-rb-300 dark:bg-rb-500/40";
// The redemption hue — PositionCardMeta's caution-tier redemption triangle.
const MARKER = "bg-caution-400";
const H_BAR_COMPACT = 6; // matches PriceRunway's compact bar height

export function RedemptionRunway({
  debtInFront,
  queueDebtTotal,
  shareProv,
  markerTitle = "This position's place in the redemption queue — everything left of the marker is redeemed first",
}: {
  /** Debt redeemed before this position is touched — the same figure the
   *  protocol's full redemption card labels "Debt in front". */
  debtInFront: number;
  /** The whole queue's debt — the branch's entire debt (V2 family) or the
   *  sorted list's total (V1): the fill's denominator. */
  queueDebtTotal: number;
  /** Receipt for the share figure — pass the SAME queue-share builder the
   *  protocol's full redemption card uses, so both trace identically. */
  shareProv: Provenance;
  /** Hover caption on the amber position marker. */
  markerTitle?: string;
}) {
  if (!(queueDebtTotal > 0) || debtInFront < 0) return null;
  const share = Math.min(1, debtInFront / queueDebtTotal);
  // The diamond centres on the fill's edge; clamp it just inside the track so
  // a front-of-queue (0%) or back-of-queue (100%) position stays visible.
  const markerLeft = Math.min(98.5, Math.max(1.5, share * 100));

  return (
    <div className="flex w-full items-center gap-2.5">
      <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-rb-500">
        <Prov info={shareProv}>{pct(share)}</Prov> of queue in front
      </span>
      <div className="relative min-w-24 flex-1" style={{ height: H_BAR_COMPACT }}>
        <div className={`absolute inset-0 rounded-full ${TRACK}`} />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${FILL}`}
          style={{ width: `${(share * 100).toFixed(2)}%` }}
        />
        <span
          title={markerTitle}
          className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] ${MARKER}`}
          style={{ left: `${markerLeft}%` }}
        />
      </div>
    </div>
  );
}
