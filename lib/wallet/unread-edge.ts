// The wallet card's one mark for an unread position (components/wallet/wallet-position-card.tsx):
// an open position whose chain read is missing carries the "Not read" stamp and no lifecycle
// pill. A position that is not open keeps its pill (Closed, Liquidated), notRead or not.

/** The card edge's `unread` for a wallet position: set only on an open, unread one. */
export function unreadEdge(p: { notRead?: boolean; status: string }): { unread?: true } {
  return p.notRead && p.status === "open" ? { unread: true } : {};
}
