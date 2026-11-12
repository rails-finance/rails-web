// A position's priced assets, as the latest-prices row draws them
// (components/shared/latest-prices.tsx). The fixed bottom strip this file once
// drew, the Market pages' dock for the inspector's toggle, is retired (ui-jobs
// 625): the inspector is armed from the profile menu.

export interface PriceStripAsset {
  symbol: string;
  address?: string;
  price: number;
  /** Quote `price` in this asset instead of USD (e.g. "ETH") — see PricePill.
   *  A position can carry the same symbol twice, once per unit (a native rate
   *  beside its USD conversion), so pair a `unit` with a `label` to keep both
   *  the React key and the tooltip distinct. */
  unit?: string;
  /** Tooltip override for when `symbol` alone would not say which reading
   *  this is (e.g. two pills for the same token, one per unit). Defaults to
   *  `symbol`. */
  label?: string;
}
