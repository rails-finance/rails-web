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
import { ScopeNote } from "@/components/shared/asset-scope-note";
import { launchedChains } from "@/lib/shared/protocols";
import { useScopedRoster } from "@/lib/shared/explorer-scope";
import { ReadTierTag } from "@/components/shared/read-tier-tag";

/** Tile width classes chosen per list size so every breakpoint fills its
 *  rows evenly: a chain's eight most used divide by 2/4/8, a list of 6 by 2/3/6. A new
 *  roster size that divides by neither set just means picking (or extending)
 *  a set — the map makes the neat-rows contract visible where the count
 *  changes. Paired with a flex-wrap + justify-center container (not grid) so
 *  a roster that doesn't divide evenly — Sepolia's single Polaris tile — still
 *  centers on its own row instead of sticking to the left edge. Widths are
 *  the row's column count minus its gaps (gap-2 = 0.5rem, (N-1) gaps per row). */
// Two across on a phone, three from sm, six from xl: room for the longest
// names (Miles, 6 Nov 2026).
const TILE_WIDTH = "w-[calc((100%-0.5rem)/2)] sm:w-[calc((100%-1rem)/3)] xl:w-[calc((100%-2.5rem)/6)]";

/** The home directory's tiles: a chain's twelve most used, two rows of six on a wide screen (the chooser lists eight). */
const HOME_FEATURED = 12;

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
 * (chainExplorers), twelve of them, with "View all" opening the rest in place.
 * Fixed widths over auto-fill (TILE_WIDTH), so full rows pack as a grid; the directory stands on the page's left edge, as the sections under
 * it do (Miles, 5 Nov 2026). Quiet at rest — no border,
 * an rb fill a step off the page (rb-50, rb-850 in dark), blue border on hover per the one-meaning-per-colour nav rule. Above
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
  //
  // Under the asset preference (ui-jobs 557; Miles, 9 Nov 2026) the toggle
  // offers only the chains with an explorer that lists one of the reader's
  // assets, Robinhood steps aside, and the tiles are every such explorer on
  // the chain; the note under them says what was hidden. A stored chain the
  // preference hides gives way to the first it keeps.
  const roster = useScopedRoster();
  const { filtering } = roster;
  const chains = launchedChains()
    .map((c) => c.id)
    .filter((id) => roster.chainShows(id));
  const shownChain = filtering && !chains.includes(chainId) ? (chains[0] ?? chainId) : chainId;
  const onRobinhood = robinhood && !filtering;
  const none = filtering && chains.length === 0;
  const { featured, all } = chainExplorers(shownChain, HOME_FEATURED);
  const protocols = filtering ? all.filter((p) => roster.shows(p.id)) : showAll ? all : featured;

  return (
    <div className="w-full max-w-7xl mx-auto px-4">
      <div className="mb-6" data-home-chains="" {...roster.listProps}>
        {!none && (
          <ChainToggleButtons
            chainId={shownChain}
            onChange={handleChange}
            chains={chains}
            extra={
              filtering
                ? undefined
                : {
                    label: ROBINHOOD_LABEL,
                    active: robinhood,
                    onSelect: handleRobinhood,
                    glyph: <HomeOnlyChainGlyph id="robinhood" className="h-3.5 w-3.5 shrink-0 max-[380px]:hidden" />,
                  }
            }
          />
        )}
      </div>

      {none ? null : onRobinhood ? (
        // Starts where the tiles start and holds their height (a tile row,
        // py-3 + 2rem mark, and the View all row), so the page holds still on
        // a switch.
        <p data-testid="home-robinhood-soon" className="body-text min-h-[8.5rem] max-w-xl">
          <RobinhoodSoon />
        </p>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2"
            data-home-tiles=""
            {...roster.listProps}
            data-scope-unknown={roster.unknown.map((p) => p.id).join(" ") || undefined}
          >
            {protocols.map((p) => (
              <Link
                key={p.id}
                href={p.href}
                className={`flex items-center justify-center gap-2.5 rounded-lg border border-transparent bg-rb-50 px-2 py-3 transition-colors hover:border-blue-500 dark:bg-rb-850 ${TILE_WIDTH}`}
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
                {p.readTier ? (
                  // Decision 0061: the tag under the name, both inside the
                  // mark's 2rem, so a tagged tile keeps the row height.
                  <span className="flex min-w-0 flex-col items-start">
                    <span className="text-sm font-semibold leading-4 whitespace-nowrap">{p.label}</span>
                    <ReadTierTag tip="title" />
                  </span>
                ) : (
                  <span className="text-sm font-semibold whitespace-nowrap">{p.label}</span>
                )}
              </Link>
            ))}
          </div>
          {/* Under the tiles: View all on the left, in the muted foreground
              (show/hide needs no utility hue; Miles, 6 Nov 2026), and the
              chain's coverage link on the right, in the link blue. */}
          <div className="-mx-2 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" {...roster.listProps}>
            <ScopeNote scoped={roster} noun={["explorer", "explorers"]} className="px-2 py-1" />
            {!filtering && all.length > featured.length && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="cursor-pointer rounded-sm px-2 py-1 text-sm text-rb-500 transition-colors hover:text-foreground focus-ring"
                data-home-view-all=""
              >
                {showAll ? "Show the most used" : `View all ${all.length} explorers`}
              </button>
            )}
            <Link
              href={`/coverage/${CHAINS[shownChain].slug}`}
              className="ml-auto shrink-0 rounded-sm px-2 py-1 text-sm font-medium text-blue-600 underline-offset-4 hover:underline focus-ring dark:text-[var(--text-link)]"
              data-home-coverage=""
            >
              See detailed coverage <span>→</span>
            </Link>
          </div>
        </>
      )}
      {none && <ScopeNote scoped={roster} noun={["explorer", "explorers"]} />}
    </div>
  );
}
