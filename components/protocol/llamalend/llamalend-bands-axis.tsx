"use client";

// The band axis — LlamaLend's distinctive risk surface, drawn as a runway.
// ----------------------------------------------------------------------------
// A liquidation here is not a line, it is a BAND: soft-liquidation begins at
// pUp (= p_oracle_up(n1)) and completes at pDown (= p_oracle_down(n2)) — two
// prices in the same unit, a legitimate two-point axis.
//
// ⇒ IT IS THE SHARED RUNWAY'S BAR, at the shared runway's compact size, in the
// shared runway's meter slot (`w-64`): the same 6px pill-capped segments, the
// same 1px seams, the same fills, imported from <PriceRunway> as RUNWAY_SEG so
// the two cannot drift. Left to right the reading is the runway's own —
//
//   collateral blue → neutral headroom → THE BAND → the fully-converted red
//
// — with one segment substituted: where every other explorer crosses a
// liquidation LINE, LlamaLend crosses a range, so the band is drawn in its
// place. A Trove's card and this one should differ in what they measure, not in
// how they look.
//
// ⇒ NOTHING IS DRAWN PER-BAND, and that is the point. Individual band segments
// need width the meter does not have (a typical band is ~4% of the price wide,
// and 25 of them inside it are sub-pixel at 256px), and a bar whose legibility
// depends on its container has to be re-checked at every breakpoint. One
// gradient always works — at 256px, and at whatever a phone gives it. The band
// COUNT is a caption figure instead of a drawn one.
//
// ⇒ AND THERE IS NO MARKER LINE. The shared runway has none: the blue fill's
// rounded cap IS the live price. That works above the band; inside it, the
// price is mid-gradient with no cap to read, so the band carries a hard ALPHA
// STEP at the price instead — solid where the AMM has already converted, faint
// where it has not. The step is the marker AND it states how far through the
// band the position is, which a line could not. Below pDown the red zone splits
// the same way, which is exactly what <PriceRunway> does underwater.
//
// WHAT IT DOES NOT SHARE is the axis maths. <PriceRunway>'s scale is literally
// "% from liquidation", which places every rail's threshold at the SAME spot so
// rows stay comparable. A band cannot ride that — at that scale it collapses,
// taking the one thing this surface exists to show with it. So the axis stays a
// local price window around the band, and the lead figure beside the bar
// carries the comparable %-from-soft-liquidation number instead. (Float math
// for PIXELS ONLY — every rendered NUMBER is the exact integer port or the
// AMM's own read.)
//
// COLOUR (added 2026-07-27, Miles). §1 of the colour grammar bans colour-coding
// a RISK VERDICT — a health factor painted green or red. This is not a verdict:
// it is the protocol's own state machine drawn to scale. Soft-liquidation IS
// "adverse, in progress, not terminal" and full conversion IS terminal, so the
// ramp lands on the house CAUTION (orange) → CRITICAL (red) ladder from §5 —
// the same red that already paints a liquidation spine and pill. Down the band
// a further slice of collateral is converted; the colour tracks that, not
// whether the reader should worry.
//
// Two things it deliberately is NOT:
//   • not amber — retired 2026-06-18 (§7, "don't introduce new amber"). The
//     prototype's ramp was amber→red; it is caution→critical here.
//   • not green on the safe side. The prototype painted everything above pUp
//     emerald. Green is the marketing hue, and "you're fine" is exactly the
//     verdict §1 exists to prevent — so the safe side is the runway's own
//     structural collateral blue, the same fill a Trove gets.

import { Prov } from "@/components/shared/provenance";
import { RUNWAY_SEG } from "@/components/shared/price-runway";
import {
  llamalendBandCountProv,
  llamalendBandEdgeProv,
  llamalendOraclePriceProv,
} from "@/lib/llamalend/live-provenance";
import { formatUnitsExact } from "@/lib/utils/format";
import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";

// The band ramp, as its two endpoint channels: caution-400 #fb923c at the top
// band (drift begins) → red-500 #ef4444 at the bottom (fully converted).
const RAMP_TOP = [251, 146, 60] as const;
const RAMP_BOTTOM = [239, 68, 68] as const;
// Alpha either side of the conversion frontier — solid behind it, faint ahead.
const A_DONE = 0.85;
// 0.28 read as muddy brown rather than a faint orange on the dark card, where
// the ramp is compositing onto near-black; 0.4 carries in both themes.
const A_TODO = 0.4;

const rampAt = (t: number, alpha: number): string => {
  const c = RAMP_TOP.map((v, i) => Math.round(v * (1 - t) + RAMP_BOTTOM[i] * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
};

export function LlamalendBandsAxis({ chain }: { chain: LlamalendChainResponse }) {
  if (
    chain.chainStale ||
    !chain.hasLoan ||
    chain.pUp == null ||
    chain.pDown == null ||
    chain.priceOracle == null ||
    chain.pUp <= 0
  )
    return null;

  const { pUp, pDown, priceOracle: price } = chain;
  const unit = chain.borrowedIsCrvusd ? `${chain.borrowedSymbol} (~$1)` : chain.borrowedSymbol;

  // Axis window. The top is the higher of the band and the live price, plus a
  // little headroom so the price never sits on the edge. The BOTTOM is pinned
  // rather than padded: everything below pDown is one undifferentiated outcome
  // (fully converted, nothing left to soft-liquidate), so its width states
  // nothing — left free it swung between 3% and 30% of the bar depending only
  // on how wide the band happened to be. It gets a fixed cliff at the end
  // instead, exactly as <PriceRunway> fixes its liquidation line at the same
  // spot on every row. A price that has already fallen PAST pDown reopens the
  // window to keep itself on the bar.
  const CLIFF_PCT = 8; // the fully-converted zone, as a share of the bar
  const hi = Math.max(pUp, price) * 1.05;
  const lo = Math.min(hi - (hi - pDown) / (1 - CLIFF_PCT / 100), price * 0.98);

  // ⇒ DIRECTION: falling price runs LEFT → RIGHT, so the axis reads the same way
  // as the shared <PriceRunway> every other explorer puts on its card — safety at
  // the left edge, liquidation at the right. That means the price scale DESCENDS
  // rightward (hi at 0%, lo at 100%), which is the opposite of a chart's x-axis:
  // this is a distance-to-liquidation bar that happens to be labelled in prices,
  // not a price chart. Getting it the other way round put "fully liquidated" on
  // the left, i.e. a reader crossing from /fluid to here saw danger swap sides.
  const x = (p: number): number => Math.min(100, Math.max(0, ((hi - p) / (hi - lo)) * 100));

  // Segment extents, in % of the bar. Blue runs from the left edge to whichever
  // comes first — the live price or the band's top; headroom closes the gap to
  // pUp (nothing once the price is in the band); the band spans pUp…pDown; red
  // runs from pDown to the right edge.
  const xPrice = x(price);
  const xUp = x(pUp);
  const xDown = x(pDown);
  const fillW = Math.min(xPrice, xUp);
  const headroomW = Math.max(0, xUp - fillW);
  const bandW = Math.max(0.5, xDown - xUp);
  const redW = Math.max(0, 100 - xDown);

  // How far through the band the price stands, 0…1 — the frontier the alpha
  // steps at. 0 above the band (nothing converted), 1 below it (all of it).
  const f = Math.min(1, Math.max(0, (xPrice - xUp) / Math.max(0.01, xDown - xUp)));
  const fPct = f * 100;
  const bandFill = `linear-gradient(to right, ${rampAt(0, A_DONE)} 0%, ${rampAt(f, A_DONE)} ${fPct}%, ${rampAt(
    f,
    A_TODO,
  )} ${fPct}%, ${rampAt(1, A_TODO)} 100%)`;

  // Past pDown the red zone splits at the price the same way — the shared
  // runway's underwater form, where the deep segment runs from the threshold to
  // the live marker and the lighter one trails it.
  const converted = price <= pDown;
  const redDoneW = converted ? Math.max(0.5, Math.min(100, xPrice) - xDown) : 0;

  // One decimal count for all three prices, chosen so the band's own WIDTH
  // keeps two significant digits. Per-figure formatting let the two edge
  // captions disagree (`1,745.17` beside `2,359.293`), which reads as different
  // precision on figures that are the same measurement.
  const width = Math.abs(pUp - pDown);
  const dp = Math.max(2, Math.min(6, width > 0 ? Math.ceil(-Math.log10(width)) + 1 : 2));
  const p = (v: number): string => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  // The lead figure, in the compact runway's own slot and voice. Above the band
  // it is the same quantity every other rail states — the % the price can fall
  // before the threshold — so the two cards compare directly. Inside and below
  // it, the % is spent and the state is the fact.
  const inBand = !converted && price <= pUp;
  const lead = converted ? (
    <span className="font-semibold text-red-600 dark:text-red-400">Fully converted</span>
  ) : inBand ? (
    <span className="font-semibold text-caution-600 dark:text-caution-400">Converting now</span>
  ) : (
    <>{Math.round(((price - pUp) / price) * 100)}% from soft-liquidation</>
  );

  return (
    <div className="w-full">
      <div className="flex w-full items-center gap-2.5">
        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-rb-500">{lead}</span>
        <div
          className="flex min-w-20 flex-1"
          style={{ height: RUNWAY_SEG.hCompact, gap: RUNWAY_SEG.gapPx }}
          title={`The soft-liquidation band: conversion runs from ${p(pUp)} down to ${p(pDown)} ${unit}, across ${chain.bands} bands (n${chain.n1}…${chain.n2}).`}
        >
          {/* Collateral — left edge → the live price (or the band's top,
              whichever it reaches first). Its rounded cap is the price, exactly
              as in the shared runway. Once everything is converted there is no
              collateral left to draw, so it drops to the liquidation tone —
              which is what <PriceRunway> does underwater, and for the same
              reason: the runway above the threshold is out of reach. */}
          {fillW > 0 && (
            <div
              className={`${converted ? RUNWAY_SEG.liq : RUNWAY_SEG.fill} rounded-full`}
              style={{ flexGrow: fillW, flexBasis: 0 }}
            />
          )}
          {/* Headroom — the fall still available before conversion begins. */}
          {headroomW > 0 && (
            <div className={`${RUNWAY_SEG.headroom} rounded-full`} style={{ flexGrow: headroomW, flexBasis: 0 }} />
          )}
          {/* The band, in the runway's liquidation-zone slot: one element, the
              ramp continuous across it, with the alpha stepping at the price. */}
          <div className="rounded-full" style={{ flexGrow: bandW, flexBasis: 0, background: bandFill }} aria-hidden />
          {/* Everything past pDown is converted — nothing is left to
              soft-liquidate, and hard liquidation arms. */}
          {redDoneW > 0 && (
            <div className="rounded-full bg-red-500 dark:bg-red-500" style={{ flexGrow: redDoneW, flexBasis: 0 }} />
          )}
          {redW - redDoneW > 0 && (
            <div className={`${RUNWAY_SEG.liq} rounded-full`} style={{ flexGrow: redW - redDoneW, flexBasis: 0 }} />
          )}
        </div>
      </div>

      {/* The caption, in the runway slot's own strip — right-aligned under the
          bar like a Trove's, wrapping to a second line in the meter's width.
          Each price is stated ONCE, in the order the bar draws them, so nothing
          floats away from the edge it names. The band COUNT leads it: the bar
          no longer draws the bands individually, so this is where that fact
          lives, and it reads as what the range IS. The unit is the bare symbol
          (the ~$1 gloss is in the bar's tooltip) — at this width it cost a
          whole extra caption line. */}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-end gap-x-2 text-[11px] tabular-nums text-rb-500">
        <span>
          <Prov info={llamalendBandCountProv(chain.controller)}>
            {chain.bands} band{chain.bands === 1 ? "" : "s"}
          </Prov>
          :{" "}
          <Prov info={llamalendBandEdgeProv("pUp", chain.borrowedSymbol, chain.borrowedIsCrvusd, chain.amm)}>
            <span title={chain.pUpRaw != null ? `${formatUnitsExact(chain.pUpRaw, 18)} (exact, 1e18)` : undefined}>
              {p(pUp)}
            </span>
          </Prov>{" "}
          →{" "}
          <Prov info={llamalendBandEdgeProv("pDown", chain.borrowedSymbol, chain.borrowedIsCrvusd, chain.amm)}>
            <span title={chain.pDownRaw != null ? `${formatUnitsExact(chain.pDownRaw, 18)} (exact, 1e18)` : undefined}>
              {p(pDown)}
            </span>
          </Prov>
        </span>
        <span>
          · price{" "}
          <Prov
            info={llamalendOraclePriceProv(
              chain.collateralSymbol,
              chain.borrowedSymbol,
              chain.borrowedIsCrvusd,
              chain.amm,
            )}
          >
            <span
              title={
                chain.priceOracleRaw != null
                  ? `${formatUnitsExact(chain.priceOracleRaw, 18)} (price_oracle, 1e18)`
                  : undefined
              }
            >
              {p(price)}
            </span>
          </Prov>{" "}
          {chain.borrowedSymbol}
        </span>
      </div>
    </div>
  );
}
