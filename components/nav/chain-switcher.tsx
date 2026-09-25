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

  // Close on Escape, and on a click/tap outside the switcher root.
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

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
    <div className="relative" ref={rootRef}>
      {showChainTrigger ? (
        <button
          onClick={toggle}
          aria-label="Switch blockchain"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className="group flex cursor-pointer items-center gap-1.5 rounded-lg p-2.5 text-foreground transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ChainGlyph chainId={activeChain.id} className="h-4 w-4" />
          {/* The rail identity's small-caps register — the chain name is the
              same kind of ambient label, one register family across the top
              of the page. */}
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{activeChain.name}</span>
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
          className="animate-dropdown-down absolute right-0 top-full z-50 mt-2 flex w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-rb-200 bg-white p-3 shadow-2xl dark:border-rb-800 dark:bg-rb-900"
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

      {/* Mobile sheet — the chains as stacked sections, each heading carrying
          the glyph, name and count; the same rows underneath. */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={toggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
              e.preventDefault();
              toggle();
            }
          }}
          aria-label="Close explorer switcher"
        >
          <div
            className="fixed right-0 top-0 h-full w-80 max-w-[85vw] overflow-y-auto bg-white shadow-2xl dark:bg-rb-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-rb-200 p-6 dark:border-rb-700">
              <span className="text-lg font-semibold tracking-wide text-foreground">Explorers</span>
              <button
                onClick={toggle}
                className="cursor-pointer rounded-lg p-3 transition-colors duration-150 hover:bg-rb-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-rb-700"
                aria-label="Close explorer switcher"
              >
                <div className="relative flex h-5 w-6 flex-col justify-center">
                  <span className="absolute h-0.5 w-full rotate-45 bg-rb-700 dark:bg-rb-300" />
                  <span className="absolute h-0.5 w-full -rotate-45 bg-rb-700 dark:bg-rb-300" />
                </div>
              </button>
            </div>
            <nav className="p-6">
              {chains.map((chain) => {
                const entries = protocolsForChain(chain.id);
                return (
                  <div key={chain.id} className="mb-5 last:mb-0">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-rb-500">
                      <ChainGlyph chainId={chain.id} className="h-4 w-4" />
                      <span>{chain.name}</span>
                      <span className="tabular-nums">· {entries.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {entries.map((entry) => (
                        <ExplorerRow
                          key={entry.id}
                          entry={entry}
                          isActive={activeEntry?.id === entry.id}
                          onNavigate={close}
                        />
                      ))}
                    </div>
                    <Link
                      href={`/coverage/${chain.slug}`}
                      onClick={close}
                      className="mt-1.5 inline-block px-2 text-xs text-rb-500 transition-colors hover:text-blue-500"
                    >
                      See detailed {chain.name} coverage →
                    </Link>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
