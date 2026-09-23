"use client";

// The roster: every catalogued MetaMorpho vault on Base, at one block.
// ----------------------------------------------------------------------------
// What /base/morpho/vaults shows — the Vaults tab of the Morpho Blue Base rail,
// under "Browse all vaults on Base". Each row opens that vault's own page.
//
// One row per catalogued vault
// — its live name, family, asset, `totalAssets()`, share price and curator,
// each a slot read at the block the page states — grouped BY ASSET and ordered
// inside a group by total assets, largest first.
//
// SHARE PRICE is `convertToAssets(10^18)` — one whole share, in the vault's own
// asset, formatted through the SAME `assetText` rule as total assets: the
// ASSET's own decimals, never a fixed two — a cents convention on an
// 18-decimal asset once printed 0.00 for a real, non-dust reading. No USD.
//
// THREE RULES THE LAYOUT KEEPS:
//
//  1. THE DENOMINATOR FIRST. The list is exactly the census — every vault the
//     two MetaMorpho factories had deployed at the census block — and that is a
//     floor, so the prose says what is absent (vaults deployed without a
//     factory, vaults created since, the Vault V2 family) before any row.
//  2. NO CROSS-ASSET ORDER, NO USD. A USDC total and a WETH total are two
//     quantities of two different things; the page never puts them in one
//     ordered list and never sums them. Groups are ordered by how many funded
//     vaults they hold, then by symbol — a comparison of counts, not of
//     amounts.
//  3. AN EMPTY VAULT IS A READING, AN UNREAD ONE IS AN ABSENCE. A vault whose
//     `totalAssets()` answered zero holds nothing at this block; those sit in a
//     trailing collapsed group that expands to the same rows. A vault whose
//     call did not answer is stated as unread, separately — never a dash, never
//     a zero.
//
// FACETS (asset, family) are the house filter grammar — one dropdown per
// dimension, chips only once something is chosen — so the page is quiet at
// rest. They narrow which rows are shown; the counts in the denominator line
// are about the census and do not move.
//
// A CLIENT COMPONENT: the receipts scope and the <Prov> registrations are client
// machinery, and the facets and the collapsed group hold state. Colour: house
// neutrals; a large vault and an empty one are the same kind of fact.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { FilterSections } from "@/components/shared/filter-bar/filter-sections";
import { FilterChips } from "@/components/shared/filter-bar/filter-chips";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import { DisclosureChevron } from "@/components/shared/expand-chevron";
import { VaultVenueMark } from "@/components/vaults/vault-venue-mark";
import { assetText, shortAddress } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { baseVaultHref } from "@/lib/vaults/routes";
import {
  vaultDirectoryCensusProv,
  vaultDirectoryEmptyCountProv,
  vaultDirectoryGroupCountProv,
  vaultDirectoryNameProv,
  vaultDirectorySharePriceProv,
  vaultDirectoryStewardProv,
  vaultDirectoryTotalAssetsProv,
  baseVaultCensusVaultProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import type {
  MorphoBaseVaultDirectoryResponse,
  MorphoBaseVaultDirectoryRow,
} from "@/lib/sources/chain/morpho-base-vault-directory";
import { baseVaultsListingHref } from "@/lib/vaults/routes";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** The facet state — OR within a dimension, AND across. Empty = everything. */
interface DirectoryFilters {
  asset: string[];
  family: string[];
}
const NO_FILTERS: DirectoryFilters = { asset: [], family: [] };

const FAMILY_LABEL: Record<MorphoBaseVaultDirectoryRow["factory"], string> = {
  "v1.0": "MetaMorpho V1.0",
  "v1.1": "MetaMorpho V1.1",
};

interface AssetGroup {
  asset: MorphoBaseVaultDirectoryRow["asset"];
  rows: MorphoBaseVaultDirectoryRow[];
}

const rawOf = (r: MorphoBaseVaultDirectoryRow) => BigInt(r.totalAssets?.raw ?? "0");

/** Group funded rows by asset; order inside a group by `totalAssets` raw,
 *  largest first (a bigint comparison — two quantities of the same token, the
 *  only kind compared here), then address for a stable tie. Groups by funded
 *  count descending, then symbol. */
function groupByAsset(rows: MorphoBaseVaultDirectoryRow[]): AssetGroup[] {
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

export function VaultDirectoryView({
  data,
  families,
  census = [],
}: {
  data: MorphoBaseVaultDirectoryResponse;
  /** The vault families this roster catalogues. */
  families: readonly string[];
  /** The census header for this chain, one row per catalogued vault. It adds
   *  ONE column to the roster: how many positions the census counted in each
   *  vault, and — where that count is zero — the words "no holder yet", which
   *  is a chain reading rather than a row nobody wrote. Empty leaves the column
   *  out entirely rather than printing an unread count per row. */
  census?: readonly VaultCensusRow[];
}) {
  const registry = useReceiptRegistry();
  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [nameQuery, setNameQuery] = useState("");

  /** The census's participant count per vault, or undefined where the census
   *  has no row for it. Undefined and 0 are different facts: one is "no census
   *  row", the other is "the sweep ran and found nobody". */
  const participantsOf = useMemo(() => {
    const by = new Map<string, VaultCensusRow>();
    for (const c of census) by.set(c.vault.toLowerCase(), c);
    return by;
  }, [census]);

  const coords: MorphoVaultCoords = { blockNumber: data.blockNumber || undefined };
  const catalogue = { catalogSize: data.catalogSize, censusBlock: data.censusBlock };

  // The three kinds of row, split once over the whole reading (never over the
  // filtered view — the counts stated are about the census).
  const funded = useMemo(() => data.rows.filter((r) => r.totalAssets != null && rawOf(r) > ZERO), [data.rows]);
  const emptyRows = useMemo(() => data.rows.filter((r) => r.totalAssets != null && rawOf(r) === ZERO), [data.rows]);
  const unread = useMemo(() => data.rows.filter((r) => r.totalAssets == null), [data.rows]);

  // Facet universes come from the whole reading, so an option never vanishes
  // because the other facet hid its rows.
  const dimensions = useMemo<FilterDimension<DirectoryFilters>[]>(() => {
    const assets = new Map<string, { symbol: string; count: number }>();
    for (const r of data.rows) {
      const a = assets.get(r.asset.address);
      if (a) a.count += 1;
      else assets.set(r.asset.address, { symbol: r.asset.symbol, count: 1 });
    }
    const assetOptions = [...assets.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].symbol.localeCompare(b[1].symbol, "en-US"))
      .map(([value, { symbol, count }]) => ({ value, label: symbol, meta: n(count) }));
    const familyCounts = { "v1.0": 0, "v1.1": 0 };
    for (const r of data.rows) familyCounts[r.factory] += 1;
    return [
      {
        id: "asset",
        label: "Asset",
        group: "Asset",
        cardinality: "multi",
        options: assetOptions,
        get: (f) => f.asset,
        set: (f, values) => ({ ...f, asset: values }),
      },
      {
        id: "family",
        label: "Family",
        group: "Family",
        cardinality: "multi",
        options: (["v1.1", "v1.0"] as const).map((v) => ({
          value: v,
          label: FAMILY_LABEL[v],
          meta: n(familyCounts[v]),
        })),
        get: (f) => f.family,
        set: (f, values) => ({ ...f, family: values }),
      },
    ];
  }, [data.rows]);

  // The name search is a plain substring over what the roster PRINTS — the
  // live name, the census's snapshot of it, the symbol and the address — so a
  // reader who knows a vault by any of the four finds it. It is a filter on
  // this list and nothing else: it makes no request, reads no chain and is not
  // in the URL, because it narrows a reading that is already in the document.
  const needle = nameQuery.trim().toLowerCase();
  const matchesName = (r: MorphoBaseVaultDirectoryRow) =>
    needle === "" ||
    (r.name ?? "").toLowerCase().includes(needle) ||
    r.censusName.toLowerCase().includes(needle) ||
    r.address.includes(needle);

  const passes = (r: MorphoBaseVaultDirectoryRow) =>
    (filters.asset.length === 0 || filters.asset.includes(r.asset.address)) &&
    (filters.family.length === 0 || filters.family.includes(r.factory)) &&
    matchesName(r);

  const groups = useMemo(() => groupByAsset(funded.filter(passes)), [funded, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const emptyShown = useMemo(
    () =>
      emptyRows
        .filter(passes)
        .sort(
          (a, b) =>
            a.asset.symbol.localeCompare(b.asset.symbol, "en-US") ||
            (a.name ?? a.censusName).localeCompare(b.name ?? b.censusName, "en-US") ||
            a.address.localeCompare(b.address),
        ),
    [emptyRows, filters], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const filtering = filters.asset.length > 0 || filters.family.length > 0 || needle !== "";
  const neverHeld = useMemo(() => census.filter((c) => c.participants === 0).length, [census]);

  return (
    <ProvReceiptsScope registry={registry}>
      {/* ── the denominator, before any row ─────────────────────────────── */}
      <section className="mb-5" data-skel-section="directory-denominator">
        <h2 className="text-sm font-semibold text-foreground" data-directory-heading>
          Browse all vaults on Base
        </h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="directory-census">
          <Prov info={vaultDirectoryCensusProv(coords, catalogue)}>
            The {n(data.catalogSize)} vaults the two MetaMorpho factories had deployed on Base at block{" "}
            {n(data.censusBlock)}
          </Prov>
          {" — "}
          {families.join(" and ")}. That roster is a floor, not a total: a vault deployed without a factory emits no
          creation event and is absent from it, vaults created since that block are absent until the census re-runs, and
          the Vault V2 family is not yet covered. Names are read live at the block below, because a V1.1 owner can
          rename a vault; the asset is immutable and comes from the census.
        </p>
        {census.length > 0 && (
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="directory-never-held">
            The Positions column is the position census, not this reading: how many addresses have ever held a share of
            each vault, live and closed, at the census block the listing states.{" "}
            {neverHeld > 0 && (
              <>
                {neverHeld === 1 ? "One of them has" : `${n(neverHeld)} of them have`} no holder yet — the sweep ran
                over {neverHeld === 1 ? "its" : "their"} whole life and returned no <code>Transfer</code> at all, which
                is a reading about {neverHeld === 1 ? "that vault" : "those vaults"} rather than an omission.{" "}
                {neverHeld === 1 ? "It is" : "They are"} kept in this roster and offered as no filter, because a facet
                option that always answers an empty page says nothing.
              </>
            )}
          </p>
        )}
        <label className="mt-3 flex max-w-sm items-center gap-2 text-[12px] text-rb-500">
          <span>Search the roster</span>
          <input
            type="search"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Vault name, symbol or address"
            data-roster-search
            className="min-w-0 flex-1 rounded-lg border border-rb-200 bg-surface px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-rb-500 dark:border-rb-500/30"
          />
        </label>
      </section>

      {data.chainStale ? (
        <section className="mb-6" data-skel-section="directory-stale">
          <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
            The vaults could not be read from chain just now, so no figure is stated for any of them. The page states
            nothing it could not read.
          </p>
        </section>
      ) : (
        <>
          {/* ── facets: quiet at rest ───────────────────────────────────── */}
          <div className="mb-4 flex flex-col gap-2" data-skel-section="directory-facets">
            <FilterSections dimensions={dimensions} filters={filters} onChange={setFilters} />
            <FilterChips dimensions={dimensions} filters={filters} onChange={setFilters} />
          </div>

          {/* ── one table per asset ─────────────────────────────────────── */}
          <div data-skel-section="directory-groups">
            {groups.length === 0 && (
              <p className="mb-6 text-[13px] text-rb-500">
                No funded vault matches these facets at block {n(data.blockNumber)}.
              </p>
            )}
            {groups.map((g) => (
              <section key={g.asset.address} className="mb-6" data-asset-group={g.asset.address}>
                <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
                  <a
                    href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", g.asset.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={g.asset.named ? "" : "font-mono"}
                  >
                    {g.asset.symbol}
                  </a>
                  <span className="text-[12px] font-normal text-rb-500" data-figure="group-count">
                    <Prov
                      info={vaultDirectoryGroupCountProv({ ...coords, assetSymbol: g.asset.symbol }, g.rows.length)}
                    >
                      {g.rows.length === 1 ? "1 vault" : `${n(g.rows.length)} vaults`}
                    </Prov>
                    {filtering ? " shown" : ""}
                  </span>
                </h2>
                <DirectoryTable rows={g.rows} coords={coords} participantsOf={participantsOf} />
              </section>
            ))}
          </div>

          {/* ── the vaults that hold nothing: a reading, collapsed ──────── */}
          {emptyRows.length > 0 && (
            <section className="mb-6" data-skel-section="directory-empty" data-empty-group>
              <button
                type="button"
                onClick={() => setEmptyOpen((v) => !v)}
                aria-expanded={emptyOpen}
                className="group/empty flex cursor-pointer items-center gap-2 text-left text-sm font-semibold text-foreground hover:text-blue-500"
              >
                <DisclosureChevron isOpen={emptyOpen} />
                <span data-figure="empty-count">
                  <Prov info={vaultDirectoryEmptyCountProv(coords, emptyRows.length, data.catalogSize)}>
                    {emptyRows.length === 1
                      ? "1 vault holds nothing at this block"
                      : `${n(emptyRows.length)} vaults hold nothing at this block`}
                  </Prov>
                </span>
                {filtering && emptyShown.length !== emptyRows.length && (
                  <span className="text-[12px] font-normal text-rb-500">· {n(emptyShown.length)} shown</span>
                )}
              </button>
              <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-rb-500">
                Each answered zero to <code>totalAssets()</code> at block {n(data.blockNumber)} — a reading about the
                vault, not a gap in the read. Ordered by asset, then name.
              </p>
              {emptyOpen && (
                <div data-empty-rows>
                  {emptyShown.length === 0 ? (
                    <p className="mt-2 text-[13px] text-rb-500">No empty vault matches these facets.</p>
                  ) : (
                    <DirectoryTable rows={emptyShown} coords={coords} participantsOf={participantsOf} />
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── the vaults the read did not answer for: an absence, stated ── */}
          {unread.length > 0 && (
            <section className="mb-6" data-skel-section="directory-unread" data-unread-group>
              <h2 className="text-sm font-semibold text-foreground">
                {unread.length === 1
                  ? "1 vault could not be read at this block"
                  : `${n(unread.length)} vaults could not be read at this block`}
              </h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-rb-500">
                Their <code>totalAssets()</code> call did not answer, so no figure is stated for them — not a zero, and
                not a dash. Each still has a page.
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                {unread.map((r) => (
                  <li key={r.address} data-vault-row={r.address} data-group="unread" data-asset={r.asset.address}>
                    <Link href={baseVaultHref(r.address)} className={PAGE_LINK} prefetch={false}>
                      {r.name ?? r.censusName} <span className="font-mono font-normal">{shortAddress(r.address)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </ProvReceiptsScope>
  );
}

/** One table of rows sharing an asset (or the empty group, mixed assets, where
 *  the asset column says which). Every figure carries its receipt; the raw
 *  `totalAssets()` rides on the row as a data attribute so a verifier can
 *  compare wei-exact what the cell prints rounded. */
function DirectoryTable({
  rows,
  coords,
  participantsOf,
}: {
  rows: MorphoBaseVaultDirectoryRow[];
  coords: MorphoVaultCoords;
  /** Vault address → its census row, where the census has one. Empty leaves the
   *  column out: an unread count per row would say nothing 511 times. */
  participantsOf: Map<string, VaultCensusRow>;
}) {
  const withCensus = participantsOf.size > 0;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-[12px]">
        <thead>
          <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
            <th className="py-2 pr-3 font-normal">Vault</th>
            <th className="py-2 pr-3 font-normal">Family</th>
            <th className="py-2 pr-3 text-right font-normal">Total assets</th>
            <th className="py-2 pr-3 text-right font-normal">Share price</th>
            {withCensus && <th className="py-2 pr-3 text-right font-normal">Positions</th>}
            <th className="py-2 font-normal">Curator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rowCoords: MorphoVaultCoords = {
              ...coords,
              vault: r.address,
              vaultName: r.name ?? r.censusName,
              assetSymbol: r.asset.symbol,
            };
            const stewardRole = r.curator ? "curator" : "owner";
            const steward = r.curator ?? r.owner;
            const raw = r.totalAssets?.raw ?? "";
            return (
              <tr
                key={r.address}
                className="border-b border-rb-200/60 dark:border-rb-500/20"
                data-vault-row={r.address}
                data-group={raw === "" ? "unread" : BigInt(raw) > ZERO ? "funded" : "empty"}
                data-asset={r.asset.address}
                data-family={r.factory}
                data-total-assets-raw={raw}
                data-share-price-raw={r.sharePrice?.raw ?? ""}
              >
                <td className="py-2 pr-3">
                  <Link
                    href={baseVaultHref(r.address)}
                    className="text-foreground hover:text-blue-500"
                    prefetch={false}
                  >
                    {r.name != null ? (
                      <Prov info={vaultDirectoryNameProv(rowCoords)}>{r.name}</Prov>
                    ) : (
                      <span title="name not read at this block; the census snapshot is shown">{r.censusName}</span>
                    )}
                  </Link>{" "}
                  <span className="font-mono text-[11px] text-rb-500">{shortAddress(r.address)}</span>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-rb-500">
                  {/* The venue that made this vault, beside the factory
                      version it already prints — a fact about ONE vault. */}
                  <span className="inline-flex items-center gap-1.5">
                    <VaultVenueMark family="morpho" />
                    {FAMILY_LABEL[r.factory]}
                  </span>
                </td>
                <td
                  className="py-2 pr-3 text-right tabular-nums text-foreground whitespace-nowrap"
                  data-cell="total-assets"
                >
                  {r.totalAssets ? (
                    <>
                      <Prov info={vaultDirectoryTotalAssetsProv(rowCoords)}>
                        {assetText(r.totalAssets, r.asset.decimals)}
                      </Prov>{" "}
                      <span className={r.asset.named ? "text-rb-500" : "font-mono text-rb-500"}>{r.asset.symbol}</span>
                    </>
                  ) : (
                    <span className="text-rb-500">not read</span>
                  )}
                </td>
                <td
                  className="py-2 pr-3 text-right tabular-nums text-foreground whitespace-nowrap"
                  data-cell="share-price"
                >
                  {r.sharePrice ? (
                    <>
                      <Prov info={vaultDirectorySharePriceProv(rowCoords)}>
                        {assetText(r.sharePrice, r.asset.decimals)}
                      </Prov>{" "}
                      <span className={r.asset.named ? "text-rb-500" : "font-mono text-rb-500"}>{r.asset.symbol}</span>
                    </>
                  ) : (
                    <span className="text-rb-500">not read</span>
                  )}
                </td>
                {withCensus && (
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap" data-cell="positions">
                    {(() => {
                      const row = participantsOf.get(r.address);
                      if (row == null) return <span className="text-rb-500">no census row</span>;
                      const info = baseVaultCensusVaultProv(
                        { ...rowCoords, censusBlock: row.censusBlock },
                        { participants: row.participants, liveCount: row.liveCount, sumMatches: row.sumMatches },
                      );
                      if (row.participants === 0)
                        return (
                          <span className="text-rb-500" data-positions-none>
                            <Prov info={info}>no holder yet</Prov>
                          </span>
                        );
                      return (
                        <Link
                          href={baseVaultsListingHref({ vault: r.address })}
                          className="text-foreground hover:text-blue-500"
                          prefetch={false}
                          data-positions-link={r.address}
                        >
                          <Prov info={info}>{n(row.participants)}</Prov>
                        </Link>
                      );
                    })()}
                  </td>
                )}
                <td className="py-2 whitespace-nowrap">
                  {steward === ZERO_ADDR ? (
                    // `curator()` AND `owner()` are both the zero address: the
                    // vault names nobody (ownership renounced). A reading, with
                    // its receipt — not a blank cell.
                    <span className="text-rb-500" data-cell="steward-none">
                      <Prov info={vaultDirectoryStewardProv(rowCoords, "none")}>none</Prov>
                    </span>
                  ) : steward ? (
                    <>
                      <a
                        href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", steward)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-external font-mono"
                      >
                        <Prov info={vaultDirectoryStewardProv(rowCoords, stewardRole)}>{shortAddress(steward)}</Prov>
                      </a>
                      {stewardRole === "owner" && <span className="ml-1.5 text-[11px] text-rb-500">owner</span>}
                    </>
                  ) : (
                    <span className="text-rb-500">not read</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
