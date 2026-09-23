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
//     per-second convention. Annualized on EACH MARKET'S OWN interest rate
//     model's `blocksPerYear()`, read from that model, because the roster does
//     not agree on one: cETH's model says 2,628,000 (12s blocks) while every
//     other market's still says 2,102,400 (the pre-Merge 15s assumption). One
//     hardcoded constant would misstate the protocol's largest market — $43M of
//     ETH — by 25%. The constant is the model's own, so the annualization is
//     the protocol's arithmetic rather than a wall-clock estimate of ours.
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
// SERVER-ONLY — imported from /api/chain/* route handlers and the SSR page only.

import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import {
  COMPOUND_V2_ADDRESSES,
  CTOKEN_DECIMALS,
  handResolvedUnderlying,
  isCEth,
} from "@/lib/compound-v2/asset-catalog";

const ZERO = BigInt(0);

const COMPTROLLER_ABI = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function oracle() view returns (address)",
  "function markets(address cToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isComped)",
]);

const CTOKEN_ABI = parseAbi([
  "function symbol() view returns (string)",
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
const IRM_ABI = parseAbi(["function kink() view returns (uint256)", "function blocksPerYear() view returns (uint256)"]);

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

  /** Annual percent (5.2 = 5.2%), from the protocol's own per-BLOCK rates on
   *  THIS market's model's own blocks-per-year constant. Null when the rate
   *  call fails. */
  supplyApr: number | null;
  borrowApr: number | null;
  reserveFactor: number | null;

  /** This market's interest rate model, and the two things read from it. */
  interestRateModel: string | null;
  /** The blocks/year the model annualizes with — 2,628,000 on cETH's model,
   *  2,102,400 on the rest. Not one constant across the roster. */
  blocksPerYear: number | null;
  /** The utilisation the rate curve turns at, as a fraction (0.8 = 80%). Null
   *  on the five oldest markets, whose WhitePaper model has no kink at all. */
  kink: number | null;
}

export interface CompoundV2MarketsResponse {
  blockNumber: number;
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
    },
    chainStale: true,
  };
}

const isZeroAddr = (a: string | undefined | null) => !a || BigInt(a) === ZERO;

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

export async function loadCompoundV2Markets(): Promise<CompoundV2MarketsResponse> {
  try {
    const client = alchemyClient();

    // The Comptroller states its own roster and its own oracle. Neither is
    // hardcoded: a view that hardcoded the market list would be asserting a
    // roster rather than reading one.
    const [blockNumber, cTokens, oracle] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.readContract({
        address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
        abi: COMPTROLLER_ABI,
        functionName: "getAllMarkets",
      }),
      client.readContract({
        address: COMPOUND_V2_ADDRESSES.COMPTROLLER as `0x${string}`,
        abi: COMPTROLLER_ABI,
        functionName: "oracle",
      }),
    ]);

    const PER_MARKET = 12;
    const results = (await client.multicall({
      allowFailure: true,
      contracts: cTokens.flatMap(
        (c) =>
          [
            { address: c, abi: CTOKEN_ABI, functionName: "symbol" },
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
          ] as const,
      ),
    })) as Res[];

    // Each market's own rate model: its annualization constant and its kink.
    // Both are per-model, and the roster runs several models — see IRM_ABI.
    const irmOf = cTokens.map((_, i) => ok<string>(results[i * PER_MARKET + 11]));
    const irmRes = (await client.multicall({
      allowFailure: true,
      contracts: irmOf.flatMap((irm) => {
        const addr = (irm && !isZeroAddr(irm) ? irm : COMPOUND_V2_ADDRESSES.COMPTROLLER) as `0x${string}`;
        return [
          { address: addr, abi: IRM_ABI, functionName: "kink" },
          { address: addr, abi: IRM_ABI, functionName: "blocksPerYear" },
        ] as const;
      }),
    })) as Res[];

    // Name the underlyings in one cached multicall. cETH is skipped (no
    // contract to ask), but the bytes32-symbol tokens are NOT: only their
    // symbol() is undecodable — decimals() answers fine, and the resolver is
    // already making that call. Overriding just the symbol below keeps SAI's
    // and MKR's scale a chain read rather than a catalog assumption.
    const wanted: string[] = [];
    cTokens.forEach((c, i) => {
      const und = ok<string>(results[i * PER_MARKET + 1]);
      if (und && !isZeroAddr(und)) wanted.push(und);
    });
    const meta = await resolveErc20Meta(wanted);

    // The oracle lane: the price the Comptroller would use, and whether a live
    // feed stands behind it at all.
    const oracleRes = (await client.multicall({
      allowFailure: true,
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
      const und = ok<string>(results[base + 1]);
      const underlying = und && !isZeroAddr(und) ? getAddress(und).toLowerCase() : null;

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

      const exchangeRate = ok<bigint>(results[base + 4]);
      const totalSupplyCTokens = ok<bigint>(results[base + 2]);
      const totalBorrowsRaw = ok<bigint>(results[base + 3]);
      const cashRaw = ok<bigint>(results[base + 5]);
      const reservesRaw = ok<bigint>(results[base + 6]);

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

      const mkt = ok<readonly [boolean, bigint, boolean]>(results[base + 10]);
      const cfMantissa = mkt ? mkt[1] : null;
      // collateralFactor == 0 is not a 0% rung — it is "disabled as collateral".
      // Null the value so no surface can render the parameter as if it existed.
      const collateralDisabled = cfMantissa != null && cfMantissa === ZERO;
      const collateralFactor = cfMantissa != null && cfMantissa > ZERO ? Number(cfMantissa) / 1e18 : null;

      // Annualize on THIS market's model's own constant. Without a readable
      // model there is no constant to annualize with and no honest number to
      // print — so the rate is null rather than guessed at 2,102,400, which is
      // exactly the assumption that would misstate cETH by 25%.
      const kinkRaw = ok<bigint>(irmRes[i * 2]);
      const bpyRaw = ok<bigint>(irmRes[i * 2 + 1]);
      const blocksPerYear = bpyRaw != null && bpyRaw > ZERO ? Number(bpyRaw) : null;
      const apr = (r: Res | undefined): number | null => {
        const v = ok<bigint>(r);
        return v != null && blocksPerYear != null ? (Number(v) / 1e18) * blocksPerYear * 100 : null;
      };

      return {
        cToken,
        cTokenSymbol: ok<string>(results[base]) ?? "—",
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

        supplyApr: apr(results[base + 8]),
        borrowApr: apr(results[base + 7]),
        reserveFactor: (() => {
          const v = ok<bigint>(results[base + 9]);
          return v != null ? Number(v) / 1e18 : null;
        })(),

        interestRateModel: irmOf[i] && !isZeroAddr(irmOf[i]) ? getAddress(irmOf[i]!).toLowerCase() : null,
        blocksPerYear,
        kink: kinkRaw != null && kinkRaw > ZERO ? Number(kinkRaw) / 1e18 : null,
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
      },
      chainStale: false,
    };
  } catch (error) {
    console.error("Compound V2 markets chain read failed:", error);
    return empty();
  }
}
