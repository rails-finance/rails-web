// About this explorer — Morpho Blue on arbitrum. The page is the shared Morpho info
// component (components/protocol/morpho/morpho-info.tsx).

import { MorphoInfoPage } from "@/components/protocol/morpho/morpho-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("morpho-arbitrum");

export default function InfoPage() {
  return <MorphoInfoPage deployment="arbitrum" />;
}
