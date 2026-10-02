// The Aave V3 Base cards' receipts, bound to this Pool.

import { makeLivePoolCardDeployment, makeSweptCardDeployment } from "@/lib/aave-v3/card-deployment";
import { AAVE_V3_BASE_POOL, AAVE_V3_BASE_ORACLE } from "./asset-catalog";

/** The listing card's receipts: every figure a chain read of the Base Pool's
 *  own contracts at the block the row names, served by rails-server (mig 170). */
export const AAVE_V3_BASE_CARD_DEPLOYMENT = makeSweptCardDeployment({
  session: "aave-v3-base",
  poolName: "Aave V3 Pool (Base)",
  poolAddress: AAVE_V3_BASE_POOL,
  oracleName: "Aave V3 IAaveOracle (Base)",
  oracleAddress: AAVE_V3_BASE_ORACLE,
  positionsRoute: "/api/aave-v3-base/positions",
});

/** The POSITION PAGE's card receipts: the same reads, made live for the page
 *  through its own chain proxy at the block the card names. */
export const AAVE_V3_BASE_LIVE_CARD_DEPLOYMENT = makeLivePoolCardDeployment({
  session: "aave-v3-base",
  poolName: "Aave V3 Pool (Base)",
  poolAddress: AAVE_V3_BASE_POOL,
  oracleName: "Aave V3 IAaveOracle (Base)",
  oracleAddress: AAVE_V3_BASE_ORACLE,
  positionRoute: "/api/chain/aave-v3-base/position",
});
