// The one seam every position route's `opengraph-image.tsx` calls through.
// ----------------------------------------------------------------------------
// SERVER-ONLY. An unfurl must never 500 — a scraper that gets a failing image
// route tends to blank the whole card, not just fall back to no image — so
// every failure mode here (a bad id, a backend blip, a render error) degrades
// to the explorer's existing static roster card
// (`public/og/explore-<id>.png`, via `protocolShareImage`) rather than
// throwing through the route.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { protocolShareImage, HOME_SHARE_IMAGE } from "@/lib/shared/page-metadata";
import { protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { renderPositionCard, type PositionCardModel } from "@/lib/share/position-card";

// `ImageResponse` defaults to a Cache-Control tuned for a static asset
// (`public, immutable, no-transform, max-age=31536000` — see
// node_modules/next/dist/compiled/@vercel/og). A live position's numbers move
// on every visit, so that default would let a CDN or a scraper serve a
// year-old balance. This is short-lived at the edge (5 minutes) with a decent
// stale-while-revalidate window, and applies to the fallback PNG too — a
// wallet that later gets a real position must not stay stuck behind a cached
// "never seen" card for a year either.
const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

const PUBLIC_DIR = path.join(process.cwd(), "public");

async function staticFallback(session: SessionProtocol | undefined): Promise<Response> {
  const entry = session ? protocolForSession(session) : undefined;
  const rel = (entry ? protocolShareImage(entry.id) : HOME_SHARE_IMAGE).replace(/^\//, "");
  const bytes = await readFile(path.join(PUBLIC_DIR, rel));
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE_CONTROL },
  });
}

/**
 * `load` is a family's own bridge from its page loader's result to the card
 * model (see `lib/liquity/share-card.ts` and its siblings) — this function's
 * job starts and ends at making sure nothing that bridge does can surface as
 * a broken image: a throw anywhere in the read or the render, or a `load()`
 * that resolves `null` (the id/wallet is well-formed but the protocol has
 * never recorded a position for it), both degrade to the same static card.
 */
export async function positionImage(opts: {
  /** The explorer whose STATIC roster card is the fallback. Omitted where a
   *  surface has none to fall back to; `staticFallback` then answers the home
   *  card, as it does for an unresolved entry. */
  session?: SessionProtocol;
  load: () => Promise<PositionCardModel | null>;
}): Promise<Response> {
  try {
    const model = await opts.load();
    if (!model) return staticFallback(opts.session);
    const image = await renderPositionCard(model);
    // Set on the same Response `ImageResponse` already is, rather than
    // wrapping it in a new one — a fresh `Response` over its body would need
    // the body re-read, and a `ReadableStream` body can only be read once.
    image.headers.set("Cache-Control", CACHE_CONTROL);
    return image;
  } catch (err) {
    console.error(
      `share-image: failed to render the ${opts.session ?? "section"} position card; serving the static fallback card`,
      err,
    );
    return staticFallback(opts.session);
  }
}
