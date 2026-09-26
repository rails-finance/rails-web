// The 404 body for a line-and-id that names no position on this chain.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function AlchemixPositionNotFound() {
  return (
    <RouteNotFound
      session="alchemix-base"
      heading="No position under this line and id"
      backHref="/base/alchemix"
      backLabel="Browse Alchemix positions on Base"
    >
      An Alchemix position is keyed by both. The line names which synthetic on which chain holds it — the alUSDb line here —
      and an id that exists on one line is a different position on another.
    </RouteNotFound>
  );
}
