// ProtocolInfoPage — the one shell for every explorer's /info page: the rail
// header with the (i) lit, then the intro prose that used to live behind the
// listing's (i) drawer (the intro slot grammar, charter §8a — the copy moved
// here, reframed for a standalone page), then the standing door to /coverage.
// No recency stamp — this page reads no chain state.
//
// The blurb arrives as `children` from the explorer's own info/page.tsx, so
// each protocol's prose lives beside its route while the anatomy lives here,
// once.

import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { RailHeader } from "@/components/shared/rail-header";
import { protocolForSession } from "@/lib/shared/protocols";
import { CHAINS, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export function ProtocolInfoPage({ session, children }: { session: SessionProtocol; children: ReactNode }) {
  // Coverage is per-chain routes; the door leads to the matrix that actually
  // contains this explorer's row.
  const chainId = protocolForSession(session)?.chainId ?? MAINNET_CHAIN_ID;
  return (
    <div className="py-8">
      <div className="mb-6">
        <RailHeader session={session} venue="info" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground">About this explorer</h1>
      {/* A div, not a <p>: the blurbs are multi-paragraph and carry their own
          <p> elements. max-w-3xl matches the sub-page intro measure. */}
      <div className="mt-3 max-w-3xl space-y-2 text-sm text-rb-500">{children}</div>
      {/* The door to the chain's coverage page — every protocol keeps it,
          ungated. The structural coverage note itself renders only there (its
          audit reader wants that register); the intro above carries any
          reader-facing consequence in plain words instead. */}
      <p className="mt-4 text-sm text-rb-500">
        <Link
          href={`/coverage/${CHAINS[chainId].slug}`}
          className="whitespace-nowrap font-medium text-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-blue-500"
        >
          What Rails covers
        </Link>
      </p>
    </div>
  );
}
