"use client";

// One vault roster (rails-ops ui-jobs 407): the rows of one family's vaults
// under one set of controls, drawn as the house table (vault-index-table.tsx,
// V6; ui-jobs 605). The cross-protocol index (ui-jobs 39) is the same roster
// over the union, with the protocol lead column (`leadOf`) and one read stamp
// for the oldest roster.
// ----------------------------------------------------------------------------
// Every roster draws the same thing: the listings' toolbar (search, the Asset
// facet and the family's own facets, the preset; below sm the table's sort),
// one flat table the column headers sort, the vaults that hold nothing behind
// one disclosure, and the vaults the read did not answer for listed by name.
// No group per asset: the Asset facet narrows by asset (ui-jobs 605). A family
// supplies its summaries, its facets, its routes and its receipts, and the
// receipts scope this renders inside.
//
// THE PRESET (ui-jobs 485). The roster opens on the vaults people use: a vault
// with a census when it counts 100+ current holders, a Yearn vault the census
// has no row for when the Registry endorses it, any other vault always
// (Maple's pools). A removable
// default chip; `?show=all` lifts it, and a link whose facets it would empty
// opens without it. A roster with neither signal has no preset.
//
// THREE RULES THE LAYOUT KEEPS:
//  1. NO CROSS-ASSET ORDER, NO USD. The table's sort (`?sort=`, `?dir=`;
//     vault-index-table.tsx) compares amounts in the asset inside one token
//     only. Two quantities of one token are the only amounts compared.
//  2. AN EMPTY VAULT IS A READING, AN UNREAD ONE IS AN ABSENCE. A vault whose
//     `totalAssets()` answered zero sits behind the trailing disclosure; one
//     whose call did not answer is named as unread, never drawn as a zero.
//  3. THE COUNTS ARE THE READING'S. The facets, the search and the preset narrow
//     which rows are shown, and the counts line says how many of the funded
//     vaults are shown.

import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { assetKey } from "@/lib/shared/asset-family";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { isoSeconds, RosterReadStamp } from "@/components/vaults/roster-read-stamp";
import { InfoDisclosureTrigger } from "@/components/shared/info-disclosure";
import { SectionMenu, type SectionMenuLink } from "@/components/shared/section-menu";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import { DisclosureChevron } from "@/components/shared/expand-chevron";
import type { VaultRowReceipts } from "@/components/vaults/vault-heads";
import { VaultIndexTable, useVaultIndexSort } from "@/components/vaults/vault-index-table";
import type { ChainId } from "@/lib/shared/chains";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { PAGE_LINK, FOOT_LINK } from "@/lib/shared/ui-grammar";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";
import { vaultRosterShownProv } from "@/lib/vaults/roster-provenance";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import { ROSTER_HOLDERS_MIN, inRosterPreset } from "@/lib/vaults/roster-preset";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);

/** A count with its receipt where the roster states one. */
const withProv = (info: Provenance | undefined, text: string) => (info ? <Prov info={info}>{text}</Prov> : text);

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
  /** The vault layer's about page; null where there is none. */
  infoHref: string | null;
  /** In place of the one "Read at block N" line: the index's line per roster. */
  readAt?: ReactNode;
  /** The cross-protocol index, linked after the sentence; null on the index. */
  indexHref?: string | null;
  /** The roster's ⋮ at the right of the read-stamp row (`RosterMenu`): its
   *  pages. Absent on the index. */
  menu?: ReactNode;
}

/** The roster's name (`data-prov-scope`). */
export const ROSTER_SCOPE = "vault-roster";

/** The family roster's ⋮: every holder, the index and the about page on
 *  Rails, the protocol's docs. */
export function RosterMenu({
  listingHref,
  infoHref,
  docs,
}: {
  listingHref: string | null;
  infoHref: string | null;
  docs?: { title: string; subtitle: string; href: string };
}) {
  const links: SectionMenuLink[] = [
    ...(listingHref
      ? [
          {
            item: "every-holder",
            title: "Every holder",
            subtitle: "The positions in these vaults",
            href: listingHref,
            internal: true,
          },
        ]
      : []),
    {
      item: "vault-index",
      title: "All vaults",
      subtitle: "Every protocol's vaults on one table",
      href: VAULT_INDEX_HREF,
      internal: true,
    },
    ...(infoHref
      ? [{ item: "info", title: "How this is built", subtitle: "About these vaults", href: infoHref, internal: true }]
      : []),
    ...(docs ? [{ item: "docs", ...docs }] : []),
  ];
  return <SectionMenu scope={ROSTER_SCOPE} title="Vaults" links={links} />;
}

const rawOf = (v: VaultSummary) => BigInt(v.totalAssets?.raw ?? "0");

/** Has the vault a signal the preset reads: a census, else Yearn's endorsement. */
const hasSignal = (v: VaultSummary) => v.census != null || v.family === "yearn-v3";

/** The toolbar's state: the facets and the search held here, the preset and
 *  the table's sort read from the URL. */
interface RosterFilters extends BaseListFilters {
  facets: Filters;
  show: string[];
}

export function VaultRoster({
  vaults: allVaults,
  yieldOf,
  chainId,
  blockNumber,
  chainStale,
  skel,
  facets,
  hrefOf,
  holdersHrefOf,
  receiptsOf,
  hooksOf,
  assetFacet,
  emptyCountProv,
  head,
  initialFilters,
  facetsInUrl = false,
  initialSearch = "",
  readTime,
  leadOf = null,
  kindOf,
}: {
  vaults: readonly VaultSummary[];
  /** Decision 0047's figure for a vault. */
  yieldOf: (v: VaultSummary) => VaultYield | undefined;
  chainId: ChainId;
  /** The block every row was read at; 0 on the index, whose rosters each
   *  name their own. */
  blockNumber: number;
  chainStale: boolean;
  /** The `data-skel-section` prefix the family's skeleton records. */
  skel: "directory" | "roster" | "index";
  facets: readonly VaultRosterFacet[];
  hrefOf: (v: VaultSummary) => string;
  holdersHrefOf: ((v: VaultSummary) => string | null) | null;
  receiptsOf: (v: VaultSummary) => VaultRowReceipts;
  hooksOf?: (v: VaultSummary) => Record<string, string>;
  /** In place of the Asset facet (the index's Token, by symbol across chains). */
  assetFacet?: VaultRosterFacet;
  /** The empty count's receipt; absent on the index, which states none (ui-jobs 538). */
  emptyCountProv?: (count: number) => Provenance;
  head: VaultRosterHead;
  /** The facets chosen on arrival (the index's `?asset=`, ui-jobs 482). */
  initialFilters?: Filters;
  /** The query string the page was served with: the preset and the sort on
   *  first paint, before the roster reads the live URL. */
  initialSearch?: string;
  /** The read block's time, seconds (rails-server's stamp); else the loader's
   *  read time. */
  readTime?: number | null;
  /** The table's protocol lead column (the index's); absent on a one-protocol
   *  roster, which draws no lead column (ui-jobs 605). */
  leadOf?: ((v: VaultSummary) => string | null) | null;
  /** The Kind cell's words; absent, the family's kind (the index's). */
  kindOf?: (v: VaultSummary) => string;
  /** Keep the facets in the URL, one param per facet id, comma-separated
   *  (the index, ui-jobs 538), so a saved view or a copied link keeps them. */
  facetsInUrl?: boolean;
}) {
  const [introOpen, setIntroOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters ?? {});
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Focus (ui-jobs 557): the vaults whose share token or asset is in focus.
  const scoped = useScopedRows(
    allVaults as VaultSummary[],
    (v) => [assetKey(chainId, v.address), assetKey(chainId, v.asset.address)],
    () => chainId,
  );
  const vaults = scoped.rows;
  const funded = useMemo(() => vaults.filter((v) => v.totalAssets != null && rawOf(v) > ZERO), [vaults]);
  const emptyRows = useMemo(() => vaults.filter((v) => v.totalAssets != null && rawOf(v) === ZERO), [vaults]);
  const unread = useMemo(() => vaults.filter((v) => v.totalAssets == null), [vaults]);

  // Facet universes come from the whole reading, so an option never vanishes
  // because another facet hid its rows.
  const all = useMemo<VaultRosterFacet[]>(
    () => [
      assetFacet ?? {
        id: "asset",
        label: "Asset",
        valueOf: (v) => v.asset.address,
        labelOf: (a) => vaults.find((v) => v.asset.address === a)?.asset.symbol ?? shortAddress(a),
      },
      ...facets,
    ],
    [vaults, facets, assetFacet],
  );

  // ── the preset and the sort: what this roster has the signals for ──────────
  const withCensus = useMemo(() => vaults.some((v) => v.census != null), [vaults]);
  // Endorsement decides only for a Yearn vault the census has no row for.
  const withYearn = useMemo(() => vaults.some((v) => v.family === "yearn-v3" && v.census == null), [vaults]);
  const presetParts = [
    ...(withCensus ? [`${ROSTER_HOLDERS_MIN}+ holders`] : []),
    ...(withYearn ? [withCensus || vaults.some((v) => v.family !== "yearn-v3") ? "Yearn endorsed" : "Endorsed"] : []),
  ];
  const presetLabel = presetParts.join(" · ");
  const hasPreset = presetParts.length > 0 && vaults.some(hasSignal);
  // A link that arrives with facets chosen keeps the preset, unless the preset
  // would leave one of the values it asked for with no funded vault.
  const [arrivalShow] = useState<"used" | "all">(() => {
    for (const [id, values] of Object.entries(initialFilters ?? {})) {
      const f = all.find((x) => x.id === id);
      if (!f) continue;
      for (const value of values) {
        const asked = funded.filter((v) => f.valueOf(v) === value);
        if (asked.length > 0 && !asked.some(inRosterPreset)) return "all";
      }
    }
    return "used";
  });
  // The preset lives in the URL (`?show=`), written only off its default, and
  // the table's sort in `?sort=` and `?dir=` (useVaultIndexSort); every other
  // param is left as it came.
  const sp = useUrlSearchParams(initialSearch);
  const showParam = sp.get("show");
  const show: "used" | "all" = !hasPreset
    ? "all"
    : showParam === "all" || showParam === "used"
      ? showParam
      : arrivalShow;
  // Below sm the table stacks as cards (D6) and its headers are hidden: the
  // toolbar draws its sort.
  const { mobileSort } = useVaultIndexSort(initialSearch);
  /** The facets, written to the URL too where the roster keeps them there. */
  const setFacets = useCallback(
    (next: Filters) => {
      setFilters(next);
      if (!facetsInUrl) return;
      const p = new URLSearchParams(window.location.search);
      for (const f of all) {
        const values = next[f.id] ?? [];
        if (values.length > 0) p.set(f.id, values.join(","));
        else p.delete(f.id);
      }
      const qs = p.toString().replace(/%2C/gi, ",");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      notifyUrlChanged();
    },
    [facetsInUrl, all],
  );

  const writeShow = useCallback(
    (next: string) => {
      const p = new URLSearchParams(window.location.search);
      if (next === arrivalShow) p.delete("show");
      else p.set("show", next);
      const qs = p.toString().replace(/%2C/gi, ",");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      notifyUrlChanged();
    },
    [arrivalShow],
  );

  const state: RosterFilters = {
    q: query,
    sortBy: mobileSort.sortBy,
    sortOrder: mobileSort.sortOrder,
    facets: filters,
    show: [show],
  };
  const onToolbar = (next: RosterFilters) => {
    if (next.q !== query) setQuery(next.q);
    if (next.facets !== filters) setFacets(next.facets);
    const nextShow = next.show[0] ?? arrivalShow;
    if (nextShow !== show) writeShow(nextShow);
  };

  const dimensions = useMemo<FilterDimension<RosterFilters>[]>(() => {
    const facetDims = all.map((f) => {
      const counts = new Map<string, number>();
      for (const v of vaults) counts.set(f.valueOf(v), (counts.get(f.valueOf(v)) ?? 0) + 1);
      const values = f.order
        ? f.order.filter((o) => counts.has(o))
        : [...counts.keys()].sort(
            (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || f.labelOf(a).localeCompare(f.labelOf(b), "en-US"),
          );
      return {
        id: f.id,
        label: f.label,
        group: f.label,
        cardinality: "multi" as const,
        options: values.map((value) => ({ value, label: f.labelOf(value), meta: n(counts.get(value) ?? 0) })),
        get: (s: RosterFilters) => s.facets[f.id] ?? [],
        set: (s: RosterFilters, chosen: string[]) => ({ ...s, facets: { ...s.facets, [f.id]: chosen } }),
      };
    });
    if (!hasPreset) return facetDims;
    const preset: FilterDimension<RosterFilters> = {
      id: "show",
      label: "Shown",
      group: "Shown",
      cardinality: "single",
      options: [
        { value: "used", label: presetLabel },
        { value: "all", label: "Every vault" },
      ],
      get: (s) => s.show,
      set: (s, v) => ({ ...s, show: v.length > 0 ? v : [arrivalShow] }),
      defaultValues: () => [arrivalShow],
      defaultChip: (s) => (s.show[0] === "used" ? presetLabel : null),
      clearDefault: (s) => ({ ...s, show: ["all"] }),
      chipLabel: (v) => (v[0] === "all" ? "Every vault" : presetLabel),
    };
    return [...facetDims, preset];
  }, [all, vaults, hasPreset, presetLabel, arrivalShow]);

  // A substring over what the row prints: the live name, the catalogue's
  // snapshot, the symbol and the address. It narrows the reading already in
  // the document and makes no request.
  const needle = query.trim().toLowerCase();
  const presetOn = show === "used";
  /** The filter for a selection: the shown rows, and the phone sheet's staged
   *  count. */
  const passesFor = (s: RosterFilters) => {
    const want = s.q.trim().toLowerCase();
    const preset = (s.show[0] ?? arrivalShow) === "used";
    return (v: VaultSummary) =>
      (!preset || inRosterPreset(v)) &&
      all.every((f) => (s.facets[f.id]?.length ?? 0) === 0 || s.facets[f.id].includes(f.valueOf(v))) &&
      (want === "" ||
        [v.name, v.catalogName, v.symbol, v.address].some((x) => x != null && x.toLowerCase().includes(want)));
  };
  const passes = passesFor(state);
  const filtering = presetOn || needle !== "" || Object.values(filters).some((x) => x.length > 0);

  const fundedShown = useMemo(() => funded.filter(passes), [funded, filters, needle, presetOn]); // eslint-disable-line react-hooks/exhaustive-deps
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
    [emptyRows, filters, needle, presetOn], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // The criteria the counts line's receipt names.
  const criteria = [
    ...(presetOn ? [presetParts.join(" or ") + " (the preset; a vault with neither signal is kept)"] : []),
    ...all
      .filter((f) => (filters[f.id]?.length ?? 0) > 0)
      .map((f) => `${f.label}: ${filters[f.id].map(f.labelOf).join(", ")}`),
    ...(needle !== "" ? [`search “${query.trim()}”`] : []),
  ];
  const countNode = (
    <span data-figure="shown-count" data-shown={fundedShown.length} data-funded={funded.length}>
      <Prov info={vaultRosterShownProv(fundedShown.length, funded.length, criteria)}>
        {filtering
          ? `${n(fundedShown.length)} of ${n(funded.length)} funded vaults`
          : `${n(funded.length)} funded ${funded.length === 1 ? "vault" : "vaults"}`}
      </Prov>
    </span>
  );

  // The shown rows in the house table (V6, ui-jobs 605), which sorts them.
  const table = (rows: VaultSummary[], part: "funded" | "empty") => (
    <VaultIndexTable
      rows={rows}
      part={part}
      initialSearch={initialSearch}
      yieldOf={yieldOf}
      receiptsOf={receiptsOf}
      leadOf={leadOf}
      kindOf={kindOf}
      hrefOf={hrefOf}
      holdersHrefOf={holdersHrefOf ?? (() => null)}
      hooksOf={hooksOf ?? (() => ({}))}
    />
  );

  // On the index every roster has its own block, so a count says "at its block".
  const atBlock = blockNumber > 0 ? "at this block" : "at its roster’s block";
  const indexHref = head.indexHref === undefined ? VAULT_INDEX_HREF : head.indexHref;

  const intro = (
    <section className="mb-5" data-skel-section={`${skel}-denominator`}>
      {head.readAt ? (
        // The index's read line names each roster's block, the anchor its rows'
        // receipts name.
        <div className="flex items-center gap-1 text-[11px] text-rb-500" data-prov-exempt>
          {head.readAt}
          <InfoDisclosureTrigger
            open={introOpen}
            onToggle={() => setIntroOpen((o) => !o)}
            label="about these vaults"
            ariaControls="vault-roster-intro"
          />
          {head.menu && <span className="ml-auto">{head.menu}</span>}
        </div>
      ) : (
        !chainStale && (
          // The block is the anchor every receipt below names, so the line
          // carries the coverage exemption the tripwire reads.
          <div
            className="flex items-center gap-1 text-[11px] text-rb-500"
            data-directory-block={blockNumber}
            data-prov-exempt
          >
            <RosterReadStamp
              reads={[
                {
                  label: "this roster",
                  block: blockNumber,
                  at: readTime ?? isoSeconds(vaults.find((v) => v.readAt.block === blockNumber)?.readAt.timestamp),
                },
              ]}
            />
            <InfoDisclosureTrigger
              open={introOpen}
              onToggle={() => setIntroOpen((o) => !o)}
              label="about these vaults"
              ariaControls="vault-roster-intro"
            />
            {head.menu && <span className="ml-auto">{head.menu}</span>}
          </div>
        )
      )}
      <div
        id="vault-roster-intro"
        data-intro-drawer
        hidden={!introOpen}
        className="mt-2 max-w-3xl space-y-2 rounded-xl bg-raised px-3 py-3 text-[12px] leading-relaxed text-rb-500"
      >
        {head.drawer}
        {head.infoHref && (
          <p>
            <Link href={head.infoHref} className={`text-xs font-semibold ${FOOT_LINK}`} prefetch={false}>
              How this is built
            </Link>
          </p>
        )}
      </div>
      {head.census != null && (
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure={head.censusFigure}>
          {head.census}
          {head.listingHref && (
            <>
              {" "}
              <Link href={head.listingHref} className={PAGE_LINK} prefetch={false} data-link="every-holder">
                Every holder
              </Link>
            </>
          )}
          {indexHref && (
            <>
              {" "}
              <Link href={indexHref} className={PAGE_LINK} prefetch={false} data-link="vault-index">
                All vaults
              </Link>
            </>
          )}
        </p>
      )}
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
      <ScopeNote scoped={scoped} noun={["vault", "vaults"]} className="mb-2" />
      {/* ── the listings' toolbar: search, facets and preset, sort ──────── */}
      <ListToolbar
        dimensions={dimensions}
        filters={state}
        onChange={onToolbar}
        sortOptions={[]}
        searchPlaceholder="Vault name, symbol or address"
        countNode={countNode}
        sheetCount={{ total: fundedShown.length, noun: "funded vaults" }}
        countFor={(draft) => funded.filter(passesFor(draft)).length}
        mobileSort={mobileSort}
        // The view menu (N1.7: save listing, copy its link) where the URL
        // holds the whole view, facets included.
        viewMenu={facetsInUrl}
        skel={`${skel}-facets`}
      />

      {/* ── the funded vaults, one flat table ───────────────────────────── */}
      <div data-skel-section={`${skel}-groups`}>
        {fundedShown.length === 0 ? (
          <p className="mb-6 text-[13px] text-rb-500">
            {blockNumber > 0 ? `No funded vault matches at block ${n(blockNumber)}.` : "No funded vault matches."}
          </p>
        ) : (
          table(fundedShown, "funded")
        )}
      </div>

      {/* ── the vaults that hold nothing: a reading, behind one disclosure ── */}
      {emptyRows.length > 0 && (!presetOn || emptyShown.length > 0) && (
        <section className="mb-6" data-skel-section={`${skel}-empty`} data-empty-group>
          <button
            type="button"
            onClick={() => setEmptyOpen((o) => !o)}
            aria-expanded={emptyOpen}
            className="group/empty flex cursor-pointer items-center gap-2 rounded-sm text-left text-sm font-semibold text-foreground underline-offset-2 hover:underline"
          >
            <DisclosureChevron isOpen={emptyOpen} />
            <span data-figure="empty-count">
              {withProv(
                emptyCountProv?.(emptyRows.length),
                emptyRows.length === 1
                  ? `1 vault holds nothing ${atBlock}`
                  : `${n(emptyRows.length)} vaults hold nothing ${atBlock}`,
              )}
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
                table(emptyShown, "empty")
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
              ? `1 vault could not be read ${atBlock}`
              : `${n(unread.length)} vaults could not be read ${atBlock}`}
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
