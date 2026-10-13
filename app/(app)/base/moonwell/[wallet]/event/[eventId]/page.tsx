import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { moonwellEventHeading, moonwellEventPageDescription } from "@/lib/moonwell/explorer";
import { loadMoonwellBaseHead } from "@/lib/moonwell-base/position-page-data";
import { loadMoonwellEventsFromIndex } from "@/lib/sources/api/moonwell-base-timeline";
import {
  MOONWELL_BASE_DEPLOYMENT,
  MOONWELL_BASE_DEPLOY_BLOCK,
  MOONWELL_BASE_WETH_ROUTER,
} from "@/lib/moonwell-base/asset-catalog";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import MoonwellBasePositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request, same as the parent.
export const dynamic = "force-dynamic";

/** `loadMoonwellBaseHead` carries the Comptroller read only — never events,
 *  since this family's history is a live sweep on the client until the index
 *  can vouch for a whole life (see position-page-data.ts's own header). So
 *  this lookup is its own: it re-reads the coverage the head already
 *  carries and, only when the index can stand behind the whole history, asks
 *  it for this event — the same gate the family's own view applies before it
 *  trusts the index over a sweep. A malformed roster or an unreachable index
 *  falls back to "not found" rather than failing metadata generation. */
async function findMoonwellEvent(wallet: string, decodedId: string) {
  const { coverage } = await loadMoonwellBaseHead(wallet);
  if (!coverage?.historyComplete) return null;
  try {
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
    return indexed.result.events.filter(isMoonwellEvent).find((e) => e.id === decodedId) ?? null;
  } catch (err) {
    console.error("moonwell-base event page: index read failed", err);
    return null;
  }
}

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const event = await findMoonwellEvent(wallet, decoded);
  return eventMetadata({
    session: "moonwell-base",
    subject: wallet,
    canonicalPath: `/base/moonwell/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: moonwellEventHeading(event), timestamp: event.timestamp } : null,
    description: event ? moonwellEventPageDescription("base", wallet, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`MoonwellBaseView`) reads `eventId`
// from the route and draws the sub-nav and the event's card in page mode with
// the shared column (`ChainTruthTimeline`'s `eventPage`). The card reads the
// account's history, so the read is the parent's.
export default async function MoonwellBaseEventPage({ params }: Props) {
  return MoonwellBasePositionPage({ params });
}
