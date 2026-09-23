// The one seam every event route's `opengraph-image.tsx` calls through —
// sibling to `lib/share/position-image.ts`. Same never-500 posture: any
// failure mode (a bad id, a backend blip, a render error, an event the
// family's served window doesn't reach) degrades to the explorer's existing
// static roster card rather than throwing through the route.
//
// The ONE difference of substance from the position seam: an event is
// IMMUTABLE. A position's numbers move on every visit, so `positionImage`
// caches its result for five minutes at the edge; a decoded on-chain event
// never changes, so a FOUND event's image is cached for a year, `immutable` —
// once a scraper (or a CDN) has it, it never needs to ask again. The
// not-found/fallback path keeps the SHORT cache: a scraper that arrives
// before the family's index has caught up to this event must not be stuck
// behind a year-long "never seen" answer once the index does.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { protocolShareImage, HOME_SHARE_IMAGE } from "@/lib/shared/page-metadata";
import { protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { renderEventCard, type EventCardModel } from "@/lib/share/event-card";

const FOUND_CACHE_CONTROL = "public, max-age=31536000, immutable";
// Mirrors `positionImage`'s fallback cache exactly — see that file for why
// the fallback PNG itself must not be cached long either.
const FALLBACK_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

const PUBLIC_DIR = path.join(process.cwd(), "public");

async function staticFallback(session: SessionProtocol): Promise<Response> {
  const entry = protocolForSession(session);
  const rel = (entry ? protocolShareImage(entry.id) : HOME_SHARE_IMAGE).replace(/^\//, "");
  const bytes = await readFile(path.join(PUBLIC_DIR, rel));
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": FALLBACK_CACHE_CONTROL },
  });
}

/**
 * `load` is a family's own bridge from its page loader's tail to the event
 * card model (decode the id, find the event in the served window, map it with
 * `lib/share/event-model.ts`'s `eventCardModel`) — this function's job starts
 * and ends at making sure nothing that bridge does can surface as a broken
 * image, and at drawing the line between "found, so cache forever" and
 * "not found (yet, or ever), so cache briefly" in exactly one place.
 */
export async function eventImage(opts: {
  session: SessionProtocol;
  load: () => Promise<EventCardModel | null>;
}): Promise<Response> {
  try {
    const model = await opts.load();
    if (!model) return staticFallback(opts.session);
    const image = await renderEventCard(model);
    image.headers.set("Cache-Control", FOUND_CACHE_CONTROL);
    return image;
  } catch (err) {
    console.error(`share-image: failed to render the ${opts.session} event card; serving the static roster card`, err);
    return staticFallback(opts.session);
  }
}
