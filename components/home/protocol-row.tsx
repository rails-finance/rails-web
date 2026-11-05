"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { protocolIconSrc } from "@/lib/shared/protocols";
import { chainExplorers } from "@/lib/shared/explorer-rank";
import { CHAINS, MAINNET_CHAIN_ID, BASE_CHAIN_ID, SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { ProtocolGlyph, hasProtocolGlyph } from "@/components/icons/protocol-glyphs";
import { ChainToggleButtons } from "@/components/shared/chain-toggle";
import { HomeOnlyChainGlyph } from "@/components/icons/chain-glyphs";
import { ROBINHOOD_LABEL, RobinhoodSoon } from "@/components/shared/robinhood-soon";
import { PILL_CTA } from "@/lib/shared/ui-grammar";

/** Tile width classes chosen per list size so every breakpoint fills its
 *  rows evenly: a chain's eight most used divide by 2/4/8, a list of 6 by 2/3/6. A new
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

/** Stored value for the home-only Robinhood choice. It has no ChainId and
 *  no explorers; selecting it swaps the tiles for a coming-soon message. */
const ROBINHOOD_STORED = "robinhood";

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
 * entry without a glyph yet) is the exception, not the rule. The tiles are a
 * chain's most used explorers, the drawer's chooser's selection
 * (chainExplorers), with "View all" opening the rest in place. Counted widths
 * over auto-fill (tileWidthClassesFor), so full rows pack the same as a fixed
 * grid, and a list that doesn't divide evenly centers its last row instead
 * of stranding a tile at the left edge. Quiet at rest — a faint
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
  const [robinhood, setRobinhood] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === ROBINHOOD_STORED) {
        setRobinhood(true);
        return;
      }
      const stored = Number(raw);
      if (isChainId(stored)) setChainId(stored);
    } catch {
      // Storage unavailable — stay on the Ethereum default.
    }
  }, []);

  function store(value: string) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage full or unavailable — the choice just won't survive a reload.
    }
  }

  function handleChange(id: ChainId) {
    setRobinhood(false);
    setShowAll(false);
    setChainId(id);
    store(String(id));
  }

  function handleRobinhood() {
    setRobinhood(true);
    store(ROBINHOOD_STORED);
  }

  // The chain's most used explorers and "View all", as the drawer's chooser
  // lists them (lib/shared/explorer-rank.ts); "View all" opens the rest in
  // place.
  const { featured, all } = chainExplorers(chainId);
  const protocols = showAll ? all : featured;

  return (
    <div className="w-full max-w-7xl mx-auto px-4">
      <div className="mb-6 flex justify-center">
        <ChainToggleButtons
          chainId={chainId}
          onChange={handleChange}
          extra={{
            label: ROBINHOOD_LABEL,
            active: robinhood,
            onSelect: handleRobinhood,
            glyph: <HomeOnlyChainGlyph id="robinhood" className="h-3.5 w-3.5 shrink-0 max-[380px]:hidden" />,
          }}
        />
      </div>

      {robinhood ? (
        // Stands where the tiles stand: about a tile row (py-3 + 2rem mark)
        // plus the coverage button's row, so the page holds still on a switch.
        <p
          data-testid="home-robinhood-soon"
          className="body-text mx-auto flex min-h-[8.5rem] max-w-xl items-center justify-center text-center"
        >
          <RobinhoodSoon />
        </p>
      ) : (
        <>
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
                  <img
                    src={protocolIconSrc(p.id)}
                    alt=""
                    className="h-8 w-8 shrink-0"
                    style={{ borderRadius: "20%" }}
                  />
                )}
                <span className="text-sm font-semibold whitespace-nowrap">{p.label}</span>
              </Link>
            ))}
          </div>
          {all.length > featured.length && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="cursor-pointer rounded-sm px-2 py-1 text-sm text-blue-600 transition-colors hover:text-blue-600 focus-ring dark:text-blue-400 dark:hover:text-blue-400"
                data-home-view-all=""
              >
                {showAll ? "Show the most used" : `View all ${all.length} explorers`}
              </button>
            </div>
          )}

          {/* Coverage matrix — per-explorer depth for the chain the toggle is
          showing (the coverage pages are per-chain routes); the shared CTA
          pill (PILL_CTA), same as the frame's "View a live position" button.
          Free-standing, so it answers hover with the blue border itself. */}
          <div className="mt-6 flex justify-center">
            <Link
              href={`/coverage/${CHAINS[chainId].slug}`}
              className={`${PILL_CTA} transition-colors hover:border-blue-500 dark:hover:border-blue-500`}
            >
              See detailed coverage <span>→</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
