// Pendle Principal Tokens carry an on-chain ERC-20 symbol that omits the
// maturity (e.g. "PT-sUSDE"), but each maturity is a distinct token with
// distinct redemption mechanics. Aave's UI displays the augmented form
// (e.g. "PT-sUSDE-7MAY2026") — we do the same for parity.
//
// The lookup key is the on-chain symbol because that's what
// `AaveV4Context.reserveSymbol` carries; the maturity itself isn't on the
// wire. Refresh when Aave V4 lists a new PT maturity. If two maturities of
// the same underlying are ever listed simultaneously, we'd need to switch
// to address-keyed disambiguation — for now Aave lists one at a time.

export const PT_DISPLAY_LABELS: Record<string, string> = {
  "PT-sUSDE": "PT-sUSDE-7MAY2026",
};

export function aaveV4DisplaySymbol(symbol: string | null | undefined): string {
  if (!symbol) return symbol ?? "";
  return PT_DISPLAY_LABELS[symbol] ?? symbol;
}
