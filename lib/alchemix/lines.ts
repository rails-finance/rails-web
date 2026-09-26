// The Alchemix line catalog, and the two routes an explorer is reached at.
// ----------------------------------------------------------------------------
// A LINE is one synthetic on one chain: `eth-alusd`, `eth-aleth`, `base-alusdb`.
// It is the unit everything about Alchemix is scoped to — the position key, the
// timeline query, the grade — because a token id is an NFT id inside its line
// and the same number exists in every other line.
//
// WHY THE CATALOG IS KEYED ON THE PAIR AND NOT ON THE LINE KEY ALONE. The key
// text happens to name its chain today ("eth-", "base-"), so a flat lookup
// would work and would keep working until the day a line key stopped carrying
// that prefix. Then `eth-alusd` and a Base line of the same name would
// silently conflate, and the failure would be a position page showing another
// chain's position rather than an error. The chain is therefore asserted, not
// parsed: `linesForChain` is the only way to get a line, and `isLineOnChain`
// is the only validity gate, so a line key arriving in a URL cannot be honoured
// by the wrong explorer.
//
// The display names are rails-server's own (`api/src/config/alchemix-v3.ts`).
// What is NOT here: any address. Every address a line names — the Alchemist,
// the Transmuter, the position NFT, the MYT, the MYT's underlying — is read
// from `alchemix_v3_lines` by the API, which is the rule that table's migration
// sets. A fixed address in this file would be a second source for something the
// chain already answers.

import type { ChainId } from "@/lib/shared/chains";
import type { SessionProtocol } from "@/lib/shared/sessions";

export interface AlchemixLine {
  /** The key the API takes in a path or a `line=` filter. */
  key: string;
  /** The chain this line is deployed on. Half of the position's identity. */
  chainId: ChainId;
  /** How the line is named on a surface ("alUSD"), which is not the same string
   *  as the synthetic's symbol on every line. */
  displayName: string;
}

/** Every line, chain first. The order is the display order. */
const LINES: AlchemixLine[] = [
  { key: "eth-alusd", chainId: 1, displayName: "alUSD" },
  { key: "eth-aleth", chainId: 1, displayName: "alETH" },
  { key: "base-alusdb", chainId: 8453, displayName: "alUSDb" },
];

/** One explorer — a chain, its route, its session key, and the lines it lists.
 *  The two Alchemix roster entries are two of these, and every surface takes
 *  the whole record rather than a chain id it would have to re-resolve. */
export interface AlchemixDeployment {
  chainId: ChainId;
  session: SessionProtocol;
  /** The explorer's own route, matching the roster's derived `href`. */
  basePath: string;
  lines: AlchemixLine[];
}

export const ALCHEMIX_ETHEREUM: AlchemixDeployment = {
  chainId: 1,
  session: "alchemix",
  basePath: "/ethereum/alchemix",
  lines: linesForChain(1),
};

export const ALCHEMIX_BASE: AlchemixDeployment = {
  chainId: 8453,
  session: "alchemix-base",
  basePath: "/base/alchemix",
  lines: linesForChain(8453),
};

/** The lines deployed on one chain. The only way to get a line out of the
 *  catalog, so nothing can hold a line without having named its chain. */
export function linesForChain(chainId: ChainId): AlchemixLine[] {
  return LINES.filter((l) => l.chainId === chainId);
}

/** Is this line key one of the lines on this chain? The validity gate for a
 *  line arriving from a URL: it takes the pair, so a key that is real on
 *  another chain is rejected here rather than served by the wrong explorer. */
export function isLineOnChain(chainId: ChainId, key: string): boolean {
  return LINES.some((l) => l.chainId === chainId && l.key === key);
}

// There is no display-name lookup here, and a surface that wants one should not
// add it. Every row the API serves already carries its own `lineDisplayName`,
// and every coverage row its `displayName`, both from the line's registry entry
// on the box. A second name resolved locally would be a second source for the
// same string, and it would answer for a line this file has not learned yet by
// guessing. The `displayName` in this catalog exists for the filter facet,
// which has to name the lines before any row has been fetched.
