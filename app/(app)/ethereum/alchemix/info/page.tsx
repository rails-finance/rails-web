// About this explorer, drawn on the typed template (rails-ops
// standards/info-page-template.md). The content is shared by both chains
// (components/protocol/alchemix/alchemix-info).

import { AlchemixInfoPage } from "@/components/protocol/alchemix/alchemix-info";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("alchemix");

export default function InfoPage() {
  return <AlchemixInfoPage deployment={ALCHEMIX_ETHEREUM} />;
}
