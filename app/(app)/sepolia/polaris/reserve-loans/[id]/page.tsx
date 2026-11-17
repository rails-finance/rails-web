// One Polaris reserve loan: /sepolia/polaris/reserve-loans/<loan id>
// (rails-ops TO-DO-polaris-scoping.md §8b). The server reads the loan's
// position row and its whole timeline from the index (a loan has a handful
// of touches); the loans manager's getters at head stay a client read
// (loan-view.tsx). A loan id the index has no row for is a 404.

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { notFound } from "next/navigation";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { FPETH, normalizeCdpId, POLARIS_CHAIN_ID, POLARIS_WETH } from "@/lib/polaris/asset-catalog";
import { polarisLoanHref } from "@/lib/polaris/routes";
import { loadPolarisLoan } from "@/lib/polaris/sp-loan-page-data";
import LoanView from "./loan-view";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = normalizeCdpId(rawId);
  return positionMetadata({
    session: "polaris",
    subject: `#${id ?? rawId}`,
    noun: "Reserve loan",
    canonicalPath: id ? polarisLoanHref(id) : `/sepolia/polaris/reserve-loans/${rawId}`,
    description: () =>
      `A Rails replay of this Polaris reserve loan on Sepolia: every touch from the loans manager's events, with a receipt on every number. Test tokens only.`,
  });
}

const KEYS = [assetKey(POLARIS_CHAIN_ID, FPETH.address), assetKey(POLARIS_CHAIN_ID, POLARIS_WETH.address)];

export default async function PolarisLoanPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = normalizeCdpId(rawId);
  if (!id) notFound();
  const initial = await loadPolarisLoan(id);
  if (initial === "missing") notFound();
  return (
    <AimGate keys={KEYS} chain={POLARIS_CHAIN_ID} what="This Polaris reserve loan">
      <LoanView key={id} loanId={id} initial={initial} />
    </AimGate>
  );
}
