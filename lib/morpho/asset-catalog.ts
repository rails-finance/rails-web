// Morpho Blue catalog — the singleton address + the market-params decoder.
// ----------------------------------------------------------------------------
// Morpho Blue is ONE immutable contract (not a factory). A "market" is a
// parameter tuple identified by its keccak id (the `param_id` / marketId). The
// dump's `morpho_create_market.market_params` carries that tuple already decoded
// into a viem-style text form:
//
//   Tuple([Address(loan), Address(collateral), Address(oracle), Address(irm), Uint(lltv, 256)])
//
// The order is the canonical MarketParams struct: loanToken, collateralToken,
// oracle, irm, lltv. We parse it back into addresses + the lltv (WAD). Idle /
// supply-only markets zero the collateral/oracle/irm and carry lltv = 0.
//
// Pure data + a regex parse — no chain reads here (token symbols/decimals are
// resolved separately via the ERC20 multicall).

/** Morpho Blue singleton (mainnet, lowercase). The one contract every market,
 *  position, and event belongs to — the provenance dock names it. */
export const MORPHO_ADDRESSES = {
  MORPHO_BLUE: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
} as const;

/** WAD (1e18) — Morpho lltv and shares-virtual scaling are WAD/1e6 respectively. */
export const WAD = 1e18;

export interface MorphoMarketParams {
  /** 0x-prefixed marketId (keccak of the params). */
  marketId: string;
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  /** Loan-to-value liquidation threshold, WAD (e.g. 945000000000000000 = 94.5%). */
  lltv: string;
  /** lltv as a 0..1 fraction (945000000000000000 → 0.945). */
  lltvFraction: number;
  /** True when the market has no collateral side (idle / supply-only vault market). */
  isIdle: boolean;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** Parse the dump's decoded `market_params` text into structured params.
 *  Returns null when the text doesn't match (defensive — never throws). */
export function parseMarketParams(marketIdHex: string, marketParams: string): MorphoMarketParams | null {
  const addrs = [...marketParams.matchAll(/Address\((0x[0-9a-fA-F]{40})\)/g)].map((m) => m[1].toLowerCase());
  const uint = marketParams.match(/Uint\((\d+)\s*,\s*256\)/);
  if (addrs.length < 4 || !uint) return null;
  const [loanToken, collateralToken, oracle, irm] = addrs;
  const lltv = uint[1];
  const marketId = marketIdHex.startsWith("0x") ? marketIdHex.toLowerCase() : `0x${marketIdHex.toLowerCase()}`;
  return {
    marketId,
    loanToken,
    collateralToken,
    oracle,
    irm,
    lltv,
    lltvFraction: Number(lltv) / WAD,
    isIdle: collateralToken === ZERO_ADDR,
  };
}

/** Short display id for a market, e.g. "0x3a85…ec41". */
export function shortMarketId(marketId: string): string {
  const id = marketId.startsWith("0x") ? marketId : `0x${marketId}`;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

/** A market's display name from its token symbols, e.g. "WETH / wstETH" (loan / collateral). */
export function marketLabel(loanSymbol: string, collateralSymbol: string, isIdle: boolean): string {
  return isIdle ? `${loanSymbol} (idle)` : `${loanSymbol} / ${collateralSymbol}`;
}
