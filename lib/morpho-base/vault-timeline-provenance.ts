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
//   • THE LANE IS NAMED BY ITS ENV VAR, NEVER ITS URL. The URL carries a key.
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
import type {
  MorphoVaultNote,
  VaultAllocationLeg,
  VaultHistorySource,
  VaultHolderEvent,
  VaultHolderReconcile,
  VaultTimelineCoords,
} from "@/lib/shared/vault-holder-timeline";

const LANE = "live Base chain reads (/base/morpho/vaults)";

export type { VaultTimelineCoords };

const vaultContract = (c: VaultTimelineCoords): Provenance["contract"] => ({
  name: c.vaultName ? `${c.vaultName} (MetaMorpho)` : "MetaMorpho vault",
  address: c.vault,
});

const atBlock = (c: VaultTimelineCoords): string => (c.blockNumber != null ? ` at block ${c.blockNumber}` : "");
const asset = (c: VaultTimelineCoords) => c.assetSymbol ?? "the vault's asset";

/** What each `Transfer` classification means, said as the chain decides it. */
const KIND_CLAUSE: Record<VaultHolderEvent["kind"], string> = {
  deposit: "the `from` address is the zero address, so the shares were minted — a deposit",
  withdrawal: "the `to` address is the zero address, so the shares were burned — a withdrawal",
  "transfer-in":
    "neither end is the zero address and this address is the `to`, so the shares arrived from another holder",
  "transfer-out":
    "neither end is the zero address and this address is the `from`, so the shares went to another holder",
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
    text: `Re-run both eth_getLogs on the vault for the Transfer topic with this address in topic1 and then in topic2, blocks ${r.fromBlock}–${r.toBlock}, sum the values signed, and compare against balanceOf(${c.holder ?? "the address"}) at block ${r.toBlock} on any Base archive node`,
  },
  summary: `The history check — every \`Transfer\` this address sent or received on this vault, replayed into a balance and compared against the vault's own \`balanceOf\` at block ${r.toBlock}. Two \`eth_getLogs\` answered ${r.logsOut} outgoing and ${r.logsIn} incoming logs over blocks ${r.fromBlock}–${r.toBlock}, the first of them being the block this vault was created at — there is nothing to find before a vault exists. Their signed sum is ${r.replayed} and \`balanceOf\` reads ${r.onChain}. ${r.reconciled ? "The two agree wei-exact, which is why the rows below are drawn at all." : "The two do not agree, so no history is drawn: a wide-range logs lane answering part of a question with an HTTP 200 has been observed on this chain, and no status code, timing or count tells that apart from a genuinely empty history."}${r.refetched ? ` Both sweeps were run a second time on the same lane after a pause, and the second answer ${r.refetchDiffered ? "returned a DIFFERENT log count from the first — direct evidence of a lane answering one question two ways" : "returned the same log count"}.` : ""} The sweeps ran on the endpoint named by \`${r.lane}\`, which answers a whole-life range in one call per direction; the URL is not stated because it carries a key.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) + balanceOf(holder) @ the pinned block`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder) == balanceOf(holder)",
});

/**
 * The horizon: this address's life is larger than the page draws.
 *
 * Two shapes, and the receipt says which. `exact` is a whole read that was too
 * large to DRAW — both sweeps returned and the count is a census. A lower bound
 * is a lane that would not hand the logs over at all, walked in chunks until
 * the count passed the horizon and stopped there; the rows are withheld either
 * way, but "at least N" and "N" are different claims.
 */
export const morphoVaultTimelineHorizonProv = (
  c: VaultTimelineCoords,
  count: number,
  ceiling: number,
  lowerBound: boolean,
  lane: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  summary: `Rows withheld — this address has ${lowerBound ? "at least " : ""}${count.toLocaleString("en-US")} of its own \`Transfer\` logs on this vault, above the ${ceiling.toLocaleString("en-US")} Rails keeps a stored history for. That bound is the store's own 8 MB body limit divided by a measured row, so it says the life is larger than Rails STORES rather than larger than a page can draw. The newest few are not drawn instead: a partial walk shown as a life is the one failure this check exists to prevent, and the history check sums every row, so a page of rows could not be reconciled in any case. ${
    lowerBound
      ? `The count is a FLOOR, not a census: the endpoint named by \`${lane}\` refused the whole-range sweep on response size, so the range was walked in chunks of 1,000,000 blocks and the walk stopped the moment the running count passed the horizon. Every chunk counted answered; a chunk that had refused would have been halved rather than skipped, and a count with a hole in it would have been reported as unread instead. Because the logs were never handed over whole, the balance check above could not be run on this address at all — which is why nothing is drawn rather than drawn with a caveat.`
      : "The count is exact — both sweeps returned, and the balance check ran and agreed, before this decision was made."
  }`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) @ the pinned block`,
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
    text: `Read GET /api/vaults/positions/tail for this position on chain 8453 and check that its cutBlock is ${building.keptCut} and that its rows sum to its cutBalance`,
  },
  summary: `A history being read into Rails's store — ${building.keptRows.toLocaleString("en-US")} of this address's ${building.totalRows.toLocaleString("en-US")} rows are kept at or below block ${building.keptCut}, and the rest are still to be read. Every row costs one \`eth_getBlockByNumber\` and one archive \`convertToAssets\` at its OWN block, so a life this long is read a chunk of blocks at a time across visits rather than making one reader wait for all of it. What is kept is a WHOLE up to its own cut: the rows are read oldest first, so the stored set is an unbroken prefix of the life, and the store re-sums its deltas on the way in and refuses a body that does not add up. No rows are drawn until the whole life is stored — a prefix is not a life, and the history check sums every row of one. The allocation band is not part of what is kept: it is read fresh over the newest rows on the visit that draws.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getBlockByNumber + convertToAssets at each row's own block, stored at a finalized cut`,
});

// ── a row's own figures ──────────────────────────────────────────────────────

/** The share delta — the `value` word of this row's own `Transfer` log. */
export const morphoVaultTimelineSharesProv = (c: VaultTimelineCoords, kind: VaultHolderEvent["kind"]): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Read the Transfer log at this log index in ${c.txHash ?? "this transaction"} and decode its one non-indexed word`,
  },
  summary: `Shares moved — the \`value\` word of this row's own \`Transfer\` log${atBlock(c)}, in the share token's own units. Which way it moved is decided by the two indexed addresses: ${KIND_CLAUSE[kind]}. Nothing about the row is inferred from a method name or a label — the zero address is what says whether shares were created, destroyed or handed on. This is this address's own leg: a MetaMorpho vault mints performance-fee shares to its fee recipient inside nearly every deposit and withdrawal, so the transaction very likely moved other shares too, and none of them is stated here.`,
  contract: vaultContract(c),
  via: `${LANE} · the Transfer log in this transaction`,
});

/** The replayed running balance after this row. */
export const morphoVaultTimelineBalanceAfterProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance after — every one of this address's own \`Transfer\` values up to and including this log, added with its sign, in share units. Not a call: it is the replay, which is the same sum the history check compares against the vault's \`balanceOf\`. It is a position INSIDE the block, so where an address has two logs in one block only the later one equals what \`balanceOf\` would answer at the end of that block. The check compares only the final position, which is always an end-of-block figure.`,
  contract: vaultContract(c),
  via: `${LANE} · replay of this address's own Transfer logs`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder), up to this log",
});

/** The asset leg, as the ERC-4626 event stated it. */
export const morphoVaultTimelineAssetsProv = (c: VaultTimelineCoords, kind: "deposit" | "withdrawal"): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Read the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in ${c.txHash ?? "this transaction"} and decode its first non-indexed word`,
  },
  summary: `${kind === "deposit" ? "Deposited" : "Withdrawn"} — the \`assets\` word of the ERC-4626 \`${kind === "deposit" ? "Deposit" : "Withdraw"}\` event the vault emitted for this address in this same transaction${atBlock(c)}, in ${asset(c)}. It is the contract's own figure for what moved, matched to this row by transaction AND by share count, not this page's shares multiplied by a share price. Where a row states no asset leg, none was emitted — a plain transfer between two holders emits none — and this page states the shares alone rather than a stand-in dressed as the contract's word.`,
  contract: vaultContract(c),
  via: `${LANE} · the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in this transaction`,
});

/** The share price at THIS row's block. */
export const morphoVaultTimelineSharePriceProv = (c: VaultTimelineCoords, shareDecimals: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Re-run the convertToAssets(10^${shareDecimals}) eth_call at block ${c.blockNumber ?? "this row's block"} against any Base archive node`,
  },
  summary: `Share price at this event — \`convertToAssets(10^${shareDecimals})\` answered${atBlock(c)}, which is the block this address's own transaction landed in rather than a block Rails picked. What ONE whole share converted to in ${asset(c)} at that moment, answered by the vault itself: MetaMorpho converts against its own extrapolated total and against a supply that includes the performance-fee shares its next accrual would mint, so asking the contract is one read where reproducing the mechanic would be several chances to be wrong. The exponent is this vault's OWN \`decimals()\`, read rather than assumed. This figure says nothing about any block between this row and the next — nothing was read there, and this page draws no line through it.`,
  contract: vaultContract(c),
  via: `${LANE} · convertToAssets(one whole share) @ this row's own block`,
});

/** The share of the vault this address held after the row — its balance over
 *  the supply that existed alongside it at that block. */
export const morphoVaultTimelineShareOfVaultProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Re-run totalSupply() at block ${c.blockNumber ?? "this row's block"} on any Base archive node and divide the replayed balance beside it by the answer`,
  },
  summary: `Share of the vault after this event — the replayed balance above over \`totalSupply()\` read${atBlock(c)}. It is the figure this whole page rests on: exposure to a MetaMorpho vault is proportional, so what a balance MEANS depends on how many shares existed beside it, and that denominator is different on every row. It moves for reasons that have nothing to do with this address — every other holder's deposits and withdrawals, and the performance-fee shares the vault mints to its fee recipient inside nearly every one of them. The balance is a position inside the block and the supply is the block's end, so on a block where this address has two logs the earlier row's pair spans that block rather than closing it. Not a claim on assets: what these shares convert to is the share price beside them.`,
  contract: vaultContract(c),
  via: `${LANE} · totalSupply() @ this row's own block`,
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
    text: `Re-run decimals() and DECIMALS_OFFSET() on the vault, and decimals() on its asset, at block ${c.blockNumber ?? "this page's block"}`,
  },
  summary: `The exponent — every row's share price is \`convertToAssets(10^${shareDecimals})\`, and the ${shareDecimals} is the vault's own \`decimals()\` read at this page's block. ${
    decimalsOffset != null
      ? `MetaMorpho builds it out of two reads: the asset's own ${assetDecimals} decimals plus a \`DECIMALS_OFFSET()\` of ${decimalsOffset}, which the factory sets so that the shares land at ${assetDecimals + decimalsOffset} whatever the asset is. Both were read here, not assumed — a 6-decimal asset gives an offset of 12 and an 18-decimal one gives 0, and a page that hard-coded either would be right about one vault and wrong about the other.`
      : `The vault did not answer \`DECIMALS_OFFSET()\`, so the offset is not stated; the exponent is the \`decimals()\` read alone, and the asset's own decimals are ${assetDecimals}.`
  } \`convertToAssets\` is linear, so an exponent one place out moves every price on the page by a factor of ten.`,
  contract: vaultContract(c),
  via: `${LANE} · decimals() + DECIMALS_OFFSET() @ the pinned block`,
});

// ── the notes ────────────────────────────────────────────────────────────────

const NOTE_CLAUSE: Record<MorphoVaultNote["kind"], string> = {
  fee: "`SetFee` — the performance fee the vault takes out of the interest its markets earn, in the WAD the contract stores it as. It is paid in newly minted shares to the vault's fee recipient, which is why it moves what every holder's shares are worth without any holder doing anything",
  "vault-name":
    "`SetName` — the name the share token answers to. A MetaMorpho V1.1 owner can change it, and dozens of Base vaults already answer a different name than their creation log, so a name here is a reading at a block rather than an identity",
  "vault-symbol": "`SetSymbol` — the symbol the share token answers to, changeable by the same owner call",
};

/** A vault-wide configuration change: a note, never a row. */
export const morphoVaultTimelineNoteProv = (c: VaultTimelineCoords, note: MorphoVaultNote): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: note.blockNumber, txHash: note.txHash },
  verify: {
    kind: "recompute",
    text: `Re-run eth_getLogs on the vault for this event's topic from its creation block and read the log at block ${note.blockNumber}`,
  },
  summary: `A change to the vault's own terms — ${NOTE_CLAUSE[note.kind]}, read at block ${note.blockNumber}. It is not this address's event: it moved every holder's terms at once, which is why it sits beside the rows rather than among them and is counted in no total here. The values are the log's own words, raw. What the vault's terms are NOW is the reading in the sections above, at the page's own block.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs on the vault for this configuration event`,
});

/** Why the accrual stream is not a row — the receipt on the sentence that says
 *  so, so the absence is traceable rather than merely asserted. */
export const morphoVaultTimelineAccrualProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Why accrual is not a row — a MetaMorpho vault emits \`AccrueInterest\` on nearly every state-changing call, and it is the same event the performance-fee shares are minted in. It is the mechanic behind each row's share price, named in that figure's receipt, and a row for each would be tens of thousands of rows that are not this address's life. This page reads none of them. The curator's own \`ReallocateSupply\`, \`ReallocateWithdraw\` and \`SetWithdrawQueue\` events are not read either: what the vault's asset sat in at a row's own block is replayed from Morpho Blue's own rows rather than from a curator's events. The band on each row is that replay, read at that row's block alone; nothing is read or drawn between two of them.`,
  contract: vaultContract(c),
  via: `${LANE} · the vault's own accrual mechanic`,
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
    text: "At any of the blocks below, re-run withdrawQueueLength() and withdrawQueue(i) on the vault, then position(id, vault) and market(id) on the Morpho Blue singleton, against any Base archive node",
  },
  summary: `How each band was read — at the block of the row it sits on, and at no other. \`withdrawQueueLength()\` and \`withdrawQueue(i)\` give the vault's own list of markets as it stood at that block, and \`position(id, vault)\` and \`market(id)\` on the Morpho Blue singleton give what the vault had supplied to each. Nothing is read between two rows and nothing is drawn there: between two of this address's own events the curator moved the pool at its own reallocations, thousands of them, and none of those events is read here or anywhere on this page. \`ReallocateSupply\`, \`ReallocateWithdraw\` and \`SetWithdrawQueue\` say a curator moved something; they do not say what is there, and a sum of them would be a ledger of this page's own making. The queue itself is not fixed — its length and its order both change inside a single address's life — so each band's market list is that block's list.`,
  contract: vaultContract(c),
  via: `${LANE} · withdrawQueue + Blue position/market @ each row's own block`,
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
    text: `At block ${c.blockNumber ?? "this row's block"}: position(${leg.marketId || "this market"}, the vault).supplyShares × market(id).totalSupplyAssets ÷ market(id).totalSupplyShares, then × balanceOf(the address) ÷ totalSupply() on the vault — both divisions floored`,
  },
  summary: `This address's attributed slice of ${leg.isIdle ? "the vault's idle market" : `the ${leg.collateralSymbol ?? "market"} market`}${atBlock(c)}, in ${asset(c)}. Two floors, and five reads, all at this same block: the vault's own supply in the market is \`position(id, vault).supplyShares\` ${leg.supplyShares ?? "unread"} × \`market(id).totalSupplyAssets\` ${leg.marketTotalSupplyAssets ?? "unread"} ÷ \`market(id).totalSupplyShares\` ${leg.marketTotalSupplyShares ?? "unread"}, giving ${leg.vaultSupplied ?? "an unread figure"}; this address's slice of that is × \`balanceOf\` ${operands.holderShares ?? "unread"} ÷ \`totalSupply()\` ${operands.totalSupply ?? "unread"}. THE ATTRIBUTION IS PROPORTIONAL, NOT FUND TRACING: nothing on chain records whose asset went into which market, so this is this address's share of the vault applied to what the vault supplied there. Two addresses holding equal shares hold equal slices, whatever either deposited or when. The denominator is this block's own \`totalSupply()\` and is a different number on every row. Read at this block and at no other — nothing here says where this market's balance was a block earlier or later.`,
  contract: vaultContract(c),
  via: `${LANE} · position(id, vault) + market(id) + balanceOf + totalSupply @ this row's own block`,
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
  summary: `${count.toLocaleString("en-US")} markets drawn as one segment${atBlock(c)} — the smallest of this address's slices at this block, added together in the loan token's own raw units. A band the width of this panel cannot draw them legibly apart, so they are collected; the collection is always the smallest, never the largest, and the panel below this row lists every one of them separately with its own figure. Each was read the same way as every other segment: the vault's supply in the market from Morpho Blue's own rows, then this address's proportional share of it. The markets collected here are ${legs.map((l) => (l.isIdle ? "the idle market" : (l.collateralSymbol ?? l.marketId.slice(0, 10)))).join(", ")}.`,
  contract: vaultContract(c),
  via: `${LANE} · Σ of the collected legs, each read @ this row's own block`,
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
    text: `Re-run position(${leg.marketId || "this market"}, the vault) and market(id) on the Morpho Blue singleton at block ${c.blockNumber ?? "this row's block"}`,
  },
  summary: `What the VAULT had supplied to ${leg.isIdle ? "its idle market" : `the ${leg.collateralSymbol ?? "market"} market`}${atBlock(c)}, in ${asset(c)} — not this address's figure, but the whole of which its slice is a proportion. Blue's own share-to-asset conversion on the market's STORED totals: \`position(id, vault).supplyShares\` × \`market(id).totalSupplyAssets\` ÷ \`market(id).totalSupplyShares\`, floored. No interest is accrued on top of it — \`market(id)\` holds the market's last settled state, and accruing here would put this page's arithmetic where the contract's own figure belongs. A market in the queue holding nothing reads as zero, which is a reading of a real moment and not an omission.`,
  contract: vaultContract(c),
  via: `${LANE} · position(id, vault) + market(id) @ this row's own block`,
  formula: "supplyShares × totalSupplyAssets ÷ totalSupplyShares",
});

/** One leg's share of what this address's whole claim sat in at a block — the
 *  segment's own width, said as a number. */
export const morphoVaultAllocationLegShareProv = (c: VaultTimelineCoords, leg: VaultAllocationLeg): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `This market's share of what this address's claim sat in${atBlock(c)} — the attributed figure beside it over the sum of every attributed figure at this same block. It is the width of this market's segment on the band above, and nothing more: it is a proportion WITHIN one block's reading, not a share of the vault, not a share of the market, and not comparable across rows, because each row's sum is its own. The markets in the queue that held nothing are in that sum as the zeros they are.`,
  contract: vaultContract(c),
  via: `${LANE} · Σ of this block's attributed legs`,
  formula: "attributed at this leg ÷ Σ attributed over this block's legs",
});

/** WHERE THE ROWS CAME FROM — the store, plus a swept head, or a whole-life
 *  sweep made now. The two must never render the same, so the line that states
 *  it carries this. */
export const morphoVaultTimelineStoredRowsProv = (
  c: VaultTimelineCoords,
  h: VaultHistorySource,
  lane: string,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Re-run both eth_getLogs on the vault for the Transfer topic with this address in topic1 and then in topic2, from the vault's own creation block to ${h.cut ?? 0}, and compare the logs against the stored rows one for one`,
  },
  summary:
    h.source === "stored+head"
      ? `Where these rows came from — ${h.tailRows.toLocaleString("en-US")} of them were read at or below block ${(h.cut ?? 0).toLocaleString("en-US")} and kept in Rails's store of chain readings; ${h.headRows.toLocaleString("en-US")} above that block were swept from the chain on this request. Block ${(h.cut ?? 0).toLocaleString("en-US")} was the lane's own \`finalized\` answer at the moment the rows were stored — a chain answer read in that request, never a fixed distance behind the head, which on this chain would be wrong within five minutes: the tag steps in L1-epoch-sized jumps and sat between 643 and 795 blocks behind head across five measured samples. The store holds the logs' own words and the signed sum of them and nothing else: no claim, no share of the vault, no allocation band, no figure in any other unit. The check below then ran on the stored rows and the swept ones together, as it does on every request, so a stored row that had gone wrong would be caught here rather than drawn. The rows were read on the endpoint named by \`${lane}\`; the URL is not stated because it carries a key.`
      : `Where these rows came from — every one of them was swept from the chain on this request, from the vault's own creation block to block ${(c.blockNumber ?? 0).toLocaleString("en-US")}. Nothing was taken from the store: either nothing had been stored for this address in this vault, or this request refused the store outright. The sweeps ran on the endpoint named by \`${lane}\`; the URL is not stated because it carries a key.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) + the stored tail at its own cut`,
});
