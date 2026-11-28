// Polaris's split tokens, which have no artwork of their own: each draws
// pETH's mark, in its kind ring from 20px (components/shared/token-kind-ring.tsx;
// ui-jobs 871), and the tip names the token. The token chip resolves them here
// by the catalog's address, or by symbol on the Polaris chain where a caller
// passes no address.

import type { TokenKindRing } from "@/components/shared/token-kind-ring";
import { FPETH, PETH, POLARIS_CHAIN_ID, SVPETH, VPETH, type PolarisTokenMeta } from "@/lib/polaris/asset-catalog";

export interface PolarisRingedToken {
  ring: TokenKindRing;
  /** The token whose mark it draws. */
  base: PolarisTokenMeta;
  /** The icon's tooltip. */
  tip: string;
}

const RINGED: [PolarisTokenMeta, PolarisRingedToken][] = [
  [FPETH, { ring: "fpeth", base: PETH, tip: "fpETH, the floor part of pETH" }],
  [VPETH, { ring: "vpeth", base: PETH, tip: "vpETH, the part of pETH above the floor" }],
  [SVPETH, { ring: "svpeth", base: PETH, tip: "svpETH, staked vpETH" }],
];

const BY_ADDRESS = new Map(RINGED.map(([t, r]) => [t.address.toLowerCase(), r]));
const BY_SYMBOL = new Map(RINGED.map(([t, r]) => [t.symbol, r]));

/** The ring and mark a Polaris split token draws, or undefined for any other
 *  token. */
export function polarisRingedToken(
  address: string | undefined,
  symbol: string,
  chainId: number,
): PolarisRingedToken | undefined {
  if (address) return BY_ADDRESS.get(address.toLowerCase());
  return chainId === POLARIS_CHAIN_ID ? BY_SYMBOL.get(symbol) : undefined;
}
