// Morpho Blue's dollar figures and their receipts (ui-jobs 743): each amount
// × its price as the rows show them, each product to the cent, the figure
// their sum (lib/shared/holder-usd-receipt.ts). A collateral's price is one
// composed row, the market oracle's price in the loan token × the loan
// token's dollar price, each factor as shown. Callers draw no figure where a
// price is missing. Pure, so scripts/test/morpho-usd-receipt.test.mjs asserts
// the arithmetic.

import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt, shownPrice, priceText, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { morphoCollateralPriceNote, MORPHO_FACE_NOTE, type MorphoFace } from "./price-notes";

/** One collateral token in dollars, composed from the two prices as shown:
 *  it multiplies out from the two factors its row prints. */
export const morphoComposedPrice = (oraclePrice: number, loanUsd: number): number =>
  shownPrice(shownPrice(oraclePrice) * shownPrice(loanUsd));

/** The composed collateral price and its row's note. */
export function morphoCollateralPrice(o: {
  collateral: string;
  loan: string;
  oraclePrice: number;
  oracleBlock: number | null | undefined;
  loanUsd: number;
  loanNote: string;
}): { price: number; note: string } {
  return {
    price: morphoComposedPrice(o.oraclePrice, o.loanUsd),
    note: morphoCollateralPriceNote({
      collateral: o.collateral,
      loan: o.loan,
      // The shown price's digits, without the dollar sign: it is in the loan token.
      oracleText: priceText(o.oraclePrice).slice(1),
      oracleBlock: o.oracleBlock,
      loanText: priceText(o.loanUsd),
      loanNote: o.loanNote,
    }),
  };
}

/** A figure and its receipt from its legs; null with no legs. */
export function morphoUsdReceipt(o: {
  /** What the figure is ("Supplied in USD"). */
  what: string;
  legs: UsdLeg[];
  /** The block the prices were read at. */
  block: number | null | undefined;
  via: string;
  face: MorphoFace;
  contract?: { name: string; address?: string };
  /** One more sentence, before the face's. */
  caveat?: string;
}): { prov: Provenance; usd: number } | null {
  if (o.legs.length === 0) return null;
  const caveat = [o.caveat, MORPHO_FACE_NOTE[o.face]].filter(Boolean).join(" ");
  const { prov, usd } = holderUsdReceipt({
    what: o.what,
    legs: o.legs,
    block: o.block ?? null,
    via: o.via,
    caveat: caveat || undefined,
  });
  return { prov: o.contract ? { ...prov, contract: o.contract } : prov, usd };
}
