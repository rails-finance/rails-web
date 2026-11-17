import type { Metadata } from "next";
import { decodeEventId, eventMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import { normalizeCdpId } from "@/lib/polaris/asset-catalog";
import { polarisLoanHref } from "@/lib/polaris/routes";
import { loadPolarisLoan } from "@/lib/polaris/sp-loan-page-data";
import { loanEventLabel } from "@/lib/polaris/loan-event-prose";
import { loanEventPageDescription } from "@/lib/polaris/sp-loan-explorer";
import PolarisLoanPage from "../../page";

interface Props {
  params: Promise<{ id: string; eventId: string }>;
}

// Restated: the parent route renders per request over a `no-store` read.
export const dynamic = "force-dynamic";

// The event's metadata, from the timeline the parent page reads in the
// same request (`loadPolarisLoan`, cached).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: rawId, eventId } = await params;
  const id = normalizeCdpId(rawId);
  const named = { session: "polaris", subject: `#${id ?? rawId}`, noun: "Reserve loan" } as const;
  if (!id) return positionMetadata({ ...named, canonicalPath: `/sepolia/polaris/reserve-loans/${rawId}` });
  const decoded = decodeEventId(eventId);
  const data = await loadPolarisLoan(id);
  const row = data && data !== "missing" ? data.rows.find((r) => r.event_key === decoded) : undefined;
  return eventMetadata({
    ...named,
    canonicalPath: `${polarisLoanHref(id)}/event/${encodeURIComponent(decoded)}`,
    event: row ? { actionLabel: loanEventLabel(row), timestamp: Number(row.block_timestamp) } : null,
    description: row
      ? loanEventPageDescription(id, Number(row.block_timestamp))
      : `A Rails replay of this Polaris reserve loan on Sepolia: every touch from the loans manager's events, with a receipt on every number. Test tokens only.`,
    image: "explorer",
  });
}

// The parent loan page, same params: the view reads `eventId` from the route
// and draws the timeline alone in its pinned mode, the card on the shared
// event page (rails-ops reference/app-anatomy.md, P4).
export default async function PolarisLoanEventPage({ params }: Props) {
  return PolarisLoanPage({ params });
}
