// One Liquity V1 LQTY stake: /ethereum/liquity-v1/staking/<staker>. The server
// reads the stake's position row and its newest timeline rows from the index;
// LQTYStaking's getters at head stay a client read (stake-view.tsx). An
// address the index has no row for is a 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { liquityV1StakeHref, LIQUITY_V1_STAKING_PATH, normalizeStaker } from "@/lib/liquity-v1/staking-routes";
import { loadLiquityV1Stake } from "@/lib/liquity-v1/staking-page-data";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import StakeView from "./stake-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: rawWallet } = await params;
  const staker = normalizeStaker(rawWallet);
  return positionMetadata({
    session: "liquity-v1",
    subject: staker ?? rawWallet,
    market: "Staking",
    noun: "LQTY stake",
    canonicalPath: staker ? liquityV1StakeHref(staker) : `${LIQUITY_V1_STAKING_PATH}/${rawWallet}`,
    description: () =>
      "A Rails replay of this Liquity V1 LQTY stake: every touch from LQTYStaking's events, with a receipt on every number.",
  });
}

export default async function LiquityV1StakePage({ params }: Props) {
  const { wallet: rawWallet } = await params;
  const staker = normalizeStaker(rawWallet);
  if (!staker) notFound();
  const initial = await loadLiquityV1Stake(staker);
  if (initial === "missing") notFound();
  // Under Focus the stake is LQTY and the LUSD and ETH it is paid.
  const keys = [
    assetKey(MAINNET_CHAIN_ID, TOKEN_ADDRESSES.LQTY),
    assetKey(MAINNET_CHAIN_ID, TOKEN_ADDRESSES.LUSD),
    assetKey(MAINNET_CHAIN_ID, NATIVE),
  ];
  return (
    <AimGate keys={keys} chain={MAINNET_CHAIN_ID} what="This Liquity V1 stake">
      <StakeView key={staker} staker={staker} initial={initial} />
    </AimGate>
  );
}
