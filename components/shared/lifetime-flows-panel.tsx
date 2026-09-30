"use client";

// <LifetimeFlowsPanel> — the Lifetime flows panel on a position page that has a
// date scrubber (rails-ops reference/lifetime-flows-scrubber.md): the header
// that collapses the panel, the scrubber, Full breakdown over the ledger
// (flows-ledger.tsx) with the note naming the stop it shows, and the
// Explanation with the scrubber's Key after its prose. The scrubber's busy
// treatments (`?flows=`, lib/shared/flows-busy.ts) are drawn inside the
// scrubber and report no Key. Until the scrubber's timeline lands, or where
// its read fails, the ledger shows open with no Full breakdown control.
//
// Mounted by the position views directly, with no <ChainTruthTower>, so the
// towers can be removed without removing the scrubber (rails-ops
// TO-DO-ui-jobs §206).

import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChartBarBig, ChevronDown } from "lucide-react";
import {
  FlowsKey,
  FlowsKeyContext,
  FlowsLedgerNoteContext,
  type FlowsKeyItems,
} from "@/components/shared/lifetime-flows-scrubber";
import { FlowsLedger, ledgerDrawable } from "@/components/shared/flows-ledger";
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
import type { ChainTruthTowerData } from "@/lib/shared/chain-truth-economics";

export interface LifetimeFlowsPanelProps {
  /** The ledger behind Full breakdown. */
  ledger: ChainTruthTowerData;
  /** `<LifetimeFlowsScrubber>`, or null while its timeline is not in hand. */
  scrubber: ReactNode | null;
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
  ledger,
  scrubber,
  explanation,
  learnMore,
  title = "Lifetime flows",
  collapseKey: collapseKeyProp,
}: LifetimeFlowsPanelProps) {
  const pathname = usePathname();
  const collapseKey = collapseKeyProp !== undefined ? collapseKeyProp : flowsCollapseKeyForPathname(pathname);
  // The ledger behind the scrubber: closed by default.
  const [ledgerOpen, setLedgerOpen] = useState(false);
  // What the ledger shows while the scrubber's slider is off its last stop.
  const [ledgerNote, setLedgerNote] = useState<string | null>(null);
  // The scrubber's Key, drawn inside the Explanation.
  const [flowsKey, setFlowsKey] = useState<FlowsKeyItems | null>(null);
  const ledgerShown = scrubber == null || ledgerOpen;
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
  if (!ledgerDrawable(ledger).any) return null;

  return (
    // Its own receipts scope: every traced line in the ledger registers here.
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
          {scrubber != null && (
            <>
              <FlowsLedgerNoteContext.Provider value={setLedgerNote}>
                <FlowsKeyContext.Provider value={setFlowsKey}>
                  <div className="mt-2">{scrubber}</div>
                </FlowsKeyContext.Provider>
              </FlowsLedgerNoteContext.Provider>
              <div className="mt-3 flex flex-wrap items-center gap-x-2">
                <button
                  type="button"
                  onClick={() => setLedgerOpen((v) => !v)}
                  aria-expanded={ledgerOpen}
                  aria-controls={`${bodyId}-ledger`}
                  className={`${CTRL_GHOST} -mx-1 gap-1 rounded-md px-1 text-xs font-semibold text-foreground`}
                >
                  Full breakdown
                  <ChevronDown size={14} aria-hidden className={ledgerOpen ? "rotate-180" : ""} />
                </button>
                {ledgerNote && (
                  <span className="text-xs text-rb-500" data-flow-ledger-note="">
                    {ledgerNote}
                  </span>
                )}
              </div>
            </>
          )}
          <div id={`${bodyId}-ledger`} hidden={!ledgerShown} className={scrubber != null ? "mt-2" : undefined}>
            <FlowsLedger data={ledger} />
          </div>
          <ProvenanceInfoTabs
            className="mt-3"
            explanation={
              scrubber != null && flowsKey ? (
                <>
                  {explanation}
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
