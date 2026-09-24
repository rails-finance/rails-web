"use client";

// Inline collateral/debt bars rendered under the event header. Reads
// AaveV4BarData out of AaveV4BarsContext (computed once per timeline
// render) and gates visibility on the timeline-display-context toggles.
//
// RULE: Rails never invents a price (lib/aave-v4/unpriced.ts). A bar that
// leaves out a holding no price source covers carries a line under it naming
// that holding, in the spoke card's own footnote grammar.

import { useAaveV4Bars } from "@/lib/aave-v4/use-position-bars";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { PositionBar } from "@/components/shared/position-bar";
import { listSymbols, NO_PRICE_HINT } from "@/lib/aave-v4/unpriced";

/** "excl. PT-sUSDE-7MAY2026 · no price source" under one side's bar. An
 *  empty cell keeps the other side's note in its own column. */
function UnpricedNote({ side, symbols }: { side: "coll" | "debt"; symbols: string[] }) {
  if (symbols.length === 0) return <div />;
  const names = listSymbols(symbols);
  return (
    <div
      className="text-xs leading-tight text-rb-500"
      data-bar-unpriced={side}
      title={`${names}: no price source, so this bar leaves it out`}
    >
      excl. {names} · {NO_PRICE_HINT}
    </div>
  );
}

export function AaveV4BarsSlot({ eventId }: { eventId: string }) {
  const data = useAaveV4Bars(eventId);
  const { showChangeBars, showBalanceBars } = useTimelineDisplay();
  if (!data || (!showChangeBars && !showBalanceBars)) return null;
  const hasNote = data.unpriced.coll.length > 0 || data.unpriced.debt.length > 0;
  return (
    <div className="px-4 pb-3 -mt-1">
      <PositionBar data={data} showChange={showChangeBars} showBalance={showBalanceBars} />
      {hasNote && (
        <div className="mt-1 grid grid-cols-2 gap-6">
          <UnpricedNote side="coll" symbols={data.unpriced.coll} />
          <UnpricedNote side="debt" symbols={data.unpriced.debt} />
        </div>
      )}
    </div>
  );
}
