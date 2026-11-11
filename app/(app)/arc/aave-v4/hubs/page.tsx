"use client";

// Aave V4 hubs on Arc (/arc/aave-v4/hubs): the Core hub's panel and assets, its
// credit lines and the hub by spoke matrix, read at the head when the page
// opens. The page is components/protocol/aave-v4/aave-v4-hubs-page.tsx.

import { AaveV4HubsPage } from "@/components/protocol/aave-v4/aave-v4-hubs-page";
import { V4_ARC } from "@/lib/aave-v4/markets";

export default function Page() {
  return <AaveV4HubsPage d={V4_ARC} />;
}
