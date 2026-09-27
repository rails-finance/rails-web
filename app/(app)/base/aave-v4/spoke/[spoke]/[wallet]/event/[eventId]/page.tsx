import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import { AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";
import AaveV4BaseSpokePage from "../../page";

// One event of an Aave V4 Base position: the parent page, pinned to the event
// (ChainTruthTimeline reads `eventId` from the route). Same shape as the
// Ethereum event route.

interface Props {
  params: Promise<{ spoke: string; wallet: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spoke: rawSpoke, wallet: rawWallet, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const spokeName = spokeFromSlug(rawSpoke) ?? decodeURIComponent(rawSpoke);
  const tail = ADDRESS.test(rawWallet)
    ? await loadAaveV4SpokeTail(rawWallet.toLowerCase(), spokeName, AAVE_V4_BASE_API_ROOT)
    : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "aave-v4-base",
    subject: rawWallet,
    market: spokeName,
    canonicalPath: `/base/aave-v4/spoke/${rawSpoke}/${rawWallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

export default async function AaveV4BaseEventPage({ params }: Props) {
  return AaveV4BaseSpokePage({ params });
}
