// One Polaris stability-pool deposit: /sepolia/polaris/stability-pool/<market>/<token id>
// (rails-ops TO-DO-stability-pool-deposits.md §2). The server reads the
// deposit's position row and its newest timeline rows from the index; the
// pool's getters at head stay a client read (deposit-view.tsx). A token id
// the index has no row for is a 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AimGate } from "@/components/shared/aim-gate";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { normalizeCdpId, normalizeMarket, POLARIS_CHAIN_ID, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { polarisMarketKeys } from "@/lib/polaris/focus-keys";
import { polarisDepositHref } from "@/lib/polaris/routes";
import {
  PolarisSpLoanHttpError,
  readPolarisSpLoans,
  type PolarisDepositTimelineResponse,
} from "@/lib/sources/api/polaris-sp-loans";
import DepositView from "./deposit-view";
import { DEPOSIT_FIRST_READ } from "@/lib/polaris/sp-loan-timeline-events";

interface Props {
  params: Promise<{ market: string; id: string }>;
}

export const dynamic = "force-dynamic";

async function load(market: string, id: string): Promise<PolarisDepositTimelineResponse | "missing" | null> {
  try {
    const hop = await boxHop();
    if (!hop) return null;
    return await readPolarisSpLoans<PolarisDepositTimelineResponse>(
      "stability-pool/timeline",
      { market, id, order: "desc", limit: String(DEPOSIT_FIRST_READ) },
      { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
    );
  } catch (err) {
    if (err instanceof PolarisSpLoanHttpError && err.status === 404) return "missing";
    console.error("polaris deposit page read failed:", err);
    return null;
  }
}

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
  const initial = await load(market, id);
  if (initial === "missing") notFound();
  return (
    <AimGate keys={polarisMarketKeys(market)} chain={POLARIS_CHAIN_ID} what="This Polaris deposit">
      <DepositView key={`${market}:${id}`} market={market} tokenId={id} initial={initial} />
    </AimGate>
  );
}
