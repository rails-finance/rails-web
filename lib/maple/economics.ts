// Maple economics reduction — the lender tower with lifetime flows and the
// principal/interest split.
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
// lifetime layer: hatched withdrawn segments per pool and the faded
// lifetime-inflow bar. The interest split renders only when a single pool
// contributes and its event principal attributes cleanly (the Spark
// legInterest gates) — a cross-pool token sum would mix USDC and USDT.

import type { MaplePositionView } from "@/components/protocol/maple/maple-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import {
  positionCurrentValueProv,
  positionPrincipalProv,
  interestEarnedProv,
  mapleLifetimeFlowProv,
} from "@/lib/maple/event-provenance";
import { maplePoolOf } from "@/lib/maple/asset-catalog";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Per-pool lifetime gross asset flows, replayed from the wallet's own events. */
export interface PoolFlows {
  pool: string;
  assetSymbol: string;
  deposited: number;
  withdrawn: number;
}

function replayMapleLifetime(events: BaseActivityEvent[]): Map<string, PoolFlows> {
  const flows = new Map<string, PoolFlows>();
  const get = (pool: string, assetSymbol: string): PoolFlows => {
    const cur = flows.get(pool) ?? { pool, assetSymbol, deposited: 0, withdrawn: 0 };
    flows.set(pool, cur);
    return cur;
  };
  for (const ev of events) {
    if (!isMapleEvent(ev)) continue;
    const ctx = ev.context.data;
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
 * split, and `poolOk`'s residue test would be measuring against a number that
 * is not the position's. Refusing the pool is the same choice the reducer
 * already makes for a pool whose flows do not reconcile — state nothing rather
 * than something partial.
 */
export function mapleLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): Map<string, PoolFlows> | undefined {
  if (!opening) return undefined;
  const merged = new Map<string, PoolFlows>();
  const get = (pool: string, assetSymbol: string): PoolFlows => {
    const cur = merged.get(pool) ?? { pool, assetSymbol, deposited: 0, withdrawn: 0 };
    merged.set(pool, cur);
    return cur;
  };
  // Pools the opening balance names but cannot state. They are excluded from
  // BOTH halves — see the refusal above.
  const unscalable = new Set<string>();

  // The leg names are the field names above, chosen on the rails-server side to
  // be exactly that so the merge needs no translation table to drift out of
  // date. Only deposit / withdraw / request_fill carry a flow at all; the
  // request, decrease, cancel and share-transfer events move pool shares, not
  // assets, and the tower states assets.
  const LEGS = ["deposited", "withdrawn"] as const;
  for (const bucket of opening.flows ?? []) {
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
  }

  for (const [pool, windowFlows] of replayMapleLifetime(events)) {
    if (unscalable.has(pool)) continue;
    const f = get(pool, windowFlows.assetSymbol);
    for (const leg of LEGS) f[leg] += windowFlows[leg];
  }

  return merged;
}

/** Chain-faithful interest on the claim (the Spark legInterest gates):
 *  - no current figure / no gross inflow → can't attribute, bail;
 *  - interest < dust → zero (or negative: missed principal, bail);
 *  - interest > grossIn → >100% cumulative yield, physically implausible → bail. */
function legInterest(current: number | undefined | null, netPrincipal: number, grossIn: number): number {
  if (current == null || grossIn <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < DUST) return 0;
  if (interest > grossIn) return 0;
  return interest;
}

/** Position-card stat captions. null = the gate failed and the caption simply
 *  doesn't render. */
export interface MapleCardCaptions {
  /** Interest earned, in the pool's own asset (single-pool positions only). */
  interestEarned: { amount: number; symbol: string } | null;
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
    if (f) {
      const net = f.deposited - f.withdrawn;
      const amt = legInterest(cur.currentValue, net, f.deposited);
      if (amt > 0) interestEarned = { amount: amt, symbol: cur.assetSymbol };
    }
  }
  return { interestEarned };
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
  // A pool's flows render only when they're PLAUSIBLE against its claim: a
  // claim may exceed net deposits by earned interest alone (the legInterest
  // bounds). Pool shares also move as plain transfers — a custodian that
  // received or sent shares outside deposit/redeem breaks that conservation
  // by whole positions, and its "all time" story (a mountain of inflow with
  // no outflow) would not sum — so it stays off the tower.
  const claimByPool = new Map(view.pools.map((p) => [p.pool, p.currentValue ?? p.depositedPrincipal]));
  const poolOk = (f: { pool: string; deposited: number; withdrawn: number }): boolean => {
    const residue = (claimByPool.get(f.pool) ?? 0) - (f.deposited - f.withdrawn);
    const eps = f.deposited * 1e-9 + 1e-9;
    return residue >= -eps && residue <= f.deposited + eps;
  };
  const exited: TowerLine[] = lifetime
    ? [...lifetime.values()]
        .filter((f) => f.withdrawn > DUST && poolOk(f))
        .map((f) => ({
          key: `withdrawn-${f.pool}`,
          symbol: f.assetSymbol,
          amount: f.withdrawn,
          usd: null,
          prov: mapleLifetimeFlowProv("withdrawn", f.assetSymbol),
        }))
    : [];

  // Interest segment — only on a SINGLE-pool claim (one asset symbol; a
  // cross-pool token sum would mix USDC and USDT). The claim line KEEPS the
  // full current value: maple never reaches the tower's stacked-bar mode
  // (showBars keys on valued/debt-side interest, and maple is neither), so
  // the gated list renders the claim line alone and the interest rides the
  // "incl. … interest earned" annotation row — the card caption's grammar.
  // Dropping the claim to net principal here would understate the position
  // by exactly the interest (it did, on every split-engaging wallet).
  let interest: TowerLine | null = null;
  if (lifetime && claimLines.length === 1) {
    const cur = claimLines[0];
    const f = lifetime.get(cur.key);
    if (f) {
      const net = f.deposited - f.withdrawn;
      const amt = legInterest(cur.amount, net, f.deposited);
      if (amt > 0) {
        interest = {
          key: "claim-interest",
          symbol: cur.symbol,
          amount: amt,
          usd: null,
          prov: interestEarnedProv(cur.symbol),
        };
      }
    }
  }

  // Lifetime inflow (the faded side bar) — a token amount is only meaningful
  // when one pool flowed, else suppressed.
  const inflow = ((): number => {
    if (!lifetime) return 0;
    const rows = [...lifetime.values()].filter((f) => f.deposited > DUST && poolOk(f));
    return rows.length === 1 ? rows[0].deposited : 0;
  })();

  return {
    // Never valued: the assets are dollar stablecoins and a $1 pin is
    // charter-forbidden (S3) — token amounts carry the meaning.
    valued: false,
    collateral: {
      current: claimLines,
      interest,
      exited,
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
    interestNote:
      "The claim column shows what the position would redeem for now: its pool shares valued at the pool's exit rate. The amount above what was deposited is interest earned. Amounts stay in the pool's own asset, USDC or USDT — pinning a stablecoin to a dollar would hide exactly the depeg the token amounts exist to reveal. One caveat rides the value: it rests on a loan book whose collateral is held off-chain, so it shows what Maple's books record rather than something the chain itself can prove." +
      (interest != null
        ? ""
        : " The split between deposited principal and interest earned appears only when a single pool's deposits attribute cleanly."),
  };
}
