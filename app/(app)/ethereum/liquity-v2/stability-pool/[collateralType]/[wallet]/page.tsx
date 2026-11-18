// One Liquity V2 stability-pool deposit:
// /ethereum/liquity-v2/stability-pool/<branch>/<depositor> (rails-ops
// TO-DO-stability-pool-deposits.md §3). The server reads the deposit's
// position row and its newest timeline rows from the index; the pool's
// getters at head stay a client read (deposit-view.tsx). A pair the index has
// no row for is a 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import {
  liquityV2DepositHref,
  LIQUITY_V2_SP_PATH,
  normalizeDepositor,
  normalizeSpBranch,
} from "@/lib/liquity-v2/sp-routes";
import { loadLiquityV2Deposit } from "@/lib/liquity-v2/sp-page-data";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import DepositView from "./deposit-view";

interface Props {
  params: Promise<{ collateralType: string; wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collateralType: rawBranch, wallet: rawWallet } = await params;
  const branch = normalizeSpBranch(rawBranch);
  const depositor = normalizeDepositor(rawWallet);
  return positionMetadata({
    session: "liquity-v2",
    subject: depositor ?? rawWallet,
    market: `${branch ?? rawBranch} Stability Pool`,
    noun: "Deposit",
    canonicalPath:
      branch && depositor ? liquityV2DepositHref(branch, depositor) : `${LIQUITY_V2_SP_PATH}/${rawBranch}/${rawWallet}`,
    description: () =>
      "A Rails replay of this Liquity V2 stability-pool deposit: every operation from the pool's events, with a receipt on every number.",
  });
}

export default async function LiquityV2DepositPage({ params }: Props) {
  const { collateralType: rawBranch, wallet: rawWallet } = await params;
  const branch = normalizeSpBranch(rawBranch);
  const depositor = normalizeDepositor(rawWallet);
  if (!branch || !depositor) notFound();
  const initial = await loadLiquityV2Deposit(branch, depositor);
  if (initial === "missing") notFound();
  // Under Focus the deposit is BOLD and its branch's collateral.
  const keys = [
    assetKey(MAINNET_CHAIN_ID, TOKEN_ADDRESSES.BOLD),
    assetKey(MAINNET_CHAIN_ID, LIQUITY_V2_BRANCHES[branch.toLowerCase()].collateralAddr),
  ];
  return (
    <AimGate keys={keys} chain={MAINNET_CHAIN_ID} what="This Liquity V2 deposit">
      <DepositView key={`${branch}:${depositor}`} branch={branch} depositor={depositor} initial={initial} />
    </AimGate>
  );
}
