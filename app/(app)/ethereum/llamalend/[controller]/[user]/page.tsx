import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";
import { loadLlamalendPositionTail } from "@/lib/llamalend/position-page-data";
import LlamalendPositionView from "./position-view";

interface Props {
  params: Promise<{ controller: string; user: string }>;
}

// The position's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged — titled on the
// user (an address, so the helper truncates it); the controller is not named,
// there being no static controller → symbol map on the metadata path.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { controller, user } = await params;
  // This route carries its own opengraph-image.tsx, rendering this account's
  // live card — the static per-explorer PNG stays only its fallback.
  return positionMetadata({
    session: "llamalend",
    subject: user,
    canonicalPath: `/ethereum/llamalend/${controller}/${user}`,
    image: "dynamic",
  });
}

export default async function LlamalendPositionPage({ params }: Props) {
  const { controller: rawController, user: rawUser } = await params;
  // The position grain is the (controller, user) pair — each controller is an
  // isolated market. A pair the market has never seen is a legitimate empty
  // answer for this page to render; a segment that is not an address is not.
  const controller = normalizeAddressParam(rawController ?? "");
  const user = normalizeAddressParam(rawUser ?? "");
  if (!controller || !user) notFound();

  const tail = await loadLlamalendPositionTail(controller, user);

  return (
    <LlamalendPositionView
      // Keyed on the pair so a client-side navigation to another position
      // remounts with that position's server tail as its initial state.
      key={`${controller}:${user}`}
      controller={controller}
      user={user}
      initialPosition={tail.position}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
