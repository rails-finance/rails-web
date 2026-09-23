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
  summary: `ZCHF this position had minted AFTER this event — the MintingUpdate's own \`minted\` absolute, emitted by the Position contract itself${atBlock(coords)} and equal to its stored minted() slot (verified wei-exact against archive reads). The replay is last-write-wins over absolutes, not a running sum — there is nothing to drift. This is the position's debt to the system in ZCHF, the native unit (Frankencoin runs no oracle and no USD renders here).`,
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

/** ForcedSale (V2 hub) — an expired position's collateral sold. */
export const forcedSaleProv = (sym: string, coords: FrankencoinCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${sym} sold in a forced sale — the V2 hub's own ForcedSale log${atBlock(coords)}: after a position's expiration passes, anyone can buy its collateral through the hub at a declining price and the proceeds repay the debt. The expiry is a hard lifecycle edge, not a display nicety.`,
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
