// SERVER-ONLY — see lib/shared/swept-position-page-data.ts for which legs the
// server answers and why the history's depends on the index vouching.
import { v3PoolPositionLoader } from "@/lib/shared/swept-position-page-data";
import { SEAMLESS_CHAIN_ID, SEAMLESS_DEPLOY_BLOCK, SEAMLESS_POOL } from "@/lib/seamless/asset-catalog";

/** Seamless runs a single Pool, and every reserve on it is frozen — which
 *  changes what the numbers mean, not how they are read. The reader asks the
 *  Pool which eMode generation it speaks, so the fork's pre-liquid-eMode
 *  thresholds need no flag here either. */
export const loadSeamlessTail = v3PoolPositionLoader({
  label: "seamless",
  pool: SEAMLESS_POOL,
  chainId: SEAMLESS_CHAIN_ID,
  apiPrefix: "/api/seamless",
  deployBlock: SEAMLESS_DEPLOY_BLOCK,
});
