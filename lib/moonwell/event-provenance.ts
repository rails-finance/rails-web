// Moonwell (Ethereum L1) provenance vocabulary.
// ----------------------------------------------------------------------------
// Moonwell is a Compound v2 fork: four fixed mToken markets, every action a
// typed mToken event. Three replay lanes with DIFFERENT step classes — the
// grading is the point:
//   • emitted — fields the event itself carries (amounts, mintTokens,
//     accountBorrows, seizeTokens). accountBorrows is special: the borrower's
//     TOTAL debt after the event, interest accrued to that moment INCLUDED
//     (per-timestamp accrual), emitted verbatim.
//   • state   — the mToken balance: the full-Transfer replay equals the
//     accountTokens slot (`balanceOf`) at every block, archive-verifiable
//     (checked wei-exact against totalSupply across all four markets,
//     2026-07-14). Likewise mTokens × exchangeRateStored, a slot-read product.
//   • indexed — the supply PRINCIPAL: Σ(mint − redeem) over captured events;
//     no on-chain slot holds it (a full exit nets negative by earned interest).
// The interpreted figures Moonwell's own UI shows (account liquidity, borrow
// capacity, APY projections) are deliberately absent — they would be layers.
//
// Values replay the captured moonwell_* events. The `contract` is the
// per-market mToken (passed in as `coords.mtoken`) — each market is its own
// contract, like Compound's per-market Comet.
//
// The same vocabulary serves Moonwell on Base, where the events are not
// captured by an index but swept live from the chain's logs, and where a
// transaction lives on Basescan rather than Etherscan. Both facts ride the
// coords (`source`, `chainId`): every receipt's custody line and every
// "confirm it yourself" link follow them, and a receipt on a Base page that
// named a rails-server index or pointed at Etherscan would read as correct
// until followed. Absent coords mean Ethereum and the index, so every existing
// receipt renders the string it rendered before the seam existed.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import type { CaptureSource } from "@/lib/shared/capture-source";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { MOONWELL_ADDRESSES } from "./asset-catalog";

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const MOONWELL_INDEX_VIA = "captured mToken events (moonwell_*)";
const MOONWELL_SWEEP_VIA = "live sweep of the mTokens' own logs";
const captureVia = (coords?: MoonwellCoords): string =>
  coords?.source === "sweep" ? MOONWELL_SWEEP_VIA : MOONWELL_INDEX_VIA;

export interface MoonwellCoords {
  txHash?: string;
  blockNumber?: number;
  /** The market's mToken address — the contract every value cites. */
  mtoken?: string;
  /** mToken label, e.g. "mWETH". */
  marketLabel?: string;
  /** Position owner. */
  account?: string;
  /** Which chain the transaction lives on — drives the verify link. Ethereum
   *  when absent. */
  chainId?: ChainId;
  /** How the event reached the page — the receipt's custody line. The index
   *  when absent. */
  source?: CaptureSource;
  /** This deployment's WETH Router, for the routed-flow receipt's input row.
   *  Ethereum's when absent. */
  router?: string;
}

const mtokenContract = (coords?: MoonwellCoords) => ({
  name: coords?.marketLabel ? `mToken (${coords.marketLabel})` : "mToken",
  address: coords?.mtoken ?? "0x0000000000000000000000000000000000000000",
});

const atBlock = (coords?: MoonwellCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Explorer tx-logs link for an emitted event field — zero-RPC, link only, on
 *  whichever chain the coords name. */
const txVerify = (coords?: MoonwellCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(coords.chainId ?? MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** State-read proof: re-run the named mToken view yourself (an archive node
 *  for a historical block). */
const stateVerify = (method: string, block?: number | null): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Re-run the mToken.${method} eth_call at block ${block} against an archive node`
      : `Re-run the mToken.${method} eth_call against any node`,
});

function eventInputs(coords: MoonwellCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
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

/** The emitting event + param behind each action's underlying `amount`. */
const AMOUNT_ORIGIN: Record<string, { event: string; param: string }> = {
  mint: { event: "Mint", param: "mintAmount" },
  redeem: { event: "Redeem", param: "redeemAmount" },
  borrow: { event: "Borrow", param: "borrowAmount" },
  repay: { event: "RepayBorrow", param: "repayAmount" },
};

// ── per-event deltas (emitted) ───────────────────────────────────────────────

/** Signed underlying amount this event moved (the event's own amount param). */
export const assetsDeltaProv = (
  sym: string,
  eventType: "mint" | "redeem" | "borrow" | "repay",
  coords: MoonwellCoords,
  raw?: string | null,
): Provenance => {
  const o = AMOUNT_ORIGIN[eventType];
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${sym} this operation moved — the amount the event itself carries, exactly as the mToken emitted it${atBlock(coords)}, scaled by the underlying's decimals. Decoded from the log, never recomputed.`,
    contract: mtokenContract(coords),
    via: `${captureVia(coords)} · ${o.event} log · ${fieldSeg(o.param, raw)}`,
    inputs: eventInputs(coords),
  };
};

/** mTokens this mint/redeem created or burned (mintTokens / redeemTokens). */
export const mTokensDeltaProv = (
  mSym: string,
  eventType: "mint" | "redeem",
  coords: MoonwellCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${mSym} this operation ${eventType === "mint" ? "created" : "burned"} — the mToken amount the event itself carries, exactly as the mToken emitted it${atBlock(coords)}, scaled by the mToken's 8 decimals. The mToken is the position's receipt token; its balance × the exchange rate is the underlying claim.`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · ${eventType === "mint" ? "Mint" : "Redeem"} log · ${fieldSeg(eventType === "mint" ? "mintTokens" : "redeemTokens", raw)}`,
  inputs: eventInputs(coords),
});

/** mTokens moved by a wallet↔wallet Transfer (the standard ERC-20 amount). */
export const transferAmountProv = (
  mSym: string,
  direction: "in" | "out",
  coords: MoonwellCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${mSym} this transfer moved ${direction === "in" ? "into" : "out of"} the position — the amount the ERC-20 Transfer event itself carries, exactly as the mToken emitted it${atBlock(coords)}, scaled by the mToken's 8 decimals. mTokens are freely transferable: moving them moves the underlying claim, with no mint/redeem event.`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · Transfer log · ${fieldSeg("amount", raw)}`,
  inputs: eventInputs(coords),
});

/** The emitted accountBorrows — the borrower's TOTAL debt after this event. */
export const accountBorrowsProv = (sym: string, coords: MoonwellCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Total ${sym} debt the position owed AFTER this event — the \`accountBorrows\` field the mToken emitted verbatim${atBlock(coords)}. Interest accrued up to this moment is INCLUDED (Moonwell accrues per timestamp and settles interest before every borrow/repay), so this is the contract's own reckoning of the debt, not a replayed sum.`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · Borrow/RepayBorrow log · ${fieldSeg("accountBorrows", raw)}`,
  inputs: eventInputs(coords),
});

/** Debt BEFORE this event = the emitted accountBorrows ∓ the event's own
 *  amount — two emitted fields of the SAME log, one subtraction. */
export const debtBeforeProv = (sym: string, eventType: "borrow" | "repay", coords: MoonwellCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Total ${sym} debt the position owed BEFORE this event — the log's own \`accountBorrows\` (after) ${eventType === "borrow" ? "minus" : "plus"} its own \`${eventType === "borrow" ? "borrowAmount" : "repayAmount"}\`: two emitted fields of the same log, one subtraction. The gap between this figure and the PREVIOUS event's after-value is interest that accrued between the two events (per-timestamp accrual) — real, not a replay artifact.`,
  contract: mtokenContract(coords),
  via: `accountBorrows ${eventType === "borrow" ? "−" : "+"} ${eventType === "borrow" ? "borrowAmount" : "repayAmount"} (same log)`,
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "emitted", note: "the log's own accountBorrows" },
    { label: "change", kind: "chain", pclass: "emitted", note: "the log's own amount (signed)" },
  ]),
});

/** Debt repaid by the liquidator (LiquidateBorrow `repayAmount`). */
export const liqDebtRepaidProv = (sym: string, coords: MoonwellCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Debt (${sym}) the liquidator repaid in this liquidation — exactly as the borrowed market's mToken emitted it${atBlock(coords)}, scaled by the underlying's decimals. The debt movement itself lands in the paired RepayBorrow log (same transaction, payer = the liquidator).`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · LiquidateBorrow log · ${fieldSeg("repayAmount", raw)}`,
  inputs: eventInputs(coords),
});

/** Collateral-market mTokens seized in a liquidation (`seizeTokens`). */
export const seizeTokensProv = (mSym: string, coords: MoonwellCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Collateral seized in this liquidation — ${mSym} (the collateral market's receipt token) transferred from the borrower to the liquidator, exactly as the borrowed market's mToken emitted it${atBlock(coords)}, scaled by the mToken's 8 decimals. The seize is itself an mToken Transfer in the same transaction, so it also appears on the collateral market's balance lane.`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · LiquidateBorrow log · ${fieldSeg("seizeTokens", raw)}`,
  inputs: eventInputs(coords),
});

// ── running balances (the three lanes) ───────────────────────────────────────

/** Exact mToken balance AFTER this event — the full-Transfer replay. */
export const mTokensAfterProv = (mSym: string, coords: MoonwellCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the mToken balanceOf eth_call at block ${coords.blockNumber} against an archive node — the full-Transfer replay matches exactly`
        : "Re-run the mToken balanceOf eth_call — the full-Transfer replay matches exactly",
  },
  summary: `${mSym} the position held AFTER this event — replayed from EVERY mToken Transfer touching this wallet (mint/redeem legs, wallet↔wallet moves, liquidation seizes), in log order up to this block${atBlock(coords)}. This equals the mToken's own accountTokens slot — \`balanceOf\` at this block — exactly (${coords.source === "sweep" ? "checked against the mToken's own balanceOf at the head for every market this wallet holds, 2026-08-25" : "verified wei-exact against totalSupply across all four markets, 2026-07-14"}).`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · Σ ±amount across Transfer logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** mToken balance BEFORE this event = after − this event's own mToken delta. */
export const mTokensBeforeProv = (mSym: string, coords: MoonwellCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: stateVerify("balanceOf", coords.blockNumber != null ? coords.blockNumber - 1 : null),
  summary: `${mSym} the position held BEFORE this event — the after-balance minus this event's own mToken amount (after − change), reconstructed in the browser from the replayed after and the logged delta. Same slot-exact basis as the after: it equals \`balanceOf\` just before this event.`,
  contract: mtokenContract(coords),
  via: "mToken balance after − amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: `replayed ${mSym} balance after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own mToken amount (signed)" },
  ]),
});

/** Supply PRINCIPAL after this event = Σ(mint − redeem) in underlying. */
export const supplyAfterProv = (sym: string, coords: MoonwellCoords, raw?: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} supply PRINCIPAL after this event — replayed by summing the underlying amounts of the position's own mints and redeems, in log order up to this block${atBlock(coords)}. No on-chain slot holds this figure (the chain stores mTokens, not deposited principal): it is ${coords.source === "sweep" ? "this request's replay over the swept logs" : "the index's replay"}, clamped at zero — a full exit nets negative by exactly the interest earned. The mToken lane beside it is the slot-exact reading.`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · Σ ±amount across Mint/Redeem logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Supply principal BEFORE this event = after − this event's own amount. */
export const supplyBeforeProv = (sym: string, coords: MoonwellCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} supply PRINCIPAL before this event — the after-value minus this event's own underlying amount (after − change), reconstructed in the browser from the replayed after and the logged delta. Same amounts-only basis as the after (no on-chain slot holds principal).`,
  contract: mtokenContract(coords),
  via: "supply principal after − amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain-derived", pclass: "indexed", note: `replayed ${sym} principal after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own `amount` (signed)" },
  ]),
});

// ── identity ─────────────────────────────────────────────────────────────────

/** Router-proxied mint/redeem: the emitted party is the WETH Router; the owner
 *  is the counterparty of the same-tx router-leg Transfer. Both logs live in
 *  the SAME transaction, so one Etherscan link shows the whole resolution. */
export const routerProxiedProv = (
  args: { eventType: "mint" | "redeem"; owner: string },
  coords: MoonwellCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType} was routed through Moonwell's WETH Router (native ETH in/out): the ${args.eventType === "mint" ? "Mint log's minter" : "Redeem log's redeemer"} param names the router, and the position owner is the ${args.eventType === "mint" ? "recipient" : "sender"} of the same-transaction router-leg mToken Transfer. Both logs are chain facts in this one transaction — routing, not a third-party action: the owner initiated it.`,
  contract: mtokenContract(coords),
  via: `${captureVia(coords)} · ${args.eventType === "mint" ? "Mint minter" : "Redeem redeemer"} = router + same-tx Transfer leg → owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "the router-leg Transfer counterparty" },
    {
      label: "WETH Router",
      value: coords.router ?? MOONWELL_ADDRESSES.WETH_ROUTER,
      kind: "chain",
      note: "the emitted minter/redeemer (the routing contract)",
    },
  ]),
});

/** Third-party action: the position owner neither signed the transaction nor
 *  was the event's own party (RepayBorrow `payer`, Mint `minter`). Each fact
 *  alone over-marks: routed flows keep the owner as signer; contract-owned
 *  positions keep the owner as the event party — a genuine external action
 *  fails both. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; caller: string },
  coords: MoonwellCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType.replace(/_/g, " ")} was executed by a third party: the position owner neither signed the transaction nor was the event's own party (${args.eventType === "repay" ? "the RepayBorrow payer — who provided the funds" : "the event's emitted actor"}). Both facts are chain values${atBlock(coords)}; each is compared against the owner. Routed flows (the WETH Router) keep the owner as signer and contract-owned positions keep the owner as the event party — this event has the owner as neither.`,
  contract: mtokenContract(coords),
  via: `${MOONWELL_INDEX_VIA} · tx envelope from + ${args.eventType === "repay" ? "payer" : "minter"} param vs owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "event party",
      value: args.caller,
      kind: "chain",
      note: "the event's own party param",
    },
  ]),
});

// ── position card / tower ────────────────────────────────────────────────────

/** Position-card CURRENT supply value — mTokens × exchangeRateStored: the
 *  underlying claim including accrued interest, a slot-read product. */
export const positionSupplyCurrentProv = (sym: string, mSym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run the mToken's balanceOf and exchangeRateStored eth_calls and multiply — or call balanceOfUnderlying directly; both reproduce this figure`,
  },
  summary: `${sym} the position's supply is worth NOW — the exact ${mSym} balance (slot-verified Transfer replay) × the mToken's \`exchangeRateStored\` read at head. The exchange rate grows as the market accrues interest, so this figure INCLUDES the interest earned since deposit — it is what \`balanceOfUnderlying\` returns. Both legs are chain reads, so the product is chain-derived.`,
  contract: { name: `mToken (${mSym})`, address: "" },
  via: "mToken balance × exchangeRateStored (eth_call at head)",
  formula: "mTokens × exchange rate",
  inputs: [
    { label: "mTokens", kind: "chain", pclass: "state", note: "exact Transfer replay (= balanceOf)" },
    { label: "exchange rate", kind: "chain", pclass: "state", note: "mToken exchangeRateStored at head" },
  ],
});

/** Position-card supply PRINCIPAL — the indexed lane (no slot holds it). */
export const positionSupplyPrincipalProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} supply PRINCIPAL — Σ(mint − redeem) of the position's own captured events, complete from the market's deploy block. No on-chain slot holds deposited principal (the chain stores mTokens); this is the index's replay, clamped at zero. Interest earned since deposit is NOT in this figure — the current-value reading (mTokens × exchange rate) carries it.`,
  contract: { name: "mToken", address: "" },
  via: `${MOONWELL_INDEX_VIA} · Σ ±amount across Mint/Redeem logs · deploy → head`,
});

/** Position-card debt — the last event's emitted accountBorrows. */
export const positionDebtProv = (sym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `${sym} debt the position owed at its LAST borrow/repay event${atBlockNum ? ` (as of block ${atBlockNum})` : ""} — the \`accountBorrows\` field that event emitted verbatim, interest accrued to that moment included (per-timestamp accrual). Interest accrued SINCE that event is not in this figure — a live \`borrowBalanceStored\` read would carry it (a later layer).`,
  contract: { name: "mToken", address: "" },
  via: `${MOONWELL_INDEX_VIA} · latest Borrow/RepayBorrow log · accountBorrows`,
});

/** Closed-card peak supply — the highest principal-lane balance-after. */
export const peakSupplyProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest ${sym} supply PRINCIPAL this wallet ever recorded — the maximum of the replayed principal lane (each captured event's own supplied-balance-after) across its whole history. The index's arithmetic over the emitted amounts, not an on-chain slot. Interest lives in the exchange rate outside this lane, so the claim's value at its height sat above this figure; mTokens that arrived by transfer never entered it.`,
  contract: { name: "mToken", address: "" },
  via: `${MOONWELL_INDEX_VIA} · max(supply-after) across Mint/Redeem logs`,
});

/** Closed-card peak debt — the highest emitted accountBorrows. */
export const peakDebtProv = (sym: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `The highest ${sym} debt this wallet ever recorded — the maximum of the emitted \`accountBorrows\` (the contract's own debt-after, carried verbatim on every borrow and repay event) across its whole history. Interest is included to each event's own moment (per-timestamp accrual); debt accrues between events unrecorded, so the true peak between two events can sit slightly above the largest emitted figure.`,
  contract: { name: "mToken", address: "" },
  via: `${MOONWELL_INDEX_VIA} · max(accountBorrows) across Borrow/RepayBorrow logs`,
});

/** Moonwell's Chainlink oracle wrapper — the price the Comptroller itself uses. */
const MOONWELL_ORACLE = { name: "Moonwell Chainlink Oracle", address: MOONWELL_ADDRESSES.ORACLE };

/** On-chain-oracle USD for a card/tower total. Both legs are on-chain — the
 *  replayed token balance and Moonwell's own oracle price (getUnderlyingPrice,
 *  the SAME price the Comptroller reads for liquidity and liquidation math) —
 *  so the product is chain-derived, not an off-chain market feed. */
export const moonwellUsdProvOnchain = (what: string): Provenance => ({
  kind: "chain-derived",
  // Both legs on-chain; the oracle price is the furthest class, so it leads.
  pclass: "oracle",
  summary: `${what} valued in USD from Moonwell's own on-chain oracle — the replayed token balance multiplied by the same Chainlink-wrapper price the Comptroller reads for liquidity and liquidation math (\`getUnderlyingPrice\`), not an off-chain market feed.`,
  contract: MOONWELL_ORACLE,
  via: "chain balance × on-chain oracle price",
  formula: "balance × oracle price",
  inputs: [
    { label: "balance", kind: "chain", note: "replayed position balance" },
    { label: "oracle price", kind: "chain", pclass: "oracle", note: "oracle getUnderlyingPrice" },
  ],
});

/** A lifetime gross flow (Σ redeemed / repaid / liquidation-covered on one
 *  market) — the sum of the position's own emitted amounts across its whole
 *  captured history (complete from the market's 2026-05-27 deploy). */
export const moonwellLifetimeFlowProv = (
  flow: "withdrawn" | "repaid" | "liquidated debt",
  sym: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (${sym}) — the sum of every ${sym} amount this position's own events ${flow === "withdrawn" ? "redeemed" : flow === "repaid" ? "repaid" : "had cleared in liquidations"} across its whole captured history (complete from the market's deploy block, 2026-05-27). mToken events only — wallet↔wallet mToken transfers move the supply claim without a Mint/Redeem log and are not in this sum (they live on the mToken lane).`,
  contract: { name: "mToken", address: "" },
  via: `${MOONWELL_INDEX_VIA} · Σ amount across the position's own logs · deploy → head`,
});

/** Net borrowed PRINCIPAL across the whole captured history — the tower's debt
 *  base line when the interest split renders. */
export const moonwellDebtPrincipalProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} PRINCIPAL — the net of every draw and repayment the position's own events moved, across its whole captured history (complete from the market's deploy block). Principal only — the interest accrued is the separate accrued segment above it.`,
  contract: { name: "mToken", address: "" },
  via: `${MOONWELL_INDEX_VIA} · Σ (borrow − repay) · deploy → head`,
});

/** Accrued interest on the debt leg — the current debt minus the net drawn
 *  principal. `live` when the current figure is the borrowBalanceStored read
 *  at head (the detail page's chain lane); the last event's emitted
 *  accountBorrows otherwise. */
export const moonwellDebtInterestProv = (sym: string, live?: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: live ? "state" : "indexed",
  summary: live
    ? `Accrued interest on the ${sym} debt — the live debt (the mToken's \`borrowBalanceStored\` read at head, interest to the market's last accrual included) minus the net principal replayed from the position's own Borrow/RepayBorrow amounts. Exact arithmetic — "owed now minus drawn", not an annualized-rate estimate.`
    : `Accrued interest on the ${sym} debt — the debt at the last borrow/repay event (its emitted \`accountBorrows\`, interest to that moment included) minus the net principal replayed from the position's own Borrow/RepayBorrow amounts. Exact arithmetic over the position's own logs — "owed then minus drawn", not an annualized-rate estimate. Interest accrued since the last event is not yet in either figure.`,
  contract: { name: "mToken", address: "" },
  via: live ? "borrowBalanceStored @ head − Σ (borrow − repay)" : "last emitted accountBorrows − Σ (borrow − repay)",
  formula: "current − net principal",
  inputs: [
    live
      ? { label: "current", kind: "chain", pclass: "state", note: "borrowBalanceStored at head" }
      : { label: "current", kind: "chain", pclass: "emitted", note: "the last event's accountBorrows" },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed event amounts" },
  ],
});

/** The card's "incl. $X interest" stat caption. `live` when the debt side's
 *  current figure is the borrowBalanceStored read at head. */
export const moonwellInterestCaptionProv = (side: "supply" | "debt", live?: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: side === "supply" || live ? "state" : "indexed",
  summary:
    side === "supply"
      ? "Accrued supply interest included in the collateral value above — per market, the current value (exact mToken balance × the exchange rate read at head, = balanceOfUnderlying) minus the net principal replayed from the position's own Mint/Redeem events, valued at Moonwell's own on-chain oracle price. Interest grew the claim, so it is part of the headline figure, not a separate holding."
      : live
        ? "Accrued borrow interest included in the debt above — per market, the live debt (borrowBalanceStored read at head) minus the net principal replayed from the position's own Borrow/RepayBorrow events, valued at Moonwell's own on-chain oracle price. Interest grew the debt, so it is part of the headline figure, not an amount repaid."
        : "Accrued borrow interest included in the debt above — per market, the debt at the last borrow/repay event (its emitted accountBorrows) minus the net principal replayed from the position's own Borrow/RepayBorrow events, valued at Moonwell's own on-chain oracle price. Interest grew the debt, so it is part of the headline figure, not an amount repaid.",
  contract: { name: "mToken", address: "" },
  via:
    side === "supply"
      ? "(mTokens × exchange rate − Σ net event principal) × oracle getUnderlyingPrice, per market"
      : live
        ? "(borrowBalanceStored @ head − Σ net event principal) × oracle getUnderlyingPrice, per market"
        : "(last emitted accountBorrows − Σ net event principal) × oracle getUnderlyingPrice, per market",
  formula: "(current − net principal) × oracle price",
  inputs: [
    {
      label: "current",
      kind: "chain-derived",
      pclass: side === "supply" || live ? "state" : "emitted",
      note:
        side === "supply"
          ? "mTokens × exchangeRateStored (interest included)"
          : live
            ? "borrowBalanceStored at head"
            : "the last event's accountBorrows",
    },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed event amounts" },
    { label: "oracle price", kind: "chain", pclass: "oracle", note: "oracle getUnderlyingPrice" },
  ],
});

/** The live per-timestamp borrow rate on one market, annualized. */
export const borrowRateProv = (sym?: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the mToken.borrowRatePerTimestamp eth_call and multiply by 31,536,000 (seconds per year)",
  },
  summary: `The current variable borrow rate${sym ? ` on the ${sym} market` : ""} — the mToken's \`borrowRatePerTimestamp\` read at head, annualized (× seconds per year). Moonwell accrues per timestamp (its Base/Moonbeam convention), so the per-second rate is the contract's own unit; the annualization is simple multiplication, not compounding.`,
  contract: { name: "mToken", address: "" },
  via: "mToken borrowRatePerTimestamp (eth_call at head) × 31,536,000",
  formula: "per-second rate × seconds per year",
  inputs: [{ label: "per-second rate", kind: "chain", pclass: "state", note: "borrowRatePerTimestamp at head" }],
});

/** Debt-USD-weighted average borrow rate across several borrowed markets. */
export const avgBorrowRateProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "Debt-weighted average of the markets' current borrow rates — averaged across the markets this position borrows: each market's borrowRatePerTimestamp (annualized) weighted by that debt's USD value at Moonwell's own oracle price. All legs are chain reads at head.",
  contract: { name: "mToken", address: "" },
  via: "Σ (rate × debt USD) ÷ Σ debt USD, per borrowed market",
  formula: "Σ (rate × weight) ÷ Σ weight",
  inputs: [
    { label: "rate", kind: "chain", pclass: "state", note: "borrowRatePerTimestamp per market, annualized" },
    { label: "weight", kind: "chain-derived", pclass: "oracle", note: "debt × oracle getUnderlyingPrice" },
  ],
});

// ── oracle at block (mig 195) ────────────────────────────────────────────────
// The Comptroller's OWN oracle read back at the event's block — the same
// `getUnderlyingPrice` its liquidity and seizure math consumed in that very
// block, from whichever oracle `Comptroller.oracle()` named at that block
// (recorded per row), never today's price and never a price API. The seize
// identity the Comptroller enforces,
//   seizeTokens = repayAmount × incentive × priceBorrowed ÷ (priceCollateral × exchangeRate),
// is reproduced on real liquidations before any of this renders
// (rails-server-onboarding scripts/verify-moonwell-base-oracle-history.mjs).

const oracleContract = (oracle?: string) => ({
  name: "Moonwell oracle (Comptroller.oracle())",
  address: oracle ?? "0x0000000000000000000000000000000000000000",
});

/** The event market's underlying priced at the event block — the footnote
 *  pill on an ordinary row and the debt leg's price on a liquidation. */
export const atBlockPriceProv = (
  sym: string,
  coords: MoonwellCoords,
  oracle?: string,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run Comptroller.oracle() at block ${coords.blockNumber}, then that oracle's getUnderlyingPrice(${coords.marketLabel ?? "mToken"}) at the same block against an archive node`
        : "Re-run Comptroller.oracle(), then that oracle's getUnderlyingPrice(mToken)",
  },
  summary: `${sym} priced in USD at this event's own block — the Comptroller's oracle \`getUnderlyingPrice\`, read from whichever oracle \`Comptroller.oracle()\` named at that block. This is the SAME price the Comptroller's liquidity and seizure math consumed in that block; today's price never enters. The raw answer is scaled 1e(36 − underlying decimals).`,
  contract: oracleContract(oracle),
  via: `Comptroller.oracle() · getUnderlyingPrice${atBlock(coords)}${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Seized-collateral leg value — seizeTokens × the collateral mToken's
 *  exchangeRateStored at the block → underlying, valued at that market's
 *  oracle-at-block price. */
export const liqSeizedValueProv = (
  collSym: string,
  coords: MoonwellCoords,
  vals: { amount: string; price: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `What the seized ${collSym} collateral was worth in USD at the liquidation's block — the emitted seizeTokens (8-dp mTokens) converted to underlying by the collateral mToken's \`exchangeRateStored\` read at the block, then valued at that market's oracle \`getUnderlyingPrice\` at the same block. Every leg is a chain read from the block the liquidation fired; today's price never enters.`,
  contract: mtokenContract(coords),
  via: "seizeTokens × exchangeRateStored → underlying × getUnderlyingPrice (all at block)",
  formula: "seized × price",
  inputs: eventInputs(coords, [
    {
      label: "seized",
      value: vals.amount,
      kind: "chain-derived",
      pclass: "state",
      note: "seizeTokens × exchangeRateStored → underlying",
    },
    {
      label: "price",
      value: `${vals.price} USD`,
      kind: "chain",
      pclass: "oracle",
      note: "collateral getUnderlyingPrice at block",
    },
  ]),
});

/** Cleared-debt leg value — the covered repayAmount valued at the debt
 *  market's oracle-at-block price. */
export const liqClearedValueProv = (
  debtSym: string,
  coords: MoonwellCoords,
  vals: { amount: string; price: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `What the cleared ${debtSym} debt was worth in USD at the liquidation's block — the \`repayAmount\` the liquidator covered (the LiquidateBorrow log's own field), valued at the debt market's oracle \`getUnderlyingPrice\` read at the same block. Capped by the close factor read at that block, so this is the covered slice, not the whole debt.`,
  contract: mtokenContract(coords),
  via: "repayAmount × getUnderlyingPrice (both at block)",
  formula: "repaid × oracle price",
  inputs: eventInputs(coords, [
    { label: "repaid", value: vals.amount, kind: "chain", pclass: "emitted", note: "LiquidateBorrow repayAmount" },
    {
      label: "price",
      value: `${vals.price} USD`,
      kind: "chain",
      pclass: "oracle",
      note: "debt getUnderlyingPrice at block",
    },
  ]),
});

/** The realized premium = seized ÷ cleared − 1 — the ratio that reproduces
 *  the liquidation incentive read at the same block. */
export const liqPremiumProv = (coords: MoonwellCoords, vals: { seized: string; cleared: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The premium the seizure realized — the seized collateral value (${vals.seized}) over the cleared debt value (${vals.cleared}), minus one. Both legs are valued at the SAME block, so the ratio lands on the liquidation incentive the Comptroller enforced at that block (shown beneath it). A seizure priced off the block's closing oracle state reproduces the incentive exactly; one whose transaction also moved the oracle's source within that block lands a fraction of a percent off, and is shown as it stands.`,
  contract: mtokenContract(coords),
  via: "seized value ÷ cleared value − 1 (both at block)",
  formula: "seized ÷ cleared − 1",
  inputs: eventInputs(coords, [
    { label: "seized", value: vals.seized, kind: "chain-derived", pclass: "oracle", note: "collateral value at block" },
    { label: "cleared", value: vals.cleared, kind: "chain-derived", pclass: "oracle", note: "debt value at block" },
  ]),
});

/** The liquidation incentive read at the event block — the Comptroller
 *  constant the premium above reproduces. */
export const liqIncentiveRefProv = (coords: MoonwellCoords, comptroller?: string, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run Comptroller.liquidationIncentiveMantissa() at block ${coords.blockNumber} against an archive node`
        : "Re-run Comptroller.liquidationIncentiveMantissa() against any node",
  },
  summary: `The liquidation incentive the Comptroller enforced at this block — \`liquidationIncentiveMantissa\` read at the event block, not assumed (governance can change it, so it is read where the seizure happened). The realized premium above reproduces this figure for a seizure priced off the block's closing oracle state.`,
  contract: { name: "Comptroller (Unitroller)", address: comptroller ?? MOONWELL_ADDRESSES.COMPTROLLER },
  via: `Comptroller.liquidationIncentiveMantissa()${atBlock(coords)}${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});
