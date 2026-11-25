// The CoW wallet page's `?at=` landing: the trade a link opens the page at.
// Two forms. A trade's own id (`<block>-<txIndex>-<logIndex>`, its row's
// `event-<id>`), or `<block>-<orderUid>` for a link that knows the order and
// its block but not the Trade log's place in the block (an Aave swap's record
// holds the order UID). The trades route's `before` cursor is exclusive, so
// the read starts just past the target: the trade itself is the page's first
// row, or for the order form among the block's trades at its top.

// Twelve digits a part keeps the +1 below 2^53, so the cursor stays digits.
const TRADE_ID = /^(\d{1,12})-(\d{1,12})-(\d{1,12})$/;
const ORDER = /^(\d{1,12})-(0x[0-9a-f]{112})$/;
/** The trades route's cursor shape (lib/sources/api/cow.ts): a cursor that
 *  fails it is dropped there, and the read would start at the newest trade. */
const CURSOR = /^\d+-\d+-\d+$/;

export interface CowLanding {
  /** The read's `before`: the first page holds the target. */
  cursor: string;
  /** The target's trade id, or its block and order UID. */
  match: { id: string } | { block: number; orderUid: string };
}

export function parseCowLanding(at: string | undefined | null): CowLanding | null {
  if (!at) return null;
  const v = at.trim().toLowerCase();
  const t = TRADE_ID.exec(v);
  const o = t ? null : ORDER.exec(v);
  const landing: CowLanding | null = t
    ? { cursor: `${t[1]}-${t[2]}-${Number(t[3]) + 1}`, match: { id: v } }
    : o
      ? { cursor: `${Number(o[1]) + 1}-0-0`, match: { block: Number(o[1]), orderUid: o[2] } }
      : null;
  return landing && CURSOR.test(landing.cursor) ? landing : null;
}

/** Whether a trade is the landing's target. */
export function isCowLandingTrade(
  landing: CowLanding,
  t: { id: string; blockNumber: number; orderUid: string },
): boolean {
  const m = landing.match;
  return "id" in m ? t.id === m.id : t.blockNumber === m.block && t.orderUid.toLowerCase() === m.orderUid;
}

/** The CoW wallet page opened at one order's trade in a block. */
export function cowTradeHref(wallet: string, block: number, orderUid: string): string {
  return `/ethereum/cow/${wallet.toLowerCase()}?at=${block}-${orderUid.toLowerCase()}`;
}

/** Where an Aave position swap's CoW trade opens on the wallet's CoW page: an
 *  order the wallet owns (a withdraw and swap, a supply from a swap) on
 *  Ethereum, the page's one chain. An order Aave's one-order adapter owns is
 *  not on that page: undefined, as for ParaSwap. */
export function aaveSwapCowTradeHref(
  swap: { kind: string; route: string; orderUid?: string; tradeOwner?: string } | null | undefined,
  wallet: string | undefined,
  block: number | undefined,
  chainId: number | null | undefined,
): string | undefined {
  if (!swap || swap.route === "paraswap" || !swap.orderUid || !wallet || block == null || chainId !== 1)
    return undefined;
  if (swap.kind !== "withdraw_and_swap" && swap.kind !== "supply_from_swap") return undefined;
  if (swap.tradeOwner?.toLowerCase() !== wallet.toLowerCase()) return undefined;
  return cowTradeHref(wallet, block, swap.orderUid);
}
