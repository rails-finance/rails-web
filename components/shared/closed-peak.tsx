"use client";

// A closed account card's peak value per side (rails-ops ui-jobs 803): "Peak
// $1.2M · 3 Mar 2025", the side's held assets summed on the day they were
// worth the most, each valued as the Lifetime flows panel values that day
// (lib/shared/flows-peak.ts). It reads the flows timeline the page already
// holds for that panel, so the card makes no read of its own. The figure's
// receipt is the panel's held-figure receipt for that day (`heldDayProv`);
// inside the card's C19 button it stays inert, and the dropdown's heading
// carries it. While the timeline is read the figure holds a placeholder bar;
// a failed read, or a side whose every day has an unpriced asset, reads
// "price unavailable" (`unavailableWords`). Never a $0.

import { useCallback, useMemo, type ReactNode } from "react";
import { buildFlowModel, DAY_MS, type FlowSide, type FlowTimeline } from "@/lib/shared/flows-timeline";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { sidePeak } from "@/lib/shared/flows-peak";
import { heldDayProv } from "@/lib/shared/flows-timeline-provenance";
import { listWords } from "@/lib/shared/flows-sum";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { unavailableWords } from "@/components/shared/position-card-panel";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import { formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

/** The flows timeline a detail page holds for its Lifetime flows panel, and
 *  where its read stands. */
export interface ClosedPeakFlows {
  read: FlowsRead;
  timeline: FlowTimeline | null;
}

/** A head's peak: the figure beside the icons and, where there is one, the
 *  total the dropdown's heading states with its receipt. */
export interface PeakHeadFigure {
  figure: ReactNode;
  total?: { usd: number; info: Provenance; at: string };
}

/** "Peak $1.2M · 3 Mar 2025", muted as a historic figure. */
function PeakFigure({ usd, at, info }: { usd: number; at: string; info: Provenance }) {
  return (
    <span className="text-rb-500" data-card-peak="">
      Peak{" "}
      <RevealTip tip={formatUsdValue(usd)}>
        <Prov info={info}>{formatCompactUsd(usd)}</Prov>
      </RevealTip>{" "}
      · {at}
    </span>
  );
}

/** The card's peak per side, from the page's flows timeline. Undefined where
 *  the card has no timeline (a listing row) or the position is open. */
export function useClosedPeaks(
  flows: ClosedPeakFlows | undefined,
  closed: boolean,
): (side: FlowSide, label: string, keep?: (symbol: string) => boolean) => PeakHeadFigure | undefined {
  const timeline = closed ? flows?.timeline : null;
  const model = useMemo(() => (timeline ? buildFlowModel(timeline) : null), [timeline]);
  const read = flows?.read;
  return useCallback(
    (side, label, keep) => {
      if (!closed || !flows || read === "withheld") return undefined;
      const unavailable = (): PeakHeadFigure => ({
        figure: (
          <span className="text-rb-500" data-card-unavailable="">
            {unavailableWords(true)}
          </span>
        ),
      });
      if (read === "failed") return unavailable();
      if (!model) return { figure: <SkeletonBar width={96} figure /> };
      const { peak, unpriced } = sidePeak(model.heldAt, Math.round(model.start / DAY_MS), side, keep);
      if (!peak) return unpriced.length > 0 ? unavailable() : undefined;
      const at = formatDate(peak.day * 86_400);
      const prov = heldDayProv(`Peak ${label.toLowerCase()}`, at, peak.rows, formatCompactUsd);
      // Days a held asset had no price carry no dollar figure, so the peak
      // is the highest of the others.
      const info: Provenance = unpriced.length
        ? {
            ...prov,
            inputs: [
              ...(prov.inputs ?? []),
              {
                label: "days left out",
                value: listWords(unpriced),
                kind: "derived",
                note: "a day on which one of these had no price has no dollar figure",
              },
            ],
          }
        : prov;
      return { figure: <PeakFigure usd={peak.usd} at={at} info={info} />, total: { usd: peak.usd, info, at } };
    },
    [closed, flows, read, model],
  );
}

/** A listing row's figure for a closed side: its largest asset's highest
 *  recorded amount in its own token ("1.2M USDC"), with no USD. A listing
 *  holds no flows timeline, so no peak day; "largest" is by the row's current
 *  prices (each amount × its price now), since raw balances across decimals
 *  do not compare. An asset with no price now, or whose decimals did not
 *  load, is not a candidate; none left, no figure. */
export function largestAssetFigure(
  assets: readonly { symbol: string; amount: number; usdNow: number | null; decimalsUnread?: true }[],
): { figure: ReactNode } | undefined {
  let best: (typeof assets)[number] | undefined;
  for (const a of assets)
    if (!a.decimalsUnread && a.usdNow != null && (!best || a.usdNow > (best.usdNow as number))) best = a;
  if (!best) return undefined;
  return {
    figure: (
      <span data-card-largest="">
        {formatCompact(best.amount)} <span className="text-[0.55em] font-medium text-rb-500">{best.symbol}</span>
      </span>
    ),
  };
}
