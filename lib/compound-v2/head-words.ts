// The cToken families' timeline head as words (rails-ops decision 0045,
// TO-DO-ui-jobs 367): Compound V2 and Moonwell. The kind is a past
// participle; a transfer's counterparty follows as its clause, and the spine
// carries the figures. Each family hands its own table, the `t1_*` words of
// its strings file (content/compound-v2/event-prose.yaml,
// content/moonwell/event-prose.yaml), read by its loader.

/** One family's head words, in its strings file's `t1_*` entries. */
export interface CTokenHeadTable {
  sep: string;
  supplied: string;
  withdrew: string;
  borrowed: string;
  repaid: string;
  liquidated: string;
  transferred: string;
  to: string;
  from: string;
  /** A seizure leg's party chip: "by" the liquidator. */
  by: string;
  /** Compound V2's named seizure legs. */
  seizedOut?: string;
  seizedIn?: string;
  seizeBurn?: string;
  legSent: string;
  legReceived: string;
  legSeized: string;
  legRepaid: string;
}

/** The row's past-participle kind. An event type the table has no word for
 *  keeps the label it came with. */
export function cTokenT1Kind(eventType: string, w: CTokenHeadTable, fallback: string): string {
  switch (eventType) {
    case "mint":
      return w.supplied;
    case "redeem":
      return w.withdrew;
    case "borrow":
      return w.borrowed;
    case "repay":
      return w.repaid;
    case "liquidation":
      return w.liquidated;
    case "transfer_in":
    case "transfer_out":
      return w.transferred;
    case "seize_out":
      return w.seizedOut ?? fallback;
    case "seize_in":
      return w.seizedIn ?? fallback;
    case "seize_burn":
      return w.seizeBurn ?? fallback;
    default:
      return fallback;
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Supplied", "Transferred · to 0x1234…abcd". `party`: a
 *  transfer's counterparty clause, its lead and its name or address. */
export function cTokenT1Caption(
  kind: string,
  w: { sep: string },
  party?: { lead: string; address: string; name?: string | null },
): string {
  if (!party) return kind;
  return `${kind} ${w.sep} ${party.lead} ${party.name ?? short(party.address)}`;
}
