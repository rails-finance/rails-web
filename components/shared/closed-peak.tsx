"use client";

// A closed account card's peak value per side (rails-ops ui-jobs 803): the
// figure "$1.2M" with "Peak · 3 Mar 2025" on the small line under it, the
// side's held assets summed on the day they were worth the most, each valued
// as the Lifetime flows panel values that day (lib/shared/flows-peak.ts). It
// reads the flows timeline the page holds for that panel, so the card makes
// no read; it takes the page's flow model where the page passes one, else
// builds it once per timeline, and both sides come from one pass over its
// days. Rows match the card's assets by the timeline's key (a reserve's
// address, a market), else by symbol. The figure's receipt is the panel's
// held-figure receipt for that day (`heldDayProv`); inside the card's C19
// button it stays inert, and the dropdown's heading carries it.
//
// The small line states why a side has no figure, by cause:
//   - the read is running: a placeholder bar in the figure's place;
//   - the read failed: "Unavailable" (the Trove card's word for a read that
//     did not answer, components/trove/TroveDetailsBand.tsx);
//   - every held day had an unpriced asset: "price unavailable"
//     (`unavailableWords`), its receipt naming the assets;
//   - the timeline has days but no day's close holds the side: "held within
//     a day";
//   - the timeline has no days, or none of the card's assets: "not
//     recorded" (`NOT_RECORDED`, lib/shared/card-vocab.ts).
// Never a $0.

import { useCallback, useMemo, type ReactNode } from "react";
import { buildFlowModel, DAY_MS, type FlowModel, type FlowSide, type FlowTimeline } from "@/lib/shared/flows-timeline";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { keepByKey, peakState, sidePeaks } from "@/lib/shared/flows-peak";
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

/** The flows timeline a detail page holds for its Lifetime flows panel,
 *  where its read stands, and the page's model of it where the page builds
 *  one (its flow-focus value). */
export interface ClosedPeakFlows {
  read: FlowsRead;
  timeline: FlowTimeline | null;
  model?: FlowModel | null;
}

/** One asset a closed side lists: its symbol, and its key in the timeline
 *  (a reserve's address, a cToken or Dolomite market). */
export interface ClosedPeakAsset {
  symbol: string;
  key?: string | null;
}

/** A head's peak: the figure, the small line's words under it and, where
 *  there is one, the total the dropdown's heading states with its receipt.
 *  `state`: the words a figureless side's button name carries. */
export interface PeakHeadFigure {
  /** Null: no dollar figure; `note` says why. */
  figure: ReactNode | null;
  /** The small line's words under the figure, before the icons. */
  note?: ReactNode;
  total?: { usd: number; info: Provenance; at: string };
  state?: string;
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

/** The Trove card's word for a read that did not answer. */
const READ_FAILED = "Unavailable";
const WITHIN_DAY = "held within a day";

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
  const given = closed ? flows?.model : null;
  // The page's model where it passes one; else one build per timeline.
  const built = useMemo(() => (given === undefined && timeline ? buildFlowModel(timeline) : null), [given, timeline]);
  const model = given ?? built;
  const read = flows?.read;
  const has = !!flows;
  // The sides' assets as a key, so a new array each render does not rescan.
  const key = JSON.stringify([held.collateral, held.debt].map((xs) => xs.map((x) => [x.symbol, x.key ?? null])));
  const peaks = useMemo(() => {
    if (!model) return null;
    const [coll, debt] = (JSON.parse(key) as [string, string | null][][]).map((xs) =>
      xs.map(([symbol, k]) => ({ symbol, key: k })),
    );
    // The card's name for each asset, for the receipt's rows.
    const nameOf = new Map<string, string>();
    for (const a of [...coll, ...debt]) if (a.key) nameOf.set(a.key.toLowerCase(), a.symbol);
    const out = sidePeaks(model.heldAt, Math.round(model.start / DAY_MS), {
      collateral: keepByKey(coll),
      debt: keepByKey(debt),
    });
    for (const side of ["collateral", "debt"] as const) {
      const p = out[side].peak;
      if (p) p.rows = p.rows.map((r) => ({ ...r, symbol: nameOf.get(r.asset?.toLowerCase() ?? "") ?? r.symbol }));
      // In development, say why a side has no peak: rows the card's assets
      // did not match, unpriced days, or no held row above zero at a close.
      const card = side === "collateral" ? coll : debt;
      if (!p && card.length > 0 && process.env.NODE_ENV !== "production")
        console.warn(`[closed-peak] no ${side} peak`, {
          days: model.heldAt.length,
          unmatched: out[side].unmatched,
          unpriced: out[side].unpriced,
          card: card.map((a) => a.symbol),
        });
    }
    return { out, days: model.heldAt.length };
  }, [model, key]);
  return useCallback(
    (side, label) => {
      if (!closed || !has || read === "withheld") return undefined;
      // A side with no figure says why on the small line, with the icons, so
      // the card keeps the priced card's height.
      const words = (text: string, hook: string, prov?: Provenance): PeakHeadFigure => ({
        figure: null,
        note: <span {...{ [hook]: "" }}>{prov ? <Prov info={prov}>{text}</Prov> : text}</span>,
        state: text,
      });
      if (read === "failed") return words(READ_FAILED, "data-card-unavailable");
      // A done read with no timeline is an empty one: nothing recorded. A
      // timeline whose model is not in hand yet is still loading.
      if (!peaks)
        return read === "done" && !timeline
          ? words(NOT_RECORDED, "data-card-not-recorded")
          : { figure: <SkeletonBar width={96} figure />, state: "loading" };
      const result = peaks.out[side];
      const state = peakState(result, peaks.days);
      if (state === "unpriced")
        return words(unavailableWords(true), "data-card-unavailable", {
          kind: "derived",
          summary: `Peak ${label.toLowerCase()}. No day the side was held has a dollar figure.`,
          inputs: [
            {
              label: "assets without a price",
              value: listWords(result.unpriced),
              kind: "derived",
              note: "days when one of these had no price are left out",
            },
          ],
        });
      if (state === "within-day") return words(WITHIN_DAY, "data-card-held-within-day");
      const { peak, unpriced } = result;
      if (state === "not-recorded" || !peak) return words(NOT_RECORDED, "data-card-not-recorded");
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
                label: "assets without a price",
                value: listWords(unpriced),
                kind: "derived",
                note: "days when one of these had no price are left out",
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
    [closed, has, read, timeline, peaks],
  );
}

/** A listing row's figure for a closed side: its largest asset's highest
 *  recorded amount with that asset's icon, as an open card draws "0.11"
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
