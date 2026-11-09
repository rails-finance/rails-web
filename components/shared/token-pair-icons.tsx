// A market's or vault's two tokens as one mark on a house-table row (rails-ops
// ui-jobs 539): the first token's mark at V6's 28px, the second's overlapping
// it, ringed in the row's stripe. Silent: the row names both tokens in words.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";

export interface PairToken {
  symbol: string;
  /** Where known; the mark is looked up by symbol without it. */
  address?: string;
}

export function TokenPairIcons({ first, second }: { first: PairToken; second?: PairToken | null }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden data-prov-exempt="">
      <TokenChipIcon symbol={first.symbol} address={first.address} size={28} filterable={false} untitled />
      {second && (
        <span className="-ml-2 rounded-full ring-2 ring-[var(--surface-raised)] group-even/dt-row:ring-[var(--surface-sunken)]">
          <TokenChipIcon symbol={second.symbol} address={second.address} size={28} filterable={false} untitled />
        </span>
      )}
    </span>
  );
}
