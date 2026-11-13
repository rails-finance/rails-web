"use client";

// The vault table (rails-ops ui-jobs 538, V6): the rows of `/vaults` and of
// every family's roster (ui-jobs 605), drawn inside the shared roster's controls.
// ----------------------------------------------------------------------------
// One row per vault in the house table (components/shared/data-table): on the
// index the lead zone (the protocol's tint, mark and chain, named for a screen
// reader and in its tooltip; `leadOf`), which a one-protocol roster omits
// (ui-jobs 605), then Vault (the asset's icon, the name linking the vault's
// page under its protocol, the standing pills beneath where there are any),
// then Kind (the family's kind; on a roster its family and release, as its
// cards printed them, `kindOf`), Total assets, Share price, Yield and Holders (the census's open
// count), Steward, and last the Compare tick (E2, ui-jobs 553 door 3). The
// figures print as the row prints them (vaultHeads, yieldText), each in its
// family's receipt at its roster's block (decision 0062 point 5; ui-jobs
// 571): every row is its own receipts scope, so the locator pulse stays in the
// row. The name is the row's link and carries none, so a press on it opens
// the vault while the inspector is armed.
//
// SORT. Each column header is a button; the sort lives in `?sort=` and
// `?dir=`, each written only off its default (Holders, most first, as the
// rosters' cards open). Total assets and Share price are amounts in the vault's
// asset, so they sort by token (A to Z) and by the amount inside each token:
// two quantities of one token are the only amounts compared (decision 0028
// point 8: no USD, no cross-asset total); each header's "?" says so, and the
// sort button reads the same words. Yield and Holders compare across
// every row. A vault with no figure for the key sorts last, both ways; on
// Yield an illiquid vault (ui-jobs 540) and a one-off move (ui-jobs 542) sort
// after the other figures, and a vault too small to measure (542) has none.
// Total assets ranks by what the vault holds, `totalAssets − lostAssets`
// (ui-jobs 543), and the cell prints the stated total.
//
// The whole row links the vault's page (the name is the one focusable link).
// BELOW sm each row reads as a card (D6): on the index the mark and chain
// beside the asset's icon, the name across, the figures
// two by two under their labels; the toolbar sorts (N1.3, `useVaultIndexSort`).

import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
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
  DataTableRowMenu,
} from "@/components/shared/data-table/data-table";
import {
  STANDING_WORD,
  tooSmallSentence,
  vaultHeads,
  type VaultRowReceipts,
  yieldSublineText,
  YIELD_LABEL_TIP,
} from "@/components/vaults/vault-heads";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { VAULT_INDEX_PROTOCOL_LABEL, vaultIndexProtocol } from "@/lib/vaults/index-rosters";
import { vaultDisplayName, type VaultStanding, type VaultSummary } from "@/lib/vaults/summary";
import { measuredYield, yieldText, type VaultYield } from "@/lib/vaults/yield";
import { illiquidSentence } from "@/lib/vaults/illiquid";
import { vaultHoldersProv, vaultYieldProv } from "@/lib/vaults/row-provenance";
import { heldAssetsRaw, lostAssetsSentence } from "@/lib/vaults/lost-assets";
import { assetScaleAbsentTip, assetScaleSentence } from "@/lib/vaults/asset-scale-words";
import { formatCompact } from "@/lib/shared/format-compact";
import { sharePriceText } from "@/lib/shared/vault-amount-text";
import { useCompareSelection } from "@/components/vaults/compare-selection";
import { compareKey } from "@/lib/vaults/compare";
import { COMPARE_TICK } from "@/lib/vaults/compare-words";

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

/** The steward's role, in the Steward cell's title. */
const STEWARD_ROLE: Record<NonNullable<VaultSummary["steward"]>["role"], string> = {
  curator: "Curator",
  owner: "Owner",
  roleManager: "Role manager",
  poolDelegate: "Pool delegate",
};

/** How an amount in the vault's asset sorts: by token, then inside it. */
const SORT_NOTE: Partial<Record<SortKey, string>> = {
  assets: "Sorts by token, then by total assets within each token.",
  price: "Sorts by token, then by share price within each token.",
};

/** The token a vault's amounts are in: its symbol across chains, its address
 *  where the symbol did not decode (the Token facet's value). */
const tokenOf = (v: VaultSummary) => (v.asset.named ? v.asset.symbol : v.asset.address);

const nameOf = (v: VaultSummary) => vaultDisplayName(v) ?? v.address;

/** What the vault holds, in the asset: `totalAssets − lostAssets`. */
const heldOf = (v: VaultSummary, totalRaw: string) =>
  Number(heldAssetsRaw(totalRaw, v.lostAssets?.raw)) / 10 ** v.asset.decimals;

/** A pill's title: the standing's sentence where it has one, else its word. */
function pillTitle(st: VaultStanding, v: VaultSummary): string {
  if (st === "illiquid" && v.illiquid) return illiquidSentence(v.illiquid);
  if (st === "lost-assets" && v.totalAssets && v.lostAssets)
    return lostAssetsSentence({
      lost: formatCompact(v.lostAssets.value),
      held: formatCompact(heldOf(v, v.totalAssets.raw)),
      symbol: v.asset.symbol,
    });
  if (st === "decimals-disagree" && v.assetScale) return assetScaleSentence(v.asset.symbol, v.assetScale);
  return STANDING_WORD[st];
}

/** The key's figure; null sorts last both ways. Total assets sorts by the
 *  figure the column shows (ui-jobs 664). A vault whose asset's decimals
 *  disagree shows no amount in it, and sorts as none. */
function figureOf(key: SortKey, v: VaultSummary, y: VaultYield | undefined): number | null {
  switch (key) {
    case "assets":
      return v.assetScale ? null : (v.totalAssets?.value ?? null);
    case "price":
      return v.assetScale ? null : (v.sharePrice?.value ?? null);
    case "yield":
      return y && "yearly" in y ? y.yearly : null;
    case "holders":
      return v.census?.live ?? null;
    default:
      return null;
  }
}

/** A one-off move named on the Yield subline (decision 0047 point 2, ui-jobs 542). */
const oneOff = (y: VaultYield | undefined) => y != null && "yearly" in y && y.jump != null;

/** A Yield figure that sorts after the others: illiquid, or a one-off move. */
const sortsLate = (v: VaultSummary, y: VaultYield | undefined) => Boolean(v.illiquid) || oneOff(y);

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
    // repays (ui-jobs 540), and a one-off move's is mostly one span of days
    // (ui-jobs 542), so each sorts after every other figure, both ways, and
    // before the rows with none.
    if (key === "yield" && fa != null && fb != null && sortsLate(a, yieldOf(a)) !== sortsLate(b, yieldOf(b)))
      return sortsLate(a, yieldOf(a)) ? 1 : -1;
    if (fa == null || fb == null) {
      if (fa != null) return -1;
      if (fb != null) return 1;
    } else if (fa !== fb) return sign * (fa - fb);
    return byToken(a, b) || byName(a, b) || a.chainId - b.chainId;
  };
}

const n = (x: number) => x.toLocaleString("en-US");

/** A figure in its receipt, where the family states one. */
const traced = (info: Provenance | undefined, children: ReactNode) =>
  info ? <Prov info={info}>{children}</Prov> : children;

/** One row's receipts scope: its own registry, the roster's section id. A
 *  table row takes no coverage bookends (`bounds={false}`); the section's
 *  scope sweeps the table. */
function RowScope({ children }: { children: ReactNode }) {
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      {children}
    </ProvReceiptsScope>
  );
}

/** A figure in the vault's asset, its unit after it (`AssetUnit`). */
function InAsset({ v, children, ...rest }: { v: VaultSummary; children: ReactNode; "data-cell": string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" {...rest}>
      <span>{children}</span>
      <AssetUnit symbol={v.asset.symbol} address={v.asset.address} named={v.asset.named} />
    </span>
  );
}

/** The hooks the vault card's pills carry (VaultPills), on the same pills. */
const BADGE_HOOK: Partial<Record<VaultStanding, Record<string, string>>> = {
  endorsed: { "data-endorsed-badge": "" },
  "shut-down": { "data-shutdown-badge": "" },
};

/** A standing pill on a row, on the table's pill ground. */
const PILL = `${DATA_TABLE_PILL} px-1.5 py-0.5 text-[11px]`;

/** The index's sort, in `?sort=` and `?dir=`, each written only off its
 *  default: read by the table's headers and by the toolbar's sort below sm. */
export function useVaultIndexSort(initialSearch: string) {
  const sp = useUrlSearchParams(initialSearch);
  const sortParam = sp.get("sort");
  const sort: SortKey = COLUMNS.some((c) => c.key === sortParam) ? (sortParam as SortKey) : DEFAULT_SORT;
  const column = COLUMNS.find((c) => c.key === sort)!;
  const dirParam = sp.get("dir");
  const dir: "asc" | "desc" = dirParam === "asc" || dirParam === "desc" ? dirParam : column.first;

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

  /** The toolbar's sort below sm: a new key takes its first direction. */
  const mobileSort = {
    options: COLUMNS.map((c) => ({ value: c.key, label: c.label })),
    sortBy: sort as string,
    sortOrder: dir,
    onChange: (key: string, order: "asc" | "desc") => {
      const k = key as SortKey;
      writeSort(k, k === sort ? order : COLUMNS.find((c) => c.key === k)!.first);
    },
  };
  return { sort, dir, press, mobileSort };
}

export function VaultIndexTable({
  rows,
  part,
  initialSearch,
  yieldOf,
  receiptsOf,
  leadOf,
  kindOf,
  hrefOf,
  holdersHrefOf,
  hooksOf,
}: {
  rows: readonly VaultSummary[];
  /** Which rows: the funded vaults, or the ones that hold nothing. */
  part: "funded" | "empty";
  initialSearch: string;
  yieldOf: (v: VaultSummary) => VaultYield | undefined;
  /** The row's receipts: its family's, at its roster's block. */
  receiptsOf: (v: VaultSummary) => VaultRowReceipts;
  /** The lead zone's `protocols.ts` id (the roster entry the vault's
   *  directory sits under); null falls back to the family's venue. Null in
   *  place of the function omits the lead column, header and cells: a
   *  one-protocol roster (ui-jobs 605). */
  leadOf: ((v: VaultSummary) => string | null) | null;
  /** The Kind cell's words; absent, the family's kind. */
  kindOf?: (v: VaultSummary) => string;
  hrefOf: (v: VaultSummary) => string;
  holdersHrefOf: (v: VaultSummary) => string | null;
  hooksOf: (v: VaultSummary) => Record<string, string>;
}) {
  const { sort, dir, press } = useVaultIndexSort(initialSearch);

  // A figure on total assets under the dust floor is too small to measure.
  const measuredOf = (v: VaultSummary) => measuredYield(yieldOf(v), v.totalAssets?.raw);
  const sorted = [...rows].sort(comparator(sort, dir, measuredOf));

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
      {/* Below sm the header row is hidden (D6) and the toolbar's sort
          (`vaultIndexMobileSort`) writes the same params; the chosen sort's
          note stands here, where no header carries it. */}
      {part === "funded" && SORT_NOTE[sort] && (
        <p className="mb-3 text-[12px] text-rb-500 sm:hidden" data-mobile-sort-note="">
          {SORT_NOTE[sort]}
        </p>
      )}
      <DataTable
        // The asset's mark beside every amount says which asset it is in
        // (ui-jobs 664, VA12: the reading contract's remedy 1).
        caption={part === "funded" ? "Vaults" : "Vaults that hold nothing"}
        tableClassName="min-w-[940px] text-sm"
        stacked
        rowHeight="one"
      >
        <DataTableHead>
          {leadOf && <DataTableLeadHeader plain />}
          {COLUMNS.map((c) => [
            c.key === "assets" && <DataTableHeader key="kind" label="Kind" data-col-head="kind" />,
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
            />,
          ])}
          <DataTableHeader label="Steward" data-col-head="steward" />
          <DataTableHeader label={<span className="sr-only">Actions</span>} data-col-head="menu" />
        </DataTableHead>
        <DataTableBody>
          {sorted.map((v) => {
            const href = hrefOf(v);
            // The figures as the row prints them, each in its family's
            // receipt; Yield's text and receipt through the same builders.
            const yf = measuredOf(v);
            const receipts = receiptsOf(v);
            const heads = vaultHeads({ vault: v, yieldFigure: yf, holdersHref: null, receipts });
            const head = (id: string) => heads.find((h) => h.id === id);
            const name = vaultDisplayName(v);
            const raw = v.totalAssets?.raw ?? "";
            const c = v.census;
            const holdersHref = holdersHrefOf(v);
            // An asset whose decimals disagree: no amount in it, the reason
            // read to a screen reader; the row's pill carries it in a title
            // (ui-jobs 664).
            const withheld = v.assetScale ? assetScaleAbsentTip(v.asset.symbol, v.assetScale) : undefined;
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
                  <Prov info={vaultHoldersProv(v, c)}>{n(c.live)}</Prov>
                </Link>
              ) : (
                <span data-cell="holders" data-positions-none="">
                  <Prov info={vaultHoldersProv(v, c)}>{n(c.live)}</Prov>
                </span>
              );
            return (
              <RowScope key={`${v.chainId}:${v.address}`}>
                <DataTableRow
                  href={href}
                  data-vault-row={v.address}
                  data-group={raw === "" ? "unread" : BigInt(raw) > BigInt(0) ? "funded" : "empty"}
                  data-asset={v.asset.address}
                  data-total-assets-raw={raw}
                  data-held-assets-raw={raw === "" ? "" : heldAssetsRaw(raw, v.lostAssets?.raw).toString()}
                  data-share-price-raw={v.sharePrice?.raw ?? ""}
                  data-vault-family={v.family}
                  data-holders-live={c?.live ?? ""}
                  data-standing={v.standing.join(" ")}
                  data-created-block={v.createdBlock ?? ""}
                  data-token={tokenOf(v)}
                  {...hooksOf(v)}
                >
                  {leadOf && (
                    <DataTableLeadCell
                      plain
                      protocol={leadOf(v) ?? VAULT_FAMILIES[v.family].venue}
                      protocolName={VAULT_INDEX_PROTOCOL_LABEL[vaultIndexProtocol(v)]}
                      chain={v.chainId as ChainId}
                    />
                  )}
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
                      {leadOf && (
                        <DataTableLeadMark
                          protocol={leadOf(v) ?? VAULT_FAMILIES[v.family].venue}
                          chain={v.chainId as ChainId}
                        />
                      )}
                      <DataTableRowLink
                        href={href}
                        className="min-w-0 flex-1 text-sm font-semibold break-words sm:min-w-[7rem] sm:flex-initial sm:truncate"
                        title={name ?? v.address}
                        data-vault-link={v.address}
                        data-vault-name
                      >
                        {name != null ? name : <span className="font-mono">{shortAddress(v.address)}</span>}
                      </DataTableRowLink>
                      {(v.standing.length > 0 || oneOff(yf)) && (
                        // From sm the pills give way before the name's first 7rem.
                        <span className="flex flex-wrap gap-1 max-sm:basis-full sm:min-w-0 sm:flex-nowrap sm:overflow-hidden">
                          {v.standing.map((st) => (
                            <span
                              key={st}
                              className={`${PILL} sm:truncate`}
                              title={pillTitle(st, v)}
                              data-pill={st}
                              {...BADGE_HOOK[st]}
                            >
                              {traced(receipts.standing?.[st], STANDING_WORD[st])}
                            </span>
                          ))}
                          {yf && "yearly" in yf && yf.jump && (
                            <span
                              className={`${PILL} sm:truncate`}
                              title={yieldSublineText(yf)}
                              data-pill="one-off-move"
                              data-yield-jump-day={yf.jump.day}
                            >
                              one-off move
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </DataTableCell>
                  <DataTableCell label="Kind" valign="middle" className="whitespace-nowrap" data-col="kind">
                    <span className="text-sm text-foreground" data-cell="kind">
                      {kindOf ? kindOf(v) : VAULT_FAMILIES[v.family].kind}
                    </span>
                  </DataTableCell>
                  {cell(
                    "total-assets",
                    "Total assets",
                    v.totalAssets && !v.assetScale && (
                      <InAsset v={v} data-cell="total-assets">
                        {traced(receipts.totalAssets, formatCompact(v.totalAssets.value))}
                      </InAsset>
                    ),
                    withheld,
                  )}
                  {cell(
                    "share-price",
                    "Share price",
                    v.sharePrice && !v.assetScale && (
                      <InAsset v={v} data-cell="share-price">
                        {/* Past a million, compact (its full text in the
                          title), so one vault's figure cannot widen the column. */}
                        {traced(
                          receipts.sharePrice,
                          v.sharePrice.value >= 1e6 ? (
                            <span title={sharePriceText(v.sharePrice, v.asset.decimals)}>
                              {formatCompact(v.sharePrice.value)}
                            </span>
                          ) : (
                            sharePriceText(v.sharePrice, v.asset.decimals)
                          ),
                        )}
                      </InAsset>
                    ),
                    withheld,
                  )}
                  {cell(
                    "yield",
                    "Yield",
                    yf && "yearly" in yf ? (
                      <span data-cell="yield">
                        <Prov info={vaultYieldProv(v, yf)}>{yieldText(yf.yearly)}</Prov>
                      </span>
                    ) : yf?.none === "too-small" ? (
                      <span
                        data-cell="yield"
                        data-yield-none="too-small"
                        title={tooSmallSentence(v)}
                        className="inline-block w-[6.5rem] leading-tight whitespace-normal"
                      >
                        too small to measure
                      </span>
                    ) : null,
                    head("yield")?.sub,
                  )}
                  {cell("holders", "Holders", holders)}
                  <DataTableCell label="Steward" valign="middle" className="whitespace-nowrap" data-col="steward">
                    {v.steward ? (
                      <span
                        className="font-mono text-[13px] text-foreground"
                        title={`${STEWARD_ROLE[v.steward.role]} ${v.steward.address}`}
                        data-cell="steward"
                        data-steward-role={v.steward.role}
                      >
                        {shortAddress(v.steward.address)}
                      </span>
                    ) : (
                      <span className="text-sm text-rb-500" data-cell="steward" data-steward-none="">
                        <span aria-hidden>–</span>
                        <span className="sr-only">no steward read</span>
                      </span>
                    )}
                  </DataTableCell>
                  {/* The row's ⋮ (D7), Compare first (E2); it stands above the
                    row's cover, and on a card sits at its top right. */}
                  <DataTableCell valign="middle" className="dt-row-menu w-px whitespace-nowrap" data-col="menu">
                    <VaultRowMenu vaultKey={compareKey(v.chainId, v.address)} name={name ?? v.address} />
                  </DataTableCell>
                </DataTableRow>
              </RowScope>
            );
          })}
        </DataTableBody>
      </DataTable>
    </div>
  );
}

/** A /vaults row's ⋮ (D7): the comparison entry (E2), through the same
 *  selection as the asset step's tick, so the bar (E3) and a refused fifth
 *  pick behave as there. */
function VaultRowMenu({ vaultKey, name }: { vaultKey: string; name: string }) {
  const { keys, toggle } = useCompareSelection();
  const on = keys.includes(vaultKey);
  return (
    <DataTableRowMenu
      label={`Actions for ${name}`}
      items={[
        {
          key: "compare",
          label: on ? COMPARE_TICK.remove : COMPARE_TICK.add,
          checked: on,
          onSelect: () => toggle(vaultKey),
          hooks: { "data-anatomy": "E2", "data-compare-tick": vaultKey, "data-compare-checked": on ? "" : undefined },
        },
      ]}
    />
  );
}
