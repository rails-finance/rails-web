"use client";

// A closed account card's peak value per side (rails-ops ui-jobs 803): the
// figure "$1.2M" with "Peak · 3 Mar 2025" on the small line under it, the side's
// held assets summed on the day they were worth the most, each valued as the
// Lifetime flows panel values that day (lib/shared/flows-peak.ts). It reads
// the flows timeline the page already holds for that panel, so the card makes
// no read of its own; the model is built once per timeline and both sides
// come from one pass over its days. Rows match the card's assets by address
// where the timeline keys by address, else by symbol. The figure's receipt is
// the panel's held-figure receipt for that day (`heldDayProv`); inside the
// card's C19 button it stays inert, and the dropdown's heading carries it.
// While the timeline is read the figure holds a placeholder bar. A failed
// read, or a side whose held days all had an unpriced asset, reads "price
// unavailable" (`unavailableWords`); a finished read whose timeline holds no
// balance above zero for the side reads "not recorded" (`NOT_RECORDED`,
// lib/shared/card-vocab.ts). The day, or either state, sits on the small
// line under the figure with the side's icons at 16 px. Never a $0.

import { useCallback, useMemo, type ReactNode } from "react";
import { buildFlowModel, DAY_MS, type FlowSide, type FlowTimeline } from "@/lib/shared/flows-timeline";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { peakState, sidePeaks } from "@/lib/shared/flows-peak";
import { NOT_RECORDED } from "@/lib/shared/card-vocab";
import { heldDayProv } from "@/lib/shared/flows-timeline-provenance";
import { listWords } from "@/lib/shared/flows-sum";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { unavailableWords } from "@/components/shared/position-card-panel";
import { formatCompactUsd } from "@/lib/shared/format-compact";
import { AssetAmount } from "@/components/shared/asset-amount";
import { formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

/** The flows timeline a detail page holds for its Lifetime flows panel, and
 *  where its read stands. */
export interface ClosedPeakFlows {
  read: FlowsRead;
  timeline: FlowTimeline | null;
}

/** One asset a closed side lists, as the card names it. */
export interface ClosedPeakAsset {
  symbol: string;
  address?: string | null;
}

/** A head's peak: the figure beside the icons, the day on the line under it
 *  and, where there is one, the total the dropdown's heading states with its
 *  receipt. */
export interface PeakHeadFigure {
  /** Null: no dollar figure; `note` says why. */
  figure: ReactNode | null;
  /** The small line's words under the figure, before the icons. */
  note?: ReactNode;
  total?: { usd: number; info: Provenance; at: string };
}

/** "$1.2M", muted as a historic figure, exact on hover. */
function PeakFigure({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <span className="text-rb-500" data-card-peak="">
      <RevealTip tip={formatUsdValue(usd)}>
        <Prov info={info}>{formatCompactUsd(usd)}</Prov>
      </RevealTip>
    </span>
  );
}

const lower = (a: string | null | undefined) => (a ? a.toLowerCase() : null);

/** The card's peak per side, from the page's flows timeline. `held` names
 *  each side's assets as the card lists them. The returned function is
 *  undefined-valued where the card has no timeline (a listing row) or the
 *  position is open. */
export function useClosedPeaks(
  flows: ClosedPeakFlows | undefined,
  closed: boolean,
  held: Record<FlowSide, readonly ClosedPeakAsset[]>,
): (side: FlowSide, label: string) => PeakHeadFigure | undefined {
  const timeline = closed ? flows?.timeline : null;
  const model = useMemo(() => (timeline ? buildFlowModel(timeline) : null), [timeline]);
  const read = flows?.read;
  const has = !!flows;
  // The sides' assets as a key, so a new array each render does not rescan.
  const key = JSON.stringify([held.collateral, held.debt].map((xs) => xs.map((x) => [x.symbol, lower(x.address)])));
  const peaks = useMemo(() => {
    if (!model) return null;
    const [coll, debt] = JSON.parse(key) as [string, string | null][][];
    // A row is the card's where its asset key is one of the card's
    // addresses, else where its symbol is one of the card's symbols.
    const keepOf = (xs: [string, string | null][]) => {
      const addresses = new Set(xs.map(([, a]) => a).filter((a): a is string => a != null));
      const symbols = new Map(xs.map(([s, a]) => [s, a]));
      return (r: { symbol: string; asset?: string }) => {
        const a = lower(r.asset);
        return a != null && addresses.has(a) ? true : symbols.has(r.symbol);
      };
    };
    // The card's name for each asset, for the receipt's rows.
    const nameOf = new Map<string, string>();
    for (const [s, a] of [...coll, ...debt]) if (a) nameOf.set(a, s);
    const out = sidePeaks(model.heldAt, Math.round(model.start / DAY_MS), {
      collateral: keepOf(coll),
      debt: keepOf(debt),
    });
    for (const side of ["collateral", "debt"] as const) {
      const p = out[side].peak;
      if (p) p.rows = p.rows.map((r) => ({ ...r, symbol: nameOf.get(lower(r.asset) ?? "") ?? r.symbol }));
      // In development, say why a side has no peak: rows the card's assets
      // did not match, unpriced days, or no held row above zero at all.
      const card = side === "collateral" ? coll : debt;
      if (!p && card.length > 0 && process.env.NODE_ENV !== "production")
        console.warn(`[closed-peak] no ${side} peak`, {
          days: model.heldAt.length,
          unmatched: out[side].unmatched,
          unpriced: out[side].unpriced,
          card: card.map(([sym]) => sym),
        });
    }
    return out;
  }, [model, key]);
  return useCallback(
    (side, label) => {
      if (!closed || !has || read === "withheld") return undefined;
      // A side with no figure says why on the small line, with the icons, so
      // the card keeps the priced card's height.
      const unavailable = (): PeakHeadFigure => ({
        figure: null,
        note: <span data-card-unavailable="">{unavailableWords(true)}</span>,
      });
      const notRecorded = (): PeakHeadFigure => ({
        figure: null,
        note: <span data-card-not-recorded="">{NOT_RECORDED}</span>,
      });
      if (read === "failed") return unavailable();
      // A done read with no model is an empty timeline: nothing recorded.
      if (!peaks) return read === "done" ? notRecorded() : { figure: <SkeletonBar width={96} figure /> };
      const state = peakState(peaks[side]);
      if (state === "unpriced") return unavailable();
      if (state === "not-recorded") return notRecorded();
      const { peak, unpriced } = peaks[side];
      if (!peak) return notRecorded();
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
      return {
        figure: <PeakFigure usd={peak.usd} info={info} />,
        note: <span data-card-peak-day="">Peak · {at}</span>,
        total: { usd: peak.usd, info, at },
      };
    },
    [closed, has, read, peaks],
  );
}

/** A listing row's figure for a closed side: its largest asset's highest
 *  recorded amount with that asset's own icon, as an open card draws "0.11"
 *  with its icon (`AssetAmount`), and no USD; `main` names the asset, so the
 *  small line under it lists only the others. A listing holds no flows
 *  timeline, so no peak day; "largest" is by the row's current prices (each
 *  amount × its price now), since raw balances across decimals do not
 *  compare. An asset with no price now, or whose decimals did not load, is
 *  not a candidate; none left, no figure. */
export function largestAssetFigure(
  assets: readonly {
    symbol: string;
    address: string | null;
    amount: number;
    usdNow: number | null;
    decimalsUnread?: true;
  }[],
): (PeakHeadFigure & { main: { symbol: string; address: string | null } }) | undefined {
  let best: (typeof assets)[number] | undefined;
  for (const a of assets)
    if (!a.decimalsUnread && a.usdNow != null && (!best || a.usdNow > (best.usdNow as number))) best = a;
  if (!best) return undefined;
  return {
    figure: (
      <span data-card-largest="">
        <AssetAmount value={best.amount} symbol={best.symbol} address={best.address ?? undefined} />
      </span>
    ),
    main: { symbol: best.symbol, address: best.address },
  };
}
