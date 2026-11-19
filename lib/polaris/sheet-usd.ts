// The Polaris event sheet's dollar rows (ui-jobs 743): an event's prices as
// shown, each a receipt row naming its block, and a row's dollars the shown
// product. Pure, apart from the sheet's JSX, so
// scripts/test/polaris-usd-receipt.test.mjs asserts it.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import { holderUsdReceipt, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { shownComposedPrice, shownPrice } from "@/lib/shared/shown-usd";
import {
  POLARIS_TEST_DOLLAR,
  POLARIS_USDP_FACE,
  polarisFeedPriceNote,
  polarisPethUsdNote,
  polarisXauNote,
} from "./price-notes";

export type PolarisSheetPrices = NonNullable<ReturnType<typeof shownPricesOf>>;

export /** An event's dollar prices as shown, and each as a receipt row naming its
 *  block (ui-jobs 743): pETH at the curve × ETH/USD composed (else, on USDp,
 *  the feed's price, a dollar by construction; on GOLDp the feed's price ×
 *  XAU/USD), the debt at USDp's $1 face or at XAU/USD. */
function shownPricesOf(c: PolarisContext): {
  coll: number | null;
  debt: number | null;
  collLeg: (block?: number) => Omit<UsdLeg, "amount" | "amountNote"> | null;
  debtLeg: (block?: number) => Omit<UsdLeg, "amount" | "amountNote"> | null;
} | null {
  const pa = c.priceAtBlock;
  if (!pa) return null;
  const gold = c.market === "goldp";
  const stable = c.stableSymbol;
  const xau = pa.xauUsd != null && pa.xauUsd > 0 ? pa.xauUsd : null;
  const curveLeg = pa.curve != null && pa.curve > 0 && pa.ethUsd != null && pa.ethUsd > 0;
  const coll = curveLeg
    ? shownComposedPrice(pa.curve as number, pa.ethUsd as number)
    : !gold
      ? pa.pethInDebt > 0
        ? shownPrice(pa.pethInDebt)
        : null
      : xau != null && pa.pethInDebt > 0
        ? shownComposedPrice(pa.pethInDebt, xau)
        : null;
  const debt = gold ? (xau != null ? shownPrice(xau) : null) : 1;
  return {
    coll,
    debt,
    collLeg: (block) =>
      coll == null
        ? null
        : {
            token: "pETH",
            price: coll,
            priceNote: curveLeg
              ? polarisPethUsdNote({ curve: pa.curve as number, ethUsd: pa.ethUsd as number, block })
              : gold
                ? `${polarisFeedPriceNote(stable, block)} × ${polarisXauNote(block)}`
                : polarisFeedPriceNote(stable, block),
          },
    debtLeg: (block) =>
      debt == null
        ? null
        : gold
          ? { token: stable, price: debt, priceNote: polarisXauNote(block) }
          : { token: stable, price: 1, priceNote: POLARIS_USDP_FACE, face: true },
  };
}

/** A row's dollars at one event's prices and block: the shown product and
 *  its receipt; null without a price or an amount. */
export function polarisSheetUsd(
  prices: PolarisSheetPrices | null,
  what: string,
  token: "coll" | "debt",
  n: number,
  block: number | undefined,
  stable: string,
): { usd: number; prov: ReturnType<typeof holderUsdReceipt>["prov"] } | null {
  const leg = prices ? (token === "coll" ? prices.collLeg(block) : prices.debtLeg(block)) : null;
  if (!leg || n === 0) return null;
  return holderUsdReceipt({
    what: `${what} in US dollars`,
    legs: [
      {
        ...leg,
        amount: Math.abs(n),
        amountNote: token === "coll" ? "the pETH the row states" : `the ${stable} the row states`,
      },
    ],
    block: block ?? null,
    via: "polaris_oracle_at_block",
    caveat: POLARIS_TEST_DOLLAR,
  });
}
