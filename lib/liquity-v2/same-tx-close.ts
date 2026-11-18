// A Liquity V2 Trove opened and closed in one transaction (rails-ops
// TO-DO-ui-jobs 747): the listing row's status and transaction count settle it,
// and the card's status tag carries this receipt.
//
// The count is rails-server's `transaction_count` (sql/migrations/288,
// trove_metrics_mv, line 519): the Trove's distinct operation transactions, its
// distinct batch-manager transactions and its NFT transfer rows (mints
// excluded), added. A closed
// Trove's opening and its closing are both operations, so a count of 1 puts
// them in the same transaction.

import type { Provenance } from "@/components/shared/provenance";

/** The fields of a /api/troves row the rule reads. */
export interface SameTxCloseRow {
  status: string;
  /** The route serves the count as a string ("1"), typed as a number. */
  activity: { transactionCount: number | string };
}

/** Closed, with one transaction in the Trove's whole history. */
export function closedInOneTransaction(t: SameTxCloseRow): boolean {
  return t.status === "closed" && Number(t.activity.transactionCount) === 1;
}

/** The status tag's word. */
export const SAME_TX_CLOSE_WORD = "Closed · one transaction";

/** The tag's receipt: the row's two fields and the count's definition. */
export function sameTxCloseProv(collateralType: string, troveId: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `Opened and closed in one transaction — the ${collateralType} Trove's indexed row (GET /api/troves) reads status closed and transactionCount 1. The count adds the Trove's distinct operation transactions, its distinct batch-manager transactions and its NFT transfers, mints excluded (rails-server migration 288), so its opening and its closing share one transaction.`,
    via: "GET /api/troves · status, activity.transactionCount",
    inputs: [
      { label: "status", value: "closed", kind: "chain-derived", pclass: "indexed", note: `Trove ${troveId}` },
      {
        label: "activity.transactionCount",
        value: "1",
        kind: "chain-derived",
        pclass: "indexed",
        note: "distinct operation transactions + distinct batch-manager transactions + NFT transfers (mints excluded)",
      },
    ],
    verify: {
      kind: "recompute",
      text: "To check: open the Trove's timeline and read the transaction hash on its open and close events; they are the same.",
    },
  };
}
