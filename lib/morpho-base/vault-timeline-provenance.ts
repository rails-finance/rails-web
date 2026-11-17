// The receipts for a holder's timeline inside a MetaMorpho vault on Base.
// ----------------------------------------------------------------------------
// A sibling of vault-provenance.ts, which traces the vault's READING at one
// block. These trace its HISTORY, and the difference shows in every one of
// them: a reading's receipt names one block and one call, while a row's names
// the block THAT ROW happened at, and the gate's names two log sweeps and the
// balance they were checked against.
//
// Four things every receipt here holds to.
//
//   • THE BLOCK ON A ROW'S RECEIPT IS THE ROW'S OWN BLOCK, not the page's. A
//     share price on a row is `convertToAssets(10 ** decimals)` answered at the
//     block the address's own transaction landed in, and saying otherwise would
//     attach a head figure to a year-old event.
//   • NO RECEIPT SPEAKS ABOUT THE BLOCKS BETWEEN TWO ROWS. Rails read nothing
//     there. A summary that said "the price rose from X to Y" would be
//     asserting a path through blocks nobody chose, which is the sampled series
//     decision `0017` §6 refuses.
//   • THE LANE IS NAMED BY THE ROUTE IT SERVES, NEVER ITS URL OR ITS ENV VAR.
//   • A ROW STATES THIS ADDRESS'S OWN LEG AND STOPS. MetaMorpho mints
//     performance-fee shares to its fee recipient inside nearly every deposit
//     and withdrawal, so a transaction carrying this address's mint almost
//     always moved other shares too. Nothing here says it did not.
//
// Distance classes: `state` for a call at a block, `emitted` for a value decoded
// out of a log. The replayed running balance is `chain-derived` — every leaf is
// a log field and the only operation is a signed sum, which is the charter's
// truth-preserving delta replay.

import type { Provenance } from "@/components/shared/provenance";
import {
  refetchWords,
  withheldBoundWords,
  withheldCountWords,
  withheldReasonWords,
} from "@/lib/shared/vault-withheld-words";
import type {
  MorphoVaultNote,
  VaultAllocationLeg,
  VaultHistorySource,
  VaultHolderEvent,
  VaultHolderReconcile,
  VaultTimelineCoords,
  VaultWithheldBasis,
} from "@/lib/shared/vault-holder-timeline";

/** The chain the coordinates are on: Base unless they say Ethereum. */
const chainWord = (c: VaultTimelineCoords) => (c.chainId === 1 ? "Ethereum" : "Base");
const laneOf = (c: VaultTimelineCoords) =>
  c.chainId === 1
    ? "live Ethereum chain reads (/ethereum/morpho/vaults)"
    : "live Base chain reads (/base/morpho/vaults)";

export type { VaultTimelineCoords };

const vaultContract = (c: VaultTimelineCoords): Provenance["contract"] => ({
  name: c.vaultName ? `${c.vaultName} (MetaMorpho)` : "MetaMorpho vault",
  address: c.vault,
});

const atBlock = (c: VaultTimelineCoords): string =>
  c.blockNumber != null ? ` at block ${c.blockNumber.toLocaleString("en-US")}` : "";
const asset = (c: VaultTimelineCoords) => c.assetSymbol ?? "the vault's asset";

/** What each `Transfer` classification means, said as the chain decides it. */
const KIND_CLAUSE: Record<VaultHolderEvent["kind"], string> = {
  deposit: "the sender is the zero address, so the shares were minted — a deposit",
  withdrawal: "the receiver is the zero address, so the shares were burned — a withdrawal",
  "transfer-in":
    "neither end is the zero address and this address is the receiver, so the shares arrived from another holder",
  "transfer-out":
    "neither end is the zero address and this address is the sender, so the shares went to another holder",
  "transfer-self": "both ends of the transfer are this same address, so the balance did not move",
  cooldown: "no shares moved: a MetaMorpho vault has no cooldown, so this row cannot occur here",
};

// ── the gate ─────────────────────────────────────────────────────────────────

/** The reconcile check itself — the receipt behind the two figures the page
 *  states whether or not it goes on to draw anything. */
export const morphoVaultTimelineGateProv = (c: VaultTimelineCoords, r: VaultHolderReconcile): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's Transfer logs that name this address as sender and as receiver, blocks ${r.fromBlock} to ${r.toBlock}, add the values with their signs, and compare the sum with balanceOf(${c.holder ?? "the address"}) at block ${r.toBlock}.`,
  },
  summary: `The history check — every transfer this address sent or received on this vault, replayed into a balance and compared with the vault's balance for it at block ${r.toBlock.toLocaleString("en-US")}. Over blocks ${r.fromBlock.toLocaleString("en-US")} to ${r.toBlock.toLocaleString("en-US")} the vault recorded ${r.logsOut} transfers from this address and ${r.logsIn} to it; their signed sum is ${r.replayed} and the vault's balance reads ${r.onChain}.${r.cutBalance != null ? ` The replay is in two halves: ${r.cutBalance} is the signed sum of every row kept at or below the stored cut, and the rest is this address's transfers from that cut to block ${r.toBlock.toLocaleString("en-US")}, read on this request. The check compares the sum of the two with the balance, so a kept half that had gone wrong fails here and does not reach the page.` : ""} ${r.reconciled ? "The two agree to the wei, which is why the rows below are drawn." : "The two do not agree, so no history is drawn: a node has been seen on this chain answering part of a question with a success status, and nothing in the answer tells that apart from an empty history."}${r.refetched ? ` ${refetchWords(r.refetchDiffered)}` : ""}`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · Transfer logs, sent and received + balanceOf(holder) @ the pinned block`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder) == balanceOf(holder)",
});

/** The ceiling: the rows are withheld, and the receipt says on which basis
 *  (`VaultWithheldBasis`). `ceiling` is `tailMaxRows(chainId)`: a life up to it
 *  is drawn once built into the store; a floor only says the count passed
 *  `VAULT_TIMELINE_HORIZON`, and an `unchecked` count is whole but the balance
 *  check never saw it. */
export const morphoVaultTimelineHorizonProv = (
  c: VaultTimelineCoords,
  count: number,
  ceiling: number,
  basis: VaultWithheldBasis,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  summary: `Rows withheld — this address has ${withheldCountWords(basis, count)} transfers on this vault${withheldBoundWords(basis, count, ceiling)} No rows are drawn: the history check sums every row, so a page of them could not be reconciled. ${withheldReasonWords(basis, "the vault's creation block")}`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · Transfer logs, sent and received @ the pinned block`,
});

/** A life being built into the store, a chunk of blocks at a time. */
export const morphoVaultTimelineBuildingProv = (
  c: VaultTimelineCoords,
  building: { keptRows: number; keptCut: number; totalRows: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: building.keptCut },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's Transfer logs that name this address, up to block ${building.keptCut} and up to the page's block, and count the transfers in each range.`,
  },
  summary: `History still loading — ${building.keptRows.toLocaleString("en-US")} of this address's ${building.totalRows.toLocaleString("en-US")} rows are kept, up to block ${building.keptCut.toLocaleString("en-US")}, and the rest are still to be read. No rows are drawn until the whole history is kept: the history check sums every row.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · block timestamp + convertToAssets at each row's block, kept at a finalized cut`,
});

// ── a row's own figures ──────────────────────────────────────────────────────

/** The share delta — the `value` word of this row's own `Transfer` log. */
export const morphoVaultTimelineSharesProv = (c: VaultTimelineCoords, kind: VaultHolderEvent["kind"]): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: open the Transfer log at this log index in ${c.txHash ?? "this transaction"} on a block explorer and read its value, the one field that is not indexed.`,
  },
  summary: `Shares moved — the number of shares this row's transfer records${atBlock(c)}, in the share token's units. Which way they moved is decided by the two addresses it names: ${KIND_CLAUSE[kind]}. This is this address's leg: a MetaMorpho vault mints performance-fee shares to its fee recipient inside nearly every deposit and withdrawal, so the transaction very likely moved other shares too, and none of them is stated here.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · the Transfer log in this transaction`,
});

/** The replayed running balance after this row. */
export const morphoVaultTimelineBalanceAfterProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance after — every share amount in this address's transfers up to and including this one, added with its sign, in share units. It is a replay, the same sum the history check compares with the vault's balance. Inside a block it is a running figure: where an address has two transfers in one block, only the later one equals the balance at the end of that block.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · replay of this address's Transfer logs`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder), up to this log",
});

/** The asset leg, as the ERC-4626 event stated it. */
export const morphoVaultTimelineAssetsProv = (c: VaultTimelineCoords, kind: "deposit" | "withdrawal"): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: open the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in ${c.txHash ?? "this transaction"} on a block explorer and read its assets value, the first field that is not indexed.`,
  },
  summary: `${kind === "deposit" ? "Deposited" : "Withdrawn"} — the asset amount in the ${kind === "deposit" ? "deposit" : "withdrawal"} event the vault emitted for this address in this transaction${atBlock(c)}, in ${asset(c)}. It is the contract's figure for what moved, matched to this row by transaction and by share count. Where a row states no asset amount, none was emitted (a plain transfer between two holders emits none) and this page states the shares alone.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in this transaction`,
});

/** The share price at THIS row's block. */
export const morphoVaultTimelineSharePriceProv = (c: VaultTimelineCoords, shareDecimals: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's convertToAssets(10^${shareDecimals}) at block ${c.blockNumber ?? "this row's block"}.`,
  },
  summary: `Share price at this event — what one whole share converted to in ${asset(c)}${atBlock(c)}, as the vault answered. The block is the one this address's transaction landed in. The vault converts against its extrapolated total assets and against a supply that includes the performance-fee shares its next accrual would mint. The exponent is the vault's decimals, read at the page's block. Nothing was read between this row and the next, and this page draws no line between them.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · convertToAssets(one whole share) @ this row's block`,
});

/** The share of the vault this address held after the row — its balance over
 *  the supply that existed alongside it at that block. */
export const morphoVaultTimelineShareOfVaultProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's totalSupply() at block ${c.blockNumber ?? "this row's block"} and divide the balance after this event by the answer.`,
  },
  summary: `Share of the vault after this event — the balance after this event over the shares issued${atBlock(c)}. Exposure to a MetaMorpho vault is proportional, so what a balance means depends on how many shares existed beside it, and that denominator is different on every row. It moves for reasons that have nothing to do with this address: every other holder's deposits and withdrawals, and the performance-fee shares the vault mints to its fee recipient inside nearly every one of them. The balance is a running figure inside the block and the supply is the block's end, so on a block where this address has two transfers the earlier row's pair spans that block.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · totalSupply() @ this row's block`,
  formula: "balance after this log ÷ totalSupply() at this block",
});

/** The exponent every row's share price is asked with, and where the 18 comes
 *  from. Its own receipt because a fixed exponent is the trap this family looks
 *  immune to and is not: the 18 is an answer, not a convention. */
export const morphoVaultTimelineExponentProv = (
  c: VaultTimelineCoords,
  shareDecimals: number,
  assetDecimals: number,
  decimalsOffset: number | null,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's decimals() and DECIMALS_OFFSET(), and its asset's decimals(), at block ${c.blockNumber ?? "this page's block"}.`,
  },
  summary: `The exponent — every row's share price is what 10^${shareDecimals} shares convert to, and ${shareDecimals} is the vault's decimals at this page's block. ${
    decimalsOffset != null
      ? `The vault's decimals are its asset's ${assetDecimals} plus a decimals offset of ${decimalsOffset}, both read here. MetaMorpho's offset brings an asset of fewer than 18 decimals up to 18: a 6-decimal asset gives an offset of 12 and an 18-decimal one gives 0.`
      : `The vault did not answer its decimals offset, so the offset is not stated; the exponent is the vault's decimals alone, and the asset's decimals are ${assetDecimals}.`
  } The conversion is linear, so an exponent one place out would move every price on the page by a factor of ten.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · decimals() + DECIMALS_OFFSET() @ the pinned block`,
});

// ── the notes ────────────────────────────────────────────────────────────────

const NOTE_CLAUSE: Record<MorphoVaultNote["kind"], string> = {
  fee: "Fee change — the performance fee the vault takes out of the interest its markets earn, in the 18-decimal fixed-point form the contract stores it in. It is paid in newly minted shares to the vault's fee recipient, which is why it moves what every holder's shares are worth without any holder doing anything",
  "vault-name":
    "Name change — the name the share token answers to. A MetaMorpho V1.1 owner can change it, and some vaults answer a different name than their creation log, so a name here is a reading at a block",
  "vault-symbol": "Symbol change — the symbol the share token answers to, changeable by the same owner call",
};

/** The log each note is read from, named on the check and via lines. */
const EVENT: Record<MorphoVaultNote["kind"], string> = {
  fee: "SetFee",
  "vault-name": "SetName",
  "vault-symbol": "SetSymbol",
};

/** A vault-wide configuration change: a note, never a row. */
export const morphoVaultTimelineNoteProv = (c: VaultTimelineCoords, note: MorphoVaultNote): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: note.blockNumber, txHash: note.txHash },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's ${EVENT[note.kind]} logs from its creation block and open the one at block ${note.blockNumber}.`,
  },
  summary: `A change to the vault's terms — ${NOTE_CLAUSE[note.kind]}, read at block ${note.blockNumber.toLocaleString("en-US")}. It is not this address's event: it moved every holder's terms at once, which is why it sits beside the rows and this page's event counts leave it out. The values are the log's, raw. What the vault's terms are now is in the sections above, read at the page's block.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · ${EVENT[note.kind]} log on the vault`,
});

/** Why the accrual stream is not a row — the receipt on the sentence that says
 *  so, so the absence is traceable rather than merely asserted. */
export const morphoVaultTimelineAccrualProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Why accrual is not a row — a MetaMorpho vault emits an interest-accrual event on nearly every call that changes its state, and the performance-fee shares are minted in the same event. A row for each would be tens of thousands of rows that are not this address's history, so this page draws none of them. It reads none of the curator's reallocation and queue events either: what the vault's assets sat in at a row's block is read from Morpho Blue at that block. The band on each row is that read, at that row's block alone; nothing is read or drawn between two of them.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · the vault's accrual mechanic · AccrueInterest, not drawn`,
});

// ── the allocation band ──────────────────────────────────────────────────────

/** How the band is read, and what it is not. Its own receipt because the GRAIN
 *  is the claim a reader is most likely to get wrong: a row of bands looks like
 *  a series, and it is a row of photographs. */
export const morphoVaultAllocationGrainProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node, at the block of any row below, for the vault's withdrawQueueLength() and withdrawQueue(i), then for position(id, vault) and market(id) on the Morpho Blue contract.`,
  },
  summary: `How each band was read — at the block of the row it sits on, and at no other. The vault's withdraw queue as it stood at that block gives its list of markets, and Morpho Blue's position and market for each give what the vault had supplied. Nothing is read between two rows and nothing is drawn there: between two of this address's events the curator may have moved the pool many times, and none of those events is read here. They say a curator moved something; they do not say what is there. The queue can change in length and in order inside one address's history, so each band's market list is that block's list.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · withdrawQueue + Blue position/market @ each row's block`,
});

/** One segment: this address's proportional slice of one market at one block.
 *  The five operands are named because the identity is re-runnable only with
 *  all five, and every one of them is a call at THIS row's block. */
export const morphoVaultAllocationLegProv = (
  c: VaultTimelineCoords,
  leg: VaultAllocationLeg,
  operands: { holderShares: string | null; totalSupply: string | null },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node, at block ${c.blockNumber ?? "this row's block"}, for position(${leg.marketId || "this market"}, the vault) and market(id) on the Morpho Blue contract and for balanceOf(the address) and totalSupply() on the vault, then take supplyShares × totalSupplyAssets ÷ totalSupplyShares and × balanceOf ÷ totalSupply(), rounding each division down.`,
  },
  summary: `This address's attributed slice of ${leg.isIdle ? "the vault's idle market" : `the ${leg.collateralSymbol ?? "market"} market`}${atBlock(c)}, in ${asset(c)}. Five reads at this block: the vault's supply in the market is its supply shares ${leg.supplyShares ?? "unread"} × the market's total supply assets ${leg.marketTotalSupplyAssets ?? "unread"} ÷ its total supply shares ${leg.marketTotalSupplyShares ?? "unread"}, giving ${leg.vaultSupplied ?? "an unread figure"}; this address's slice of that is × its shares ${operands.holderShares ?? "unread"} ÷ the shares issued ${operands.totalSupply ?? "unread"}, each division rounded down. The attribution is proportional: nothing on chain records whose asset went into which market, so this is this address's share of the vault applied to what the vault supplied there. Two addresses holding equal shares hold equal slices, whatever either deposited or when. The denominator is the shares issued at this block, a different number on every row.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · position(id, vault) + market(id) + balanceOf + totalSupply @ this row's block`,
  formula: "attributed = balanceOf(holder) × (supplyShares × totalSupplyAssets ÷ totalSupplyShares) ÷ totalSupply()",
});

/** The collected tail — one segment standing for several, and the sum it is. */
export const morphoVaultAllocationCollectedProv = (
  c: VaultTimelineCoords,
  count: number,
  legs: VaultAllocationLeg[],
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `${count.toLocaleString("en-US")} markets drawn as one segment${atBlock(c)} — the smallest of this address's slices at this block, added together in the loan asset's raw units. A band the width of this panel cannot draw them legibly apart, so they are collected; the collection is always the smallest, and the panel below this row lists every one of them with its figure. The markets collected here are ${legs.map((l) => (l.isIdle ? "the idle market" : (l.collateralSymbol ?? l.marketId.slice(0, 10)))).join(", ")}.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · Σ of the collected legs, each read @ this row's block`,
  formula: "Σ attributed over the collected legs",
});

/** The vault's own supply in one market at a row's block — the figure the
 *  attributed one is a share of, and a reading in its own right. */
export const morphoVaultAllocationSuppliedProv = (c: VaultTimelineCoords, leg: VaultAllocationLeg): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for position(${leg.marketId || "this market"}, the vault) and market(id) on the Morpho Blue contract at block ${c.blockNumber ?? "this row's block"}.`,
  },
  summary: `What the vault had supplied to ${leg.isIdle ? "its idle market" : `the ${leg.collateralSymbol ?? "market"} market`}${atBlock(c)}, in ${asset(c)} — the whole of which this address's slice is a proportion. It is Morpho Blue's conversion of the vault's supply shares at the market's stored totals, rounded down. No interest is accrued on top of it: the market holds its last settled state, and the figure is the contract's. A market in the queue holding nothing reads as zero, a reading of that block.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · position(id, vault) + market(id) @ this row's block`,
  formula: "supplyShares × totalSupplyAssets ÷ totalSupplyShares",
});

/** One leg's share of what this address's whole claim sat in at a block — the
 *  segment's own width, said as a number. */
export const morphoVaultAllocationLegShareProv = (c: VaultTimelineCoords, leg: VaultAllocationLeg): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `This market's share of what this address's claim sat in${atBlock(c)} — the attributed figure beside it over the sum of every attributed figure at this same block. It is the width of this market's segment on the band above: a proportion within one block's reading, not comparable across rows, because the sum differs on every row. The markets in the queue that held nothing are in that sum as the zeros they are.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · Σ of this block's attributed legs`,
  formula: "attributed at this leg ÷ Σ attributed over this block's legs",
});

/** WHERE THE ROWS CAME FROM — the store, plus a swept head, or a whole-life
 *  sweep made now. The two must never render the same, so the line that states
 *  it carries this. */
export const morphoVaultTimelineStoredRowsProv = (c: VaultTimelineCoords, h: VaultHistorySource): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's Transfer logs that name this address as sender and as receiver, from the vault's creation block to block ${h.cut ?? 0}, and compare them with the kept rows one for one.`,
  },
  summary:
    h.source === "stored+head"
      ? `Where these rows came from — ${h.tailRows.toLocaleString("en-US")} were read at or below block ${(h.cut ?? 0).toLocaleString("en-US")} and kept; ${h.headRows.toLocaleString("en-US")} above that block were read on this request. Block ${(h.cut ?? 0).toLocaleString("en-US")} was the chain's finalized block when the rows were kept, as the node answered then, never a fixed distance behind the latest block. Each kept row holds what the page draws for it (its transfer, its asset amount where the vault emitted one, the share price read at its block and the block's time) and the signed sum of the transfers; nothing derived from them, such as a claim, a share of the vault or an allocation band, is kept. The check below ran on the kept rows and the newly read ones together, as it does on every request, so a kept share amount that had gone wrong would fail it and no rows would be drawn.`
      : `Where these rows came from — every row was read on this request, from the vault's creation block to block ${(c.blockNumber ?? 0).toLocaleString("en-US")}. Nothing kept was used: either nothing was kept for this address in this vault, or this request did not use what was kept.`,
  contract: vaultContract(c),
  via: `${laneOf(c)} · Transfer logs, sent and received + the kept rows at their cut`,
});
