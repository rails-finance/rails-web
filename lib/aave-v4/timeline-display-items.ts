// Aave V4 spoke timeline display menu — the flags the spoke page's cards have
// a render path for (USD values, interest rates — the
// full set, unlike the chain-state tier's pared-down CHAIN_TRUTH_DISPLAY_ITEMS
// in timeline-toolbar.tsx). Order matches the retired
// AaveV4TimelineDisplayToggle: Timestamps, Timeline values, USD values (now
// two: stablecoins, other tokens), Interest rate, Event numbers.
//
// Lives in its own file (not timeline-toolbar.tsx) since that file is shared
// across every explorer.

import type { TimelineDisplayItem } from "@/components/shared/timeline-toolbar";

export const AAVE_V4_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimestamps", label: "Timestamps" },
  { key: "showTimelineValues", label: "Timeline values" },
  { key: "showUsdStable", label: "USD for stablecoins" },
  { key: "showUsdOther", label: "USD for other tokens" },
  { key: "showInterestRates", label: "Interest rate" },
  { key: "showEventNumbers", label: "Event numbers" },
];
