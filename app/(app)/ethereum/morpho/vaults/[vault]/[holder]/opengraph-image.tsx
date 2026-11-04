// One vault position's share card on Ethereum — the census row, and nothing else
// (components/vaults/metamorpho-share-images.tsx).

import { metaMorphoHoldingImage } from "@/components/vaults/metamorpho-share-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This address's position in a MetaMorpho vault on Ethereum";

export default function Image(props: { params: Promise<{ vault: string; holder: string }> }) {
  return metaMorphoHoldingImage(1, props);
}
