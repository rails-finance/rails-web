// Dollar figures for a Morpho Blue Arbitrum wallet read. Blue states no USD:
// each market's oracle quotes the collateral in the loan token. Where the Aave
// V3 Arbitrum oracle prices the loan token (read at the same block,
// `MorphoWalletChainResponse.loanUsd`), a market's supply and debt are the
// amount × that price, and its collateral the amount × the composed price
// (the market oracle's price × the loan price), each as its receipt shows
// them, to the cent (lib/morpho/usd-receipt.ts). A total is the sum of its
// markets' products, drawn only where every held market is priced.
// Client-safe.

import type { Provenance } from "@/components/shared/provenance";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import type { UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { shownUsd } from "@/lib/shared/holder-usd-receipt";
import { AAVE_V3_ARBITRUM_ORACLE } from "@/lib/aave-v3-arbitrum/asset-catalog";
import { morphoCollateralPrice, morphoUsdReceipt } from "@/lib/morpho/usd-receipt";
import { morphoAaveOraclePriceNote } from "@/lib/morpho/price-notes";

type Position = MorphoWalletChainResponse["positions"][number];

export interface MorphoArbitrumMarketUsd {
  supplyUsd: number | null;
  borrowUsd: number | null;
  /** The collateral at the composed price; null without an oracle price. */
  collateralUsd: number | null;
}

export interface MorphoArbitrumUsd {
  byMarket: Map<string, MorphoArbitrumMarketUsd>;
  /** Sums of the priced markets' products; null when a held market is
   *  unpriced and nothing is priced. The visit body sends these; the dollar
   *  line draws a total only when `unpriced` is 0. */
  totals: { supplyUsd: number | null; collateralUsd: number | null; debtUsd: number | null };
  /** Held markets with a figure no price reaches: the loan token unpriced by
   *  the oracle, or collateral the market's oracle gives no price for. */
  unpriced: number;
  /** Their pairs, "USDC / WETH". */
  unpricedPairs: string[];
}

const ORACLE = { name: "Aave V3 IAaveOracle (Arbitrum)", address: AAVE_V3_ARBITRUM_ORACLE };
const cents = (x: number) => Math.round(x * 100) / 100;
export const morphoArbitrumPair = (p: Position) => `${p.loanSymbol} / ${p.collateralSymbol}`;
const priceOf = (read: Pick<MorphoWalletChainResponse, "loanUsd">, p: Position): number | null => {
  const px = read.loanUsd?.[p.loanToken.toLowerCase()];
  return px != null && px > 0 ? px : null;
};
const collateralPriced = (p: Position) => !(p.collateral > 0) || p.oraclePrice > 0;

export function morphoArbitrumUsd(read: Pick<MorphoWalletChainResponse, "positions" | "loanUsd">): MorphoArbitrumUsd {
  const byMarket = new Map<string, MorphoArbitrumMarketUsd>();
  let supply = 0;
  let coll = 0;
  let debt = 0;
  let priced = 0;
  const unpricedPairs: string[] = [];
  for (const p of read.positions) {
    if (p.chainStale) continue;
    const px = priceOf(read, p);
    if (px == null) {
      unpricedPairs.push(morphoArbitrumPair(p));
      byMarket.set(p.marketId.toLowerCase(), { supplyUsd: null, borrowUsd: null, collateralUsd: null });
      continue;
    }
    if (!collateralPriced(p)) unpricedPairs.push(morphoArbitrumPair(p));
    priced++;
    const u: MorphoArbitrumMarketUsd = {
      supplyUsd: shownUsd(p.currentSupply, px),
      borrowUsd: shownUsd(p.currentDebt, px),
      collateralUsd:
        p.collateral > 0
          ? p.oraclePrice > 0
            ? shownUsd(p.collateral, morphoCollateralPrice(collateralArgs(p, px, 0)).price)
            : null
          : 0,
    };
    byMarket.set(p.marketId.toLowerCase(), u);
    supply += u.supplyUsd ?? 0;
    debt += u.borrowUsd ?? 0;
    coll += u.collateralUsd ?? 0;
  }
  const none = priced === 0 && unpricedPairs.length > 0;
  return {
    byMarket,
    totals: {
      supplyUsd: none ? null : cents(supply),
      collateralUsd: none ? null : cents(coll),
      debtUsd: none ? null : cents(debt),
    },
    unpriced: unpricedPairs.length,
    unpricedPairs,
  };
}

const collateralArgs = (p: Position, px: number, block: number) => ({
  collateral: p.collateralSymbol,
  loan: p.loanSymbol,
  oraclePrice: p.oraclePrice,
  oracleBlock: block,
  loanUsd: px,
  loanNote: morphoAaveOraclePriceNote(ORACLE.name, p.loanSymbol, block),
});

export type MorphoArbitrumSide = "supply" | "collateral" | "debt";
const SIDE_WHAT: Record<MorphoArbitrumSide, string> = {
  supply: "Supplied in USD",
  collateral: "Collateral in USD",
  debt: "Debt in USD",
};

/** One side's figure over a set of markets, and the receipt that rebuilds
 *  it; null when a market on that side is unpriced or nothing is held. */
export function morphoArbitrumSideReceipt(
  read: Pick<MorphoWalletChainResponse, "loanUsd" | "blockNumber">,
  positions: readonly Position[],
  side: MorphoArbitrumSide,
): { prov: Provenance; usd: number } | null {
  const block = read.blockNumber;
  const held = positions.filter(
    (p) => !p.chainStale && (side === "supply" ? p.currentSupply : side === "debt" ? p.currentDebt : p.collateral) > 0,
  );
  const tokenOf = (p: Position) => (side === "collateral" ? p.collateralSymbol : p.loanSymbol);
  const twice = (p: Position) => held.filter((q) => tokenOf(q) === tokenOf(p)).length > 1;
  const legs: UsdLeg[] = [];
  for (const p of held) {
    const px = priceOf(read, p);
    if (px == null) return null;
    const token = tokenOf(p);
    // Two markets in one token: each leg is named by its market.
    const label = twice(p) ? morphoArbitrumPair(p) : undefined;
    if (side === "collateral") {
      if (!(p.oraclePrice > 0)) return null;
      const c = morphoCollateralPrice(collateralArgs(p, px, block));
      legs.push({
        token,
        label,
        amount: p.collateral,
        amountNote: `Morpho.position(id, wallet).collateral in the ${morphoArbitrumPair(p)} market at block ${block.toLocaleString("en-US")}`,
        price: c.price,
        priceNote: c.note,
        priceContract: ORACLE,
      });
    } else {
      legs.push({
        token,
        label,
        amount: side === "supply" ? p.currentSupply : p.currentDebt,
        amountNote: `the wallet's ${side === "supply" ? "supply" : "borrow"} shares at the ${morphoArbitrumPair(p)} market's totals, at block ${block.toLocaleString("en-US")}`,
        price: px,
        priceNote: morphoAaveOraclePriceNote(ORACLE.name, p.loanSymbol, block),
        priceContract: ORACLE,
      });
    }
  }
  return morphoUsdReceipt({
    what: SIDE_WHAT[side],
    legs,
    block,
    via: "GET /api/chain/morpho-arbitrum/wallet · Morpho.position, Morpho.market, oracle price() × AaveOracle.getAssetPrice(loan asset), one block",
    face: "cents",
    contract: ORACLE,
  });
}
