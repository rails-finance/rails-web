// Maple economics reduction — the lender tower with lifetime flows and the
// interest earned.
// ----------------------------------------------------------------------------
// A Maple lender has ONE side: the pool claim. The tower's collateral column
// carries it — the CURRENT redeemable value when the chain read landed
// ((shares + escrowed) × the pool's convertToExitAssets at head) and the
// replayed deposited principal otherwise; the spread between the two is
// earned interest. There is no debt column (nothing is borrowed against).
//
// USD is deliberately NOT asserted: the funds assets ARE dollar stablecoins
// (USDC / USDT), and pinning them to $1 is charter-forbidden (S3 — a pin
// erases exactly the depeg signal this explorer exists to show). The tower
// renders token amounts in the pool's own asset; a Chainlink USDC/USD ambient
// is a later layer if wanted.
//
// With the wallet's event stream (optional second arg) the tower gains the
// lifetime layer: hatched withdrawn segments per pool, the faded
// lifetime-inflow bar, and the interest each pool earned over its life. The
// card's "incl." caption renders only when a single pool holds shares and its
// interest is still inside the claim (the Spark legInterest gates) — a
// cross-pool token sum would mix USDC and USDT.
//
// Pool shares also move wallet to wallet with no pool event. Each such transfer
// is valued at the pool's rate in its block (rails-server mig 339: an archive
// read of totalAssets ÷ totalSupply, or the same-block Deposit / Withdraw log
// that priced the pool at that moment), so shares received count into the
// principal and shares sent come out of it at what they were worth then.
// Checked on five positions on 2026-09-28: deposits + received − withdrawn −
// sent + Σ (shares held × the rate's rise) lands on convertToAssets at head
// within 0.0001 of the funds asset.

import type { MaplePositionView } from "@/components/protocol/maple/maple-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import {
  positionCurrentValueProv,
  positionPrincipalProv,
  interestEarnedLifetimeProv,
  mapleLifetimeFlowProv,
  mapleTransferFlowProv,
} from "@/lib/maple/event-provenance";
import { maplePoolOf } from "@/lib/maple/asset-catalog";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { folderFlows, mergeFlowBuckets } from "@/lib/shared/timeline-folder-reductions";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Per-pool lifetime gross asset flows, replayed from the wallet's own events. */
export interface PoolFlows {
  pool: string;
  assetSymbol: string;
  deposited: number;
  withdrawn: number;
  /** Shares received / sent by plain transfer, valued at the pool's rate in
   *  each transfer's block. */
  transferredIn: number;
  transferredOut: number;
  /** The share counts behind `transferredIn` / `transferredOut`, where every
   *  transfer in the pool was a loaded row. Null where part of them sits in an
   *  opening balance, which carries values but no share counts. */
  sharesIn: number | null;
  sharesOut: number | null;
  /** A share transfer in this pool has no value: the index holds no rate for
   *  its block (or the answer predates the rate). Without it the principal does
   *  not bracket the claim — a received share redeemed later reads as a
   *  withdrawal with nothing put in behind it, and the spread would pass for
   *  interest — so the interest split and the lifetime segments stand down. */
  sharesMoved: boolean;
}

const SHARE_TRANSFERS: ReadonlySet<string> = new Set(["transfer_in", "transfer_out"]);

const emptyFlows = (pool: string, assetSymbol: string): PoolFlows => ({
  pool,
  assetSymbol,
  deposited: 0,
  withdrawn: 0,
  transferredIn: 0,
  transferredOut: 0,
  sharesIn: 0,
  sharesOut: 0,
  sharesMoved: false,
});

/** What went in and what came out, transfers at their block's rate. */
const grossIn = (f: PoolFlows): number => f.deposited + f.transferredIn;
const netPrincipal = (f: PoolFlows): number => f.deposited + f.transferredIn - f.withdrawn - f.transferredOut;

function replayMapleLifetime(events: BaseActivityEvent[]): Map<string, PoolFlows> {
  const flows = new Map<string, PoolFlows>();
  const get = (pool: string, assetSymbol: string): PoolFlows => {
    const cur = flows.get(pool) ?? emptyFlows(pool, assetSymbol);
    flows.set(pool, cur);
    return cur;
  };
  for (const ev of events) {
    if (!isMapleEvent(ev)) continue;
    const ctx = ev.context.data;
    if (SHARE_TRANSFERS.has(ctx.eventType)) {
      const f = get(ctx.pool, ctx.assetSymbol);
      const value = ctx.transferValue == null ? NaN : Number(ctx.transferValue);
      const shares = Math.abs(Number(ctx.sharesDelta ?? "NaN"));
      if (!Number.isFinite(value)) f.sharesMoved = true;
      else if (ctx.eventType === "transfer_in") f.transferredIn += value;
      else f.transferredOut += value;
      if (ctx.eventType === "transfer_in")
        f.sharesIn = Number.isFinite(shares) && f.sharesIn != null ? f.sharesIn + shares : null;
      else f.sharesOut = Number.isFinite(shares) && f.sharesOut != null ? f.sharesOut + shares : null;
      continue;
    }
    const mag = Math.abs(Number(ctx.assetsDelta ?? "0"));
    if (!Number.isFinite(mag) || mag === 0) continue;
    const f = get(ctx.pool, ctx.assetSymbol);
    if (ctx.eventType === "deposit") f.deposited += mag;
    else if (ctx.eventType === "withdraw" || ctx.eventType === "request_fill") f.withdrawn += mag;
  }
  return flows;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance seeded first, the
 * loaded rows added on top.
 *
 * Pass the result to `computeMapleEconomics` / `computeMapleCardCaptions` as
 * `precomputedLifetime`; both then reduce the whole position rather than the
 * window they happen to have drawn, and every surface downstream of them — the
 * withdrawn segments, the lifetime inflow bar, the principal/interest split —
 * follows without knowing a window exists.
 *
 * The two halves never overlap: the opening balance covers `block_number <
 * cutoffBlock` and every event passed in is at or after it, so summing them is
 * addition and not reconciliation.
 *
 * The pool is the key on both sides. rails-server keys its flow buckets by
 * `e.pool` and declares them `poolKey`, so the summary proxy leaves them
 * verbatim — key-for-key with the `ctx.pool` this module's own reducer groups
 * by. The asset SYMBOL comes from the catalog rather than from the bucket,
 * through the same `maplePoolOf` the rows resolve with.
 *
 * ⚠️ A pool whose summarised legs cannot be scaled — no decimals for its asset
 * — LEAVES the lifetime layer entirely, its loaded rows with it. Adding a zero
 * for the summarised part would state a lifetime deposited/withdrawn short by
 * whatever sat below the cut, and the gates downstream cannot detect that: a
 * short `deposited` widens `legInterest`'s ceiling and slides the interest
 * split, and `poolReconciles`'s residue test would be measuring against a number that
 * is not the position's. Refusing the pool is the same choice the reducer
 * already makes for a pool whose flows do not reconcile — state nothing rather
 * than something partial.
 */
export function mapleLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  folders?: readonly ServedFolder[] | null,
): Map<string, PoolFlows> | undefined {
  // Undefined = nothing outside `events`, so the reducer reads them as the
  // whole history. On a grouped answer the folders hold members `events` does
  // not, and their flows are the third half of the partition (the summary
  // below the cut, the events and the folders above it).
  if (!opening && (folders?.length ?? 0) === 0) return undefined;
  const merged = new Map<string, PoolFlows>();
  const get = (pool: string, assetSymbol: string): PoolFlows => {
    const cur = merged.get(pool) ?? emptyFlows(pool, assetSymbol);
    merged.set(pool, cur);
    return cur;
  };
  // Pools the opening balance names but cannot state. They are excluded from
  // BOTH halves — see the refusal above.
  const unscalable = new Set<string>();

  // The leg names are the field names above, chosen on the rails-server side to
  // be exactly that so the merge needs no translation table to drift out of
  // date. Deposit / withdraw / request_fill carry their assets; a share transfer
  // carries its shares at the pool's rate in its block, and one with no rate
  // counts into `unvaluedTransfers` (a count, read as a flag). The request,
  // decrease and cancel events move shares within the position.
  const LEGS = ["deposited", "withdrawn", "transferredIn", "transferredOut"] as const;
  const buckets = mergeFlowBuckets(opening?.flows, folderFlows(folders));
  // An answer from before the transfer legs existed counts transfers below the
  // cut in `byAction` and values none of them.
  const transferLegsServed = buckets.some((b) =>
    ["transferredIn", "transferredOut", "unvaluedTransfers"].some((leg) => b.legs[leg] !== undefined),
  );
  for (const bucket of buckets) {
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
      unscalable.add(bucket.key);
      continue;
    }
    const f = get(bucket.key, maplePoolOf(bucket.key).assetSymbol);
    for (const leg of LEGS) f[leg] += scaled[leg] ?? 0;
    // The summary values its transfers but does not count their shares.
    if ((scaled.transferredIn ?? 0) > 0) f.sharesIn = null;
    if ((scaled.transferredOut ?? 0) > 0) f.sharesOut = null;
    const unvalued = bucket.legs.unvaluedTransfers;
    if (unvalued !== undefined && unvalued !== "0") f.sharesMoved = true;
  }

  for (const [pool, windowFlows] of replayMapleLifetime(events)) {
    if (unscalable.has(pool)) continue;
    const f = get(pool, windowFlows.assetSymbol);
    for (const leg of LEGS) f[leg] += windowFlows[leg];
    f.sharesIn = f.sharesIn != null && windowFlows.sharesIn != null ? f.sharesIn + windowFlows.sharesIn : null;
    f.sharesOut = f.sharesOut != null && windowFlows.sharesOut != null ? f.sharesOut + windowFlows.sharesOut : null;
    f.sharesMoved ||= windowFlows.sharesMoved;
  }

  // Folders never hold a transfer: the served kinds are queue fills and owner
  // deposit/withdraw runs. An opening balance that counts transfers but serves
  // no transfer legs values none of them, and its action counts are for the
  // whole wallet, so every pool stands down.
  if (!transferLegsServed && opening?.byAction.some((b) => SHARE_TRANSFERS.has(b.key) && b.count > 0)) {
    for (const f of merged.values()) f.sharesMoved = true;
  }

  return merged;
}

/** Chain-faithful interest on the claim (the Spark legInterest gates):
 *  - no current figure / no gross inflow → can't attribute, bail;
 *  - interest < dust → zero (or negative: missed principal, bail);
 *  - interest > grossIn → >100% cumulative yield, physically implausible → bail;
 *  - interest > current → more came out than went in, so part of the interest
 *    has left with the withdrawals and the claim cannot include it. The card
 *    says the interest is inside the claim ("incl. …"), which would be false:
 *    wallet 0x1601…347e holds 0.000001 USDC and has earned 23.43M over its
 *    life. Bail; the tower's lifetime line states that figure. */
function legInterest(current: number | undefined | null, netPrincipal: number, grossIn: number): number {
  if (current == null || grossIn <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < DUST) return 0;
  if (interest > grossIn) return 0;
  if (interest > current + DUST) return 0;
  return interest;
}

/** What a pool's claim holds now: its chain read where one landed, the replayed
 *  principal otherwise, and zero once it holds no shares and nothing escrowed,
 *  whatever its replayed principal reads. */
function heldIn(view: MaplePositionView, pool: string): number {
  const p = view.pools.find((x) => x.pool === pool && x.shares + x.escrowedShares > 0);
  return p ? (p.currentValue ?? p.depositedPrincipal) : 0;
}

/** A pool's flows render only when they're PLAUSIBLE against its claim: a
 *  claim may exceed net principal by earned interest alone (the legInterest
 *  bounds). Shares received and sent count at the pool's rate in their block;
 *  a pool with a transfer the index could not value stays off the tower, since
 *  its "all time" story would not sum (a transfer in that was later redeemed
 *  passes the residue test with the claim back at zero, so `sharesMoved` gates
 *  it as well). */
function poolReconciles(view: MaplePositionView, f: PoolFlows): boolean {
  if (f.sharesMoved) return false;
  const residue = heldIn(view, f.pool) - netPrincipal(f);
  const eps = grossIn(f) * 1e-9 + 1e-9;
  return residue >= -eps && residue <= grossIn(f) + eps;
}

/** Interest each pool earned over the position's life: held now + withdrawn +
 *  sent − deposited − received, the same figure as the interest the pool's
 *  timeline rows state one gap at a time, added up (each row's interest since
 *  the previous one, plus the rise since the last). It stands whether the claim
 *  still holds it or withdrawals have taken it out (wallet 0x1601…347e: 23.43M
 *  USDC earned, 0.000001 held). Only pools whose flows reconcile and, when
 *  live, whose claim is a chain read. */
function lifetimeInterest(
  view: MaplePositionView,
  lifetime: Map<string, PoolFlows>,
): { pool: string; symbol: string; earned: number; held: number }[] {
  const out: { pool: string; symbol: string; earned: number; held: number }[] = [];
  for (const f of lifetime.values()) {
    if (!poolReconciles(view, f)) continue;
    const p = view.pools.find((x) => x.pool === f.pool && x.shares + x.escrowedShares > 0);
    if (p && p.currentValue == null) continue;
    const held = heldIn(view, f.pool);
    const earned = held - netPrincipal(f);
    if (earned < DUST) continue;
    out.push({ pool: f.pool, symbol: f.assetSymbol, earned, held });
  }
  return out;
}

/** Below this a caption's figure reads as zero on the card. */
const CAPTION_FLOOR = 0.01;

/** Position-card stat captions. null = the gate failed and the caption simply
 *  doesn't render. */
export interface MapleCardCaptions {
  /** Interest earned, in the pool's own asset (single-pool positions only). */
  interestEarned: { amount: number; symbol: string } | null;
  /** The position earned interest and its claim holds none of it: every pool
   *  it earned in holds less than a cent now (wallet 0x1601…347e). The card
   *  says so and leaves the figure to the Lifetime flows panel. Never set
   *  beside `interestEarned`. */
  interestWithdrawn: boolean;
  /** Interest earned in pools the claim no longer holds any of (a pool the
   *  wallet has left), one line per asset, so the card's interest figure
   *  covers every token the position earned in. */
  earnedElsewhere: { amount: number; symbol: string }[];
}

/** One pool's lifetime flows as the Lifetime flows explanation states them,
 *  each in the pool's own asset. Only pools whose flows reconcile with the
 *  claim. */
export interface MaplePoolFlowSummary {
  pool: string;
  poolSymbol: string;
  assetSymbol: string;
  deposited: number;
  withdrawn: number;
  /** Shares received by transfer, valued at the pool rate in each block. */
  received: number;
  /** The share count received, where every transfer is a loaded row. */
  receivedShares: number | null;
  sent: number;
  sentShares: number | null;
  /** The claim now (0 for a pool the wallet has left). */
  held: number;
  /** Lifetime interest, where it can be stated. */
  earned: number | null;
}

export function mapleFlowSummaries(
  view: MaplePositionView,
  events?: BaseActivityEvent[],
  precomputedLifetime?: Map<string, PoolFlows>,
): MaplePoolFlowSummary[] {
  const lifetime = precomputedLifetime ?? (events && events.length > 0 ? replayMapleLifetime(events) : null);
  if (!lifetime) return [];
  const earned = new Map(lifetimeInterest(view, lifetime).map((i) => [i.pool, i.earned]));
  return [...lifetime.values()]
    .filter((f) => poolReconciles(view, f))
    .map((f) => ({
      pool: f.pool,
      poolSymbol: maplePoolOf(f.pool).symbol,
      assetSymbol: f.assetSymbol,
      deposited: f.deposited,
      withdrawn: f.withdrawn,
      received: f.transferredIn,
      receivedShares: f.sharesIn,
      sent: f.transferredOut,
      sentShares: f.sharesOut,
      held: heldIn(view, f.pool),
      earned: earned.get(f.pool) ?? null,
    }));
}

export function computeMapleCardCaptions(
  view: MaplePositionView,
  events?: BaseActivityEvent[],
  /** The whole position's flows where `events` is only a window of them — see
   *  `mapleLifetimeWithOpening`. Omitted, the flows are replayed from `events`,
   *  which is the whole history on every unwindowed page. */
  precomputedLifetime?: Map<string, PoolFlows>,
): MapleCardCaptions {
  const lifetime = precomputedLifetime ?? (events && events.length > 0 ? replayMapleLifetime(events) : null);
  let interestEarned: MapleCardCaptions["interestEarned"] = null;
  const live = view.pools.filter((p) => p.shares + p.escrowedShares > 0);
  if (lifetime && live.length === 1) {
    const cur = live[0];
    const f = lifetime.get(cur.pool);
    if (f && !f.sharesMoved) {
      const amt = legInterest(cur.currentValue, netPrincipal(f), grossIn(f));
      if (amt > 0) interestEarned = { amount: amt, symbol: cur.assetSymbol };
    }
  }
  const interestWithdrawn =
    interestEarned == null &&
    lifetime != null &&
    lifetimeInterest(view, lifetime).some((i) => i.earned >= CAPTION_FLOOR) &&
    live.every((p) => p.currentValue != null && p.currentValue < CAPTION_FLOOR);
  // Pools the wallet has left, whose interest the claim above no longer holds.
  const earnedElsewhere =
    interestEarned != null && lifetime != null
      ? lifetimeInterest(view, lifetime)
          .filter((i) => i.held < CAPTION_FLOOR && i.earned >= CAPTION_FLOOR && i.pool !== live[0]?.pool)
          .map((i) => ({ amount: i.earned, symbol: i.symbol }))
      : [];
  return { interestEarned, interestWithdrawn, earnedElsewhere };
}

export function computeMapleEconomics(
  view: MaplePositionView,
  events?: BaseActivityEvent[],
  /** The whole position's flows where `events` is only a window of them — see
   *  `mapleLifetimeWithOpening`. Omitted, the flows are replayed from `events`,
   *  which is the whole history on every unwindowed page. */
  precomputedLifetime?: Map<string, PoolFlows>,
): ChainTruthTowerData {
  // The claim: current redeemable value where the chain read landed, the
  // replayed principal otherwise — the provenance names the basis.
  let claimLines: TowerLine[] = view.pools
    .filter((p) => p.shares + p.escrowedShares > 0)
    .map((p) => ({
      key: p.pool,
      symbol: p.assetSymbol,
      amount: p.currentValue ?? p.depositedPrincipal,
      usd: null,
      prov:
        p.currentValue != null
          ? positionCurrentValueProv(p.assetSymbol, p.symbol)
          : positionPrincipalProv(p.assetSymbol),
    }))
    .filter((l) => l.amount > DUST);

  // ── Lifetime layer (needs the event stream) ────────────────────────────────
  const lifetime = precomputedLifetime ?? (events && events.length > 0 ? replayMapleLifetime(events) : null);
  const okFlows = lifetime ? [...lifetime.values()].filter((f) => poolReconciles(view, f)) : [];
  const exited: TowerLine[] = [
    ...okFlows
      .filter((f) => f.withdrawn > DUST)
      .map((f) => ({
        key: `withdrawn-${f.pool}`,
        symbol: f.assetSymbol,
        amount: f.withdrawn,
        usd: null,
        prov: mapleLifetimeFlowProv("withdrawn", f.assetSymbol),
      })),
    ...okFlows
      .filter((f) => f.transferredOut > DUST)
      .map((f) => ({
        key: `sent-${f.pool}`,
        symbol: f.assetSymbol,
        amount: f.transferredOut,
        usd: null,
        flowLabel: "Transferred out",
        prov: mapleTransferFlowProv("out", f.assetSymbol),
      })),
  ];
  // Shares received by transfer: inflow that is not a deposit, drawn as the
  // tower's "+ Received by transfer" row beside the all-time deposits.
  const received: TowerLine[] = okFlows
    .filter((f) => f.transferredIn > DUST)
    .map((f) => ({
      key: `received-${f.pool}`,
      symbol: f.assetSymbol,
      amount: f.transferredIn,
      usd: null,
      flowLabel: "Received by transfer",
      prov: mapleTransferFlowProv("in", f.assetSymbol),
    }));

  // Interest earned over the position's life, one line per pool. The card's
  // "incl." caption keeps to interest inside the claim and, wherever it shows,
  // states this same figure.
  const earned: TowerLine[] = lifetime
    ? lifetimeInterest(view, lifetime).map((i) => ({
        key: `earned-${i.pool}`,
        symbol: i.symbol,
        amount: i.earned,
        usd: null,
        flowLabel: "Interest earned",
        prov: interestEarnedLifetimeProv(i.symbol),
      }))
    : [];

  // A pool the wallet has left keeps a claim line at 0 where the panel lists
  // more than one asset (the list form), so every pool in the flows below
  // shows on the panel's face. A one-asset panel draws bars and has no list.
  if (new Set(okFlows.map((f) => f.assetSymbol)).size > 1) {
    const heldPools = new Set(claimLines.map((l) => l.key));
    claimLines = [
      ...claimLines,
      ...okFlows
        .filter((f) => !heldPools.has(f.pool))
        .map((f) => ({
          key: f.pool,
          symbol: f.assetSymbol,
          amount: 0,
          usd: null,
          prov: positionCurrentValueProv(f.assetSymbol, maplePoolOf(f.pool).symbol),
        })),
    ];
  }

  // Lifetime inflow (the faded side bar) — a token amount is only meaningful
  // when one pool flowed, else suppressed. Shares received ride `received`,
  // which the tower adds to the bar.
  const inflow = ((): number => {
    const rows = okFlows.filter((f) => f.deposited > DUST);
    return rows.length === 1 ? rows[0].deposited : 0;
  })();

  return {
    // Never valued: the assets are dollar stablecoins and a $1 pin is
    // charter-forbidden (S3) — token amounts carry the meaning.
    valued: false,
    collateral: {
      current: claimLines,
      interest: null,
      earned,
      exited,
      received,
      liquidated: [],
      lifetimeInflow: inflow,
    },
    debt: {
      current: [],
      interest: null,
      exited: [],
      liquidated: [],
      lifetimeInflow: 0,
    },
    // The card's own column label — the lender's claim is not collateral
    // (that word belongs to the borrowers' custodied assets on this protocol),
    // and a lender has no debt axis at all, so the empty Debt column goes too.
    collateralListLabel: "Pool claim",
    debtAxisAbsent: true,
    // No grey note under the list: the Explanation beneath the panel says
    // what the figures are and which of them the chain proves.
  };
}
