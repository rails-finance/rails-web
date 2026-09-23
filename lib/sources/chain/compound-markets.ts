// Compound V3 (Comet) protocol view — each market's own state, read at one head
// block.
// ----------------------------------------------------------------------------
// The source of /compound/markets, the `views` cell of Compound V3's row — the
// same shape as /compound-v2/markets, /morpho/markets and /fluid/vaults: the
// position explorer answers "what happened to this wallet", this answers "what
// is the protocol". Read-only chain state: no index in the path, no history
// lane, no positions.
//
// The roster is the DEPLOYMENT's catalog — Ethereum's three Comets keyed to the
// backend's `market` column (migs 052–054), or Base's five
// (lib/compound-base/asset-catalog.ts). Comet deploys one proxy per market and
// exposes no on-chain call that enumerates them (nothing like V2's
// Comptroller.getAllMarkets), so a roster is stated rather than read on either
// chain — and the page's stamp says so instead of dressing it as an
// enumeration. Everything INSIDE a market is the contract's own answer: its
// collateral roster comes from its own numAssets/getAssetInfo, never from the
// catalog.
//
// One reader, two chains. Every figure below is arithmetic over a Comet slot,
// and that arithmetic must not diverge between deployments, so the deployment
// carries the only two things that actually differ: which chain to ask, and
// which proxies to ask.
//
// What the view claims: each Comet is ONE market — a single base asset that is
// both the lend and the borrow side, with utilisation (totalBorrow ÷
// totalSupply of that base) the number its whole rate curve is written
// against. The kink each curve turns at is read from the contract
// (supplyKink / borrowKink) and drawn on the SAME axis as the fill; a
// collateral factor lives on a different axis entirely (a borrower's debt
// against their own collateral), so factors are stated per collateral asset
// and never drawn on the utilisation bar.
//
// Scales — the same conventions scripts/verify-compound-v3-chain.mjs verifies
// on-chain for the position reader (lib/sources/chain/compound-position.ts):
//   • utilization, both kinks, the collateral factors and the rates are
//     1e18-scaled; rates are per SECOND, so APR = rate × 31,536,000 / 1e18.
//   • getPrice returns 8-decimal values in the market's own QUOTE UNIT, which
//     the catalog states per market (CometMarket.quoteUnit) from the base
//     feed's own `description()`. Values here are therefore in each market's
//     quote unit, never blindly "USD", and the two units are never summed
//     together. Base's cAEROv3 is why this is a stated field rather than a
//     rule about WETH: its base IS the volatile asset and it still quotes in
//     dollars.
//   • collateral balances and supply caps scale by getAssetInfo's own `scale`.
//   • getReserves is SIGNED (int256) base units — a market's reserve line can
//     run negative; targetReserves is the level governance set for it. While
//     reserves sit below the target, the market sells absorbed collateral at
//     the configured discount to refill; at or above it, buyCollateral stops.
//
// SERVER-ONLY — imported from /api/chain/* route handlers and the SSR page only.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { chainClient } from "./rpc";
import { COMPOUND_DEPLOYMENT, type CometDeployment } from "@/lib/compound/asset-catalog";
import { resolveErc20Meta } from "./erc20-meta";

const COMET_ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function totalBorrow() view returns (uint256)",
  "function getUtilization() view returns (uint256)",
  "function supplyKink() view returns (uint256)",
  "function borrowKink() view returns (uint256)",
  "function getReserves() view returns (int256)",
  "function targetReserves() view returns (uint256)",
  "function baseTokenPriceFeed() view returns (address)",
  "function baseBorrowMin() view returns (uint104)",
  "function numAssets() view returns (uint8)",
  "function getSupplyRate(uint256 utilization) view returns (uint64)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function totalsCollateral(address asset) view returns (uint128 totalSupplyAsset, uint128 reserved)",
]);

interface AssetInfo {
  offset: number;
  asset: string;
  priceFeed: string;
  scale: bigint;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
  liquidationFactor: bigint;
  supplyCap: bigint;
}

const FACTOR = 1e18; // Comet factors, kinks, utilization and rates are 1e18-scaled
const PRICE = 1e8; // getPrice returns 8-decimal values in the market's quote unit
const SECONDS_PER_YEAR = 31_536_000; // Comet rates are per second

export interface CompoundV3CollateralRow {
  /** The collateral token address (lowercased). */
  asset: string;
  symbol: string;
  /** Market-wide total of this asset supplied, in the asset's own units
   *  (Comet.totalsCollateral — collateral is pooled per asset, not per account). */
  totalSupplied: number;
  /** The governance supply cap, in the asset's own units. 0 means supplying
   *  this asset is switched off — not an unlimited cap. */
  supplyCap: number;
  /** totalSupplied ÷ supplyCap — how much of the allowed room is used. Null
   *  when the cap is zero (there is no room to be a fraction of). */
  capUsed: number | null;
  /** The market's own oracle price for one whole token, in the market's quote
   *  unit (getPrice on the feed this asset's configuration names). */
  price: number;
  /** totalSupplied × price, in the market's quote unit. */
  suppliedValue: number;
  /** The three governance factors, as fractions. A borrowCollateralFactor of 0
   *  means the asset is deprecated for NEW borrowing while it stays
   *  liquidation-eligible at its liquidate factor. */
  borrowCollateralFactor: number;
  liquidateCollateralFactor: number;
  liquidationFactor: number;
}

export interface CompoundV3MarketRow {
  /** The catalog slug — matches the backend `market` column. */
  key: string;
  /** Display label, e.g. "cUSDCv3". */
  label: string;
  /** The Comet proxy address. */
  comet: string;
  baseSymbol: string;
  baseToken: string;
  baseDecimals: number;
  /** The unit this market's price feeds quote in — USD, or ETH for cWETHv3.
   *  Verified on-chain (base price ≈ 1.0 in every market). */
  quoteUnit: string;

  /** Base-asset totals in the base's own units. Interest included: Comet's
   *  totals carry the live index. */
  totalSupplyBase: number;
  totalBorrowBase: number;
  /** The market's own oracle price for one base token, in its quote unit. */
  basePrice: number;
  totalSupplyValue: number;
  totalBorrowValue: number;

  /** Comet.getUtilization — totalBorrow ÷ totalSupply of the base, the
   *  contract's own arithmetic (1e18-scaled), not re-derived here. */
  utilization: number;
  /** The utilisation each rate curve turns steep at, as fractions. Both sit on
   *  the utilisation axis, so both can be drawn against the fill. */
  supplyKink: number;
  borrowKink: number;
  /** Annual rates as FRACTIONS (0.043 = 4.3%) — the contract's own per-second
   *  rate at the current utilization × seconds per year. */
  supplyApr: number;
  borrowApr: number;

  /** The market's reserve line in base units — SIGNED, can run negative. */
  reservesBase: number;
  /** The governance target for that line, in base units. */
  targetReservesBase: number;
  /** reserves ÷ target. Null when the target is zero. */
  reservesOfTarget: number | null;
  /** The smallest borrow the market accepts, in base units. */
  baseBorrowMin: number;

  /** The market's own collateral roster (numAssets/getAssetInfo), largest
   *  supplied value first. */
  collateral: CompoundV3CollateralRow[];
  /** Σ collateral supplied × its oracle price, in the market's quote unit. */
  totalCollateralValue: number;
}

export interface CompoundV3MarketsResponse {
  blockNumber: number;
  markets: CompoundV3MarketRow[];
  summary: {
    total: number;
    /** Totals over the USD-quoted markets only (one unit, so one sum). */
    suppliedUsd: number | null;
    borrowedUsd: number | null;
    utilisationUsd: number | null;
    /** The ETH-quoted market's own totals, kept out of the USD sums. */
    suppliedEth: number | null;
    borrowedEth: number | null;
    /** Distinct collateral assets configured across the roster. */
    collateralAssets: number;
  };
  /** True when the chain read failed and we returned an empty roster. */
  chainStale: boolean;
}

function empty(): CompoundV3MarketsResponse {
  return {
    blockNumber: 0,
    markets: [],
    summary: {
      total: 0,
      suppliedUsd: null,
      borrowedUsd: null,
      utilisationUsd: null,
      suppliedEth: null,
      borrowedEth: null,
      collateralAssets: 0,
    },
    chainStale: true,
  };
}

export async function loadCompoundV3Markets(
  deployment: CometDeployment = COMPOUND_DEPLOYMENT,
): Promise<CompoundV3MarketsResponse> {
  try {
    const client = chainClient(deployment.chainId);
    const roster = deployment.markets;

    // Heterogeneous multicalls: type the entries as the generic viem contract
    // parameters (per-call return types are asserted at the result casts).
    const at = (comet: string, functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
      ({ address: comet as `0x${string}`, abi: COMET_ABI, functionName, args }) as ContractFunctionParameters;

    // The head block is taken FIRST and every call below is pinned to it. An
    // unpinned batch can answer at a later block than the one the response
    // names — on a 2-second chain, routinely — and a receipt that says "re-run
    // this call at block N" has to reproduce at block N.
    const blockNumber = Number(await client.getBlockNumber());
    const atBlock = { blockNumber: BigInt(blockNumber) };

    // Phase 1 — each market's totals, curve constants, reserve line, base feed
    // and collateral count, in one multicall.
    const PER1 = 10;
    const p1 = (await client.multicall({
      allowFailure: false,
      ...atBlock,
      contracts: roster.flatMap((m) => [
        at(m.comet, "totalSupply"),
        at(m.comet, "totalBorrow"),
        at(m.comet, "getUtilization"),
        at(m.comet, "supplyKink"),
        at(m.comet, "borrowKink"),
        at(m.comet, "getReserves"),
        at(m.comet, "targetReserves"),
        at(m.comet, "baseTokenPriceFeed"),
        at(m.comet, "baseBorrowMin"),
        at(m.comet, "numAssets"),
      ]),
    })) as unknown[];

    const numAssets = roster.map((_, i) => Number(p1[i * PER1 + 9] as number));
    const utilization = roster.map((_, i) => p1[i * PER1 + 2] as bigint);
    const baseFeed = roster.map((_, i) => p1[i * PER1 + 7] as string);

    // Phase 2 — the utilization-dependent rates, the base price, and each
    // market's own collateral roster (getAssetInfo per enumerated slot).
    const off2: number[] = [];
    const c2: ContractFunctionParameters[] = [];
    roster.forEach((m, i) => {
      off2[i] = c2.length;
      c2.push(
        at(m.comet, "getSupplyRate", [utilization[i]]),
        at(m.comet, "getBorrowRate", [utilization[i]]),
        at(m.comet, "getPrice", [baseFeed[i]]),
      );
      for (let a = 0; a < numAssets[i]; a++) c2.push(at(m.comet, "getAssetInfo", [a]));
    });
    const p2 = (await client.multicall({ allowFailure: false, ...atBlock, contracts: c2 })) as unknown[];
    const infos: AssetInfo[][] = roster.map((_, i) =>
      Array.from({ length: numAssets[i] }, (_, a) => p2[off2[i] + 3 + a] as AssetInfo),
    );

    // Phase 3 — per collateral asset: the market-wide total supplied
    // (totalsCollateral) and its configured feed's price.
    const off3: number[] = [];
    const c3: ContractFunctionParameters[] = [];
    roster.forEach((m, i) => {
      off3[i] = c3.length;
      for (const a of infos[i]) {
        c3.push(at(m.comet, "totalsCollateral", [a.asset]), at(m.comet, "getPrice", [a.priceFeed]));
      }
    });
    const p3 = (await client.multicall({ allowFailure: false, ...atBlock, contracts: c3 })) as unknown[];

    // Name the collateral tokens in one cached multicall.
    const metas = await resolveErc20Meta(
      infos.flat().map((a) => a.asset.toLowerCase()),
      deployment.chainId,
    );

    const markets: CompoundV3MarketRow[] = roster.map((m, i) => {
      const b = i * PER1;
      const baseScale = 10 ** m.baseDecimals;
      const totalSupplyBase = Number(p1[b] as bigint) / baseScale;
      const totalBorrowBase = Number(p1[b + 1] as bigint) / baseScale;
      const basePrice = Number(p2[off2[i] + 2] as bigint) / PRICE;

      const collateral: CompoundV3CollateralRow[] = infos[i].map((a, ai) => {
        // totalsCollateral is a two-field return; viem decodes it positionally.
        const [totalSuppliedRaw] = p3[off3[i] + ai * 2] as [bigint, bigint];
        const price = Number(p3[off3[i] + ai * 2 + 1] as bigint) / PRICE;
        const scale = Number(a.scale);
        const totalSupplied = Number(totalSuppliedRaw) / scale;
        const supplyCap = Number(a.supplyCap) / scale;
        const addr = a.asset.toLowerCase();
        const meta = metas.get(addr);
        return {
          asset: addr,
          symbol: meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
          totalSupplied,
          supplyCap,
          capUsed: supplyCap > 0 ? totalSupplied / supplyCap : null,
          price,
          suppliedValue: totalSupplied * price,
          borrowCollateralFactor: Number(a.borrowCollateralFactor) / FACTOR,
          liquidateCollateralFactor: Number(a.liquidateCollateralFactor) / FACTOR,
          liquidationFactor: Number(a.liquidationFactor) / FACTOR,
        };
      });
      collateral.sort((x, y) => y.suppliedValue - x.suppliedValue);

      return {
        key: m.key,
        label: m.label,
        comet: m.comet,
        baseSymbol: m.baseSymbol,
        baseToken: m.baseToken,
        baseDecimals: m.baseDecimals,
        quoteUnit: m.quoteUnit,

        totalSupplyBase,
        totalBorrowBase,
        basePrice,
        totalSupplyValue: totalSupplyBase * basePrice,
        totalBorrowValue: totalBorrowBase * basePrice,

        utilization: Number(utilization[i]) / FACTOR,
        supplyKink: Number(p1[b + 3] as bigint) / FACTOR,
        borrowKink: Number(p1[b + 4] as bigint) / FACTOR,
        supplyApr: (Number(p2[off2[i]] as bigint) * SECONDS_PER_YEAR) / FACTOR,
        borrowApr: (Number(p2[off2[i] + 1] as bigint) * SECONDS_PER_YEAR) / FACTOR,

        reservesBase: Number(p1[b + 5] as bigint) / baseScale,
        targetReservesBase: Number(p1[b + 6] as bigint) / baseScale,
        reservesOfTarget: (() => {
          const target = Number(p1[b + 6] as bigint) / baseScale;
          return target > 0 ? Number(p1[b + 5] as bigint) / baseScale / target : null;
        })(),
        baseBorrowMin: Number(p1[b + 8] as bigint) / baseScale,

        collateral,
        totalCollateralValue: collateral.reduce((t, c) => t + c.suppliedValue, 0),
      };
    });

    // One unit per sum: the USD-quoted markets total together, the ETH-quoted
    // market stands alone. Never blended.
    const usdRows = markets.filter((m) => m.quoteUnit === "USD");
    const ethRows = markets.filter((m) => m.quoteUnit === "ETH");
    const suppliedUsd = usdRows.length > 0 ? usdRows.reduce((t, m) => t + m.totalSupplyValue, 0) : null;
    const borrowedUsd = usdRows.length > 0 ? usdRows.reduce((t, m) => t + m.totalBorrowValue, 0) : null;

    return {
      blockNumber,
      markets,
      summary: {
        total: markets.length,
        suppliedUsd,
        borrowedUsd,
        utilisationUsd:
          suppliedUsd != null && borrowedUsd != null && suppliedUsd > 0 ? borrowedUsd / suppliedUsd : null,
        suppliedEth: ethRows.length > 0 ? ethRows.reduce((t, m) => t + m.totalSupplyValue, 0) : null,
        borrowedEth: ethRows.length > 0 ? ethRows.reduce((t, m) => t + m.totalBorrowValue, 0) : null,
        collateralAssets: new Set(markets.flatMap((m) => m.collateral.map((c) => c.asset))).size,
      },
      chainStale: false,
    };
  } catch (error) {
    console.error("Compound V3 markets chain read failed:", error);
    return empty();
  }
}
