// This event's share card, from the read the position page makes (cached per
// request).

import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { transmuterEventImage, type TransmuterEventParams } from "@/lib/alchemix/transmuter-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's Alchemix Transmuter share card";

export default async function Image({ params }: { params: Promise<TransmuterEventParams> }) {
  return transmuterEventImage(ALCHEMIX_ETHEREUM, await params);
}
