import type { Metadata } from "next";
import { decodeEventId, eventMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import { liquityV1StakeHref, LIQUITY_V1_STAKING_PATH, normalizeStaker } from "@/lib/liquity-v1/staking-routes";
import { loadLiquityV1Stake } from "@/lib/liquity-v1/staking-page-data";
import { stEventLabel } from "@/lib/liquity-v1/staking-event-prose";
import { stEventPageDescription } from "@/lib/liquity-v1/staking-explorer";
import LiquityV1StakePage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

// Restated: the parent route renders per request over a `no-store` read.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "A Rails replay of this Liquity V1 LQTY stake: every touch from LQTYStaking's events, with a receipt on every number.";

// The event's metadata, from the rows the parent page reads in the same
// request (`loadLiquityV1Stake`, cached). An event older than those rows keeps
// the stake's title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: rawWallet, eventId } = await params;
  const staker = normalizeStaker(rawWallet);
  const named = { session: "liquity-v1", subject: staker ?? rawWallet, market: "Staking", noun: "LQTY stake" } as const;
  if (!staker) return positionMetadata({ ...named, canonicalPath: `${LIQUITY_V1_STAKING_PATH}/${rawWallet}` });
  const decoded = decodeEventId(eventId);
  const data = await loadLiquityV1Stake(staker);
  const row = data && data !== "missing" ? data.rows.find((r) => r.event_key === decoded) : undefined;
  return eventMetadata({
    ...named,
    canonicalPath: `${liquityV1StakeHref(staker)}/event/${encodeURIComponent(decoded)}`,
    event: row ? { actionLabel: stEventLabel(row), timestamp: Number(row.block_timestamp) } : null,
    description: row ? stEventPageDescription(staker, Number(row.block_timestamp)) : DESCRIPTION,
    image: "explorer",
  });
}

// The parent stake page, same params: the view reads `eventId` from the route
// and draws the timeline alone in its pinned mode, the card on the shared
// event page (rails-ops reference/app-anatomy.md, P4).
export default async function LiquityV1StakeEventPage({ params }: Props) {
  return LiquityV1StakePage({ params });
}
