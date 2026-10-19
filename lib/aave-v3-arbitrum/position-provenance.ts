// The Aave V3 Arbitrum position card's receipts, bound to this Pool and its
// oracle: every current figure read live for the page at the block the card
// names, through /api/chain/aave-v3-arbitrum/position and ARBITRUM_RPC_URL.

import { makeLivePoolCardDeployment } from "@/lib/aave-v3/card-deployment";
import { CHAINS } from "@/lib/shared/chains";
import { AAVE_V3_ARBITRUM_CHAIN_ID, AAVE_V3_ARBITRUM_ORACLE, AAVE_V3_ARBITRUM_POOL } from "./asset-catalog";

export const AAVE_V3_ARBITRUM_LIVE_CARD_DEPLOYMENT = makeLivePoolCardDeployment({
  session: "aave-v3-arbitrum",
  poolName: "Aave V3 Pool (Arbitrum)",
  poolAddress: AAVE_V3_ARBITRUM_POOL,
  oracleName: "Aave V3 IAaveOracle (Arbitrum)",
  oracleAddress: AAVE_V3_ARBITRUM_ORACLE,
  positionRoute: "/api/chain/aave-v3-arbitrum/position",
  rpcEnv: CHAINS[AAVE_V3_ARBITRUM_CHAIN_ID].rpcEnv,
});
