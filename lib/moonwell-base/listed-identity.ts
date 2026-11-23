// The lane every Moonwell Base listing card cites: the Base Comptroller, the
// Base sweep, the listing's route. The listing and the wallet page draw the
// same card under it. Module-level, so a provider value is stable.

import { makeListedMoonwellIdentity } from "@/lib/moonwell/swept-card-provenance";
import {
  MOONWELL_BASE_COMPTROLLER,
  MOONWELL_BASE_DEPLOY_BLOCK,
  MOONWELL_BASE_WETH_ROUTER,
} from "@/lib/moonwell-base/asset-catalog";
import { MOONWELL_BASE_POSITIONS_ROUTE } from "@/lib/moonwell-base/list-filter-dimensions";

export const MOONWELL_BASE_LISTED_IDENTITY = makeListedMoonwellIdentity({
  session: "moonwell-base",
  comptroller: { name: "Comptroller (Base)", address: MOONWELL_BASE_COMPTROLLER },
  positionRoute: "/api/chain/moonwell-base/position",
  positionsRoute: MOONWELL_BASE_POSITIONS_ROUTE,
  router: MOONWELL_BASE_WETH_ROUTER,
  deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
});
