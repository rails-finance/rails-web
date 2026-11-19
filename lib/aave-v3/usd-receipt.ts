// The dollar figures of an Aave V3-family position and their receipts
// (ui-jobs 743): each reserve's amount × its AaveOracle price as the rows show
// them, each product to the cent, the figure their sum
// (lib/shared/holder-usd-receipt.ts). A reserve with no price, or whose
// decimals were not read, draws no figure: a partial total is never asserted.
// Pure, so scripts/test/aave-v3-usd-receipt.test.mjs asserts the arithmetic.

import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt, shownPrice, priceText } from "@/lib/shared/holder-usd-receipt";
import { aaveV3PriceNote, aaveV3BlocksNote, AAVE_V3_FACE_NOTE, type AaveV3Face } from "./price-notes";

export interface AaveV3UsdReserve {
  symbol: string;
  address: string;
  amount: number;
  decimalsUnread?: true;
}

/** What a card hands a receipt: the reserves, the prices and the two blocks. */
export interface AaveV3UsdRows {
  reserves: readonly AaveV3UsdReserve[];
  /** USD per whole token, keyed by lowercased reserve address. */
  prices: Record<string, number> | undefined;
  /** The block the prices were read at, where the read named one. */
  priceBlock?: number | null;
  /** The block the amounts were read at. */
  balanceBlock?: number | null;
  /** How the card shows the figure. */
  face: AaveV3Face;
}

/** One reserve's price, or null when the oracle did not price it. */
export function aaveV3PriceOf(prices: Record<string, number> | undefined, address: string): number | null {
  const p = prices?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? p : null;
}

/** The figure and its receipt; null when any reserve is unpriced or unread,
 *  or none holds an amount. */
export function aaveV3UsdReceipt(o: {
  /** What the figure is ("Collateral"). */
  what: string;
  rows: AaveV3UsdRows;
  oracle: { name: string; address?: string };
  /** Where each amount comes from, in a phrase. */
  amountNote: (symbol: string) => string;
  /** One more sentence for the summary, before the blocks and the face. */
  note?: string;
  via: string;
}): { prov: Provenance; usd: number } | null {
  const { rows } = o;
  const live = rows.reserves.filter((r) => r.amount > 0);
  if (live.length === 0 || live.some((r) => r.decimalsUnread)) return null;
  const legs = [];
  for (const r of live) {
    const price = aaveV3PriceOf(rows.prices, r.address);
    if (price == null) return null;
    legs.push({
      token: r.symbol,
      amount: r.amount,
      amountNote: o.amountNote(r.symbol),
      price,
      priceNote: aaveV3PriceNote(o.oracle.name, r.symbol, rows.priceBlock),
      priceContract: o.oracle,
    });
  }
  const caveat = [o.note, aaveV3BlocksNote(rows.balanceBlock, rows.priceBlock), AAVE_V3_FACE_NOTE[rows.face]]
    .filter(Boolean)
    .join(" ");
  const { prov, usd } = holderUsdReceipt({
    what: o.what,
    legs,
    block: rows.priceBlock ?? null,
    via: o.via,
    caveat: caveat || undefined,
  });
  return { prov: { ...prov, contract: o.oracle }, usd };
}

/** The figure alone: the sum of the shown products, or null. */
export function aaveV3UsdOf(rows: AaveV3UsdRows): number | null {
  return aaveV3UsdReceipt({ what: "", rows, oracle: { name: "" }, amountNote: () => "", via: "" })?.usd ?? null;
}

/** A health factor as a receipt row shows it: six decimal places. */
export const shownHf = (hf: number): number => Math.round(hf * 1e6) / 1e6;

/** The liquidation price and its receipt: the oracle price as shown ÷ the
 *  health factor as shown, both named with their blocks. */
export function aaveV3LiqPriceReceipt(o: {
  symbol: string;
  price: number;
  priceBlock?: number | null;
  hf: number;
  hfBlock?: number | null;
  oracle: { name: string; address?: string };
  pool: { name: string; address?: string };
}): { prov: Provenance; liqPrice: number } {
  const liqPrice = shownPrice(o.price) / shownHf(o.hf);
  const hfAt =
    o.hfBlock != null ? ` at block ${o.hfBlock.toLocaleString("en-US")}` : " at the latest read, which names no block";
  return {
    liqPrice,
    prov: {
      kind: "chain-derived",
      pclass: "state",
      summary: `Liquidation price for the ${o.symbol} collateral — the ${o.symbol} price at which this position becomes liquidatable: the oracle's price divided by the health factor, as the rows show them. ${o.symbol} carries at least 99.5% of the priced collateral, so it anchors the read, and the figure holds while the debt's dollar value stands still.`,
      contract: o.oracle,
      via: "IAaveOracle getAssetPrice ÷ Pool getUserAccountData health factor",
      formula: "oracle price ÷ health factor",
      inputs: [
        {
          label: "oracle price",
          value: priceText(o.price),
          kind: "chain",
          pclass: "oracle",
          note: aaveV3PriceNote(o.oracle.name, o.symbol, o.priceBlock),
          contract: o.oracle,
        },
        {
          label: "health factor",
          value: shownHf(o.hf).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }),
          kind: "chain",
          pclass: "state",
          note: `Pool getUserAccountData${hfAt}, healthFactor ÷ 10^18`,
          contract: o.pool,
        },
      ],
      source: o.priceBlock != null ? { block: o.priceBlock } : undefined,
    },
  };
}
