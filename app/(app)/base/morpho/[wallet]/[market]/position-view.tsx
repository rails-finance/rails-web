"use client";

// One Morpho Blue position on Base: the shared position page
// (components/protocol/morpho/morpho-market-position-page.tsx) with the Base
// deployment (lib/morpho-base/page-deployment.ts).

import {
  MorphoMarketPositionView,
  type MorphoMarketPositionViewProps,
} from "@/components/protocol/morpho/morpho-market-position-page";
import { MORPHO_BASE_PAGE } from "@/lib/morpho-base/page-deployment";

export default function MorphoBasePositionView(props: MorphoMarketPositionViewProps) {
  return <MorphoMarketPositionView deployment={MORPHO_BASE_PAGE} {...props} />;
}
