// The Collateral facet of the lender listings whose route takes
// `collateralTokens` (compound, compound-base, llamalend): chips carry token
// symbols, the URL param `collateral` holds them, and the fetch sends the
// lowercase addresses those symbols name on the lane's chain. /start's
// Borrowing results link into the same param.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { getTokenAddress } from "@/lib/shared/token-addresses";
import tree from "@/lib/start/start-tree.json";

export const COLLATERAL_PARAM = "collateral";

/** An address no token holds: a selection none of whose symbols has an address
 *  on the lane asks for it, so the page is empty rather than every row. */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** The ETH, BTC and stablecoin symbols the Start tree names. */
export const COLLATERAL_SYMBOLS: readonly string[] = [
  ...new Set([...tree.groups.eth.symbols, ...tree.groups.btc.symbols, ...tree.groups.stablecoins.borrow]),
];

/** The chips: those symbols that have an address on `chainId`. */
export function collateralOptions(chainId: ChainId = MAINNET_CHAIN_ID): FilterOptionDef[] {
  return COLLATERAL_SYMBOLS.filter((s) => getTokenAddress(s, chainId) !== null).map((s) => ({ value: s, label: s }));
}

/** The `collateralTokens` a selection sends; undefined when nothing is chosen. */
export function collateralTokensOf(symbols: string[], chainId: ChainId = MAINNET_CHAIN_ID): string[] | undefined {
  if (symbols.length === 0) return undefined;
  const addresses = symbols
    .map((s) => getTokenAddress(s, chainId))
    .filter((a): a is string => a !== null)
    .map((a) => a.toLowerCase());
  return addresses.length > 0 ? [...new Set(addresses)] : [ZERO_ADDRESS];
}
