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
import { DiscChevron, ExpandChevron } from "@/components/shared/expand-chevron";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { SpineColumn, type SpineColumnProps, type SpineIcon } from "@/components/shared/spine-column";
import { disclosureProps } from "@/components/shared/disclosure";
import { useRowTarget } from "@/components/shared/row-target";

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
  /** The T1 shape (ui-jobs 399): `header` is the head's words, the chevron
   *  follows them as on an event row, and this stands at the right end (the
   *  date). The row draws no ⋮ and keeps its width, so the date lines up
   *  with the event rows' dates. Under 640px the row draws as an event row
   *  does (ui-jobs 403): the node and its flank on the spine, then one
   *  caption line, the words, the date and the chevron. Unset, the chevron
   *  stands at the right end. */
  meta?: ReactNode;
  /** The spine's rate flank, on a rate note; token rows under the node, on a
   *  row that moved a share into the position (ui-jobs 402); who acted, for
   *  the node's badge (the protocol where unset, ui-jobs 408). */
  spine?: Pick<SpineColumnProps, "rateSpan" | "rateMoves" | "rateTone" | "rateProv" | "tokens" | "actor">;
}

export function NoteRowShell({
  icon,
  isLast = false,
  label,
  marker,
  header,
  children,
  meta,
  spine,
}: NoteRowShellProps) {
  const scale = useTimelineScale();
  const registry = useReceiptRegistry();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = () => setOpen((o) => !o);
  const rowClick = useRowTarget(toggle);

  // The T1 shape is a timeline row at both widths (`.spine-seg`, app/globals.css):
  // under 640px the spine cell stands with the node and its flank, and the
  // header draws as the caption over the cell's foot, as an event row's does.
  const seg = meta !== undefined;

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        {...{ [marker.attr]: marker.value, [`${marker.attr}-open`]: open ? "" : undefined }}
        data-anatomy="L7"
        className={`spine-row${seg ? " spine-seg" : ""} relative cursor-pointer ${scale.cardRounded}`}
        // The whole row opens and closes the note, as an event card's does.
        {...rowClick}
      >
        <div className="spine-cell">
          <SpineColumn icon={icon} isLast={isLast} {...spine} />
        </div>
        <div className="spine-content">
          {/* ── Header panel — what the row states at rest ──────────────── */}
          <div
            className={`overflow-visible rounded-xl bg-note ${open ? "rounded-b-none" : ""}${seg ? " spine-t1 max-sm:bg-transparent" : ""}`}
          >
            <div
              className={`group/evt cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500${seg ? " disc-row disc-row-slow pointer-events-auto" : ""}`}
              {...disclosureProps<HTMLDivElement>(open, panelId, toggle, "role")}
              aria-label={label}
            >
              {seg ? (
                // From 640px: 56px tall, the marks row's height, so every note
                // row stands the same height whichever shape it is
                // (note-gap.tsx). Under it: the caption, centred on the spine
                // on the page's ground — the words, a dot, the date, the chevron.
                <div className="flex min-h-14 flex-wrap items-center gap-1.5 pb-3 pl-5 pr-5 pt-4 max-sm:min-h-0 max-sm:justify-center max-sm:px-7 max-sm:pb-2.5 max-sm:pt-1.5 sm:pr-[52px]">
                  <span
                    className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-5 max-sm:px-2 sm:contents"
                    style={{ backgroundColor: "var(--background)" }}
                    data-note-caption=""
                  >
                    {header}
                    <span className="inline-flex items-center self-center max-sm:order-last" data-evt-head-chev="">
                      <DiscChevron isOpen={open} />
                    </span>
                    {meta}
                  </span>
                </div>
              ) : (
                <div className="relative flex items-start gap-2 evt-has-chev">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 pl-5 pt-4 pb-3">
                    {header}
                  </div>
                  <ExpandChevron
                    isOpen={open}
                    group="evt"
                    className="absolute right-0 top-0 mr-5 mt-[18px] sm:static"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Body panel — mounted only while open, like a card's ─────── */}
          {open && (
            <div
              id={panelId}
              className={`cursor-auto rounded-b-xl bg-note${seg ? " spine-body max-sm:mt-2 max-sm:rounded-t-xl" : ""}`}
              data-row-body=""
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </ProvReceiptsScope>
  );
}
