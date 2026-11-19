// f(x)'s dollar figures and their receipts (ui-jobs 743): the collateral at
// six decimals × a pool oracle leg as shown, the product to the cent, the
// figure the product (lib/shared/holder-usd-receipt.ts); a sum the sum of the
// shown products. A missing price draws no figure. The debt stays in fxUSD.
// Pure, so scripts/test/fx-usd-receipt.test.mjs asserts it.

import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { FX_POOLS, type FxPoolKey } from "./asset-catalog";
import { fxBlocksNote, fxPriceNote, type FxLeg } from "./price-notes";

export interface FxUsd {
  prov: Provenance;
  usd: number;
}

const oracleOf = (pool: FxPoolKey) => ({
  name: `f(x) ${FX_POOLS[pool].tokenSymbol} pool price oracle`,
  address: FX_POOLS[pool].oracle,
});

/** A position's (or a pool's) collateral in dollars at one oracle leg. */
export function fxCollateralUsd(o: {
  what: string;
  pool: FxPoolKey;
  colls: number | null | undefined;
  /** Where the amount comes from, in a phrase. */
  amountNote: string;
  /** The block the collateral stands at, where it differs from the price's. */
  collsBlock?: number | null;
  leg: FxLeg;
  price: number | null | undefined;
  priceBlock: number | null | undefined;
  /** The price's note where the leg alone does not say it (a block that
   *  stores only the min leg). */
  priceNote?: string;
}): FxUsd | null {
  if (o.colls == null || o.price == null || !(o.price > 0)) return null;
  const sym = FX_POOLS[o.pool].normalizedSymbol;
  const both =
    o.collsBlock != null && o.priceBlock != null && o.collsBlock !== o.priceBlock
      ? fxBlocksNote(o.collsBlock, o.priceBlock)
      : undefined;
  return holderUsdReceipt({
    what: o.what,
    legs: [
      {
        token: sym,
        amount: Math.abs(o.colls),
        amountNote: o.amountNote,
        amountKind: { kind: "chain", pclass: "state" },
        price: o.price,
        priceNote: o.priceNote ?? fxPriceNote(o.leg, o.priceBlock),
        priceContract: oracleOf(o.pool),
      },
    ],
    block: o.priceBlock ?? null,
    via: `${sym} × the pool oracle's ${o.leg} leg`,
    caveat: both,
  });
}

/** A sum of seized legs, each at the min leg of its own block: the figure is
 *  the sum of the shown products. Null where any leg has no price. */
export function fxSeizedUsd(o: {
  what: string;
  pool: FxPoolKey;
  legs: readonly { amount: number; price: number | null; block: number | null }[];
}): FxUsd | null {
  if (o.legs.length === 0 || o.legs.some((l) => l.price == null || !(l.price > 0))) return null;
  const sym = FX_POOLS[o.pool].normalizedSymbol;
  const legs: UsdLeg[] = o.legs.map((l, i) => ({
    token: sym,
    label: o.legs.length > 1 ? `${sym} seized (${i + 1})` : undefined,
    amount: Math.abs(l.amount),
    amountNote: `collateral the liquidation took${l.block != null ? ` at block ${l.block.toLocaleString("en-US")}` : ""}`,
    price: l.price as number,
    priceNote: fxPriceNote("min", l.block),
    priceContract: oracleOf(o.pool),
  }));
  const blocks = [...new Set(o.legs.map((l) => l.block))];
  return holderUsdReceipt({
    what: o.what,
    legs,
    block: blocks.length === 1 ? blocks[0] : null,
    blocksPerRow: blocks.length > 1,
    via: `each seized ${sym} × the pool oracle's min leg at its block · summed`,
  });
}

/** A position's collateral as the card, the listing, the Explanation and
 *  the export state it: the settled colls at the oracle's anchor leg, the
 *  price the LTV divides by (on the position page at the settled block, on
 *  the listing at the pool totals' block). Null where no anchor read stands:
 *  no figure (FX_NO_ANCHOR). */
export function fxPositionCollUsd(
  v: { pool: FxPoolKey; settled: { colls: number | null; block: number | null } },
  anchor: { anchor: number; block: number } | null | undefined,
): (FxUsd & { price: number }) | null {
  if (!anchor) return null;
  const sym = FX_POOLS[v.pool].normalizedSymbol;
  const at = v.settled.block != null ? ` at block ${v.settled.block.toLocaleString("en-US")}` : "";
  const r = fxCollateralUsd({
    what: `The position's ${sym} collateral in USD`,
    pool: v.pool,
    colls: v.settled.colls,
    amountNote: `the pool's getPosition rawColls, in ${sym}${at}`,
    collsBlock: v.settled.block,
    leg: "anchor",
    price: anchor.anchor,
    priceBlock: anchor.block,
  });
  return r ? { ...r, price: anchor.anchor } : null;
}
