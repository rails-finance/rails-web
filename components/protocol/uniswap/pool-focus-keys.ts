// Focus mode (ui-jobs 557) for a pool position: its keys are both sides of the
// pair, by address (`chain:address`, lowercased). Native ETH, the zero address
// on Uniswap V4, is the family map's native sentinel, so a focus on ETH or WETH
// keeps it.

import { NATIVE, assetKey } from "@/lib/shared/asset-family";

const ZERO = "0x0000000000000000000000000000000000000000";

export function poolTokenKeys(chain: number, tokens: { address: string }[]): string[] {
  return tokens.map((t) => assetKey(chain, t.address.toLowerCase() === ZERO ? NATIVE : t.address));
}
