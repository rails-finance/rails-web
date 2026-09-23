// Cross-hub reshape of the hub view-model for the asset table on /aave-v4/hubs.
// The summary band reads HubView[] directly; the table needs the per-(hub,
// asset) credit lines flattened into one list. Pure transform — no filtering or
// sorting here (the view owns that, so one filter set scopes band + table).
//
// Framing is unchanged from hub-view: present, don't rank. This only reshapes;
// it adds no score and imposes no order.

import type { HubView, HubAssetAgg } from "@/lib/aave-v4/hub-view";
import type { HubTierKey } from "@/lib/api/fetch-aave-v4-hubs";

/** One credit line: an asset as it appears in a single hub. The table renders
 *  one of these per row (an asset listed in two hubs is two rows). */
export interface HubAssetRow {
  hub: HubTierKey;
  hubLabel: string;
  asset: HubAssetAgg;
}

export function flattenHubAssets(views: HubView[]): HubAssetRow[] {
  const rows: HubAssetRow[] = [];
  for (const v of views) {
    for (const a of v.assets) rows.push({ hub: v.hub, hubLabel: v.label, asset: a });
  }
  return rows;
}
