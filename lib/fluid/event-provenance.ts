// Fluid (Instadapp) provenance vocabulary.
// ----------------------------------------------------------------------------
// One vault contract per (collateral, debt) pair; ONE composite LogOperate
// event moves either or both legs as signed actual token amounts. Three lanes
// with DIFFERENT step classes — the grading is the point:
//   • emitted — fields a log itself carries: LogOperate's colAmt_/debtAmt_,
//     the factory's ERC721 Transfer parties, LogLiquidate's liquidator.
//   • state   — the vault's OWN settled reads. Liquidations sweep price-band
//     TICK RANGES and their event names NO position, so per-position impact is
//     the contract's settlement math read as a view (fetchLatestPosition at
//     the boundary blocks) — a computed read, never an emitted field. The
//     position card's current figures are the VaultPositionsResolver sweep at
//     a stamped block, the same class.
//   • indexed — the Σ continuity lane: running sum of the position's operate
//     deltas plus the liquidation-attribution deltas. Exact at liquidation
//     boundaries, interest-blind between events; no chain slot holds it.
//
// Values replay the captured fluid_* events. The `contract` is the position's
// vault (passed in as `coords.vault`) — each (collateral, debt) pair is its
// own contract, like Compound's per-market Comet.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { FLUID_ADDRESSES } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const FLUID_VIA = "captured vault events (fluid_*)";

export interface FluidCoords {
  txHash?: string;
  blockNumber?: number;
  /** The vault contract address — the contract every operate value cites. */
  vault?: string;
  /** Display pair, e.g. "wstETH / USDC" (smart-vault legs read "DEX shares"). */
  pairLabel?: string;
  /** The position NFT id. */
  nftId?: string;
  /** The position's owner at this event (era owner via NFT transfers). */
  owner?: string;
}

const vaultContract = (coords?: FluidCoords) => ({
  name: coords?.pairLabel ? `Fluid vault (${coords.pairLabel})` : "Fluid vault",
  address: coords?.vault ?? "0x0000000000000000000000000000000000000000",
});

const atBlock = (coords?: FluidCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: FluidCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

function eventInputs(coords: FluidCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.nftId)
    inputs.push({ label: "position", value: `#${coords.nftId}`, kind: "chain", note: "position NFT id" });
  if (coords?.owner) inputs.push({ label: "owner", value: coords.owner, kind: "chain", note: "owner at this event" });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash)
    inputs.push({
      label: "tx",
      value: coords.txHash,
      kind: "chain",
      note: "captured log",
    });
  return inputs;
}

// ── per-event deltas (emitted) ───────────────────────────────────────────────

/** Signed collateral this operate moved (LogOperate's own colAmt_ param). */
export const colDeltaProv = (sym: string, coords: FluidCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this operation moved on the collateral leg — the signed amount the vault's LogOperate event itself carries${atBlock(coords)}, scaled by the supply token's decimals. Positive deposits, negative withdraws. Decoded from the log, never recomputed.`,
  contract: vaultContract(coords),
  via: `${FLUID_VIA} · LogOperate log · ${fieldSeg("colAmt_", raw)}`,
  inputs: eventInputs(coords),
});

/** Signed debt this operate moved (LogOperate's own debtAmt_ param). */
export const debtDeltaProv = (sym: string, coords: FluidCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this operation moved on the debt leg — the signed amount the vault's LogOperate event itself carries${atBlock(coords)}, scaled by the borrow token's decimals. Positive borrows, negative repays (a max-repay sentinel is resolved to the actual figure before the event fires). Decoded from the log, never recomputed.`,
  contract: vaultContract(coords),
  via: `${FLUID_VIA} · LogOperate log · ${fieldSeg("debtAmt_", raw)}`,
  inputs: eventInputs(coords),
});

// ── the Σ continuity lane (indexed) ──────────────────────────────────────────

const SIGMA_SUMMARY = (side: "collateral" | "debt", sym: string, when: string): string =>
  `${sym} ${side} ${when} — the running Σ of the position's operate deltas plus the liquidation-attribution deltas. Exact at liquidation boundaries (the attribution rows carry the vault's own settlement math), but it EXCLUDES interest accrued between events; no chain slot holds this number — it is the index's replay.`;

/** Σ-lane collateral AFTER this event. */
export const colAfterProv = (sym: string, coords: FluidCoords, raw?: string | null): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: SIGMA_SUMMARY("collateral", sym, `after this event${atBlock(coords)}`),
  contract: vaultContract(coords),
  via: `${FLUID_VIA} · Σ colAmt_ across LogOperate logs + liquidation attributions${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Σ-lane debt AFTER this event. */
export const debtAfterProv = (sym: string, coords: FluidCoords, raw?: string | null): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: SIGMA_SUMMARY("debt", sym, `after this event${atBlock(coords)}`),
  contract: vaultContract(coords),
  via: `${FLUID_VIA} · Σ debtAmt_ across LogOperate logs + liquidation attributions${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Σ-lane collateral BEFORE this event = after − this event's own delta. */
export const colBeforeProv = (sym: string, coords: FluidCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `${SIGMA_SUMMARY("collateral", sym, "before this event")} Reconstructed in the browser as the after-value minus this event's own colAmt_ (after − change).`,
  contract: vaultContract(coords),
  via: "Σ-lane collateral after − colAmt_",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "derived", pclass: "indexed", note: `Σ-lane ${sym} collateral after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own colAmt_ (signed)" },
  ]),
});

/** Σ-lane debt BEFORE this event = after − this event's own delta. */
export const debtBeforeProv = (sym: string, coords: FluidCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `${SIGMA_SUMMARY("debt", sym, "before this event")} Reconstructed in the browser as the after-value minus this event's own debtAmt_ (after − change).`,
  contract: vaultContract(coords),
  via: "Σ-lane debt after − debtAmt_",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "derived", pclass: "indexed", note: `Σ-lane ${sym} debt after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own debtAmt_ (signed)" },
  ]),
});

// ── liquidation attribution (the settled reads) ──────────────────────────────

/** One settled boundary value of a liquidation-attribution row — the vault's
 *  own fetchLatestPosition read at the block just before / at the liquidation.
 *  LogLiquidate sweeps tick ranges and carries NO position id, which is why
 *  these are computed reads of the contract's settlement math, never emitted
 *  fields. */
export const liqSettledProv = (
  side: "collateral" | "debt",
  boundary: "before" | "after",
  sym: string,
  coords: FluidCoords,
): Provenance => {
  const blockPhrase =
    coords.blockNumber != null
      ? boundary === "before"
        ? `block ${coords.blockNumber - 1} (B−1)`
        : `block ${coords.blockNumber} (B)`
      : boundary === "before"
        ? "the block before the liquidation (B−1)"
        : "the liquidation block (B)";
  return {
    kind: "chain",
    pclass: "state",
    verify: {
      kind: "recompute",
      text: `Re-run the vault's fetchLatestPosition eth_call at ${blockPhrase} against an archive node — the contract's own settlement math reproduces this figure`,
    },
    summary: `${sym} ${side} the position held ${boundary === "before" ? "BEFORE" : "AFTER"} this liquidation — the vault's own fetchLatestPosition(tick, tickId, debtRaw, tickData) read at ${blockPhrase}: the contract's settlement math as a view, applied to this position's tick coordinates. Fluid liquidates price-band ticks and LogLiquidate names no position, so this figure is a settled READ, not an emitted field — and it is exact, partial-liquidation math included.`,
    contract: vaultContract(coords),
    via: `vault fetchLatestPosition (eth_call at ${blockPhrase}) — LogLiquidate carries no position id, so the impact is a settled read, not an emitted field`,
    inputs: eventInputs(coords),
  };
};

/** The liquidation's per-position impact on one leg — the difference of the
 *  two settled boundary reads (before − after). */
export const liqImpactProv = (side: "collateral" | "debt", sym: string, coords: FluidCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the vault's fetchLatestPosition eth_call at the boundary blocks (B−1 and B) against an archive node and subtract",
  },
  summary: `${sym} ${side === "collateral" ? "seized from" : "cleared for"} this position in this liquidation — the vault's own settled ${side} read at the block before the liquidation minus the same read at the liquidation block. Both legs are the contract's settlement math as a view (LogLiquidate sweeps ticks and names no position), so the difference IS this position's exact impact.`,
  contract: vaultContract(coords),
  via: `vault fetchLatestPosition at B−1 − the same read at B — LogLiquidate carries no position id`,
  formula: "before − after",
  inputs: eventInputs(coords, [
    { label: "before", kind: "chain", pclass: "state", note: `settled ${side} at B−1` },
    { label: "after", kind: "chain", pclass: "state", note: `settled ${side} at B` },
  ]),
});

/** The row's fully-liquidated flag — the settled after-read landing at zero. */
export const fullyLiquidatedProv = (coords: FluidCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the vault's fetchLatestPosition eth_call at the liquidation block against an archive node — a zeroed position reads zero on both legs",
  },
  summary: `Whether this liquidation emptied the position — the vault's own settled read at the liquidation block landing at zero on both legs. Fluid liquidates only enough of a swept tick to restore its health, so a partial outcome is the norm; the flag is the settled math's verdict, not an emitted field.`,
  contract: vaultContract(coords),
  via: "vault fetchLatestPosition at the liquidation block → both legs zero",
  inputs: eventInputs(coords),
});

// ── liquidation forensics (the valued legs — debt-token denominated) ─────────
//
// A Fluid vault oracle quotes the collateral IN THE DEBT TOKEN (debt per col)
// and the protocol runs no USD feed anywhere — so the forensics legs are valued
// in the vault's own debt token, never dollars. That is not a fallback: it is
// the exact space the liquidation engine judges in.
//
// The price is the vault's OWN oracle read at the event's block (mig 114
// capture) — NOT the VaultResolver's configs.oraclePriceLiquidate, though that
// is the same number at head. The resolver has no bytecode at these blocks
// (Fluid's oldest liquidation predates it), so the filler reads the oracle the
// vault itself was configured with at that block and calls it there, which is
// what the resolver does at head anyway.

/** Which getter the captured figure came from. Fluid's oracle interface gained
 *  the operate/liquidate split partway through the protocol's life; the older
 *  single rate IS the liquidate price on the vaults that predate it. */
const oracleGetter = (source: "fluid-oracle-liquidate" | "fluid-oracle"): string =>
  source === "fluid-oracle-liquidate" ? "getExchangeRateLiquidate()" : "getExchangeRate()";

const oracleContract = (oracle: string) => ({ name: "Fluid vault oracle", address: oracle });

/** The vault's own oracle at the event's block (debt per 1 collateral). */
export const atBlockOraclePriceProv = (
  colSym: string,
  debtSym: string,
  coords: FluidCoords,
  price: number,
  oracle: string,
  source: "fluid-oracle-liquidate" | "fluid-oracle",
): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run ${oracleGetter(source)} on ${oracle} at block ${coords.blockNumber} against an archive node — the oracle address is the one the vault's own vaultVariables2 named at that block`
        : `Re-run ${oracleGetter(source)} on ${oracle} against an archive node`,
  },
  summary: `${colSym} priced in ${debtSym} at this event's block — the vault's OWN oracle, read at the block and captured into the index. This is the exact figure Fluid's liquidation engine judged this position with. ${
    source === "fluid-oracle-liquidate"
      ? "Read from the liquidate leg of the oracle's operate/liquidate split — the leg the engine itself uses to price a seizure."
      : "Read from the oracle's single exchange rate: this vault predates the operate/liquidate split, so there is no second rate to choose between and this one IS the liquidate price."
  } Fluid prices in the debt token by design; no USD is asserted anywhere, because the protocol runs no USD feed.`,
  contract: oracleContract(oracle),
  via: `vault oracle · ${oracleGetter(source)} eth_call at the event's block · scaled 1e(27 + debt decimals − collateral decimals)`,
  inputs: eventInputs(coords, [
    {
      label: `${colSym} price`,
      value: `${price} ${debtSym}`,
      kind: "chain",
      note: `${oracleGetter(source)}, at block`,
    },
    { label: "oracle", value: oracle, kind: "chain", note: "vaultVariables2, at block" },
  ]),
});

/** The seized-collateral leg — the settled collateral impact × the at-block
 *  oracle price. */
export const liqSeizedValueProv = (
  colSym: string,
  debtSym: string,
  coords: FluidCoords,
  vals: { amount: string; price: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "seized collateral × the vault's oracle price at block",
  verify: {
    kind: "recompute",
    text: "Re-run the vault's fetchLatestPosition eth_call at B−1 and B, subtract, and multiply by the vault oracle's rate at B — all three reads against an archive node",
  },
  summary: `What the seized collateral was worth at the moment of the liquidation — in the vault's own debt token: this position's settled collateral impact (the vault's fetchLatestPosition read at B−1 minus the same read at B) times the vault oracle's price at the block. Both factors are chain values pinned to this block. The denomination is the debt token because that is the only unit Fluid itself prices in.`,
  contract: vaultContract(coords),
  via: `vault fetchLatestPosition at B−1 − the same read at B, × the vault oracle's rate at B`,
  inputs: eventInputs(coords, [
    {
      label: "seized",
      value: `${vals.amount} ${colSym}`,
      kind: "chain",
      pclass: "state",
      note: "settled impact, B−1 → B",
    },
    { label: "price at block", value: `${vals.price} ${debtSym}`, kind: "chain", note: "vault oracle, at block" },
  ]),
});

/** The cleared-debt leg — the settled debt impact, already in debt units. */
export const liqClearedValueProv = (debtSym: string, coords: FluidCoords, vals: { amount: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  formula: "before − after",
  verify: {
    kind: "recompute",
    text: "Re-run the vault's fetchLatestPosition eth_call at B−1 and B against an archive node and subtract",
  },
  summary: `The ${debtSym} debt this liquidation cleared for this position — the vault's own settled debt read at the block before minus the same read at the liquidation block. Already in the vault's debt token: no price is applied to this leg. Unlike a protocol whose liquidation log states the repayment, Fluid's LogLiquidate sweeps tick ranges and names no position, so this is the contract's settlement math read as a view — exact, and inclusive of any residual written off as the branch closed.`,
  contract: vaultContract(coords),
  via: `vault fetchLatestPosition at B−1 − the same read at B — LogLiquidate carries no position id`,
  inputs: eventInputs(coords, [
    {
      label: "cleared",
      value: `${vals.amount} ${debtSym}`,
      kind: "chain",
      pclass: "state",
      note: "settled impact, B−1 → B",
    },
  ]),
});

/** The realized premium — seized value ÷ cleared − 1, debt-token terms. */
export const liqPremiumProv = (
  debtSym: string,
  coords: FluidCoords,
  vals: { seized: string; cleared: string; penaltyPct?: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "seized ÷ cleared − 1",
  verify: {
    kind: "recompute",
    text: "Re-run the vault's fetchLatestPosition at B−1 and B and the vault oracle's rate at B against an archive node; the ratio of the valued legs reproduces the vault's own liquidationPenalty",
  },
  summary: `The premium realized on this liquidation — the seized collateral's value (at the vault oracle's price this block, in ${debtSym}) over the debt cleared, minus one. This is what the liquidator actually took, not what the vault promises.${
    vals.penaltyPct != null
      ? ` It is derived from the two settled legs alone and never from the vault's liquidationPenalty shown beside it, so the two are an independent check rather than a restatement. The penalty is a FLOOR the engine guarantees, not a target: across Fluid's whole liquidation history a real-sized sweep meets or exceeds its vault's constant essentially always, and reproduces it exactly in the large majority. A figure sitting ABOVE the constant is therefore ordinary — the sweep cleared the tick on terms better than the minimum — and is stated rather than smoothed. On a seizure small enough that the tick-settled legs quantize, the ratio is dominated by that rounding and can land either side.`
      : ""
  }`,
  contract: vaultContract(coords),
  via: "seized ÷ cleared − 1 · both legs in the vault's debt token",
  inputs: eventInputs(coords, [
    { label: "seized", value: vals.seized, kind: "chain", note: "settled impact × price at block" },
    { label: "cleared", value: vals.cleared, kind: "chain", note: "settled impact, B−1 → B" },
    ...(vals.penaltyPct != null
      ? [
          {
            label: "vault penalty",
            value: `${vals.penaltyPct.toFixed(2)}%`,
            kind: "chain" as const,
            note: "vaultVariables2, at block",
          },
        ]
      : []),
  ]),
});

/** The vault's own liquidation penalty at the event's block — the constant the
 *  realized premium above should reproduce. */
export const liqPenaltyAtBlockProv = (coords: FluidCoords, pct: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run eth_getStorageAt(vault, slot 1) at block ${coords.blockNumber} against an archive node — vaultVariables2 bits [72-81], 1e4-scaled`
        : "Re-run eth_getStorageAt(vault, slot 1) against an archive node — vaultVariables2 bits [72-81], 1e4-scaled",
  },
  summary: `The vault's own liquidation penalty at this block — the bonus its engine is configured to hand a liquidator, read from the vault's vaultVariables2 slot (bits [72-81], 1e4-scaled). Governance can change it, so it is a per-block fact and read at this block, not today's. It is shown as the reference the realized premium above is measured against: a floor the engine guarantees rather than a figure it targets, so a realized premium at the constant is the ordinary case and one above it means the sweep cleared on better terms than the minimum. The premium is computed from the settled legs and never consults this number — that independence is what makes the pair worth showing.`,
  contract: vaultContract(coords),
  via: "vault storage · vaultVariables2 (slot 1) bits [72-81] at the event's block · 1e4-scaled",
  inputs: eventInputs(coords, [
    { label: "liquidationPenalty", value: `${pct.toFixed(2)}%`, kind: "chain", note: "vaultVariables2, at block" },
  ]),
});

// ── the settled lane at head (the position card) ─────────────────────────────

const RESOLVER_CONTRACT = {
  name: "VaultPositionsResolver",
  address: FLUID_ADDRESSES.VAULT_POSITIONS_RESOLVER,
};

/** Position-card current supply/borrow — the resolver's settled sweep at the
 *  stamped block: liquidations + accrued interest applied by the protocol's
 *  own math. */
export const settledNowProv = (side: "supply" | "borrow", sym: string, atBlockNum?: number | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      atBlockNum != null
        ? `Re-run the VaultPositionsResolver.getAllVaultPositions eth_call at block ${atBlockNum} and pick this NFT id — the resolver reproduces this figure`
        : "Re-run the VaultPositionsResolver.getAllVaultPositions eth_call and pick this NFT id — the resolver reproduces this figure",
  },
  summary: `${sym} the position's ${side === "supply" ? "collateral" : "debt"} settles to NOW — VaultPositionsResolver.getAllVaultPositions(vault) read at ${atBlockNum != null ? `block ${atBlockNum}` : "the stamped block"}: the protocol's own settlement math with every liquidation sweep AND the interest accrued between events applied. This is the lane the Σ replay deliberately is not.`,
  contract: RESOLVER_CONTRACT,
  via: `VaultPositionsResolver getAllVaultPositions(vault) (eth_call${atBlockNum != null ? ` at block ${atBlockNum}` : ""})`,
  inputs: [
    {
      label: "resolver",
      value: FLUID_ADDRESSES.VAULT_POSITIONS_RESOLVER,
      kind: "chain",
      note: "settled-position sweep",
    },
  ],
});

/** Position-card Σ-lane fallback (no settled overlay row yet) — the same
 *  indexed continuity lane the event cards carry, at the indexed head. */
export const positionSigmaProv = (side: "supply" | "borrow", sym: string): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `${sym} ${side === "supply" ? "collateral" : "debt"} at the indexed head — the running Σ of the position's operate deltas plus the liquidation-attribution deltas, across its whole captured history. Exact at liquidation boundaries, but it EXCLUDES interest accrued since each event; no chain slot holds this number. The settled resolver read is the lane that carries interest — absent here, so the replay is what is asserted.`,
  contract: { name: "Fluid vault", address: "" },
  via: `${FLUID_VIA} · Σ ${side === "supply" ? "colAmt_" : "debtAmt_"} across LogOperate logs + liquidation attributions · mint → head`,
});

/** Closed-card peak figure — the highest the leg's Σ replay ever stood.
 *  Interest accrues between events with no log of its own on BOTH Fluid legs
 *  (collateral earns too), so the replayed peak can sit slightly under the
 *  true settled peak — the receipt says so rather than claim exactness. */
export const peakLegProv = (side: "supply" | "borrow", sym: string, coords: FluidCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `The highest ${sym} ${side === "supply" ? "collateral" : "debt"} this position ever recorded — the maximum of the leg's running balance after each captured event, the operate deltas plus every liquidation-attribution row, from mint to close. The replay is exact at liquidation boundaries, but interest accrues between events with no log of its own (a Fluid ${side === "supply" ? "collateral leg earns" : "debt leg pays"} continuously), so the true peak can sit slightly above this figure. A token amount in the vault's own leg — Fluid runs no USD feed, so no dollar value is asserted.`,
  contract: vaultContract(coords),
  via: `${FLUID_VIA} · max(${side === "supply" ? "col" : "debt"}_after) across the position's captured events · mint → close`,
  inputs: eventInputs(coords),
});

// ── identity ─────────────────────────────────────────────────────────────────

const FACTORY_CONTRACT = { name: "Fluid VaultFactory (ERC721)", address: FLUID_ADDRESSES.VAULT_FACTORY };

/** The position's owner — the factory's ERC721 Transfer log (mint = from the
 *  zero address; later transfers move the whole position). */
export const ownerProv = (coords: FluidCoords, owner?: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The position's owner${owner ? ` (${owner})` : ""} — the \`to\` party of the factory's ERC721 Transfer for this NFT id${atBlock(coords)}. Every Fluid position is a factory-minted NFT: the mint Transfer (from the zero address) opens it, and any later Transfer moves the whole position — collateral, debt, liquidation exposure — to the new owner.`,
  contract: FACTORY_CONTRACT,
  via: "VaultFactory · ERC721 Transfer log · to",
  inputs: eventInputs(coords),
});

/** Third-party action: the position owner neither signed the transaction nor
 *  was the operate's initiator (msg.sender). Each fact alone over-marks:
 *  routed flows keep the owner as signer; contract-owned positions keep the
 *  owner as initiator — a genuine external action fails both. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; initiator: string },
  coords: FluidCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType.replace(/_/g, " ")} was executed by a third party: the position owner neither signed the transaction nor was the operate's initiator (the vault call's msg.sender). Both facts are chain values${atBlock(coords)}; each is compared against the owner at this event. Routed flows keep the owner as signer and contract-owned positions keep the owner as initiator — this event has the owner as neither.`,
  contract: vaultContract(coords),
  via: `${FLUID_VIA} · tx envelope from + LogOperate initiator vs owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "initiator",
      value: args.initiator,
      kind: "chain",
      note: "the vault call's msg.sender",
    },
  ]),
});

/** The liquidator — LogLiquidate's own emitted param (absorbed rows have none). */
export const liquidatorProv = (coords: FluidCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Who executed this liquidation — the liquidator param the vault's LogLiquidate event itself carries${atBlock(coords)}. The one emitted identity on a tick sweep: the EVENT names its liquidator but no position, so this party is a log fact while the per-position amounts beside it are settled reads.`,
  contract: vaultContract(coords),
  via: `${FLUID_VIA} · LogLiquidate log · ${fieldSeg("liquidator", raw)}`,
  inputs: eventInputs(coords),
});

// ── economics tower ──────────────────────────────────────────────────────────

/** A lifetime gross flow (Σ withdrawn / repaid / liquidation-swept on one leg)
 *  — the sum of the position's own deltas across its whole captured history
 *  (complete from the NFT's mint). */
export const fluidLifetimeFlowProv = (
  flow: "withdrawn" | "repaid" | "seized collateral" | "liquidated debt",
  sym: string,
): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (${sym}) — the sum of every ${sym} this position's own history ${
    flow === "withdrawn"
      ? "withdrew (negative colAmt_ legs)"
      : flow === "repaid"
        ? "repaid (negative debtAmt_ legs)"
        : flow === "seized collateral"
          ? "lost to liquidation sweeps (settled before − after per attribution row)"
          : "had cleared by liquidators (settled before − after per attribution row)"
  }, across its whole captured history (complete from the NFT's mint). Operate legs are emitted amounts; liquidation legs are the attribution rows' settled reads — the sum itself lives only in the index.`,
  contract: { name: "Fluid vault", address: "" },
  via: `${FLUID_VIA} · Σ across the position's own logs + liquidation attributions · mint → head`,
});
