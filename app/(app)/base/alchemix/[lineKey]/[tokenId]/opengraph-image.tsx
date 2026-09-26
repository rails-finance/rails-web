// This position's share card — a second consumer of the same server read the
// page itself awaits. No new read path.

import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { alchemixPositionImage, type AlchemixPositionParams } from "@/lib/alchemix/position-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This Alchemix position's current card";

export default async function Image({ params }: { params: Promise<AlchemixPositionParams> }) {
  return alchemixPositionImage(ALCHEMIX_BASE, await params);
}
