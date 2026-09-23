"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { protocolIconSrc, protocolsForChain, type ProtocolEntry } from "@/lib/shared/protocols";
import { CHAINS, MAINNET_CHAIN_ID, BASE_CHAIN_ID, SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { ProtocolGlyph, hasProtocolGlyph } from "@/components/icons/protocol-glyphs";
import { ChainToggleButtons } from "@/components/shared/chain-toggle";
import { PILL_CTA } from "@/lib/shared/ui-grammar";

/** Explorers surfaced on the home page — a chain's roster minus a small omit
 *  list (PWN and the Liquity V2 forks) so the count divides evenly into the
 *  column sets below and no breakpoint strands an orphan tile. The omitted
 *  explorers stay reachable via the chain switcher and the coverage pages.
 *
 *  Ids, not slugs — a slug is only unique within its chain. Applied to every
 *  chain's roster alike. */
const HOME_OMIT = new Set(["pwn", "ebisu", "asymmetry"]);

function homeProtocolsForChain(chainId: ChainId): ProtocolEntry[] {
  return protocolsForChain(chainId).filter((p) => !HOME_OMIT.has(p.id));
}

/** Tile width classes chosen per roster size so every breakpoint fills its
 *  rows evenly: Ethereum's 16 tiles divide by 2/4/8, Base's 6 by 2/3/6. A new
 *  roster size that divides by neither set just means picking (or extending)
 *  a set — the map makes the neat-rows contract visible where the count
 *  changes. Paired with a flex-wrap + justify-center container (not grid) so
 *  a roster that doesn't divide evenly — Sepolia's single Polaris tile — still
 *  centers on its own row instead of sticking to the left edge. Widths are
 *  the row's column count minus its gaps (gap-2 = 0.5rem, (N-1) gaps per row). */
function tileWidthClassesFor(count: number): string {
  return count % 8 === 0 || count % 4 === 0
    ? "w-[calc((100%-0.5rem)/2)] sm:w-[calc((100%-1.5rem)/4)] xl:w-[calc((100%-3.5rem)/8)]"
    : "w-[calc((100%-0.5rem)/2)] sm:w-[calc((100%-1rem)/3)] xl:w-[calc((100%-2.5rem)/6)]";
}

const STORAGE_KEY = "home-chain-toggle";

// Ethereum is the default — both the server render and the client's first
// render show it, so there is nothing for hydration to disagree about; a
// stored Base choice is adopted only from the effect below, after the DOM the
// server sent is already committed. The segmented control itself is the
// shared ChainToggleButtons (components/shared/chain-toggle.tsx) — the same
// pill the coverage pages render in link form.

function isChainId(value: unknown): value is ChainId {
  return value === MAINNET_CHAIN_ID || value === BASE_CHAIN_ID || value === SEPOLIA_CHAIN_ID;
}

/**
 * Protocol row — the home explorer directory as a grid of wide tiles, mark
 * beside name, monochrome glyphs so a colour PNG (the fallback for a roster
 * entry without a glyph yet) is the exception, not the rule. Counted widths
 * over auto-fill: the roster is trimmed to counts that divide evenly (see
 * HOME_OMIT / tileWidthClassesFor), so full rows pack the same as a fixed
 * grid, and the one roster that doesn't divide evenly (Sepolia) centers on
 * its own row instead of stranding an orphan tile at the left edge. Quiet at rest — a faint
 * border plus a low-alpha black wash (a touch darker than whichever ground
 * it sits on, so it composites the same over the gradient floor's light and
 * dark ends), blue on hover per the one-meaning-per-colour nav rule. Above
 * the grid, a chain toggle stands in for what used to be a second directory
 * band underneath (OtherChains): one grid, one roster at a time.
 */
export function ProtocolRow() {
  // Ethereum on the server and the first client render — see TOGGLE_CHAINS —
  // then adopted from storage in the effect below. Wrapped in try/catch: a
  // private window, cleared site data, or a browser that blocks storage
  // access must fall back to the Ethereum default, not throw.
  const [chainId, setChainId] = useState<ChainId>(MAINNET_CHAIN_ID);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      if (isChainId(stored)) setChainId(stored);
    } catch {
      // Storage unavailable — stay on the Ethereum default.
    }
  }, []);

  function handleChange(id: ChainId) {
    setChainId(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // Storage full or unavailable — the choice just won't survive a reload.
    }
  }

  const protocols = homeProtocolsForChain(chainId);

  return (
    <div className="w-full max-w-7xl mx-auto px-4">
      <div className="mb-6 flex justify-center">
        <ChainToggleButtons chainId={chainId} onChange={handleChange} />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {protocols.map((p) => (
          <Link
            key={p.id}
            href={p.href}
            className={`flex items-center justify-center gap-2.5 rounded-2xl border border-rb-200 bg-black/[0.04] px-2 py-3 transition-colors hover:border-blue-500 dark:border-rb-800 dark:bg-black/25 ${tileWidthClassesFor(protocols.length)}`}
          >
            {hasProtocolGlyph(p.id) ? (
              <ProtocolGlyph id={p.id} className="h-8 w-8 shrink-0" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={protocolIconSrc(p.id)} alt="" className="h-8 w-8 shrink-0" style={{ borderRadius: "20%" }} />
            )}
            <span className="text-sm font-semibold whitespace-nowrap">{p.label}</span>
          </Link>
        ))}
      </div>

      {/* Coverage matrix — per-explorer depth for the chain the toggle is
          showing (the coverage pages are per-chain routes); the shared CTA
          pill (PILL_CTA), same as the frame's "View live position" button.
          Free-standing, so it answers hover with the blue border itself. */}
      <div className="mt-6 flex justify-center">
        <Link
          href={`/coverage/${CHAINS[chainId].slug}`}
          className={`${PILL_CTA} transition-colors hover:border-blue-500 dark:hover:border-blue-500`}
        >
          {/* Ethereum's grid is trimmed (HOME_OMIT), so its button also
              promises the protocols the grid left out; Base shows its whole
              roster, so there is nothing "more" to claim. */}
          {chainId === MAINNET_CHAIN_ID ? "More protocols and detailed coverage" : "See detailed coverage"}{" "}
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
