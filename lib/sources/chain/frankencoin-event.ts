// One Frankencoin position event read from its transaction receipt — where the
// ZCHF and the collateral went, which the indexed events do not say — plus the
// few position and hub values in force at that block.
//
// THE WINDOW. A receipt can carry several positions' updates (a roll repays one
// position and mints on another; a bot can bid on two challenges at once). The
// contracts emit an event's token movements BEFORE the event that closes it, so
// the logs that belong to this event are the ones after the previous closing
// log and up to this event's own log:
//
//   • a MintingUpdate row: from the previous MintingUpdate (any position) to
//     this position's MintingUpdate. PositionV2._mint → mintWithReserve emits
//     the borrower's and the reserve's mints and the Profit, then the
//     MintingUpdate; repay burns, then emits.
//   • a challenge row: from the previous hub challenge event to this one.
//     MintingHubV2.bid returns the challenger's collateral, pays the position's
//     collateral to the bidder (the position's MintingUpdate), takes the bid,
//     pays the reward, covers a shortfall or pays out an excess, burns the
//     repayment, then emits ChallengeSucceeded (or, in phase 1, pays the
//     challenger and hands its collateral to the buyer, then ChallengeAverted).
//
// With `log` (the event's log index) every figure is this event's alone. Without
// it the whole receipt is read and a transaction that also updates another
// position returns `shared`, and the callers state none of the figures.
//
//   • mint: the ZCHF minted to the borrower (what the wallet received), the
//     ZCHF minted to the reserve (the Equity contract), and the Profit the
//     position reported, which is the up-front interest; the reserve share is
//     the reserve mint less that interest. And the annual rate, expiry and start
//     read from the position at that block, which set the interest.
//   • repayment: the ZCHF burned from the payer and the ZCHF the reserve sent
//     back to it (the position's assigned reserve share), plus any ZCHF burned
//     from the reserve directly.
//   • challenge averted: who bought the challenger's collateral, for how much
//     ZCHF, and the minting cooldown the position set.
//   • challenge succeeded: the bidder, the reward, the challenger's collateral
//     returned, the debt burned, a shortfall the reserve covered (Loss) or an
//     excess paid to the owner, and the reserve share the burn released.
//   • creation handover: whether the new owner is a contract.
//   • forced sale (MintingHubV2.buyExpiredCollateral → PositionV2.forceSale):
//     the buyer, the collateral sold and the price per unit (the ForcedSale
//     log), the cost the hub charged (price × amount, as the hub computes it),
//     and which of forceSale's branches ran, read from its ZCHF transfers —
//     full repayment (the reserve sends the buyer the assigned reserve share,
//     the debt is burned from the buyer, the rest goes to the owner), partial
//     repayment (the proceeds go to the position and repay what they can), a
//     shortfall (the reserve's coverLoss pays the rest, Loss), or no debt (the
//     whole price goes to the owner). The terms that set the price — declared
//     price, expiration, challenge period — and the debt and reserve
//     percentage are read one block earlier, in one multicall.
//   • opening (an original's PositionOpened row): the collateral the opening
//     transaction moved into the position, the opening fee (the Profit the hub
//     reported when it collected it, and who paid), and the terms read at the
//     opening block in one multicall. MintingHub.openPosition transfers the
//     opening collateral without a MintingUpdate, so the index starts the
//     position's ledger at zero (rails-ops item 158). With `firstBlock` — the
//     block of the position's first ledger row, in a later transaction — the
//     position's collateral balance and declared price are also read one block
//     before it, which is what that row changed from.
//
// rails-server's `/api/at-block/frankencoin/event` reads it (its
// services/frankencoin-event.ts) and keeps the receipt, the transaction and
// each call once the block is final (server migs 412, 413, 417; rails-ops
// decisions/0056); whether an account is a contract it reads at the head. A
// mined receipt never changes, so the route caches the answer hard.
//
// SERVER-ONLY.

import { atBlockGet } from "./at-block-api";

/** A phase-1 purchase of the challenger's collateral. */
export interface FrankencoinAvertRead {
  kind: "averted";
  /** Who received the challenger's collateral: the buyer. */
  buyer: string | null;
  buyerIsContract: boolean | null;
  /** The challenger, when the ZCHF went to one account. */
  challenger: string | null;
  /** ZCHF the buyer paid the challenger. "0" when the challenger withdrew its
   *  own challenge (the hub charges nothing then). */
  paid: string;
  /** Collateral bought, raw units of the collateral token. */
  boughtRaw: string;
  /** The position's owner at that block. */
  owner: string | null;
  /** The position's minting cooldown after the block (unix seconds). */
  cooldownUntil: number | null;
  /** The declared price in force (raw, 1e(36 − collateral decimals)). */
  liqPriceRaw: string | null;
  /** The challenge's start, from the hub one block earlier. */
  challengeStart: number | null;
  /** The position's phase length (seconds). */
  phase: number | null;
}

/** A phase-2 sale of the position's collateral. */
export interface FrankencoinSaleRead {
  kind: "succeeded";
  /** Who received the position's collateral. */
  bidder: string | null;
  bidderIsContract: boolean | null;
  /** Position collateral sent to the bidder, raw. */
  soldRaw: string;
  /** ZCHF the bidder paid the hub. */
  bid: string;
  challenger: string | null;
  /** ZCHF the hub paid the challenger. */
  reward: string;
  /** The challenger's posted collateral sent back (or booked for later), raw. */
  challengerReturnedRaw: string;
  challengerReturnPostponed: boolean;
  /** ZCHF burned against the position's debt. */
  debtCleared: string;
  /** Loss the hub reported: the debt the bid (less the reward) left uncovered. */
  shortfall: string;
  /** Of that, ZCHF the reserve sent, and ZCHF newly minted when it ran short. */
  shortfallFromReserve: string;
  shortfallMinted: string;
  /** The position's reserve share released by the burn (the Profit it reported). */
  reserveReleased: string | null;
  /** ZCHF paid out to the owner from an excess. */
  owner: string | null;
  ownerReceived: string;
  /** ZCHF of an excess kept by the reserve. */
  excessToReserve: string;
  liqPriceRaw: string | null;
  challengeStart: number | null;
  phase: number | null;
}

/** An expired position's collateral bought through the V2 hub. */
export interface FrankencoinForcedSaleRead {
  kind: "forced";
  /** Who bought: the recipient of the position's collateral, or (nothing
   *  sold) the account the hub charged. */
  buyer: string | null;
  buyerIsContract: boolean | null;
  /** The position's owner one block earlier. */
  owner: string | null;
  /** Collateral sold, raw units (the ForcedSale log's amount). */
  soldRaw: string;
  /** Price per unit, raw (1e(36 − collateral decimals)), from the ForcedSale log. */
  priceRaw: string;
  /** What the hub charged: price × amount ÷ 1e18, as MintingHubV2 computes it. */
  cost: string;
  /** Which branch of PositionV2.forceSale ran. */
  branch: "full" | "partial" | "shortfall" | "noDebt";
  /** Debt burned. */
  debtCleared: string;
  /** Full repayment: the assigned reserve share the reserve sent the buyer. */
  reserveToBuyer: string;
  /** ZCHF the buyer sent the owner. */
  ownerReceived: string;
  /** Partial repayment: ZCHF the buyer sent the position. */
  toPosition: string;
  /** Partial repayment (collateral left): the reserve share the reserve
   *  released toward the repayment. */
  reserveFreed: string;
  /** Shortfall: the Loss the position reported, the ZCHF the reserve sent,
   *  the ZCHF minted when the reserve ran short, and the reserve share the
   *  burn released (Profit). */
  loss: string;
  lossFromReserve: string;
  lossMinted: string;
  reserveReleased: string | null;
  /** Read one block earlier. */
  liqPriceRaw: string | null;
  expiration: number | null;
  challengePeriod: number | null;
  mintedBefore: string | null;
  reservePPM: number | null;
}

/** An original's opening transaction and the terms it was born with. */
export interface FrankencoinOpeningRead {
  collateralToken: string | null;
  /** Collateral the opening transaction moved into the position, raw. */
  depositedRaw: string;
  depositFrom: string | null;
  /** The opening fee: the Profit the hub reported, and the account it came from. */
  fee: string;
  feePayer: string | null;
  /** Read at the opening block; null where the getter does not answer (V1). */
  priceRaw: string | null;
  minimumCollateralRaw: string | null;
  limit: string | null;
  challengePeriod: number | null;
  start: number | null;
  expiration: number | null;
  riskPremiumPPM: number | null;
  reservePPM: number | null;
  annualInterestPPM: number | null;
  /** The position's first ledger row, when a later transaction wrote it: its
   *  block, and the position's collateral balance and declared price one block
   *  earlier. */
  firstBefore: { block: number; collateralRaw: string | null; priceRaw: string | null } | null;
}

export interface FrankencoinEventRead {
  txHash: string;
  blockNumber: number;
  blockTimestamp: number | null;
  sender: string;
  /** Another position's update rides the same transaction and the event's own
   *  logs could not be told apart (no log index). Every ZCHF figure is then
   *  withheld (empty strings). */
  shared: boolean;
  /** Other positions this transaction updated, with whether it left each one
   *  empty (no collateral, no debt). */
  otherPositions: { position: string; emptied: boolean }[];
  /** The transaction was sent to the V2 hub's roller. */
  viaRoller: boolean;
  /** ZCHF minted to anyone but the reserve — what the borrower side received. */
  mintedOut: string;
  /** Where that ZCHF ended the transaction: the recipient, or the account it
   *  forwarded the whole amount to in the same transaction. */
  mintedOutTo: string | null;
  /** ZCHF minted to the reserve: the reserve share plus the interest. */
  mintedToReserve: string;
  /** The Profit the position reported: the up-front interest. */
  interest: string | null;
  /** ZCHF burned from the payer. */
  burnedFromPayer: string;
  /** Who it was burned from. */
  payer: string | null;
  /** ZCHF the reserve sent back to the payer: the assigned reserve share. */
  reserveReturned: string;
  /** ZCHF burned from the reserve directly. */
  burnedFromReserve: string;
  /** A mint's terms at that block: the annual rate (ppm), the expiry and the
   *  start the interest runs from. */
  rate: { annualInterestPPM: number; expiration: number; start: number } | null;
  challenge: FrankencoinAvertRead | FrankencoinSaleRead | null;
  forced: FrankencoinForcedSaleRead | null;
  opening: FrankencoinOpeningRead | null;
  /** A creation handover: whether the new owner holds contract code now. */
  newOwnerIsContract: boolean | null;
}

export interface FrankencoinEventReadOptions {
  /** The row's kind, which decides what else is read. */
  kind?: string;
  /** The event's own log index: isolates its logs from other positions'. */
  logIndex?: number;
  /** An ownership row's new owner. */
  newOwner?: string;
  /** An opening row: the block of the position's first ledger row, when a
   *  later transaction wrote it. */
  firstBlock?: number;
}

export function readFrankencoinEvent(
  txHash: string,
  position: string,
  opts: FrankencoinEventReadOptions = {},
  readerIp?: string,
): Promise<FrankencoinEventRead> {
  const qs = new URLSearchParams({ tx: txHash, position });
  if (opts.kind != null) qs.set("kind", opts.kind);
  if (opts.logIndex != null) qs.set("log", String(opts.logIndex));
  if (opts.newOwner != null) qs.set("owner", opts.newOwner);
  if (opts.firstBlock != null) qs.set("first", String(opts.firstBlock));
  return atBlockGet<FrankencoinEventRead>("frankencoin/event", qs, readerIp);
}
