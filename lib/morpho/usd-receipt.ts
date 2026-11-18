// Morpho Blue's dollar figures and their receipts (ui-jobs 743): each amount
// × its price as the rows show them, each product to the cent, the figure
// their sum (lib/shared/holder-usd-receipt.ts). A collateral's price is one
// composed row, the market oracle's price in the loan token × the loan
// token's dollar price, each factor as shown (shownComposedPrice), after a row
// of the oracle's raw price() and its scale. Callers draw no figure where a
// price is missing. scripts/test/morpho-usd-receipt.test.mjs asserts the
// arithmetic.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { holderUsdReceipt, shownComposedPrice, priceText, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { morphoCollateralPriceNote, MORPHO_FACE_NOTE, type MorphoFace } from "./price-notes";

/** The composed collateral price, its row's note and the raw oracle row
 *  ahead of it. */
export function morphoCollateralPrice(o: {
  collateral: string;
  loan: string;
  /** One whole collateral token in whole loan tokens. */
  oraclePrice: number;
  /** The oracle's price() as read, and the market oracle's address. */
  oracleRaw?: string | null;
  oracle?: string;
  loanDecimals?: number;
  collateralDecimals?: number;
  oracleBlock: number | null | undefined;
  loanUsd: number;
  loanNote: string;
}): { price: number; note: string; before: ProvInput[] } {
  const at = o.oracleBlock != null ? ` at block ${o.oracleBlock.toLocaleString("en-US")}` : "";
  const scale =
    o.loanDecimals != null && o.collateralDecimals != null
      ? `10^(36 + ${o.loanDecimals} − ${o.collateralDecimals})`
      : "10^(36 + loan decimals − collateral decimals)";
  return {
    price: shownComposedPrice(o.oraclePrice, o.loanUsd),
    note: morphoCollateralPriceNote({
      collateral: o.collateral,
      loan: o.loan,
      // The shown price's digits, without the dollar sign: it is in the loan token.
      oracleText: priceText(o.oraclePrice).slice(1),
      oracleBlock: o.oracleBlock,
      loanText: priceText(o.loanUsd),
      loanNote: o.loanNote,
    }),
    before: [
      {
        label: `${o.collateral} in ${o.loan}`,
        value: o.oracleRaw ?? "—",
        kind: "chain",
        pclass: "oracle",
        note: `the market oracle's price()${at}, ÷ ${scale} = ${priceText(o.oraclePrice).slice(1)} ${o.loan} per ${o.collateral}`,
        ...(o.oracle ? { contract: { name: "Market oracle", address: o.oracle } } : {}),
      },
    ],
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
