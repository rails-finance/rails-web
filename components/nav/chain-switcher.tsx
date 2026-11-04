"use client";

// The blockchain switcher — the affordance that owns the roster. Chains on the
// left with their explorer counts, the selected chain's explorers on the
// right, click-through to a listing. It replaces the roster sections that
// lived inside the hamburger menu; the marketing pages' "Open an explorer"
// pill opens this same panel.
//
// WHERE IT SITS (ui-jobs 497): on every app page, a filled grid glyph in the
// brand rail under the search's glyph (H1, from `md`), its panel flying out to
// the right of the rail; below `md`, the same glyph in HeaderBar's cluster,
// before the profile control (H20), opening the bottom sheet. On marketing
// routes, which have no rail, it is the "Open an explorer" pill. It is a plain
// navigator to the roster: it does not follow the page's chain, and opens on
// Ethereum, the first chain, every time (Miles, 4 Nov 2026).
//
// Counts and rows are roster-derived (`protocolsForChain`), never hardcoded —
// a new explorer lands in this panel by being added to `lib/shared/protocols`.
// EVERY row is an explorer now: the one non-explorer row, a chain's Vaults
// section, went when the vaults moved under the protocols whose factories
// deployed them (rails-ops decision 0028). Morpho Blue on Base and Aave vaults
// on Ethereum are ordinary rows in this grid, and both are counted.

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAINS, MAINNET_CHAIN_ID, type ChainId, type ChainMeta } from "@/lib/shared/chains";
import { protocolsForChain, protocolForPathname, type ProtocolEntry } from "@/lib/shared/protocols";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { HomeOnlyChainGlyph } from "@/components/icons/chain-glyphs";
import { ROBINHOOD_LABEL, RobinhoodSoon } from "@/components/shared/robinhood-soon";

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

/** lucide's `layout-grid` with its four squares filled (Miles, 4 Nov 2026). */
function FilledLayoutGrid() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

/** The panel's gap from the rail's edge, which the triangle spans. */
const RAIL_GAP = 10;

/** `rail` in the brand rail, `header` in the app header bar below md, `cta`
 *  the marketing header bar's pill. */
export function ChainSwitcher({ variant }: { variant: "rail" | "header" | "cta" }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Where the rail's panel stands: the rail's right edge, level with the trigger. */
  const [railAnchor, setRailAnchor] = useState<{ left: number; top: number } | null>(null);

  const chains = (Object.values(CHAINS) as ChainMeta[]).filter((c) => protocolsForChain(c.id).length > 0);

  // The active chain comes from the URL's first segment — every explorer route
  // lives under a chain slug — so it needs no per-route wiring. The active
  // explorer (for the highlighted row) resolves separately.
  // The explorer being read is marked in its row; the panel itself opens on
  // the first chain whatever the page's chain.
  const activeEntry = protocolForPathname(pathname);

  const [selectedId, setSelectedId] = useState<ChainId>(MAINNET_CHAIN_ID);
  const selectedChain = CHAINS[selectedId] ?? CHAINS[MAINNET_CHAIN_ID];
  const selectedEntries = protocolsForChain(selectedChain.id);
  // Robinhood: a chain row with no explorers yet. Selecting it shows the
  // coming-soon line in place of the roster (components/shared/robinhood-soon).
  const [robinhood, setRobinhood] = useState(false);
  const selectChain = (id: ChainId) => {
    setSelectedId(id);
    setRobinhood(false);
  };

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
      if (e.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setIsOpen(false);
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
      if (next) {
        setSelectedId(MAINNET_CHAIN_ID);
        setRobinhood(false);
        if (variant === "rail" && triggerRef.current) {
          const r = triggerRef.current.getBoundingClientRect();
          const rail = triggerRef.current.closest("aside")?.getBoundingClientRect();
          setRailAnchor({ left: (rail?.right ?? r.right) + RAIL_GAP, top: r.top });
        }
      }
      return next;
    });
  const close = () => setIsOpen(false);

  // Chain rows SELECT (the coverage link below the roster is the navigation
  // out: the per-chain coverage page is the chain's directory); explorer rows
  // NAVIGATE.
  const onRail = variant === "rail" && railAnchor != null;
  const desktopPanel =
    !isMobile && isOpen ? (
      <div
        ref={panelRef}
        role="menu"
        aria-label="Blockchain switcher"
        className={`flex w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-rb-200 bg-white p-3 shadow-2xl dark:border-rb-800 dark:bg-rb-900 ${
          onRail
            ? "fixed z-[var(--z-dropdown)]"
            : "animate-dropdown-down absolute right-0 top-full z-[var(--z-dropdown)] mt-2"
        }`}
        style={onRail ? { left: railAnchor.left, top: railAnchor.top - 4 } : undefined}
      >
        {/* Triangle pointer: on the panel's left edge pointing at the rail's
              glyph, or on its top edge under the pill. */}
        {onRail ? (
          <div className="absolute -left-2 top-[15px] h-0 w-0 border-t-[8px] border-b-[8px] border-r-[8px] border-t-transparent border-b-transparent border-r-white dark:border-r-rb-900" />
        ) : (
          <div className="absolute -top-2 right-4 h-0 w-0 border-l-[8px] border-r-[8px] border-b-[8px] border-l-transparent border-r-transparent border-b-white before:absolute before:-left-[9px] before:-top-[1px] before:h-0 before:w-0 before:border-l-[9px] before:border-r-[9px] before:border-b-[9px] before:border-l-transparent before:border-r-transparent before:border-b-white before:content-[''] dark:border-b-rb-900 dark:before:border-b-rb-900" />
        )}
        <div className="w-[185px] shrink-0 space-y-0.5 border-r border-rb-200 pr-3 dark:border-rb-800">
          {chains.map((chain) => {
            const count = protocolsForChain(chain.id).length;
            const selected = !robinhood && chain.id === selectedChain.id;
            return (
              <button
                key={chain.id}
                onClick={() => selectChain(chain.id)}
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
          <button
            onClick={() => setRobinhood(true)}
            aria-pressed={robinhood}
            data-switcher-robinhood=""
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              robinhood
                ? "bg-rb-100 font-semibold text-foreground dark:bg-rb-800"
                : "font-medium text-foreground hover:text-blue-500"
            }`}
          >
            <HomeOnlyChainGlyph id="robinhood" className="h-5 w-5" />
            <span>{ROBINHOOD_LABEL}</span>
          </button>
        </div>
        <div className="min-w-0 flex-1 pl-3">
          {robinhood ? (
            <p className="px-2 py-2 text-sm leading-relaxed text-rb-500">
              <RobinhoodSoon />
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-3">
                {selectedEntries.map((entry) => (
                  <ExplorerRow
                    key={entry.id}
                    entry={entry}
                    isActive={activeEntry?.id === entry.id}
                    onNavigate={close}
                  />
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
            </>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative" ref={rootRef} data-anatomy="H4">
      {variant === "cta" ? (
        <button
          ref={triggerRef}
          onClick={toggle}
          aria-label="Open an explorer"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className="cursor-pointer inline-flex items-center rounded-full bg-foreground text-background font-medium text-sm px-5 py-2.5 transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Open an explorer
        </button>
      ) : (
        // The search launcher's (H15.1) glyph, hit area and states: ink at
        // rest, blue on hover and while the panel is open.
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-label="Open an explorer"
          title="Open an explorer"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          data-chooser-trigger={variant}
          className={`cursor-pointer rounded-lg p-2.5 transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isOpen ? "text-blue-500" : "text-rb-700 dark:text-rb-300"
          }`}
        >
          <FilledLayoutGrid />
        </button>
      )}

      {/* Desktop panel — chains left with counts, the selected chain's
          explorers right. From the rail it is portalled to the body, so it
          stands above the rail (z-40) and the page. */}
      {onRail && desktopPanel ? createPortal(desktopPanel, document.body) : desktopPanel}

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
              {/* Five tabs: below 430px the glyphs drop so every label fits. */}
              {chains.map((chain) => {
                const selected = !robinhood && chain.id === selectedChain.id;
                return (
                  <button
                    key={chain.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectChain(chain.id)}
                    className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded px-2 ${
                      selected ? "bg-background text-foreground" : "text-rb-500"
                    }`}
                  >
                    <ChainGlyph chainId={chain.id} className="h-4 w-4 max-[430px]:hidden" />
                    {chain.name}
                  </button>
                );
              })}
              <button
                type="button"
                role="tab"
                aria-selected={robinhood}
                onClick={() => setRobinhood(true)}
                className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded px-2 ${
                  robinhood ? "bg-background text-foreground" : "text-rb-500"
                }`}
              >
                <HomeOnlyChainGlyph id="robinhood" className="h-4 w-4 max-[430px]:hidden" />
                {ROBINHOOD_LABEL}
              </button>
            </div>
          }
        >
          {robinhood ? (
            <p role="tabpanel" aria-label={ROBINHOOD_LABEL} className="px-2 py-2 text-sm leading-relaxed text-rb-500">
              <RobinhoodSoon />
            </p>
          ) : (
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
          )}
        </MobileSheet>
      )}
    </div>
  );
}
