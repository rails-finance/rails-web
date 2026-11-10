// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Morpho Blue on base. The page is the shared Morpho info
// component (components/protocol/morpho/morpho-info.tsx).

import { MorphoInfoPage } from "@/components/protocol/morpho/morpho-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("morpho-base");

export default function InfoPage() {
  return <MorphoInfoPage deployment="base" />;
}
