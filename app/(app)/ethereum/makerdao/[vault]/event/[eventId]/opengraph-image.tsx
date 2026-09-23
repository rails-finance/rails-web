// This event's immutable share card — reads the SAME server tail the vault
// page's own `opengraph-image.tsx` reads (`loadMakerVaultTail`, cached per
// request), finds this id in it, and maps it with the family-agnostic
// `eventCardModel`. No new read path, no per-family card model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (vault, event coordinate)
// rather than by "the served window" is a later phase.

import { loadMakerVaultTail } from "@/lib/makerdao/position-page-data";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable MakerDAO share card";

// The [vault] param is a cdp id (decimal) or a urn ADDRESS for LockStake
// engine urns (decision 0013) — the same gate the page itself applies before
// reading. A string that is neither names nothing.
const CDP_ID = /^\d{1,20}$/;
const URN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Props {
  params: Promise<{ vault: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { vault, eventId } = await params;
  return eventImage({
    session: "makerdao",
    load: async () => {
      if (!CDP_ID.test(vault) && !URN_ADDRESS.test(vault)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadMakerVaultTail(vault);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "makerdao", subject: shortSubject(vault) });
    },
  });
}
