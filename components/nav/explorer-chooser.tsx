"use client";

// The explorer chooser (H4, rails-ops TO-DO-ui-jobs 503): the roster, under
// the search in the wallet panel (H16). The chain glyphs across the top
// select a chain, each named by its tooltip and the selected one by a muted
// heading under them; the chain's explorers stand in two columns below, the most
// used shown and the long tail behind "View all <n> explorers"
// (lib/shared/explorer-rank.ts). The coverage pages are reached from the
// home directory and the site footer, not from here (Miles, 5 Nov 2026). It opens on Ethereum, the first chain, whatever the page's chain (Miles,
// 4 Nov 2026).
//
// Rows are roster-derived (`protocolsForChain`), never hardcoded: a new
// explorer lands here by being added to `lib/shared/protocols`.

import { CHROME_HOVER } from "@/components/nav/chrome-hover";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAINS, MAINNET_CHAIN_ID, type ChainId, type ChainMeta } from "@/lib/shared/chains";
import { protocolsForChain, protocolForPathname, type ProtocolEntry } from "@/lib/shared/protocols";
import { chainExplorers } from "@/lib/shared/explorer-rank";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { HomeOnlyChainGlyph } from "@/components/icons/chain-glyphs";
import { ROBINHOOD_LABEL, RobinhoodSoon } from "@/components/shared/robinhood-soon";

// Row state grammar, same as the nav menu's:
//   rest    → text-foreground; hover → blue-600, blue-400 in dark ("this goes somewhere")
//   current → muted + semibold, not clickable (you can't navigate to here)
const ROW_REST = `font-medium text-foreground ${CHROME_HOVER}`;
const ROW_CURRENT = "font-semibold text-rb-500 pointer-events-none";

/** One explorer row: icon chip and label, navigating to the listing. */
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
      data-switcher-explorer=""
      aria-current={isActive ? "page" : undefined}
      onClick={isActive ? undefined : onNavigate}
      className={`flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-3 text-sm transition-colors focus-ring ${
        isActive ? ROW_CURRENT : ROW_REST
      }`}
    >
      <ProtocolIcon id={entry.id} className="h-5 w-5 shrink-0" />
      <span className="truncate">{entry.label}</span>
    </Link>
  );
}

const TAB = "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors focus-ring";
const TAB_ON = "bg-rb-200 dark:bg-rb-700";
const TAB_OFF = CHROME_HOVER;

/** The panel's section heading (ui-jobs 514): the search's and the chooser's. */
export const PANEL_HEADING = "text-sm font-semibold text-rb-500";

export function ExplorerChooser({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const activeEntry = protocolForPathname(pathname);
  const chains = (Object.values(CHAINS) as ChainMeta[]).filter((c) => protocolsForChain(c.id).length > 0);

  const [selectedId, setSelectedId] = useState<ChainId>(MAINNET_CHAIN_ID);
  // Robinhood: a chain with no explorers yet; selecting it shows the
  // coming-soon line in place of the roster.
  const [robinhood, setRobinhood] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const selectChain = (id: ChainId) => {
    setSelectedId(id);
    setRobinhood(false);
    setShowAll(false);
  };

  const chain = CHAINS[selectedId] ?? CHAINS[MAINNET_CHAIN_ID];
  const { featured, all } = chainExplorers(chain.id);
  const rows = showAll ? all : featured;
  const name = robinhood ? ROBINHOOD_LABEL : chain.name;

  return (
    <div className="pt-8" data-anatomy="H4" data-explorer-chooser="">
      <h2 className={`${PANEL_HEADING} mb-3`}>Choose a chain, select a protocol</h2>
      <div className="flex items-center gap-1">
        <div role="tablist" aria-label="Blockchain" className="-ml-2 flex items-center gap-1" data-switcher-tabs="">
          {chains.map((c) => {
            const selected = !robinhood && c.id === chain.id;
            const count = protocolsForChain(c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={c.name}
                title={`${c.name} · ${count} explorer${count === 1 ? "" : "s"}`}
                onClick={() => selectChain(c.id)}
                data-chain-tab={c.slug}
                data-chain-count={count}
                className={`${TAB} ${selected ? TAB_ON : TAB_OFF}`}
              >
                <ChainGlyph chainId={c.id} className="h-5 w-5" />
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={robinhood}
            aria-label={ROBINHOOD_LABEL}
            title={ROBINHOOD_LABEL}
            onClick={() => setRobinhood(true)}
            data-switcher-robinhood=""
            className={`${TAB} ${robinhood ? TAB_ON : TAB_OFF}`}
          >
            <HomeOnlyChainGlyph id="robinhood" className="h-5 w-5" />
          </button>
        </div>
      </div>
      {/* The selected chain's name, a muted heading over its explorers
          (Miles, 5 Nov 2026). */}
      <p className="mt-7 truncate text-sm font-semibold text-rb-500" data-chooser-chain-name="">
        {name}
      </p>

      {robinhood ? (
        <p role="tabpanel" aria-label={ROBINHOOD_LABEL} className="pt-3 text-sm leading-relaxed text-rb-500">
          <RobinhoodSoon />
        </p>
      ) : (
        <nav role="tabpanel" aria-label={chain.name} className="pt-2">
          <div className="-mx-2 grid grid-cols-2 gap-x-2">
            {rows.map((entry) => (
              <ExplorerRow
                key={entry.id}
                entry={entry}
                isActive={activeEntry?.id === entry.id}
                onNavigate={onNavigate}
              />
            ))}
          </div>
          {all.length > featured.length && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="-mx-2 mt-3 cursor-pointer rounded-sm px-2 py-1 text-sm text-rb-500 transition-colors hover:text-foreground focus-ring"
              data-chooser-view-all=""
            >
              {showAll ? "Show the most used" : `View all ${all.length} explorers`}
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
