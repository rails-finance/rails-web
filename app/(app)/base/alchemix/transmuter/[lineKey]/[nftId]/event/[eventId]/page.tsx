import type { Metadata } from "next";
import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { transmuterEventMetadata, type TransmuterEventParams } from "@/lib/alchemix/transmuter-route";
import BaseTransmuterPositionPage from "../../page";

interface Props {
  params: Promise<TransmuterEventParams>;
}

// Restated (Next reads segment options from this file alone): the route renders
// per request, as the parent does.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// This segment names the event, which the parent's metadata does not know.
// The read is the parent's `cache()`-wrapped one, so it costs no second
// backend request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return transmuterEventMetadata(ALCHEMIX_BASE, await params);
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page with
// the same params. Its client half reads `eventId` from the route and draws
// the sub-nav and the event's card in page mode with the shared column
// (`ChainTruthTimeline`'s `eventPage`).
export default async function BaseTransmuterEventPage({ params }: Props) {
  return BaseTransmuterPositionPage({ params });
}
