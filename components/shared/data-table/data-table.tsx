"use client";

// The house table (rails-ops ui-jobs 539): the chrome every data table shares,
// first drawn on /vaults?layout=table (ui-jobs 538). Presentational only: a
// caller keeps its data, its order, its receipts and its `data-*` hooks, and
// draws them into these parts.
// ----------------------------------------------------------------------------
// A real <table>: a caption or label, `<th scope="col">` headers, an optional
// `<th scope="row">` cell. Rows sit on the page's ground, a hairline between
// them (`--edge-row-line`). A hovered row lifts into a rounded block
// (`--surface-row-hover`) whose top and bottom lie on the hairlines above and
// below it (which it replaces while hovered, so nothing moves) and whose ends
// reach past them by the 8px corner radius, into the frame's padding. The row visuals live in
// `table.dt` (app/globals.css). The frame scrolls sideways inside itself, never
// the page; a pinned cell carries the page's ground.
//
// A LINKED ROW. `DataTableRow href` with one `DataTableRowLink` in a cell
// (the row's name, the one link a keyboard reaches). Every cell lays a hidden
// copy of the link over itself (`tabIndex={-1}`, `aria-hidden`), so a press
// anywhere on the row opens it: a cell, unlike a <tr>, positions reliably in
// every engine. Other controls and armed receipts stand above the copies.
// Hovered, or focused from the keyboard, the lifted block also takes the
// listing cards' blue border (POSITION_CARD_FRAME_BOX), and its name stays
// foreground: a clickable card takes the border, not blue text
// (standards/color-grammar.md §4a).
//
// ANATOMY (rails-ops reference/app-anatomy.md, region D): D1 the frame and
// its rows, D2 a sortable header, D3 the sideways scroll and pinned cells
// (on the frame), D4 a linked row, D5 the lead cell, D6 stacked rows (on the
// frame in D3's place), D7 a row's ⋮ menu, D8 a group's parent row and its
// children.
//
// STACKED ROWS (D6, opt-in: `DataTable stacked`; `stackBelow="lg"` for a
// table too wide for a tablet). Below sm (or lg) the same <table>
// reflows into cards by CSS (`.dt-stacked`, app/globals.css), with explicit
// ARIA roles so a screen reader still reads rows of labelled cells: the
// header row hides, the lead zone narrows to a 4px bar in the protocol's hue,
// the row header spans the card, the other cells sit two to a line, each with
// its `label`, a `wide` cell on a line of its own, an empty cell not drawn.
// The hairlines, the hover block and the linked row's border carry over;
// pinning (D3) does not apply.
//
// THE LEAD COLUMN. Where rows span protocols or chains, each row opens with
// the protocol's tinted zone (components/shared/row-zone.tsx, the wallet's
// History lead), a rounded tile inset in its cell: `DataTableLeadHeader` and
// `DataTableLeadCell`.

import Link from "next/link";
import { createPortal } from "react-dom";
import { Check, ChevronRight, EllipsisVertical } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
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

/** A pill or tag on a row: a ground that reads on the page and on the hover
 *  block; the caller adds its size and case. */
export const DATA_TABLE_PILL = "rounded-sm bg-rb-200 text-foreground/80 dark:bg-white/8 dark:text-foreground/70";

/** The row's link, which each cell's cover repeats. */
const RowHref = createContext<string | null>(null);

/** The table reads as cards below sm (D6): its parts carry explicit roles,
 *  since a reflowed table loses its own. */
const Stacked = createContext(false);

/** D1's `rowHeight`, from sm (from lg where the table stacks below lg). The
 *  class names are written out for Tailwind to find. */
const ROW_HEIGHT = {
  sm: { one: "sm:h-15 sm:py-0", two: "sm:h-17 sm:py-0", three: "sm:h-20 sm:py-0" },
  lg: { one: "lg:h-15 lg:py-0", two: "lg:h-17 lg:py-0", three: "lg:h-20 lg:py-0" },
} as const;
const RowHeight = createContext<string>("");

/** The frame and the table. `tableClassName` sets a minimum width (the frame
 *  scrolls below it) and the body's type. */
export function DataTable({
  caption,
  label,
  anatomy,
  stacked = false,
  stackBelow = "sm",
  rowHeight,
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
  /** Where the cards give way to the table: `lg` for a table too wide for a
   *  tablet (`.dt-stack-lg`). The row heights then start at lg. */
  stackBelow?: "sm" | "lg";
  /** From sm every row is one fixed height, each cell middle-aligned, the
   *  caller keeping its content inside it (a long name truncates): `one`
   *  line, 60px (room for a 36px icon); `two`, 68px (a name over a one-line
   *  sub-label); `three`, 80px (a bar over two lines of text). */
  rowHeight?: "one" | "two" | "three";
  tableClassName?: string;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    // `relative`: a visually hidden span inside a cell is placed against the
    // frame, so it never widens the page.
    // `py-px`: the hover block's border reaches 1px past a row's top and
    // bottom, and the scroll frame clips what overflows it, so the first and
    // last rows' borders need the pixel inside the frame.
    <Stacked.Provider value={stacked}>
      <RowHeight.Provider value={rowHeight ? ROW_HEIGHT[stacked ? stackBelow : "sm"][rowHeight] : ""}>
        <div
          className={`relative isolate -mx-2 max-w-[calc(100%+1rem)] overflow-x-auto px-2 py-px ${className}`}
          data-anatomy={[anatomy, "D1", stacked ? "D6" : "D3"].filter(Boolean).join(" ")}
          {...frame}
        >
          <table
            className={`dt w-full border-separate border-spacing-0 ${stacked ? "dt-stacked" : ""} ${stacked && stackBelow === "lg" ? "dt-stack-lg" : ""} ${tableClassName}`}
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
      className={`${DATA_TABLE_PAD} pb-2 text-xs font-semibold whitespace-nowrap text-rb-500 ${
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

/** A body row. `href`: the whole row opens it, and one cell holds a
 *  `DataTableRowLink` to the same place. `drawer`: the row opens under the row
 *  before it (hidden or shown), so no hairline divides the two. `child`: a
 *  row under a group's parent (`DataTableGroupRow`), indented on a lifted
 *  ground (D8). */
export function DataTableRow({
  href,
  drawer = false,
  child = false,
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { href?: string; drawer?: boolean; child?: boolean }) {
  const stacked = useContext(Stacked);
  return (
    <RowHref.Provider value={href ?? null}>
      <tr
        role={stacked ? "row" : undefined}
        className={`group/dt-row ${href ? LINKED_ROW : ""} ${className}`}
        data-anatomy={href ? "D4" : undefined}
        data-dt-drawer={drawer ? "" : undefined}
        data-dt-child={child ? "" : undefined}
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

/** An amount cell (D1): the token amount over its dollar value in muted 12px,
 *  the dollar value only where Rails reads an oracle at a named block
 *  (rails-ops decision 0047). `tag` (a cap pill) sits beside the dollars, so
 *  the cell keeps two lines; with no `value` it sits under the amount. Both
 *  lines follow the cell's alignment. */
export function DataTableAmount({ amount, value, tag }: { amount: ReactNode; value?: ReactNode; tag?: ReactNode }) {
  return (
    <span className="inline-flex flex-col leading-snug align-middle" data-dt-amount="">
      <span className="block text-foreground/80">{amount}</span>
      {(value != null || tag) && (
        <span className="block text-[12px] text-rb-500">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {value}
            {tag}
          </span>
        </span>
      )}
    </span>
  );
}

/** A cell's cover: the row's link again, hidden from the keyboard and from a
 *  screen reader, under the cell's content. */
function RowCover({ href }: { href: string }) {
  return (
    <Link href={href} prefetch={false} tabIndex={-1} aria-hidden data-row-cover="" className="absolute inset-0 z-0" />
  );
}

/** A body cell. `rowHeader` draws `<th scope="row">`; `sticky` pins it on
 *  the page's ground (`max-sm:sticky max-sm:left-0`). `pad={false}` drops the padding. */
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
  const cls = `${valign === "middle" || height ? "align-middle" : "align-top"} ${height} ${wide ? "dt-cell-wide" : ""} ${sticky ? "bg-background" : "relative"} ${pad ? DATA_TABLE_PAD : ""} ${align === "right" ? "text-right" : "text-left"} ${
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
      className={`w-[124px] p-0 ${sticky ? `${sticky} z-10 bg-background` : ""}`}
    >
      <span className="sr-only">Protocol and chain</span>
    </th>
  );
}

/** The lead cell: the protocol's tinted zone with its mark and the chain's
 *  glyph, a wide rounded tile centred in the row and shorter than it, with the
 *  protocol's and the chain's names for a screen reader. */
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
    <DataTableCell
      pad={false}
      sticky={sticky}
      valign="middle"
      className="w-[124px] p-5!"
      style={hueStyle(protocol)}
      title={`${protocolName} on ${chainMeta(chain).name}`}
      data-anatomy="D5"
      data-row-zone={protocol}
      data-row-zone-chain={chainMeta(chain).name}
    >
      <span className="sr-only">{protocolName} on </span>
      <RowZone id={protocol} chain={chain} className="h-11 w-[84px] rounded-[14px]" />
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

/** One entry of a row's ⋮ menu (D7): a button, or a link with `href`.
 *  `checked` marks an entry that is on (a vault in the comparison). */
export interface DataTableRowMenuItem {
  key: string;
  label: ReactNode;
  onSelect?: () => void;
  href?: string;
  checked?: boolean;
  hooks?: Record<`data-${string}`, string | undefined>;
}

/** A row's ⋮ menu (D7): the actions every row carries, in the row's last
 *  cell. Shown on the row's hover and keyboard focus, and always where the
 *  screen has no hover (touch); open, it stays. The menu opens in a portal,
 *  fixed under its button, since the frame's sideways scroll clips anything
 *  inside it; it follows its button on a scroll and closes on a resize,
 *  Escape or a press outside. */
export function DataTableRowMenu({ label, items }: { label: string; items: DataTableRowMenuItem[] }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = at != null;
  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
      button.current?.focus();
    };
    // A scroll moves the menu with its button; a button scrolled out of
    // sight closes it.
    const follow = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return close();
      setAt({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    menu.current
      ?.querySelector<HTMLElement>("[role=menuitem], [role=menuitemcheckbox]")
      ?.focus({ preventScroll: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const toggle = () => {
    if (open) return setAt(null);
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };
  const ITEM =
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground outline-none hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]";
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        data-row-menu=""
        data-anatomy="D7"
        className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-rb-500 transition-opacity hover:bg-[var(--surface-hover)] hover:text-foreground focus-ring group-hover/dt-row:opacity-100 group-focus-within/dt-row:opacity-100 [@media(hover:none)]:opacity-100 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        <EllipsisVertical className="h-4 w-4" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            style={{ position: "fixed", top: at.top, right: at.right }}
            className="z-50 min-w-48 rounded-lg border border-rb-200 bg-[var(--surface-overlay)] p-1 shadow-lg dark:border-rb-700"
            data-row-menu-list=""
          >
            {items.map((it) =>
              it.href ? (
                <Link
                  key={it.key}
                  href={it.href}
                  prefetch={false}
                  role="menuitem"
                  className={ITEM}
                  onClick={() => setAt(null)}
                  {...it.hooks}
                >
                  {it.label}
                </Link>
              ) : (
                <button
                  key={it.key}
                  type="button"
                  role={it.checked == null ? "menuitem" : "menuitemcheckbox"}
                  aria-checked={it.checked == null ? undefined : it.checked}
                  className={ITEM}
                  onClick={() => {
                    it.onSelect?.();
                    setAt(null);
                  }}
                  {...it.hooks}
                >
                  {it.checked != null && (
                    <Check className={`h-3.5 w-3.5 shrink-0 ${it.checked ? "" : "invisible"}`} aria-hidden />
                  )}
                  {it.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** A group's parent row (D8): a chevron, the group's name and its figures; a
 *  press anywhere on the row opens or closes the group, whose rows follow it
 *  as `DataTableRow child`. The button holds the keyboard and `aria-expanded`.
 *  Two forms: `colSpan`, one cell across the table with the figures in
 *  `summary` (a category); or `cells`, the group's own figures in the table's
 *  columns after the name cell (`DataTableCell`s), in line with its rows (a
 *  Morpho pair). `nameClassName` sets the name cell's classes in that form. */
export function DataTableGroupRow({
  open,
  onToggle,
  colSpan,
  cells,
  nameClassName = "",
  label,
  summary,
  toggleHooks,
  ...rest
}: {
  open: boolean;
  onToggle: () => void;
  label: ReactNode;
  summary?: ReactNode;
  toggleHooks?: Record<`data-${string}`, string | undefined>;
} & (
  | { colSpan: number; cells?: never; nameClassName?: never }
  | { cells: ReactNode; nameClassName?: string; colSpan?: never }
) &
  Omit<HTMLAttributes<HTMLTableRowElement>, "children" | "onClick">) {
  const stacked = useContext(Stacked);
  const name = (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="inline-flex cursor-pointer items-center gap-2 rounded-sm text-left text-[14px] font-semibold text-foreground focus-ring"
        {...toggleHooks}
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-rb-500 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        {label}
      </button>
      {summary && <span className="text-[12px] tabular-nums text-rb-500">{summary}</span>}
    </span>
  );
  return (
    <tr
      role={stacked ? "row" : undefined}
      className="group/dt-row cursor-pointer"
      data-dt-parent=""
      data-anatomy="D8"
      data-open={open ? "" : undefined}
      onClick={(e) => {
        // A control in the row (the toggle, a receipt, a link) keeps its press.
        if ((e.target as HTMLElement).closest("button, a, [role=button]") == null) onToggle();
      }}
      {...rest}
    >
      {cells == null ? (
        <th
          scope="row"
          role={stacked ? "rowheader" : undefined}
          colSpan={colSpan}
          className={`relative text-left font-normal align-middle ${DATA_TABLE_PAD} sm:h-14 sm:py-0`}
        >
          {name}
        </th>
      ) : (
        <>
          <DataTableCell rowHeader valign="middle" className={nameClassName}>
            {name}
          </DataTableCell>
          {cells}
        </>
      )}
    </tr>
  );
}
