// A position token sent to a router or settlement contract, and what came back
// to the wallet in the same transaction (rails-ops TO-DO-ui-jobs 438).
//
// Rails indexes the wallet's own logs, so from its side a sale through Zerion's
// app is one aToken transfer to a router. The transaction's receipt says the
// rest: what the wallet was paid back. `app/api/chain/tx-legs` reads it by hash
// (lib/sources/chain/tx-legs.ts) for the rows that qualify, and
// `saleReading` decides whether the row reads as a sale. No protocol log joins
// the two legs: the pairing is Rails' inference, and the receipt says so.
//
// Client-safe: types and pure functions only. Written against the registry's
// `kind`, never against one router, so every family whose position is a token
// can use it.

import type { ChainId } from "@/lib/shared/chains";
import { getProtocolContract, type ProtocolContract } from "@/lib/shared/known-infrastructure";

/** One token movement to or from the wallet in the transaction. */
export interface TxLeg {
  /** The token contract, lowercase; null for the chain's native coin. */
  token: string | null;
  /** Read for a leg paid back; a leg the wallet sent carries its token
   *  address here and 18 decimals, unread (the row names that token). */
  symbol: string;
  decimals: number;
  /** The untouched integer the log or the asset transfer carried. */
  raw: string;
  /** The other side of the movement, lowercase. */
  counterparty: string;
  /** Where the leg was read: a Transfer log in the receipt, or (native coin,
   *  which leaves no log) Alchemy's asset-transfers index. */
  source: "log" | "asset-transfers";
  /** The Transfer log's index in the block; absent on a native leg. */
  logIndex?: number;
}

/** A transfer out read as a sale: the contract it went to and the leg back. */
export interface RouterSale {
  /** The router or settlement contract, lowercase. */
  via: string;
  leg: TxLeg;
}

/** The route's answer for one transaction and one wallet. */
export interface TxLegs {
  chainId: ChainId;
  hash: string;
  wallet: string;
  blockNumber: number;
  /** Tokens the wallet sent, from the receipt's Transfer logs. */
  sent: TxLeg[];
  /** Tokens paid to the wallet: Transfer logs to it, and native transfers to
   *  it. A mint (from the zero address) of a token the wallet also sent is
   *  left out: that is an interest-bearing token minting the wallet's accrued
   *  interest as it moves (Aave's aToken does this on every transfer), and no
   *  payment. */
  back: TxLeg[];
  /** Upstream RPC calls this request spent: 0 on a cache hit. */
  rpcCalls: number;
  cached: boolean;
}

/** The registry kinds whose transfer out may be a sale: a router or a
 *  settlement contract pays the bought token back in the same transaction. */
const SALE_KINDS: ReadonlySet<ProtocolContract["kind"]> = new Set(["router", "settlement"]);

/** The contract a transfer out went to, where its kind qualifies the row for
 *  a receipt read; undefined for every other counterparty, which makes no
 *  read. */
export function saleVenue(counterparty: string | null | undefined, chainId: ChainId): ProtocolContract | undefined {
  const named = getProtocolContract(counterparty, chainId);
  return named && SALE_KINDS.has(named.kind) ? named : undefined;
}

/** Why a qualifying row stays "Transferred". */
export type SaleRefusal =
  /** Nothing came back to the wallet in this receipt: a bridge (the asset
   *  returns on another chain) or a deposit elsewhere. */
  | "no-leg-back"
  /** Some of the token the wallet sent came back. */
  | "partial-fill"
  /** More than one leg came back. */
  | "several-legs";

export type SaleReading = { sold: true; leg: TxLeg } | { sold: false; why: SaleRefusal };

// ── Miles's rulings, and the conservative defaults until he rules ───────────
//
// A ruling is a one-line change below.
//
// • A bridge (no leg back in this receipt): stays Transferred.   [ruled]
// • A router used as a deposit elsewhere (no leg back): stays Transferred.
//                                                                [ruled]
// • Several legs back: NOT YET RULED. Options: one row per leg, one row
//   naming the largest, or stays Transferred. Default: stays Transferred.
//   To choose "largest", set SEVERAL_LEGS to "largest".
// • A fee leg (a second, small leg back): NOT YET RULED. Options: ignore legs
//   under 1%, show it, or stays Transferred. Default: a second leg back stays
//   Transferred (it is a case of several legs). "Under 1%" across two tokens
//   needs a price at the block; `dropFeeLegs` is where that filter goes.
// • A partial fill (some of the sent token came back): NOT YET RULED.
//   Options: a sale of what went, or stays Transferred. Default: stays
//   Transferred. To read it as a sale of what went, set PARTIAL_FILL to
//   "sale".
//
// The page does not guess: without the read there is no sale.

const SEVERAL_LEGS: "transferred" | "largest" = "transferred";
const PARTIAL_FILL: "transferred" | "sale" = "transferred";

/** Whether the row reads as a sale, and of what. The tokens the wallet sent
 *  are the receipt's Transfer logs from it, the position token among them. */
export function saleReading(legs: Pick<TxLegs, "sent" | "back">): SaleReading {
  const sent = new Set(legs.sent.map((l) => l.token));
  const partial = legs.back.some((l) => sent.has(l.token));
  if (partial && PARTIAL_FILL === "transferred") return { sold: false, why: "partial-fill" };
  const other = dropFeeLegs(legs.back.filter((l) => !sent.has(l.token)));
  if (other.length === 0) return { sold: false, why: "no-leg-back" };
  if (other.length === 1) return { sold: true, leg: other[0] };
  if (SEVERAL_LEGS === "largest") return { sold: true, leg: largestLeg(other) };
  return { sold: false, why: "several-legs" };
}

/** The fee-leg ruling's hook: every leg is kept until Miles rules. */
function dropFeeLegs(legs: TxLeg[]): TxLeg[] {
  return legs;
}

/** The largest leg back, for the "largest" ruling. Legs in different tokens
 *  have no common unit without a price, so this compares within a token
 *  only and otherwise keeps the first; a price-aware comparison lands with
 *  the ruling. */
function largestLeg(legs: TxLeg[]): TxLeg {
  return legs.reduce((a, b) => (a.token === b.token && BigInt(b.raw) > BigInt(a.raw) ? b : a));
}

/** The leg's amount in whole tokens, as a decimal string (string arithmetic,
 *  every digit kept). */
export function legAmount(leg: Pick<TxLeg, "raw" | "decimals">): string {
  const raw = leg.raw.replace(/^0+(?=\d)/, "");
  if (leg.decimals <= 0) return raw;
  const padded = raw.padStart(leg.decimals + 1, "0");
  const whole = padded.slice(0, -leg.decimals);
  const frac = padded.slice(-leg.decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
