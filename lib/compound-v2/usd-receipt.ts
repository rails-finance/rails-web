// Compound V2's dollar figures and their receipts (ui-jobs 743): per market,
// the amount × the Comptroller oracle's getUnderlyingPrice at the market-state
// read's block, as the rows show them, each product to the cent, the figure
// their sum (lib/shared/holder-usd-receipt.ts). A market the oracle prices at
// a stored constant says so on its price row. A market with no price draws no
// figure: a partial total is never asserted.

import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt, priceText, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { COMPOUND_V2_ADDRESSES } from "./asset-catalog";
import {
  compoundV2PriceNote,
  compoundV2FixedPriceNote,
  COMPOUND_V2_FACE_NOTE,
  type CompoundV2Face,
} from "./price-notes";

/** The block the prices were read at, and the oracle that answered. */
export interface CompoundV2PriceRead {
  blockNumber?: number | null;
  oracle?: string | null;
}

/** The Comptroller's oracle as a receipt names it: the address the read
 *  gives, else the Comptroller whose oracle() names it at the block. */
export const compoundV2OracleContract = (read?: CompoundV2PriceRead | null): { name: string; address: string } =>
  read?.oracle
    ? { name: "Comptroller oracle", address: read.oracle }
    : {
        name: "Comptroller (Unitroller), whose oracle() names the price oracle",
        address: COMPOUND_V2_ADDRESSES.COMPTROLLER,
      };

export interface CompoundV2UsdLine {
  market: string;
  symbol: string;
  cSymbol: string;
  amount: number;
  /** Where the amount comes from, in a phrase. */
  amountNote: string;
}

/** A price row's note: the oracle's read, or its stored constant. */
export function compoundV2PriceRowNote(
  cSymbol: string,
  price: number,
  fixed: boolean,
  block: number | null | undefined,
): string {
  return fixed ? compoundV2FixedPriceNote(cSymbol, priceText(price), block) : compoundV2PriceNote(cSymbol, block);
}

/** A side's figure and the receipt that rebuilds it; null when a line is
 *  unpriced or nothing is held. */
export function compoundV2UsdReceipt(o: {
  what: string;
  lines: readonly CompoundV2UsdLine[];
  prices: Record<string, number> | undefined;
  fixed?: Record<string, boolean>;
  read?: CompoundV2PriceRead | null;
  face: CompoundV2Face;
  via: string;
  /** One more sentence, before the face's. */
  caveat?: string;
}): { prov: Provenance; usd: number } | null {
  const live = o.lines.filter((l) => l.amount > 0);
  if (live.length === 0) return null;
  const block = o.read?.blockNumber ?? null;
  const oracle = compoundV2OracleContract(o.read);
  const twice = (l: CompoundV2UsdLine) => live.filter((x) => x.symbol === l.symbol).length > 1;
  const legs: UsdLeg[] = [];
  for (const l of live) {
    const price = o.prices?.[l.market];
    if (!(typeof price === "number" && price > 0)) return null;
    legs.push({
      token: l.symbol,
      // The two WBTC markets share a symbol: each leg is named by its cToken.
      label: twice(l) ? l.cSymbol : undefined,
      amount: l.amount,
      amountNote: l.amountNote,
      price,
      priceNote: compoundV2PriceRowNote(l.cSymbol, price, o.fixed?.[l.market] === true, block),
      priceContract: oracle,
    });
  }
  const caveat = [o.caveat, COMPOUND_V2_FACE_NOTE[o.face]].filter(Boolean).join(" ");
  const { prov, usd } = holderUsdReceipt({ what: o.what, legs, block, via: o.via, caveat: caveat || undefined });
  return { prov: { ...prov, contract: oracle }, usd };
}

/** Whether a side of debt draws dollars. On the position page only the live
 *  read's debt does: without it a debt stands at its last event, interest
 *  since then left out, and its token amount says so. The listing reads no
 *  live debt, so it draws the last event's debt and its receipt says so. */
export const compoundV2DebtDollars = (detail: boolean, borrows: readonly { live?: boolean }[]): boolean =>
  !detail || borrows.every((b) => b.live === true);
