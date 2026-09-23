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
// plausibility gates). aToken transfers (captured and shown on the timeline
// since mig 160) are custody moves, not Pool flows — they stay outside the
// deposited/withdrawn sums by design (the provenance says so), and a
// transfer-fed reserve fails the conservation gates below rather than guess.
// The V3 index starts at the backfill floor, not V3's deploy block, so
// "lifetime" means the captured history — the interest gates bail whenever the
// principal doesn't attribute cleanly. When RPC is down and a contributing
// reserve is unpriced, the tower degrades to the token-only gated list (a
// strict per-total guard) rather than assert a partial USD total.

import type { AaveV3PositionView } from "@/components/protocol/aave-v3/aave-v3-position-card";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import { scaleV3ChainBalance } from "@/lib/api/fetch-aave-v3-position";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
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
}

/** Key prefix of the tower's written-off debt lines: they ride the debt
 *  side's `liquidated` bucket (involuntary, the same hatch) under their own
 *  caption, and the economics prose tells them apart by this prefix. */
export const WRITTEN_OFF_KEY = "debt-written-off";

function foldAaveV3Lifetime(events: BaseActivityEvent[]): Map<string, ReserveFlows> {
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

  for (const ev of events) {
    if (!isAaveV3Event(ev)) continue;
    const ctx = ev.context.data;
    if (ctx.eventType === "liquidation") {
      const seized = Math.abs(Number(ctx.liquidatedCollateralAmount));
      const covered = Math.abs(Number(ctx.debtToCover));
      // flows: [collateral out, debt out] — addresses for pricing.
      const collAddr = ctx.collateralAsset ?? ev.flows[0]?.token;
      const debtAddr = ev.flows[1]?.token;
      if (ctx.collateralSymbol && Number.isFinite(seized))
        get(ctx.collateralSymbol, collAddr).liquidatedCollateral += seized;
      if (ctx.reserveSymbol && Number.isFinite(covered)) get(ctx.reserveSymbol, debtAddr).liquidatedDebt += covered;
      continue;
    }
    const mag = Math.abs(Number(ctx.amount));
    if (!ctx.reserveSymbol || !Number.isFinite(mag) || mag === 0) continue;
    const r = get(ctx.reserveSymbol, ev.flows[0]?.token);
    if (ctx.eventType === "swap") {
      // A swap reduces as the two rows it merges: a transfer leg is no flow,
      // and a leg the Pool logged (a supply, borrow or repay) counts as that
      // flow, as the index's summary counts the same rows below a cut.
      const s = ctx.swap;
      const add = (into: ReserveFlows, action: string | undefined, amount: number) => {
        if (!Number.isFinite(amount)) return;
        if (action === "supply") into.supplied += amount;
        else if (action === "borrow") into.borrowed += amount;
        else if (action === "repay") into.repaid += amount;
      };
      if (s?.events) {
        // A ParaSwap swap's legs are net (server mig 248): count each row behind
        // them as its own flow, as the summary counts those rows.
        for (const e of s.events) if (e.symbol) add(get(e.symbol, e.asset), e.action, Math.abs(Number(e.amount)));
        continue;
      }
      add(r, s?.givenAction, mag);
      // A withdraw and swap's bought token left the position: no reserve of it.
      if (s?.receivedSymbol && s.receivedAction !== "trade")
        add(
          get(s.receivedSymbol, s.receivedAsset ?? ev.flows[1]?.token),
          s.receivedAction,
          Math.abs(Number(s.receivedAmount)),
        );
      continue;
    }
    if (ctx.eventType === "supply") r.supplied += mag;
    else if (ctx.eventType === "withdraw") r.withdrawn += mag;
    else if (ctx.eventType === "borrow") r.borrowed += mag;
    else if (ctx.eventType === "repay") r.repaid += mag;
    // bad_debt_written_off: a debt OUTFLOW. The Pool burned this much of the
    // reserve's debt with nothing repaid (DeficitCreated), so it left the
    // position exactly as a repay or a liquidation cover does, and the debt
    // side's principal, interest split and conservation gates must all see
    // it leave. Left out, every written-off wallet's lifetime debt was
    // under-counted by the burn and its interest split read the burn as
    // principal still owed (rails-ops TO-DO-ui-jobs §20).
    else if (ctx.eventType === "bad_debt_written_off") r.writtenOff += mag;
    // transfer_in / transfer_out: custody moves, deliberately NOT flows —
    // they are neither deposits nor withdrawals, so they contribute nothing
    // here and a transfer-fed reserve refuses at the conservation gates.
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

  for (const [symbol, windowFlows] of foldAaveV3Lifetime(events)) {
    if (refused.has(symbol)) continue;
    const r = get(symbol, windowFlows.address);
    for (const leg of LEGS) r[leg] += windowFlows[leg];
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
  view: AaveV3PositionView,
  events: BaseActivityEvent[],
  precomputed?: ReserveFlows[],
): string[] {
  const lifetime = precomputed ? bySymbol(precomputed) : foldAaveV3Lifetime(events);
  const out = new Set<string>();
  for (const f of lifetime.values()) {
    if (!f.address) continue; // no address → unpriceable either way
    const a = f.address.toLowerCase();
    const p = view.priceByAddress?.[a];
    if (typeof p === "number" && p > 0) continue;
    const flows =
      f.supplied + f.withdrawn + f.borrowed + f.repaid + f.liquidatedCollateral + f.liquidatedDebt + f.writtenOff;
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
  /** USD of accrued supply interest included in the collateral balance. */
  supplyInterestUsd: number | null;
  /** USD of accrued borrow interest included in the debt balance. */
  debtInterestUsd: number | null;
  /** Current variable borrow APR (%). `avg` when debt-USD-weighted across
   *  several borrowed reserves; `symbol` names the reserve when single. */
  borrowRate: { pct: number; avg: boolean; symbol?: string } | null;
  /** The market Pool the rate read hit — provenance plumbing. */
  pool?: string;
}

/** USD of accrued interest included in one side's balance — per live reserve,
 *  (current rebased balance − net event principal) × oracle price, summed.
 *  STRICT: a reserve that can't attribute (no captured inflow, negative
 *  interest = missed principal, interest > gross inflow = a transfer-fed
 *  balance whose custody moves are deliberately not flows, or an unpriced
 *  reserve) nulls the whole caption rather than understate it; a genuinely
 *  ~zero interest just contributes nothing. */
function sideInterestUsd(
  side: "supply" | "debt",
  view: AaveV3PositionView,
  lifetime: Map<string, ReserveFlows> | null,
  usdOf: (address: string | undefined, amount: number) => number | null,
): number | null {
  if (!lifetime) return null;
  const live = (side === "supply" ? view.supplies : view.borrows).filter((r) => r.amount > 0);
  if (live.length === 0) return null;
  let sum = 0;
  for (const cur of live) {
    const f = lifetime.get(cur.symbol);
    if (!f) return null;
    const gross = side === "supply" ? f.supplied : f.borrowed;
    const net =
      side === "supply"
        ? f.supplied - f.withdrawn - f.liquidatedCollateral
        : f.borrowed - f.repaid - f.liquidatedDebt - f.writtenOff;
    if (gross <= 0) return null;
    const interest = cur.amount - net;
    if (interest < -DUST || interest > gross) return null;
    if (interest <= DUST) continue;
    const usd = usdOf(cur.address, interest);
    if (usd == null) return null;
    sum += usd;
  }
  return sum;
}

export function computeAaveV3CardCaptions(
  view: AaveV3PositionView,
  events?: BaseActivityEvent[],
  chain?: AaveV3PositionChainResponse | null,
  /** Lifetime gross flows computed elsewhere over the WHOLE history — the
   *  swept explorers hand these in (their event list is capped), and the
   *  interest split then attributes against the whole life rather than a
   *  recent window. When present `events` is not reduced here at all. */
  precomputedLifetime?: ReserveFlows[],
): AaveV3CardCaptions {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  const lifetime = precomputedLifetime
    ? bySymbol(precomputedLifetime)
    : events && events.length > 0
      ? foldAaveV3Lifetime(events)
      : null;

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

  return {
    supplyInterestUsd: sideInterestUsd("supply", view, lifetime, usdOf),
    debtInterestUsd: sideInterestUsd("debt", view, lifetime, usdOf),
    borrowRate,
    pool: chain?.pool,
  };
}

/** Index precomputed flows the way the reducer keys them. */
const bySymbol = (rows: ReserveFlows[]): Map<string, ReserveFlows> => new Map(rows.map((r) => [r.symbol, r]));

export function computeAaveV3Economics(
  view: AaveV3PositionView,
  events?: BaseActivityEvent[],
  vocab: AaveV3TowerVocabulary = AAVE_V3_INDEXED_VOCABULARY,
  /** Lifetime gross flows computed elsewhere, over a history longer than the
   *  events passed in. When present these are used verbatim and `events` is
   *  ignored for the lifetime layer — which is the point: the swept explorers
   *  render a capped slice of a long history, and the totals must still be the
   *  whole of it. */
  precomputedLifetime?: ReserveFlows[],
): ChainTruthTowerData {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };

  const supplyLines: TowerLine[] = view.supplies
    .filter((r) => r.amount > 0)
    .map((r) => ({
      key: r.address,
      symbol: r.symbol,
      amount: r.amount,
      usd: usdOf(r.address, r.amount),
      prov: vocab.supply(r.symbol, view.atBlock),
    }));

  const debtLines: TowerLine[] = view.borrows
    .filter((r) => r.amount > 0)
    .map((r) => ({
      key: r.address,
      symbol: r.symbol,
      amount: r.amount,
      usd: usdOf(r.address, r.amount),
      prov: vocab.debt(r.symbol, view.atBlock),
    }));

  // ── Lifetime layer ─────────────────────────────────────────────────────────
  const lifetime = precomputedLifetime
    ? bySymbol(precomputedLifetime)
    : events && events.length > 0
      ? foldAaveV3Lifetime(events)
      : null;
  const flowLines = (pick: (r: ReserveFlows) => number, flow: AaveV3LifetimeFlow, keyPrefix: string): TowerLine[] =>
    lifetime
      ? [...lifetime.values()]
          .filter((r) => pick(r) > DUST)
          .map((r) => ({
            key: `${keyPrefix}-${r.symbol}`,
            symbol: r.symbol,
            amount: pick(r),
            usd: usdOf(r.address, pick(r)),
            prov: vocab.lifetimeFlow(flow, r.symbol),
          }))
      : [];

  const collExited = flowLines((r) => r.withdrawn, "withdrawn", "coll-withdrawn");
  const collLiquidated = flowLines((r) => r.liquidatedCollateral, "liquidated collateral", "coll-liq");
  const debtExited = flowLines((r) => r.repaid, "repaid", "debt-repaid");
  const debtLiquidated = flowLines((r) => r.liquidatedDebt, "liquidated debt", "debt-liq");
  // Written off: involuntary like a liquidation cover (the same hatch, the
  // same bucket), captioned as what it is rather than "Liquidated".
  const debtWrittenOff = flowLines((r) => r.writtenOff, "written off", WRITTEN_OFF_KEY).map((l) => ({
    ...l,
    flowLabel: "Written off",
  }));

  // Interest segment — only on a SINGLE-reserve debt side (one symbol, one
  // honest token amount; a cross-reserve token sum would be meaningless). The
  // tower stacks `current + interest` as the total, so when the split engages
  // the current line must DROP to the net event principal — the rebased balance
  // already includes the interest (principal + accrued = balanceOf, verified
  // against the variableDebtToken on-chain in the Spark uplift).
  let interest: TowerLine | null = null;
  if (lifetime && debtLines.length === 1) {
    const cur = debtLines[0];
    const f = lifetime.get(cur.symbol);
    if (f) {
      const net = f.borrowed - f.repaid - f.liquidatedDebt - f.writtenOff;
      const amt = legInterest(cur.amount, net, f.borrowed);
      if (amt > 0) {
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
  ];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  // Lifetime inflow (the faded side bar) — USD when valued; a token amount is
  // only meaningful when one reserve flowed, else suppressed.
  const inflow = (pick: (r: ReserveFlows) => number): number => {
    if (!lifetime) return 0;
    const rows = [...lifetime.values()].filter((r) => pick(r) > DUST);
    if (rows.length === 0) return 0;
    if (valued) return rows.reduce((s, r) => s + (usdOf(r.address, pick(r)) ?? 0), 0);
    return rows.length === 1 ? pick(rows[0]) : 0;
  };

  return {
    valued,
    // On-chain oracle price → chain-derived, so the USD bars survive On-chain-values.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: supplyLines,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      lifetimeInflow: inflow((r) => r.supplied),
    },
    debt: {
      current: debtLines,
      interest,
      exited: debtExited,
      liquidated: [...debtLiquidated, ...debtWrittenOff],
      lifetimeInflow: inflow((r) => r.borrowed),
    },
    interestNote:
      interest != null
        ? undefined
        : `Balances include the interest built up since each supply and borrow, so every figure is what the position holds now rather than the amount originally moved. The split between principal and accrued interest is shown only when the debt is a single asset whose history adds up cleanly. Dollar values use ${v3Possessive(v3Brand(vocab.protocol ?? "Aave V3"), "'")} own price for each asset.`,
  };
}
