// One Liquity V1 stability-pool deposit: /ethereum/liquity-v1/stability-pool/<depositor>
// (rails-ops TO-DO-stability-pool-deposits.md §4). The server reads the
// deposit's position row and its newest timeline rows from the index; the
// pool's getters at head stay a client read (deposit-view.tsx). An address
// the index has no row for is a 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { liquityV1DepositHref, LIQUITY_V1_SP_PATH, normalizeDepositor } from "@/lib/liquity-v1/sp-routes";
import { loadLiquityV1Deposit } from "@/lib/liquity-v1/sp-page-data";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import DepositView from "./deposit-view";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: rawWallet } = await params;
  const depositor = normalizeDepositor(rawWallet);
  return positionMetadata({
    session: "liquity-v1",
    subject: depositor ?? rawWallet,
    market: "Stability Pool",
    noun: "Deposit",
    canonicalPath: depositor ? liquityV1DepositHref(depositor) : `${LIQUITY_V1_SP_PATH}/${rawWallet}`,
    description: () =>
      "A Rails replay of this Liquity V1 stability-pool deposit: every touch from the pool's events, with a receipt on every number.",
  });
}

export default async function LiquityV1DepositPage({ params }: Props) {
  const { wallet: rawWallet } = await params;
  const depositor = normalizeDepositor(rawWallet);
  if (!depositor) notFound();
  const initial = await loadLiquityV1Deposit(depositor);
  if (initial === "missing") notFound();
  // Under Focus the deposit is LUSD, the ETH it is paid and its LQTY.
  const keys = [
    assetKey(MAINNET_CHAIN_ID, TOKEN_ADDRESSES.LUSD),
    assetKey(MAINNET_CHAIN_ID, NATIVE),
    assetKey(MAINNET_CHAIN_ID, TOKEN_ADDRESSES.LQTY),
  ];
  return (
    <AimGate keys={keys} chain={MAINNET_CHAIN_ID} what="This Liquity V1 deposit">
      <DepositView key={depositor} depositor={depositor} initial={initial} />
    </AimGate>
  );
}
