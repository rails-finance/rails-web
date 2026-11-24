import type { Metadata } from "next";
import { decodeEventId, eventMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import { liquityV1DepositHref, LIQUITY_V1_SP_PATH, normalizeDepositor } from "@/lib/liquity-v1/sp-routes";
import { loadLiquityV1Deposit } from "@/lib/liquity-v1/sp-page-data";
import { spEventLabel } from "@/lib/liquity-v1/sp-event-prose";
import { spEventPageDescription } from "@/lib/liquity-v1/sp-explorer";
import LiquityV1DepositPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

// Restated: the parent route renders per request over a `no-store` read.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "A Rails replay of this Liquity V1 stability-pool deposit: every touch from the pool's events, with a receipt on every number.";

// The event's metadata, from the rows the parent page reads in the same
// request (`loadLiquityV1Deposit`, cached). An event older than those rows
// keeps the deposit's title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: rawWallet, eventId } = await params;
  const depositor = normalizeDepositor(rawWallet);
  const named = {
    session: "liquity-v1",
    subject: depositor ?? rawWallet,
    market: "Stability Pool",
    noun: "Deposit",
  } as const;
  if (!depositor) return positionMetadata({ ...named, canonicalPath: `${LIQUITY_V1_SP_PATH}/${rawWallet}` });
  const decoded = decodeEventId(eventId);
  const data = await loadLiquityV1Deposit(depositor);
  const row = data && data !== "missing" ? data.rows.find((r) => r.event_key === decoded) : undefined;
  return eventMetadata({
    ...named,
    canonicalPath: `${liquityV1DepositHref(depositor)}/event/${encodeURIComponent(decoded)}`,
    event: row ? { actionLabel: spEventLabel(row), timestamp: Number(row.block_timestamp) } : null,
    description: row ? spEventPageDescription(depositor, Number(row.block_timestamp)) : DESCRIPTION,
    image: "explorer",
  });
}

// The parent deposit page, same params: the view reads `eventId` from the
// route and draws the timeline alone in its pinned mode, the card on the
// shared event page (rails-ops reference/app-anatomy.md, P4).
export default async function LiquityV1DepositEventPage({ params }: Props) {
  return LiquityV1DepositPage({ params });
}
