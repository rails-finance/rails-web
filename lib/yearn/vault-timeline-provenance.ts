// The receipts for a holder's timeline inside a Yearn V3 vault on Ethereum.
// ----------------------------------------------------------------------------
// A sibling of vault-provenance.ts, which traces the vault's READING at one
// block. These trace its HISTORY, and the difference shows in every one of
// them: a reading's receipt names one block and one call, while a row's names
// the block THAT ROW happened at, and the gate's names two log sweeps and the
// balance they were checked against.
//
// WHY A THIRD COPY. What a share price MEANS is the family's mechanic, and a
// receipt that spoke about three families at once would be true about none of
// them. Aave's share price moves on a liquidity index or an exchange rate;
// MetaMorpho's moves on market interest and a factory offset; a Yearn V3
// vault's moves when a strategy REPORTS — a gain is locked and released into
// the price across `profitMaxUnlockTime` — and the exponent it is asked with is
// the asset's decimals with no offset at all. Each of those sentences belongs
// beside the mechanic it describes.
//
// Three things every receipt here holds to.
//
//   • A ROW'S RECEIPT NAMES THE BLOCK THAT ROW IS IN, never the page's. A
//     share price on a row is `convertToAssets(10 ** decimals)` answered at the
//     block the holder's own transaction landed in, and saying otherwise would
//     attach a head figure to a two-year-old event.
//   • NO RECEIPT SPEAKS ABOUT THE BLOCKS BETWEEN TWO ROWS. Rails read nothing
//     there. A summary that said "the price rose from X to Y" would assert a
//     path through blocks nobody chose, which is the sampled series decision
//     `0017` §6 refuses.
//   • THE LANE IS NAMED BY ITS ENV VAR, NEVER ITS URL. The URL carries a key.
//
// Distance classes: `state` for a call at a block, `emitted` for a value decoded
// out of a log. The replayed running balance is `chain-derived` — every leaf is
// a log field and the only operation is a signed sum, which is the charter's
// truth-preserving delta replay.

import type { Provenance } from "@/components/shared/provenance";
import type { VaultHolderEvent, VaultHolderReconcile, VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";

const LANE = "live Ethereum chain reads (/ethereum/yearn/vaults)";

export type { VaultTimelineCoords };

const vaultContract = (c: VaultTimelineCoords): Provenance["contract"] => ({
  name: c.vaultName ? `${c.vaultName} (Yearn V3, ERC-4626)` : "the vault",
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
  // Yearn's reader emits no cooldown row — a Yearn V3 vault has no cooldown to
  // record. The arm exists because the shape is shared with a family that does.
  cooldown: "no shares moved: this row records an action with no transfer in its transaction",
};

// ── the gate ─────────────────────────────────────────────────────────────────

/** The reconcile check — the receipt behind the two figures the page
 *  states whether or not it goes on to draw anything. */
export const yearnVaultTimelineGateProv = (c: VaultTimelineCoords, r: VaultHolderReconcile): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  verify: {
    kind: "recompute",
    text: `Re-run both eth_getLogs on the vault for the Transfer topic with this address in topic1 and then in topic2, blocks ${r.fromBlock}–${r.toBlock}, sum the values signed, and compare against balanceOf(${c.holder ?? "the address"}) at block ${r.toBlock}`,
  },
  summary: `The history check — every \`Transfer\` this address sent or received on this vault, replayed into a balance and compared against the vault's \`balanceOf\` at block ${r.toBlock}. Two \`eth_getLogs\` answered ${r.logsOut} outgoing and ${r.logsIn} incoming logs over blocks ${r.fromBlock}–${r.toBlock} — the range starts at the block the vault's creation log sits in, because the vault emitted nothing before it existed. Their signed sum is ${r.replayed} and \`balanceOf\` reads ${r.onChain}. ${r.reconciled ? "The two agree wei-exact, which is why the rows below are drawn at all." : "The two do not agree, so no history is drawn: a lane that answers part of a question with an HTTP 200 has been observed on this chain, and no status code, timing or count tells that apart from a genuinely empty history."}${r.refetched ? ` Both sweeps were run a second time on the same lane after a pause, and the second answer ${r.refetchDiffered ? "returned a DIFFERENT log count from the first — direct evidence of a lane answering one question two ways" : "returned the same log count"}.` : ""} The sweeps ran on the endpoint named by \`${r.lane}\`; the URL is not stated because it carries a key.`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) + balanceOf(holder) @ the pinned block`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder) == balanceOf(holder)",
});

/** The ceiling: the life was read whole and is longer than one request draws.
 *
 *  TWO SHAPES, AND THE RECEIPT SAYS WHICH. `exact` is a whole read that was too
 *  long to build — both sweeps returned and the count is a census. A lower
 *  bound is a lane that would not hand the logs over at all, walked in chunks
 *  until the count passed the horizon and stopped there; the rows are withheld
 *  either way, but "at least N" and "N" are different claims. */
export const yearnVaultTimelineHorizonProv = (
  c: VaultTimelineCoords,
  count: number,
  ceiling: number,
  lowerBound: boolean,
  lane: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber },
  summary: `Rows withheld — this address appears in ${lowerBound ? "at least " : ""}${count.toLocaleString("en-US")} \`Transfer\` logs on this vault, above the ${ceiling.toLocaleString("en-US")} this lane builds in one request. Each row costs an \`eth_getBlockByNumber\` and an archive \`convertToAssets\` at the block that row is in, so the bound measures how long a visitor would wait for the reading. The newest few are not drawn in place of the rest: a partial walk shown as a life is the one failure this gate exists to prevent, and the history check sums every row, so a page of rows could not be reconciled in any case. ${
    lowerBound
      ? `The count is a FLOOR — the answer is at least this many and may be more: the endpoint named by \`${lane}\` refused the whole-range sweep on response size — it will not answer one direction past 10,000 logs — so the range was walked in chunks from the vault's creation block and stopped the moment the running count passed the horizon. Every chunk counted answered; a chunk that refused would have been halved and both halves counted. Because the logs were never handed over whole, the balance check above could not be run on this address at all, which is why nothing is drawn at all.`
      : "The count is exact — both sweeps returned, and the balance check ran and agreed, before this decision was made."
  }`,
  contract: vaultContract(c),
  via: `${LANE} · eth_getLogs (Transfer, both directions) @ the pinned block`,
});

// ── a row's figures ──────────────────────────────────────────────────────────

/** The share delta — the `value` word of this row's `Transfer` log. */
export const yearnVaultTimelineSharesProv = (c: VaultTimelineCoords, kind: VaultHolderEvent["kind"]): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Read the Transfer log at this log index in ${c.txHash ?? "this transaction"} and decode its one non-indexed word`,
  },
  summary: `Shares moved — the \`value\` word of this row's \`Transfer\` log${atBlock(c)}, in the share token's units. Which way it moved is decided by the two indexed addresses: ${KIND_CLAUSE[kind]}. Nothing about the row is inferred from a method name or a label — the zero address is what says whether shares were created, destroyed or handed on.`,
  contract: vaultContract(c),
  via: `${LANE} · the Transfer log in this transaction`,
});

/** The replayed running balance after this row. */
export const yearnVaultTimelineBalanceAfterProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance after — every one of this address's \`Transfer\` values up to and including this log, added with its sign, in share units. Not a call: it is the replay, which is the same sum the history check above compares against the vault's \`balanceOf\`. It is a position INSIDE the block, so where an address has two logs in one block only the later one equals what \`balanceOf\` would answer at the end of that block. The check compares only the final position, which is always an end-of-block figure.`,
  contract: vaultContract(c),
  via: `${LANE} · replay of this address's Transfer logs`,
  formula: "Σ (value where to == holder) − Σ (value where from == holder), up to this log",
});

/** The replayed running balance BEFORE this row — the same replay one log
 *  earlier, which on this shape is one subtraction. */
export const yearnVaultTimelineBalanceBeforeProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  summary: `Balance before — the replayed position one log earlier, which is the balance after this log less this log's signed \`value\`. Integer arithmetic on two figures this row already carries, so it is exact: no call was made at the block before this one and none is implied. A row whose \`value\` is zero — a transfer whose two ends are this same address — states the same figure on both sides, and that equality is the reading.`,
  contract: vaultContract(c),
  via: `${LANE} · replay of this address's Transfer logs`,
  formula: "balance after this log − this log's signed value",
});

/** The asset leg, as the ERC-4626 event stated it. */
export const yearnVaultTimelineAssetsProv = (c: VaultTimelineCoords, kind: "deposit" | "withdrawal"): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Read the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in ${c.txHash ?? "this transaction"} and decode its first non-indexed word`,
  },
  summary: `${kind === "deposit" ? "Deposited" : "Withdrawn"} — the \`assets\` word of the ERC-4626 \`${kind === "deposit" ? "Deposit" : "Withdraw"}\` event the vault emitted for this address in this same transaction${atBlock(c)}, in ${asset(c)}. It is the contract's figure for what moved, matched to this row by transaction AND by share count, not this page's shares multiplied by a share price. Where a row states no asset leg, none was emitted — a plain transfer between two holders emits none — and this page states the shares alone.`,
  contract: vaultContract(c),
  via: `${LANE} · the ERC-4626 ${kind === "deposit" ? "Deposit" : "Withdraw"} log in this transaction`,
});

/** The share price at THIS row's block, and the exponent it was asked with. */
export const yearnVaultTimelineSharePriceProv = (c: VaultTimelineCoords, shareDecimals: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber, txHash: c.txHash },
  verify: {
    kind: "recompute",
    text: `Re-run the convertToAssets(10^${shareDecimals}) eth_call at block ${c.blockNumber ?? "this row's block"} against any Ethereum archive node`,
  },
  summary: `Share price at this event — \`convertToAssets(10^${shareDecimals})\` answered${atBlock(c)}, which is the block this address's transaction landed in — a block the holder chose by transacting. What ONE whole share converted to in ${asset(c)} at that moment, answered by the vault. The exponent is the \`decimals()\` this vault reported at the page's block: a Yearn V3 vault mirrors its asset's decimals and adds no offset, so on the 6-decimal assets that make up most of this roster a fixed 10^18 would ask a question a trillion times too large and print the answer as a price. This figure says nothing about any block between this row and the next — nothing was read there, and this page draws no line through it.`,
  contract: vaultContract(c),
  via: `${LANE} · convertToAssets(one whole share) @ the block this row is in`,
});

/** Why the harvest stream is not a row — the receipt on the sentence that says
 *  so, so the absence is traceable. */
export const yearnVaultTimelineAccrualProv = (c: VaultTimelineCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Why a harvest is not a row — a Yearn V3 vault's share price moves when a STRATEGY reports: the vault records the gain and releases it into the price across the \`profitMaxUnlockTime\` seconds that follow. Those \`StrategyReported\` and \`UpdateDebt\` logs are the vault's, not this address's, and they fire on a schedule nobody here chose. They are the mechanic behind each row's share price, named in that figure's receipt, and this page reads none of them as rows. A row is something this address did.`,
  contract: vaultContract(c),
  via: `${LANE} · the vault's accrual mechanic`,
});

// ── the reading beside the rows ──────────────────────────────────────────────
//
// ⚠️ THERE ARE NO "SHARES NOW" / "CLAIM NOW" RECEIPTS HERE. Those two figures
// are drawn by the shared lifetime-flows tower, which is fed by
// `computeVaultPositionEconomics` (lib/aave-vaults/position-economics.ts) — one
// reducer for all three vault families, carrying `vaultSharesNowProv` and
// `vaultClaimNowProv`. A second pair here would be two receipts for one figure,
// and the one the page renders would be whichever the reducer reached for.
//
// What that reducer's receipts still say is "(/ethereum/aave/vaults)" in their
// lane sentence, on this page and on the MetaMorpho one alike. The call and the
// block they name are this page's and correct; the LANE NAME is the Aave arm's.
// Fixing it means giving the reducer a receipt kit the way the row takes one
// (`VaultTimelineProvKit`), a change to three call sites, and it is recorded
// here so the next reader finds it stated.
