"use client";

// The line a Pendle page draws when rails-server's Pendle route did not answer.

import { IndexNotice } from "@/components/shared/index-notice";
import type { PendleReadFailure } from "@/lib/sources/api/pendle";

export function PendleReadNotice({ failure }: { failure: PendleReadFailure }) {
  if (failure.code === "router_events_unavailable")
    return (
      <p className="text-sm text-rb-500" data-pendle-read-failed={failure.code}>
        The Pendle router record is not on the index yet: its tables are being filled. Every Pendle page reads from it,
        so this one will fill in once they are.
      </p>
    );
  return <IndexNotice />;
}
