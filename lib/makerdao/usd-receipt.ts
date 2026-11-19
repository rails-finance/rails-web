// MakerDAO's dollar figures and their receipts (ui-jobs 743): each amount at
// six decimals × its price as shown, the product to the cent, the figure the
// product (lib/shared/holder-usd-receipt.ts). The collateral at the OSM price
// the Spotter stores, named with its block; the debt at the Vat's $1 par. A
// missing price draws no figure. Pure, so scripts/test/makerdao-usd-receipt.test.mjs
// asserts it.

import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt } from "@/lib/shared/holder-usd-receipt";
import { amountText, shownAmount, shownPrice } from "@/lib/shared/shown-usd";
import { MAKER_ADDRESSES } from "./asset-catalog";
import { makerParNote, makerPriceNote, makerRowPriceNote, type MakerRowPrice } from "./price-notes";

const SPOTTER = { name: "Spotter", address: MAKER_ADDRESSES.SPOTTER };

export interface MakerUsd {
  prov: Provenance;
  usd: number;
}

/** Collateral in dollars: ink × the OSM price. `inkSource` classes the ink
 *  row: "chain" for the eth_call read of Vat.urns, "api" for the replay of
 *  the vault's own rows. Null without a price. */
export function makerCollateralUsd(o: {
  what: string;
  symbol: string;
  ink: number;
  inkSource: "chain" | "api";
  /** The block the ink stands at, where the read names one. */
  inkBlock?: number | null;
  price: number | null | undefined;
  /** The block the price was read at; null where the read names none. */
  priceBlock: number | null | undefined;
  cap?: { capUsd: number; oracleUsd: number | null } | null;
  caveat?: string;
}): MakerUsd | null {
  if (o.price == null || !(o.price > 0)) return null;
  const amount = Math.abs(o.ink);
  const at = o.inkBlock != null ? ` at block ${o.inkBlock.toLocaleString("en-US")}` : "";
  return holderUsdReceipt({
    what: o.what,
    legs: [
      {
        token: o.symbol,
        amount,
        amountNote:
          o.inkSource === "chain"
            ? `Vat.urns(ilk, urn).ink, read by eth_call${at}`
            : `the vault's ink replayed from its own Vat rows${at}`,
        amountKind: o.inkSource === "chain" ? { kind: "chain", pclass: "state" } : undefined,
        price: o.price,
        priceNote: makerPriceNote(o.priceBlock, o.cap),
        priceContract: SPOTTER,
      },
    ],
    block: o.priceBlock ?? null,
    via: "the vault's ink × Maker's OSM price (Vat spot × Spotter par × mat)",
    caveat: o.caveat,
  });
}

/** Debt in dollars: the debt token at the Vat's $1 par. */
export function makerDebtUsd(o: { what: string; symbol: string; debt: number; amountNote: string }): MakerUsd {
  return holderUsdReceipt({
    what: o.what,
    legs: [
      {
        token: o.symbol,
        amount: Math.abs(o.debt),
        amountNote: o.amountNote,
        amountKind: { kind: "chain-derived", pclass: "state" },
        price: 1,
        priceNote: makerParNote(o.symbol),
        face: true,
      },
    ],
    via: "the debt × the Vat's $1 par",
  });
}

/** A Lifetime flows row's collateral in dollars, at the price the replay
 *  took, both blocks named. */
export function makerFlowUsd(o: {
  what: string;
  symbol: string;
  amount: number;
  amountNote: string;
  price: number;
  from: MakerRowPrice;
}): MakerUsd | null {
  if (!(o.price > 0)) return null;
  return holderUsdReceipt({
    what: o.what,
    legs: [
      {
        token: o.symbol,
        amount: Math.abs(o.amount),
        amountNote: o.amountNote,
        price: o.price,
        priceNote: makerRowPriceNote(o.from),
        priceContract: SPOTTER,
      },
    ],
    // The price's block is on its row, beside the event's.
    blocksPerRow: true,
    via: "the vault's rows × Maker's OSM price as the Lifetime flows replay takes it",
  });
}

/** A vault card's collateral in dollars: the chain read's ink and price at
 *  its block, or the listing's replayed ink at the ilk state's price, whose
 *  read names no block. The cap is named only where it binds. */
export function makerVaultCollateralUsd(v: {
  collateralSymbol: string;
  ink: number;
  source: "api" | "chain";
  atBlock?: number;
  priceUsd: number | null;
  priceCap?: { capUsd: number; oracleUsd: number | null } | null;
}): MakerUsd | null {
  const chain = v.source === "chain";
  const binds = v.priceCap != null && v.priceCap.oracleUsd != null && v.priceCap.oracleUsd > v.priceCap.capUsd;
  return makerCollateralUsd({
    what: `The vault's ${v.collateralSymbol} collateral in USD`,
    symbol: v.collateralSymbol,
    ink: v.ink,
    inkSource: v.source,
    inkBlock: chain ? (v.atBlock ?? null) : null,
    price: v.priceUsd,
    priceBlock: chain ? (v.atBlock ?? null) : null,
    cap: binds ? v.priceCap : null,
  });
}

/** A vault card's debt in dollars, at the Vat's par. */
export const makerVaultDebtUsd = (symbol: string, debt: number): MakerUsd =>
  makerDebtUsd({
    what: `The vault's ${symbol} debt in USD`,
    symbol,
    debt,
    amountNote: "the vault's normalized debt × the ilk's rate accumulator, the Vat's own debt figure",
  });

/** A minimum ratio as shown: the Spotter's mat as a percentage at its own
 *  grain (145%, 172.5%). */
export const makerMatText = (mat: number): string => `${Number((mat * 100).toFixed(4))}%`;

/** The liquidation price from the inputs as shown: the debt and the ink at
 *  six decimals and the mat at its grain, so the result is their arithmetic
 *  (debt × mat ÷ ink). Null where the vault holds or owes nothing. */
export function makerLiquidationPrice(
  debt: number,
  mat: number,
  ink: number,
): { price: number; debt: string; mat: string; ink: string } | null {
  const d = shownAmount(debt);
  const k = shownAmount(ink);
  const m = Number((mat * 100).toFixed(4)) / 100;
  if (!(d > 0) || !(k > 0) || !(m > 0)) return null;
  return { price: shownPrice((d * m) / k), debt: amountText(d), mat: makerMatText(mat), ink: amountText(k) };
}

/** Room to borrow from the figures as shown: the collateral's dollars (the
 *  shown product) ÷ the mat at its grain, less the debt at six decimals. */
export function makerBorrowRoom(
  collateralUsd: number,
  mat: number,
  debt: number,
): { room: number; collateralUsd: number; mat: string; debt: string } | null {
  const m = Number((mat * 100).toFixed(4)) / 100;
  if (!(m > 0)) return null;
  const d = shownAmount(debt);
  return {
    room: shownAmount(Math.max(0, collateralUsd / m - d)),
    collateralUsd,
    mat: makerMatText(mat),
    debt: amountText(d),
  };
}
