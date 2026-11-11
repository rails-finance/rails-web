// Lido on Ethereum: the front door, a wallet field landing on that wallet's
// stake, and Lido's totals at the head (components/protocol/lido/lido-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { LidoFrontDoor } from "@/components/protocol/lido/lido-front-door";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { fetchLidoProtocol } from "@/lib/api/fetch-lido";

// focus: the explorer's front door, a wallet look-up and the protocol's totals; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Lido",
  canonicalPath: "/ethereum/lido",
});

export const dynamic = "force-dynamic";

export default async function Page() {
  const answer = await fetchLidoProtocol();
  return (
    <>
      <LidoFrontDoor r={answer.kind === "ok" ? answer.data : null} />
      <ProvInspectorLayer />
    </>
  );
}
