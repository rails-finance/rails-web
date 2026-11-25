// focus: the explorer's explainer; the shell's gate stands over the explorer
// How Aave's vault layer on Ethereum is built — /ethereum/aave-v3/vaults/info
// (rails-ops ui-jobs 789). The page is the shared one
// (components/vaults/aave-vaults-info.tsx).

import { AAVE_VAULTS_INFO_METADATA, AaveVaultsInfo } from "@/components/vaults/aave-vaults-info";

export const dynamic = "force-dynamic";

export const metadata = AAVE_VAULTS_INFO_METADATA;

export default function EthereumAaveVaultsInfoPage() {
  return <AaveVaultsInfo />;
}
