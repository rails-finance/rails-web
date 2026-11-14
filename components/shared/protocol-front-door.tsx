"use client";

// The front door of a position-first explorer (rails-ops
// TO-DO-arbitrum-scoping.md item 18): the protocol's mark and name, the shared
// search (H15) opening a wallet's position in this family, and three pill
// links under it — the market overview, the positions Rails has read, and the
// info page. Centred in the viewport
// like a search engine's front page; the price strip and the prov inspector
// sit where every explorer page has them.

import { useEffect } from "react";
import Link from "next/link";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { protocolForSession } from "@/lib/shared/protocols";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { NAV_PILL } from "@/lib/shared/ui-grammar";
import { ChainLabel } from "@/components/shared/rail-header";

export function ProtocolFrontDoor({ session }: { session: SessionProtocol }) {
  const entry = protocolForSession(session);
  // `?find=1` (the guided way in, ui-jobs 478) lands with the cursor in the search.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("find") !== "1") return;
    document.querySelector<HTMLInputElement>("[data-front-door] input")?.focus();
  }, []);
  if (!entry) return null;
  const markets = entry.subPages.find((s) => s.segment === "markets");
  const links = [
    markets && { href: markets.href, label: "Markets" },
    // The listing on a chain without an index holds only the wallets Rails
    // has read (Arbitrum item 31).
    { href: entry.listingHref, label: "Positions Rails has read" },
    { href: entry.infoHref, label: `About ${entry.label} on Rails` },
  ].filter((l): l is { href: string; label: string } => !!l);

  return (
    <>
      <div
        className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12"
        data-anatomy="N5"
        data-front-door={entry.id}
      >
        <h1 className="mb-3 flex items-center gap-3">
          <ProtocolIcon id={entry.id} className="h-11 w-11 shrink-0 text-foreground" />
          <span className="text-3xl font-semibold leading-none text-foreground">{entry.label}</span>
        </h1>
        {/* The chain, named under the name: the chooser that named it moved
            to the brand rail (ui-jobs 497). */}
        <ChainLabel chainId={entry.chainId} className="mb-8" named />
        <div className="w-full max-w-xl">
          <FrontDoorSearch href={(wallet) => `${entry.href}/${wallet}`} />
        </div>
        <nav aria-label="Explorer sections" className="mt-6 flex flex-wrap justify-center gap-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={NAV_PILL}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <ProvInspectorLayer />
    </>
  );
}
