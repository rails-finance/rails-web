// Morpho provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// Every position value traces to a Morpho Blue event field or a sum of them
// (collateral, borrowed/supplied principal, share balances) — so every Provenance
// here is `kind:"chain"`. This IS the chain-state surface. The only derived figure
// (current debt WITH accrued interest = borrow shares × the market index, and any
// LTV) belongs to a later `<Layer>`, not this file — the dump's interest stream
// doesn't reach T, so that conversion can't be chain-direct here.
//
// Values replay the captured morpho_* events.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { MORPHO_ADDRESSES } from "./asset-catalog";
import { formatDate } from "@/lib/date";
import type { MorphoIndexRead } from "@/lib/sources/api/morpho-positions";

const MORPHO = { name: "Morpho Blue", address: MORPHO_ADDRESSES.MORPHO_BLUE };

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
//
// Two custodies, because the same cards now serve two lanes. On Ethereum the
// decoded logs come out of the rails-server index; on Base there is no index
// and the route sweeps the singleton's own logs when the page asks. A receipt
// that named an index behind a Base page would be pointing the reader at
// something that does not exist, so the card passes which one it is on
// (`MorphoCoords.source`, from the page's CaptureSourceProvider).
const MORPHO_INDEX_VIA = "captured Morpho events (morpho_*)";
const MORPHO_SWEEP_VIA = "live chunked eth_getLogs sweep of the singleton's own logs";
const captureVia = (coords?: MorphoCoords): string =>
  coords?.source === "sweep" ? MORPHO_SWEEP_VIA : MORPHO_INDEX_VIA;

/** The Solidity event each timeline action decodes from — surfaced on the via
 *  line so the receipt names the actual log, not just the field. */
const MORPHO_LOG: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  supply_collateral: "SupplyCollateral",
  withdraw_collateral: "WithdrawCollateral",
  liquidation: "Liquidate",
};

export interface MorphoCoords {
  txHash?: string;
  blockNumber?: number;
  marketId?: string;
  owner?: string;
  /** Which chain the value lives on — drives every "confirm it yourself"
   *  link. Ethereum when absent, so the L1 pages render exactly as before. */
  chainId?: ChainId;
  /** How the decoded logs reached the page — the custody line. "index" when
   *  absent (the default every indexed page relies on). */
  source?: "index" | "sweep";
}

const atBlock = (coords?: MorphoCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Block-explorer tx-logs link for an emitted event field — zero-RPC, link
 *  only. The explorer is the chain's own (Basescan for a Base coordinate). */
const txVerify = (coords?: MorphoCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(coords.chainId ?? MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** State-read proof: re-run the Morpho.position eth_call yourself (an archive node
 *  for a historical block). Morpho's on-chain position struct stores collateral and
 *  borrowShares, so the replayed after-balances equal the slot and verify this way. */
const stateVerify = (coords?: MorphoCoords): ProvVerify => ({
  kind: "recompute",
  text:
    coords?.blockNumber != null
      ? `Re-run the Morpho.position eth_call at block ${coords.blockNumber} against an archive node`
      : "Re-run the Morpho.position eth_call against any node",
});

function eventInputs(coords: MorphoCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.marketId)
    inputs.push({ label: "market", value: coords.marketId, kind: "chain", note: "Morpho market id" });
  if (coords?.owner) inputs.push({ label: "owner", value: coords.owner, kind: "chain", note: "position owner" });
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

/** Signed amount of the token this event moved (collateral or loan asset).
 *  Pass `eventType` so the via names the actual log — a liquidation's
 *  collateral delta is the Liquidate log's `seizedAssets`, not an `assets`
 *  field (Liquidate carries no `assets`). */
export const assetsDeltaProv = (
  sym: string,
  side: "loan" | "collateral",
  coords: MorphoCoords,
  eventType?: string,
): Provenance => {
  const isLiq = eventType === "liquidation";
  const log = eventType ? MORPHO_LOG[eventType] : undefined;
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: isLiq
      ? `Collateral (${sym}) seized in this liquidation — the collateral the liquidator took, exactly as Morpho Blue emitted it${atBlock(coords)}, scaled by the token's decimals. Decoded from the log, never recomputed.`
      : `The ${side === "loan" ? "loan" : "collateral"} asset (${sym}) this operation moved — the amount the event itself carries, exactly as Morpho Blue emitted it${atBlock(coords)}, scaled by the token's decimals. Decoded from the log, never recomputed.`,
    contract: MORPHO,
    via: `${captureVia(coords)} · ${log ? `${log} log · ` : ""}${isLiq ? "seizedAssets" : "assets"}`,
    inputs: eventInputs(coords),
  };
};

/** Third-party action: the position owner neither signed the transaction nor
 *  made the Morpho call. Chain-derived over three chain facts — the tx
 *  envelope's sender, the event's own `caller` param, and the owner
 *  (on_behalf) — each compared against the owner. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; caller: string },
  coords: MorphoCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType.replace(/_/g, " ")} was executed by a third party: the position owner neither signed the transaction nor made the Morpho call. The transaction sender and the event's own caller param (msg.sender, authorized for the position) are both chain facts${atBlock(coords)}; each is compared against the owner. Bundler-routed flows keep the owner as signer and contract-owned positions keep the owner as caller — this event has the owner as neither.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · tx envelope from + ${MORPHO_LOG[args.eventType] ?? args.eventType} caller param vs owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved (onBehalf)" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "caller",
      value: args.caller,
      kind: "chain",
      note: "msg.sender at Morpho Blue (the event's caller param)",
    },
  ]),
});

/** Collateral the position holds AFTER this event = Σ collateral deltas. */
export const collateralAfterProv = (sym: string, coords: MorphoCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify(coords),
  summary: `Collateral (${sym}) the position held AFTER this event — the position's running collateral, replayed from its own on-chain events (deposits add, withdrawals and liquidation seizures subtract) in log order up to this block${atBlock(coords)}. Collateral doesn't accrue, so the replay is exact.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Σ ±assets across SupplyCollateral/WithdrawCollateral/Liquidate logs · in on-chain order`,
  inputs: eventInputs(coords),
});

/** Net borrowed PRINCIPAL after = Σ (borrow − repay) assets. */
export const borrowedAfterProv = (sym: string, coords: MorphoCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Net borrowed PRINCIPAL (${sym}) after this event — the position's running loan-asset principal, replayed from its own on-chain events (draws add; repayments and the debt a liquidation clears — bad debt included — subtract) in log order up to this block${atBlock(coords)}. Principal only: interest accrued since each draw is excluded (current debt with interest needs the market index — a derived layer).`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Σ ±assets across Borrow/Repay/Liquidate logs · in on-chain order`,
  inputs: eventInputs(coords),
});

/** Net supplied PRINCIPAL after, on the LENDER side = Σ (supply − withdraw)
 *  assets. Only the swept lane replays this axis (the index carries no lender
 *  rows), so it renders only where a feeding lane set it. Principal only —
 *  the interest a supply earns accrues in the market index between events. */
export const suppliedAfterProv = (sym: string, coords: MorphoCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Net supplied PRINCIPAL (${sym}) after this event — the wallet's running lender-side principal in this market, replayed from its own Supply and Withdraw logs in log order up to this block${atBlock(coords)}. Principal only: the interest the supply has earned since accrues in the market index and is excluded.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Σ ±assets across Supply/Withdraw logs · in on-chain order`,
  inputs: eventInputs(coords),
});

/** Net supplied PRINCIPAL BEFORE this event = supplied after − the moved
 *  amount — the same reconstruction the borrowed axis makes. */
export const suppliedBeforeProv = (sym: string, coords: MorphoCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Net supplied PRINCIPAL (${sym}) before this event — the after-balance minus the amount this event itself moved (after − change), reconstructed in the browser from the replayed after and the logged delta, not a distinct chain read. Principal only, same basis as the after.`,
  contract: MORPHO,
  via: "supplied after − this event's amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed supplied ${sym} principal after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "the amount this event itself moved (signed)" },
  ]),
});

/** Collateral BEFORE this event = collateral after − the moved amount. Arithmetic
 *  over two on-chain figures (the replayed after and the logged assets delta), so
 *  chain-derived — it shows in the chain-state view alongside the after it pairs
 *  with. Exact (collateral doesn't accrue). */
export const collateralBeforeProv = (sym: string, coords: MorphoCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Collateral (${sym}) the position held BEFORE this event — the after-balance minus the amount this event itself moved (after − change), reconstructed in the browser from the replayed after and the logged delta, not a distinct chain read. Collateral doesn't accrue, so this is exact.`,
  contract: MORPHO,
  via: "collateral after − this event's amount",
  formula: "after − change",
  // Operand rows: the driver (reconstructTransition) fills the values it
  // actually subtracted; the vocabulary owns the labels + grain.
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: `replayed ${sym} collateral after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "the amount this event itself moved (signed)" },
  ]),
});

/** Net borrowed PRINCIPAL BEFORE this event = borrowed after − the moved amount.
 *  Chain-derived on the same principal basis as the after (both replayed from the
 *  on-chain borrow/repay deltas); it shows in the chain-state view alongside that
 *  after. The pclass stays `indexed` — the inspector still narrates that it is a
 *  Rails replay, no single-slot third-party proof — but on-chain provenance, not
 *  step count, is what admits it to the chain-state view. */
export const borrowedBeforeProv = (sym: string, coords: MorphoCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Net borrowed PRINCIPAL (${sym}) before this event — the after-balance minus the amount this event itself moved (after − change), reconstructed in the browser from the replayed after and the logged delta, not a distinct chain read. Principal only, same basis as the after (interest since each draw is a derived layer).`,
  contract: MORPHO,
  via: "borrowed after − this event's amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed borrowed ${sym} principal after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "the amount this event itself moved (signed)" },
  ]),
});

/** Position-card collateral. */
export const positionCollateralProv = (sym: string, atBlockNum?: number, coords?: MorphoCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify({ blockNumber: atBlockNum }),
  summary: `Collateral (${sym}) the position holds — replayed from the position's own collateral deposits and withdrawals (and liquidation seizures)${atBlockNum ? ` at block ${atBlockNum}` : ""}. Exact (collateral doesn't accrue).`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Σ ±assets across SupplyCollateral/WithdrawCollateral/Liquidate logs`,
});

/** Position-card borrowed principal. */
export const positionBorrowedProv = (sym: string, atBlockNum?: number, coords?: MorphoCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Net borrowed PRINCIPAL (${sym}) — replayed from the position's own draws and repayments (and the debt a liquidation cleared)${atBlockNum ? ` at block ${atBlockNum}` : ""}. Principal only; current debt with interest is a derived layer.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Σ ±assets across Borrow/Repay/Liquidate logs`,
});

/** Terminal-card peak collateral — the MAX of the running collateral balance
 *  after each captured event. Collateral only moves when an event touches it
 *  (it doesn't accrue), so the recorded maximum IS the true lifetime peak. */
export const morphoPeakCollateralProv = (sym: string, coords?: MorphoCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `The highest ${sym} collateral this position ever recorded — the maximum of the running balance after each captured event (deposits, withdrawals, liquidation seizures). Exact: collateral only moves when an event touches it, so the recorded maximum is the true peak.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · max(collateral after each event) · open → close${coords?.marketId ? ` · market ${coords.marketId.slice(0, 10)}…` : ""}`,
});

/** Terminal-card peak borrowed principal — the MAX of the running net borrowed
 *  PRINCIPAL after each captured event. Interest accrues in the market index
 *  between events and is excluded by construction, so the debt actually owed at
 *  that moment sat above this figure by the interest accrued to then. */
export const morphoPeakBorrowedProv = (sym: string, coords?: MorphoCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `The highest net borrowed PRINCIPAL (${sym}) this position ever recorded — the maximum of the running principal after each captured event (draws, repayments, debt a liquidation cleared). Principal only: interest accrues in the market index between events, so the debt owed at that moment sat above this figure by the interest accrued to then.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · max(net principal after each event) · open → close${coords?.marketId ? ` · market ${coords.marketId.slice(0, 10)}…` : ""}`,
});

/** Lifetime gross flow (deposited / withdrawn / borrowed / repaid / liquidated)
 *  — the sum of that event type's own `assets` amounts over the position's life.
 *  Exact token amounts (Morpho events carry real assets, not normalized units). */
export const morphoFlowProv = (
  flow: "deposited" | "withdrawn" | "borrowed" | "repaid" | "liquidated",
  sym: string,
  coords?: MorphoCoords,
): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Total ${sym} ${flow} over the position's life — the sum of the matching amounts across the position's own logs. Exact token amounts (a gross flow needs no index).`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Σ ${flow} assets`,
});

/** Current debt WITH accrued interest = borrow shares converted to assets via
 *  the LIVE market index (toAssetsUp). Unlike the frozen dump (which couldn't
 *  reach the index at T), the `api` arm reads the live per-market index, so this
 *  is the same chain-direct multiply as Maker's art × rate — both operands are
 *  chain reads. The accrued-interest figure is this minus the principal. */
export const morphoCurrentDebtProv = (
  sym: string,
  sharesHuman: string,
  totalBorrowAssets: string,
  totalBorrowShares: string,
  coords?: MorphoCoords,
  index?: MorphoIndexRead,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary:
    `Current debt (${sym}) WITH accrued interest — the position's borrow shares converted to assets through Morpho's share index (toAssetsUp), reading ${index ? `the market's totals at block ${index.block.toLocaleString("en-US")}` : "the live per-market totals"}. Both operands are chain reads, so the figure is read from the chain, not a forward projection; the accrued-interest portion is this minus the Σ(borrow − repay) principal.` +
    (index?.stale
      ? ` Rails read those totals on ${formatDate(index.readAt)} and has not refreshed them since, so interest after that date is missing from this figure.`
      : ""),
  source: index ? { block: index.block } : undefined,
  contract: MORPHO,
  via: `${captureVia(coords)} · borrowShares → assets (toAssetsUp)`,
  formula: "shares × (totalBorrowAssets + 1) ÷ (totalBorrowShares + 1e6), rounded up",
  inputs: [
    {
      label: "borrowShares",
      value: sharesHuman,
      kind: "chain",
      pclass: "state",
      note: "position.borrowShares slot (Σ borrow − repay − liquidation shares)",
    },
    {
      label: "totalBorrowAssets",
      value: totalBorrowAssets,
      kind: "chain",
      pclass: "state",
      note: index ? `market slot at block ${index.block}` : "market slot — live",
    },
    {
      label: "totalBorrowShares",
      value: totalBorrowShares,
      kind: "chain",
      pclass: "state",
      note: index ? `market slot at block ${index.block}` : "market slot — live",
    },
  ],
});

// ── Liquidation forensics (the valued legs — loan-token denominated) ─────────
//
// Morpho Blue prices collateral IN THE LOAN TOKEN (IOracle.price(), 1e36) and
// has no USD anywhere — so the forensics legs are valued in the market's own
// loan token, never dollars. The oracle figure is the market's own, read at
// the event's block (mig 112 capture): the exact price the LLTV test and the
// liquidation-incentive math acted on.

/** The market's own oracle at the event's block (loan per 1 collateral). */
export const atBlockOraclePriceProv = (
  collSym: string,
  loanSym: string,
  coords: MorphoCoords,
  price: number,
): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the market oracle's price() eth_call at block ${coords.blockNumber} against an archive node (the oracle address is in the market's immutable params)`
        : "Re-run the market oracle's price() eth_call against an archive node",
  },
  summary: `${collSym} priced in ${loanSym} at this event's block — the market's OWN oracle (IOracle.price(), fixed in the market's immutable params at creation), ${coords.source === "sweep" ? "asked for its answer at that block directly" : "read at the block and captured into the index"}. This is the exact figure Morpho's LLTV test and liquidation-incentive math acted on. Morpho prices in the loan token by design; no USD is asserted anywhere.`,
  contract: MORPHO,
  via: "market oracle · price() eth_call at the event's block · 1e36-scaled, decimals-adjusted",
  inputs: [
    { label: `${collSym} price`, value: `${price} ${loanSym}`, kind: "chain", note: "oracle price(), at block" },
    ...eventInputs(coords),
  ],
});

/** The seized-collateral leg — seizedAssets × the at-block oracle price. */
export const liqSeizedValueProv = (
  collSym: string,
  loanSym: string,
  coords: MorphoCoords,
  vals: { amount: string; price: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "seized collateral × oracle price at block",
  verify: txVerify(coords),
  summary: `What the seized collateral was worth at the moment of the liquidation — in the market's own loan token: the Liquidate log's seizedAssets times the market oracle's price at the event's block. Both factors are chain values pinned to this block; the denomination is the loan token because that is the only unit Morpho itself prices in.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Liquidate log · seizedAssets × oracle price at block`,
  inputs: [
    { label: "seized", value: `${vals.amount} ${collSym}`, kind: "chain", note: "Liquidate · seizedAssets" },
    { label: "price at block", value: `${vals.price} ${loanSym}`, kind: "chain", note: "market oracle price()" },
    ...eventInputs(coords),
  ],
});

/** The cleared-loan leg — repaidAssets (+ any bad debt), already loan units. */
export const liqClearedValueProv = (loanSym: string, coords: MorphoCoords, vals: { amount: string }): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${loanSym} debt this liquidation cleared — the Liquidate log's repaid assets plus any bad debt the market socialized in the same event, exactly as emitted. Already in the market's own loan token: no price is applied to this leg.`,
  contract: MORPHO,
  via: `${captureVia(coords)} · Liquidate log · repaidAssets + badDebtAssets`,
  inputs: [
    { label: "cleared", value: `${vals.amount} ${loanSym}`, kind: "chain", note: "repaid + bad debt, emitted" },
    ...eventInputs(coords),
  ],
});

/** The realized premium — seized value ÷ cleared − 1, loan-token terms. */
export const liqPremiumProv = (
  loanSym: string,
  coords: MorphoCoords,
  vals: { seized: string; cleared: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "seized ÷ cleared − 1",
  verify: txVerify(coords),
  summary: `The premium realized on this liquidation — seized collateral value (at the market oracle's price this block, in ${loanSym}) over the loan cleared, minus one. This reproduces the market's Liquidation Incentive Factor as actually realized by the liquidator; when the event also socialized bad debt, the cleared leg includes it, and the figure can fall below the incentive (or negative — the seizure no longer covered the debt).`,
  contract: MORPHO,
  via: "seized ÷ cleared − 1 · both legs in the market's loan token",
  inputs: [
    { label: "seized", value: vals.seized, kind: "chain", note: "seizedAssets × price at block" },
    { label: "cleared", value: vals.cleared, kind: "chain", note: "repaid + bad debt" },
    ...eventInputs(coords),
  ],
});

/** Accrued interest = current debt (via the live index) − replayed principal.
 *  A difference of two chain quantities — chain-derived, survives the
 *  on-chain-only gate. */
export const morphoAccruedProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Accrued interest (${sym}) — the current debt (borrow shares through the live market index) minus the replayed Σ(borrow − repay) principal. A difference of two chain figures, computed in the browser; it grows as the market's totals accrue.`,
  contract: MORPHO,
  via: "current debt − borrowed principal",
  formula: "current − principal",
  inputs: [
    { label: "current", kind: "chain", pclass: "state", note: `live debt (${sym}) with interest — toAssetsUp` },
    { label: "principal", kind: "chain", pclass: "indexed", note: "replayed Σ(borrow − repay) assets" },
  ],
});
