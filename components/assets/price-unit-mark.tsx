// The unit of a price as a mark beside the asset's icon (Miles, 4 Oct 2026,
// ui-jobs 234's row form): a USD mark, or the unit asset's icon (ETH), so a
// row carries no ticker text.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";

export function PriceUnitMark({ unit, size = 14 }: { unit: string; size?: number }) {
  if (unit === "usd")
    return (
      <span
        role="img"
        aria-label="USD"
        data-price-unit="usd"
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-rb-200 font-semibold text-rb-700 dark:bg-rb-700 dark:text-rb-200"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.7), lineHeight: 1 }}
      >
        $
      </span>
    );
  return (
    <span data-price-unit={unit} className="inline-flex shrink-0">
      <TokenChipIcon symbol={unit} size={size} filterable={false} />
    </span>
  );
}
