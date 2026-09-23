import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";

/** A held-debt asset paired with its variable borrow rate. */
export interface AaveV4DebtRate {
  symbol: string;
  /** Variable borrow APR as a decimal string, e.g. "0.0435" = 4.35%. */
  apr: string;
}

/** Per-asset borrow rates for the debt this position holds, in display order.
 *
 *  Each entry pairs a held-debt asset with the TRUE per-block variable borrow
 *  rate the server attaches to it (`allDebts[].borrowAPR`, derived from the
 *  hub's on-chain `drawnRate`). De-duplicated by symbol, with the event's
 *  moved/primary asset (`ctx.reserveSymbol`) first so the leg the event acted
 *  on leads — the rest follow in `allDebts` order.
 *
 *  This is what makes the rate ASSET-AWARE: a position holding both USDC and
 *  USDT debt carries two different rates, and each card row labels which is
 *  which instead of silently surfacing whichever happened to be first.
 *
 *  Falls back to a single inferred entry (`ctx.borrowAPR` against the primary
 *  reserve) when the per-block pipeline hasn't enriched any debt item — the
 *  MV's inferred rate is noisy and runs ~0.5–0.7pp high for closely-spaced
 *  events, so it's a last resort. Returns [] when no rate is known. */
export function borrowRatesByDebt(ctx: AaveV4Context): AaveV4DebtRate[] {
  const rated = (ctx.allDebts ?? []).filter((d) => d.borrowAPR != null);
  if (rated.length === 0) {
    return ctx.borrowAPR && ctx.reserveSymbol ? [{ symbol: ctx.reserveSymbol, apr: ctx.borrowAPR }] : [];
  }
  const ordered = [
    ...rated.filter((d) => d.symbol === ctx.reserveSymbol),
    ...rated.filter((d) => d.symbol !== ctx.reserveSymbol),
  ];
  const seen = new Set<string>();
  const out: AaveV4DebtRate[] = [];
  for (const d of ordered) {
    if (seen.has(d.symbol)) continue;
    seen.add(d.symbol);
    out.push({ symbol: d.symbol, apr: d.borrowAPR! });
  }
  return out;
}

/** The single borrow rate to DISPLAY for an Aave V4 event — the primary/moved
 *  debt asset's rate (or the first held debt carrying one). Use this for compact
 *  surfaces (the header pill) where only one number fits; use `borrowRatesByDebt`
 *  for the expanded card so multi-debt positions show every leg's rate, labelled.
 *
 *  Returns a decimal string (e.g. "0.0307") or undefined when no rate is known. */
export function effectiveBorrowAPR(ctx: AaveV4Context): string | undefined {
  return borrowRatesByDebt(ctx)[0]?.apr;
}
