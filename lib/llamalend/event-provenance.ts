// LlamaLend (Curve, Ethereum) provenance vocabulary — the timeline lanes.
// ----------------------------------------------------------------------------
// Each Controller is an isolated market, and every action event carries the
// event's own emitted deltas PLUS a same-tx UserState after-image of the
// emitted ABSOLUTES (collateral, debt, n1, n2). Two lanes, and the grading is
// the point:
//
//   • deltas (collateral_increase / loan_increase and their decrease twins) —
//     `emitted`: fields in the log itself, decoded and never recomputed.
//   • the after-image — `state`, NOT emitted-graded despite riding in a log:
//     UserState emits the position's absolute after-state, so the replay is
//     last-write-wins over emitted absolutes (a LAG, never a running sum) —
//     re-running `user_state(user)` at the block reproduces it.
//
// ⚠️ What NO event carries: the converted/soft-liquidation amount
// (`user_state.stablecoin`). The UserState event stops at (collateral, debt,
// n1, n2, discount) — which is exactly why the prototype SYNTHESISED soft-liq
// and why this explorer reads it from state instead (live-provenance.ts).
//
// The `contract` on every lane is the position's own Controller — the
// isolated-market key.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only.
const LLAMALEND_VIA = "captured Controller events (llamalend_*)";

export interface LlamalendCoords {
  txHash?: string;
  blockNumber?: number;
  /** The isolated market's key. */
  controller?: string;
  user?: string;
}

const atBlock = (coords?: LlamalendCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

const controllerOf = (coords?: LlamalendCoords) => ({
  name: "LlamaLend Controller",
  address: coords?.controller ?? "",
});

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: LlamalendCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

function eventInputs(coords: LlamalendCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.user) inputs.push({ label: "user", value: coords.user, kind: "chain", note: "position owner" });
  if (coords?.controller)
    inputs.push({
      label: "controller",
      value: coords.controller,
      kind: "chain",
      note: "the isolated market's key",
    });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash) inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return inputs;
}

/** The emitting log behind each event type's deltas. */
const EVENT_ORIGIN: Record<string, string> = {
  borrow: "Borrow",
  add_collateral: "Borrow (loan_increase = 0)",
  repay: "Repay",
  remove_collateral: "RemoveCollateral",
  liquidation: "Liquidate",
};

// ── the emitted-delta lanes ──────────────────────────────────────────────────

/** Collateral this event moved — the log's own collateral field. */
export const collateralDeltaProv = (
  sym: string,
  eventType: string,
  coords: LlamalendCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} collateral this event moved — the ${EVENT_ORIGIN[eventType] ?? "action"} log's own collateral field, exactly as the Controller emitted it${atBlock(coords)}, scaled by the token's own decimals() answer (never a defaulted 18 — this roster carries 8- and 6-decimal collaterals). Decoded from the log, never recomputed.`,
  contract: controllerOf(coords),
  via: `${LLAMALEND_VIA} · ${EVENT_ORIGIN[eventType] ?? "action"} log · ${fieldSeg("collateral amount", raw)}`,
  inputs: eventInputs(coords),
});

/** Debt this event moved — the log's own loan field, in the BORROWED token. */
export const debtDeltaProv = (
  sym: string,
  eventType: string,
  coords: LlamalendCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} debt this event moved — the ${EVENT_ORIGIN[eventType] ?? "action"} log's own loan field, exactly as the Controller emitted it${atBlock(coords)}, in the market's BORROWED token. Decoded from the log, never recomputed.`,
  contract: controllerOf(coords),
  via: `${LLAMALEND_VIA} · ${EVENT_ORIGIN[eventType] ?? "action"} log · ${fieldSeg("loan amount", raw)}`,
  inputs: eventInputs(coords),
});

// ── the after-image lanes ────────────────────────────────────────────────────

/** Collateral / debt AFTER this event — the same-tx UserState ABSOLUTE, which
 *  the state read reproduces. Graded `state`, not emitted. */
export const afterImageProv = (
  sym: string,
  which: "collateral" | "debt",
  coords: LlamalendCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the Controller's user_state eth_call at block ${coords.blockNumber} against an archive node — the UserState event emits the position's absolute after-state, so the read reproduces this figure exactly. The replay is a LAG over these absolutes, never a running sum: there is nothing to drift.`
        : "Re-run the Controller's user_state eth_call — the UserState event emits the position's absolute after-state, so the read reproduces this figure exactly.",
  },
  summary: `${sym} ${which} this position held AFTER this event — the same-tx UserState after-image, the Controller's own emitted ABSOLUTE${atBlock(coords)}. The position replay is last-write-wins over these absolutes (a lag, not a running sum). ⚠️ What this event does NOT carry: the converted/soft-liquidation amount — that is a state-only figure (user_state.stablecoin), read live on the position page.`,
  contract: controllerOf(coords),
  via: `${LLAMALEND_VIA} · UserState after-image · ${fieldSeg(which, raw)} (= the user_state read at this block)`,
  inputs: eventInputs(coords),
});

/** The band tick pair (n1, n2) after this event — SIGNED, from the UserState
 *  after-image. */
export const tickPairProv = (coords: LlamalendCoords, n1?: string, n2?: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the AMM's read_user_tick_numbers eth_call at this block — the emitted pair equals the stored one. n1/n2 are SIGNED int256 (negative bands are valid and occur live).",
  },
  summary: `The band ticks (n1, n2) this position occupied after this event — the UserState after-image's own SIGNED pair${atBlock(coords)}. The ticks place the position's collateral across the AMM's price grid: p_oracle_up(n1) is the soft-liquidation onset, p_oracle_down(n2) full conversion. ⚠️ On a CLOSED position the stored ticks go STALE (user_state reads [0,0,0,N]) — they are rendered only alongside a live loan.`,
  contract: controllerOf(coords),
  via: `${LLAMALEND_VIA} · UserState after-image · n1: ${n1 ?? "—"}, n2: ${n2 ?? "—"}`,
  inputs: eventInputs(coords),
});

// ── hard-liquidation lanes ───────────────────────────────────────────────────

/** A Liquidate row, by LEG: the borrower's side (debt written off / balances
 *  taken), the LIQUIDATOR's side (the subject's own act on someone else's
 *  position), or a SELF-liquidation (the user's own close). */
export const liquidationProv = (
  what: "debt" | "collateral",
  sym: string,
  role: "borrower" | "liquidator" | "self",
  coords: LlamalendCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary:
    role === "self"
      ? `${sym} ${what === "debt" ? "debt cleared" : "collateral withdrawn"} in a SELF-liquidation — the Liquidate log's own field${atBlock(coords)}. The log's indexed liquidator equals the borrower: closing a position from soft-liquidation via self_liquidate is a normal exit here (the AMM has already converted part of the collateral; the user settles and takes the rest back), not a loss to a third party. ⚠️ The Controller also emits a paired Repay with identical amounts inside _liquidate — the index claims that pair by leg, so this row is the ONE record of the event.`
      : role === "liquidator"
        ? `${sym} ${what === "debt" ? "this subject put toward a borrower's debt" : "this subject received"} acting as the LIQUIDATOR of someone else's position — the Liquidate log's own field${atBlock(coords)}. The log's indexed [1] is this subject; [2] names the borrower whose position moved. This row narrates the act, not this subject's own position in the market.`
        : `${sym} ${what === "debt" ? "debt written off" : "collateral taken"} in a hard liquidation — the Liquidate log's own field${atBlock(coords)}. ⚠️ The log's indexed [1] is the LIQUIDATOR, [2] this borrower — a seizure is not something the borrower did, and this row renders it as ${what === "debt" ? "debt being cleared" : "a taking"}, never an act the borrower performed. Hard liquidation arms only when health goes negative — every hard liquidation here carries its soft-liquidation history in state (the AMM had already converted part of the collateral). ⚠️ The paired Repay the Controller emits inside _liquidate is claimed by this row in the index — the debt clears ONCE.`,
  contract: controllerOf(coords),
  via: `${LLAMALEND_VIA} · Liquidate log · ${role} leg · ${fieldSeg(what === "debt" ? "debt" : "collateral_received", raw)}`,
  inputs: eventInputs(coords),
});

// ── position card / tower lanes ──────────────────────────────────────────────

/** Position-card CURRENT figure from the live user_state read at head. */
export const positionStateProv = (sym: string, which: "collateral" | "debt", controller?: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the Controller's user_state eth_call against any node — the leg reproduces this figure exactly.",
  },
  summary: `${sym} ${which} NOW — the ${which === "collateral" ? "collateral" : "debt"} leg of the Controller's own user_state(user) at the latest block. Debt accrues per second through the market's rate, so no stored figure is current — this is the live read, not a replayed sum.`,
  contract: { name: "LlamaLend Controller", address: controller ?? "" },
  via: "GET /api/chain/llamalend/position · user_state @ head",
});

/** Position-card figure from the LAST emitted UserState absolute (the index
 *  basis, before the live read lands / when RPC is down). */
export const positionIndexProv = (sym: string, which: "collateral" | "debt", controller?: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the Controller's user_state eth_call at the position's last event block — the emitted absolute equals the read there. The figure at HEAD differs by accrued interest (and any soft-liq conversion since); the live lane replaces this one when its read lands.",
  },
  summary: `${sym} ${which} at the position's LAST event — the Controller's own emitted UserState absolute, the latest the captured history carries. Interest accrued since (and any soft-liquidation conversion) is NOT in this figure; the live user_state read replaces it on the page when it lands.`,
  contract: { name: "LlamaLend Controller", address: controller ?? "" },
  via: `${LLAMALEND_VIA} · latest UserState after-image at this position grain`,
});

/** USD figure on a crvUSD-borrowed market — the AMM's own oracle (~$1 unit). */
export const llamalendUsdProv = (what: string, borrowedSymbol: string, amm?: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what} in USD — valued through the market's own AMM oracle (price_oracle: collateral priced in the market's borrowed token, 1e18). The borrowed token here IS crvUSD, a $-pegged stable, so the crvUSD figure is presented as USD — unit: crvUSD (~$1), the protocol's own denomination, not an off-chain feed. ⚠️ Markets that borrow anything other than crvUSD never get this treatment: they present in their own borrowed token.`,
  contract: { name: "LLAMMA AMM", address: amm ?? "" },
  via: "amount × AMM.price_oracle (eth_call at head) · unit: crvUSD (~$1)",
  formula: "amount × oracle price",
  inputs: [
    { label: "amount", kind: "chain", pclass: "state", note: "user_state leg" },
    { label: "oracle price", kind: "chain", pclass: "oracle", note: `price_oracle — ${borrowedSymbol} per collateral` },
  ],
});

/** A lifetime gross flow (Σ borrowed / repaid / added / withdrawn /
 *  liquidated on this position) — sums of the events' own emitted deltas. */
export const llamalendLifetimeFlowProv = (
  flow: "collateral added" | "collateral withdrawn" | "borrowed" | "repaid" | "liquidated debt" | "collateral taken",
  sym: string,
  controller?: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: `Lifetime ${flow} (${sym}) — the sum of the emitted amounts of this position's own captured Controller events, complete from the market's deploy block. ⚠️ The Liquidate-paired Repay is deduped in the index (the Controller emits both with identical amounts inside _liquidate), so nothing here double-counts. Soft-liquidation conversion is NOT a flow — the AMM converts in place, emitting no per-user event; the converted amount is the state read on the card above.`,
  contract: { name: "LlamaLend Controller", address: controller ?? "" },
  via: `${LLAMALEND_VIA} · Σ emitted amounts across the position's own events · deploy → head`,
});

// ── liquidation forensics — the valued two-leg seizure ───────────────────────
//
// A hard liquidation takes BOTH legs of the position's AMM holding: the
// collateral still unconverted, and the borrowed token soft-liquidation had
// already converted (stablecoin_received — never the debt). The forensics
// card values the pair in the market's own borrowed token at the AMM's own
// oracle price AT the event's block, against the debt the Liquidate log says
// was cleared.

/** The collateral's price at the liquidation block — AMM.price_oracle, an
 *  archive eth_call at that height (the oracle-at-block overlay walk). */
export const llamaAtBlockPriceProv = (
  collateralSymbol: string,
  borrowedSymbol: string,
  coords: LlamalendCoords,
  amm: string | undefined,
  priceRaw?: string,
): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text: `Re-run AMM.price_oracle() against any archive node at block ${coords.blockNumber ?? "?"} — the read reproduces this figure exactly.`,
  },
  summary: `${collateralSymbol} priced in ${borrowedSymbol}${atBlock(coords)} — the market's own LLAMMA oracle, read back at the liquidation's block. This is the price the protocol itself was judging the position with when the liquidation landed, never today's price.`,
  contract: { name: "LLAMMA AMM", address: amm ?? "" },
  via: `GET /api/chain/llamalend/liq-price · price_oracle eth_call at block${priceRaw ? ` · raw: ${priceRaw}` : ""} · ÷10^18`,
});

/** The seized side, valued: unconverted collateral at the at-block oracle
 *  price, plus the already-converted borrowed-token leg at face. */
export const llamaLiqSeizedValueProv = (
  collateralSymbol: string,
  borrowedSymbol: string,
  coords: LlamalendCoords,
  parts: { collateral: string; price?: string; converted: string },
): Provenance => ({
  kind: "chain-derived",
  summary: `Everything the liquidation took from the position's AMM holding, valued in ${borrowedSymbol}: the unconverted ${collateralSymbol} leg at the AMM's own oracle price at this block, plus the ${borrowedSymbol} soft-liquidation had already converted, at face. Both legs are the Liquidate log's own fields — collateral_received and stablecoin_received; the converted leg is a taking of ${borrowedSymbol} the position already held, never part of the debt.`,
  formula: "collateral × price + converted",
  inputs: [
    {
      label: "collateral",
      value: `${parts.collateral} ${collateralSymbol}`,
      kind: "chain",
      pclass: "emitted",
      note: "Liquidate log · collateral_received",
    },
    ...(parts.price != null
      ? [
          {
            label: "price",
            value: `${parts.price} ${borrowedSymbol}`,
            kind: "chain" as const,
            pclass: "oracle" as const,
            note: "AMM.price_oracle at this block",
          },
        ]
      : []),
    {
      label: "converted",
      value: `${parts.converted} ${borrowedSymbol}`,
      kind: "chain",
      pclass: "emitted",
      note: "Liquidate log · stablecoin_received",
    },
  ],
});

/** The cleared side — the debt the Liquidate log itself says was written off. */
export const llamaLiqClearedValueProv = (
  borrowedSymbol: string,
  role: "borrower" | "liquidator" | "self",
  coords: LlamalendCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${borrowedSymbol} debt this liquidation cleared — the Liquidate log's own debt field${atBlock(coords)}. ${role === "self" ? "The borrower settled it themselves closing out of soft-liquidation." : "The liquidator put this toward the borrower's debt to take the position's holding."} The paired Repay the Controller emits inside _liquidate is claimed by this row in the index — the debt clears once.`,
  contract: controllerOf(coords),
  via: `${LLAMALEND_VIA} · Liquidate log · ${fieldSeg("debt", raw)}`,
  inputs: eventInputs(coords),
});

/** seized ÷ cleared − 1 — derived from the two legs above, never read. */
export const llamaLiqPremiumProv = (
  borrowedSymbol: string,
  role: "borrower" | "liquidator" | "self",
  coords: LlamalendCoords,
  parts: { seized: string; cleared: string },
): Provenance => ({
  kind: "derived",
  summary:
    role === "self"
      ? `What the close returned over the debt it settled — the position's own holding (valued at the block) against the debt cleared. A self-liquidation is the owner settling and taking the remainder back, so this margin went to the owner, a recovery rather than a bonus.`
      : `The liquidator's realized edge — the seized holding (valued at the block's own oracle price) against the debt they cleared. ⚠️ LlamaLend has no fixed liquidation bonus: hard liquidation arms when health < 0 (a test that includes the market's liquidation_discount), and the realized gap depends on how deep health had fallen and how much soft-liquidation had already converted — so this figure varies per liquidation and answers to no single constant.`,
  formula: "seized ÷ cleared − 1",
  inputs: [
    { label: "seized", value: parts.seized, kind: "chain-derived" },
    { label: "cleared", value: parts.cleared, kind: "chain", pclass: "emitted" },
  ],
});
