"use client";

// The explorer roster on a /start step (G4; rails-ops ui-jobs 478): a field
// that narrows the roster by name as the reader types, and the explorers
// grouped by chain as the explorer chooser (H4) groups them. In "find" mode
// (the protocol's site is down) each explorer opens with its wallet search
// focused: a listing through `?find=1`, a front door (N5) the same way.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { SearchBox } from "@/components/shared/front-door-search";
import { launchedChains, protocolsForChain, type ProtocolEntry } from "@/lib/shared/protocols";
import type { RosterKey } from "@/lib/start/tree";

/** The query that puts the cursor in a listing's or front door's search. */
export const FIND_PARAM = "find";

function hrefFor(entry: ProtocolEntry, mode: RosterKey): string {
  if (mode === "browse") return entry.href;
  // A vault-native explorer opens on its roster, which has no wallet search.
  if (entry.positionListing === false) return entry.href;
  return `${entry.href}?${FIND_PARAM}=1`;
}

export function ExplorerPicker({ mode }: { mode: RosterKey }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return launchedChains()
      .map((chain) => ({
        chain,
        entries: protocolsForChain(chain.id).filter(
          (p) => !q || p.label.toLowerCase().includes(q) || chain.name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [query]);

  return (
    <div data-anatomy="G4" data-start-roster={mode}>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Type a protocol's name"
        size="md"
        anatomy=""
        className="mb-6 max-w-md"
      />
      {groups.length === 0 ? (
        <p className="text-sm text-rb-500">No explorer by that name.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ chain, entries }) => (
            <section key={chain.id} aria-label={chain.name}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-rb-500">
                <ChainGlyph chainId={chain.id} className="h-4 w-4" />
                {chain.name}
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={hrefFor(entry, mode)}
                      data-start-explorer={entry.id}
                      className="flex items-center gap-2.5 rounded-lg border border-rb-200 bg-raised px-3 py-2.5 text-sm text-foreground transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600"
                    >
                      <ProtocolIcon id={entry.id} className="h-5 w-5 shrink-0" />
                      <span className="truncate">{entry.label}</span>
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
