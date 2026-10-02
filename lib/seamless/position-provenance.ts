// The Seamless cards' receipts, bound to this Pool. See
// lib/seamless/asset-catalog.ts for why this Pool is Seamless's own rather than
// Aave's despite answering Aave's interface.

import { makeLivePoolCardDeployment, makeSweptCardDeployment } from "@/lib/aave-v3/card-deployment";
import { SEAMLESS_POOL, SEAMLESS_ORACLE } from "./asset-catalog";

/** The listing card's receipts: every figure a chain read of Seamless's own
 *  contracts at the block the row names, served by rails-server (mig 170). */
export const SEAMLESS_CARD_DEPLOYMENT = makeSweptCardDeployment({
  session: "seamless",
  poolName: "Seamless Pool",
  poolAddress: SEAMLESS_POOL,
  oracleName: "Seamless IAaveOracle",
  oracleAddress: SEAMLESS_ORACLE,
  positionsRoute: "/api/seamless/positions",
});

/** The POSITION PAGE's card receipts: the same reads, made live for the page
 *  through its own chain proxy at the block the card names. */
export const SEAMLESS_LIVE_CARD_DEPLOYMENT = makeLivePoolCardDeployment({
  session: "seamless",
  poolName: "Seamless Pool",
  poolAddress: SEAMLESS_POOL,
  oracleName: "Seamless IAaveOracle",
  oracleAddress: SEAMLESS_ORACLE,
  positionRoute: "/api/chain/seamless/position",
});
