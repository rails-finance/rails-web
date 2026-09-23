"use client";

/**
 * Liquity-specific slot that reads per-trove bar data from
 * useLiquityTroveBars and renders the shared <PositionBar> beneath the
 * LiquityEventHeader row. Padding (`px-4`) and grid (`gap-6`) match the
 * expanded detail panel's `<div className="grid grid-cols-2 gap-6">` so the
 * collateral column sits directly above the Collateral column and the debt
 * column sits directly above the Debt column.
 *
 * The visual itself lives in components/shared/position-bar.tsx — other
 * protocols that produce PositionBarData can render the same bars.
 */

import { useLiquityTroveBars } from "@/lib/liquity/use-trove-bars";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { PositionBar } from "@/components/shared/position-bar";

export function TroveBarsSlot({ eventId }: { eventId: string }) {
  const data = useLiquityTroveBars(eventId);
  const { showChangeBars, showBalanceBars } = useTimelineDisplay();
  if (!data || (!showChangeBars && !showBalanceBars)) return null;
  return (
    <div className="px-4 pb-3 -mt-1">
      <PositionBar data={data} showChange={showChangeBars} showBalance={showBalanceBars} />
    </div>
  );
}
