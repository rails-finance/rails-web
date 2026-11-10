"use client";

// A roster's markets as one house table grouped by an axis the protocol
// measures in (anatomy R1.1, rails-ops ui-jobs 549): one `ProvSection` with its
// heading, line and ⋮, then one D1 table (D4 linked rows, D6 cards below lg)
// under one header and one sort, each group a parent row (D8) with its name
// and figures that opens into its markets as indented child rows, the first
// group open on arrival. A row's first cell holds the pair's marks, its name
// (the row's one link, carrying its receipt) and a muted line under it. Each row is a bounds-free receipts scope inside
// the section's, so the section's ⋮ arms every value in it.

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { TokenPairIcons, type PairToken } from "@/components/shared/token-pair-icons";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableGroupRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { ToolsFor } from "@/components/shared/product/product-head";
import type { Hooks, ReserveCell, ReserveColumn, SectionTools, SortKey } from "@/lib/shared/product/model";

/** One market in a grouped table. */
export interface GroupedRow {
  key: string;
  href?: string;
  icons: { first: PairToken; second?: PairToken | null };
  /** The market's name, drawn with its receipt. */
  name: ReactNode;
  /** A line under the name. */
  sub?: ReactNode;
  sort: SortKey;
  cells: Record<string, ReserveCell>;
  hooks?: Hooks;
}

export interface RowGroup {
  key: string;
  /** "V1 · 57 markets". */
  label: ReactNode;
  /** The group's figures, after its label. */
  summary?: ReactNode;
  rows: GroupedRow[];
  hooks?: Hooks;
}

export interface GroupedTableModel {
  scope: string;
  title: string;
  line?: ReactNode;
  anatomy: string;
  /** The first column's heading: "Market", "Vault". */
  nameLabel: string;
  columns: ReserveColumn[];
  groups: RowGroup[];
  defaultSort: { key: string; dir: "asc" | "desc" };
  tools: SectionTools;
  tableClassName?: string;
  hooks?: Hooks;
  /** A line under the groups. */
  foot?: ReactNode;
}

function compare(a: SortKey | undefined, b: SortKey | undefined): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1;
  if (typeof a === "string" || typeof b === "string") return String(a).localeCompare(String(b));
  const xs = typeof a === "number" ? [a] : a;
  const ys = typeof b === "number" ? [b] : b;
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const d = (xs[i] ?? 0) - (ys[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function Row({ r, columns }: { r: GroupedRow; columns: ReserveColumn[] }) {
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <DataTableRow href={r.href} child {...r.hooks}>
        <DataTableCell rowHeader className="whitespace-nowrap">
          <span className="flex items-center gap-3">
            <TokenPairIcons first={r.icons.first} second={r.icons.second} fixed />
            <span className="min-w-0 leading-snug">
              <span className="block text-[14px] font-medium text-foreground">
                {r.href ? <DataTableRowLink href={r.href}>{r.name}</DataTableRowLink> : r.name}
              </span>
              {r.sub && <span className="block text-[12px] text-rb-500">{r.sub}</span>}
            </span>
          </span>
        </DataTableCell>
        {columns.map((c) => {
          const cell = r.cells[c.key];
          return (
            <DataTableCell
              key={c.key}
              align={c.align}
              className={c.className}
              wide={c.wide}
              title={cell?.title}
              label={c.tip ? <span title={c.tip}>{c.label}</span> : c.label}
              {...c.hooks}
            >
              {cell?.node}
            </DataTableCell>
          );
        })}
      </DataTableRow>
    </ProvReceiptsScope>
  );
}

export function GroupedMarketsTable({ t }: { t: GroupedTableModel }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(t.groups[0] ? [t.groups[0].key] : []));
  const [sortKey, setSortKey] = useState(t.defaultSort.key);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(t.defaultSort.dir);
  const keys = ["name", ...t.columns.map((c) => c.key)];
  const labelOf = (k: string) => (k === "name" ? t.nameLabel : (t.columns.find((c) => c.key === k)?.label ?? k));
  const pickSort = (k: string) => {
    setSortKey(k);
    setSortDir(k === "name" ? "asc" : "desc");
  };
  const toggleSort = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else pickSort(k);
  };
  const toggle = (k: string) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    const of = (r: GroupedRow) => (sortKey === "name" ? r.sort : r.cells[sortKey]?.sort);
    return new Map(t.groups.map((g) => [g.key, [...g.rows].sort((a, b) => sign * compare(of(a), of(b)))]));
  }, [t.groups, sortKey, sortDir]);
  const th = (k: string, label: string, align: "left" | "right" = "left", tip?: string) => (
    <DataTableHeader
      key={k}
      label={label}
      align={align}
      title={tip ? `${tip}. Click to sort.` : undefined}
      sort={{ dir: sortKey === k ? sortDir : null, onSort: () => toggleSort(k), ariaLabel: `Sort by ${label}` }}
    />
  );

  return (
    <ProvSection scope={t.scope} className="mb-8" data-anatomy={t.anatomy} data-skel-section="page-table" {...t.hooks}>
      <SectionHeading title={t.title} menu={<ToolsFor scope={t.scope} title={t.title} tools={t.tools} />}>
        {t.line && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">{t.line}</p>}
      </SectionHeading>
      <div className="mb-2 mt-3 flex items-center gap-2 lg:hidden" data-mobile-sort="">
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-rb-500">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => pickSort(e.target.value)}
            className="rounded-md border border-rb-200 bg-background px-2 py-1 text-base normal-case tracking-normal text-foreground sm:text-[12px] dark:border-rb-800"
          >
            {keys.map((k) => (
              <option key={k} value={k}>
                {labelOf(k)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          aria-label={sortDir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"}
          className="inline-flex items-center gap-1 rounded-md border border-rb-200 px-2 py-1 text-[12px] text-foreground dark:border-rb-800"
        >
          {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          {sortDir === "asc" ? "Low first" : "High first"}
        </button>
      </div>
      <div className="mt-3">
        <DataTable
          label={t.title}
          stacked
          stackBelow="lg"
          rowHeight="two"
          tableClassName={t.tableClassName ?? "text-[13px] lg:min-w-[56rem]"}
        >
          <DataTableHead>
            {th("name", t.nameLabel)}
            {t.columns.map((c) => th(c.key, c.label, c.align, c.tip))}
          </DataTableHead>
          <DataTableBody>
            {t.groups.map((g) => {
              const isOpen = open.has(g.key);
              return (
                <Fragment key={g.key}>
                  <DataTableGroupRow
                    open={isOpen}
                    onToggle={() => toggle(g.key)}
                    colSpan={t.columns.length + 1}
                    label={g.label}
                    summary={g.summary}
                    data-row-group={g.key}
                    toggleHooks={{ "data-row-group-toggle": g.key }}
                    {...g.hooks}
                  />
                  {isOpen && (sorted.get(g.key) ?? []).map((r) => <Row key={r.key} r={r} columns={t.columns} />)}
                </Fragment>
              );
            })}
          </DataTableBody>
        </DataTable>
      </div>
      {t.foot}
    </ProvSection>
  );
}
