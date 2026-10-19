// Which of a SparkLend account's supplied reserves back no borrowing: the
// position page's card and the listing row read this one rule, so the two
// state the same Collateral (ui-jobs 378).
//
// RULE: a supplied reserve is collateral when the account's collateral switch
// for it is on (Pool.getUserConfiguration) and its liquidation threshold is
// above zero: the e-mode category's where the reserve is in the account's
// category, else the reserve's own (getReserveData's configuration). Any other
// supplied reserve is "Supplied, not collateral".

/** One supplied reserve as the Pool reads it for the account. */
export interface SparkCollateralRead {
  address: string;
  /** The account's collateral switch for the reserve. */
  isCollateral: boolean;
  /** The reserve's liquidation threshold (0..1); null where it has none. */
  lt: number | null;
  /** The reserve sits in the account's e-mode category. */
  inEmode?: boolean;
}

/** The lowercased addresses of the supplied reserves that back no borrowing. */
export function sparkNotCollateral(
  supplied: readonly SparkCollateralRead[],
  emodeLt: number | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const r of supplied) {
    const lt = r.inEmode && emodeLt ? emodeLt : r.lt;
    if (!r.isCollateral || !lt) out.add(r.address.toLowerCase());
  }
  return out;
}
