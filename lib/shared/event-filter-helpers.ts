// ============================================================================
// EVENT FILTER HELPERS
// ============================================================================
//
// Event-filter helpers, kept name-compatible so the FilterDropdown wiring is
// symmetric across protocols. Each protocol adds its own action-key extraction
// in `getEventActionKey` and label map in `actionLabel`. New protocol → add an
// arm to both, plus optional demoted / default-hidden entries below.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isNoChangeAdjust } from "@/lib/liquity/trove-ops";
import {
  isLiquityEvent,
  isAaveV4Event,
  isAaveV3Event,
  isMapleEvent,
  isMoonwellEvent,
  isFluidEvent,
  isMorphoEvent,
  isMakerDAOEvent,
  isSparkEvent,
  isCompoundEvent,
  isDolomiteEvent,
  isLiquityV1Event,
  isCompoundV2Event,
  isPwnEvent,
} from "@/lib/shared/types/event-shape";

/** Get the canonical action key for an event (used for type-level filtering) */
export function getEventActionKey(e: BaseActivityEvent): string {
  if (isLiquityEvent(e)) {
    // Zero-delta adjusts (bot keep-alive touches) get their own bucket so a
    // reader can hide the spam without hiding real adjustments.
    if (isNoChangeAdjust(e.context.data)) return "adjustTrove_noChange";
    return e.context.data.operation ?? e.actionType ?? "unknown";
  }
  if (isAaveV4Event(e)) {
    // Distinguish "Supply & Enable Collateral" from plain "Supply" so users
    // can filter the merged variant on its own — the merge has very different
    // semantics (the supply enabled the asset as collateral, not just deposited).
    if (e.context.data.eventType === "supply" && e.context.data.alsoToggledCollateral) {
      return "supply_with_collateral";
    }
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isMorphoEvent(e)) {
    // Morpho's eventType is already a clean per-action bucket (supply_collateral,
    // borrow, repay, …), so it doubles as the filter key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isMakerDAOEvent(e)) {
    // Maker's actionType is only frob/grab — too coarse to filter on. The
    // composed actionLabel ("Open Vault", "Deposit & Generate", …) is the
    // meaningful bucket, so key by it (labels then map to themselves).
    if (e.context.data.eventType === "grab") return "grab";
    return e.actionLabel ?? e.actionType ?? "unknown";
  }
  if (isSparkEvent(e)) {
    // Spark's eventType is already a clean per-action bucket (supply, withdraw,
    // borrow, repay, liquidation), so it doubles as the filter key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isMapleEvent(e)) {
    // Maple's eventType is already a clean per-action bucket (deposit,
    // withdraw, the request lifecycle, transfer_in/out), so it doubles as the key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isMoonwellEvent(e)) {
    // Moonwell's eventType is already a clean per-action bucket (mint, redeem,
    // borrow, repay, liquidation, transfer_in/out), so it doubles as the key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isFluidEvent(e)) {
    // Fluid's eventType is already a clean per-action bucket (the operate
    // composites, liquidated/absorbed, mint/transfer), so it doubles as the key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isAaveV3Event(e)) {
    // Aave V3's eventType is already a clean per-action bucket (supply, withdraw,
    // borrow, repay, liquidation), so it doubles as the filter key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isCompoundEvent(e)) {
    // Comet's eventType is already a clean per-action bucket (supply, withdraw,
    // supply_collateral, withdraw_collateral, absorb_debt, absorb_collateral),
    // so it doubles as the filter key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isDolomiteEvent(e)) {
    // Dolomite's eventType is already a clean per-leg bucket (deposit,
    // withdraw, transfer_in/out, the trade legs, the liquidation legs), so it
    // doubles as the filter key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  if (isLiquityV1Event(e)) {
    // Liquity V1's eventType is already a clean per-action bucket (openTrove,
    // adjustTrove, closeTrove, liquidation, redemption), so it doubles as the key.
    return e.context.data.eventType ?? e.actionType ?? "unknown";
  }
  return e.actionType ?? "unknown";
}

/**
 * The asset symbols an event touched — the timeline's asset axis, beside the
 * action-type and date-range axes.
 *
 * A pooled lender's wallet page mixes every reserve the wallet ever used, and
 * on a deep one that is the axis a reader actually wants: the deepest SparkLend
 * wallet indexed spread 28,065 events over six reserves on 2026-08-28, 14,525
 * of them USDT. Hiding event types cannot narrow that to one asset's story, and
 * neither can a date range.
 *
 * Returns DISPLAY SYMBOLS, deduplicated, in first-seen order — the symbol is
 * what the option row reads and what a reader filters by. An event can touch
 * two, and both reach the axis: a liquidation covers debt in one asset and
 * seizes another, a Dolomite trade spends one market and receives another, a
 * PWN loan locks collateral against credit. The axis is OR within the
 * dimension, so such an event survives while EITHER of its symbols is shown.
 *
 * An unresolved symbol arrives here as the composer's own "?" and is kept as a
 * bucket rather than dropped. Dropping it would leave those events unfilterable
 * while the option counts quietly stopped summing to the total; keeping it
 * matches what the card itself renders for the same event.
 *
 * An EMPTY list means this roster has no asset axis to offer, and the event is
 * never hidden by one. A Trove, an xPOSITION, a Frankencoin position, a Fluid
 * vault and a Morpho market are each ONE asset pair fixed for the position's
 * whole life — there the axis would only restate the type filter (on Morpho,
 * collateral vs loan is already the difference between Add Collateral and
 * Borrow). The toolbar also hides the control below two options, so a
 * single-reserve wallet on a multi-asset roster never grows one either.
 */
export function getEventAssetKeys(e: BaseActivityEvent): string[] {
  const found: (string | undefined)[] = [];
  if (isAaveV3Event(e)) {
    // A swap is a leg of both reserves it moved. A withdraw and swap moved one:
    // the token it bought left the position.
    const swap = e.context.data.swap;
    found.push(
      e.context.data.reserveSymbol,
      e.context.data.collateralSymbol,
      swap?.receivedAction === "trade" ? undefined : swap?.receivedSymbol,
    );
  } else if (isSparkEvent(e)) {
    found.push(e.context.data.reserveSymbol, e.context.data.collateralSymbol);
  } else if (isAaveV4Event(e)) {
    found.push(e.context.data.reserveSymbol, e.context.data.collateralSymbol);
  } else if (isMoonwellEvent(e)) {
    found.push(e.context.data.marketSymbol, e.context.data.collateralSymbol);
  } else if (isCompoundV2Event(e)) {
    found.push(e.context.data.marketSymbol, e.context.data.collateralSymbol);
  } else if (isCompoundEvent(e)) {
    // Comet: the moved token, plus every collateral an absorb seized — one
    // absorb can take several, and each is a real leg of this event.
    found.push(e.context.data.assetSymbol);
    for (const c of e.context.data.absorbedCollateral ?? []) found.push(c.symbol);
  } else if (isDolomiteEvent(e)) {
    // Markets are keyed numerically because Dolomite's symbols collide; the
    // reader still filters by the symbol, which is what the card shows.
    found.push(e.context.data.marketSymbol, e.context.data.otherMarketSymbol);
  } else if (isMapleEvent(e)) {
    // The funds asset (USDC / USDT), not the pool share token — a wallet in
    // both syrup pools reads as two assets, which is the distinction it wants.
    found.push(e.context.data.assetSymbol);
  } else if (isPwnEvent(e)) {
    found.push(e.context.data.collateralSymbol, e.context.data.creditSymbol);
  }
  const keys: string[] = [];
  for (const sym of found) if (sym && !keys.includes(sym)) keys.push(sym);
  return keys;
}

/**
 * The counterparty address(es) an event moved value with — the timeline's
 * address axis, beside the action-type, asset, and date-range axes.
 *
 * Unlike the asset axis this has one real use today: a wallet's mToken sends
 * scattered across dozens of recipients (a Moonwell exploiter spraying seized
 * funds), where the reader wants to narrow to one recipient's story. Only
 * rosters that carry a counterparty on the event itself contribute a key; a
 * position-lifecycle event (supply, borrow, repay) has no counterparty and
 * returns an empty list, so it is never hidden by this axis.
 *
 * Returns lowercased addresses, deduplicated. The toolbar hides the control
 * below two options, so a wallet with a single counterparty never grows one.
 */
export function getEventCounterpartyKeys(e: BaseActivityEvent): string[] {
  const found: (string | undefined)[] = [];
  if (isMoonwellEvent(e)) {
    found.push(e.context.data.counterparty);
  }
  const keys: string[] = [];
  for (const addr of found) if (addr && !keys.includes(addr)) keys.push(addr);
  return keys;
}

// ─────────────────────────── settled verb rule ───────────────────────────
// One vocabulary across every table below, so the filter menu reads as one
// system instead of per-protocol dialects:
//   OWNER actions   — imperative, matching the protocol's own contract term
//                      (Open / Adjust / Close / Supply / Withdraw / Borrow /
//                      Repay / Deposit / Mint — "Supply" for pooled lenders
//                      that use it, "Deposit" where the contract says deposit).
//   INVOLUNTARY events (a third party or the protocol acted, not the owner)
//                   — past participles, drawn from a fixed set: "Liquidated",
//                      "Redeemed", "Seized", "Absorbed", "Transferred" (for
//                      ownership/NFT transfers). This is a site-wide rule and
//                      wins over an older per-protocol spelling (e.g. Liquity
//                      V2's redemption used to read "Redemption").
//   Position moves  — stay "Transfer in" / "Transfer out" everywhere.
const LIQUITY_OP_LABELS: Record<string, string> = {
  openTrove: "Open",
  openTroveAndJoinBatch: "Open",
  closeTrove: "Close",
  liquidate: "Liquidated",
  adjustTrove: "Adjust",
  adjustTrove_noChange: "No change",
  adjustTroveInterestRate: "Interest rate",
  applyPendingDebt: "Apply debt",
  redeemCollateral: "Redeemed",
  adjustZombieTrove: "Redeemed",
  adjustUnredeemableZombieTrove: "Redeemed",
  setInterestBatchManager: "Delegate",
  removeFromBatch: "Leave delegate",
  transferTrove: "Transfer",
  // Delegate-set rate. Shares the "Interest rate" label with the owner's own
  // adjustTroveInterestRate — the filter row carries a people glyph (suffix) to
  // mark it as the delegate's action. "Batch" is the contract term users read
  // as delegation; the UI never surfaces it.
  setBatchManagerAnnualInterestRate: "Interest rate",
};

const AAVE_V4_OP_LABELS: Record<string, string> = {
  supply: "Supply",
  supply_with_collateral: "Supply + collateral",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidated",
  collateral_toggle: "Collateral toggle",
  // Inbound from BaseActivityEvent.actionType when isAaveV4Event guard misses
  // (e.g. legacy events) — the EventCard composer maps collateral_toggle to
  // actionType "collateral", so it can show up as the key in some contexts.
  collateral: "Collateral toggle",
};

const MORPHO_OP_LABELS: Record<string, string> = {
  supply_collateral: "Add Collateral",
  withdraw_collateral: "Withdraw Collateral",
  borrow: "Borrow",
  repay: "Repay",
  supply: "Supply",
  withdraw: "Withdraw",
  liquidation: "Liquidated",
};

// Maker keys ARE already labels (see getEventActionKey), so they map to
// themselves via the identity fallback; only the grab → "Liquidation" rename
// needs an entry.
const MAKERDAO_OP_LABELS: Record<string, string> = {
  grab: "Liquidated",
};

const SPARK_OP_LABELS: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidated",
};

// Moonwell (Compound v2 fork) — mint/redeem are the supply side (deposit
// underlying ↔ mTokens), borrow/repay the debt side; transfer_in/out are
// wallet↔wallet mToken moves (a position can arrive by transfer).
const MOONWELL_OP_LABELS: Record<string, string> = {
  mint: "Supply",
  redeem: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidated",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

// Compound V2 — the same fork family as Moonwell (mint/redeem/borrow/repay/
// liquidation/transfer_in/out share the same meaning), plus the three NAMED
// seize legs (a seizure is collateral being taken, never a transfer the
// borrower made). Kept as its own table (protocol-scoped lookup) rather than
// relying on the Moonwell fallback, so every key this roster emits resolves
// from ITS OWN registration.
const COMPOUND_V2_OP_LABELS: Record<string, string> = {
  mint: "Supply",
  redeem: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidated",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  seize_out: "Collateral seized",
  seize_in: "Seized collateral received",
  seize_burn: "Protocol seize share",
};

// Dolomite (Solo fork) — one row per BalanceUpdate leg. deposit/withdraw move
// the outside world; transfers move balances between account numbers; the
// trade legs are one swap's two sides; the liquidation legs are named for
// which account lost or gained what (a seizure is not something the borrower
// did).
const DOLOMITE_OP_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  trade_taker: "Trade (spent)",
  trade_maker: "Trade (received)",
  liquidation: "Liquidated",
  seize_out: "Collateral seized",
  seize_in: "Seized collateral received",
  liquidation_payout: "Liquidation payout",
  vaporize: "Vaporized",
  call: "Protocol call",
};

// Maple (syrup pools, the lender side) — deposit/withdraw are the ERC-4626
// actions; the request lifecycle is the FIFO withdrawal queue (escrow →
// fill/cancel); transfer_in/out are wallet↔wallet share moves.
const MAPLE_OP_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  request: "Withdrawal requested",
  request_decrease: "Request reduced",
  request_cancel: "Request cancelled",
  request_fill: "Withdrawal filled",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

// Fluid — ONE composite operate event moves either or both legs; the
// attribution rows (liquidated/absorbed) are computed per-position impacts of
// Fluid's id-less tick liquidations; mint/transfer are position-NFT moves.
const FLUID_OP_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  borrow: "Borrow",
  payback: "Repay",
  deposit_borrow: "Deposit + Borrow",
  withdraw_payback: "Withdraw + Repay",
  deposit_payback: "Deposit + Repay",
  withdraw_borrow: "Withdraw + Borrow",
  liquidated: "Liquidated",
  absorbed: "Absorbed",
  mint: "Position minted",
  transfer: "Transferred",
};

const AAVE_V3_OP_LABELS: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidated",
  swap: "Swap",
  bad_debt_written_off: "Written off",
};

const COMPOUND_OP_LABELS: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  supply_collateral: "Add Collateral",
  withdraw_collateral: "Withdraw Collateral",
  absorb_debt: "Liquidated (debt)",
  absorb_collateral: "Liquidated (collateral)",
  // Account-to-account position moves (Comet's base/collateral transfer legs)
  // — a true transfer, not a supply/withdraw the owner made against the pool.
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  transfer_collateral_in: "Collateral in",
  transfer_collateral_out: "Collateral out",
};

// PWN is a P2P fixed-term loan — a discrete lifecycle, not pool balance changes.
// `minted`/`burned` are the LOAN-token NFT (issued to the lender at creation,
// retired on close); `claimed` is the lender collecting (repayment, or seized
// collateral on default).
const PWN_OP_LABELS: Record<string, string> = {
  created: "Created",
  minted: "Minted",
  paid_back: "Repaid",
  claimed: "Claimed",
  extended: "Extended",
  burned: "Burned",
};

// Liquity V1 (LUSD) — the Trove lifecycle. openTrove/adjustTrove/closeTrove are the
// owner's actions; liquidation and redemption are involuntary (a third party).
const LIQUITY_V1_OP_LABELS: Record<string, string> = {
  openTrove: "Open",
  adjustTrove: "Adjust",
  closeTrove: "Close",
  liquidation: "Liquidated",
  redemption: "Redeemed",
};

// Liquity V2 forks (Ebisu, Asymmetry, basedollar) — the same Trove lifecycle
// vocabulary. open/adjust/close (and the batch variants) are the owner's
// actions; liquidate and redeemCollateral are involuntary. One shared table
// (was two duplicated EBISU_OP_LABELS / ASYMMETRY_OP_LABELS registries, both
// dead under the old global first-match chain — LIQUITY_OP_LABELS always won
// first).
const LIQUITY_FORK_OP_LABELS: Record<string, string> = {
  openTrove: "Open",
  closeTrove: "Close",
  adjustTrove: "Adjust",
  adjustTrove_noChange: "No change",
  adjustTroveInterestRate: "Adjust Rate",
  applyPendingDebt: "Apply Pending Debt",
  liquidate: "Liquidated",
  redeemCollateral: "Redeemed",
  openTroveAndJoinBatch: "Open + Join Batch",
  setInterestBatchManager: "Set Batch Manager",
  removeFromBatch: "Leave Batch",
};

// f(x) Protocol V2 — the xPOSITION lifecycle. Operate rows classify by their
// deltas (open / adjust / close); liquidations are involuntary.
const FX_OP_LABELS: Record<string, string> = {
  openPosition: "Open",
  adjustPosition: "Adjust",
  closePosition: "Close",
  liquidatePosition: "Liquidated",
  // The ownership lane (pool ERC721 Transfer logs): standalone mints anchor
  // the eventless positions; transfers re-home a position mid-life.
  mintPosition: "Minted",
  transferOwnership: "Transferred",
  // The socialized lane (derived): a tick-level rebalance the lineage replay
  // attributed to this position.
  tickRebalance: "Rebalanced",
};

// Frankencoin — the Position lifecycle (see getEventActionKey's fallback:
// `actionType` carries the classified FrankencoinEventType verbatim, so
// these keys ARE the type's own values). open/clone/mint/repay/
// add_collateral/withdraw_collateral/adjust_price/adjust/close are the
// owner's actions; auction_settlement/challenge_*/forced_sale/denied are the
// protocol or a third party (the challenge auction, governance); a MintingHub
// challenge is never something the position owner did.
const FRANKENCOIN_OP_LABELS: Record<string, string> = {
  open: "Open",
  clone: "Clone",
  mint: "Mint",
  repay: "Repay",
  add_collateral: "Add Collateral",
  withdraw_collateral: "Withdraw Collateral",
  adjust_price: "Adjust Price",
  adjust: "Adjust",
  close: "Close",
  auction_settlement: "Auction Settlement",
  denied: "Denied",
  challenge_started: "Challenge Started",
  challenge_averted: "Challenge Averted",
  challenge_succeeded: "Challenge Succeeded",
  forced_sale: "Forced Sale",
  ownership_transferred: "Transferred",
};

// LlamaLend (Curve) — the Controller lifecycle. borrow/add_collateral/repay/
// remove_collateral are the owner's actions; liquidation is involuntary (the
// `role`/`selfLiquidation` distinction that separates a self-close from a
// third-party liquidation lives in the event's own actionLabel, not the
// filter key).
const LLAMALEND_OP_LABELS: Record<string, string> = {
  borrow: "Borrow",
  add_collateral: "Add Collateral",
  repay: "Repay",
  remove_collateral: "Remove Collateral",
  liquidation: "Liquidated",
};

// Polaris (Sepolia) — the CDP lifecycle, keyed on the classified
// PolarisEventType. open/adjust/close are the holder's touches (`_operation`
// 0/1/2); liquidate is a third party's (op 3); transfer is the CDP NFT
// changing hands — custody, never an open or a close.
const POLARIS_OP_LABELS: Record<string, string> = {
  open: "Open",
  adjust: "Adjust",
  close: "Close",
  liquidate: "Liquidation",
  transfer: "Transfer",
};

/** Aave's vault layer — a holder's own events inside one ERC-4626 vault. The
 *  keys are `VaultHolderEvent["kind"]` (lib/shared/vault-holder-timeline.ts)
 *  and the labels are the words the ROWS use, so the filter menu and the cards
 *  it filters read as one surface. Registered here rather than left to the
 *  global fall-through chain: "deposit" resolves to another roster's table
 *  there, and "transfer-in", "transfer-self" and "cooldown" resolve to nothing
 *  at all and would have shown a reader their own raw keys. */
const AAVE_VAULT_OP_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  "transfer-in": "Received",
  "transfer-out": "Sent",
  "transfer-self": "No change",
  cooldown: "Cooldown started",
};

/**
 * Per-protocol label registry, keyed by the `protocolKey` strings the
 * timeline hooks/pages already pass around (useTimelineEvents,
 * DEMOTED_ACTIONS, DEFAULT_HIDDEN_ACTIONS). `actionLabel` looks a key up in
 * its OWN protocol's table first, so an action key that means one thing on
 * one roster (e.g. Fluid's "mint" — a position NFT) never resolves to a
 * different roster's meaning for the same key (Moonwell's "mint" — a supply).
 */
const PROTOCOL_OP_LABELS: Record<string, Record<string, string>> = {
  "liquity-v2-troves": LIQUITY_OP_LABELS,
  "aave-v4": AAVE_V4_OP_LABELS,
  "aave-v3": AAVE_V3_OP_LABELS,
  morpho: MORPHO_OP_LABELS,
  "makerdao-vaults": MAKERDAO_OP_LABELS,
  spark: SPARK_OP_LABELS,
  maple: MAPLE_OP_LABELS,
  moonwell: MOONWELL_OP_LABELS,
  compound: COMPOUND_OP_LABELS,
  "compound-v2": COMPOUND_V2_OP_LABELS,
  dolomite: DOLOMITE_OP_LABELS,
  llamalend: LLAMALEND_OP_LABELS,
  pwn: PWN_OP_LABELS,
  "liquity-v1": LIQUITY_V1_OP_LABELS,
  ebisu: LIQUITY_FORK_OP_LABELS,
  asymmetry: LIQUITY_FORK_OP_LABELS,
  basedollar: LIQUITY_FORK_OP_LABELS,
  fx: FX_OP_LABELS,
  fluid: FLUID_OP_LABELS,
  frankencoin: FRANKENCOIN_OP_LABELS,
  polaris: POLARIS_OP_LABELS,
  "aave-vaults": AAVE_VAULT_OP_LABELS,
};

/**
 * Resolve an action key to its filter-menu label. With `protocolKey`, the
 * protocol's own table is tried first (correct even when a key collides
 * across rosters with a different meaning), falling back to the legacy
 * global first-match chain and then the raw key. Without `protocolKey`,
 * behavior is unchanged from before this registry existed.
 */
export function actionLabel(actionKey: string, protocolKey?: string): string {
  const own = protocolKey ? PROTOCOL_OP_LABELS[protocolKey]?.[actionKey] : undefined;
  return (
    own ??
    LIQUITY_OP_LABELS[actionKey] ??
    AAVE_V4_OP_LABELS[actionKey] ??
    MORPHO_OP_LABELS[actionKey] ??
    MAKERDAO_OP_LABELS[actionKey] ??
    SPARK_OP_LABELS[actionKey] ??
    MAPLE_OP_LABELS[actionKey] ??
    MOONWELL_OP_LABELS[actionKey] ??
    COMPOUND_V2_OP_LABELS[actionKey] ??
    DOLOMITE_OP_LABELS[actionKey] ??
    FLUID_OP_LABELS[actionKey] ??
    AAVE_V3_OP_LABELS[actionKey] ??
    COMPOUND_OP_LABELS[actionKey] ??
    PWN_OP_LABELS[actionKey] ??
    LIQUITY_V1_OP_LABELS[actionKey] ??
    LIQUITY_FORK_OP_LABELS[actionKey] ??
    FX_OP_LABELS[actionKey] ??
    FRANKENCOIN_OP_LABELS[actionKey] ??
    LLAMALEND_OP_LABELS[actionKey] ??
    actionKey
  );
}

/** Actions that are demoted (shown last in the filter list, often noisy). */
export const DEMOTED_ACTIONS: Record<string, string[]> = {
  "liquity-v2-troves": ["setBatchManagerAnnualInterestRate", "applyPendingDebt", "adjustTrove_noChange"],
  // Standalone collateral toggles (not merged into a supply) are rare and
  // mostly noise — surface but demoted. The merged "supply + collateral"
  // variant stays prominent because it represents a real state change.
  "aave-v4": ["collateral_toggle", "collateral"],
  "aave-v3": [],
  morpho: [],
  "makerdao-vaults": [],
  spark: [],
  // Share transfers are real position moves but secondary to the lender
  // lifecycle — surface, demoted below the primary actions.
  maple: ["transfer_in", "transfer_out"],
  // mToken transfers are real position moves but secondary to the lending
  // lifecycle — surface, demoted below the primary actions.
  moonwell: ["transfer_in", "transfer_out"],
  compound: [],
  // cToken transfers are real position moves but secondary to the lending
  // lifecycle. The seize legs are NOT demoted — they carry the balance
  // movement of a liquidation, the roster's deepest record.
  "compound-v2": ["transfer_in", "transfer_out"],
  // Account-to-account transfers are real position moves but secondary to the
  // lending lifecycle; LogCall rows move no balance at all. The liquidation
  // legs are NOT demoted — they carry the balance movement of a liquidation.
  dolomite: ["transfer_in", "transfer_out", "call"],
  // Every LlamaLend action is a primary position move; the liquidation row is
  // NOT demoted — it carries the market's hard-liquidation record.
  llamalend: [],
  pwn: [],
  "liquity-v1": [],
  ebisu: ["applyPendingDebt", "adjustTrove_noChange"],
  asymmetry: ["applyPendingDebt", "adjustTrove_noChange"],
  basedollar: ["applyPendingDebt", "adjustTrove_noChange"],
  fx: [],
  // NFT mints ride the same tx as the opening operate; ownership transfers are
  // real but secondary to the lending lifecycle.
  fluid: ["mint", "transfer"],
  // A declared-price move is frequent (owners re-peg often) and secondary to
  // the mint/repay/collateral lifecycle — surface, demoted below the primary
  // actions.
  frankencoin: ["adjust_price"],
  // Every Polaris row is a primary position event; a custody transfer is rare
  // enough (682 CDPs, a handful of transfers) to stay in the main order.
  polaris: [],
};

/**
 * Actions hidden by default when entering a protocol (user can un-hide via filter).
 *
 * Liquity is intentionally empty: a delegated trove's *current* rate is driven by
 * the batch manager's setBatchManagerAnnualInterestRate events, so hiding them left
 * the default timeline ending on the (now-stale) rate from the Delegate event while
 * every actual rate move was hidden — the headline rate then looked unexplained.
 * Showing them by default lets the timeline narrate the rate climb that produced the
 * headline. They stay DEMOTED (filter menu, below) so the filter row order still
 * reads owner-first; non-batched troves emit none, so nothing changes for them.
 */
export const DEFAULT_HIDDEN_ACTIONS: Record<string, string[]> = {
  "liquity-v2-troves": [],
  "aave-v4": [],
  "aave-v3": [],
  morpho: [],
  "makerdao-vaults": [],
  spark: [],
  maple: [],
  moonwell: [],
  compound: [],
  "compound-v2": [],
  dolomite: [],
  llamalend: [],
  pwn: [],
  "liquity-v1": [],
  ebisu: [],
  asymmetry: [],
  basedollar: [],
  fx: [],
  fluid: [],
  frankencoin: [],
  polaris: [],
};
