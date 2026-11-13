// One Comptroller's markets at one block, in the shape the family adapter
// draws (lib/comptroller/product.tsx): Compound V2's and Moonwell's market
// reads (lib/sources/chain/compound-v2-markets.ts, moonwell-market-state.ts)
// mapped onto one row type. Pure: the routes call it on the server and hand
// the result to the client page.
//
// A market's page key (`/markets/<key>`) is its underlying's lowercased
// address, as the Aave family's. Where that does not name one market, the key
// is the market token's address: Compound V2's ETH market has no underlying
// token, and its two WBTC markets share one.

import type { CompoundV2MarketsResponse } from "@/lib/sources/chain/compound-v2-markets";
import type { MoonwellMarketsResponse } from "@/lib/sources/chain/moonwell-market-state";
import type { ComptrollerRateModel } from "@/lib/comptroller/rate-model";
import type { ComptrollerFamilyKey } from "@/lib/comptroller/families";
import { COMPOUND_V2_MARKETS } from "@/lib/compound-v2/asset-catalog";
import { COMPOUND_V2_DEPRECATED, deprecationDate } from "@/lib/compound-v2/deprecated-markets";
import { headReadOf, type ServerRead } from "@/lib/shared/server-head-read";

export interface ComptrollerMarket {
  /** The page key: see the header. */
  key: string;
  /** The cToken or mToken. */
  market: string;
  /** Its symbol as the page names it ("cUSDC", "cWBTC2"). */
  marketSymbol: string;
  /** Null for a market of the chain's native coin. */
  underlying: string | null;
  symbol: string;
  decimals: number;
  /** Why the identity is the catalog's (cETH, SAI, MKR). */
  identityNote: string | null;
  /** In the underlying. */
  supplied: number;
  borrowed: number;
  cash: number;
  reserves: number;
  priceUsd: number | null;
  /** False where the oracle holds a fixed price with no feed (Compound V2). */
  priceHasFeed: boolean;
  priceFeed: string | null;
  /** Null at zero: the market backs no borrowing. */
  collateralFactor: number | null;
  /** In the underlying; null where the Comptroller keeps none, or at zero (no cap). */
  supplyCap: number | null;
  supplyCapOneUnit: boolean;
  borrowCap: number | null;
  borrowCapOneUnit: boolean;
  mintPaused: boolean;
  borrowPaused: boolean;
  /** A year, as fractions. */
  supplyApr: number | null;
  borrowApr: number | null;
  /** The per-period rates as read and the model's periods-a-year constant,
   *  for the receipts where the family prints a fixed year (Compound V2); null elsewhere. */
  supplyRatePerPeriodRaw: string | null;
  borrowRatePerPeriodRaw: string | null;
  modelPeriodsPerYear: number | null;
  reserveFactor: number | null;
  irm: string | null;
  rateModel: ComptrollerRateModel | null;
  /** Compound V2: the date the market became deprecated. */
  deprecatedSince: string | null;
}

export interface ComptrollerRead {
  family: ComptrollerFamilyKey;
  /** 0 when the read failed. */
  blockNumber: number;
  readBy: ServerRead | null;
  oracle: string | null;
  markets: ComptrollerMarket[];
  closeFactor: number | null;
  liquidationIncentive: number | null;
  failed: boolean;
}

/** Give each market its page key: the underlying where it names one market. */
function keyed(rows: Omit<ComptrollerMarket, "key">[]): ComptrollerMarket[] {
  const count = new Map<string, number>();
  for (const r of rows) if (r.underlying) count.set(r.underlying, (count.get(r.underlying) ?? 0) + 1);
  return rows.map((r) => ({
    ...r,
    key: r.underlying && count.get(r.underlying) === 1 ? r.underlying : r.market,
  }));
}

/** Compound V2's two cDAI and two cWBTC symbols, told apart. */
const CV2_LABEL: Record<string, string> = { sai: "cSAI", wbtc: "cWBTC", wbtc2: "cWBTC2" };

export function fromCompoundV2(data: CompoundV2MarketsResponse): ComptrollerRead {
  const key = (cToken: string) => COMPOUND_V2_MARKETS.find((c) => c.ctoken === cToken)?.key;
  return {
    family: "compound-v2",
    blockNumber: data.chainStale ? 0 : data.blockNumber,
    readBy: headReadOf(data.head, data.blockNumber, data.stored) ?? null,
    oracle: data.oracle,
    closeFactor: data.summary.closeFactor ?? null,
    liquidationIncentive: data.summary.liquidationIncentive ?? null,
    failed: data.chainStale || data.blockNumber <= 0,
    markets: keyed(
      data.markets.map((m) => {
        const k = key(m.cToken);
        return {
          market: m.cToken,
          marketSymbol: (k && CV2_LABEL[k]) ?? m.cTokenSymbol,
          underlying: m.underlying,
          symbol: m.underlyingSymbol,
          decimals: m.underlyingDecimals,
          identityNote: m.identityNote,
          supplied: m.totalSupplyUnderlying,
          borrowed: m.totalBorrowsUnderlying,
          cash: m.cashUnderlying,
          reserves: m.totalReservesUnderlying,
          priceUsd: m.priceUsd,
          priceHasFeed: m.priceHasFeed,
          priceFeed: m.priceFeed,
          collateralFactor: m.collateralFactor,
          supplyCap: null,
          supplyCapOneUnit: false,
          borrowCap: m.borrowCap ?? null,
          borrowCapOneUnit: m.borrowCapOneUnit ?? false,
          mintPaused: m.mintPaused ?? false,
          borrowPaused: m.borrowPaused ?? false,
          supplyApr: m.supplyApr != null ? m.supplyApr / 100 : null,
          borrowApr: m.borrowApr != null ? m.borrowApr / 100 : null,
          supplyRatePerPeriodRaw: m.supplyRatePerBlockRaw ?? null,
          borrowRatePerPeriodRaw: m.borrowRatePerBlockRaw ?? null,
          modelPeriodsPerYear: m.blocksPerYear ?? null,
          reserveFactor: m.reserveFactor,
          irm: m.interestRateModel,
          rateModel: m.rateModel ?? null,
          deprecatedSince: k && COMPOUND_V2_DEPRECATED[k] ? deprecationDate(k) : null,
        };
      }),
    ),
  };
}

export function fromMoonwell(data: MoonwellMarketsResponse, family: "moonwell" | "moonwell-base"): ComptrollerRead {
  return {
    family,
    blockNumber: data.chainStale ? 0 : data.blockNumber,
    readBy: headReadOf(data.head, data.blockNumber, data.stored) ?? null,
    oracle: data.oracle,
    closeFactor: data.summary.closeFactor,
    liquidationIncentive: data.summary.liquidationIncentive,
    failed: data.chainStale || data.blockNumber <= 0,
    markets: keyed(
      data.markets.map((m) => ({
        market: m.mToken,
        marketSymbol: m.mTokenSymbol,
        underlying: m.underlying,
        symbol: m.underlyingSymbol,
        decimals: m.underlyingDecimals,
        identityNote: null,
        supplied: m.totalSupplyUnderlying,
        borrowed: m.totalBorrowsUnderlying,
        cash: m.cashUnderlying,
        reserves: m.totalReservesUnderlying,
        priceUsd: m.priceUsd,
        priceHasFeed: true,
        priceFeed: null,
        collateralFactor: m.collateralFactor,
        supplyCap: m.supplyCap,
        supplyCapOneUnit: m.supplyCapOneUnit,
        borrowCap: m.borrowCap,
        borrowCapOneUnit: m.borrowCapOneUnit,
        mintPaused: m.mintPaused,
        borrowPaused: m.borrowPaused,
        supplyApr: m.supplyApr != null ? m.supplyApr / 100 : null,
        borrowApr: m.borrowApr != null ? m.borrowApr / 100 : null,
        supplyRatePerPeriodRaw: null,
        borrowRatePerPeriodRaw: null,
        modelPeriodsPerYear: null,
        reserveFactor: m.reserveFactor,
        irm: m.interestRateModel,
        rateModel: m.rateModel ?? null,
        deprecatedSince: null,
      })),
    ),
  };
}
