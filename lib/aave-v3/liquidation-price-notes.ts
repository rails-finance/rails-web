// The Aave-family liquidation price note — how far the seized asset's oracle
// price moved between this position's last row that touched it and the
// liquidation that seized it (rails-ops TO-DO-ui-jobs §32,
// architecture/market-notes.md §11).
// ----------------------------------------------------------------------------
// Shared by Aave V3 (Core / Prime / EtherFi) and SparkLend, which index the
// same Pool events the same way. A price-gap note, and the fifth home of that
// kind, but narrower than every other one because of what a row here carries:
//
//   ONE RESERVE'S PRICE PER ROW. A supply, withdraw, borrow, repay or transfer
//   states the price of the reserve it touched and of nothing else; a
//   liquidation states the seized collateral's price and the covered debt's; a
//   swap its two legs'. The rest of the account is unpriced at that block, so
//   no health factor and no runway can be stated, and a stretch that ends in an
//   adjustment has nothing to be measured against. Only a stretch that ends in
//   a liquidation is stated, and only for the asset it seized — whatever the
//   size of the move, because the liquidation is an outcome and the price it
//   happened at is part of reading it.
//
//   THE STRETCH IS THE SEIZED ASSET'S. The earlier end is this position's last
//   row, in an earlier block, that touched the seized reserve, and it must
//   state that reserve's price. Rows touching OTHER reserves can sit between
//   the two ends (the borrows a position draws against its collateral), and the
//   note says so: what it claims is that nothing this position did between
//   them touched the seized asset. A row that touched it without a stored
//   price is not skipped past — the note is simply not stated, because the
//   price at the start of the stretch is not in hand and is not read for it.
//
//   A LIQUIDATION CAN BE THE EARLIER END. On a run of liquidations the
//   previous liquidation states the seized asset's price at its block, and the
//   stretch between the two is the quiet one the later liquidation ends.
//   (Aave V4's selector does not take one; see its header.)
//
//   NEVER THE CAUSE. The note states the move and nothing more: the debt side
//   and the rest of the account move too, and a seized asset's price can rise
//   into its own liquidation (measured on V4: cbBTC +5.9%).
//
// Nothing is fetched. Both ends are fields of rows the timeline route already
// served — `price` / `collateralPrice` / `debtPrice` / `swap.receivedPrice`,
// the protocol oracle's answer at the row's block, stored by the price lanes.
//
// A GROUPED PAGE holds some rows in served folders, outside `events`. A folder
// that spans part of the stretch and moved the seized asset may hold its true
// earlier end, so the note is withheld there.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { MarketNotePoint, PriceGapNote } from "@/lib/shared/market-note";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { aaveFamilyLogIndex, noteScope, type AaveFamilyNoteOptions } from "./market-notes";

/** The fields this module reads, which the Aave V3 and Spark contexts share. */
interface FamilyPriceContext {
  eventType: string;
  reserve?: string;
  reserveSymbol?: string;
  collateralAsset?: string;
  collateralSymbol?: string;
  price?: { usd: number };
  collateralPrice?: { usd: number };
  debtPrice?: { usd: number };
  swap?: { receivedAsset?: string; receivedPrice?: { usd: number } };
}

const familyData = (e: BaseActivityEvent): FamilyPriceContext | null =>
  e.context?.protocol === "aave-v3" || e.context?.protocol === "spark"
    ? (e.context.data as unknown as FamilyPriceContext)
    : null;

const lc = (s: string | undefined | null): string => (s ?? "").toLowerCase();

const byChainOrder = (a: BaseActivityEvent, b: BaseActivityEvent): number =>
  a.blockNumber - b.blockNumber || aaveFamilyLogIndex(a.id) - aaveFamilyLogIndex(b.id);

/** Every reserve a row touched, with the price the row states for it (0 where
 *  it states none). Aave V3 names the row's own reserve in `reserve`; Spark
 *  does not, and both carry it as the first flow. A liquidation's covered
 *  debt is its second flow, a swap's received leg likewise. */
function touchedReserves(e: BaseActivityEvent, d: FamilyPriceContext): { reserve: string; price: number }[] {
  const usd = (p: { usd: number } | undefined): number => (p != null && p.usd > 0 ? p.usd : 0);
  if (d.eventType === "liquidation") {
    return [
      { reserve: lc(d.collateralAsset), price: usd(d.collateralPrice) },
      { reserve: lc(d.reserve) || lc(e.flows?.[1]?.token), price: usd(d.debtPrice) },
    ].filter((t) => t.reserve);
  }
  const out = [{ reserve: lc(d.reserve) || lc(e.flows?.[0]?.token), price: usd(d.price) }];
  if (d.eventType === "swap" && d.swap) {
    out.push({ reserve: lc(d.swap.receivedAsset) || lc(e.flows?.[1]?.token), price: usd(d.swap.receivedPrice) });
  }
  return out.filter((t) => t.reserve);
}

function rowPoint(e: BaseActivityEvent, kind: string, value: number): MarketNotePoint {
  return {
    block: e.blockNumber,
    timestamp: e.timestamp,
    value,
    eventId: e.id,
    txHash: lc(e.txHash),
    logIndex: aaveFamilyLogIndex(e.id),
    wallet: lc(e.wallet),
    kind,
  };
}

/**
 * One note per liquidation (per seized asset per block): the seized asset's
 * price at this position's last earlier row that touched it, and at the
 * liquidation. Not stated where:
 *
 *   - no earlier row touched the seized asset;
 *   - the rows at that block state no price for it;
 *   - the liquidation states no price for it;
 *   - a served folder spanning the stretch moved the seized asset;
 *   - the two prices are equal (one reading twice).
 */
export function aaveFamilyLiquidationPriceNotes(
  events: readonly BaseActivityEvent[],
  opts: Pick<AaveFamilyNoteOptions, "protocol" | "market">,
  folders?: readonly ServedFolder[] | null,
): PriceGapNote[] {
  const rows = events.filter((e) => familyData(e) != null).sort(byChainOrder);
  const scope = noteScope(opts);
  const seen = new Set<string>();
  const out: PriceGapNote[] = [];

  for (let j = 0; j < rows.length; j++) {
    const b = rows[j];
    const db = familyData(b);
    if (!db || db.eventType !== "liquidation") continue;
    const seized = lc(db.collateralAsset);
    if (!seized) continue;
    // Two liquidations of one asset in one block are one moment and one price.
    const key = `${seized}@${b.blockNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const priceB = db.collateralPrice != null && db.collateralPrice.usd > 0 ? db.collateralPrice.usd : 0;
    if (!(priceB > 0)) continue;

    // The newest earlier block in which this position touched the seized
    // reserve, and the last row there that states its price.
    let aBlock = -1;
    for (let i = j - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.blockNumber >= b.blockNumber) continue;
      if (aBlock >= 0 && r.blockNumber < aBlock) break;
      const d = familyData(r);
      if (d && touchedReserves(r, d).some((t) => t.reserve === seized)) aBlock = r.blockNumber;
    }
    if (aBlock < 0) continue;
    let a: { row: BaseActivityEvent; kind: string; price: number } | null = null;
    for (const r of rows) {
      if (r.blockNumber !== aBlock) continue;
      const d = familyData(r);
      const hit = d ? touchedReserves(r, d).find((t) => t.reserve === seized && t.price > 0) : undefined;
      if (d && hit) a = { row: r, kind: d.eventType, price: hit.price };
    }
    if (!a) continue;
    if (
      folders?.some(
        (f) => f.lastBlock >= aBlock && f.firstBlock <= b.blockNumber && f.legs.some((l) => lc(l.asset) === seized),
      )
    )
      continue;
    if (a.price === priceB) continue;

    const symbol = db.collateralSymbol ?? b.flows?.[0]?.tokenSymbol ?? seized.slice(0, 6);
    out.push({
      id: `price-gap:${scope}-${symbol.toLowerCase()}:${aBlock}-${b.blockNumber}`,
      kind: "price-gap",
      protocol: opts.protocol,
      marketSymbol: symbol,
      marketAddress: seized,
      unitLabel: `USD per ${symbol}`,
      from: rowPoint(a.row, a.kind, a.price),
      to: rowPoint(b, db.eventType, priceB),
      changePct: (priceB / a.price - 1) * 100,
      // Price-only: no runway is stated, so none is consumed — the shape
      // `PriceGapNote` documents for a note with no runway to measure.
      consumed: Infinity,
      runway: 0,
      endedBy: "liquidation",
    });
  }
  return out;
}
