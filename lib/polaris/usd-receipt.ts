// Polaris's dollar figures and their receipts (ui-jobs 743): each amount at six
// decimals × its price as shown, the product to the cent, the figure the
// product (lib/shared/holder-usd-receipt.ts). pETH in dollars is one composed
// row, the bonding curve × the ETH/USD medianiser, each factor as shown; USDp
// stands at its $1 face, GOLDp at the XAU/USD medianiser. Every price names
// its read's block. A missing price draws no figure. Pure, so
// scripts/test/polaris-usd-receipt.test.mjs asserts it.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { holderUsdReceipt } from "@/lib/shared/holder-usd-receipt";
import { amountText, priceText, shownAmount, shownComposedPrice, shownPrice } from "@/lib/shared/shown-usd";
import { POLARIS_CORE, POLARIS_MARKET_CONFIG, type PolarisMarket } from "./asset-catalog";
import {
  POLARIS_TEST_DOLLAR,
  POLARIS_USDP_FACE,
  polarisFeedPriceNote,
  polarisPethUsdNote,
  polarisXauNote,
} from "./price-notes";

export interface PolarisUsd {
  prov: Provenance;
  usd: number;
}

const stableOf = (market: PolarisMarket): string => POLARIS_MARKET_CONFIG[market].stable.symbol;

/** A pETH amount in dollars at the composed curve × ETH/USD price. */
export function polarisPethUsd(o: {
  what: string;
  coll: number;
  amountNote: string;
  curve: number | null | undefined;
  ethUsd: number | null | undefined;
  block: number | null | undefined;
  via: string;
}): PolarisUsd | null {
  if (!(o.curve != null && o.curve > 0) || !(o.ethUsd != null && o.ethUsd > 0) || !(o.coll > 0)) return null;
  return holderUsdReceipt({
    what: o.what,
    legs: [
      {
        token: "pETH",
        amount: o.coll,
        amountNote: o.amountNote,
        price: shownComposedPrice(o.curve, o.ethUsd),
        priceNote: polarisPethUsdNote({ curve: o.curve, ethUsd: o.ethUsd, block: o.block }),
        priceContract: { name: "Polaris BondingCurve", address: POLARIS_CORE.bondingCurve },
      },
    ],
    block: o.block && o.block > 0 ? o.block : null,
    via: o.via,
    caveat: POLARIS_TEST_DOLLAR,
  });
}

/** A CDP's debt in dollars: USDp at its $1 face, GOLDp at XAU/USD. */
export function polarisDebtUsd(o: {
  market: PolarisMarket;
  debt: number;
  xauUsd: number | null | undefined;
  block: number | null | undefined;
  via: string;
}): PolarisUsd | null {
  if (!(o.debt > 0)) return null;
  const stable = stableOf(o.market);
  const gold = o.market === "goldp";
  if (gold && !(o.xauUsd != null && o.xauUsd > 0)) return null;
  return holderUsdReceipt({
    what: "Debt in USD",
    legs: [
      {
        token: stable,
        amount: o.debt,
        amountNote: `the CDP's ${stable} debt, getCDPEntireDebt(id)`,
        price: gold ? (o.xauUsd as number) : 1,
        priceNote: gold ? polarisXauNote(o.block) : POLARIS_USDP_FACE,
        ...(gold
          ? { priceContract: { name: "Polaris XAU/USD Medianiser", address: POLARIS_CORE.xauUsdMedianiser } }
          : { face: true }),
      },
    ],
    block: gold && o.block && o.block > 0 ? o.block : null,
    via: o.via,
    caveat: POLARIS_TEST_DOLLAR,
  });
}

/** The CDP's equity at the feed from the figures as shown: the collateral at
 *  six decimals × the feed's pETH price as shown, less the debt at six
 *  decimals; to the cent on USDp, to six decimals on GOLDp (ounces). The
 *  collateral's worth is the first step. */
export function polarisEquity(o: {
  market: PolarisMarket;
  coll: number;
  debt: number;
  pethInDebt: number | null | undefined;
  block: number | null | undefined;
}): { worth: number; equity: number; worthProv: Provenance; equityProv: Provenance } | null {
  if (!(o.pethInDebt != null && o.pethInDebt > 0)) return null;
  const stable = stableOf(o.market);
  const gold = o.market === "goldp";
  const round = (v: number) => (gold ? Math.round(v * 1e6) / 1e6 : Math.round(v * 100) / 100);
  const text = (v: number) =>
    `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US", gold ? { maximumFractionDigits: 6 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${stable}`;
  const price = shownPrice(o.pethInDebt);
  const worth = round(shownAmount(o.coll) * price);
  const equity = round(worth - shownAmount(o.debt));
  const rows: ProvInput[] = [
    {
      label: "pETH amount",
      value: `${amountText(o.coll)} pETH`,
      kind: "chain",
      pclass: "state",
      note: "getCDPEntireColl(id)",
    },
    {
      label: "pETH price",
      value: `${priceText(o.pethInDebt).slice(1)} ${stable}`,
      kind: "chain",
      pclass: "oracle",
      note: polarisFeedPriceNote(stable, o.block),
      contract: { name: `Polaris ${stable} PriceFeed`, address: POLARIS_MARKET_CONFIG[o.market].priceFeed },
    },
    { label: "pETH amount × price", value: text(worth), kind: "derived", step: true },
  ];
  const at = o.block && o.block > 0 ? ` at block ${o.block.toLocaleString("en-US")}` : "";
  return {
    worth,
    equity,
    worthProv: {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `The collateral's worth in ${stable}. The pETH amount times the market's feed price${at}, ${gold ? "to six decimals" : "to the cent"}.`,
      formula: "amount × price",
      inputs: rows,
    },
    equityProv: {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `The position's equity at the feed. The collateral times the market's price for pETH in ${stable}, less the entire debt, all read${at}. A debt below zero is owed to the holder of the NFT and adds to it. It values the position at this block; a profit would need a price for each of the holder's deposits.`,
      formula: "amount × price − entire debt",
      inputs: [
        ...rows,
        {
          label: "entire debt",
          // A debt below zero is owed to the holder; its sign is the true minus.
          value: `${o.debt < 0 ? "−" : ""}${amountText(Math.abs(o.debt))} ${stable}`,
          kind: "chain",
          pclass: "state",
          note: "getCDPEntireDebt(id)",
        },
        { label: "equity", value: text(equity), kind: "derived", step: true },
      ],
    },
  };
}
