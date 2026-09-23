// SERVER-ONLY — see lib/shared/swept-position-page-data.ts for which legs the
// server answers and why the history's depends on the index vouching.
import { v3PoolPositionLoader } from "@/lib/shared/swept-position-page-data";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_DEPLOY_BLOCK, AAVE_V3_BASE_POOL } from "@/lib/aave-v3-base/asset-catalog";

/** Base runs a single Aave V3 Pool, so unlike Ethereum there is no market to
 *  choose between and the wallet alone keys the read. */
export const loadAaveV3BaseTail = v3PoolPositionLoader({
  label: "aave-v3-base",
  pool: AAVE_V3_BASE_POOL,
  chainId: AAVE_V3_BASE_CHAIN_ID,
  apiPrefix: "/api/aave-v3-base",
  deployBlock: AAVE_V3_BASE_DEPLOY_BLOCK,
});
