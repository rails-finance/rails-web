"use client";

// The roster: every vault the Yearn V3 factories made on Ethereum, at one block.
// ----------------------------------------------------------------------------
// What /ethereum/yearn/vaults shows — the Vaults tab of the Yearn V3 rail, and
// the explorer's landing page, because a protocol whose whole product is vaults
// has no position listing to open on (rails-ops decision 0027 call 2). Each row
// opens that vault's factsheet.
//
// One row per catalogued vault — its live name, release, asset,
// `totalAssets()`, share price and endorsement, each a slot read at the block
// the page states — grouped BY ASSET and ordered inside a group by total
// assets, largest first.
//
// FOUR RULES THE LAYOUT KEEPS:
//
//  1. THE DENOMINATOR FIRST. The list is every vault the five V3 factories
//     deployed, which is a floor, so the prose says what is absent — a vault
//     deployed without a factory, a vault created since the census, and Yearn
//     V2 — before any row.
//  2. THE MARK IS EARNED, THE FAMILY WORD IS NOT. "Yearn V3" sits on every row,
//     because every one of these contracts came out of a Yearn V3 factory and
//     runs Yearn's vault code. The Yearn mark and the "endorsed" badge appear
//     only where `Registry.isEndorsed()` answered true at the block above
//     (decision 0027 call 1): anyone can deploy from the factory and call the
//     result "Yearn USDC", and the mark beside that name would read as Yearn's.
//     An unread endorsement is neither — no badge, and the cell says so.
//  3. NO CROSS-ASSET ORDER, NO USD. 72 distinct assets and no feed for any of
//     them. A USDC total and a WETH total are quantities of two different
//     things; the page never puts them in one ordered list and never sums them.
//     Groups are ordered by how many funded vaults they hold, then by symbol — a
//     comparison of counts.
//  4. AN EMPTY VAULT IS A READING, AN UNREAD ONE IS AN ABSENCE. 112 of these
//     held nothing at the census block; those sit in a trailing collapsed group
//     that expands to the same rows. A vault whose call went unanswered is
//     stated as unread, separately — never a dash, never a zero.
//
// THE ADDRESS SITS BESIDE EVERY NAME, always. Four names on this roster are each
// carried by three different vaults, and 3.0.4 and 3.1.0 vaults can be renamed,
// so the name is a reading and the address is the identity.
//
// FACETS (asset, release, endorsement) are the house filter grammar — one
// dropdown per dimension, chips only once something is chosen — so the page is
// quiet at rest. They narrow which rows are shown; the counts in the
// denominator line are about the roster and do not move.
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
import { assetText, shortAddress } from "@/lib/shared/vault-amount-text";
import { explorerUrl } from "@/lib/shared/chains";
import { yearnVaultHref } from "@/lib/vaults/routes";
import {
  yearnAssetGroupCountProv,
  yearnEmptyCountProv,
  yearnEndorsedCountProv,
  yearnRosterCensusProv,
  yearnVaultEndorsedProv,
  yearnVaultNameProv,
  yearnVaultSharePriceProv,
  yearnVaultShutdownProv,
  yearnVaultTotalAssetsProv,
  type YearnVaultCoords,
} from "@/lib/yearn/vault-provenance";
import type {
  YearnVaultDirectoryResponse,
  YearnVaultDirectoryRow,
} from "@/lib/sources/chain/yearn-ethereum-vault-directory";

const CHAIN_ID = 1;
const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);

/** The facet state — OR within a dimension, AND across. Empty = everything. */
interface RosterFilters {
  asset: string[];
  release: string[];
  standing: string[];
}
const NO_FILTERS: RosterFilters = { asset: [], release: [], standing: [] };

interface AssetGroup {
  asset: YearnVaultDirectoryRow["asset"];
  rows: YearnVaultDirectoryRow[];
}

const rawOf = (r: YearnVaultDirectoryRow) => BigInt(r.totalAssets?.raw ?? "0");

/** Group funded rows by asset; order inside a group by `totalAssets` raw,
 *  largest first (a bigint comparison — two quantities of the same token, the
 *  only kind compared here), then address for a stable tie. Groups by funded
 *  count descending, then symbol. */
function groupByAsset(rows: YearnVaultDirectoryRow[]): AssetGroup[] {
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

export function YearnVaultDirectoryView({ data }: { data: YearnVaultDirectoryResponse }) {
  const registry = useReceiptRegistry();
  const [filters, setFilters] = useState<RosterFilters>(NO_FILTERS);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [nameQuery, setNameQuery] = useState("");

  const coords: YearnVaultCoords = { blockNumber: data.blockNumber || undefined };
  const catalogue = { catalogSize: data.catalogSize, censusBlock: data.censusBlock };

  // The three kinds of row, split once over the whole reading (never over the
  // filtered view — the counts stated are about the roster).
  const funded = useMemo(() => data.rows.filter((r) => r.totalAssets != null && rawOf(r) > ZERO), [data.rows]);
  const emptyRows = useMemo(() => data.rows.filter((r) => r.totalAssets != null && rawOf(r) === ZERO), [data.rows]);
  const unread = useMemo(() => data.rows.filter((r) => r.totalAssets == null), [data.rows]);
  const endorsedCount = useMemo(() => data.rows.filter((r) => r.endorsed === true).length, [data.rows]);
  const distinctAssets = useMemo(() => new Set(data.rows.map((r) => r.asset.address)).size, [data.rows]);

  // Facet universes come from the whole reading, so an option never vanishes
  // because another facet hid its rows.
  const dimensions = useMemo<FilterDimension<RosterFilters>[]>(() => {
    const assets = new Map<string, { symbol: string; count: number }>();
    const releases = new Map<string, number>();
    let endorsed = 0;
    for (const r of data.rows) {
      const a = assets.get(r.asset.address);
      if (a) a.count += 1;
      else assets.set(r.asset.address, { symbol: r.asset.symbol, count: 1 });
      releases.set(r.apiVersion, (releases.get(r.apiVersion) ?? 0) + 1);
      if (r.endorsed === true) endorsed += 1;
    }
    const assetOptions = [...assets.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].symbol.localeCompare(b[1].symbol, "en-US"))
      .map(([value, { symbol, count }]) => ({ value, label: symbol, meta: n(count) }));
    const releaseOptions = [...releases.entries()]
      .sort((a, b) => b[0].localeCompare(a[0], "en-US"))
      .map(([value, count]) => ({ value, label: `V3 ${value}`, meta: n(count) }));
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
        id: "release",
        label: "Release",
        group: "Release",
        cardinality: "multi",
        options: releaseOptions,
        get: (f) => f.release,
        set: (f, values) => ({ ...f, release: values }),
      },
      {
        id: "standing",
        label: "Endorsement",
        group: "Endorsement",
        cardinality: "multi",
        options: [
          { value: "endorsed", label: "Endorsed", meta: n(endorsed) },
          { value: "unendorsed", label: "Unendorsed", meta: n(data.rows.length - endorsed) },
        ],
        get: (f) => f.standing,
        set: (f, values) => ({ ...f, standing: values }),
      },
    ];
  }, [data.rows]);

  // The name search is a plain substring over what the roster PRINTS — the live
  // name, the census's snapshot of it, the share symbol and the address — so a
  // reader who knows a vault by any of the four finds it. It is a filter on this
  // list and nothing else: it makes no request, reads no chain and is not in the
  // URL, because it narrows a reading that is already in the document.
  const needle = nameQuery.trim().toLowerCase();
  const matchesName = (r: YearnVaultDirectoryRow) =>
    needle === "" ||
    (r.name ?? "").toLowerCase().includes(needle) ||
    r.censusName.toLowerCase().includes(needle) ||
    r.censusSymbol.toLowerCase().includes(needle) ||
    r.address.includes(needle);

  const passes = (r: YearnVaultDirectoryRow) =>
    (filters.asset.length === 0 || filters.asset.includes(r.asset.address)) &&
    (filters.release.length === 0 || filters.release.includes(r.apiVersion)) &&
    (filters.standing.length === 0 || filters.standing.includes(r.endorsed === true ? "endorsed" : "unendorsed")) &&
    matchesName(r);

  const groups = useMemo(() => groupByAsset(funded.filter(passes)), [funded, filters, needle]); // eslint-disable-line react-hooks/exhaustive-deps
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
    [emptyRows, filters, needle], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const filtering =
    filters.asset.length > 0 || filters.release.length > 0 || filters.standing.length > 0 || needle !== "";

  return (
    <ProvReceiptsScope registry={registry}>
      {/* ── the denominator, before any row ─────────────────────────────── */}
      <section className="mb-5" data-skel-section="roster-denominator">
        <h2 className="text-sm font-semibold text-foreground" data-directory-heading>
          Browse every Yearn V3 vault
        </h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="roster-census">
          A Yearn V3 vault pools one token from its depositors and hands it to strategies that put it to work; a
          depositor holds shares, and a share buys back more of the token as those strategies earn. This page lists{" "}
          <Prov info={yearnRosterCensusProv(coords, catalogue)}>
            the {n(data.catalogSize)} vaults the five V3 factories had deployed on Ethereum at block{" "}
            {n(data.censusBlock)}
          </Prov>
          , and one row is one vault. The factories are open to anyone, so that roster is a floor: a vault compiled and
          deployed without a factory leaves no trace to enumerate, and a vault created since that block joins when the
          census runs again.
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="roster-endorsed">
          Deploying from a Yearn factory is one thing and Yearn standing behind the result is another.{" "}
          <Prov info={yearnEndorsedCountProv(coords, endorsedCount, data.catalogSize)}>
            {n(endorsedCount)} of these vaults are endorsed
          </Prov>{" "}
          — those carry the Yearn mark and the badge, and the rest carry the family word alone, which says what every
          one of them is: a vault running Yearn V3 code, made by a Yearn V3 factory. Yearn can withdraw an endorsement,
          so the badge describes the block this page names.
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="roster-units">
          Totals and share prices are stated in each vault&rsquo;s asset — {n(distinctAssets)} different tokens across
          the roster — and vaults are grouped by asset, so no two quantities of different things are ever placed in one
          ordered list or added together. Yearn V2 is a separate registry and different vault code, and is absent from
          this page.
        </p>
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
        <section className="mb-6" data-skel-section="roster-stale">
          <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
            The vaults could not be read from chain just now, so no figure is stated for any of them. The page states
            nothing it could not read.
          </p>
        </section>
      ) : (
        <>
          {/* ── facets: quiet at rest ───────────────────────────────────── */}
          <div className="mb-4 flex flex-col gap-2" data-skel-section="roster-facets">
            <FilterSections dimensions={dimensions} filters={filters} onChange={setFilters} />
            <FilterChips dimensions={dimensions} filters={filters} onChange={setFilters} />
          </div>

          {/* ── one table per asset ─────────────────────────────────────── */}
          <div data-skel-section="roster-groups">
            {groups.length === 0 && (
              <p className="mb-6 text-[13px] text-rb-500">
                No funded vault matches these facets at block {n(data.blockNumber)}.
              </p>
            )}
            {groups.map((g) => (
              <section key={g.asset.address} className="mb-6" data-asset-group={g.asset.address}>
                <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
                  <a
                    href={explorerUrl(CHAIN_ID, "address", g.asset.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={g.asset.named ? "" : "font-mono"}
                  >
                    {g.asset.symbol}
                  </a>
                  <span className="text-[12px] font-normal text-rb-500" data-figure="group-count">
                    <Prov info={yearnAssetGroupCountProv({ ...coords, assetSymbol: g.asset.symbol }, g.rows.length)}>
                      {g.rows.length === 1 ? "1 vault" : `${n(g.rows.length)} vaults`}
                    </Prov>
                    {filtering ? " shown" : ""}
                  </span>
                </h2>
                <RosterTable rows={g.rows} coords={coords} />
              </section>
            ))}
          </div>

          {/* ── the vaults that hold nothing: a reading, collapsed ──────── */}
          {emptyRows.length > 0 && (
            <section className="mb-6" data-skel-section="roster-empty" data-empty-group>
              <button
                type="button"
                onClick={() => setEmptyOpen((v) => !v)}
                aria-expanded={emptyOpen}
                className="group/empty flex cursor-pointer items-center gap-2 text-left text-sm font-semibold text-foreground hover:text-blue-500"
              >
                <DisclosureChevron isOpen={emptyOpen} />
                <span data-figure="empty-count">
                  <Prov info={yearnEmptyCountProv(coords, emptyRows.length, data.catalogSize)}>
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
                vault, and a deployment that was never funded looks the same as one whose depositors have all left.
                Ordered by asset, then name.
              </p>
              {emptyOpen && (
                <div data-empty-rows>
                  {emptyShown.length === 0 ? (
                    <p className="mt-2 text-[13px] text-rb-500">No empty vault matches these facets.</p>
                  ) : (
                    <RosterTable rows={emptyShown} coords={coords} />
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── the vaults the read did not answer for: an absence, stated ── */}
          {unread.length > 0 && (
            <section className="mb-6" data-skel-section="roster-unread" data-unread-group>
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
                    <Link href={yearnVaultHref(r.address)} className="text-foreground hover:text-blue-500">
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
function RosterTable({ rows, coords }: { rows: YearnVaultDirectoryRow[]; coords: YearnVaultCoords }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[42rem] text-[12px]">
        <thead>
          <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
            <th className="py-2 pr-3 font-normal">Vault</th>
            <th className="py-2 pr-3 font-normal">Family</th>
            <th className="py-2 pr-3 text-right font-normal">Total assets</th>
            <th className="py-2 pr-3 text-right font-normal">Share price</th>
            <th className="py-2 font-normal">Standing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rowCoords: YearnVaultCoords = {
              ...coords,
              vault: r.address,
              vaultName: r.name ?? r.censusName,
              assetSymbol: r.asset.symbol,
              apiVersion: r.apiVersion,
            };
            const raw = r.totalAssets?.raw ?? "";
            return (
              <tr
                key={r.address}
                className="border-b border-rb-200/60 dark:border-rb-500/20"
                data-vault-row={r.address}
                data-group={raw === "" ? "unread" : BigInt(raw) > ZERO ? "funded" : "empty"}
                data-asset={r.asset.address}
                data-release={r.apiVersion}
                data-endorsed={r.endorsed == null ? "unread" : String(r.endorsed)}
                data-total-assets-raw={raw}
                data-share-price-raw={r.sharePrice?.raw ?? ""}
              >
                <td className="py-2 pr-3">
                  <Link href={yearnVaultHref(r.address)} className="text-foreground hover:text-blue-500">
                    {r.name != null ? (
                      <Prov info={yearnVaultNameProv(rowCoords)}>{r.name}</Prov>
                    ) : (
                      <span title="name not read at this block; the census snapshot is shown">{r.censusName}</span>
                    )}
                  </Link>{" "}
                  <span className="font-mono text-[11px] text-rb-500">{shortAddress(r.address)}</span>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-rb-500">
                  {/* The family word on every row; the mark only where the
                      Registry endorses this vault at the block above. */}
                  <span className="inline-flex items-center gap-1.5">
                    {r.endorsed === true && <VaultVenueMark family="yearn" />}
                    Yearn V3 {r.apiVersion}
                  </span>
                </td>
                <td
                  className="py-2 pr-3 text-right tabular-nums text-foreground whitespace-nowrap"
                  data-cell="total-assets"
                >
                  {r.totalAssets ? (
                    <>
                      <Prov info={yearnVaultTotalAssetsProv(rowCoords)}>
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
                      <Prov info={yearnVaultSharePriceProv(rowCoords)}>
                        {assetText(r.sharePrice, r.asset.decimals)}
                      </Prov>{" "}
                      <span className={r.asset.named ? "text-rb-500" : "font-mono text-rb-500"}>{r.asset.symbol}</span>
                    </>
                  ) : (
                    <span className="text-rb-500">not read</span>
                  )}
                </td>
                <td className="py-2 whitespace-nowrap" data-cell="standing">
                  {r.endorsed == null ? (
                    <span className="text-rb-500">endorsement not read</span>
                  ) : r.endorsed ? (
                    <span
                      className="rounded border border-rb-200 px-1.5 py-0.5 text-[11px] text-foreground dark:border-rb-500/30"
                      data-endorsed-badge
                    >
                      <Prov info={yearnVaultEndorsedProv(rowCoords, true)}>endorsed</Prov>
                    </span>
                  ) : (
                    <span className="text-rb-500">
                      <Prov info={yearnVaultEndorsedProv(rowCoords, false)}>—</Prov>
                    </span>
                  )}
                  {r.shutdown === true && (
                    <span className="ml-1.5 text-[11px] text-rb-500" data-shutdown-badge>
                      <Prov info={yearnVaultShutdownProv(rowCoords)}>shut down</Prov>
                    </span>
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
