// ONE EVENT — /ethereum/morpho/vaults/<vault>/<holder>/event/<id>.
// ----------------------------------------------------------------------------
// A thin re-render of the position page one segment up, in which
// `ChainTruthTimeline` finds `eventId` on the route params and draws ONE card
// with its detail open, plus "View in timeline →" back to
// `<position>?at=<id>`. See the Ethereum Aave twin of this file
// (app/(app)/ethereum/aave/vaults/…/event/[eventId]/page.tsx) for the full
// statement of the shape.
//
// THE ID IS A CHAIN COORDINATE — `txHash:logIndex`, percent-encoded into one
// opaque segment.
//
// ⚠️ THE WEI-EXACT GATE IS NOT BYPASSED. This page draws no timeline of its
// own: the position page states the gate first and renders the shell only
// where the replayed balance equalled `balanceOf` at the page's block, so a
// gate that failed draws no card here either.
//
// ⚠️ AND THE DRAW WINDOW STILL BINDS: an event older than the newest
// `VAULT_TIMELINE_DRAW_ROWS` of a long life is not among the served events,
// and pinned mode states that rather than drawing a card it did not read.

import { metaMorphoEventMetadata, type MetaMorphoEventParams } from "@/components/vaults/metamorpho-event-metadata";
import EthereumMorphoVaultPositionPage from "../../page";

// Restated rather than re-exported (Next reads this segment option by static
// analysis of THIS file): the route renders per request, same as the parent.
export const dynamic = "force-dynamic";

export function generateMetadata(props: MetaMorphoEventParams) {
  return metaMorphoEventMetadata(1, props);
}

// THIN: the same parent page, the same params — see the Ethereum Aave twin's
// own note on why passing the promise straight through stays valid.
export default async function EthereumMorphoVaultEventPage({ params }: MetaMorphoEventParams) {
  return EthereumMorphoVaultPositionPage({ params });
}
