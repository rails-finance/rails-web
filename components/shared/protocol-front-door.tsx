"use client";

// The front door of a position-first explorer (rails-ops
// TO-DO-arbitrum-scoping.md item 18): the protocol's mark and name, one field
// that opens a wallet, and three pill links under it — the market overview,
// the positions Rails has read, and the info page. Centred in the viewport
// like a search engine's front page; the price strip and the prov inspector
// sit where every explorer page has them.

import Link from "next/link";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { protocolForSession } from "@/lib/shared/protocols";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { WalletLookup } from "@/components/shared/wallet-lookup";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { NAV_PILL } from "@/lib/shared/ui-grammar";

export function ProtocolFrontDoor({ session }: { session: SessionProtocol }) {
  const entry = protocolForSession(session);
  if (!entry) return null;
  const markets = entry.subPages.find((s) => s.segment === "markets");
  const links = [
    markets && { href: markets.href, label: "Markets" },
    { href: entry.listingHref, label: "Positions" },
    { href: entry.infoHref, label: `About ${entry.label} on Rails` },
  ].filter((l): l is { href: string; label: string } => !!l);

  return (
    <>
      <div
        className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12"
        data-anatomy="N5"
        data-front-door={entry.id}
      >
        <h1 className="mb-8 flex items-center gap-3">
          <ProtocolIcon id={entry.id} className="h-11 w-11 shrink-0 text-foreground" />
          <span className="text-3xl font-semibold leading-none text-foreground">{entry.label}</span>
        </h1>
        <div className="w-full max-w-xl">
          <WalletLookup placeholder="Wallet address or ENS name" positionHref={(wallet) => `${entry.href}/${wallet}`} />
        </div>
        <nav aria-label="Explorer sections" className="mt-6 flex flex-wrap justify-center gap-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={NAV_PILL}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
