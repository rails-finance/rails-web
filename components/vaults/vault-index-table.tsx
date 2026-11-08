"use client";

// The cross-protocol vault index as a table (rails-ops ui-jobs 538, V6): the
// rows of `/vaults`, drawn inside the shared roster's controls.
// ----------------------------------------------------------------------------
// One row per vault in the house table (components/shared/data-table): the
// lead zone (the protocol's tint, mark and chain, named for a screen reader
// and in its tooltip), Vault (the asset's icon, the name linking the vault's
// page under its protocol, the standing pills beneath where there are any),
// then Total assets, Share price, Yield and Holders. Every figure is the row's
// own with its receipt (vaultHeads; Holders is the census's open count with
// the census receipt); nothing is re-derived here.
//
// SORT. Each column header is a button; the sort lives in `?sort=` and
// `?dir=`, each written only off its default (Holders, most first, as the
// rosters' cards open). Total assets and Share price are amounts in the vault's
// asset, so they sort by token (A to Z) and by the amount inside each token:
// two quantities of one token are the only amounts compared (decision 0028
// point 8: no USD, no cross-asset total). Yield and Holders compare across
// every row. A vault with no figure for the key sorts last, both ways.
//
// The whole row links the vault's page (the name is the one focusable link).
// BELOW sm the table scrolls inside its own frame with the lead zone and the
// Vault column pinned at the left; the page never scrolls sideways.

import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import type { ChainId } from "@/lib/shared/chains";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
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
import {
  STANDING_WORD,
  VAULT_PILL,
  vaultHeads,
  YIELD_LABEL_TIP,
  type VaultRowReceipts,
} from "@/components/vaults/vault-heads";
import { vaultHoldersProv } from "@/lib/vaults/row-provenance";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { VAULT_INDEX_PROTOCOL_LABEL, vaultIndexProtocol } from "@/lib/vaults/index-rosters";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";

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
    if (fa == null || fb == null) {
      if (fa != null) return -1;
      if (fb != null) return 1;
    } else if (fa !== fb) return sign * (fa - fb);
    return byToken(a, b) || byName(a, b) || a.chainId - b.chainId;
  };
}

/** Below sm the lead zone and the Vault column stay pinned while the frame scrolls. */
const PIN_LEAD = "max-sm:sticky max-sm:left-0";
const PIN_VAULT = "max-sm:sticky max-sm:left-16";

const n = (x: number) => x.toLocaleString("en-US");

export function VaultIndexTable({
  rows,
  part,
  initialSearch,
  yieldOf,
  leadOf,
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
  /** The lead zone's `protocols.ts` id (the roster entry the vault's
   *  directory sits under); null falls back to the family's venue. */
  leadOf: (v: VaultSummary) => string | null;
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

  return (
    <div data-vault-table={part} data-anatomy="V6">
      {inToken && part === "funded" && (
        <p className="mb-2 text-[12px] text-rb-500" data-sort-note="">
          Sorted by token, then by {sort === "assets" ? "total assets" : "share price"} within each token.
        </p>
      )}
      <DataTable
        caption={`${part === "funded" ? "Vaults" : "Vaults that hold nothing"}; total assets and share price are in each vault’s asset`}
        tableClassName="min-w-[640px] text-sm"
      >
        <DataTableHead>
          <DataTableLeadHeader sticky={PIN_LEAD} />
          {COLUMNS.map((c) => (
            <DataTableHeader
              key={c.key}
              label={c.label}
              align={c.numeric ? "right" : "left"}
              sticky={c.key === "vault" ? PIN_VAULT : ""}
              sort={{ dir: c.key === sort ? dir : null, onSort: () => press(c.key) }}
              data-sort-key={c.key}
              after={
                c.key === "yield" && (
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
                )
              }
            />
          ))}
        </DataTableHead>
        <DataTableBody>
          {sorted.map((v) => {
            const receipts = receiptsOf(v);
            const href = hrefOf(v);
            const heads = vaultHeads({ vault: v, yieldFigure: yieldOf(v), holdersHref: null, receipts });
            const head = (id: string) => heads.find((h) => h.id === id);
            const name = v.name ?? v.catalogName ?? v.symbol;
            const raw = v.totalAssets?.raw ?? "";
            const c = v.census;
            const holdersHref = holdersHrefOf(v);
            // `none`: what stands for an absent figure, for a screen reader
            // (the Yield slot's reason, with its `data-yield-none`).
            const cell = (id: string, value: ReactNode, none: ReactNode = "no figure") => (
              <DataTableCell
                align="right"
                valign="middle"
                className="whitespace-nowrap tabular-nums [&_.flex-wrap]:flex-nowrap [&_.flex-wrap]:justify-end"
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
                  <Prov info={vaultHoldersProv(v, c)}>{n(c.live)}</Prov>
                </Link>
              ) : (
                <span data-cell="holders" data-positions-none="">
                  <Prov info={vaultHoldersProv(v, c)}>{n(c.live)}</Prov>
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
                  sticky={PIN_LEAD}
                />
                <DataTableCell
                  rowHeader
                  sticky={PIN_VAULT}
                  valign="middle"
                  className="max-sm:max-w-[150px] max-sm:min-w-[130px] sm:min-w-[260px]"
                >
                  <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
                    <span className="shrink-0" data-prov-exempt>
                      <TokenChipIcon
                        symbol={v.asset.symbol}
                        address={v.asset.address}
                        size={28}
                        filterable={false}
                        untitled
                      />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <DataTableRowLink
                        href={href}
                        className="min-w-0 text-sm font-semibold break-words"
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
                      </DataTableRowLink>
                      {v.standing.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {v.standing.map((st) => (
                            <span key={st} className={VAULT_PILL} data-pill={st}>
                              {receipts.standing?.[st] ? (
                                <Prov info={receipts.standing[st]}>{STANDING_WORD[st]}</Prov>
                              ) : (
                                STANDING_WORD[st]
                              )}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </div>
                </DataTableCell>
                {cell("total-assets", head("total-assets")?.value)}
                {cell("share-price", head("share-price")?.value)}
                {cell("yield", head("yield")?.value, head("yield")?.sub)}
                {cell("holders", holders)}
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
