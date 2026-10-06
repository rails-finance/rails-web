// Aave V4 spoke timeline display menu — the flags the spoke page's cards have
// a render path for (timeline values, interest rates — the full set, unlike
// the chain-state tier's pared-down CHAIN_TRUTH_DISPLAY_ITEMS in
// timeline-toolbar.tsx). Order: Timeline values, Interest rate.
//
// Lives in its own file (not timeline-toolbar.tsx) since that file is shared
// across every explorer.

import type { TimelineDisplayItem } from "@/components/shared/timeline-toolbar";

export const AAVE_V4_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimelineValues", label: "Timeline values" },
  { key: "showInterestRates", label: "Interest rate" },
];
