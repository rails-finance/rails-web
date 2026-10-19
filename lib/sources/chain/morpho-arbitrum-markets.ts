// The Morpho Blue Arbitrum protocol page's markets table — server-only.
// ----------------------------------------------------------------------------
// The census's 258 markets (lib/morpho-arbitrum/market-catalog.ts) read at one
// pinned block: `market(id)` for each in one multicall, and, for the loan
// tokens the page ranks in (MORPHO_ARBITRUM_RANKED_LOAN_TOKENS), the Aave V3
// Arbitrum oracle's price and the token's `totalSupply()` at the same block.
//
// A raw sort by supply puts artificial markets on top (rails-ops
// TO-DO-arbitrum-scoping.md item 13): a kJPY market of 1.6B units, a USDC
// market reporting 15.68B supplied. So a market is RANKED only when its loan
// token is one of the ranked units and its supply does not exceed that
// token's whole supply on Arbitrum; it is ranked by its supply in dollars.
// Every other funded market is listed unranked, in its own loan token.
//
// SERVER-ONLY.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { loanUsdAt } from "./morpho-arbitrum-wallet";
import { MORPHO_ARBITRUM_DEPLOYMENT } from "./morpho-deployments";
import { MORPHO_ARBITRUM_MARKETS } from "@/lib/morpho-arbitrum/market-catalog";
import { MORPHO_ARBITRUM_RANKED_LOAN_TOKENS } from "@/lib/morpho-arbitrum/asset-catalog";

const BLUE_ABI = parseAbi([
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
]);
const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

const ZERO = BigInt(0);

export interface MorphoArbitrumMarketRow {
  id: string;
  loanToken: string;
  loanSymbol: string | null;
  collateralToken: string;
  collateralSymbol: string | null;
  /** Liquidation LTV as a 0..1 fraction. */
  lltv: number;
  createdBlock: number;
  /** Stored totals (interest to the market's last update), raw integer strings. */
  supplyRaw: string;
  borrowRaw: string;
  /** The same in whole loan tokens; null where the token's decimals are unknown. */
  supply: number | null;
  borrow: number | null;
  /** Borrow ÷ supply; null on an empty market. */
  utilization: number | null;
  /** The supply in dollars, on ranked rows only. */
  supplyUsd: number | null;
  /** Why a market in a ranked loan token is listed unranked. */
  excluded?: "exceeds-token-supply";
}

export interface MorphoArbitrumMarketsResponse {
  blockNumber: number;
  censusBlock: number;
  marketCount: number;
  /** Ranked loan tokens' dollar prices at `blockNumber`, by lowercase address. */
  loanUsd: Record<string, number>;
  /** Funded markets in a ranked loan token, by supply in dollars. */
  ranked: MorphoArbitrumMarketRow[];
  /** Every other funded market, by loan token then supply. */
  unranked: MorphoArbitrumMarketRow[];
  /** Markets with nothing supplied at the block. */
  empty: MorphoArbitrumMarketRow[];
}

export async function loadMorphoArbitrumMarkets(): Promise<MorphoArbitrumMarketsResponse> {
  const deployment = MORPHO_ARBITRUM_DEPLOYMENT;
  const client = chainClient(deployment.chainId);
  const blue = deployment.blue as `0x${string}`;
  const blockNumber = await client.getBlockNumber();
  const rankedTokens = Object.keys(MORPHO_ARBITRUM_RANKED_LOAN_TOKENS);

  const [states, supplies, loanUsd] = await Promise.all([
    client.multicall({
      allowFailure: false,
      blockNumber,
      batchSize: 0,
      contracts: MORPHO_ARBITRUM_MARKETS.map((m) => ({
        address: blue,
        abi: BLUE_ABI,
        functionName: "market" as const,
        args: [m.id as `0x${string}`] as const,
      })),
    }),
    client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: rankedTokens.map((t) => ({
        address: t as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "totalSupply" as const,
      })),
    }),
    loanUsdAt(client, rankedTokens, blockNumber),
  ]);
  const tokenSupply = new Map<string, bigint>();
  rankedTokens.forEach((t, i) => {
    const r = supplies[i];
    if (r.status === "success") tokenSupply.set(t, r.result as bigint);
  });

  const ranked: MorphoArbitrumMarketRow[] = [];
  const unranked: MorphoArbitrumMarketRow[] = [];
  const empty: MorphoArbitrumMarketRow[] = [];
  MORPHO_ARBITRUM_MARKETS.forEach((m, i) => {
    const [supplyRaw, , borrowRaw] = states[i] as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    const scale = m.loanDecimals != null ? 10 ** m.loanDecimals : null;
    const supply = scale ? Number(supplyRaw) / scale : null;
    const loan = m.loanToken.toLowerCase();
    const px = loanUsd[loan];
    const cap = tokenSupply.get(loan);
    const inUnit = loan in MORPHO_ARBITRUM_RANKED_LOAN_TOKENS && px != null && supply != null;
    const exceeds = inUnit && cap != null && supplyRaw > cap;
    const row: MorphoArbitrumMarketRow = {
      id: m.id,
      loanToken: loan,
      loanSymbol: MORPHO_ARBITRUM_RANKED_LOAN_TOKENS[loan] ?? m.loanSymbol,
      collateralToken: m.collateralToken,
      collateralSymbol: m.collateralSymbol,
      lltv: Number(BigInt(m.lltv)) / 1e18,
      createdBlock: m.createdBlock,
      supplyRaw: supplyRaw.toString(),
      borrowRaw: borrowRaw.toString(),
      supply,
      borrow: scale ? Number(borrowRaw) / scale : null,
      utilization: supplyRaw > ZERO ? Number(borrowRaw) / Number(supplyRaw) : null,
      supplyUsd: inUnit && !exceeds && supply != null ? supply * px : null,
      ...(exceeds ? { excluded: "exceeds-token-supply" as const } : {}),
    };
    if (supplyRaw === ZERO) empty.push(row);
    else if (row.supplyUsd != null) ranked.push(row);
    else unranked.push(row);
  });
  ranked.sort((a, b) => (b.supplyUsd ?? 0) - (a.supplyUsd ?? 0));
  unranked.sort(
    (a, b) =>
      (a.loanSymbol ?? "~").localeCompare(b.loanSymbol ?? "~", "en-US") ||
      (b.supply ?? 0) - (a.supply ?? 0) ||
      a.id.localeCompare(b.id, "en-US"),
  );
  empty.sort((a, b) => a.createdBlock - b.createdBlock);

  return {
    blockNumber: Number(blockNumber),
    censusBlock: deployment.censusBlock,
    marketCount: MORPHO_ARBITRUM_MARKETS.length,
    loanUsd,
    ranked,
    unranked,
    empty,
  };
}
