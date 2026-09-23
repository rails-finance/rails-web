// This event's immutable share card — reads the SAME server tail the
// position page's own `opengraph-image.tsx` reads (`loadSeamlessTail`,
// cached per request), finds this id in it, and maps it with the
// family-agnostic `eventCardModel`. No new read path, no per-family card
// model.
//
// ⚠️ `tail.timeline` is present only when the index vouched for the whole
// life (see lib/shared/swept-position-page-data.ts) — a wallet whose history
// has to be swept from the Pool's own logs has no server-side event to draw
// here, and this route must not add a chain sweep to an image render, so it
// falls back to the static roster card instead.

import { loadSeamlessTail } from "@/lib/seamless/position-page-data";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";
import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Seamless share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  return eventImage({
    session: "seamless",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadSeamlessTail(wallet);
      if (!tail.timeline) return null;
      const rehydrated = rehydrateChainTimelineWire(tail.timeline) as ChainTimelineResponse;
      const event = rehydrated.events.filter(isAaveV3Event).find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "seamless", subject: shortSubject(wallet) });
    },
  });
}
