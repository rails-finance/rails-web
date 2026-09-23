// Aave V3 ON-CHAIN VALUES provenance vocabulary (template tier).
// ----------------------------------------------------------------------------
// The lean sibling of lib/aave-v3/position-provenance.ts. That file speaks the
// bespoke interpreted view's grammar (replayed snapshots, oracle USD pills,
// rate reads). This one speaks the chain-state tier's: every position
// value is a replayed sum of Aave V3 Pool event fields (Supply / Withdraw /
// Borrow / Repay / LiquidationCall `amount`), so it is `kind:"chain"` and IS the
// chain-state surface — health factor, USD, APR and liquidation price are absent
// (they are the interpreted layers, retained but off this baseline).
//
// A near-clone of lib/spark/event-provenance.ts — SparkLend is an Aave V3 fork,
// so the event fields named here are identical; only the contract (the V3 Pool,
// per market) differs.
//
// The running balances these receipts describe are the events replay's, which
// the backend serves as a sealed tail plus a live head (server mig 175; the old
// mv_aave_v3_events is dropped). Two care points the prose has to carry, both
// read off the replay's own CASE arms (server mig 272): the running total is
// held at zero rather than going negative, and a liquidation subtracts the
// seized collateral only when the liquidator did NOT take the aTokens — when it
// did, the aToken transfer row carries the same movement and subtracting both
// would count it twice. The card's balances come from a different lane (the
// scaled-delta reduction, decisions 0008/0011) and say so.

import type { V3PoolIdentity } from "./pool-context";
import type { Provenance, ProvInput, ProvScaling, ProvVerify } from "@/components/shared/provenance";
import type {
  AaveV3SwapDetail,
  AaveV3SwapLegAction,
  AaveV3SwapPoolEvent,
  OriginEnvelope,
} from "@/lib/shared/types/event-shape";
import { AAVE_V3_POOL, AAVE_V3_ORACLE } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { getProtocolContract, type ProtocolContract } from "@/lib/shared/known-infrastructure";

// The DEFAULT Pool a receipt names. Event-level receipts override it from the
// coords (see `poolOf`), because the same cards render Core, Prime, EtherFi,
// Aave V3 Base and Seamless — five Pools on two chains. The tower-level
// receipts below take no coords and are overridden through the vocabulary seam
// (AaveV3TowerVocabulary) instead.
const POOL = { name: "Aave V3 Pool", address: AAVE_V3_POOL };

const poolOf = (coords?: V3Coords): { name: string; address: string } => coords?.pool ?? POOL;

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
// Custody of an EVENT-level value: which store the decoded log reached the page
// through. The two lanes genuinely differ and the receipt has to say which one
// it is looking at — on Base there is no rails-server index behind these cards,
// there is a live sweep of the chain's own logs, and naming an index that does
// not exist is exactly the kind of claim a provenance receipt must never make.
const V3_INDEX_VIA = "rails-server index of decoded Aave V3 logs";
const V3_SWEEP_VIA = "live chunked eth_getLogs sweep of the Pool's own logs";

const captureVia = (coords?: V3Coords): string => (coords?.source === "sweep" ? V3_SWEEP_VIA : V3_INDEX_VIA);

export interface V3Coords {
  txHash?: string;
  blockNumber?: number;
  reserve?: string;
  wallet?: string;
  /** Which chain this event is on — decides which block explorer the "confirm
   *  in the tx event logs" link resolves against. Defaults to Ethereum, so
   *  every L1 call site renders the exact href it rendered before this
   *  existed. A Base card that omitted it would hand the reader a receipt that
   *  cannot be followed: an Etherscan URL for a transaction Etherscan has
   *  never seen. Components read it from the route's ChainProvider. */
  chainId?: ChainId;
  /** The Pool that emitted this event — what the receipt names as the contract
   *  and links to on the coords' chain. Defaults to Ethereum's Core Pool, which
   *  is what every pre-existing call site rendered. Components read it from the
   *  route's V3PoolProvider — the identity itself, so the prose can also read
   *  which protocol the Pool belongs to. */
  pool?: V3PoolIdentity;
  /** How the decoded log reached the page: through the rails-server index
   *  (default), or through a live chain sweep (Base, which has no index). Only
   *  the receipt's custody line differs — the value is the same log either
   *  way. */
  source?: "index" | "sweep";
}

/** Log-anatomy via segment: `field: <raw>` when the index delivered the log's
 *  raw integer, plain `field` until it does (the Liquity fieldSeg pattern).
 *  Raws pass through untouched — never rebuilt from the rounded float. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Log-anatomy via segment from the origin envelope (ctx.origin.*) when the
 *  transform stamped one — the envelope is AUTHORITATIVE (event · param · raw
 *  · ÷10^scale, declared beside the column projection); the hand-written
 *  fallback segment survives only for pre-envelope responses. */
const originSeg = (o: OriginEnvelope | null | undefined, fallback: string): string =>
  o ? `${o.event} log · ${fieldSeg(o.param, o.raw)} · ÷10^${o.scale}` : fallback;

/** The scaling sentence for a value that IS one delivered log field: the
 *  envelope's untouched integer and the reserve's decimals (receipts grammar
 *  §5). No envelope, no raw, no sentence — never rebuilt from the scaled
 *  float. A value summed from several logs carries none; its via states the
 *  sum. */
const scalingOf = (o: OriginEnvelope | null | undefined, sym: string): ProvScaling | undefined =>
  o?.raw == null || o.raw === ""
    ? undefined
    : { raw: o.raw, places: o.scale, why: `${sym} amounts have ${o.scale} decimal places` };

/** Block-explorer tx-logs link for an emitted event field — zero-RPC, link
 *  only. `kind: "etherscan"` names the RENDERER's link treatment, not the site:
 *  the href follows the coords' chain, so a Base event links to Basescan. */
const txVerify = (coords?: V3Coords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(coords.chainId ?? MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

function eventInputs(coords: V3Coords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.reserve)
    inputs.push({ label: "reserve", value: coords.reserve, kind: "chain", note: "reserve token address" });
  if (coords?.wallet) inputs.push({ label: "wallet", value: coords.wallet, kind: "chain", note: "position owner" });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash)
    inputs.push({
      label: "tx",
      value: coords.txHash,
      kind: "chain",
      note: "indexed log",
    });
  return inputs;
}

/** Signed amount of the reserve token this event moved (the event's `amount`).
 *  `raw` is the log's own uint256 string (ctx.raw.amount) — rendered on the
 *  via line when the index delivers it. */
export const assetsDeltaProv = (
  sym: string,
  side: "supply" | "debt",
  coords: V3Coords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this operation moved on the ${side === "supply" ? "supplied" : "borrowed"} side — the amount the Pool wrote into this event's log.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · ${originSeg(origin, fieldSeg("amount", raw))}`,
  scaling: scalingOf(origin, sym),
  inputs: eventInputs(coords),
});

/** Third-party action: the parties behind an event the owner didn't execute.
 *  Both leaves are chain facts — the transaction envelope's `from` and the
 *  event's own party param (Supply/Borrow `user`, Repay `repayer` = msg.sender
 *  at the Pool); the "someone else" judgment is their comparison against the
 *  owner, hence chain-derived. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; poolCaller: string },
  coords: V3Coords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType} was made by a third party — the account that signed the transaction and the account that called the Pool are both on the chain's record, and neither is the position's owner. A routed flow keeps the owner as the signer, and a contract-owned position keeps the owner as the Pool's caller; this event has the owner as neither.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · tx envelope from + ${args.eventType === "repay" ? "repayer" : "user"} param vs owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved (onBehalfOf)" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "Pool caller",
      value: args.poolCaller,
      kind: "chain",
      note: "msg.sender at the Pool (the event's party param)",
    },
  ]),
});

/** The seized collateral on a LiquidationCall (`liquidatedCollateralAmount`). */
export const seizedCollateralProv = (
  sym: string,
  coords: V3Coords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Collateral (${sym}) seized in this liquidation — the amount the Pool wrote into the liquidation's log as the collateral the liquidator took.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · ${originSeg(origin, `LiquidationCall log · ${fieldSeg("liquidatedCollateralAmount", raw)}`)}`,
  scaling: scalingOf(origin, sym),
  inputs: eventInputs(coords),
});

/** The debt covered on a LiquidationCall (`debtToCover`). */
export const debtRepaidProv = (
  sym: string,
  coords: V3Coords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Debt (${sym}) repaid by the liquidator — the amount the Pool wrote into the liquidation's log as the debt this call cleared.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · ${originSeg(origin, `LiquidationCall log · ${fieldSeg("debtToCover", raw)}`)}`,
  scaling: scalingOf(origin, sym),
  inputs: eventInputs(coords),
});

/** The debt written off on a DeficitCreated (`amountCreated`): the part of a
 *  liquidated account's debt the Pool burned because no collateral was left
 *  to seize for it. Not a repayment by anyone. */
export const writtenOffDebtProv = (
  sym: string,
  coords: V3Coords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Debt (${sym}) the Pool wrote off as bad debt — the part of this account's debt that no collateral was left to cover, as the Pool wrote it into the log. Nobody repaid it: the debt tokens were burned and the amount stands as the reserve's deficit.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · ${originSeg(origin, `DeficitCreated log · ${fieldSeg("amountCreated", raw)}`)}`,
  scaling: scalingOf(origin, sym),
  inputs: eventInputs(coords),
});

/** The underlying moved by an aToken transfer between two accounts — the
 *  BalanceTransfer log's scaled value × the liquidity index the SAME log
 *  emitted (the underlying worth of the aTokens at that moment). Both leaves
 *  are params of one log; the multiplication is ours, hence chain-derived.
 *  A position move, not a supply/withdraw — custody changes hands and the
 *  value never leaves the Pool. */
export const transferDeltaProv = (sym: string, dir: "in" | "out", coords: V3Coords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this transfer moved ${dir === "in" ? "into" : "out of"} the position — the aToken's transfer log carries a scaled figure and the reserve's liquidity index at that moment; the two multiplied, rounded down, are the ${sym} the aTokens stood for. The position changed hands between two accounts: no supply, no withdrawal, and the value never left the Pool.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · BalanceTransfer log · value × index`,
  formula: "scaled value × index at transfer",
  inputs: eventInputs(coords, [
    { label: "value", kind: "chain", pclass: "emitted", note: "BalanceTransfer `value` (scaled units)" },
    { label: "index", kind: "chain", pclass: "emitted", note: "BalanceTransfer `index` (liquidity index, ray)" },
  ]),
});

/** The OTHER account in an aToken transfer — the sender on an _in (the log's
 *  `from`), the recipient on an _out (the log's `to`). A counterparty of the
 *  move itself, not a verdict about who signed. When the known-infrastructure
 *  registry names the address, the receipt adds where the name comes from: the
 *  address is the log's fact, the name is Rails' claim. */
export const transferCounterpartyProv = (dir: "in" | "out", coords: V3Coords, counterparty?: string): Provenance => {
  const chainId = coords.chainId ?? MAINNET_CHAIN_ID;
  const named = counterparty ? getProtocolContract(counterparty, chainId) : undefined;
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${dir === "in" ? "sending" : "receiving"} account on the other side of this transfer — the address the aToken's transfer log names as the ${dir === "in" ? "sender" : "recipient"}. It is the other side of the move; who signed the transaction is a separate question.${named ? ` Rails names the address ${named.name}: its verified contract source is \`${named.contractName}\`, ${named.role}.` : ""}`,
    contract: poolOf(coords),
    via: `${captureVia(coords)} · BalanceTransfer log · ${dir === "in" ? "from" : "to"}`,
    inputs: eventInputs(
      coords,
      named && counterparty ? [counterpartyNameInput(named, explorerUrl(chainId, "address", counterparty))] : [],
    ),
  };
};

/** A swap leg's sign on its own axis: aTokens sent and debt repaid shrink it;
 *  aTokens received, a supply and a borrow grow it. */
export const swapLegSign = (action: AaveV3SwapLegAction, kind?: AaveV3SwapDetail["kind"]): 1 | -1 =>
  action === "transfer_out" || action === "repay" || (action === "trade" && kind === "supply_from_swap") ? -1 : 1;

/** A swap leg's figure, receipted as the index row it was: the BalanceTransfer
 *  derivation for an aToken leg, the Pool log's own amount for a Pool leg, and
 *  the Trade's `buyAmount` for a withdraw and swap's bought token. Pass `kind`
 *  on the given leg: a withdraw and swap's aTokens left the Pool. Pass `net`
 *  (swapLegNet) where a leftover nets into the leg: the figure is then the
 *  rows' difference. Pass `venue` (the swap) where its route decides the
 *  receipt: a ParaSwap withdraw and swap's aTokens went to the adapter, and what
 *  it bought is the adapter's Swapped log (server mig 254). */
export const swapLegProv = (
  sym: string,
  action: AaveV3SwapLegAction,
  coords: V3Coords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
  kind?: AaveV3SwapDetail["kind"],
  net?: AaveV3SwapPoolEvent[],
  venue?: Pick<AaveV3SwapDetail, "route" | "adapter">,
): Provenance =>
  net
    ? swapNetProv(sym, action, coords, net)
    : action === "trade"
      ? kind === "supply_from_swap"
        ? swapSoldProv(sym, coords, raw)
        : venue?.route === "paraswap"
          ? swapParaswapBoughtProv(sym, coords, raw, venue.adapter)
          : swapBoughtProv(sym, coords, raw)
      : action === "transfer_out" && kind === "withdraw_and_swap"
        ? swapWithdrawnProv(sym, coords, venue?.route === "paraswap")
        : action === "transfer_in" && kind === "supply_from_swap"
          ? swapSuppliedProv(sym, coords)
          : action === "transfer_out" || action === "transfer_in"
            ? transferDeltaProv(sym, action === "transfer_in" ? "in" : "out", coords)
            : assetsDeltaProv(sym, action === "supply" ? "supply" : "debt", coords, raw, origin);

/** A leg's rows when a leftover nets into it (server mig 248), else undefined. */
export const swapLegNet = (swap: AaveV3SwapDetail, leg: "given" | "received"): AaveV3SwapPoolEvent[] | undefined =>
  swap.events?.some((e) => e.leg === leg && e.leftover) ? swap.events.filter((e) => e.leg === leg) : undefined;

const POOL_LOG: Record<AaveV3SwapPoolEvent["action"], string> = {
  transfer_out: "BalanceTransfer",
  supply: "Supply",
  borrow: "Borrow",
  repay: "Repay",
};

/** A netted leg: its own row less the leftover that returned what the swap did
 *  not use. Every operand is a log's figure; the subtraction is ours. */
const swapNetProv = (
  sym: string,
  action: AaveV3SwapLegAction,
  coords: V3Coords,
  rows: AaveV3SwapPoolEvent[],
): Provenance => {
  const borrowed = action === "borrow";
  return {
    kind: "chain-derived",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: borrowed
      ? `The ${sym} this debt swap left borrowed — the amount the Pool wrote into the borrow's log, less the ${sym} the ParaSwap adapter repaid at once out of what the swap did not use. It is the change in this position's ${sym} debt across the swap.`
      : `The ${sym} this swap took from the position — the aTokens sent to the ParaSwap adapter (the transfer log's scaled figure times the reserve's liquidity index at that moment), less the ${sym} the adapter supplied back out of what the swap did not use. It is the change in this position's supplied ${sym} across the swap.`,
    contract: poolOf(coords),
    via: `${captureVia(coords)} · ${rows.map((r) => `${POOL_LOG[r.action]} log`).join(" − ")}`,
    formula: borrowed ? "borrowed − repaid back" : "sent − supplied back",
    inputs: eventInputs(
      coords,
      rows.map((r) => ({
        label: r.leftover ? (r.action === "repay" ? "repaid back" : "supplied back") : borrowed ? "borrowed" : "sent",
        ...(r.raw ? { value: r.raw } : {}),
        kind: "chain" as const,
        pclass: "emitted" as const,
        note:
          r.action === "transfer_out"
            ? "BalanceTransfer `value` × `index` (underlying units)"
            : `${POOL_LOG[r.action]} \`amount\``,
      })),
    ),
  };
};

/** A withdraw and swap's given leg: the aTokens sent to CoW Protocol's
 *  settlement, or to ParaSwap's withdraw swap adapter (server mig 254), which
 *  withdrew the underlying in its own name and sold it. */
const swapWithdrawnProv = (sym: string, coords: V3Coords, paraswap: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this withdraw and swap took out of the position — the aToken's transfer log carries a scaled figure and the reserve's liquidity index at that moment; the two multiplied are the ${sym} the aTokens stood for. ${
    paraswap
      ? `The aTokens went to ParaSwap's withdraw swap adapter, which drew the ${sym} out of the Pool under its name and sold it through ParaSwap.`
      : `The aTokens went to CoW Protocol's settlement under the order this account signed, and the settlement drew the ${sym} out of the Pool under its name and sold it.`
  }`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · BalanceTransfer log · value × index`,
  formula: "scaled value × index at transfer",
  inputs: eventInputs(coords, [
    { label: "value", kind: "chain", pclass: "emitted", note: "BalanceTransfer `value` (scaled units)" },
    { label: "index", kind: "chain", pclass: "emitted", note: "BalanceTransfer `index` (liquidity index, ray)" },
  ]),
});

/** What a withdraw and swap's order bought: the Trade log's `buyAmount`. It went
 *  to the order's receiver, outside the position. */
const swapBoughtProv = (sym: string, coords: V3Coords, raw?: string | null): Provenance => {
  const named = getProtocolContract(GPV2_SETTLEMENT, coords.chainId ?? MAINNET_CHAIN_ID);
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${sym} the order bought — the amount CoW Protocol's settlement wrote into its trade log as bought. It went to the order's receiver, so no balance in this position moved by it.`,
    contract: { name: named?.name ?? "GPv2Settlement", address: GPV2_SETTLEMENT },
    via: `rails-server index of GPv2Settlement Trade logs · Trade log · ${fieldSeg("buyAmount", raw)}`,
    inputs: eventInputs(coords, [
      ...(raw
        ? [
            {
              label: "buyAmount",
              value: raw,
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: "Trade `buyAmount`",
            },
          ]
        : []),
    ]),
  };
};

/** What a ParaSwap withdraw and swap bought: the withdraw swap adapter's Swapped
 *  log `receivedAmount`, which the adapter sent to the caller's wallet (server mig 254). */
const swapParaswapBoughtProv = (sym: string, coords: V3Coords, raw?: string | null, adapter?: string): Provenance => {
  const named = adapter ? getProtocolContract(adapter, coords.chainId ?? MAINNET_CHAIN_ID) : undefined;
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${sym} the swap bought — the amount ParaSwap's withdraw swap adapter wrote into the log it keeps as received. The adapter sent it to this account's wallet, so no balance in this position moved by it.`,
    contract: { name: named?.name ?? "ParaSwap adapter", address: adapter ?? "" },
    via: `rails-server index of the adapter's Swapped logs · Swapped log · ${fieldSeg("receivedAmount", raw)}`,
    inputs: eventInputs(
      coords,
      raw
        ? [
            {
              label: "receivedAmount",
              value: raw,
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: "Swapped `receivedAmount`",
            },
          ]
        : [],
    ),
  };
};

/** A supply from a swap's one row: the aTokens CoW Protocol's settlement sent to
 *  the position under the order its owner signed (server mig 250). */
const swapSuppliedProv = (sym: string, coords: V3Coords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this supply from a swap put into the position — the aToken's transfer log carries a scaled figure and the reserve's liquidity index at that moment; the two multiplied are the ${sym} the aTokens stood for. CoW Protocol's settlement bought the aTokens under the order this account signed and sent them here.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · BalanceTransfer log · value × index`,
  formula: "scaled value × index at transfer",
  inputs: eventInputs(coords, [
    { label: "value", kind: "chain", pclass: "emitted", note: "BalanceTransfer `value` (scaled units)" },
    { label: "index", kind: "chain", pclass: "emitted", note: "BalanceTransfer `index` (liquidity index, ray)" },
  ]),
});

/** What a supply from a swap's order sold: the Trade log's `sellAmount` plus its
 *  `feeAmount`, which left the owner's wallet, not the position (mig 250). */
const swapSoldProv = (sym: string, coords: V3Coords, raw?: string | null): Provenance => {
  const named = getProtocolContract(GPV2_SETTLEMENT, coords.chainId ?? MAINNET_CHAIN_ID);
  return {
    kind: "chain-derived",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${sym} the order sold — the amount CoW Protocol's settlement wrote into its trade log as sold, plus the fee it wrote beside it. It came out of this account's wallet, so no balance in this position moved by it.`,
    contract: { name: named?.name ?? "GPv2Settlement", address: GPV2_SETTLEMENT },
    via: `rails-server index of GPv2Settlement Trade logs · Trade log · sellAmount + feeAmount${raw ? ` = ${raw}` : ""}`,
    formula: "sellAmount + feeAmount",
    inputs: eventInputs(
      coords,
      raw
        ? [
            {
              label: "sold",
              value: raw,
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: "Trade `sellAmount` + `feeAmount`",
            },
          ]
        : [],
    ),
  };
};

/** Who owned a swap's Trade, and how its amounts bound the position's legs, per
 *  kind (server migs 243, 245). */
const SWAP_OWNER: Record<AaveV3SwapDetail["kind"], string> = {
  collateral_swap:
    "the owner is a one-order contract the Aave app created, which took this position's aTokens and supplied what it bought back to the position",
  debt_swap:
    "the owner is a one-order contract the Aave app created, which borrowed on this position's behalf and repaid its other debt with what it bought",
  repay_with_collateral:
    "the owner is a one-order contract the Aave app created, which took this position's aTokens and repaid its debt with what it bought",
  withdraw_and_swap: "the owner is this position's account, which signed the order",
  supply_from_swap: "the owner is this position's account, which signed the order",
};
const swapAmountRule = (swap: AaveV3SwapDetail): string =>
  swap.kind === "debt_swap"
    ? `the Trade sold no more than the position borrowed and bought no less than it repaid, each to within 2 wei${swap.exact ? " (here, both to the wei)" : ""}`
    : swap.kind === "repay_with_collateral"
      ? `the Trade sold no more than the aTokens the position gave and bought no less than it repaid, each to within 2 wei${swap.exact ? " (here, both to the wei)" : ""}`
      : swap.kind === "withdraw_and_swap"
        ? `the aTokens the position gave equal the Trade's sell amount to within 2 wei${swap.exact ? " (here, to the wei)" : ""}, and the Trade bought a token that is no Aave aToken`
        : swap.kind === "supply_from_swap"
          ? `the aTokens the position received equal the Trade's buy amount to within 2 wei${swap.exact ? " (here, to the wei)" : ""}, and the Trade sold a token that is no Aave aToken`
          : `each leg equals the Trade to within 2 wei${swap.exact ? " (here, to the wei)" : ""}`;

/** GPv2Settlement, whose Trade log pairs a CoW position swap's two legs. */
export const GPV2_SETTLEMENT = "0x9008d19f58aabd9ed0d60971565aa8510560ab41";

/** The party a swap's venue chip names: CoW Protocol's settlement, or on the
 *  ParaSwap route the adapter that made the legs, read as "ParaSwap". */
export const swapVenueParty = (
  swap: AaveV3SwapDetail,
  chainId: ChainId,
): { address: string; name: string; protocolIcon?: string } => {
  if (swap.route === "paraswap" && swap.adapter)
    return { address: swap.adapter, name: "ParaSwap", protocolIcon: "paraswap" };
  const named = getProtocolContract(GPV2_SETTLEMENT, chainId);
  return { address: GPV2_SETTLEMENT, name: named?.name ?? "CoW Protocol", protocolIcon: named?.protocolIcon };
};

/** What a ParaSwap adapter did for the position, per kind (server mig 248). */
const PARASWAP_SHAPE: Record<AaveV3SwapDetail["kind"], string> = {
  collateral_swap: "it took this position's aTokens in one reserve and supplied another reserve back to it",
  debt_swap: "it borrowed one reserve on this position's behalf and repaid the position's debt in another",
  repay_with_collateral: "it took this position's aTokens in one reserve and repaid the position's debt in another",
  withdraw_and_swap: "it took this position's aTokens",
  supply_from_swap: "it put aTokens into this position",
};
const PARASWAP_LEFTOVER: Partial<Record<AaveV3SwapDetail["kind"], string>> = {
  debt_swap:
    "What the swap did not use, it repaid at once in the borrowed reserve; the card nets that repay into the borrow.",
  repay_with_collateral:
    "What the swap did not use, it supplied back in the same reserve; the card nets that supply into the aTokens sent.",
};

/** A ParaSwap swap's venue: the adapter that made both legs' Pool calls, which
 *  emits no trade log, so its identity is the pairing (server mig 248). */
const paraswapVenueProv = (coords: V3Coords, swap: AaveV3SwapDetail, adapter: string): Provenance => {
  const chainId = coords.chainId ?? MAINNET_CHAIN_ID;
  const named = getProtocolContract(adapter, chainId);
  const nameInput = named ? [counterpartyNameInput(named, explorerUrl(chainId, "address", adapter))] : [];
  // The withdraw swap adapter does emit a log: its row pairs to that (mig 254).
  if (swap.kind === "withdraw_and_swap")
    return {
      kind: "chain",
      pclass: "emitted",
      verify: txVerify(coords),
      summary: `The ParaSwap adapter that carried this swap — the adapter's log names the token it swapped, the token it bought and both amounts, and this position's row is paired to that log: the aTokens this account sent the adapter are the token the log names as swapped, and match the amount it names to within two wei${swap.exact ? " (here, to the wei)" : ""}, in the same transaction. A shared transaction alone does not make the pairing.`,
      contract: { name: named?.name ?? "ParaSwap adapter", address: adapter },
      via: "rails-server index of the adapter's Swapped logs · paired to the position's row by transaction, token and amount",
      inputs: eventInputs(coords, nameInput),
    };
  const leftover = swap.events?.some((e) => e.leftover) ? PARASWAP_LEFTOVER[swap.kind] : undefined;
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ParaSwap adapter that carried this swap — the adapter writes no trade log, so this position's rows are paired by what the adapter did: ${PARASWAP_SHAPE[swap.kind]}, for this account in one transaction, and made no other call for it there.${leftover ? ` ${leftover}` : ""} A shared transaction alone does not make the pairing.`,
    contract: { name: named?.name ?? "ParaSwap adapter", address: adapter },
    via: `${captureVia(coords)} · paired by the adapter that made every leg's call`,
    inputs: eventInputs(coords, named ? [counterpartyNameInput(named, explorerUrl(chainId, "address", adapter))] : []),
  };
};

/** The venue of a position swap — the settlement whose Trade log pairs the two
 *  position rows (server migs 243, 245), or the ParaSwap adapter that made them
 *  (mig 248). The per-order adapter contract that owns the Trade on the CoW
 *  adapter route is described, never named. */
export const swapVenueProv = (coords: V3Coords, swap: AaveV3SwapDetail): Provenance => {
  if (swap.route === "paraswap" && swap.adapter) return paraswapVenueProv(coords, swap, swap.adapter);
  const chainId = coords.chainId ?? MAINNET_CHAIN_ID;
  const named = getProtocolContract(GPV2_SETTLEMENT, chainId);
  const trade = (label: string, value: string | undefined, param: string): ProvInput[] =>
    value ? [{ label, value, kind: "chain", pclass: "emitted", note: `Trade \`${param}\`` }] : [];
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The CoW Protocol settlement that carried this swap — the settlement's trade log names the order's owner, the tokens sold and bought and both amounts, and this position's ${swap.kind === "withdraw_and_swap" || swap.kind === "supply_from_swap" ? "row is" : "two rows are"} paired to that log: ${
      swap.route === "cow_adapter"
        ? SWAP_OWNER[swap.kind]
        : "the owner is this position's account, which signed the order"
    }, and ${swapAmountRule(swap)}. A shared transaction alone does not make the pairing.`,
    contract: { name: named?.name ?? "GPv2Settlement", address: GPV2_SETTLEMENT },
    via: "rails-server index of GPv2Settlement Trade logs · paired to the position's rows by owner, tokens and amounts",
    inputs: eventInputs(coords, [
      ...trade("orderUid", swap.orderUid, "orderUid"),
      ...trade("sellAmount", swap.raw.tradeSellAmount, "sellAmount"),
      ...trade("buyAmount", swap.raw.tradeBuyAmount, "buyAmount"),
      ...(named ? [counterpartyNameInput(named, explorerUrl(chainId, "address", GPV2_SETTLEMENT))] : []),
    ]),
  };
};

/** The receipt leaf for a registry name: off-chain (Rails' registry), with the
 *  explorer's verified-source page as the reader's check. */
export const counterpartyNameInput = (named: ProtocolContract, addressHref: string): ProvInput => ({
  label: "name",
  value: named.name,
  kind: "offchain",
  pclass: "offchain",
  note: `Rails' registry of known contracts · verified source \`${named.contractName}\``,
  verify: { kind: "etherscan", href: `${addressHref}#code`, text: "Confirm the verified contract source" },
});

/** Supplied balance of a reserve AFTER this event = Σ supply/withdraw/transfer/seizure deltas.
 *  `raw` is the MV's integer-valued running sum (ctx.raw.supplyAfter). */
export const supplyAfterProv = (sym: string, coords: V3Coords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Supplied ${sym} after this event — the running total of what this position's events moved on this reserve, in log order up to this one: a supply or an aToken transfer in adds, a withdrawal or a transfer out subtracts, and a liquidation subtracts the collateral it seized, unless the liquidator took the aTokens, where the transfer out carries it. The total is held at zero if it would go below. It counts the amounts the logs carry, so the interest the aToken earns on top is missing from it, and a repayment made with aTokens does not come off it.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · Σ ±amount across Supply/Withdraw/BalanceTransfer/LiquidationCall logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Borrowed balance of a reserve AFTER this event = Σ (borrow − repay −
 *  liquidation cover − bad debt written off) deltas, floored at zero. */
export const debtAfterProv = (sym: string, coords: V3Coords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Borrowed ${sym} after this event — the running total of what this position's events moved on this reserve's debt, in log order up to this one: a draw adds, and a repayment, the debt a liquidation covered and the debt the Pool wrote off subtract. The total is held at zero if it would go below. It counts the amounts the logs carry, so the interest charged since each draw is missing from it.`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · Σ ±amount across Borrow/Repay/LiquidationCall/DeficitCreated logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Supplied balance of a reserve BEFORE this event = supply after − the moved
 *  amount. Arithmetic over two on-chain figures (the replayed after and the
 *  logged amount) — every leaf is on-chain, so it is chain-derived and stays in
 *  the chain-state view. The `indexed` pclass still marks it a Rails replay. */
export const supplyBeforeProv = (sym: string, coords: V3Coords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Supplied ${sym} before this event — the balance after this event, less what this event moved on this side: the amount its log carries, or on a liquidation the collateral it seized. Same basis as the after-balance: the amounts the logs carry, without the interest the aToken earns on top.`,
  contract: poolOf(coords),
  via: "supply after − amount",
  formula: "after − change",
  // Operand rows: the driver (reconstructTransition) fills the values it
  // actually subtracted; the vocabulary owns the labels + grain.
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed supplied ${sym} after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "the amount this event's log carries (signed)" },
  ]),
});

/** Borrowed PRINCIPAL of a reserve BEFORE this event = debt after − the moved
 *  amount. Every leaf on-chain, so chain-derived; principal basis. */
export const debtBeforeProv = (sym: string, coords: V3Coords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} before this event — the debt after this event, less what this event moved on the debt side: the amount its log carries, or on a liquidation the debt it covered. Same basis as the after-balance: the amounts the logs carry, without the interest charged since each draw.`,
  contract: poolOf(coords),
  via: "debt after − amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed borrowed ${sym} principal after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "the amount this event's log carries (signed)" },
  ]),
});

/** An asset's USD price AT THIS EVENT'S BLOCK — the market's own IAaveOracle
 *  read at the block by the oracle-price filler (archive `getAssetPrice`,
 *  8-dec USD) and captured into the index. A chain read pinned to the event's
 *  block: the same figure the Pool itself was pricing with when it validated
 *  the operation — not a market feed, and not today's price. */
export const atBlockPriceProv = (sym: string, coords: V3Coords, priceUsd: number): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  summary: `${sym} priced in US dollars at this event's block — the price the Pool's oracle answered with when it was asked at this exact block, which is the price the Pool was pricing collateral and liquidations with here. Each Pool keeps a separate oracle, resolved from that Pool's addresses provider, so two Pools can differ on the same token at the same block. The oracle gives the price in US dollars with 8 decimal places.`,
  contract: { name: "Aave V3 market oracle (IAaveOracle)" },
  via: `${captureVia(coords)} · IAaveOracle getAssetPrice at the event's block = $${priceUsd}`,
  inputs: eventInputs(coords),
});

/** The touched reserve's after-balance valued at the block's own oracle price
 *  — the replayed after-balance × the captured at-block price. Both operands
 *  on-chain (a truth-preserving sum of logged amounts, a pinned oracle read),
 *  so the product is chain-derived. The debt side is PRINCIPAL, the same basis
 *  as the balance it prices (interest since each draw is a derived layer). */
export const snapshotUsdProv = (
  sym: string,
  side: "supply" | "debt",
  coords: V3Coords,
  vals: { amount: string; priceUsd: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The ${side === "supply" ? "supplied" : "borrowed"} ${sym} balance after this event, in US dollars — the running balance times the price the Pool's oracle answered with at this event's block. It is what the balance was worth at that moment, at the price the Pool was reading.${side === "debt" ? " Both figures are on the same basis: the amounts the logs carry, without the interest charged since each draw." : ""}`,
  contract: poolOf(coords),
  via: "after-balance × oracle price at the event's block",
  formula: "after × price at block",
  inputs: eventInputs(coords, [
    {
      label: "after",
      value: `${vals.amount} ${sym}`,
      kind: "chain",
      pclass: "indexed",
      note: `replayed ${side === "supply" ? "supplied" : "borrowed"} ${sym}${side === "debt" ? " principal" : ""} after this event`,
    },
    {
      label: "price at block",
      value: `$${vals.priceUsd}`,
      kind: "chain",
      pclass: "oracle",
      note: "IAaveOracle getAssetPrice at the event's block",
    },
  ]),
});

/** One liquidation leg valued at the block's own oracle price — the emitted
 *  amount × the captured at-block price. Both legs on-chain (an emitted log
 *  field, a pinned oracle read), so the product is chain-derived. */
export const liqLegUsdProv = (
  leg: "seized collateral" | "cleared debt",
  sym: string,
  coords: V3Coords,
  vals: { amount: string; priceUsd: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The ${leg} (${sym}) in US dollars — the amount the liquidation's log carries for this leg, times the price the Pool's oracle answered with at this event's block. It is what the leg was worth when the liquidation ran, at the price the Pool was reading.`,
  contract: poolOf(coords),
  via: "emitted amount × oracle price at the event's block",
  formula: "amount × price at block",
  inputs: eventInputs(coords, [
    {
      label: "amount",
      value: vals.amount,
      kind: "chain",
      pclass: "emitted",
      note: `LiquidationCall ${leg === "seized collateral" ? "liquidatedCollateralAmount" : "debtToCover"} (${sym})`,
    },
    {
      label: "price at block",
      value: `$${vals.priceUsd}`,
      kind: "chain",
      pclass: "oracle",
      note: "IAaveOracle getAssetPrice at the event's block",
    },
  ]),
});

/** The liquidator's realized premium — seized-leg value over cleared-leg value,
 *  both at the block's own oracle prices. Pure arithmetic over two
 *  chain-derived figures. This is the liquidation bonus as this call actually
 *  realized it, not the market's configured bonus parameter. */
export const liqPremiumProv = (coords: V3Coords, vals: { seizedUsd: string; clearedUsd: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The premium the liquidator took — what the seized collateral was worth less what the cleared debt was worth, as a share of the debt cleared, both at the prices the Pool's oracle gave at this block. Aave sets a bonus per reserve to make liquidating worth doing; this is what the bonus came to on this call.`,
  via: "(seized value − cleared value) ÷ cleared value, both at the block's oracle prices",
  formula: "seized ÷ cleared − 1",
  inputs: eventInputs(coords, [
    {
      label: "seized value",
      value: vals.seizedUsd,
      kind: "chain-derived",
      pclass: "oracle",
      note: "seized collateral × oracle price at block",
    },
    {
      label: "cleared value",
      value: vals.clearedUsd,
      kind: "chain-derived",
      pclass: "oracle",
      note: "cleared debt × oracle price at block",
    },
  ]),
});

/** The Pool's own liquidation bonus for the seized reserve, read from the
 *  reserve's configuration word at the event's block — the constant the
 *  contract computed this seizure with, rendered under the realized premium
 *  as its reference. Where the protocol keeps a share of the bonus, the
 *  liquidator's realized premium is the bonus less that share. */
export const liqBonusRefProv = (coords: V3Coords, vals: { bonusBps: number; protocolFeeBps: number }): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The liquidation bonus on the seized reserve — the extra collateral a liquidator gets over the debt they repay, as the Pool's configuration set it at this event's block, and the figure the Pool sizes the seizure with. The configuration stores it as 10000 plus the bonus in hundredths of a percent, so ${vals.bonusBps} is a bonus of ${((vals.bonusBps - 10000) / 100).toFixed(2).replace(/\.?0+$/, "")}%.${vals.protocolFeeBps > 0 ? ` The treasury keeps ${vals.protocolFeeBps / 100}% of the bonus part, so the liquidator is left with the rest.` : " This reserve charges no protocol fee, so the liquidator keeps the whole bonus."}`,
  contract: poolOf(coords),
  via: `${captureVia(coords)} · Pool getConfiguration at the event's block · bits 32-47 (liquidationBonus) = ${vals.bonusBps}${vals.protocolFeeBps > 0 ? ` · bits 152-167 (liquidationProtocolFee) = ${vals.protocolFeeBps}` : ""}`,
  inputs: eventInputs(coords),
});

// ── Position state around the event's transaction (rails-ops TO-DO-ui-jobs §19) ──
// The Ethereum explorer's open card reads the account as it stood immediately
// before and once the event's transaction had run: exact balances from the
// scaled-delta reduction (decision 0008), collateral switches and eMode from the
// Pool's own events, prices and settings read from the chain at the block, and
// Aave's own account arithmetic over them. Base and Seamless keep the principal
// replay above.

const SIDE_TOKEN = { supply: "aToken", debt: "variableDebtToken" } as const;
const SIDE_INDEX = { supply: "liquidity index", debt: "variable borrow index" } as const;
/** What the scaled-balance reduction counts on each side, as the reducer does
 *  it: every flow divided by the reserve's index as it stood at that flow, and
 *  the two care points the arithmetic turns on — a seizure the liquidator took
 *  as aTokens is carried by the transfer, and a bad-debt write-off settles the
 *  reserve's debt to zero instead of subtracting an amount. */
const SCALED_ROSTER = {
  supply:
    "Every supply, withdrawal, aToken transfer and repayment made with aTokens is first divided by the index as it stood at that moment, and so is the collateral a liquidation seized, unless the liquidator took the aTokens, where the transfer carries it.",
  debt: "Every draw, repayment and liquidation cover is first divided by the index as it stood at that moment; a debt the Pool writes off as bad settles the reserve's debt to zero.",
} as const;
const ACCOUNT_RULE = "Aave's own account arithmetic (GenericLogic.calculateUserAccountData)";
const upTo = (when: "before" | "after"): string => (when === "before" ? "before" : "up to and including");
const orderCut = (when: "before" | "after"): string => (when === "before" ? "<" : "≤");

/** The inputs one exact balance is built from. */
export interface V3ExactLeg {
  /** The balance itself, raw underlying units. */
  raw: string;
  scaled: string;
  index: string;
  rduBlock: number;
  rduTxHash: string;
  rduTimestamp: number;
  rate: string;
  blockTimestamp: number;
  decimals: number;
}

/** A reserve balance around this event's transaction — the position's scaled
 *  balance × the reserve index accrued to the block's timestamp. Every leg is a
 *  chain event or Aave's own index formula, so chain-derived; the sum is Rails'
 *  own reduction, hence `indexed`. */
export const exactBalanceProv = (
  sym: string,
  side: "supply" | "debt",
  when: "before" | "after",
  coords: V3Coords,
  leg: V3ExactLeg,
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary: `${side === "supply" ? "Supplied" : "Borrowed"} ${sym} ${when} this transaction — the position's scaled balance ${upTo(when)} this transaction, times the reserve's ${SIDE_INDEX[side]} carried forward to this block's timestamp. ${SCALED_ROSTER[side]} The interest to this moment is inside the figure: it is the balance the ${SIDE_TOKEN[side]} reported then.${when === "after" ? " Every event in the same transaction shares it." : ""}`,
  contract: poolOf(coords),
  via: `${V3_INDEX_VIA} · Σ scaled deltas ${orderCut(when)} (block, tx index) × ${SIDE_INDEX[side]} accrued · ÷10^${leg.decimals} = ${leg.raw}`,
  formula: "scaled × index accrued to block time",
  inputs: eventInputs(coords, [
    {
      label: "scaled",
      value: leg.scaled,
      kind: "chain-derived",
      pclass: "indexed",
      note: `Σ the position's scaled ${SIDE_TOKEN[side]} changes ${upTo(when)} this transaction, ordered by block and transaction index`,
    },
    {
      label: "index accrued to block time",
      value: leg.index,
      kind: "chain-derived",
      pclass: "emitted",
      note: `ReserveDataUpdated ${side === "supply" ? "liquidityIndex" : "variableBorrowIndex"} at block ${leg.rduBlock}, ${side === "supply" ? "linearly" : "compounded"} over ${Math.max(0, leg.blockTimestamp - leg.rduTimestamp)}s at rate ${leg.rate} (ray)`,
    },
    {
      label: "index update",
      value: leg.rduTxHash,
      kind: "chain",
      pclass: "emitted",
      note: `the reserve's ReserveDataUpdated log at block ${leg.rduBlock}`,
    },
  ]),
});

/** The change in one balance across this event's transaction — after − before,
 *  both exact at the same block's index. */
export const exactBalanceChangeProv = (
  sym: string,
  side: "supply" | "debt",
  coords: V3Coords,
  vals: { before: string; after: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Change in ${side === "supply" ? "supplied" : "borrowed"} ${sym} across this transaction — the balance once the transaction had run, less the balance immediately before it, both at this block's index. It parts from the amount the event's log carries where the transaction moved this reserve more than once, or by the few wei the Pool's rounding leaves.`,
  contract: poolOf(coords),
  via: "exact after − exact before",
  formula: "after − before",
  inputs: eventInputs(coords, [
    { label: "after", value: vals.after, kind: "chain-derived", pclass: "indexed", note: "exact balance after" },
    { label: "before", value: vals.before, kind: "chain-derived", pclass: "indexed", note: "exact balance before" },
  ]),
});

/** One exact balance valued at the market oracle's price read at the block. */
export const positionUsdProv = (
  sym: string,
  side: "supply" | "debt",
  when: "before" | "after",
  coords: V3Coords,
  vals: { amount: string; priceUsd: string; readBlock: number | null },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `${side === "supply" ? "Supplied" : "Borrowed"} ${sym} ${when} this transaction, in US dollars — the balance times the ${sym} price the Pool's oracle answered with at this event's block. It is what the balance was worth at that moment, at the price the Pool was reading. The oracle gives the price in US dollars with 8 decimal places.`,
  contract: poolOf(coords),
  via: `exact balance × IAaveOracle getAssetPrice read at block ${vals.readBlock ?? coords.blockNumber ?? "of the event"}`,
  formula: `${when} × price at block`,
  inputs: eventInputs(coords, [
    {
      label: when,
      value: `${vals.amount} ${sym}`,
      kind: "chain-derived",
      pclass: "indexed",
      note: `exact ${side === "supply" ? "supplied" : "borrowed"} ${sym} ${when} this transaction`,
    },
    {
      label: "price at block",
      value: `$${vals.priceUsd}`,
      kind: "chain",
      pclass: "oracle",
      note: "IAaveOracle getAssetPrice (8-decimal USD), read at the event's block",
    },
  ]),
});

/** Whether a reserve counted as collateral — the Pool's own collateral switch
 *  events for this position and reserve. */
export const collateralFlagProv = (
  sym: string,
  when: "before" | "after",
  on: boolean,
  coords: V3Coords,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${sym} as collateral ${when} this transaction — ${on ? "on" : "off"}, the way the position's collateral switch for this reserve stood ${upTo(when)} this transaction. A reserve counts toward borrowing power and the health factor only while its switch is on.`,
  contract: poolOf(coords),
  via: `${V3_INDEX_VIA} · last ReserveUsedAsCollateralEnabled / ReserveUsedAsCollateralDisabled log ${orderCut(when)} (block, tx index)`,
  inputs: eventInputs(coords),
});

/** The position's eMode category — its own UserEModeSet events; the category's
 *  label is read from the Pool at the block. */
export const emodeCategoryProv = (
  when: "before" | "after",
  vals: { id: number; name: string; generation: "bitmap" | "legacy" | null },
  coords: V3Coords,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `eMode ${when} this transaction — ${vals.id === 0 ? "no category" : vals.name}: the efficiency-mode category the position had chosen ${upTo(when)} this transaction. A reserve in the category is borrowed against at the category's loan-to-value and liquidation threshold, in place of the ones set on the reserve.`,
  contract: poolOf(coords),
  via: `${V3_INDEX_VIA} · last UserEModeSet log ${orderCut(when)} (block, tx index)${vals.id === 0 ? "" : ` · label: Pool ${vals.generation === "legacy" ? "getEModeCategoryData" : "getEModeCategoryLabel"} read at the block`}`,
  inputs: eventInputs(coords, [
    {
      label: "categoryId",
      value: String(vals.id),
      kind: "chain",
      pclass: "emitted",
      note: "UserEModeSet `categoryId`",
    },
    ...(vals.id === 0
      ? []
      : [
          {
            label: "label",
            value: vals.name,
            kind: "chain" as const,
            pclass: "state" as const,
            note: "the category's label, read from the Pool at the block",
          },
        ]),
  ]),
});

/** The account's total collateral or total debt in USD — Aave's own sum over
 *  the exact balances, the switches and the prices and settings at the block. */
export const accountTotalProv = (
  what: "collateral" | "debt",
  when: "before" | "after",
  coords: V3Coords,
  vals: { base: string; poolRevision: number | null },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `Total ${what} ${when} this transaction — ${
    what === "collateral"
      ? `every reserve the position has a balance in and its collateral switch on, valued at the oracle's price at this block and added up in US dollars${vals.poolRevision != null && vals.poolRevision < 10 ? ", leaving out a reserve whose liquidation threshold is zero" : ""}`
      : "every borrowed balance valued at the oracle's price at this block and added up in US dollars; variable-rate debt only, because the Pool's stable-rate debt is not modelled here"
  }, the way ${ACCOUNT_RULE} adds it. The total is carried in US dollars with 8 decimal places.`,
  contract: poolOf(coords),
  via: `Σ exact balance × price ÷ 10^decimals over the position's reserves${vals.poolRevision != null ? `, Pool revision ${vals.poolRevision}` : ""} = ${vals.base} (8-decimal USD)`,
  formula: what === "collateral" ? "Σ collateral × price" : "Σ debt × price",
  inputs: eventInputs(coords, [
    {
      label: what === "collateral" ? "collateral balances" : "debt balances",
      kind: "chain-derived",
      pclass: "indexed",
      note: "exact balances, scaled × index",
    },
    { label: "prices", kind: "chain", pclass: "oracle", note: "IAaveOracle getAssetPrice read at the block" },
    ...(what === "collateral"
      ? [
          {
            label: "collateral switches",
            kind: "chain" as const,
            pclass: "emitted" as const,
            note: "the position's collateral switch events",
          },
          {
            label: "liquidation thresholds",
            kind: "chain" as const,
            pclass: "state" as const,
            note: "each reserve's configuration, or its eMode category's, read at the block",
          },
        ]
      : []),
  ]),
});

/** The account's weighted LTV or liquidation threshold. */
export const accountRatioProv = (
  which: "ltv" | "lt",
  when: "before" | "after",
  coords: V3Coords,
  vals: { bps: number; emode: boolean },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${which === "ltv" ? "Loan to value" : "Liquidation threshold"} ${when} this transaction — each collateral reserve's ${which === "ltv" ? "loan-to-value" : "liquidation threshold"} averaged by what that reserve is worth in US dollars, the way ${ACCOUNT_RULE} averages it.${vals.emode ? " A reserve in the position's eMode category counts at the category's figure." : ""} ${which === "ltv" ? "It is the share of the collateral the position could borrow against." : "Debt above this share of the collateral makes the position liquidatable."} The Pool writes the share in hundredths of a percent, so ${vals.bps} stands for ${(vals.bps / 100).toFixed(2).replace(/\.?0+$/, "")}%.`,
  contract: poolOf(coords),
  via: `Σ (collateral value × ${which === "ltv" ? "LTV" : "liquidation threshold"}) ÷ Σ collateral value, configuration read at the block = ${vals.bps} bps`,
  formula: which === "ltv" ? "Σ value × LTV ÷ Σ value" : "Σ value × threshold ÷ Σ value",
  inputs: eventInputs(coords, [
    { label: "collateral values", kind: "chain-derived", pclass: "oracle", note: "exact balance × price at the block" },
    {
      label: which === "ltv" ? "LTVs" : "liquidation thresholds",
      kind: "chain",
      pclass: "state",
      note: "each reserve's configuration, or its eMode category's, read at the block",
    },
  ]),
});

/** The account's health factor — collateral × weighted liquidation threshold ÷
 *  debt, Aave's own formula over the figures above. */
export const healthFactorProv = (
  when: "before" | "after",
  coords: V3Coords,
  vals: { wad: string | null; collateralBase: string; debtBase: string; thresholdBps: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Health factor ${when} this transaction — the total collateral times the weighted liquidation threshold, divided by the total debt, the way ${ACCOUNT_RULE} works it out. Below 1 the position can be liquidated.${vals.wad == null ? " The position had no debt, so the factor has no finite value." : " The Pool writes a health factor with 18 decimal places, so 10^18 stands for a factor of 1."}`,
  contract: poolOf(coords),
  via: `collateral.percentMul(threshold).wadDiv(debt)${vals.wad != null ? ` = ${vals.wad}, ÷10^18` : ""}`,
  formula: "collateral × threshold ÷ debt",
  inputs: eventInputs(coords, [
    {
      label: "collateral",
      value: vals.collateralBase,
      kind: "chain-derived",
      pclass: "oracle",
      note: "total collateral, 8-decimal USD",
    },
    {
      label: "threshold",
      value: `${vals.thresholdBps} bps`,
      kind: "chain-derived",
      pclass: "state",
      note: "weighted liquidation threshold",
    },
    { label: "debt", value: vals.debtBase, kind: "chain-derived", pclass: "oracle", note: "total debt, 8-decimal USD" },
  ]),
});

/** Position-card supplied balance for one reserve — the scaled-balance reduction
 *  (0008/0011): every leg a chain event or the on-chain index formula, so
 *  chain-derived, and the figure INCLUDES accrued interest (it equals the
 *  aToken's `balanceOf` at the indexed head). */
export const positionSupplyProv = (sym: string, atBlockNum?: number): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Supplied ${sym} the position holds${atBlockNum ? ` at block ${atBlockNum}` : ""} — ${SCALED_ROSTER.supply} The divided amounts are added up and multiplied back by the reserve's liquidity index, carried forward to the latest Aave V3 event on record. The interest earned since each deposit is inside the figure: it is the balance the aToken reports.`,
  contract: POOL,
  via: `${V3_INDEX_VIA} · Σ scaled deltas × liquidity index accrued to the latest event (ReserveDataUpdated)`,
});

/** Position-card borrowed balance for one reserve — the scaled-balance reduction
 *  (0008/0011) on the variable-debt side; interest included (equals the
 *  variableDebtToken's `balanceOf` at the indexed head). */
export const positionDebtProv = (sym: string, atBlockNum?: number): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} the position owes${atBlockNum ? ` at block ${atBlockNum}` : ""} — ${SCALED_ROSTER.debt} The divided amounts are added up and multiplied back by the reserve's variable borrow index, carried forward to the latest Aave V3 event on record. The interest charged since each draw is inside the figure: it is the debt the variableDebtToken reports.`,
  contract: POOL,
  via: `${V3_INDEX_VIA} · Σ scaled deltas × variable borrow index accrued to the latest event (ReserveDataUpdated)`,
});

/** Terminal-card peak supplied balance for one reserve — the largest running
 *  balance the scaled-delta reducer (0008/0011) records: every captured flow
 *  (supplies, withdrawals, aToken transfers in and out, collateral a
 *  liquidation seized) ÷ the reserve's liquidity index at its block, summed,
 *  with the largest claim valued × the index at the moment it stood. Interest
 *  accrued to that moment is included — the balance the aToken's balanceOf
 *  showed then. */
export const aaveV3PeakSupplyProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest supplied ${sym} balance this account recorded — ${SCALED_ROSTER.supply} The divided amounts are added up in order and the largest running total is multiplied back by the reserve's liquidity index as it stood at that event. It is the balance the aToken reported then, interest to that moment included. The index kept climbing between events, so the true high-water mark can sit a little above a figure read at event boundaries.`,
  contract: POOL,
  via: `${V3_INDEX_VIA} · max running Σ scaled deltas × liquidity index accrued to the peak event`,
});

/** Terminal-card peak borrowed balance for one reserve — the largest running
 *  debt the scaled-delta reducer (0008/0011) records: Borrow/Repay/
 *  LiquidationCall amounts ÷ the borrow index at each block, summed, with the
 *  largest scaled debt valued × the index at the moment it stood. Interest
 *  accrued to that moment is included — the debt the variableDebtToken's
 *  balanceOf showed then. */
export const aaveV3PeakBorrowProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest borrowed ${sym} balance this account recorded — ${SCALED_ROSTER.debt} The divided amounts are added up in order and the largest running total is multiplied back by the reserve's variable borrow index as it stood at that event. It is the debt the variableDebtToken reported then, interest to that moment included. The index kept climbing between events, so the debt just before a repayment can sit a little above a figure read at event boundaries.`,
  contract: POOL,
  via: `${V3_INDEX_VIA} · max running Σ scaled deltas × variable borrow index accrued to the peak event`,
});

/** IAaveOracle contract — the same oracle the Pool reads to price collateral and
 *  compute health factors. */
const V3_ORACLE = { name: "Aave V3 IAaveOracle", address: AAVE_V3_ORACLE };

/** On-chain-oracle USD for a card/tower total. Both legs are on-chain — the
 *  chain-state token balance and Aave's own oracle price (getAssetPrice) — so the
 *  product is chain-derived and stays in the chain-state view (unlike a DefiLlama
 *  market cache). Mirrors Compound's `compoundUsdProvOnchain`. */
export const aaveV3UsdProvOnchain = (what: string): Provenance => ({
  kind: "chain-derived",
  // Both legs on-chain; the oracle price is the furthest class, so it leads.
  pclass: "oracle",
  summary: `${what} valued in US dollars — the token balance times the price the Pool's oracle reports for that token, which is the price the Pool values collateral at. The oracle gives it in US dollars with 8 decimal places.`,
  contract: V3_ORACLE,
  via: "chain balance × on-chain oracle price",
  formula: "balance × oracle price",
  inputs: [
    { label: "balance", kind: "chain", note: "replayed position balance" },
    { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
  ],
});

/** Lifetime gross flow on one reserve — Σ every amount the position's own Pool
 *  events moved on that side, across its whole captured history. The tower's
 *  hatched withdrawn/repaid + liquidated segments. Pool flows only — aToken
 *  transfers (captured and shown on the timeline as their own events) move
 *  custody without a Pool flow: they are neither deposits nor withdrawals,
 *  so they stay out of these sums (stated, not hidden). */
export type AaveV3LifetimeFlow = "withdrawn" | "repaid" | "liquidated collateral" | "liquidated debt" | "written off";

/** The verb a lifetime-flow receipt uses for its Σ. */
export const lifetimeFlowVerb = (flow: AaveV3LifetimeFlow): string =>
  flow === "withdrawn"
    ? "withdrew"
    : flow === "repaid"
      ? "repaid"
      : flow === "written off"
        ? "had written off as bad debt, the debt a liquidation left no collateral to cover"
        : "moved in liquidations";

export const aaveV3LifetimeFlowProv = (flow: AaveV3LifetimeFlow, sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (${sym}) — the sum of every ${sym} amount this position's Pool events ${lifetimeFlowVerb(flow)}, across the whole history on record for it. Pool flows only: an aToken transfer hands the position to another account without a Pool flow, so it counts here as neither a deposit nor a withdrawal. The timeline draws it as a transfer.`,
  contract: POOL,
  via: `${V3_INDEX_VIA} · Σ amount across the position's logs · the history on record`,
});

/** Net borrowed PRINCIPAL on one reserve across the captured history —
 *  Σ (borrow − repay − liquidation cover − written off) from the position's
 *  own Pool events. The tower's debt base line when the interest split
 *  renders: principal only, the accrued segment sits on top (principal +
 *  interest = the rebased balanceOf). Every input an on-chain event amount →
 *  chain-derived. */
export const aaveV3DebtPrincipalProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} principal — every draw, less every repayment, the debt a liquidation covered and the debt the Pool wrote off, across the whole history on record for this position. The interest charged on top of it is the segment above this one.`,
  contract: POOL,
  via: `${V3_INDEX_VIA} · Σ (borrow − repay − liquidation cover − written off) · the history on record`,
});

/** The card's "incl. $X interest" stat caption — accrued interest included in
 *  one side's balance, valued in USD: per reserve, the current rebased balance
 *  (the scaled-balance reduction, equal to the aToken / variableDebtToken
 *  `balanceOf` at the indexed head) minus the net principal replayed from the
 *  position's own Pool events, × Aave's own oracle price, summed. Every leg
 *  on-chain → chain-derived. Gated by the caller (any reserve whose principal
 *  doesn't attribute cleanly nulls the caption — computeAaveV3CardCaptions). */
export const aaveV3InterestCaptionProv = (side: "supply" | "debt"): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    side === "supply"
      ? "Accrued supply interest inside the collateral balance above — per reserve, the balance the aToken reports, less what its events account for: every deposit, less every withdrawal and the collateral a liquidation seized. The difference is valued at the price the Pool's oracle reports. Interest grew the collateral, so it is part of the headline figure."
      : "Accrued borrow interest inside the debt balance above — per reserve, the debt the variableDebtToken reports, less what its events account for: every draw, less every repayment, the debt a liquidation covered and the debt the Pool wrote off. The difference is valued at the price the Pool's oracle reports. Interest grew the debt, so it is part of the headline figure.",
  contract: POOL,
  via: "(balance the token reports − Σ net event principal) × IAaveOracle getAssetPrice, per reserve",
  formula: "(current − net principal) × oracle price",
  inputs: [
    {
      label: "current",
      kind: "chain-derived",
      pclass: "indexed",
      note: "scaled-balance reduction (interest included)",
    },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed Pool event amounts" },
    { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
  ],
});

/** Single-collateral liquidation price for the health-factor caption — the
 *  oracle price at which the position becomes liquidatable: current on-chain
 *  oracle price ÷ health factor. Both legs on-chain (IAaveOracle price, Pool
 *  getUserAccountData HF), so chain-derived. Anchored on the one reserve
 *  carrying ≥99.5% of the priced collateral (dust doesn't block the anchor);
 *  holds while the debt's USD value stands still. */
export const aaveV3LiqPriceProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Liquidation price for the ${sym} collateral — the ${sym} price at which this position becomes liquidatable: the price the Pool's oracle reports now, divided by the health factor the Pool gives now. ${sym} carries at least 99.5% of the priced collateral, so it anchors the read, and the figure holds while the debt's dollar value stands still.`,
  contract: V3_ORACLE,
  via: "IAaveOracle getAssetPrice ÷ Pool getUserAccountData health factor",
  formula: "oracle price ÷ HF",
  inputs: [
    { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
    { label: "health factor", kind: "chain", pclass: "state", note: "Pool getUserAccountData" },
  ],
});

/** Accrued interest on the debt leg — the current rebased debt (scaled-balance
 *  reduction, = variableDebtToken balanceOf) minus the net borrowed principal
 *  replayed from the position's own Pool events. Both legs chain-derived, so the
 *  difference is too. Gated by the caller (only shown when the arithmetic is
 *  attributable — see legInterest in lib/aave-v3/chain-truth-tower.ts). */
export const aaveV3DebtInterestProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Accrued interest on the ${sym} debt — the debt the variableDebtToken reports now, less what its events account for: every draw, less every repayment, the debt a liquidation covered and the debt the Pool wrote off. The debt token's balance climbs with the reserve's borrow index and records nothing when it does, so what it says is owed above what the events moved is the interest.`,
  contract: POOL,
  via: "debt the token reports − Σ (borrow − repay − liquidation cover − written off)",
  formula: "current − net principal",
  inputs: [
    {
      label: "current",
      kind: "chain-derived",
      pclass: "indexed",
      note: "scaled-balance reduction (interest included)",
    },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed Pool event amounts" },
  ],
});
