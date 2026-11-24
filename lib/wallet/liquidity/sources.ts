// The owner routes the wallet page's Liquidity section reads at visit (W9; rails-ops
// decisions/0071): one per explorer and chain, each answering the wallet's positions that hold
// liquidity with the head-only fields its listing card draws (rails-server api/src/routes/uniswap.ts,
// aerodrome.ts, balancer.ts). Paths only; lib/wallet/liquidity/read-liquidity.ts reads them.
//
// Pure, with no imports: scripts/test/wallet-liquidity.test.mjs reads it.

export type LiquidityKind = "uniswap" | "slipstream" | "balancer";

export interface LiquiditySource {
  /** `<protocol>:<chainId>`. */
  key: string;
  kind: LiquidityKind;
  /** The route's protocol segment: /api/at-block/<protocol>/… */
  protocol: "uniswap" | "pancakeswap" | "aerodrome" | "velodrome" | "balancer";
  chainId: 1 | 8453 | 42161 | 10 | 5042;
  chainName: string;
  /** The explorers it covers, as the page names them ("Uniswap V3 and V4"). */
  name: string;
  /** The explorer's wallet page under the chain ("/base/uniswap-v3"); `<route>/<wallet>` lists every position. */
  route: string;
}

const src = (
  kind: LiquidityKind,
  protocol: LiquiditySource["protocol"],
  chainId: LiquiditySource["chainId"],
  chainName: string,
  name: string,
  route: string,
): LiquiditySource => ({ key: `${protocol}:${chainId}`, kind, protocol, chainId, chainName, name, route });

/** In the page's order: Uniswap's chains, PancakeSwap's, the two Slipstream sites, Balancer's. */
export const LIQUIDITY_SOURCES: readonly LiquiditySource[] = [
  src("uniswap", "uniswap", 1, "Ethereum", "Uniswap V3 and V4", "/ethereum/uniswap-v3"),
  src("uniswap", "uniswap", 8453, "Base", "Uniswap V3", "/base/uniswap-v3"),
  src("uniswap", "uniswap", 42161, "Arbitrum", "Uniswap V3 and V4", "/arbitrum/uniswap-v3"),
  src("uniswap", "uniswap", 10, "Optimism", "Uniswap V3 and V4", "/optimism/uniswap-v3"),
  src("uniswap", "uniswap", 5042, "Arc", "Uniswap V3 and V4", "/arc/uniswap-v3"),
  src("uniswap", "pancakeswap", 8453, "Base", "PancakeSwap V3", "/base/pancakeswap-v3"),
  src("uniswap", "pancakeswap", 42161, "Arbitrum", "PancakeSwap V3", "/arbitrum/pancakeswap-v3"),
  src("slipstream", "aerodrome", 8453, "Base", "Aerodrome", "/base/aerodrome"),
  src("slipstream", "velodrome", 10, "Optimism", "Velodrome", "/optimism/velodrome"),
  src("balancer", "balancer", 1, "Ethereum", "Balancer V3", "/ethereum/balancer-v3"),
  src("balancer", "balancer", 42161, "Arbitrum", "Balancer V3", "/arbitrum/balancer-v3"),
];

/** How many of an answer's rows the Uniswap-family and Slipstream routes read at the head (the
 *  server's HEAD_ROWS): the rows past it carry no head fields, and the section draws none of them. */
export const LIQUIDITY_HEAD_ROWS = 25;

const qs = (q: Record<string, string>) => new URLSearchParams(q).toString();

/** The route's `chain` parameter: Ethereum's Uniswap and Base's Aerodrome take none (their default). */
const chainQ = (s: LiquiditySource): Record<string, string> =>
  (s.protocol === "uniswap" && s.chainId === 1) || (s.protocol === "aerodrome" && s.chainId === 8453)
    ? {}
    : { chain: String(s.chainId) };

/** The owner route: the wallet's positions holding liquidity. */
export function ownerPath(s: LiquiditySource, owner: string): string {
  const o = owner.toLowerCase();
  if (s.kind === "balancer") return `/api/at-block/balancer/positions?${qs({ chainId: String(s.chainId), owner: o })}`;
  return `/api/at-block/${s.protocol}/positions?${qs({ ...chainQ(s), owner: o })}`;
}

const andList = (xs: string[]) =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The explorers read at visit, for the empty state: "Uniswap V3 and V4 on Ethereum, Arbitrum,
 *  Optimism and Arc; Uniswap V3 on Base; …". */
export function walletLiquidityLine(): string {
  const byName = new Map<string, string[]>();
  for (const s of LIQUIDITY_SOURCES) byName.set(s.name, [...(byName.get(s.name) ?? []), s.chainName]);
  return [...byName].map(([name, chains]) => `${name} on ${andList(chains)}`).join("; ");
}
