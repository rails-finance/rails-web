// Compound V3 (Comet) economics — the valued dual tower with lifetime flows and
// the debt interest split.
// ----------------------------------------------------------------------------
// Comet gives the tower chain-true facts:
//   • the live CURRENT base value WITH interest (the chain overlay,
//     balanceOf / borrowBalanceOf) — a DIRECT chain read, the most literal truth,
//   • the nominal PRINCIPAL from replaying the captured base amounts, and
//   • each collateral asset's exact replayed amount (collateral is non-earning).
//
// With the wallet's event stream (optional second arg) the tower gains the
// lifetime layer: hatched withdrawn/repaid + liquidated segments, the faded
// lifetime-inflow bar, and — for a borrower — the accrued-interest segment
// (live borrowBalanceOf − net event principal, the Spark legInterest arithmetic
// with its plausibility gates). Comet's base events don't name a side (the same
// Supply log lends OR repays), so base flows are decomposed at the running
// balance's ZERO CROSSINGS — Comet's own semantics: a supply into a negative
// balance repays debt first, a withdraw past the balance is a borrow. Each
// event carries its replayed `baseAfter`, so the decomposition is exact. The
// flows render only when the replayed net matches the current balance on BOTH
// sides (flowsReconcile) — an incomplete capture suppresses the layer rather
// than mislabel a partial window.
//
// USD is ON-CHAIN. Each asset is valued at Comet's OWN oracle —
// `getPrice(priceFeed)`, the same Chainlink feed its liquidation engine reads
// (lib/sources/chain/compound-prices.ts, threaded onto `priceByAddress`). Both
// legs are on-chain, so the product is chain-derived and belongs in the single
// chain-state view. When a contributing asset is unpriced (RPC down, or a flow
// in an asset the position no longer holds), the tower degrades to the token
// gated list rather than assert a partial USD total.

import { unreadToken, unreadTokensIn } from "@/lib/shared/decimals-unread";
import type { UnreadToken } from "@/lib/shared/types/event-shape";
import type { CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
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
  cometContract,
  type CompoundCoords,
  type CompoundLifetimeFlow,
} from "@/lib/compound/event-provenance";
import { flowsReconcile, type ChainTruthTowerData, type TowerLine } from "@/lib/shared/chain-truth-economics";
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

/** USD valuation is on: values come from Comet's on-chain oracle (chain-derived),
 *  threaded onto `priceByAddress`. Left as a flag so pricing can be disabled
 *  wholesale if the oracle read is ever unavailable for a market. */
const VALUED_USD = true;

const DUST = 1e-9;

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
    absorbedDebt: scaleUnits(raw.base.absorbedDebt, dec),
    ...((raw.base.absorbCredit ?? ZERO) !== ZERO ? { absorbCredit: scaleUnits(raw.base.absorbCredit, dec) } : {}),
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
 * The lifetime flows for a WINDOWED page: the opening balance seeded first, the
 * loaded rows added on top.
 *
 * Pass the result to `computeCompoundEconomics` as `precomputedLifetime`. That
 * parameter already existed for the swept Base lane, which draws a capped slice
 * of a longer history and must still state the whole of it — this is the same
 * claim reached by a different route, so it reuses that seam rather than
 * teaching the reducer a second one. Everything the reducer does AFTER the
 * merge is untouched and still applies: `flowsReconcile` still gates the whole
 * layer on the replayed net matching the chain's current balance, on the base
 * spine and on every collateral asset, and the tower still degrades to the
 * gated token list when a contributing leg is unpriced.
 *
 * The two halves never overlap: the opening balance covers `block_number <
 * cutoffBlock` and every event passed in is at or after it, so summing them is
 * addition and not reconciliation. Base units are summed on the index side and
 * scaled ONCE, never scaled per bucket and added.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its asset — is
 * NOT added as zero. A COLLATERAL asset in that state leaves the lifetime layer
 * entirely, both halves of it, so the tower shows nothing for it rather than a
 * total short by whatever the summarised part held; that is the same refusal
 * the reducer already makes for an unpriced asset. The BASE leg is not one
 * asset among many but the spine every other figure reconciles against, so an
 * unscalable base leg refuses the whole lifetime layer.
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

/** Chain-faithful interest on the debt leg (the Spark legInterest gates):
 *  - no chain-state current / no gross draw → can't attribute, bail;
 *  - interest < dust → zero (or negative: missed principal, bail);
 *  - interest > gross borrowed → >100% cumulative yield, physically implausible
 *    (a base transfer the events never logged) → bail. */
function legInterest(current: number, netPrincipal: number, grossIn: number): number {
  if (grossIn <= 0 || netPrincipal <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < DUST) return 0;
  if (interest > grossIn) return 0;
  return interest;
}

export function computeCompoundEconomics(
  view: CompoundPositionView,
  events?: BaseActivityEvent[],
  vocab: CompoundTowerVocabulary = COMPOUND_INDEXED_VOCABULARY,
  /** Lifetime sums already reduced over the WHOLE history (the swept lane).
   *  When present the events are not reduced here at all — the page's list is
   *  a capped slice, and these are not. */
  precomputedLifetime?: CompoundLifetimeFlows,
): ChainTruthTowerData {
  const coords: CompoundCoords = { comet: view.comet, marketLabel: view.marketLabel, blockNumber: view.atBlock };
  const baseCoords: CompoundCoords = { ...coords, asset: view.base.address };
  const prices = view.priceByAddress;

  // On-chain oracle price per token, by address (Comet getPrice). No off-chain
  // fallback — an unpriced asset stays null so the valued tower degrades honestly.
  const priceOf = (address: string): number | null => {
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? p : null;
  };
  const usdOf = (address: string, amount: number): number | null => {
    if (!VALUED_USD) return null;
    const p = priceOf(address);
    return p != null ? amount * p : null;
  };

  // The displayed base: the live CURRENT value WITH interest (chain overlay) when
  // available — a direct chain read, authoritative — else the amounts-only
  // principal. Either way it's one token amount, traced to its chain source.
  const chain = view.current;
  const baseAmount = chain ? chain.amount : view.base.amount;
  const baseSide = chain ? chain.side : view.side;
  const baseProv = (side: "lend" | "borrow") =>
    chain
      ? vocab.currentBase(view.base.symbol, side, baseCoords, chain.block)
      : vocab.positionBase(view.base.symbol, side, baseCoords);

  // ── Lifetime layer (needs the event stream) ────────────────────────────────
  // Rendered only when the replayed net matches the current balance on BOTH
  // sides — an incomplete capture suppresses the flows, never mislabels them.
  const walked = precomputedLifetime
    ? null
    : events && events.length > 0
      ? replayCompoundLifetime(events, view.market)
      : null;
  const replayedRaw = precomputedLifetime ?? (walked ? scaleCompoundLifetime(walked) : null);
  // Where the rows are running sums of the logged amounts rather than the
  // chain's balance (no interest in them), the balance before an absorb is
  // short by the interest, so the split between the debt it cleared and the
  // credit past it cannot be trusted: the two are stated as one figure.
  const replayed =
    replayedRaw && !vocab.baseAtLastEvent && (replayedRaw.absorbCredit ?? 0) > 0
      ? {
          ...replayedRaw,
          absorbedDebt: replayedRaw.absorbedDebt + (replayedRaw.absorbCredit ?? 0),
          absorbCredit: 0,
          absorbUsd: undefined,
        }
      : replayedRaw;
  // The net of the moves the events made, and the net with the interest the
  // rows accrued between them: the second is what the last row's balance is.
  const netFlow = replayed
    ? replayed.deposited +
      replayed.repaid +
      replayed.absorbedDebt +
      (replayed.absorbCredit ?? 0) -
      replayed.withdrawn -
      replayed.borrowed
    : 0;
  const netInterest = replayed ? (replayed.interestEarned ?? 0) - (replayed.interestCharged ?? 0) : 0;
  const netBase = netFlow + netInterest;
  // Collateral assets whose decimals did not load (on the card or on any
  // event) are left out of every line, flow and total, and the tower names
  // them. The base token's decimals come from the market catalog.
  const notLoaded = compoundNotLoaded(view, events ?? [], precomputedLifetime);
  const leftOut = new Set(notLoaded.map((t) => t.address));
  const replayedKept = replayed
    ? {
        ...replayed,
        collateral: Object.fromEntries(
          Object.entries(replayed.collateral).filter(([addr]) => !leftOut.has(addr.toLowerCase())),
        ),
      }
    : null;
  const collateralByAddr = new Map(view.collateral.map((c) => [c.address.toLowerCase(), c]));
  const lifetime =
    replayedKept &&
    flowsReconcile(
      netBase,
      view.base.amount,
      replayedKept.deposited +
        replayedKept.repaid +
        replayedKept.absorbedDebt +
        (replayedKept.absorbCredit ?? 0) +
        replayedKept.withdrawn +
        replayedKept.borrowed +
        (replayedKept.interestEarned ?? 0) +
        (replayedKept.interestCharged ?? 0),
    ) &&
    Object.entries(replayedKept.collateral).every(([addr, c]) =>
      // supplied + received − withdrawn − absorbed − sent = current: transfers
      // are custody moves, so both legs must enter the conservation or a
      // transfer-touched asset never reconciles (and the whole layer suppresses).
      flowsReconcile(
        c.supplied + c.received - c.withdrawn - c.absorbed - c.sent,
        collateralByAddr.get(addr)?.amount ?? 0,
        c.supplied + c.received + c.withdrawn + c.absorbed + c.sent,
      ),
    )
      ? replayedKept
      : null;

  const flowLine = (
    flow: CompoundLifetimeFlow,
    symbol: string,
    address: string,
    amount: number,
    key: string,
  ): TowerLine[] =>
    amount > DUST
      ? [
          {
            key,
            symbol,
            amount,
            usd: usdOf(address, amount),
            prov: vocab.lifetimeFlow(flow, symbol, { ...coords, asset: address }),
          },
        ]
      : [];

  // A flow line with its legend caption overridden (the tower reads flowLabel on
  // exited/received rows; the default would misname a transfer as a withdrawal).
  const withLabel = (lines: TowerLine[], label: string): TowerLine[] => lines.map((l) => ({ ...l, flowLabel: label }));

  const collFlows = lifetime ? Object.entries(lifetime.collateral) : [];
  const collExited = [
    ...collFlows.flatMap(([addr, c]) => flowLine("withdrawn collateral", c.symbol, addr, c.withdrawn, `cw-${addr}`)),
    // Custody sent to another account — a voluntary exit, but captioned as a
    // transfer so it never reads as a withdrawal to a wallet.
    ...collFlows.flatMap(([addr, c]) =>
      withLabel(flowLine("transferred collateral", c.symbol, addr, c.sent, `cs-${addr}`), "Transferred out"),
    ),
    ...(lifetime
      ? flowLine("withdrawn", view.base.symbol, view.base.address, lifetime.withdrawn, "base-withdrawn")
      : []),
  ];
  // Custody received from another account — an inflow that is NOT a fresh
  // deposit, so it rides its own "+ Received by transfer" line rather than
  // inflating Deposited (all time).
  const collReceived = collFlows.flatMap(([addr, c]) =>
    withLabel(flowLine("received collateral", c.symbol, addr, c.received, `cr-${addr}`), "Received by transfer"),
  );
  // What an absorb took is valued at the absorb's prices (the events'
  // usdValue) where the walk saw them, as the liquidation row values it; the
  // price-change row below carries the difference to today's prices.
  const absorbUsd = lifetime?.absorbUsd;
  const atAbsorb = (lines: TowerLine[], usd: number | undefined): TowerLine[] =>
    usd == null ? lines : lines.map((l) => ({ ...l, usd, tipLabel: "At the absorb's prices" }));
  const collLiquidated = collFlows.flatMap(([addr, c]) =>
    atAbsorb(
      flowLine("absorbed collateral", c.symbol, addr, c.absorbed, `cl-${addr}`),
      absorbUsd?.collateral[addr.toLowerCase()],
    ),
  );
  const debtExited = lifetime
    ? flowLine("repaid", view.base.symbol, view.base.address, lifetime.repaid, "base-repaid")
    : [];
  const debtLiquidated = lifetime
    ? withLabel(
        atAbsorb(
          flowLine("absorbed debt", view.base.symbol, view.base.address, lifetime.absorbedDebt, "base-absorbed"),
          absorbUsd?.debtCleared,
        ),
        "Cleared by the absorb",
      )
    : [];
  // The credited value past the debt: base the account was left lending.
  const creditReceived = lifetime
    ? withLabel(
        atAbsorb(
          flowLine("absorb credit", view.base.symbol, view.base.address, lifetime.absorbCredit ?? 0, "base-credit"),
          absorbUsd?.credit,
        ),
        "Credited by the absorb",
      )
    : [];

  // Collateral side: the non-earning collateral assets, exact from the event replay.
  const collateralLines: TowerLine[] = view.collateral
    .filter((c) => c.amount > 0 && !leftOut.has(c.address.toLowerCase()))
    .map((c) => ({
      key: c.address,
      symbol: c.symbol,
      amount: c.amount,
      usd: usdOf(c.address, c.amount),
      prov: vocab.positionCollateral(c.symbol, { ...coords, asset: c.address }),
    }));

  // A net LENDER's base sits on the supply (left) side, shown as one line — the
  // current value incl. interest when the chain overlay has it.
  if (baseSide === "lend") {
    collateralLines.unshift({
      key: `base:${view.base.address}`,
      symbol: view.base.symbol,
      amount: baseAmount,
      usd: usdOf(view.base.address, baseAmount),
      prov: baseProv("lend"),
    });
  }

  // Debt side: a net BORROWER's base as ONE line — the CURRENT value WITH interest
  // (the direct Comet chain read) when available, else the replayed principal.
  const debtLines: TowerLine[] = [];
  if (baseSide === "borrow") {
    const currentMag = Math.abs(baseAmount);
    debtLines.push({
      key: `base:${view.base.address}`,
      symbol: view.base.symbol,
      amount: currentMag,
      usd: usdOf(view.base.address, currentMag),
      prov: baseProv("borrow"),
    });
  }

  // Interest segment — a borrower with the live chain read AND a reconciled
  // lifetime replay splits into principal + accrued. The tower stacks
  // `current + interest` as the total, so when the split engages the current
  // line DROPS to the net event principal — the live borrowBalanceOf already
  // includes the interest (principal + accrued = balanceOf).
  let interest: TowerLine | null = null;
  if (lifetime && chain && baseSide === "borrow" && debtLines.length === 1) {
    const netPrincipal = -netFlow; // borrower: the net of its moves is negative
    const amt = legInterest(Math.abs(chain.amount), netPrincipal, lifetime.borrowed);
    if (amt > 0) {
      interest = {
        key: "debt-interest",
        symbol: view.base.symbol,
        amount: amt,
        usd: usdOf(view.base.address, amt),
        prov: vocab.accruedBase(view.base.symbol, "borrow", baseCoords),
      };
      debtLines[0] = {
        ...debtLines[0],
        amount: netPrincipal,
        usd: usdOf(view.base.address, netPrincipal),
        prov: vocab.debtPrincipal(view.base.symbol, baseCoords),
      };
    }
  }

  // The lender's twin: supply interest earned over the position's life, the
  // live balance less the net of its moves, on top of that net.
  let earned: TowerLine | null = null;
  if (lifetime && chain && baseSide === "lend" && collateralLines[0]?.key === `base:${view.base.address}`) {
    const amt = legInterest(chain.amount, netFlow, lifetime.deposited);
    if (amt > 0) {
      earned = {
        key: "supply-interest",
        symbol: view.base.symbol,
        amount: amt,
        usd: usdOf(view.base.address, amt),
        prov: vocab.accruedBase(view.base.symbol, "lend", baseCoords),
      };
      collateralLines[0] = {
        ...collateralLines[0],
        amount: netFlow,
        usd: usdOf(view.base.address, netFlow),
        prov: vocab.lendPrincipal(view.base.symbol, baseCoords),
      };
    }
  }

  // The interest the rows accrued between events, where no live split above
  // already states it: the debt side's "+ Interest charged" and the lend
  // side's "+ Interest earned", so borrowed + interest − repaid − cleared
  // reaches what is owed on the face of the panel.
  const debtEarned: TowerLine[] =
    lifetime && !interest
      ? withLabel(
          flowLine(
            "interest charged",
            view.base.symbol,
            view.base.address,
            lifetime.interestCharged ?? 0,
            "base-int-charged",
          ),
          "Interest charged",
        )
      : [];
  const collEarned: TowerLine[] =
    lifetime && !earned
      ? withLabel(
          flowLine(
            "interest earned",
            view.base.symbol,
            view.base.address,
            lifetime.interestEarned ?? 0,
            "base-int-earned",
          ),
          "Interest earned",
        )
      : [];
  const received = [...collReceived, ...creditReceived];

  // Value the tower only when EVERY contributing line is oracle-priced — a strict
  // per-total guard (Aave's rule). A single unpriced leg drops it to the token
  // gated list, so a bar height is never a partial (misleading) USD figure.
  const contributing = [
    ...collateralLines,
    ...debtLines,
    ...collExited,
    ...received,
    ...debtEarned,
    ...collEarned,
    ...collLiquidated,
    ...debtExited,
    ...debtLiquidated,
    ...(interest ? [interest] : []),
    ...(earned ? [earned] : []),
  ].filter((l) => l.amount > 0);
  const allPriced = contributing.length > 0 && contributing.every((l) => l.usd != null);
  const valued = VALUED_USD && allPriced;

  // Lifetime inflow (the faded side bar) — USD when valued; a token amount is
  // only meaningful when one token flowed in, else suppressed.
  const collInflows: Array<{ addr: string; amount: number }> = lifetime
    ? [
        ...collFlows.map(([addr, c]) => ({ addr, amount: c.supplied })),
        { addr: view.base.address, amount: lifetime.deposited },
      ].filter((f) => f.amount > DUST)
    : [];
  const collInflow = valued
    ? collInflows.reduce((s, f) => s + (usdOf(f.addr, f.amount) ?? 0), 0)
    : collInflows.length === 1
      ? collInflows[0].amount
      : 0;
  const debtInflow =
    lifetime && lifetime.borrowed > DUST
      ? valued
        ? (usdOf(view.base.address, lifetime.borrowed) ?? 0)
        : lifetime.borrowed
      : 0;

  // Price change: every flow is valued at today's price except what an absorb
  // took, which carries the absorb's own. The row is the difference, so each
  // column reaches what is held (or owed) on the face of the panel. Stated
  // only when valued, and only past half a dollar.
  const usdSum = (lines: (TowerLine | null)[]): number => lines.reduce((t, l) => t + (l?.usd ?? 0), 0);
  const priceChange = (
    held: number,
    inflow: number,
    outflow: number,
    side: "collateral" | "debt",
  ): TowerLine | null => {
    if (!valued || !lifetime) return null;
    const change = held - (inflow - outflow);
    // Below a thousandth of the side's flows it is a stablecoin's drift from
    // a dollar, not a price move worth a row.
    if (Math.abs(change) < Math.max(0.5, (inflow + outflow) * 0.001)) return null;
    return {
      key: `${side}-price-change`,
      symbol: "",
      amount: change,
      usd: change,
      prov: absorbPriceChangeProv(side, coords),
      flowLabel: "Price change since the absorb",
    };
  };
  const hasAbsorbUsd = absorbUsd != null && (collLiquidated.length > 0 || debtLiquidated.length > 0);
  const collPriceChange = hasAbsorbUsd
    ? priceChange(
        usdSum([...collateralLines, earned]),
        collInflow + usdSum(received) + usdSum(collEarned),
        usdSum(collExited) + usdSum(collLiquidated),
        "collateral",
      )
    : null;
  const debtPriceChange = hasAbsorbUsd
    ? priceChange(
        usdSum([...debtLines, interest]),
        debtInflow + usdSum(debtEarned),
        usdSum(debtExited) + usdSum(debtLiquidated),
        "debt",
      )
    : null;

  return {
    valued,
    // On-chain oracle price → chain-derived, so the USD bars survive On-chain-values.
    priceKind: valued ? "chain-derived" : undefined,
    wrapFlowLabels: true,
    collateral: {
      current: collateralLines,
      interest: earned,
      ...(collEarned.length > 0 ? { earned: collEarned } : {}),
      exited: collExited,
      received,
      liquidated: collLiquidated,
      lifetimeInflow: collInflow,
      priceChange: collPriceChange,
    },
    debt: {
      current: debtLines,
      interest,
      ...(debtEarned.length > 0 ? { earned: debtEarned } : {}),
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: debtInflow,
      priceChange: debtPriceChange,
    },
    // Gated-list headers reflect whether the amount is the current value (chain
    // overlay) or bare principal.
    collateralListLabel: chain && baseSide === "lend" && !earned ? "Supplied · current" : "Collateral",
    debtListLabel:
      chain && !interest
        ? "Debt · current"
        : interest
          ? "Debt · principal"
          : vocab.baseAtLastEvent
            ? "Debt · last event"
            : "Debt · principal",
    interestNote:
      interest != null || earned != null
        ? undefined
        : chain
          ? "Base amounts are the current value, with interest included. Collateral does not accrue, so it is exact."
          : vocab.baseAtLastEvent
            ? "Base amounts are the balance at the position's last event, interest to then included; interest since then isn't. Collateral does not accrue, so it is exact."
            : "Base amounts are principal only — interest that has built up since each supply or borrow isn't included here. Collateral does not accrue, so it is exact.",
    ...(notLoaded.length > 0 ? { notLoaded } : {}),
  };
}

/** The price-change row's receipt: the absorb's legs carry its own prices,
 *  every other flow and the held figure today's. */
function absorbPriceChangeProv(side: "collateral" | "debt", coords: CompoundCoords): Provenance {
  return {
    kind: "chain-derived",
    summary: `Price change — what an absorb took is valued at the absorb's prices (the usdValue its events emitted), every other ${side === "collateral" ? "supply, withdrawal and holding" : "borrow, repayment and balance"} at the price Comet's oracle gives today. This row is the difference, so the column adds up in dollars; in tokens it adds up without it.`,
    formula: side === "collateral" ? "held now − (in − out)" : "owed now − (in − out)",
    contract: cometContract(coords),
    inputs: [
      { label: "absorb legs", kind: "chain-derived", pclass: "oracle", note: "at the absorb's prices" },
      { label: "other flows and holdings", kind: "chain-derived", pclass: "oracle", note: "at today's oracle price" },
    ],
  };
}

/** The collateral assets the tower leaves out: one the card flags, and any
 *  token an event of this market names whose decimals did not load. */
function compoundNotLoaded(
  view: CompoundPositionView,
  events: BaseActivityEvent[],
  precomputed?: CompoundLifetimeFlows,
): UnreadToken[] {
  const out = new Map<string, UnreadToken>();
  for (const [addr, c] of Object.entries(precomputed?.collateral ?? {}))
    if (c.decimalsUnread) out.set(addr.toLowerCase(), { address: addr.toLowerCase(), label: c.symbol });
  for (const c of view.collateral)
    if (c.decimalsUnread) out.set(c.address.toLowerCase(), { address: c.address.toLowerCase(), label: c.symbol });
  const mine = events.filter((e) => isCompoundEvent(e) && e.context.data.market === view.market);
  for (const t of unreadTokensIn(mine)) if (!out.has(t.address)) out.set(t.address, t);
  return [...out.values()];
}
