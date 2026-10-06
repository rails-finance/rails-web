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
