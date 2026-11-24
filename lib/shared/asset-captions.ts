// The words under an asset page's price chart (rails-ops reference/asset-key-map.md;
// ui-jobs 818): the join, the day its line becomes its stored rounds. Pure.

import { formatDate } from "../date";

const DAY_MS = 86_400_000;

/** The join under the chart: from which day its line is its stored rounds. */
export function joinText(joinDay: number): string {
  return `From ${formatDate(new Date(joinDay * DAY_MS))} the line is its stored oracle rounds, each day at its close; before it, the daily store.`;
}
