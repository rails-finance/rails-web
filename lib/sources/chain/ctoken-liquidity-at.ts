// The Comptroller and the catalog behind each Compound V2-family protocol key,
// for the proxies in app/api/chain/ctoken-liquidity-at: a market key's cToken
// or mToken, and the catalog's label for a market address. The reads at a
// block are rails-server's /api/at-block/ctoken/* routes (rails-ops
// decisions/0056).

import { COMPOUND_V2_ADDRESSES, COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { MOONWELL_ADDRESSES, MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { MOONWELL_BASE_COMPTROLLER } from "@/lib/moonwell-base/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";

const ADDRESS = /^0x[0-9a-f]{40}$/;

export function ctokenDeployment(protocol: CTokenProtocol): {
  chainId: ChainId;
  comptroller: string;
  token: (key: string) => string | undefined;
  /** The catalog's label for a market address, where the catalog has one. */
  label?: (address: string) => string | undefined;
} {
  if (protocol === "compound-v2")
    return {
      chainId: MAINNET_CHAIN_ID,
      comptroller: COMPOUND_V2_ADDRESSES.COMPTROLLER,
      token: (k) => COMPOUND_V2_MARKET_BY_KEY[k]?.ctoken,
      label: (a) => Object.values(COMPOUND_V2_MARKET_BY_KEY).find((m) => m.ctoken === a.toLowerCase())?.symbol,
    };
  if (protocol === "moonwell")
    return {
      chainId: MAINNET_CHAIN_ID,
      comptroller: MOONWELL_ADDRESSES.COMPTROLLER,
      token: (k) => MOONWELL_MARKET_BY_KEY[k]?.mtoken,
      label: (a) => Object.values(MOONWELL_MARKET_BY_KEY).find((m) => m.mtoken === a.toLowerCase())?.symbol,
    };
  return {
    chainId: BASE_CHAIN_ID,
    comptroller: MOONWELL_BASE_COMPTROLLER,
    // Base keys each market by its mToken address.
    token: (k) => (ADDRESS.test(k) ? k : undefined),
  };
}
