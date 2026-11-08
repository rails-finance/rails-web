"use client";

// The cross-protocol vault index as a table (rails-ops ui-jobs 538, V6): the
// rows of `/vaults`, drawn inside the shared roster's controls.
// ----------------------------------------------------------------------------
// One row per vault in the house table (components/shared/data-table): the
// lead zone (the protocol's tint, mark and chain, named for a screen reader
// and in its tooltip), Vault (the asset's icon, the name linking the vault's
// page under its protocol, the standing pills beneath where there are any),
// then Total assets, Share price, Yield and Holders (the census's open
// count). The figures print as the row prints them (vaultHeads, yieldText) as
// plain values: the index carries no receipts (Miles, 8 Nov 2026), and each
// vault's page keeps them.
//
// SORT. Each column header is a button; the sort lives in `?sort=` and
// `?dir=`, each written only off its default (Holders, most first, as the
// rosters' cards open). Total assets and Share price are amounts in the vault's
// asset, so they sort by token (A to Z) and by the amount inside each token:
// two quantities of one token are the only amounts compared (decision 0028
// point 8: no USD, no cross-asset total); each header's "?" says so, and the
// sort button reads the same words. Yield and Holders compare across
// every row. A vault with no figure for the key sorts last, both ways; on
// Yield an illiquid vault (ui-jobs 540) sorts after the other figures.
//
// The whole row links the vault's page (the name is the one focusable link).
// BELOW sm each row reads as a card (D6): the protocol's hue as its left edge,
// the mark and chain beside the asset's icon, the name across, the figures
// two by two under their labels; a select and a direction button sort.

import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import type { ChainId } from "@/lib/shared/chains";
import { RevealTip } from "@/components/shared/reveal-tip";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { AssetUnit } from "@/components/shared/asset-unit";
import {
  DATA_TABLE_PILL,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableLeadCell,
  DataTableLeadHeader,
  DataTableLeadMark,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { STANDING_WORD, vaultHeads, YIELD_LABEL_TIP } from "@/components/vaults/vault-heads";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { VAULT_INDEX_PROTOCOL_LABEL, vaultIndexProtocol } from "@/lib/vaults/index-rosters";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import { yieldText, type VaultYield } from "@/lib/vaults/yield";
import { illiquidSentence } from "@/lib/vaults/illiquid";
import { formatCompact } from "@/lib/shared/format-compact";
import { sharePriceText } from "@/lib/shared/vault-amount-text";

type SortKey = "vault" | "assets" | "price" | "yield" | "holders";

interface Column {
  key: SortKey;
  label: string;
  /** The direction a first press sorts in. */
  first: "asc" | "desc";
  numeric: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: "vault", label: "Vault", first: "asc", numeric: false },
  { key: "assets", label: "Total assets", first: "desc", numeric: true },
  { key: "price", label: "Share price", first: "desc", numeric: true },
  { key: "yield", label: "Yield", first: "desc", numeric: true },
  { key: "holders", label: "Holders", first: "desc", numeric: true },
];

const DEFAULT_SORT: SortKey = "holders";

/** How an amount in the vault's asset sorts: by token, then inside it. */
const SORT_NOTE: Partial<Record<SortKey, string>> = {
  assets: "Sorts by token, then by total assets within each token.",
  price: "Sorts by token, then by share price within each token.",
};

/** The token a vault's amounts are in: its symbol across chains, its address
 *  where the symbol did not decode (the Token facet's value). */
const tokenOf = (v: VaultSummary) => (v.asset.named ? v.asset.symbol : v.asset.address);

const nameOf = (v: VaultSummary) => vaultDisplayName(v) ?? v.address;

/** The key's figure; null sorts last both ways. */
function figureOf(key: SortKey, v: VaultSummary, y: VaultYield | undefined): number | null {
  switch (key) {
    case "assets":
      return v.totalAssets?.value ?? null;
    case "price":
      return v.sharePrice?.value ?? null;
    case "yield":
      return y && "yearly" in y ? y.yearly : null;
    case "holders":
      return v.census?.live ?? null;
    default:
      return null;
  }
}

function comparator(key: SortKey, dir: "asc" | "desc", yieldOf: (v: VaultSummary) => VaultYield | undefined) {
  const sign = dir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, "en-US", { sensitivity: "base" });
  const byToken = (a: VaultSummary, b: VaultSummary) => text(tokenOf(a), tokenOf(b));
  const byName = (a: VaultSummary, b: VaultSummary) => text(nameOf(a), nameOf(b)) || a.address.localeCompare(b.address);
  return (a: VaultSummary, b: VaultSummary): number => {
    if (key === "vault") return sign * byName(a, b) || a.chainId - b.chainId;
    // An amount in the asset compares inside its token only.
    const within = key === "assets" || key === "price" ? byToken(a, b) : 0;
    if (within !== 0) return within;
    const fa = figureOf(key, a, yieldOf(a));
    const fb = figureOf(key, b, yieldOf(b));
    // Yield: an illiquid vault's figure is interest accruing on debt nobody
    // repays (ui-jobs 540), so it sorts after every other figure, both ways,
    // and before the rows with none.
    if (key === "yield" && fa != null && fb != null && Boolean(a.illiquid) !== Boolean(b.illiquid))
      return a.illiquid ? 1 : -1;
    if (fa == null || fb == null) {
      if (fa != null) return -1;
      if (fb != null) return 1;
    } else if (fa !== fb) return sign * (fa - fb);
    return byToken(a, b) || byName(a, b) || a.chainId - b.chainId;
  };
}

const n = (x: number) => x.toLocaleString("en-US");

/** A figure in the vault's asset, its unit after it (`AssetUnit`). */
function InAsset({ v, children, ...rest }: { v: VaultSummary; children: ReactNode; "data-cell": string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" {...rest}>
      <span>{children}</span>
      <AssetUnit symbol={v.asset.symbol} address={v.asset.address} named={v.asset.named} />
    </span>
  );
}

/** A standing pill on a row, on the table's pill ground. */
const PILL = `${DATA_TABLE_PILL} px-1.5 py-0.5 text-[11px]`;

export function VaultIndexTable({
  rows,
  part,
  initialSearch,
  yieldOf,
  leadOf,
  hrefOf,
  holdersHrefOf,
  hooksOf,
}: {
  rows: readonly VaultSummary[];
  /** Which rows: the funded vaults, or the ones that hold nothing. */
  part: "funded" | "empty";
  initialSearch: string;
  yieldOf: (v: VaultSummary) => VaultYield | undefined;
  /** The lead zone's `protocols.ts` id (the roster entry the vault's
   *  directory sits under); null falls back to the family's venue. */
  leadOf: (v: VaultSummary) => string | null;
  hrefOf: (v: VaultSummary) => string;
  holdersHrefOf: (v: VaultSummary) => string | null;
  hooksOf: (v: VaultSummary) => Record<string, string>;
}) {
  const sp = useUrlSearchParams(initialSearch);
  const sortParam = sp.get("sort");
  const sort: SortKey = COLUMNS.some((c) => c.key === sortParam) ? (sortParam as SortKey) : DEFAULT_SORT;
  const column = COLUMNS.find((c) => c.key === sort)!;
  const dirParam = sp.get("dir");
  const dir: "asc" | "desc" = dirParam === "asc" || dirParam === "desc" ? dirParam : column.first;

  /** Writes the sort to the URL, each param only off its default. */
  const writeSort = useCallback((key: SortKey, nextDir: "asc" | "desc") => {
    const col = COLUMNS.find((c) => c.key === key)!;
    const p = new URLSearchParams(window.location.search);
    if (key === DEFAULT_SORT) p.delete("sort");
    else p.set("sort", key);
    if (nextDir === col.first) p.delete("dir");
    else p.set("dir", nextDir);
    const qs = p.toString().replace(/%2C/gi, ",");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  }, []);
  /** A header's press: the same key flips, another key takes its first direction. */
  const press = (key: SortKey) =>
    writeSort(key, key === sort ? (dir === "asc" ? "desc" : "asc") : COLUMNS.find((c) => c.key === key)!.first);

  const sorted = [...rows].sort(comparator(sort, dir, yieldOf));

  // A header's "?": Yield's marks the figure as Rails's interpretation, as on
  // the row; Total assets' and Share price's say how the column sorts, the
  // same words read with the sort button.
  const headerTip = (key: SortKey) => {
    const tip = key === "yield" ? YIELD_LABEL_TIP : SORT_NOTE[key];
    if (!tip) return null;
    return (
      <>
        <RevealTip
          tip={tip}
          label={`${COLUMNS.find((c) => c.key === key)!.label}: ${tip}`}
          focusable
          wrap
          className="focus-ring rounded-sm"
        >
          <span className="tip-underline text-[10px]" data-header-tip={key}>
            ?
          </span>
        </RevealTip>
        {SORT_NOTE[key] && (
          <span id={`${part}-sort-note-${key}`} className="sr-only">
            {tip}
          </span>
        )}
      </>
    );
  };

  return (
    <div data-vault-table={part} data-anatomy="V6">
      {/* Below sm the header row is hidden (D6): the sort is a select and a
          direction button, writing the same params; the funded table's
          control sorts both tables. */}
      {part === "funded" && (
        <div className="mb-3 sm:hidden" data-mobile-sort="">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-rb-500">
              Sort by
              <select
                value={sort}
                onChange={(e) => {
                  const key = e.target.value as SortKey;
                  writeSort(key, COLUMNS.find((c) => c.key === key)!.first);
                }}
                className="rounded-md border border-rb-200 bg-background px-2 py-1 text-base text-foreground dark:border-rb-700"
                aria-describedby={SORT_NOTE[sort] ? `${part}-mobile-sort-note` : undefined}
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => writeSort(sort, dir === "asc" ? "desc" : "asc")}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-rb-200 px-2 py-1 text-[12px] text-foreground focus-ring dark:border-rb-700"
              aria-label={dir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"}
              data-mobile-sort-dir={dir}
            >
              <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>
              {column.numeric ? (dir === "asc" ? "Low first" : "High first") : dir === "asc" ? "A to Z" : "Z to A"}
            </button>
          </div>
          {SORT_NOTE[sort] && (
            <p id={`${part}-mobile-sort-note`} className="mt-1.5 text-[12px] text-rb-500" data-mobile-sort-note="">
              {SORT_NOTE[sort]}
            </p>
          )}
        </div>
      )}
      <DataTable
        caption={`${part === "funded" ? "Vaults" : "Vaults that hold nothing"}; total assets and share price are in each vault’s asset`}
        tableClassName="min-w-[640px] text-sm"
        stacked
        rowHeight="one"
      >
        <DataTableHead>
          <DataTableLeadHeader />
          {COLUMNS.map((c) => (
            <DataTableHeader
              key={c.key}
              label={c.label}
              align={c.numeric ? "right" : "left"}
              sort={{
                dir: c.key === sort ? dir : null,
                onSort: () => press(c.key),
                describedBy: SORT_NOTE[c.key] ? `${part}-sort-note-${c.key}` : undefined,
              }}
              data-sort-key={c.key}
              after={headerTip(c.key)}
            />
          ))}
        </DataTableHead>
        <DataTableBody>
          {sorted.map((v) => {
            const href = hrefOf(v);
            // The figures as the row prints them, with no receipt (the index
            // states none); Yield's text through the same formatter.
            const yf = yieldOf(v);
            const heads = vaultHeads({ vault: v, yieldFigure: yf, holdersHref: null, receipts: {} });
            const head = (id: string) => heads.find((h) => h.id === id);
            const name = v.name ?? v.catalogName ?? v.symbol;
            const raw = v.totalAssets?.raw ?? "";
            const c = v.census;
            const holdersHref = holdersHrefOf(v);
            // `none`: what stands for an absent figure, for a screen reader
            // (the Yield slot's reason, with its `data-yield-none`).
            const cell = (id: string, label: string, value: ReactNode, none: ReactNode = "no figure") => (
              <DataTableCell
                label={label}
                align="right"
                valign="middle"
                className="whitespace-nowrap tabular-nums"
                data-col={id}
              >
                {value != null ? (
                  <span className="text-sm font-semibold text-foreground">{value}</span>
                ) : (
                  <span className="text-sm text-rb-500">
                    <span aria-hidden>–</span>
                    <span className="sr-only">{none}</span>
                  </span>
                )}
              </DataTableCell>
            );
            // Holders: the census's open count, with the census receipt;
            // linked to the positions listing filtered to this vault.
            const holders =
              c == null ? null : c.live > 0 && holdersHref ? (
                <Link
                  href={holdersHref}
                  prefetch={false}
                  className="hover:text-blue-600 dark:hover:text-[var(--text-link)]"
                  data-cell="holders"
                  data-positions-link={v.address}
                  data-link="vault-positions"
                  data-positions-vault={v.address}
                >
                  {n(c.live)}
                </Link>
              ) : (
                <span data-cell="holders" data-positions-none="">
                  {n(c.live)}
                </span>
              );
            return (
              <DataTableRow
                href={href}
                key={`${v.chainId}:${v.address}`}
                data-vault-row={v.address}
                data-group={raw === "" ? "unread" : BigInt(raw) > BigInt(0) ? "funded" : "empty"}
                data-asset={v.asset.address}
                data-total-assets-raw={raw}
                data-share-price-raw={v.sharePrice?.raw ?? ""}
                data-vault-family={v.family}
                data-holders-live={c?.live ?? ""}
                data-standing={v.standing.join(" ")}
                data-created-block={v.createdBlock ?? ""}
                data-token={tokenOf(v)}
                {...hooksOf(v)}
              >
                <DataTableLeadCell
                  protocol={leadOf(v) ?? VAULT_FAMILIES[v.family].venue}
                  protocolName={VAULT_INDEX_PROTOCOL_LABEL[vaultIndexProtocol(v)]}
                  chain={v.chainId as ChainId}
                />
                {/* From sm one line: icon, name (truncating, its full text in a
                    title), the standing pills after it. Below sm (D6) the name
                    wraps and the pills take their own line from the card's edge. */}
                <DataTableCell
                  rowHeader
                  valign="middle"
                  className="sm:w-full sm:max-w-0 sm:min-w-[180px] xl:min-w-[260px]"
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:flex-nowrap">
                    <span className="shrink-0" data-prov-exempt>
                      <TokenChipIcon
                        symbol={v.asset.symbol}
                        address={v.asset.address}
                        size={28}
                        filterable={false}
                        untitled
                      />
                    </span>
                    <DataTableLeadMark
                      protocol={leadOf(v) ?? VAULT_FAMILIES[v.family].venue}
                      chain={v.chainId as ChainId}
                    />
                    <DataTableRowLink
                      href={href}
                      className="min-w-0 flex-1 text-sm font-semibold break-words sm:min-w-[7rem] sm:flex-initial sm:truncate"
                      title={name ?? v.address}
                      data-vault-link={v.address}
                      data-vault-name
                    >
                      {name != null ? name : <span className="font-mono">{shortAddress(v.address)}</span>}
                    </DataTableRowLink>
                    {v.standing.length > 0 && (
                      // From sm the pills give way before the name's first 7rem.
                      <span className="flex flex-wrap gap-1 max-sm:basis-full sm:min-w-0 sm:flex-nowrap sm:overflow-hidden">
                        {v.standing.map((st) => (
                          <span
                            key={st}
                            className={`${PILL} sm:truncate`}
                            title={st === "illiquid" && v.illiquid ? illiquidSentence(v.illiquid) : STANDING_WORD[st]}
                            data-pill={st}
                          >
                            {STANDING_WORD[st]}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </DataTableCell>
                {cell(
                  "total-assets",
                  "Total assets",
                  v.totalAssets && (
                    <InAsset v={v} data-cell="total-assets">
                      {formatCompact(v.totalAssets.value)}
                    </InAsset>
                  ),
                )}
                {cell(
                  "share-price",
                  "Share price",
                  v.sharePrice && (
                    <InAsset v={v} data-cell="share-price">
                      {sharePriceText(v.sharePrice, v.asset.decimals)}
                    </InAsset>
                  ),
                )}
                {cell(
                  "yield",
                  "Yield",
                  yf && "yearly" in yf ? <span data-cell="yield">{yieldText(yf.yearly)}</span> : null,
                  head("yield")?.sub,
                )}
                {cell("holders", "Holders", holders)}
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
