// Morpho protocol view — every Blue market and its one rung, read at one head block.
// ----------------------------------------------------------------------------
// What the view claims (Morpho's own shape, not a template): a Blue market's ENTIRE risk
// surface is ONE number. The lltv is both the borrow limit and the liquidation line — there
// is no gap between them and no second tick to draw, which is exactly what the position
// lane's borrow-capacity strip already says one position at a time. The liquidation
// incentive is not configured either: it is that same number pushed through
// min(1.15, 1/(1 - 0.3(1 - lltv))). And the number is chosen once at creation and never
// changes, because the market id IS the hash of the params.
//
// Across all 1,648 markets ever created on Ethereum there are only NINE distinct lltvs,
// every one of them governance-enabled — and across Base's 4,306, also nine. That is the
// whole parameter space of the protocol, and it does not grow with the roster; the contrast
// with Fluid's three independently-set, mutable rungs per vault is the point.
//
// THE ROSTER IS COMPLETE, not a floor. createMarket() is the singleton's only market-making
// entry point and always emits CreateMarket, so each chain's generated market-catalog.ts
// holds every market that exists as of its census block. Blue exposes no
// enumeration of its own — idToMarketParams(id) answers only for an id you already have —
// which is why the roster is shipped as data rather than read here. The params are safe to
// bake because they are immutable AND self-verifying (id == keccak(params)); everything
// mutable is read below, at the head, every time.
//
// No USD anywhere, by charter: every market measures in its own loan token, and sizes and
// utilisation need no oracle at all to state. The oracle prices collateral in LOAN terms,
// never dollars — so the roster never asks it. One market's page does (loadMorphoMarketFromChain
// below): its price in loan terms, and when its feeds last published it.
//
// SERVER-ONLY — imported from /api/chain/* route handlers and the SSR page only.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import type { ChainId } from "@/lib/shared/chains";
import { resolveErc20Meta, resolveDecimalsTrust, scaleRaw, type Erc20Meta } from "./erc20-meta";
import { WAD } from "@/lib/morpho/asset-catalog";
import type { MorphoMarketCatalogEntry } from "@/lib/morpho/market-catalog";
import type { MorphoOracleFeed } from "@/lib/api/fetch-morpho-position";
import { MORPHO_DEPLOYMENT, type MorphoDeployment } from "./morpho-deployments";
import { withIndexedRoster } from "./morpho-roster";
import { readOracle } from "./morpho-position";
const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const SECONDS_PER_YEAR = 31_536_000;

const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);
const BLUE_ABI = parseAbi([
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
]);
const IRM_ABI = parseAbi([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) view returns (uint256)",
]);

// WHY THIS LANE DOES NOT ACCRUE IN VIEW, where the position lane does.
// ----------------------------------------------------------------------------
// Blue only accrues when a market is TOUCHED, so market() totals are each market's last
// settled state. The position lane projects that forward — borrowRateView + the contract's
// 3-term Taylor — because a borrower's debt at this instant is exactly the question there,
// and a live position is touched often enough that the projection stays tight.
//
// A roster is a different question, and the projection breaks on it. The Taylor is an
// approximation whose error grows without bound as the untouched interval does, and the
// markets that go longest untouched are the ones pinned at 100% utilisation, where the
// adaptive curve has driven the rate to hundreds of percent. Applied to those, the projection
// stops being a rate and becomes a fiction: it read a dead PAXG/USDC market's 1.04B as 2.48B,
// a dead USR book's 214M as 25B, and inflated the whole USDC book from 2.55B to 4.86B — all
// of it interest on loans that will never be touched again, presented as money supplied.
//
// So these figures are the STORED state at the block below: what Blue's own storage says at
// the head, with no projection of ours on top. `lastUpdate` travels with every row so the page
// can say when each market last settled, which is a fact about Morpho worth stating rather
// than smoothing away.

export interface MorphoMarketRow {
  /** 0x-prefixed market id — keccak256(abi.encode(params)). */
  id: string;
  loanToken: string;
  collateralToken: string;
  oracle: string | null;
  irm: string | null;

  loanSymbol: string;
  loanDecimals: number;
  /** Null on an idle market: there is no collateral side to name. */
  collateralSymbol: string | null;
  collateralNamed: boolean;
  /** False when the loan token's own decimals() does not survive resolveDecimalsTrust — the
   *  amounts below cannot be scaled to a quantity, so the page must not state them. */
  amountsTrusted: boolean;

  /** The one rung, as a 0..1 fraction. Borrow limit AND liquidation line — Morpho has one
   *  number, not two. Zero on an idle market, where nobody can ever borrow. */
  lltv: number;
  /** The liquidation incentive the lltv implies: min(1.15, 1/(1 - 0.3(1 - lltv))). NOT a
   *  configured parameter — it is derived, which is the point. Null where lltv is 0. */
  liquidationIncentive: number | null;

  /** True when the market has no collateral token, oracle or IRM: nothing can be borrowed,
   *  and it exists so a vault can hold cash inside Blue rather than outside it. */
  isIdle: boolean;

  /** Loan-token units, as STORED at `lastUpdate` — never USD, and never projected forward
   *  (see the note above). Zero-and-meaningless when `amountsTrusted` is false. */
  totalSupply: number;
  totalBorrow: number;
  /** totalBorrow ÷ totalSupply. Unit-free — it needs no oracle AND it survives an untrusted
   *  decimals(), because the lie cancels in the ratio. Null with no supply. */
  utilization: number | null;

  /** Annual percent. Null when the market names no IRM (nothing to ask). */
  borrowApr: number | null;
  supplyApr: number | null;
  /** The protocol fee on interest, a 0..1 fraction. */
  fee: number;

  lastUpdate: number;
  createdBlock: number;
}

/** One loan token's markets — the axis Morpho is actually organised along, and the one a
 *  curator picks from: a PYUSD vault chooses among the PYUSD markets. */
export interface MorphoLoanGroup {
  loanToken: string;
  loanSymbol: string;
  loanDecimals: number;
  /** True when symbol() answered — a false here renders an identifier, not a symbol. */
  loanNamed: boolean;
  /** False when this token's decimals() cannot be trusted: the group's totals are then not a
   *  quantity of anything and the page states none. */
  amountsTrusted: boolean;
  markets: MorphoMarketRow[];
  totalSupply: number;
  totalBorrow: number;
  /** Markets in this group with supply > 0. */
  funded: number;
  /** The loan token's OWN total supply — how much of it exists at all.
   *
   *  Here because Blue's stored totals can exceed it, and on Base they do by a
   *  lot. Accrued interest is added to `totalSupplyAssets` without any token
   *  moving, so a market pinned at full utilisation with the adaptive curve
   *  driving its rate into the hundreds of percent compounds its own books
   *  upward indefinitely. The result is bookkeeping that has outrun the asset:
   *  one Base market's cbBTC book stands at 401,571 cbBTC against a token whose
   *  entire supply is under 45,000.
   *
   *  Stating this needs no judgment about how a market got there — it is one
   *  number from the market and one from the token, both read at the same
   *  block. Null when the token will not answer totalSupply(). */
  loanTokenSupply: number | null;
}

export interface MorphoMarketsChainResponse {
  blockNumber: number;
  /** The block lib/morpho/market-catalog.ts was censused at — the roster is complete as of
   *  this block, and markets created since are absent until the census is re-run. */
  censusBlock: number;
  groups: MorphoLoanGroup[];
  summary: {
    /** Every market Blue has ever created. Complete, not a floor. */
    total: number;
    funded: number;
    borrowed: number;
    /** Funded but with nothing borrowed. */
    idleCapital: number;
    neverFunded: number;
    /** Markets that exist only to hold cash inside Blue (no collateral, oracle or IRM). */
    idleMarkets: number;
    loanTokens: number;
    /** The distinct lltvs in use, descending — the protocol's whole parameter space. */
    lltvs: { lltv: number; markets: number; funded: number }[];
  };
  chainStale: boolean;
}

function empty(deployment: MorphoDeployment): MorphoMarketsChainResponse {
  return {
    blockNumber: 0,
    censusBlock: deployment.censusBlock,
    groups: [],
    summary: {
      total: 0,
      funded: 0,
      borrowed: 0,
      idleCapital: 0,
      neverFunded: 0,
      idleMarkets: 0,
      loanTokens: 0,
      lltvs: [],
    },
    chainStale: true,
  };
}

/** Multicall3 in explicit chunks: thousands of markets is far past what one call should
 *  carry, and viem's own byte-budget splitting would pick the boundaries for us. Chunking
 *  here keeps the round-trip count visible and predictable — 5 calls for Ethereum's roster,
 *  11 for Base's, and Base's whole sweep measured 0.8 s. */
async function chunkedMulticall<T>(
  chainId: ChainId,
  contracts: readonly unknown[],
  size = 400,
): Promise<{ status: string; result?: T }[]> {
  const client = chainClient(chainId);
  const chunks: unknown[][] = [];
  for (let i = 0; i < contracts.length; i += size) chunks.push(contracts.slice(i, i + size) as unknown[]);
  const out = await Promise.all(
    chunks.map(
      (c) =>
        client.multicall({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contracts: c as any,
          allowFailure: true,
          batchSize: 0, // one eth_call per chunk — we picked the boundaries above
        }) as Promise<{ status: string; result?: T }[]>,
    ),
  );
  return out.flat();
}

type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

/** The IRM's borrowRateView call for one market, asked exactly as _accrueInterest
 *  asks it: with the market struct as stored, before accrual. */
function rateCall(m: MorphoMarketCatalogEntry, s: MarketTuple) {
  return {
    address: m.irm as `0x${string}`,
    abi: IRM_ABI,
    functionName: "borrowRateView" as const,
    args: [
      {
        loanToken: m.loanToken as `0x${string}`,
        collateralToken: m.collateralToken as `0x${string}`,
        oracle: m.oracle as `0x${string}`,
        irm: m.irm as `0x${string}`,
        lltv: BigInt(m.lltv),
      },
      {
        totalSupplyAssets: s[0],
        totalSupplyShares: s[1],
        totalBorrowAssets: s[2],
        totalBorrowShares: s[3],
        lastUpdate: s[4],
        fee: s[5],
      },
    ],
  } as const;
}

/** One market's row from its roster entry, its stored market() tuple and its
 *  IRM's rate — the same row for the roster and for a single market's page. */
function marketRow(
  m: MorphoMarketCatalogEntry,
  state: MarketTuple,
  ratePerSec: bigint | undefined,
  meta: Map<string, Erc20Meta>,
  trust: Map<string, boolean>,
): MorphoMarketRow {
  const [totalSupplyAssets, , totalBorrowAssets, , lastUpdate, fee] = state;

  const loan = meta.get(m.loanToken);
  const coll = m.collateralToken === ZERO_ADDR ? undefined : meta.get(m.collateralToken);
  const loanDecimals = loan?.decimals ?? 18;
  const amountsTrusted = trust.get(m.loanToken) ?? true;

  // Stored state, not projected — see the note at the top of this file.
  const totalSupply = scaleRaw(totalSupplyAssets, loanDecimals);
  const totalBorrow = scaleRaw(totalBorrowAssets, loanDecimals);

  // A ratio of two raw amounts in the same token: the decimals cancel, so this is stated
  // even where the amounts above are not.
  const utilization = totalSupplyAssets > ZERO ? Number(totalBorrowAssets) / Number(totalSupplyAssets) : null;
  // A FRACTION (0.08 = 8%), the convention morpho-position.ts sets — the view multiplies.
  const borrowApr = ratePerSec != null ? (Number(ratePerSec) / 1e18) * SECONDS_PER_YEAR : null;
  const feeFraction = Number(fee) / 1e18;

  const lltv = Number(m.lltv) / WAD;
  const isIdle = m.collateralToken === ZERO_ADDR && m.oracle === ZERO_ADDR && m.irm === ZERO_ADDR;

  return {
    id: m.id,
    loanToken: m.loanToken,
    collateralToken: m.collateralToken,
    oracle: m.oracle === ZERO_ADDR ? null : m.oracle,
    irm: m.irm === ZERO_ADDR ? null : m.irm,

    loanSymbol: loan?.symbol ?? m.loanToken.slice(0, 6),
    loanDecimals,
    collateralSymbol: coll?.symbol ?? null,
    collateralNamed: Boolean(coll?.named),
    amountsTrusted,

    lltv,
    // Derived, not configured — the whole point. Undefined at lltv 0, where the formula
    // has no referent because nothing can be borrowed.
    liquidationIncentive: lltv > 0 ? Math.min(1.15, 1 / (1 - 0.3 * (1 - lltv))) : null,
    isIdle,

    totalSupply,
    totalBorrow,
    utilization,
    borrowApr,
    supplyApr: borrowApr != null && utilization != null ? borrowApr * utilization * (1 - feeFraction) : null,
    fee: feeFraction,

    lastUpdate: Number(lastUpdate),
    createdBlock: m.createdBlock,
  };
}

export async function loadMorphoMarketsFromChain(
  censused: MorphoDeployment = MORPHO_DEPLOYMENT,
): Promise<MorphoMarketsChainResponse> {
  // The census plus every market the index has seen created since it.
  const deployment = await withIndexedRoster(censused);
  const MORPHO_MARKETS = deployment.markets;
  const MORPHO = deployment.blue as `0x${string}`;
  try {
    const client = chainClient(deployment.chainId);
    const [blockNumber, states] = await Promise.all([
      client.getBlockNumber().then(Number),
      chunkedMulticall<MarketTuple>(
        deployment.chainId,
        MORPHO_MARKETS.map((m) => ({
          address: MORPHO,
          abi: BLUE_ABI,
          functionName: "market",
          args: [m.id as `0x${string}`],
        })),
      ),
    ]);

    // Rates: ask each market's OWN IRM, exactly as _accrueInterest does — with the market
    // struct as stored, before accrual. A market naming no IRM is not asked and states no
    // rate, rather than being given a zero it never reported.
    const rateTargets = MORPHO_MARKETS.map((m, i) => ({ m, i })).filter(
      ({ m, i }) => m.irm !== ZERO_ADDR && states[i]?.status === "success",
    );
    const rates = await chunkedMulticall<bigint>(
      deployment.chainId,
      rateTargets.map(({ m, i }) => rateCall(m, states[i].result as MarketTuple)),
    );
    const rateOf = new Map<number, bigint>();
    rateTargets.forEach(({ i }, k) => {
      const r = rates[k];
      if (r?.status === "success" && r.result != null) rateOf.set(i, r.result as bigint);
    });

    // Name every leg through the house resolver's cached multicall — ~1,900 distinct tokens
    // across the roster, which is precisely the long tail it exists for.
    const meta = await resolveErc20Meta(
      MORPHO_MARKETS.flatMap((m) => [m.loanToken, m.collateralToken]).filter((a) => a !== ZERO_ADDR),
      deployment.chainId,
    );
    // Only the LOAN token scales an amount here (collateral is never totalled), so only the
    // loan side needs its decimals() checked. wUSDL is the live liar: trusted, its 6 would
    // overstate its book by 1e12 and make it the largest on the protocol.
    const trust = await resolveDecimalsTrust([...new Set(MORPHO_MARKETS.map((m) => m.loanToken))], deployment.chainId);

    const rows: MorphoMarketRow[] = [];
    for (let i = 0; i < MORPHO_MARKETS.length; i++) {
      const m = MORPHO_MARKETS[i];
      const st = states[i];
      if (st?.status !== "success" || !st.result) continue;
      rows.push(marketRow(m, st.result as MarketTuple, rateOf.get(i), meta, trust));
    }

    // Group by loan token — Morpho's real structure, and a curator's own axis.
    const byLoan = new Map<string, MorphoMarketRow[]>();
    for (const r of rows) {
      const g = byLoan.get(r.loanToken);
      if (g) g.push(r);
      else byLoan.set(r.loanToken, [r]);
    }
    // Each loan token's own supply, for the comparison above. One call per
    // group (about 100 on Base), batched — cheap next to the roster sweep.
    const loanTokens = [...byLoan.keys()];
    const supplies = await chunkedMulticall<bigint>(
      deployment.chainId,
      loanTokens.map((a) => ({ address: a as `0x${string}`, abi: ERC20_ABI, functionName: "totalSupply" })),
    );
    const tokenSupply = new Map<string, bigint>();
    loanTokens.forEach((a, i) => {
      const r = supplies[i];
      if (r?.status === "success" && r.result != null) tokenSupply.set(a, r.result as bigint);
    });

    const groups: MorphoLoanGroup[] = [...byLoan.entries()].map(([loanToken, markets]) => {
      // Biggest book first within a group; a never-funded market has nothing to rank on, so
      // creation order breaks the tie rather than an arbitrary one.
      markets.sort((a, b) => b.totalSupply - a.totalSupply || a.createdBlock - b.createdBlock);
      const m0 = meta.get(loanToken);
      return {
        loanToken,
        loanSymbol: m0?.symbol ?? loanToken.slice(0, 6),
        loanDecimals: m0?.decimals ?? 18,
        loanNamed: Boolean(m0?.named),
        amountsTrusted: trust.get(loanToken) ?? true,
        markets,
        // A group total is a sum over ONE token, so it is a real quantity — this is the only
        // place summing is legitimate, and it is why the page groups before it totals.
        totalSupply: markets.reduce((s, m) => s + m.totalSupply, 0),
        totalBorrow: markets.reduce((s, m) => s + m.totalBorrow, 0),
        funded: markets.filter((m) => m.totalSupply > 0).length,
        loanTokenSupply: (() => {
          const raw = tokenSupply.get(loanToken);
          return raw == null ? null : scaleRaw(raw, m0?.decimals ?? 18);
        })(),
      };
    });
    // Groups are ordered by how many markets carry money, not by size: the totals are in
    // different tokens and are NOT comparable, so ranking them against each other would
    // assert a common scale that Morpho never states.
    groups.sort((a, b) => b.funded - a.funded || b.markets.length - a.markets.length);

    const lltvCounts = new Map<number, { markets: number; funded: number }>();
    for (const r of rows) {
      const c = lltvCounts.get(r.lltv) ?? { markets: 0, funded: 0 };
      c.markets++;
      if (r.totalSupply > 0) c.funded++;
      lltvCounts.set(r.lltv, c);
    }

    return {
      blockNumber,
      censusBlock: deployment.censusBlock,
      groups,
      summary: {
        total: rows.length,
        funded: rows.filter((r) => r.totalSupply > 0).length,
        borrowed: rows.filter((r) => r.totalBorrow > 0).length,
        idleCapital: rows.filter((r) => r.totalSupply > 0 && r.totalBorrow === 0).length,
        neverFunded: rows.filter((r) => r.totalSupply === 0).length,
        idleMarkets: rows.filter((r) => r.isIdle).length,
        loanTokens: groups.length,
        lltvs: [...lltvCounts.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([lltv, c]) => ({ lltv, markets: c.markets, funded: c.funded })),
      },
      chainStale: false,
    };
  } catch (error) {
    console.error("Morpho markets chain read failed:", error);
    return empty(deployment);
  }
}

// ── one market ───────────────────────────────────────────────────────────────
//
// The page for a single market (/<chain>/morpho/markets/<loan token>/<market id>) reads that
// market alone rather than the roster: the roster is still needed, but only to say whether the
// id exists (Blue cannot enumerate, so an id outside the census and its index tail is not one
// this page can vouch for), and that is a lookup, not a read. Everything below is pinned to ONE
// head block — market(id), the IRM's rate on it, and the oracle's price with its feeds' rounds,
// the last two exactly as the position page reads them (readOracle).

export interface MorphoMarketChainResponse {
  /** The market's immutable params, from the roster — present even when the read failed. */
  params: MorphoMarketCatalogEntry;
  blockNumber: number;
  /** The head block's timestamp — what the oracle price's age is measured against. */
  timestamp: number;
  /** Null when the chain read failed (`chainStale`). */
  market: MorphoMarketRow | null;
  /** True when the loan token's symbol() answered. */
  loanNamed: boolean;
  collateralDecimals: number;
  /** 1 whole collateral token in whole loan tokens, from the market's own oracle at
   *  `blockNumber`. Null on a market with no oracle, or one whose price() did not answer. */
  oraclePrice: number | null;
  /** The feeds the oracle names and their latest rounds at `blockNumber` — null when there is
   *  no age to state (readOracle's rule). */
  oracleFeeds: MorphoOracleFeed[] | null;
  /** The oldest feed's updatedAt; null exactly when `oracleFeeds` is. */
  oraclePublishedAt: number | null;
  chainStale: boolean;
}

/** One market, read at one head block — or null when the id is not on the roster
 *  (the census plus the index's tail). A failed read returns the params with
 *  `chainStale` set, so the page can still say which market it is. */
export async function loadMorphoMarketFromChain(
  marketId: string,
  censused: MorphoDeployment = MORPHO_DEPLOYMENT,
): Promise<MorphoMarketChainResponse | null> {
  const id = marketId.toLowerCase();
  const deployment = await withIndexedRoster(censused);
  const params = deployment.markets.find((m) => m.id.toLowerCase() === id);
  if (!params) return null;

  const stale: MorphoMarketChainResponse = {
    params,
    blockNumber: 0,
    timestamp: 0,
    market: null,
    loanNamed: false,
    collateralDecimals: 18,
    oraclePrice: null,
    oracleFeeds: null,
    oraclePublishedAt: null,
    chainStale: true,
  };

  try {
    const client = chainClient(deployment.chainId);
    const MORPHO = deployment.blue as `0x${string}`;
    const block = await client.getBlock();
    const hasOracle = params.oracle !== ZERO_ADDR && params.collateralToken !== ZERO_ADDR;

    const [state, oracle, meta, trust] = await Promise.all([
      client.readContract({
        address: MORPHO,
        abi: BLUE_ABI,
        functionName: "market",
        args: [params.id as `0x${string}`],
        blockNumber: block.number,
      }),
      // A price() that reverts leaves the market readable and the price unstated — unlike the
      // position page, where every figure rests on it, here only one line does.
      hasOracle
        ? readOracle(client, params.oracle as `0x${string}`, block.number).catch(() => null)
        : Promise.resolve(null),
      resolveErc20Meta(
        [params.loanToken, params.collateralToken].filter((a) => a !== ZERO_ADDR),
        deployment.chainId,
      ),
      resolveDecimalsTrust([params.loanToken], deployment.chainId),
    ]);

    const ratePerSec =
      params.irm === ZERO_ADDR
        ? undefined
        : await client
            .readContract({ ...rateCall(params, state as MarketTuple), blockNumber: block.number })
            .catch(() => undefined);

    const market = marketRow(params, state as MarketTuple, ratePerSec, meta, trust);
    const loanDecimals = market.loanDecimals;
    const collateralDecimals = meta.get(params.collateralToken)?.decimals ?? 18;
    const price = oracle?.price ?? ZERO;
    const feeds = oracle?.feeds ?? null;

    return {
      params,
      blockNumber: Number(block.number),
      timestamp: Number(block.timestamp),
      market,
      loanNamed: Boolean(meta.get(params.loanToken)?.named),
      collateralDecimals,
      // Scaled 1e(36 + loan decimals − collateral decimals) per whole collateral token, as the
      // position loader scales it.
      oraclePrice: price > ZERO ? Number(price) / 10 ** (36 + loanDecimals - collateralDecimals) : null,
      oracleFeeds: feeds,
      oraclePublishedAt: feeds ? Math.min(...feeds.map((f) => f.updatedAt)) : null,
      chainStale: false,
    };
  } catch (error) {
    console.error("Morpho market chain read failed:", error);
    return stale;
  }
}
