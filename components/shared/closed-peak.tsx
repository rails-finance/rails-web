"use client";

// A closed account card's head per side (rails-ops ui-jobs 803), the same on
// the listing row and the position page where the listing carries the
// account's peaks: the side's main asset (`pickMainAsset`,
// lib/shared/main-asset.ts) at its highest recorded balance in its token,
// drawn as an open card draws "0.11" with its icon (`AssetAmount`,
// `mainAssetFigure` below). The small line under it reads "Also supplied" or
// "Also borrowed" with the side's other assets (`assetsHead`,
// components/shared/position-card.tsx). The figure's receipt is the asset's
// highest-recorded receipt with one row stating why it leads, which the
// dropdown's line for that asset carries too; the C19 button's name carries
// the same statement.
//
// The side's one-day peak value lives in the position page's dropdown:
// `useClosedPeaks` computes it into `PositionCardHead.peak` (`withPeaks`), and
// `PeakLine` draws "Peak value $1.2M · 3 Mar 2025" under the dropdown's
// heading. The value is the side's held assets summed on the day they were
// worth the most, each valued as the Lifetime flows panel values that day
// (lib/shared/flows-peak.ts). It reads the flows timeline the page holds for
// that panel, so the card makes no read; it takes the page's flow model where
// the page passes one, else builds it once per timeline, and both sides come
// from one pass over its days. Rows match the card's assets by the timeline's
// key (a reserve's address, a market), else by symbol. Its receipt is the
// panel's held-figure receipt for that day (`heldDayProv`), named "Peak
// value, supplied" or "Peak value, debt".
//
// Where a side has no peak, the line says why, by cause:
//   - the read is running: a placeholder bar;
//   - the read failed: "Unavailable" (the Trove card's word for a read that
//     did not answer, components/trove/TroveDetailsBand.tsx);
//   - every held day had an unpriced asset: "price unavailable"
//     (`unavailableWords`), its receipt naming the assets;
//   - the timeline's events stated a balance for one of the side's assets
//     but no day's close holds it: "held within a day";
//   - they stated none: "not recorded" (`NOT_RECORDED`,
//     lib/shared/card-vocab.ts).
// Never a $0.

import { useCallback, useMemo, type ReactNode } from "react";
import { buildFlowModel, DAY_MS, type FlowModel, type FlowSide, type FlowTimeline } from "@/lib/shared/flows-timeline";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { keepByKey, peakState, sidePeaks } from "@/lib/shared/flows-peak";
import { CARD_VOCAB, NOT_RECORDED } from "@/lib/shared/card-vocab";
import { heldDayProv } from "@/lib/shared/flows-timeline-provenance";
import { listWords } from "@/lib/shared/flows-sum";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { unavailableWords } from "@/components/shared/position-card-panel";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import { AssetAmount } from "@/components/shared/asset-amount";
import type { AssetMark } from "@/lib/shared/asset-mark";
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

/** A side's peak for the dropdown's `PeakLine`: the value with its receipt
 *  and day, or why there is none. */
export interface PeakHeadFigure {
  /** The placeholder bar while the timeline is read. */
  figure?: ReactNode;
  /** Why the side has no peak, in words, with its receipt where it has one. */
  note?: ReactNode;
  /** The peak: its value, receipt and day. */
  total?: { usd: number; info: Provenance; at: string };
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
    // Each side and asset the timeline's events stated a balance for, once:
    // a side's evidence of being held, at a close or within a day.
    const stated = new Map<string, { side: FlowSide; asset: string; symbol: string }>();
    for (const d of timeline?.days ?? [])
      for (const b of d.balances)
        stated.set(`${b.side}:${b.asset}`, { side: b.side, asset: b.asset, symbol: b.symbol });
    const out = sidePeaks(
      model.heldAt,
      Math.round(model.start / DAY_MS),
      { collateral: keepByKey(coll), debt: keepByKey(debt) },
      [...stated.values()],
    );
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
    return { out };
  }, [model, timeline, key]);
  return useCallback(
    (side, label) => {
      if (!closed || !has || read === "withheld") return undefined;
      // A side with no figure says why on the small line, with the icons, so
      // the card keeps the priced card's height.
      const words = (text: string, hook: string, prov?: Provenance): PeakHeadFigure => ({
        note: <span {...{ [hook]: "" }}>{prov ? <Prov info={prov}>{text}</Prov> : text}</span>,
      });
      if (read === "failed") return words(READ_FAILED, "data-card-unavailable");
      // A done read with no timeline is an empty one: nothing recorded. A
      // timeline whose model is not in hand yet is still loading.
      if (!peaks)
        return read === "done" && !timeline
          ? words(NOT_RECORDED, "data-card-not-recorded")
          : { figure: <SkeletonBar width={96} figure /> };
      const result = peaks.out[side];
      const state = peakState(result);
      if (state === "unpriced")
        return words(unavailableWords(true), "data-card-unavailable", {
          kind: "derived",
          summary: `Peak value, ${label.toLowerCase()}. No day the side was held has a dollar figure.`,
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
      const prov = heldDayProv(`Peak value, ${label.toLowerCase()}`, at, peak.rows, formatCompactUsd);
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
      return { total: { usd: peak.usd, info, at } };
    },
    [closed, has, read, timeline, peaks],
  );
}

/** How the main asset was picked: "largest by value at the oracle price,
 *  block 21,345,678" in the receipt, "largest by value at the oracle price"
 *  in the button's name (`withBlock` false). Where the pick passed over
 *  assets with no price or no decimals, "largest priced …; 2 unpriced". */
function rankingWords(block: number | null | undefined, skipped: number, withBlock: boolean): string {
  const head = skipped > 0 ? "largest priced" : "largest by value";
  const basis = !withBlock
    ? "at the oracle price"
    : block != null
      ? `at the oracle price, block ${block.toLocaleString("en-US")}`
      : "at the latest oracle price";
  return `${head} ${basis}${skipped > 0 ? `; ${skipped} unpriced` : ""}`;
}

/** The face's figure for a side's main asset, and `info`: its receipt with
 *  the ranking row, which the dropdown's line for the asset carries too. */
export function mainAssetFigure(o: {
  main: { symbol: string; address: string | null; amount: number; exact?: string };
  /** The asset's highest-recorded receipt (the dropdown line's). */
  receipt: Provenance;
  /** The block the prices were read at, where the read names one. */
  block: number | null | undefined;
  /** Assets the pick passed over (`pickMainAsset`). */
  skipped: number;
  side: "supply" | "debt";
  /** False for a side that holds one asset: no pick, so no ranking row. */
  ranked?: boolean;
}): { figure: ReactNode; main: AssetMark; state: string; also: string; info: Provenance } {
  const { main } = o;
  const ranked = o.ranked !== false;
  const info: Provenance = ranked
    ? {
        ...o.receipt,
        inputs: [
          ...(o.receipt.inputs ?? []),
          { label: "shown first", value: main.symbol, kind: "derived", note: rankingWords(o.block, o.skipped, true) },
        ],
      }
    : o.receipt;
  return {
    figure: (
      <span data-card-largest="">
        <Prov info={info}>
          <AssetAmount
            value={main.amount}
            symbol={main.symbol}
            address={main.address ?? undefined}
            {...(main.exact ? { exact: main.exact } : {})}
          />
        </Prov>
      </span>
    ),
    main: { symbol: main.symbol, address: main.address },
    state: ranked
      ? `${formatCompact(main.amount)} ${main.symbol}, ${rankingWords(o.block, o.skipped, false)}`
      : `${formatCompact(main.amount)} ${main.symbol}`,
    also: o.side === "debt" ? "Also borrowed" : "Also supplied",
    info,
  };
}

/** The side's word in the peak's receipt name ("Peak value, supplied"):
 *  the face label without its "Peak". */
const sideWord = (h: { id: string; label: string }): string =>
  h.id === "peak-debt"
    ? "debt"
    : h.label === CARD_VOCAB.headCollateral
      ? "collateral"
      : h.label === CARD_VOCAB.headSupplied
        ? "supplied"
        : h.label;

/** A detail card's closed heads with their one-day peak value in
 *  `PositionCardHead.peak`, for the dropdown's `PeakLine`. */
export function withPeaks<H extends { id: string; label: string }>(
  heads: H[],
  peakOf: (side: FlowSide, label: string) => PeakHeadFigure | undefined,
  detail: boolean,
): (H & { peak?: PeakHeadFigure })[] {
  if (!detail) return heads;
  return heads.map((h) =>
    h.id.startsWith("peak-") ? { ...h, peak: peakOf(h.id === "peak-debt" ? "debt" : "collateral", sideWord(h)) } : h,
  );
}

/** The position page's dropdown line for a closed side's peak, under the
 *  dropdown's heading: "Peak value $2.9M · 1 Oct 2026" with its receipt, or
 *  the state's words in its place ("price unavailable" with its receipt,
 *  "held within a day", "not recorded"), or the placeholder bar while the
 *  timeline is read. The face never draws it. */
export function PeakLine({ peak }: { peak: PeakHeadFigure }) {
  return (
    <p className="-mt-1 mb-3 text-xs text-rb-500" data-card-peak-line="">
      {peak.total ? (
        <>
          Peak value{" "}
          <span data-card-peak="">
            <RevealTip tip={formatUsdValue(peak.total.usd)}>
              <Prov info={peak.total.info}>{formatCompactUsd(peak.total.usd)}</Prov>
            </RevealTip>
          </span>{" "}
          · <span data-card-peak-day="">{peak.total.at}</span>
        </>
      ) : (
        (peak.note ?? peak.figure)
      )}
    </p>
  );
}
