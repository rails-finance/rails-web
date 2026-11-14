"use client";

// Aave V4 hubs on Base (/base/aave-v4/hubs): each hub's panel and assets, their
// credit lines, and the hub by spoke matrix. The page is
// components/protocol/aave-v4/aave-v4-hubs-page.tsx.

import { AaveV4HubsPage } from "@/components/protocol/aave-v4/aave-v4-hubs-page";
import { V4_BASE } from "@/lib/aave-v4/markets";

export default function Page() {
  return <AaveV4HubsPage d={V4_BASE} />;
}
