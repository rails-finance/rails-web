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
// `--card-pad`, the same `hidden sm:flex w-2/5` spine column, the same header-
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

import { useState, type ReactNode } from "react";

import { useTimelineScale } from "@/components/shared/activity-timeline";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { SpineColumn, type SpineIcon, type SpineVariant } from "@/components/shared/spine-column";

export interface NoteRowShellProps {
  /** The spine glyph this row's class wears. */
  icon: SpineIcon;
  /** Spine line style — dotted for every row this shell draws today: the
   *  account did nothing here, whichever class the row is. */
  spine?: SpineVariant;
  /** Spine terminus flags. A row that sits BETWEEN two others is neither, so
   *  both default false; a row in the timeline's head slot passes `isFirst`. */
  isFirst?: boolean;
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
}

export function NoteRowShell({
  icon,
  spine = "dotted",
  isFirst = false,
  isLast = false,
  label,
  marker,
  header,
  children,
}: NoteRowShellProps) {
  const scale = useTimelineScale();
  const registry = useReceiptRegistry();
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        {...{ [marker.attr]: marker.value, [`${marker.attr}-open`]: open ? "" : undefined }}
        className={`flex w-full items-start relative ${scale.cardRounded}`}
        style={{ "--card-pad": `${scale.cardPad}px`, padding: scale.cardPad } as React.CSSProperties}
      >
        <div className="hidden sm:flex w-2/5 shrink-0 self-stretch items-stretch justify-center">
          <SpineColumn icon={icon} spine={spine} isFirst={isFirst} isLast={isLast} />
        </div>
        <div className="min-w-0 grow">
          {/* ── Header panel — what the row states at rest ──────────────── */}
          <div className={`overflow-visible rounded-xl bg-note ${open ? "rounded-b-none" : ""}`}>
            <div
              className="group/evt cursor-pointer"
              role="button"
              tabIndex={0}
              aria-expanded={open}
              aria-label={label}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }}
            >
              <div className="relative flex items-start gap-2 evt-has-chev">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4 pb-3">
                  {header}
                </div>
                <ExpandChevron isOpen={open} group="evt" className="absolute right-0 top-0 mr-5 mt-[18px] sm:static" />
              </div>
            </div>
          </div>

          {/* ── Body panel — mounted only while open, like a card's ─────── */}
          {open && <div className="rounded-b-xl bg-note">{children}</div>}
        </div>
      </div>
    </ProvReceiptsScope>
  );
}
