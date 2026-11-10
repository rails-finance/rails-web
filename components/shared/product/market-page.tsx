"use client";

// A market page (archetype A2, rails-ops ui-jobs 549; anatomy M1): the page
// header, the head (`ProductHeadSection`: heading row with the read stamp and
// ⋮, the vitals band, the (i)), then the reserves section, its own receipts
// scope with its own ⋮: the heading, one line, the group chips, and one house
// table (D1, D2, D4, D6 below lg) of the family's columns. Each row is a D4
// linked row to its page where it has one; its asset cell holds the mark, the
// symbol (the row's one link), the state tags, the chips (548's hubs), the
// line under it and a control at its right (Aave's Details). Every header
// sorts; below lg a select and a direction button drive the same sort.
//
// Each row is a bounds-free receipts scope inside the section's, so the
// inspector pins a row's receipts to it and the section's ⋮ still arms them.

import { useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { assetKey } from "@/lib/shared/asset-family";
import { protocolForPathname } from "@/lib/shared/protocols";
import { AimGate } from "@/components/shared/aim-gate";
import { rowAssetKeys } from "@/lib/shared/focus-row-keys";
import { ArrowDown, ArrowUp } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ProtocolEntry } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import type {
  Hooks,
  Loadable,
  MarketModel,
  ReserveRowModel,
  ReserveTableModel,
  SortKey,
} from "@/lib/shared/product/model";
import { ProductHeadSection, ProductSectionBlock, ToolsFor } from "@/components/shared/product/product-head";

/** The page header every product page draws above its head. */
export interface ProductPageHeader {
  protocol: ProtocolEntry;
  title: string;
  learnMore?: LearnMoreContent;
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

const sortOf = (r: ReserveRowModel, key: string): SortKey | undefined =>
  key === "asset" ? (r.asset.sort ?? r.asset.symbol) : r.cells[key]?.sort;

// Filter chip: quiet at rest, interaction-blue when engaged.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
        active
          ? "border-teal-500 bg-teal-500/10 text-foreground"
          : "border-raised bg-raised text-rb-500 hover:border-teal-500/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

const Dot = ({ color }: { color: string }) => (
  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
);

/** One row: a keyed component so it owns its receipts registry. */
function Row({ r, t }: { r: ReserveRowModel; t: ReserveTableModel }) {
  const registry = useReceiptRegistry();
  const symbol = r.asset.receipt ? <Prov info={r.asset.receipt}>{r.asset.symbol}</Prov> : r.asset.symbol;
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <DataTableRow data-reserve-row={r.key} href={r.href} {...r.hooks}>
        <DataTableCell rowHeader>
          <div className="flex items-center gap-3">
            <TokenChipIcon symbol={r.asset.symbol} address={r.asset.address} size={36} filterable={false} />
            <div className="min-w-0 flex-1 leading-snug">
              <div className="flex flex-wrap items-center gap-x-1.5 text-[14px] font-medium text-foreground">
                {r.href ? (
                  <DataTableRowLink href={r.href} data-reserve-link={r.key}>
                    {symbol}
                  </DataTableRowLink>
                ) : (
                  symbol
                )}
                {r.asset.tags}
                {r.asset.chips}
              </div>
              {r.asset.sub && <div className="text-[12px] text-rb-500">{r.asset.sub}</div>}
            </div>
            {r.asset.details}
          </div>
        </DataTableCell>
        {t.columns.map((c) => {
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

/** The reserves section: heading and ⋮, line, chips, table. */
export function ReserveTableSection({ t }: { t: ReserveTableModel }) {
  // Focus (ui-jobs 557): the reserves whose asset is in focus, on the
  // explorer's chain; the note says what it hid.
  const chain = protocolForPathname(usePathname())?.chainId ?? 1;
  const scoped = useScopedRows(
    t.rows,
    (r) => [assetKey(chain, r.asset.address)],
    () => chain,
  );
  const rows = scoped.rows;
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState(t.defaultSort.key);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(t.defaultSort.dir);
  const keys = ["asset", ...t.columns.map((c) => c.key)];
  const labelOf = (k: string) => (k === "asset" ? t.assetLabel : (t.columns.find((c) => c.key === k)?.label ?? k));
  const pickSort = (k: string) => {
    setSortKey(k);
    setSortDir(k === "asset" ? "asc" : "desc");
  };
  const toggleSort = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else pickSort(k);
  };
  const toggleGroup = (g: string) =>
    setGroups((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  const present = useMemo(() => {
    const s = new Set(rows.map((r) => r.group));
    return (t.groups ?? []).filter((g) => s.has(g.key));
  }, [rows, t.groups]);
  const filtered = useMemo(
    () => rows.filter((r) => groups.size === 0 || (r.group != null && groups.has(r.group))),
    [rows, groups],
  );
  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * compare(sortOf(a, sortKey), sortOf(b, sortKey)));
  }, [filtered, sortKey, sortDir]);
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
    <ProvSection scope={t.scope} data-reserves-section="">
      <SectionHeading title={t.title} menu={<ToolsFor scope={t.scope} title={t.title} tools={t.tools} />}>
        {t.line && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">{t.line}</p>}
      </SectionHeading>

      <ScopeNote
        scoped={scoped}
        noun={[t.assetLabel.toLowerCase(), `${t.assetLabel.toLowerCase()}s`]}
        className="mt-2"
      />

      {present.length > 0 && (
        <div className="mb-4 mt-3 flex flex-wrap items-center gap-1.5">
          {t.groupLabel && (
            <span className="mr-0.5 text-[11px] uppercase tracking-wider text-rb-500">{t.groupLabel}</span>
          )}
          <Chip active={groups.size === 0} onClick={() => setGroups(new Set())}>
            All
          </Chip>
          {present.map((g) => (
            <Chip key={g.key} active={groups.has(g.key)} onClick={() => toggleGroup(g.key)}>
              <Dot color={g.color} />
              {g.label}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 && rows.length === 0 && scoped.on ? null : filtered.length === 0 ? (
        <div className="rounded-lg border border-rb-200 py-12 text-center text-rb-500 dark:border-rb-800">
          <p className="mb-1">{t.emptyFiltered}</p>
          <button type="button" onClick={() => setGroups(new Set())} className={`text-[13px] ${INLINE_LINK}`}>
            Clear filter
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 lg:hidden" data-mobile-sort="">
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-rb-500">
              Sort by
              <select
                value={sortKey}
                onChange={(e) => pickSort(e.target.value)}
                className="rounded-md border border-rb-200 bg-background px-2 py-1 text-base sm:text-[12px] normal-case tracking-normal text-foreground dark:border-rb-800"
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
          <DataTable
            label={t.label}
            tableClassName={t.tableClassName}
            anatomy={t.anatomy}
            stacked
            stackBelow="lg"
            rowHeight="two"
          >
            <DataTableHead>
              {th("asset", t.assetLabel)}
              {t.columns.map((c) => th(c.key, c.label, c.align, c.tip))}
            </DataTableHead>
            <DataTableBody>
              {sorted.map((r) => (
                <Row key={r.key} r={r} t={t} />
              ))}
            </DataTableBody>
          </DataTable>
        </>
      )}
    </ProvSection>
  );
}

/** The loading block in a product page's body. */
export function ProductLoading({ height }: { height?: number }) {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="animate-pulse">
      <SkeletonBlock height={height ?? sizes["page-table"]} />
    </div>
  );
}

/** A read that failed, in a product page's body. */
export function ProductFailed({ what, message }: { what: string; message: string }) {
  return (
    <div className="py-12 text-center text-rb-500">
      <p className="mb-1">Couldn&apos;t read {what} from chain.</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** A market's head, its reserves and its sections, or its loading and failure
 *  states. With `headOnly` all but the head are left off (an A1 panel). */
export function MarketBody({
  market,
  what,
  headOnly = false,
}: {
  market: Loadable<MarketModel>;
  /** The market's name, for the failure line. */
  what: string;
  /** An R1 panel: the head alone, under its title. A market page (R2) is one
   *  object named by its h1 and header, so its head draws no title. */
  headOnly?: boolean;
}) {
  if (market.state === "loading") return headOnly ? <SkeletonBlock height={260} /> : <ProductLoading />;
  if (market.state === "error") return <ProductFailed what={what} message={market.message} />;
  return (
    <>
      <ProductHeadSection head={market.data.head} titled={headOnly} />
      {!headOnly && market.data.reserves && <ReserveTableSection t={market.data.reserves} />}
      {!headOnly && market.data.sections?.map((s) => <ProductSectionBlock key={s.scope} s={s} />)}
    </>
  );
}

/** The keys a market page is judged by under Focus: the family's own object
 *  (its tokens, read by lib/shared/focus-row-keys.ts), else its reserves. */
function marketFocusKeys(chain: number, market: Loadable<MarketModel>, focusSource: unknown): string[] {
  if (focusSource != null) return rowAssetKeys(focusSource, chain);
  if (market.state !== "ok" || !market.data.reserves) return [];
  return market.data.reserves.rows.map((r) => assetKey(chain, r.asset.address));
}

export function MarketPage({
  header,
  market,
  what,
  children,
  hooks,
  focusSource,
}: {
  header: ProductPageHeader;
  market: Loadable<MarketModel>;
  what: string;
  /** Focus (ui-jobs 557): the object whose tokens name this market (a Pendle
   *  market's tokens, a vault's pair), where it has no reserves table. A
   *  market none of whose tokens is in focus is gated whole. */
  focusSource?: unknown;
  /** Sections the family draws after the model's, once the market has read:
   *  "Supplied by vaults", a positions listing. Each is its own `ProvSection`. */
  children?: ReactNode;
  hooks?: Hooks;
}) {
  return (
    <div className="min-h-screen" data-anatomy="R2" {...hooks}>
      <div className="py-8">
        <SubPageHeader protocol={header.protocol} title={header.title} learnMore={header.learnMore} />
        <div data-skel-section="page-table">
          <FocusMarketGate keys={marketFocusKeys(header.protocol.chainId, market, focusSource)} what={what}>
            <MarketBody market={market} what={what} />
            {market.state === "ok" && children}
          </FocusMarketGate>
        </div>
      </div>
    </div>
  );
}

/** A market page with tokens to judge is gated by them; one with none yet
 *  (loading, or a family that names none) draws whole. */
function FocusMarketGate({ keys, what, children }: { keys: string[]; what: string; children: ReactNode }) {
  if (keys.length === 0) return <>{children}</>;
  const name = what.replace(/^the /, "");
  return (
    <AimGate keys={keys} what={`${name.charAt(0).toUpperCase()}${name.slice(1)}`}>
      {children}
    </AimGate>
  );
}
