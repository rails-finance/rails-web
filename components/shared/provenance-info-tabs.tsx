"use client";

// The info area for NON-CARD surfaces — position cards, economics panels —
// mirroring the event card's heading-button grammar: the (i) Explanation
// heading is a pill that bridges into the pane beneath. Per-value provenance
// lives with the page-level inspector (prov-inspector.tsx) — the Provenance
// tab this component used to render beside the Explanation retired in its
// favour, so the component now carries the Explanation section, the position's
// own copy-a-link-to-this-view control, and any inline row content.
//
// Contents stay mounted while hidden (keepMounted): the explanations on these
// surfaces embed <Prov> figures of their own, and unmounting them would drain
// the surface's receipt registry the moment the reader switched away.

import { useEffect, useState, type ReactNode } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { InfoTabsDisclosure, type InfoDisclosureTab } from "./info-disclosure";
import { LearnMore, type LearnMoreContent } from "./learn-more-modal";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";

/** Copy a link that reproduces this position's VIEW — sort, the three hidden
 *  sets and the date range, composed on demand by `useTimelineEvents.viewHref`
 *  (its file header states the grammar). It sits here, beside Learn More at
 *  the foot of the Explanation pane, rather than in the always-visible
 *  toolbar (where it lived until 2026-09-11): a reader reaches for it once
 *  they have already opened this pane to look closer, the same reader
 *  already reading the explanation it now sits beside. An explicit share
 *  act, so it is complete on a load where nothing was toggled and the
 *  address bar is still clean; the eye menu's display preferences never ride
 *  it. Same glyph-swap confirmation as the address pill's copy
 *  (wallet-pill.tsx): a tick for a moment, then the link glyph again. */
function CopyViewLink({ href }: { href: () => string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy the view link:", err);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Link copied" : "Copy a link to this view"}
      title={copied ? "Link copied" : "Copy link to this view"}
      className={`${CTRL_GHOST} ${CTRL_OFF} w-7 h-7 rounded-md`}
    >
      {copied ? <Check size={12} /> : <LinkIcon size={12} />}
    </button>
  );
}

export interface ProvenanceInfoTabsProps {
  /** Explanation section body. Omit for a surface with row content alone. */
  explanation?: ReactNode;
  /** Panel-scoped FAQ — the standardised "?" modal at the foot of the
   *  Explanation pane (the V2 trove card / V4 spoke grammar: every state
   *  panel owns a cell). Renders only with an `explanation` to sit under. */
  learnMore?: LearnMoreContent | null;
  /** Copy-this-view control, from the page's `useTimelineEvents().viewHref`.
   *  Renders beside Learn More at the foot of the Explanation pane. Absent on
   *  a listing/roster card render (the caller never passes it there), where
   *  no control draws. */
  viewHref?: () => string;
  /** Open the Explanation section (persisted-state restore). Read on mount AND
   *  adopted if it turns true later — see the note in the body: a surface that
   *  stores this reads it from localStorage after mount, so "on first mount"
   *  alone never restored anything. */
  explanationDefaultOpen?: boolean;
  /** Fires when the Explanation section opens/closes — for surfaces that
   *  persist that state. */
  onExplanationToggle?: (open: boolean) => void;
  /** Inline stat content sharing the heading-button row — passed through to
   *  `InfoTabsDisclosure`. */
  rowExtra?: ReactNode;
  className?: string;
}

export function ProvenanceInfoTabs({
  explanation,
  learnMore,
  viewHref,
  explanationDefaultOpen = false,
  onExplanationToggle,
  rowExtra,
  className,
}: ProvenanceInfoTabsProps) {
  const [openTab, setOpenTab] = useState<string | null>(
    explanation != null && explanationDefaultOpen ? "explanation" : null,
  );
  // Whether the reader has worked the pill themselves. After that their click
  // is the truth and no prop may reopen what they closed.
  const [touched, setTouched] = useState(false);

  // THE STORED DEFAULT ARRIVES LATE, AND IT USED TO BE MISSED. A surface that
  // remembers this pane reads it out of localStorage in a mount effect (the
  // read cannot happen during render without diverging from the server's
  // HTML), and the explanation itself is often absent on the first pass
  // because a chain overlay has not landed yet. Both mean the initial state
  // above is computed from `false`/`undefined` and the restore never
  // happened — the prop's own doc promised one. So the default is adopted
  // whenever it changes, until the reader touches the pill.
  const hasExplanation = explanation != null;
  useEffect(() => {
    if (touched) return;
    setOpenTab(hasExplanation && explanationDefaultOpen ? "explanation" : null);
  }, [hasExplanation, explanationDefaultOpen, touched]);

  const tabs: InfoDisclosureTab[] =
    explanation != null
      ? [
          {
            key: "explanation",
            label: "Explanation",
            content:
              learnMore || viewHref ? (
                <>
                  {explanation}
                  <div className="flex items-center justify-end gap-2 mt-3">
                    {viewHref && <CopyViewLink href={viewHref} />}
                    {learnMore && <LearnMore content={learnMore} inline />}
                  </div>
                </>
              ) : (
                explanation
              ),
          },
        ]
      : [];
  // With no sections AND no inline row content there's nothing to show; row
  // content alone still renders (the stat line shouldn't vanish just because
  // a surface has no explanation).
  if (tabs.length === 0 && rowExtra == null) return null;

  return (
    <InfoTabsDisclosure
      tabs={tabs}
      openTab={openTab}
      rowExtra={rowExtra}
      onOpenTabChange={(key) => {
        setTouched(true);
        setOpenTab(key);
        onExplanationToggle?.(key === "explanation");
      }}
      keepMounted
      className={className}
    />
  );
}
