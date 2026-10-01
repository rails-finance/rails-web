// Moonwell rows → the cToken family's Lifetime flows replay
// (lib/shared/ctoken-flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Moonwell"). Both deployments: Ethereum keys a market by a short tag
// ('usdc'), Base by its mToken address; `mtokenOf` names the mToken either way.
// ----------------------------------------------------------------------------
// Every Moonwell row states its market's balances before and after it (the
// supply as mTokens × the exchange rate at the row's block, the debt as the
// emitted accountBorrows), so the rows map onto the replay one for one, with
// two differences from Compound V2:
//
//   • A liquidation's debt move rides the liquidator's RepayBorrow row: that
//     row (same transaction, same market, paid by the liquidation's
//     liquidator) is booked as the liquidation, and the liquidation row
//     itself, which states no balance, moves nothing.
//   • Its seizure arrives as two mToken transfers out of the borrower: the one
//     to the liquidator (`seize_liquidator`) and the one to the market itself,
//     the protocol's share (`seize_protocol`). One transaction can liquidate
//     the account more than once, on different collateral, so each transfer is
//     matched to the liquidation that seized its market.
//
// Prices: every row carries its market's oracle price at its block (server
// migs 195 on Base, 325 on Ethereum); a row without one takes the nearest
// priced row's on its market, and the Explanation counts them.

import type { BaseActivityEvent, MoonwellContext } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import { sortByLog, type LedgerKind } from "@/lib/shared/ctoken-ledger";
import type { CTokenFlowRow } from "@/lib/shared/ctoken-flows";
import { externalActor } from "@/lib/shared/external-actor";

const num = (s: string | undefined | null): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const lower = (s: string | undefined | null) => (s ?? "").toLowerCase();

/** The underlying's decimals, from any field the row states both raw and
 *  scaled. */
function decimalsOf(c: MoonwellContext): number | null {
  const pairs: [string | undefined, string | undefined][] = [
    [c.raw?.amount, c.assetsDelta],
    [c.raw?.supplyAfter, c.supplyAfter],
    [c.raw?.supplyBefore, c.supplyBefore],
    [c.raw?.debtAfter, c.debtAfter],
    [c.raw?.debtBefore, c.debtBefore],
  ];
  for (const [raw, human] of pairs) {
    const r = Math.abs(Number(raw));
    const h = Math.abs(Number(human));
    if (!(r > 1e3) || !(h > 0) || !Number.isFinite(r) || !Number.isFinite(h)) continue;
    const d = Math.round(Math.log10(r / h));
    if (d >= 0 && d <= 36) return d;
  }
  return null;
}

/** What each row of a liquidation's transaction was: the repay the
 *  liquidator made, a seizure leg (the liquidator's or the protocol's), or
 *  nothing special. Keyed by event id. */
function liquidationRoles(
  events: readonly (BaseActivityEvent & { context: { data: MoonwellContext } })[],
  mtokenOf: (market: string) => string,
): Map<string, LedgerKind> {
  const byTx = new Map<string, MoonwellContext[]>();
  for (const e of events)
    if (e.context.data.eventType === "liquidation") {
      const list = byTx.get(e.txHash) ?? [];
      list.push(e.context.data);
      byTx.set(e.txHash, list);
    }
  const out = new Map<string, LedgerKind>();
  for (const e of events) {
    const liqs = byTx.get(e.txHash);
    if (!liqs) continue;
    const c = e.context.data;
    if (c.eventType === "repay") {
      const payer = lower(c.caller);
      if (liqs.some((l) => mtokenOf(l.market) === mtokenOf(c.market) && lower(l.liquidator ?? l.caller) === payer))
        out.set(e.id, "liquidation");
    } else if (c.eventType === "transfer_out") {
      const to = lower(c.counterparty);
      const on = liqs.filter((l) => l.collateralMarket && mtokenOf(l.collateralMarket) === mtokenOf(c.market));
      if (on.length === 0) continue;
      if (to === mtokenOf(c.market)) out.set(e.id, "seize_protocol");
      else if (on.some((l) => lower(l.liquidator ?? l.caller) === to)) out.set(e.id, "seize_liquidator");
    }
  }
  return out;
}

/** The page's rows as the replay reads them, oldest first. `mtokenOf` maps a
 *  market key to its mToken address (lowercased). */
export function moonwellFlowRows(
  events: readonly BaseActivityEvent[],
  mtokenOf: (market: string) => string,
): CTokenFlowRow[] {
  const rows = sortByLog(events.filter(isMoonwellEvent));
  const roles = liquidationRoles(rows, mtokenOf);
  // Each market's decimals, from any of its rows.
  const decimals = new Map<string, number>();
  for (const e of rows) {
    const d = decimals.has(e.context.data.market) ? null : decimalsOf(e.context.data);
    if (d != null) decimals.set(e.context.data.market, d);
  }
  return rows.map((e) => {
    const c = e.context.data;
    const kind: LedgerKind = roles.get(e.id) ?? c.eventType;
    const supply = c.side === "supply" && c.eventType !== "liquidation";
    const debt = c.side === "debt" && (c.eventType === "borrow" || c.eventType === "repay");
    // Underlying per whole mToken at the block: the oracle-at-block read's
    // exchangeRateStored (scaled 1e(18 + decimals − 8)), else the row's own
    // balance over its mTokens.
    const dec = decimals.get(c.market);
    const raw = num(c.raw?.exchangeRateRaw);
    let exchangeRate = raw != null && dec != null ? raw / 10 ** (10 + dec) : null;
    if (exchangeRate == null || !(exchangeRate > 0)) {
      const s = num(c.supplyAfter);
      const m = num(c.mTokensAfter);
      exchangeRate = s != null && m != null && m > 0 ? s / m : null;
    }
    const price = c.priceAtBlock?.usd;
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind,
      market: c.market,
      symbol: c.marketSymbol,
      supplyBefore: supply ? num(c.supplyBefore) : null,
      supplyAfter: supply ? num(c.supplyAfter) : null,
      debtBefore: debt ? num(c.debtBefore) : null,
      debtAfter: debt ? num(c.debtAfter) : null,
      exchangeRate: supply && exchangeRate != null && Number.isFinite(exchangeRate) ? exchangeRate : null,
      amount: c.assetsDelta != null && c.eventType !== "liquidation" ? Math.abs(Number(c.assetsDelta)) : null,
      price: price != null && price > 0 ? price : null,
      byOwner:
        kind === "transfer_in" || kind === "seize_liquidator" || kind === "seize_protocol" || kind === "liquidation"
          ? false
          : externalActor({ txFrom: c.txFrom, poolCaller: c.caller }, e.wallet) == null,
    };
  });
}

/** The daily price store's series key for a market (rails-ops
 *  reference/daily-prices.md): `moonwell:<mToken>` on both chains. */
export const moonwellSeriesKey = (mtoken: string) => `moonwell:${mtoken.toLowerCase()}`;
