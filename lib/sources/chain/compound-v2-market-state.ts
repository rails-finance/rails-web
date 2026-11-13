// Compound V2 (Ethereum L1) per-market chain state — server-only.
// ----------------------------------------------------------------------------
// Batched multicalls over the twenty catalog markets, feeding the position
// listing's presentation layer (the moonwell-market-state shape, re-grounded
// in original-V2 mechanics):
//   • exchangeRateStored — cToken → underlying rate (scale 1e(18 + underlying
//     decimals − 8)); cTokens × rate = balanceOfUnderlying, the CURRENT supply
//     value including accrued interest.
//   • oracle getUnderlyingPrice(cToken) — the oracle the Comptroller itself
//     names (read live via Comptroller.oracle(), never hardcoded); USD scale
//     1e(36 − underlying decimals). PLUS the oracle's own getConfig: three
//     markets carry a stored fixedPrice and NO feed (cSAI at $14.4263) —
//     `priceHasFeed` says which, so every USD surface can label the basis.
//   • borrow/supplyRatePerBlock — per-BLOCK rates (original V2; the opposite
//     of Moonwell's per-timestamp convention), as APYs by the docs' formula
//     (lib/comptroller/apy.ts). Each model's blocksPerYear() is read
//     for the receipts: the constant the model sets its per-block curve with.
//
// Every catalog market is read at one block, through rails-server's head
// routes and, when the latest read fails, its stored snapshot (surface
// `compound-v2:ethereum:market-state`, lib/sources/api/head-snapshot.ts); the
// map names its block and who answered (`read`).
//
// Degrades to an empty map when no read and no snapshot answer — callers must
// treat an absent market as "unpriced/unrated" and fall back to amounts-only
// (never assert a partial total).
//
// SERVER-ONLY — imported from /api/* route handlers only.

import { parseAbi, type ContractFunctionParameters, type PublicClient } from "viem";
import { withHeadSnapshot } from "@/lib/sources/api/head-snapshot";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type { StoredHeadRead } from "@/lib/shared/server-head-read";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { COMPOUND_V2_MARKETS, COMPOUND_V2_ADDRESSES, CTOKEN_DECIMALS } from "@/lib/compound-v2/asset-catalog";
import { compoundV2Apy } from "@/lib/comptroller/apy";

const CTOKEN_ABI = parseAbi([
  "function exchangeRateStored() view returns (uint256)",
  "function borrowRatePerBlock() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function interestRateModel() view returns (address)",
]);
const COMPTROLLER_ABI = parseAbi(["function oracle() view returns (address)"]);
const IRM_ABI = parseAbi(["function blocksPerYear() view returns (uint256)"]);
const ORACLE_ABI = parseAbi([
  "function getUnderlyingPrice(address cToken) view returns (uint256)",
  "function getConfig(address cToken) view returns ((uint8 underlyingAssetDecimals, address priceFeed, uint256 fixedPrice))",
]);

const ZERO = BigInt(0);
const isZeroAddr = (a: string | undefined | null) => !a || BigInt(a) === ZERO;

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

export interface CompoundV2MarketState {
  /** The backend market key ('dai' | 'sai' | 'wbtc' | 'wbtc2' | …). */
  market: string;
  /** cTokens (8 dp) → underlying (whole units): underlying = cTokens × this. */
  exchangeRate: number;
  /** The raw exchangeRateStored uint (scale 1e(18 + underlying dec − 8)). */
  exchangeRateRaw: string;
  /** Oracle USD per whole underlying token (chain-derived). */
  priceUsd: number | null;
  /** False when the price is a stored constant with no feed behind it. */
  priceHasFeed: boolean;
  /** APYs as fractions (0.0135 = 1.35%), the per-block rate by the docs'
   *  formula (lib/comptroller/apy.ts). */
  borrowApr: number | null;
  supplyApr: number | null;
  /** The per-block borrow rate as read (a 1e18 mantissa), for the receipt. */
  borrowRatePerBlockRaw: string | null;
  /** The model's `blocksPerYear()`, the constant it sets its per-block curve with. */
  blocksPerYear: number | null;
}

/** The block a market-state map was read at and who answered: rails-server
 *  live (`head`), its stored snapshot (`stored`), or neither (the chain). */
export interface CompoundV2MarketRead {
  blockNumber: number;
  head?: PositionHeadStamp;
  stored?: StoredHeadRead;
}

/** Keyed by market key. Empty when no read and no snapshot answered; `read`
 *  names the block of a filled map. */
export type CompoundV2MarketStateMap = Map<string, CompoundV2MarketState> & { read?: CompoundV2MarketRead };

/** The head-snapshot surface this loader's reads are stored under. */
const MARKET_STATE_SURFACE = "compound-v2:ethereum:market-state";

/** Every catalog market's state at one block, through rails-server's head
 *  routes and, when the latest read fails, its stored snapshot. */
export async function resolveCompoundV2MarketState(): Promise<CompoundV2MarketStateMap> {
  try {
    const { value, stored } = await withHeadSnapshot(
      { surface: MARKET_STATE_SURFACE, chainId: MAINNET_CHAIN_ID },
      readMarketState,
      (map) => map.size > 0,
    );
    const block = value.read?.blockNumber;
    if (block != null && value.size > 0) {
      const head = stored ? undefined : serverHeadStampAt(MAINNET_CHAIN_ID, block);
      value.read = {
        blockNumber: stored?.blockNumber ?? block,
        ...(head ? { head } : {}),
        ...(stored ? { stored } : {}),
      };
    } else delete value.read;
    return value;
  } catch {
    return new Map(); // No read and no snapshot (or ALCHEMY_URL unset): amounts-only.
  }
}

/** The twenty catalog markets, whichever rows a page holds, at one block, so
 *  that a stored snapshot answers any page. Throws where the block cannot be read. */
async function readMarketState(client: PublicClient): Promise<CompoundV2MarketStateMap> {
  const out: CompoundV2MarketStateMap = new Map();
  const blockNumber = await client.getBlockNumber();
  const at = { blockNumber };

  const PER_MARKET = 4;
  let first: Res[] = [];
  try {
    first = (await client.multicall({
      allowFailure: true,
      ...at,
      contracts: [
        {
          address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
          abi: COMPTROLLER_ABI,
          functionName: "oracle",
        } as ContractFunctionParameters,
        ...COMPOUND_V2_MARKETS.flatMap((m): ContractFunctionParameters[] => [
          { address: m.ctoken as `0x${string}`, abi: CTOKEN_ABI, functionName: "exchangeRateStored" },
          { address: m.ctoken as `0x${string}`, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" },
          { address: m.ctoken as `0x${string}`, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" },
          { address: m.ctoken as `0x${string}`, abi: CTOKEN_ABI, functionName: "interestRateModel" },
        ]),
      ],
    })) as Res[];
  } catch {
    return out;
  }

  const oracle = ok<string>(first[0]);
  if (!oracle || isZeroAddr(oracle)) return out;

  // Second pass: each market's oracle price + config, and its model's
  // blocksPerYear (the five oldest markets' WhitePaper model still answers it).
  const irmOf = COMPOUND_V2_MARKETS.map((_, i) => ok<string>(first[1 + i * PER_MARKET + 3]));
  let second: Res[] = [];
  try {
    second = (await client.multicall({
      allowFailure: true,
      ...at,
      contracts: COMPOUND_V2_MARKETS.flatMap((m, i): ContractFunctionParameters[] => {
        const irm = (irmOf[i] && !isZeroAddr(irmOf[i]) ? irmOf[i]! : m.ctoken) as `0x${string}`;
        return [
          {
            address: oracle as `0x${string}`,
            abi: ORACLE_ABI,
            functionName: "getUnderlyingPrice",
            args: [m.ctoken as `0x${string}`],
          },
          {
            address: oracle as `0x${string}`,
            abi: ORACLE_ABI,
            functionName: "getConfig",
            args: [m.ctoken as `0x${string}`],
          },
          { address: irm, abi: IRM_ABI, functionName: "blocksPerYear" },
        ];
      }),
    })) as Res[];
  } catch {
    return out;
  }

  COMPOUND_V2_MARKETS.forEach((m, i) => {
    const rateRaw = ok<bigint>(first[1 + i * PER_MARKET]);
    if (rateRaw == null) return; // no exchange rate → skip market entirely
    // exchangeRateStored scale: 1e(18 + underlyingDecimals − cTokenDecimals).
    const exchangeRate = Number(rateRaw) / 10 ** (18 + m.decimals - CTOKEN_DECIMALS);

    const priceRaw = ok<bigint>(second[i * 3]);
    const cfg = ok<{ underlyingAssetDecimals: number; priceFeed: string; fixedPrice: bigint }>(second[i * 3 + 1]);
    const priceUsd = priceRaw != null && priceRaw > ZERO ? Number(priceRaw) / 10 ** (36 - m.decimals) : null;
    const priceHasFeed = cfg != null ? !isZeroAddr(cfg.priceFeed) : true;

    const bpyRaw = ok<bigint>(second[i * 3 + 2]);
    const blocksPerYear = bpyRaw != null && bpyRaw > ZERO ? Number(bpyRaw) : null;
    const apr = (r: Res | undefined): number | null => {
      const v = ok<bigint>(r);
      return v != null ? compoundV2Apy(v) : null;
    };

    out.set(m.key, {
      market: m.key,
      exchangeRate,
      exchangeRateRaw: rateRaw.toString(),
      priceUsd,
      priceHasFeed,
      borrowApr: apr(first[1 + i * PER_MARKET + 1]),
      supplyApr: apr(first[1 + i * PER_MARKET + 2]),
      borrowRatePerBlockRaw: ok<bigint>(first[1 + i * PER_MARKET + 1])?.toString() ?? null,
      blocksPerYear,
    });
  });

  if (out.size > 0) out.read = { blockNumber: Number(blockNumber) };
  return out;
}
