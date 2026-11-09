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
// Client-safe: types and pure functions only, and no runtime import, so the
// unit tests load it directly. The venue test (`saleVenue`) is
// lib/shared/sale-venue.ts.

import type { ChainId } from "@/lib/shared/chains";

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
   *  which leaves no log) a value transfer inside the transaction, read from
   *  the stored call tree (`trace`) or Alchemy's asset-transfers index. */
  source: "log" | "trace" | "asset-transfers";
  /** The Transfer log's index in the block; absent on a native leg. */
  logIndex?: number;
  /** USD per whole token at the transaction's block, from the chain's Aave
   *  oracle through rails-server's at-block oracle prices (the source of the
   *  event rows' at-block USD). Read only for legs back in two or more
   *  tokens, where the reading compares them; absent where the oracle does
   *  not price the token. */
  usd?: number;
}

/** Some of the token the wallet sent came back in the same transaction: the
 *  row is a sale of what went. Integers in the sent token's units. */
export interface PartialFill {
  sentRaw: string;
  returnedRaw: string;
  soldRaw: string;
  decimals: number;
}

/** What the receipt says was sold and what came back. */
export interface SaleDetail {
  /** The leg back the row names: the only one, or the largest. */
  leg: TxLeg;
  /** Legs back in tokens other than the one sent, fee legs left out. */
  legsBack: number;
  /** Legs back under 1% of the largest, left out as fees. */
  feeLegs: number;
  partial?: PartialFill;
}

/** A transfer out read as a sale: the contract it went to and the leg back. */
export interface RouterSale extends SaleDetail {
  /** The router or settlement contract, lowercase. */
  via: string;
}

/** The route's answer for one transaction and one wallet. */
export interface TxLegs {
  chainId: ChainId;
  hash: string;
  wallet: string;
  blockNumber: number;
  /** The contract the transaction entered (the receipt's `to`), lowercase;
   *  null for a contract creation. The timeline's side bar names its owner
   *  where the registry gives it a `bar` (rails-ops TO-DO-ui-jobs 439). */
  to: string | null;
  /** Tokens the wallet sent, from the receipt's Transfer logs. */
  sent: TxLeg[];
  /** Tokens paid to the wallet: Transfer logs to it, and native transfers to
   *  it. A mint (from the zero address) of a token the wallet also sent, or
   *  also received from another account, is left out: that is an
   *  interest-bearing token minting the wallet's accrued interest as its
   *  balance moves (Aave's aToken does this on every transfer), and no
   *  payment. */
  back: TxLeg[];
  /** Upstream chain calls this web process spent for the request (the
   *  at-block store's own reads are not counted): 0 on a cache hit. */
  rpcCalls: number;
  cached: boolean;
}

/** Why a qualifying row stays "Transferred". */
export type SaleRefusal =
  /** Nothing came back to the wallet in this receipt: a bridge (the asset
   *  returns on another chain) or a deposit elsewhere. */
  | "no-leg-back"
  /** Some of the token the wallet sent came back (under PARTIAL_FILL =
   *  "transferred"), or all of it did. */
  | "partial-fill"
  /** More than one leg came back and none can be named the largest. */
  | "several-legs"
  /** A token the wallet also sent, other than the row's, came back: a
   *  batched transaction whose legs Rails does not pair. */
  | "batched";

export type SaleReading = ({ sold: true } & SaleDetail) | { sold: false; why: SaleRefusal };

// ── Miles's rulings (2 Nov 2026) ────────────────────────────────────────────
//
// Each is a one-line switch below.
//
// • A bridge (no leg back in this receipt): stays Transferred.
// • A router used as a deposit elsewhere (no leg back): stays Transferred.
// • Several legs back: one row naming the largest (SEVERAL_LEGS =
//   "largest"; "transferred" turns it off). Within one token the amounts are
//   compared; across tokens their USD value at the block, from the Aave
//   oracle price on each leg (`usd`). Where a leg has no price the legs
//   cannot be ranked and the row stays Transferred.
// • A fee leg: a leg back under 1% of the largest leg back is left out
//   (`dropFeeLegs`, FEE_SHARE). Within one token the amounts are compared;
//   across tokens the USD value at the block. Where a price is missing no leg
//   is left out, and several legs then read as above.
// • A partial fill (some of the sent token came back): a sale of what went
//   (PARTIAL_FILL = "sale"): the sent amount less what came back in the same
//   token. Where all of it came back nothing was sold, and the row stays
//   Transferred.
// • A leg back in another token the wallet also sent in the transaction (a
//   batched transaction: a withdrawal, a swap and a supply in one) leaves
//   the legs unpaired, and the row stays Transferred.
//
// The page does not guess: without the read there is no sale.

const SEVERAL_LEGS: "transferred" | "largest" = "largest";
const PARTIAL_FILL: "transferred" | "sale" = "sale";
/** A leg back under this share of the largest is a fee. */
const FEE_SHARE = 100; // 1 / 100 = 1%

/** Whether the row reads as a sale, and of what. The tokens the wallet sent
 *  are the receipt's Transfer logs from it, the position token among them;
 *  `via` names the row's leg out (the first sent leg where absent). */
export function saleReading(legs: Pick<TxLegs, "sent" | "back">, via?: string): SaleReading {
  const sentTokens = new Set(legs.sent.map((l) => l.token));
  const row = (via && legs.sent.find((l) => l.counterparty === via.toLowerCase())) || legs.sent[0];
  const returned = legs.back.filter((l) => sentTokens.has(l.token));
  if (returned.some((l) => l.token !== row?.token)) return { sold: false, why: "batched" };
  let partial: PartialFill | undefined;
  if (returned.length > 0) {
    if (PARTIAL_FILL === "transferred") return { sold: false, why: "partial-fill" };
    const fill = partialFill(legs.sent, returned, row.token);
    if (fill === "all") return { sold: false, why: "partial-fill" };
    partial = fill;
  }
  const other = legs.back.filter((l) => !sentTokens.has(l.token));
  const kept = dropFeeLegs(other);
  if (kept.length === 0) return { sold: false, why: "no-leg-back" };
  const leg = kept.length === 1 ? kept[0] : SEVERAL_LEGS === "largest" ? largestLeg(kept) : undefined;
  if (!leg) return { sold: false, why: "several-legs" };
  return {
    sold: true,
    leg,
    legsBack: kept.length,
    feeLegs: other.length - kept.length,
    ...(partial ? { partial } : {}),
  };
}

/** The row's token sent, less what came back of it (`back`, all in that
 *  token): "all" where none of it went. */
function partialFill(sent: TxLeg[], back: TxLeg[], token: string | null): PartialFill | "all" {
  const sum = (ls: TxLeg[]) => ls.reduce((s, l) => s + BigInt(l.raw), BigInt(0));
  const sentRaw = sum(sent.filter((l) => l.token === token));
  const returnedRaw = sum(back);
  if (returnedRaw >= sentRaw) return "all";
  return {
    sentRaw: sentRaw.toString(),
    returnedRaw: returnedRaw.toString(),
    soldRaw: (sentRaw - returnedRaw).toString(),
    // The leg back's decimals were read; the sent leg's were not.
    decimals: back[0].decimals,
  };
}

/** The fee-leg ruling: legs back under 1% of the largest leg back are left
 *  out. With no largest (a price missing across tokens) every leg is kept. */
function dropFeeLegs(legs: TxLeg[]): TxLeg[] {
  if (legs.length < 2) return legs;
  const main = largestLeg(legs);
  if (!main) return legs;
  return legs.filter((l) => l === main || !underFeeShare(l, main));
}

function underFeeShare(leg: TxLeg, main: TxLeg): boolean {
  if (leg.token === main.token) return BigInt(leg.raw) * BigInt(FEE_SHARE) < BigInt(main.raw);
  const a = usdValue(leg);
  const b = usdValue(main);
  return a != null && b != null && a * FEE_SHARE < b;
}

/** The largest leg back: by amount where every leg is one token, by USD value
 *  at the block across tokens; undefined where a leg across tokens has no
 *  price. */
function largestLeg(legs: TxLeg[]): TxLeg | undefined {
  if (legs.every((l) => l.token === legs[0].token))
    return legs.reduce((a, b) => (BigInt(b.raw) > BigInt(a.raw) ? b : a));
  const valued = legs.map((l) => ({ l, usd: usdValue(l) }));
  if (valued.some((v) => v.usd == null)) return undefined;
  return valued.reduce((a, b) => (b.usd! > a.usd! ? b : a)).l;
}

function usdValue(leg: TxLeg): number | undefined {
  return leg.usd != null ? Number(legAmount(leg)) * leg.usd : undefined;
}

/** Whether a reading of these legs back compares tokens, and so needs their
 *  prices at the block: two or more tokens among the legs back other than the
 *  ones sent. */
export function needsLegPrices(legs: Pick<TxLegs, "sent" | "back">): boolean {
  const sentTokens = new Set(legs.sent.map((l) => l.token));
  return new Set(legs.back.filter((l) => !sentTokens.has(l.token)).map((l) => l.token)).size > 1;
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
