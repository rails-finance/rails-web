// Where a position holder's address opens inside Rails (ui-jobs 704). Imports
// nothing, so scripts/test/holder-href.test.mjs reads it directly; the
// family's listing resolver is handed in (components/shared/linked-address.tsx
// passes listingHrefForWallet).
//
// RULE: a holder of a family the wallet page reads opens /wallet/<address>,
// with ?from=<the page it was opened from> for the wallet page's back link;
// a holder of any other family opens that family's listing filtered to the
// wallet; null leaves the block explorer.

/** The families the wallet page (/wallet/<address>) reads a holder's position for. */
export const WALLET_PAGE_SESSIONS: ReadonlySet<string> = new Set(["liquity-v2", "makerdao"]);

export function holderHref<S extends string>(
  session: S,
  address: string,
  listingFor: (session: S, address: string) => string | null,
  from?: string | null,
): string | null {
  if (WALLET_PAGE_SESSIONS.has(session)) {
    const page = `/wallet/${address.toLowerCase()}`;
    return from ? `${page}?from=${encodeURIComponent(from)}` : page;
  }
  return listingFor(session, address);
}

/** The prose segment's tone for an address placeholder's rounding: "wallet"
 *  links inside Rails, the others keep the explorer. */
export function addressTone(rounding: string): "manager" | "address" | "wallet" | null {
  return rounding === "manager" || rounding === "address" || rounding === "wallet" ? rounding : null;
}
