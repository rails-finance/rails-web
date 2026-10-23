// The Aave V3 family's timeline head as words (rails-ops decision 0045,
// TO-DO-ui-jobs 367): Aave V3 on Ethereum and Base, Seamless and SparkLend. The
// kind is a past participle; a transfer's counterparty follows as its clause.
// Each family hands its own table, the `t1_*` words of its strings file
// (content/aave-v3/event-prose.yaml, content/spark/event-prose.yaml), read by
// its loader.

import type { AaveV3SwapKind } from "@/lib/shared/types/event-shape";

/** One family's head words, in its strings file's `t1_*` entries. */
export interface AaveFamilyHeadTable {
  sep: string;
  supplied: string;
  withdrew: string;
  borrowed: string;
  repaid: string;
  liquidated: string;
  writtenOff: string;
  feePaid: string;
  transferred: string;
  to: string;
  from: string;
  /** The lead before the known contract a supply, borrow or repay went
   *  through. A family without it reads no clause. */
  via?: string;
  swap: Record<AaveV3SwapKind, string>;
  emode: string;
  emodeOff: string;
  emodeCategory: string;
  legSeized: string;
  legRepaid: string;
  legWrittenOff: string;
  legSent: string;
  legReceived: string;
  /** The protocol's treasury, a liquidation fee's recipient. */
  treasury: string;
  /** The family's WETH gateway, where no registry names it (SparkLend). */
  gatewayName?: string;
  /** A transfer in from a distributor: the wallet sent the claim, or the
   *  payout was pushed to it. A family without them reads "Transferred". */
  claimed?: string;
  received?: string;
  /** A transfer out to a staking contract. A family without it reads
   *  "Transferred". */
  staked?: string;
  /** The lead before the protocol a migration helper moved the position
   *  from. A family without it reads the plain kind. */
  migrated?: string;
}

/** What the head reads of a row. `fee`: a liquidation's fee transfer to the
 *  treasury. `gateway`: an aToken transfer to the WETH gateway, a withdrawal
 *  paid out as ETH. `payout`: a transfer in from a distributor, claimed by the
 *  wallet or received. `stake`: a transfer out to a staking contract.
 *  `migratedFrom`: the protocol a migration helper moved the supply or borrow
 *  from. */
export interface AaveFamilyHeadRow {
  eventType: string;
  fee?: boolean;
  gateway?: boolean;
  payout?: "claimed" | "received";
  stake?: boolean;
  migratedFrom?: string;
  swapKind?: AaveV3SwapKind;
}

/** The row's past-participle kind. */
export function aaveFamilyT1Kind(row: AaveFamilyHeadRow, w: AaveFamilyHeadTable): string {
  if (row.fee) return w.feePaid;
  if (row.gateway) return w.withdrew;
  if (row.payout && w[row.payout]) return w[row.payout]!;
  if (row.stake && w.staked) return w.staked;
  if (row.migratedFrom && w.migrated) return `${w.migrated} ${row.migratedFrom}`;
  if (row.eventType === "swap" && row.swapKind) return w.swap[row.swapKind];
  switch (row.eventType) {
    case "supply":
      return w.supplied;
    case "withdraw":
      return w.withdrew;
    case "borrow":
      return w.borrowed;
    case "repay":
      return w.repaid;
    case "liquidation":
      return w.liquidated;
    case "bad_debt_written_off":
      return w.writtenOff;
    case "transfer_in":
    case "transfer_out":
      return w.transferred;
    case "emode":
      return w.emode;
    default:
      return row.eventType;
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Supplied", "Transferred · to 0x1234…abcd". `party`: a
 *  transfer's counterparty clause, its lead and its name or address. */
export function aaveFamilyT1Caption(
  kind: string,
  w: AaveFamilyHeadTable,
  party?: { lead: string; address: string; name?: string | null },
): string {
  if (!party) return kind;
  return `${kind} ${w.sep} ${party.lead} ${party.name ?? short(party.address)}`;
}

/** An e-mode switch's words: "E-mode" and the category's name as its clause,
 *  or "E-mode off". */
export function aaveFamilyEmodeWords(
  toId: number,
  toLabel: string | null,
  w: AaveFamilyHeadTable,
): { kind: string; category: string | null } {
  if (toId === 0) return { kind: w.emodeOff, category: null };
  return { kind: w.emode, category: toLabel ?? `${w.emodeCategory} ${toId}` };
}
