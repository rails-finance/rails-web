// The receipts for a holder's timeline inside an Aave vault on Ethereum.
// ----------------------------------------------------------------------------
// A sibling of vault-provenance.ts, which traces the vault's READING at one
// block. These trace its HISTORY, and the difference shows in every one of
// them: a reading's receipt names one block and one call, while a row's names
// the block THAT ROW happened at, and the gate's names two log sweeps and the
// balance they were checked against.
//
// Three things every receipt here holds to.
//
//   • THE BLOCK ON A ROW'S RECEIPT IS THE ROW'S OWN BLOCK, not the page's. A
//     share price on a row is `convertToAssets(10 ** decimals)` answered at the
//     block the holder's own transaction landed in, and saying otherwise would
//     attach a head figure to a two-year-old event.
//   • NO RECEIPT SPEAKS ABOUT THE BLOCKS BETWEEN TWO ROWS. Rails read nothing
//     there. A summary that said "the price rose from X to Y" would be
//     asserting a path through blocks nobody chose, which is the sampled series
//     decision `0017` §6 refuses.
//   • NO RECEIPT NAMES WHO READ A VALUE OR THROUGH WHICH PROVIDER
//     (provenance-receipts-grammar §3): the block and the time, never the lane.
//
// Distance classes: `state` for a call at a block, `emitted` for a value decoded
// out of a log. The replayed running balance is `chain-derived` — every leaf is
// a log field and the only operation is a signed sum, which is the charter's
// truth-preserving delta replay.

import type { Provenance } from "@/components/shared/provenance";
import { VAULT_TIMELINE_HORIZON } from "@/lib/shared/vault-holder-timeline";
import type {
  AaveVaultNote,
  VaultHistorySource,
  VaultHolderEvent,
  VaultHolderReconcile,
  VaultTimelineCoords,
  VaultWithheldBasis,
} from "@/lib/shared/vault-holder-timeline";

const LANE = "live Ethereum chain reads (/ethereum/aave/vaults)";

/** A row's own coordinates — the shared shape, with the block and transaction
 *  moved to the ROW's, so every receipt inside a card names the moment that
 *  card is about. Re-exported here because every caller of these builders wants
 *  the two together. */
export type { VaultTimelineCoords };

const vaultContract = (c: VaultTimelineCoords): Provenance["contract"] => ({
  name: c.vaultName ? `${c.vaultName} (ERC-4626)` : "the vault",
  address: c.vault,
});

const atBlock = (c: VaultTimelineCoords): string =>
  c.blockNumber != null ? ` at block ${c.blockNumber.toLocaleString("en-US")}` : "";
const asset = (c: VaultTimelineCoords) => c.assetSymbol ?? "the vault's asset";
/** The chain a shared builder names: the flows and the two "now" figures are drawn on every vault family's
 *  holder page, MetaMorpho on Base among them. */
const chainWord = (c: VaultTimelineCoords) => (c.chainId === 8453 ? "Base" : "Ethereum");
const shares = (c: VaultTimelineCoords) => c.shareSymbol ?? "shares";

/** What each `Transfer` classification means, said as the chain decides it. */
const KIND_CLAUSE: Record<VaultHolderEvent["kind"], string> = {
  deposit: "the sender is the zero address, so the shares were minted — a deposit",
  withdrawal: "the receiver is the zero address, so the shares were burned — a withdrawal",
  "transfer-in":
    "neither end is the zero address and this address is the receiver, so the shares arrived from another holder",
  "transfer-out":
    "neither end is the zero address and this address is the sender, so the shares went to another holder",
  "transfer-self": "both ends of the transfer are this same address, so the balance did not move",
  cooldown: "no shares moved: this is a cooldown the address started, with no transfer in its transaction",
};

// ── the gate ─────────────────────────────────────────────────────────────────

/** The reconcile check itself — the receipt behind the two figures the page
 *  states whether or not it goes on to draw anything. */
export const vaultTimelineGateProv = (c: VaultTimelineCoords, r: VaultHolderReconcile): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for the vault's Transfer logs that name this address as sender and as receiver, blocks ${r.fromBlock} to ${r.toBlock}, add the values with their signs, and compare the sum with balanceOf(${c.holder ?? "the address"}) at block ${r.toBlock}.`,
  },
  summary: `The history check — every transfer this address sent or received on this vault, replayed into a balance and compared with the vault's balance for it at block ${r.toBlock.toLocaleString("en-US")}. Over blocks ${r.fromBlock.toLocaleString("en-US")} to ${r.toBlock.toLocaleString("en-US")} the vault recorded ${r.logsOut} transfers from this address and ${r.logsIn} to it; their signed sum is ${r.replayed} and the vault's balance reads ${r.onChain}.${r.cutBalance != null ? ` The replay is in two halves: ${r.cutBalance} is the signed sum of every row kept at or below the stored cut, and the rest is this address's transfers from that cut to block ${r.toBlock.toLocaleString("en-US")}, read on this request. The check compares the sum of the two with the balance, so a kept half that had gone wrong fails here and does not reach the page.` : ""} ${r.reconciled ? "The two agree to the wei, which is why the rows below are drawn." : "The two do not agree, so no history is drawn: a node has been seen on this chain answering part of a question with a success status, and nothing in the answer tells that apart from an empty history."}${r.refetched ? ` The logs were asked for again after a pause, and ${r.refetchDiffered ? "the second answer held a different number of logs from the first, so the node answered one question two ways" : "no second answer came back with a different number of logs"}.` : ""}`,
  contract: vaultContract(c),
  via: `${LANE} · Transfer logs, sent and received + balanceOf(holder) @ the pinned block`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder) == balanceOf(holder)",
});

/** The ceiling: the rows are withheld, and the receipt says on which basis
 *  (`VaultWithheldBasis`) — the third, `unchecked`, is a whole recount the
 *  balance check never saw.
 *
 *  THE REFUSAL MOVED, AND THE WORDS MOVED WITH IT. It used to be a refusal to
 *  draw more rows than a page draws. It is now a refusal to keep a history
 *  Rails cannot hold whole: above this bound one stored tail would not fit the
 *  store's own body limit, and a history built in pieces that never becomes a
 *  whole is a set nothing can be gated against. Below it a long life IS drawn —
 *  built into the store over several visits and then windowed on the way to the
 *  browser, which is a window over a whole, gated fetch and not a partial one.
 *  What is still refused is exactly what was always refused: a partial WALK
 *  presented as a life.
 *
 *  TWO SHAPES, AND THE RECEIPT SAYS WHICH. `exact` is a whole read that was too
 *  large to keep — both sweeps returned and the count is a census. A lower
 *  bound is a lane that would not hand the logs over at all, walked in chunks
 *  until the count passed the horizon and stopped there; the rows are withheld
 *  either way, but "at least N" and "N" are different claims. */
export const vaultTimelineHorizonProv = (
  c: VaultTimelineCoords,
  count: number,
  ceiling: number,
  basis: VaultWithheldBasis,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  summary: `Rows withheld — this address has ${basis === "floor" ? "at least " : ""}${count.toLocaleString("en-US")} transfers on this vault${
    basis === "checked"
      ? count > ceiling
        ? `, above the ${ceiling.toLocaleString("en-US")} Rails keeps a stored history for.`
        : `. It is above the ${VAULT_TIMELINE_HORIZON.toLocaleString("en-US")} rows Rails builds for a page in one request, and no stored history could be kept for it on this request.`
      : "."
  } No rows are drawn: the history check sums every row, so a page of them could not be reconciled. ${
    basis === "unchecked"
      ? "The balance check did not run: the query for this address's transfers failed, so the range was counted in chunks from block 0, every chunk answering. The count covers the whole range, but no check confirmed it, and no rows are drawn without one."
      : basis === "floor"
        ? `The count is a floor, and the answer may be more: the node refused to return the whole range at once because the answer was too large, so the range was counted in chunks from block 0, and the count stopped once it passed ${VAULT_TIMELINE_HORIZON.toLocaleString("en-US")}. Because the logs were never handed over whole, the balance check could not be run on this address, and nothing is drawn or stored.`
        : "The count is exact: both queries returned, and the balance check ran and agreed."
  }`,
  contract: vaultContract(c),
  via: `${LANE} · Transfer logs, sent and received @ the pinned block`,
});

/** A life being built into the store, a chunk of blocks at a time. */
export const vaultTimelineBuildingProv = (
  c: VaultTimelineCoords,
  building: { keptRows: number; keptCut: number; totalRows: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: building.keptCut },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for the vault's Transfer logs that name this address, up to block ${building.keptCut} and up to the page's block, and count the transfers in each range (on a stake token, add its cooldown logs).`,
  },
  summary: `History still loading — ${building.keptRows.toLocaleString("en-US")} of this address's ${building.totalRows.toLocaleString("en-US")} rows are kept, up to block ${building.keptCut.toLocaleString("en-US")}, and the rest are still to be read. No rows are drawn until the whole history is kept: the history check sums every row.`,
  contract: vaultContract(c),
  via: `${LANE} · block timestamp + convertToAssets at each row's block, kept at a finalized cut`,
});

// ── a row's own figures ──────────────────────────────────────────────────────

/** The share delta — the `value` word of this row's own `Transfer` log. */
export const vaultTimelineSharesProv = (c: VaultTimelineCoords, kind: VaultHolderEvent["kind"]): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: open the Transfer log at this log index in ${c.txHash ?? "this transaction"} on a block explorer and read its value, the one field that is not indexed.`,
  },
  summary: `Shares moved — the number of shares this row's transfer records${atBlock(c)}, in the share token's units. Which way they moved is decided by the two addresses it names: ${KIND_CLAUSE[kind]}.`,
  contract: vaultContract(c),
  via: `${LANE} · the Transfer log in this transaction`,
});

/** The replayed running balance after this row. */
export const vaultTimelineBalanceAfterProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance after — every share amount in this address's transfers up to and including this one, added with its sign, in share units. It is a replay, the same sum the history check compares with the vault's balance. Inside a block it is a running figure: where an address has two transfers in one block, only the later one equals the balance at the end of that block.`,
  contract: vaultContract(c),
  via: `${LANE} · replay of this address's Transfer logs`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder), up to this log",
});

/** The replayed running balance BEFORE this row — the same replay one log
 *  earlier, which on this shape is a subtraction rather than a second sum. */
export const vaultTimelineBalanceBeforeProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance before — the balance one transfer earlier. It is integer arithmetic on two figures this row carries, so it is exact; a cooldown row, which moves no shares, states the same figure on both sides.`,
  contract: vaultContract(c),
  via: `${LANE} · replay of this address's Transfer logs`,
  formula: "balance after this transfer − this transfer's signed amount",
});

/** The asset leg, as the ERC-4626 event stated it. */
export const vaultTimelineAssetsProv = (c: VaultTimelineCoords, kind: "deposit" | "withdrawal"): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: open the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in ${c.txHash ?? "this transaction"} on a block explorer and read its assets value, the first field that is not indexed.`,
  },
  summary: `${kind === "deposit" ? "Deposited" : "Withdrawn"} — the asset amount in the ${kind === "deposit" ? "deposit" : "withdrawal"} event the vault emitted for this address in this transaction${atBlock(c)}, in ${asset(c)}. It is the contract's figure for what moved, matched to this row by transaction and by share count. Where a row states no asset amount, none was emitted (a plain transfer between two holders emits none) and this page states the shares alone.`,
  contract: vaultContract(c),
  via: `${LANE} · the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in this transaction`,
});

/** The share price at THIS row's block. */
export const vaultTimelineSharePriceProv = (c: VaultTimelineCoords, shareDecimals: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for the vault's convertToAssets(10^${shareDecimals}) at block ${c.blockNumber ?? "this row's block"}.`,
  },
  summary: `Share price at this event — what one whole share converted to in ${asset(c)}${atBlock(c)}, as the vault answered. The exponent is this vault's decimals: Aave's share tokens have 6, 8 or 18 decimals and the conversion is linear, so a fixed 10^18 would answer a different question on most of them. Nothing was read between this row and the next, and this page draws no line between them.`,
  contract: vaultContract(c),
  via: `${LANE} · convertToAssets(one whole share) @ this row's block`,
});

/** An Umbrella cooldown snapshot, as the log stated it. */
export const vaultTimelineCooldownProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `To check: open the StakerCooldownUpdated log naming this address in ${c.txHash ?? "this transaction"} on a block explorer and read its three fields that are not indexed.`,
  },
  summary: `Cooldown recorded — what this stake token recorded for this address${atBlock(c)}: the ${shares(c)} the cooldown covered, the second it was to end, and the seconds of window after it, as the contract wrote them. It is what was recorded then; the holder section above states the record the address holds now, read at the page's block. A stake token keeps one cooldown record per address at a time and an outgoing transfer decays it, so a later row can carry a smaller amount than an earlier one.`,
  contract: vaultContract(c),
  via: `${LANE} · the StakerCooldownUpdated log in this transaction`,
});

// ── the notes ────────────────────────────────────────────────────────────────

const NOTE_CLAUSE: Record<AaveVaultNote["kind"], string> = {
  "target-rate":
    "Target rate update — the rate the risk council set on the vault, in the basis points the contract stores",
  "cooldown-config":
    "Cooldown change — the seconds every holder must wait between starting a cooldown and being able to redeem",
  "unstake-window-config":
    "Unstake window change — the seconds of redemption window that follow a cooldown, for every holder",
};

/** A vault-wide configuration change: a note, never a row. */
export const vaultTimelineNoteProv = (c: VaultTimelineCoords, note: AaveVaultNote): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: note.blockNumber, txHash: note.txHash },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for the vault's logs of this event over the whole chain and open the one at block ${note.blockNumber}.`,
  },
  summary: `A change to the vault's terms — ${NOTE_CLAUSE[note.kind]}, read at block ${note.blockNumber.toLocaleString("en-US")}. It is not this address's event: it moved every holder's terms at once, which is why it sits beside the rows and this page's event counts leave it out. The values are the log's, raw. What the vault's terms are now is in the sections above, read at the page's block.`,
  contract: vaultContract(c),
  via: `${LANE} · the vault's configuration log for this event`,
});

/** Why the accrual events are not rows — the receipt on the sentence that says
 *  so, so the absence is traceable rather than merely asserted. */
export const vaultTimelineAccrualProv = (
  c: VaultTimelineCoords,
  family: "sgho" | "stata" | "umbrella-stake",
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  summary:
    family === "sgho"
      ? `Why accrual is not a row — sGHO updates its exchange rate on very nearly every call that changes its state: 4,600 updates against 5,478 transfers over the vault's life. The update is the mechanic behind each row's share price, and a row for each would not be a holder's history. This page draws none of them.`
      : family === "stata"
        ? `Why accrual is not a row — a static aToken emits no accrual event. Its share price is the wrapped reserve's Aave V3 liquidity index, so the price on a row is a state read at that row's block, and there is nothing to draw a row from.`
        : `Why accrual is not a row — an Umbrella stake token's total assets are a stored counter, and the token emits no accrual event to draw a row from. Each row's share price is a state read at that row's block, the same read the section above makes at the page's block.`,
  contract: vaultContract(c),
  via: `${LANE} · the family's accrual mechanic · ExchangeRateUpdated (sGHO), not drawn`,
});

// ── the store: rows read at a finalized block and kept ───────────────────────
//
// A row at or below the lane's own `finalized` block never changes, so it may
// be kept. These two receipts are how a reader sees that: which rows came out
// of the store, what block the store's cut was, on which lane those rows were
// read and when, and — on the gate — which half of the replay each figure is.

/** The split under the timeline heading: N rows from the store, M read now. */
export const vaultStoredRowsProv = (c: VaultTimelineCoords, h: VaultHistorySource, storedAt: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for the vault's Transfer logs that name this address as sender and as receiver, blocks 0 to ${h.cut ?? 0}, and compare them with the kept rows one for one.`,
  },
  summary:
    h.source === "stored+head"
      ? `Where these rows came from — ${h.tailRows.toLocaleString("en-US")} were read at or below block ${(h.cut ?? 0).toLocaleString("en-US")} and kept; ${h.headRows.toLocaleString("en-US")} above that block were read on this request. Block ${(h.cut ?? 0).toLocaleString("en-US")} was the chain's finalized block when the rows were kept${storedAt ? `, ${storedAt}` : ""}, as the node answered then, never a fixed distance behind the latest block. Each kept row holds what the page draws for it (its transfer, its asset amount where the vault emitted one, the share price read at its block and the block's time) and the signed sum of the transfers; nothing derived from them, such as a claim or a share of the vault, is kept. The check below ran on the kept rows and the newly read ones together, as it does on every request, so a kept share amount that had gone wrong would fail it and no rows would be drawn.`
      : `Where these rows came from — every row was read on this request, from the chain's first block to block ${(c.blockNumber ?? 0).toLocaleString("en-US")}. Nothing kept was used: either nothing was kept for this address in this vault, or this request did not use what was kept.`,
  contract: vaultContract(c),
  via: `${LANE} · Transfer logs, sent and received + the kept rows at their cut`,
});

// ── the lifetime flows tower ─────────────────────────────────────────────────

/** What each flow figure on the tower is, in the words the contract used. */
const FLOW_CLAUSE: Record<VaultFlowKind, (unit: string) => string> = {
  minted: (u) =>
    `every transfer of this vault from the zero address to this address, summed. Those are mints: shares that came into existence for it. The figure is in ${u}`,
  burned: (u) =>
    `every transfer from this address to the zero address, summed. Those are burns: shares destroyed when it redeemed. The figure is in ${u}`,
  "transferred-in": (u) =>
    `every transfer to this address from another holder, summed: shares handed over by another holder, which are drawn apart from the mints, in ${u}`,
  "transferred-out": (u) =>
    `every transfer from this address to another holder, summed: shares handed to another holder, which are drawn apart from the burns, in ${u}`,
  deposited: (u) =>
    `the asset amounts of every ERC-4626 deposit event that came with this address's mints, summed. It is the contract's figure for what went in, in ${u}`,
  withdrawn: (u) =>
    `the asset amounts of every ERC-4626 withdrawal event that came with this address's burns, summed, in ${u}. It is the contract's figure for what came out`,
};

export type VaultFlowKind = "minted" | "burned" | "transferred-in" | "transferred-out" | "deposited" | "withdrawn";

/** One bar or breakdown row on the lifetime-flows tower. */
export const vaultFlowProv = (
  c: VaultTimelineCoords,
  kind: VaultFlowKind,
  unit: string,
  count: number,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for this vault's logs that name this address and add up the ${count} that match.`,
  },
  summary: `A lifetime total — ${FLOW_CLAUSE[kind](unit)}. It sums ${count.toLocaleString("en-US")} row${count === 1 ? "" : "s"} of this address's whole history, the same rows the history check ran over; the timeline below draws the newest of them. Nothing here is priced.`,
  contract: vaultContract(c),
  via: `${LANE} · the holder's logs on the vault, summed`,
});

/** The claim now — the vault's own conversion of the balance it holds. */
export const vaultClaimNowProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's convertToAssets(balanceOf(${c.holder ?? "the address"})) at block ${c.blockNumber ?? 0}.`,
  },
  summary: `Claim now — what the vault says this address's shares convert to${atBlock(c)}, in ${asset(c)}, read once. It is the contract's figure now, and differs from the sum of the deposits and withdrawals beside it.`,
  contract: vaultContract(c),
  via: `${LANE} · convertToAssets(balanceOf(holder)) @ the pinned block`,
});

/** The shares now — the same `balanceOf` the completeness check compared against. */
export const vaultSharesNowProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for the vault's balanceOf(${c.holder ?? "the address"}) at block ${c.blockNumber ?? 0}.`,
  },
  summary: `Shares now — this address's balance in the vault${atBlock(c)}, in ${shares(c)}, read at the block the history check compared the replay with. The check found the replay equal to the balance to the wei, so mints plus shares transferred in, less burns and shares transferred out, equal this number.`,
  contract: vaultContract(c),
  via: `${LANE} · balanceOf(holder) @ the pinned block`,
});
