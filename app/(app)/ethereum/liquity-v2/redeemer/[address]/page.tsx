// A wallet as a Liquity V2 redeemer: /ethereum/liquity-v2/redeemer/<address>.
// The server reads the wallet's totals and newest rows from the index
// (rails-server GET /api/liquity-v2/redeemer/:address); where that read does
// not answer, the client view reads them. An address the index holds no
// redemption from is a 404.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { liquityV2RedeemerHref, normalizeRedeemer } from "@/lib/liquity-v2/redeemer-routes";
import { loadLiquityV2Redeemer } from "@/lib/liquity-v2/redeemer-page-data";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import RedeemerView from "./redeemer-view";

interface Props {
  params: Promise<{ address: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address: raw } = await params;
  const address = normalizeRedeemer(raw);
  return positionMetadata({
    session: "liquity-v2",
    subject: address ?? raw,
    noun: "Redeemer",
    canonicalPath: address ? liquityV2RedeemerHref(address) : `/ethereum/liquity-v2/redeemer/${raw}`,
    description: () =>
      "A Rails replay of this wallet's Liquity V2 redemptions: every Trove each one took debt from, with a receipt on every number.",
  });
}

export default async function LiquityV2RedeemerPage({ params }: Props) {
  const { address: raw } = await params;
  const address = normalizeRedeemer(raw);
  if (!address) notFound();
  if (address !== raw) redirect(liquityV2RedeemerHref(address));
  const initial = await loadLiquityV2Redeemer(address);
  if (initial && initial.totals.operations === 0) notFound();
  // Under Focus the page is BOLD and the collateral of each branch it redeemed on
  // (all three where the server's read did not answer).
  const branches = initial ? initial.totals.branches.map((b) => b.collateral_type) : ["WETH", "wstETH", "rETH"];
  const keys = [
    assetKey(MAINNET_CHAIN_ID, TOKEN_ADDRESSES.BOLD),
    ...branches.map((b) => assetKey(MAINNET_CHAIN_ID, LIQUITY_V2_BRANCHES[b.toLowerCase()].collateralAddr)),
  ];
  return (
    <AimGate keys={keys} chain={MAINNET_CHAIN_ID} what="This Liquity V2 redeemer">
      <RedeemerView key={address} address={address} initial={initial} />
    </AimGate>
  );
}
