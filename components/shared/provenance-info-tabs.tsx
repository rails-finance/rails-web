"use client";

// The info area for NON-CARD surfaces — position cards, economics panels —
// mirroring the event card's heading-button grammar: the (i) Explanation
// heading is a pill that bridges into the pane beneath. Per-value provenance
// lives with the page-level inspector (prov-inspector.tsx) — the Provenance
// tab this component used to render beside the Explanation retired in its
// favour, so the component now carries the Explanation section and any inline
// row content. The link to the position's view is the card's ⋮ row (ui-jobs
// 807, lib/shared/position-link.ts).
//
// Contents stay mounted while hidden (keepMounted): the explanations on these
// surfaces embed <Prov> figures of their own, and unmounting them would drain
// the surface's receipt registry the moment the reader switched away.

import { useEffect, useState, type ReactNode } from "react";
import { InfoTabsDisclosure, type InfoDisclosureTab } from "./info-disclosure";
import { LearnMore, type LearnMoreContent } from "./learn-more-modal";

export interface ProvenanceInfoTabsProps {
  /** Explanation section body. Omit for a surface with row content alone. */
  explanation?: ReactNode;
  /** Panel-scoped FAQ — the standardised "?" modal at the foot of the
   *  Explanation pane (the V2 trove card / V4 spoke grammar: every state
   *  panel owns a cell). Renders only with an `explanation` to sit under. */
  learnMore?: LearnMoreContent | null;
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
  /** App-anatomy codes (rails-ops reference/app-anatomy.md) for the
   *  Explanation and its "?": C3/C4 on a position card, F8/F9 on Lifetime flows. */
  anatomy?: { explanation?: string; learnMore?: string };
  /** The (i) button's noun: "Show {label}" / "Hide {label}". Names the surface so
   *  a page with several (i) buttons gives each its own name. */
  label?: string;
}

export function ProvenanceInfoTabs({
  explanation,
  learnMore,
  explanationDefaultOpen = false,
  onExplanationToggle,
  rowExtra,
  className,
  anatomy,
  label = "position explanation",
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
            label,
            content: learnMore ? (
              <>
                {explanation}
                <div className="flex items-center justify-end gap-2 mt-3">
                  <LearnMore content={learnMore} inline anatomy={anatomy?.learnMore} />
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
      bare
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
      anatomy={anatomy?.explanation}
    />
  );
}
