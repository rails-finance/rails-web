"use client";

// Inline collateral/debt bars rendered under the event header. Reads
// PositionBarData out of AaveV4BarsContext (computed once per timeline
// render) and gates visibility on the timeline-display-context toggles.

import { useAaveV4Bars } from "@/lib/aave-v4/use-position-bars";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { PositionBar } from "@/components/shared/position-bar";

export function AaveV4BarsSlot({ eventId }: { eventId: string }) {
  const data = useAaveV4Bars(eventId);
  const { showChangeBars, showBalanceBars } = useTimelineDisplay();
  if (!data || (!showChangeBars && !showBalanceBars)) return null;
  return (
    <div className="px-4 pb-3 -mt-1">
      <PositionBar data={data} showChange={showChangeBars} showBalance={showBalanceBars} />
    </div>
  );
}
