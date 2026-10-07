// Whether an amount's USD value shows beside it on the timeline (rails-ops
// standards/detail-page-anatomy.md, "USD values on the timeline"). A USD value
// shows beside every amount the timeline prices, stablecoins included; the
// Display menu has no USD switch.

/** How far from $1 a stablecoin's price at the event may sit before it counts
 *  as off par. A later item colours the off-par stablecoin by this band. */
export const DEPEG_BAND = 0.01;

/** Whether a USD value shows: whenever one is priced. */
export function usdShown(usd: number | null | undefined): boolean {
  return usd != null && Number.isFinite(usd);
}

/** The line under a closed cell's USD tooltip: "At the event's price, $2,431.20
 *  per ETH". Null where the price is not a positive finite number. */
export function eventPriceText(price: number | null | undefined, symbol: string): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const digits = price >= 1 ? 2 : price >= 0.01 ? 4 : 6;
  return `At the event\u2019s price, $${price.toLocaleString("en-US", { minimumFractionDigits: price >= 1 ? 2 : 0, maximumFractionDigits: digits })} per ${symbol}`;
}
