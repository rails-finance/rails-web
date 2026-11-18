// Dollar figures for a Morpho Blue Arbitrum wallet read. Blue states no USD:
// each market's oracle quotes the collateral in the loan token. Where the Aave
// V3 Arbitrum oracle prices the loan token (read at the same block,
// `MorphoWalletChainResponse.loanUsd`), a market's supply and debt are the
// amount × that price, and its collateral the amount × the composed price
// (the market oracle's price × the loan price), each as its receipt shows
// them, to the cent (lib/morpho/usd-receipt.ts). A total is the sum of its
// markets' products, drawn, and sent with the visit, only where every held
// market is priced. Markets are told apart by id: Morpho runs several on one
// pair (another LLTV or oracle), so a repeated pair is named with its LLTV.
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

/** A market no price reaches, by id, with the name the line gives it. */
export interface MorphoArbitrumUnpriced {
  id: string;
  name: string;
}

export interface MorphoArbitrumUsd {
  byMarket: Map<string, MorphoArbitrumMarketUsd>;
  /** Sums of the held markets' products; null when any held market is
   *  unpriced, as the dollar line draws no total then. The visit sends these,
   *  so the listing agrees with the page. */
  totals: { supplyUsd: number | null; collateralUsd: number | null; debtUsd: number | null };
  /** Held markets with a figure no price reaches: the loan token unpriced by
   *  the oracle, or collateral the market's oracle gives no price for. */
  unpriced: MorphoArbitrumUnpriced[];
}

const ORACLE = { name: "Aave V3 IAaveOracle (Arbitrum)", address: AAVE_V3_ARBITRUM_ORACLE };
const cents = (x: number) => Math.round(x * 100) / 100;
const pairOf = (p: Position) => `${p.loanSymbol} / ${p.collateralSymbol}`;
/** A market's name among `all`: its pair, with its LLTV where the pair repeats. */
export const morphoArbitrumMarketName = (p: Position, all: readonly Position[]): string =>
  all.filter((q) => pairOf(q) === pairOf(p)).length > 1
    ? `${pairOf(p)} ${(p.lltv * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
    : pairOf(p);
const priceOf = (read: Pick<MorphoWalletChainResponse, "loanUsd">, p: Position): number | null => {
  const px = read.loanUsd?.[p.loanToken.toLowerCase()];
  return px != null && px > 0 ? px : null;
};
const collateralPriced = (p: Position) => !(p.collateral > 0) || p.oraclePrice > 0;
const at = (block: number) => `at block ${block.toLocaleString("en-US")}`;

const collateralArgs = (p: Position, px: number, block: number | null) => ({
  collateral: p.collateralSymbol,
  loan: p.loanSymbol,
  oraclePrice: p.oraclePrice,
  oracleRaw: p.oraclePriceRaw ?? null,
  oracle: p.oracle,
  loanDecimals: p.loanDecimals,
  collateralDecimals: p.collateralDecimals,
  oracleBlock: block,
  loanUsd: px,
  loanNote: morphoAaveOraclePriceNote(ORACLE.name, p.loanSymbol, block),
});

export function morphoArbitrumUsd(read: Pick<MorphoWalletChainResponse, "positions" | "loanUsd">): MorphoArbitrumUsd {
  const byMarket = new Map<string, MorphoArbitrumMarketUsd>();
  const live = read.positions.filter((p) => !p.chainStale);
  let supply = 0;
  let coll = 0;
  let debt = 0;
  const unpriced: MorphoArbitrumUnpriced[] = [];
  for (const p of live) {
    const id = p.marketId.toLowerCase();
    const px = priceOf(read, p);
    if (px == null || !collateralPriced(p)) unpriced.push({ id, name: morphoArbitrumMarketName(p, live) });
    if (px == null) {
      byMarket.set(id, { supplyUsd: null, borrowUsd: null, collateralUsd: null });
      continue;
    }
    const u: MorphoArbitrumMarketUsd = {
      supplyUsd: shownUsd(p.currentSupply, px),
      borrowUsd: shownUsd(p.currentDebt, px),
      collateralUsd:
        p.collateral > 0
          ? p.oraclePrice > 0
            ? shownUsd(p.collateral, morphoCollateralPrice(collateralArgs(p, px, null)).price)
            : null
          : 0,
    };
    byMarket.set(id, u);
    supply += u.supplyUsd ?? 0;
    debt += u.borrowUsd ?? 0;
    coll += u.collateralUsd ?? 0;
  }
  const whole = unpriced.length === 0;
  return {
    byMarket,
    totals: {
      supplyUsd: whole ? cents(supply) : null,
      collateralUsd: whole ? cents(coll) : null,
      debtUsd: whole ? cents(debt) : null,
    },
    unpriced,
  };
}

export type MorphoArbitrumSide = "supply" | "collateral" | "debt";
const SIDE_WHAT: Record<MorphoArbitrumSide, string> = {
  supply: "Supplied in USD",
  collateral: "Collateral in USD",
  debt: "Debt in USD",
};

/** One side's figure over a set of markets, and the receipt that rebuilds
 *  it; null when a market on that side is unpriced or nothing is held.
 *  `all`: the markets the names are told apart among (the wallet's). */
export function morphoArbitrumSideReceipt(
  read: Pick<MorphoWalletChainResponse, "loanUsd" | "blockNumber">,
  positions: readonly Position[],
  side: MorphoArbitrumSide,
  all: readonly Position[] = positions,
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
    const name = morphoArbitrumMarketName(p, all);
    // Two markets in one token: each leg is named by its market.
    const label = twice(p) ? name : undefined;
    if (side === "collateral") {
      if (!(p.oraclePrice > 0)) return null;
      const c = morphoCollateralPrice(collateralArgs(p, px, block));
      legs.push({
        token,
        label,
        before: label ? c.before.map((r) => ({ ...r, label: `${label} ${r.label}` })) : c.before,
        amount: p.collateral,
        amountNote: `position(id, wallet).collateral in the ${name} market ${at(block)}`,
        price: c.price,
        priceNote: c.note,
        priceContract: ORACLE,
      });
    } else {
      legs.push({
        token,
        label,
        amount: side === "supply" ? p.currentSupply : p.currentDebt,
        amountNote: `the wallet's ${side === "supply" ? "supply" : "borrow"} shares at the ${name} market's totals ${at(block)}`,
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
    via: "GET /api/chain/morpho-arbitrum/wallet · position, market, oracle price() × AaveOracle.getAssetPrice(loan asset), one block",
    face: "cents",
    contract: ORACLE,
  });
}
