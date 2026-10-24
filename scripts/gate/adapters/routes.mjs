// Approach 2: page pattern → the data routes the page reads, diffed as
// normalised JSON. Each entry's `routes(match, query)` names the GETs the page
// makes; where the app has a fetch helper for a read, the path comes from that
// helper (captureUrls), so the map and the page cannot disagree about a query.
// A listing reads its default page: the filters `ssrDecode` gives an empty
// query.
//
// The opening balance below a timeline's cut (`.../timeline/summary`) and the
// folder members are read on demand by the page and depend on the first read's
// answer; they are left out. A SKIP entry names the reason the page has nothing
// the gate can read from the public hosts.

import { captureUrls } from "../lib/host-fetch.mjs";
import { ssrDecode } from "@/lib/shared/listing-ssr";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { TIMELINE_WINDOW_ROWS } from "@/lib/shared/timeline-opening-balance";
import { MAINNET_CHAIN_ID, BASE_CHAIN_ID } from "@/lib/shared/chains";

import { fetchAaveV3Positions } from "@/lib/api/fetch-aave-v3-positions";
import { fetchCompoundV2Positions } from "@/lib/api/fetch-compound-v2-positions";
import { fetchCompoundV2Timeline, fetchCompoundV2GroupedTimeline } from "@/lib/api/fetch-compound-v2-timeline";
import { fetchCompoundV2ChainPosition } from "@/lib/api/fetch-compound-v2-position";
import { fetchCompoundPositions } from "@/lib/api/fetch-compound-positions";
import { fetchCompoundTimeline, fetchCompoundGroupedTimeline } from "@/lib/api/fetch-compound-timeline";
import { fetchCompoundPosition } from "@/lib/api/fetch-compound-position";
import { fetchCompoundWallet } from "@/lib/api/fetch-compound-wallet";
import { fetchChainTimeline } from "@/lib/api/fetch-chain-timeline";
import { fetchMoonwellPositions } from "@/lib/api/fetch-moonwell-positions";
import { fetchMoonwellTimeline } from "@/lib/api/fetch-moonwell-timeline";
import { fetchMoonwellChainPosition } from "@/lib/api/fetch-moonwell-position";
import { fetchMoonwellBaseMarkets } from "@/lib/api/fetch-moonwell-base-markets";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import { fetchMorphoTimeline, fetchMorphoGroupedTimeline } from "@/lib/api/fetch-morpho-timeline";
import { fetchMorphoPosition } from "@/lib/api/fetch-morpho-position";
import { fetchMorphoMarketRoster } from "@/lib/api/fetch-morpho-market-roster";
import { fetchMorphoBaseWallet } from "@/lib/api/fetch-morpho-wallet";
import { fetchMorphoBaseTimeline } from "@/lib/api/fetch-morpho-base-timeline";
import { splitMorphoPositionId } from "@/lib/morpho/position-id";
import { fetchMakerVaults } from "@/lib/api/fetch-makerdao-vaults";
import { fetchMakerTimeline, fetchMakerGroupedTimeline } from "@/lib/api/fetch-makerdao-timeline";
import { fetchMakerIlkRoster } from "@/lib/api/fetch-makerdao-ilk-roster";
import { fetchMakerVaultPage } from "@/lib/makerdao/list-fetch";
import { fetchFluidPositions } from "@/lib/api/fetch-fluid-positions";
import { fetchFluidTimeline } from "@/lib/api/fetch-fluid-timeline";
import { fetchFluidChainPosition } from "@/lib/api/fetch-fluid-position";
import { fetchFrankencoinPositions } from "@/lib/api/fetch-frankencoin-positions";
import { fetchFrankencoinTimeline } from "@/lib/api/fetch-frankencoin-timeline";
import { fetchFrankencoinChainPosition } from "@/lib/api/fetch-frankencoin-position";
import { fetchFxPositions } from "@/lib/api/fetch-fx-positions";
import { fetchFxTimeline } from "@/lib/api/fetch-fx-timeline";
import { fetchFxPoolStats } from "@/lib/api/fetch-fx-stats";
import { fetchFxDrift } from "@/lib/sources/api/fx-drift";
import { parseFxPositionSlug } from "@/lib/fx/asset-catalog";
import { fetchPwnPositions, fetchAllPwnPositions } from "@/lib/api/fetch-pwn-positions";
import { fetchPwnTimeline } from "@/lib/api/fetch-pwn-timeline";
import { fetchPolarisPositionSummary } from "@/lib/api/fetch-polaris-positions";
import { fetchPolarisTimeline } from "@/lib/api/fetch-polaris-timeline";
import { fetchPolarisChainPosition } from "@/lib/api/fetch-polaris-position";
import { fetchPolarisListingPage } from "@/lib/polaris/listing-fetch";
import { fetchMaplePositions } from "@/lib/api/fetch-maple-positions";
import { fetchMapleTimeline, fetchMapleGroupedTimeline } from "@/lib/api/fetch-maple-timeline";
import { fetchLlamalendPositions } from "@/lib/api/fetch-llamalend-positions";
import { fetchLlamalendTimeline } from "@/lib/api/fetch-llamalend-timeline";
import { fetchLlamalendChainPosition } from "@/lib/api/fetch-llamalend-position";
import { fetchDolomitePositions } from "@/lib/api/fetch-dolomite-positions";
import { fetchDolomiteTimeline } from "@/lib/api/fetch-dolomite-timeline";
import { fetchDolomiteChainPosition } from "@/lib/api/fetch-dolomite-position";
import { fetchAaveV4Positions, fetchAaveV4Timeline } from "@/lib/api/fetch-aave-v4";
import { fetchAaveV4SpokePosition } from "@/lib/api/fetch-aave-v4-spoke-position";
import { fetchAaveV4SpokePositions } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { fetchAaveV4Hubs } from "@/lib/api/fetch-aave-v4-hubs";
import { resolveSpokeSegment, SPOKE_NAME_TO_KEY } from "@/lib/aave-v4/spoke-meta";
import { AAVE_V4_API_ROOT, AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";
import { fetchAlchemixPositions } from "@/lib/api/fetch-alchemix-positions";
import { fetchAlchemixTransmuterPositions } from "@/lib/api/fetch-alchemix-transmuter-positions";
import { fetchAlchemixV2Positions } from "@/lib/api/fetch-alchemix-v2-positions";
import { ALCHEMIX_ETHEREUM, ALCHEMIX_BASE, v2LinesForChain } from "@/lib/alchemix/lines";
import { fetchSparkPositions } from "@/lib/api/fetch-spark-positions";
import { fetchTroves } from "@/lib/api/fetch-troves";
import { fetchLiquityV1Positions } from "@/lib/api/fetch-liquity-v1-positions";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { fetchAsymmetryTroves } from "@/lib/api/fetch-asymmetry-troves";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import { fetchSkyListingPage, SKY_LIST_DEFAULTS, skyListDimensions } from "@/lib/sky-savings/listing";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { COMPOUND_BASE_PAGE } from "@/lib/compound-base/page-deployment";
import { MORPHO_BASE_PAGE } from "@/lib/morpho-base/page-deployment";

import * as aaveV3List from "@/lib/aave-v3/list-filter-dimensions";
import * as aaveV3BaseList from "@/lib/aave-v3-base/list-filter-dimensions";
import * as seamlessList from "@/lib/seamless/list-filter-dimensions";
import * as sparkList from "@/lib/spark/list-filter-dimensions";
import * as aaveV4List from "@/lib/aave-v4/list-filter-dimensions";
import * as aaveV4BaseList from "@/lib/aave-v4-base/list-filter-dimensions";
import * as compoundV2List from "@/lib/compound-v2/list-filter-dimensions";
import * as compoundList from "@/lib/compound/list-filter-dimensions";
import * as compoundBaseList from "@/lib/compound-base/list-filter-dimensions";
import * as moonwellList from "@/lib/moonwell/list-filter-dimensions";
import * as moonwellBaseList from "@/lib/moonwell-base/list-filter-dimensions";
import * as morphoList from "@/lib/morpho/list-filter-dimensions";
import * as morphoBaseList from "@/lib/morpho-base/list-filter-dimensions";
import * as makerList from "@/lib/makerdao/list-filter-dimensions";
import * as fluidList from "@/lib/fluid/list-filter-dimensions";
import * as frankencoinList from "@/lib/frankencoin/list-filter-dimensions";
import * as fxList from "@/lib/fx/list-filter-dimensions";
import * as pwnList from "@/lib/pwn/list-filter-dimensions";
import * as polarisList from "@/lib/polaris/list-filter-dimensions";
import * as mapleList from "@/lib/maple/list-filter-dimensions";
import * as llamalendList from "@/lib/llamalend/list-filter-dimensions";
import * as dolomiteList from "@/lib/dolomite/list-filter-dimensions";
import * as liquityV1List from "@/lib/liquity-v1/list-filter-dimensions";
import * as liquityV2List from "@/lib/liquity-v2/list-filter-dimensions";
import * as ebisuList from "@/lib/ebisu/list-filter-dimensions";
import * as asymmetryList from "@/lib/asymmetry/list-filter-dimensions";
import * as basedollarList from "@/lib/basedollar/list-filter-dimensions";
import * as alchemixList from "@/lib/alchemix/list-filter-dimensions";
import * as transmuterList from "@/lib/alchemix/transmuter-list-filter-dimensions";
import * as v2List from "@/lib/alchemix/v2-list-filter-dimensions";
import * as aaveVaultPositionList from "@/lib/aave-vaults/position-list-filter-dimensions";
import * as baseVaultPositionList from "@/lib/morpho-base/position-list-filter-dimensions";

const ADDR = "(0x[0-9a-fA-F]{40})";
const re = (pattern) => new RegExp(`^${pattern}/?$`);
const lower = (s) => s.toLowerCase();
const grouped = (query) => servedFoldersFromParam(query.get("folders"));
const recent = { recent: TIMELINE_WINDOW_ROWS };

/** The default page's filters: what `ssrDecode` makes of an empty query.
 *  `dims` builds the dimensions with the arguments the page passes. */
function defaultPage(dims, defaults) {
  return ssrDecode(dims(), new URLSearchParams(), defaults);
}

/** A listing's default page through its own fetch helper; `extra` are the
 *  side reads the listing makes beside the rows (a roster, a stats route). */
function listing(dims, defaults, read, extra = () => []) {
  return () =>
    captureUrls(() => {
      const { filters, page } = defaultPage(dims, defaults);
      return [read(filters, page), ...extra()];
    });
}

const UNAVAILABLE_ROSTER = { status: "unavailable", roster: null };

// ── Position pages ─────────────────────────────────────────────────────────

const POSITIONS = [
  {
    // app/(app)/ethereum/compound-v2/[wallet]/position-view.tsx
    id: "compound-v2",
    match: re(`/ethereum/compound-v2/${ADDR}`),
    routes: ([, w], q) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchCompoundV2Positions({ wallet, limit: 1 }),
          grouped(q) ? fetchCompoundV2GroupedTimeline(wallet) : fetchCompoundV2Timeline(wallet, recent),
          fetchCompoundV2ChainPosition({ wallet }),
        ];
      }),
  },
  {
    // app/(app)/ethereum/compound-v3/[market]/[wallet]/position-view.tsx
    id: "compound-v3",
    match: re(`/ethereum/compound-v3/([a-z0-9]+)/${ADDR}`),
    routes: ([, market, w], q) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchCompoundPositions({ wallet, market, limit: 1 }),
          grouped(q)
            ? fetchCompoundGroupedTimeline(wallet, market)
            : fetchCompoundTimeline(wallet, { market, ...recent }),
          fetchCompoundPosition({ wallet, market }),
        ];
      }),
  },
  {
    // components/protocol/compound/compound-wallet-page.tsx with
    // COMPOUND_BASE_PAGE: the wallet's slots across every Comet and the
    // deployment's sweep route; the market segment picks the Comet drawn.
    id: "compound-v3-base",
    match: re(`/base/compound-v3/([a-z0-9]+)/${ADDR}`),
    routes: ([, , w], q) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchCompoundWallet({ wallet, route: COMPOUND_BASE_PAGE.routes.wallet }),
          fetchChainTimeline({
            wallet,
            route: COMPOUND_BASE_PAGE.routes.timeline,
            params: grouped(q) ? { group: "1" } : undefined,
          }),
        ];
      }),
  },
  {
    // app/(app)/ethereum/moonwell/[wallet]/position-view.tsx
    id: "moonwell",
    match: re(`/ethereum/moonwell/${ADDR}`),
    routes: ([, w]) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchMoonwellPositions({ wallet, limit: 1 }),
          fetchMoonwellTimeline(wallet, recent),
          fetchMoonwellChainPosition({ wallet }),
        ];
      }),
  },
  {
    // app/(app)/base/moonwell/[wallet]/moonwell-base-view.tsx
    id: "moonwell-base",
    match: re(`/base/moonwell/${ADDR}`),
    routes: ([, w], q) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchMoonwellChainPosition({ wallet, route: "/api/chain/moonwell-base/position" }),
          fetchChainTimeline({
            wallet,
            route: "/api/chain/moonwell-base/timeline",
            params: grouped(q) ? { group: "1" } : undefined,
          }),
        ];
      }),
  },
  {
    // app/(app)/ethereum/morpho/[positionId]/position-view.tsx
    id: "morpho",
    match: re(`/ethereum/morpho/([0-9a-fA-Fx]+-0x[0-9a-fA-F]{40})`),
    routes: ([, positionId], q) =>
      captureUrls(() => {
        const { market, user } = splitMorphoPositionId(positionId);
        return [
          fetchMorphoPositions({ market, user, limit: 1 }),
          grouped(q) ? fetchMorphoGroupedTimeline(positionId) : fetchMorphoTimeline(positionId, recent),
          fetchMorphoPosition({ market, user }),
        ];
      }),
  },
  {
    // components/protocol/morpho/morpho-market-position-page.tsx with
    // MORPHO_BASE_PAGE (lib/morpho-base/use-wallet-reads.ts): the wallet's
    // slots and its sweep, grouped to the page's market by default.
    id: "morpho-base-position",
    match: re(`/base/morpho/${ADDR}/(0x[0-9a-fA-F]{64})`),
    routes: ([, w, market], q) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchMorphoBaseWallet({ wallet, route: MORPHO_BASE_PAGE.routes.wallet }),
          fetchMorphoBaseTimeline(wallet, grouped(q) ? market : undefined, MORPHO_BASE_PAGE.routes.timeline),
        ];
      }),
  },
  {
    // components/protocol/morpho/morpho-wallet-page.tsx: the same reads, flat.
    id: "morpho-base-wallet",
    match: re(`/base/morpho/${ADDR}`),
    routes: ([, w]) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchMorphoBaseWallet({ wallet, route: MORPHO_BASE_PAGE.routes.wallet }),
          fetchMorphoBaseTimeline(wallet, undefined, MORPHO_BASE_PAGE.routes.timeline),
        ];
      }),
  },
  {
    // app/(app)/ethereum/makerdao/[vault]/position-view.tsx: the Vat read, the
    // vaults row (by cdp id or urn), one timeline read.
    id: "makerdao",
    match: re(`/ethereum/makerdao/(\\d+|0x[0-9a-fA-F]{40})`),
    routes: ([, vault], q) =>
      captureUrls(() => {
        const isUrn = vault.startsWith("0x");
        return [
          fetch(`/api/chain/makerdao/vault/${encodeURIComponent(vault)}`),
          fetchMakerVaults(isUrn ? { urn: vault, limit: 1 } : { cdpId: vault, limit: 1 }),
          grouped(q) ? fetchMakerGroupedTimeline(vault) : fetchMakerTimeline(vault, recent),
        ];
      }),
  },
  {
    // app/(app)/ethereum/fluid/[nft]/position-view.tsx
    id: "fluid",
    match: re(`/ethereum/fluid/(\\d+)`),
    routes: ([, nft]) =>
      captureUrls(() => [
        fetchFluidPositions({ nft, limit: 1 }),
        fetchFluidTimeline(nft, recent),
        fetchFluidChainPosition(nft),
      ]),
  },
  {
    // app/(app)/ethereum/frankencoin/[position]/position-view.tsx
    id: "frankencoin",
    match: re(`/ethereum/frankencoin/${ADDR}`),
    routes: ([, position]) =>
      captureUrls(() => [
        fetchFrankencoinPositions({ position, limit: 1 }),
        fetchFrankencoinTimeline(position, recent),
        fetchFrankencoinChainPosition({ position }),
      ]),
  },
  {
    // app/(app)/ethereum/fx/[position]/position-view.tsx: the timeline window
    // and the drift read.
    id: "fx",
    match: re(`/ethereum/fx/((?:wsteth|wbtc)-\\d+)`),
    routes: ([, slug]) =>
      captureUrls(() => {
        const { pool, positionId } = parseFxPositionSlug(slug);
        return [fetchFxTimeline(pool, positionId, recent), fetchFxDrift(pool, positionId)];
      }),
  },
  {
    // app/(app)/ethereum/pwn/[wallet]/position-view.tsx: every loan the wallet
    // is party to and the timeline window; `?loan=` picks the loan drawn.
    id: "pwn",
    match: re(`/ethereum/pwn/${ADDR}`),
    routes: ([, w]) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [fetchPwnPositions({ wallet, limit: 100 }), fetchPwnTimeline(wallet, recent)];
      }),
  },
  {
    // app/(app)/sepolia/polaris/[market]/[id]/position-view.tsx
    id: "polaris",
    match: re(`/sepolia/polaris/([a-z]+)/(\\d+)`),
    routes: ([, market, cdpId]) =>
      captureUrls(() => [
        fetchPolarisPositionSummary(market, cdpId),
        fetchPolarisTimeline(market, cdpId),
        fetchPolarisChainPosition({ market, cdpId }),
      ]),
  },
  {
    // app/(app)/ethereum/maple/[wallet]/position-view.tsx: the positions row,
    // one timeline read and the custody read.
    id: "maple",
    match: re(`/ethereum/maple/${ADDR}`),
    routes: ([, w], q) =>
      captureUrls(() => {
        const wallet = lower(w);
        return [
          fetchMaplePositions({ wallet, limit: 1, status: undefined }),
          grouped(q) ? fetchMapleGroupedTimeline(wallet) : fetchMapleTimeline(wallet, recent),
          fetch(`/api/chain/maple/custody?address=${wallet}`),
        ];
      }),
  },
  {
    // app/(app)/ethereum/llamalend/[controller]/[user]/position-view.tsx
    id: "llamalend",
    match: re(`/ethereum/llamalend/${ADDR}/${ADDR}`),
    routes: ([, controller, user]) =>
      captureUrls(() => [
        fetchLlamalendPositions({ controller, user, limit: 1 }),
        fetchLlamalendTimeline(controller, user, recent),
        fetchLlamalendChainPosition({ controller, user }),
      ]),
  },
  {
    // app/(app)/ethereum/dolomite/[owner]/[accountNumber]/position-view.tsx
    id: "dolomite",
    match: re(`/ethereum/dolomite/${ADDR}/(\\d+)`),
    routes: ([, owner, accountNumber]) =>
      captureUrls(() => [
        fetchDolomitePositions({ owner, accountNumber, limit: 1 }),
        fetchDolomiteTimeline(owner, accountNumber, recent),
        fetchDolomiteChainPosition({ owner, accountNumber }),
      ]),
  },
  {
    // components/protocol/aave-v4/aave-v4-spoke-view.tsx: the wallet's
    // positions, the spoke's live read and the timeline window, under the
    // deployment's api root.
    id: "aave-v4",
    match: re(`/(ethereum|base)/aave-v4/spoke/([^/]+)/${ADDR}`),
    routes: ([, chain, segment, w]) =>
      captureUrls(() => {
        const wallet = lower(w);
        const apiRoot = chain === "base" ? AAVE_V4_BASE_API_ROOT : AAVE_V4_API_ROOT;
        // A segment that names no known spoke gets no live read on the page.
        const spoke = SPOKE_NAME_TO_KEY[resolveSpokeSegment(segment).name];
        return [
          fetchAaveV4Positions({ wallet, apiRoot }),
          ...(spoke ? [fetchAaveV4SpokePosition({ wallet, spoke, apiRoot })] : []),
          fetchAaveV4Timeline({ wallet, recent: TIMELINE_WINDOW_ROWS, apiRoot }),
        ];
      }),
  },
  {
    // lib/alchemix/position-page-data.ts: the position, its timeline window
    // and the live state, through this deployment's /api/alchemix proxy.
    id: "alchemix",
    match: re(`/(?:ethereum|base)/alchemix/([a-z0-9-]+)/(\\d+)`),
    routes: ([, line, id]) => [
      `/api/alchemix/position/${line}/${id}`,
      `/api/alchemix/position/${line}/${id}/timeline?limit=${TIMELINE_WINDOW_ROWS}`,
      `/api/alchemix/position/${line}/${id}/state`,
    ],
  },
  {
    // lib/alchemix/transmuter-page-data.ts
    id: "alchemix-transmuter",
    match: re(`/(?:ethereum|base)/alchemix/transmuter/([a-z0-9-]+)/(\\d+)`),
    routes: ([, line, id]) => [`/api/alchemix/transmuter/position/${line}/${id}`],
  },
  {
    // lib/alchemix/v2-page-data.ts
    id: "alchemix-v2",
    match: re(`/ethereum/alchemix/v2/([a-z0-9-]+)/${ADDR}`),
    routes: ([, line, account]) => [`/api/alchemix/v2/position/${line}/${lower(account)}`],
  },
  {
    // app/(app)/ethereum/sky-savings/[holder]/page.tsx reads rails-server's
    // /api/sky-savings with the bearer token in the server render; its one
    // public route is the positions listing, filtered to the holder.
    id: "sky-savings",
    note: "the holder's listing row only; the timeline, days and rates are server-only",
    match: re(`/ethereum/sky-savings/${ADDR}`),
    routes: ([, holder]) => [`/api/sky-savings/positions?status=all&owner=${lower(holder)}&limit=1`],
  },
  {
    // app/(app)/ethereum/aave/vaults/[vault]/page.tsx: loadAaveEthereumVault,
    // which /api/chain/aave-vaults/vault serves without a holder.
    id: "aave-vault",
    match: re(`/ethereum/aave/vaults/${ADDR}`),
    routes: ([, vault]) => [`/api/chain/aave-vaults/vault?vault=${lower(vault)}`],
  },
  {
    // app/(app)/base/morpho/vaults/[vault]/page.tsx: loadMorphoBaseVault.
    id: "morpho-base-vault",
    match: re(`/base/morpho/vaults/${ADDR}`),
    routes: ([, vault]) => [`/api/chain/morpho-base/vault?vault=${lower(vault)}`],
  },
];

// ── Listings, each at its default query ────────────────────────────────────

const LISTINGS = [
  {
    id: "aave-v3-listing",
    match: re(`/ethereum/aave-v3`),
    routes: listing(
      () => aaveV3List.aaveV3ListDimensions(),
      aaveV3List.AAVE_V3_LIST_DEFAULTS,
      (f, p) => fetchAaveV3Positions(aaveV3List.aaveV3FiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "aave-v3-base-listing",
    match: re(`/base/aave-v3`),
    routes: listing(
      () => aaveV3BaseList.aaveV3BaseListDimensions(),
      aaveV3BaseList.AAVE_V3_BASE_LIST_DEFAULTS,
      (f, p) => fetchAaveV3Positions(aaveV3BaseList.aaveV3BaseFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "seamless-listing",
    match: re(`/base/seamless`),
    routes: listing(
      () => seamlessList.seamlessListDimensions(),
      seamlessList.SEAMLESS_LIST_DEFAULTS,
      (f, p) => fetchAaveV3Positions(seamlessList.seamlessFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "spark-listing",
    match: re(`/ethereum/spark`),
    routes: listing(
      () => sparkList.sparkListDimensions(),
      sparkList.SPARK_LIST_DEFAULTS,
      (f, p) => fetchSparkPositions(sparkList.sparkFiltersToFetchParams(f, p)),
    ),
  },
  {
    // The client listing's read (the server render reads the box directly).
    id: "aave-v4-listing",
    match: re(`/ethereum/aave-v4`),
    routes: listing(
      () => aaveV4List.aaveV4ListDimensions(aaveV4List.AAVE_V4_LIST_DEFAULTS, undefined),
      aaveV4List.AAVE_V4_LIST_DEFAULTS,
      (f, p) => fetchAaveV4SpokePositions(aaveV4List.aaveV4FiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "aave-v4-base-listing",
    match: re(`/base/aave-v4`),
    routes: listing(
      () => aaveV4BaseList.aaveV4BaseListDimensions(),
      aaveV4BaseList.AAVE_V4_BASE_LIST_DEFAULTS,
      (f, p) => fetchAaveV4SpokePositions(aaveV4BaseList.aaveV4BaseFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "compound-v2-listing",
    match: re(`/ethereum/compound-v2`),
    routes: listing(
      () => compoundV2List.compoundV2ListDimensions(),
      compoundV2List.COMPOUND_V2_LIST_DEFAULTS,
      (f, p) => fetchCompoundV2Positions(compoundV2List.compoundV2FiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "compound-v3-listing",
    match: re(`/ethereum/compound-v3`),
    routes: listing(
      () => compoundList.compoundListDimensions(),
      compoundList.COMPOUND_LIST_DEFAULTS,
      (f, p) => fetchCompoundPositions(compoundList.compoundFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "compound-v3-base-listing",
    match: re(`/base/compound-v3`),
    routes: listing(
      () => compoundBaseList.compoundBaseListDimensions(),
      compoundBaseList.COMPOUND_BASE_LIST_DEFAULTS,
      (f, p) => fetchCompoundPositions(compoundBaseList.compoundBaseFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "moonwell-listing",
    match: re(`/ethereum/moonwell`),
    routes: listing(
      () => moonwellList.moonwellListDimensions(),
      moonwellList.MOONWELL_LIST_DEFAULTS,
      (f, p) => fetchMoonwellPositions(moonwellList.moonwellFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "moonwell-base-listing",
    match: re(`/base/moonwell`),
    routes: listing(
      () => moonwellBaseList.moonwellBaseListDimensions(moonwellBaseList.MOONWELL_BASE_LIST_DEFAULTS, undefined),
      moonwellBaseList.MOONWELL_BASE_LIST_DEFAULTS,
      (f, p) => fetchMoonwellPositions(moonwellBaseList.moonwellBaseFiltersToFetchParams(f, p)),
      () => [fetchMoonwellBaseMarkets()],
    ),
  },
  {
    id: "morpho-listing",
    match: re(`/ethereum/morpho`),
    routes: listing(
      () => morphoList.morphoListDimensions(morphoList.MORPHO_LIST_DEFAULTS, undefined),
      morphoList.MORPHO_LIST_DEFAULTS,
      (f, p) => {
        const params = morphoList.morphoFiltersToFetchParams(f, p, UNAVAILABLE_ROSTER);
        if (!params) throw new Error("the default Morpho filters need the market roster");
        return fetchMorphoPositions(params);
      },
      () => [fetchMorphoMarketRoster()],
    ),
  },
  {
    id: "morpho-base-listing",
    match: re(`/base/morpho`),
    routes: listing(
      () => morphoBaseList.morphoBaseListDimensions(morphoBaseList.MORPHO_BASE_LIST_DEFAULTS),
      morphoBaseList.MORPHO_BASE_LIST_DEFAULTS,
      (f, p) => fetchMorphoPositions(morphoBaseList.morphoBaseFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "makerdao-listing",
    match: re(`/ethereum/makerdao`),
    routes: listing(
      () => makerList.makerListDimensions(makerList.MAKER_LIST_DEFAULTS, undefined),
      makerList.MAKER_LIST_DEFAULTS,
      (f, p) => fetchMakerVaultPage(f, p, UNAVAILABLE_ROSTER),
      () => [fetchMakerIlkRoster()],
    ),
  },
  {
    id: "fluid-listing",
    match: re(`/ethereum/fluid`),
    routes: listing(
      () => fluidList.fluidListDimensions(),
      fluidList.FLUID_LIST_DEFAULTS,
      (f, p) => fetchFluidPositions(fluidList.fluidFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "frankencoin-listing",
    match: re(`/ethereum/frankencoin`),
    routes: listing(
      () => frankencoinList.frankencoinListDimensions(),
      frankencoinList.FRANKENCOIN_LIST_DEFAULTS,
      (f, p) => fetchFrankencoinPositions(frankencoinList.frankencoinFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "fx-listing",
    match: re(`/ethereum/fx`),
    routes: listing(
      () => fxList.fxListDimensions(),
      fxList.FX_LIST_DEFAULTS,
      (f, p) => fetchFxPositions(fxList.fxFiltersToFetchParams(f, p)),
      () => [fetchFxPoolStats()],
    ),
  },
  {
    // The whole book, read a page at a time; the gate reads its first page.
    id: "pwn-listing",
    note: "the first page of the whole-book read",
    match: re(`/ethereum/pwn`),
    routes: listing(
      () => pwnList.pwnListDimensions([]),
      pwnList.PWN_LIST_DEFAULTS,
      () => fetchAllPwnPositions({ sortOrder: "desc" }),
    ),
  },
  {
    id: "polaris-listing",
    match: re(`/sepolia/polaris`),
    routes: listing(
      () => polarisList.polarisListDimensions(),
      polarisList.POLARIS_LIST_DEFAULTS,
      (f, p) => fetchPolarisListingPage(f, p),
    ),
  },
  {
    id: "maple-listing",
    match: re(`/ethereum/maple`),
    routes: listing(
      () => mapleList.mapleListDimensions(),
      mapleList.MAPLE_LIST_DEFAULTS,
      (f, p) => fetchMaplePositions(mapleList.mapleFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "llamalend-listing",
    match: re(`/ethereum/llamalend`),
    routes: listing(
      () => llamalendList.llamalendListDimensions(),
      llamalendList.LLAMALEND_LIST_DEFAULTS,
      (f, p) => fetchLlamalendPositions(llamalendList.llamalendFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "dolomite-listing",
    match: re(`/ethereum/dolomite`),
    routes: listing(
      () => dolomiteList.dolomiteListDimensions(),
      dolomiteList.DOLOMITE_LIST_DEFAULTS,
      (f, p) => fetchDolomitePositions(dolomiteList.dolomiteFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "liquity-v1-listing",
    match: re(`/ethereum/liquity-v1`),
    routes: listing(
      () => liquityV1List.liquityV1ListDimensions(),
      liquityV1List.liquityV1ListDefaults(""),
      (f, p) => fetchLiquityV1Positions(liquityV1List.liquityV1FiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "liquity-v2-listing",
    match: re(`/ethereum/liquity-v2`),
    routes: listing(
      () => liquityV2List.liquityV2ListDimensions(),
      liquityV2List.LIQUITY_V2_LIST_DEFAULTS,
      (f, p) => fetchTroves(liquityV2List.liquityV2FiltersToFetchParams(f, p)),
    ),
  },
  {
    // The three fork listings read every Trove by debt and filter in the page.
    id: "ebisu-listing",
    match: re(`/ethereum/ebisu`),
    routes: () => captureUrls(() => [fetchEbisuTroves({ sortBy: "debt", sortOrder: "desc", limit: 500 })]),
  },
  {
    id: "asymmetry-listing",
    match: re(`/ethereum/asymmetry`),
    routes: () => captureUrls(() => [fetchAsymmetryTroves({ sortBy: "debt", sortOrder: "desc", limit: 500 })]),
  },
  {
    id: "basedollar-listing",
    match: re(`/base/basedollar`),
    routes: () => captureUrls(() => [fetchBasedollarTroves({ sortBy: "debt", sortOrder: "desc", limit: 500 })]),
  },
  {
    id: "sky-savings-listing",
    match: re(`/ethereum/sky-savings`),
    routes: listing(
      () => skyListDimensions(),
      SKY_LIST_DEFAULTS,
      (f, p) => fetchSkyListingPage(f, p),
    ),
  },
  {
    // lib/alchemix/listing-page-data.ts, per deployment.
    id: "alchemix-listing",
    match: re(`/(ethereum|base)/alchemix`),
    routes: ([, chain]) => {
      const d = chain === "base" ? ALCHEMIX_BASE : ALCHEMIX_ETHEREUM;
      return listing(
        () => alchemixList.alchemixListDimensions(d.chainId),
        alchemixList.ALCHEMIX_LIST_DEFAULTS,
        (f, p) => fetchAlchemixPositions(alchemixList.alchemixFiltersToFetchParams(d, f, p)),
      )();
    },
  },
  {
    // lib/alchemix/transmuter-listing-page-data.ts
    id: "alchemix-transmuter-listing",
    match: re(`/(ethereum|base)/alchemix/transmuter`),
    routes: ([, chain]) => {
      const d = chain === "base" ? ALCHEMIX_BASE : ALCHEMIX_ETHEREUM;
      return listing(
        () => transmuterList.transmuterListDimensions(d.chainId),
        transmuterList.TRANSMUTER_LIST_DEFAULTS,
        (f, p) => fetchAlchemixTransmuterPositions(transmuterList.transmuterFiltersToFetchParams(d, f, p)),
      )();
    },
  },
  {
    // lib/alchemix/v2-listing-page-data.ts
    id: "alchemix-v2-listing",
    match: re(`/ethereum/alchemix/v2`),
    routes: () =>
      listing(
        () => v2List.v2ListDimensions(ALCHEMIX_ETHEREUM.chainId),
        v2List.V2_LIST_DEFAULTS,
        (f, p) => fetchAlchemixV2Positions(v2List.v2FiltersToFetchParams(ALCHEMIX_ETHEREUM, f, p)),
      )(),
  },
  {
    id: "aave-vault-positions",
    match: re(`/ethereum/aave/vaults/positions`),
    routes: listing(
      () => aaveVaultPositionList.vaultPositionListDimensions(),
      aaveVaultPositionList.VAULT_POSITION_LIST_DEFAULTS,
      (f, p) => fetchVaultPositions(aaveVaultPositionList.vaultPositionFiltersToFetchParams(f, p)),
    ),
  },
  {
    id: "morpho-base-vault-positions",
    match: re(`/base/morpho/vaults/positions`),
    routes: listing(
      () => baseVaultPositionList.baseVaultPositionListDimensions(),
      baseVaultPositionList.BASE_VAULT_POSITION_LIST_DEFAULTS,
      (f, p) => fetchVaultPositions(baseVaultPositionList.baseVaultPositionFiltersToFetchParams(f, p)),
    ),
  },
];

// ── System pages: the route that serves the page's own loader ─────────────

/** A vault directory page: its directory route and the census header. */
const vaultDirectory = (directory, chainId) => () =>
  captureUrls(() => [fetch(directory), fetchVaultPositions({ chainId, overlay: false, limit: 1 })]);

const SYSTEM = [
  // components/shared/aave-market-page.tsx, at each page's apiRoute.
  { id: "aave-v3-market", match: re(`/ethereum/aave-v3/market`), routes: () => ["/api/chain/aave-v3/market"] },
  { id: "aave-v3-base-market", match: re(`/base/aave-v3/market`), routes: () => ["/api/chain/aave-v3-base/market"] },
  {
    id: "aave-v3-arbitrum-markets",
    match: re(`/arbitrum/aave-v3/markets`),
    routes: () => ["/api/chain/aave-v3-arbitrum/market"],
  },
  { id: "spark-market", match: re(`/ethereum/spark/market`), routes: () => ["/api/chain/spark/market"] },
  { id: "seamless-market", match: re(`/base/seamless/market`), routes: () => ["/api/chain/seamless/market"] },
  // loadCompoundV3Markets / loadCompoundV2Markets, served by the markets routes.
  {
    id: "compound-v3-markets",
    match: re(`/ethereum/compound-v3/markets`),
    routes: () => ["/api/chain/compound/markets"],
  },
  {
    id: "compound-v3-base-market",
    match: re(`/base/compound-v3/market`),
    routes: () => ["/api/chain/compound-base/markets"],
  },
  {
    id: "compound-v3-arbitrum-markets",
    match: re(`/arbitrum/compound-v3/markets`),
    routes: () => ["/api/chain/compound-arbitrum/markets"],
  },
  {
    id: "compound-v2-markets",
    match: re(`/ethereum/compound-v2/markets`),
    routes: () => ["/api/chain/compound-v2/markets"],
  },
  // loadMoonwellMarkets, loadMorphoMarketsFromChain, loadDolomiteMarkets, ...
  { id: "moonwell-markets", match: re(`/ethereum/moonwell/markets`), routes: () => ["/api/chain/moonwell/markets"] },
  {
    id: "moonwell-base-markets",
    match: re(`/base/moonwell/markets`),
    routes: () => ["/api/chain/moonwell-base/markets"],
  },
  { id: "morpho-markets", match: re(`/ethereum/morpho/markets`), routes: () => ["/api/chain/morpho/markets"] },
  { id: "morpho-base-markets", match: re(`/base/morpho/markets`), routes: () => ["/api/chain/morpho-base/markets"] },
  {
    // components/protocol/morpho/morpho-arbitrum-markets-view.tsx
    id: "morpho-arbitrum-markets",
    match: re(`/arbitrum/morpho/markets`),
    routes: () => ["/api/chain/morpho-arbitrum/markets"],
  },
  { id: "dolomite-markets", match: re(`/ethereum/dolomite/markets`), routes: () => ["/api/chain/dolomite/markets"] },
  {
    id: "llamalend-markets",
    match: re(`/ethereum/llamalend/markets`),
    routes: () => ["/api/chain/llamalend/markets"],
  },
  { id: "fluid-vaults", match: re(`/ethereum/fluid/vaults`), routes: () => ["/api/chain/fluid/vaults"] },
  { id: "fx-pools", match: re(`/ethereum/fx/pools`), routes: () => ["/api/chain/fx/pools"] },
  { id: "maple-pools", match: re(`/ethereum/maple/pools`), routes: () => ["/api/chain/maple/pools"] },
  {
    // loadPolarisMarketsFromChain and loadPolarisBook.
    id: "polaris-markets",
    match: re(`/sepolia/polaris/markets`),
    routes: () => ["/api/chain/polaris/markets", "/api/polaris/markets"],
  },
  { id: "makerdao-system", match: re(`/ethereum/makerdao/system`), routes: () => ["/api/chain/makerdao/system"] },
  {
    id: "liquity-v1-system",
    match: re(`/ethereum/liquity-v1/system`),
    routes: () => ["/api/chain/liquity-v1/system"],
  },
  {
    // loadFrankencoinBook pages /api/frankencoin/positions oldest first; the
    // chain half (loadFrankencoinSystemFromChain) has no route.
    id: "frankencoin-system",
    note: "the book's first page; the chain read has no route",
    match: re(`/ethereum/frankencoin/system`),
    routes: () => captureUrls(() => [fetchFrankencoinPositions({ limit: 100, offset: 0, sortOrder: "asc" })]),
  },
  // loadLiquityForkBranchesFromChain, per family.
  {
    id: "liquity-v2-branches",
    match: re(`/ethereum/liquity-v2/branches`),
    routes: () => ["/api/chain/liquity-v2/branches"],
  },
  { id: "ebisu-branches", match: re(`/ethereum/ebisu/branches`), routes: () => ["/api/chain/ebisu/branches"] },
  {
    id: "asymmetry-branches",
    match: re(`/ethereum/asymmetry/branches`),
    routes: () => ["/api/chain/asymmetry/branches"],
  },
  {
    id: "basedollar-branches",
    match: re(`/base/basedollar/branches`),
    routes: () => ["/api/chain/basedollar/branches"],
  },
  { id: "aave-v4-hubs", match: re(`/ethereum/aave-v4/hubs`), routes: () => captureUrls(() => [fetchAaveV4Hubs()]) },
  { id: "aave-v4-base-hubs", match: re(`/base/aave-v4/hubs`), routes: () => [`${AAVE_V4_BASE_API_ROOT}/reserves`] },
  {
    // lib/pwn/loan-book.ts reads the whole book from /api/pwn/positions.
    id: "pwn-book",
    note: "the first page of the whole-book read",
    match: re(`/ethereum/pwn/book`),
    routes: () => captureUrls(() => [fetchAllPwnPositions({ sortOrder: "desc" })]),
  },
  {
    // lib/alchemix/lines-page-data.ts: each position type's coverage rows.
    id: "alchemix-lines",
    match: re(`/(ethereum|base)/alchemix/lines`),
    routes: ([, chain]) =>
      captureUrls(() => {
        const d = chain === "base" ? ALCHEMIX_BASE : ALCHEMIX_ETHEREUM;
        const v2Keys = v2LinesForChain(d.chainId).map((l) => l.key);
        return [
          fetchAlchemixPositions({ chainId: d.chainId, limit: 1 }),
          fetchAlchemixTransmuterPositions({ chainId: d.chainId, limit: 1 }),
          ...(v2Keys.length > 0 ? [fetchAlchemixV2Positions({ lines: v2Keys, limit: 1 })] : []),
        ];
      }),
  },
  {
    // /ethereum/aave redirects here; loadAaveEthereumVaultDirectory and the census.
    id: "aave-vaults",
    match: re(`/ethereum/aave(?:/vaults)?`),
    routes: vaultDirectory("/api/chain/aave-vaults/directory", MAINNET_CHAIN_ID),
  },
  {
    id: "morpho-base-vaults-directory",
    match: re(`/base/morpho/vaults`),
    routes: vaultDirectory("/api/chain/morpho-base/directory", BASE_CHAIN_ID),
  },
  {
    // /ethereum/yearn redirects here; loadYearnEthereumVaultDirectory.
    id: "yearn-vaults",
    match: re(`/ethereum/yearn(?:/vaults)?`),
    routes: () => ["/api/chain/yearn/directory"],
  },
  {
    // lib/vaults/index-read.ts: the three directories, the Maple pools and
    // the two censuses.
    id: "vault-index",
    match: re(`/vaults`),
    routes: () =>
      captureUrls(() => [
        fetch("/api/chain/morpho-base/directory"),
        fetch("/api/chain/aave-vaults/directory"),
        fetch("/api/chain/yearn/directory"),
        fetch("/api/chain/maple/pools"),
        fetchVaultPositions({ chainId: BASE_CHAIN_ID, overlay: false, limit: 1 }),
        fetchVaultPositions({ chainId: MAINNET_CHAIN_ID, overlay: false, limit: 1 }),
      ]),
  },
  {
    // app/(app)/wallet/[address]/page.tsx: readWallet, which the wallet route serves.
    id: "wallet",
    match: re(`/wallet/${ADDR}`),
    routes: ([, address]) => [`/api/chain/wallet/${lower(address)}`],
  },
];

// ── Pages the gate cannot read from the public hosts ───────────────────────

const SKIPS = [
  {
    id: "arbitrum-positions",
    match: re(`/arbitrum/(?:aave-v3|compound-v3|morpho)/positions`),
    skip: "the listing is read from rails-server with the bearer token in the server render; no public route serves it",
  },
  {
    id: "front-door",
    match: re(`/arbitrum/(?:aave-v3|compound-v3|morpho)`),
    skip: "the explorer's front door (ProtocolFrontDoor) reads no data route",
  },
  {
    id: "coverage",
    match: re(`/coverage/(?:ethereum|base|arbitrum|sepolia)`),
    skip: "static: the depth matrix in lib/shared/coverage.ts, no data route",
  },
  {
    id: "sky-savings-rates",
    match: re(`/ethereum/sky-savings/rates`),
    skip: "readSkyRates reads rails-server with the bearer token in the server render; no public route serves it",
  },
  {
    id: "yearn-vault",
    match: re(`/ethereum/yearn/vaults/${ADDR}(?:/${ADDR})?`),
    skip: "loaded from the server's own chain reads (lib/sources/chain/yearn-ethereum-vault*); no public route serves one vault or holder",
  },
];

export const ROUTES = [...SYSTEM, ...LISTINGS, ...POSITIONS];
export { SKIPS };
