// This V2 position's share card, from the same server read the page awaits.

import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { alchemixV2PositionImage, type AlchemixV2PositionParams } from "@/lib/alchemix/v2-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This Alchemix V2 position's card, closed on 2 April 2026";

export default async function Image({ params }: { params: Promise<AlchemixV2PositionParams> }) {
  return alchemixV2PositionImage(ALCHEMIX_ETHEREUM, await params);
}
