"use client";

// The lines page under Focus (ui-jobs 557): the lines whose synthetic or
// collateral is in focus, in each of the page's groups, with one count of the
// lines kept. The coverage rows carry no token address, so a line is matched
// by the symbols it names (its synthetic, its MYT and the MYT's underlying),
// resolved to addresses on the line's chain (lib/shared/focus-row-keys.ts). A
// V2 line counts with the V3 line of the same synthetic.

import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import {
  AlchemixCoverageGroup,
  AlchemixLinesPanel,
  AlchemixTransmuterCoveragePanel,
  AlchemixV2CoveragePanel,
} from "@/components/protocol/alchemix/alchemix-lines-panel";
import { rowAssetKeys } from "@/lib/shared/focus-row-keys";
import type { AlchemixLine } from "@/lib/alchemix/lines";
import type {
  AlchemixLineCoverage,
  AlchemixTransmuterLineCoverage,
  AlchemixV2LineCoverage,
} from "@/types/api/alchemix";

export function AlchemixLinesFocus({
  catalog,
  lines,
  transmuter,
  v2,
}: {
  catalog: AlchemixLine[];
  lines: AlchemixLineCoverage[];
  transmuter: AlchemixTransmuterLineCoverage[] | null;
  /** Absent on a chain V2 never ran on. */
  v2?: AlchemixV2LineCoverage[] | null;
}) {
  const scoped = useScopedRows(
    catalog,
    (l) =>
      rowAssetKeys(
        {
          debtSymbol: lines.find((c) => c.lineKey === l.key)?.syntheticSymbol ?? l.displayName,
          lineSymbol: l.displayName,
          mytSymbol: l.myt,
          underlyingSymbol: l.underlying,
        },
        l.chainId,
      ),
    (l) => l.chainId,
  );
  const kept = new Set(scoped.rows.map((l) => l.key));
  const names = new Set(scoped.rows.map((l) => l.displayName.toLowerCase()));
  const shownLines = lines.filter((l) => kept.has(l.lineKey));
  const shownTransmuter = transmuter && transmuter.filter((l) => kept.has(l.lineKey));
  const shownV2 = v2 && v2.filter((l) => names.has(l.syntheticSymbol.toLowerCase()));
  // A group the focus empties is left out; the panels' own empty lines say the read did not answer.
  const emptied = (all: unknown[] | null | undefined, shown: unknown[] | null | undefined) =>
    !!all?.length && shown?.length === 0;
  return (
    <div {...scoped.listProps}>
      <ScopeNote scoped={scoped} noun={["market", "markets"]} className="mb-4" />
      {!emptied(lines, shownLines) && (
        <AlchemixCoverageGroup title="Alchemist positions">
          <AlchemixLinesPanel lines={shownLines} />
        </AlchemixCoverageGroup>
      )}
      {!emptied(transmuter, shownTransmuter) && (
        <AlchemixCoverageGroup title="Transmuter positions">
          <AlchemixTransmuterCoveragePanel lines={shownTransmuter} />
        </AlchemixCoverageGroup>
      )}
      {v2 !== undefined && !emptied(v2, shownV2) && (
        <AlchemixCoverageGroup title="V2 positions">
          <AlchemixV2CoveragePanel lines={shownV2 ?? null} />
        </AlchemixCoverageGroup>
      )}
    </div>
  );
}
