import type { Metadata } from "next";
import { decodeEventId, eventMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import {
  liquityV2DepositHref,
  LIQUITY_V2_SP_PATH,
  normalizeDepositor,
  normalizeSpBranch,
} from "@/lib/liquity-v2/sp-routes";
import { loadLiquityV2Deposit } from "@/lib/liquity-v2/sp-page-data";
import { spEventLabel } from "@/lib/liquity-v2/sp-event-prose";
import { spEventPageDescription } from "@/lib/liquity-v2/sp-explorer";
import LiquityV2DepositPage from "../../page";

interface Props {
  params: Promise<{ collateralType: string; wallet: string; eventId: string }>;
}

// Restated: the parent route renders per request over a `no-store` read.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "A Rails replay of this Liquity V2 stability-pool deposit: every operation from the pool's events, with a receipt on every number.";

// The event's metadata, from the rows the parent page reads in the same
// request (`loadLiquityV2Deposit`, cached). An event older than those rows
// keeps the deposit's title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collateralType: rawBranch, wallet: rawWallet, eventId } = await params;
  const branch = normalizeSpBranch(rawBranch);
  const depositor = normalizeDepositor(rawWallet);
  const named = {
    session: "liquity-v2",
    subject: depositor ?? rawWallet,
    market: `${branch ?? rawBranch} Stability Pool`,
    noun: "Deposit",
  } as const;
  if (!branch || !depositor) {
    return positionMetadata({ ...named, canonicalPath: `${LIQUITY_V2_SP_PATH}/${rawBranch}/${rawWallet}` });
  }
  const decoded = decodeEventId(eventId);
  const data = await loadLiquityV2Deposit(branch, depositor);
  const row = data && data !== "missing" ? data.rows.find((r) => r.event_key === decoded) : undefined;
  return eventMetadata({
    ...named,
    canonicalPath: `${liquityV2DepositHref(branch, depositor)}/event/${encodeURIComponent(decoded)}`,
    event: row ? { actionLabel: spEventLabel(row), timestamp: Number(row.block_timestamp) } : null,
    description: row ? spEventPageDescription(branch, depositor, Number(row.block_timestamp)) : DESCRIPTION,
    image: "explorer",
  });
}

// The parent deposit page, same params: the view reads `eventId` from the
// route and draws the timeline alone in its pinned mode, the card on the
// shared event page (rails-ops reference/app-anatomy.md, P4).
export default async function LiquityV2DepositEventPage({ params }: Props) {
  return LiquityV2DepositPage({ params });
}
