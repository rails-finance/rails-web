// Polaris — the PSM's mints and redemptions in each closed gap between two of
// a CDP's touches, as one row (rails-ops TO-DO-ui-jobs 402). Every PSM trade
// changes every open CDP's collateral and debt pro rata; the stored figures
// catch up at the CDP's next touch, which writes the net share into its log
// (`_mintRedeemCollGain`, `_mintRedeemDebtGain`). So each touch that wrote a
// share closes one gap, and the gap's row anchors on that touch. The open gap
// (since the last touch) is the live window's row.
//
// The trades in a gap are counted from the market's PrimaryRateSet count at
// each touch (`rateSet.ordinal`, served on the timeline row): the primary rate
// is re-set at every PSM mint and redemption. The mints and redemptions one by
// one are not served to this page.

import type { BaseActivityEvent, PolarisContext } from "@/lib/shared/types/event-shape";
import type { MarketNotePoint, PsmGapNote } from "@/lib/shared/market-note";
import { POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";

const num = (s?: string | null): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

type PolarisRow = BaseActivityEvent & { context: { protocol: "polaris"; data: PolarisContext } };
const isPolaris = (e: BaseActivityEvent): e is PolarisRow => e.context?.protocol === "polaris";

const point = (e: PolarisRow): MarketNotePoint => ({
  block: e.blockNumber,
  timestamp: e.timestamp,
  value: 0,
  eventId: e.id,
  txHash: e.txHash ?? "",
  logIndex: 0,
  wallet: "",
  kind: e.context.data.eventType,
});

/** One row per touch that wrote a PSM share, spanning the gap from the
 *  previous touch. `events` in any order. */
export function polarisPsmGapNotes(events: readonly BaseActivityEvent[], cdpId: string): PsmGapNote[] {
  const touches = events
    .filter(isPolaris)
    .filter((e) => e.context.data.eventType !== "transfer")
    .sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  const out: PsmGapNote[] = [];
  for (let i = 1; i < touches.length; i++) {
    const a = touches[i - 1];
    const b = touches[i];
    const d = b.context.data;
    const coll = num(d.mintRedeemCollGain);
    const debt = num(d.mintRedeemDebtGain);
    if (coll === 0 && debt === 0) continue;
    const from = a.context.data.rateSet?.ordinal;
    const to = d.rateSet?.ordinal;
    const cfg = POLARIS_MARKET_CONFIG[d.market];
    out.push({
      kind: "psm-gap",
      id: `psm-gap:${d.market}:${a.blockNumber}-${b.blockNumber}`,
      marketSymbol: d.stableSymbol,
      marketAddress: cfg.stable.address,
      unitLabel: d.stableSymbol,
      from: point(a),
      to: point(b),
      market: d.market,
      cdpId,
      trades: from != null && to != null && to >= from ? to - from : null,
      ordinals: from != null && to != null && to >= from ? [from, to] : null,
      collShare: coll,
      debtShare: debt,
      collShareRaw: d.raw?.mintRedeemCollGain ?? undefined,
      debtShareRaw: d.raw?.mintRedeemDebtGain ?? undefined,
      priceAtTouch: d.priceAtBlock?.pethInDebt ?? null,
    });
  }
  return out;
}

export const isPsmGapNote = (x: unknown): x is PsmGapNote => (x as PsmGapNote)?.kind === "psm-gap";
