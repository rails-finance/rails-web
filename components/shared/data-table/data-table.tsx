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
// THE LEAD COLUMN. Where rows span protocols or chains, each row opens with
// the protocol's tinted zone (components/shared/row-zone.tsx, the wallet's
// History lead): `DataTableLeadHeader` and `DataTableLeadCell`.

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
import { RowZone } from "@/components/shared/row-zone";
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

/** The frame and the table. `tableClassName` sets a minimum width (the frame
 *  scrolls below it) and the body's type. */
export function DataTable({
  caption,
  label,
  tableClassName = "",
  className = "",
  children,
  ...frame
}: {
  /** Visually hidden; read before the table. */
  caption?: ReactNode;
  /** The table's accessible name where there is no caption. */
  label?: string;
  tableClassName?: string;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    // `relative`: a visually hidden span inside a cell is placed against the
    // frame, so it never widens the page.
    <div className={`relative max-w-full overflow-x-auto ${className}`} {...frame}>
      <table
        className={`w-full border-separate border-spacing-x-0 border-spacing-y-1 ${tableClassName}`}
        aria-label={caption ? undefined : label}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

/** The header row. */
export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

/** A sort control for a header: the label and the direction's caret. Used by
 *  `DataTableHeader`, and alone where one header sorts two keys. */
export function DataTableSortButton({
  label,
  dir,
  onSort,
  ariaLabel,
}: {
  label: ReactNode;
  /** The direction where this key is the sort; null where it is not. */
  dir: DataTableDir | null;
  onSort: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      aria-label={ariaLabel}
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
  sort?: { dir: DataTableDir | null; onSort: () => void; ariaLabel?: string };
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
  return (
    <th
      scope="col"
      aria-sort={sorted}
      className={`${DATA_TABLE_PAD} pb-1.5 text-xs font-semibold whitespace-nowrap text-rb-500 ${
        align === "right" ? "text-right" : "text-left"
      } ${sticky ? `${sticky} z-10 bg-background` : ""} ${className}`}
      {...rest}
    >
      {children ?? (
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
          {sort ? (
            <DataTableSortButton label={label} dir={dir} onSort={sort.onSort} ariaLabel={sort.ariaLabel} />
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
  return (
    <RowHref.Provider value={href ?? null}>
      <tr className={`group/dt-row ${href ? LINKED_ROW : ""} ${className}`} {...rest}>
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
  className = "",
  children,
  ...rest
}: {
  rowHeader?: boolean;
  align?: Align;
  valign?: "top" | "middle";
  sticky?: string;
  pad?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<TdHTMLAttributes<HTMLTableCellElement>, "align">) {
  const href = useContext(RowHref);
  const cls = `${CELL_SURFACE} ${valign === "middle" ? "align-middle" : "align-top"} ${href ? LINKED_CELL : ""} ${pad ? DATA_TABLE_PAD : ""} ${align === "right" ? "text-right" : "text-left"} ${
    sticky ? `${sticky} z-10` : ""
  } ${className}`;
  const cover = href ? <RowCover href={href} /> : null;
  return rowHeader ? (
    <th scope="row" className={`font-normal ${cls}`} {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}>
      {cover}
      {children}
    </th>
  ) : (
    <td className={cls} {...rest}>
      {cover}
      {children}
    </td>
  );
}

/** The lead column's header: no visible label, its name for a screen reader. */
export function DataTableLeadHeader({ sticky = "" }: { sticky?: string }) {
  return (
    <th scope="col" className={`w-16 p-0 sm:w-[95px] ${sticky ? `${sticky} z-10 bg-background` : ""}`}>
      <span className="sr-only">Protocol and chain</span>
    </th>
  );
}

/** The lead cell: the protocol's tinted zone with its mark and the chain's
 *  glyph, spanning the row's height, with the protocol's and the chain's
 *  names for a screen reader. */
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
      className="h-px w-16 sm:w-[95px]"
      title={`${protocolName} on ${chainMeta(chain).name}`}
      data-row-zone={protocol}
    >
      <span className="sr-only">{protocolName} on </span>
      <RowZone id={protocol} chain={chain} className="h-full min-h-11 w-16 rounded-l-2xl sm:w-[95px]" />
    </DataTableCell>
  );
}
