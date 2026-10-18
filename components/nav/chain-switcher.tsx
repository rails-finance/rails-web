"use client";

// The blockchain switcher — the affordance that owns the roster. Chains on the
// left with their explorer counts, the selected chain's explorers on the
// right, click-through to a listing. It replaces the roster sections that
// lived inside the hamburger menu; the marketing pages' "Open an explorer"
// pill opens this same panel.
//
// WHERE IT SITS: from `md` up on an app route, at the right end of the
// protocol title row in RailHeader (rails-ops TO-DO-ui-jobs 68) — the name and
// the chain read as one statement. Below `md`, and on every marketing width,
// it is the right-hand end of HeaderBar's control cluster.
//
// The trigger states the CHAIN, never the protocol: the identity at the other
// end of the row says Moonwell, and this says only the ambient context — which
// chain that explorer runs on. On marketing routes there is no active chain,
// so the trigger is the neutral CTA pill.
//
// Counts and rows are roster-derived (`protocolsForChain`), never hardcoded —
// a new explorer lands in this panel by being added to `lib/shared/protocols`.
// EVERY row is an explorer now: the one non-explorer row, a chain's Vaults
// section, went when the vaults moved under the protocols whose factories
// deployed them (rails-ops decision 0028). Morpho Blue on Base and Aave vaults
// on Ethereum are ordinary rows in this grid, and both are counted.

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAINS, MAINNET_CHAIN_ID, type ChainId, type ChainMeta } from "@/lib/shared/chains";
import { protocolsForChain, protocolForPathname, type ProtocolEntry } from "@/lib/shared/protocols";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { MobileSheet } from "@/components/shared/mobile-sheet";

// Row state grammar, same as the nav menu's:
//   rest    → text-foreground; hover → blue-500 ("this goes somewhere")
//   current → muted + semibold, not clickable (you can't navigate to here)
const ROW_REST = "font-medium text-foreground hover:text-blue-500";
const ROW_CURRENT = "font-semibold text-rb-500 pointer-events-none";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** One explorer row — icon chip + label, navigating to the listing. */
function ExplorerRow({
  entry,
  isActive,
  onNavigate,
}: {
  entry: ProtocolEntry;
  isActive: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={entry.href}
      data-switcher-explorer
      aria-current={isActive ? "page" : undefined}
      onClick={isActive ? undefined : onNavigate}
      className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
        isActive ? ROW_CURRENT : ROW_REST
      }`}
    >
      <ProtocolIcon id={entry.id} className="h-5 w-5 shrink-0" />
      <span className="truncate">{entry.label}</span>
    </Link>
  );
}

export function ChainSwitcher({ variant }: { variant: "chain" | "cta" }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const chains = (Object.values(CHAINS) as ChainMeta[]).filter((c) => protocolsForChain(c.id).length > 0);

  // The active chain comes from the URL's first segment — every explorer route
  // lives under a chain slug — so it needs no per-route wiring. The active
  // explorer (for the highlighted row) resolves separately.
  const firstSegment = pathname?.split("/")[1] ?? "";
  const activeChain = chains.find((c) => c.slug === firstSegment);
  const activeEntry = protocolForPathname(pathname);

  const [selectedId, setSelectedId] = useState<ChainId>(activeChain?.id ?? MAINNET_CHAIN_ID);
  const selectedChain = CHAINS[selectedId] ?? CHAINS[MAINNET_CHAIN_ID];
  const selectedEntries = protocolsForChain(selectedChain.id);

  useEffect(() => {
    const checkMobile = () => {
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isTouchDevice || isSmallScreen);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close on Escape, and on a click/tap outside the switcher root. The phone
  // sheet is portalled outside the root and closes itself.
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen, isMobile]);

  const toggle = () =>
    setIsOpen((v) => {
      const next = !v;
      // Opening re-anchors the selection to where the reader is; a selection
      // left over from browsing the panel earlier would be stale context.
      if (next) setSelectedId(activeChain?.id ?? MAINNET_CHAIN_ID);
      return next;
    });
  const close = () => setIsOpen(false);

  const showChainTrigger = variant === "chain" && activeChain;

  return (
    <div className="relative" ref={rootRef} data-anatomy="H4">
      {showChainTrigger ? (
        <button
          onClick={toggle}
          aria-label={`${activeChain.name}, switch blockchain`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className="group flex cursor-pointer items-center gap-1.5 rounded-lg p-2.5 text-foreground transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ChainGlyph chainId={activeChain.id} className="h-4 w-4" />
          {/* The rail identity's small-caps register — the chain name is the
              same kind of ambient label, one register family across the top
              of the page. Below `md` (the header bar) the glyph stands alone
              (Miles 18 Oct 2026). */}
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] max-md:hidden">
            {activeChain.name}
          </span>
          <span className="text-rb-500 transition-colors group-hover:text-blue-500">
            <Chevron open={isOpen} />
          </span>
        </button>
      ) : (
        <button
          onClick={toggle}
          aria-label="Open an explorer"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className="cursor-pointer inline-flex items-center rounded-full bg-foreground text-background font-medium text-sm px-5 py-2.5 transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Open an explorer
        </button>
      )}

      {/* Desktop panel — chains left with counts, the selected chain's
          explorers right. Chain rows SELECT (the coverage link below the
          roster is the navigation out — the per-chain coverage page is the
          chain's directory); explorer rows NAVIGATE. */}
      {!isMobile && isOpen && (
        <div
          role="menu"
          aria-label="Blockchain switcher"
          className="animate-dropdown-down absolute right-0 top-full z-[var(--z-dropdown)] mt-2 flex w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-rb-200 bg-white p-3 shadow-2xl dark:border-rb-800 dark:bg-rb-900"
        >
          {/* Triangle pointer */}
          <div className="absolute -top-2 right-4 h-0 w-0 border-l-[8px] border-r-[8px] border-b-[8px] border-l-transparent border-r-transparent border-b-white before:absolute before:-left-[9px] before:-top-[1px] before:h-0 before:w-0 before:border-l-[9px] before:border-r-[9px] before:border-b-[9px] before:border-l-transparent before:border-r-transparent before:border-b-white before:content-[''] dark:border-b-rb-900 dark:before:border-b-rb-900" />
          <div className="w-[185px] shrink-0 space-y-0.5 border-r border-rb-200 pr-3 dark:border-rb-800">
            {chains.map((chain) => {
              const count = protocolsForChain(chain.id).length;
              const selected = chain.id === selectedChain.id;
              return (
                <button
                  key={chain.id}
                  onClick={() => setSelectedId(chain.id)}
                  aria-pressed={selected}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    selected
                      ? "bg-rb-100 font-semibold text-foreground dark:bg-rb-800"
                      : "font-medium text-foreground hover:text-blue-500"
                  }`}
                >
                  <ChainGlyph chainId={chain.id} className="h-5 w-5" />
                  <span>{chain.name}</span>
                  <span data-chain-count className="ml-auto text-xs tabular-nums text-rb-500">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="min-w-0 flex-1 pl-3">
            <div className="grid grid-cols-2 gap-x-3">
              {selectedEntries.map((entry) => (
                <ExplorerRow key={entry.id} entry={entry} isActive={activeEntry?.id === entry.id} onNavigate={close} />
              ))}
            </div>
            <div className="mt-2 border-t border-rb-200 px-2 pt-2.5 dark:border-rb-800">
              <Link
                href={`/coverage/${selectedChain.slug}`}
                onClick={close}
                className="text-xs text-rb-500 transition-colors hover:text-blue-500"
              >
                See detailed {selectedChain.name} coverage →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Phone sheet — a tab per chain over that chain's explorers, opening
          on the reader's chain (Miles 18 Oct 2026). */}
      {isMobile && isOpen && (
        <MobileSheet
          label="Explorers"
          onClose={close}
          header={
            <div
              role="tablist"
              aria-label="Blockchain"
              className="mb-3 flex shrink-0 rounded-md bg-sunken p-0.5 text-xs font-semibold"
              data-switcher-tabs=""
            >
              {chains.map((chain) => {
                const selected = chain.id === selectedChain.id;
                return (
                  <button
                    key={chain.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setSelectedId(chain.id)}
                    className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded px-2 ${
                      selected ? "bg-background text-foreground" : "text-rb-500"
                    }`}
                  >
                    <ChainGlyph chainId={chain.id} className="h-4 w-4" />
                    {chain.name}
                  </button>
                );
              })}
            </div>
          }
        >
          <nav role="tabpanel" aria-label={selectedChain.name} className="space-y-0.5">
            {selectedEntries.map((entry) => (
              <ExplorerRow key={entry.id} entry={entry} isActive={activeEntry?.id === entry.id} onNavigate={close} />
            ))}
            <Link
              href={`/coverage/${selectedChain.slug}`}
              onClick={close}
              className="mt-1.5 inline-block px-2 pt-1 text-xs text-rb-500 transition-colors hover:text-blue-500"
            >
              See detailed {selectedChain.name} coverage →
            </Link>
          </nav>
        </MobileSheet>
      )}
    </div>
  );
}
