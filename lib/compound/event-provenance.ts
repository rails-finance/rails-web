// Compound V3 (Comet) provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// Every position value traces to a Comet event field or a truth-preserving sum of
// them (the replayed signed base / per-asset collateral balance) — so every
// Provenance here is `kind:"chain"`. This IS the chain-state surface. The
// interpreted figures Comet's own UI shows (current value WITH interest, health
// factor, borrow capacity, USD, APR) are deliberately absent: they would be
// `<Layer>`s, not part of this chain-direct baseline.
//
// Values replay the captured compound_v3_* events. The `contract` is the
// per-market Comet proxy (passed in as `coords.comet`), since each market is its
// own contract.
//
// Since the Base explorer (2026-08-25) the same receipts serve a second lane
// with no index behind it: the Comet's own logs, swept live for the request.
// Two things in a receipt are claims about THAT lane rather than about the
// event, and both ride on the coords rather than on a second vocabulary — the
// custody segment of the via line (`source`), and the chain the "confirm it
// yourself" link points at (`chainId`). Each defaults to what every existing
// call site meant, so the Ethereum receipts render byte-identical.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const COMET_INDEX_VIA = "captured Comet events (compound_v3_*)";
const COMET_SWEEP_VIA = "live chunked eth_getLogs sweep of the Comet's own logs";
const captureVia = (coords?: CompoundCoords): string =>
  coords?.source === "sweep" ? COMET_SWEEP_VIA : COMET_INDEX_VIA;

export interface CompoundCoords {
  txHash?: string;
  blockNumber?: number;
  /** The chain the event lives on — decides which explorer the tx-logs link
   *  opens. Ethereum when absent, which is what every pre-Base receipt meant. */
  chainId?: ChainId;
  /** How the decoded log reached the page: the rails-server index (default), or
   *  a live sweep of the Comet's logs run for this request (the Base lane). */
  source?: "index" | "sweep";
  /** The Comet proxy address for this market — the contract every value cites. */
  comet?: string;
  /** Market label, e.g. "cUSDCv3". */
  marketLabel?: string;
  /** The touched token address (base or collateral). */
  asset?: string;
  /** Position owner. */
  account?: string;
}

const cometContract = (coords?: CompoundCoords) => ({
  name: coords?.marketLabel ? `Comet (${coords.marketLabel})` : "Comet",
  address: coords?.comet ?? "0x0000000000000000000000000000000000000000",
});

const atBlock = (coords?: CompoundCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Block-explorer tx-logs link for an emitted event field — zero-RPC, link
 *  only. Etherscan on Ethereum, Basescan on Base: a link a reader can follow
 *  is the whole point of it, and an Etherscan URL for a Base transaction opens
 *  on nothing. */
const txVerify = (coords?: CompoundCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(coords.chainId ?? MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** State-read proof: re-run the named Comet view yourself (an archive node for a
 *  historical block). For the LIVE reads (balanceOf / borrowBalanceOf) the re-run
 *  reproduces the value directly. */
const stateVerify = (method: string, block?: number | null): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Re-run the Comet.${method} eth_call at block ${block} against an archive node`
      : `Re-run the Comet.${method} eth_call against any node`,
});

/** Replay check: the collateral values are Σ event amounts, not slot reads — they
 *  match the non-accruing Comet slot when the captured history is complete. */
const replayCheck = (method: string, block?: number | null): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Check against the Comet.${method} eth_call at block ${block} (archive node) — the replay matches when the captured history is complete`
      : `Check against the Comet.${method} eth_call — the replay matches when the captured history is complete`,
});

function eventInputs(coords: CompoundCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.asset) inputs.push({ label: "asset", value: coords.asset, kind: "chain", note: "token address" });
  if (coords?.account) inputs.push({ label: "account", value: coords.account, kind: "chain", note: "position owner" });
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

// ── per-event deltas ─────────────────────────────────────────────────────────

/** Third-party action: the account owner neither signed the transaction nor
 *  provided the funds. Chain-derived over three chain facts — the tx
 *  envelope's sender, the event's own `from` param (the funder), and the
 *  account — each compared against the account. Only supply-side events carry
 *  a funder; withdraws' raw counterparty is a recipient and never marks. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; funder: string },
  coords: CompoundCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType.replace(/_/g, " ")} was executed by a third party: the account owner neither signed the transaction nor provided the funds. The transaction sender and the event's own from param (the funder) are both chain facts${atBlock(coords)}; each is compared against the account. Routed flows (bulkers) keep the owner as signer and contract-owned positions keep the owner as funder — this event has the owner as neither.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · tx envelope from + ${args.eventType === "supply" ? "Supply" : "SupplyCollateral"} from param vs account`,
  inputs: eventInputs(coords, [
    { label: "account", value: args.owner, kind: "chain", note: "whose position this event moved (dst)" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "funder",
      value: args.funder,
      kind: "chain",
      note: "provided the tokens (the event's from param)",
    },
  ]),
});

/** Signed BASE amount this event moved (the Supply/Withdraw `amount`). */
export const baseDeltaProv = (sym: string, side: "supply" | "withdraw", coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} base this operation moved — the amount the event itself carries, exactly as the Comet emitted it${atBlock(coords)}, scaled by the base asset's decimals. Base is signed: a supply lifts it toward lending, a withdraw drives it toward borrowing.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · ${side === "supply" ? "Supply" : "Withdraw"} log · amount`,
  inputs: eventInputs(coords),
});

/** Signed COLLATERAL amount this event moved (SupplyCollateral/WithdrawCollateral `amount`). */
export const collateralDeltaProv = (sym: string, side: "supply" | "withdraw", coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} collateral this operation moved — the amount the event itself carries, exactly as the Comet emitted it${atBlock(coords)}, scaled by the token's decimals. Collateral is non-earning, so this is exact.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · ${side === "supply" ? "SupplyCollateral" : "WithdrawCollateral"} log · amount`,
  inputs: eventInputs(coords),
});

/** BASE amount moved by a Comet ERC20 transfer between two accounts (`Transfer`
 *  log `amount`). A position move, not a supply/withdraw — value changes custody
 *  without leaving the market. */
export const transferBaseProv = (sym: string, dir: "in" | "out", coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} base this transfer moved ${dir === "in" ? "into" : "out of"} the account — the amount the Comet's own ERC20 Transfer log carries${atBlock(coords)}, scaled by the base asset's decimals. A position move between two accounts: it changes the signed base balance without a supply or withdraw.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · Transfer log · amount`,
  inputs: eventInputs(coords),
});

/** COLLATERAL amount moved by a Comet `transferAsset` between two accounts
 *  (`TransferCollateral` log `amount`). */
export const transferCollateralProv = (sym: string, dir: "in" | "out", coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} collateral this transfer moved ${dir === "in" ? "into" : "out of"} the account — the amount the Comet's own TransferCollateral log carries${atBlock(coords)}, scaled by the token's decimals. Collateral custody moved to another account; nothing was withdrawn to a wallet.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · TransferCollateral log · amount`,
  inputs: eventInputs(coords),
});

/** The OTHER account in a position transfer — the recipient on an _out (the
 *  log's `to`), the sender on an _in (the log's `from`). A counterparty, not a
 *  verdict about who signed. */
export const transferCounterpartyProv = (
  dir: "in" | "out",
  collateral: boolean,
  coords: CompoundCoords,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${dir === "in" ? "sending" : "receiving"} account on the other side of this position transfer — the ${dir === "in" ? "from" : "to"} address the Comet's ${collateral ? "TransferCollateral" : "Transfer"} log carries${atBlock(coords)}. The counterparty of the move itself, not who signed the transaction.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · ${collateral ? "TransferCollateral" : "Transfer"} log · ${dir === "in" ? "from" : "to"}`,
  inputs: eventInputs(coords),
});

/** Base cleared on an AbsorbDebt liquidation (`basePaidOut`). */
export const absorbDebtProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} base debt the protocol absorbed in this liquidation — the debt the protocol paid down for the borrower, exactly as the Comet emitted it${atBlock(coords)}, scaled by the base asset's decimals. It clears the borrower's negative base.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · AbsorbDebt log · basePaidOut`,
  inputs: eventInputs(coords),
});

/** Collateral seized on an AbsorbCollateral liquidation (`collateralAbsorbed`). */
export const absorbCollateralProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} collateral seized in this liquidation — the collateral the protocol absorbed from the borrower, exactly as the Comet emitted it${atBlock(coords)}, scaled by the token's decimals.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · AbsorbCollateral log · collateralAbsorbed`,
  inputs: eventInputs(coords),
});

/** The receipt for the single signed amount an event moved — the one the header
 *  registers as its change delta. Centralises the eventType → prov mapping so the
 *  spine flank can echo the SAME receipt (its `<Prov>` must match info/value/symbol).
 *  Returns undefined for event types that carry no single moved amount. */
export const movedDeltaProv = (
  eventType: CompoundContext["eventType"],
  sym: string,
  coords: CompoundCoords,
): Provenance | undefined => {
  switch (eventType) {
    case "supply":
      return baseDeltaProv(sym, "supply", coords);
    case "withdraw":
      return baseDeltaProv(sym, "withdraw", coords);
    case "absorb_debt":
      return absorbDebtProv(sym, coords);
    case "supply_collateral":
      return collateralDeltaProv(sym, "supply", coords);
    case "withdraw_collateral":
      return collateralDeltaProv(sym, "withdraw", coords);
    case "absorb_collateral":
      return absorbCollateralProv(sym, coords);
    case "transfer_in":
      return transferBaseProv(sym, "in", coords);
    case "transfer_out":
      return transferBaseProv(sym, "out", coords);
    case "transfer_collateral_in":
      return transferCollateralProv(sym, "in", coords);
    case "transfer_collateral_out":
      return transferCollateralProv(sym, "out", coords);
    default:
      return undefined;
  }
};

// ── absorption forensics (the valued legs) ───────────────────────────────────
//
// Comet's absorb events emit their own `usdValue` — the protocol's oracle
// reckoning of the leg at absorption time, 8-dec USD, in the log itself. So
// the forensics legs are CHAIN figures (emitted params), not an overlay
// oracle read: the cleared leg is AbsorbDebt.usdValue verbatim; the seized
// leg is the same-tx AbsorbCollateral usdValues summed (chain-derived only
// through addition).

/** The cleared-debt leg — AbsorbDebt's own usdValue, verbatim. */
export const absorbDebtUsdProv = (sym: string, coords: CompoundCoords, vals: { amount: string }): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `What the cleared ${sym} debt was worth at the moment the protocol absorbed it — the AbsorbDebt event's own usdValue param, the Comet's oracle reckoning emitted in the log itself${atBlock(coords)}. Not a later price applied to the amount: the chain states this figure.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · AbsorbDebt log · usdValue`,
  inputs: eventInputs(coords, [{ label: "debt cleared", value: vals.amount, kind: "chain", note: "basePaidOut" }]),
});

/** The seized-collateral leg — Σ same-tx AbsorbCollateral usdValues. */
export const absorbSeizedUsdProv = (
  coords: CompoundCoords,
  legs: { symbol: string; amount: string; usdValue: string }[],
): Provenance => ({
  kind: legs.length > 1 ? "chain-derived" : "chain",
  pclass: "emitted",
  formula: legs.length > 1 ? "Σ usdValue across the absorption's AbsorbCollateral logs" : undefined,
  verify: txVerify(coords),
  summary:
    legs.length > 1
      ? `What the seized collateral was worth at absorption — the sum of each AbsorbCollateral event's own usdValue in this transaction (Comet absorbs the whole account: every collateral asset is seized in one call). Each addend is the Comet's oracle reckoning emitted in the log itself${atBlock(coords)}.`
      : `What the seized collateral was worth at the moment the protocol absorbed it — the AbsorbCollateral event's own usdValue param, the Comet's oracle reckoning emitted in the log itself${atBlock(coords)}.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · AbsorbCollateral log${legs.length > 1 ? "s" : ""} · usdValue`,
  inputs: eventInputs(
    coords,
    legs.map((l) => ({
      label: `${l.symbol} seized`,
      value: `${l.amount} ${l.symbol} · $${l.usdValue}`,
      kind: "chain" as const,
      note: "collateralAbsorbed · usdValue",
    })),
  ),
});

/** The implied at-fire price of one absorbed asset — usdValue ÷ amount. */
export const absorbPriceProv = (
  sym: string,
  coords: CompoundCoords,
  vals: { amount: string; usdValue: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  formula: "usdValue ÷ amount",
  verify: txVerify(coords),
  summary: `The price the protocol carried ${sym} at when it absorbed this account — the absorb event's own usdValue divided by the amount it moved, both emitted in the same log${atBlock(coords)}. This is the Comet's oracle at absorption time, recovered from the event's own two params.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · absorb log · usdValue ÷ amount`,
  inputs: eventInputs(coords, [
    { label: "amount", value: `${vals.amount} ${sym}`, kind: "chain", note: "emitted" },
    { label: "usdValue", value: `$${vals.usdValue}`, kind: "chain", note: "emitted" },
  ]),
});

/** The absorption margin — seized ÷ cleared − 1 over the two legs. */
export const absorbMarginProv = (
  coords: CompoundCoords,
  vals: { seizedUsd: string; clearedUsd: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  formula: "seized ÷ cleared − 1",
  verify: txVerify(coords),
  summary: `The margin the protocol absorbed with this account — seized collateral value over cleared debt value, minus one, both legs the absorb events' own usdValue figures${atBlock(coords)}. Positive: the account still had a cushion, which the protocol keeps and resells to liquidators at a discount (buyCollateral). Negative: the account was absorbed under water — the seized collateral no longer covered the debt, and the gap fell to the protocol's reserves.`,
  contract: cometContract(coords),
  via: "seized ÷ cleared − 1 · both legs emitted usdValue",
  inputs: eventInputs(coords, [
    { label: "seized", value: vals.seizedUsd, kind: "chain", note: "Σ AbsorbCollateral usdValue" },
    { label: "cleared", value: vals.clearedUsd, kind: "chain", note: "AbsorbDebt usdValue" },
  ]),
});

// ── balances after an event (replay) ─────────────────────────────────────────

/** Signed BASE balance AFTER this event = Σ signed base deltas up to this block. */
export const baseAfterProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `The SIGNED ${sym} base balance the position held AFTER this event — the position's running base, replayed from its own on-chain events (supplies add, withdrawals subtract, a liquidation's absorbed debt adds back) in log order up to this block${atBlock(coords)}. > 0 is net lending, < 0 is net borrowing. This is the nominal PRINCIPAL flow — interest the position earns/owes since each move is not added (that is a derived layer).`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · Σ ±amount across Supply/Withdraw/AbsorbDebt logs · in on-chain order`,
  inputs: eventInputs(coords),
});

/** Collateral balance of one asset AFTER this event = Σ that asset's collateral deltas. */
export const collateralAfterProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: replayCheck("collateralBalanceOf", coords.blockNumber),
  summary: `The ${sym} collateral the position held AFTER this event — the position's running collateral in this asset, replayed from its own on-chain events (collateral supplies add, withdrawals and liquidation absorptions subtract) in log order up to this block${atBlock(coords)}. Collateral does not accrue in Comet, so the replay is exact.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · Σ ±amount across SupplyCollateral/WithdrawCollateral/AbsorbCollateral logs · in on-chain order`,
  inputs: eventInputs(coords),
});

// ── reconstructed before an event (after − change) ───────────────────────────

/** Signed BASE balance BEFORE this event = base after − the signed base amount
 *  this event moved. Arithmetic over two on-chain figures (the replayed after
 *  and the logged delta) — every leaf is on-chain, so chain-derived and it stays
 *  in the chain-state view. Same nominal-principal basis as the after (accrued
 *  interest is a separate layer). */
export const baseBeforeProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The SIGNED ${sym} base balance the position held BEFORE this event — the after-balance minus this event's own signed base amount (after − change), reconstructed in the browser from the replayed after and the logged delta, not a distinct chain read. Nominal principal, same basis as the after (accrued interest is a separate layer).`,
  contract: cometContract(coords),
  via: "base after − signed amount",
  formula: "after − change",
  // Operand rows: the driver (reconstructTransition) fills the values it
  // actually subtracted; the vocabulary owns the labels + grain.
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed signed ${sym} base after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's signed base amount" },
  ]),
});

/** Collateral balance of one asset BEFORE this event = collateral after − the
 *  moved amount. Every leaf on-chain, so chain-derived; collateral is non-earning,
 *  so the reconstruction is exact. */
export const collateralBeforeProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The ${sym} collateral the position held BEFORE this event — the after-balance minus this event's own collateral amount (after − change), reconstructed in the browser from the replayed after and the logged delta, not a distinct chain read. Collateral doesn't accrue in Comet, so this is exact.`,
  contract: cometContract(coords),
  via: "collateral after − amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: `replayed ${sym} collateral after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's collateral amount (signed)" },
  ]),
});

// ── position-card balances ───────────────────────────────────────────────────

/** Position-card SIGNED base balance for a market. */
export const positionBaseProv = (sym: string, side: "lend" | "borrow", coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Base ${side === "lend" ? "lent" : "borrowed"} (${sym}) — the position's net base principal, replayed from its own supplies, withdrawals and absorbed debt for this market. ${side === "lend" ? "Positive base: it earns the supply rate." : "Negative base: it pays the borrow rate."} Nominal principal (excludes accrued interest — a derived layer).`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · Σ ±amount across Supply/Withdraw/AbsorbDebt logs`,
  inputs: eventInputs(coords),
});

/** Position-card CURRENT base value WITH interest — the Slice-2 chain read.
 *  This is chain-DIRECT (a live `eth_call`), not a replay, so it shows even under
 *  on-chain-only; the principal/accrued split derived from it is the derived layer. */
export const currentBaseProv = (
  sym: string,
  side: "lend" | "borrow",
  coords: CompoundCoords,
  block: number | null,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify(side === "lend" ? "balanceOf" : "borrowBalanceOf", block),
  summary: `Current ${sym} base with accrued interest — the ${side === "lend" ? "lent balance the position has earned to (supply rate applied)" : "debt the position owes (borrow rate applied)"}, read live from the Comet contract${block != null ? ` at block ${block}` : ""}. Unlike the event replay (principal only), this applies the live Comet index, so it is the true current amount. Maintained head-lagged by the chain refresher.`,
  contract: cometContract(coords),
  via: `Comet · ${side === "lend" ? "balanceOf" : "borrowBalanceOf"}`,
  inputs:
    block != null
      ? [{ label: "block", value: String(block), kind: "chain", pclass: "state", note: "chain read block" }]
      : [],
});

/** ACCRUED interest on the base — the split that lights up the economics tower.
 *  It is the live current value (chain, with interest) MINUS the principal
 *  reconstructed from the event replay — a difference of two chain-true
 *  quantities, so `chain-derived` (it survives the on-chain-only gate; the same
 *  ruling as the before-balance reconstruction above and Spark's debt-interest
 *  split). Exact when the event capture is complete from the position's genesis. */
export const accruedBaseProv = (sym: string, side: "lend" | "borrow", coords: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Interest ${side === "borrow" ? "accrued on the borrow" : "earned on the supply"} (${sym}) — the live current base value (which already includes interest) minus the nominal principal replayed from the position's own base moves. Exact when the captured event history is complete from the position's first base move.`,
  contract: cometContract(coords),
  via: `current (Comet ${side === "borrow" ? "borrowBalanceOf" : "balanceOf"}) − principal (Σ replayed base amounts)`,
  inputs: eventInputs(coords),
});

/** Position-card collateral balance for one asset. */
export const positionCollateralProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: replayCheck("collateralBalanceOf", coords.blockNumber),
  summary: `The ${sym} collateral the position holds — replayed from the position's own collateral supplies and withdrawals (and liquidation absorptions) for this market. Non-earning, so exact.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · Σ ±amount across SupplyCollateral/WithdrawCollateral/AbsorbCollateral logs`,
  inputs: eventInputs(coords),
});

// ── closed-card peaks (highest recorded amounts) ─────────────────────────────

/** Highest recorded base peak on a closed/liquidated card — the deepest (borrow)
 *  or highest (lend) excursion of the SIGNED base lane replayed from the
 *  position's own logs. A max over the replayed series, so chain-derived. */
export const peakBaseProv = (sym: string, side: "lend" | "borrow", coords: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    side === "borrow"
      ? `The highest ${sym} borrow principal this position ever recorded — the deepest point of its signed base lane, replayed from its own Supply/Withdraw/AbsorbDebt logs. Interest accrues between events with no log of its own, so the true peak debt can sit slightly above the largest replayed figure; a residue at or below the market's interest-dust threshold reads as zero rather than claim a phantom borrow.`
      : `The highest ${sym} lent balance this position ever recorded — the highest point of its signed base lane, replayed from its own Supply/Withdraw/AbsorbDebt logs. Interest earned between events has no log of its own, so the peak including interest can sit slightly above; a residue at or below the market's interest-dust threshold reads as zero rather than claim a phantom lend.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · ${side === "borrow" ? "floor(−min(base after))" : "floor(max(base after))"} across the replayed base lane · dust-clamped`,
  inputs: eventInputs(coords),
});

/** Highest recorded collateral for one asset on a closed/liquidated card. */
export const peakCollateralProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The most ${sym} collateral this position ever held — the highest point of that asset's replayed collateral lane across its SupplyCollateral/WithdrawCollateral/TransferCollateral/AbsorbCollateral logs. Collateral doesn't accrue in Comet, so the replay is exact.`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · floor(max(collateral after)) across the collateral lane`,
  inputs: eventInputs(coords),
});

/** A USD figure valued at Comet's OWN on-chain oracle — the chain-state token
 *  balance multiplied by `Comet.getPrice(priceFeed)` (the same Chainlink feed
 *  Comet's liquidation engine reads), NOT an off-chain market cache. Both legs are
 *  on-chain, so the product is `chain-derived` and survives the chain-state gate —
 *  the on-chain sibling of Aave's `usdProvOnchain`. Used only when every asset in
 *  the total is oracle-priced; a partial total stays token-only rather than assert
 *  an incomplete figure. */
export const compoundUsdProvOnchain = (what: string, coords?: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  // Both legs on-chain; the oracle price is the furthest class, so it leads.
  pclass: "oracle",
  summary: `${what} valued in USD from Comet's own on-chain oracle — the chain-state token balance multiplied by the same Chainlink price Comet's liquidation engine reads (\`getPrice\`), not an off-chain market feed. The cWETHv3 market's feeds quote in ETH, so its values are converted with Comet's own WETH/USD feed (read from the cUSDCv3 market) — both legs the protocol's own oracle.`,
  contract: cometContract(coords),
  via: "chain balance × on-chain oracle price",
  formula: "balance × oracle price",
  inputs: [
    { label: "balance", kind: "chain", pclass: "state", note: "replayed position balance" },
    { label: "oracle price", kind: "chain", pclass: "oracle", note: "Comet getPrice (Chainlink feed)" },
  ],
});

// ── lifetime flows (economics tower) ─────────────────────────────────────────

/** The lifetime flow buckets the economics tower draws. Base flows are the
 *  zero-crossing decomposition of the running signed balance (Comet's own
 *  semantics: a supply into a negative balance repays first; a withdraw below
 *  zero is a borrow); collateral flows sum per asset. */
export type CompoundLifetimeFlow =
  | "deposited"
  | "withdrawn"
  | "borrowed"
  | "repaid"
  | "absorbed debt"
  | "supplied collateral"
  | "withdrawn collateral"
  | "absorbed collateral"
  | "received collateral"
  | "transferred collateral";

const FLOW_STORY: Record<CompoundLifetimeFlow, string> = {
  deposited: "the base this position lent in (supplies while the running balance was ≥ 0)",
  withdrawn: "the lent base withdrawn back out (withdrawals down to a zero balance)",
  borrowed: "the base drawn below zero — Comet's borrow is a withdrawal past the account's own balance",
  repaid: "the base supplied back against a negative balance — Comet's repay is a supply that clears debt first",
  "absorbed debt": "the negative base the protocol cleared for this account in liquidations (AbsorbDebt)",
  "supplied collateral": "every collateral amount this position supplied",
  "withdrawn collateral": "every collateral amount this position withdrew back out",
  "absorbed collateral": "the collateral the protocol seized in liquidations (AbsorbCollateral)",
  "received collateral":
    "collateral moved IN from another Comet account (transferAsset) — custody arrived here without a fresh deposit",
  "transferred collateral":
    "collateral moved OUT to another Comet account (transferAsset) — custody left here without a withdrawal to a wallet",
};

/** A lifetime-flow total — Σ event amounts over the position's whole captured
 *  history, with base flows split at the running balance's zero crossings.
 *  Every leaf is an emitted on-chain amount and the split mirrors Comet's own
 *  supply-repays-first / withdraw-borrows semantics, so chain-derived. */
export const lifetimeFlowProv = (flow: CompoundLifetimeFlow, sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (${sym}) — ${FLOW_STORY[flow]}, summed over the position's whole captured history. Base flows split at the running balance's zero crossings — Comet's own semantics (a supply repays debt first; a withdraw past the balance is a borrow). Shown only when the replayed net matches the current balance (a complete capture).`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · Σ amount across the position's own logs · split at zero crossings`,
  inputs: eventInputs(coords),
});

/** Net borrowed PRINCIPAL — the tower's debt base line when the interest split
 *  renders: Σ (borrowed − repaid − absorbed debt) from the position's own
 *  events. Principal only; the accrued segment sits on top (principal +
 *  interest = the live borrowBalanceOf). */
export const debtPrincipalProv = (sym: string, coords: CompoundCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} PRINCIPAL — the net of every draw, repayment and liquidation absorption the position's own events moved, across its whole captured history. Principal only — the interest accrued since each draw is the separate accrued segment above it (principal + interest = the live Comet borrowBalanceOf).`,
  contract: cometContract(coords),
  via: `${captureVia(coords)} · Σ (borrowed − repaid − absorbed) · genesis → head`,
  inputs: eventInputs(coords),
});
