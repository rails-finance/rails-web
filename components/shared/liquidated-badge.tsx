// Shared liquidation indicator for position surfaces (listing + detail), across
// every protocol. Sits in the activity-meta cluster when the position has been
// liquidated at least once — a permanent piece of position history (the position
// may still be active afterwards, so this is orthogonal to the status pill).
//
// Form mirrors Liquity's redemption indicator: a bare red warning triangle, no
// pill background. When an exact count is known (Aave, Compound) it's shown next
// to the triangle; when only a boolean is known (Morpho, MakerDAO) the triangle
// stands alone. Color carries the tier — red (critical) for a liquidation, vs
// Liquity's caution orange for a redemption.

import { Icon } from "@/components/icons/icon";
import { RevealTip } from "@/components/shared/reveal-tip";

export function LiquidatedBadge({ count, rule }: { count?: number; rule?: string }) {
  const hasCount = typeof count === "number" && count > 0;
  const base = hasCount ? `Liquidated ${count} time${count === 1 ? "" : "s"}` : "Liquidated at least once";
  // `rule`: what the count counts, where the protocol's logs hold liquidations
  // that moved nothing (f(x)).
  const label = rule ? `${base}. ${rule}` : base;
  return (
    // data-prov-exempt: an index tally (activity-meta chrome), not a
    // chain-state figure — some cards (Aave V4, Fluid) mount this badge
    // outside PositionCardMeta's exempted cluster, so it declares itself.
    // RevealTip is the one tooltip (hover, tap, keyboard focus); no native
    // title and no data-tooltip, so two never show together.
    <span data-prov-exempt="" className="inline-flex">
      <RevealTip tip={label} label={label} focusable className="text-red-500 focus-ring rounded-sm">
        <Icon name="triangle" size={12} />
        {hasCount && <span className="ml-1 text-xs font-semibold">{count}</span>}
      </RevealTip>
    </span>
  );
}
