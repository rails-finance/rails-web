"use client";

// <LifetimeFlowsPanel> — the Lifetime flows panel on a position page that has a
// date scrubber (rails-ops reference/lifetime-flows-scrubber.md): the header
// that collapses the panel, the scrubber, and the Explanation. The face carries
// figures, bars, chart, controls and the axis caption ("USD at each day's
// close", beside the (i)); everything that explains or totals is in the
// Explanation (TO-DO-ui-jobs §251): the protocol's bullets, the Lifetime
// totals the scrubber reports with any outcome bullet, the Chart bullets and
// the Key. Until the scrubber's timeline lands the panel says it is reading;
// where that read fails, that it was not read.
//
// Mounted by the position views directly, with no <ChainTruthTower>, so the
// towers can be removed without removing the scrubber (rails-ops
// TO-DO-ui-jobs §206).

import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { DiscChevron } from "@/components/shared/expand-chevron";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";
import { FlowsKey, FlowsKeyContext, type FlowsKeyItems } from "@/components/shared/lifetime-flows-scrubber";
import { FlowsTotalsBullets } from "@/components/shared/lifetime-flows-busy";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { LifetimeFlowsSkeleton } from "@/components/shared/lifetime-flows-skeleton";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";
import { FLOWS_SCOPE, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { useFlowFocusState } from "@/components/shared/flow-focus-context";
import { LearnMoreModal, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { lifetimeFlowsReadingContent } from "@/lib/shared/learn-more-content";
import { CARD_PAD_X, CTRL_GHOST, CTRL_OFF, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  COLLAPSE_KEY_ATTR,
  COLLAPSED_ATTR,
  collapseScript,
  flowsCollapseKeyForPathname,
  isFlowsCollapsed,
  setFlowsCollapsed,
} from "@/lib/shared/flows-collapse-store";

/** Where the scrubber's timeline read stands. */
export type FlowsRead = "reading" | "failed" | "done";

export interface LifetimeFlowsPanelProps {
  /** `<LifetimeFlowsScrubber>`, or null while its timeline is not in hand. */
  scrubber: ReactNode | null;
  /** The timeline read. Done with no scrubber: nothing to draw, and the panel
   *  renders nothing. */
  read: FlowsRead;
  /** The Explanation's prose; the scrubber's Key follows it. */
  explanation?: ReactNode;
  /** The "?" FAQ at the foot of the Explanation. */
  learnMore?: LearnMoreContent | null;
  /** Section heading. */
  title?: string;
  /** The collapse store's id; the route's explorer by default, null for none
   *  (lib/shared/flows-collapse-store.ts). */
  collapseKey?: string | null;
  /** Bullets (`<li>`) the Explanation's Totals carry after the throughput: a
   *  Liquity Trove's redemption outcome, a Polaris CDP's PSM outcome. The
   *  panel's face keeps figures, bars, chart, controls and the axis caption
   *  (rails-ops TO-DO-ui-jobs §251). */
  outcome?: ReactNode;
}

const FLOWS_ANATOMY = { explanation: "F8", learnMore: "F9" };
const READING = lifetimeFlowsReadingContent();

/** The ⋮ at the header's right end (ui-jobs 295): How to read these charts,
 *  one text on every explorer (§264), in the modal the "?" opened; then "Show
 *  provenance", which arms the inspector on this panel alone (ui-jobs 284). */
function FlowsMenu({ title, flowsKey }: { title: string; flowsKey: FlowsKeyItems | null }) {
  const [reading, setReading] = useState(false);
  return (
    <>
      <ToolsMenu
        variant="panel"
        label={`${title} menu`}
        heading={title}
        provScope={{ id: FLOWS_SCOPE, hint: "Click a value in this panel to trace it" }}
      >
        {(close) => (
          <ToolsMenuItem
            item="how-to-read"
            icon={<CircleHelp size={16} />}
            title={READING.title}
            subtitle="The bars, the line and the controls"
            onClick={() => {
              close();
              setReading(true);
            }}
          />
        )}
      </ToolsMenu>
      {reading && (
        <LearnMoreModal
          content={READING}
          onClose={() => setReading(false)}
          anatomy="F16"
          // This position's key under the shared text; none while the chart has not drawn.
          extra={flowsKey ? <FlowsKey {...flowsKey} /> : undefined}
        />
      )}
    </>
  );
}

export function LifetimeFlowsPanel({
  scrubber,
  read,
  explanation,
  learnMore,
  title = "Lifetime flows",
  collapseKey: collapseKeyProp,
  outcome,
}: LifetimeFlowsPanelProps) {
  const pathname = usePathname();
  const collapseKey = collapseKeyProp !== undefined ? collapseKeyProp : flowsCollapseKeyForPathname(pathname);
  // The scrubber's Key, drawn inside the Explanation.
  const [flowsKey, setFlowsKey] = useState<FlowsKeyItems | null>(null);
  // Collapsed, per protocol. No collapsed attribute is written until the
  // store has been read: the pre-paint script owns it for the first frames.
  const [collapsed, setCollapsed] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!collapseKey) return;
    setCollapsed(isFlowsCollapsed(collapseKey));
    setSettled(true);
  }, [collapseKey]);
  // collapseKey anchors the id so it matches between server and browser.
  const reactId = useId();
  const bodyId = collapseKey ? `flows-body-${collapseKey}` : reactId;
  const registry = useReceiptRegistry();
  // A card's "View on chart" opens a collapsed panel.
  const move = useFlowFocusState((s) => s.move?.n ?? 0);
  useEffect(() => {
    if (move === 0 || !collapseKey || !isFlowsCollapsed(collapseKey)) return;
    setFlowsCollapsed(collapseKey, false);
    setCollapsed(false);
    setSettled(true);
  }, [move, collapseKey]);
  // The (i) open, or the history still loading: the height is not the one a
  // return visit should reserve (TO-DO-ui-jobs §266).
  const [infoOpen, setInfoOpen] = useState(false);
  const { remembered } = useSkeletonSizes();
  if (scrubber == null && read === "done") return null;
  const loading = scrubber == null && read !== "failed";

  return (
    // Its own receipts scope: every traced figure in the panel registers here.
    <ProvReceiptsScope registry={registry} scopeId={FLOWS_SCOPE}>
      <section
        data-prov-scope={FLOWS_SCOPE}
        data-skel-section="detail-economics"
        {...(loading || infoOpen ? { "data-skel-pause": "" } : {})}
        data-lifetime-flows-panel=""
        data-anatomy="P2"
        {...(collapseKey ? { [COLLAPSE_KEY_ATTR]: collapseKey } : {})}
        {...(collapseKey && settled ? { [COLLAPSED_ATTR]: collapsed ? "1" : "0" } : {})}
        suppressHydrationWarning
        className={`rounded-2xl bg-raised ${CARD_PAD_X} py-4`}
        style={loading && remembered["detail-economics"] ? { minHeight: remembered["detail-economics"] } : undefined}
      >
        {collapseKey && <script dangerouslySetInnerHTML={{ __html: collapseScript() }} suppressHydrationWarning />}
        {/* The chevron follows the heading; the ⋮ stands at the right end
            (ui-jobs 295). */}
        <div
          className="disc-row pointer-events-none relative z-10 flex min-h-[28px] items-center justify-between gap-2"
          data-anatomy="F1"
        >
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
              className={`${CTRL_GHOST} ${CTRL_OFF} pointer-events-auto -ml-2 h-7 min-w-0 flex-1 justify-start rounded-md px-2`}
              data-flows-toggle=""
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`${SECTION_HEADING} truncate`} data-flows-title="">
                  {title}
                </span>
                <DiscChevron isOpen={!collapsed} />
              </span>
            </button>
          ) : (
            <span className={`${SECTION_HEADING} pointer-events-auto min-w-0 text-rb-500`}>{title}</span>
          )}
          <div className="pointer-events-auto -mr-1 shrink-0">
            <FlowsMenu title={title} flowsKey={flowsKey} />
          </div>
        </div>
        <div id={bodyId} {...(collapseKey ? { "data-flows-body": "" } : {})}>
          {scrubber != null ? (
            <FlowsKeyContext.Provider value={setFlowsKey}>
              <div className="mt-2">{scrubber}</div>
            </FlowsKeyContext.Provider>
          ) : read === "failed" ? (
            <p
              className="mt-2 flex h-24 items-center justify-center rounded-md bg-sunken px-3 text-center text-xs text-rb-500"
              data-flows-read={read}
            >
              The flow history was not read. Reload to try again.
            </p>
          ) : (
            <div data-flows-read={read}>
              <p className="sr-only" role="status">
                Reading the flow history…
              </p>
              <LifetimeFlowsSkeleton />
            </div>
          )}
          <ProvenanceInfoTabs
            className="mt-3"
            explanation={
              explanation == null && !outcome && !flowsKey ? undefined : (
                <>
                  {explanation}
                  {(flowsKey?.totals || outcome) && (
                    <ExplainGroup title="Lifetime totals" data-flow-totals="">
                      {flowsKey?.totals && <FlowsTotalsBullets t={flowsKey.totals} />}
                      {outcome}
                    </ExplainGroup>
                  )}
                  {scrubber != null && flowsKey && (
                    <>
                      {(flowsKey.basis || (flowsKey.chart && flowsKey.chart.length > 0)) && (
                        <ExplainGroup title="Chart" data-flow-chart-words="">
                          {flowsKey.basis && <ExplainBullet data-flow-basis="">{flowsKey.basis}</ExplainBullet>}
                          {flowsKey.chart?.map((t) => (
                            <ExplainBullet key={t}>{t}</ExplainBullet>
                          ))}
                        </ExplainGroup>
                      )}
                    </>
                  )}
                </>
              )
            }
            learnMore={learnMore}
            anatomy={FLOWS_ANATOMY}
            label={`${title} explanation`}
            onExplanationToggle={setInfoOpen}
          />
        </div>
      </section>
    </ProvReceiptsScope>
  );
}
