// Compound V2 rows → the cToken family's Lifetime flows replay
// (lib/shared/ctoken-flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Compound V2").
// ----------------------------------------------------------------------------
// Every Compound V2 row states its market's balances before and after it (the
// supply as cTokens × the exchange rate at the row's block, server mig 353;
// the debt as the emitted accountBorrows), and a liquidation is one row with
// its repay leg merged in (mig 119), so the rows map onto the family's replay
// one for one: the seizure legs are the borrower's collateral taken (the
// liquidator's and the protocol's), and a `seize_in` is collateral this
// account took as a liquidator.
//
// Prices: a liquidation row after the oracle's USD switch (block 10,678,764,
// 17 Aug 2020) carries both legs' oracle prices at its block (mig 151); every
// other row is priced by /api/chain/compound-v2/prices-at (the Comptroller's
// oracle at the block; before the switch the oracle priced in ETH, and the
// route turns that into dollars with the same oracle's USDC price at the
// block). At most `COMPOUND_V2_PRICE_PAIRS` pairs are read per page, spread
// over each market's history; a row not read takes the nearest priced row's
// price on its market.

import type { BaseActivityEvent, CompoundV2Context } from "@/lib/shared/types/event-shape";
import { isCompoundV2Event } from "@/lib/shared/types/event-shape";
import { sortByLog, type LedgerKind } from "@/lib/shared/ctoken-ledger";
import type { CTokenFlowRow } from "@/lib/shared/ctoken-flows";
import { externalActor } from "@/lib/shared/external-actor";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { compoundV2LiquidationValues } from "@/lib/compound-v2/liquidation-values";

/** The prices-at route's cap: one read per page. */
export const COMPOUND_V2_PRICE_PAIRS = 400;

export const priceKey = (block: number, market: string) => `${block}:${market}`;

const num = (s: string | undefined | null): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Oldest first: by block, then by the log index the row's id ends with. */
const ascending = (events: readonly BaseActivityEvent[]) => sortByLog(events.filter(isCompoundV2Event));

/** The oracle prices the liquidation rows carry, by `${block}:${market}`:
 *  both legs, where the row is in the oracle's USD years. */
export function compoundV2RowPrices(events: readonly BaseActivityEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (!isCompoundV2Event(e)) continue;
    const c = e.context.data;
    if (c.eventType !== "liquidation" || c.priceNumeraire !== "USD") continue;
    const v = compoundV2LiquidationValues(c);
    if (!v) continue;
    out.set(priceKey(e.blockNumber, c.market), v.debtPrice);
    if (c.collateralMarket) out.set(priceKey(e.blockNumber, c.collateralMarket), v.collPrice);
  }
  return out;
}

/** The (block, market) pairs the replay still needs read, at most `cap`:
 *  every pair where they fit, else each market's share of the cap spread
 *  evenly over its history, its first and last rows included. */
export function compoundV2PricePairs(
  events: readonly BaseActivityEvent[],
  known: ReadonlyMap<string, number>,
  cap = COMPOUND_V2_PRICE_PAIRS,
): string[] {
  const byMarket = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const e of ascending(events)) {
    const k = priceKey(e.blockNumber, e.context.data.market);
    if (seen.has(k) || known.has(k)) continue;
    seen.add(k);
    const list = byMarket.get(e.context.data.market) ?? [];
    list.push(k);
    byMarket.set(e.context.data.market, list);
  }
  const all = [...byMarket.values()].flat();
  if (all.length <= cap) return all;
  const out: string[] = [];
  for (const list of byMarket.values()) {
    const quota = Math.max(1, Math.floor((cap * list.length) / all.length));
    if (list.length <= quota) out.push(...list);
    else if (quota === 1) out.push(list[list.length - 1]);
    else for (let i = 0; i < quota; i++) out.push(list[Math.round((i * (list.length - 1)) / (quota - 1))]);
  }
  return [...new Set(out)].slice(0, cap);
}

const KIND: Record<CompoundV2Context["eventType"], LedgerKind> = {
  mint: "mint",
  redeem: "redeem",
  borrow: "borrow",
  repay: "repay",
  liquidation: "liquidation",
  transfer_in: "transfer_in",
  transfer_out: "transfer_out",
  seize_out: "seize_liquidator",
  seize_burn: "seize_protocol",
  seize_in: "seize_in",
};

/** The page's rows as the replay reads them, oldest first; `prices` USD per
 *  underlying by `${block}:${market}` (the rows' own and the route's). */
export function compoundV2FlowRows(
  events: readonly BaseActivityEvent[],
  prices: ReadonlyMap<string, number> | null,
): CTokenFlowRow[] {
  return ascending(events).map((e) => {
    const c = e.context.data;
    const m = COMPOUND_V2_MARKET_BY_KEY[c.market];
    const rawRate = c.raw?.exchangeRate;
    // The raw exchange rate is scaled 1e(18 + underlying decimals − 8):
    // underlying per whole cToken is that over 1e(10 + decimals).
    const exchangeRate = rawRate && m ? Number(rawRate) / 10 ** (10 + m.decimals) : null;
    const supply = c.side === "supply";
    const price = prices?.get(priceKey(e.blockNumber, c.market));
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind: KIND[c.eventType],
      market: c.market,
      symbol: c.marketSymbol,
      supplyBefore: supply ? num(c.supplyBefore) : null,
      supplyAfter: supply ? num(c.supplyAfter) : null,
      debtBefore: supply ? null : num(c.debtBefore),
      debtAfter: supply ? null : num(c.debtAfter),
      exchangeRate: exchangeRate != null && Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : null,
      amount: c.assetsDelta != null ? Math.abs(Number(c.assetsDelta)) : null,
      price: price != null && price > 0 ? price : null,
      byOwner:
        c.eventType === "transfer_in" || c.eventType === "seize_out" || c.eventType === "seize_burn"
          ? false
          : c.eventType === "liquidation"
            ? false
            : externalActor({ txFrom: c.txFrom, poolCaller: c.caller }, e.wallet) == null,
    };
  });
}

/** How many rows of the history fall in the oracle's ETH years. */
export function compoundV2EthEraRows(rows: readonly CTokenFlowRow[]): number {
  return rows.filter((r) => r.block < 10_678_764).length;
}
