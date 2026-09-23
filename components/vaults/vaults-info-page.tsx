// VaultsInfoPage — the one shell for a vault layer's `…/vaults/info`: its
// explorer's rail with the VAULTS tab lit, then the prose that used to live
// behind the listing's "How this listing is built" drawer, then the standing
// door to /coverage. The vault layer's twin of
// components/shared/protocol-info-page.tsx, which does the same job for an
// explorer as a whole.
//
// Every vault layer lives under a protocol now (rails-ops decision 0028), so
// the rail is always that explorer's; `chainId` remains because the coverage
// link is per chain and a layer's chain is not always its explorer's to assume.
//
// WHY THE PROSE MOVED. A drawer's statements were true of the listing whether
// or not anyone opened it, so the panel was always mounted and merely hidden —
// which is a page pretending to be a control. It is a page now: the same words,
// at a path a reader can link to, with the listing face left carrying only the
// figures it read.
//
// NO RECENCY STAMP: this page reads no chain state. The paragraphs come as
// `children` from each chain's own info/page.tsx, which fetches the census
// header they state, so each chain's words live beside its route while the
// anatomy lives here, once.

import Link from "next/link";
import type { ReactNode } from "react";
import { RailHeader } from "@/components/shared/rail-header";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import type { ProtocolEntry } from "@/lib/shared/protocols";

export function VaultsInfoPage({
  chainId,
  protocol,
  children,
}: {
  chainId: ChainId;
  /** The explorer this vault layer belongs to — its rail, and its VAULTS tab. */
  protocol: ProtocolEntry;
  children: ReactNode;
}) {
  return (
    <div className="py-8">
      <div className="mb-6">
        <RailHeader session={protocol.session} venue="subPage" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground">About this vault layer</h1>
      {/* `data-intro-drawer` on the body, not on a panel: the paragraphs kept
          their own `data-intro-*` markers when they moved here, and the readers
          that hold each claim to the chain read them inside this wrapper. A div
          rather than a <p> — the body is multi-paragraph and carries its own. */}
      <div className="mt-3 max-w-3xl space-y-2 text-sm text-rb-500" data-intro-drawer>
        {children}
      </div>
      {/* The door to the chain's coverage page, the one every explorer's info
          page keeps. A vault is never a row in the matrix (rails-ops decision
          0014); the protocol its factory deployed it under is. */}
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
