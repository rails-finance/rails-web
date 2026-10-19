"use client";

// One wallet's Aave V3 position on Arbitrum: the shared single-Pool position
// page (components/protocol/aave-v3/aave-v3-pool-position-page.tsx) with the
// Arbitrum deployment (lib/aave-v3-arbitrum/page-deployment.ts).

import {
  AaveV3PoolPositionView,
  type AaveV3PoolPositionViewProps,
} from "@/components/protocol/aave-v3/aave-v3-pool-position-page";
import { AAVE_V3_ARBITRUM_PAGE } from "@/lib/aave-v3-arbitrum/page-deployment";

export default function AaveV3ArbitrumPositionView(props: AaveV3PoolPositionViewProps) {
  return <AaveV3PoolPositionView deployment={AAVE_V3_ARBITRUM_PAGE} {...props} />;
}
