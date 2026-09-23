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
  lifetimeFlowProv,
  type CompoundCoords,
  type CompoundLifetimeFlow,
} from "@/lib/compound/event-provenance";
import { flowsReconcile, type ChainTruthTowerData, type TowerLine } from "@/lib/shared/chain-truth-economics";
import type { TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

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
}

export const COMPOUND_INDEXED_VOCABULARY: CompoundTowerVocabulary = {
  positionBase: positionBaseProv,
  currentBase: currentBaseProv,
  positionCollateral: positionCollateralProv,
  lifetimeFlow: lifetimeFlowProv,
  accruedBase: accruedBaseProv,
  debtPrincipal: debtPrincipalProv,
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
  absorbedDebt: number;
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
const BASE_LEGS = ["deposited", "withdrawn", "borrowed", "repaid", "absorbedDebt"] as const;
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
}

export function newCompoundLifetimeRaw(baseDecimals: number | null = null): CompoundLifetimeRaw {
  return {
    base: { deposited: ZERO, withdrawn: ZERO, borrowed: ZERO, repaid: ZERO, absorbedDebt: ZERO },
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
    acc.absorbedDebt += absBig(delta);
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
    collateral,
  };
}

/** The Ethereum page's walk: over the rendered events of one market, each
 *  carrying its replayed `baseAfter`, so before = after − delta and the split
 *  is exact on every row. The human strings are parsed back to raw at the
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
      continue;
    }

    const addr = (flow?.token ?? "").toLowerCase();
    if (!addr || !flow) return null;
    const delta = parseUnits(ctx.assetsDelta, flow.tokenDecimals);
    if (delta == null) return null;
    const c = compoundCollateralFlowsOf(raw, addr, ctx.assetSymbol, flow.tokenDecimals);
    if (c.decimals !== flow.tokenDecimals) return null;
    addCompoundCollateralFlow(c, ctx.eventType, delta);
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
): CompoundLifetimeFlows | undefined {
  if (!opening) return undefined;

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

  for (const bucket of opening.flows ?? []) {
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

  return scaleCompoundLifetime(merged);
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
  const replayed = precomputedLifetime ?? (walked ? scaleCompoundLifetime(walked) : null);
  const netBase = replayed
    ? replayed.deposited + replayed.repaid + replayed.absorbedDebt - replayed.withdrawn - replayed.borrowed
    : 0;
  const collateralByAddr = new Map(view.collateral.map((c) => [c.address.toLowerCase(), c]));
  const lifetime =
    replayed &&
    flowsReconcile(
      netBase,
      view.base.amount,
      replayed.deposited + replayed.repaid + replayed.absorbedDebt + replayed.withdrawn + replayed.borrowed,
    ) &&
    Object.entries(replayed.collateral).every(([addr, c]) =>
      // supplied + received − withdrawn − absorbed − sent = current: transfers
      // are custody moves, so both legs must enter the conservation or a
      // transfer-touched asset never reconciles (and the whole layer suppresses).
      flowsReconcile(
        c.supplied + c.received - c.withdrawn - c.absorbed - c.sent,
        collateralByAddr.get(addr)?.amount ?? 0,
        c.supplied + c.received + c.withdrawn + c.absorbed + c.sent,
      ),
    )
      ? replayed
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
  const collLiquidated = collFlows.flatMap(([addr, c]) =>
    flowLine("absorbed collateral", c.symbol, addr, c.absorbed, `cl-${addr}`),
  );
  const debtExited = lifetime
    ? flowLine("repaid", view.base.symbol, view.base.address, lifetime.repaid, "base-repaid")
    : [];
  const debtLiquidated = lifetime
    ? flowLine("absorbed debt", view.base.symbol, view.base.address, lifetime.absorbedDebt, "base-absorbed")
    : [];

  // Collateral side: the non-earning collateral assets, exact from the event replay.
  const collateralLines: TowerLine[] = view.collateral
    .filter((c) => c.amount > 0)
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
    const netPrincipal = -netBase; // borrower: net base is negative
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

  // Value the tower only when EVERY contributing line is oracle-priced — a strict
  // per-total guard (Aave's rule). A single unpriced leg drops it to the token
  // gated list, so a bar height is never a partial (misleading) USD figure.
  const contributing = [
    ...collateralLines,
    ...debtLines,
    ...collExited,
    ...collReceived,
    ...collLiquidated,
    ...debtExited,
    ...debtLiquidated,
    ...(interest ? [interest] : []),
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

  return {
    valued,
    // On-chain oracle price → chain-derived, so the USD bars survive On-chain-values.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: collateralLines,
      interest: null,
      exited: collExited,
      received: collReceived,
      liquidated: collLiquidated,
      lifetimeInflow: collInflow,
    },
    debt: {
      current: debtLines,
      interest,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: debtInflow,
    },
    // Gated-list headers reflect whether the amount is the current value (chain
    // overlay) or bare principal.
    collateralListLabel: chain && baseSide === "lend" ? "Supplied · current" : "Collateral",
    debtListLabel: chain && !interest ? "Debt · current" : "Debt · principal",
    interestNote:
      interest != null
        ? undefined
        : chain
          ? "Base amounts are the current value, with interest included. Collateral does not accrue, so it is exact."
          : "Base amounts are principal only — interest that has built up since each supply or borrow isn't included here. Collateral does not accrue, so it is exact.",
  };
}
