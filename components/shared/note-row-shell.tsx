"use client";

// The shell a PINNED ROW is drawn in: a header panel on the spine that opens
// to a body panel beneath it.
// ----------------------------------------------------------------------------
// Two row classes stand in it, and they are not the same kind of fact. A market
// note states something that happened to the MARKET while the account did
// nothing (components/shared/market-note-row.tsx). A live window states what
// moved ONE position between its own last touch and now
// (components/protocol/polaris/polaris-since-last-touch.tsx). Neither is an
// event, and neither is counted as one; what they share is the geometry.
//
// That geometry is EventCard's outer geometry, deliberately: the same
// `--card-pad`, the same `.spine-row` shell and spine cell, the same header-
// panel / body-panel surfaces and chevron, and the `bg-note` ground that reads
// as a different KIND of row before the glyph does. The node then lands on the
// same vertical line as the cards' own, which is the whole point of giving
// these rows a node at all.
//
// The shell owns the geometry, the disclosure control and its keyboard
// handling, and the row's own <ProvReceiptsScope>, so the provenance inspector
// can pin the figures inside it the way it pins a card's. The glyph, the
// header's content and the body are the caller's — the shell reads none of
// them.

import { useId, useState, type ReactNode } from "react";

import { useTimelineScale } from "@/components/shared/activity-timeline";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { SpineColumn, type SpineIcon } from "@/components/shared/spine-column";
import { disclosureProps } from "@/components/shared/disclosure";

export interface NoteRowShellProps {
  /** The spine glyph this row's class wears. */
  icon: SpineIcon;
  /** The spine's last node. A row that sits BETWEEN two others is not, so it
   *  defaults false. */
  isLast?: boolean;
  /** The header control's accessible name. */
  label: string;
  /** How this row is found on the page: the attribute the wrapper carries and
   *  its value. The shell adds `<attr>-open` alongside it while the body is
   *  open, so a verifier can read both the row and its state. */
  marker: { attr: string; value: string };
  /** The header panel's content — the marks and figures, laid out by the row.
   *  Sits in the padded flex row the chevron shares. */
  header: ReactNode;
  /** The body panel, mounted only while the row is open — like a card's. */
  children: ReactNode;
  /** Mount with the body open: a note opened from its spine marker opens
   *  straight to the row and its panel. */
  defaultOpen?: boolean;
}

export function NoteRowShell({
  icon,
  isLast = false,
  label,
  marker,
  header,
  children,
  defaultOpen = false,
}: NoteRowShellProps) {
  const scale = useTimelineScale();
  const registry = useReceiptRegistry();
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const toggle = () => setOpen((o) => !o);

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        {...{ [marker.attr]: marker.value, [`${marker.attr}-open`]: open ? "" : undefined }}
        data-anatomy="L7"
        className={`spine-row relative ${scale.cardRounded}`}
      >
        <div className="spine-cell">
          <SpineColumn icon={icon} isLast={isLast} />
        </div>
        <div className="spine-content">
          {/* ── Header panel — what the row states at rest ──────────────── */}
          <div className={`overflow-visible rounded-xl bg-note ${open ? "rounded-b-none" : ""}`}>
            <div
              className="group/evt cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500"
              {...disclosureProps<HTMLDivElement>(open, panelId, toggle, "role")}
              aria-label={label}
            >
              <div className="relative flex items-start gap-2 evt-has-chev">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 pl-5 pt-4 pb-3">
                  {header}
                </div>
                <ExpandChevron isOpen={open} group="evt" className="absolute right-0 top-0 mr-5 mt-[18px] sm:static" />
              </div>
            </div>
          </div>

          {/* ── Body panel — mounted only while open, like a card's ─────── */}
          {open && (
            <div id={panelId} className="rounded-b-xl bg-note">
              {children}
            </div>
          )}
        </div>
      </div>
    </ProvReceiptsScope>
  );
}
