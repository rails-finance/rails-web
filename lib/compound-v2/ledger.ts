// Compound V2 rows → the shared cToken ledger (lib/shared/ctoken-ledger.ts).
//
// A Compound V2 row carries no price of its own (the liquidation row aside),
// so the dollars come from the page's at-block oracle read
// (/api/chain/compound-v2/prices-at), keyed `${block}:${market}`. A row whose
// pair is missing from that map is unpriced, and its leg falls back to today's
// price with the receipt saying so.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundV2Event } from "@/lib/shared/types/event-shape";
import {
  reduceCTokenLedger,
  sortByLog,
  type LedgerKind,
  type LedgerMarket,
  type LedgerRow,
} from "@/lib/shared/ctoken-ledger";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";

export const priceKey = (block: number, market: string) => `${block}:${market}`;

/** Every (block, market) pair the ledger would price, for the at-block read. */
export function compoundV2PricePairs(events: readonly BaseActivityEvent[]): string[] {
  const out = new Set<string>();
  for (const e of events) if (isCompoundV2Event(e)) out.add(priceKey(e.blockNumber, e.context.data.market));
  return [...out];
}

const num = (s: string | undefined): number | undefined => {
  if (s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function compoundV2LedgerRows(
  events: readonly BaseActivityEvent[],
  prices: ReadonlyMap<string, number> | null,
): LedgerRow[] {
  const sorted = sortByLog(events.filter(isCompoundV2Event));
  return sorted.map((e) => {
    const d = e.context.data;
    const kind: LedgerKind =
      d.eventType === "seize_out"
        ? "seize_liquidator"
        : d.eventType === "seize_burn"
          ? "seize_protocol"
          : (d.eventType as LedgerKind);
    const amount = num(d.assetsDelta);
    return {
      market: d.market,
      symbol: d.marketSymbol,
      address: COMPOUND_V2_MARKET_BY_KEY[d.market]?.underlying ?? undefined,
      kind,
      amount: amount != null ? Math.abs(amount) : undefined,
      supplyBefore: num(d.supplyBefore),
      supplyAfter: num(d.supplyAfter),
      debtBefore: num(d.debtBefore),
      debtAfter: num(d.debtAfter),
      price: prices?.get(priceKey(e.blockNumber, d.market)) ?? null,
    };
  });
}

export function compoundV2Ledger(
  events: readonly BaseActivityEvent[],
  prices: ReadonlyMap<string, number> | null,
): LedgerMarket[] {
  return reduceCTokenLedger(compoundV2LedgerRows(events, prices), { repaidIncludesLiquidations: false });
}
