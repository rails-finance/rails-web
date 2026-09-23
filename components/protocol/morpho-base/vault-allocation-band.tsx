"use client";

// What this address's claim sat in, at the block of one of its own events.
// ----------------------------------------------------------------------------
// A MetaMorpho vault is one deposit spread across several Morpho Blue markets,
// and the curator moves that spread constantly. The exposure section at the top
// of this page states the spread at the PAGE's block; this states it at the
// block of each row, so a reader can see where the address's asset sat on the
// day it acted rather than only where it sits today.
//
// ── EACH BAND IS A PHOTOGRAPH, AND THE ROW OF THEM IS NOT A FILM ─────────────
// The band on a row is a read at that row's own block and at no other. Between
// two rows the curator fired reallocations — thousands of them on this vault —
// and this page read none of them, so nothing is drawn across the gap: no line,
// no transition, no interpolation, and the space between two rows is the
// timeline's ordinary vertical gap and means nothing. The page says this in
// words once, under the first band, because a column of bands is exactly the
// shape a reader would otherwise read as a series.
//
// ── PROPORTIONAL, NOT FUND TRACING ──────────────────────────────────────────
// Nothing on chain records whose asset went into which market. A segment is
// this address's shares over the vault's whole supply, applied to what the
// vault supplied in that market — so two addresses holding equal shares hold
// equal segments whatever either deposited or when. A TIMELINE makes the
// fund-tracing reading more tempting rather than less, because it looks like
// following money, which is why the statement sits on the page and not only in
// the receipts.
//
// ── NO OPINIONATED COLOUR ────────────────────────────────────────────────────
// Rails chooses which market is which segment, so no segment carries a hue that
// could be read as a judgement. The band is the page's own ink at descending
// strength, stepped by the vault's OWN queue order — a fact the contract
// publishes. Nothing here is green, amber or red, and nothing ranks.
//
// ── THE BAND IS THE SUMMARY, THE PANEL IS THE RECORD ────────────────────────
// A panel-width band cannot draw twenty legible segments, so the smallest are
// collected into one trailing segment labelled with its count and its sum. The
// largest is never collected. Every leg — including the ones collected, the
// ones reading zero and the ones that did not answer — is listed uncollected in
// the row's detail panel, with the denominator that divided it stated there.
//
// NO USD. NO TOTAL ACROSS ASSETS. A zero is a reading; an unread leg says so.

import type { ReactNode } from "react";

import { AllocationBar, type AllocationSegment } from "@/components/shared/ratio-bar";
import { Prov } from "@/components/shared/provenance";
import { assetText, pctText, shortId } from "@/components/protocol/morpho-base/vault-exposure-parts";
import {
  morphoVaultAllocationCollectedProv,
  morphoVaultAllocationGrainProv,
  morphoVaultAllocationLegProv,
  morphoVaultAllocationLegShareProv,
  morphoVaultAllocationSuppliedProv,
} from "@/lib/morpho-base/vault-timeline-provenance";
import type {
  MetaMorphoEventExtra,
  VaultAllocationLeg,
  VaultHolderEvent,
  VaultTimelineCoords,
} from "@/lib/shared/vault-holder-timeline";

const ZERO = BigInt(0);
const n = (v: number) => v.toLocaleString("en-US");

/** The smallest share of the band a segment may hold and still be drawn on its
 *  own. It is a WIDTH rule, not a count: at a panel of ~640px this is about
 *  13px, which is the narrowest thing an eye separates from its neighbour.
 *  However many legs clear it are drawn individually — five on a five-market
 *  vault, two or three on a twenty-market one — and the rest are collected. */
const MIN_SEGMENT_SHARE = 0.02;

const metaExtra = (event: VaultHolderEvent): MetaMorphoEventExtra | null =>
  event.extra?.kind === "metamorpho" ? event.extra : null;

/** What a market is called here: its collateral's symbol, or the fact that it
 *  is the vault's idle market, and its own short id beside either. Never a
 *  curator's or a brand's name — a market is a collateral and a hash. */
export const legLabel = (leg: VaultAllocationLeg): string =>
  leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? (leg.marketId ? shortId(leg.marketId) : "Unread market"));

const legTitle = (leg: VaultAllocationLeg, assetSymbol: string, assetDecimals: number, share: number): string =>
  `${legLabel(leg)} ${leg.marketId ? shortId(leg.marketId) : ""} · ${assetText(
    { raw: leg.attributed ?? "0", value: Number(leg.attributed ?? 0) / Math.pow(10, assetDecimals) },
    assetDecimals,
  )} ${assetSymbol} · ${pctText(share)} of this address's claim at this block · queue position ${leg.queueIndex + 1}`;

const attributedOf = (leg: VaultAllocationLeg): bigint | null =>
  leg.attributed == null ? null : BigInt(leg.attributed);

interface BandPlan {
  /** Drawn individually, in the vault's own queue order. */
  shown: VaultAllocationLeg[];
  /** Drawn as one trailing segment — always the smallest, never the largest. */
  collected: VaultAllocationLeg[];
  /** Σ attributed over every leg that answered, raw. */
  total: bigint;
  /** Legs whose read did not answer at all. */
  unread: VaultAllocationLeg[];
}

/**
 * Which legs draw on their own and which are collected.
 *
 * Selection is by SIZE — the largest clear the width rule and the smallest do
 * not — and drawing is in the vault's own QUEUE ORDER, which is the order the
 * allocation table above the timeline uses and the order the ramp steps in. So
 * the collected group is always the tail of the size ranking and always the
 * last segment on the band, and the two orderings never disagree about which
 * legs are which.
 */
function planBand(legs: VaultAllocationLeg[]): BandPlan {
  const unread = legs.filter((l) => attributedOf(l) == null);
  const read = legs.filter((l) => attributedOf(l) != null);
  const total = read.reduce((s, l) => s + (attributedOf(l) ?? ZERO), ZERO);
  if (total === ZERO) return { shown: [], collected: [], total, unread };

  const positive = read.filter((l) => (attributedOf(l) ?? ZERO) > ZERO);
  const bySize = [...positive].sort((a, b) => {
    const d = (attributedOf(b) ?? ZERO) - (attributedOf(a) ?? ZERO);
    return d > ZERO ? 1 : d < ZERO ? -1 : 0;
  });
  const clears = bySize.filter((l) => Number(attributedOf(l) ?? ZERO) / Number(total) >= MIN_SEGMENT_SHARE);
  // The largest always draws, whatever the width rule says about it: a band
  // whose biggest segment is inside a collected group would misstate the shape.
  let shownSet = clears.length ? clears : bySize.slice(0, 1);
  let collected = bySize.filter((l) => !shownSet.includes(l));
  // One leftover is not a group. Collecting a single leg into "and 1 more"
  // hides a name to save nothing, so it draws on its own instead.
  if (collected.length === 1) {
    shownSet = [...shownSet, collected[0]];
    collected = [];
  }
  const byQueue = (a: VaultAllocationLeg, b: VaultAllocationLeg) => a.queueIndex - b.queueIndex;
  return { shown: [...shownSet].sort(byQueue), collected: [...collected].sort(byQueue), total, unread };
}

export interface VaultAllocationBandProps {
  event: VaultHolderEvent;
  /** THIS ROW's coordinates — the block a receipt names is the row's own. */
  coords: VaultTimelineCoords;
  assetSymbol: string;
  /** The newest row. The interval rule and the proportional statement are said
   *  once for the page, under the first band. */
  first: boolean;
}

/** The band itself, in the row's `headerBars` slot: full panel width, so its
 *  grid lines up with the detail grid under it. */
export function VaultAllocationBand({ event, coords, assetSymbol, first }: VaultAllocationBandProps) {
  const extra = metaExtra(event);
  const legs = extra?.allocation ?? null;
  const ad = event.assetDecimals;

  if (!legs)
    return (
      <div className="px-5 pb-1">
        <p className="text-[11px] leading-relaxed text-rb-500" data-figure="row-allocation-unread">
          What the vault&rsquo;s asset sat in at this block was not read, so no band is drawn for this row. That is a
          missing reading, not an empty one — the rest of this row is unaffected.
        </p>
      </div>
    );

  const plan = planBand(legs);
  const share = (leg: VaultAllocationLeg) =>
    plan.total === ZERO ? 0 : Number(attributedOf(leg) ?? ZERO) / Number(plan.total);
  const operands = { holderShares: extra?.holderSharesAtBlock ?? null, totalSupply: extra?.totalSupplyAtBlock ?? null };

  const segments: AllocationSegment[] = plan.shown.map((leg) => ({
    key: leg.marketId || `queue-${leg.queueIndex}`,
    f: share(leg),
    rampIndex: leg.queueIndex,
    title: legTitle(leg, assetSymbol, ad, share(leg)),
    // The raw figure this segment's width came from, stamped where a check can
    // read it: a width off a formatted caption is blind to a wei-level break.
    data: {
      "data-alloc-attributed": leg.attributed ?? "",
      "data-alloc-queue-index": String(leg.queueIndex),
    },
    wrap: (bar: ReactNode) => (
      <Prov
        info={morphoVaultAllocationLegProv(coords, leg, operands)}
        value={`${leg.attributed ?? "unread"}`}
        symbol={assetSymbol}
        className="block h-full"
      >
        {bar}
      </Prov>
    ),
  }));

  if (plan.collected.length) {
    const sum = plan.collected.reduce((s, l) => s + (attributedOf(l) ?? ZERO), ZERO);
    const f = plan.total === ZERO ? 0 : Number(sum) / Number(plan.total);
    segments.push({
      key: "collected",
      f,
      rampIndex: 0,
      collected: true,
      data: {
        "data-alloc-collected-count": String(plan.collected.length),
        "data-alloc-collected-sum": sum.toString(),
        "data-alloc-collected-ids": plan.collected.map((l) => l.marketId || `queue-${l.queueIndex}`).join(","),
      },
      title: `${n(plan.collected.length)} more markets · ${assetText({ raw: sum.toString(), value: Number(sum) / Math.pow(10, ad) }, ad)} ${assetSymbol} · ${pctText(f)} of this address's claim at this block`,
      wrap: (bar: ReactNode) => (
        <Prov
          info={morphoVaultAllocationCollectedProv(coords, plan.collected.length, plan.collected)}
          value={sum.toString()}
          symbol={assetSymbol}
          className="block h-full"
        >
          {bar}
        </Prov>
      ),
    });
  }

  const empty = plan.total === ZERO;

  return (
    <>
      <AllocationBar
        segments={segments}
        ariaLabel={`What this address's claim sat in at block ${n(event.blockNumber)}`}
        emptyLabel={
          empty
            ? `Empty — this address held no shares at block ${n(event.blockNumber)}, so nothing is attributed to any market. The vault's own allocation at that block is in the panel below, and it is not zero.`
            : undefined
        }
      />
      {!empty && (
        <div className="px-5 pb-1">
          <p className="text-[11px] leading-relaxed text-rb-500" data-figure="row-allocation-summary">
            {summaryLine(plan, assetSymbol)}
          </p>
        </div>
      )}
      {plan.unread.length > 0 && (
        <div className="px-5 pb-1">
          <p className="text-[11px] leading-relaxed text-rb-500" data-figure="row-allocation-partial">
            {plan.unread.length === 1 ? "One market" : `${n(plan.unread.length)} markets`} in the queue at this block
            did not answer, so {plan.unread.length === 1 ? "it is" : "they are"} in neither the band nor its total. Not
            read is not zero, and the panel below names {plan.unread.length === 1 ? "it" : "them"}.
          </p>
        </div>
      )}
      {first && (
        <div className="px-5 pb-2">
          <p className="max-w-3xl text-[11px] leading-relaxed text-rb-500" data-figure="allocation-rule">
            <Prov info={morphoVaultAllocationGrainProv(coords)}>
              Each band is a read at that row&rsquo;s own block, and nothing is drawn between two of them
            </Prov>
            . The vault&rsquo;s asset moved between these blocks at the curator&rsquo;s own reallocations, which are not
            rows here and are not read at all; the space between two rows is this timeline&rsquo;s ordinary gap and says
            nothing. A segment is proportional and not a trace of anyone&rsquo;s money: it is this address&rsquo;s
            shares over the whole supply, applied to what the vault supplied in that market, so two addresses holding
            equal shares hold equal segments whatever either deposited or when.
          </p>
        </div>
      )}
    </>
  );
}

/** The one line under the band: the largest one or two markets in words, and
 *  the rest as a count. NAMES, not figures — the figures are on the segments,
 *  in their receipts and in the panel below, so this line adds no number a
 *  receipt would have to carry.
 *
 *  It ranks over EVERY market that holds something at this block, not only the
 *  ones drawn on their own: a collected segment is a drawing decision, and the
 *  second-largest market is the second-largest whether or not the band had room
 *  to give it a segment of its own. */
function summaryLine(plan: BandPlan, assetSymbol: string): string {
  const bySize = [...plan.shown, ...plan.collected].sort((a, b) => {
    const d = (attributedOf(b) ?? ZERO) - (attributedOf(a) ?? ZERO);
    return d > ZERO ? 1 : d < ZERO ? -1 : 0;
  });
  const named = bySize.slice(0, 2).map(legLabel);
  const rest = bySize.length - named.length;
  if (named.length === 0) return `This address's ${assetSymbol} claim at this block sat in no market.`;
  if (named.length === 1 && rest === 0)
    return `All of this address's ${assetSymbol} claim sat in ${named[0]} at this block.`;
  const head =
    named.length === 2
      ? `Largest at this block: ${named[0]}, then ${named[1]}.`
      : `Largest at this block: ${named[0]}.`;
  const tail =
    rest > 0
      ? ` ${rest === 1 ? "One more market held" : `${n(rest)} more markets held`} the rest of this address's ${assetSymbol} claim.`
      : "";
  return `${head}${tail}`;
}

export interface VaultAllocationDetailProps {
  event: VaultHolderEvent;
  /** The row before this one IN TIME. Rows draw newest first, so it is the next
   *  element of the list, not the previous one. Null on the oldest row. */
  earlier: VaultHolderEvent | null;
  coords: VaultTimelineCoords;
  assetSymbol: string;
}

/** The record: every leg, uncollected, with the denominator that divided it. */
export function VaultAllocationDetail({ event, earlier, coords, assetSymbol }: VaultAllocationDetailProps) {
  const extra = metaExtra(event);
  const legs = extra?.allocation ?? null;
  const ad = event.assetDecimals;
  if (!legs) return null;

  const operands = { holderShares: extra?.holderSharesAtBlock ?? null, totalSupply: extra?.totalSupplyAtBlock ?? null };
  const total = legs.reduce((s, l) => s + (attributedOf(l) ?? ZERO), ZERO);
  const raw = (v: string) => ({ raw: v, value: Number(v) / Math.pow(10, ad) });

  const earlierExtra = earlier ? metaExtra(earlier) : null;
  const earlierIds = new Set((earlierExtra?.allocation ?? []).map((l) => l.marketId).filter(Boolean));
  const entered = earlierExtra?.allocation ? legs.filter((l) => l.marketId && !earlierIds.has(l.marketId)) : [];
  const left = earlierExtra?.allocation
    ? earlierExtra.allocation.filter((l) => l.marketId && !legs.some((x) => x.marketId === l.marketId))
    : [];

  return (
    <div className="mt-3" data-row-allocation={legs.length}>
      <div className="text-[11px] uppercase tracking-wider text-rb-500">
        Where this address&rsquo;s claim sat at block {n(event.blockNumber)}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[12px]">
          <thead>
            <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
              <th className="py-1.5 pr-3 font-normal">Market</th>
              <th className="py-1.5 pr-3 text-right font-normal">Vault supplied · {assetSymbol}</th>
              <th className="py-1.5 pr-3 text-right font-normal">This address · {assetSymbol}</th>
              <th className="py-1.5 text-right font-normal">Share of its claim</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => {
              const attributed = attributedOf(leg);
              // Three cases, and they are three different statements: unread,
              // read against a claim of nothing (no proportion exists), and a
              // proportion. A zero total is not an unread figure.
              const f = attributed == null || total === ZERO ? null : Number(attributed) / Number(total);
              return (
                <tr
                  key={leg.marketId || `queue-${leg.queueIndex}`}
                  data-alloc-leg={leg.marketId || `queue-${leg.queueIndex}`}
                  className="border-b border-rb-200/60 dark:border-rb-500/20"
                >
                  <td className="py-1.5 pr-3">
                    <span
                      className={leg.collateralNamed || leg.isIdle ? "text-foreground" : "font-mono text-foreground"}
                    >
                      {legLabel(leg)}
                    </span>
                    {leg.marketId && (
                      <span className="ml-2 font-mono text-[11px] text-rb-500">{shortId(leg.marketId)}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-rb-500" data-cell="leg-supplied">
                    {leg.vaultSupplied == null ? (
                      <span className="text-rb-500">not read</span>
                    ) : (
                      <Prov info={morphoVaultAllocationSuppliedProv(coords, leg)}>
                        {assetText(raw(leg.vaultSupplied), ad)}
                      </Prov>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-foreground" data-cell="leg-attributed">
                    {leg.attributed == null ? (
                      <span className="text-rb-500">not read</span>
                    ) : (
                      <Prov info={morphoVaultAllocationLegProv(coords, leg, operands)}>
                        {assetText(raw(leg.attributed), ad)}
                      </Prov>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-rb-500" data-cell="leg-share">
                    {attributed == null ? (
                      "not read"
                    ) : f == null ? (
                      "none"
                    ) : (
                      <Prov info={morphoVaultAllocationLegShareProv(coords, leg)}>{pctText(f)}</Prov>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="row-allocation-denominator">
        Every figure in the third column is this address&rsquo;s shares at this block over the vault&rsquo;s whole
        supply at this block, applied to what the vault supplied in that market.{" "}
        {operands.totalSupply != null && operands.holderShares != null ? (
          <>
            The denominator is <code>totalSupply()</code> read at block {n(event.blockNumber)} and nowhere else, and it
            is a different number on every row.
          </>
        ) : (
          <>
            One of the two operands did not answer at this block, so no proportion is stated for the legs that depend on
            it.
          </>
        )}{" "}
        A market in the queue holding nothing reads as zero and stays in this list: a zero is a reading, and leaving it
        out would be an omission dressed as one.
      </p>

      {(entered.length > 0 || left.length > 0) && earlier && (
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="row-allocation-queue-change">
          {entered.length > 0 && (
            <>
              {entered.length === 1 ? "One market is" : `${n(entered.length)} markets are`} in the queue at this block
              and {entered.length === 1 ? "was" : "were"} not in it at this address&rsquo;s previous event — the earlier
              row, at block {n(earlier.blockNumber)}:{" "}
              {entered.map((l) => `${legLabel(l)} ${shortId(l.marketId)}`).join(", ")}.{" "}
            </>
          )}
          {left.length > 0 && (
            <>
              {left.length === 1 ? "One market was" : `${n(left.length)} markets were`} in the queue at that earlier
              block, block {n(earlier.blockNumber)}, and {left.length === 1 ? "is" : "are"} not in it here:{" "}
              {left.map((l) => `${legLabel(l)} ${shortId(l.marketId)}`).join(", ")}.{" "}
            </>
          )}
          The vault changed its queue somewhere between those two blocks. Which block, and how many times, is not read
          here — no event on this page says so.
        </p>
      )}
    </div>
  );
}
