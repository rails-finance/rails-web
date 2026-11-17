// One Polaris stability-pool deposit: /sepolia/polaris/stability-pool/<market>/<token id>
// (rails-ops TO-DO-stability-pool-deposits.md §2). The server reads the
// deposit's position row and its newest timeline rows from the index; the
// pool's getters at head stay a client read (deposit-view.tsx). A token id
// the index has no row for is a 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AimGate } from "@/components/shared/aim-gate";
import { normalizeCdpId, normalizeMarket, POLARIS_CHAIN_ID, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { polarisMarketKeys } from "@/lib/polaris/focus-keys";
import { polarisDepositHref } from "@/lib/polaris/routes";
import { loadPolarisDeposit } from "@/lib/polaris/sp-loan-page-data";
import DepositView from "./deposit-view";

interface Props {
  params: Promise<{ market: string; id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, id: rawId } = await params;
  const market = normalizeMarket(rawMarket);
  const id = normalizeCdpId(rawId);
  const stable = market ? POLARIS_MARKET_CONFIG[market].stable.symbol : rawMarket;
  return {
    title: `Polaris · ${stable} Stability Pool · Deposit #${id ?? rawId}`,
    description: `A Rails replay of this Polaris stability-pool deposit on Sepolia: every operation from the pool's events, with a receipt on every number. Test tokens only.`,
    alternates: { canonical: market && id ? polarisDepositHref(market, id) : undefined },
  };
}

export default async function PolarisDepositPage({ params }: Props) {
  const { market: rawMarket, id: rawId } = await params;
  const market = normalizeMarket(rawMarket);
  const id = normalizeCdpId(rawId);
  if (!market || !id) notFound();
  const initial = await loadPolarisDeposit(market, id);
  if (initial === "missing") notFound();
  return (
    <AimGate keys={polarisMarketKeys(market)} chain={POLARIS_CHAIN_ID} what="This Polaris deposit">
      <DepositView key={`${market}:${id}`} market={market} tokenId={id} initial={initial} />
    </AimGate>
  );
}
