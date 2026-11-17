// One Polaris reserve loan: /sepolia/polaris/reserve-loans/<loan id>
// (rails-ops TO-DO-polaris-scoping.md §8b). The server reads the loan's
// position row and its whole timeline from the index (a loan has a handful
// of legs); the loans manager's getters at head stay a client read
// (loan-view.tsx). A loan id the index has no row for is a 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AimGate } from "@/components/shared/aim-gate";
import { boxHop } from "@/lib/shared/listing-ssr";
import { assetKey } from "@/lib/shared/asset-family";
import { FPETH, normalizeCdpId, POLARIS_CHAIN_ID, POLARIS_WETH } from "@/lib/polaris/asset-catalog";
import { polarisLoanHref } from "@/lib/polaris/routes";
import {
  PolarisSpLoanHttpError,
  readPolarisSpLoans,
  type PolarisLoanTimelineResponse,
} from "@/lib/sources/api/polaris-sp-loans";
import LoanView from "./loan-view";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

async function load(id: string): Promise<PolarisLoanTimelineResponse | "missing" | null> {
  try {
    const hop = await boxHop();
    if (!hop) return null;
    return await readPolarisSpLoans<PolarisLoanTimelineResponse>("reserve-loans/timeline", { id, limit: "5000" }, hop);
  } catch (err) {
    if (err instanceof PolarisSpLoanHttpError && err.status === 404) return "missing";
    console.error("polaris loan page read failed:", err);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = normalizeCdpId(rawId);
  return {
    title: `Polaris · Reserve loan #${id ?? rawId}`,
    description: `A Rails replay of this Polaris reserve loan on Sepolia: every leg from the loans manager's events, with a receipt on every number. Test tokens only.`,
    alternates: { canonical: id ? polarisLoanHref(id) : undefined },
  };
}

const KEYS = [assetKey(POLARIS_CHAIN_ID, FPETH.address), assetKey(POLARIS_CHAIN_ID, POLARIS_WETH.address)];

export default async function PolarisLoanPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = normalizeCdpId(rawId);
  if (!id) notFound();
  const initial = await load(id);
  if (initial === "missing") notFound();
  return (
    <AimGate keys={KEYS} chain={POLARIS_CHAIN_ID} what="This Polaris reserve loan">
      <LoanView key={id} loanId={id} initial={initial} />
    </AimGate>
  );
}
