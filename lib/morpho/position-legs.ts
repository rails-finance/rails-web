// Morpho's two "does this leg hold anything?" questions, stated once.
// ----------------------------------------------------------------------------
// The server words a position's status off `collateral_final > 0 OR
// borrow_shares_final > 1e6` on RAW base units (`mig 252`; the Base copy worker
// writes `chain_open` the same way). Every surface that asks the same question
// has to ask it the same way, or a card contradicts the facet that returned it
// (`chain-truth-charter.md` §2).
//
// Until 2026-09-20 five surfaces asked it five ways (TO-DO §46). The collateral
// leg was read at `> 1e-6` DISPLAY tokens in three of them — a factor of 10¹² at
// 18 decimals, which is most of Morpho's collateral — and 532 served-open rows
// rendered as closed cards with their collateral zeroed rather than shown. The
// share leg ran the other way on Base: the page read `> 0` where the index
// listed on `> 1e6`, so a row the `noDebt` facet returned drew the Borrowing
// pill.
//
// ── why collateral takes no dust line ────────────────────────────────────────
// Collateral on Blue is an exact uint128 asset amount and the replay is
// `Σ (supply − withdraw − seized)`, exact and clamped ≥0 (`mig 045`). There is
// no accrual to leave a rounding leftover, so any collateral at all is
// collateral. Miles ruled on 2026-09-20 that the web renders the status the
// server filed and no dust line is introduced.
//
// ── why the share leg does ───────────────────────────────────────────────────
// 1e6 is Morpho's own virtual-share offset (SharesMathLib), not a chosen floor:
// below it a debt cannot be repaid down, so the leg is closed. The same constant
// stands on both sides of the wire.
//
// Borrowed PRINCIPAL is a third thing and belongs to neither predicate: it is a
// flow, not a balance, and a full repay leaves it reading through zero (the
// charter's rule, and Fluid's §45). Ask the share leg instead.

/** Morpho's virtual-share offset — the share leg's floor on both sides. */
export const MORPHO_SHARE_DUST = BigInt(1_000_000);

/** A raw base-unit amount as the wire carries it (`numeric` may serialize with a
 *  fractional part) against a floor. An unparseable value is not a holding. */
export function morphoRawAbove(raw: string | null | undefined, floor: bigint): boolean {
  if (raw == null || raw === "") return false;
  try {
    return BigInt(raw.split(".")[0]) > floor;
  } catch {
    return false;
  }
}

/** Does the position still hold collateral? Raw where the surface has it. */
export function morphoHasCollateralRaw(collateralRaw: string | null | undefined): boolean {
  return morphoRawAbove(collateralRaw, BigInt(0));
}

/** Does the position still owe? The share leg, never the principal. */
export function morphoHasDebt(borrowSharesRaw: string | null | undefined): boolean {
  return morphoRawAbove(borrowSharesRaw, MORPHO_SHARE_DUST);
}
