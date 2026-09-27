// This event's immutable share card — reads the SAME server tail the spoke
// page's own `opengraph-image.tsx` reads (`loadAaveV4SpokeTail`, cached per
// request, pointed at `/api/aave-v4-base`), finds this id in it, and maps it
// with the family-agnostic `eventCardModel`. No new read path, no per-family
// card model. The Ethereum event route's own file
// (`app/(app)/ethereum/aave-v4/spoke/[spoke]/[wallet]/event/[eventId]/
// opengraph-image.tsx`), pointed at Base.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (wallet, spoke, event
// coordinate) rather than by "the served window" is a later phase.

import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import { AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Aave V4 Base share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ spoke: string; wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { spoke: rawSpoke, wallet: rawWallet, eventId } = await params;
  const wallet = rawWallet.toLowerCase();
  return eventImage({
    session: "aave-v4-base",
    load: async () => {
      if (!ADDRESS.test(rawWallet)) return null;
      const decoded = decodeEventId(eventId);
      const spokeName = spokeFromSlug(rawSpoke) ?? decodeURIComponent(rawSpoke);
      const tail = await loadAaveV4SpokeTail(wallet, spokeName, AAVE_V4_BASE_API_ROOT);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "aave-v4-base", subject: shortSubject(wallet), market: spokeName });
    },
  });
}
