// Moonwell rows → the shared cToken ledger (lib/shared/ctoken-ledger.ts).
//
// Every Moonwell row carries its market's oracle price at its block
// (`priceAtBlock`), so the dollars need no extra read. A liquidation's seizure
// arrives as two mToken transfers out of the borrower in the liquidation's
// transaction: the one to the liquidator and the one to the market itself (the
// protocol's share, kept as reserves). They are told apart here, so the flows
// panel books them as seized collateral rather than as transfers the owner
// made.

import type { BaseActivityEvent, MoonwellContext } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import {
  reduceCTokenLedger,
  sortByLog,
  type LedgerKind,
  type LedgerMarket,
  type LedgerRow,
} from "@/lib/shared/ctoken-ledger";

const num = (s: string | undefined): number | undefined => {
  if (s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** What a transfer out of the account in a liquidation's transaction was:
 *  the liquidator's part, the market's (protocol) part, or neither. */
export function moonwellSeizeRole(
  ctx: MoonwellContext,
  liquidation: MoonwellContext | undefined,
  mtokenOf: (market: string) => string | undefined,
): "liquidator" | "protocol" | null {
  if (ctx.eventType !== "transfer_out" || !liquidation) return null;
  if (liquidation.collateralMarket && liquidation.collateralMarket !== ctx.market) return null;
  const to = ctx.counterparty?.toLowerCase();
  if (to && to === mtokenOf(ctx.market)?.toLowerCase()) return "protocol";
  return "liquidator";
}

/** The liquidation row of each transaction, keyed by tx hash. */
export function liquidationsByTx(events: readonly BaseActivityEvent[]): Map<string, MoonwellContext> {
  const out = new Map<string, MoonwellContext>();
  for (const e of events)
    if (isMoonwellEvent(e) && e.context.data.eventType === "liquidation") out.set(e.txHash, e.context.data);
  return out;
}

export function moonwellLedger(
  events: readonly BaseActivityEvent[],
  opts: {
    mtokenOf: (market: string) => string | undefined;
    addressOf: (market: string) => string | undefined;
  },
): LedgerMarket[] {
  const liqs = liquidationsByTx(events);
  const rows: LedgerRow[] = sortByLog(events.filter(isMoonwellEvent)).map((e) => {
    const d = e.context.data;
    const role = moonwellSeizeRole(d, liqs.get(e.txHash), opts.mtokenOf);
    const kind: LedgerKind =
      role === "liquidator" ? "seize_liquidator" : role === "protocol" ? "seize_protocol" : (d.eventType as LedgerKind);
    const amount = num(d.assetsDelta);
    return {
      market: d.market,
      symbol: d.marketSymbol,
      address: opts.addressOf(d.market),
      kind,
      amount: amount != null ? Math.abs(amount) : undefined,
      supplyBefore: num(d.supplyBefore),
      supplyAfter: num(d.supplyAfter),
      debtBefore: num(d.debtBefore),
      debtAfter: num(d.debtAfter),
      price: d.priceAtBlock?.usd ?? null,
    };
  });
  return reduceCTokenLedger(rows, { repaidIncludesLiquidations: true });
}
