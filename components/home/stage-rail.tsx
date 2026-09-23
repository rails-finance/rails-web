import Link from "next/link";
import { Box, History, Radio, CircleCheck, LayoutGrid } from "lucide-react";
import { launchedProductionChains } from "@/lib/shared/protocols";

/**
 * StageRail — the "What Rails Does" panel as a transit-style rail rather than a
 * bulleted list. The four data-pipeline bullets were unordered, equal claims;
 * here the structure carries the meaning: Ethereum / Base → (Historic events ∥
 * Live state) → Reconciled → On the page, in the order the data actually moves.
 *
 * The pipeline FORKS: two data paths run side by side (event history + current
 * chain state) and rejoin at the "Reconciled" step. The fork IS the
 * two-sources claim — flattened to a straight line it reads as just another
 * step. Copy constraint (rails-ops 0006): where the paths meet, the live path
 * SUPERSEDES the indexed one for current state; the Reconciled station's
 * "checked against live state" is the LIFETIME-flows gate (flowsReconcile —
 * a lifetime total that doesn't add up against current state is withheld),
 * not a claim that the two reads validate each other's current values. See
 * app/(site)/about/architecture/page.tsx.
 *
 * On lg the rail runs LEFT→RIGHT with the fork stacked vertically; on mobile it
 * is the same diagram rotated 90° clockwise — the rail runs TOP→BOTTOM and the
 * fork's two branch cards sit SIDE BY SIDE (Live state left, Historic events
 * right — the rotation carries the desktop upper card to the right). Both
 * layouts share one <ol> so the pipeline order reaches a screen reader.
 *
 * Server component — no state, no motion, static at rest. The connectors are
 * built from bordered CSS divs (not SVG: a fluid-width SVG needs
 * preserveAspectRatio="none", which distorts corner radii). The track is BLUE
 * (design decision 2026-07-20, matching the reference mock): the rail is the
 * one marketing surface where blue marks the data path itself, not just the
 * end-cap link. Station knockout reuses the SpineColumn halo trick: a 4px
 * var(--background) boxShadow punches a gap in the line where a node sits.
 */

// Shared line / border colour — the blue track, one hue both themes.
const LINE = "bg-blue-400 dark:bg-blue-500";
const BORDER = "border-blue-400 dark:border-blue-500";

// ── Desktop (lg) fork geometry ──
// The <ol>'s two rows are separated by a 24px gap (lg:gap-y-6 below), so a fork
// card's centre sits at (100% − 24px) / 4 — NOT at 25%. The connector overlay
// spans the same height with NO gap of its own, so its arms have to repeat that
// arithmetic or they enter each fork card 6px low. Keep GAP in step with the
// lg:gap-y-6 on the <ol>; the two are one measurement expressed twice.
const GAP = "24px";
const ROW_1 = `calc((100% - ${GAP}) / 4)`;
const ROW_2 = `calc(100% - (100% - ${GAP}) / 4)`;
// The vertical bar runs between the two elbows: each elbow is 10px tall, so the
// bar starts one elbow inside each arm.
const BAR_INSET = `calc((100% - ${GAP}) / 4 + 10px)`;

// Same seven-track template for the desktop grid AND its connector overlay, so
// the two align: content columns (1fr · 1.6fr fork · 1fr · 1fr) with fixed 40px
// connector columns between them.
const GRID_COLS = "lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1.6fr)_40px_minmax(0,1fr)_40px_minmax(0,1fr)]";

// ── Mobile fork geometry (the desktop fork rotated 90° CW) ──
// The two branch cards sit side by side in one grid row, so the split/merge that
// ran vertically on desktop now runs horizontally. A branch card's centre-x
// mirrors the desktop ROW_1/ROW_2 math: two equal columns with a 16px gutter,
// so a centre is (100% − gutter) / 4 in from its side. Keep MGAP in step with
// the gap-x-4 on the <ol>.
const MGAP = "16px";
const COL_1 = `calc((100% - ${MGAP}) / 4)`; // left branch card centre-x
const COL_2 = `calc(100% - (100% - ${MGAP}) / 4)`; // right branch card centre-x
const HBAR_INSET = `calc((100% - ${MGAP}) / 4 + 10px)`; // bar starts one elbow in from each side
// Mobile row template: content rows are auto (card height), with a fixed 40px
// connector row between each pair for the trunk / split / merge to live in.
const MOBILE_ROWS = "grid-rows-[auto_40px_auto_40px_auto_40px_auto]";

// A station node dot with the knockout halo — the line reads as passing THROUGH
// the node rather than being segmented at it.
function NodeDot({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute z-10 block h-2 w-2 rounded-full bg-blue-400 dark:bg-blue-500 ${className ?? ""}`}
      style={{ boxShadow: "0 0 0 4px var(--background)", ...style }}
    />
  );
}

function Station({
  icon: Icon,
  eyebrow,
  children,
  className,
  accent,
}: {
  icon: typeof Box;
  eyebrow: string;
  children: React.ReactNode;
  className?: string;
  /** The station the whole rail exists to reach: a blue border + soft blue
   *  glow (the reference mock's treatment), the same hue as the track that
   *  runs into it. */
  accent?: boolean;
}) {
  return (
    <li className={`relative ${className ?? ""}`}>
      {/* lg min-h = one measured floor for ALL five cards: the tallest copy
          (stations 1, 4 and 5, four lines in a 1fr column at the 1280 cap)
          runs to 156.5px, so 157 keeps every card the same height — the
          rhythm verify-stage-rail-polish.mjs asserts. Grow it if copy grows. */}
      <div
        className={`relative z-[1] flex h-full flex-col justify-center rounded-xl border bg-raised px-4 py-3 lg:min-h-[157px] ${
          accent
            ? "border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_0_28px_-2px_rgba(59,130,246,0.35)] dark:border-blue-500 dark:shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_0_32px_-2px_rgba(59,130,246,0.5)]"
            : "border-rb-200 dark:border-rb-800"
        }`}
      >
        <div className="mb-1 flex items-center gap-2">
          {/* The accent station's check is BLUE (the mock's treatment) — the
              track's colour arriving at the station it exists to reach. */}
          <Icon
            className={`h-[18px] w-[18px] shrink-0 ${accent ? "text-blue-500 dark:text-blue-400" : "text-foreground"}`}
            aria-hidden="true"
          />
          <p className="text-[15px] font-semibold text-foreground">{eyebrow}</p>
        </div>
        <p className="body-text">{children}</p>
      </div>
    </li>
  );
}

export function StageRail() {
  return (
    <div className="mt-10">
      {/* The overlay is absolute inset-0 against THIS wrapper, so the wrapper
          must contain the <ol> and NOTHING else — the footer claim below used to
          live inside it, which stretched the overlay ~76px taller than the rail
          and dropped every connector below the cards it joins. */}
      <div className="relative">
        {/* ═══ DESKTOP connector overlay (lg+) — decorative. Mirrors the grid
          template so connectors land in the reserved 40px columns. grid-rows-2
          over the full height gives each row-spanning connector the fork
          column's height, so the ROW_1 / ROW_2 arms enter the two stacked fork
          cards. ═══ */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 hidden ${GRID_COLS} grid-rows-2 lg:grid`}
        >
          {/* SPLIT (col 2): trunk in from the chain, forks up + down to the two
              fork cards. */}
          <div className="relative col-start-2 row-span-2">
            {/* incoming trunk — horizontal at centre, left edge → fork axis */}
            <div className={`absolute left-0 right-1/2 top-1/2 h-px -translate-y-1/2 ${LINE}`} />
            {/* vertical bar between the two elbows */}
            <div
              className={`absolute left-1/2 w-px -translate-x-1/2 ${LINE}`}
              style={{ top: BAR_INSET, bottom: BAR_INSET }}
            />
            {/* upper elbow: down → right, rounded */}
            <div
              className={`absolute left-1/2 h-[10px] w-[10px] rounded-tl-[10px] border-l border-t ${BORDER}`}
              style={{ top: ROW_1 }}
            />
            {/* lower elbow: up → right, rounded */}
            <div
              className={`absolute left-1/2 h-[10px] w-[10px] -translate-y-full rounded-bl-[10px] border-b border-l ${BORDER}`}
              style={{ top: ROW_2 }}
            />
            {/* upper + lower arms — horizontal into each fork card */}
            <div
              className={`absolute left-[calc(50%+10px)] right-0 h-px -translate-y-1/2 ${LINE}`}
              style={{ top: ROW_1 }}
            />
            <div
              className={`absolute left-[calc(50%+10px)] right-0 h-px -translate-y-1/2 ${LINE}`}
              style={{ top: ROW_2 }}
            />
            {/* Station dots sit where a line ENTERS a station — on each fork
                card's left border, matching the merge/straight columns' dots on
                the reconciled and frontend cards. The chain end carries none:
                it is the origin, not a stop. */}
            <NodeDot className="right-0 -translate-y-1/2 translate-x-1/2" style={{ top: ROW_1 }} />
            <NodeDot className="right-0 -translate-y-1/2 translate-x-1/2" style={{ top: ROW_2 }} />
          </div>

          {/* MERGE (col 4): two arms in from the fork cards, rejoin, trunk out to
              the reconciled station. */}
          <div className="relative col-start-4 row-span-2">
            <div
              className={`absolute left-0 right-[calc(50%+10px)] h-px -translate-y-1/2 ${LINE}`}
              style={{ top: ROW_1 }}
            />
            <div
              className={`absolute left-0 right-[calc(50%+10px)] h-px -translate-y-1/2 ${LINE}`}
              style={{ top: ROW_2 }}
            />
            <div
              className={`absolute right-1/2 w-px translate-x-1/2 ${LINE}`}
              style={{ top: BAR_INSET, bottom: BAR_INSET }}
            />
            {/* upper elbow: from left → down, rounded top-right */}
            <div
              className={`absolute right-1/2 h-[10px] w-[10px] rounded-tr-[10px] border-r border-t ${BORDER}`}
              style={{ top: ROW_1 }}
            />
            {/* lower elbow: up → from left, rounded bottom-right */}
            <div
              className={`absolute right-1/2 h-[10px] w-[10px] -translate-y-full rounded-br-[10px] border-b border-r ${BORDER}`}
              style={{ top: ROW_2 }}
            />
            {/* outgoing trunk — horizontal at centre, fork axis → right edge */}
            <div className={`absolute left-1/2 right-0 top-1/2 h-px -translate-y-1/2 ${LINE}`} />
            <NodeDot className="right-0 top-1/2 translate-x-1/2 -translate-y-1/2" />
          </div>

          {/* STRAIGHT (col 6): reconciled → page. */}
          <div className="relative col-start-6 row-span-2">
            <div className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${LINE}`} />
            <NodeDot className="right-0 top-1/2 translate-x-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* ═══ The stages — a real <ol> so the pipeline order reaches a screen
          reader, whichever layout is showing. On mobile a two-column grid with
          the fork side by side (the rail rotated 90° CW); on lg the seven-track
          grid with the two fork cards stacked in the fork column. ═══ */}
        <ol
          className={`grid grid-cols-2 ${MOBILE_ROWS} gap-x-4 lg:grid ${GRID_COLS} lg:grid-rows-2 lg:auto-rows-fr lg:gap-x-0 lg:gap-y-6`}
        >
          <Station
            icon={Box}
            // The chains the pipeline reads FOR THIS SITE — the launched ones,
            // so the first station names what the rest of the page offers.
            eyebrow={launchedProductionChains()
              .map((c) => c.name)
              .join(" / ")}
            className="col-span-2 row-start-1 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:self-center"
          >
            DeFi protocols run here as public contracts. Every deposit, loan and repayment is on the record.
          </Station>

          {/* DOM order keeps the pipeline reading (indexed → live); on mobile the
              grid places live LEFT and indexed RIGHT to match the rotation, on lg
              indexed is the upper fork card. */}
          <Station
            icon={History}
            eyebrow="Historic events"
            className="col-start-2 row-start-3 lg:col-start-3 lg:row-start-1"
          >
            Rails reads every event in order and explains each in plain English.
          </Station>

          <Station icon={Radio} eyebrow="Live state" className="col-start-1 row-start-3 lg:col-start-3 lg:row-start-2">
            Rails asks those same contracts what the position holds and owes today.
          </Station>

          <Station
            icon={CircleCheck}
            eyebrow="Reconciled"
            accent
            className="col-span-2 row-start-5 lg:col-span-1 lg:col-start-5 lg:row-start-1 lg:row-span-2 lg:self-center"
          >
            Lifetime totals are checked against live state. Anything that doesn&rsquo;t reconcile is left out rather
            than guessed.
          </Station>

          <Station
            icon={LayoutGrid}
            eyebrow="On the page"
            className="col-span-2 row-start-7 lg:col-span-1 lg:col-start-7 lg:row-start-1 lg:row-span-2 lg:self-center"
          >
            Every figure shows its source, so you can check it on a block explorer that isn&rsquo;t ours.
          </Station>

          {/* ── MOBILE connector cells (below lg). Decorative <li>s that live in
              the fixed 40px rows between the cards; hidden on lg, where the
              desktop overlay above draws the rail instead. Each is the matching
              desktop piece rotated 90° CW. ── */}
          {/* SPLIT: trunk down from the chain, forks left + right to the two
              branch cards. */}
          <li aria-hidden="true" className="relative col-span-2 row-start-2 lg:hidden">
            {/* incoming trunk — vertical at centre, top edge → split bar */}
            <div className={`absolute left-1/2 top-0 bottom-1/2 w-px -translate-x-1/2 ${LINE}`} />
            {/* horizontal bar between the two elbows */}
            <div
              className={`absolute top-1/2 h-px -translate-y-1/2 ${LINE}`}
              style={{ left: HBAR_INSET, right: HBAR_INSET }}
            />
            {/* left elbow: bar → down, rounded top-left */}
            <div
              className={`absolute top-1/2 h-[10px] w-[10px] rounded-tl-[10px] border-l border-t ${BORDER}`}
              style={{ left: COL_1 }}
            />
            {/* right elbow: bar → down, rounded top-right */}
            <div
              className={`absolute top-1/2 h-[10px] w-[10px] -translate-x-full rounded-tr-[10px] border-r border-t ${BORDER}`}
              style={{ left: COL_2 }}
            />
            {/* arms — vertical down into each branch card */}
            <div className={`absolute top-[calc(50%+10px)] bottom-0 w-px ${LINE}`} style={{ left: COL_1 }} />
            <div
              className={`absolute top-[calc(50%+10px)] bottom-0 w-px -translate-x-full ${LINE}`}
              style={{ left: COL_2 }}
            />
            {/* dots where each arm enters a branch card's top border */}
            <NodeDot className="bottom-0 -translate-x-1/2 translate-y-1/2" style={{ left: COL_1 }} />
            <NodeDot className="bottom-0 -translate-x-1/2 translate-y-1/2" style={{ left: COL_2 }} />
          </li>

          {/* MERGE: two arms in from the branch cards, rejoin, trunk down into
              the reconciled station. */}
          <li aria-hidden="true" className="relative col-span-2 row-start-4 lg:hidden">
            {/* arms — vertical down from each branch card */}
            <div className={`absolute top-0 bottom-[calc(50%+10px)] w-px ${LINE}`} style={{ left: COL_1 }} />
            <div
              className={`absolute top-0 bottom-[calc(50%+10px)] w-px -translate-x-full ${LINE}`}
              style={{ left: COL_2 }}
            />
            {/* left elbow: down → right, rounded bottom-left */}
            <div
              className={`absolute bottom-1/2 h-[10px] w-[10px] rounded-bl-[10px] border-b border-l ${BORDER}`}
              style={{ left: COL_1 }}
            />
            {/* right elbow: down → left, rounded bottom-right */}
            <div
              className={`absolute bottom-1/2 h-[10px] w-[10px] -translate-x-full rounded-br-[10px] border-b border-r ${BORDER}`}
              style={{ left: COL_2 }}
            />
            {/* horizontal bar between the two elbows */}
            <div
              className={`absolute top-1/2 h-px -translate-y-1/2 ${LINE}`}
              style={{ left: HBAR_INSET, right: HBAR_INSET }}
            />
            {/* outgoing trunk — vertical at centre, bar → bottom edge */}
            <div className={`absolute left-1/2 top-1/2 bottom-0 w-px -translate-x-1/2 ${LINE}`} />
            <NodeDot className="bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
          </li>

          {/* STRAIGHT: reconciled → page. */}
          <li aria-hidden="true" className="relative col-span-2 row-start-6 lg:hidden">
            <div className={`absolute left-1/2 inset-y-0 w-px -translate-x-1/2 ${LINE}`} />
            <NodeDot className="bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
          </li>
        </ol>
      </div>

      {/* ═══ End-cap — the way in to the architecture, not a stop on the line.
          The read-only claim that used to sit here is made on the coverage pages,
          /about/architecture, the hero terms and StructuredData, so dropping
          it costs the site nothing. ═══ */}
      <div className="mt-8 flex flex-col items-center gap-1 text-center">
        <Link
          href="/about/architecture"
          className="text-sm font-medium text-blue-500 transition-colors hover:underline"
        >
          Read the technical architecture&nbsp;→
        </Link>
      </div>
    </div>
  );
}
