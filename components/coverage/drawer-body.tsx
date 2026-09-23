import type { ReactElement } from "react";

/**
 * The shared body of a /coverage explorer drawer — the same composition on the
 * desktop matrix panel row and the mobile card disclosure, so it exists once.
 *
 * Server-safe: no `"use client"`, no hooks, no state. The open/close machinery
 * lives in the hosts (the matrix's accordion, the card's InfoDisclosure); this
 * is pure presentation.
 *
 * Order is deliberate: the short "Protocol view" one-liner comes first — it
 * names the surface behind the tick the reader just saw — and the longer
 * "What the chain can't say" structural note closes. A row can carry either or
 * both; frankencoin has only the structural note, the 18 with a protocol view
 * have the one-liner and (where the protocol also sets a limit) the note too.
 */
export function CoverageDrawerBody({
  viewNote,
  coverageNote,
}: {
  viewNote?: string;
  coverageNote?: string;
}): ReactElement {
  return (
    <>
      {viewNote && (
        <>
          <p className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500 mb-1">Protocol view</p>
          <p className="body-text">{viewNote}</p>
        </>
      )}
      {coverageNote && (
        <>
          <p className={`text-xs font-medium tracking-[0.12em] uppercase text-rb-500 mb-1${viewNote ? " mt-3" : ""}`}>
            What the chain can&apos;t say
          </p>
          <p className="body-text">{coverageNote}</p>
        </>
      )}
    </>
  );
}
