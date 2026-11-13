// Compound V2 protocol view — every listed market, read at one head block.
// ----------------------------------------------------------------------------
// The source of /compound-v2/markets, the `views` cell of Compound V2's row —
// the same shape as the Aave V3 market roster, Morpho's market list and Fluid's
// vault ladders. It answers "what is the protocol", where the position explorer
// answers "what happened to this wallet"; the two sit side by side and neither
// substitutes for the other.
//
// Read-only chain state: no index in the path, no history lane, no positions.
// That is this page's job, not a limit on the protocol — the position explorer
// is built separately and indexes the history this file never touches.
//
// What the view claims is Compound V2's own condition: the money is parked. The
// borrowing the protocol was built for has drained away — $12.4M against $106M
// supplied, two markets holding 94.5% of what's left — and what remains is a
// large pile of collateral sitting in a protocol governance is winding down.
// Every figure below is the protocol's own; none of it is inferred.
//
// The read is two multicalls over a roster the Comptroller states itself:
//   1. getAllMarkets() + oracle() — the Comptroller is the authority on what is
//      listed and on which oracle prices it. Neither is hardcoded here.
//   2. Per market: the cToken's own totals + rates, the Comptroller's markets()
//      record (collateral factor), the oracle's getUnderlyingPrice, and the
//      oracle's getConfig (whether a live feed backs that price at all).
//
// Scales, all verified in scripts/verify-compound-v2-chain.mjs:
//   • supplied underlying = totalSupply (8dp) × exchangeRateStored / 1e18,
//     then / 1e^underlyingDecimals. exchangeRateStored is itself scaled
//     1e(18 + underlyingDecimals − 8), which is why the 1e18 divide lands.
//   • oracle price is scaled 1e(36 − underlyingDecimals) — the protocol's own
//     convention, so a whole token's USD is price / 1e(36 − ud).
//   • rates are per BLOCK on Compound V2 proper (borrowRatePerBlock), NOT per
//     timestamp — the opposite of Moonwell, which kept its Base/Moonbeam
//     per-second convention. Annualised on 2,628,000 blocks, the year of
//     12-second blocks Compound's docs count (lib/compound-v2/rate-year.ts).
//     Each model's `blocksPerYear()` is still read: 2,628,000 on cETH's,
//     2,102,400 on the rest. It is the constant the model sets its per-block
//     curve with, and the receipts name it as that.
//
// Two structural facts the roster actually contains, stated rather than smoothed:
//   • 8 of 20 markets have collateralFactor == 0. That is not a risk parameter
//     worth rendering as "0%" — it means the market is DISABLED as collateral.
//     A 0% rung would assert a parameter these markets don't have (the same
//     reason Fluid's unconfigured vaults get no ladder).
//   • 3 markets are priced by a hardcoded constant with no feed behind them
//     (priceFeed == address(0)). cSAI's constant is $14.4263 on a token that
//     targets $1. The view renders the protocol's own number — it is the
//     number the Comptroller itself would use — but flags that nothing updates
//     it, and reports the supplied total both with and without those markets so
//     the headline never leans silently on a frozen constant.
//
// The reads go through rails-server's head routes and, when the latest read
// fails, its stored snapshot of them (lib/sources/api/head-snapshot.ts,
// surface `compound-v2:ethereum:markets`).
//
// SERVER-ONLY — imported from /api/chain/* route handlers and the SSR page only.

import { getAddress, parseAbi, type PublicClient } from "viem";
import { withHeadSnapshot } from "@/lib/sources/api/head-snapshot";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type { StoredHeadRead } from "@/lib/shared/server-head-read";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta, scaleRaw, assertDecimalsRead } from "./erc20-meta";
import {
  COMPOUND_V2_ADDRESSES,
  CTOKEN_DECIMALS,
  handResolvedUnderlying,
  isCEth,
} from "@/lib/compound-v2/asset-catalog";
import { jumpRateModel, whitePaperModel, type ComptrollerRateModel } from "@/lib/comptroller/rate-model";
import { COMPOUND_V2_BLOCKS_PER_YEAR } from "@/lib/compound-v2/rate-year";
import { compoundV2Apy } from "@/lib/comptroller/apy";

const ZERO = BigInt(0);

const COMPTROLLER_ABI = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function oracle() view returns (address)",
  "function markets(address cToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isComped)",
  "function borrowCaps(address cToken) view returns (uint256)",
  "function mintGuardianPaused(address cToken) view returns (bool)",
  "function borrowGuardianPaused(address cToken) view returns (bool)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
]);

const CTOKEN_ABI = parseAbi([
  "function underlying() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrows() view returns (uint256)",
  "function totalReserves() view returns (uint256)",
  "function getCash() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function borrowRatePerBlock() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function reserveFactorMantissa() view returns (uint256)",
  "function interestRateModel() view returns (address)",
]);

/** Each market names its own rate model, and the roster runs several. Two
 *  things are read from it, and neither can be assumed across the roster:
 *   • `blocksPerYear()` — the model's own annualization constant (see header).
 *   • `kink()` — the utilisation the model is tuned around, where the rate
 *     curve turns steep. It is the one protocol-native reference line that sits
 *     on the SAME axis as utilisation, which is why the view can draw it
 *     against the fill. The five oldest markets run the original
 *     WhitePaperInterestRateModel, which HAS no kink — a straight line with no
 *     turn. Those markets get no tick rather than a made-up one. */
const IRM_ABI = parseAbi([
  "function kink() view returns (uint256)",
  "function blocksPerYear() view returns (uint256)",
  // The jump-rate model's terms, per block (lib/comptroller/rate-model.ts).
  "function baseRatePerBlock() view returns (uint256)",
  "function multiplierPerBlock() view returns (uint256)",
  "function jumpMultiplierPerBlock() view returns (uint256)",
  // The white-paper model's terms, a year; the jump-rate getters revert there.
  "function baseRate() view returns (uint256)",
  "function multiplier() view returns (uint256)",
]);
const IRM_CALLS = [
  "kink",
  "blocksPerYear",
  "baseRatePerBlock",
  "multiplierPerBlock",
  "jumpMultiplierPerBlock",
  "baseRate",
  "multiplier",
] as const;

const ORACLE_ABI = parseAbi([
  "function getUnderlyingPrice(address cToken) view returns (uint256)",
  "function getConfig(address cToken) view returns ((uint8 underlyingAssetDecimals, address priceFeed, uint256 fixedPrice))",
]);

export interface CompoundV2MarketRow {
  /** The cToken address — THE key. Never key a market on its symbol: 20
   *  markets carry 18 distinct symbols (see the catalog). */
  cToken: string;
  /** The cToken's own symbol. Display only, and deliberately not unique:
   *  two markets say "cDAI" and two say "cWBTC". */
  cTokenSymbol: string;
  /** The underlying token address; null for the native-ETH market, whose
   *  underlying() reverts because there is no token contract behind it. */
  underlying: string | null;
  /** The underlying's symbol. Hand-resolved for ETH (no contract), and for SAI
   *  and MKR (bytes32 symbols the shared resolver can't decode). */
  underlyingSymbol: string;
  underlyingDecimals: number;
  /** Set when this row's identity is the catalog's rather than the token's own
   *  answer — the reason, so a receipt can say why we named it. */
  identityNote: string | null;

  /** Supplied, borrowed and idle, in the market's OWN underlying token. */
  totalSupplyUnderlying: number;
  totalBorrowsUnderlying: number;
  cashUnderlying: number;
  totalReservesUnderlying: number;

  /** The protocol's own oracle price for one whole underlying token, in USD.
   *  Null when the oracle answers 0. */
  priceUsd: number | null;
  /** False when the oracle prices this market from a hardcoded constant with no
   *  feed behind it — the number is real and is the one the Comptroller uses,
   *  but nothing updates it. */
  priceHasFeed: boolean;
  /** The Chainlink-style feed backing the price, when there is one. */
  priceFeed: string | null;

  totalSupplyUsd: number | null;
  totalBorrowsUsd: number | null;

  /** Borrowed ÷ supplied, in the market's own token — the share of this
   *  market's money that is actually doing the job the protocol exists for.
   *  Null without supply. */
  utilisation: number | null;

  /** The Comptroller's collateral factor as a fraction (0.85 = 85%), or null
   *  when it is ZERO — which does not mean "0% borrowing power", it means the
   *  market is DISABLED as collateral. Null so no surface can render a rung the
   *  market does not have. */
  collateralFactor: number | null;
  /** True when collateralFactor is exactly 0: nothing supplied here backs any
   *  borrowing at all. */
  collateralDisabled: boolean;
  isListed: boolean;

  /** APY in percent (5.2 = 5.2%): the per-BLOCK rate by the docs' formula
   *  (lib/comptroller/apy.ts). Null when the rate call fails. */
  supplyApr: number | null;
  borrowApr: number | null;
  /** The per-block rates as read (1e18 mantissas), for the receipts. */
  supplyRatePerBlockRaw: string | null;
  borrowRatePerBlockRaw: string | null;
  reserveFactor: number | null;

  /** This market's interest rate model, and the two things read from it. */
  interestRateModel: string | null;
  /** The model's `blocksPerYear()`, the constant it sets its per-block curve
   *  with: 2,628,000 on cETH's model, 2,102,400 on the rest. */
  blocksPerYear: number | null;
  /** The utilisation the rate curve turns at, as a fraction (0.8 = 80%). Null
   *  on the five oldest markets, whose WhitePaper model has no kink at all. */
  kink: number | null;
  /** The model's terms as annual fractions on 2,628,000 blocks; null where the model answers neither shape. */
  rateModel: ComptrollerRateModel | null;

  /** The Comptroller's borrow cap in the underlying; null at 0 (uncapped). Compound V2 has no supply cap. */
  borrowCap: number | null;
  /** The cap is one base unit of the underlying: closed to new borrowing. */
  borrowCapOneUnit: boolean;
  /** The pause guardian has paused supplying (minting) or borrowing in this market. */
  mintPaused: boolean;
  borrowPaused: boolean;
}

export interface CompoundV2MarketsResponse {
  blockNumber: number;
  /** rails-server's read of `blockNumber`, when it answered every read live. */
  head?: PositionHeadStamp;
  /** rails-server's stored snapshot the figures were computed over, when the latest read failed. */
  stored?: StoredHeadRead;
  /** The oracle the Comptroller itself reads — read from it, not hardcoded. */
  oracle: string | null;
  markets: CompoundV2MarketRow[];
  summary: {
    total: number;
    /** Markets with collateralFactor == 0 — disabled as collateral. */
    collateralDisabled: number;
    /** Markets priced by a constant with no feed. */
    fixedPrice: number;
    /** Distinct cToken symbols across the roster — below `total`, which is the
     *  whole reason nothing keys on symbol. */
    distinctSymbols: number;
    totalSuppliedUsd: number | null;
    totalBorrowedUsd: number | null;
    /** Borrowed ÷ supplied across every priced market. The headline claim. */
    utilisation: number | null;
    /** The same totals with the no-feed markets excluded, so the headline can
     *  be read without leaning on a frozen constant. */
    totalSuppliedUsdWithFeed: number | null;
    totalBorrowedUsdWithFeed: number | null;
    /** The Comptroller's close factor and liquidation incentive (1.08 = seize 108%). */
    closeFactor: number | null;
    liquidationIncentive: number | null;
  };
  /** True when the chain read failed and we returned an empty roster. */
  chainStale: boolean;
}

function empty(): CompoundV2MarketsResponse {
  return {
    blockNumber: 0,
    oracle: null,
    markets: [],
    summary: {
      total: 0,
      collateralDisabled: 0,
      fixedPrice: 0,
      distinctSymbols: 0,
      totalSuppliedUsd: null,
      totalBorrowedUsd: null,
      utilisation: null,
      totalSuppliedUsdWithFeed: null,
      totalBorrowedUsdWithFeed: null,
      closeFactor: null,
      liquidationIncentive: null,
    },
    chainStale: true,
  };
}

const isZeroAddr = (a: string | undefined | null) => !a || BigInt(a) === ZERO;

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

/** The head-snapshot surface this loader's reads are stored under. */
const MARKETS_SURFACE = "compound-v2:ethereum:markets";

export async function loadCompoundV2Markets(): Promise<CompoundV2MarketsResponse> {
  try {
    const { value, stored } = await withHeadSnapshot(
      { surface: MARKETS_SURFACE, chainId: MAINNET_CHAIN_ID },
      readMarkets,
      () => true,
    );
    if (stored) return { ...value, stored };
    const head = serverHeadStampAt(MAINNET_CHAIN_ID, value.blockNumber);
    return head ? { ...value, head } : value;
  } catch (error) {
    console.error("Compound V2 markets chain read failed:", error);
    return empty();
  }
}

/** Every market the Comptroller lists, at one block; throws where a read fails. */
async function readMarkets(client: PublicClient): Promise<CompoundV2MarketsResponse> {
  // The block is taken first and every read below is pinned to it, so the
  // block the response names is the block every figure was read at.
  const blockNumber = Number(await client.getBlockNumber());
  const atBlock = { blockNumber: BigInt(blockNumber) };

  // The Comptroller states its own roster and its own oracle. Neither is
  // hardcoded: a view that hardcoded the market list would be asserting a
  // roster rather than reading one.
  const [cTokens, oracle, closeFactorRaw, liqIncentiveRaw] = await Promise.all([
    client.readContract({
      address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
      abi: COMPTROLLER_ABI,
      functionName: "getAllMarkets",
      ...atBlock,
    }),
    client.readContract({
      address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
      abi: COMPTROLLER_ABI,
      functionName: "oracle",
      ...atBlock,
    }),
    client.readContract({
      address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
      abi: COMPTROLLER_ABI,
      functionName: "closeFactorMantissa",
      ...atBlock,
    }),
    client.readContract({
      address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
      abi: COMPTROLLER_ABI,
      functionName: "liquidationIncentiveMantissa",
      ...atBlock,
    }),
  ]);

  const PER_MARKET = 14;
  const results = (await client.multicall({
    allowFailure: true,
    ...atBlock,
    contracts: cTokens.flatMap(
      (c) =>
        [
          { address: c, abi: CTOKEN_ABI, functionName: "underlying" },
          { address: c, abi: CTOKEN_ABI, functionName: "totalSupply" },
          { address: c, abi: CTOKEN_ABI, functionName: "totalBorrows" },
          { address: c, abi: CTOKEN_ABI, functionName: "exchangeRateStored" },
          { address: c, abi: CTOKEN_ABI, functionName: "getCash" },
          { address: c, abi: CTOKEN_ABI, functionName: "totalReserves" },
          { address: c, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" },
          { address: c, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" },
          { address: c, abi: CTOKEN_ABI, functionName: "reserveFactorMantissa" },
          { address: COMPOUND_V2_ADDRESSES.COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "markets", args: [c] },
          { address: c, abi: CTOKEN_ABI, functionName: "interestRateModel" },
          { address: COMPOUND_V2_ADDRESSES.COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "borrowCaps", args: [c] },
          {
            address: COMPOUND_V2_ADDRESSES.COMPTROLLER,
            abi: COMPTROLLER_ABI,
            functionName: "mintGuardianPaused",
            args: [c],
          },
          {
            address: COMPOUND_V2_ADDRESSES.COMPTROLLER,
            abi: COMPTROLLER_ABI,
            functionName: "borrowGuardianPaused",
            args: [c],
          },
        ] as const,
    ),
  })) as Res[];

  // Each market's own rate model: its annualization constant and its kink.
  // Both are per-model, and the roster runs several models — see IRM_ABI.
  const irmOf = cTokens.map((_, i) => ok<string>(results[i * PER_MARKET + 10]));
  const irmRes = (await client.multicall({
    allowFailure: true,
    ...atBlock,
    contracts: irmOf.flatMap((irm) => {
      const addr = (irm && !isZeroAddr(irm) ? irm : COMPOUND_V2_ADDRESSES.COMPTROLLER) as `0x${string}`;
      return IRM_CALLS.map((functionName) => ({ address: addr, abi: IRM_ABI, functionName }));
    }),
  })) as Res[];

  // Name the cTokens and their underlyings in one resolver call (the api's
  // token_meta first, the chain for what it lacks). cETH's underlying is
  // skipped (no contract to ask), but the bytes32-symbol tokens are NOT: only
  // their symbol() is undecodable — decimals() answers fine, and the resolver
  // is already making that call. Overriding just the symbol below keeps SAI's
  // and MKR's scale the token's answer rather than a catalog assumption.
  const wanted: string[] = [];
  cTokens.forEach((c, i) => {
    const und = ok<string>(results[i * PER_MARKET]);
    if (und && !isZeroAddr(und)) wanted.push(und);
  });
  const meta = await resolveErc20Meta([...cTokens, ...wanted]);
  // Every market figure scales by its underlying's decimals: without them the
  // read fails whole rather than state amounts scaled by the 18 stand-in.
  assertDecimalsRead(meta, wanted);

  // The oracle lane: the price the Comptroller would use, and whether a live
  // feed stands behind it at all.
  const oracleRes = (await client.multicall({
    allowFailure: true,
    ...atBlock,
    contracts: cTokens.flatMap(
      (c) =>
        [
          { address: oracle, abi: ORACLE_ABI, functionName: "getUnderlyingPrice", args: [c] },
          { address: oracle, abi: ORACLE_ABI, functionName: "getConfig", args: [c] },
        ] as const,
    ),
  })) as Res[];

  const markets: CompoundV2MarketRow[] = cTokens.map((c, i) => {
    const base = i * PER_MARKET;
    const cToken = getAddress(c).toLowerCase();
    const und = ok<string>(results[base]);
    const underlying = und && !isZeroAddr(und) ? getAddress(und).toLowerCase() : null;
    const cMeta = meta.get(cToken);

    // Identity, in the order of who can actually answer: the native-ETH
    // market has no contract to ask; SAI and MKR answer in bytes32 the shared
    // resolver can't decode; everything else names itself.
    let underlyingSymbol: string;
    let underlyingDecimals: number;
    let identityNote: string | null = null;
    const hand = underlying ? handResolvedUnderlying(underlying) : null;
    const m = underlying ? meta.get(underlying) : undefined;
    if (isCEth(cToken)) {
      underlyingSymbol = "ETH";
      underlyingDecimals = 18;
      identityNote = "native ETH — this market has no underlying() to read, so its identity is stated, not resolved";
    } else if (hand) {
      // Symbol from the catalog (bytes32, undecodable); decimals still the
      // token's own answer.
      underlyingSymbol = hand.symbol;
      underlyingDecimals = m?.decimals ?? 18;
      identityNote = hand.note;
    } else {
      underlyingSymbol = m?.named ? m.symbol : (m?.symbol ?? "—");
      underlyingDecimals = m?.decimals ?? 18;
    }

    const exchangeRate = ok<bigint>(results[base + 3]);
    const totalSupplyCTokens = ok<bigint>(results[base + 1]);
    const totalBorrowsRaw = ok<bigint>(results[base + 2]);
    const cashRaw = ok<bigint>(results[base + 4]);
    const reservesRaw = ok<bigint>(results[base + 5]);

    // Supplied underlying = cTokens × exchangeRateStored / 1e18, where the
    // rate is scaled 1e(18 + ud − 8): the cToken's 8dp and the rate's excess
    // decimals cancel, leaving underlying at its own scale.
    const totalSupplyUnderlying =
      totalSupplyCTokens != null && exchangeRate != null
        ? scaleRaw((totalSupplyCTokens * exchangeRate) / BigInt("1000000000000000000"), underlyingDecimals)
        : 0;
    const totalBorrowsUnderlying = totalBorrowsRaw != null ? scaleRaw(totalBorrowsRaw, underlyingDecimals) : 0;
    const cashUnderlying = cashRaw != null ? scaleRaw(cashRaw, underlyingDecimals) : 0;
    const totalReservesUnderlying = reservesRaw != null ? scaleRaw(reservesRaw, underlyingDecimals) : 0;

    const priceRaw = ok<bigint>(oracleRes[i * 2]);
    const cfg = ok<{ underlyingAssetDecimals: number; priceFeed: string; fixedPrice: bigint }>(oracleRes[i * 2 + 1]);
    // Oracle scale is the protocol's own: 1e(36 − underlyingDecimals).
    const priceUsd = priceRaw != null && priceRaw > ZERO ? Number(priceRaw) / 10 ** (36 - underlyingDecimals) : null;
    // No feed ⇒ the price is a constant governance stored and nothing keeps
    // current. Read from the oracle's own config, not inferred from the value.
    const priceHasFeed = cfg != null ? !isZeroAddr(cfg.priceFeed) : true;
    const priceFeed = cfg != null && !isZeroAddr(cfg.priceFeed) ? getAddress(cfg.priceFeed).toLowerCase() : null;

    const mkt = ok<readonly [boolean, bigint, boolean]>(results[base + 9]);
    const cfMantissa = mkt ? mkt[1] : null;
    // collateralFactor == 0 is not a 0% rung — it is "disabled as collateral".
    // Null the value so no surface can render the parameter as if it existed.
    const collateralDisabled = cfMantissa != null && cfMantissa === ZERO;
    const collateralFactor = cfMantissa != null && cfMantissa > ZERO ? Number(cfMantissa) / 1e18 : null;

    // Annualise on the docs' 2,628,000 blocks; the model's blocksPerYear()
    // is kept for the receipts and the white-paper terms.
    const irm = (k: (typeof IRM_CALLS)[number]) => ok<bigint>(irmRes[i * IRM_CALLS.length + IRM_CALLS.indexOf(k)]);
    const kinkRaw = irm("kink");
    const bpyRaw = irm("blocksPerYear");
    const blocksPerYear = bpyRaw != null && bpyRaw > ZERO ? Number(bpyRaw) : null;
    const apr = (r: Res | undefined): number | null => {
      const v = ok<bigint>(r);
      return v != null ? compoundV2Apy(v) * 100 : null;
    };
    const rawOf = (r: Res | undefined): string | null => ok<bigint>(r)?.toString() ?? null;

    return {
      cToken,
      cTokenSymbol: cMeta?.named ? cMeta.symbol : "—",
      underlying,
      underlyingSymbol,
      underlyingDecimals,
      identityNote,

      totalSupplyUnderlying,
      totalBorrowsUnderlying,
      cashUnderlying,
      totalReservesUnderlying,

      priceUsd,
      priceHasFeed,
      priceFeed,
      totalSupplyUsd: priceUsd != null ? totalSupplyUnderlying * priceUsd : null,
      totalBorrowsUsd: priceUsd != null ? totalBorrowsUnderlying * priceUsd : null,

      utilisation: totalSupplyUnderlying > 0 ? totalBorrowsUnderlying / totalSupplyUnderlying : null,

      collateralFactor,
      collateralDisabled,
      isListed: mkt ? mkt[0] : false,

      supplyApr: apr(results[base + 7]),
      borrowApr: apr(results[base + 6]),
      supplyRatePerBlockRaw: rawOf(results[base + 7]),
      borrowRatePerBlockRaw: rawOf(results[base + 6]),
      reserveFactor: (() => {
        const v = ok<bigint>(results[base + 8]);
        return v != null ? Number(v) / 1e18 : null;
      })(),

      interestRateModel: irmOf[i] && !isZeroAddr(irmOf[i]) ? getAddress(irmOf[i]!).toLowerCase() : null,
      blocksPerYear,
      kink: kinkRaw != null && kinkRaw > ZERO ? Number(kinkRaw) / 1e18 : null,
      rateModel:
        jumpRateModel(
          {
            base: irm("baseRatePerBlock"),
            multiplier: irm("multiplierPerBlock"),
            jump: irm("jumpMultiplierPerBlock"),
            kink: kinkRaw,
          },
          COMPOUND_V2_BLOCKS_PER_YEAR,
        ) ??
        whitePaperModel(
          { baseRate: irm("baseRate"), multiplier: irm("multiplier") },
          { periods: COMPOUND_V2_BLOCKS_PER_YEAR, modelPeriods: blocksPerYear },
        ),

      borrowCap: (() => {
        const v = ok<bigint>(results[base + 11]);
        return v != null && v > ZERO ? scaleRaw(v, underlyingDecimals) : null;
      })(),
      borrowCapOneUnit: ok<bigint>(results[base + 11]) === BigInt(1),
      mintPaused: ok<boolean>(results[base + 12]) === true,
      borrowPaused: ok<boolean>(results[base + 13]) === true,
    };
  });

  // Largest first: the view's claim is about where the money is, and the
  // roster's own order (listing sequence) buries the answer.
  markets.sort((a, b) => (b.totalSupplyUsd ?? 0) - (a.totalSupplyUsd ?? 0));

  const sum = (rows: CompoundV2MarketRow[], k: "totalSupplyUsd" | "totalBorrowsUsd") =>
    rows.reduce((t, r) => t + (r[k] ?? 0), 0);
  const priced = markets.filter((m) => m.totalSupplyUsd != null);
  const withFeed = priced.filter((m) => m.priceHasFeed);
  const supplied = priced.length > 0 ? sum(priced, "totalSupplyUsd") : null;
  const borrowed = priced.length > 0 ? sum(priced, "totalBorrowsUsd") : null;

  return {
    blockNumber,
    oracle: getAddress(oracle).toLowerCase(),
    markets,
    summary: {
      total: markets.length,
      collateralDisabled: markets.filter((m) => m.collateralDisabled).length,
      fixedPrice: markets.filter((m) => !m.priceHasFeed).length,
      distinctSymbols: new Set(markets.map((m) => m.cTokenSymbol)).size,
      totalSuppliedUsd: supplied,
      totalBorrowedUsd: borrowed,
      utilisation: supplied != null && borrowed != null && supplied > 0 ? borrowed / supplied : null,
      totalSuppliedUsdWithFeed: withFeed.length > 0 ? sum(withFeed, "totalSupplyUsd") : null,
      totalBorrowedUsdWithFeed: withFeed.length > 0 ? sum(withFeed, "totalBorrowsUsd") : null,
      closeFactor: closeFactorRaw > ZERO ? Number(closeFactorRaw) / 1e18 : null,
      liquidationIncentive: liqIncentiveRaw > ZERO ? Number(liqIncentiveRaw) / 1e18 : null,
    },
    chainStale: false,
  };
}
