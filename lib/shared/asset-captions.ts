// The words around an asset page's two charts (rails-ops reference/asset-key-map.md;
// ui-jobs 818): the caption over the price chart, naming the price the page
// charts, the caption over the gap chart, and the join under them. With
// `via` the price chart is the protocol's line; without it, or where the
// protocol has no stored line, it is the line most protocols read. Pure.

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

const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

/** The captions over the price chart and the gap chart (null where no other line is drawn). */
export function chartCaptions(
  via: ViaView | null,
  main: Pick<PageLine, "oracle" | "series">,
  symbol: string,
  others: number,
): { price: string; gap: string | null } {
  if (via?.lineId) {
    return {
      price: `The price ${via.name} uses: ${sourceName(main, via.explorer.id)}`,
      gap: others > 0 ? `Other protocols' prices for ${symbol}, against ${possessive(via.name)}` : null,
    };
  }
  const read = `The price most protocols read: ${sourceName(main)}`;
  return {
    price: via ? `${via.explorer.label} has no stored price for ${symbol} here. ${read}` : read,
    gap: others > 0 ? `Other protocols' prices for ${symbol}, against the most-read price` : null,
  };
}

/** The join under the charts: from which day the lines are their stored rounds.
 *  `lines` are the lines that read rounds, of `drawn` lines drawn. */
export function joinText(lines: readonly { rounds: { joinDay: number } }[], drawn: number, joinDay: number): string {
  const n = lines.length;
  const day = formatDate(new Date(joinDay * DAY_MS));
  const who =
    n === drawn
      ? n === 1
        ? "the line is its"
        : "the lines are their"
      : `${n} of the ${drawn} lines ${n === 1 ? "is its" : "are their"}`;
  const one = lines.every((l) => l.rounds.joinDay === joinDay);
  return one
    ? `From ${day} ${who} stored oracle rounds, each day at its close; before it, the daily store.`
    : `${who[0].toUpperCase()}${who.slice(1)} stored oracle rounds from the time each line's stamp names, each day at its close; before it, the daily store.`;
}
