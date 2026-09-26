// This Transmuter position's share card, from the same server read the page
// awaits. No new read path.

import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { transmuterPositionImage, type TransmuterPositionParams } from "@/lib/alchemix/transmuter-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This Alchemix Transmuter position's current card";

export default async function Image({ params }: { params: Promise<TransmuterPositionParams> }) {
  return transmuterPositionImage(ALCHEMIX_BASE, await params);
}
