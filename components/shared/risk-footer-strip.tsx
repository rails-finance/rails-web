"use client";

// The position card's risk footer — ONE wrapping horizontal line riding the
// heading-button row, the Liquity V2 reference grammar generalized for the
// shared-path explorers (design-grammar rule): label-led figure clusters in
// reading order, then compact meters, all right-aligned. Long compositions
// switch to a stacked column (each row still right-aligned) rather than
// wrapping between clusters — see the container-query note below.
//
// JSX-children API rather than a data-props one: every protocol's clusters
// are dense with bespoke <Prov> constructions that must move VERBATIM (flank
// targeting keys on receiptLabel|value|symbol, byte-exact), so the primitives
// only supply layout and typography.

import type { ReactNode } from "react";

/**
 * The strip itself — drop-in for a card's rowExtra / risk slot. Every child
 * is one sub-value item (a label-led cluster, a compact meter): right-aligned
 * always. A card's width depends on the sidebar, not only the viewport, so
 * every switch below reads the strip's OWN width via a container query
 * rather than a viewport breakpoint (`@container` on the outer wrapper).
 *
 * THREE states, not one — Miles found real desktop cards sitting in the
 * stacked column with room to spare (a wide trove card's strip was still
 * under the row threshold below, four rows down the right edge with a lot of
 * empty card to their left):
 *
 *   1. Narrow (< 560px of strip width): every item its own row, stacked,
 *      right-aligned — unchanged.
 *   2. Middle (560px – 1024px): a 2×2 grid, `grid-cols-[auto_auto]` — items
 *      pair up two-per-row in DOM order (Costs | Debt in front on row one,
 *      the two runways on row two, for Liquity V2), every cell right-aligned,
 *      columns sized to content (`justify-end` on the grid, not a stretched
 *      track). A pure CSS grid rather than a JS-chunked pairing, because a
 *      caller like `TroveDetailsBand` hands the strip ONE JSX child (the
 *      component) that only becomes two real DOM siblings once React renders
 *      its Fragment — `Children` utilities can't see through that, but a
 *      grid selector over the strip's actual rendered children can.
 *   3. Wide (≥ `@5xl`, 1024px): the single right-justified row — unchanged.
 *
 * 560px is a real measurement, not a guess at a named container size: two
 * RiskMeter runways (`w-64`, 256px each) at the row state's own gap-x-6
 * (1.5rem = 24px) need 256 + 24 + 256 = 536px to sit side by side without
 * wrapping, and the strip's own `pl-2` shaves 8px off whatever the container
 * reports — 560px clears that with a 24px margin. @3xl (768px) and @4xl
 * (896px), Tailwind 4's nearest named sizes, both sit well past what two
 * items actually need; every real strip measured for this job (Liquity V2,
 * Aave V3, Ebisu — 880px+ once a sidebar-less card clears 1024px viewport
 * width) clears 560px long before it clears the row threshold, so the 2×2
 * state gets real room to live in rather than being squeezed to a sliver.
 *
 * A strip with fewer than four items (most non-Liquity cards carry one or
 * two runways, no label band) must not gain an odd empty grid cell: with
 * `grid-template-columns: auto auto`, a column nothing ever occupies sizes
 * to zero, so a lone item still hugs the right edge exactly as it does
 * stacked, and two items form one row — no visible change for either case.
 * An ODD total (an uncommon shape, e.g. a fork trove with no redemption
 * runway showing three items) would otherwise strand its trailing item under
 * the left column with dead space to its right; `nth-child(odd):last-child`
 * pushes that lone trailing item into the right column instead, so every row
 * — full or not — still hugs the strip's right edge.
 */
export function RiskFooterStrip({ children }: { children: ReactNode }) {
  return (
    <div className="@container min-w-0 flex-1 pl-2">
      <div className="flex flex-col items-end gap-2 @min-[560px]:grid @min-[560px]:grid-cols-[auto_auto] @min-[560px]:items-center @min-[560px]:justify-end @min-[560px]:gap-x-6 @min-[560px]:gap-y-1 @min-[560px]:[&>*:nth-child(odd):last-child]:col-start-2 @5xl:flex @5xl:flex-row @5xl:flex-wrap @5xl:items-center @5xl:justify-end @5xl:gap-x-6 @5xl:gap-y-1">
        {children}
      </div>
    </div>
  );
}

/** One label-led figure cluster: "Borrow capacity: 61.2% of the liquidation
 *  line". Third person; the strongest value inside keeps the reference's
 *  `text-foreground/80 font-semibold` treatment (callers author it around
 *  their own <Prov> spans). `caution` renders the whole cluster in the
 *  caution tone for warning states (recovery mode, branch shutdown). */
export function RiskFigure({
  label,
  caution,
  children,
}: {
  label?: ReactNode;
  caution?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`text-right text-xs tabular-nums leading-relaxed ${
        caution ? "font-semibold text-caution-600 dark:text-caution-400" : "text-rb-500"
      }`}
    >
      {label != null && <>{label}: </>}
      {children}
    </div>
  );
}

/** The strongest value of a cluster — the reference's semibold foreground
 *  treatment. Wrap OUTSIDE or INSIDE an existing <Prov> without touching the
 *  Prov's own children when the receipt already styles them. */
export function RiskStrong({ children }: { children: ReactNode }) {
  return <span className="text-foreground/80 font-semibold">{children}</span>;
}

/** A compact meter slot (runway bars) — fixed width, right-anchored, wraps as
 *  its own unit. */
export function RiskMeter({ children }: { children: ReactNode }) {
  return <div className="w-64 max-w-full">{children}</div>;
}
