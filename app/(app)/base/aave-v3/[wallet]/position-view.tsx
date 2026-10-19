"use client";

// One wallet's Aave V3 position on Base: the shared single-Pool position page
// (components/protocol/aave-v3/aave-v3-pool-position-page.tsx) with Base's
// deployment (lib/aave-v3-base/page-deployment.ts).

import {
  AaveV3PoolPositionView,
  type AaveV3PoolPositionViewProps,
} from "@/components/protocol/aave-v3/aave-v3-pool-position-page";
import { AAVE_V3_BASE_PAGE } from "@/lib/aave-v3-base/page-deployment";

export default function AaveV3BasePositionView(props: AaveV3PoolPositionViewProps) {
  return <AaveV3PoolPositionView deployment={AAVE_V3_BASE_PAGE} {...props} />;
}
