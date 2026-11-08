"use client";

// The house table (rails-ops ui-jobs 539): the chrome every data table shares,
// first drawn on /vaults?layout=table (ui-jobs 538). Presentational only: a
// caller keeps its data, its order, its receipts and its `data-*` hooks, and
// draws them into these parts.
// ----------------------------------------------------------------------------
// A real <table>: a caption or label, `<th scope="col">` headers, an optional
// `<th scope="row">` cell. Each row reads as one rounded block: the table is
// `border-separate` with no horizontal spacing and a small vertical gap, the
// stripe lies on the cells, and only the first and last cells round their
// outer corners. Stripes alternate the raised and sunken surfaces; a hovered
// row takes the selected surface. The frame scrolls sideways inside itself,
// never the page; a pinned cell carries its row's stripe.
//
// A LINKED ROW. `DataTableRow href` with one `DataTableRowLink` in a cell
// (the row's name, the one link a keyboard reaches). Every cell lays a hidden
// copy of the link over itself (`tabIndex={-1}`, `aria-hidden`), so a press
// anywhere on the row opens it: a cell, unlike a <tr>, positions reliably in
// every engine. Other controls and armed receipts stand above the copies.
// Hovered, or focused from the keyboard, the row takes the listing cards' blue
// border (POSITION_CARD_FRAME_BOX), drawn by each cell along its top and
// bottom and by the end cells round their outer corners, and its name stays
// foreground: a clickable card takes the border, not blue text
// (standards/color-grammar.md §4a).
//
// ANATOMY (rails-ops reference/app-anatomy.md, region D): D1 the frame and
// its rows, D2 a sortable header, D3 the sideways scroll and pinned cells
// (on the frame), D4 a linked row, D5 the lead cell, D6 stacked rows (on the
// frame in D3's place).
//
// STACKED ROWS (D6, opt-in: `DataTable stacked`). Below sm the same <table>
// reflows into cards by CSS (`.dt-stacked`, app/globals.css), with explicit
// ARIA roles so a screen reader still reads rows of labelled cells: the
// header row hides, the lead zone narrows to a 6px edge in the protocol's hue
// (W4's pattern below sm), the row header spans the card, the other cells sit
// two to a line, each with its `label`, a `wide` cell on a line of its own,
// an empty cell not drawn. A table with no lead zone has no edge. Stripes,
// corners, the gap, the linked row and its border carry over; pinning (D3)
// does not apply.
//
// THE LEAD COLUMN. Where rows span protocols or chains, each row opens with
// the protocol's tinted zone (components/shared/row-zone.tsx, the wallet's
// History lead): `DataTableLeadHeader` and `DataTableLeadCell`. Where the zone
// meets the next cell the body's corners curve in over the hue (the frame is
// `isolate`, so the hue behind them stays inside the table).

import Link from "next/link";
import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { hueStyle, RowZone } from "@/components/shared/row-zone";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { chainMeta, type ChainId } from "@/lib/shared/chains";

export type DataTableDir = "asc" | "desc";
type Align = "left" | "right";

/** The cell's padding; a caller adds its own sizes and type. */
export const DATA_TABLE_PAD = "px-2 py-2.5 sm:px-3";

/** The row block's surfaces and corners, on every body cell. */
const CELL_SURFACE =
  "transition-colors group-odd/dt-row:bg-raised group-even/dt-row:bg-sunken group-hover/dt-row:bg-selected first:rounded-l-2xl last:rounded-r-2xl";

/** A linked row's cell: the cell holds its cover, and its ::after draws the
 *  row's border, top and bottom, the end cells' outer sides and corners. */
const LINKED_CELL =
  "relative after:pointer-events-none after:absolute after:inset-0 after:z-20 after:border-y after:border-transparent after:transition-colors after:content-[''] first:after:rounded-l-2xl first:after:border-l last:after:rounded-r-2xl last:after:border-r group-hover/dt-row:after:border-blue-500 group-focus-within/dt-row:after:border-blue-500";

/** The row's link, which each cell's cover repeats. */
const RowHref = createContext<string | null>(null);

/** The table reads as cards below sm (D6): its parts carry explicit roles,
 *  since a reflowed table loses its own. */
const Stacked = createContext(false);

/** Every row one fixed height from sm: one line, 56px (D1's `oneLine`), or a
 *  name over a sub-label, 64px (`twoLine`). */
const RowHeight = createContext<"one" | "two" | null>(null);

/** The frame and the table. `tableClassName` sets a minimum width (the frame
 *  scrolls below it) and the body's type. */
export function DataTable({
  caption,
  label,
  anatomy,
  stacked = false,
  oneLine = false,
  twoLine = false,
  tableClassName = "",
  className = "",
  children,
  ...frame
}: {
  /** Visually hidden; read before the table. */
  caption?: ReactNode;
  /** The table's accessible name where there is no caption. */
  label?: string;
  /** The caller's own part code, before D1 and D3 (`M1`). */
  anatomy?: string;
  /** Below sm each row reads as a card (D6, `.dt-stacked` in globals.css):
   *  no header row, the lead zone a 6px edge, the row header across the card,
   *  the other cells in two columns, each with its `label`. The caller draws
   *  its own sort control for that width. */
  stacked?: boolean;
  /** From sm every row is one line, 56px (room for a 28px icon), each cell
   *  middle-aligned; the caller keeps its content to one line (a long name
   *  truncates). */
  oneLine?: boolean;
  /** From sm every row is two lines, 64px (a name over a one-line
   *  sub-label), each cell middle-aligned; the caller keeps each line to one
   *  (it truncates). Not with `oneLine`. */
  twoLine?: boolean;
  tableClassName?: string;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    // `relative`: a visually hidden span inside a cell is placed against the
    // frame, so it never widens the page.
    <Stacked.Provider value={stacked}>
      <RowHeight.Provider value={oneLine ? "one" : twoLine ? "two" : null}>
        <div
          className={`relative isolate max-w-full overflow-x-auto ${className}`}
          data-anatomy={[anatomy, "D1", stacked ? "D6" : "D3"].filter(Boolean).join(" ")}
          {...frame}
        >
          <table
            className={`w-full border-separate border-spacing-x-0 border-spacing-y-1 ${stacked ? "dt-stacked" : ""} ${tableClassName}`}
            aria-label={caption ? undefined : label}
            role={stacked ? "table" : undefined}
          >
            {caption && <caption className="sr-only">{caption}</caption>}
            {children}
          </table>
        </div>
      </RowHeight.Provider>
    </Stacked.Provider>
  );
}

/** The header row. */
export function DataTableHead({ children }: { children: ReactNode }) {
  const stacked = useContext(Stacked);
  return (
    <thead role={stacked ? "rowgroup" : undefined}>
      <tr role={stacked ? "row" : undefined}>{children}</tr>
    </thead>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  const stacked = useContext(Stacked);
  return <tbody role={stacked ? "rowgroup" : undefined}>{children}</tbody>;
}

/** A sort control for a header: the label and the direction's caret. Used by
 *  `DataTableHeader`, and alone where one header sorts two keys. */
export function DataTableSortButton({
  label,
  dir,
  onSort,
  ariaLabel,
  describedBy,
}: {
  label: ReactNode;
  /** The direction where this key is the sort; null where it is not. */
  dir: DataTableDir | null;
  onSort: () => void;
  ariaLabel?: string;
  /** The id of text that says how the column sorts, read with the button. */
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-sm focus-ring hover:text-foreground ${
        dir ? "text-foreground" : ""
      }`}
    >
      {label}
      <span aria-hidden className={`text-[10px] ${dir ? "" : "invisible"}`}>
        {dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}

/** A column header. With `sort`, the label is a button and the header carries
 *  `aria-sort` while its key is the sort. `after` stands outside the button
 *  (a tip). `children` replaces the label for a header of its own shape, and
 *  `ariaSort` then states the sort. */
export function DataTableHeader({
  label,
  sort,
  after,
  align = "left",
  sticky = "",
  ariaSort,
  className = "",
  children,
  ...rest
}: {
  label?: ReactNode;
  sort?: { dir: DataTableDir | null; onSort: () => void; ariaLabel?: string; describedBy?: string };
  after?: ReactNode;
  align?: Align;
  /** Classes that pin the header with its column (`max-sm:sticky max-sm:left-0`). */
  sticky?: string;
  ariaSort?: "ascending" | "descending";
  className?: string;
  children?: ReactNode;
} & Omit<ThHTMLAttributes<HTMLTableCellElement>, "children" | "align">) {
  const dir = sort?.dir ?? null;
  const sorted = ariaSort ?? (dir ? (dir === "asc" ? "ascending" : "descending") : undefined);
  const stacked = useContext(Stacked);
  return (
    <th
      scope="col"
      role={stacked ? "columnheader" : undefined}
      aria-sort={sorted}
      data-anatomy={sort || ariaSort ? "D2" : undefined}
      className={`${DATA_TABLE_PAD} pb-1.5 text-xs font-semibold whitespace-nowrap text-rb-500 ${
        align === "right" ? "text-right" : "text-left"
      } ${sticky ? `${sticky} z-10 bg-background` : ""} ${className}`}
      {...rest}
    >
      {children ?? (
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
          {sort ? (
            <DataTableSortButton
              label={label}
              dir={dir}
              onSort={sort.onSort}
              ariaLabel={sort.ariaLabel}
              describedBy={sort.describedBy}
            />
          ) : (
            label
          )}
          {after}
        </span>
      )}
    </th>
  );
}

/** In a linked row, every control but the covers stands above them: the
 *  row's link, other links, buttons, tips, and receipts while the inspector
 *  is armed. */
const LINKED_ROW =
  "[&_a:not([data-row-cover])]:relative [&_a:not([data-row-cover])]:z-10 [&_button]:relative [&_button]:z-10 [&_[role=button]]:relative [&_[role=button]]:z-10";

/** A body row: the block the cells draw. `href`: the whole row opens it, and
 *  one cell holds a `DataTableRowLink` to the same place. */
export function DataTableRow({
  href,
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { href?: string }) {
  const stacked = useContext(Stacked);
  return (
    <RowHref.Provider value={href ?? null}>
      <tr
        role={stacked ? "row" : undefined}
        className={`group/dt-row ${href ? LINKED_ROW : ""} ${className}`}
        data-anatomy={href ? "D4" : undefined}
        {...rest}
      >
        {children}
      </tr>
    </RowHref.Provider>
  );
}

/** The row's one focusable link, in foreground (the row's border is its cue). */
export function DataTableRowLink({
  href,
  className = "",
  children,
  ...rest
}: { href: string; className?: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children"
>) {
  return (
    <Link
      href={href}
      prefetch={false}
      data-row-link=""
      className={`text-foreground outline-none ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** A cell's cover: the row's link again, hidden from the keyboard and from a
 *  screen reader, under the cell's content. */
function RowCover({ href }: { href: string }) {
  return (
    <Link href={href} prefetch={false} tabIndex={-1} aria-hidden data-row-cover="" className="absolute inset-0 z-0" />
  );
}

/** A body cell. `rowHeader` draws `<th scope="row">`; `sticky` pins it with
 *  its stripe (`max-sm:sticky max-sm:left-0`). `pad={false}` drops the padding. */
export function DataTableCell({
  rowHeader = false,
  align = "left",
  valign = "top",
  sticky = "",
  pad = true,
  label,
  wide = false,
  className = "",
  children,
  ...rest
}: {
  /** The column's name, shown in the cell when the table stacks (D6). */
  label?: ReactNode;
  /** When the table stacks (D6), the cell takes a line of its own across
   *  the card. */
  wide?: boolean;
  rowHeader?: boolean;
  align?: Align;
  valign?: "top" | "middle";
  sticky?: string;
  pad?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<TdHTMLAttributes<HTMLTableCellElement>, "align">) {
  const href = useContext(RowHref);
  const stacked = useContext(Stacked);
  const height = useContext(RowHeight);
  const named = stacked && label ? <span className="dt-cell-label">{label}</span> : null;
  const cls = `${CELL_SURFACE} ${valign === "middle" || height ? "align-middle" : "align-top"} ${height === "one" ? "sm:h-14 sm:py-0" : height === "two" ? "sm:h-16 sm:py-0" : ""} ${wide ? "dt-cell-wide" : ""} ${href ? LINKED_CELL : ""} ${pad ? DATA_TABLE_PAD : ""} ${align === "right" ? "text-right" : "text-left"} ${
    sticky ? `${sticky} z-10` : ""
  } ${className}`;
  const cover = href ? <RowCover href={href} /> : null;
  return rowHeader ? (
    <th
      scope="row"
      role={stacked ? "rowheader" : undefined}
      className={`font-normal ${cls}`}
      {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}
    >
      {cover}
      {children}
    </th>
  ) : (
    <td role={stacked ? "cell" : undefined} className={cls} {...rest}>
      {cover}
      {named}
      {children}
    </td>
  );
}

/** The lead column's header: no visible label, its name for a screen reader. */
export function DataTableLeadHeader({ sticky = "" }: { sticky?: string }) {
  const stacked = useContext(Stacked);
  return (
    <th
      scope="col"
      role={stacked ? "columnheader" : undefined}
      className={`w-16 p-0 sm:w-[95px] ${sticky ? `${sticky} z-10 bg-background` : ""}`}
    >
      <span className="sr-only">Protocol and chain</span>
    </th>
  );
}

/** The lead cell: the protocol's tinted zone with its mark and the chain's
 *  glyph, spanning the row's height, with the protocol's and the chain's
 *  names for a screen reader. The hue runs on under the next cell, whose left
 *  corners round over it (`.dt-lead` curve in globals.css), so the row's body
 *  reads as a panel set into the hue. */
export function DataTableLeadCell({
  protocol,
  protocolName,
  chain,
  sticky = "",
}: {
  /** The `protocols.ts` id: the tint and the mark. */
  protocol: string;
  protocolName: string;
  chain: ChainId;
  sticky?: string;
}) {
  return (
    // h-px: a cell with a height lets its child fill the row's height.
    <DataTableCell
      pad={false}
      sticky={sticky}
      className="relative h-px w-16 sm:w-[95px]"
      style={hueStyle(protocol)}
      title={`${protocolName} on ${chainMeta(chain).name}`}
      data-anatomy="D5"
      data-row-zone={protocol}
      data-row-zone-chain={chainMeta(chain).name}
    >
      <span className="sr-only">{protocolName} on </span>
      <RowZone id={protocol} chain={chain} className="h-full min-h-11 w-16 rounded-l-2xl sm:w-[95px]" />
    </DataTableCell>
  );
}

/** The lead zone's mark and chain glyph for a stacked card's first line (D6),
 *  where the zone narrows to its edge; drawn only there, and silent (the lead
 *  cell names both). */
export function DataTableLeadMark({ protocol, chain }: { protocol: string; chain: ChainId }) {
  return (
    <span className="dt-lead-mark shrink-0 items-center gap-1 text-rb-500" aria-hidden>
      <ProtocolIcon id={protocol} className="h-4 w-4 shrink-0 [&:is(img)]:grayscale" />
      <ChainGlyph id={chain} className="h-4 w-4 shrink-0" />
    </span>
  );
}
