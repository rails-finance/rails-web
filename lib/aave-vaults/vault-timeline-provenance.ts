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
//   • THE LANE IS NAMED BY ITS ENV VAR, NEVER ITS URL. The URL carries a key.
//
// Distance classes: `state` for a call at a block, `emitted` for a value decoded
// out of a log. The replayed running balance is `chain-derived` — every leaf is
// a log field and the only operation is a signed sum, which is the charter's
// truth-preserving delta replay.

import type { Provenance } from "@/components/shared/provenance";
import type {
  AaveVaultNote,
  VaultHistorySource,
  VaultHolderEvent,
  VaultHolderReconcile,
  VaultTimelineCoords,
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

const atBlock = (c: VaultTimelineCoords): string => (c.blockNumber != null ? ` at block ${c.blockNumber}` : "");
const asset = (c: VaultTimelineCoords) => c.assetSymbol ?? "the vault's asset";
const shares = (c: VaultTimelineCoords) => c.shareSymbol ?? "shares";

/** What each `Transfer` classification means, said as the chain decides it. */
const KIND_CLAUSE: Record<VaultHolderEvent["kind"], string> = {
  deposit: "the `from` address is the zero address, so the shares were minted — a deposit",
  withdrawal: "the `to` address is the zero address, so the shares were burned — a withdrawal",
  "transfer-in":
    "neither end is the zero address and this address is the `to`, so the shares arrived from another holder",
  "transfer-out":
    "neither end is the zero address and this address is the `from`, so the shares went to another holder",
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
    text: `Re-run both eth_getLogs on the vault for the Transfer topic with this address in topic1 and then in topic2, blocks ${r.fromBlock}–${r.toBlock}, sum the values signed, and compare against balanceOf(${c.holder ?? "the address"}) at block ${r.toBlock}`,
  },
  summary: `The history check — every \`Transfer\` this address sent or received on this vault, replayed into a balance and compared against the vault's own \`balanceOf\` at block ${r.toBlock}. Two \`eth_getLogs\` answered ${r.logsOut} outgoing and ${r.logsIn} incoming logs over blocks ${r.fromBlock}–${r.toBlock}; their signed sum is ${r.replayed} and \`balanceOf\` reads ${r.onChain}.${r.cutBalance != null ? ` The replay is in two halves: ${r.cutBalance} came from Rails's store of chain readings as the signed sum of every row at or below the stored cut, and the rest was swept from that cut to block ${r.toBlock} on this request. The sum of the two is what \`balanceOf\` was compared against, so a stored half that had gone wrong fails this check rather than reaching the page.` : ""} ${r.reconciled ? "The two agree wei-exact, which is why the rows below are drawn at all." : "The two do not agree, so no history is drawn: a lane that answers part of a question with an HTTP 200 has been observed on this chain, and no status code, timing or count tells that apart from a genuinely empty history."}${r.refetched ? ` Both sweeps were run a second time on the same lane after a pause, and the second answer ${r.refetchDiffered ? "returned a DIFFERENT log count from the first — direct evidence of a lane answering one question two ways" : "returned the same log count"}.` : ""} The sweeps ran on the endpoint named by \`${r.lane}\`; the URL is not stated because it carries a key.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) + balanceOf(holder) @ the pinned block`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder) == balanceOf(holder)",
});

/** The ceiling: the life was read whole and is larger than Rails stores.
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
  lowerBound: boolean,
  lane: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  summary: `Rows withheld — this address has ${lowerBound ? "at least " : ""}${count.toLocaleString("en-US")} of its own \`Transfer\` logs on this vault, above the ${ceiling.toLocaleString("en-US")} Rails keeps a stored history for. That bound is the store's own 8 MB body limit divided by a measured row, so it says the life is larger than Rails STORES rather than larger than a page can draw. The newest few are not drawn instead: a partial walk shown as a life is the one failure this gate exists to prevent, and the history check sums every row, so a page of rows could not be reconciled in any case. ${
    lowerBound
      ? `The count is a FLOOR, not a census: the endpoint named by \`${lane}\` refused the whole-range sweep on response size — it will not answer one direction past 10,000 logs — so the range was walked in chunks of 1,000,000 blocks from block 0 and the walk stopped the moment the running count passed the horizon. Every chunk counted answered; a chunk that had refused would have been halved rather than skipped, and a count with a hole in it would have been reported as unread instead. Because the logs were never handed over whole, the balance check above could not be run on this address at all — which is why nothing is drawn rather than drawn with a caveat.`
      : "The count itself is exact — both sweeps returned, and the balance check ran and agreed, before this decision was made."
  }`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) @ the pinned block`,
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
    text: `Read GET /api/vaults/positions/tail for this position and check that its cutBlock is ${building.keptCut} and that its rows sum to its cutBalance`,
  },
  summary: `A history being read into Rails's store — ${building.keptRows.toLocaleString("en-US")} of this address's ${building.totalRows.toLocaleString("en-US")} rows are kept at or below block ${building.keptCut}, and the rest are still to be read. Every row costs one \`eth_getBlockByNumber\` and one archive \`convertToAssets\` at its OWN block, so a life this long is read a chunk of blocks at a time across visits rather than making one reader wait for all of it. What is kept is a WHOLE up to its own cut: the rows are read oldest first, so the stored set is an unbroken prefix of the life, and the store re-sums its deltas on the way in and refuses a body that does not add up. No rows are drawn until the whole life is stored — a prefix is not a life, and the history check sums every row of one. The sweeps that found these logs are not repeated on a later visit; only the blocks not yet read are.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getBlockByNumber + convertToAssets at each row's own block, stored at a finalized cut`,
});

// ── a row's own figures ──────────────────────────────────────────────────────

/** The share delta — the `value` word of this row's own `Transfer` log. */
export const vaultTimelineSharesProv = (c: VaultTimelineCoords, kind: VaultHolderEvent["kind"]): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Read the Transfer log at this log index in ${c.txHash ?? "this transaction"} and decode its one non-indexed word`,
  },
  summary: `Shares moved — the \`value\` word of this row's own \`Transfer\` log${atBlock(c)}, in the share token's own units. Which way it moved is decided by the two indexed addresses: ${KIND_CLAUSE[kind]}. Nothing about the row is inferred from a method name or a label — the zero address is what says whether shares were created, destroyed or handed on.`,
  contract: vaultContract(c),
  via: `${LANE} · the Transfer log in this transaction`,
});

/** The replayed running balance after this row. */
export const vaultTimelineBalanceAfterProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance after — every one of this address's own \`Transfer\` values up to and including this log, added with its sign, in share units. Not a call: it is the replay, which is the same sum the history check above compares against the vault's \`balanceOf\`. It is a position INSIDE the block, so where an address has two logs in one block only the later one equals what \`balanceOf\` would answer at the end of that block. The check compares only the final position, which is always an end-of-block figure.`,
  contract: vaultContract(c),
  via: `${LANE} · replay of this address's own Transfer logs`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder), up to this log",
});

/** The replayed running balance BEFORE this row — the same replay one log
 *  earlier, which on this shape is a subtraction rather than a second sum. */
export const vaultTimelineBalanceBeforeProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance before — the replayed position one log earlier, which is the balance after this log less this log's own signed \`value\`. Integer arithmetic on two figures this row already carries, so it is exact: no call was made at the block before this one and none is implied. A row whose \`value\` is zero — a transfer whose two ends are this same address, or a cooldown that moved no shares — states the same figure on both sides, and that equality is the reading rather than a placeholder.`,
  contract: vaultContract(c),
  via: `${LANE} · replay of this address's own Transfer logs`,
  formula: "balance after this log − this log's own signed value",
});

/** The asset leg, as the ERC-4626 event stated it. */
export const vaultTimelineAssetsProv = (c: VaultTimelineCoords, kind: "deposit" | "withdrawal"): Provenance => ({
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
export const vaultTimelineSharePriceProv = (c: VaultTimelineCoords, shareDecimals: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Re-run the convertToAssets(10^${shareDecimals}) eth_call at block ${c.blockNumber ?? "this row's block"} against any Ethereum archive node`,
  },
  summary: `Share price at this event — \`convertToAssets(10^${shareDecimals})\` answered${atBlock(c)}, which is the block this address's own transaction landed in rather than a block Rails picked. What ONE whole share converted to in ${asset(c)} at that moment, answered by the vault itself. The exponent is this vault's OWN \`decimals()\`: Aave's share tokens are 6-, 8- and 18-decimal and \`convertToAssets\` is linear, so a fixed 10^18 would answer a different question on most of them. This figure says nothing about any block between this row and the next — nothing was read there, and this page draws no line through it.`,
  contract: vaultContract(c),
  via: `${LANE} · convertToAssets(one whole share) @ this row's own block`,
});

/** An Umbrella cooldown snapshot, as the log stated it. */
export const vaultTimelineCooldownProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Read the StakerCooldownUpdated log naming this address in ${c.txHash ?? "this transaction"} and decode its three non-indexed words`,
  },
  summary: `Cooldown recorded — the \`StakerCooldownUpdated\` log this stake token emitted for this address${atBlock(c)}: the ${shares(c)} the snapshot covered, the second the cooldown was to end, and the seconds of window after it, exactly as the contract wrote them. It is what was recorded THEN, not the snapshot the address holds now — the page's holder section above states that one, read at the page's own block. A stake token keeps one cooldown record per address at a time and an outgoing transfer decays it, so a later row can carry a smaller amount than an earlier one.`,
  contract: vaultContract(c),
  via: `${LANE} · the StakerCooldownUpdated log in this transaction`,
});

// ── the notes ────────────────────────────────────────────────────────────────

const NOTE_CLAUSE: Record<AaveVaultNote["kind"], string> = {
  "target-rate":
    "`TargetRateUpdated` — the rate the risk council set on the vault, in the basis points the contract stores",
  "cooldown-config":
    "`CooldownChanged` — the seconds every holder must wait between starting a cooldown and being able to redeem",
  "unstake-window-config":
    "`UnstakeWindowChanged` — the seconds of redemption window that follow a cooldown, for every holder",
};

/** A vault-wide configuration change: a note, never a row. */
export const vaultTimelineNoteProv = (c: VaultTimelineCoords, note: AaveVaultNote): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: note.blockNumber, txHash: note.txHash },
  verify: {
    kind: "recompute",
    text: `Re-run eth_getLogs on the vault for this event's topic over the whole chain and read the log at block ${note.blockNumber}`,
  },
  summary: `A change to the vault's own terms — ${NOTE_CLAUSE[note.kind]}, read at block ${note.blockNumber}. It is not this address's event: it moved every holder's terms at once, which is why it sits beside the rows rather than among them and is counted in no total here. The values are the log's own words, raw. What the vault's terms are NOW is the reading in the sections above, at the page's own block.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs on the vault for this configuration event`,
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
      ? `Why accrual is not a row — sGHO emits \`ExchangeRateUpdated\` on very nearly every state-changing call: 4,600 of them against 5,478 \`Transfer\` logs over the vault's whole life. It is the mechanic behind each row's share price, named in that figure's receipt, and a row for each would not be a holder's life. This page reads none of them.`
      : family === "stata"
        ? `Why accrual is not a row — a static aToken emits no accrual event at all. Its share price IS the wrapped reserve's Aave V3 liquidity index, so the price on a row is a state read at that row's block rather than an event, and there is nothing here to draw a row from.`
        : `Why accrual is not a row — an Umbrella stake token's \`totalAssets()\` is a stored counter rather than a balance read, and the token emits no accrual event for this page to draw a row from. Each row's share price is therefore a state read at that row's own block, the same call the section above makes at the page's block.`,
  contract: vaultContract(c),
  via: `${LANE} · the family's own accrual mechanic`,
});

// ── the store: rows read at a finalized block and kept ───────────────────────
//
// A row at or below the lane's own `finalized` block never changes, so it may
// be kept. These two receipts are how a reader sees that: which rows came out
// of the store, what block the store's cut was, on which lane those rows were
// read and when, and — on the gate — which half of the replay each figure is.

/** The split under the timeline heading: N rows from the store, M read now. */
export const vaultStoredRowsProv = (
  c: VaultTimelineCoords,
  h: VaultHistorySource,
  lane: string,
  storedAt: string,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Re-run both eth_getLogs on the vault for the Transfer topic with this address in topic1 and then in topic2 over blocks 0–${h.cut ?? 0}, and compare the logs against the stored rows one for one`,
  },
  summary:
    h.source === "stored+head"
      ? `Where these rows came from — ${h.tailRows.toLocaleString("en-US")} of them were read at or below block ${(h.cut ?? 0).toLocaleString("en-US")} and kept in Rails's store of chain readings; ${h.headRows.toLocaleString("en-US")} above that block were swept from the chain on this request. Block ${(h.cut ?? 0).toLocaleString("en-US")} was the lane's own \`finalized\` answer at the moment the rows were stored${storedAt ? `, ${storedAt}` : ""} — a chain answer read in that request, never a fixed distance behind the head. The store holds the logs' own words and the signed sum of them and nothing else: no claim, no share of the vault, no figure in any other unit. The check below then ran on the stored rows and the swept ones together, as it does on every request, so a stored row that had gone wrong would be caught here rather than drawn. The rows were read on the endpoint named by \`${lane}\`; the URL is not stated because it carries a key.`
      : `Where these rows came from — every one of them was swept from the chain on this request, from the chain's own first block to block ${(c.blockNumber ?? 0).toLocaleString("en-US")}. Nothing was taken from the store: either nothing had been stored for this address in this vault, or this request refused the store outright. The sweeps ran on the endpoint named by \`${lane}\`; the URL is not stated because it carries a key.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) + the stored tail at its own cut`,
});

// ── the lifetime flows tower ─────────────────────────────────────────────────

/** What each flow figure on the tower is, in the words the contract used. */
const FLOW_CLAUSE: Record<VaultFlowKind, (unit: string) => string> = {
  minted: (u) =>
    `every \`Transfer\` of this vault whose \`from\` is the zero address and whose \`to\` is this address, summed. Those are mints: shares that came into existence for it. The figure is in ${u} and is a sum of log words, not a state read`,
  burned: (u) =>
    `every \`Transfer\` whose \`to\` is the zero address and whose \`from\` is this address, summed. Those are burns: shares destroyed when it redeemed. The figure is in ${u}`,
  "transferred-in": (u) =>
    `every \`Transfer\` with this address as \`to\` and a real address as \`from\`, summed — shares handed over by another holder rather than minted for this one. It is drawn apart from the mints for that reason, and in ${u}`,
  "transferred-out": (u) =>
    `every \`Transfer\` with this address as \`from\` and a real address as \`to\`, summed — shares handed to another holder rather than redeemed. In ${u}`,
  deposited: (u) =>
    `the \`assets\` word of every ERC-4626 \`Deposit\` this address's own mints were emitted with, summed. It is the contract's own figure for what went in, in ${u} — never shares multiplied by a share price`,
  withdrawn: (u) =>
    `the \`assets\` word of every ERC-4626 \`Withdraw\` this address's own burns were emitted with, summed, in ${u}. The contract's own figure for what came out`,
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
    text: `Sum the matching log words across the ${count} row${count === 1 ? "" : "s"} the timeline below draws for this address`,
  },
  summary: `A lifetime total — ${FLOW_CLAUSE[kind](unit)}. It sums ${count.toLocaleString("en-US")} row${count === 1 ? "" : "s"} of the timeline below, the same rows the completeness check ran over, so what is added here is exactly what is drawn there. Nothing is annualised, no two rows are subtracted from each other, and no figure here is priced.`,
  contract: vaultContract(c),
  via: `${LANE} · the holder's own logs on the vault, summed`,
});

/** The claim now — the vault's own conversion of the balance it holds. */
export const vaultClaimNowProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Call convertToAssets(balanceOf(${c.holder ?? "the address"})) on the vault at block ${c.blockNumber ?? 0}`,
  },
  summary: `Claim now — the vault's own \`convertToAssets\` of the exact balance this address holds${atBlock(c)}, in ${asset(c)}. It is one call at one block, and it is not the sum of the deposits and withdrawals beside it: those are the contract's words at the blocks they happened at, and this is the contract's word now. The difference between the two is neither drawn nor named here — it is not a rate, and this page reads nothing between those blocks and this one.`,
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
    text: `Call balanceOf(${c.holder ?? "the address"}) on the vault at block ${c.blockNumber ?? 0}`,
  },
  summary: `Shares now — \`balanceOf\` on the vault for this address${atBlock(c)}, in ${shares(c)}. It is the same reading the completeness check compared the replay against, which is why the share side of this chart adds up wei-exact: mints plus shares transferred in, less burns and shares transferred out, IS this number.`,
  contract: vaultContract(c),
  via: `${LANE} · balanceOf(holder) @ the pinned block`,
});
