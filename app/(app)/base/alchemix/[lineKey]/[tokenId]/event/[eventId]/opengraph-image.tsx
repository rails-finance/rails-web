// This event's share card, from the tail the position page reads
// (`loadAlchemistPositionTail`, cached per request). An event older than the
// served window falls back to the static roster card.

import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { alchemixEventImage, type AlchemixEventParams } from "@/lib/alchemix/position-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's Alchemix share card";

export default async function Image({ params }: { params: Promise<AlchemixEventParams> }) {
  return alchemixEventImage(ALCHEMIX_BASE, await params);
}
