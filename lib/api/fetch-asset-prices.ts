// The Prices list's rows in the browser (app/api/prices/assets/list), read
// once a page load and shared by every asset icon's popover.

import type { AssetPriceList } from "@/lib/shared/asset-prices";

let pending: Promise<AssetPriceList | null> | null = null;

export function loadAssetPrices(): Promise<AssetPriceList | null> {
  pending ??= fetch("/api/prices/assets/list")
    .then((r) => (r.ok ? (r.json() as Promise<AssetPriceList>) : null))
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}
