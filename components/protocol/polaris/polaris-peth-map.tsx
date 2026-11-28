"use client";

// The Polaris map on a pETH account page (ui-jobs 873): the shared protocol
// map (components/shared/protocol-map/) on the Polaris layout, filled with
// this address's activity, in the places panel's frame. The page holds the
// selection, which it shares with the timeline below.

import { ProtocolMap } from "@/components/shared/protocol-map/protocol-map";
import { CARD_PAD_X, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import { POLARIS_MAP_LAYOUT } from "@/lib/polaris/peth-map-layout";
import type { MapFill, MapSelection } from "@/lib/shared/protocol-map/types";

export function PolarisPethMap({
  address,
  fill,
  ledgerGap,
  selection,
  onSelect,
  onFilter,
  rowLabel,
  handAddedPlaces,
}: {
  address: string;
  fill: MapFill;
  ledgerGap: "reading" | "too_heavy" | null;
  selection: MapSelection;
  onSelect: (s: MapSelection) => void;
  onFilter: (edgeId: string) => void;
  rowLabel: (rowId: string) => string | null;
  /** DEV ONLY: rows whose places were added by hand (lib/polaris/peth-dev-cache.ts). */
  handAddedPlaces?: string[] | null;
}) {
  const { rows, total } = fill.counted;
  return (
    <section className={`rounded-2xl bg-raised ${CARD_PAD_X} py-4`} data-peth-map="" aria-labelledby="peth-map-heading">
      <div className="flex min-h-[28px] items-center">
        <h2 id="peth-map-heading" className={`${SECTION_HEADING} text-rb-500`}>
          Polaris map
        </h2>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-rb-500">
        The map below draws Polaris with this address&rsquo;s activity on it: where its tokens came from above it, and
        the mechanisms it used below. Each arrow sums what moved along it. Each box gives what went in and what sits
        there now, each in its token. Click a box, an arrow or a timeline row to trace it.
      </p>
      {ledgerGap != null && (
        <p className="mt-1 text-sm leading-relaxed text-rb-500">
          The history of this address is not read yet, so the map draws no arrows.
        </p>
      )}
      {ledgerGap == null && rows < total && (
        <p className="mt-1 text-sm leading-relaxed text-rb-500">
          This address has {total.toLocaleString("en-US")} transactions. The arrows count the newest{" "}
          {rows.toLocaleString("en-US")} and state no amounts; each box gives its count over all of them.
        </p>
      )}
      {/* A production build drops this block: NODE_ENV is inlined. */}
      {process.env.NODE_ENV !== "production" && handAddedPlaces && handAddedPlaces.length > 0 && (
        <div
          className="mt-3 rounded-xl border border-[var(--notice-caution-border)] bg-[var(--notice-caution-bg)] px-3 py-2 text-xs text-[var(--tone-caution-text)]"
          data-peth-map-dev-banner=""
        >
          <p className="font-semibold">Development only: places added by hand</p>
          <p className="mt-0.5">
            The route does not send each row&rsquo;s place yet (ui-jobs 872). For {address}, the arrows use places added
            by hand on {handAddedPlaces.length} {handAddedPlaces.length === 1 ? "row" : "rows"}:
          </p>
          <ul className="mt-1 font-mono">
            {handAddedPlaces.map((tx) => (
              <li key={tx}>
                {tx} {rowLabel(tx) ? `(${rowLabel(tx)})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <ProtocolMap
          layout={POLARIS_MAP_LAYOUT}
          fill={fill}
          selection={selection}
          onSelect={onSelect}
          onFilter={onFilter}
          holderNote={<span className="font-mono">{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>}
          rowLabel={rowLabel}
        />
      </div>
    </section>
  );
}
