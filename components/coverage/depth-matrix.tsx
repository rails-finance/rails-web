"use client";

import { Fragment, useEffect, useState } from "react";
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
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableLeadCell,
  DataTableLeadHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { explorerName } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";

/** Popovers and tooltips open their copy with a capital, applied HERE and only
 *  here: the same source strings (`CAPABILITIES[].detail`, `{ why }`,
 *  `{ awaiting }` in lib/shared/coverage.ts) also render as em-dash
 *  continuations on the mobile page ("Live dashboard: health factor…"),
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
      <Check className="h-[18px] w-[18px] text-green-500 inline-block" aria-label={`Included, except ${cell.except}`} />
    );
  }
  if ("awaiting" in cell) {
    return <Clock className="h-4 w-4 text-rb-400 inline-block" aria-label="Built, awaiting the first on-chain instance" />;
  }
  return <Ban className="h-4 w-4 text-rb-400 inline-block" aria-label="The protocol can't provide this" />;
}

/** A plain mark's tooltip. It sits on the cell, not the mark: the row's
 *  cover (D4) lies over the mark, and a hover on the cover still shows the
 *  cell's title. */
function cellTitle(cell: DepthCell): string | undefined {
  if (typeof cell !== "object") return undefined;
  if ("except" in cell) return `All but ${cell.except}`;
  if ("awaiting" in cell) return sentenceCase(cell.awaiting);
  return undefined;
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
 * Opens downward from the cell, or upward on the table's last two rows: the
 * table's frame scrolls (D3), so a box running past the last row would be
 * cut off inside it. Anchored `left-0` by default; the last two capability
 * columns (Liquidation forensics, Protocol views) anchor `right-0` instead so
 * the box opens inward and never clips the page's right edge. */
function CellNote({
  id,
  text,
  open,
  clampRight,
  up = false,
  maxWidthClass = "max-w-[26ch]",
}: {
  id: string;
  text: string;
  open: boolean;
  clampRight: boolean;
  up?: boolean;
  /** Widened for the header popovers — the `verification` capability's
   *  `detail` runs to ~55 words, and the cells' default 26ch renders it very
   *  tall. Existing cell callers are unaffected (the default is unchanged). */
  maxWidthClass?: string;
}) {
  return (
    <span
      id={id}
      role="tooltip"
      className={`absolute ${up ? "bottom-full mb-2" : "top-full mt-2"} z-[var(--z-dropdown)] w-max ${maxWidthClass} text-left rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg ${clampRight ? "right-0" : "left-0"} ${open ? "" : "hidden"}`}
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
  const rows = coverageRows(comingSoon, chainId);

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

  // The section below is `hidden lg:block`, NOT a `lg:` conditional render —
  // load-bearing beyond this file. The mobile card stack mounts its notes only
  // when opened, on the grounds that every note already ships once in the HTML
  // from here. Render this table conditionally and the notes leave the source
  // at every viewport, with nothing in the mobile path to notice. From lg,
  // not md: beside the brand rail (ui-jobs 498) the nine columns' headers
  // overlap below 1024px, so the card stack runs to lg.
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 pb-6 hidden lg:block">
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
          <Ban className="h-3.5 w-3.5 text-rb-400" aria-hidden="true" /> the protocol can&apos;t provide it (open the
          cell for the why)
        </span>
      </p>
      {/* table-fixed, or the browser grows the name column to fit the longest
          desc and starves the mark columns unevenly. With it the lead column
          takes its 95px, the name column 26% (18% below xl, where the
          capability labels would otherwise overrun their columns), and the
          capability columns split the remainder equally. Every header label is forced
          onto two lines by splitHeaderLabel (not the browser's own wrap), so
          all seven sit at the same height and stay aligned along the row. */}
      <DataTable label="Explorer capability matrix" tableClassName="table-fixed">
        <DataTableHead>
          <DataTableLeadHeader plain />
          <DataTableHeader label={<span className="sr-only">Explorer</span>} className="w-[18%] xl:w-[26%]" />
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
              <DataTableHeader key={cap.key} className="align-bottom">
                <div className="flex justify-center">
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
                </div>
              </DataTableHeader>
            );
          })}
        </DataTableHead>
        <DataTableBody>
          {rows.map((row, i) => {
            const up = i >= rows.length - 2;

            // A coming-soon row makes NO capability claims: unlike every
            // explorer row below, it carries no per-capability mark, no essay
            // and no cell popover — just its lead zone, a linked name, a
            // neutral "Coming soon" pill, and one muted note spanning every
            // capability column. That's what keeps it unaudited on purpose:
            // there's nothing here for a reader to mistake for a claim about
            // a live explorer.
            if (row.kind === "soon") {
              const soon = row.entry;
              return (
                <DataTableRow key={soon.id} href={soon.href}>
                  <DataTableLeadCell plain protocol={soon.iconId} protocolName={soon.label} chain={chainId} />
                  <DataTableCell rowHeader>
                    <div className="flex items-center gap-2 flex-wrap">
                      <DataTableRowLink href={soon.href} className="text-sm font-semibold">
                        <span className="whitespace-nowrap">{soon.label}</span>
                      </DataTableRowLink>
                      <span className="rounded-full bg-rb-200 px-2 py-0.5 text-[10px] font-medium text-rb-500 dark:bg-rb-800 dark:text-rb-400">
                        Coming soon
                      </span>
                    </div>
                  </DataTableCell>
                  <DataTableCell colSpan={CAPABILITIES.length} className="text-xs text-rb-500">
                    {soon.note}
                  </DataTableCell>
                </DataTableRow>
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
                <DataTableRow href={p.href}>
                  <DataTableLeadCell plain protocol={p.id} protocolName={p.label} chain={chainId} />
                  <DataTableCell rowHeader>
                    {/* The name is the row's one link (D4); the desc and the
                        essay trigger sit under it, outside the link text. */}
                    <DataTableRowLink href={p.href} className="text-sm font-semibold">
                      <span className="whitespace-nowrap">{p.label}</span>
                    </DataTableRowLink>
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
                  </DataTableCell>
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
                        <DataTableCell key={cap.key}>
                          <div className="flex justify-center">
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
                            <CellNote id={popoverId} text={viewNote} open={isOpen} clampRight={clampRight} up={up} />
                          </span>
                          </div>
                        </DataTableCell>
                      );
                    }
                    // ⊘ "can't provide it": an info mark on the cell opens a
                    // popover with THIS column's own `why` — never the shared
                    // essay, so two ⊘ cells in the same row show different text.
                    if (isWhyCell(cell)) {
                      const isOpen = cellOpen(p.id, cap.key);
                      const popoverId = `coverage-cell-${p.id}-${cap.key}`;
                      return (
                        <DataTableCell key={cap.key}>
                          <div className="flex justify-center">
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
                            <CellNote id={popoverId} text={cell.why} open={isOpen} clampRight={clampRight} up={up} />
                          </span>
                          </div>
                        </DataTableCell>
                      );
                    }
                    return (
                      <DataTableCell key={cap.key} title={cellTitle(cell)}>
                        <div className="flex justify-center">
                          <CellMark cell={cell} />
                        </div>
                      </DataTableCell>
                    );
                  })}
                </DataTableRow>
                {hasEssay && (
                  // An unlinked drawer row under its explorer row, one cell
                  // across every column, the lead column's included.
                  <DataTableRow drawer className={rowEssayOpen ? "" : "hidden"}>
                    {/* Derived, never the literal column count: the lead, the
                        name and each capability. */}
                    <DataTableCell colSpan={CAPABILITIES.length + 2} className="pb-5 pr-6">
                      {/* pl-[95px]: lines the drawer prose up under the row's
                          NAME text. This cell starts at the row's left edge, so
                          it adds the lead column's 95px to the padding the
                          name cell and this one share. */}
                      <div id={essayPanelId} className="max-w-[80ch] pl-[95px]">
                        {/* Header-less by design: the "Why not deeper" trigger
                            that opened this panel already named what it is —
                            a repeated label here would just restate it. */}
                        <p className="body-text">{note}</p>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                )}
              </Fragment>
            );
          })}
        </DataTableBody>
      </DataTable>
    </section>
  );
}
