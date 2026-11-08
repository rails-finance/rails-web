"use client";

// The cross-protocol vault index as a table (rails-ops ui-jobs 538), drawn at
// `/vaults?layout=table` beside the cards (V1) while Miles compares the two;
// the one he does not pick is deleted, so this file stands alone.
// ----------------------------------------------------------------------------
// One row per vault: Vault (the asset's icon, the name linking the vault's page
// under its protocol, the chain beneath), Protocol (mark, name, the vault's
// pills), then the four headlines in the row's order. Every figure is the
// row's own (vaultHeads), with its receipt; nothing is re-derived here.
//
// SORT. Each column header is a button; the sort lives in `?sort=` and
// `?dir=`, each written only off its default (Holders, most first, the cards'
// default order). Total assets and Share price are amounts in the vault's
// asset, so they sort by token (A to Z) and by the amount inside each token:
// two quantities of one token are the only amounts compared (decision 0028
// point 8: no USD, no cross-asset total). Yield and Holders compare across
// every row. A vault with no figure for the key sorts last, both ways.
//
// BELOW sm the table scrolls inside its own frame with the Vault column
// pinned at the left; the page never scrolls sideways.

import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { VaultPills, vaultHeads, YIELD_LABEL_TIP, type VaultRowReceipts } from "@/components/vaults/vault-heads";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { chainName, VAULT_INDEX_PROTOCOL_LABEL, vaultIndexProtocol } from "@/lib/vaults/index-rosters";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";

type SortKey = "vault" | "protocol" | "assets" | "price" | "yield" | "holders";

interface Column {
  key: SortKey;
  label: string;
  /** The direction a first press sorts in. */
  first: "asc" | "desc";
  numeric: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: "vault", label: "Vault", first: "asc", numeric: false },
  { key: "protocol", label: "Protocol", first: "asc", numeric: false },
  { key: "assets", label: "Total assets", first: "desc", numeric: true },
  { key: "price", label: "Share price", first: "desc", numeric: true },
  { key: "yield", label: "Yield", first: "desc", numeric: true },
  { key: "holders", label: "Holders", first: "desc", numeric: true },
];

const DEFAULT_SORT: SortKey = "holders";

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
      return v.census?.holders ?? null;
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
    if (key === "protocol")
      return (
        sign *
          text(VAULT_INDEX_PROTOCOL_LABEL[vaultIndexProtocol(a)], VAULT_INDEX_PROTOCOL_LABEL[vaultIndexProtocol(b)]) ||
        byName(a, b)
      );
    // An amount in the asset compares inside its token only.
    const within = key === "assets" || key === "price" ? byToken(a, b) : 0;
    if (within !== 0) return within;
    const fa = figureOf(key, a, yieldOf(a));
    const fb = figureOf(key, b, yieldOf(b));
    if (fa == null || fb == null) {
      if (fa != null) return -1;
      if (fb != null) return 1;
    } else if (fa !== fb) return sign * (fa - fb);
    return byToken(a, b) || byName(a, b) || a.chainId - b.chainId;
  };
}

const CELL = "px-3 py-2.5 align-top";

export function VaultIndexTable({
  rows,
  part,
  initialSearch,
  yieldOf,
  hrefOf,
  holdersHrefOf,
  receiptsOf,
  hooksOf,
}: {
  rows: readonly VaultSummary[];
  /** Which rows: the funded vaults, or the ones that hold nothing. */
  part: "funded" | "empty";
  initialSearch: string;
  yieldOf: (v: VaultSummary) => VaultYield | undefined;
  hrefOf: (v: VaultSummary) => string;
  holdersHrefOf: (v: VaultSummary) => string | null;
  receiptsOf: (v: VaultSummary) => VaultRowReceipts;
  hooksOf: (v: VaultSummary) => Record<string, string>;
}) {
  const sp = useUrlSearchParams(initialSearch);
  const sortParam = sp.get("sort");
  const sort: SortKey = COLUMNS.some((c) => c.key === sortParam) ? (sortParam as SortKey) : DEFAULT_SORT;
  const column = COLUMNS.find((c) => c.key === sort)!;
  const dirParam = sp.get("dir");
  const dir: "asc" | "desc" = dirParam === "asc" || dirParam === "desc" ? dirParam : column.first;

  const press = useCallback(
    (key: SortKey) => {
      const col = COLUMNS.find((c) => c.key === key)!;
      const nextDir = key === sort ? (dir === "asc" ? "desc" : "asc") : col.first;
      const p = new URLSearchParams(window.location.search);
      if (key === DEFAULT_SORT) p.delete("sort");
      else p.set("sort", key);
      if (nextDir === col.first) p.delete("dir");
      else p.set("dir", nextDir);
      const qs = p.toString().replace(/%2C/gi, ",");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      notifyUrlChanged();
    },
    [sort, dir],
  );

  const sorted = [...rows].sort(comparator(sort, dir, yieldOf));
  const inToken = sort === "assets" || sort === "price";

  const header = (c: Column, sticky: boolean): ReactNode => {
    const on = c.key === sort;
    return (
      <th
        key={c.key}
        scope="col"
        aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined}
        data-sort-key={c.key}
        className={`${CELL} py-2 text-xs font-semibold whitespace-nowrap text-rb-500 ${c.numeric ? "text-right" : "text-left"} ${
          sticky
            ? "sticky left-0 z-10 bg-background max-sm:shadow-[inset_-1px_0_0_0_var(--color-rb-200)] dark:max-sm:shadow-[inset_-1px_0_0_0_var(--color-rb-700)]"
            : ""
        }`}
      >
        <span className={`inline-flex items-center gap-1 ${c.numeric ? "flex-row-reverse" : ""}`}>
          <button
            type="button"
            onClick={() => press(c.key)}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-sm focus-ring hover:text-foreground ${
              on ? "text-foreground" : ""
            }`}
          >
            {c.label}
            <span aria-hidden className={`text-[10px] ${on ? "" : "invisible"}`}>
              {on && dir === "asc" ? "▲" : "▼"}
            </span>
          </button>
          {c.key === "yield" && (
            // The label's tip marks the figure as Rails's interpretation, as on the row.
            <RevealTip
              tip={YIELD_LABEL_TIP}
              label={`Yield: ${YIELD_LABEL_TIP}`}
              focusable
              wrap
              className="focus-ring rounded-sm"
            >
              <span className="tip-underline text-[10px]">?</span>
            </RevealTip>
          )}
        </span>
      </th>
    );
  };

  return (
    <div data-vault-table={part}>
      {inToken && part === "funded" && (
        <p className="mb-2 text-[12px] text-rb-500" data-sort-note="">
          Sorted by token, then by {sort === "assets" ? "total assets" : "share price"} within each token.
        </p>
      )}
      <div className="relative max-w-full overflow-x-auto rounded-xl border border-rb-200 dark:border-rb-700">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">
            {part === "funded" ? "Vaults" : "Vaults that hold nothing"}; total assets and share price are in each
            vault&rsquo;s asset
          </caption>
          <thead className="border-b border-rb-200 dark:border-rb-700">
            <tr>{COLUMNS.map((c, i) => header(c, i === 0))}</tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const receipts = receiptsOf(v);
              const heads = vaultHeads({ vault: v, yieldFigure: yieldOf(v), holdersHref: holdersHrefOf(v), receipts });
              const head = (id: string) => heads.find((h) => h.id === id);
              const name = v.name ?? v.catalogName ?? v.symbol;
              const protocol = vaultIndexProtocol(v);
              const raw = v.totalAssets?.raw ?? "";
              const figure = (id: string) => {
                const h = head(id);
                return (
                  <td className={`${CELL} text-right tabular-nums`} data-col={id}>
                    <div className="flex flex-col items-end gap-0.5">
                      {h?.value != null ? (
                        <span className="text-sm font-semibold text-foreground">{h.value}</span>
                      ) : (
                        <span className="text-sm text-rb-500">
                          <span aria-hidden>–</span>
                          <span className="sr-only">no figure</span>
                        </span>
                      )}
                      {h?.sub != null && <span className="text-[11px] leading-snug text-rb-500">{h.sub}</span>}
                    </div>
                  </td>
                );
              };
              return (
                <tr
                  key={`${v.chainId}:${v.address}`}
                  className="group/tr border-b border-rb-200 last:border-b-0 dark:border-rb-700"
                  data-vault-table-row={v.address}
                  data-group={raw === "" ? "unread" : BigInt(raw) > BigInt(0) ? "funded" : "empty"}
                  data-asset={v.asset.address}
                  data-total-assets-raw={raw}
                  data-share-price-raw={v.sharePrice?.raw ?? ""}
                  data-vault-family={v.family}
                  data-holders-live={v.census?.live ?? ""}
                  {...hooksOf(v)}
                >
                  <th
                    scope="row"
                    className={`${CELL} sticky left-0 z-10 max-w-[180px] bg-background max-sm:shadow-[inset_-1px_0_0_0_var(--color-rb-200)] dark:max-sm:shadow-[inset_-1px_0_0_0_var(--color-rb-700)] text-left font-normal sm:max-w-none`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" data-prov-exempt>
                        <TokenChipIcon
                          symbol={v.asset.symbol}
                          address={v.asset.address}
                          size={20}
                          filterable={false}
                          untitled
                        />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <Link
                          href={hrefOf(v)}
                          prefetch={false}
                          className="text-sm font-semibold break-words text-blue-600 hover:underline dark:text-[var(--text-link)]"
                          data-vault-link={v.address}
                          data-vault-name
                        >
                          {v.name != null && receipts.name ? (
                            <Prov info={receipts.name}>{v.name}</Prov>
                          ) : name != null ? (
                            name
                          ) : (
                            <span className="font-mono">{shortAddress(v.address)}</span>
                          )}
                        </Link>
                        <span className="text-[11px] text-rb-500" data-vault-chain={v.chainId}>
                          {chainName(v.chainId)}
                        </span>
                      </span>
                    </div>
                  </th>
                  <td className={CELL} data-col="protocol">
                    <span className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-foreground">
                      <span aria-hidden className="inline-flex">
                        <ProtocolIcon id={VAULT_FAMILIES[v.family].venue} className="h-4 w-4" />
                      </span>
                      {VAULT_INDEX_PROTOCOL_LABEL[protocol]}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <VaultPills vault={v} receipts={receipts} />
                    </span>
                  </td>
                  {figure("total-assets")}
                  {figure("share-price")}
                  {figure("yield")}
                  {figure("holders")}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
