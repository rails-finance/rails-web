// Aave V3 economics reduction — the valued dual tower with lifetime flows and
// the debt interest split.
// ----------------------------------------------------------------------------
// Balances are the index's scaled-balance reduction (0008/0011) — the current
// rebased figure, interest included, equal to `balanceOf` at the indexed head —
// and USD is ON-CHAIN: each reserve is valued at Aave's OWN oracle —
// IAaveOracle.getAssetPrice, the same price the Pool reads to price collateral
// (threaded onto `priceByAddress`). Both legs are on-chain, so the product is
// chain-derived and belongs in the chain-state view.
//
// With the account's event stream (optional second arg) the tower gains the
// lifetime layer: hatched withdrawn/repaid + liquidated segments per reserve,
// the faded lifetime-inflow bar, and — on a single-reserve debt side — the
// accrued-interest segment (current rebased debt − net event principal, with
// plausibility gates). aToken transfers (mig 160) count as "Received by
// transfer" and "Sent to another account", a transfer to a WETH gateway as a
// withdrawal and one to the treasury inside a liquidation as that
// liquidation's fee, as the date scrubber counts them. SparkLend's ledger runs
// through the same reduction with its own classifier (lib/spark/economics.ts).
// The V3 index starts at the backfill floor, not V3's deploy block, so
// "lifetime" means the captured history — the interest gates bail whenever the
// principal doesn't attribute cleanly. When RPC is down and a contributing
// reserve is unpriced, the tower degrades to the token-only gated list (a
// strict per-total guard) rather than assert a partial USD total.

import { unreadTokensIn } from "@/lib/shared/decimals-unread";
import type { UnreadToken } from "@/lib/shared/types/event-shape";
import type { AaveV3PositionView } from "@/components/protocol/aave-v3/aave-v3-position-card";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import { scaleV3ChainBalance } from "@/lib/api/fetch-aave-v3-position";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { interestSinceZero, numOrNull, type LaneRow } from "@/lib/shared/interest-since-zero";
import {
  positionSupplyProv,
  positionDebtProv,
  aaveV3LifetimeFlowProv,
  aaveV3DebtInterestProv,
  aaveV3DebtPrincipalProv,
  type AaveV3LifetimeFlow,
} from "@/lib/aave-v3/event-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { folderFlows, mergeFlowBuckets } from "@/lib/shared/timeline-folder-reductions";
import type { Provenance } from "@/components/shared/provenance";
import { v3Brand, v3Possessive, type V3Protocol } from "./protocol-name";
import { laneFor, splitHeld, type AaveLaneInterest } from "./lane-interest";
import { laneInterestProv, laneNetProv } from "@/lib/aave-v3/event-provenance";
import { isAaveCollector } from "./liquidation-fee";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/** A WETH gateway on either chain the Aave V3 family runs on here. */
export const isWethGateway = (address: string | undefined): boolean =>
  ([MAINNET_CHAIN_ID, BASE_CHAIN_ID] as ChainId[]).some((c) => getProtocolContract(address, c)?.kind === "gateway");

/** What the tower reads of a position: its reserves and their oracle prices.
 *  Aave V3 and SparkLend views both carry it. */
export type AaveFamilyTowerView = Pick<AaveV3PositionView, "supplies" | "borrows" | "priceByAddress" | "atBlock">;

/** What the card captions read of the live Pool read: the borrow rates. */
export type AaveFamilyChainRead = Pick<AaveV3PositionChainResponse, "chainStale" | "pool"> & {
  reserves: Pick<
    AaveV3PositionChainResponse["reserves"][number],
    "address" | "symbol" | "decimals" | "hasBorrow" | "debtBalanceRaw" | "borrowApr"
  >[];
};

/** The five receipts the tower attaches to its lines.
 *
 *  A seam, not an abstraction for its own sake: the ARITHMETIC below is the
 *  same wherever an Aave V3 account lives, but where its numbers came from is
 *  not. On Ethereum the current balances are the index's scaled-balance
 *  reduction; on Base they are a direct `balanceOf` at a pinned block, and the
 *  lifetime sums come from a live log sweep rather than a captured one. Those
 *  are different claims, and a receipt that states the wrong one is worse than
 *  no receipt. So the sums live here once and each deployment brings its own
 *  account of them. */
export interface AaveV3TowerVocabulary {
  /** Whose oracle the note names — Aave V3 when unstated (see protocol-name.ts). */
  protocol?: V3Protocol;
  /** The name the interest note gives the oracle's owner, where it is not the
   *  protocol's brand ("SparkLend"). */
  brand?: string;
  supply: (symbol: string, atBlock?: number) => Provenance;
  debt: (symbol: string, atBlock?: number) => Provenance;
  lifetimeFlow: (flow: AaveV3LifetimeFlow, symbol: string) => Provenance;
  debtInterest: (symbol: string) => Provenance;
  debtPrincipal: (symbol: string) => Provenance;
}

/** The indexed lane's receipts — Ethereum's Core / Prime / EtherFi Pools. */
export const AAVE_V3_INDEXED_VOCABULARY: AaveV3TowerVocabulary = {
  supply: positionSupplyProv,
  debt: positionDebtProv,
  lifetimeFlow: aaveV3LifetimeFlowProv,
  debtInterest: aaveV3DebtInterestProv,
  debtPrincipal: aaveV3DebtPrincipalProv,
};

const DUST = 1e-9;

/** Per-(reserve symbol) lifetime gross flows, replayed from the account's own
 *  Pool events. Addresses ride along (from the event flows) for oracle pricing.
 *
 *  Exported because a swept explorer cannot always derive this from the events
 *  on the page: a wallet with thousands of them renders only the most recent
 *  slice, and reducing THAT would label a recent window "all time". Those
 *  explorers compute the sums server-side over the whole history and hand them
 *  in — see the `lifetime` argument below. */
export interface ReserveFlows {
  symbol: string;
  address?: string;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedCollateral: number;
  liquidatedDebt: number;
  /** Debt the Pool burned as bad debt (DeficitCreated): left the position
   *  without a repayment. A debt outflow beside repaid and liquidatedDebt. */
  writtenOff: number;
  /** Collateral that left through a swap the owner signed, net of what the
   *  adapter supplied back unused: sold to repay a debt, withdrawn and swapped
   *  to the wallet, or swapped into another reserve. Summed from the loaded
   *  rows only (the index's summary has no such leg). */
  soldToRepay?: number;
  withdrawnSwapped?: number;
  swappedOut?: number;
  /** aToken transfers: in from another account, out to one. A transfer to a
   *  WETH gateway is a withdrawal to ETH and counts as withdrawn. */
  transferredIn?: number;
  transferredOut?: number;
  /** aTokens a collateral swap's order bought into this reserve. */
  swappedIn?: number;
  /** Debt a debt swap repaid: the old debt the swap paid off, and the part of
   *  the new debt the adapter returned unused. Loaded rows only. */
  repaidBySwap?: number;
  /** Per leg, the part of its amount whose events carried an oracle price at
   *  their block, and that part's value at those prices. A leg summed
   *  elsewhere (an opening balance, a folder) has none; the tower values the
   *  rest of a leg at today's price. */
  atEvent?: Partial<Record<FlowLeg, { amount: number; usd: number }>>;
  /** Of `liquidatedCollateral`, the liquidation fee sent to the Aave treasury. */
  treasuryFee?: number;
  /** Set when the token's `decimals` did not load (a swept lane's sums): the
   *  tower leaves the token out. */
  decimalsUnread?: true;
}

/** Every leg a reserve's lifetime flows carry. */
export type FlowLeg =
  | "supplied"
  | "withdrawn"
  | "borrowed"
  | "repaid"
  | "liquidatedCollateral"
  | "liquidatedDebt"
  | "writtenOff"
  | "soldToRepay"
  | "withdrawnSwapped"
  | "swappedOut"
  | "transferredIn"
  | "transferredOut"
  | "swappedIn"
  | "repaidBySwap";

/** Adds `amount` to one leg, and its value at the event's oracle price where
 *  the event carries one. */
function addLeg(r: ReserveFlows, leg: FlowLeg, amount: number, priceUsd?: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  r[leg] = (r[leg] ?? 0) + amount;
  if (priceUsd != null && priceUsd > 0) {
    const at = (r.atEvent ??= {});
    const cur = at[leg] ?? { amount: 0, usd: 0 };
    at[leg] = { amount: cur.amount + amount, usd: cur.usd + amount * priceUsd };
  }
}

/** Key prefix of the tower's written-off debt lines: they ride the debt
 *  side's `liquidated` bucket (involuntary, the same hatch) under their own
 *  caption, and the economics prose tells them apart by this prefix. */
export const WRITTEN_OFF_KEY = "debt-written-off";

/** A token's decimals as the loaded events' flows state them. */
function decimalsOf(events: BaseActivityEvent[] | undefined, address: string): number | undefined {
  const a = address.toLowerCase();
  for (const e of events ?? [])
    for (const f of e.flows ?? [])
      if (f.token?.toLowerCase() === a && typeof f.tokenDecimals === "number") return f.tokenDecimals;
  return undefined;
}

/** The legs only the loaded rows carry (the index's summary sums none). */
const WINDOW_LEGS = [
  "soldToRepay",
  "withdrawnSwapped",
  "swappedOut",
  "transferredIn",
  "transferredOut",
  "swappedIn",
  "repaidBySwap",
] as const;

const legOf = (r: ReserveFlows, k: (typeof WINDOW_LEGS)[number]): number => r[k] ?? 0;

/** Everything that entered one reserve's supplied balance, and everything
 *  that left it, interest aside. */
const supplyIn = (r: ReserveFlows): number => r.supplied + legOf(r, "transferredIn") + legOf(r, "swappedIn");
const supplyOut = (r: ReserveFlows): number =>
  r.withdrawn +
  r.liquidatedCollateral +
  legOf(r, "soldToRepay") +
  legOf(r, "withdrawnSwapped") +
  legOf(r, "swappedOut") +
  legOf(r, "transferredOut");

/** Everything that left one reserve's debt, interest aside. */
const debtOut = (r: ReserveFlows): number => r.repaid + legOf(r, "repaidBySwap") + r.liquidatedDebt + r.writtenOff;

/** One leg an event adds to one reserve's lifetime flows. `leg` null is a
 *  reserve the event names without moving it (the reducer still lists it). */
export interface AaveV3EventLeg {
  symbol: string;
  address?: string;
  leg: FlowLeg | null;
  /** Token units; the reducer skips a zero or non-finite amount. */
  amount: number;
  /** USD per token at the event's block, where the event carries it. */
  price?: number;
  /** A repay paid with the position's own collateral (a repay-with-collateral
   *  swap's debt leg): the same act as that swap's "Sold to repay". */
  fromCollateral?: true;
  /** A liquidation's protocol fee to the Aave treasury. */
  treasuryFee?: true;
}

/** The transactions that carry a liquidation: an aToken transfer to the Aave
 *  treasury in one is that liquidation's protocol fee (liquidation-fee.ts),
 *  collateral the liquidation took from the position. */
export function aaveV3LiquidationTxs(events: BaseActivityEvent[]): Set<string | undefined> {
  return new Set(
    events
      .filter((e) => isAaveV3Event(e) && e.context.data.eventType === "liquidation")
      .map((e) => e.txHash?.toLowerCase()),
  );
}

/** The legs one event adds to the lifetime flows, in the order the reducer
 *  applies them. The ledger's reducer (below) and the date scrubber
 *  (lib/aave-v3/flows-timeline.ts) both read this, so the two classify every
 *  event the same way. */
export function aaveV3EventLegs(ev: BaseActivityEvent, liqTxs: Set<string | undefined>): AaveV3EventLeg[] {
  if (!isAaveV3Event(ev)) return [];
  const out: AaveV3EventLeg[] = [];
  const ctx = ev.context.data;
  const px = ctx.price?.usd;
  if (ctx.eventType === "liquidation") {
    const seized = Math.abs(Number(ctx.liquidatedCollateralAmount));
    const covered = Math.abs(Number(ctx.debtToCover));
    // flows: [collateral out, debt out] — addresses for pricing.
    const collAddr = ctx.collateralAsset ?? ev.flows[0]?.token;
    const debtAddr = ev.flows[1]?.token;
    if (ctx.collateralSymbol && Number.isFinite(seized))
      out.push({
        symbol: ctx.collateralSymbol,
        address: collAddr,
        leg: "liquidatedCollateral",
        amount: seized,
        price: ctx.collateralPrice?.usd,
      });
    if (ctx.reserveSymbol && Number.isFinite(covered))
      out.push({
        symbol: ctx.reserveSymbol,
        address: debtAddr,
        leg: "liquidatedDebt",
        amount: covered,
        price: ctx.debtPrice?.usd,
      });
    return out;
  }
  if (
    ctx.eventType === "transfer_out" &&
    isAaveCollector(ctx.counterparty) &&
    liqTxs.has(ev.txHash?.toLowerCase()) &&
    ctx.reserveSymbol
  ) {
    const fee = Math.abs(Number(ctx.amount));
    if (Number.isFinite(fee) && fee > 0)
      out.push({
        symbol: ctx.reserveSymbol,
        address: ctx.reserve ?? ev.flows[0]?.token,
        leg: "liquidatedCollateral",
        amount: fee,
        price: px,
        treasuryFee: true,
      });
    return out;
  }
  const mag = Math.abs(Number(ctx.amount));
  if (!ctx.reserveSymbol || !Number.isFinite(mag) || mag === 0) return out;
  const symbol = ctx.reserveSymbol;
  const address = ev.flows[0]?.token;
  const own = (leg: FlowLeg | null) => out.push({ symbol, address, leg, amount: mag, price: px });
  if (ctx.eventType === "swap") {
    const s = ctx.swap;
    // A debt swap's repays (the old debt, and the new debt's unused part)
    // are their own row, so "Repaid" keeps the owner's own repayments.
    const add = (sym: string, addr: string | undefined, action: string | undefined, amount: number, price?: number) => {
      const leg: FlowLeg | null = !Number.isFinite(amount)
        ? null
        : action === "supply"
          ? // What a collateral swap bought and supplied is its own row too, so
            // "Deposited" keeps what came from the wallet.
            s?.kind === "collateral_swap"
            ? "swappedIn"
            : "supplied"
          : action === "borrow"
            ? "borrowed"
            : action === "repay"
              ? s?.kind === "debt_swap"
                ? "repaidBySwap"
                : "repaid"
              : null;
      out.push({
        symbol: sym,
        address: addr,
        leg,
        amount,
        price,
        ...(leg === "repaid" && s?.kind === "repay_with_collateral" ? { fromCollateral: true as const } : {}),
      });
    };
    // The given leg: supplied collateral that left under the owner's order
    // (an aToken transfer to the adapter or settlement) counts as leaving
    // at its net figure, the card's; a debt swap's repay is a repay.
    if (s?.givenAction === "transfer_out")
      own(
        s.kind === "repay_with_collateral"
          ? "soldToRepay"
          : s.kind === "withdraw_and_swap"
            ? "withdrawnSwapped"
            : "swappedOut",
      );
    // A supply from a swap: aTokens bought with wallet tokens arrive.
    else if (s?.givenAction === "transfer_in") own("supplied");
    else add(symbol, address, s?.givenAction, mag, px);
    const rpx = s?.receivedPrice?.usd;
    if (s?.events) {
      // A ParaSwap swap's rows behind the card (server mig 248): the Pool
      // rows count as their own flows, except the aToken transfer and the
      // collateral supplied back unused, both inside the net given leg.
      for (const e of s.events) {
        if (!e.symbol || e.action === "transfer_out" || e.leg === "given") continue;
        if (e.leftover && e.action === "supply" && s.givenAction === "transfer_out") continue;
        add(e.symbol, e.asset, e.action, Math.abs(Number(e.amount)), e.symbol === s.receivedSymbol ? rpx : undefined);
      }
      return out;
    }
    // A withdraw and swap's bought token left the position: no reserve of it.
    if (s?.receivedSymbol && s.receivedAction !== "trade" && s.receivedAction !== "transfer_in")
      add(
        s.receivedSymbol,
        s.receivedAsset ?? ev.flows[1]?.token,
        s.receivedAction,
        Math.abs(Number(s.receivedAmount)),
        rpx,
      );
    else if (s?.receivedSymbol && s.receivedAction === "transfer_in")
      // aTokens of another reserve the order bought into the position.
      out.push({
        symbol: s.receivedSymbol,
        address: s.receivedAsset ?? ev.flows[1]?.token,
        leg: "swappedIn",
        amount: Math.abs(Number(s.receivedAmount)),
        price: rpx,
      });
    return out;
  }
  // aToken transfers: a transfer to a WETH gateway is the first step of a
  // withdrawal to ETH (the gateway withdraws and unwraps it in the same
  // transaction); any other is custody moving to or from another account.
  if (ctx.eventType === "transfer_out") own(isWethGateway(ctx.counterparty) ? "withdrawn" : "transferredOut");
  else if (ctx.eventType === "transfer_in") own("transferredIn");
  else if (ctx.eventType === "supply") own("supplied");
  else if (ctx.eventType === "withdraw") own("withdrawn");
  else if (ctx.eventType === "borrow") own("borrowed");
  else if (ctx.eventType === "repay") own("repaid");
  // bad_debt_written_off: a debt OUTFLOW. The Pool burned this much of the
  // reserve's debt with nothing repaid (DeficitCreated), so it left the
  // position exactly as a repay or a liquidation cover does, and the debt
  // side's principal, interest split and conservation gates must all see
  // it leave. Left out, every written-off wallet's lifetime debt was
  // under-counted by the burn and its interest split read the burn as
  // principal still owed (rails-ops TO-DO-ui-jobs §20).
  else if (ctx.eventType === "bad_debt_written_off") own("writtenOff");
  else own(null);
  return out;
}

/** A Pool family's classifier: the legs one event adds to the lifetime flows,
 *  given the transactions that carry a liquidation. The ledger and the date
 *  scrubber read the same one, so both count every event the same way. */
export interface AaveFamilyClassifier {
  liquidationTxs: (events: BaseActivityEvent[]) => Set<string | undefined>;
  legs: (ev: BaseActivityEvent, liqTxs: Set<string | undefined>) => AaveV3EventLeg[];
}

export const AAVE_V3_CLASSIFIER: AaveFamilyClassifier = {
  liquidationTxs: aaveV3LiquidationTxs,
  legs: aaveV3EventLegs,
};

/** Per reserve, the lifetime flows the events' legs add up to. */
export function reduceAaveFamilyLifetime(
  events: BaseActivityEvent[],
  classifier: AaveFamilyClassifier = AAVE_V3_CLASSIFIER,
): Map<string, ReserveFlows> {
  const flows = new Map<string, ReserveFlows>();
  const get = (symbol: string, address?: string): ReserveFlows => {
    const cur = flows.get(symbol) ?? {
      symbol,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedCollateral: 0,
      liquidatedDebt: 0,
      writtenOff: 0,
    };
    if (address && !cur.address) cur.address = address.toLowerCase();
    flows.set(symbol, cur);
    return cur;
  };
  const liqTxs = classifier.liquidationTxs(events);
  for (const ev of events)
    for (const l of classifier.legs(ev, liqTxs)) {
      const r = get(l.symbol, l.address);
      if (l.leg) addLeg(r, l.leg, l.amount, l.price);
      if (l.treasuryFee) r.treasuryFee = (r.treasuryFee ?? 0) + l.amount;
    }
  return flows;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance seeded first, the
 * folders the index served added next, the loaded rows added on top.
 *
 * Pass the result to `computeAaveV3Economics` as `precomputedLifetime`. That
 * parameter already existed for the swept Base explorers, which draw a capped
 * slice of a longer history and must still state the whole of it — this is the
 * same claim reached by a different route, so it reuses the same seam rather
 * than teaching the reducer a second one.
 *
 * The three halves never overlap: the opening balance covers `block_number <
 * cutoffBlock`, every event passed in is at or after it, and a folder's members
 * are exactly the events at or after it that arrived as a folder instead of as
 * their own rows. So summing them is addition and not reconciliation.
 * `folders` is empty (or omitted) on a page reading its history flat — every
 * family but SparkLend and Aave V3, and any load of those two that opted out
 * with `?folders=0`.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its reserve — is
 * NOT added as zero. Its reserve is dropped from the lifetime layer entirely, so
 * the tower shows nothing for it rather than a total that is short by whatever
 * the summarised part held. That is the same choice the reducer already makes
 * for an unpriced reserve: refuse the line, never state a partial one. A folder
 * bucket is subject to the identical refusal, which is why `folderFlows` merges
 * each asset into ONE bucket before it gets here.
 */
export function aaveV3LifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  folders?: readonly ServedFolder[] | null,
  classifier: AaveFamilyClassifier = AAVE_V3_CLASSIFIER,
): ReserveFlows[] | undefined {
  // Undefined = there is NOTHING outside `events`, so the reducer should read
  // them as the whole history and this layer should not exist. A grouped answer
  // with no cut is exactly that case minus the folders: its events are not the
  // whole history either, so folders alone are reason enough to build it.
  if (!opening && (folders?.length ?? 0) === 0) return undefined;
  const merged = new Map<string, ReserveFlows>();
  const get = (symbol: string, address?: string): ReserveFlows => {
    const cur = merged.get(symbol) ?? {
      symbol,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedCollateral: 0,
      liquidatedDebt: 0,
      writtenOff: 0,
    };
    if (address && !cur.address) cur.address = address.toLowerCase();
    merged.set(symbol, cur);
    return cur;
  };

  // The opening balance's leg names are the field names below, chosen on the
  // rails-server side to be exactly that so the merge needs no translation
  // table to drift out of date. `writtenOff` is the leg the server sums from
  // the `bad_debt_written_off` rows, in the summary and in the served folders
  // alike (rails-server `AAVE_FAMILY_FLOWS`); an absent leg is skipped.
  const LEGS = [
    "supplied",
    "withdrawn",
    "borrowed",
    "repaid",
    "liquidatedCollateral",
    "liquidatedDebt",
    "writtenOff",
  ] as const;

  // A reserve whose summarised legs cannot be scaled leaves the lifetime layer
  // ENTIRELY — both halves. Skipping only the opening bucket would leave the
  // window's own rows behind under the same symbol, and a total covering the
  // last thousand events while presenting itself as a lifetime is the precise
  // failure this whole model exists to prevent. A reserve that states nothing is
  // correct; a reserve short by an unknown amount is not.
  const refused = new Set<string>();
  for (const bucket of mergeFlowBuckets(opening?.flows, folderFlows(folders))) {
    const scaled: Partial<Record<(typeof LEGS)[number], number>> = {};
    let scalable = true;
    for (const leg of LEGS) {
      const raw = bucket.legs[leg];
      if (raw === undefined) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) {
        scalable = false;
        break;
      }
      scaled[leg] = value;
    }
    if (!scalable) {
      refused.add(bucket.key);
      continue;
    }
    const r = get(bucket.key, bucket.sourceKey);
    for (const leg of LEGS) r[leg] += scaled[leg] ?? 0;
  }
  // A leg summed outside the loaded rows has no event price: only the loaded
  // rows' priced part rides along, and the tower values the rest today.
  for (const [symbol, windowFlows] of reduceAaveFamilyLifetime(events, classifier)) {
    if (refused.has(symbol)) continue;
    const r = get(symbol, windowFlows.address);
    for (const leg of LEGS) r[leg] += windowFlows[leg];
    for (const leg of WINDOW_LEGS) if (windowFlows[leg]) r[leg] = legOf(r, leg) + legOf(windowFlows, leg);
    if (windowFlows.atEvent) r.atEvent = { ...windowFlows.atEvent };
    if (windowFlows.treasuryFee) r.treasuryFee = windowFlows.treasuryFee;
  }

  return [...merged.values()];
}

/** Chain-faithful interest on one leg (plausibility gates):
 *  - no chain-state current / no gross inflow → can't attribute, bail;
 *  - interest < dust → zero (or negative: missed principal — e.g. draws before
 *    the index's backfill floor — bail);
 *  - interest > grossIn → >100% cumulative yield, physically implausible
 *    (a transfer-in fed the balance — custody moves are deliberately not
 *    flows, so the inflow is absent from grossIn) → bail. */
function legInterest(current: number | undefined, netPrincipal: number, grossIn: number): number {
  if (current == null || grossIn <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < DUST) return 0;
  if (interest > grossIn) return 0;
  return interest;
}

/** Reserve addresses contributing lifetime-flow lines that `priceByAddress`
 *  doesn't price — the exited/liquidated reserves the listing row (current
 *  reserves only) can't know about. The detail page prices these through
 *  /api/chain/aave-v3/oracle-prices and merges the result, so the tower's
 *  strict per-total guard can value a multi-reserve history instead of
 *  degrading the whole panel to the gated token list. */
export function unpricedAaveV3FlowAddresses(
  view: AaveFamilyTowerView,
  events: BaseActivityEvent[],
  precomputed?: ReserveFlows[],
): string[] {
  const lifetime = precomputed ? bySymbol(precomputed) : reduceAaveFamilyLifetime(events);
  const out = new Set<string>();
  for (const f of lifetime.values()) {
    if (!f.address) continue; // no address → unpriceable either way
    const a = f.address.toLowerCase();
    const p = view.priceByAddress?.[a];
    if (typeof p === "number" && p > 0) continue;
    const flows = supplyIn(f) + supplyOut(f) + f.borrowed + debtOut(f);
    if (flows > DUST) out.add(a);
  }
  return [...out];
}

/** The liquidation read beneath the HF stat — shared by the card's footnote
 *  and the LLM export so the two agree number-for-number. One supplied reserve
 *  carrying ≥99.5% of the oracle-priced collateral anchors a single-asset
 *  liquidation price (oracle price ÷ HF — both legs on-chain; dust doesn't
 *  block the anchor); otherwise the 1 − 1/HF combined-collateral drop.
 *  All-null when there's no debt/HF, HF ≤ 1 (the HF value itself says
 *  liquidatable), or HF reads ∞. */
export interface AaveV3LiquidationRead {
  /** How far the whole collateral basket can fall before HF 1.0 (percent). */
  dropPct: number | null;
  /** The single-collateral anchor, when one reserve dominates. */
  single: { symbol: string; price: number; liqPrice: number } | null;
}

export function aaveV3LiquidationRead(view: AaveV3PositionView): AaveV3LiquidationRead {
  const hf = view.healthFactor;
  if (hf == null || hf <= 1 || hf >= 100) return { dropPct: null, single: null };
  const prices = view.priceByAddress;
  const priced = view.supplies
    .filter((r) => r.amount > 0)
    .map((r) => {
      const p = prices?.[r.address.toLowerCase()];
      return { r, price: typeof p === "number" && p > 0 ? p : null };
    });
  let single: AaveV3LiquidationRead["single"] = null;
  if (priced.length > 0 && priced.every((p) => p.price != null)) {
    const valued = priced.map((p) => ({ ...p, usd: (p.price as number) * p.r.amount }));
    const total = valued.reduce((s, p) => s + p.usd, 0);
    const top = valued.reduce((a, b) => (b.usd > a.usd ? b : a));
    if (total > 0 && top.usd / total >= 0.995) {
      single = { symbol: top.r.symbol, price: top.price as number, liqPrice: (top.price as number) / hf };
    }
  }
  return { dropPct: (1 - 1 / hf) * 100, single };
}

/** Position-card stat captions (the V4 spoke-card grammar, computed with this
 *  tier's gates). null = the gate failed and the caption simply doesn't render. */
export interface AaveV3CardCaptions {
  /** USD of the supply interest accrued since each collateral balance last
   *  started from zero (sinceZeroInterest), inside the balance shown. */
  supplyInterestUsd: number | null;
  /** The same for the debt. */
  debtInterestUsd: number | null;
  /** Unix seconds each side's figure counts from: the earliest of its
   *  reserves' starts from zero. Null with the figure. */
  supplyInterestSince?: number | null;
  debtInterestSince?: number | null;
  /** Current variable borrow APR (%). `avg` when debt-USD-weighted across
   *  several borrowed reserves; `symbol` names the reserve when single. */
  borrowRate: { pct: number; avg: boolean; symbol?: string } | null;
  /** The market Pool the rate read hit — provenance plumbing. */
  pool?: string;
}

/** The address an event moved on a side, or null where it did not touch that
 *  side; `undefined` marks an event of a kind the lane walk does not read (a
 *  swap, a write-off) whose flows name the reserve. */
function laneAddressOf(e: BaseActivityEvent, side: "supply" | "debt"): string | null {
  const d = (e.context as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  const t = d.eventType as string | undefined;
  const flowToken = (i: number) => e.flows?.[i]?.token?.toLowerCase() ?? null;
  const reserve = typeof d.reserve === "string" ? d.reserve.toLowerCase() : null;
  if (t === "liquidation") {
    const coll = typeof d.collateralAsset === "string" ? d.collateralAsset.toLowerCase() : flowToken(0);
    if (side === "supply") return coll;
    const other = (e.flows ?? []).map((f) => f.token?.toLowerCase()).find((a) => a && a !== coll);
    return other ?? reserve;
  }
  const supplySide = t === "supply" || t === "withdraw" || t === "transfer_in" || t === "transfer_out";
  const debtSide = t === "borrow" || t === "repay";
  if ((side === "supply" && supplySide) || (side === "debt" && debtSide)) return reserve ?? flowToken(0);
  return null;
}

const KNOWN_LANE_TYPES = new Set([
  "supply",
  "withdraw",
  "transfer_in",
  "transfer_out",
  "borrow",
  "repay",
  "liquidation",
]);

/** Interest accrued since a balance last started from zero (the shared rule,
 *  lib/shared/interest-since-zero.ts), read off Aave V3 or SparkLend rows. A
 *  kind the lane walk does not read (a swap) that moved the reserve after the
 *  start nulls it. */
export function sinceZeroInterest(
  events: readonly BaseActivityEvent[],
  side: "supply" | "debt",
  address: string,
  current: number,
  dustAmount: number,
): { amount: number; since: number } | null {
  const addr = address.toLowerCase();
  const rows: LaneRow[] = [];
  let unreadAt: number | null = null;
  const ordered = [...events].sort((a, b) => a.blockNumber - b.blockNumber);
  for (const e of ordered) {
    const d = (e.context as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    const t = d.eventType as string | undefined;
    if (!t || !KNOWN_LANE_TYPES.has(t)) {
      if ((e.flows ?? []).some((f) => f.token?.toLowerCase() === addr)) unreadAt = e.timestamp;
      continue;
    }
    if (laneAddressOf(e, side) !== addr) continue;
    rows.push({
      timestamp: e.timestamp,
      before: numOrNull(side === "supply" ? d.supplyBefore : d.debtBefore),
      after: numOrNull(side === "supply" ? d.supplyAfter : d.debtAfter),
    });
  }
  const got = interestSinceZero(rows, current, dustAmount);
  if (got && unreadAt != null && unreadAt >= got.since) return null;
  return got;
}

/** One side's since-zero interest in USD, summed over its live reserves, and
 *  the earliest start among them. STRICT: a reserve that cannot state it, or an
 *  unpriced one, nulls the side. */
function sideSinceZeroUsd(
  side: "supply" | "debt",
  view: AaveFamilyTowerView,
  events: readonly BaseActivityEvent[] | undefined,
  usdOf: (address: string | undefined, amount: number) => number | null,
): { usd: number; since: number } | null {
  if (!events || events.length === 0) return null;
  const live = (side === "supply" ? view.supplies : view.borrows).filter((r) => r.amount > 0 && !r.decimalsUnread);
  if (live.length === 0) return null;
  let usd = 0;
  let since = Infinity;
  for (const r of live) {
    const unit = usdOf(r.address, 1);
    if (unit == null || unit <= 0) return null;
    // A balance worth under a cent counts as starting from zero.
    const got = sinceZeroInterest(events, side, r.address, r.amount, 0.01 / unit);
    if (!got) return null;
    usd += got.amount * unit;
    since = Math.min(since, got.since);
  }
  return Number.isFinite(since) ? { usd, since } : null;
}

export function computeAaveV3CardCaptions(
  view: AaveFamilyTowerView,
  events?: BaseActivityEvent[],
  chain?: AaveFamilyChainRead | null,
  /** Lifetime gross flows computed elsewhere over the WHOLE history — the
   *  swept explorers hand these in (their event list is capped), and the
   *  interest split then attributes against the whole life rather than a
   *  recent window. When present `events` is not reduced here at all. */
  precomputedLifetime?: ReserveFlows[],
  /** The rows on the page, for the interest since each balance last started
   *  from zero. Defaults to `events`. */
  rowEvents?: BaseActivityEvent[],
): AaveV3CardCaptions {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  // Borrow rate — from the live Pool read (getReserveData @ head). One borrowed
  // reserve → its own rate; several → the debt-USD-weighted average, with the
  // strict guard (every borrowed reserve rated AND oracle-priced, else omit).
  let borrowRate: AaveV3CardCaptions["borrowRate"] = null;
  if (chain && !chain.chainStale) {
    const borrowed = chain.reserves.filter((r) => r.hasBorrow && r.debtBalanceRaw !== "0");
    if (borrowed.length === 1 && borrowed[0].borrowApr != null) {
      borrowRate = { pct: borrowed[0].borrowApr * 100, avg: false, symbol: borrowed[0].symbol };
    } else if (borrowed.length > 1 && borrowed.every((r) => r.borrowApr != null)) {
      let wSum = 0;
      let rSum = 0;
      for (const r of borrowed) {
        const w = usdOf(r.address, scaleV3ChainBalance(r.debtBalanceRaw, r.decimals));
        if (w == null || w <= 0) {
          wSum = 0;
          break;
        }
        wSum += w;
        rSum += (r.borrowApr as number) * w;
      }
      if (wSum > 0) borrowRate = { pct: (rSum / wSum) * 100, avg: true };
    }
  }

  // The interest inside today's balances: since each last started from zero.
  const rows = rowEvents ?? events;
  const supplyInterest = sideSinceZeroUsd("supply", view, rows, usdOf);
  const debtInterest = sideSinceZeroUsd("debt", view, rows, usdOf);
  return {
    supplyInterestUsd: supplyInterest?.usd ?? null,
    debtInterestUsd: debtInterest?.usd ?? null,
    supplyInterestSince: supplyInterest?.since ?? null,
    debtInterestSince: debtInterest?.since ?? null,
    borrowRate,
    pool: chain?.pool,
  };
}

/** Index precomputed flows the way the reducer keys them. */
const bySymbol = (rows: ReserveFlows[]): Map<string, ReserveFlows> => new Map(rows.map((r) => [r.symbol, r]));

/** The tokens the tower leaves out: a reserve the card flags, and any token an
 *  event names whose decimals did not load (lib/shared/decimals-unread.ts). */
function aaveV3NotLoaded(
  view: AaveFamilyTowerView,
  events: BaseActivityEvent[],
  precomputed?: ReserveFlows[],
): UnreadToken[] {
  const out = new Map<string, UnreadToken>();
  for (const f of precomputed ?? [])
    if (f.decimalsUnread) out.set(f.symbol, { address: (f.address ?? "").toLowerCase(), label: f.symbol });
  for (const r of [...view.supplies, ...view.borrows])
    if (r.decimalsUnread) out.set(r.symbol, { address: r.address.toLowerCase(), label: r.symbol });
  for (const t of unreadTokensIn(events)) if (!out.has(t.label)) out.set(t.label, t);
  return [...out.values()];
}

/** The lifetime flows without the left-out tokens: every leg of theirs is
 *  scaled by the 18 stand-in. */
function withoutLeftOut(
  lifetime: Map<string, ReserveFlows> | null,
  leftOut: Set<string>,
): Map<string, ReserveFlows> | null {
  return lifetime && leftOut.size > 0 ? new Map([...lifetime].filter(([sym]) => !leftOut.has(sym))) : lifetime;
}

/** The tower's data, plus the liquidations' collateral split for the prose. */
export type AaveV3TowerData = ChainTruthTowerData & {
  /** Each liquidated collateral asset: what left in all, and of it the fee
   *  the Aave treasury took (the liquidator had the rest). */
  liquidationSplit?: { symbol: string; total: number; fee: number }[];
  /** Every liquidation in the rows read a protocol fee of 0 at its block, so
   *  the liquidator kept the whole bonus (Seamless). */
  liquidationFeeZero?: true;
};

export function computeAaveV3Economics(
  view: AaveFamilyTowerView,
  events?: BaseActivityEvent[],
  vocab: AaveV3TowerVocabulary = AAVE_V3_INDEXED_VOCABULARY,
  /** Lifetime gross flows computed elsewhere, over a history longer than the
   *  events passed in. When present these are used verbatim and `events` is
   *  ignored for the lifetime layer — which is the point: the swept explorers
   *  render a capped slice of a long history, and the totals must still be the
   *  whole of it. */
  precomputedLifetime?: ReserveFlows[],
  /** Per lane: the net its events moved beside the chain balance (decision
   *  0033). A side holding one reserve splits into that net and the interest
   *  on top, transfers included, with no conservation gate. */
  laneInterest?: readonly AaveLaneInterest[] | null,
): AaveV3TowerData {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };

  // Tokens whose decimals did not load are left out of every line and total,
  // and the tower names them.
  const notLoaded = aaveV3NotLoaded(view, events ?? [], precomputedLifetime);
  const leftOut = new Set(notLoaded.map((t) => t.label));
  const supplyLines: TowerLine[] = view.supplies
    .filter((r) => r.amount > 0 && !leftOut.has(r.symbol))
    .map((r) => ({
      key: r.address,
      symbol: r.symbol,
      amount: r.amount,
      usd: usdOf(r.address, r.amount),
      prov: vocab.supply(r.symbol, view.atBlock),
    }));

  const debtLines: TowerLine[] = view.borrows
    .filter((r) => r.amount > 0 && !leftOut.has(r.symbol))
    .map((r) => ({
      key: r.address,
      symbol: r.symbol,
      amount: r.amount,
      usd: usdOf(r.address, r.amount),
      prov: vocab.debt(r.symbol, view.atBlock),
    }));

  // ── Lifetime layer ─────────────────────────────────────────────────────────
  const lifetime = withoutLeftOut(
    precomputedLifetime
      ? bySymbol(precomputedLifetime)
      : events && events.length > 0
        ? reduceAaveFamilyLifetime(events)
        : null,
    leftOut,
  );
  // A flow's value: the part whose events carried a price at that event's
  // oracle price, the rest at today's.
  const settledAtEvent = (r: ReserveFlows, leg: FlowLeg): boolean => {
    const amount = r[leg] ?? 0;
    const p = r.atEvent?.[leg];
    return amount <= DUST || (p != null && amount - p.amount <= Math.max(DUST, amount * 1e-9));
  };
  const legUsd = (r: ReserveFlows, leg: FlowLeg): number | null => {
    const amount = r[leg] ?? 0;
    const p = r.atEvent?.[leg];
    if (!p || p.amount <= DUST) return usdOf(r.address, amount);
    if (settledAtEvent(r, leg)) return p.usd;
    const rest = usdOf(r.address, amount - p.amount);
    return rest == null ? null : p.usd + rest;
  };
  const flowLines = (leg: FlowLeg, flow: AaveV3LifetimeFlow, keyPrefix: string): TowerLine[] =>
    lifetime
      ? [...lifetime.values()]
          .filter((r) => (r[leg] ?? 0) > DUST)
          .map((r) => ({
            key: `${keyPrefix}-${r.symbol}`,
            symbol: r.symbol,
            amount: r[leg] ?? 0,
            usd: legUsd(r, leg),
            prov: vocab.lifetimeFlow(flow, r.symbol),
          }))
      : [];

  // Collateral that left other than by a plain withdrawal, each on its own
  // captioned row, so deposited + received + earned − out = held.
  const labelled = (lines: TowerLine[], flowLabel: string): TowerLine[] => lines.map((l) => ({ ...l, flowLabel }));
  const collExited = [
    ...flowLines("withdrawn", "withdrawn", "coll-withdrawn"),
    ...labelled(flowLines("soldToRepay", "sold to repay", "coll-sold"), "Sold to repay"),
    ...labelled(
      flowLines("withdrawnSwapped", "withdrawn and swapped", "coll-withdrawn-swapped"),
      "Withdrawn and swapped",
    ),
    ...labelled(flowLines("swappedOut", "swapped out", "coll-swapped-out"), "Swapped to another asset"),
    ...labelled(flowLines("transferredOut", "transferred out", "coll-sent"), "Sent to another account"),
  ];
  const collReceived = [
    ...labelled(flowLines("transferredIn", "transferred in", "coll-received"), "Received by transfer"),
    ...labelled(flowLines("swappedIn", "swapped in", "coll-swapped-in"), "Swapped in"),
  ];
  const collLiquidated = flowLines("liquidatedCollateral", "liquidated collateral", "coll-liq");
  const debtExited = [
    ...flowLines("repaid", "repaid", "debt-repaid"),
    ...labelled(flowLines("repaidBySwap", "repaid by a debt swap", "debt-repaid-swap"), "Repaid by a debt swap"),
  ];
  const debtLiquidated = flowLines("liquidatedDebt", "liquidated debt", "debt-liq");
  // Written off: involuntary like a liquidation cover (the same hatch, the
  // same bucket), captioned as what it is rather than "Liquidated".
  const debtWrittenOff = flowLines("writtenOff", "written off", WRITTEN_OFF_KEY).map((l) => ({
    ...l,
    flowLabel: "Written off",
  }));
  const FLOW_LEGS: FlowLeg[] = [
    "supplied",
    "withdrawn",
    "borrowed",
    "repaid",
    "liquidatedCollateral",
    "liquidatedDebt",
    "writtenOff",
    ...WINDOW_LEGS,
  ];
  const flowsAtEventPrices =
    lifetime != null &&
    lifetime.size > 0 &&
    [...lifetime.values()].every((r) => FLOW_LEGS.every((leg) => settledAtEvent(r, leg)));

  // Interest by symbol, per side: what the price-change gate checks the
  // token sums with.
  const supplyInterestBy = new Map<string, number>();
  const debtInterestBy = new Map<string, number>();

  // Interest segment — only on a SINGLE-reserve debt side (one symbol, one
  // honest token amount; a cross-reserve token sum would be meaningless). The
  // tower stacks `current + interest` as the total, so when the split engages
  // the current line must DROP to the net event principal — the rebased balance
  // already includes the interest (principal + accrued = balanceOf, verified
  // against the variableDebtToken on-chain in the Spark uplift).
  let interest: TowerLine | null = null;
  if (laneInterest && debtLines.length === 1) {
    const cur = debtLines[0];
    const r = view.borrows.find((h) => h.address === cur.key);
    const split = r ? splitHeld(r.amountRaw, r.decimals, laneFor(laneInterest, r.address, "debt")) : null;
    if (split) {
      debtLines[0] = {
        ...cur,
        amount: split.net,
        usd: usdOf(cur.key, split.net),
        prov: laneNetProv(cur.symbol, "debt"),
      };
      interest = {
        key: "debt-interest",
        symbol: cur.symbol,
        amount: split.interest,
        usd: usdOf(cur.key, split.interest),
        prov: laneInterestProv(cur.symbol, "debt"),
      };
      debtInterestBy.set(cur.symbol, split.interest);
    }
  }
  // Several debt assets: each line drops to its events' net, and the
  // interest on all of them is one line in USD (so borrowed + interest −
  // repaid − liquidated reaches the debt owed). Only where every line splits
  // and is priced; else the side stays as it was.
  if (laneInterest && !interest && debtLines.length > 1) {
    const splits = debtLines.map((cur) => {
      const r = view.borrows.find((h) => h.address === cur.key);
      const lane = r ? laneFor(laneInterest, r.address, "debt") : undefined;
      if (!r || !lane) return null;
      return splitHeld(r.amountRaw, r.decimals, lane);
    });
    const usd = splits.map((sp, i) => (sp ? usdOf(debtLines[i].key, sp.interest) : null));
    if (splits.every((sp) => sp != null && sp.net >= 0) && usd.every((u) => u != null)) {
      const total = (usd as number[]).reduce((a, b) => a + b, 0);
      if (total > 0) {
        const syms = debtLines.map((l) => l.symbol);
        for (let i = 0; i < debtLines.length; i++) {
          const sp = splits[i]!;
          const cur = debtLines[i];
          debtLines[i] = { ...cur, amount: sp.net, usd: usdOf(cur.key, sp.net), prov: laneNetProv(cur.symbol, "debt") };
          debtInterestBy.set(cur.symbol, sp.interest);
        }
        interest = {
          key: "debt-interest",
          symbol: "",
          amount: total,
          usd: total,
          prov: laneInterestProv(`${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`, "debt"),
        };
      }
    }
  }
  // The interest a lane no longer held earned or accrued over the position's
  // life: it grew the balance the flows took out, so it joins the inflow side.
  const lifeInterest = (side: "supply" | "debt", covered: Set<string>): TowerLine[] =>
    (laneInterest ?? [])
      .filter((lane) => lane.axis === side && !covered.has(lane.reserve))
      .flatMap((lane) => {
        const f = lifetime ? [...lifetime.values()].find((r) => r.address === lane.reserve) : undefined;
        const held = (side === "supply" ? view.supplies : view.borrows).find(
          (h) => h.address.toLowerCase() === lane.reserve,
        );
        const decimals = held?.decimals ?? decimalsOf(events, lane.reserve);
        if (!f || decimals == null || leftOut.has(f.symbol)) return [];
        // A reserve still held: its balance now less the lane's net, so the
        // interest since the lane's last move is in it too and the lines
        // reach what is held or owed.
        let raw: bigint;
        try {
          raw = held
            ? BigInt(held.amountRaw.split(".")[0]) - BigInt(lane.net.split(".")[0])
            : BigInt(lane.interest.split(".")[0]);
        } catch {
          return [];
        }
        if (raw <= BigInt(0)) return [];
        const amount = Number(raw) / 10 ** decimals;
        if (amount <= DUST) return [];
        (side === "supply" ? supplyInterestBy : debtInterestBy).set(f.symbol, amount);
        return [
          {
            key: `${side}-earned-${f.symbol}`,
            symbol: f.symbol,
            address: lane.reserve,
            amount,
            usd: usdOf(lane.reserve, amount),
            prov: laneInterestProv(f.symbol, side),
            flowLabel: side === "supply" ? "Interest earned" : "Interest accrued",
          },
        ];
      });

  // Supply interest: one "Interest earned" row per reserve that earned any.
  // A held reserve keeps its whole balance on its row; its interest is
  // the balance less the net its events moved (the lane's net where the api
  // states it, else the replay's). A reserve no longer held states its lane's.
  const supplyEarned: TowerLine[] = [];
  if (lifetime || laneInterest) {
    const heldKeys = new Set<string>();
    for (const cur of supplyLines) {
      heldKeys.add(cur.key.toLowerCase());
      const r = view.supplies.find((h) => h.address === cur.key);
      const lane = r ? laneFor(laneInterest, r.address, "supply") : undefined;
      let amt = 0;
      if (r && lane) amt = splitHeld(r.amountRaw, r.decimals, lane)?.interest ?? 0;
      else {
        const f = lifetime?.get(cur.symbol);
        if (f) amt = legInterest(cur.amount, supplyIn(f) - supplyOut(f), supplyIn(f));
      }
      if (amt <= DUST) continue;
      supplyInterestBy.set(cur.symbol, amt);
      supplyEarned.push({
        key: `supply-earned-${cur.symbol}`,
        symbol: cur.symbol,
        address: cur.key.toLowerCase(),
        amount: amt,
        usd: usdOf(cur.key, amt),
        prov: laneInterestProv(cur.symbol, "supply"),
        flowLabel: "Interest earned",
      });
    }
    supplyEarned.push(...lifeInterest("supply", heldKeys));
  }
  const debtCovered = new Set(
    interest
      ? (interest.symbol ? debtLines.filter((l) => l.symbol === interest!.symbol) : debtLines).map((l) =>
          l.key.toLowerCase(),
        )
      : [],
  );
  const debtEarned = laneInterest ? lifeInterest("debt", debtCovered) : [];

  // One debt asset and no lane: the events' net beside the balance. Where the
  // repayments exceed the borrowing, the interest they covered is its own
  // "Interest accrued" row and the balance stays whole, so no principal line
  // goes below zero; otherwise the balance splits into principal and interest.
  if (!interest && lifetime && debtLines.length === 1 && !debtEarned.some((l) => l.symbol === debtLines[0].symbol)) {
    const cur = debtLines[0];
    const f = lifetime.get(cur.symbol);
    if (f) {
      const net = f.borrowed - debtOut(f);
      const amt = legInterest(cur.amount, net, f.borrowed);
      if (amt > 0 && net < 0) {
        debtEarned.push({
          key: `debt-earned-${cur.symbol}`,
          symbol: cur.symbol,
          address: cur.key.toLowerCase(),
          amount: amt,
          usd: usdOf(cur.key, amt),
          prov: vocab.debtInterest(cur.symbol),
          flowLabel: "Interest accrued",
        });
        debtInterestBy.set(cur.symbol, amt);
      } else if (amt > 0) {
        interest = {
          key: "debt-interest",
          symbol: cur.symbol,
          amount: amt,
          usd: usdOf(cur.key, amt),
          prov: vocab.debtInterest(cur.symbol),
        };
        debtLines[0] = {
          ...cur,
          amount: net,
          usd: usdOf(cur.key, net),
          prov: vocab.debtPrincipal(cur.symbol),
        };
        debtInterestBy.set(cur.symbol, amt);
      }
    }
  }

  // Value the tower only when EVERY contributing line is oracle-priced — a strict
  // per-total guard. A single unpriced reserve drops it to the token gated list,
  // so a bar height is never a partial (misleading) USD figure.
  const contributing = [
    ...supplyLines,
    ...debtLines,
    ...collExited,
    ...collLiquidated,
    ...debtExited,
    ...debtLiquidated,
    ...debtWrittenOff,
    ...(interest ? [interest] : []),
    ...collReceived,
    ...supplyEarned,
    ...debtEarned,
  ];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  // Lifetime inflow (the faded side bar) — USD when valued; a token amount is
  // only meaningful when one reserve flowed, else suppressed.
  const inflow = (leg: FlowLeg): number => {
    if (!lifetime) return 0;
    const rows = [...lifetime.values()].filter((r) => (r[leg] ?? 0) > DUST);
    if (rows.length === 0) return 0;
    if (valued) return rows.reduce((s, r) => s + (legUsd(r, leg) ?? 0), 0);
    return rows.length === 1 ? (rows[0][leg] ?? 0) : 0;
  };
  const collInflow = inflow("supplied");
  const debtInflow = inflow("borrowed");

  // Price change: each flow is valued at its event's price and what is held at
  // today's, so in dollars the column reaches what is held only with the
  // difference beside it. Stated only where the token sums hold reserve by
  // reserve (in + interest − out = held); otherwise the gap would be something
  // other than prices, and the row would hide it.
  const usdSum = (lines: TowerLine[]): number => lines.reduce((s, l) => s + (l.usd ?? 0), 0);
  const priceChange = (side: "supply" | "debt"): TowerLine | null => {
    if (!valued || !lifetime) return null;
    const heldRows = (side === "supply" ? view.supplies : view.borrows).filter(
      (h) => h.amount > 0 && !leftOut.has(h.symbol),
    );
    const syms = new Set([...lifetime.keys(), ...heldRows.map((h) => h.symbol)]);
    for (const sym of syms) {
      const r = lifetime.get(sym);
      const held = heldRows.find((h) => h.symbol === sym)?.amount ?? 0;
      const inn = r ? (side === "supply" ? supplyIn(r) : r.borrowed) : 0;
      const out = r ? (side === "supply" ? supplyOut(r) : debtOut(r)) : 0;
      const int = (side === "supply" ? supplyInterestBy : debtInterestBy).get(sym) ?? 0;
      if (Math.abs(inn + int - out - held) > Math.max(1e-6, (inn + held) * 1e-6)) return null;
    }
    // The debt column reaches its principal lines first, and the interest
    // still owed stacks on them after, so the price change stops at those.
    const heldUsd = side === "supply" ? usdSum(supplyLines) : usdSum(debtLines);
    const inUsd =
      side === "supply" ? collInflow + usdSum(collReceived) + usdSum(supplyEarned) : debtInflow + usdSum(debtEarned);
    const outUsd =
      side === "supply"
        ? usdSum(collExited) + usdSum(collLiquidated)
        : usdSum(debtExited) + usdSum(debtLiquidated) + usdSum(debtWrittenOff);
    const change = heldUsd - (inUsd - outUsd);
    if (Math.abs(change) < 0.5) return null;
    return {
      key: `${side}-price-change`,
      symbol: "",
      amount: change,
      usd: change,
      prov: priceChangeProv(side),
      flowLabel: "Price change",
    };
  };

  // Each liquidation's collateral, split into the liquidator's share and the
  // treasury's fee, per collateral asset.
  const liquidationSplit = lifetime
    ? [...lifetime.values()]
        .filter((r) => r.liquidatedCollateral > DUST && (r.treasuryFee ?? 0) > 0)
        .map((r) => ({ symbol: r.symbol, total: r.liquidatedCollateral, fee: r.treasuryFee ?? 0 }))
    : [];

  // Every liquidation in the rows paid no protocol fee (the fee bps its
  // block's configuration read), and none sent a fee row to a treasury.
  const liqRows = (events ?? []).filter((e) => isAaveV3Event(e) && e.context.data.eventType === "liquidation");
  const liquidationFeeZero =
    liqRows.length > 0 &&
    liquidationSplit.length === 0 &&
    liqRows.every((e) => isAaveV3Event(e) && e.context.data.liquidationBonusAtBlock?.protocolFeeBps === 0);

  return {
    valued,
    // On-chain oracle price → chain-derived, so the USD bars survive On-chain-values.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: supplyLines,
      interest: null,
      ...(supplyEarned.length > 0 ? { earned: supplyEarned } : {}),
      ...(collReceived.length > 0 ? { received: collReceived } : {}),
      exited: collExited,
      liquidated: collLiquidated,
      lifetimeInflow: collInflow,
      priceChange: priceChange("supply"),
    },
    debt: {
      current: debtLines,
      interest,
      ...(debtEarned.length > 0 ? { earned: debtEarned } : {}),
      exited: debtExited,
      liquidated: [...debtLiquidated, ...debtWrittenOff],
      lifetimeInflow: debtInflow,
      inflowLines: flowLines("borrowed", "borrowed", "debt-borrowed"),
      priceChange: priceChange("debt"),
    },
    interestNote:
      interest != null || debtEarned.length > 0
        ? undefined
        : `Balances include the interest built up since each supply and borrow, so every figure is what the position holds now rather than the amount originally moved. The split between principal and accrued interest is shown only when the debt is a single asset whose history adds up cleanly. Dollar values use ${v3Possessive(vocab.brand ?? v3Brand(vocab.protocol ?? "Aave V3"), "'")} own price for each asset.`,
    ...(notLoaded.length > 0 ? { notLoaded } : {}),
    flowsPricedAtEvents: valued && flowsAtEventPrices,
    ...(liquidationSplit.length > 0 ? { liquidationSplit } : {}),
    ...(liquidationFeeZero ? { liquidationFeeZero: true as const } : {}),
  };
}

/** The price-change row's receipt. */
function priceChangeProv(side: "supply" | "debt"): Provenance {
  return {
    kind: "chain-derived",
    summary: `Price change — the difference between valuing each ${side === "supply" ? "supply, withdrawal, transfer and liquidation" : "borrow, repayment and liquidation"} at the oracle price at its block and valuing what is ${side === "supply" ? "held" : "owed"} now at today's price. In tokens the column adds up without it.`,
    formula: side === "supply" ? "held now − (in − out)" : "owed now − (in − out)",
    inputs: [
      { label: "flows", kind: "chain-derived", pclass: "oracle", note: "each at its event's oracle price" },
      {
        label: side === "supply" ? "held now" : "owed now",
        kind: "chain-derived",
        pclass: "oracle",
        note: "at today's oracle price",
      },
    ],
  };
}
