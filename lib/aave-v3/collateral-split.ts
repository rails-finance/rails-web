// Which of an Aave V3-family account's supplied reserves back no borrowing:
// the position page's card and the listing row read this one rule, so the two
// state the same Collateral (ui-jobs 378 on SparkLend, 397 on Aave V3 and
// Seamless). The rule is the Pool's, so every Aave V3 Pool reads it alike.
//
// RULE: a supplied reserve is collateral when the account's collateral switch
// for it is on (Pool.getUserConfiguration) and its liquidation threshold is
// above zero: the e-mode category's where the category counts the reserve as
// collateral, else the reserve's own (getReserveData's configuration). Any
// other supplied reserve is "Supplied, not collateral". A closed account's
// peaks split on the switches alone: a reserve it never turned on as
// collateral (the Pool's ReserveUsedAsCollateralEnabled logs).

import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

/** One supplied reserve as the Pool reads it for the account. */
export interface PoolCollateralRead {
  address: string;
  /** The account's collateral switch for the reserve. */
  isCollateral: boolean;
  /** The reserve's liquidation threshold (0..1); null where it has none. */
  lt: number | null;
  /** The account's e-mode category counts the reserve as collateral. */
  inEmode?: boolean;
}

/** The lowercased addresses of the supplied reserves that back no borrowing. */
export function notCollateralReserves(
  supplied: readonly PoolCollateralRead[],
  emodeLt: number | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const r of supplied) {
    const lt = r.inEmode && emodeLt ? emodeLt : r.lt;
    if (!r.isCollateral || !lt) out.add(r.address.toLowerCase());
  }
  return out;
}

/** A closed account's peak supplies it never turned on as collateral. */
export function neverCollateral(peakSupplied: readonly string[], collateralEnabled: readonly string[]): Set<string> {
  const on = new Set(collateralEnabled.map((a) => a.toLowerCase()));
  return new Set(peakSupplied.map((a) => a.toLowerCase()).filter((a) => !on.has(a)));
}

/** An Aave V3 or Seamless account's split from the position page's live Pool
 *  read: the reserve's own threshold where its configuration reads 0, the
 *  catalog's figure set aside. */
export function aaveV3NotCollateral(chain: AaveV3PositionChainResponse): Set<string> {
  return notCollateralReserves(
    chain.reserves
      .filter((r) => r.supplyBalanceRaw !== "0")
      .map((r) => ({
        address: r.address,
        isCollateral: r.isCollateral,
        lt: r.ltZero ? 0 : r.lt,
        inEmode: r.emodeCollateral,
      })),
    chain.emode?.lt,
  );
}

/** The card's split on an Aave V3 or Seamless position page: open, the live
 *  Pool read; closed, the switches the account ever turned on. Null until the
 *  read it needs has landed. */
export function aaveV3CardNotCollateral(
  view: { status: string; peakSupplies: readonly { address: string }[] } | null,
  chain: AaveV3PositionChainResponse | null,
  switches: { collateralEnabled: readonly string[] } | null,
): Set<string> | null {
  if (!view) return null;
  if (view.status === "open") return chain && !chain.chainStale ? aaveV3NotCollateral(chain) : null;
  if (!switches) return null;
  return neverCollateral(
    view.peakSupplies.map((r) => r.address),
    switches.collateralEnabled,
  );
}
