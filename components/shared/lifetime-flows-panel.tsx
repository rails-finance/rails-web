"use client";

// <LifetimeFlowsPanel> — the Lifetime flows panel on a position page that has a
// date scrubber (rails-ops reference/lifetime-flows-scrubber.md): the header
// that collapses the panel, the scrubber, and the Explanation with the
// scrubber's Key after its prose. The scrubber reports the Key's hatches where
// it draws them, and a line each for the Key and the Explanation on which of
// its two views (the bars, Lifetime) is which. Until the scrubber's timeline
// lands the panel says it is reading; where that read fails, that it was not
// read.
//
// Mounted by the position views directly, with no <ChainTruthTower>, so the
// towers can be removed without removing the scrubber (rails-ops
// TO-DO-ui-jobs §206).

import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChartBarBig, ChevronDown } from "lucide-react";
import { FlowsKey, FlowsKeyContext, type FlowsKeyItems } from "@/components/shared/lifetime-flows-scrubber";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { CTRL_GHOST, CTRL_OFF, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
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
}

export function LifetimeFlowsPanel({
  scrubber,
  read,
  explanation,
  learnMore,
  title = "Lifetime flows",
  collapseKey: collapseKeyProp,
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
  if (scrubber == null && read === "done") return null;

  return (
    // Its own receipts scope: every traced figure in the panel registers here.
    <ProvReceiptsScope registry={registry}>
      <section
        data-skel-section="detail-economics"
        {...(collapseKey ? { [COLLAPSE_KEY_ATTR]: collapseKey } : {})}
        {...(collapseKey && settled ? { [COLLAPSED_ATTR]: collapsed ? "1" : "0" } : {})}
        suppressHydrationWarning
        className="rounded-2xl bg-raised px-5 py-4"
      >
        {collapseKey && <script dangerouslySetInnerHTML={{ __html: collapseScript() }} suppressHydrationWarning />}
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
                  <ChartBarBig size={14} aria-hidden />
                  <span className={`${OVERLAY_HEADING} truncate`}>{title}</span>
                </span>
                <ChevronDown size={16} className={collapsed ? "" : "rotate-180"} aria-hidden />
              </span>
            </button>
          ) : (
            <span className={`${OVERLAY_HEADING} pointer-events-auto min-w-0 text-rb-500`}>{title}</span>
          )}
        </div>
        <div id={bodyId} {...(collapseKey ? { "data-flows-body": "" } : {})}>
          {scrubber != null ? (
            <FlowsKeyContext.Provider value={setFlowsKey}>
              <div className="mt-2">{scrubber}</div>
            </FlowsKeyContext.Provider>
          ) : (
            <p
              className="mt-2 flex h-24 items-center justify-center rounded-md bg-sunken px-3 text-center text-xs text-rb-500"
              data-flows-read={read}
            >
              {read === "failed" ? "The flow history was not read. Reload to try again." : "Reading the flow history…"}
            </p>
          )}
          <ProvenanceInfoTabs
            className="mt-3"
            explanation={
              scrubber != null && flowsKey ? (
                <>
                  {explanation}
                  {flowsKey.explain && (
                    <p className="mt-2 first:mt-0" data-flow-views-explain="">
                      {flowsKey.explain}
                    </p>
                  )}
                  <FlowsKey {...flowsKey} />
                </>
              ) : (
                explanation
              )
            }
            learnMore={learnMore}
          />
        </div>
      </section>
    </ProvReceiptsScope>
  );
}
