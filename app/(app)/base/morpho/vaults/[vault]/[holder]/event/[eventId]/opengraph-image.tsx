// This vault event's immutable share card, on Base: the stored tail and the
// census row, no chain read (components/vaults/metamorpho-share-images.tsx).

import { metaMorphoEventImage } from "@/components/vaults/metamorpho-share-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "One event from this address's history in a MetaMorpho vault on Base";

export default function Image(props: { params: Promise<{ vault: string; holder: string; eventId: string }> }) {
  return metaMorphoEventImage(8453, props);
}
