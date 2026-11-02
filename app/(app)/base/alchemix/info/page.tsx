// About this explorer: the Alchemix listing's (i). The prose is shared by both
// chains (components/protocol/alchemix/alchemix-info); the anatomy lives in
// ProtocolInfoShell.

import { ProtocolInfoShell } from "@/components/shared/protocol-info-page";
import { AlchemixInfo } from "@/components/protocol/alchemix/alchemix-info";
import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("alchemix-base");

export default function InfoPage() {
  return (
    <ProtocolInfoShell session="alchemix-base">
      <AlchemixInfo deployment={ALCHEMIX_BASE} />
    </ProtocolInfoShell>
  );
}
