// About this explorer — Compound V3 on Arbitrum. The page is the shared Compound V3 info
// component (components/protocol/compound-v3/compound-v3-info.tsx).

import { CompoundV3InfoPage } from "@/components/protocol/compound-v3/compound-v3-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("compound-v3-arbitrum");

export default function InfoPage() {
  return <CompoundV3InfoPage deployment="arbitrum" />;
}
