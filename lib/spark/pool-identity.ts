// The SparkLend Pool as the Aave V3 family's receipts name it
// (lib/aave-v3/pool-context.tsx), for the account figures read at blocks N−1
// and N through the Aave V3 loader.

import type { V3PoolIdentity } from "@/lib/aave-v3/pool-context";
import { SPARK_ADDRESSES } from "./asset-catalog";

export const SPARK_POOL_IDENTITY: V3PoolIdentity = {
  name: "SparkLend Pool",
  address: SPARK_ADDRESSES.POOL,
  positionRoute: "/api/chain/spark/position-state",
};
