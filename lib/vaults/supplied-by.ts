// "Supplied by vaults" (rails-ops ui-jobs 549 step 4, survey §3.2's
// `suppliedBy`): the vaults on Rails's rosters that hold a position in one
// market or reserve, as a market or reserve page lists them. Client-safe: the
// reads are lib/vaults/supplied-by-read.ts, the section is
// components/shared/product/supplied-by-vaults.tsx.
//
// The shape is plain data, so a server page and an API route hand it on alike.

import type { ChainId } from "@/lib/shared/chains";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

/** One vault in the market: its page, its steward, its amount there. */
export interface SuppliedByRow {
  /** Lowercased. */
  address: string;
  name: string;
  /** The family and release as a pill reads them ("MetaMorpho V1.1"), or what
   *  the vault does here ("Umbrella stake"). */
  kind: string;
  /** The vault's page under its protocol. */
  href: string;
  /** The role the contract names, in the vault card's words. */
  steward: { address: string; role: string } | null;
  /** In the market's asset; null where the read did not answer. */
  amount: RawAmount | null;
  /** The amount's receipt: what it is and the calls behind it. */
  amountWhat: string;
  amountVia: string;
}

export interface SuppliedByRead {
  chainId: ChainId;
  /** The block the amounts were read at; 0 where the read failed. */
  block: number;
  head?: PositionHeadStamp;
  /** The market's asset: the unit of every amount. */
  asset: { symbol: string; address: string; decimals: number };
  /** Largest amount first. */
  rows: SuppliedByRow[];
  /** The contracts read, for the read stamp's receipt. */
  contracts: { name: string; address: string; reads: string }[];
  /** Which roster the vaults come from, for the receipt: "the MetaMorpho
   *  roster on Base". */
  roster: string;
  /** The read did not answer: the section says so. */
  failed?: boolean;
}

/** Largest first; an unread amount last. */
export const byAmountDesc = (a: SuppliedByRow, b: SuppliedByRow): number => {
  if (a.amount == null) return b.amount == null ? 0 : 1;
  if (b.amount == null) return -1;
  const x = BigInt(a.amount.raw);
  const y = BigInt(b.amount.raw);
  return x === y ? 0 : x > y ? -1 : 1;
};
