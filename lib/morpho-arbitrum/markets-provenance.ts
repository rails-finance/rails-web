// Receipts for the Morpho Blue Arbitrum protocol page's markets table
// (components/protocol/morpho/morpho-arbitrum-markets-view.tsx): every figure
// a read of the Arbitrum singleton, the loan token or the Aave V3 Arbitrum
// oracle at the one block the table names, served by
// GET /api/chain/morpho-arbitrum/markets.

import type { Provenance } from "@/components/shared/provenance";
import { AAVE_V3_ARBITRUM_ORACLE } from "@/lib/aave-v3-arbitrum/asset-catalog";
import { MORPHO_ARBITRUM_BLUE } from "./asset-catalog";

const LANE = "GET /api/chain/morpho-arbitrum/markets";
const BLUE = { name: "Morpho Blue (Arbitrum)", address: MORPHO_ARBITRUM_BLUE };

export interface MorphoArbitrumMarketCoords {
  blockNumber: number;
  marketId: string;
  loanSymbol: string;
  loanToken: string;
}

const recompute = (call: string, block: number): Provenance["verify"] => ({
  kind: "recompute",
  text: `Re-run the ${call} eth_call at block ${block} against any Arbitrum node`,
});

/** The market's loan-to-value, from the census's CreateMarket params. */
export const lltvProv = (c: MorphoArbitrumMarketCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: "The market id is keccak256(abi.encode(params)); recompute it from these params, or call idToMarketParams(id) on the singleton.",
  },
  summary: `Loan-to-value — the market's borrow limit and liquidation line at once, fixed at creation. Enumerated from the CreateMarket log the census read; the market id is the keccak of the params, so the figure cannot drift from the chain.`,
  contract: BLUE,
  via: `${LANE} · market params (id == keccak(params)) · idToMarketParams(id)`,
  inputs: [{ label: "market", value: c.marketId, kind: "chain", note: "Morpho market id" }],
});

/** A market's supplied or borrowed total: a field of `market(id)`, stored
 *  state at the market's last update. */
export const sizeProv = (side: "supplied" | "borrowed", c: MorphoArbitrumMarketCoords): Provenance => {
  const field = side === "supplied" ? "totalSupplyAssets" : "totalBorrowAssets";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: recompute("Morpho.market(id)", c.blockNumber),
    summary: `${c.loanSymbol} ${side} — the market's \`${field}\` from \`market(id)\` at block ${c.blockNumber}, scaled by the loan token's decimals. Stored state: Blue accrues interest only when a market is touched, so this is the balance at the market's last update.`,
    contract: BLUE,
    via: `${LANE} · Morpho.market(id).${field} @ block ${c.blockNumber}`,
    inputs: [{ label: "market", value: c.marketId, kind: "chain", note: "Morpho market id" }],
  };
};

/** The supply in dollars: the stored supply times the loan token's price on
 *  the Aave V3 Arbitrum oracle, both at the table's block. */
export const supplyUsdProv = (c: MorphoArbitrumMarketCoords, price: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("Morpho.market(id) and AaveOracle.getAssetPrice(loan token)", c.blockNumber),
  summary: `${c.loanSymbol} supplied in dollars — the market's \`totalSupplyAssets\` at block ${c.blockNumber} times ${c.loanSymbol}'s price on the Aave V3 Arbitrum oracle at the same block. Morpho Blue states no dollar price; the Aave oracle is the one this page converts with, and only for the loan tokens it ranks.`,
  contract: { name: "Aave V3 IAaveOracle (Arbitrum)", address: AAVE_V3_ARBITRUM_ORACLE },
  via: `${LANE} · Morpho.market(id).totalSupplyAssets × AaveOracle.getAssetPrice(${c.loanToken}) ÷ 1e8`,
  formula: "supplied × oracle price",
  inputs: [{ label: "price", value: `$${price.toFixed(4)}`, kind: "chain", note: `${c.loanSymbol}, 8-decimal USD` }],
});

/** Borrowed ÷ supplied, both from `market(id)` at the table's block. */
export const utilizationProv = (c: MorphoArbitrumMarketCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("Morpho.market(id)", c.blockNumber),
  summary: `Used — the share of the market's supply that is lent out: \`totalBorrowAssets\` ÷ \`totalSupplyAssets\` from \`market(id)\` at block ${c.blockNumber}, raw amounts so their decimals cancel.`,
  contract: BLUE,
  via: `${LANE} · Morpho.market(id): totalBorrowAssets ÷ totalSupplyAssets @ block ${c.blockNumber}`,
  formula: "totalBorrowAssets ÷ totalSupplyAssets",
});
