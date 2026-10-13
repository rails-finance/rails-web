import type { Metadata } from "next";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { alchemixV2EventMetadata, type AlchemixV2EventParams } from "@/lib/alchemix/v2-route";
import EthereumAlchemixV2PositionPage from "../../page";

interface Props {
  params: Promise<AlchemixV2EventParams>;
}

// Restated (Next reads segment options from this file alone): the route renders
// per request, as the parent does.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// This segment names the event, which the parent's metadata does not know.
// The read is the parent's `cache()`-wrapped one, so it costs no second
// backend request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return alchemixV2EventMetadata(ALCHEMIX_ETHEREUM, await params);
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page with
// the same params. Its client half reads `eventId` from the route and draws
// the sub-nav and the event's card in page mode with the shared column
// (`ChainTruthTimeline`'s `eventPage`).
export default async function EthereumAlchemixV2EventPage({ params }: Props) {
  return EthereumAlchemixV2PositionPage({ params });
}
