"use client";

// The Ethereum/Base segmented control — one design, two behaviours. The home
// grid flips client state (buttons + localStorage, no URL change), while the
// coverage pages are two routes and the toggle is a pair of links between
// them (the URL is the state — the house pattern for anything shareable).
// Both render the same pill shell so the affordance reads identically
// wherever a surface offers the two chains.

import Link from "next/link";
import { CHAINS, SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { launchedChains } from "@/lib/shared/protocols";
import { CTRL_GHOST, ctrlWaking } from "@/lib/shared/ui-grammar";
import { useHydrated } from "@/hooks/useHydrated";

/** The segmented pill's shell and segment, exported so another two-way switch
 *  between routes (the Alchemix position-type tabs) wears the same control. */
export const SEGMENT_SHELL =
  "inline-flex items-center gap-0.5 rounded-full border border-rb-200 bg-background/60 p-0.5 dark:border-rb-800";

export const segmentClass = (active: boolean) =>
  `${CTRL_GHOST} inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ${
    active ? "bg-rb-100 text-foreground dark:bg-rb-800" : "text-rb-500 hover:text-foreground"
  }`;

/** The chain as a small mark for any toggle/switcher segment. Both chains
 *  paint in currentColor (theme-aware) — a brand-blue square here would be
 *  the loudest thing in a monochrome control. Base's square is inset to 75%
 *  of the box: drawn edge-to-edge it reads heavier than the Ethereum diamond
 *  at the same footprint. Decorative here: every use sits beside the chain's
 *  name, so the mark says nothing the text doesn't. */
export function ChainGlyph({ chainId, className = "" }: { chainId: ChainId; className?: string }) {
  if (chainId === 8453) {
    return (
      <svg viewBox="0 0 122 122" fill="currentColor" className={`shrink-0 ${className}`} aria-hidden="true">
        <rect x="15.25" y="15.25" width="91.5" height="91.5" rx="7.25" />
      </svg>
    );
  }
  if (chainId === SEPOLIA_CHAIN_ID) {
    // Sepolia is an Ethereum testnet, so it wears the Ethereum diamond as an
    // OUTLINE: the same silhouette says which family it belongs to, the empty
    // interior says it is not the real one. Same box as the filled diamond.
    return (
      <svg
        viewBox="0 0 256 417"
        fill="none"
        stroke="currentColor"
        strokeWidth="22"
        strokeLinejoin="round"
        className={`shrink-0 ${className}`}
        aria-hidden="true"
      >
        <path d="M128 12 L244 212 L128 288 L12 212 Z" />
        <path d="M128 312 L244 236 L128 405 L12 236 Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 256 417" fill="currentColor" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d="M127.96 0L125.17 9.5v275.67l2.79 2.79 127.96-75.64z" opacity=".65" />
      <path d="M127.96 0L0 212.32l127.96 75.64V0z" />
      <path d="M127.96 312.19l-1.57 1.92v98.2l1.57 4.6 128.03-180.32z" opacity=".65" />
      <path d="M127.96 416.91V312.19L0 236.59z" />
      <path d="M127.96 287.96l127.96-75.64-127.96-58.16z" opacity=".4" />
      <path d="M0 212.32l127.96 75.64V154.16z" opacity=".55" />
    </svg>
  );
}

/** The chains the toggle switches between, in display order (Sepolia last: a
 *  testnet is the exception a reader reaches for, not the default).
 *
 *  Derived from the roster, not listed: a chain whose every explorer is
 *  unlaunched has no segment here, so the link form cannot mint the one
 *  `/coverage/<chain>` href a launched page would otherwise carry into it, and
 *  the button form cannot offer a tab that shows an empty grid. */
const TOGGLE_CHAINS: ChainId[] = launchedChains().map((c) => c.id);

/** Button form — in-place state flip (`aria-pressed` per the house Chip
 *  idiom). Wakes with hydration: a pre-hydration click would be lost, so the
 *  shell signals liveness the way every other in-place control does. */
export function ChainToggleButtons({ chainId, onChange }: { chainId: ChainId; onChange: (id: ChainId) => void }) {
  const hydrated = useHydrated();
  return (
    <div className={SEGMENT_SHELL} {...ctrlWaking(hydrated)}>
      {TOGGLE_CHAINS.map((id) => {
        const active = chainId === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={segmentClass(active)}
          >
            <ChainGlyph chainId={id} className="h-3.5 w-3.5" />
            {CHAINS[id].name}
          </button>
        );
      })}
    </div>
  );
}

/** Link form — the two segments navigate between per-chain routes
 *  (`<basePath>/<chain-slug>`) and the active one is `aria-current="page"`.
 *  `basePath` is a string, not a callback: this renders inside server
 *  components, and a function prop can't cross that boundary. No hydration
 *  gate: links are live in the server-rendered HTML. */
export function ChainToggleLinks({ chainId, basePath }: { chainId: ChainId; basePath: string }) {
  return (
    <div className={SEGMENT_SHELL}>
      {TOGGLE_CHAINS.map((id) => {
        const active = chainId === id;
        return (
          <Link
            key={id}
            href={`${basePath}/${CHAINS[id].slug}`}
            aria-current={active ? "page" : undefined}
            className={segmentClass(active)}
          >
            <ChainGlyph chainId={id} className="h-3.5 w-3.5" />
            {CHAINS[id].name}
          </Link>
        );
      })}
    </div>
  );
}
