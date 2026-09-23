// ⇒ THIS FILE IS THE ONE DECLARATION of every protocol's event context.
// lib/shared/types/protocols/*.ts are thin re-exports of what is declared here,
// kept so existing import paths stay live. They used to be hand-maintained
// SECOND COPIES that called themselves canonical while this file called itself
// the mirror — and the seam had already rotted (MakerDAO's copy was three union
// members stale; four modules had no importer; one mirror comment named a
// protocols/pwn.ts that never existed). Add a protocol's types here, and only
// here.
//
// ============================================================================
// EVENT SHAPE — frontend consumer copy.
// ============================================================================
//
// ⚠️ A SECOND COPY of this file lives in rails-server-onboarding at
// api/src/types/event-shape.ts, and the two are NOT the same file. Its header
// used to claim they were byte-for-byte in sync; they are not, and have not
// been for a long time. The backend copy declares only the shapes the backend
// itself emits — its protocol union is three arms (liquity-v2-troves, aave-v4,
// other) against this file's twenty — because every other protocol is shaped
// by a frontend transform in lib/sources/api/ and never crosses the backend's
// type at all. The prose comments diverged too. Do not "restore sync": the
// overlap is what must agree, which is the two backend-shaped protocols'
// contexts and the base event.
//
// The base event is also leaner here than on the wire in a second sense — see
// lib/shared/timeline-wire.ts, which strips four fields between the route and
// the fetch client. Fields removed from this copy but still emitted by the
// backend (a backend-shaped protocol's `protocol` string) arrive as undeclared
// extra properties, which is harmless.
//
// Why two copies and not a shared package: rails-server-onboarding and
// rails-web-onboarding are separate top-level git repos. A real workspace
// package would require either a monorepo consolidation or a published
// private npm dependency — both bigger commitments than this phase should
// make. Promote both to a shared workspace package when consolidation lands.

// ───────────────────────── Base primitives ─────────────────────────

/** A single token movement within a transaction. */
export interface AssetFlow {
  /** Contract address (lowercase). */
  token: string;
  /** Human-readable symbol. */
  tokenSymbol: string;
  tokenDecimals: number;
  /** Raw amount as string (bigint-safe). */
  amount: string;
  /** Human-readable decimal number. */
  amountFormatted: number;
  direction: "in" | "out";
  /** Protocol contract or counterparty wallet involved in this flow. */
  counterparty?: string;
  /** USD value at time of event, if known. */
  valueUsd?: number;
}

export interface GasCost {
  gasUsed?: number;
  gasCostEth: number;
  gasCostUsd: number;
}

/** Same-block operation grouping info. */
export interface BlockGrouping {
  /** True if multiple operations in same block. */
  isGrouped: boolean;
  /** Total operations in this block. */
  sameBlockCount: number;
  /** 1-based position within block. */
  sameBlockIndex: number;
}

// ───────────────────────── Liquity V2 detail types ─────────────────────────

export type LiquityOperationType =
  | "openTrove"
  | "closeTrove"
  | "adjustTrove"
  | "adjustTroveInterestRate"
  | "applyPendingDebt"
  | "liquidate"
  | "redeemCollateral"
  | "openTroveAndJoinBatch"
  | "setInterestBatchManager"
  | "removeFromBatch"
  | "transferTrove"
  | "setBatchManagerAnnualInterestRate"
  | "adjustZombieTrove"
  | "adjustUnredeemableZombieTrove";

export type LiquityEventType =
  | "trove"
  | "liquidation"
  | "redemption"
  | "transfer"
  | "batch_manager";

export type BatchOperationType =
  | "registerBatchManager"
  | "lowerBatchManagerAnnualFee"
  | "setBatchManagerAnnualInterestRate"
  | "applyBatchInterestAndFee"
  | "joinBatch"
  | "exitBatch"
  | "troveChange";

export type CollateralType = string;

/** The pipeline's untouched raw values (wei-scale integer strings as the log
 *  emitted them, before any backend rounding) — the provenance receipts show
 *  these beside the formatted floats. Absent until the index serializes them
 *  (and always absent on synthetic states/ops). */
export interface TroveStateRaw {
  debt?: string;
  coll?: string;
  annualInterestRate?: string;
}

export interface TroveOperationRaw {
  annualInterestRate?: string;
  debtIncreaseFromRedist?: string;
  debtIncreaseFromUpfrontFee?: string;
  debtChangeFromOperation?: string;
  collIncreaseFromRedist?: string;
  collChangeFromOperation?: string;
}

/** Origin envelope — the backend's own claim of what a value IS on chain:
 *  the log it decodes from, the ABI param, the untouched integer, and the
 *  divisor exponent (displayed = raw ÷ 10^scale). Stamped in rails-server
 *  beside the SQL column selections; the via lines render this instead of
 *  restating it per vocabulary. A field whose value is not one decoded param
 *  (a batched trove's share-derived debt) carries no envelope — absence
 *  means "derived", and the vocabulary keeps its own prose. */
export interface OriginEnvelope {
  event: string;
  param: string;
  raw?: string;
  scale: number;
}

export interface TroveStateOrigin {
  debt?: OriginEnvelope;
  coll?: OriginEnvelope;
  annualInterestRate?: OriginEnvelope;
}

export interface TroveOperationOrigin {
  annualInterestRate?: OriginEnvelope;
  debtIncreaseFromRedist?: OriginEnvelope;
  debtIncreaseFromUpfrontFee?: OriginEnvelope;
  debtChangeFromOperation?: OriginEnvelope;
  collIncreaseFromRedist?: OriginEnvelope;
  collChangeFromOperation?: OriginEnvelope;
}

export interface TroveState {
  debt: number;
  coll: number;
  stake: number;
  annualInterestRate: number;
  /** Backend-calculated: (coll × price) / debt × 100. */
  collateralRatio: number;
  /** Total collateral value in USD. */
  collateralInUsd: number;
  /** From BatchedTroveUpdated. */
  interestBatchManager?: string;
  /** From BatchedTroveUpdated, converted to number. */
  batchDebtShares?: number;
  /** Raw pipeline values behind debt/coll/rate. */
  raw?: TroveStateRaw;
  /** Per-field origin envelopes; a derived field (batched debt) has none. */
  origin?: TroveStateOrigin;
}

export interface TroveOperationData {
  annualInterestRate: number;
  debtIncreaseFromRedist: number;
  debtIncreaseFromUpfrontFee: number;
  debtChangeFromOperation: number;
  collIncreaseFromRedist: number;
  collChangeFromOperation: number;
  /** Raw pipeline values behind the fields above. */
  raw?: TroveOperationRaw;
  /** Per-field origin envelopes (all six are TroveOperation params). */
  origin?: TroveOperationOrigin;
}

export interface BatchUpdateData {
  operation: BatchOperationType;
  batchDebt: number;
  batchColl: number;
  annualInterestRate: number;
  annualManagementFee: number;
  totalDebtShares: number;
  interestBatchManager?: string;
}

export interface LiquidationDetail {
  debtOffsetBySP: number;
  debtRedistributed: number;
  boldGasCompensation: number;
  collGasCompensation: number;
  collSentToSP: number;
  collRedistributed: number;
  collSurplus: number;
  price: number;
}

export interface RedemptionDetail {
  attemptedBoldAmount: number;
  actualBoldAmount: number;
  ETHSent: number;
  ETHFee: string;
  price: number;
  redemptionPrice: number;
  redemptionFee: string;
}

export interface TransferDetail {
  transferType: "mint" | "burn" | "transfer";
  fromAddress: string;
  toAddress: string;
}

/** Full Liquity V2 protocol context for granular event rendering. */
export interface LiquityContext {
  eventType: LiquityEventType;
  operation: LiquityOperationType;
  troveId: string;
  collateralType: CollateralType;
  collateralPrice: number;
  protocolName: string; // "liquity-v2"
  assetType: string;    // "BOLD"

  stateBefore: TroveState;
  stateAfter: TroveState;

  isInBatch: boolean;
  batchManager?: string;
  isZombieTrove: boolean;
  batchUpdate?: BatchUpdateData;

  /** Present for all except pure transfer events. */
  troveOperation?: TroveOperationData;

  /** Set on liquidation events. */
  liquidation?: LiquidationDetail;
  /** Set on redemption events. */
  redemption?: RedemptionDetail;
  /** Set on transfer events. */
  transfer?: TransferDetail;

  /** For redeemer's view — who owns the redeemed trove. */
  troveOwner?: string;
  /** For trove owner's view — who initiated the redemption. */
  redeemer?: string;

  /** Trove-centric view: who performed this action. */
  actorRole?: "owner" | "redeemer" | "liquidator" | "batch_manager";
  actorAddress?: string;

  /** Present only on the synthetic event that stands in for a run of
   *  consecutive zero-delta adjustTrove touches (bot keep-alive / clamped
   *  repays), collapsed server-side so real events keep their place in the
   *  paged window. State fields carry the run's newest event; troveOperation
   *  carries the summed (dust-scale) deltas. */
  noChangeRun?: NoChangeRunSummary;

  blockGrouping: BlockGrouping;
}

/** Aggregate of one run of consecutive zero-delta adjustTrove events. */
export interface NoChangeRunSummary {
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
  firstBlock: number;
  lastBlock: number;
  /** Summed debtChangeFromOperation across the run (BOLD, usually tiny negative dust). */
  totalDebtChange: number;
  totalGasEth: number;
  totalGasUsd: number;
}

// ───────────────────────── Aave V4 detail types ─────────────────────────

export type AaveV4EventType =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidation"
  | "collateral_toggle";

/** One row of the snapshot table — a single (asset, balance) tuple held in
 *  this spoke at the event block, with an optional historic USD price. The
 *  price is keyed by (asset_address, block_number) and carries the same
 *  provenance enum as the primary-asset `ctx.price` field. Renderers should
 *  drive the USD chip off `item.price`, falling back to "no chip" when
 *  absent (analog to how the primary-asset chip behaves). */
export interface AaveV4SnapshotItem {
  symbol: string;
  amount: string;
  price?: { usd: number; source: AaveV4PriceSource; block?: number };
  /** Variable borrow rate for this asset at the event's block, as a decimal
   *  string (e.g. "0.0371" = 3.71% APR). Present on debt items only — it lets a
   *  card show the borrow rate of debt the position already holds even on events
   *  (supply/withdraw) where the debt leg didn't move. Sourced server-side from
   *  the reserve's per-block rate; absent when the backend hasn't enriched it. */
  borrowAPR?: string;
}

/** Raw integers behind the scaled AaveV4Context fields — the exact uint256
 *  strings the spoke's logs emitted, and the MV's integer-valued running
 *  sums, before decimal scaling. Mirrors the server envelope (rails-server
 *  api/src/types/event-shape.ts); a key is absent when its source column was
 *  NULL. Pass raws through untouched — a raw IS the chain value; never
 *  reconstruct it from the rounded float. */
export interface AaveV4ContextRaw {
  /** This event's own moved amount (a liquidation's debtToCover). */
  amount?: string;
  /** Scaled-balance shares the event carries alongside the amount. */
  shares?: string;
  /** liquidation: raw collateral seized. */
  liquidatedCollateralAmount?: string;
  /** Running sums from mv_aave_v4_events. On liquidation rows supply* is the
   *  collateral side, debt* the debt side. */
  supplyBefore?: string;
  supplyAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
}

/** Origin envelopes for the emitted AaveV4ContextRaw fields — which spoke log
 *  and ABI param each value decodes from. Stamped server-side in the V4
 *  transformer beside the raw{} projection. Only single-log-param fields are
 *  present: the running before/after sums are the MV's window aggregates over
 *  many logs — derived, so no envelope (absence means "derived"). */
export interface AaveV4ContextOrigin {
  amount?: OriginEnvelope;
  shares?: OriginEnvelope;
  liquidatedCollateralAmount?: OriginEnvelope;
}

/** Aave V4 protocol context (also re-declared in
 *  protocols/aave-v4.ts, which re-exports it).
 *  Numeric fields ship as strings to preserve precision across the wire. */
export interface AaveV4Context {
  eventType: AaveV4EventType;
  /** Amount in reserve token (human-readable). */
  amount?: string;
  /** Reserve token symbol (resolved from reserve_id). */
  reserveSymbol?: string;
  /** Spoke display name ("Main", "Bluechip", …). */
  spokeName?: string;
  /** Spoke contract address (lowercase). */
  spokeAddress?: string;
  /** collateral_toggle: whether collateral was enabled. */
  enabled?: boolean;
  /** liquidation: collateral reserve symbol. */
  collateralSymbol?: string;
  /** liquidation: debt covered. */
  debtToCover?: string;
  /** liquidation: collateral seized. */
  liquidatedCollateralAmount?: string;
  /** liquidation: liquidator address. */
  liquidator?: string;
  /** Non-liquidation only — the position's owner (the spoke event's `user`
   *  param), lowercased. NOT always the queried wallet: the timeline includes
   *  rows where the wallet was the caller on someone else's position. */
  owner?: string;
  /** Non-liquidation only — the transaction sender (signer), lowercased. */
  txFrom?: string;
  /** Non-liquidation only — the spoke event's own `caller` param (msg.sender,
   *  authorized for the user), lowercased. V4 spokes emit a true caller on
   *  EVERY action — unlike V3's Pool, where withdraw's raw column is a
   *  recipient — so all five actions can mark. The event is third-party-acted
   *  exactly when owner is NEITHER txFrom NOR caller. */
  caller?: string;
  /** Running supply balance before this event (human-readable). */
  supplyBefore?: string;
  /** Running supply balance after this event (human-readable). */
  supplyAfter?: string;
  /** Running debt balance before this event (human-readable). */
  debtBefore?: string;
  /** Running debt balance after this event (human-readable). */
  debtAfter?: string;
  /** All non-zero supply positions in this spoke after the event. Each item
   *  optionally carries the asset's USD price at the event block — populated
   *  when an `aave_v4_historic_prices` row exists for (asset_address,
   *  block_number) and is in the categorical-allowlist (chainlink /
   *  iaave-oracle / stablecoin). `defillama` rows are wire-stripped. */
  allSupplies?: AaveV4SnapshotItem[];
  /** All non-zero debt positions in this spoke after the event. Same
   *  per-item price plumbing as `allSupplies`. */
  allDebts?: AaveV4SnapshotItem[];
  /** Same-tx supply + collateral_toggle merge — drives the
   *  "Supply & Enable Collateral" card. */
  alsoToggledCollateral?: boolean;
  /** Effective supply APR derived from share/amount index changes. */
  supplyAPR?: string;
  /** Effective borrow APR derived from share/amount index changes. */
  borrowAPR?: string;
  /** USD price of the event's primary asset at the event's block. Populated
   *  on supply/withdraw/borrow/repay/collateral_toggle. Liquidation rows use
   *  `collateralPrice` + `debtPrice` instead. Number is the float-precision
   *  USD value (e.g. 2876.57); source indicates provenance. */
  price?: { usd: number; source: AaveV4PriceSource; block?: number };
  /** Liquidation rows only — USD price of the collateral asset at event block. */
  collateralPrice?: { usd: number; source: AaveV4PriceSource; block?: number };
  /** Liquidation rows only — USD price of the debt asset at event block. */
  debtPrice?: { usd: number; source: AaveV4PriceSource; block?: number };
  /** Raw log integers behind the scaled fields above. Absent on
   *  collateral_toggle rows (nothing moved). */
  raw?: AaveV4ContextRaw;
  /** Origin envelopes for the emitted raw fields (log + param + raw + scale).
   *  Same absence rules as `raw`; absent on pre-envelope API responses. */
  origin?: AaveV4ContextOrigin;
}

/** Provenance of an Aave V4 historic price. Drives the UI's
 *  approximate-vs-protocol-faithful chip.
 *
 *  Categorical model (current):
 *    - `iaave-oracle` — the Aave oracle's own answer at the event block:
 *      V4 AaveOracle.getReservePrice for every asset a V4 spoke lists (since
 *      2026-09-22), IAaveOracle.getAssetPrice on the V3 and Spark lanes.
 *      Whatever the oracle composes behind it (Chainlink proxy, price-cap
 *      adapter, fixed $1, ratio adapter, PT linear discount) is the price.
 *      No `≈` prefix.
 *    - `chainlink` — Chainlink USD aggregator round at the event block: the
 *      V4 live writer's rows at AnswerUpdated blocks of the feeds that ARE a
 *      V4 reserve's source, and registry assets no V4 spoke lists (DAI).
 *      No `≈` prefix.
 *    - `chainlink-eth-derived` — an asset/ETH feed × ETH/USD, for registry
 *      assets no V4 spoke lists (rETH, cbETH). No `≈` prefix.
 *    - `pendle-twap` — a Pendle PT at its on-chain TWAP rate × the accounting
 *      asset's USD feed. No V4 asset carries it since migration 314; kept so
 *      the label still parses. No `≈` prefix.
 *    - `stablecoin` — hard-pinned to $1.00 for the known stable set.
 *      Approximate by definition; `≈` prefix.
 *    - `defillama` — DEPRECATED. DefiLlama-aggregated CEX/DEX price.
 *      The transformer drops these rows from the wire response so the UI
 *      never sees them; the source remains in the enum so historical
 *      rows in `aave_v4_historic_prices` still parse if you query them
 *      directly. */
export type AaveV4PriceSource =
  | "chainlink"
  | "chainlink-eth-derived"
  | "pendle-twap"
  | "iaave-oracle"
  | "stablecoin"
  | "defillama";

// ───────────────────────── Aave V3 detail types ─────────────────────────
//
// LOCAL EXTENSION (not mirrored from rails-server-onboarding — there is no V3
// transformer there). This repo onboards V3 against chain. Duplicated from
// protocols/aave-v3.ts (a re-export) the same way the V4 context is
// duplicated above, so V3 components can import either symbol.

// transfer_in / transfer_out: account-to-account position moves (aToken
// BalanceTransfer): value changes custody without leaving the protocol — NOT a
// supply/withdraw. One raw transfer → two MV rows, an `_out` on the sender and
// an `_in` on the recipient. Supply axis only (debt tokens are non-transferable).
export type AaveV3EventType =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidation"
  | "transfer_in"
  | "transfer_out"
  // swap: one position swap (rails-ops TO-DO-ui-jobs §15) drawn as ONE event
  // from its two index rows. The given leg rides the base fields (amount,
  // reserveSymbol, supplyBefore/After, price, raw); the received leg rides `swap`.
  | "swap"
  // bad_debt_written_off: one row per DeficitCreated (server mig 261) — the
  // part of a liquidated account's debt the Pool burned because no collateral
  // was left to seize for it. Debt axis only, a decrease with no repayment;
  // `amount` is the log's amountCreated on the written-off reserve. Emitted
  // inside executeLiquidationCall, so it always sits in a liquidation's
  // transaction, before that liquidation's own row (rails-ops TO-DO-ui-jobs §20).
  | "bad_debt_written_off";

/** Provenance of an Aave V3 historic price (mirror of aave-v3.ts). */
export type AaveV3PriceSource = "iaave-oracle";

/** The kinds of position swap the Aave app places, by its own names. */
/** `supply_from_swap` is the one kind the Aave app does not place: an order the
 *  owner signed that bought aTokens into the position (§15 D6). */
export type AaveV3SwapKind =
  | "collateral_swap"
  | "debt_swap"
  | "repay_with_collateral"
  | "withdraw_and_swap"
  | "supply_from_swap";

/** How the swap reached the Pool: the owner's own CoW order (permit), a
 *  one-order CoW adapter contract, or ParaSwap's adapter. */
export type AaveV3SwapRoute = "cow_permit" | "cow_adapter" | "paraswap";

/** The index row a position swap's leg was. */
export type AaveV3SwapLegAction = AaveV3SwapDetail["givenAction"] | AaveV3SwapDetail["receivedAction"];

/** One index row behind a ParaSwap swap card (server mig 248): a leg's own row,
 *  or a leftover that returned what the swap did not use. */
export interface AaveV3SwapPoolEvent {
  eventKey: string;
  leg: "given" | "received";
  leftover: boolean;
  action: "transfer_out" | "supply" | "borrow" | "repay";
  symbol?: string;
  asset?: string;
  amount?: string;
  raw?: string;
  /** A Pool log's own `amount` param; a transfer row has none (derived). */
  origin?: OriginEnvelope;
}

/** A position swap's second leg and its pairing, as the index's
 *  `aave_v3_position_swaps` states it (server migs 243, 245). */
export interface AaveV3SwapDetail {
  kind: AaveV3SwapKind;
  route: AaveV3SwapRoute;
  /** The index row each leg was — it decides the leg's axis (an aToken leg the
   *  supplied balance, a repay or borrow the debt) and how its figure is
   *  receipted (a BalanceTransfer derivation, or a Pool log's own `amount`). */
  /** `transfer_in` on a supply from a swap: its one row, the aTokens received,
   *  rides the base fields, and the Trade's sell side rides `received*`. */
  givenAction: "transfer_out" | "repay" | "transfer_in";
  /** "trade" has no index row: a withdraw and swap's bought token, the Trade's
   *  buy side, left the position (server mig 247); a supply from a swap's SOLD
   *  token, the Trade's sell side, came from the wallet (mig 250). */
  receivedAction: "transfer_in" | "supply" | "borrow" | "repay" | "trade";
  givenEventKey: string;
  /** Absent on a "trade" leg. */
  receivedEventKey?: string;
  receivedSymbol?: string;
  /** The received reserve's contract (lowercase). */
  receivedAsset?: string;
  receivedAmount?: string;
  receivedSupplyBefore?: string;
  receivedSupplyAfter?: string;
  /** A repay or borrow leg's debt balance in the received reserve. */
  receivedDebtBefore?: string;
  receivedDebtAfter?: string;
  receivedPrice?: { usd: number; source: AaveV3PriceSource };
  /** A Supply leg's own log param; a transfer leg has none (derived). */
  receivedOrigin?: OriginEnvelope;
  /** The GPv2Settlement Trade log that pairs the legs. */
  orderUid?: string;
  tradeOwner?: string;
  /** Both legs equal the Trade to the wei (otherwise within 2 wei). */
  exact: boolean;
  /** The ParaSwap adapter that made the legs' Pool calls (route "paraswap"). */
  adapter?: string;
  /** Every index row behind the card, in log order, when a leftover nets into a
   *  leg (server mig 248, §15 D4). A netted leg's figure is then the net change
   *  in its reserve, not one row's amount. */
  events?: AaveV3SwapPoolEvent[];
  raw: {
    receivedAmount?: string;
    receivedSupplyBefore?: string;
    receivedSupplyAfter?: string;
    receivedDebtBefore?: string;
    receivedDebtAfter?: string;
    tradeSellAmount?: string;
    tradeBuyAmount?: string;
    tradeFeeAmount?: string;
  };
}

/** Raw integers behind the scaled AaveV3Context fields — the exact uint256
 *  strings the Pool's logs emitted, and the MV's integer-valued running sums,
 *  before decimal scaling (built web-side in lib/sources/api/aave-v3-timeline.ts;
 *  the V3 route ships raw MV rows). `borrowRate` needs no raw twin — the ctx
 *  field is already the raw ray string. Pass raws through untouched. */
export interface AaveV3ContextRaw {
  /** This event's own moved amount. */
  amount?: string;
  /** liquidation: raw debt covered. */
  debtToCover?: string;
  /** liquidation: raw collateral seized. */
  liquidatedCollateralAmount?: string;
  /** Running sums from mv_aave_v3_events. On liquidation rows supply* is the
   *  collateral side, debt* the debt side. */
  supplyBefore?: string;
  supplyAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
}

/** Origin envelopes for the emitted AaveV3ContextRaw fields — which Pool log
 *  and ABI param each value decodes from. Built web-side in
 *  lib/sources/api/aave-v3-timeline.ts beside the raw{} projection (the V3
 *  route ships raw MV rows; decimals resolve there). Only single-log-param
 *  fields are present: the running before/after sums are the MV's window
 *  aggregates over many logs — derived, so no envelope. */
export interface AaveV3ContextOrigin {
  amount?: OriginEnvelope;
  debtToCover?: OriginEnvelope;
  liquidatedCollateralAmount?: OriginEnvelope;
}

/** The Aave V3 detail context — declared HERE (protocols/aave-v3.ts re-exports
 *  it). Numeric fields ship as
 *  strings to preserve precision across the wire. */
export interface AaveV3Context {
  eventType: AaveV3EventType;
  amount?: string;
  reserveSymbol?: string;
  /** The reserve `reserveSymbol` names, lowercase: the row's own reserve, a
   *  swap's given leg, a liquidation's debt reserve. Keys the position state
   *  the open card reads (rails-ops TO-DO-ui-jobs §19). */
  reserve?: string;
  /** borrow: 1 = stable, 2 = variable. */
  interestRateMode?: number;
  /** borrow: variable borrow rate at the event (ray, as a string). */
  borrowRate?: string;
  /** repay: whether the debt was repaid using aTokens. */
  useATokens?: boolean;
  /** liquidation: seized collateral token address (lowercase). */
  collateralAsset?: string;
  /** liquidation: seized collateral symbol. */
  collateralSymbol?: string;
  /** liquidation: debt covered (human-readable). */
  debtToCover?: string;
  /** liquidation: collateral seized (human-readable). */
  liquidatedCollateralAmount?: string;
  /** liquidation: liquidator address (lowercase). */
  liquidator?: string;
  /** supply/borrow/repay only — the transaction sender (signer), lowercased. */
  txFrom?: string;
  /** supply/borrow/repay only — msg.sender at the Pool, from the raw event's
   *  own party param (Supply/Borrow `user`, Repay `repayer`), lowercased. The
   *  event is third-party-acted exactly when the owner is NEITHER txFrom NOR
   *  poolCaller: routed flows (gateways, adapters) keep txFrom = owner;
   *  contract-owned positions (Safes) keep poolCaller = owner. */
  poolCaller?: string;
  /** transfer_in/transfer_out only — the OTHER account in the position move
   *  (the sender on an inflow, the recipient on an outflow), lowercased. A
   *  true counterparty of the event, not a verdict about who acted (renders
   *  as the neutral to/from chip, not the external-actor pink). */
  counterparty?: string;
  supplyBefore?: string;
  supplyAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
  /** Historic USD price of the event's primary reserve at the event's block. */
  price?: { usd: number; source: AaveV3PriceSource };
  /** Liquidation rows only — collateral asset's USD price at event block. */
  collateralPrice?: { usd: number; source: AaveV3PriceSource };
  /** Liquidation rows only — debt asset's USD price at event block. */
  debtPrice?: { usd: number; source: AaveV3PriceSource };
  /** Liquidation rows only — the collateral reserve's liquidation bonus
   *  (bps, 10500 = +5%) and the protocol's share of that bonus (bps of the
   *  bonus, 1000 = 10%), both from the reserve's configuration word read at
   *  the event's block. The constants the Pool computed this seizure with:
   *  the realized premium lands on bonus − (bonus share kept by the
   *  treasury). Set by the Base index lanes (mig 197); the Ethereum lanes
   *  never stored the bonus and leave it undefined. */
  liquidationBonusAtBlock?: { bonusBps: number; protocolFeeBps: number };
  /** swap only — the received leg and the pairing. */
  swap?: AaveV3SwapDetail;
  /** Raw log integers behind the scaled fields above. */
  raw?: AaveV3ContextRaw;
  /** Origin envelopes for the emitted raw fields (log + param + raw + scale).
   *  Same absence rules as `raw`. */
  origin?: AaveV3ContextOrigin;
}

// ───────────────────────── MakerDAO detail types ─────────────────────────
//
// Maker is the first
// chain-state-tier protocol (chain-truth charter) — a LOCAL extension with no
// rails-server transformer, like Aave V3. Lean by design: chain-direct slots +
// the §2 `art × rate` multiply only.

// lse-kick / lse-take / lse-remove: the LockStake auction lifecycle (decision
// 0013, mig 104) — zero-delta markers on engine urns; the seizure's balance
// effect rides the paired grab. Zero occurrences to date.
export type MakerDAOEventType = "frob" | "grab" | "fork-out" | "fork-in" | "give" | "lse-kick" | "lse-take" | "lse-remove";
export type MakerPriceSource = "maker-spotter";

export interface MakerDAOContext {
  eventType: MakerDAOEventType;
  ilk: string;
  collateralSymbol: string;
  urn: string;
  cdpId?: string;
  /** Signed collateral delta `dink` this event applied (human-readable). */
  dink: string;
  /** Signed normalized-debt delta `dart` this event applied (human-readable). */
  dart: string;
  /** Collateral `ink` after = Σ dink ≤ this event (human-readable). */
  inkAfter: string;
  /** Normalized debt `art` after = Σ dart ≤ this event (human-readable). */
  artAfter: string;
  /** Vat rate accumulator (ray, 1e27) AS OF this event's block — chain-state,
   *  reconstructed server-side from captured `maker_fold` deltas. Optional: absent
   *  until the events-MV `rate_at_block` column lands; when present, values each
   *  historic `dart` as DAI minted/burned at that block. */
  rateAtBlock?: string;
  /** True for a vault's first frob (open). */
  isOpen?: boolean;
  /** The transaction sender (signer), lowercased. Present ONLY on two-fact
   *  external frobs — the route ships the facts exactly when both tx_from and
   *  tx_to differ from the owner (and tx_to from the vault's proxy); every
   *  other row omits them. Absent on grab (liquidations stay critical). */
  txFrom?: string;
  /** The transaction's entry contract (tx envelope `to`), lowercased — Maker's
   *  second marking fact: the Vat LogNote usr is always the CdpManager, so it
   *  never discriminates, but a DSProxy is auth-gated — tx_to on the owner's
   *  proxy means the owner initiated the transaction whoever signed it. Same
   *  presence rule as `txFrom`. */
  txTo?: string;
  /** The owner IN FORCE at this event's block — what the third-party verdict
   *  was judged against (give-aware). Present exactly when txFrom/txTo are. */
  ownerAt?: string;
  /** give rows only: the transfer's dst (new holder — often a DSProxy). */
  giveDst?: string;
  /** give rows only: dst resolved via the DSProxy hop (head read). */
  giveDstOwner?: string;
  /** give rows only: the give's LogNote caller (previous owner or proxy). */
  giveCaller?: string;
  /** grab rows only — the ilk's own OSM price at this event's block,
   *  recovered from the protocol's risk state (Vat spot × Spotter mat,
   *  mig 111): the figure the Dog's unsafety test acted on. Absent until
   *  the filler prices the block; the forensics stay token-only meanwhile. */
  priceAtBlock?: { usd: number; source: MakerPriceSource };
}

// ───────────────────────── Morpho Blue detail types ─────────────────────────
//
// LOCAL EXTENSION (no rails-server transformer — Morpho has no MV in the dump, so
// its position is replayed from the raw morpho_* event tables, like MakerDAO). A
// Morpho position is keyed by (marketId, borrower). BORROWER-scoped: collateral +
// borrowed principal, from the tables captured since deployment. (The lender
// SUPPLY side is only partially captured in this dump — morpho_supply starts long
// after deployment — so it's deliberately out of this explorer.) Converting borrow
// SHARES → current debt ASSETS needs the market index (totalBorrowAssets/Shares),
// which this dump's `morpho_interest` doesn't cover to T — so "current debt with
// interest" is a derived <Layer>, never part of this chain-direct baseline.

export type MorphoEventType =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "supply_collateral"
  | "withdraw_collateral"
  | "liquidation";

export interface MorphoContext {
  eventType: MorphoEventType;
  /** Market id (keccak of the market params), 0x-prefixed hex. */
  marketId: string;
  loanSymbol: string;
  collateralSymbol: string;
  /** Which token this event moved: the loan asset or the collateral asset. */
  side: "loan" | "collateral";
  /** Signed amount of the moved token this event applied (human-readable). */
  assetsDelta: string;
  /** Signed borrow-shares delta (borrow/repay/liquidation); omitted for
   *  collateral-only events. Plain integer string (1e6-virtual-scaled). */
  sharesDelta?: string;
  /** Collateral the position holds AFTER this event = Σ collateral deltas
   *  (raw collateral token, human-readable). Collateral doesn't accrue, so this is exact. */
  collateralAfter: string;
  /** Net borrowed PRINCIPAL after = Σ (borrow − repay − liquidation cover incl.
   *  bad debt) assets (human-readable loan token). Principal only — excludes
   *  accrued interest (that's the derived layer). */
  borrowedAfter: string;
  /** Net supplied PRINCIPAL after, on the LENDER side = Σ (supply − withdraw)
   *  assets (human-readable loan token). Set only by the swept Base lane —
   *  the index carries no lender rows — and only on supply/withdraw rows, so
   *  its presence is what tells the detail grid to draw the supplied axis. */
  suppliedAfter?: string;
  /** True for the position's first event. */
  isOpen?: boolean;
  /** The transaction sender (signer), lowercased. Present ONLY on two-fact
   *  external rows — the route ships the facts exactly when on_behalf differs
   *  from BOTH the signer and the caller; every other row omits them (never a
   *  defaulted stand-in). Absent on liquidation (the actor is the liquidator). */
  txFrom?: string;
  /** The Morpho event's own `caller` param (msg.sender, authorized for
   *  on_behalf), lowercased. Unlike Aave's Pool, EVERY borrower-scoped Morpho
   *  action carries a true caller — withdraws included. Same presence rule as
   *  `txFrom`. */
  caller?: string;
  /** liquidation rows only — the loan-token amount this liquidation cleared:
   *  |borr_delta| = repaidAssets + any bad debt socialized (human-readable
   *  loan token). The seized side is `assetsDelta` (side = "collateral"). */
  loanRepaid?: string;
  /** liquidation rows only — the market's OWN oracle at this event's block
   *  (mig 112 capture): loan token per 1 collateral token, human units. The
   *  figure the LLTV test and incentive math acted on. Morpho prices in the
   *  loan token by design — never USD. Absent until the filler prices the
   *  block; the forensics stay token-only meanwhile. */
  oraclePriceAtBlock?: { loanPerCollateral: number; source: "morpho-oracle" };
}

// ───────────────────────── Spark (SparkLend) detail types ─────────────────────────
//
// SparkLend is an Aave V3 fork,
// uplifted from the chain-state baseline to reference depth — a LOCAL extension
// with no rails-server transformer, like Aave V3 / Morpho / MakerDAO. The context
// carries the V3-parity fields (explicit before-balances, pooled baskets, raw
// twins, origin envelopes); health factor and USD stay OFF the event context.

// transfer_in / transfer_out: account-to-account position moves (spToken
// BalanceTransfer): value changes custody without leaving the protocol — NOT a
// supply/withdraw. One raw transfer → two MV rows, an `_out` on the sender and
// an `_in` on the recipient. Supply axis only (debt tokens are non-transferable).
export type SparkEventType =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidation"
  | "transfer_in"
  | "transfer_out";

/** Provenance of a SparkLend historic price — the protocol's own oracle
 *  (IAaveOracle fork) read at the event's block by the price filler. A named
 *  union so a future second source stays a one-line change (V3 pattern). */
export type SparkPriceSource = "iaave-oracle";

export interface SparkSnapshotItem {
  symbol: string;
  amount: string;
  /** Lowercased underlying token address. */
  address?: string;
}

export interface SparkContextRaw {
  amount?: string;
  debtToCover?: string;
  liquidatedCollateralAmount?: string;
  supplyBefore?: string;
  supplyAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
}

export interface SparkContextOrigin {
  amount?: OriginEnvelope;
  debtToCover?: OriginEnvelope;
  liquidatedCollateralAmount?: OriginEnvelope;
}

export interface SparkContext {
  eventType: SparkEventType;
  /** The reserve this event moved — for a liquidation, the DEBT asset symbol. */
  reserveSymbol: string;
  /** Liquidation only — the seized COLLATERAL reserve symbol. */
  collateralSymbol?: string;
  /** Liquidation only — the seized collateral reserve address (lowercased). */
  collateralAsset?: string;
  /** Which balance axis this event moved (collateral/supply vs borrow/debt). */
  side: "supply" | "debt";
  /** Signed amount of the moved reserve (human-readable); liquidation = collateral seized (negative). */
  assetsDelta: string;
  /** Liquidation only — debt repaid by the liquidator (human-readable, signed). */
  debtDelta?: string;
  /** Liquidation only — LiquidationCall `debtToCover` (human-readable, unsigned). */
  debtToCover?: string;
  /** Liquidation only — LiquidationCall `liquidatedCollateralAmount` (unsigned). */
  liquidatedCollateralAmount?: string;
  /** Liquidation only — the liquidator address (lowercased). */
  liquidator?: string;
  /** Historic USD price of the event's primary reserve at the event's block —
   *  SparkLend's own oracle read at the block (spark_historic_prices, mig 092).
   *  Absent until the price walk reaches the block. */
  price?: { usd: number; source: SparkPriceSource };
  /** Liquidation rows only — seized collateral asset's USD price at the block. */
  collateralPrice?: { usd: number; source: SparkPriceSource };
  /** Liquidation rows only — covered debt asset's USD price at the block. */
  debtPrice?: { usd: number; source: SparkPriceSource };
  /** supply/borrow/repay only — the transaction sender (signer), lowercased. */
  txFrom?: string;
  /** supply/borrow/repay only — msg.sender at the Pool, from the raw event's
   *  own party param (Supply/Borrow `user`, Repay `repayer`), lowercased. The
   *  event is third-party-acted exactly when the owner is NEITHER txFrom NOR
   *  poolCaller: routed flows (gateways, adapters) keep txFrom = owner;
   *  contract-owned positions (Safes) keep poolCaller = owner. */
  poolCaller?: string;
  /** Borrow only — Borrow log `borrowRate`, ray (1e27) string. */
  borrowRate?: string;
  /** Borrow only — 1 = stable, 2 = variable. */
  interestRateMode?: number;
  /** Repay only — repaid with spTokens instead of the underlying. */
  useATokens?: boolean;
  /** transfer_in/transfer_out only — the OTHER account in the position move
   *  (the sender on an inflow, the recipient on an outflow), lowercased. A
   *  true counterparty of the event, not a verdict about who acted (renders
   *  as the neutral to/from chip, not the external-actor pink). */
  counterparty?: string;
  /** Touched reserve's SUPPLIED balance before/after this event = Σ supply deltas (human-readable). */
  supplyBefore?: string;
  supplyAfter?: string;
  /** Touched reserve's BORROWED balance before/after this event = Σ (borrow − repay) (human-readable). */
  debtBefore?: string;
  debtAfter?: string;
  /** Pooled-account basket AFTER this event — every reserve's running balance. */
  allSupplies?: SparkSnapshotItem[];
  allDebts?: SparkSnapshotItem[];
  /** Exact uint256 twins of the scaled fields above. */
  raw?: SparkContextRaw;
  /** Origin envelopes for the log-emitted fields. */
  origin?: SparkContextOrigin;
  /** True for the wallet's first event. */
  isOpen?: boolean;
}

// ───────────────────────── Liquity V1 (LUSD) detail types ─────────────────────────
//
// The original, frozen 2021
// Liquity: ONE ETH-collateralised Trove per address, LUSD debt, no ongoing interest
// (a one-time borrowing fee only). Onboarded at the ON-CHAIN VALUES tier — TroveUpdated
// emits ABSOLUTE debt/coll, so the after-values are directly EMITTED (not summed
// like Spark), and the deltas are chain-DERIVED (after − before over two consecutive
// emitted values, so they survive the chain-state gate). Collateral is always ETH, debt always
// LUSD (both 1e18). USD value / collateral ratio are interpreted layers, absent here.

export type LiquityV1EventType = "openTrove" | "adjustTrove" | "closeTrove" | "liquidation" | "redemption";

export interface LiquityV1Context {
  eventType: LiquityV1EventType;
  /** Signed ETH collateral delta this event applied (after − before, human-readable). */
  collDelta: string;
  /** Signed LUSD debt delta this event applied (after − before, human-readable). */
  debtDelta: string;
  /** ETH collateral the Trove held AFTER this event — TroveUpdated `_coll` (emitted). */
  collAfter: string;
  /** LUSD debt the Trove owed AFTER this event — TroveUpdated `_debt` (emitted). */
  debtAfter: string;
  /** ETH collateral BEFORE this event = the previous TroveUpdated's `_coll`. */
  collBefore: string;
  /** LUSD debt BEFORE this event = the previous TroveUpdated's `_debt`. */
  debtBefore: string;
  /** True for the Trove's first event (openTrove). */
  isOpen?: boolean;
  /** Trove-lifecycle index (mig 075) this event belongs to — lets a reopened Trove's
   *  timeline be sliced to a single life. Absent on pre-epoch cached responses. */
  epoch?: number;
  /** Liquidation/redemption rows only — the protocol's OWN ETH:USD at this
   *  event's block: PriceFeed.lastGoodPrice, the figure the TroveManager
   *  itself acted on in that block (mig 110 capture). Absent until the filler
   *  prices the block; the forensics stay token-only meanwhile. */
  priceAtBlock?: { usd: number; source: "pricefeed-lastgoodprice" };
}

// ───────────────── Liquity V2 fork — the shared per-event decomposition ─────────────────
//
// Two fact sets the V2 contract family emits on every fork, carried here once
// because the fork explainer is shared. Both are OPTIONAL on every fork context
// and populated per deployment: today only Basedollar's read path carries them
// (migs 165/166 widened its events MV), and their absence on the others is the
// correct visible state, not a defect — the same posture `priceAtBlock` already
// takes. Widening Ebisu's / Asymmetry's MVs the same way is what turns these on
// for them; no clause changes.

/** The branch's own collateral price at an event's block, and WHERE the figure
 *  came from. Two routes, and the difference is real provenance:
 *
 *    * `redemption-event-price` — the TroveManager EMITTED it, in the same
 *      Redemption log as the act (`_price`). A decoded log leaf: nothing was
 *      re-read, so nothing can have drifted.
 *    * `pricefeed-lastgoodprice` — read back out of the branch's PriceFeed at
 *      the block over an archive node and captured (mig 113). The route the
 *      mainnet forks take, and the only one available for a liquidation, whose
 *      price the contract family does not emit on the Trove's own row.
 *
 *  Absent where neither is available; the forensics then stay token-only, which
 *  is the correct visible state rather than a gap to paper over. */
export interface LiquityForkPriceAtBlock {
  usd: number;
  source: "pricefeed-lastgoodprice" | "redemption-event-price";
}

/** TroveOperation's own account of WHY the balances moved on this event.
 *
 *  The V2 TroveManager does not just emit the new balances — it emits the move
 *  broken into its causes. That decomposition is what lets an event say "of the
 *  1,200 BD this added, 0.13 was the protocol's fee and 0.03 was interest that
 *  accrued while you were away" instead of "debt went up by 1,200".
 *
 *  All values are human-readable decimal strings, signed where the underlying
 *  move is (`debtFromOperation` / `collFromOperation` go negative on a repay or
 *  a withdrawal). */
export interface LiquityForkOperationFacts {
  /** What the borrower's own act moved — TroveOperation `_debtChangeFromOperation`. */
  debtFromOperation: string;
  /** The protocol's upfront fee added to the debt by THIS act —
   *  `_debtIncreaseFromUpfrontFee`. Non-zero on opens, on debt-drawing adjusts,
   *  and on a rate change made too soon after the last one. */
  debtUpfrontFee: string;
  /** Debt inherited from liquidated neighbours, applied on this touch —
   *  `_debtIncreaseFromRedist`. */
  debtFromRedist: string;
  /** What the borrower's own act moved on the collateral side —
   *  `_collChangeFromOperation`. */
  collFromOperation: string;
  /** Collateral inherited from liquidated neighbours — `_collIncreaseFromRedist`. */
  collFromRedist: string;
  /** Interest accrued into the debt since the Trove's last touch, as the
   *  RESIDUAL of the identity
   *      debtAfter − debtBefore = fromOperation + upfrontFee + fromRedist + interest
   *  and therefore the one per-event interest figure this lane can state.
   *
   *  Present on REGULAR rows only. A batched Trove's after-debt is derived from
   *  batch shares rather than emitted, so its residual would carry share-rounding
   *  as well as interest — an absent figure is the correct answer there, and the
   *  transform withholds it rather than shipping a contaminated one. */
  accruedInterest?: string;
}

/** The redemption act this event was one Trove's slice of.
 *
 *  A redeemed Trove's own row shows what IT gave up; only the branch's Redemption
 *  log shows the whole of which that was a part, and the price the branch acted
 *  at. Both come from the protocol's own logs — no oracle re-read, no filler. */
export interface LiquityForkRedemptionFacts {
  /** The redemption fee the REDEEMER paid, which stays in this Trove as extra
   *  collateral (RedemptionFeePaidToTrove `_ETHFee`, in collateral units). The
   *  reason a redemption is not a penalty: the redeemed borrower keeps it. */
  feeKeptColl: string;
  /** Stablecoin the redeemer put up across this branch — Redemption `_attemptedBoldAmount`. */
  attempted: string;
  /** Stablecoin actually redeemed across this branch — `_actualBoldAmount`.
   *  Equal to `attempted` when the branch could fill the whole ask. */
  actual: string;
  /** Collateral the branch sent the redeemer in total — `_ETHSent`. */
  collSent: string;
}

// ───────────────────────── Ebisu (Liquity V2 fork) detail types ─────────────────────────
//
// Ebisu Money — a mainnet Liquity V2 FORK minting ebUSD against FIVE collateral
// branches (weETH / sUSDe / WBTC / LBTC / stcUSD), each its own TroveManager.
// Onboarded at the ON-CHAIN VALUES tier via the Option-B copy path. Like Liquity V1,
// TroveUpdated emits ABSOLUTE debt/coll, so after-values are directly EMITTED and
// deltas are chain-DERIVED (after − before). Branch decimals vary (WBTC/LBTC = 8,
// rest = 18); debt is always ebUSD (18). USD value / collateral ratio / liquidation
// price are interpreted layers, absent here.

export type EbisuEventType =
  | "openTrove"
  | "closeTrove"
  | "adjustTrove"
  | "adjustTroveInterestRate"
  | "applyPendingDebt"
  | "liquidate"
  | "redeemCollateral"
  | "openTroveAndJoinBatch"
  | "setInterestBatchManager"
  | "removeFromBatch";

export interface EbisuContext {
  eventType: EbisuEventType;
  /** The collateral branch's display symbol (weETH | sUSDe | WBTC | LBTC | stcUSD). */
  collateralSymbol: string;
  /** Signed collateral delta this event applied (after − before, human-readable). */
  collDelta: string;
  /** Signed ebUSD debt delta this event applied (after − before, human-readable). */
  debtDelta: string;
  /** Collateral the Trove held AFTER this event — TroveUpdated coll (emitted). */
  collAfter: string;
  /** ebUSD debt the Trove owed AFTER this event — TroveUpdated debt (emitted / batch-derived). */
  debtAfter: string;
  /** Collateral BEFORE this event = the previous TroveUpdated's coll. */
  collBefore: string;
  /** ebUSD debt BEFORE this event = the previous TroveUpdated's debt. */
  debtBefore: string;
  /** Annual interest rate at this event (percent, human-readable). */
  interestRate?: string;
  /** The PREVIOUS event's annual interest rate (percent, human-readable) — the
   *  transform's join of `rows[idx-1]`, so the header can name a rate move's
   *  DIRECTION (Increase / Decrease) which no single row carries. Absent for the
   *  first event. */
  rateBefore?: string;
  /** True when this Trove is managed by an interest-batch manager at this event. */
  isBatched: boolean;
  /** The interest-batch manager's address at this event (lowercase 0x) — the
   *  delegate the owner handed rate control to, emitted as this row's own
   *  BatchedTroveUpdated._interestBatchManager (mig 152). Present exactly when
   *  isBatched is true; absent on pre-migration responses. */
  batchManager?: string;
  /** True for the Trove's first event (openTrove / openTroveAndJoinBatch). */
  isOpen?: boolean;
  /** Origin envelopes for the after-state — same anatomy as the reference
   *  Liquity V2 lane (built web-side from the raw MV row, mirroring mig 068's
   *  arms): regular rows are TroveUpdated params; batched rows' coll comes off
   *  BatchedTroveUpdated, the rate off the batch's BatchUpdated, and the
   *  share-derived debt carries NO envelope (absence = derived). */
  origin?: TroveStateOrigin;
  /** Origin envelopes for the before-state — keyed on the PREVIOUS event's
   *  batchedness (was_batched, mig 084); same arms as `origin` one event back.
   *  Absent for the Trove's first event (before = synthetic 0) and on
   *  pre-was_batched responses. */
  originBefore?: TroveStateOrigin;
  /** Liquidation/redemption rows only — the branch's OWN collateral price at
   *  this event's block: PriceFeed.lastGoodPrice, the figure the TroveManager
   *  itself acted on in that block (mig 113 capture; liquidate calls fetchPrice()
   *  and redeem fetchRedemptionPrice() first, and both write it). Absent until the filler prices the block; the
   *  forensics stay token-only meanwhile. */
  priceAtBlock?: LiquityForkPriceAtBlock;
  /** Why the balances moved on this event — TroveOperation's own decomposition
   *  (borrower's act / upfront fee / redistribution, with accrued interest as
   *  the residual). Absent where the deployment's events MV does not carry the
   *  decomposition columns; the explainer then states the move without its
   *  causes, which is what it has always done. */
  operation?: LiquityForkOperationFacts;
  /** redeemCollateral rows only — the branch-wide redemption act this Trove was
   *  a slice of, plus the fee the redeemer paid into this Trove. Absent where the
   *  deployment's events MV does not carry the Redemption / RedemptionFeePaidToTrove
   *  joins. */
  redemption?: LiquityForkRedemptionFacts;
}

// ───────────────────────── Asymmetry (Liquity V2 fork) detail types ─────────────────────────
//
// Asymmetry Finance — a mainnet Liquity V2 FORK minting USDaf against SEVEN collateral
// branches (ysyBOLD / scrvUSD / sUSDS / sfrxUSD / tBTC / WBTC18 / cbBTC18), each its own
// TroveManager. Onboarded at the ON-CHAIN VALUES tier via the Option-B copy path (mirrors
// Ebisu). TroveUpdated emits ABSOLUTE debt/coll, so after-values are directly EMITTED and
// deltas are chain-DERIVED (after − before). Unlike Ebisu, every branch is 18-decimal (BTC
// variants wrapped to 18); debt is always USDaf (18). USD value / collateral ratio /
// liquidation price are interpreted layers, absent here.

export type AsymmetryEventType =
  | "openTrove"
  | "closeTrove"
  | "adjustTrove"
  | "adjustTroveInterestRate"
  | "applyPendingDebt"
  | "liquidate"
  | "redeemCollateral"
  | "openTroveAndJoinBatch"
  | "setInterestBatchManager"
  | "removeFromBatch";

export interface AsymmetryContext {
  eventType: AsymmetryEventType;
  /** The collateral branch's display symbol (ysyBOLD | scrvUSD | sUSDS | sfrxUSD | tBTC | WBTC18 | cbBTC18). */
  collateralSymbol: string;
  /** Signed collateral delta this event applied (after − before, human-readable). */
  collDelta: string;
  /** Signed USDaf debt delta this event applied (after − before, human-readable). */
  debtDelta: string;
  /** Collateral the Trove held AFTER this event — TroveUpdated coll (emitted). */
  collAfter: string;
  /** USDaf debt the Trove owed AFTER this event — TroveUpdated debt (emitted / batch-derived). */
  debtAfter: string;
  /** Collateral BEFORE this event = the previous TroveUpdated's coll. */
  collBefore: string;
  /** USDaf debt BEFORE this event = the previous TroveUpdated's debt. */
  debtBefore: string;
  /** Annual interest rate at this event (percent, human-readable). */
  interestRate?: string;
  /** The PREVIOUS event's annual interest rate (percent, human-readable) — the
   *  transform's join of `rows[idx-1]`, so the header can name a rate move's
   *  DIRECTION (Increase / Decrease) which no single row carries. Absent for the
   *  first event. */
  rateBefore?: string;
  /** True when this Trove is managed by an interest-batch manager at this event. */
  isBatched: boolean;
  /** The interest-batch manager's address at this event (lowercase 0x) — the
   *  delegate the owner handed rate control to, emitted as this row's own
   *  BatchedTroveUpdated._interestBatchManager (mig 153). Present exactly when
   *  isBatched is true; absent on pre-migration responses. */
  batchManager?: string;
  /** True for the Trove's first event (openTrove / openTroveAndJoinBatch). */
  isOpen?: boolean;
  /** Origin envelopes for the after-state — same anatomy as the reference
   *  Liquity V2 lane (built web-side from the raw MV row, mirroring mig 071's
   *  arms): regular rows are TroveUpdated params; batched rows' coll comes off
   *  BatchedTroveUpdated, the rate off the batch's BatchUpdated, and the
   *  share-derived debt carries NO envelope (absence = derived). */
  origin?: TroveStateOrigin;
  /** Origin envelopes for the before-state — keyed on the PREVIOUS event's
   *  batchedness (was_batched, mig 085); same arms as `origin` one event back.
   *  Absent for the Trove's first event (before = synthetic 0) and on
   *  pre-was_batched responses. */
  originBefore?: TroveStateOrigin;
  /** Liquidation/redemption rows only — the branch's OWN collateral price at
   *  this event's block: PriceFeed.lastGoodPrice, the figure the TroveManager
   *  itself acted on in that block (mig 113 capture; liquidate calls fetchPrice()
   *  and redeem fetchRedemptionPrice() first, and both write it). Absent until the filler prices the block; the
   *  forensics stay token-only meanwhile. */
  priceAtBlock?: LiquityForkPriceAtBlock;
  /** Why the balances moved on this event — TroveOperation's own decomposition
   *  (borrower's act / upfront fee / redistribution, with accrued interest as
   *  the residual). Absent where the deployment's events MV does not carry the
   *  decomposition columns; the explainer then states the move without its
   *  causes, which is what it has always done. */
  operation?: LiquityForkOperationFacts;
  /** redeemCollateral rows only — the branch-wide redemption act this Trove was
   *  a slice of, plus the fee the redeemer paid into this Trove. Absent where the
   *  deployment's events MV does not carry the Redemption / RedemptionFeePaidToTrove
   *  joins. */
  redemption?: LiquityForkRedemptionFacts;
}

// ───────────────────────── Basedollar (Liquity V2 fork on Base) detail types ─────────────────────────
//
// Basedollar — a BASE (chain 8453) Liquity V2 FORK minting BD against FIVE collateral
// branches (WETH / wstETH / rETH / wcbBTC / cbETH), each its own TroveManager. The first
// non-mainnet protocol on the roster: its events are captured by a second Sieve node
// (the Base indexer) and reach the API over the same Option-B copy path. TroveUpdated
// emits ABSOLUTE debt/coll, so after-values are directly EMITTED and deltas are
// chain-DERIVED (after − before). Like Asymmetry and unlike Ebisu, EVERY branch is
// 18-decimal — wcbBTC is a wrapper that normalises cbBTC's 8 decimals up, so it is not
// the 8-decimal BTC branch its ticker suggests. Debt is always BD (18). USD value /
// collateral ratio / liquidation price are interpreted layers, absent here.

export type BasedollarEventType =
  | "openTrove"
  | "closeTrove"
  | "adjustTrove"
  | "adjustTroveInterestRate"
  | "applyPendingDebt"
  | "liquidate"
  | "redeemCollateral"
  | "openTroveAndJoinBatch"
  | "setInterestBatchManager"
  | "removeFromBatch";

export interface BasedollarContext {
  eventType: BasedollarEventType;
  /** The collateral branch's display symbol (WETH | wstETH | rETH | wcbBTC | cbETH). */
  collateralSymbol: string;
  /** Signed collateral delta this event applied (after − before, human-readable). */
  collDelta: string;
  /** Signed BD debt delta this event applied (after − before, human-readable). */
  debtDelta: string;
  /** Collateral the Trove held AFTER this event — TroveUpdated coll (emitted). */
  collAfter: string;
  /** BD debt the Trove owed AFTER this event — TroveUpdated debt (emitted / batch-derived). */
  debtAfter: string;
  /** Collateral BEFORE this event = the previous TroveUpdated's coll. */
  collBefore: string;
  /** BD debt BEFORE this event = the previous TroveUpdated's debt. */
  debtBefore: string;
  /** Annual interest rate at this event (percent, human-readable). */
  interestRate?: string;
  /** The PREVIOUS event's annual interest rate (percent, human-readable) — the
   *  transform's join of `rows[idx-1]`, so the header can name a rate move's
   *  DIRECTION (Increase / Decrease) which no single row carries. Absent for the
   *  first event. */
  rateBefore?: string;
  /** True when this Trove is managed by an interest-batch manager at this event. */
  isBatched: boolean;
  /** The interest-batch manager's address at this event (lowercase 0x) — the
   *  delegate the owner handed rate control to, emitted as this row's own
   *  BatchedTroveUpdated._interestBatchManager. Present from the first response:
   *  mig 162 was authored against the CURRENT Ebisu events MV, so basedollar has
   *  no pre-batchManager era to degrade for. */
  batchManager?: string;
  /** True for the Trove's first event (openTrove / openTroveAndJoinBatch). */
  isOpen?: boolean;
  /** Origin envelopes for the after-state — same anatomy as the reference
   *  Liquity V2 lane (built web-side from the raw MV row, mirroring mig 162's
   *  arms): regular rows are TroveUpdated params; batched rows' coll comes off
   *  BatchedTroveUpdated, the rate off the batch's BatchUpdated, and the
   *  share-derived debt carries NO envelope (absence = derived). */
  origin?: TroveStateOrigin;
  /** Origin envelopes for the before-state — keyed on the PREVIOUS event's
   *  batchedness (was_batched); same arms as `origin` one event back. Absent for
   *  the Trove's first event (before = synthetic 0). */
  originBefore?: TroveStateOrigin;
  /** Liquidation/redemption rows only — the branch's OWN collateral price at
   *  this event's block. Basedollar takes the `redemption-event-price` route:
   *  the TroveManager emits the price in the Redemption log itself, so the Base
   *  lane needs no price filler to value a redemption. A Basedollar LIQUIDATION
   *  would still be token-only (that price is not on the Trove's row and the
   *  mig-113 filler is mainnet-only) — none has ever fired. */
  priceAtBlock?: LiquityForkPriceAtBlock;
  /** Why the balances moved on this event — TroveOperation's own decomposition
   *  (borrower's act / upfront fee / redistribution, with accrued interest as
   *  the residual). Absent where the deployment's events MV does not carry the
   *  decomposition columns; the explainer then states the move without its
   *  causes, which is what it has always done. */
  operation?: LiquityForkOperationFacts;
  /** redeemCollateral rows only — the branch-wide redemption act this Trove was
   *  a slice of, plus the fee the redeemer paid into this Trove. Absent where the
   *  deployment's events MV does not carry the Redemption / RedemptionFeePaidToTrove
   *  joins. */
  redemption?: LiquityForkRedemptionFacts;
}

// ───────────────────────── Compound V3 (Comet) detail types ─────────────────────────
//
// Comet is onboarded at the
// ON-CHAIN VALUES tier (chain-truth charter) — a LOCAL extension with no rails-server
// transformer, like Aave V3 / Morpho / MakerDAO / Spark. Comet is single-base /
// multi-collateral: ONE signed base balance per (market, account) + N non-earning
// collateral assets. Chain-direct event fields + the replayed balances only. No
// interest, no health factor, no USD — those are layers.

export type CompoundEventType =
  | "supply"
  | "withdraw"
  | "supply_collateral"
  | "withdraw_collateral"
  | "absorb_debt"
  | "absorb_collateral"
  // Account-to-account position moves (Comet's ERC20 base transfer /
  // transferAsset for collateral): value changes custody without leaving the
  // protocol — NOT a supply/withdraw. One raw transfer → two MV rows, an _out
  // on the sender and an _in on the recipient. Base variants have zero
  // occurrences today (a base Comet position is rarely ERC20-transferred);
  // collateral variants do occur (~0.7% of accounts).
  | "transfer_in"
  | "transfer_out"
  | "transfer_collateral_in"
  | "transfer_collateral_out";

export interface CompoundContext {
  eventType: CompoundEventType;
  /** The Comet market slug this event belongs to (usdc | weth | usdt). */
  market: string;
  /** The Comet market display label (e.g. "cUSDCv3"). */
  marketLabel: string;
  /** Symbol of the token this event moved — base symbol for base/absorb_debt,
   *  the collateral token symbol otherwise. */
  assetSymbol: string;
  /** True when the moved token is the market's BASE asset (signed base axis). */
  isBase: boolean;
  /** Signed amount of the moved token (human-readable). */
  assetsDelta: string;
  /** SIGNED base balance after (human; > 0 lend, < 0 borrow). Present on every
   *  event the MV carries a base_after for — base events always, collateral
   *  events too (the running base a collateral card's stack stands behind). */
  baseAfter?: string;
  /** Collateral events only — touched asset's collateral balance after (human, ≥ 0). */
  collateralAfter?: string;
  /** True for the wallet's first event. */
  isOpen?: boolean;
  /** supply/supply_collateral only — the transaction sender (signer),
   *  lowercased. Withdraws never carry these: their raw counterparty column
   *  is `to`, a recipient not an actor; absorbs are the liquidation path. */
  txFrom?: string;
  /** supply/supply_collateral only — the Comet event's `from` param (the
   *  funder who provided the tokens), lowercased. The event is
   *  third-party-acted exactly when the account is NEITHER txFrom NOR funder:
   *  routed flows (bulkers) keep txFrom = account; contract-owned positions
   *  keep funder = account. */
  funder?: string;
  /** transfer_* only — the OTHER account in the position move (the recipient on
   *  an _out, the sender on an _in), lowercased. A true counterparty of the
   *  event, not a verdict about who acted (renders as the neutral to/from
   *  chip, not the external-actor pink). */
  counterparty?: string;
  /** absorb_* only — the event's own `usdValue` param: the protocol's oracle
   *  reckoning of this leg at absorption time, emitted by the Comet itself
   *  (8-dec USD on chain; human-readable string here). The one USD figure at
   *  this tier — it is a chain field, not a layer. */
  usdValue?: string;
  /** absorb_debt only — the same-transaction AbsorbCollateral legs (Comet
   *  absorbs the whole account: one debt clear + every collateral seized).
   *  Per asset: the seized amount and the log's own usdValue, both
   *  human-readable. Lets the debt card state the full absorption. */
  absorbedCollateral?: { symbol: string; amount: string; usdValue: string }[];
}

// ───────────────────────── PWN (P2P fixed-term loans) detail types ─────────────────────────
//
// PWN is onboarded at the ON-CHAIN VALUES
// tier (chain-truth charter) — a LOCAL extension with no rails-server transformer,
// like Aave V3 / Morpho / MakerDAO / Spark / Compound. But PWN is NOT a pool: a
// "position" is a DISCRETE fixed-term loan (one loan_id), so there is no running-
// balance replay — the economics are fixed at creation and only the lifecycle
// STATUS moves. A wallet is a LENDER or a BORROWER (dual role). No health factor,
// no USD — collateral is frequently an ERC721 (no fungible price), so amounts-only.

export type PwnEventType =
  | "created"
  | "minted"
  | "paid_back"
  | "claimed"
  | "extended"
  | "burned";

/** The MultiToken asset standard a loan's collateral/credit uses. */
export type PwnTokenCategory = "ERC20" | "ERC721" | "ERC1155";

export interface PwnContext {
  eventType: PwnEventType;
  /** The loan this event belongs to — the position key (integer string). */
  loanId: string;
  /** SimpleLoan version ('v11' | 'v12' | 'v13'); null for the shared LOAN-token
   *  events (minted / burned), which are version-agnostic. */
  version?: string | null;
  /** The two parties (lowercase). A wallet is a lender OR a borrower — both drive
   *  the timeline filter. Absent when the loan's `created` is outside the indexed
   *  window (the event still renders, without loan context). */
  lender?: string;
  borrower?: string;
  /** Which side the VIEWED wallet is on — drives the card's framing. */
  viewerRole?: "lender" | "borrower";
  /** Collateral the borrower locked. `category` is the MultiToken standard. */
  collateralCategory?: PwnTokenCategory;
  collateralSymbol?: string;
  /** Collateral contract address (lowercase) — lets a card link an ERC721/1155. */
  collateralAsset?: string;
  /** ERC721/1155 token id (raw integer string); absent for ERC20. */
  collateralId?: string;
  /** Collateral amount (human-readable); "1" for a single ERC721. */
  collateralAmount?: string;
  /** Credit the lender advanced. */
  creditSymbol?: string;
  /** Credit contract address (lowercase). */
  creditAsset?: string;
  /** Credit principal (human-readable). */
  creditAmount?: string;
  /** Fixed total the borrower must repay = principal + fixed interest (human). */
  loanRepayAmount?: string;
  /** How the loan's default is expressed: v1.1 an absolute `expiration` timestamp,
   *  v1.2+ a `duration` in seconds. */
  dueKind?: "expiration" | "duration";
  /** The expiration timestamp (v1.1) or duration seconds (v1.2+), integer string. */
  dueValue?: string;
  /** `extended` only — the default timestamp before / after the renegotiation. */
  originalDefaultTimestamp?: string;
  extendedDefaultTimestamp?: string;
  /** `claimed` only — true when the lender seized collateral (borrower defaulted). */
  defaulted?: boolean;
  /** True for the loan's first event (`created`). */
  isOpen?: boolean;
}

// ───────────────────────── Generic / unknown ─────────────────────────

export interface OtherContext {
  contractAddress: string;
  contractName: string | null;
  eventCount: number;
  /** Auto-classified protocol from contract name patterns. */
  inferredProtocol?: string | null;
}

// ───────────────────────── Protocol identity ─────────────────────────
//
// ───────────────────────── Moonwell (Ethereum L1) detail types ─────────────────────────
//
// Moonwell's Ethereum deployment (live 2026-05-27) is a Compound v2 fork: four
// FIXED mToken markets (mWETH / mUSDC / mUSDT / mcbBTC), cross-collateralised
// through a Comptroller, per-TIMESTAMP interest accrual (its Base/Moonbeam
// convention — not original Compound's per-block). Three replay lanes, graded
// differently:
//   • debt before/after — the EMITTED `accountBorrows` (total debt after the
//     event, interest included to that moment); the gap vs the previous event's
//     after-value is accrued interest, real, not a replay artifact.
//   • mToken balance — EXACT (full Transfer replay; equals balanceOf at every
//     block, archive-verifiable).
//   • supply principal — Σ(mint − redeem) in underlying, amounts-only (no
//     on-chain slot holds it; a full exit nets negative by earned interest).
// The WETH Router proxies most mWETH mints/redeems; the indexed lane resolves
// the real owner via the same-tx router-leg Transfer (`routerProxied` marks it,
// `caller` keeps the emitted party).

export type MoonwellEventType =
  | "mint"
  | "redeem"
  | "borrow"
  | "repay"
  | "liquidation"
  | "transfer_in"
  | "transfer_out";

export interface MoonwellContextRaw {
  amount?: string;
  mTokens?: string;
  accountBorrows?: string;
  seizeTokens?: string;
  supplyBefore?: string;
  supplyAfter?: string;
  mTokensBefore?: string;
  mTokensAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
  /** Oracle-at-block raw uints (mig 195): the event market's getUnderlyingPrice
   *  (1e(36 − underlyingDecimals)) and exchangeRateStored, the seized market's
   *  pair on a liquidation, and the Comptroller's incentive / close factor
   *  (1e18) — all read at the event block. */
  priceRaw?: string;
  exchangeRateRaw?: string;
  collateralPriceRaw?: string;
  collateralExchangeRateRaw?: string;
  incentiveRaw?: string;
  closeFactorRaw?: string;
}

export interface MoonwellContext {
  eventType: MoonwellEventType;
  /** Market key ('weth' | 'usdc' | 'usdt' | 'cbbtc'). */
  market: string;
  /** The market's underlying display symbol (WETH / USDC / USDT / cbBTC). */
  marketSymbol: string;
  /** Which balance axis this event moved. */
  side: "supply" | "debt";
  /** Signed underlying amount this event moved (human-readable). Absent on
   *  transfer_in/out — an mToken move has no emitted underlying amount. */
  assetsDelta?: string;
  /** Signed mToken amount this event moved (mint/redeem/transfer; 8 dp). */
  mTokensDelta?: string;
  /** borrow/repay only — the EMITTED accountBorrows: the borrower's total
   *  debt after this event, interest accrued to this moment included. */
  accountBorrows?: string;
  /** Supply-principal lane before/after (Σ mint − redeem, amounts-only). */
  supplyBefore?: string;
  supplyAfter?: string;
  /** Exact mToken balance before/after (= balanceOf at this block). */
  mTokensBefore?: string;
  mTokensAfter?: string;
  /** Debt before/after — after = emitted accountBorrows; before = ∓ amount. */
  debtBefore?: string;
  debtAfter?: string;
  /** Liquidation only — the seized COLLATERAL market key + display symbol. */
  collateralMarket?: string;
  collateralSymbol?: string;
  /** Liquidation only — mTokens of the collateral market seized (8 dp). */
  seizeTokens?: string;
  /** Liquidation only — the liquidator address (lowercased). */
  liquidator?: string;
  /** The transaction sender (signer), lowercased — when the filler has it. */
  txFrom?: string;
  /** The event's own emitted party, lowercased: Mint.minter / Redeem.redeemer
   *  (the WETH Router when proxied), RepayBorrow.payer, the liquidator, or a
   *  transfer counterparty. Third-party marking compares owner vs txFrom vs this. */
  caller?: string;
  /** True when the emitted minter/redeemer was the WETH Router and the owner
   *  was resolved via the same-tx router-leg Transfer. */
  routerProxied?: boolean;
  /** transfer_in/out only — the other wallet. */
  counterparty?: string;
  /** Oracle-at-block (mig 195; Base first, Ethereum when its lane ships): the
   *  Comptroller's OWN oracle read back at this event's block, never today's
   *  price. `priceAtBlock` is the event market's underlying in USD — the
   *  footnote pill on an ordinary row and the debt leg of a liquidation;
   *  `collateralPriceAtBlock` the seized market's, `seizedUnderlyingAtBlock`
   *  the seized mTokens converted through the collateral mToken's
   *  exchangeRateStored at the block, `incentiveAtBlock` the
   *  liquidationIncentiveMantissa (1.1 = a 10% bonus) the premium should
   *  reproduce, `oracleAtBlock` the oracle address the Comptroller named at
   *  that block. Absent until the filler has priced the block — the card
   *  then renders token-only (a safe partial-fill state). */
  priceAtBlock?: { usd: number };
  collateralPriceAtBlock?: { usd: number };
  seizedUnderlyingAtBlock?: string;
  incentiveAtBlock?: number;
  oracleAtBlock?: string;
  /** Exact uint256 twins of the scaled fields above. */
  raw?: MoonwellContextRaw;
  /** True for the wallet's first event. */
  isOpen?: boolean;
}

// ───────────────────────── Compound V2 (Ethereum L1) detail types ─────────────────────────
//
// Original Compound V2: twenty governance-listed cToken markets (a wound-down
// roster — the Comptroller's getAllMarkets is the authority) cross-
// collateralised through one Comptroller, per-BLOCK interest accrual. Three
// replay lanes, graded like Moonwell's (the same fork family):
//   • debt before/after — the EMITTED `accountBorrows` (total debt after the
//     event, interest to that moment included); the gap vs the previous
//     event's after-value is accrued interest, real, not a replay artifact.
//   • cToken balance — EXACT (full Transfer replay; equals balanceOf at every
//     block, verified wei-exact against chain before the index shipped).
//   • supply principal — Σ(mint − redeem) in underlying, amounts-only.
// Unlike Moonwell, Compound V2 HAS liquidations (~26,600 across 5,864
// borrowers), and its close factor (0.5) makes them PARTIAL: a liquidation is
// an orthogonal event in an account's life, not its end. One liquidation
// renders as ONE row (the index merges the repay leg the liquidation itself
// emitted), and a seizure's transfer legs arrive NAMED — seize_out (the
// borrower's loss), seize_in (the liquidator's receipt), seize_burn (the
// protocol's own cut, burned) — never as plain transfers: a seizure is not
// something the borrower did.

export type CompoundV2EventType =
  | "mint"
  | "redeem"
  | "borrow"
  | "repay"
  | "liquidation"
  | "transfer_in"
  | "transfer_out"
  | "seize_out"
  | "seize_in"
  | "seize_burn";

export interface CompoundV2ContextRaw {
  amount?: string;
  cTokens?: string;
  accountBorrows?: string;
  seizeTokens?: string;
  supplyBefore?: string;
  supplyAfter?: string;
  cTokensBefore?: string;
  cTokensAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
}

export interface CompoundV2Context {
  eventType: CompoundV2EventType;
  /** The backend market key ('dai' | 'sai' | 'wbtc' | 'wbtc2' | …). */
  market: string;
  /** The market's underlying display symbol (catalog-labeled: SAI, not the
   *  "DAI" its bytes32 symbol decodes to). */
  marketSymbol: string;
  /** Which balance axis this event moved. */
  side: "supply" | "debt";
  /** Signed underlying amount this event moved (human-readable). Absent on
   *  transfer/seize legs — a cToken move has no emitted underlying amount. */
  assetsDelta?: string;
  /** Signed cToken amount this event moved (mint/redeem/transfer/seize; 8 dp). */
  cTokensDelta?: string;
  /** borrow/repay/liquidation — the EMITTED accountBorrows: the borrower's
   *  total debt after this event, interest accrued to this moment included.
   *  A liquidation's comes from the repay leg it itself emitted. */
  accountBorrows?: string;
  /** Supply-principal lane before/after (Σ mint − redeem, amounts-only). */
  supplyBefore?: string;
  supplyAfter?: string;
  /** Exact cToken balance before/after (= balanceOf at this block). */
  cTokensBefore?: string;
  cTokensAfter?: string;
  /** Debt before/after — after = emitted accountBorrows; before = ∓ amount. */
  debtBefore?: string;
  debtAfter?: string;
  /** Liquidation only — the seized COLLATERAL market key + display symbol.
   *  Either can be absent when the collateral market isn't in the index. */
  collateralMarket?: string;
  collateralSymbol?: string;
  /** Liquidation only — cTokens of the collateral market seized (8 dp; the
   *  SUM of the liquidator's leg and the protocol's burned cut). */
  seizeTokens?: string;
  /** Liquidation / seize legs — the liquidator address (lowercased). */
  liquidator?: string;
  /** The transaction sender (signer), lowercased — when the filler has it. */
  txFrom?: string;
  /** The event's own emitted party, lowercased: RepayBorrow.payer (Maximillion
   *  on fronted cETH repays, or a third party), the liquidator, or a transfer/
   *  seize counterparty. */
  caller?: string;
  /** transfer_in/out — the other wallet. seize_out: the liquidator who took
   *  the collateral. seize_in: the borrower it was taken from. */
  counterparty?: string;
  /** Liquidation forensics (mig 151) — the oracle-at-block inputs the detail
   *  card values the two-leg premium from. Raw integers as the oracle returned
   *  them: {debt,collateral}PriceNative are getUnderlyingPrice at the event
   *  block (scaled 1e(36−underlyingDecimals); ETH-denominated before block
   *  10,678,764, USD after), collateralExchangeRate values the seized cTokens,
   *  priceNumeraire is the unit BOTH legs are in, incentive (1e18) is the
   *  self-audit reference. Absent until the price walk reaches the block — the
   *  card then renders token-only (a safe partial-fill state). */
  debtPriceNative?: string;
  collateralPriceNative?: string;
  collateralExchangeRate?: string;
  priceNumeraire?: "ETH" | "USD";
  incentive?: string;
  /** Exact uint256 twins of the scaled fields above. */
  raw?: CompoundV2ContextRaw;
  /** True for the wallet's first event. */
  isOpen?: boolean;
}

// ───────────────────────── Dolomite (Ethereum L1) detail types ─────────────────────────
//
// Dolomite is a hard fork of dYdX Solo Margin: ONE core contract
// (DolomiteMargin), markets keyed by NUMERIC id (the symbol space collides on
// purpose: rUSD/srUSD/wsrUSD/cUSD/stcUSD), and the position grain is the
// contract's own Account.Info = (owner, uint256 accountNumber) — cross-margin
// within an account number, isolated across them. The core has NO Borrow
// action: a negative balance IS debt. State = par × index; par is the SCALED
// balance and interest lives in the per-market index, which accrues per
// TIMESTAMP and only settles on read.
//
// Every action event carries a BalanceUpdate per touched balance —
// (deltaWei, newPar): the token amount moved AND the account's absolute
// after-state. The index un-pivots those to the balance grain, so ONE log can
// yield up to four rows (LogLiquidate → 4, LogVaporize → 3, LogTransfer /
// LogSell → 2), each row one leg discriminated in its event_key. Two lanes,
// both unusually `state`-class for this roster:
//   • par after — the EMITTED absolute equals the stored slot (getAccountPar
//     re-reads exactly it): last-write-wins, no running sum to drift.
//   • deltaWei — the emitted token amount the leg moved.
// A liquidation's indexed owner is the LIQUIDATOR; the borrower is the
// unindexed liquidAccountOwner — a seizure is not something the borrower did,
// and the leg vocabulary keeps that (seize_out / seize_in, like Compound V2).

export type DolomiteEventType =
  | "deposit"
  | "withdraw"
  | "transfer_in"
  | "transfer_out"
  | "trade_taker"
  | "trade_maker"
  | "liquidation"
  | "seize_out"
  | "seize_in"
  | "liquidation_payout"
  | "vaporize"
  // LogCall — an external-call action marker: moves NO balance (market_id and
  // deltaWei are null on its row), so it renders as a bare action with no lane.
  | "call";

export interface DolomiteContextRaw {
  /** Signed wei delta (raw integer string) — the BalanceUpdate's deltaWei. */
  weiDelta?: string;
  /** Signed par after (raw integer string) — the BalanceUpdate's newPar. */
  parAfter?: string;
  /** Signed par before (raw integer string) — lag(newPar) at the same grain. */
  parBefore?: string;
}

export interface DolomiteContext {
  eventType: DolomiteEventType;
  /** Dolomite's own market key — numeric, THE identity (symbols collide). */
  marketId: number;
  /** The market token's display symbol (resolved from its own contract). */
  marketSymbol: string;
  /** The market token's decimals. */
  decimals: number;
  /** Which side of zero this leg's balance sits on after the event. */
  side: "supply" | "debt";
  /** Signed token amount this leg moved (human) — the emitted deltaWei. */
  weiDelta?: string;
  /** Signed PAR balance after this event (human, scaled by decimals). Par is
   *  the SCALED balance — multiply by the market's interest index for tokens.
   *  Equals the stored slot (getAccountPar) at this block. */
  parAfter?: string;
  /** Signed PAR balance before (lag of the emitted absolute). */
  parBefore?: string;
  /** transfer legs — the other Account.Info. liquidation legs — the other
   *  side's account (borrower ↔ liquidator). */
  counterparty?: string;
  counterpartyAccountNumber?: string;
  /** Liquidation legs — the liquidator (the solid account's owner: the log's
   *  INDEXED owner; the borrower is the unindexed one). */
  liquidator?: string;
  /** trade/liquidation — the sibling market of the same log. */
  otherMarketId?: number;
  otherMarketSymbol?: string;
  /** The transaction sender (signer), lowercased — when the filler has it. */
  txFrom?: string;
  /** The event's own emitted party (deposit `from` / withdraw `to`). */
  caller?: string;
  /** Exact signed integer twins of the scaled fields above. */
  raw?: DolomiteContextRaw;
  /** True for the account's first event. */
  isOpen?: boolean;
}

// ───────────────────────── Frankencoin (Ethereum L1) detail types ─────────────────────────
//
// Frankencoin (ZCHF) is an ORACLE-FREE Swiss-franc stablecoin: every borrower
// owns a Position contract (minimal-proxy clone), and the position address IS
// the grain. `MintingUpdate(collateral, price, minted)` is the per-position
// state ledger — one event per mint / repay / collateral change, carrying
// ABSOLUTES (the emitted collateral equals the token's balanceOf(position),
// the emitted minted equals the stored slot — verified wei-exact mid-life in
// the Phase-0 probes). The presentation classifies each MintingUpdate by
// diffing it against the previous one at the same position.
//
// Risk has NO health factor: the liquidation price is OWNER-DECLARED
// (`price`, stored at 1e(36 − collateralDecimals)), and enforcement is a
// two-phase challenge auction on the hub — phase 1 fixed-price (averted:
// someone buys the CHALLENGER's posted collateral at the liq price and the
// position survives) or phase 2 declining Dutch (succeeded: the bidder pays
// ZCHF, receives the POSITION's collateral). ⚠️ The challenger posts
// COLLATERAL, not ZCHF. Multi-bid auctions emit MULTIPLE ChallengeSucceeded
// slices for one challenge — group by (hub, challenge number). A challenged
// position can survive: challenge outcome and lifecycle are two axes.
//
// UNITS ARE NATIVE: ZCHF debt, the position's own collateral token — never
// USD (Frankencoin runs no oracle). Decimals are per-token from the row.

export type FrankencoinEventType =
  // PositionOpened on the hub — `clone` when original ≠ position.
  | "open"
  | "clone"
  // MintingUpdate, classified by diffing the emitted absolutes.
  | "mint"
  | "repay"
  | "add_collateral"
  | "withdraw_collateral"
  | "adjust_price"
  | "adjust" // one MintingUpdate moving more than one axis
  // A MintingUpdate written IN a challenge-settlement or forced-sale tx — the
  // protocol writing the auction's outcome down, NOT an act of the owner.
  | "auction_settlement"
  | "close" // collateral AND minted both hit zero
  // Governance veto during the init window.
  | "denied"
  // The challenge auction (hub events, position-scoped).
  | "challenge_started"
  | "challenge_averted"
  | "challenge_succeeded"
  // V2 only — an expired position's collateral sold by anyone.
  | "forced_sale"
  | "ownership_transferred";

export interface FrankencoinContextRaw {
  /** MintingUpdate absolutes (raw integer strings). */
  collateral?: string;
  price?: string;
  minted?: string;
  collateralBefore?: string;
  priceBefore?: string;
  mintedBefore?: string;
  /** Challenge figures. */
  size?: string;
  bid?: string;
  acquiredCollateral?: string;
  challengeSize?: string;
  /** ForcedSale figures. */
  forcedSaleAmount?: string;
  forcedSalePrice?: string;
}

export interface FrankencoinContext {
  eventType: FrankencoinEventType;
  /** Which MintingHub the position lives on. */
  hub: "v1" | "v2";
  /** The Position contract — the grain. */
  position: string;
  collateralToken: string;
  collateralSymbol: string;
  collateralDecimals: number;
  /** MintingUpdate absolutes AFTER this event (human, per-token / ZCHF). */
  collateral?: string;
  minted?: string;
  /** Owner-declared liquidation price, ZCHF per whole collateral token. */
  liqPrice?: string;
  /** The previous MintingUpdate's absolutes (lag at the position grain). */
  collateralBefore?: string;
  mintedBefore?: string;
  liqPriceBefore?: string;
  /** open/clone rows — the clone lineage (original ≠ position ⇒ clone). */
  original?: string;
  /** Challenge rows. */
  challenger?: string;
  /** uint256 — STRING; the (hub, number) pair keys the auction. */
  challengeNumber?: string;
  /** Collateral units: started/averted size; succeeded slice's challengeSize. */
  challengeSize?: string;
  /** ZCHF the phase-2 bidder paid (succeeded slices only). */
  bid?: string;
  /** Collateral the phase-2 bidder acquired (succeeded slices only). */
  acquiredCollateral?: string;
  /** denied rows. */
  deniedBy?: string;
  deniedMessage?: string;
  /** ownership_transferred rows. */
  previousOwner?: string;
  newOwner?: string;
  /** forced_sale rows (V2): collateral sold / raw price. */
  forcedSaleAmount?: string;
  /** The transaction sender (signer), lowercased — when the nightly tx-from
   *  filler has it. On challenge_succeeded this is also the only bidder
   *  identity there is (the event names no bidder) — pending until non-null. */
  txFrom?: string;
  /** ⚠️ The V1 clone-creation quirk: this MintingUpdate's emitted collateral
   *  figure UNDERSTATES reality — never narrate its collateral drop as a
   *  withdrawal; the chain overlay corrects at head. */
  collateralUnderstated?: boolean;
  /** ownership_transferred only — the mint-time factory→owner handover
   *  (shares the position_opened tx): initialization, not a real transfer. */
  initialization?: boolean;
  /** Exact integer twins of the scaled fields above. */
  raw?: FrankencoinContextRaw;
  /** True for the position's first event. */
  isOpen?: boolean;
}

// ───────────────────────── Polaris (Sepolia testnet) detail types ─────────────────────────
//
// Polaris is a Liquity V2-lineage CDP protocol on the Sepolia TESTNET: two
// markets (USDp, GOLDp) mint their stablecoin against one collateral, pETH (a
// bonding-curve ETH wrapper). The position grain is (market, cdpId) — the CDP
// is an NFT, and an ERC-721 Transfer of it is a CUSTODY event, never an open or
// a close. Rates are algorithmic (a primary rate the market sets on nearly every
// touch, plus a secondary utilisation rate) — nobody chooses one, so no rate
// pill rides an event header; the primary rate at the touch is a fact on the
// row instead.
//
// The ledger is `CDPUpdated` on the market's cdpManager: twelve fields per
// touch, with the resulting `_newColl`/`_newDebt` and every leg that produced
// them. The replay identity is exact (761/761 transitions, scoping doc §3):
//   newDebt = prevDebt + _debtChange + _accruedInterest + _mintRedeemDebtGain
//             − _stableGain + _stablesMintedToEnsureZeroDebt
//   newColl = prevColl + _collChange + _mintRedeemCollGain + _bcTokenGain
// `_operation`: 0 open, 1 adjust, 2 close, 3 liquidate. A liquidation row is
// joined with the same tx's `Liquidation` (+ `LiquidationGasComp`) legs.
//
// Units are native: pETH for collateral, the market's stablecoin for debt. All
// three tokens are 18 decimals. USD exists only where the overlay reads the
// protocol's own oracle at head — never on an event row.

export type PolarisEventType = "open" | "adjust" | "close" | "liquidate" | "transfer";

/** Exact wei-scale integer strings, as the logs emitted them. */
export interface PolarisContextRaw {
  newColl?: string;
  newDebt?: string;
  collChange?: string;
  debtChange?: string;
  mintRedeemCollGain?: string;
  mintRedeemDebtGain?: string;
  accruedInterest?: string;
  stableGain?: string;
  stablesMintedToEnsureZeroDebt?: string;
  bcTokenGain?: string;
  collBefore?: string;
  debtBefore?: string;
  /** The market's last PrimaryRateSet at or before this row — 1e18 = 100%/yr.
   *  Absent before the market's first rate event. */
  primaryRate?: string;
  collLiquidated?: string;
  debtLiquidated?: string;
  debtRedistributed?: string;
  collRedistributed?: string;
  collSurplus?: string;
  flatComp?: string;
  collateralComp?: string;
  /** The market's own price feed's `previewPrice()` at this event's block —
   *  the exact wei-scale integer the feed returned (18dp; pETH priced in the
   *  market's stablecoin). Absent exactly where `priceAtBlock` is. */
  priceAtBlock?: string;
}

export interface PolarisContext {
  eventType: PolarisEventType;
  market: "usdp" | "goldp";
  /** The CDP NFT's token id — the position key within its market. */
  cdpId: string;
  /** "USDp" | "GOLDp" — the market's debt unit. */
  stableSymbol: string;
  /** CDPUpdated `_operation` (0 open · 1 adjust · 2 close · 3 liquidate);
   *  absent on a transfer row. */
  operation?: number;
  // ── CDPUpdated (human decimal strings, 18dp) — absent on transfer rows ──
  newColl?: string;
  newDebt?: string;
  collChange?: string;
  debtChange?: string;
  mintRedeemCollGain?: string;
  mintRedeemDebtGain?: string;
  accruedInterest?: string;
  stableGain?: string;
  stablesMintedToEnsureZeroDebt?: string;
  bcTokenGain?: string;
  /** The previous CDPUpdated's `_newColl`/`_newDebt` (0 on the open). */
  collBefore?: string;
  debtBefore?: string;
  /** The market's primary rate IN FORCE at this touch — the last
   *  PrimaryRateSet at or before the row (the event fires on the PSM's mints
   *  and redemptions, never inside a CDPUpdated tx) — as a fraction (0.0832 =
   *  8.32%/yr). Algorithmic: the market set it, the holder did not choose it.
   *  Absent on the rows before the market's first rate event (the first 6 on
   *  USDp, 4 on GOLDp) — nothing renders for them, never 0. */
  primaryRate?: number;
  // ── liquidate rows: the same tx's Liquidation + LiquidationGasComp legs ──
  liquidator?: string;
  collLiquidated?: string;
  debtLiquidated?: string;
  debtRedistributed?: string;
  collRedistributed?: string;
  collSurplus?: string;
  flatComp?: string;
  collateralComp?: string;
  /** Liquidity-pool absorption (`_debtRedistributed == 0`) vs redistribution. */
  spAbsorbed?: boolean;
  // ── transfer rows ──
  fromAddr?: string;
  toAddr?: string;
  /** The transaction sender, lowercased. */
  txFrom?: string;
  raw?: PolarisContextRaw;
  /** True for the position's first event. */
  isOpen?: boolean;
  /** The market's PrimaryRateSet log in force at this touch — the backend's
   *  per-row `LEFT JOIN LATERAL` (rails-server /api/polaris/timeline, plan
   *  §3): the same as-of log `primaryRate` above was read from, named by its
   *  own coordinates. Present exactly when `primaryRate` is (absent on the
   *  rows before the market's first rate event); feeds a rate-step market
   *  note's receipt (lib/shared/market-note.ts) — nothing here changes what
   *  `primaryRate` states. */
  rateSet?: {
    block: number;
    logIndex: number;
    txHash: string;
    txFrom: string;
    timestamp: number;
    /** Count of the market's PrimaryRateSet rows at or before this one. */
    ordinal: number;
  };
  /** pETH priced in the market's stablecoin at this event's own block — the
   *  market's price feed `previewPrice()` (`polaris_oracle_at_block`, the
   *  oracle-at-block lane), the SAME figure the PSM's own mint math
   *  reproduces exactly. It is the feed at the END of the block, not
   *  necessarily the price the row's own transaction saw — a bonding-curve
   *  write later in the same block can move it after the row's own touch
   *  (proven on blocks 11,642,416 / 11,642,274 / 11,642,132). Absent until
   *  the lane has priced the block; the row then carries no pill. */
  priceAtBlock?: {
    /** pETH's price in the market's stablecoin (human-readable). */
    pethInDebt: number;
    /** Exact wei-scale integer string behind `pethInDebt`. */
    raw: string;
    /** usdp priceFeed.previewReservePriceInDebt() — ETH in the market's
     *  stablecoin (human-readable); null on a failed leg. */
    ethInDebt: number | null;
    /** bondingCurve.currentPrice() — pETH in ETH (human-readable); null on a
     *  failed leg. */
    curve: number | null;
    /** ETH/USD medianiser previewExternalPrice() (human-readable); null on a
     *  failed leg. */
    ethUsd: number | null;
    /** XAU/USD medianiser previewExternalPrice() (human-readable); null on a
     *  failed leg, and always null on the USDp market (GOLDp only). */
    xauUsd: number | null;
  };
}

// ───────────────────────── LlamaLend (Curve, Ethereum) detail types ─────────────────────────
//
// LlamaLend is Curve's LLAMMA lending: each Controller is an ISOLATED market
// (one collateral, one borrowed token — crvUSD on most, NOT all), and the
// position grain is (controller, user): a user's positions across controllers
// are margined and liquidated independently. Collateral sits in the market's
// AMM across a BAND of prices [pDown, pUp]; as the oracle price falls through
// the band the AMM converts collateral to the borrowed token continuously —
// SOFT-liquidation, a state the position lives in, not an event. The
// converted amount is a STATE read (`user_state(user).stablecoin`), NOT in
// any event, so the timeline narrates actions while the chain lane carries
// the soft-liq surface.
//
// Controller events: Borrow (collateral_increase, loan_increase — a pure
// add-collateral emits it with loan_increase = 0), Repay (decreases),
// RemoveCollateral, and Liquidate (hard liquidation; indexed [1] is the
// LIQUIDATOR, [2] the borrower — when they are the same address the borrower
// self-liquidated, a normal close from soft-liq). ⚠️ A Liquidate rides with a
// paired Repay of identical amounts in the same tx — the index dedups by leg
// discriminator, or debt double-counts. Each action rides with a UserState
// after-image (collateral, debt, n1, n2 — the emitted ABSOLUTES): the reducer
// is a lag over those, never a running sum. n1/n2 are SIGNED (negatives
// valid).

export type LlamalendEventType =
  | "borrow"
  | "add_collateral"
  | "repay"
  | "remove_collateral"
  // Hard liquidation, the borrower's row: debt written off / collateral (and
  // any already-converted borrowed token) taken. `selfLiquidation` marks the
  // liquidator == borrower case — a close, not a loss to a third party.
  | "liquidation";

export interface LlamalendContextRaw {
  /** Signed collateral delta (raw integer string, collateral-token units). */
  collateralDelta?: string;
  /** Signed debt delta (raw integer string, borrowed-token units). */
  debtDelta?: string;
  /** Liquidation rows — the ALREADY-CONVERTED borrowed token taken from the
   *  position's AMM holdings (the log's stablecoin_received), distinct from
   *  the debt cleared. */
  convertedTaken?: string;
  /** UserState after-image absolutes (raw integer strings). */
  collateralAfter?: string;
  debtAfter?: string;
}

export interface LlamalendContext {
  eventType: LlamalendEventType;
  /** The isolated market's key — the Controller address (lowercase). */
  controller: string;
  collateralSymbol: string;
  collateralDecimals: number;
  borrowedSymbol: string;
  borrowedDecimals: number;
  /** Whether the borrowed token IS crvUSD (~$1) — the ONLY case any surface
   *  reads this market's figures as USD; the others stay in their own token. */
  borrowedIsCrvusd: boolean;
  /** Signed collateral moved (human, scaled) — the event's own emitted field. */
  collateralDelta?: string;
  /** Signed debt moved (human, borrowed-token units). */
  debtDelta?: string;
  /** Liquidation rows — already-converted borrowed token taken alongside the
   *  collateral (a hard liquidation seizes BOTH legs of the AMM holding). */
  convertedTaken?: string;
  /** UserState after-image: the emitted ABSOLUTE collateral/debt after this
   *  tx (human) — the lag lane the position replay rides on. */
  collateralAfter?: string;
  debtAfter?: string;
  /** Band tick pair after this tx (SIGNED ints as strings; negatives valid). */
  n1?: string;
  n2?: string;
  /** Hard-liquidation rows — the Liquidate log's INDEXED liquidator. */
  liquidator?: string;
  /** Which side of a liquidation this row narrates: 'borrower' (done TO the
   *  subject), 'liquidator' (the subject ACTED on someone else's position —
   *  positionUser names the borrower), or 'self' (borrower == liquidator: a
   *  normal close from soft-liquidation). */
  role?: "borrower" | "liquidator" | "self";
  /** liquidator-side rows — the borrower whose position moved. */
  positionUser?: string;
  /** liquidator == borrower: a self-liquidation (closing from soft-liq). */
  selfLiquidation?: boolean;
  /** The transaction sender (signer), lowercased — when the filler has it. */
  txFrom?: string;
  /** The event's own emitted party — V2 controllers only (else absent). */
  caller?: string;
  /** Exact raw integer twins of the scaled fields above. */
  raw?: LlamalendContextRaw;
  /** True for the position's first event. */
  isOpen?: boolean;
}

// ───────────────────────── f(x) Protocol V2 detail types ─────────────────────────
//
// f(x) V2 splits yield-bearing collateral into fxUSD + leveraged xPOSITIONs:
// ERC721 positions on two AaveFundingPools (wstETH / WBTC). Positions are
// SHARES IN A TICK TREE, and three mechanisms mutate every position's real
// collateral/debt with NO per-position event — funding (collateral index fed
// by Aave's borrow index), socialized rebalances (tick- and pool-level; whole
// ticks also migrate silently via TickMovement), and bad-debt write-offs at
// liquidation. So event replay CANNOT state current position state; the
// settled lane (the pool's own getPosition view, swept server-side) carries
// it, and the gap between the replayed running debt and the settled debt is
// rendered as an explicit reconciliation line, never hidden.
//
// UNITS: collDelta is the COLLATERAL TOKEN as emitted (wstETH 18dp / WBTC 8dp);
// liqColls and the settled amounts are RATE-NORMALIZED 1e18 units (stETH-
// equivalent via the pool's token-rate provider); debts are fxUSD everywhere.

export type FxEventType = "operate" | "liquidation" | "transfer" | "tickRebalance";

export interface FxContext {
  eventType: FxEventType;
  /** Pool key ('wsteth' | 'wbtc'). */
  pool: string;
  /** The pool's collateral token display symbol (wstETH / WBTC). */
  poolSymbol: string;
  /** The position NFT id within its pool (integer string). */
  positionId: string;
  /** operate only — signed collateral delta in TOKEN units (human-readable). */
  collDelta?: string;
  /** Signed fxUSD debt delta this event accounted for (human-readable):
   *  operate's deltaDebts, or −(fxUSDDebts + stableDebts) on a liquidation.
   *  A terminal write-off beyond it shows in the settled reconciliation. */
  debtDelta: string;
  /** operate only — protocol fee charged (normalized collateral units, human). */
  protocolFees?: string;
  /** liquidation only — collateral seized (NORMALIZED units, human-readable). */
  liqColls?: string;
  /** liquidation only — fxUSD debt repaid by the liquidator (human-readable). */
  liqFxusdDebts?: string;
  /** liquidation only — stable (USDC-side) debt repaid (human-readable). */
  liqStableDebts?: string;
  /** Same-tx PositionSnapshot: the tick the position sits in after this touch. */
  tick?: number;
  /** Same-tx PositionSnapshot: share values after this touch (raw integer strings
   *  — shares are the position's actual storage, meaningful only vs indices). */
  collShares?: string;
  debtShares?: string;
  /** Same-tx PositionSnapshot: oracle USD price PER NORMALIZED UNIT at this
   *  event's block (human-readable) — a real chain read at a named block. */
  oraclePrice?: string;
  /** Running Σ of event debt deltas AFTER this event (fxUSD, human-readable).
   *  Event-implied — deliberately NOT the position's true debt; the gap vs the
   *  settled debt is the socialized lane. */
  impliedDebtAfter: string;
  /** True for the position's first event (open). */
  isOpen?: boolean;
  /** True when the same-tx snapshot shows zero collateral shares — this touch
   *  emptied the position (own close or full liquidation). */
  emptiesPosition?: boolean;
  /** The transaction sender (signer), lowercased — when the index has it. */
  txFrom?: string;

  // ── ownership lane (pool ERC721 Transfer logs; fx_v2_transfer) ────────────

  /** transfer only — the sending holder (0x0 = mint), lowercased. */
  transferFrom?: string;
  /** transfer only — the receiving holder, lowercased. */
  transferTo?: string;
  /** The owner IN FORCE at this event's block (era-aware, walked from the
   *  transfer lane — a later transfer may have re-homed the position, so a
   *  historic event's owner can differ from the current one). Receipts judge
   *  the third-party verdict against THIS address, never the current owner. */
  ownerAt?: string;
  /** eth_getCode contract-ness of `ownerAt`. f(x)'s Operate has no caller
   *  param, so the two-fact third-party verdict is: tx_from ≠ ownerAt AND
   *  ownerAt is an EOA — a contract owner (Safe, manager) whose signer
   *  differs is SELF-action (lib/shared/external-actor.ts rationale).
   *  Undefined = contract-ness not yet checked → no marking. */
  ownerAtIsContract?: boolean;

  // ── socialized lane (derived: tick-lineage replay of RebalanceTick) ───────
  // Amounts are TICK-level facts — the whole tick's clear, socialized across
  // every position inside; the per-position slice is NOT provable from these
  // logs (the settled reconciliation carries the exact per-position drift).

  /** tickRebalance only — the tick that was rebalanced while this position's
   *  shares sat in it (walked via PositionSnapshot anchors + TickMovement). */
  rebalancedTick?: number;
  /** tickRebalance only — collateral the WHOLE TICK gave up (NORMALIZED
   *  units, human-readable). */
  tickRebColls?: string;
  /** tickRebalance only — fxUSD debt the WHOLE TICK cleared (human). */
  tickRebFxusdDebts?: string;
  /** tickRebalance only — stable-side debt the WHOLE TICK cleared (human). */
  tickRebStableDebts?: string;
}

// ───────────────────────── Fluid (Instadapp) detail types ─────────────────────────
//
// Fluid vault positions are factory-minted ERC721s (the position axis is the
// NFT id — the MakerDAO-cdp pattern), one vault contract per (collateral,
// debt) pair. ONE composite LogOperate event moves either or both legs
// (signed actual token amounts). Liquidations sweep TICK RANGES without
// touching positions and their event carries NO position id — the backend's
// attribution job recovers per-position impact exactly from the vault's own
// settled-position views (fetchLatestPosition at the liquidation block), so
// `liquidated`/`absorbed` rows here are COMPUTED attribution rows whose
// before/after are the protocol's own settlement math, not an emitted field.
// Two lanes, graded differently:
//   • col/debt before/after — the Σ continuity lane (operate deltas + the
//     attribution deltas): exact at liquidation boundaries, interest-blind
//     between events; indexed, never presented as a chain slot.
//   • the settled lane — fluid_position_chain at head (resolver truth:
//     liquidations + accrued interest applied) on the position card.

export type FluidEventType =
  | "deposit"
  | "withdraw"
  | "borrow"
  | "payback"
  | "deposit_borrow"
  | "withdraw_payback"
  | "deposit_payback"
  | "withdraw_borrow"
  | "liquidated"
  | "absorbed"
  | "mint"
  | "transfer";

export interface FluidContextRaw {
  colAmt?: string;
  debtAmt?: string;
  colBefore?: string;
  colAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
  liqSupplyBefore?: string;
  liqSupplyAfter?: string;
  liqBorrowBefore?: string;
  liqBorrowAfter?: string;
}

export interface FluidContext {
  eventType: FluidEventType;
  /** The vault contract (lowercased address) — the (collateral, debt) pair. */
  vault: string;
  /** The factory's sequential vault id. */
  vaultId: string;
  /** 10000 = T1 plain pair; 20000/30000/40000 = smart collateral/debt vaults
   *  whose legs are Fluid DEX pool shares (amounts render as shares). */
  vaultType: number;
  /** Display symbols of the pair (null legs on smart vaults). */
  supplySymbol: string | null;
  borrowSymbol: string | null;
  /** The position NFT id (integer string). */
  nftId: string;
  /** Signed collateral delta in supply-token units (human-readable). */
  colDelta?: string;
  /** Signed debt delta in borrow-token units (human-readable). */
  debtDelta?: string;
  /** Σ continuity lane before/after (human-readable; see the header note). */
  colBefore?: string;
  colAfter?: string;
  debtBefore?: string;
  debtAfter?: string;
  /** liquidated/absorbed only — the vault's OWN settled before/after across
   *  the liquidation block (exact; includes partial liquidation math). */
  liqSupplyBefore?: string;
  liqSupplyAfter?: string;
  liqBorrowBefore?: string;
  liqBorrowAfter?: string;
  /** liquidated only — the liquidator (lowercased); absorbed has none. */
  liquidator?: string;
  /** liquidated/absorbed only — which source event kind attributed this row. */
  liqSource?: "liquidate" | "absorb";
  /** The vault's OWN oracle read at this event's block (mig 114) — Fluid prices
   *  collateral IN THE DEBT TOKEN and runs no USD feed anywhere, so this is the
   *  only valuation the protocol offers and the exact space its liquidation
   *  engine judges in. Present on T1 liquidation blocks the filler has reached;
   *  absent on smart vaults (DEX-share legs, no oracle in that layout) and
   *  wherever decimals are unknown — the card stays token-only there.
   *  `liquidationPenaltyPct` is the vault's own constant at the same block, the
   *  figure the realized premium should reproduce. */
  oraclePriceAtBlock?: {
    debtPerCol: number;
    /** Which getter answered: the operate/liquidate split, or the older single
     *  rate on oracles predating it (which IS the liquidate price there). */
    source: "fluid-oracle-liquidate" | "fluid-oracle";
    /** The oracle contract the vault was configured with at this block. */
    oracle: string;
    liquidationPenaltyPct?: number;
  };
  /** True when this liquidation zeroed the position. */
  fullyLiquidated?: boolean;
  /** operate only — msg.sender (owner or an automation contract), lowercased. */
  initiator?: string;
  /** The position's owner AT this event (era owner via NFT transfers). */
  ownerAt?: string;
  /** mint/transfer only — the NFT move parties. */
  transferFrom?: string;
  transferTo?: string;
  /** The transaction sender (signer), lowercased — when the filler has it. */
  txFrom?: string;
  /** Exact uint256/int256 twins of the scaled fields above. */
  raw?: FluidContextRaw;
  /** True for the position's first event. */
  isOpen?: boolean;
}

// ───────────────────────── Maple Finance (syrup pools) detail types ─────────────────────────
//
// Maple V2's lender side: ERC-4626 pool tokens (syrupUSDC / syrupUSDT) whose
// share price is the protocol's own on-chain bookkeeping of an off-chain-
// collateralized loan book, plus a FIFO withdrawal queue. A position is one
// wallet's shares in one pool. Three replay lanes, graded differently:
//   • share balance — EXACT (transfer-leg replay; equals balanceOf at every
//     block, archive-verifiable — deposit mints, queue escrow, cancels,
//     wallet↔wallet moves all included).
//   • escrowed — shares sitting at the queue WithdrawalManager awaiting
//     processing; part of the position, exits at the exit rate when filled.
//   • deposited principal — Σ(deposit − withdraw − fill) assets, amounts-only
//     (no on-chain slot holds it; a full exit nets negative by earned
//     interest).
// Deposit / Withdraw / RequestProcessed carry BOTH assets and shares, so
// every value-bearing event is self-priced by its own log.

export type MapleEventType =
  | "deposit"
  | "withdraw"
  | "request"
  | "request_decrease"
  | "request_cancel"
  | "request_fill"
  | "transfer_in"
  | "transfer_out";

export interface MapleContextRaw {
  assets?: string;
  shares?: string;
  sharesBefore?: string;
  sharesAfter?: string;
  escrowBefore?: string;
  escrowAfter?: string;
  principalBefore?: string;
  principalAfter?: string;
}

export interface MapleContext {
  eventType: MapleEventType;
  /** Pool key ('syrupusdc' | 'syrupusdt'). */
  pool: string;
  /** The pool share token's display symbol (syrupUSDC / syrupUSDT). */
  poolSymbol: string;
  /** The funds asset's display symbol (USDC / USDT). */
  assetSymbol: string;
  /** Signed funds-asset amount this event moved (human-readable): deposits +,
   *  withdraws/fills −. Absent on requests/cancels/transfers — those move
   *  shares, not assets. */
  assetsDelta?: string;
  /** Signed share movement in WALLET-BALANCE terms (human-readable): deposit
   *  +, direct withdraw −, escrow −, cancel-return +, transfers ±. A queue
   *  fill is 0 (the shares burn from the WithdrawalManager's escrow). */
  sharesDelta?: string;
  /** Queue rows only — the request's id (FIFO position is by id order). */
  requestId?: string;
  /** Queue rows only — the shares this row escrowed / returned / filled. */
  requestShares?: string;
  /** Share balance before/after — the transfer-leg replay (= balanceOf). */
  sharesBefore?: string;
  sharesAfter?: string;
  /** Escrowed-in-queue shares before/after. */
  escrowBefore?: string;
  escrowAfter?: string;
  /** Deposited-principal lane before/after (amounts-only, clamped). */
  principalBefore?: string;
  principalAfter?: string;
  /** The transaction sender (signer), lowercased — when the filler has it. */
  txFrom?: string;
  /** The event's own emitted party, lowercased: Deposit/Withdraw `caller`, or
   *  a transfer counterparty. Third-party marking compares owner vs txFrom vs
   *  this. */
  caller?: string;
  /** transfer_in/out only — the other wallet. */
  counterparty?: string;
  /** Exact uint256 twins of the scaled fields above. */
  raw?: MapleContextRaw;
  /** True for the wallet's first event. */
  isOpen?: boolean;
}

// ProtocolContext is designed to grow as new protocol transformers come
// online. When a new protocol gets a transformer, add a discriminant arm
// below; the frontend duplicate must mirror the addition. The set of ids is
// the union of those arms — `ProtocolContext["protocol"]` — and is not
// restated as a standalone type, which could drift from the arms it names.

/** Full protocol-specific detail, discriminated by `protocol`. */
export type ProtocolContext =
  | { protocol: "liquity-v2-troves"; data: LiquityContext }
  | { protocol: "aave-v4"; data: AaveV4Context }
  | { protocol: "aave-v3"; data: AaveV3Context }
  | { protocol: "makerdao"; data: MakerDAOContext }
  | { protocol: "maple"; data: MapleContext }
  | { protocol: "moonwell"; data: MoonwellContext }
  | { protocol: "morpho"; data: MorphoContext }
  | { protocol: "spark"; data: SparkContext }
  | { protocol: "compound"; data: CompoundContext }
  | { protocol: "compound-v2"; data: CompoundV2Context }
  | { protocol: "dolomite"; data: DolomiteContext }
  | { protocol: "frankencoin"; data: FrankencoinContext }
  | { protocol: "llamalend"; data: LlamalendContext }
  | { protocol: "pwn"; data: PwnContext }
  | { protocol: "liquity-v1"; data: LiquityV1Context }
  | { protocol: "ebisu"; data: EbisuContext }
  | { protocol: "asymmetry"; data: AsymmetryContext }
  | { protocol: "basedollar"; data: BasedollarContext }
  | { protocol: "fx"; data: FxContext }
  | { protocol: "fluid"; data: FluidContext }
  | { protocol: "polaris"; data: PolarisContext }
  | { protocol: "other"; data: OtherContext };

// ───────────────────────── The unified event ─────────────────────────

export interface BaseActivityEvent {
  /** Unique ID — typically txHash + ":" + logIndex. */
  id: string;

  // ── On-chain coordinates ──
  txHash: string;
  blockNumber: number;
  /** Unix timestamp in seconds. */
  timestamp: number;

  // ── Who and where ──
  /** Initiating wallet address (lowercase). */
  wallet: string;

  // ── What happened ──
  /** Protocol-specific but consistent within each protocol (e.g. "openTrove"). */
  actionType: string;
  /** Human display label (e.g. "Open Trove"). */
  actionLabel: string;

  // ── Token movements ──
  flows: AssetFlow[];

  // ── Costs ──
  gas?: GasCost;

  // ── Links ──
  etherscanUrl: string;

  /** Set (only ever `true`) when a token this event names could not be read on
   *  chain, so its symbol or decimals are a stand-in. The CSV export refuses an
   *  event carrying it (lib/shared/events-to-csv.ts). */
  tokenMetaUnresolved?: true;

  // ── Protocol-specific detail ──
  //
  // `context.protocol` is the discriminant every type guard below reads — an
  // event's protocol is stated here and nowhere else. A second top-level
  // `protocol` field used to restate it on every row; nothing ever read it, so
  // it no longer travels. A `hidden` flag was declared here too and was never
  // set by any transform nor read by any surface; it is gone with it.
  context?: ProtocolContext;
}

// ───────────────────────── Type guards ─────────────────────────

export function isLiquityEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "liquity-v2-troves"; data: LiquityContext };
} {
  return (
    e.context?.protocol === "liquity-v2-troves" &&
    !!(e.context.data as LiquityContext)?.collateralType
  );
}

export function isAaveV4Event(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "aave-v4"; data: AaveV4Context };
} {
  return e.context?.protocol === "aave-v4";
}

export function isAaveV3Event(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "aave-v3"; data: AaveV3Context };
} {
  return e.context?.protocol === "aave-v3";
}

export function isMakerDAOEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "makerdao"; data: MakerDAOContext };
} {
  return e.context?.protocol === "makerdao";
}

export function isMapleEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "maple"; data: MapleContext };
} {
  return e.context?.protocol === "maple";
}

export function isMoonwellEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "moonwell"; data: MoonwellContext };
} {
  return e.context?.protocol === "moonwell";
}

export function isCompoundV2Event(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "compound-v2"; data: CompoundV2Context };
} {
  return e.context?.protocol === "compound-v2";
}

export function isDolomiteEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "dolomite"; data: DolomiteContext };
} {
  return e.context?.protocol === "dolomite";
}

export function isFrankencoinEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "frankencoin"; data: FrankencoinContext };
} {
  return e.context?.protocol === "frankencoin";
}

export function isPolarisEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "polaris"; data: PolarisContext };
} {
  return e.context?.protocol === "polaris";
}

export function isLlamalendEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "llamalend"; data: LlamalendContext };
} {
  return e.context?.protocol === "llamalend";
}

export function isMorphoEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "morpho"; data: MorphoContext };
} {
  return e.context?.protocol === "morpho";
}

export function isSparkEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "spark"; data: SparkContext };
} {
  return e.context?.protocol === "spark";
}

export function isCompoundEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "compound"; data: CompoundContext };
} {
  return e.context?.protocol === "compound";
}

export function isPwnEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "pwn"; data: PwnContext };
} {
  return e.context?.protocol === "pwn";
}

export function isLiquityV1Event(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "liquity-v1"; data: LiquityV1Context };
} {
  return e.context?.protocol === "liquity-v1";
}

export function isEbisuEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "ebisu"; data: EbisuContext };
} {
  return e.context?.protocol === "ebisu";
}

export function isBasedollarEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "basedollar"; data: BasedollarContext };
} {
  return e.context?.protocol === "basedollar";
}

export function isAsymmetryEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "asymmetry"; data: AsymmetryContext };
} {
  return e.context?.protocol === "asymmetry";
}

export function isFxEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "fx"; data: FxContext };
} {
  return e.context?.protocol === "fx";
}

export function isFluidEvent(
  e: BaseActivityEvent,
): e is BaseActivityEvent & {
  context: { protocol: "fluid"; data: FluidContext };
} {
  return e.context?.protocol === "fluid";
}

