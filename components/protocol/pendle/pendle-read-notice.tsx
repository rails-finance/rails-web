"use client";

// The line a Pendle page draws when rails-server's Pendle route did not answer
// with figures: "not indexed yet" where the api has no Pendle routes or its
// router tables are still filling (lib/pendle/read-state.ts), else the index's
// own line.

import { IndexNotice } from "@/components/shared/index-notice";
import { pendleNotIndexed, type PendleFailure } from "@/lib/pendle/read-state";

export function PendleReadNotice({ failure }: { failure: PendleFailure }) {
  if (pendleNotIndexed(failure))
    return (
      <p className="text-sm text-rb-500" data-pendle-not-indexed={failure.code ?? failure.status}>
        Rails has not indexed Pendle&rsquo;s routers yet. This page fills in once it has.
      </p>
    );
  return <IndexNotice />;
}
