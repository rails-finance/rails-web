// This event's immutable share card. `loadMoonwellBaseHead` (the server tail
// the position page and its own opengraph-image read) carries the
// Comptroller position only — never events, since this family's history is a
// live sweep on the client until the index can vouch for a whole life (see
// lib/moonwell-base/position-page-data.ts's own header). So the read here is
// its own: the coverage the head already carries, and — only when it says
// `historyComplete` — the same index read the family's client view trusts
// over a sweep (lib/sources/api/moonwell-base-timeline.ts). Coverage not yet
// complete, or the index unreachable, falls back to the static roster card;
// there is no chain sweep to fall back to inside an image route's budget.

import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadMoonwellBaseHead } from "@/lib/moonwell-base/position-page-data";
import { loadMoonwellEventsFromIndex } from "@/lib/sources/api/moonwell-base-timeline";
import {
  MOONWELL_BASE_DEPLOYMENT,
  MOONWELL_BASE_DEPLOY_BLOCK,
  MOONWELL_BASE_WETH_ROUTER,
} from "@/lib/moonwell-base/asset-catalog";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Moonwell on Base share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  return eventImage({
    session: "moonwell-base",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const decoded = decodeEventId(eventId);
      const { coverage } = await loadMoonwellBaseHead(wallet);
      // The backfill has not reached the Sieve checkpoint yet — the client
      // would sweep, and an image route must not: no chain sweep inside its
      // request budget. Falls back to the static roster card.
      if (!coverage?.historyComplete) return null;
      const readerIp = await readerIpFromHeaders();
      const indexed = await loadMoonwellEventsFromIndex(
        {
          wallet,
          deployment: MOONWELL_BASE_DEPLOYMENT,
          deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
          router: MOONWELL_BASE_WETH_ROUTER,
          apiPrefix: "/api/moonwell-base",
          // ONE event by id, not a card list: the render cap is a drawing
          // budget for the position page, and an id below its cut (an
          // unsigned row, elided) is still this position's event. The rows
          // are already fetched whole; this only lifts the in-memory cut.
          maxRendered: Number.MAX_SAFE_INTEGER,
        },
        readerIp,
      );
      if (!indexed) return null;
      const event = indexed.result.events.filter(isMoonwellEvent).find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "moonwell-base", subject: shortSubject(wallet) });
    },
  });
}
