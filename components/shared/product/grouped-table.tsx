"use client";

// A roster's markets as one house table grouped by an axis the protocol
// measures in (anatomy R1.1, rails-ops ui-jobs 549): one `ProvSection` with its
// heading, line and ⋮, then each group a disclosure headed by its name and the
// group's own figures, the first group open on arrival. Each group is one D1
// table (D4 linked rows, D6 cards below lg) sharing one sort. A row's first
// cell holds the pair's marks, its name (the row's one link, carrying its
// receipt) and a line under it. Each row is a bounds-free receipts scope inside
// the section's, so the section's ⋮ arms every value in it.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { TokenPairIcons, type PairToken } from "@/components/shared/token-pair-icons";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
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
      <DataTableRow href={r.href} {...r.hooks}>
        <DataTableCell rowHeader className="whitespace-nowrap">
          <span className="flex items-center gap-2.5">
            <TokenPairIcons first={r.icons.first} second={r.icons.second} fixed />
            <span className="min-w-0 leading-tight">
              <span className="block text-[13px] font-medium text-foreground">
                {r.href ? <DataTableRowLink href={r.href}>{r.name}</DataTableRowLink> : r.name}
              </span>
              {r.sub && <span className="block text-[11px] text-rb-500">{r.sub}</span>}
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
        {t.groups.map((g) => {
          const id = `${t.scope}-group-${g.key}`;
          const isOpen = open.has(g.key);
          return (
            <div
              key={g.key}
              className="border-t border-rb-200 py-2 first:border-t-0 dark:border-rb-800"
              data-row-group={g.key}
              {...g.hooks}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={id}
                  onClick={() => toggle(g.key)}
                  className="inline-flex items-center gap-1.5 text-left text-[14px] font-semibold text-foreground"
                  data-row-group-toggle={g.key}
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-rb-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden
                  />
                  {g.label}
                </button>
                {g.summary && <span className="text-[12px] tabular-nums text-rb-500">{g.summary}</span>}
              </div>
              {isOpen && (
                <div id={id} className="mt-2">
                  <DataTable
                    label={typeof g.label === "string" ? g.label : `${t.title}: ${g.key}`}
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
                      {(sorted.get(g.key) ?? []).map((r) => (
                        <Row key={r.key} r={r} columns={t.columns} />
                      ))}
                    </DataTableBody>
                  </DataTable>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {t.foot}
    </ProvSection>
  );
}
