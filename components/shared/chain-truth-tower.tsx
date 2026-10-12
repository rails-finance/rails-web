"use client";

// <ChainTruthTower> — the shared economics section for the chain-state tier
// (MakerDAO, Morpho, Spark). It renders the one faithful artifact a borrow
// position has: its debt split into PRINCIPAL vs ACCRUED INTEREST/FEE, beside the
// collateral backing it. Each protocol feeds the same normalized
// ChainTruthTowerData (lib/shared/chain-truth-economics) via its own settle logic.
//
// Both bar modes go through the SAME DualTowerChart primitive the reference
// towers (Liquity, Aave) use — centred bars flanked by breakdown tables — so the
// chain-state tier matches the gold-standard layout. What differs is the scale:
//   • valued (Maker, has the OSM price) → USD, ONE shared scale across both
//     towers, so collateral and debt heights are directly comparable.
//   • token (Morpho, amounts-only) → each tower normalised to its OWN base, so a
//     small-magnitude collateral (0.1 BTC) doesn't vanish beside a 6k USDC debt.
//     Heights are NOT comparable across the two — different units.
//
// Lifetime flows are the DEFAULT view (matching the reference towers — Liquity's
// trove economics, Aave V4): the gross history a side can show FAITHFULLY —
// hatched reverse-diagonal for voluntary exits (withdrawn / repaid),
// forward-diagonal for liquidated, and a faded side bar for the all-time inflow —
// with a "Hide inactive / repaid" Display toggle back to the clean current-state
// principal/interest split. A feeder only populates flows that
// reconcile with the chain (flowsReconcile; e.g. Maker's debt-side DAI history needs a
// per-block rate it doesn't capture, so it leaves them empty). When NEITHER side
// carries flows, the toggle is replaced by an explicit "no lifetime flows" note
// (data.flowsNote or a generic default) — a missing control is never left
// unexplained.
//
// When there is neither a price NOR a same-token interest split to show (Spark:
// multi-reserve, amounts-only, no current-with-interest read), comparative bars
// across different tokens would imply a magnitude relationship that doesn't
// exist — so the gated path renders a principal list + an explicit note instead.
//
// A stability-pool deposit draws on the same tower (rails-ops decision 0022):
// the eventless gap between a side's last event and its state read may sit on
// either side and may take away (`eventlessGains` / `eventlessLosses`), and a
// side holding several tokens draws one bar per token (`bars`). All three are
// opt-in; a feeder that sets none renders as before.

import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { CTRL_GHOST, CTRL_OFF, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  COLLAPSE_KEY_ATTR,
  COLLAPSED_ATTR,
  collapseScript,
  flowsCollapseKeyForPathname,
  isFlowsCollapsed,
  setFlowsCollapsed,
} from "@/lib/shared/flows-collapse-store";
import { NotLoaded } from "@/components/shared/not-loaded";
import { leftOutTitle } from "@/lib/shared/decimals-unread";
import { type ChainTruthTowerData, type TowerSideData } from "@/lib/shared/chain-truth-economics";
// The bars, the flank tables and the Display menu live in flows-ledger.tsx,
// which the Lifetime flows panel shares (rails-ops TO-DO-ui-jobs §206).
import {
  ChainTruthTowerChart,
  GatedEconomics,
  TowerDisplayControls,
  groupSide,
  hasLifetime,
  sideCanGroup,
  sideMonoSymbol,
  sideParts,
} from "@/components/shared/flows-ledger";

export interface ChainTruthTowerProps {
  data: ChainTruthTowerData;
  /** Section eyebrow — defaults to "Lifetime flows". */
  title?: string;
  /** The Explanation pane under the tower — the V2/V4 grammar where the chart
   *  narrates its own figures (a status lead + bullets built from the same
   *  data the bars draw, see `<proto>EconomicsExplanation` beside each
   *  `compute*Economics`). Omit and the foot renders no Explanation. */
  explanation?: ReactNode;
  /** The tower's "?" FAQ — rendered at the foot of the Explanation pane. */
  learnMore?: LearnMoreContent | null;
  /** Inline content riding the heading-button row (the V2 trove tower's
   *  right-aligned redemption net-outcome strip). Same slot the position
   *  card's context line uses. */
  rowExtra?: ReactNode;
  /** PUT THIS TOWER AWAY, AND REMEMBER IT PER PROTOCOL (ui-jobs 61, widened by
   *  63, made one control by 65). Given a protocol's roster id, the whole
   *  header row becomes one button: icon and heading at its left, a chevron
   *  at its right, no second interactive element. It collapses the panel to
   *  its own header row, and the state is stored under that id, so every
   *  position page in the protocol opens the way the reader left the last one
   *  (lib/shared/flows-collapse-store.ts).
   *
   *  LEAVE IT OFF AND THE ROUTE ANSWERS. Every position and trove page sits
   *  inside an explorer, so `flowsCollapseKeyForPathname` reads the id off the
   *  pathname and the two dozen call sites need say nothing. 61 shipped this as
   *  an opt-in prop that only the vault timelines passed, which put the chevron
   *  on the vault timelines and on no borrow position at all.
   *
   *  PASS NULL TO OPT OUT: a surface that belongs to no protocol but draws on a
   *  protocol's route, or one whose tower is inert. The home page's live
   *  example frame does. Its route resolves to no explorer anyway, and saying
   *  so keeps the frame from picking a key up if it ever moves. */
  collapseKey?: string | null;
}

export function ChainTruthTower({
  data,
  title = "Lifetime flows",
  explanation,
  learnMore,
  rowExtra,
  collapseKey: collapseKeyProp,
}: ChainTruthTowerProps) {
  // The route's key unless the caller states one (including a stated null).
  const pathname = usePathname();
  const collapseKey = collapseKeyProp !== undefined ? collapseKeyProp : flowsCollapseKeyForPathname(pathname);
  // Lifetime-first, matching the reference towers: the all-time flows render by
  // default, and the Display menu's "Hide inactive / repaid" collapses to the
  // current-state principal/interest split.
  const [hideHistorical, setHideHistorical] = useState(false);
  // null = follow the auto-default (group whenever anything can merge); a
  // "Group assets" toggle pins the reader's choice (the Aave V4 default).
  const [groupOverride, setGroupOverride] = useState<boolean | null>(null);
  // Collapsed, per protocol (ui-jobs 61). `settled` is false until the effect
  // below has read the store, and while it is false React writes NO collapsed
  // attribute: the server cannot know the answer, so the pre-paint script owns
  // the attribute for those first frames and React takes it over afterwards.
  // Rendering "0" from the server and letting the script overwrite it would put
  // the two in a fight that hydration could win.
  const [collapsed, setCollapsed] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!collapseKey) return;
    setCollapsed(isFlowsCollapsed(collapseKey));
    setSettled(true);
  }, [collapseKey]);
  // A tree-position id (bare useId()) can drift between the server and the
  // browser when a sibling elsewhere on the page mounts client-only (an
  // export menu's dynamic(ssr:false) import, say): its absence during SSR
  // shifts everything rendered after it. collapseKey is a plain string
  // (the route's protocol id), identical on both renders, so it anchors the
  // id instead. useId still backs the rare case with no collapseKey — where
  // the id names nothing else, so tree drift there has no aria-controls to
  // break.
  const reactId = useId();
  const bodyId = collapseKey ? `flows-body-${collapseKey}` : reactId;
  const registry = useReceiptRegistry();
  const holds = (s: TowerSideData) =>
    s.current.some((l) => l.amount > 0) || (s.eventlessGains ?? []).some((l) => l.amount > 0);
  const hasDebt = sideParts(data.debt).some(holds) || (data.debt.interest?.amount ?? 0) > 0;
  const hasColl = sideParts(data.collateral).some(holds);

  // Bars only render where they can't mislead: USD-stacked (valued), a
  // same-token principal/interest split, or lifetime flows on sides that each
  // speak ONE token (token-mode stories — every side stacks in its own unit).
  // Otherwise the gated list is shown.
  const showBars =
    data.valued ||
    (data.debt.interest?.amount ?? 0) > 0 ||
    (hasLifetime(data) && sideMonoSymbol(data.collateral) && sideMonoSymbol(data.debt));
  const lifetimeAvailable = showBars && hasLifetime(data);
  // A terminal life (nothing current on either side) still renders when its
  // lifetime story is drawable — once a position closes, the flows ARE the
  // story. Without drawable flows there is nothing to show; feeders that never
  // populate flows are unaffected.
  // A token left out because its decimals did not load is stated, even where
  // it leaves nothing else to draw.
  const leftOut = data.notLoaded ?? [];
  const drawable = hasDebt || hasColl || lifetimeAvailable;
  if (!drawable && leftOut.length === 0) return null;
  const canGroup = showBars && (sideCanGroup(data.collateral, data.valued) || sideCanGroup(data.debt, data.valued));
  const grouped = canGroup && (groupOverride ?? true);
  const chartData: ChainTruthTowerData = grouped
    ? { ...data, collateral: groupSide(data.collateral, data.valued), debt: groupSide(data.debt, data.valued) }
    : data;

  return (
    // The tower is its own receipts scope: every traced line — breakdown rows,
    // the gated reserve lists — registers here, for the page-level inspector.
    <ProvReceiptsScope registry={registry}>
      <section
        // Padding matches the position card's px-5 py-4 (the V2 trove
        // compaction), so the stacked panels read as one family.
        // data-skel-section feeds the skeleton memory layer (skeleton-size-recorder).
        data-skel-section="detail-economics"
        {...(collapseKey ? { [COLLAPSE_KEY_ATTR]: collapseKey } : {})}
        {...(collapseKey && settled ? { [COLLAPSED_ATTR]: collapsed ? "1" : "0" } : {})}
        suppressHydrationWarning
        className="rounded-2xl bg-raised px-5 py-4"
      >
        {/* Pre-paint: the stored state applied before the browser paints, so a
            tower the reader put away does not flash open on the way to
            hydration. Reads its key off this section — see
            lib/shared/flows-collapse-store.ts. */}
        {collapseKey && <script dangerouslySetInnerHTML={{ __html: collapseScript() }} suppressHydrationWarning />}
        {/* Toolbar row: title left, legend + Lifetime-flows control right. The
          chart below pulls up underneath it (-mt-7 matching the row's min-h),
          so the towers' empty top band shares this line — title left, controls
          right, towers centered. The row stays hit-testable above the chart
          (z-10) but only on its actual children, so tower-top tooltips still
          hover through the middle.

          COLLAPSIBLE (ui-jobs 61, made one control by 65): the whole row is
          the button that puts the panel away, icon and title at its left,
          the chevron riding at its right inside the same element, with no
          second interactive child. The Display control moved down onto the
          first row of the body under 63 and stays there, still right-aligned
          and still inside the towers' empty top band once the chart pulls up
          under it. */}
        <div className="pointer-events-none relative z-10 flex min-h-[28px] items-center justify-between gap-2">
          {collapseKey ? (
            <button
              type="button"
              onClick={() => {
                const next = !collapsed;
                setCollapsed(next);
                setSettled(true);
                setFlowsCollapsed(collapseKey, next);
              }}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
              className={`${CTRL_GHOST} ${CTRL_OFF} pointer-events-auto -mx-2 h-7 w-full min-w-0 rounded-md px-2`}
            >
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={`${SECTION_HEADING} truncate`}>{title}</span>
                </span>
                <ChevronDown size={16} className={collapsed ? "" : "rotate-180"} aria-hidden />
              </span>
            </button>
          ) : (
            <>
              <span className={`${SECTION_HEADING} pointer-events-auto min-w-0 text-rb-500`}>{title}</span>
              {/* No corner color key — the flank-table swatches are the one legend
                  (design-grammar rule; neither reference tower carries one). */}
              <div className="pointer-events-auto flex items-center gap-3">
                <TowerDisplayControls
                  lifetimeAvailable={lifetimeAvailable}
                  canGroup={canGroup}
                  grouped={grouped}
                  hideHistorical={hideHistorical}
                  showBars={showBars}
                  flowsNote={data.flowsNote}
                  onGroup={() => setGroupOverride((v) => !(v ?? true))}
                  onHideHistorical={() => setHideHistorical((v) => !v)}
                />
              </div>
            </>
          )}
        </div>
        <div id={bodyId} {...(collapseKey ? { "data-flows-body": "" } : {})}>
          <div id={`${bodyId}-ledger`}>
            {collapseKey && (
              <div className="pointer-events-none relative z-10 flex min-h-[28px] items-center justify-end gap-3">
                <div className="pointer-events-auto flex items-center gap-3">
                  <TowerDisplayControls
                    lifetimeAvailable={lifetimeAvailable}
                    canGroup={canGroup}
                    grouped={grouped}
                    hideHistorical={hideHistorical}
                    showBars={showBars}
                    flowsNote={data.flowsNote}
                    onGroup={() => setGroupOverride((v) => !(v ?? true))}
                    onHideHistorical={() => setHideHistorical((v) => !v)}
                  />
                </div>
              </div>
            )}
            {/* Bars pull up under the toolbar row; the gated reserve LIST keeps its
            own row (text would collide with the title). */}
            {drawable && (
              <div className={showBars ? "-mt-7" : "mt-3"}>
                {showBars ? (
                  <ChainTruthTowerChart data={chartData} hideHistorical={hideHistorical} />
                ) : (
                  <GatedEconomics data={data} />
                )}
              </div>
            )}
            {leftOut.length > 0 && (
              <p className="mt-3 text-[11px] leading-snug text-rb-400" data-not-loaded="">
                Leaves out {leftOut.map((t) => t.label).join(", ")}:{" "}
                <NotLoaded inline className="text-rb-500" title={leftOutTitle(leftOut)} />
              </p>
            )}
          </div>
          <ProvenanceInfoTabs
            className="mt-3"
            label={`${title} explanation`}
            explanation={explanation}
            learnMore={learnMore}
            rowExtra={rowExtra}
          />
        </div>
      </section>
    </ProvReceiptsScope>
  );
}
