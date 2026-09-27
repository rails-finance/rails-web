// Aave V4 on Base. Every route under it renders the Aave V4 explorer's shared
// components against the Base deployment (lib/aave-v4/deployment.tsx): the
// /api/aave-v4-base reads, the Base oracle route, the aave-v4-base session
// and Base explorer links. The chain itself is mounted by app/(app)/base/layout.tsx.
import { AaveV4DeploymentProvider, BASE_AAVE_V4 } from "@/lib/aave-v4/deployment";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AaveV4DeploymentProvider value={BASE_AAVE_V4}>{children}</AaveV4DeploymentProvider>;
}
