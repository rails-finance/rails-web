// About this explorer: the Alchemix listing's (i). The prose is shared by both
// chains (components/protocol/alchemix/alchemix-info); the anatomy lives in
// ProtocolInfoShell.

import { ProtocolInfoShell } from "@/components/shared/protocol-info-page";
import { AlchemixInfo } from "@/components/protocol/alchemix/alchemix-info";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("alchemix");

export default function InfoPage() {
  return (
    <ProtocolInfoShell session="alchemix">
      <AlchemixInfo deployment={ALCHEMIX_ETHEREUM} />
    </ProtocolInfoShell>
  );
}
