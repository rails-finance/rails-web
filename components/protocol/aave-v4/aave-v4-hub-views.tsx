"use client";

// The /aave-v4/hubs surface as one combined view, two sections:
//   1. A hub-summary band (AaveV4HubSummaryCard × N) — hub-grain identity, size,
//      supply composition and spokes.
//   2. A cross-hub asset table — every (hub, asset) credit line flattened into
//      one sortable list. This is the workbench: sort by supply / borrow / rate /
//      utilisation, filter by class · hub · symbol.
// One filter set scopes both: the hub chips choose which band cards show and
// which rows the table keeps; class + search narrow the table (the band keeps
// its full composition — that describes the hub, not the filtered slice).
//
// No-opinionated-color rule holds throughout: hubs and asset classes are
// distinguished by label/position/neutral opacity, never a risk palette. The
// only chroma is the app's interaction blue — active filter chips and the
// drill-down links — which is navigation, not valence.

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpDown, Ban, ChevronUp, ChevronDown } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fmtUsd } from "@/lib/aave-v4/format";
import type { HubView, HubAssetAgg } from "@/lib/aave-v4/hub-view";
import { AaveV4HubSummaryCard } from "@/components/protocol/aave-v4/aave-v4-hub-summary-card";
import { flattenHubAssets, type HubAssetRow } from "@/lib/aave-v4/hub-table";
import { type AssetClass, ASSET_CLASS_TITLE, ASSET_CLASS_COLOR } from "@/lib/aave-v4/asset-class";
import { type HubTierKey, HUB_ORDER } from "@/lib/api/fetch-aave-v4-hubs";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import {
  type HubProvCoords,
  hubAssetValueProv,
  hubBorrowRateProv,
  hubDrawUtilProv,
  hubLtRangeProv,
  hubSupplyApyProv,
} from "@/lib/aave-v4/hub-provenance";

const LINK = "text-blue-500 hover:underline";

// Display order for the class filter — stablecoin first, "other" last.
const CLASS_ORDER: AssetClass[] = ["stablecoin", "eth", "btc", "gold", "other"];

// A class grouping-color dot — shared by the filter chips and the table rows.
function ClassDot({ cls }: { cls: AssetClass }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ASSET_CLASS_COLOR[cls] }} />;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function ratePct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}
function ltDisplay(a: HubAssetAgg): string {
  if (a.ltMin == null || a.ltMax == null) return "—";
  if (Math.abs(a.ltMin - a.ltMax) < 0.0001) return a.ltMin.toFixed(2);
  return `${a.ltMin.toFixed(2)}–${a.ltMax.toFixed(2)}`;
}

/** Listing URL filtered to one hub, optionally one asset on a given side —
 *  same param space the listing and the summary cards use. */
function listingHref(hub: string, asset?: { symbol: string; side: "supply" | "borrow" }): string {
  const base = `/ethereum/aave-v4?hubs=${hub}`;
  if (!asset) return base;
  const key = asset.side === "supply" ? "supplyAssets" : "borrowAssets";
  return `${base}&${key}=${encodeURIComponent(asset.symbol)}`;
}

// Filter chip — quiet at rest, interaction-blue when engaged (minimal filter UX).
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

// Compact utilisation readout for table cells. Dashed track for uncapped
// (intentional, not a missing bar); em-dash when not (meaningfully) borrowed.
function UtilMini({ a, coords }: { a: HubAssetAgg; coords: HubProvCoords }) {
  if (a.borrowedUsd < 0.01) return <span className="text-[12px] text-rb-500">—</span>;
  if (a.drawUtil == null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1 w-10 rounded-full border border-dashed border-foreground/25" />
        <span className="text-[11px] text-rb-500">uncapped</span>
      </span>
    );
  }
  const clamped = Math.max(0, Math.min(1, a.drawUtil));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-foreground/10">
        <span className="block h-full rounded-full bg-foreground/50" style={{ width: `${clamped * 100}%` }} />
      </span>
      <span className="tabular-nums text-[11px] text-rb-500">
        <Prov info={hubDrawUtilProv(a.symbol, coords)}>{pct(a.drawUtil)}</Prov>
      </span>
    </span>
  );
}

type SortKey = "asset" | "hub" | "lt" | "supplied" | "borrowed" | "rate" | "supplyApy" | "util";

export function AaveV4HubViews({ views, block }: { views: HubView[]; block?: number }) {
  // Hook first, before any state, so the receipts registry backing the whole
  // surface's <Prov> figures is stable across renders (the pilots' order).
  const registry = useReceiptRegistry();
  const [classes, setClasses] = useState<Set<AssetClass>>(new Set());
  const [hubFilter, setHubFilter] = useState<Set<HubTierKey>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("supplied");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleClass = (c: AssetClass) =>
    setClasses((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const toggleHub = (h: HubTierKey) =>
    setHubFilter((prev) => {
      const n = new Set(prev);
      if (n.has(h)) n.delete(h);
      else n.add(h);
      return n;
    });
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "asset" || k === "hub" ? "asc" : "desc");
    }
  };

  const allRows = useMemo(() => flattenHubAssets(views), [views]);
  const presentClasses = useMemo(() => {
    const s = new Set(allRows.map((r) => r.asset.cls));
    return CLASS_ORDER.filter((c) => s.has(c));
  }, [allRows]);
  const presentHubs = useMemo(() => views.map((v) => ({ hub: v.hub, label: v.label })), [views]);

  // The band is static — every hub, always. Filters scope the table only.
  const filteredRows = useMemo(
    () =>
      allRows.filter(
        (r) => (classes.size === 0 || classes.has(r.asset.cls)) && (hubFilter.size === 0 || hubFilter.has(r.hub)),
      ),
    [allRows, classes, hubFilter],
  );

  const sortedRows = useMemo(() => {
    const cmp = (a: HubAssetRow, b: HubAssetRow): number => {
      const A = a.asset;
      const B = b.asset;
      switch (sortKey) {
        case "asset":
          return A.symbol.localeCompare(B.symbol);
        case "hub":
          return HUB_ORDER.indexOf(a.hub) - HUB_ORDER.indexOf(b.hub);
        case "lt":
          return (A.ltMax ?? 0) - (B.ltMax ?? 0);
        case "supplied":
          return A.suppliedUsd - B.suppliedUsd;
        case "borrowed":
          return A.borrowedUsd - B.borrowedUsd;
        case "rate":
          return (A.borrowApr ?? -1) - (B.borrowApr ?? -1);
        case "supplyApy":
          return (A.supplyApr ?? -1) - (B.supplyApr ?? -1);
        case "util":
          return (A.drawUtil ?? -1) - (B.drawUtil ?? -1);
      }
    };
    return [...filteredRows].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));
  }, [filteredRows, sortKey, sortDir]);

  const filtersActive = classes.size > 0 || hubFilter.size > 0;
  const clearFilters = () => {
    setClasses(new Set());
    setHubFilter(new Set());
  };

  // Sortable header cell. A render helper, not a component, so it shares the
  // parent's sort state without remounting on every keystroke.
  const th = (label: string, k: SortKey, align: "left" | "right" = "left") => {
    const active = sortKey === k;
    const Caret = sortDir === "asc" ? ChevronUp : ChevronDown;
    return (
      <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider transition-colors hover:text-foreground ${
            active ? "text-foreground" : "text-rb-500"
          } ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          {label}
          {active ? <Caret className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
        </button>
      </th>
    );
  };

  return (
    <ProvReceiptsScope registry={registry}>
      {/* Section 1 — hub summary band. Static (every hub, always). The cards are
          subgrids sharing four parent row tracks, so identity / size / supply
          mix / spokes line up across all three columns. */}
      {views.length > 0 && (
        <motion.div
          className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:grid-rows-[auto_auto_auto_auto_auto] lg:gap-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {views.map((hub) => (
            <AaveV4HubSummaryCard key={hub.hub} hub={hub} block={block} />
          ))}
        </motion.div>
      )}

      {/* Section 2 — cross-hub asset table */}
      <div className="mb-3">
        <h2 className="text-[11px] uppercase tracking-wider text-rb-500">Credit lines</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
          Every asset&apos;s credit line across all hubs in one table — filter by class or hub, and sort any column.
        </p>
      </div>

      {/* Filters: asset class + hub. Quiet chips; "All" clears that dimension. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] uppercase tracking-wider text-rb-500">Class</span>
          <Chip active={classes.size === 0} onClick={() => setClasses(new Set())}>
            All
          </Chip>
          {presentClasses.map((c) => (
            <Chip key={c} active={classes.has(c)} onClick={() => toggleClass(c)}>
              <ClassDot cls={c} />
              {ASSET_CLASS_TITLE[c]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] uppercase tracking-wider text-rb-500">Hub</span>
          <Chip active={hubFilter.size === 0} onClick={() => setHubFilter(new Set())}>
            All
          </Chip>
          {presentHubs.map(({ hub, label }) => (
            <Chip key={hub} active={hubFilter.has(hub)} onClick={() => toggleHub(hub)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-lg border border-rb-200 py-12 text-center text-rb-500 dark:border-rb-800">
          <p className="mb-1">No credit lines match these filters.</p>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className={`text-[13px] ${LINK}`}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rb-200 dark:border-rb-800">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-foreground/[0.03]">
                {th("Asset", "asset")}
                {th("Hub", "hub")}
                {th("LT", "lt")}
                {th("Supplied", "supplied", "right")}
                {th("Borrowed", "borrowed", "right")}
                {th("Borrow rate", "rate", "right")}
                {th("Supply APY", "supplyApy", "right")}
                {th("Utilisation", "util")}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(({ hub, hubLabel, asset: a }) => {
                const sUsd = fmtUsd(a.suppliedUsd);
                const bUsd = fmtUsd(a.borrowedUsd);
                const hasBorrow = a.borrowedUsd >= 0.01;
                const coords: HubProvCoords = { blockNumber: block, hubLabel };
                const ltUniform = a.ltMin != null && a.ltMax != null && Math.abs(a.ltMin - a.ltMax) < 0.0001;
                return (
                  <tr
                    key={`${a.symbol}-${hub}`}
                    className="border-t border-rb-200 transition-colors hover:bg-foreground/[0.02] dark:border-rb-800"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <TokenChipIcon symbol={a.symbol} address={a.underlying} size={20} filterable={false} />
                        <div className="leading-tight">
                          <div className="text-[13px] font-medium text-foreground">{a.symbol}</div>
                          <div className="flex items-center gap-1 text-[11px] text-rb-500">
                            <ClassDot cls={a.cls} />
                            {a.classLabel}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      <Link href={listingHref(hub)} className={LINK}>
                        {hubLabel}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[13px] text-foreground/80">
                      {a.ltMin != null && a.ltMax != null ? (
                        <Prov info={hubLtRangeProv(a.symbol, a.spokeLeaves, ltUniform, coords)}>{ltDisplay(a)}</Prov>
                      ) : (
                        ltDisplay(a)
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[13px]" title={`Supplied ${sUsd.title}`}>
                      {a.suppliedUsd > 0 ? (
                        <Link href={listingHref(hub, { symbol: a.symbol, side: "supply" })} className={LINK}>
                          <Prov info={hubAssetValueProv("supplied", a.symbol, coords)}>{sUsd.display}</Prov>
                        </Link>
                      ) : (
                        <span className="text-rb-500">{sUsd.display}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[13px]" title={`Borrowed ${bUsd.title}`}>
                      {hasBorrow ? (
                        <Link href={listingHref(hub, { symbol: a.symbol, side: "borrow" })} className={LINK}>
                          <Prov info={hubAssetValueProv("borrowed", a.symbol, coords)}>{bUsd.display}</Prov>
                        </Link>
                      ) : a.canBorrow === false ? (
                        // Structurally not borrowable (collateral-only) — a no-entry
                        // mark, distinct from a borrowable asset that just has no
                        // draws yet.
                        <span
                          className="inline-flex items-center justify-end gap-1 text-rb-500/70"
                          title="Not borrowable in this hub"
                        >
                          <Ban className="h-3.5 w-3.5" aria-label="Not borrowable" />
                        </span>
                      ) : (
                        <span className="text-rb-500">no borrows</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
                      title="Current variable borrow rate (the hub's drawnRate)"
                    >
                      {hasBorrow && a.borrowApr != null ? (
                        <Prov info={hubBorrowRateProv(a.symbol, a.rateSourceSpoke, coords)}>
                          {ratePct(a.borrowApr)}
                        </Prov>
                      ) : (
                        <span className="text-rb-500">—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
                      title="Supplier yield: borrow rate × utilisation × (1 − liquidity fee)"
                    >
                      {a.supplyApr != null ? (
                        <Prov info={hubSupplyApyProv(a.symbol, coords)}>{ratePct(a.supplyApr)}</Prov>
                      ) : (
                        <span className="text-rb-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <UtilMini a={a} coords={coords} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
