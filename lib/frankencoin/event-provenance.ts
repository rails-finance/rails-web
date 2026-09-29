// Frankencoin provenance vocabulary — the timeline lanes.
// ----------------------------------------------------------------------------
// The per-position ledger is `MintingUpdate(collateral, price, minted)` on the
// Position contract itself, and the grading is the point:
//
//   • the three MintingUpdate figures — `state`, NOT emitted-graded despite
//     riding in the log: each emitted figure IS stored state at that block
//     (minted equals the `minted()` slot; collateral equals the token's
//     balanceOf(position); price equals the `price()` slot — verified
//     wei-exact mid-life against archive reads in the Phase-0 probes). The
//     replay is last-write-wins over absolutes — no running sum to drift.
//   • the hub events (PositionOpened, the challenge slices, ForcedSale) and
//     PositionDenied / OwnershipTransferred — `emitted`: fields decoded from
//     the log itself, never recomputed.
//   • before-values and per-event changes — `chain-derived` over two emitted
//     absolutes (a lag and a difference), each anchored to a figure the
//     position itself emitted.
//
// UNITS ARE NATIVE: ZCHF debt, the position's own collateral token. The
// owner-declared price is stored at 1e(36 − collateralDecimals) — the scale
// conversion is stated in every price receipt. No USD exists here at all.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { FRANKENCOIN_ADDRESSES, hubAddress, type FrankencoinHubVersion } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only.
const FRANKENCOIN_VIA = "captured MintingHub + Position events (frankencoin_*)";

export interface FrankencoinCoords {
  txHash?: string;
  blockNumber?: number;
  /** The Position contract — the grain. */
  position?: string;
  hub?: FrankencoinHubVersion;
}

const positionContract = (coords?: FrankencoinCoords) => ({
  name: "Frankencoin Position",
  address: coords?.position,
});

const hubContract = (coords?: FrankencoinCoords) => ({
  name: `MintingHub ${coords?.hub === "v1" ? "V1" : "V2"}`,
  address: coords?.hub ? hubAddress(coords.hub) : FRANKENCOIN_ADDRESSES.HUB_V2,
});

const atBlock = (coords?: FrankencoinCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: FrankencoinCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

function eventInputs(coords: FrankencoinCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.position)
    inputs.push({
      label: "position",
      value: coords.position,
      kind: "chain",
      note: "the Position contract — the grain",
    });
  if (coords?.hub)
    inputs.push({
      label: "hub",
      value: hubAddress(coords.hub),
      kind: "chain",
      note: `MintingHub ${coords.hub.toUpperCase()}`,
    });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash) inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return inputs;
}

// ── the MintingUpdate lanes (state-graded absolutes) ─────────────────────────

/** The emitted `minted` absolute — ZCHF debt AFTER this event (= the stored
 *  minted() slot). */
export const mintedAfterProv = (coords: FrankencoinCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the position's minted() eth_call at block ${coords.blockNumber} against an archive node — the emitted figure IS the stored slot, so the read reproduces it exactly.`
        : "Re-run the position's minted() eth_call — the emitted figure IS the stored slot, so the read reproduces it exactly.",
  },
  summary: `ZCHF this position had minted AFTER this event — the MintingUpdate's own \`minted\` absolute, emitted by the Position contract itself${atBlock(coords)} and equal to its stored minted() slot (verified wei-exact against archive reads). The replay is last-write-wins over absolutes — there is nothing to drift. This is the position's debt to the system in ZCHF, the native unit (Frankencoin runs no oracle and no USD renders here).`,
  contract: positionContract(coords),
  via: `${FRANKENCOIN_VIA} · MintingUpdate · ${fieldSeg("minted", raw)} (the emitted absolute = the minted() slot)`,
  inputs: eventInputs(coords),
});

/** The emitted `collateral` absolute — the position's collateral balance AFTER
 *  this event (= the token's balanceOf(position)). */
export const collateralAfterProv = (sym: string, coords: FrankencoinCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the collateral token's balanceOf(position) eth_call at block ${coords.blockNumber} against an archive node — the emitted figure IS that balance (verified wei-exact mid-life in the Phase-0 probes).`
        : "Re-run the collateral token's balanceOf(position) eth_call — the emitted figure IS that balance.",
  },
  summary: `${sym} this position held AFTER this event — the MintingUpdate's own \`collateral\` absolute, emitted by the Position contract itself${atBlock(coords)} and equal to the collateral token's balanceOf(position) at that block. An absolute after-state, not a delta: the ledger replays last-write-wins.`,
  contract: positionContract(coords),
  via: `${FRANKENCOIN_VIA} · MintingUpdate · ${fieldSeg("collateral", raw)} (= balanceOf(position))`,
  inputs: eventInputs(coords),
});

/** The emitted `price` absolute — the OWNER-DECLARED liquidation price AFTER
 *  this event, scaled to ZCHF per whole collateral token. */
export const liqPriceAfterProv = (
  sym: string,
  decimals: number,
  coords: FrankencoinCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the position's price() eth_call at block ${coords.blockNumber} — the emitted figure IS the stored slot; divide by 1e${36 - decimals} for ZCHF per ${sym}.`
        : `Re-run the position's price() eth_call — the emitted figure IS the stored slot; divide by 1e${36 - decimals} for ZCHF per ${sym}.`,
  },
  summary: `The liquidation price AFTER this event, in ZCHF per ${sym} — the MintingUpdate's own \`price\` absolute (= the stored price() slot), divided by its on-chain scale of 1e(36 − ${decimals} collateral decimals). ⚠️ This price is OWNER-DECLARED, not an oracle: Frankencoin is oracle-free, and the declared price is what a challenge auction tests. Raising it starts a 3-day cooldown on minting.`,
  contract: positionContract(coords),
  via: `${FRANKENCOIN_VIA} · MintingUpdate · ${fieldSeg("price", raw)} ÷ 1e${36 - decimals}`,
  inputs: eventInputs(coords),
});

/** A before-value — the PREVIOUS MintingUpdate's emitted absolute at the same
 *  position: a lag, never a sum. */
export const beforeProv = (
  what: "minted" | "collateral" | "price",
  sym: string,
  coords: FrankencoinCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the corresponding eth_call at block ${coords.blockNumber - 1} against an archive node — the before-value is the previous MintingUpdate's own emitted absolute.`
        : "Re-run the corresponding eth_call just before this event.",
  },
  summary: `${what === "minted" ? "ZCHF minted" : what === "collateral" ? `${sym} collateral` : `the declared liquidation price`} BEFORE this event — the previous MintingUpdate's own emitted \`${what}\` absolute at this position: a lag of the emitted absolutes, never a running sum, so every before-value is anchored to a figure the position itself emitted (and its storage held).`,
  contract: positionContract(coords),
  via: `${FRANKENCOIN_VIA} · lag(${what}) at this position${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords, [
    { label: `previous ${what}`, kind: "chain", pclass: "state", note: "the prior MintingUpdate's emitted absolute" },
  ]),
});

/** A per-event change — this MintingUpdate's absolute minus the previous one:
 *  a difference of two emitted absolutes. */
export const changeProv = (
  what: "minted" | "collateral" | "price",
  sym: string,
  coords: FrankencoinCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: txVerify(coords),
  summary: `The ${what === "minted" ? "ZCHF debt" : what === "collateral" ? `${sym} collateral` : "declared-price"} change this event made — this MintingUpdate's emitted \`${what}\` absolute minus the previous one, a difference of two figures the position itself emitted (each equal to its stored state at its block). MintingUpdate carries no delta field, so the change is derived — and says so.`,
  contract: positionContract(coords),
  via: `${what} − previous ${what} (two emitted absolutes)`,
  formula: "after − before",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: "this MintingUpdate's emitted absolute" },
    { label: "before", kind: "chain", pclass: "state", note: "the previous MintingUpdate's emitted absolute" },
  ]),
});

// ── hub / lifecycle events (emitted-graded) ──────────────────────────────────

/** A challenge-slice figure — ChallengeStarted size, ChallengeAverted size, or
 *  a ChallengeSucceeded slice's bid / acquiredCollateral / challengeSize. */
export const challengeFigureProv = (
  what: "size" | "bid" | "acquiredCollateral" | "challengeSize",
  phase: "started" | "averted" | "succeeded",
  sym: string,
  coords: FrankencoinCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary:
    what === "bid"
      ? `ZCHF the phase-2 bidder paid for this slice — the ChallengeSucceeded log's own \`bid\` field${atBlock(coords)}. In phase 2 the auction sells the POSITION's collateral at a declining price: the bidder pays ZCHF, the debt is written down, and the challenger earns the protocol's reward. One challenge can settle in several slices — this figure is this slice's alone.`
      : what === "acquiredCollateral"
        ? `${sym} the phase-2 bidder acquired in this slice — the ChallengeSucceeded log's own \`acquiredCollateral\` field${atBlock(coords)}: collateral taken FROM THE POSITION under the auction's rules, not a send the owner made.`
        : phase === "averted"
          ? `${sym} of the challenge averted — the ChallengeAverted log's own \`size\` field${atBlock(coords)}. Phase 1 is a fixed-price test of the owner-declared liquidation price: someone bought the CHALLENGER's posted collateral at that price, the position survived, and the challenger's bet lost.`
          : `${sym} the challenger posted — the Challenge${phase === "started" ? "Started" : "Succeeded"} log's own \`${what}\` field${atBlock(coords)}. ⚠️ A challenger posts COLLATERAL, not ZCHF: the auction first offers the challenger's own tokens at the declared price (phase 1), and only if nobody takes them does the position's collateral go to the declining phase-2 auction.`,
  contract: hubContract(coords),
  via: `${FRANKENCOIN_VIA} · Challenge${phase === "started" ? "Started" : phase === "averted" ? "Averted" : "Succeeded"} · ${fieldSeg(what, raw)}`,
  inputs: eventInputs(coords),
});

/** PositionDenied — the governance veto during the init window. */
export const deniedProv = (coords: FrankencoinCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This position was DENIED — the Position contract's own PositionDenied log${atBlock(coords)}: a holder of enough FPS vetoed it during its init window (every new original position waits an owner-chosen period, 3 days minimum, before it can mint). Denial disables minting permanently — V1 pins the cooldown to the expiration; V2 closes the position outright. Either way the denial itself is an indexed fact: head state cannot distinguish a V2 denial from an ordinary close.`,
  contract: positionContract(coords),
  via: `${FRANKENCOIN_VIA} · PositionDenied`,
  inputs: eventInputs(coords),
});

/** OwnershipTransferred on the Position — ownership is a mutable fact. */
export const ownershipProv = (coords: FrankencoinCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The position changed owners — the Position contract's own OwnershipTransferred log${atBlock(coords)}. A position is a contract of its own, so its owner is a mutable fact the explorer replays from these logs; the owner shown on the card is the event-time owner, honored through every transfer.`,
  contract: positionContract(coords),
  via: `${FRANKENCOIN_VIA} · OwnershipTransferred`,
  inputs: eventInputs(coords),
});

/** PositionOpened on the hub — the position's creation and, for a clone, the
 *  original it was cloned from. */
export const openedProv = (coords: FrankencoinCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The position's creation — the hub's own PositionOpened log${atBlock(coords)}, naming the new Position contract and the position it was cloned from (itself, for an original). A clone takes its starting price from that position and its other terms from the family's original.`,
  contract: hubContract(coords),
  via: `${FRANKENCOIN_VIA} · PositionOpened · original`,
  inputs: eventInputs(coords),
});

// ── the receipt's ZCHF legs (lib/sources/chain/frankencoin-event.ts) ─────────

const RECEIPT_VIA = "the transaction receipt, read over RPC";

const ZCHF_TOKEN = { name: "Frankencoin (ZCHF)", address: FRANKENCOIN_ADDRESSES.ZCHF };

export type FrankencoinReceiptLeg = "received" | "reserveShare" | "interest" | "paid" | "reserveReturned";

const RECEIPT_LEG: Record<FrankencoinReceiptLeg, { summary: string; via: string; derived?: boolean }> = {
  received: {
    summary:
      "ZCHF the borrower received from this mint — the ZCHF token's Transfer log out of the zero address to anyone but the reserve (followed one hop where the recipient forwarded the whole amount in the same transaction). The gross debt added is this plus the reserve share and the interest.",
    via: "Transfer(0x0 → borrower) · ÷10^18",
  },
  reserveShare: {
    summary:
      "The position's reserve share of this mint — the ZCHF minted to the reserve (the Equity contract) less the interest the position reported as Profit. It stays in the reserve against this position's debt.",
    via: "Transfer(0x0 → Equity) − Profit(position) · ÷10^18",
    derived: true,
  },
  interest: {
    summary:
      "Interest for the remaining term, paid up front — the Profit log the ZCHF contract emitted for this position when it minted. It goes to the reserve as equity income and is not returned.",
    via: "Profit(reportingMinter = position, amount) · ÷10^18",
  },
  paid: {
    summary:
      "ZCHF the payer spent on this repayment — the ZCHF burned from their wallet (Transfer to the zero address) less the reserve share the reserve sent back to them in the same transaction.",
    via: "Transfer(payer → 0x0) − Transfer(Equity → payer) · ÷10^18",
    derived: true,
  },
  reserveReturned: {
    summary:
      "The position's reserve share released by this repayment — the ZCHF the reserve (the Equity contract) sent to the payer, or burned itself, in this transaction. It is the whole share while the reserve covers every position's share, and a proportional part when losses have drawn it down (Frankencoin.calculateAssignedReserve).",
    via: "Transfer(Equity → payer) + Transfer(Equity → 0x0) · ÷10^18",
  },
};

/** One ZCHF leg of a mint or a repayment, read from the transaction receipt. */
export const receiptLegProv = (leg: FrankencoinReceiptLeg, coords: FrankencoinCoords, value: string): Provenance => {
  const def = RECEIPT_LEG[leg];
  return {
    kind: def.derived ? "chain-derived" : "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: def.summary,
    contract: ZCHF_TOKEN,
    via: `${RECEIPT_VIA} · ${def.via}`,
    inputs: [{ label: leg, value, kind: "chain", pclass: "emitted" }, ...eventInputs(coords)],
  };
};

// ── the receipt's challenge legs and at-block reads ─────────────────────────

export type FrankencoinChallengeLeg =
  | "boughtFromChallenger"
  | "paidChallenger"
  | "buyer"
  | "cooldown"
  | "bidder"
  | "reward"
  | "challengerReturned"
  | "debtCleared"
  | "shortfall"
  | "reserveReleased"
  | "ownerReceived"
  | "clearedPrice"
  | "rate"
  | "ownerKind"
  | "forcedBuyer"
  | "forcedPrice"
  | "forcedCost"
  | "forcedDebt"
  | "forcedReserveToBuyer"
  | "forcedOwner"
  | "forcedShortfall"
  | "forcedTerms";

const CHALLENGE_LEG: Record<
  FrankencoinChallengeLeg,
  {
    summary: (sym: string) => string;
    via: string;
    derived?: boolean;
    token?: "zchf" | "collateral" | "hub" | "position";
  }
> = {
  boughtFromChallenger: {
    summary: (sym) =>
      `${sym} the buyer took from the challenger — the collateral token's Transfer from the hub to the buyer in this transaction. In phase 1 the hub hands the challenger's posted collateral to whoever pays the declared price for it.`,
    via: "Transfer(hub → buyer) on the collateral token",
    token: "collateral",
  },
  paidChallenger: {
    summary: () =>
      "ZCHF the buyer paid the challenger — the ZCHF token's Transfer from the buyer to the challenger in this transaction: the challenged amount at the declared price.",
    via: "Transfer(buyer → challenger) · ÷10^18",
    token: "zchf",
  },
  buyer: {
    summary: () =>
      "Who bought the challenger's collateral — the recipient of the hub's collateral Transfer in this transaction; whether it holds contract code is read from the chain now.",
    via: "Transfer(hub → buyer) · eth_getCode(buyer)",
    token: "collateral",
  },
  cooldown: {
    summary: () =>
      "The end of the position's minting pause — the position's cooldown() read at this block. An averted challenge pauses minting for one day, so the same challenge can be repeated before the owner mints more.",
    via: "Position.cooldown() at the event block",
    token: "position",
  },
  bidder: {
    summary: () =>
      "Who bought the position's collateral — the recipient of the position's collateral Transfer in this transaction; whether it holds contract code is read from the chain now.",
    via: "Transfer(position → bidder) · eth_getCode(bidder)",
    token: "collateral",
  },
  reward: {
    summary: () =>
      "The challenger's reward — the ZCHF token's Transfer from the hub to the challenger in this transaction. MintingHubV2 pays the challenger 2% of the bid (CHALLENGER_REWARD = 20,000 ppm).",
    via: "Transfer(hub → challenger) · ÷10^18",
    token: "zchf",
  },
  challengerReturned: {
    summary: (sym) =>
      `${sym} the challenger got back — the collateral token's Transfer from the hub to the challenger (or the hub's PostPonedReturn) in this transaction. A challenger who is outbid in phase 2 takes back the collateral it posted.`,
    via: "Transfer(hub → challenger) + PostPonedReturn on the collateral token",
    token: "collateral",
  },
  debtCleared: {
    summary: () =>
      "Debt the sale cleared — the ZCHF the hub burned in this transaction: the position's debt in proportion to the collateral sold.",
    via: "Transfer(hub → 0x0) · ÷10^18",
    token: "zchf",
  },
  shortfall: {
    summary: () =>
      "The shortfall the reserve covered — the ZCHF contract's Loss log for the hub in this transaction: the debt the bid, less the reward, did not cover. The reserve (the Equity contract) sent that much to the hub; if it runs short, new ZCHF is minted for the rest.",
    via: "Loss(reportingMinter = hub, amount) · Transfer(Equity → hub) · ÷10^18",
    token: "zchf",
  },
  reserveReleased: {
    summary: () =>
      "This position's reserve share released by the sale — the Profit the ZCHF contract reported when the hub burned the debt (Frankencoin.burnWithoutReserve): the part of the reserve held against this debt becomes equity.",
    via: "Profit(reportingMinter = hub) after the burn · ÷10^18",
    token: "zchf",
  },
  ownerReceived: {
    summary: () =>
      "ZCHF paid to the owner — the ZCHF token's Transfers from the hub to anyone but the challenger, the reserve and the zero address in this transaction. The owner is paid only when the bid, less the reward, exceeds the debt cleared.",
    via: "Transfer(hub → owner) · ÷10^18",
    token: "zchf",
  },
  clearedPrice: {
    summary: (sym) =>
      `The price the sale cleared at, ZCHF per ${sym} — the bid over the collateral sold, both from the ChallengeSucceeded log; the declared price and the challenge start are read from the position and the hub one block earlier.`,
    via: "bid ÷ acquiredCollateral · Position.challengeData() · MintingHub.challenges(n)",
    derived: true,
    token: "hub",
  },
  rate: {
    summary: () =>
      "The annual interest rate in force for this mint — the position's annualInterestPPM() read at this block (the system base rate plus the position's risk premium). The interest is that rate for the time left to expiry, charged at minting.",
    via: "Position.annualInterestPPM() · expiration() · start() at the event block",
    token: "position",
  },
  forcedBuyer: {
    summary: () =>
      "Who bought the expired position's collateral — the recipient of the position's collateral Transfer in this transaction (with nothing sold, the account the hub charged); whether it holds contract code is read from the chain now.",
    via: "Transfer(position → buyer) · eth_getCode(buyer)",
    token: "collateral",
  },
  forcedPrice: {
    summary: (sym) =>
      `The forced-sale price per ${sym} — the V2 hub's ForcedSale log's own price field. MintingHubV2.expiredPurchasePrice sets it from the time since expiry: 10× the declared price at expiry, falling to 1× over one challenge period, then to zero over a second. The declared price, expiration and challenge period are read from the position one block earlier.`,
    via: "ForcedSale.priceE36MinusDecimals ÷ 1e(36 − decimals) · Position.price() · expiration() · challengePeriod() one block earlier",
    token: "hub",
  },
  forcedCost: {
    summary: () =>
      "What the buyer paid — the ForcedSale log's price times its amount ÷ 10^18, the cost MintingHubV2.buyExpiredCollateral charges. The ZCHF Transfers in the transaction show where it went.",
    via: "price × amount ÷ 10^18 (ForcedSale)",
    derived: true,
    token: "hub",
  },
  forcedDebt: {
    summary: () =>
      "Debt the forced sale cleared — the ZCHF burned in this transaction, from the buyer on a full repayment (Frankencoin.burnFromWithReserve) or from the position on a partial one.",
    via: "Transfer(buyer or position → 0x0) · ÷10^18",
    token: "zchf",
  },
  forcedReserveToBuyer: {
    summary: () =>
      "The position's reserve share, sent to the buyer — the ZCHF Transfer from the reserve (the Equity contract) to the buyer. On a full repayment burnFromWithReserve returns the share held against the debt to whoever repays it, so it counts toward the price.",
    via: "Transfer(Equity → buyer) · ÷10^18",
    token: "zchf",
  },
  forcedOwner: {
    summary: () =>
      "ZCHF paid to the owner — the ZCHF Transfer from the buyer to the owner in this transaction: the price plus the returned reserve share, less the debt (all of the price when the position had no debt).",
    via: "Transfer(buyer → owner) · ÷10^18",
    token: "zchf",
  },
  forcedShortfall: {
    summary: () =>
      "The shortfall the reserve covered — the ZCHF contract's Loss log for the position: the debt the price did not cover once the last collateral was sold. The reserve sent that much to the position (new ZCHF is minted for any part it lacks) and the debt was burned.",
    via: "Loss(reportingMinter = position, amount) · Transfer(Equity → position) · ÷10^18",
    token: "zchf",
  },
  forcedTerms: {
    summary: () =>
      "The position's terms before the sale — its minted(), price(), expiration(), challengePeriod() and reserveContribution() read one block earlier in one multicall.",
    via: "Position.minted() · price() · expiration() · challengePeriod() · reserveContribution() one block earlier",
    token: "position",
  },
  ownerKind: {
    summary: () =>
      "Whether the new owner is a wallet or a contract — eth_getCode on the address now: no code is a wallet (an externally owned account), code is a contract.",
    via: "eth_getCode(newOwner) at the latest block",
    token: "position",
  },
};

/** One figure of a challenge's receipt, or a value read at the event block. */
export const challengeReceiptProv = (
  leg: FrankencoinChallengeLeg,
  sym: string,
  coords: FrankencoinCoords,
  value: string,
): Provenance => {
  const def = CHALLENGE_LEG[leg];
  return {
    kind: def.derived ? "chain-derived" : "chain",
    pclass: def.token === "position" ? "state" : "emitted",
    verify: txVerify(coords),
    summary: def.summary(sym),
    contract:
      def.token === "zchf"
        ? ZCHF_TOKEN
        : def.token === "position"
          ? positionContract(coords)
          : def.token === "hub"
            ? hubContract(coords)
            : { name: `${sym} token` },
    via: `${RECEIPT_VIA} · ${def.via}`,
    inputs: [{ label: leg, value, kind: "chain", pclass: "emitted" }, ...eventInputs(coords)],
  };
};

/** ForcedSale (V2 hub) — an expired position's collateral sold. */
export const forcedSaleProv = (sym: string, coords: FrankencoinCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${sym} sold in a forced sale — the V2 hub's own ForcedSale log${atBlock(coords)}: after a position's expiration passes, anyone can buy its collateral through the hub at a declining price and the proceeds repay the debt. The expiry is a hard lifecycle edge.`,
  contract: hubContract(coords),
  via: `${FRANKENCOIN_VIA} · ForcedSale · ${fieldSeg("amount", raw)}`,
  inputs: eventInputs(coords),
});

// ── position card lanes (index-backed) ───────────────────────────────────────

/** A listing-card figure replayed from the latest MintingUpdate absolute. */
export const latestAbsoluteProv = (
  what: "minted" | "collateral" | "price",
  sym: string,
  decimals: number,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run the position's ${what === "collateral" ? "collateral token balanceOf(position)" : what + "()"} eth_call — the latest MintingUpdate's emitted absolute IS that stored state.`,
  },
  summary:
    what === "minted"
      ? "ZCHF this position has minted — its latest MintingUpdate's emitted `minted` absolute, which equals the stored minted() slot (last-write-wins, nothing summed). The debt unit is native ZCHF: Frankencoin runs no oracle and no USD renders."
      : what === "collateral"
        ? `${sym} this position holds — its latest MintingUpdate's emitted \`collateral\` absolute, which equals the collateral token's balanceOf(position).`
        : `The owner-declared liquidation price, ZCHF per ${sym} — the latest MintingUpdate's emitted \`price\` absolute (= the stored price() slot) ÷ 1e${36 - decimals}. Owner-declared, not an oracle: the challenge auction is what tests it.`,
  contract: { name: "Frankencoin Position" },
  via: `${FRANKENCOIN_VIA} · latest MintingUpdate ${what}${what === "price" ? ` ÷ 1e${36 - decimals}` : ""} (= the stored state)`,
});

/** A closed card's headline — the highest MintingUpdate absolute the position
 *  ever emitted on one axis (its latest absolutes are back at zero). */
export const peakAbsoluteProv = (what: "minted" | "collateral", sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    what === "minted"
      ? "The most ZCHF this position ever had minted at once — the maximum over its own MintingUpdate `minted` absolutes (each equal to the stored minted() slot at its block), replayed over the position's whole life. A closed position's latest absolutes are back at zero, so its headline states the ledger's height instead."
      : `The most ${sym} this position ever held — the maximum over its own MintingUpdate \`collateral\` absolutes (each equal to the collateral token's balanceOf(position) at its block), replayed over the position's whole life. A closed position's latest absolutes are back at zero, so its headline states the ledger's height instead.`,
  contract: { name: "Frankencoin Position" },
  via: `${FRANKENCOIN_VIA} · max(${what}) over all MintingUpdates`,
});

/** A closed card's collateral headline when the position's MintingUpdates
 *  never recorded any: the most a sale sold. */
export const soldPeakProv = (sym: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `The ${sym} this position's sale sold — the hub's ForcedSale amount or ChallengeSucceeded acquiredCollateral. The position's own MintingUpdates never recorded this collateral (it arrived without one), so the ledger has no peak to show; the sale's amount is the most it is known to have held.`,
  contract: { name: "Frankencoin MintingHub" },
  via: `${FRANKENCOIN_VIA} · ForcedSale amount · ChallengeSucceeded acquiredCollateral`,
});

/** A lifetime gross flow — Σ of per-event changes on one axis. */
export const lifetimeFlowProv = (
  flow:
    | "minted"
    | "repaid"
    | "collateral added"
    | "collateral withdrawn"
    | "collateral auctioned"
    | "debt cleared by auction",
  sym: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Lifetime ${flow} (${sym}) — the sum of this position's own per-event changes, each a difference of two MintingUpdate absolutes (figures the position itself emitted, equal to its stored state at each block), complete from the position's open. Auction slices are bucketed from the hub's own ChallengeSucceeded / ForcedSale figures.`,
  contract: { name: "Frankencoin Position" },
  via: `${FRANKENCOIN_VIA} · Σ (after − before) per event · open → head`,
});
