"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Check, ChevronDown, Clock, Info, Minus } from "lucide-react";

import {
  CAPABILITIES,
  COVERAGE_NOTES,
  VIEW_NOTES,
  cellFor,
  coverageRows,
  type ComingSoonEntry,
  type DepthCell,
  type DepthKey,
} from "@/lib/shared/coverage";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { explorerName } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";

/** Popovers and tooltips open their copy with a capital, applied HERE and only
 *  here: the same source strings (`CAPABILITIES[].detail`, `{ why }`,
 *  `{ awaiting }` in lib/shared/coverage.ts) also render as em-dash
 *  continuations on the mobile page ("Live dashboard — health factor…"),
 *  where lowercase-after-dash is the house style — so the sources stay
 *  lowercase and the render site does the casing. */
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Narrows a cell to the "protocol can't provide this" shape — the one the
 *  ⊘ mark renders and the only one carrying a `why` to open. */
function isWhyCell(cell: DepthCell): cell is { why: string } {
  return typeof cell === "object" && "why" in cell;
}

/** Tick / not-yet dash / awaiting clock / can't — the desktop matrix's cell
 *  renderer, for the marks that are NOT triggers (a plain "not yet", the
 *  awaiting clock, or a ⊘ with no structural note to open). The interactive
 *  marks (✓-views-with-a-view-note, ⊘-with-a-structural-note) are rendered
 *  inline as buttons instead — see the CAPABILITIES.map below. */
function CellMark({ cell }: { cell: DepthCell }) {
  if (cell === true) {
    return <Check className="h-[18px] w-[18px] text-green-500 inline-block" aria-label="Included" />;
  }
  if (cell === false) {
    return <Minus className="h-4 w-4 text-rb-400 inline-block" aria-label="Not yet" />;
  }
  if ("except" in cell) {
    return (
      <span title={`All but ${cell.except}`} className="inline-block">
        <Check className="h-[18px] w-[18px] text-green-500" aria-label={`Included, except ${cell.except}`} />
      </span>
    );
  }
  if ("awaiting" in cell) {
    return (
      <span title={sentenceCase(cell.awaiting)} className="inline-block">
        <Clock className="h-4 w-4 text-rb-400" aria-label="Built, awaiting the first on-chain instance" />
      </span>
    );
  }
  return <Ban className="h-4 w-4 text-rb-400 inline-block" aria-label="The protocol can't provide this" />;
}

/** Every capability label breaks onto exactly two stacked lines, uniformly —
 *  a deterministic split, not the browser's own width-dependent wrap (which
 *  left some headers on one line and others on two, at uneven heights).
 *  Splitting at the FIRST space rather than assuming "always two words":
 *  `CAPABILITIES` has one three-word label ("Copy for LLM"), so a bare
 *  `.split(" ")` would produce a third line for it alone. First-space keeps
 *  every label to exactly two lines regardless of word count. */
function splitHeaderLabel(label: string): [string, string] {
  const i = label.indexOf(" ");
  return i === -1 ? [label, ""] : [label.slice(0, i), label.slice(i + 1)];
}

export interface DepthMatrixProps {
  /** Announced-but-not-built explorers, spliced into the matrix as their own
   *  row (see `coverageRows`). Owned by the page, which also merges them into
   *  the mobile card stack the same way. */
  comingSoon: ComingSoonEntry[];
  /** The chain whose explorers this matrix states — the coverage surface is
   *  per-chain routes, and the page's toggle links to the other chain. */
  chainId: ChainId;
}

/** Which panel is open: the protocol-level essay under a name, a single
 *  cell's own popover (a ⊘ cell's `why`, or the views cell's `VIEW_NOTES`
 *  one-liner), or a column header's own capability definition
 *  (`CAPABILITIES[].detail`). Single-open throughout — opening any one kind
 *  closes whatever else was open. */
type Open =
  | { kind: "essay"; id: string }
  | { kind: "cell"; id: string; key: DepthKey }
  | { kind: "header"; key: DepthKey };

/** Quiet trigger styling shared by every disclosure affordance in the matrix
 *  (the views-tick info mark, the ⊘-cell info mark, the name-level essay
 *  trigger): no pill, one text color that shifts on hover, a visible focus
 *  ring. */
const TRIGGER_CLASS =
  "inline-flex cursor-pointer items-center gap-1 rounded text-rb-500 transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:text-rb-200";

/** A click-pinned popover anchored to the cell whose mark opened it — the
 *  column-specific `why` (or the views one-liner) rendered right where the
 *  mark that explains it sits, rather than a screen away. Always mounted and
 *  hidden with the Tailwind `.hidden` class (never unmounted): the text is
 *  substantive page copy that should ship in the HTML regardless of open
 *  state, and `aria-controls` needs a present element to reference.
 *
 * Opens downward from the cell. Anchored `left-0` by default; the last two
 * capability columns (Liquidation forensics, Protocol views) anchor `right-0`
 * instead so the box opens inward and never clips the page's right edge. */
function CellNote({
  id,
  text,
  open,
  clampRight,
  maxWidthClass = "max-w-[26ch]",
}: {
  id: string;
  text: string;
  open: boolean;
  clampRight: boolean;
  /** Widened for the header popovers — the `verification` capability's
   *  `detail` runs to ~55 words, and the cells' default 26ch renders it very
   *  tall. Existing cell callers are unaffected (the default is unchanged). */
  maxWidthClass?: string;
}) {
  return (
    <span
      id={id}
      role="tooltip"
      className={`absolute top-full z-50 mt-2 w-max ${maxWidthClass} text-left rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg ${clampRight ? "right-0" : "left-0"} ${open ? "" : "hidden"}`}
    >
      {sentenceCase(text)}
    </span>
  );
}

/**
 * The desktop depth matrix. Three disclosure grammars, chosen by what the
 * note is about:
 *
 *  - **Cell-anchored popover** — an info mark (ⓘ) on a ⊘ ("can't provide")
 *    cell, or beside the Protocol views ✓ tick, opens a small popover pinned
 *    to that cell: the column-specific `{ why }` string, or that explorer's
 *    own `VIEW_NOTES` one-liner. The affordance sits on the cell it
 *    describes, so the matrix mark IS the anchor.
 *  - **Name-level "Why not deeper" essay** — every protocol carrying a
 *    `COVERAGE_NOTES` entry gets a compact trigger under its name that opens
 *    the full structural essay as a push-down row beneath the row (essay is
 *    protocol-level, so it belongs under the name, not pinned to any one
 *    cell — some of these protocols also carry ⊘-cell popovers of their own;
 *    the two disclosures are independent and can coexist on the same row).
 *  - **Header-anchored popover** — an info mark (ⓘ) beside each column's
 *    `label` in `<thead>` opens a popover pinned to that header, showing `cap.detail`
 *    (what the capability means). This is what replaced the standalone `<dl>`
 *    legend this section used to open with — below the matrix, the mobile
 *    card stack in `page.tsx` reaches the same `detail` text through its own
 *    per-pill bottom sheet instead (capability-sheet.tsx).
 *
 * Single-open accordion across ALL THREE grammars: a cell popover can run to
 * a sentence, the essay to a few hundred words, a header popover to another
 * sentence, and two open at once pushes matrix rows a screen apart and
 * destroys the at-a-glance comparison the table exists for. `Open` is a
 * tagged union rather than a bare id so the one piece of state can
 * distinguish "the essay for protocol X" from "the dashboard-column popover
 * for protocol X" from "the header popover for the views column".
 *
 * Panels stay mounted and hide with the Tailwind `.hidden` class rather than
 * unmounting: the prose is the page's substantive copy and `display:none`
 * content still ships in the HTML source, and `aria-controls` needs a present
 * element to reference. (The Tailwind class, not the HTML `hidden` attribute —
 * the attribute is a UA-stylesheet rule that `display: table-row` would beat.)
 */
export function DepthMatrix({ comingSoon, chainId }: DepthMatrixProps) {
  const [open, setOpen] = useState<Open | null>(null);
  const essayOpen = (id: string) => open?.kind === "essay" && open.id === id;
  const cellOpen = (id: string, key: DepthKey) => open?.kind === "cell" && open.id === id && open.key === key;
  const headerOpen = (key: DepthKey) => open?.kind === "header" && open.key === key;

  // Escape closes whatever is open — a cell popover OR the essay drawer.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Outside pointerdown closes a cell popover OR a header popover — but not
  // the essay drawer, which pushes layout and keeps click-toggle only (a
  // scroll-then-click-away auto-close there would be surprising). Neither a
  // cell nor a header note pushes layout, so click-away close is right for
  // both. There are many cell/header wrappers and only ever one open, so the
  // contains-check reaches for the OPEN one by id rather than a per-cell ref
  // (the shape RevealTip uses for its one always-singular instance doesn't
  // carry over to a table of many).
  useEffect(() => {
    if (open?.kind !== "cell" && open?.kind !== "header") return;
    const wrapId =
      open.kind === "cell" ? `coverage-cell-wrap-${open.id}-${open.key}` : `coverage-header-wrap-${open.key}`;
    function onPointerDown(e: PointerEvent) {
      const wrap = document.getElementById(wrapId);
      if (wrap && !wrap.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // The section below is `hidden md:block`, NOT a `md:` conditional render —
  // load-bearing beyond this file. The mobile card stack mounts its notes only
  // when opened, on the grounds that every note already ships once in the HTML
  // from here. Render this table conditionally and the notes leave the source
  // at every viewport, with nothing in the mobile path to notice.
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 pb-6 hidden md:block">
      {/* Visually silent — no visible section heading here (the copy read as
          filler above a self-explanatory table), kept only for the
          accessibility outline. */}
      <h2 className="sr-only">Explorer capability matrix</h2>
      {/* Mark legend — the two kinds of gap are the point of the matrix, so
          they're spelled out before the reader meets a cell. Centered, and
          carrying its own top margin now that the heading above it is gone
          (an sr-only node reserves no space). */}
      <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-rb-500 mt-1 mb-5">
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" /> included
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Minus className="h-3.5 w-3.5 text-rb-400" aria-hidden="true" /> not yet built
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-rb-400" aria-hidden="true" /> built, awaiting the first on-chain instance
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Ban className="h-3.5 w-3.5 text-rb-400" aria-hidden="true" /> the protocol can&apos;t provide it — open the
          cell for the why
        </span>
      </p>
      {/* table-fixed, or the browser grows column 1 to fit the longest desc and
          starves the mark columns unevenly. With it the seven capability
          columns split the remainder equally. Every header label is forced
          onto two lines by splitHeaderLabel (not the browser's own wrap), so
          all seven sit at the same height and stay aligned along the row. */}
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-b border-rb-200 dark:border-rb-800">
            <th scope="col" className="w-[34%] text-left align-bottom pb-3 pr-6">
              <span className="sr-only">Explorer</span>
            </th>
            {CAPABILITIES.map((cap, capIndex) => {
              // Same last-two-columns clamp as the cell popovers: Liquidation
              // forensics / Protocol views open inward instead of clipping
              // the page's right edge.
              const clampRight = capIndex >= CAPABILITIES.length - 2;
              const isOpen = headerOpen(cap.key);
              const wrapId = `coverage-header-wrap-${cap.key}`;
              const popoverId = `coverage-header-${cap.key}`;
              const [line1, line2] = splitHeaderLabel(cap.label);
              return (
                <th key={cap.key} scope="col" className="align-bottom pb-3 px-2 text-center">
                  <span id={wrapId} className="relative inline-flex">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : { kind: "header", key: cap.key })}
                      aria-expanded={isOpen}
                      aria-controls={popoverId}
                      aria-label={isOpen ? `Hide what "${cap.label}" means` : `Show what "${cap.label}" means`}
                      className={`gap-1 ${TRIGGER_CLASS}`}
                    >
                      {/* flex-col, not the browser's text wrap: two stacked
                          lines every time, so every column matches every
                          other column's height regardless of word count. */}
                      <span className="flex flex-col text-xs font-medium leading-tight">
                        <span>{line1}</span>
                        <span>{line2}</span>
                      </span>
                      {/* Static info glyph — open state reads through color,
                          not rotation (a chevron here reads as table-sort). */}
                      <Info
                        className={`h-3 w-3 shrink-0 transition-colors ${isOpen ? "text-foreground dark:text-rb-200" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                    <CellNote
                      id={popoverId}
                      text={cap.detail}
                      open={isOpen}
                      clampRight={clampRight}
                      maxWidthClass="max-w-[34ch]"
                    />
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {coverageRows(comingSoon, chainId).map((row, i) => {
            // Stripe by MERGED-row index parity, never nth-child/even — the
            // always-mounted (and often hidden) drawer rows break DOM parity,
            // so a CSS pseudo-class would tint the wrong rows, and the
            // coming-soon row participates in the same parity as any other
            // row rather than resetting it. The dark: variant isn't
            // decorative: rb-200 is mode-split and resolves light in dark
            // mode, so bare bg-rb-200/50 would flash a light stripe on the
            // dark canvas. Row 1 stays canvas so the header border reads clean.
            const stripe = i % 2 === 1 ? "bg-rb-200/50 dark:bg-rb-850" : "";

            // A coming-soon row makes NO capability claims: unlike every
            // explorer row below, it carries no per-capability mark, no essay
            // and no cell popover — just an icon, a linked name, a neutral
            // "Coming soon" pill, and one muted note spanning every
            // capability column. That's what keeps it unaudited on purpose:
            // there's nothing here for a reader to mistake for a claim about
            // a live explorer.
            if (row.kind === "soon") {
              const soon = row.entry;
              return (
                <tr key={soon.id} className={`${i > 0 ? "border-t border-rb-200 dark:border-rb-800" : ""} ${stripe}`}>
                  <th scope="row" className="text-left font-normal align-top py-3 pr-6 pl-4">
                    <div className="flex items-start gap-2.5">
                      <ProtocolIcon id={soon.iconId} className="h-6 w-6 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={soon.href}
                            className="text-sm font-semibold text-foreground transition-colors hover:text-blue-500"
                          >
                            <span className="whitespace-nowrap">{soon.label}</span>
                          </Link>
                          <span className="rounded-full bg-rb-200 px-2 py-0.5 text-[10px] font-medium text-rb-500 dark:bg-rb-800 dark:text-rb-400">
                            Coming soon
                          </span>
                        </div>
                      </div>
                    </div>
                  </th>
                  <td colSpan={CAPABILITIES.length} className="align-top py-3 px-2 text-xs text-rb-500">
                    {soon.note}
                  </td>
                </tr>
              );
            }

            const p = row.entry;
            const note = COVERAGE_NOTES[p.id];
            const viewNote = VIEW_NOTES[p.id];
            // The essay row/trigger renders for EVERY protocol carrying a
            // structural note, whether or not it also carries a ⊘ cell of its
            // own — the essay is protocol-level copy, so a ⊘-cell protocol
            // (e.g. pwn, maple) still needs a way to reach it.
            const hasEssay = Boolean(note);
            const rowEssayOpen = essayOpen(p.id);
            const essayPanelId = `coverage-details-${p.id}`;
            return (
              // Keyed <Fragment>, never a wrapping element: a <div> between
              // <tbody> and <tr> is silently reparented by the HTML table
              // parser, which hydrates as a mismatch.
              <Fragment key={p.id}>
                {/* The divider is border-t on all but the first row. A border-b
                    scheme would draw the seam between a row and its OWN drawer,
                    visually attaching each drawer to the protocol below it. */}
                <tr className={`${i > 0 ? "border-t border-rb-200 dark:border-rb-800" : ""} ${stripe}`}>
                  {/* pl-4: breathing room off the row's left edge — flush read
                      as cramped once the zebra stripe gave the row a visible
                      band. The stripe lives on the <tr>, so it still runs
                      full-width behind this padding. */}
                  <th scope="row" className="text-left font-normal align-top py-3 pr-6 pl-4">
                    <div className="flex items-start gap-2.5">
                      <ProtocolIcon id={p.id} className="h-6 w-6 shrink-0 mt-0.5" />
                      {/* min-w-0, or the flex child won't wrap the desc. */}
                      <div className="min-w-0">
                        {/* Only the label is the anchor — wrapping the icon and
                            desc too would swallow them into the link text. */}
                        <Link
                          href={p.href}
                          className="text-sm font-semibold text-foreground transition-colors hover:text-blue-500"
                        >
                          <span className="whitespace-nowrap">{p.label}</span>
                        </Link>
                        <p className="text-xs leading-snug text-rb-500 mt-0.5">{p.desc}</p>
                        {hasEssay && (
                          <button
                            type="button"
                            onClick={() => setOpen(rowEssayOpen ? null : { kind: "essay", id: p.id })}
                            aria-expanded={rowEssayOpen}
                            aria-controls={essayPanelId}
                            aria-label={
                              rowEssayOpen
                                ? `Hide why ${explorerName(p)} doesn't go deeper`
                                : `Show why ${explorerName(p)} doesn't go deeper`
                            }
                            className={`mt-1.5 ${TRIGGER_CLASS}`}
                          >
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${rowEssayOpen ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                            <span className="text-xs">Why not deeper</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </th>
                  {CAPABILITIES.map((cap, capIndex) => {
                    const cell = cellFor(p.id, cap.key);
                    // The last two columns (Liquidation forensics, Protocol
                    // views) anchor their popover to the right so it opens
                    // inward instead of clipping the page's right edge.
                    const clampRight = capIndex >= CAPABILITIES.length - 2;
                    const wrapId = `coverage-cell-wrap-${p.id}-${cap.key}`;
                    // Protocol views ✓: an info mark beside the tick opens a
                    // popover with the explorer's own VIEW_NOTES one-liner,
                    // pinned to this cell.
                    if (cap.key === "views" && cell === true && viewNote) {
                      const isOpen = cellOpen(p.id, cap.key);
                      const popoverId = `coverage-cell-${p.id}-${cap.key}`;
                      return (
                        <td key={cap.key} className="text-center align-top pt-3.5 px-2">
                          <span id={wrapId} className="relative inline-flex">
                            <button
                              type="button"
                              onClick={() => setOpen(isOpen ? null : { kind: "cell", id: p.id, key: cap.key })}
                              aria-expanded={isOpen}
                              aria-controls={popoverId}
                              aria-label={
                                isOpen
                                  ? `Hide what ${explorerName(p)}'s protocol view shows`
                                  : `Show what ${explorerName(p)}'s protocol view shows`
                              }
                              className={`gap-0.5 ${TRIGGER_CLASS}`}
                            >
                              <Check className="h-[18px] w-[18px] text-green-500" aria-hidden="true" />
                              <Info
                                className={`h-3 w-3 transition-colors ${isOpen ? "text-foreground dark:text-rb-200" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                            <CellNote id={popoverId} text={viewNote} open={isOpen} clampRight={clampRight} />
                          </span>
                        </td>
                      );
                    }
                    // ⊘ "can't provide it": an info mark on the cell opens a
                    // popover with THIS column's own `why` — never the shared
                    // essay, so two ⊘ cells in the same row show different text.
                    if (isWhyCell(cell)) {
                      const isOpen = cellOpen(p.id, cap.key);
                      const popoverId = `coverage-cell-${p.id}-${cap.key}`;
                      return (
                        <td key={cap.key} className="text-center align-top pt-3.5 px-2">
                          <span id={wrapId} className="relative inline-flex">
                            <button
                              type="button"
                              onClick={() => setOpen(isOpen ? null : { kind: "cell", id: p.id, key: cap.key })}
                              aria-expanded={isOpen}
                              aria-controls={popoverId}
                              aria-label={
                                isOpen
                                  ? `Hide why ${explorerName(p)} can't provide ${cap.label}`
                                  : `Show why ${explorerName(p)} can't provide ${cap.label}`
                              }
                              className={`gap-0.5 ${TRIGGER_CLASS}`}
                            >
                              <Ban className="h-4 w-4" aria-hidden="true" />
                              <Info
                                className={`h-3 w-3 transition-colors ${isOpen ? "text-foreground dark:text-rb-200" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                            <CellNote id={popoverId} text={cell.why} open={isOpen} clampRight={clampRight} />
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={cap.key} className="text-center align-top pt-3.5 px-2">
                        <CellMark cell={cell} />
                      </td>
                    );
                  })}
                </tr>
                {hasEssay && (
                  // Same stripe as the parent row so an open drawer reads as
                  // part of its row, not a band of its own.
                  <tr className={`${rowEssayOpen ? "" : "hidden"} ${stripe}`}>
                    {/* Derived, never the literal column count. */}
                    <td colSpan={CAPABILITIES.length + 1} className="pb-5 pr-6">
                      {/* pl-[50px]: lines the drawer prose up under the row's
                          NAME/desc text, not its icon — the panel cell starts
                          at the row's left edge (this <td> spans every column),
                          so it must reproduce the icon column's own offset:
                          the th's pl-4 (16px) + the icon's w-6 (24px) + the
                          icon/text gap-2.5 (10px) = 50px. */}
                      <div id={essayPanelId} className="max-w-[80ch] pl-[50px]">
                        {/* Header-less by design: the "Why not deeper" trigger
                            that opened this panel already named what it is —
                            a repeated label here would just restate it. */}
                        <p className="body-text">{note}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
