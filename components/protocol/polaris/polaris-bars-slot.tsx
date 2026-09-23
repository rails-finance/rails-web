"use client";

/**
 * Polaris slot that reads per-CDP bar data from usePolarisCdpBars and renders
 * the shared <PositionBar> beneath the PolarisEventHeader row, gated by the
 * two bar flags. Same padding and grid as the Liquity V2 slot
 * (components/protocol/liquity/trove-bar.tsx), so the collateral column sits
 * above the detail grid's Collateral stat and the debt column above Debt.
 *
 * Null with no provider mounted, and null on a transfer row (no entry).
 */

import { usePolarisCdpBars } from "@/lib/polaris/use-cdp-bars";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { PositionBar } from "@/components/shared/position-bar";

export function PolarisBarsSlot({ eventId }: { eventId: string }) {
  const data = usePolarisCdpBars(eventId);
  const { showChangeBars, showBalanceBars } = useTimelineDisplay();
  if (!data || (!showChangeBars && !showBalanceBars)) return null;
  return (
    <div className="px-4 pb-3 -mt-1">
      <PositionBar data={data} showChange={showChangeBars} showBalance={showBalanceBars} />
    </div>
  );
}
