// The words around an asset page's price chart (rails-ops reference/asset-key-map.md;
// ui-jobs 818): the caption over it, naming the price it draws, and the join
// under it. With `via` the chart is the protocol's line; without it, or where
// the protocol has no stored line, it is the line most protocols read. Pure.

import { formatDate } from "../date";
import { seriesExplorer, type ViaView } from "./asset-via";
import type { PageLine } from "./asset-roster";

const DAY_MS = 86_400_000;

/** A line's source: its oracle, and the one contract the explorer reads it
 *  through where its series name one ("Chainlink ETH / USD through Liquity V2 WETH PriceFeed"). */
export function sourceName(line: Pick<PageLine, "oracle" | "series">, explorer?: string | null): string {
  const through = new Set(
    line.series
      .filter((s) => explorer != null && seriesExplorer(s.token.chain, s.key) === explorer)
      .map((s) => (s.via && s.via.kind !== "history" ? s.via.name : "")),
  );
  const [one] = [...through];
  return through.size === 1 && one ? `${line.oracle.name} through ${one}` : line.oracle.name;
}

/** The caption over the price chart. */
export function priceCaption(via: ViaView | null, main: Pick<PageLine, "oracle" | "series">, symbol: string): string {
  if (via?.lineId) return `The price ${via.name} uses: ${sourceName(main, via.explorer.id)}`;
  const read = `The price most protocols read: ${sourceName(main)}`;
  return via ? `${via.explorer.label} has no stored price for ${symbol} here. ${read}` : read;
}

/** The join under the chart: from which day its line is its stored rounds. */
export function joinText(joinDay: number): string {
  return `From ${formatDate(new Date(joinDay * DAY_MS))} the line is its stored oracle rounds, each day at its close; before it, the daily store.`;
}
