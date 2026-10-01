// Compound V3 (Comet) lifetime sums and the position card's receipts seam.
// ----------------------------------------------------------------------------
// The card's principal, peaks and lifetime figures, reduced from the rows:
// Comet's base events do not name a side (the same Supply log lends or
// repays), so base flows are split at the running balance's zero crossings,
// Comet's own semantics: a supply into a negative balance repays first, a
// withdraw past the balance borrows. Sums run in base units and are scaled
// once. The Base lane's replay (lib/sources/chain/compound-v3-events.ts) runs
// the same splits over every row. The Lifetime flows panel replays the rows
// itself (lib/compound/flows.ts); the tower these sums fed is gone
// (rails-ops TO-DO-ui-jobs 206).

import { unreadToken } from "@/lib/shared/decimals-unread";
import type { Provenance } from "@/components/shared/provenance";
import type { BaseActivityEvent, CompoundEventType } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import {
  positionBaseProv,
  positionCollateralProv,
  currentBaseProv,
  accruedBaseProv,
  debtPrincipalProv,
  lendPrincipalProv,
  lifetimeFlowProv,
  type CompoundCoords,
  type CompoundLifetimeFlow,
} from "@/lib/compound/event-provenance";
import type { TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { folderFlows, mergeFlowBuckets } from "@/lib/shared/timeline-folder-reductions";
import { marketOf } from "@/lib/compound/asset-catalog";

// ── The receipts, as a seam ──────────────────────────────────────────────────
// The arithmetic below is one implementation serving two lanes that make
// different claims about the same numbers: Ethereum's figures come from a
// rails-server index and a head-lagged refresher, Base's from a live sweep and
// a pinned Comet read. The receipts are where that difference has to be said,
// so they are a parameter (the Aave V3 tower's `AaveV3TowerVocabulary`
// treatment). The default is the index vocabulary every existing caller meant.

export interface CompoundTowerVocabulary {
  positionBase: (sym: string, side: "lend" | "borrow", coords: CompoundCoords) => Provenance;
  currentBase: (sym: string, side: "lend" | "borrow", coords: CompoundCoords, block: number | null) => Provenance;
  positionCollateral: (sym: string, coords: CompoundCoords) => Provenance;
  lifetimeFlow: (flow: CompoundLifetimeFlow, sym: string, coords: CompoundCoords) => Provenance;
  accruedBase: (sym: string, side: "lend" | "borrow", coords: CompoundCoords) => Provenance;
  debtPrincipal: (sym: string, coords: CompoundCoords) => Provenance;
  lendPrincipal: (sym: string, coords: CompoundCoords) => Provenance;
  /** True where the position's base figure is the chain's balance at its last
   *  event (the Ethereum index, server mig 351); false where it is the running
   *  sum of the logged amounts (the Base sweep). */
  baseAtLastEvent: boolean;
}

export const COMPOUND_INDEXED_VOCABULARY: CompoundTowerVocabulary = {
  positionBase: positionBaseProv,
  currentBase: currentBaseProv,
  positionCollateral: positionCollateralProv,
  lifetimeFlow: lifetimeFlowProv,
  accruedBase: accruedBaseProv,
  debtPrincipal: debtPrincipalProv,
  lendPrincipal: lendPrincipalProv,
  baseAtLastEvent: true,
};

/** One collateral asset's lifetime flow sums. `received`/`sent` are
 *  account-to-account transferAsset moves — custody, not deposit/withdrawal —
 *  kept distinct so `supplied`/`withdrawn` stay true to real supplies. */
export interface CompoundCollateralFlows {
  symbol: string;
  supplied: number;
  withdrawn: number;
  absorbed: number;
  received: number;
  sent: number;
  /** Set when the asset's `decimals` did not load: the sums are scaled by the
   *  18 stand-in, and the tower leaves the asset out. */
  decimalsUnread?: true;
}

/** Base flows decomposed at the running balance's zero crossings, plus per-asset
 *  collateral flow sums. All magnitudes ≥ 0 in token units.
 *
 *  Exported because the Base lane computes this SERVER-SIDE over every event
 *  the sweep returned and hands it in (`precomputedLifetime`), rather than
 *  reducing it here from the events on the page: that list is capped for a
 *  long history, and summing a capped list into a bar labelled "all time"
 *  states a recent window as a lifetime. Plain object rather than a Map so it
 *  crosses the wire as JSON. */
export interface CompoundLifetimeFlows {
  deposited: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  /** The debt an absorb cleared: the part of `basePaidOut` that took the
   *  base balance from negative up to zero. */
  absorbedDebt: number;
  /** The rest of `basePaidOut`: the seized collateral's credited value past
   *  the debt, left to the account as a lent balance. */
  absorbCredit?: number;
  /** `absorbedDebt` holds the credit past the debt too (see
   *  `CompoundLifetimeRaw.absorbUnsplit`); `absorbCredit` is then absent. */
  absorbUnsplit?: boolean;
  /** Absorb legs valued at the absorb's prices (the events' `usdValue`),
   *  where the walk saw them: the debt cleared, the credit past it, and each
   *  seized collateral asset keyed by lowercase address. */
  absorbUsd?: { debtCleared: number; credit: number; collateral: Record<string, number> };
  /** Interest the base earned (while lending) and was charged (while
   *  borrowing) between rows, Σ each row's interest since the previous one.
   *  Ethereum only (server mig 351); absent on the Base lane, whose rows carry
   *  no interest. */
  interestEarned?: number;
  interestCharged?: number;
  /** Per collateral asset, keyed by lowercase address. */
  collateral: Record<string, CompoundCollateralFlows>;
}

// ── The lifetime flows, exact ────────────────────────────────────────────────
// Every accumulator below holds RAW token units as bigints and scales ONCE at
// the edge. The zero-crossing split is a min/max over integers, so it is exact
// in that form, and a whole life's total is then the plain sum of a seed's
// and a tail's — bit for bit, not to a part in 10⁷ the way a float walk in
// row order agrees with a numeric aggregate. That is what lets a heavy
// wallet's flows travel as state (rails-ops/architecture/
// heavy-wallet-timeline-gate.md, "The follow-up that would lift Compound V3
// Base's limit"). Two walks feed this: `replayCometRows` over every row of a
// swept or index-served history, and `replayCompoundLifetime` below over the
// rendered events of an Ethereum page — one arithmetic, two inputs.

/** The base spine's legs and one collateral asset's, in the leg names the
 *  opening balance already uses — rails-server names them to match these fields
 *  exactly, so the merge below needs no translation table to drift out of date. */
const BASE_LEGS = [
  "deposited",
  "withdrawn",
  "borrowed",
  "repaid",
  "absorbedDebt",
  "absorbCredit",
  "interestEarned",
  "interestCharged",
] as const;
const COLL_LEGS = ["supplied", "withdrawn", "absorbed", "received", "sent"] as const;
type BaseLeg = (typeof BASE_LEGS)[number];
type CollLeg = (typeof COLL_LEGS)[number];

const ZERO = BigInt(0);
const absBig = (v: bigint): bigint => (v < ZERO ? -v : v);
const minBig = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const maxBig = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/** Raw → human, the one scaling every lifetime figure goes through. The same
 *  arithmetic as `scaleRaw` (erc20-meta, server-only) and `scaleBaseUnits`
 *  (the opening balance): whole part plus the fraction, each as a double. */
function scaleUnits(raw: bigint, decimals: number): number {
  if (raw === ZERO) return 0;
  if (decimals <= 0) return Number(raw);
  const divisor = BigInt("1" + "0".repeat(decimals));
  return Number(raw / divisor) + Number(raw % divisor) / Number(divisor);
}

/** Human → raw, exact: the inverse of `fmtUnits` for a string it produced.
 *  Null for anything else — an exponent, a sign in the wrong place, a
 *  fraction finer than the token — so a malformed event refuses the layer
 *  rather than accumulating a guess. */
function parseUnits(s: string, decimals: number): bigint | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  let frac = m[3] ?? "";
  if (frac.length > decimals) {
    if (/[^0]/.test(frac.slice(decimals))) return null;
    frac = frac.slice(0, decimals);
  }
  const v = BigInt(m[2] + frac.padEnd(decimals, "0"));
  return m[1] ? -v : v;
}

/** The five base legs, raw units of the market's base token. */
export type CompoundBaseFlowsRaw = Record<BaseLeg, bigint>;

/** One collateral asset's five legs, raw units of that asset. */
export interface CompoundCollateralFlowsRaw extends Record<CollLeg, bigint> {
  symbol: string;
  decimals: number;
}

/** A position's lifetime flows as the walks accumulate them: exact, unscaled.
 *  `baseDecimals` is null only while no base row has said them, and then every
 *  base leg is still zero — zero scales without decimals. */
export interface CompoundLifetimeRaw {
  base: CompoundBaseFlowsRaw;
  baseDecimals: number | null;
  /** Per collateral asset, keyed by lowercase address. */
  collateral: Record<string, CompoundCollateralFlowsRaw>;
  /** Absorb legs at the absorb's prices, 8-decimal USD (the events'
   *  `usdValue`): absent where no absorb row was walked. */
  absorbUsd8?: { debtCleared: bigint; credit: bigint; collateral: Record<string, bigint> };
  /** Set where part of `absorbedDebt` came from a server sum written before
   *  the absorb split (an opening balance, a folder or a seed with no
   *  `absorbCredit` leg): that part holds the whole `basePaidOut`, so the
   *  debt cleared and the credit past it are stated as one figure. */
  absorbUnsplit?: boolean;
}

/** Add one absorb row's own USD reckoning (8-decimal, as Comet emits it) to
 *  the walk. A debt row's figure is split between the debt it cleared and the
 *  credit past it, in the same proportion as its base amount. */
export function addCompoundAbsorbUsd(
  raw: CompoundLifetimeRaw,
  kind: CompoundEventType,
  usd8: bigint,
  args: { asset?: string; before?: bigint; delta?: bigint },
) {
  const acc = (raw.absorbUsd8 ??= { debtCleared: ZERO, credit: ZERO, collateral: {} });
  if (kind === "absorb_collateral" && args.asset) {
    acc.collateral[args.asset] = (acc.collateral[args.asset] ?? ZERO) + usd8;
  } else if (kind === "absorb_debt" && args.delta != null && args.before != null && args.delta > ZERO) {
    const cleared = minBig(args.delta, maxBig(ZERO, -args.before));
    const clearedUsd = (usd8 * cleared) / args.delta;
    acc.debtCleared += clearedUsd;
    acc.credit += usd8 - clearedUsd;
  }
}

/** Human 8-decimal USD string ("1643.60936999") → the bigint Comet emitted. */
export function usd8Of(s: string | undefined): bigint | null {
  if (s == null) return null;
  return parseUnits(s, 8);
}

export function newCompoundLifetimeRaw(baseDecimals: number | null = null): CompoundLifetimeRaw {
  return {
    base: {
      deposited: ZERO,
      withdrawn: ZERO,
      borrowed: ZERO,
      repaid: ZERO,
      absorbedDebt: ZERO,
      absorbCredit: ZERO,
      interestEarned: ZERO,
      interestCharged: ZERO,
    },
    baseDecimals,
    collateral: {},
  };
}

/** Split one base row at the running balance's zero crossings — Comet's own
 *  semantics: a supply into a negative balance repays first, a withdraw past
 *  the balance is a borrow, an absorb is the debt it cleared. `before` is the
 *  signed base BEFORE the row, `delta` the row's signed amount, both raw.
 *
 *  A base transfer_in (delta > 0) / transfer_out (delta < 0) rides the same
 *  split as a supply / withdraw: it keeps the net base exact so the tower
 *  still reconciles. Base transfers have ZERO occurrences today, so they
 *  merge into the deposited/withdrawn legs rather than getting their own
 *  segment (unlike collateral, below) — the distinct-segment treatment for
 *  base is deferred until there is data to render it against. */
export function splitCompoundBaseFlow(
  acc: CompoundBaseFlowsRaw,
  kind: CompoundEventType,
  before: bigint,
  delta: bigint,
) {
  if (kind === "absorb_debt") {
    // basePaidOut is the debt cleared plus whatever the credited collateral
    // value left over: the debt leg takes the first, the credit the rest.
    const paid = absBig(delta);
    const cleared = minBig(paid, maxBig(ZERO, -before));
    acc.absorbedDebt += cleared;
    acc.absorbCredit = (acc.absorbCredit ?? ZERO) + (paid - cleared);
  } else if (delta > ZERO) {
    const repay = minBig(delta, maxBig(ZERO, -before));
    acc.repaid += repay;
    acc.deposited += delta - repay;
  } else if (delta < ZERO) {
    const mag = -delta;
    const fromSavings = minBig(mag, maxBig(ZERO, before));
    acc.withdrawn += fromSavings;
    acc.borrowed += mag - fromSavings;
  }
}

/** The collateral asset's accumulator, created on first sight. */
export function compoundCollateralFlowsOf(
  raw: CompoundLifetimeRaw,
  address: string,
  symbol: string,
  decimals: number,
): CompoundCollateralFlowsRaw {
  const c = raw.collateral[address] ?? {
    symbol,
    decimals,
    supplied: ZERO,
    withdrawn: ZERO,
    absorbed: ZERO,
    received: ZERO,
    sent: ZERO,
  };
  raw.collateral[address] = c;
  return c;
}

/** Add one collateral row's magnitude to the leg its kind names. */
export function addCompoundCollateralFlow(acc: CompoundCollateralFlowsRaw, kind: CompoundEventType, delta: bigint) {
  const mag = absBig(delta);
  if (kind === "supply_collateral") acc.supplied += mag;
  else if (kind === "withdraw_collateral") acc.withdrawn += mag;
  else if (kind === "absorb_collateral") acc.absorbed += mag;
  else if (kind === "transfer_collateral_in") acc.received += mag;
  else if (kind === "transfer_collateral_out") acc.sent += mag;
}

/** The edge: raw → the human-unit shape every consumer reads. Scaled once per
 *  leg from the exact total. */
export function scaleCompoundLifetime(raw: CompoundLifetimeRaw): CompoundLifetimeFlows {
  const dec = raw.baseDecimals ?? 0;
  const out: CompoundLifetimeFlows = {
    deposited: scaleUnits(raw.base.deposited, dec),
    withdrawn: scaleUnits(raw.base.withdrawn, dec),
    borrowed: scaleUnits(raw.base.borrowed, dec),
    repaid: scaleUnits(raw.base.repaid, dec),
    ...(raw.absorbUnsplit
      ? {
          absorbedDebt: scaleUnits(raw.base.absorbedDebt + (raw.base.absorbCredit ?? ZERO), dec),
          absorbUnsplit: true,
        }
      : {
          absorbedDebt: scaleUnits(raw.base.absorbedDebt, dec),
          ...((raw.base.absorbCredit ?? ZERO) !== ZERO ? { absorbCredit: scaleUnits(raw.base.absorbCredit, dec) } : {}),
        }),
    ...(raw.absorbUsd8
      ? {
          absorbUsd: {
            debtCleared: scaleUnits(raw.absorbUsd8.debtCleared, 8),
            credit: scaleUnits(raw.absorbUsd8.credit, 8),
            collateral: Object.fromEntries(
              Object.entries(raw.absorbUsd8.collateral).map(([a, v]) => [a, scaleUnits(v, 8)]),
            ),
          },
        }
      : {}),
    // A raw built before the interest legs existed has none: zero.
    ...((raw.base.interestEarned ?? ZERO) !== ZERO || (raw.base.interestCharged ?? ZERO) !== ZERO
      ? {
          interestEarned: scaleUnits(raw.base.interestEarned ?? ZERO, dec),
          interestCharged: scaleUnits(raw.base.interestCharged ?? ZERO, dec),
        }
      : {}),
    collateral: {},
  };
  for (const [addr, c] of Object.entries(raw.collateral)) {
    out.collateral[addr] = {
      symbol: c.symbol,
      supplied: scaleUnits(c.supplied, c.decimals),
      withdrawn: scaleUnits(c.withdrawn, c.decimals),
      absorbed: scaleUnits(c.absorbed, c.decimals),
      received: scaleUnits(c.received, c.decimals),
      sent: scaleUnits(c.sent, c.decimals),
    };
  }
  return out;
}

/** `CompoundLifetimeRaw` as JSON carries it: every leg a decimal string of raw
 *  token units — base legs in the market's base token, each collateral asset's
 *  in its own — keyed like `CompoundLifetimeFlows.collateral`. Symbols and
 *  decimals ride on the scaled twin beside it, not here: this is the shape a
 *  SQL aggregate over the rows produces, and what a seed at a cut would send. */
export interface CompoundLifetimeRawWire {
  deposited: string;
  withdrawn: string;
  borrowed: string;
  repaid: string;
  absorbedDebt: string;
  /** Absent on a wire written before the absorb split: read as zero. */
  absorbCredit?: string;
  collateral: Record<string, Record<CollLeg, string>>;
}

export function compoundLifetimeRawToWire(raw: CompoundLifetimeRaw): CompoundLifetimeRawWire {
  const collateral: CompoundLifetimeRawWire["collateral"] = {};
  for (const [addr, c] of Object.entries(raw.collateral)) {
    collateral[addr] = {
      supplied: c.supplied.toString(),
      withdrawn: c.withdrawn.toString(),
      absorbed: c.absorbed.toString(),
      received: c.received.toString(),
      sent: c.sent.toString(),
    };
  }
  return {
    deposited: raw.base.deposited.toString(),
    withdrawn: raw.base.withdrawn.toString(),
    borrowed: raw.base.borrowed.toString(),
    repaid: raw.base.repaid.toString(),
    absorbedDebt: raw.base.absorbedDebt.toString(),
    absorbCredit: (raw.base.absorbCredit ?? ZERO).toString(),
    collateral,
  };
}

/** The Ethereum page's walk: over the rendered events of one market, each
 *  carrying its `baseAfter` (the chain balance at the row), so before = after −
 *  delta and the split is exact on every row; each row's interest since the
 *  previous one (`baseInterest`) adds to the earned or charged leg. The human strings are parsed back to raw at the
 *  token's own decimals (each event's flow states them), never accumulated as
 *  doubles. Null when no event of this market was seen, or one was malformed —
 *  a refusal, never a guess. */
export function replayCompoundLifetime(events: BaseActivityEvent[], market: string): CompoundLifetimeRaw | null {
  const raw = newCompoundLifetimeRaw();
  let sawAny = false;
  for (const ev of events) {
    if (!isCompoundEvent(ev)) continue;
    const ctx = ev.context.data;
    if (ctx.market !== market) continue;
    sawAny = true;
    const flow = ev.flows[0];

    // Interest rides base and collateral rows alike; it is in the base token.
    if (ctx.baseInterest != null) {
      const dec = marketOf(market).baseDecimals;
      if (raw.baseDecimals != null && raw.baseDecimals !== dec) return null;
      raw.baseDecimals = dec;
      const v = parseUnits(ctx.baseInterest, dec);
      if (v == null) return null;
      if (v > ZERO) raw.base.interestEarned += v;
      else raw.base.interestCharged -= v;
    }

    if (ctx.isBase) {
      // A row that moved nothing carries no flow and so no decimals; it also
      // adds nothing to any leg, so it is skipped rather than refused.
      if (!flow) {
        if (/^-?0(\.0*)?$/.test(ctx.assetsDelta)) continue;
        return null;
      }
      const dec = flow.tokenDecimals;
      if (raw.baseDecimals != null && raw.baseDecimals !== dec) return null;
      raw.baseDecimals = dec;
      const delta = parseUnits(ctx.assetsDelta, dec);
      const after = ctx.baseAfter == null ? null : parseUnits(ctx.baseAfter, dec);
      if (delta == null || after == null) return null; // malformed event — don't assert flows
      splitCompoundBaseFlow(raw.base, ctx.eventType, after - delta, delta);
      const usd8 = ctx.eventType === "absorb_debt" ? usd8Of(ctx.usdValue) : null;
      if (usd8 != null) addCompoundAbsorbUsd(raw, "absorb_debt", usd8, { before: after - delta, delta });
      continue;
    }

    const addr = (flow?.token ?? "").toLowerCase();
    if (!addr || !flow) return null;
    // An asset whose decimals did not load joins no sum; the tower names it.
    if (flow.decimalsUnread || unreadToken(ev, addr)) continue;
    const delta = parseUnits(ctx.assetsDelta, flow.tokenDecimals);
    if (delta == null) return null;
    const c = compoundCollateralFlowsOf(raw, addr, ctx.assetSymbol, flow.tokenDecimals);
    if (c.decimals !== flow.tokenDecimals) return null;
    addCompoundCollateralFlow(c, ctx.eventType, delta);
    const usd8 = ctx.eventType === "absorb_collateral" ? usd8Of(ctx.usdValue) : null;
    if (usd8 != null) addCompoundAbsorbUsd(raw, "absorb_collateral", usd8, { asset: addr });
  }
  return sawAny ? raw : null;
}

/**
 * The lifetime sums for a WINDOWED page: the opening balance seeded first, the
 * loaded rows added on top (scripts/verify/verify-compound-lifetime-bigint.mjs
 * holds it to the whole-history reduction).
 *
 * The two halves never overlap: the opening balance covers `block_number <
 * cutoffBlock` and every event passed in is at or after it, so summing them is
 * addition and not reconciliation. Base units are summed on the index side and
 * scaled ONCE, never scaled per bucket and added.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its asset — is
 * NOT added as zero. A COLLATERAL asset in that state leaves the sums
 * entirely, both halves of it; the BASE leg is the spine every other figure
 * reconciles against, so an unscalable base leg refuses the whole result.
 */
export function compoundLifetimeWithOpening(
  events: BaseActivityEvent[],
  market: string,
  opening: TimelineOpeningBalance | null | undefined,
  folders?: readonly ServedFolder[] | null,
): CompoundLifetimeFlows | undefined {
  // Undefined = nothing outside `events`, so the reducer reads them as the
  // whole history. On a grouped answer the folders hold members `events` does
  // not, and their flows join the summary's (the third half of the partition).
  if (!opening && (folders?.length ?? 0) === 0) return undefined;

  // The window's own half first, through the walk that already knows Comet's
  // zero-crossing base split — each loaded event still carries its replayed
  // `baseAfter`, so that split is exact on this side of the cut too. A
  // malformed row makes the walk refuse, and a refusal there is a refusal of
  // the whole merged figure. The opening balance's legs are then ADDED to it,
  // raw to raw, and the sum scaled once below.
  const windowFlows = events.length > 0 ? replayCompoundLifetime(events, market) : null;
  if (events.length > 0 && !windowFlows) return undefined;
  const merged = windowFlows ?? newCompoundLifetimeRaw();

  // Collateral the opening balance named but could not scale. Dropped from BOTH
  // halves below: a window-only total for an asset whose older flows are
  // unknown is exactly the partial figure this refuses to state. An asset the
  // two halves state at DIFFERENT decimals is the same refusal — one token has
  // one scale, and a raw sum across two is not a quantity.
  const unscalable = new Set<string>();

  for (const bucket of mergeFlowBuckets(opening?.flows, folderFlows(folders))) {
    // `sourceKey` is set only where the index keyed the bucket by token
    // address, which for Comet means a collateral leg; a base leg is keyed by
    // the MARKET (the base asset is the market) and arrives with its slug
    // unrenamed. Matching that slug also scopes the merge to one market, the
    // way `replayCompoundLifetime` scopes its own walk.
    if (!bucket.sourceKey) {
      if (bucket.key !== market) continue;
      // A sum written before the absorb split carries the whole basePaidOut
      // as absorbedDebt and no absorbCredit leg.
      if (bucket.legs.absorbCredit === undefined && (parseUnits(bucket.legs.absorbedDebt ?? "0", 0) ?? ZERO) > ZERO)
        merged.absorbUnsplit = true;
      for (const leg of BASE_LEGS) {
        const raw = bucket.legs[leg];
        if (raw === undefined) continue;
        const dec = bucket.decimals;
        if (dec == null || (merged.baseDecimals != null && merged.baseDecimals !== dec)) return undefined;
        const value = parseUnits(raw, 0);
        if (value == null) return undefined;
        merged.baseDecimals = dec;
        merged.base[leg] += value;
      }
      continue;
    }

    const addr = bucket.sourceKey;
    const dec = bucket.decimals;
    const seen = merged.collateral[addr];
    const legs: Partial<Record<CollLeg, bigint>> = {};
    let scalable = dec != null && (seen == null || seen.decimals === dec);
    for (const leg of COLL_LEGS) {
      if (!scalable) break;
      const raw = bucket.legs[leg];
      if (raw === undefined) continue;
      const value = parseUnits(raw, 0);
      if (value == null) scalable = false;
      else legs[leg] = value;
    }
    if (!scalable || dec == null) {
      unscalable.add(addr);
      delete merged.collateral[addr];
      continue;
    }
    // The window's symbol is the one the cards below the tower print, so it
    // settles any disagreement with the summary's — only an asset the window
    // never saw takes the summary's.
    const c = compoundCollateralFlowsOf(merged, addr, bucket.key, dec);
    for (const leg of COLL_LEGS) c[leg] += legs[leg] ?? ZERO;
  }

  // Absorb prices come only from the rows walked here: an opening balance or
  // a folder holds absorbs this walk never priced, so none are stated.
  return scaleCompoundLifetime({ ...merged, absorbUsd8: undefined });
}
