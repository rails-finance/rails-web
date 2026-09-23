// LlamaLend protocol view — every market the three factories list, read at
// one head block.
// ----------------------------------------------------------------------------
// The source of /llamalend/markets, the `views` cell of LlamaLend's row. It
// answers "what is the protocol"; the position explorer beside it answers
// "what happened to this position" — neither substitutes for the other.
//
// The roster is the factories' own: OneWayLendingFactory `market_count()`,
// crvUSD ControllerFactory `n_collaterals()`, and the V2 Factory's
// `market_count()` + `markets(i)` — never a hardcoded 59. New markets grow
// the roster the moment a factory lists them, and each row is tagged by its
// factory lineage (V1 lend / V1 mint / V2). ⚠️ V2's `controllers(i)`
// REVERTS by design; its `markets(i)` returns a struct whose address words
// this loader CLASSIFIES by probing (`amm()` answers on a controller, `A()`
// on an AMM) rather than assuming a field order.
//
// What a row claims: the market's own risk geometry — the amplification A
// (band density: how gradually soft-liquidation converts, immutable per
// market, spanning 10…500 on the live roster), the two governance discounts
// (loan_discount sizes borrowing power; liquidation_discount arms hard
// liquidation), the live borrow rate from the market's OWN monetary policy
// (`rate(controller)` per-second at 1e18), utilisation, total debt and open
// loans, and the AMM's own `price_oracle()`.
//
// ⚠️ UNITS. AMM prices are 1e18 in the BORROWED token. Most markets borrow
// crvUSD (~$1), where that reading is effectively USD — but a handful of
// oneway markets borrow WETH / tBTC / ynETH / CRV instead, and those rows
// present in their own borrowed token: `borrowedIsCrvusd` is checked against
// the factory's own answer per market, never assumed. USD summary figures sum
// ONLY the crvUSD-borrowed markets and say so.
//
// Utilisation is per-lineage, labeled: a lend market's borrowed liquidity is
// what lenders funded (debt ÷ (debt + the borrowed token still sitting on the
// controller)); a mint market's is its crvUSD debt ceiling (debt ÷ ceiling,
// the factory's own `debt_ceiling(controller)`). Different denominators —
// stated, not blended.
//
// SERVER-ONLY — imported from /api/chain/* route handlers and SSR pages only.

import { getAddress, parseAbi, keccak256, toHex } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import {
  LLAMALEND_ADDRESSES,
  SECONDS_PER_YEAR,
  type LlamalendFactoryKind,
  type LlamalendVersion,
} from "@/lib/llamalend/asset-catalog";
import { scale1e18 } from "@/lib/llamalend/band-math";

const ZERO = BigInt(0);

const ONEWAY_ABI = parseAbi([
  "function market_count() view returns (uint256)",
  "function controllers(uint256) view returns (address)",
  "function amms(uint256) view returns (address)",
  "function borrowed_tokens(uint256) view returns (address)",
  "function collateral_tokens(uint256) view returns (address)",
]);

const CRVUSD_FACTORY_ABI = parseAbi([
  "function n_collaterals() view returns (uint256)",
  "function controllers(uint256) view returns (address)",
  "function amms(uint256) view returns (address)",
  "function collaterals(uint256) view returns (address)",
  "function debt_ceiling(address) view returns (uint256)",
]);

const V2_FACTORY_ABI = parseAbi(["function market_count() view returns (uint256)"]);

// ERC-4626 accessor — answers on a Vault, reverts on a Controller. The V2
// struct carries BOTH (and the Vault also answers amm()), so the controller
// test needs all three probes.
const VAULT_PROBE_ABI = parseAbi(["function asset() view returns (address)"]);

const CONTROLLER_ABI = parseAbi([
  "function amm() view returns (address)",
  "function collateral_token() view returns (address)",
  "function borrowed_token() view returns (address)",
  "function total_debt() view returns (uint256)",
  "function n_loans() view returns (uint256)",
  "function loan_discount() view returns (uint256)",
  "function liquidation_discount() view returns (uint256)",
  "function monetary_policy() view returns (address)",
]);

const AMM_ABI = parseAbi([
  "function A() view returns (uint256)",
  "function get_base_price() view returns (uint256)",
  "function price_oracle() view returns (uint256)",
]);

const POLICY_ABI = parseAbi([
  "function rate(address) view returns (uint256)",
  "function rate() view returns (uint256)",
]);

const ERC20_BAL_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const ONEWAY = LLAMALEND_ADDRESSES.ONEWAY_FACTORY as `0x${string}`;
const CRVUSD_FACTORY = LLAMALEND_ADDRESSES.CRVUSD_FACTORY as `0x${string}`;
const V2_FACTORY = LLAMALEND_ADDRESSES.V2_FACTORY as `0x${string}`;

// ── Identity (discovery) ──────────────────────────────────────────────────────

export interface LlamalendMarketIdentity {
  /** THE market key — the Controller address (lowercase). */
  controller: string;
  amm: string;
  version: LlamalendVersion;
  factory: LlamalendFactoryKind;
  /** The market's index inside its own factory (display only — the
   *  controller address is the key). */
  index: number;
  collateralToken: string;
  collateralSymbol: string;
  /** Read from the token contract at discovery — NEVER defaulted: WBTC-family
   *  collaterals are 8 dp, yvUSDC-1 is 6 dp, and a defaulted 18 renders 1e12×
   *  off. */
  collateralDecimals: number;
  borrowedToken: string;
  borrowedSymbol: string;
  borrowedDecimals: number;
  /** The one case any surface presents this market's prices as USD. */
  borrowedIsCrvusd: boolean;
  /** Amplification — immutable per market; band density. */
  A: number;
}

export type LlamalendMarketMap = Map<string, LlamalendMarketIdentity>;

// Identity is immutable per market and the roster grows only when a factory
// lists a new one — cache the discovery sweep briefly so the position lanes
// (position + timeline + listing on one detail view) don't re-run it thrice.
let identityCache: { at: number; map: LlamalendMarketMap } | null = null;
const IDENTITY_TTL_MS = 5 * 60 * 1000;

/** Extract the address words of a raw `markets(i)` struct return. */
function addressWords(ret: `0x${string}` | undefined): string[] {
  if (!ret || ret.length < 66) return [];
  const out: string[] = [];
  const body = ret.slice(2);
  for (let w = 0; w * 64 + 64 <= body.length; w++) {
    const word = body.slice(w * 64, w * 64 + 64);
    if (/^0{24}[0-9a-f]{40}$/i.test(word) && !/^0+$/.test(word)) out.push(`0x${word.slice(24)}`.toLowerCase());
  }
  return out;
}

/**
 * Discover every market across the three factories — identity only (tokens,
 * decimals, A). Cached for a few minutes; the per-market STATE reads are
 * never cached.
 */
export async function discoverLlamalendMarkets(): Promise<LlamalendMarketMap> {
  if (identityCache && Date.now() - identityCache.at < IDENTITY_TTL_MS) return identityCache.map;

  const client = alchemyClient();

  const counts = (await client.multicall({
    allowFailure: true,
    contracts: [
      { address: ONEWAY, abi: ONEWAY_ABI, functionName: "market_count" },
      { address: CRVUSD_FACTORY, abi: CRVUSD_FACTORY_ABI, functionName: "n_collaterals" },
      { address: V2_FACTORY, abi: V2_FACTORY_ABI, functionName: "market_count" },
    ] as const,
  })) as Res[];
  const nOneway = Number(ok<bigint>(counts[0]) ?? ZERO);
  const nCrvusd = Number(ok<bigint>(counts[1]) ?? ZERO);
  const nV2 = Number(ok<bigint>(counts[2]) ?? ZERO);
  if (nOneway === 0 && nCrvusd === 0) throw new Error("LlamaLend factory discovery returned no markets");

  // V1: both factories enumerate cleanly.
  const PER_OW = 4;
  const PER_CU = 3;
  const v1 = (await client.multicall({
    allowFailure: true,
    contracts: [
      ...Array.from({ length: nOneway }, (_, i) => BigInt(i)).flatMap(
        (i) =>
          [
            { address: ONEWAY, abi: ONEWAY_ABI, functionName: "controllers", args: [i] },
            { address: ONEWAY, abi: ONEWAY_ABI, functionName: "amms", args: [i] },
            { address: ONEWAY, abi: ONEWAY_ABI, functionName: "borrowed_tokens", args: [i] },
            { address: ONEWAY, abi: ONEWAY_ABI, functionName: "collateral_tokens", args: [i] },
          ] as const,
      ),
      ...Array.from({ length: nCrvusd }, (_, i) => BigInt(i)).flatMap(
        (i) =>
          [
            { address: CRVUSD_FACTORY, abi: CRVUSD_FACTORY_ABI, functionName: "controllers", args: [i] },
            { address: CRVUSD_FACTORY, abi: CRVUSD_FACTORY_ABI, functionName: "amms", args: [i] },
            { address: CRVUSD_FACTORY, abi: CRVUSD_FACTORY_ABI, functionName: "collaterals", args: [i] },
          ] as const,
      ),
    ],
  })) as Res[];

  interface Pending {
    controller: string;
    amm: string;
    version: LlamalendVersion;
    factory: LlamalendFactoryKind;
    index: number;
    collateralToken: string;
    borrowedToken: string;
  }
  const pending: Pending[] = [];
  const lc = (a: string | null): string | null => (a ? getAddress(a).toLowerCase() : null);

  for (let i = 0; i < nOneway; i++) {
    const base = i * PER_OW;
    const controller = lc(ok<string>(v1[base]));
    const amm = lc(ok<string>(v1[base + 1]));
    const borrowed = lc(ok<string>(v1[base + 2]));
    const collateral = lc(ok<string>(v1[base + 3]));
    if (!controller || !amm || !borrowed || !collateral) continue;
    pending.push({
      controller,
      amm,
      version: "v1",
      factory: "oneway",
      index: i,
      collateralToken: collateral,
      borrowedToken: borrowed,
    });
  }
  const cuBase = nOneway * PER_OW;
  for (let i = 0; i < nCrvusd; i++) {
    const base = cuBase + i * PER_CU;
    const controller = lc(ok<string>(v1[base]));
    const amm = lc(ok<string>(v1[base + 1]));
    const collateral = lc(ok<string>(v1[base + 2]));
    if (!controller || !amm || !collateral) continue;
    // Mint markets borrow the crvUSD the controller mints — the factory has
    // no borrowed_tokens accessor because there is only one answer.
    pending.push({
      controller,
      amm,
      version: "v1",
      factory: "crvusd",
      index: i,
      collateralToken: collateral,
      borrowedToken: LLAMALEND_ADDRESSES.CRVUSD,
    });
  }

  // V2: markets(i) is a struct — classify its address words by probing
  // instead of assuming a layout (controllers(i) reverts on this factory).
  if (nV2 > 0) {
    const marketsSel = keccak256(toHex("markets(uint256)")).slice(0, 10);
    const rawStructs = await Promise.all(
      Array.from({ length: nV2 }, (_, i) =>
        client
          .call({
            to: V2_FACTORY,
            data: `${marketsSel}${BigInt(i).toString(16).padStart(64, "0")}` as `0x${string}`,
          })
          .then((r) => addressWords(r.data))
          .catch(() => [] as string[]),
      ),
    );
    const candidates = [...new Set(rawStructs.flat())];
    if (candidates.length > 0) {
      // A Controller answers amm() but neither A() (that's the AMM) nor
      // asset() (that's the ERC-4626 Vault, which ALSO answers amm() —
      // measured on the live structs, which is why the probe is three-way).
      const PROBE = 3;
      const probe = (await client.multicall({
        allowFailure: true,
        contracts: candidates.flatMap(
          (a) =>
            [
              { address: a as `0x${string}`, abi: CONTROLLER_ABI, functionName: "amm" },
              { address: a as `0x${string}`, abi: AMM_ABI, functionName: "A" },
              { address: a as `0x${string}`, abi: VAULT_PROBE_ABI, functionName: "asset" },
            ] as const,
        ),
      })) as Res[];
      const v2Controllers: string[] = [];
      candidates.forEach((a, i) => {
        const isController =
          ok<string>(probe[i * PROBE]) != null &&
          ok<bigint>(probe[i * PROBE + 1]) == null &&
          ok<string>(probe[i * PROBE + 2]) == null;
        if (isController) v2Controllers.push(a);
      });
      if (v2Controllers.length > 0) {
        const ident = (await client.multicall({
          allowFailure: true,
          contracts: v2Controllers.flatMap(
            (c) =>
              [
                { address: c as `0x${string}`, abi: CONTROLLER_ABI, functionName: "amm" },
                { address: c as `0x${string}`, abi: CONTROLLER_ABI, functionName: "collateral_token" },
                { address: c as `0x${string}`, abi: CONTROLLER_ABI, functionName: "borrowed_token" },
              ] as const,
          ),
        })) as Res[];
        v2Controllers.forEach((c, i) => {
          const amm = lc(ok<string>(ident[i * 3]));
          const collateral = lc(ok<string>(ident[i * 3 + 1]));
          const borrowed = lc(ok<string>(ident[i * 3 + 2]));
          if (!amm || !collateral || !borrowed) return;
          pending.push({
            controller: c,
            amm,
            version: "v2",
            factory: "v2",
            index: i,
            collateralToken: collateral,
            borrowedToken: borrowed,
          });
        });
      }
    }
  }

  // Token identity (symbol + decimals from each token's own contract — never
  // defaulted) and each AMM's immutable A, in two batched reads.
  const tokens = [...new Set(pending.flatMap((p) => [p.collateralToken, p.borrowedToken]))];
  const [meta, aReads] = await Promise.all([
    resolveErc20Meta(tokens),
    client.multicall({
      allowFailure: true,
      contracts: pending.map((p) => ({ address: p.amm as `0x${string}`, abi: AMM_ABI, functionName: "A" }) as const),
    }) as Promise<Res[]>,
  ]);

  const map: LlamalendMarketMap = new Map();
  pending.forEach((p, i) => {
    const cm = meta.get(p.collateralToken);
    const bm = meta.get(p.borrowedToken);
    const A = ok<bigint>(aReads[i]);
    if (!cm || !bm || A == null) return; // an unreadable market never renders mis-scaled
    map.set(p.controller, {
      controller: p.controller,
      amm: p.amm,
      version: p.version,
      factory: p.factory,
      index: p.index,
      collateralToken: p.collateralToken,
      collateralSymbol: cm.symbol,
      collateralDecimals: cm.decimals,
      borrowedToken: p.borrowedToken,
      borrowedSymbol: bm.symbol,
      borrowedDecimals: bm.decimals,
      borrowedIsCrvusd: p.borrowedToken === LLAMALEND_ADDRESSES.CRVUSD,
      A: Number(A),
    });
  });

  identityCache = { at: Date.now(), map };
  return map;
}

// ── The protocol view ─────────────────────────────────────────────────────────

export interface LlamalendMarketRow extends LlamalendMarketIdentity {
  /** Controller.total_debt() — borrowed-token units. */
  totalDebt: number;
  totalDebtRaw: string;
  nLoans: number;
  /** Governance discounts (fractions): loan_discount sizes borrowing power,
   *  liquidation_discount arms hard liquidation. */
  loanDiscount: number;
  liquidationDiscount: number;
  /** The market's own monetary policy contract. */
  monetaryPolicy: string;
  /** Borrow APR (%) — monetary_policy.rate(controller), per-second 1e18,
   *  annualized by simple multiplication. Null when the read failed. */
  borrowAprPct: number | null;
  /** AMM.price_oracle() — collateral priced in the BORROWED token (1e18). */
  priceOracle: number;
  priceOracleRaw: string;
  /** AMM.get_base_price() — the band grid's anchor (1e18). */
  basePriceRaw: string;
  /** Debt as a share of its own denominator (below). Null when unreadable. */
  utilisation: number | null;
  /** What the utilisation is OF — lend markets: lender-funded liquidity;
   *  mint markets: the factory's crvUSD debt ceiling. */
  utilisationBasis: "lender deposits" | "crvUSD debt ceiling" | null;
  /** Total debt in USD — ONLY when the borrowed token is crvUSD (~$1). */
  totalDebtUsd: number | null;
}

export interface LlamalendMarketsResponse {
  blockNumber: number;
  markets: LlamalendMarketRow[];
  summary: {
    total: number;
    v1Lend: number;
    v1Mint: number;
    v2: number;
    /** Markets with at least one open loan. */
    live: number;
    totalLoans: number;
    /** Σ total_debt over the crvUSD-borrowed markets ONLY (~$1 each). */
    totalDebtCrvusd: number;
    /** Markets whose borrowed token is NOT crvUSD — presented in their own
     *  token, never as USD. */
    nonCrvusdBorrow: number;
  };
  chainStale: boolean;
}

function empty(): LlamalendMarketsResponse {
  return {
    blockNumber: 0,
    markets: [],
    summary: {
      total: 0,
      v1Lend: 0,
      v1Mint: 0,
      v2: 0,
      live: 0,
      totalLoans: 0,
      totalDebtCrvusd: 0,
      nonCrvusdBorrow: 0,
    },
    chainStale: true,
  };
}

export async function loadLlamalendMarkets(): Promise<LlamalendMarketsResponse> {
  try {
    const client = alchemyClient();
    const [blockNumber, identity] = await Promise.all([
      client.getBlockNumber().then(Number),
      discoverLlamalendMarkets(),
    ]);
    const markets = [...identity.values()];

    // Per-market state, one multicall over the whole roster.
    const PER = 8;
    const state = (await client.multicall({
      allowFailure: true,
      contracts: markets.flatMap(
        (m) =>
          [
            { address: m.controller as `0x${string}`, abi: CONTROLLER_ABI, functionName: "total_debt" },
            { address: m.controller as `0x${string}`, abi: CONTROLLER_ABI, functionName: "n_loans" },
            { address: m.controller as `0x${string}`, abi: CONTROLLER_ABI, functionName: "loan_discount" },
            { address: m.controller as `0x${string}`, abi: CONTROLLER_ABI, functionName: "liquidation_discount" },
            { address: m.controller as `0x${string}`, abi: CONTROLLER_ABI, functionName: "monetary_policy" },
            { address: m.amm as `0x${string}`, abi: AMM_ABI, functionName: "price_oracle" },
            { address: m.amm as `0x${string}`, abi: AMM_ABI, functionName: "get_base_price" },
            // Lend/V2 markets: the borrowed token still sitting on the
            // controller is the unborrowed lender liquidity.
            {
              address: m.borrowedToken as `0x${string}`,
              abi: ERC20_BAL_ABI,
              functionName: "balanceOf",
              args: [m.controller as `0x${string}`],
            },
          ] as const,
      ),
    })) as Res[];

    // Second pass: each market's own monetary-policy rate + the mint markets'
    // debt ceilings (both need the first pass's answers).
    const policyOf = markets.map((_, i) => ok<string>(state[i * PER + 4]));
    const PER2 = 3;
    const second = (await client.multicall({
      allowFailure: true,
      contracts: markets.flatMap((m, i) => {
        const policy = (policyOf[i] ?? m.controller) as `0x${string}`;
        return [
          // Lend-market policies take the controller; mint-market policies
          // take no argument — probe both, keep whichever answers.
          { address: policy, abi: POLICY_ABI, functionName: "rate", args: [m.controller as `0x${string}`] },
          { address: policy, abi: POLICY_ABI, functionName: "rate" },
          {
            address: CRVUSD_FACTORY,
            abi: CRVUSD_FACTORY_ABI,
            functionName: "debt_ceiling",
            args: [m.controller as `0x${string}`],
          },
        ] as const;
      }),
    })) as Res[];

    const rows: LlamalendMarketRow[] = markets.map((m, i) => {
      const base = i * PER;
      const totalDebtRaw = ok<bigint>(state[base]) ?? ZERO;
      const nLoans = Number(ok<bigint>(state[base + 1]) ?? ZERO);
      const loanDiscount = scale1e18(ok<bigint>(state[base + 2]) ?? ZERO);
      const liquidationDiscount = scale1e18(ok<bigint>(state[base + 3]) ?? ZERO);
      const monetaryPolicy = (policyOf[i] ?? "").toLowerCase();
      const priceOracleRaw = ok<bigint>(state[base + 5]) ?? ZERO;
      const basePriceRaw = ok<bigint>(state[base + 6]) ?? ZERO;
      const controllerBalance = ok<bigint>(state[base + 7]);

      const rateWithArg = ok<bigint>(second[i * PER2]);
      const rateNoArg = ok<bigint>(second[i * PER2 + 1]);
      const rateRaw = rateWithArg ?? rateNoArg;
      const borrowAprPct = rateRaw != null ? scale1e18(rateRaw) * SECONDS_PER_YEAR * 100 : null;

      const totalDebt = scaleRaw(totalDebtRaw, m.borrowedDecimals);

      let utilisation: number | null = null;
      let utilisationBasis: LlamalendMarketRow["utilisationBasis"] = null;
      if (m.factory === "crvusd") {
        const ceiling = ok<bigint>(second[i * PER2 + 2]);
        if (ceiling != null && ceiling > ZERO) {
          utilisation = scaleRaw(totalDebtRaw, m.borrowedDecimals) / scaleRaw(ceiling, m.borrowedDecimals);
          utilisationBasis = "crvUSD debt ceiling";
        }
      } else if (controllerBalance != null) {
        const available = scaleRaw(controllerBalance, m.borrowedDecimals);
        const denom = totalDebt + available;
        if (denom > 0) {
          utilisation = totalDebt / denom;
          utilisationBasis = "lender deposits";
        }
      }

      return {
        ...m,
        totalDebt,
        totalDebtRaw: totalDebtRaw.toString(),
        nLoans,
        loanDiscount,
        liquidationDiscount,
        monetaryPolicy,
        borrowAprPct,
        priceOracle: scale1e18(priceOracleRaw),
        priceOracleRaw: priceOracleRaw.toString(),
        basePriceRaw: basePriceRaw.toString(),
        utilisation,
        utilisationBasis,
        totalDebtUsd: m.borrowedIsCrvusd ? totalDebt : null,
      };
    });

    // Canonical order: version, then each factory's own index — the
    // protocols' own enumeration, not a Rails ranking.
    rows.sort((a, b) =>
      a.version !== b.version
        ? a.version.localeCompare(b.version)
        : a.factory !== b.factory
          ? a.factory.localeCompare(b.factory)
          : a.index - b.index,
    );

    return {
      blockNumber,
      markets: rows,
      summary: {
        total: rows.length,
        v1Lend: rows.filter((r) => r.factory === "oneway").length,
        v1Mint: rows.filter((r) => r.factory === "crvusd").length,
        v2: rows.filter((r) => r.factory === "v2").length,
        live: rows.filter((r) => r.nLoans > 0).length,
        totalLoans: rows.reduce((s, r) => s + r.nLoans, 0),
        totalDebtCrvusd: rows.reduce((s, r) => s + (r.totalDebtUsd ?? 0), 0),
        nonCrvusdBorrow: rows.filter((r) => !r.borrowedIsCrvusd).length,
      },
      chainStale: false,
    };
  } catch (error) {
    console.error("LlamaLend markets chain read failed:", error);
    return empty();
  }
}

// ── Market-state map for the position surfaces ────────────────────────────────
// The listing proxy needs, per controller: identity (tokens, decimals, A) and
// the AMM's live price_oracle (for the crvUSD-borrowed markets' USD figures).
// Identity comes from the cached discovery; the price is one light multicall.

export interface LlamalendMarketState extends LlamalendMarketIdentity {
  /** AMM.price_oracle() at head — collateral in the borrowed token (scaled).
   *  Null when the read failed. */
  priceOracle: number | null;
  priceOracleRaw: string | null;
}

export type LlamalendMarketStateMap = Map<string, LlamalendMarketState>;

export async function resolveLlamalendMarketState(): Promise<{
  state: LlamalendMarketStateMap;
  blockNumber: number;
}> {
  const state: LlamalendMarketStateMap = new Map();
  try {
    const client = alchemyClient();
    const [blockNumber, identity] = await Promise.all([
      client.getBlockNumber().then(Number),
      discoverLlamalendMarkets(),
    ]);
    const markets = [...identity.values()];
    const prices = (await client.multicall({
      allowFailure: true,
      contracts: markets.map(
        (m) => ({ address: m.amm as `0x${string}`, abi: AMM_ABI, functionName: "price_oracle" }) as const,
      ),
    })) as Res[];
    markets.forEach((m, i) => {
      const p = ok<bigint>(prices[i]);
      state.set(m.controller, {
        ...m,
        priceOracle: p != null ? scale1e18(p) : null,
        priceOracleRaw: p != null ? p.toString() : null,
      });
    });
    return { state, blockNumber };
  } catch (error) {
    console.error("LlamaLend market-state read failed:", error);
    return { state, blockNumber: 0 };
  }
}
