// A market's or vault's two tokens as one mark on a house-table row (rails-ops
// ui-jobs 539): the first token's mark at V6's 28px, the second's overlapping
// it, ringed in the row's stripe. The second can instead be the protocol the
// row wraps (a MakerDAO ilk's Spark or Uniswap), drawn as its mark on D1's
// pill ground. Silent: the row names both in words.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { DATA_TABLE_PILL } from "@/components/shared/data-table/data-table";

export interface PairToken {
  symbol: string;
  /** Where known; the mark is looked up by symbol without it. */
  address?: string;
}

const RING = "-ml-2 rounded-full ring-2 ring-[var(--surface-raised)] group-even/dt-row:ring-[var(--surface-stripe)]";

export function TokenPairIcons({
  first,
  second,
  protocol,
  fixed = false,
}: {
  first: PairToken;
  second?: PairToken | null;
  /** A `protocols.ts` id, drawn second where there is no second token. */
  protocol?: string | null;
  /** Hold a pair's width with one mark too, so a column's names align. */
  fixed?: boolean;
}) {
  return (
    <span className={`flex shrink-0 items-center ${fixed ? "w-12" : ""}`} aria-hidden data-prov-exempt="">
      <TokenChipIcon symbol={first.symbol} address={first.address} size={28} filterable={false} untitled />
      {second ? (
        <span className={RING}>
          <TokenChipIcon symbol={second.symbol} address={second.address} size={28} filterable={false} untitled />
        </span>
      ) : protocol ? (
        <span className={`${RING} flex h-7 w-7 items-center justify-center ${DATA_TABLE_PILL} rounded-full!`}>
          <ProtocolIcon id={protocol} className="h-4 w-4 shrink-0" />
        </span>
      ) : null}
    </span>
  );
}
