// This event's share card, from the read the position page makes (cached per
// request).

import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { alchemixV2EventImage, type AlchemixV2EventParams } from "@/lib/alchemix/v2-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's Alchemix V2 share card";

export default async function Image({ params }: { params: Promise<AlchemixV2EventParams> }) {
  return alchemixV2EventImage(ALCHEMIX_ETHEREUM, await params);
}
