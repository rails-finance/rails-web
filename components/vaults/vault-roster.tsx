"use client";

// One vault roster (rails-ops ui-jobs 407, V1): the rows of one family's
// vaults, grouped by asset, under one set of controls.
// ----------------------------------------------------------------------------
// Every roster draws the same thing: an Asset facet and the family's own
// facets, a search over name, symbol and address, one group per asset with
// its heading, the vaults that hold nothing behind one disclosure, and the
// vaults the read did not answer for listed by name. A family supplies its
// summaries, its facets, its routes and its receipts, and the receipts scope
// this renders inside.
//
// THREE RULES THE LAYOUT KEEPS:
//  1. NO CROSS-ASSET ORDER, NO USD. Groups are ordered by how many funded
//     vaults they hold, then by symbol; rows inside a group by `totalAssets`
//     raw, largest first, two quantities of one token being the only kind
//     compared.
//  2. AN EMPTY VAULT IS A READING, AN UNREAD ONE IS AN ABSENCE. A vault whose
//     `totalAssets()` answered zero sits behind the trailing disclosure; one
//     whose call did not answer is named as unread, never drawn as a zero.
//  3. THE COUNTS ARE THE READING'S. The facets and the search narrow which rows
//     are shown; a group says "shown" while they do.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { BlockRef } from "@/components/shared/block-ref";
import { InfoDisclosureTrigger } from "@/components/shared/info-disclosure";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { FilterSections } from "@/components/shared/filter-bar/filter-sections";
import { FilterChips } from "@/components/shared/filter-bar/filter-chips";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import { DisclosureChevron } from "@/components/shared/expand-chevron";
import { VaultRow, type VaultRowReceipts } from "@/components/vaults/vault-row";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);

/** One facet beyond Asset: a dimension every vault has one value on. */
export interface VaultRosterFacet {
  id: string;
  label: string;
  valueOf: (v: VaultSummary) => string;
  labelOf: (value: string) => string;
  /** The options' order; absent, by count then label. */
  order?: readonly string[];
}

type Filters = Record<string, string[]>;

/** What the roster states above its rows: at most the read-at line and one
 *  census sentence (survey §6, "Words, by surface"); the rest is in the drawer. */
export interface VaultRosterHead {
  /** The one sentence on what the list is, with its receipts. */
  census: ReactNode;
  /** `data-figure` on the census sentence, which the roster verifiers read. */
  censusFigure: string;
  /** The positions listing, linked after the sentence; null where there is none. */
  listingHref: string | null;
  /** The intro drawer's body (standards/explanation-copy-charter.md §8a). */
  drawer: ReactNode;
  /** The vault layer's about page. */
  infoHref: string;
}

const rawOf = (v: VaultSummary) => BigInt(v.totalAssets?.raw ?? "0");

interface AssetGroup {
  asset: VaultSummary["asset"];
  rows: VaultSummary[];
}

function groupByAsset(rows: VaultSummary[]): AssetGroup[] {
  const by = new Map<string, AssetGroup>();
  for (const row of rows) {
    const g = by.get(row.asset.address);
    if (g) g.rows.push(row);
    else by.set(row.asset.address, { asset: row.asset, rows: [row] });
  }
  const groups = [...by.values()];
  for (const g of groups) {
    g.rows.sort((a, b) => {
      const av = rawOf(a);
      const bv = rawOf(b);
      return av < bv ? 1 : av > bv ? -1 : a.address.localeCompare(b.address);
    });
  }
  groups.sort(
    (a, b) =>
      b.rows.length - a.rows.length ||
      a.asset.symbol.localeCompare(b.asset.symbol, "en-US") ||
      a.asset.address.localeCompare(b.asset.address),
  );
  return groups;
}

export function VaultRoster({
  vaults,
  yields,
  chainId,
  blockNumber,
  chainStale,
  skel,
  facets,
  hrefOf,
  holdersHrefOf,
  receiptsOf,
  hooksOf,
  groupCountProv,
  emptyCountProv,
  head,
}: {
  vaults: readonly VaultSummary[];
  /** Decision 0047's figure per lowercased vault address. */
  yields: Record<string, VaultYield>;
  chainId: ChainId;
  blockNumber: number;
  chainStale: boolean;
  /** The `data-skel-section` prefix the family's skeleton records. */
  skel: "directory" | "roster";
  facets: readonly VaultRosterFacet[];
  hrefOf: (v: VaultSummary) => string;
  holdersHrefOf: ((v: VaultSummary) => string) | null;
  receiptsOf: (v: VaultSummary) => VaultRowReceipts;
  hooksOf?: (v: VaultSummary) => Record<string, string>;
  groupCountProv: (assetSymbol: string, count: number) => Provenance;
  emptyCountProv: (count: number) => Provenance;
  head: VaultRosterHead;
}) {
  const [introOpen, setIntroOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [query, setQuery] = useState("");

  const funded = useMemo(() => vaults.filter((v) => v.totalAssets != null && rawOf(v) > ZERO), [vaults]);
  const emptyRows = useMemo(() => vaults.filter((v) => v.totalAssets != null && rawOf(v) === ZERO), [vaults]);
  const unread = useMemo(() => vaults.filter((v) => v.totalAssets == null), [vaults]);

  // Facet universes come from the whole reading, so an option never vanishes
  // because another facet hid its rows.
  const all = useMemo<VaultRosterFacet[]>(
    () => [
      {
        id: "asset",
        label: "Asset",
        valueOf: (v) => v.asset.address,
        labelOf: (a) => vaults.find((v) => v.asset.address === a)?.asset.symbol ?? shortAddress(a),
      },
      ...facets,
    ],
    [vaults, facets],
  );
  const dimensions = useMemo<FilterDimension<Filters>[]>(
    () =>
      all.map((f) => {
        const counts = new Map<string, number>();
        for (const v of vaults) counts.set(f.valueOf(v), (counts.get(f.valueOf(v)) ?? 0) + 1);
        const values = f.order
          ? f.order.filter((o) => counts.has(o))
          : [...counts.keys()].sort(
              (a, b) =>
                (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || f.labelOf(a).localeCompare(f.labelOf(b), "en-US"),
            );
        return {
          id: f.id,
          label: f.label,
          group: f.label,
          cardinality: "multi" as const,
          options: values.map((value) => ({ value, label: f.labelOf(value), meta: n(counts.get(value) ?? 0) })),
          get: (s: Filters) => s[f.id] ?? [],
          set: (s: Filters, chosen: string[]) => ({ ...s, [f.id]: chosen }),
        };
      }),
    [all, vaults],
  );

  // A substring over what the row prints: the live name, the catalogue's
  // snapshot, the symbol and the address. It narrows the reading already in
  // the document and makes no request.
  const needle = query.trim().toLowerCase();
  const passes = (v: VaultSummary) =>
    all.every((f) => (filters[f.id]?.length ?? 0) === 0 || filters[f.id].includes(f.valueOf(v))) &&
    (needle === "" ||
      [v.name, v.catalogName, v.symbol, v.address].some((s) => s != null && s.toLowerCase().includes(needle)));
  const filtering = needle !== "" || Object.values(filters).some((x) => x.length > 0);

  const groups = useMemo(() => groupByAsset(funded.filter(passes)), [funded, filters, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const emptyShown = useMemo(
    () =>
      emptyRows
        .filter(passes)
        .sort(
          (a, b) =>
            a.asset.symbol.localeCompare(b.asset.symbol, "en-US") ||
            (vaultDisplayName(a) ?? a.address).localeCompare(vaultDisplayName(b) ?? b.address, "en-US") ||
            a.address.localeCompare(b.address),
        ),
    [emptyRows, filters, needle], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const row = (v: VaultSummary) => (
    <VaultRow
      key={v.address}
      vault={v}
      yieldFigure={yields[v.address]}
      href={hrefOf(v)}
      holdersHref={holdersHrefOf ? holdersHrefOf(v) : null}
      receipts={receiptsOf(v)}
      hooks={hooksOf?.(v)}
    />
  );

  const intro = (
    <section className="mb-5" data-skel-section={`${skel}-denominator`}>
      {!chainStale && (
        // The block is the anchor every receipt below names, so the line
        // carries the coverage exemption the tripwire reads.
        <p
          className="flex items-center gap-1 text-[11px] text-rb-500"
          data-directory-block={blockNumber}
          data-prov-exempt
        >
          <span>
            Read at <BlockRef block={blockNumber} chainId={chainId} />
          </span>
          <InfoDisclosureTrigger
            open={introOpen}
            onToggle={() => setIntroOpen((o) => !o)}
            label="about these vaults"
            ariaControls="vault-roster-intro"
          />
        </p>
      )}
      <div
        id="vault-roster-intro"
        data-intro-drawer
        hidden={!introOpen}
        className="mt-2 max-w-3xl space-y-2 rounded-xl bg-raised px-3 py-3 text-[12px] leading-relaxed text-rb-500"
      >
        {head.drawer}
        <p>
          <Link href={head.infoHref} className={PAGE_LINK} prefetch={false}>
            How this is built <span aria-hidden>→</span>
          </Link>
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure={head.censusFigure}>
        {head.census}
        {head.listingHref && (
          <>
            {" "}
            <Link href={head.listingHref} className={PAGE_LINK} prefetch={false} data-link="every-holder">
              Every holder <span aria-hidden>→</span>
            </Link>
          </>
        )}
      </p>
    </section>
  );

  if (chainStale) {
    return (
      <>
        {intro}
        <section className="mb-6" data-skel-section={`${skel}-stale`}>
          <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
            The vaults could not be read from chain just now, so no figure is stated for any of them.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      {intro}
      {/* ── facets and search: quiet at rest ─────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-2" data-skel-section={`${skel}-facets`}>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSections dimensions={dimensions} filters={filters} onChange={setFilters} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Vault name, symbol or address"
            aria-label="Search the roster by vault name, symbol or address"
            data-roster-search
            className="w-full min-w-0 rounded-lg border border-rb-200 bg-surface px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-rb-500 sm:w-72 dark:border-rb-500/30"
          />
        </div>
        <FilterChips dimensions={dimensions} filters={filters} onChange={setFilters} />
      </div>

      {/* ── one group per asset ──────────────────────────────────────────── */}
      <div data-skel-section={`${skel}-groups`}>
        {groups.length === 0 && (
          <p className="mb-6 text-[13px] text-rb-500">No funded vault matches at block {n(blockNumber)}.</p>
        )}
        {groups.map((g) => (
          <section key={g.asset.address} className="mb-6" data-asset-group={g.asset.address}>
            <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
              <a
                href={explorerUrl(chainId, "address", g.asset.address)}
                target="_blank"
                rel="noopener noreferrer"
                className={g.asset.named ? "" : "font-mono"}
              >
                {g.asset.symbol}
              </a>
              <span className="text-[12px] font-normal text-rb-500" data-figure="group-count">
                <Prov info={groupCountProv(g.asset.symbol, g.rows.length)}>
                  {g.rows.length === 1 ? "1 vault" : `${n(g.rows.length)} vaults`}
                </Prov>
                {filtering ? " shown" : ""}
              </span>
            </h2>
            <div className="flex flex-col gap-3">{g.rows.map(row)}</div>
          </section>
        ))}
      </div>

      {/* ── the vaults that hold nothing: a reading, behind one disclosure ── */}
      {emptyRows.length > 0 && (
        <section className="mb-6" data-skel-section={`${skel}-empty`} data-empty-group>
          <button
            type="button"
            onClick={() => setEmptyOpen((o) => !o)}
            aria-expanded={emptyOpen}
            className="group/empty flex cursor-pointer items-center gap-2 text-left text-sm font-semibold text-foreground hover:text-blue-500"
          >
            <DisclosureChevron isOpen={emptyOpen} />
            <span data-figure="empty-count">
              <Prov info={emptyCountProv(emptyRows.length)}>
                {emptyRows.length === 1
                  ? "1 vault holds nothing at this block"
                  : `${n(emptyRows.length)} vaults hold nothing at this block`}
              </Prov>
            </span>
            {filtering && emptyShown.length !== emptyRows.length && (
              <span className="text-[12px] font-normal text-rb-500">· {n(emptyShown.length)} shown</span>
            )}
          </button>
          {emptyOpen && (
            <div className="mt-3 flex flex-col gap-3" data-empty-rows>
              {emptyShown.length === 0 ? (
                <p className="text-[13px] text-rb-500">No empty vault matches.</p>
              ) : (
                emptyShown.map(row)
              )}
            </div>
          )}
        </section>
      )}

      {/* ── the vaults the read did not answer for: an absence, named ────── */}
      {unread.length > 0 && (
        <section className="mb-6" data-skel-section={`${skel}-unread`} data-unread-group>
          <h2 className="text-sm font-semibold text-foreground">
            {unread.length === 1
              ? "1 vault could not be read at this block"
              : `${n(unread.length)} vaults could not be read at this block`}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {unread.map((v) => (
              <li
                key={v.address}
                data-vault-row={v.address}
                data-group="unread"
                data-asset={v.asset.address}
                data-total-assets-raw=""
                data-share-price-raw={v.sharePrice?.raw ?? ""}
                {...hooksOf?.(v)}
              >
                <Link href={hrefOf(v)} className={PAGE_LINK} prefetch={false}>
                  {vaultDisplayName(v) ?? shortAddress(v.address)}{" "}
                  <span className="font-mono font-normal">{shortAddress(v.address)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
