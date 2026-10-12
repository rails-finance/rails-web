// Aave V4 spoke timeline display menu — the flags the spoke page's cards have
// a render path for (interest rates and transaction hashes, unlike
// the chain-state tier's pared-down CHAIN_TRUTH_DISPLAY_ITEMS in
// timeline-toolbar.tsx). Order: Interest rate, Transaction hashes.
//
// Lives in its own file (not timeline-toolbar.tsx) since that file is shared
// across every explorer.

import { TX_HASH_ITEM, type TimelineDisplayItem } from "@/components/shared/timeline-toolbar";

export const AAVE_V4_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showInterestRates", label: "Interest rate" },
  TX_HASH_ITEM,
];
