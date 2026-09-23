// Maple Finance (syrup pools) provenance vocabulary.
// ----------------------------------------------------------------------------
// Maple V2's lender side: ERC-4626 pools, a FIFO withdrawal queue, and a loan
// book whose collateral is custodied OFF-chain. Three replay lanes with
// different step classes — the grading is the point:
//   • emitted — fields the event itself carries. Deposit / Withdraw /
//     RequestProcessed carry BOTH assets and shares, so every value-bearing
//     event is self-priced by its own log.
//   • state   — the share balance: the transfer-leg replay equals the pool
//     token's balanceOf at every block (verified wei-exact 2026-07-14), and
//     the escrow lane mirrors the queue's lockedShares slot. Likewise the
//     pool-level reads (cash, AUM, rates) — eth_calls at head.
//   • indexed — the deposited PRINCIPAL: Σ(deposit − withdraw − fill) over
//     captured events; no on-chain slot holds it (a full exit nets negative
//     by exactly the interest earned).
//
// THE MAPLE-SPECIFIC CAVEAT, carried on every value that rests on the loan
// book (share price, AUM, totalAssets): these are ON-CHAIN BOOKKEEPING OF
// OFF-CHAIN ASSETS. The figures are real chain slots and event fields — the
// chain proves what Maple's contracts RECORDED — but the loans they represent
// are collateralized at custodians (BitGo / Copper / Anchorage / Hex Trust,
// tri-party agreements, Cayman SPC wrapper) and impairments are the pool
// delegate's judgment posted on-chain (unrealizedLosses). The chain cannot
// prove the collateral exists; a proof-of-reserves attestation (The Network
// Firm, since 2026-05) is the off-chain check. The receipts say this rather
// than hide it — that IS the product.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import type { MapleContext } from "@/lib/shared/types/event-shape";
import { MAPLE_POOL_BY_KEY } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const MAPLE_VIA = "captured pool + queue events (maple_*)";

/** The one-sentence custody caveat appended to every loan-book-resting value. */
const CUSTODY_NOTE =
  "The caveat this figure carries: it is on-chain bookkeeping of an off-chain loan book — the chain proves what Maple's contracts recorded (principal, a posted interest rate, the delegate's impairment marks), not that the loans' custodied collateral exists. That last step rests on Maple's custodians and attestations, outside the chain.";

export interface MapleCoords {
  txHash?: string;
  blockNumber?: number;
  /** The pool key — resolves the pool/WMQ contract addresses for the receipt. */
  pool?: string;
  /** Position owner. */
  account?: string;
}

const poolContract = (coords?: MapleCoords) => {
  const p = coords?.pool ? MAPLE_POOL_BY_KEY[coords.pool] : undefined;
  return {
    name: p ? `${p.symbol} pool (ERC-4626)` : "Maple pool",
    address: p?.pool ?? "0x0000000000000000000000000000000000000000",
  };
};
const wmqContract = (coords?: MapleCoords) => {
  const p = coords?.pool ? MAPLE_POOL_BY_KEY[coords.pool] : undefined;
  return {
    name: p ? `${p.symbol} WithdrawalManager (queue)` : "Maple WithdrawalManager",
    address: p?.withdrawalManager ?? "0x0000000000000000000000000000000000000000",
  };
};

const atBlock = (coords?: MapleCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: MapleCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** State-read proof: re-run the named view yourself (an archive node for a
 *  historical block). */
const stateVerify = (call: string, block?: number | null): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Re-run the ${call} eth_call at block ${block} against an archive node`
      : `Re-run the ${call} eth_call against any node`,
});

function eventInputs(coords: MapleCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.account) inputs.push({ label: "account", value: coords.account, kind: "chain", note: "position owner" });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash) inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return inputs;
}

/** The emitting event + param behind each action's asset `amount`. */
const ASSETS_ORIGIN: Record<string, { event: string; param: string; contract: "pool" | "wmq" }> = {
  deposit: { event: "Deposit", param: "assets", contract: "pool" },
  withdraw: { event: "Withdraw", param: "assets", contract: "pool" },
  request_fill: { event: "RequestProcessed", param: "assets", contract: "wmq" },
};

// ── per-event deltas (emitted) ───────────────────────────────────────────────

/** The funds-asset amount this event moved (the event's own assets param). */
export const assetsDeltaProv = (
  sym: string,
  eventType: "deposit" | "withdraw" | "request_fill",
  coords: MapleCoords,
  raw?: string | null,
): Provenance => {
  const o = ASSETS_ORIGIN[eventType];
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${sym} this operation moved — the amount the event itself carries, exactly as ${o.contract === "pool" ? "the pool" : "the withdrawal queue"} emitted it${atBlock(coords)}, scaled by the asset's 6 decimals. Decoded from the log, never recomputed.`,
    contract: o.contract === "pool" ? poolContract(coords) : wmqContract(coords),
    via: `${MAPLE_VIA} · ${o.event} log · ${fieldSeg(o.param, raw)}`,
    inputs: eventInputs(coords),
  };
};

/** Shares this deposit/withdraw minted or burned (the log's own shares). */
export const sharesDeltaProv = (
  poolSym: string,
  eventType: "deposit" | "withdraw",
  coords: MapleCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${poolSym} shares this operation ${eventType === "deposit" ? "minted" : "burned"} — the share amount the event itself carries, exactly as the pool emitted it${atBlock(coords)}, scaled by the share token's 6 decimals. The share is the position's claim; shares × the pool's exit rate is what it redeems for.`,
  contract: poolContract(coords),
  via: `${MAPLE_VIA} · ${eventType === "deposit" ? "Deposit" : "Withdraw"} log · ${fieldSeg("shares", raw)}`,
  inputs: eventInputs(coords),
});

/** The exchange rate THIS event settled at — assets ÷ shares, two emitted
 *  fields of the SAME log. Every value-bearing Maple event is self-priced. */
export const eventRateProv = (
  assetSym: string,
  poolSym: string,
  eventType: "deposit" | "withdraw" | "request_fill",
  coords: MapleCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${assetSym}-per-${poolSym} rate this operation settled at — the log's own \`assets\` divided by its own \`shares\`: two emitted fields of the same event, one division. No oracle is involved; the pool priced the operation itself, and the log records both legs.`,
  contract: eventType === "request_fill" ? wmqContract(coords) : poolContract(coords),
  via: "assets ÷ shares (same log)",
  formula: "assets ÷ shares",
  inputs: eventInputs(coords, [
    { label: "assets", kind: "chain", pclass: "emitted", note: "the log's own assets" },
    { label: "shares", kind: "chain", pclass: "emitted", note: "the log's own shares" },
  ]),
});

/** Shares a queue event escrowed / returned / filled (the WMQ's own log). */
export const requestSharesProv = (
  poolSym: string,
  eventType: "request" | "request_decrease" | "request_fill",
  coords: MapleCoords,
  raw?: string | null,
): Provenance => {
  const origin =
    eventType === "request"
      ? "RequestCreated"
      : eventType === "request_decrease"
        ? "RequestDecreased"
        : "RequestProcessed";
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${poolSym} shares this queue event ${
      eventType === "request"
        ? "escrowed into the withdrawal queue"
        : eventType === "request_decrease"
          ? "returned to the wallet"
          : "redeemed at the exit rate"
    } — the amount the WithdrawalManager's own event carries${atBlock(coords)}, scaled by the share token's 6 decimals.`,
    contract: wmqContract(coords),
    via: `${MAPLE_VIA} · ${origin} log · ${fieldSeg("shares", raw)}`,
    inputs: eventInputs(coords),
  };
};

/** The remainder a request removal returned — resolved across the request's
 *  own lifecycle logs (RequestRemoved itself carries no shares). */
export const requestCancelSharesProv = (poolSym: string, coords: MapleCoords, raw?: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary: `The ${poolSym} shares this cancellation returned to the wallet — the request's own RequestCreated amount minus every RequestDecreased and RequestProcessed against the same request id. The RequestRemoved log itself carries no share amount, so the figure is resolved across the request's own lifecycle logs (all chain facts; the arithmetic is the index's).`,
  contract: wmqContract(coords),
  via: `${MAPLE_VIA} · created − Σ decreased − Σ processed (per request id)${raw ? ` = ${raw}` : ""}`,
  formula: "created − decreased − processed",
  inputs: eventInputs(coords, [
    { label: "created", kind: "chain", pclass: "emitted", note: "RequestCreated shares" },
    { label: "decreased", kind: "chain", pclass: "emitted", note: "Σ RequestDecreased shares" },
    { label: "processed", kind: "chain", pclass: "emitted", note: "Σ RequestProcessed shares" },
  ]),
});

/** Shares moved by a wallet↔wallet Transfer (the standard ERC-20 amount). */
export const transferAmountProv = (
  poolSym: string,
  direction: "in" | "out",
  coords: MapleCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${poolSym} this transfer moved ${direction === "in" ? "into" : "out of"} the position — the amount the ERC-20 Transfer event itself carries, exactly as the pool token emitted it${atBlock(coords)}, scaled by 6 decimals. Pool shares are freely transferable: moving them moves the claim, with no pool event.`,
  contract: poolContract(coords),
  via: `${MAPLE_VIA} · Transfer log · ${fieldSeg("value", raw)}`,
  inputs: eventInputs(coords),
});

/** The share leg that rides beside the asset leg on a deposit / withdraw —
 *  the pool tokens minted or burned against the assets moved. Extracted for
 *  the same reason as `flankedLegProv`: the header registers it and the card's
 *  second spine row echoes it, and the echo only resolves on a byte-exact key.
 *
 *  It used to be built inline in the header only, so at ≥sm the figure hid
 *  itself (the header hands values off to the spine) with no spine row to hand
 *  off TO — the number simply vanished. Drawing the row is the fix that keeps
 *  header and spine agreeing by construction rather than by review. */
export function sharesLegProv(
  ctx: MapleContext,
  coords: MapleCoords,
): { value: number; symbol: string; prov: Provenance } | undefined {
  if (ctx.eventType !== "deposit" && ctx.eventType !== "withdraw") return undefined;
  const s = Number(ctx.sharesDelta ?? "0") || 0;
  if (s === 0) return undefined;
  return {
    value: s,
    symbol: ctx.poolSymbol,
    prov: sharesDeltaProv(ctx.poolSymbol, ctx.eventType, coords, ctx.raw?.shares),
  };
}

/** The one leg the card's spine flanks — extracted so the header and the
 *  card's echo call the identical builder with the identical signed value.
 *  The signed-value convention is NOT uniform across eventTypes (unlike a
 *  plain event amount): `request` NEGATES requestShares (a redemption
 *  request reduces the position even though the WMQ log's own shares field
 *  is a positive escrow amount), while request_decrease/request_cancel keep
 *  the raw sign. Deposit/withdraw flank the ASSET leg — the header also
 *  carries a share leg beside it (mint/burn), but the spine shows one row. */
export function flankedLegProv(
  ctx: MapleContext,
  coords: MapleCoords,
): { value: number; symbol: string; prov: Provenance } | undefined {
  switch (ctx.eventType) {
    case "deposit":
    case "withdraw":
    case "request_fill": {
      const d = Number(ctx.assetsDelta ?? "0") || 0;
      if (d === 0) return undefined;
      return {
        value: d,
        symbol: ctx.assetSymbol,
        prov: assetsDeltaProv(ctx.assetSymbol, ctx.eventType, coords, ctx.raw?.assets),
      };
    }
    case "request":
    case "request_decrease": {
      const s = Number(ctx.requestShares ?? "0") || 0;
      if (s === 0) return undefined;
      return {
        value: ctx.eventType === "request" ? -s : s,
        symbol: ctx.poolSymbol,
        prov: requestSharesProv(ctx.poolSymbol, ctx.eventType, coords, ctx.raw?.shares),
      };
    }
    case "request_cancel": {
      const s = Number(ctx.requestShares ?? "0") || 0;
      if (s === 0) return undefined;
      return {
        value: s,
        symbol: ctx.poolSymbol,
        prov: requestCancelSharesProv(ctx.poolSymbol, coords, ctx.raw?.shares),
      };
    }
    case "transfer_in":
    case "transfer_out": {
      const d = Number(ctx.sharesDelta ?? "0") || 0;
      if (d === 0) return undefined;
      return {
        value: d,
        symbol: ctx.poolSymbol,
        prov: transferAmountProv(
          ctx.poolSymbol,
          ctx.eventType === "transfer_in" ? "in" : "out",
          coords,
          ctx.raw?.shares,
        ),
      };
    }
    default:
      return undefined;
  }
}

// ── running lanes ────────────────────────────────────────────────────────────

/** Exact share balance AFTER this event — the transfer-leg replay. */
export const sharesAfterProv = (poolSym: string, coords: MapleCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the pool token's balanceOf eth_call at block ${coords.blockNumber} against an archive node — the transfer-leg replay matches exactly`
        : "Re-run the pool token's balanceOf eth_call — the transfer-leg replay matches exactly",
  },
  summary: `${poolSym} the wallet held AFTER this event — replayed from EVERY share transfer touching this wallet (deposit mints, queue escrow and returns, wallet↔wallet moves), in log order up to this block${atBlock(coords)}. This equals the pool token's own \`balanceOf\` at this block exactly (verified wei-exact 2026-07-14). Shares escrowed in the withdrawal queue have LEFT this balance — they show on the escrow lane beside it.`,
  contract: poolContract(coords),
  via: `${MAPLE_VIA} · Σ ±value across Transfer logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Share balance BEFORE this event = after − this event's own movement. */
export const sharesBeforeProv = (poolSym: string, coords: MapleCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: stateVerify("pool.balanceOf", coords.blockNumber != null ? coords.blockNumber - 1 : null),
  summary: `${poolSym} the wallet held BEFORE this event — the after-balance minus this event's own share movement (after − change), reconstructed in the browser from the replayed after and the logged delta. Same slot-exact basis as the after: it equals \`balanceOf\` just before this event.`,
  contract: poolContract(coords),
  via: "share balance after − this event's movement",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: `replayed ${poolSym} balance after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own share amount (signed)" },
  ]),
});

/** Escrowed-in-queue shares AFTER this event. */
export const escrowAfterProv = (poolSym: string, coords: MapleCoords, raw?: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the WithdrawalManager's lockedShares(owner) eth_call — the escrow replay mirrors that slot",
  },
  summary: `${poolSym} sitting in the withdrawal queue for this wallet AFTER this event — replayed from the wallet's own escrow legs (shares transferred to the WithdrawalManager, returns from it, and the shares the queue redeemed on the wallet's behalf), up to this block${atBlock(coords)}. Mirrors the WithdrawalManager's \`lockedShares\` slot. Escrowed shares are still the wallet's position: they exit at the pool's exit rate when the queue processes the request.`,
  contract: wmqContract(coords),
  via: `${MAPLE_VIA} · Σ escrow legs (to/from the WithdrawalManager)${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Escrowed shares BEFORE this event = after − this event's own escrow move. */
export const escrowBeforeProv = (poolSym: string, coords: MapleCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: stateVerify("wmq.lockedShares", coords.blockNumber != null ? coords.blockNumber - 1 : null),
  summary: `${poolSym} sitting in the withdrawal queue BEFORE this event — the after-value minus this event's own escrow movement (after − change), reconstructed in the browser. Same basis as the after (the wallet's own escrow legs).`,
  contract: wmqContract(coords),
  via: "escrowed after − this event's movement",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain-derived", pclass: "state", note: "replayed escrow after this event" },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own escrow movement (signed)" },
  ]),
});

/** Deposited PRINCIPAL after this event = Σ(deposit − withdraw − fill). */
export const principalAfterProv = (sym: string, coords: MapleCoords, raw?: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} deposited PRINCIPAL after this event — replayed by summing the asset amounts of the wallet's own deposits, withdrawals and queue fills, in log order up to this block${atBlock(coords)}. No on-chain slot holds this figure (the chain stores shares, not deposited principal): it is the index's replay, clamped at zero — a full exit nets negative by exactly the interest earned. The share lane beside it is the slot-exact reading.`,
  contract: poolContract(coords),
  via: `${MAPLE_VIA} · Σ ±assets across Deposit/Withdraw/RequestProcessed logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Deposited principal BEFORE this event = after − this event's own assets. */
export const principalBeforeProv = (sym: string, coords: MapleCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} deposited PRINCIPAL before this event — the after-value minus this event's own asset amount (after − change), reconstructed in the browser. Same amounts-only basis as the after (no on-chain slot holds principal).`,
  contract: poolContract(coords),
  via: "deposited principal after − assets",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain-derived", pclass: "indexed", note: `replayed ${sym} principal after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own `assets` (signed)" },
  ]),
});

// ── identity ─────────────────────────────────────────────────────────────────

/** Third-party action: the position owner neither signed the transaction nor
 *  was the event's own party (Deposit/Withdraw `caller`). */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; caller: string },
  coords: MapleCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType.replace(/_/g, " ")} was executed by a third party: the position owner neither signed the transaction nor was the event's own caller. Both facts are chain values${atBlock(coords)}; each is compared against the owner. Deposits made on behalf (a router, a manager) keep the owner in the log's \`owner\` param — this event has the owner as neither actor.`,
  contract: poolContract(coords),
  via: `${MAPLE_VIA} · tx envelope from + caller param vs owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    { label: "event party", value: args.caller, kind: "chain", note: "the event's own caller param" },
  ]),
});

// ── position card / tower / access band ─────────────────────────────────────

/** Position-card share balance — the exact lane at the indexed head. */
export const positionSharesProv = (poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify("pool.balanceOf", atBlockNum ?? null),
  summary: `${poolSym} the wallet holds${atBlockNum ? ` at block ${atBlockNum}` : ""} — replayed from every share transfer touching this wallet (deposit mints, queue escrow/returns, wallet↔wallet moves). Equals the pool token's \`balanceOf\` exactly (verified wei-exact 2026-07-14).`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: `${MAPLE_VIA} · Σ ±value across Transfer logs`,
});

/** Position-card escrowed shares — the queue lane. */
export const positionEscrowProv = (poolSym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: { kind: "recompute", text: "Re-run the WithdrawalManager's lockedShares(owner) eth_call" },
  summary: `${poolSym} waiting in the withdrawal queue for this wallet — replayed from the wallet's own escrow legs; mirrors the WithdrawalManager's \`lockedShares\` slot. Still the wallet's position: it exits at the pool's exit rate when the queue processes the request (median fill ~minutes in calm conditions; the contract allows up to 30 days).`,
  contract: { name: "Maple WithdrawalManager (queue)", address: "" },
  via: `${MAPLE_VIA} · Σ escrow legs (to/from the WithdrawalManager)`,
});

/** Position-card CURRENT value — (shares + escrowed) × the pool's EXIT rate
 *  read at head. Chain-derived — and it carries the custody caveat. */
export const positionCurrentValueProv = (assetSym: string, poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run the pool's convertToExitAssets eth_call on the wallet's share count${atBlockNum ? ` at block ${atBlockNum}` : ""} — it reproduces this figure`,
  },
  summary: `${assetSym} the position redeems for NOW — the pool's own \`convertToExitAssets\` on the exact ${poolSym} balance (plus any queue escrow), read at head. That is the pool's own accounting, in its own integer math: shares × (totalAssets − unrealizedLosses) ÷ totalSupply, where totalAssets accrues a posted interest rate over the outstanding loan book. ${CUSTODY_NOTE}`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "(shares + escrowed) × convertToExitAssets (eth_call at head)",
  formula: "(shares + escrowed) × (totalAssets − unrealizedLosses) ÷ totalSupply",
  inputs: [
    { label: "shares", kind: "chain", pclass: "state", note: "exact transfer replay (= balanceOf)" },
    { label: "escrowed", kind: "chain-derived", pclass: "state", note: "queue escrow lane (lockedShares)" },
    // Named as the aggregates rather than "the exit rate": the figure is
    // computed the way the pool computes it, in integer math over these three,
    // NOT by re-multiplying the 6dp-quantized one-share rate the card displays.
    // That distinction is what makes the verify line above actually reproduce
    // this number (see lib/maple/exit-value.ts).
    { label: "totalAssets", kind: "chain", pclass: "state", note: "pool totalAssets at head" },
    { label: "unrealizedLosses", kind: "chain", pclass: "state", note: "the delegate's live impairment mark" },
    { label: "totalSupply", kind: "chain", pclass: "state", note: "pool share supply at head" },
  ],
});

/** Position-card deposited PRINCIPAL — the indexed lane (no slot holds it). */
export const positionPrincipalProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} deposited PRINCIPAL — Σ(deposits − withdrawals − queue fills) of the wallet's own captured events, complete from the pool's deploy block. No on-chain slot holds deposited principal (the chain stores shares); this is the index's replay, clamped at zero. Interest earned since deposit is NOT in this figure — the current-value reading (shares × exit rate) carries it.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: `${MAPLE_VIA} · Σ ±assets across Deposit/Withdraw/RequestProcessed logs · deploy → head`,
});

/** Interest earned — current redeemable value minus the replayed principal. */
export const interestEarnedProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Interest earned on the ${sym} position — what the position redeems for now ((shares + escrowed) × the exit rate at head) minus the net deposited principal replayed from the wallet's own events. Exact arithmetic over the position's own logs and the pool's own rate — "worth now minus put in", not an annualized-rate estimate. The exit rate leg carries the loan-book caveat: the accrued side is Maple's on-chain bookkeeping of off-chain-collateralized loans.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "(shares + escrowed) × exit rate − Σ net deposited",
  formula: "current − net principal",
  inputs: [
    { label: "current", kind: "chain-derived", pclass: "state", note: "(shares + escrowed) × convertToExitAssets" },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed event assets" },
  ],
});

/** Closed-card peak: the highest share balance the wallet ever held. */
export const peakSharesProv = (poolSym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest ${poolSym} balance this wallet ever held — the maximum of the share-balance lane across its whole captured history. The lane itself is slot-exact (replayed from every share transfer touching the wallet; equals the pool token's \`balanceOf\` at each block), and the maximum over it is the index's arithmetic. Escrowed shares had left the balance when requested, so a peak reached before a withdrawal request includes none of the escrow.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: `${MAPLE_VIA} · MAX over the replayed share-balance lane · deploy → head`,
});

/** Closed-card peak footnote: the highest deposited principal ever recorded. */
export const peakDepositedProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest ${sym} deposited PRINCIPAL this wallet ever recorded — the maximum of the principal lane (Σ deposits − withdrawals − queue fills) across its whole captured history. No on-chain slot holds deposited principal; this is the index's replay. Shares that arrived by transfer carry no deposit, so a transfer-acquired position peaks at zero here while its share peak carries the real height.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: `${MAPLE_VIA} · MAX over the replayed principal lane · deploy → head`,
});

/** A lifetime gross flow (Σ deposited / withdrawn on one pool). */
export const mapleLifetimeFlowProv = (flow: "deposited" | "withdrawn", sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (${sym}) — the sum of every ${sym} amount this wallet's own events ${flow === "deposited" ? "deposited into" : "took out of"} the pool across its whole captured history (complete from the pool's deploy block). Pool events only — wallet↔wallet share transfers move the claim without a Deposit/Withdraw log and are not in this sum (they live on the share lane).`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: `${MAPLE_VIA} · Σ assets across the wallet's own logs · deploy → head`,
});

// ── the access band (pool-level chain reads) ─────────────────────────────────
// Each of these carries `source: { block }` as well as naming the block in its
// prose: the prose is for reading, the structured slot is what the receipt's
// coordinates row reads (the block and its copy button). A state read whose block
// lives only in a sentence cannot be re-run by the reader, which is the whole
// point of the `stateVerify` line beside it.

/** Liquid cash actually in the pool contract — redeemable this block. */
export const poolCashProv = (assetSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify(`${assetSym}.balanceOf(pool)`, atBlockNum ?? null),
  summary: `${assetSym} actually sitting in the pool contract${atBlockNum ? ` at block ${atBlockNum}` : ""} — the funds asset's own \`balanceOf\` on the pool address. This is the ONLY part of the pool a lender can redeem this block; everything else is deployed. A plain ERC-20 slot read — nothing bookkept, nothing custodied.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: `${assetSym}.balanceOf(pool) — eth_call at head`,
});

/** The deployed loan book — Σ LoanManager assetsUnderManagement. */
export const poolLoansAumProv = (assetSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("LoanManager.assetsUnderManagement", atBlockNum ?? null),
  summary: `${assetSym} deployed to Maple's loan book${atBlockNum ? ` at block ${atBlockNum}` : ""} — the sum of both LoanManagers' \`assetsUnderManagement()\`: outstanding principal plus interest accrued at the posted issuance rate. This accrual is deterministic and event-anchored (rebuilt exactly from the accounting events, verified 6/6 2026-07-14). ${CUSTODY_NOTE}`,
  contract: { name: "Maple LoanManagers", address: "" },
  via: "Σ LoanManager.assetsUnderManagement() — eth_call at head",
});

/** The pool's own impairment mark. */
export const poolUnrealizedLossesProv = (assetSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("pool.unrealizedLosses", atBlockNum ?? null),
  summary: `${assetSym} of impairments currently marked against the pool${atBlockNum ? ` at block ${atBlockNum}` : ""} — the pool's own \`unrealizedLosses\` slot. Deducted from the EXIT rate, so a lender who exits during an impairment realizes their share of it. The mark itself is the pool delegate's judgment about off-chain loan health, posted on-chain — a chain fact about a human decision, and the receipts say so.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "pool.unrealizedLosses() — eth_call at head",
});

/** Total shares waiting in the withdrawal queue. */
export const poolQueueSharesProv = (poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("wmq.totalShares", atBlockNum ?? null),
  summary: `${poolSym} shares waiting in the withdrawal queue${atBlockNum ? ` at block ${atBlockNum}` : ""} — the WithdrawalManager's own \`totalShares\` slot. Requests fill FIFO as liquidity allows; comparing the queue's value against the pool's liquid cash shows whether the queue is coverable this block.`,
  contract: { name: "Maple WithdrawalManager (queue)", address: "" },
  via: "wmq.totalShares() — eth_call at head",
});

// ── the protocol view (/maple/pools — whole-pool chain reads) ────────────────

/** The pool's own value claim — totalAssets. */
export const poolTotalAssetsProv = (assetSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("pool.totalAssets", atBlockNum ?? null),
  summary: `${assetSym} the pool claims to be worth in total${atBlockNum ? ` at block ${atBlockNum}` : ""} — the pool's own \`totalAssets\`: the liquid funds asset sitting in the contract plus every strategy's \`assetsUnderManagement()\`. That identity (cash + Σ strategy AUM == totalAssets) holds exact on both pools, verified on-chain 2026-07-14. ${CUSTODY_NOTE}`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "pool.totalAssets() — eth_call at head",
});

/** Shares outstanding — the denominator of both rates. */
export const poolTotalSupplyProv = (poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("pool.totalSupply", atBlockNum ?? null),
  summary: `${poolSym} shares in existence${atBlockNum ? ` at block ${atBlockNum}` : ""} — the pool token's own ERC-20 \`totalSupply\`, wallet-held and queue-escrowed shares alike (escrow moves shares to the WithdrawalManager without burning them). This is the denominator of both the NAV and exit rates. A plain slot read — nothing bookkept, nothing custodied.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "pool.totalSupply() — eth_call at head",
});

/** The NAV rate — convertToAssets on one share, gross of impairment marks. */
export const poolNavRateProv = (assetSym: string, poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("pool.convertToAssets(1e6)", atBlockNum ?? null),
  summary: `${assetSym} per ${poolSym} at NAV${atBlockNum ? ` at block ${atBlockNum}` : ""} — the pool's own \`convertToAssets\` on one whole share: totalAssets ÷ totalSupply, gross of impairment marks. The exit rate beside it deducts \`unrealizedLosses\`, so the two are equal whenever no impairment is live. The figure is the pool's answer for ONE share, already truncated to the asset's 6 decimals — displayed exactly as read, never re-multiplied into any other figure on this page. ${CUSTODY_NOTE}`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "pool.convertToAssets(1e6) — eth_call at head",
});

/** One LoanManager's leg of the deployed book. */
export const poolLoanManagerAumProv = (
  assetSym: string,
  term: "fixed-term" | "open-term",
  atBlockNum?: number,
): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify(
    `${term === "fixed-term" ? "FixedTermLoanManager" : "OpenTermLoanManager"}.assetsUnderManagement`,
    atBlockNum ?? null,
  ),
  summary: `${assetSym} deployed through the pool's ${term} LoanManager${atBlockNum ? ` at block ${atBlockNum}` : ""} — that contract's own \`assetsUnderManagement()\`: outstanding principal plus interest accrued at the posted issuance rate. ${
    term === "fixed-term"
      ? "Fixed-term loans run to a maturity date the borrower committed to."
      : "Open-term loans have no maturity — the delegate can call them for repayment."
  } The LoanManagers are strategies of the pool, so this leg is inside totalAssets. ${CUSTODY_NOTE}`,
  contract: { name: `Maple ${term} LoanManager`, address: "" },
  via: `${term === "fixed-term" ? "FixedTermLoanManager" : "OpenTermLoanManager"}.assetsUnderManagement() — eth_call at head`,
});

/** The non-LoanManager strategies' leg — on-chain yield deployments. */
export const poolStrategiesAumProv = (assetSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("strategy.assetsUnderManagement", atBlockNum ?? null),
  summary: `${assetSym} deployed through the pool's non-LoanManager strategies${atBlockNum ? ` at block ${atBlockNum}` : ""} — Σ \`assetsUnderManagement()\` over every strategy the PoolManager's own \`strategyList\` enumerates, minus the two LoanManagers. These are on-chain yield deployments (near zero since Maple's 2026-04 DeFi unwind), not the custodied loan book — the figure is a plain contract read.`,
  contract: { name: "Maple pool strategies", address: "" },
  via: "Σ strategy.assetsUnderManagement() — eth_call at head, roster from PoolManager.strategyList",
});

// ── the escrow custody view (known-infrastructure detail pages) ──────────────
// The CCIP bridge escrows hold pool shares as CUSTODY, not as a position —
// migration 154 keeps their rows out of the indexed MVs by design, so no
// event replay stands behind these figures. Every claim on the custody card
// is a direct slot read (or one derivation over slot reads) from a single
// multicall block; the receipts say exactly that.

/** Shares sitting in the escrow contract — a direct balance slot read. */
export const custodySharesProv = (poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("pool.balanceOf(escrow)", atBlockNum ?? null),
  summary: `${poolSym} locked in this escrow contract${atBlockNum ? ` at block ${atBlockNum}` : ""} — the pool token's own \`balanceOf\` on the escrow address, a plain slot read at head. No event replay stands behind this figure by design: the index keeps escrow rows off the lender surfaces, so the slot read is the whole claim. The locked shares back bridged ${poolSym} balances on other networks.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "pool.balanceOf(escrow) — eth_call at head",
});

/** What the escrowed shares redeem for at the pool's exit price —
 *  the same integer derivation the lender card's current value uses. */
export const custodyValueProv = (assetSym: string, poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain-derived",
  source: { block: atBlockNum },
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run the pool's convertToExitAssets eth_call on the escrow's ${poolSym} balance${atBlockNum ? ` at block ${atBlockNum}` : ""} — it reproduces this figure`,
  },
  summary: `${assetSym} the locked shares redeem for at the pool's exit price — the pool's own \`convertToExitAssets\` on the escrow's exact share balance, in the pool's own integer math: shares × (totalAssets − unrealizedLosses) ÷ totalSupply, every leg read at the same head block. The claim on this value lives with the bridged holders on other networks; the escrow only custodies it. ${CUSTODY_NOTE}`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "shares × convertToExitAssets (eth_call at head)",
  formula: "shares × (totalAssets − unrealizedLosses) ÷ totalSupply",
  inputs: [
    { label: "shares", kind: "chain", pclass: "state", note: "pool.balanceOf(escrow) — slot read at head" },
    { label: "totalAssets", kind: "chain", pclass: "state", note: "pool totalAssets at head" },
    { label: "unrealizedLosses", kind: "chain", pclass: "state", note: "the delegate's live impairment mark" },
    { label: "totalSupply", kind: "chain", pclass: "state", note: "pool share supply at head" },
  ],
});

/** The escrow's fraction of the whole pool share supply. */
export const custodySupplyShareProv = (poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain-derived",
  source: { block: atBlockNum },
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run the pool's balanceOf(escrow) and totalSupply eth_calls${atBlockNum ? ` at block ${atBlockNum}` : ""} — one division reproduces this figure`,
  },
  summary: `The escrow's slice of all ${poolSym} in existence — its share balance divided by the pool token's \`totalSupply\`, two slot reads from the same head block, one division. This is the fraction of the whole pool whose shares sit on Ethereum backing bridged balances elsewhere.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "pool.balanceOf(escrow) ÷ pool.totalSupply — eth_calls at head",
  formula: "locked shares ÷ totalSupply",
  inputs: [
    { label: "locked shares", kind: "chain", pclass: "state", note: "pool.balanceOf(escrow) — slot read at head" },
    { label: "totalSupply", kind: "chain", pclass: "state", note: "pool share supply at head" },
  ],
});

/** The exit rate itself (the band's headline rate). */
export const poolExitRateProv = (assetSym: string, poolSym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  source: { block: atBlockNum },
  pclass: "state",
  verify: stateVerify("pool.convertToExitAssets(1e6)", atBlockNum ?? null),
  summary: `${assetSym} per ${poolSym} at EXIT${atBlockNum ? ` at block ${atBlockNum}` : ""} — the pool's own \`convertToExitAssets\` on one whole share: (totalAssets − unrealizedLosses) ÷ totalSupply. What a filled withdrawal actually pays. ${CUSTODY_NOTE}`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "pool.convertToExitAssets(1e6) — eth_call at head",
});
