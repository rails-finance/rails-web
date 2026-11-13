// The Transmuter's and V2's visible words, in Alchemix's docs' terms (rails-ops
// decision 0065; reference/official-docs/alchemix.md, "Terms: the Transmuter
// and V2 surfaces" and "Owner's calls", ui-jobs 646). A label on a Transmuter
// or V2 surface comes from here; CSV column keys and routes do not change with
// it.
//
//   • A deposit "vests" (TR "Each deposit vests linearly over the
//     Transmutation Time"); the docs' "convert" is the MYT unwrap, a
//     different step.
//   • The unvested share is "returned as alAssets minus the early exit fee"
//     (RT).
//   • V2's end is the migration and its figures the snapshot (MG); the Safe
//     is the "v3 admin Safe" (CE).

export const TRANSMUTER_WORDS = {
  /** The deposit: head, timeline, flows, figure, filter (call 1). */
  deposited: "Deposited",
  depositedAt: "Deposited at",
  /** Call 2. */
  vested: "Vested",
  vestedByBlocks: "Vested, by the blocks passed",
  notYetVested: "Not yet vested",
  /** Call 3. */
  returned: "Returned",
  returnedUnvested: "returned unvested",
  /** Call 4: the docs' concept page and contract name. */
  earlyExitFee: "Early exit fee",
  paidOut: "Paid out",
  payout: "Payout",
  removedFromCap: "Removed from the cap",
  /** Call 13: listing status filter. */
  statusVesting: "Vesting",
  statusMatured: "Matured, not claimed",
  claimed: "Claimed",
  claimedBy: "Claimed by",
  maturesAt: "Matures at",
  maturityBlock: "Maturity block",
  amountDeposited: "Amount deposited",
} as const;

/** The poke, as the docs (TC, SM) and the poke's receipt (read 6, Base
 *  0xde5a…c93a: one PositionPoked log, no Transfer) state it. */
export const TRANSMUTER_POKE_SENTENCE =
  "The position was poked: the Transmuter removed its amount from the deposit cap count. A poke moves no tokens.";

export const V2_WORDS = {
  /** Call 9: the one status word (MG "V2 positions were migrated into the V3
   *  ecosystem"). */
  status: "Migrated",
  debtSnapshot: "Debt in the snapshot",
  creditSnapshot: "Credit in the snapshot",
  collateralSnapshot: "Collateral in the snapshot",
  heldSnapshot: "Held in the snapshot",
  owedSnapshot: "Owed in the snapshot",
  snapshotGroup: "In the snapshot",
  snapshotAt: "snapshot at",
  nowOnV3: "Now on V3",
  /** Call 10: CE "v3 admin Safe (Alchemist and Transmuter admin, MYT owner)". */
  safe: "v3 admin Safe",
} as const;

/** The legacy (V2) docs: v2-docs.alchemix.fi, linked from docs.alchemix.fi as
 *  "Legacy Docs" (ruled official, ui-jobs 646). */
export const ALCHEMIX_V2_DOCS = "https://v2-docs.alchemix.fi";
