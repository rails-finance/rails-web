// A Moonwell account's supply in dollars, at Moonwell's oracle prices
// (rails-ops ui-jobs 644). The card's "Supplied" headline is every supplied
// market, entered or not; the collateral figures are the entered markets.
// Pure, with no imports, so scripts/test runs it.

export interface SupplyLine {
  /** Underlying token address; the price keys on it, lower case. */
  address: string;
  /** Underlying now (interest included), where read. */
  current: number | null;
  /** Replayed principal, the fallback. */
  principal: number;
}

/** The figure a line asserts: the current value, else the principal. */
export const supplyAmountOf = (r: SupplyLine): number => r.current ?? r.principal;

/** Σ amount × price over lines with an amount; null when any such line has
 *  no price (a partial total is never stated) or none has an amount. */
export function linesUsd(
  lines: { address: string; amount: number }[],
  prices: Record<string, number> | undefined,
): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    if (l.amount <= 0) continue;
    const p = prices?.[l.address.toLowerCase()];
    if (!(typeof p === "number" && p > 0)) return null;
    sum += l.amount * p;
    any = true;
  }
  return any ? sum : null;
}

/** Every supplied market, entered or not: the "Supplied" headline. */
export function suppliedUsd(supplies: SupplyLine[], prices: Record<string, number> | undefined): number | null {
  return linesUsd(
    supplies.map((r) => ({ address: r.address, amount: supplyAmountOf(r) })),
    prices,
  );
}

/** Whether a market counts as collateral: entered, or no entered list read. */
export const isEnteredIn = (entered: { underlying: string }[] | undefined, address: string): boolean =>
  !entered || entered.some((e) => e.underlying === address.toLowerCase());

/** The entered markets alone: what backs borrowing. */
export function enteredUsd(
  supplies: SupplyLine[],
  prices: Record<string, number> | undefined,
  entered: { underlying: string }[] | undefined,
): number | null {
  return suppliedUsd(
    supplies.filter((r) => isEnteredIn(entered, r.address)),
    prices,
  );
}
