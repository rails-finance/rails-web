// The Morpho Blue wallet card's market totals, on Base and Ethereum
// (rails-server mig 516 and 532). The stored card's totals and their state
// stamp are not read: before those migrations apply the card still carries
// them, and they are dated by the market-state refresh. An
// open card owing a debt takes the totals of the visit's head read instead,
// and a card the head read did not reach keeps what the stored row can still
// say: the collateral and the borrowed-less-repaid principal. The row's
// read_block and read_at are its last event's after mig 532, so the Ethereum
// module reads every open row at visit and stamps it with that read.

import type { MorphoIndexRead, RawMorphoPositionRow } from "@/lib/sources/api/morpho-positions";

/** The stored card with its market totals and their state stamp left out. */
export function storedMorphoCard(card: unknown): RawMorphoPositionRow {
  const { state_in_refresh_set: _refreshSet, ...rest } = card as RawMorphoPositionRow & {
    state_in_refresh_set?: unknown;
  };
  return {
    ...rest,
    total_borrow_assets: null,
    total_borrow_shares: null,
    state_block: null,
    state_read_at: null,
    state_stale: null,
  };
}

/** What a head read of the position states about its market's borrow side:
 *  the position's borrow shares and the market's totals, accrued to the
 *  read's block (lib/sources/chain/morpho-position.ts). */
export interface MorphoHeadTotals {
  borrowSharesRaw: string;
  totalBorrowAssetsRaw: string;
  totalBorrowSharesRaw: string;
  blockNumber: number;
  /** The block's unix seconds. */
  timestamp: number;
}

const sharesOf = (raw: string | null | undefined): bigint | null => {
  if (raw == null || raw === "") return null;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return null;
  }
};

/** The stamp a card's debt receipt names for the visit's head read. */
export const headIndex = (head: Pick<MorphoHeadTotals, "blockNumber" | "timestamp">): MorphoIndexRead => ({
  block: head.blockNumber,
  readAt: new Date(head.timestamp * 1000).toISOString(),
  stale: false,
  atHead: true,
});

/** The stored card with the head read's totals in place of the stored ones,
 *  for the listing builder to convert the borrow shares through. Null where
 *  the head read's borrow shares are not the stored row's: a position that
 *  moved since its last indexed event, whose principal the stored row no
 *  longer states (as morphoViewFromSweep gates the Base page). */
export function morphoCardAtHead(stored: RawMorphoPositionRow, head: MorphoHeadTotals): RawMorphoPositionRow | null {
  const storedShares = sharesOf(stored.bsh_raw);
  if (storedShares == null || storedShares !== sharesOf(head.borrowSharesRaw)) return null;
  const index = headIndex(head);
  return {
    ...storedMorphoCard(stored),
    total_borrow_assets: head.totalBorrowAssetsRaw,
    total_borrow_shares: head.totalBorrowSharesRaw,
    state_block: String(index.block),
    state_read_at: index.readAt,
    state_stale: false,
    state_at_head: true,
  };
}
