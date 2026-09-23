// Shared liquidation indicator for position surfaces (listing + detail), across
// every protocol. Sits in the activity-meta cluster when the position has been
// liquidated at least once — a permanent piece of position history (the position
// may still be active afterwards, so this is orthogonal to the status pill).
//
// Form mirrors Liquity's redemption indicator: a bare red warning triangle, no
// pill background. When an exact count is known (Aave, Compound) it's shown next
// to the triangle; when only a boolean is known (Morpho, MakerDAO) the triangle
// stands alone. Color carries the tier — red (critical) for a liquidation, vs
// Liquity's amber (caution) for a redemption.

import { Icon } from "@/components/icons/icon";

export function LiquidatedBadge({ count }: { count?: number }) {
  const hasCount = typeof count === "number" && count > 0;
  const label = hasCount ? `Liquidated ${count} time${count === 1 ? "" : "s"}` : "Liquidated at least once";
  return (
    // data-prov-exempt: an index tally (activity-meta chrome), not a
    // chain-state figure — some cards (Aave V4, Fluid) mount this badge
    // outside PositionCardMeta's exempted cluster, so it declares itself.
    <span data-prov-exempt="" className="inline-flex items-center text-red-500" title={label} aria-label={label}>
      <Icon name="triangle" size={12} />
      {hasCount && <span className="ml-1 text-xs font-semibold">{count}</span>}
    </span>
  );
}
