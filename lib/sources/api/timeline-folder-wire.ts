// SERVER-ONLY — the grouped timeline as rails-server states it, and the one
// translation between its vocabulary and the page's.
// ----------------------------------------------------------------------------
// The twin of `lib/shared/timeline-opening-balance-wire.ts`, for the other half
// of the same partition. rails-server keys a folder's legs in the INDEX's own
// vocabulary — the raw verb, the raw lowercase token address, base-unit integer
// amounts — and resolves nothing, because it has no resolver and growing one
// would put a second source of truth behind figures the rows already resolve
// through the transforms. So each `/timeline` proxy route does the resolution
// with the SAME resolver it puts its rows through, and this module holds the
// part that is identical everywhere.
//
// AMOUNTS ARE NEVER SCALED HERE. The symbol and the decimals are attached; the
// page scales once, from base units, exactly as it does for the opening
// balance. Summing base units and scaling once is strictly more precise than
// scaling each addend and adding the results.
//
// The upstream field is `id`; the page's is `responseId`. The rename is the
// point — see `lib/shared/timeline-folder.ts`'s header on why a folder id is
// response-scoped and must never be persisted or shared.

import type {
  FolderResponseId,
  ServedFolder,
  ServedFolderCell,
  ServedFolderCount,
  ServedFolderLeg,
  ServedFolderOutlier,
  FolderAssetKeyKind,
} from "@/lib/shared/timeline-folder";
import type { OpeningBucket, OpeningFlowBucket } from "@/lib/shared/timeline-opening-balance";

/** One leg exactly as rails-server sends it — no symbol, no decimals. */
export interface UpstreamFolderLeg {
  verb: string;
  asset: string;
  assetKeyKind: FolderAssetKeyKind;
  amount: string;
  count: number;
  provWhat: string;
}

/** One flow bucket exactly as rails-server sends it — the summary's own
 *  `TimelineSummaryFlowBucket`, keyed in the index's vocabulary, amounts in
 *  base units. The twin of `UpstreamOpeningBalance["flows"]`, and resolved
 *  through the same rules (`lib/shared/timeline-opening-balance-wire.ts`). */
export interface UpstreamFolderFlowBucket {
  key: string;
  keyKind: FolderAssetKeyKind;
  decimals: number | null;
  epoch: number | null;
  legs: Record<string, string>;
}

/** One folder exactly as rails-server sends it. `id` is response-scoped. */
export interface UpstreamFolder {
  id: string;
  kind: string;
  count: number;
  txCount: number;
  ordinalFirst: number;
  ordinalLast: number;
  firstAt: number;
  lastAt: number;
  firstBlock: number;
  lastBlock: number;
  legs: UpstreamFolderLeg[];
  counts: ServedFolderCount[];
  other: number;
  stateBefore: Record<string, string> | null;
  stateAfter: Record<string, string> | null;
  outlier: ServedFolderOutlier | null;
  /** The three reductions a served folder stands for — see `ServedFolder`. */
  flows: UpstreamFolderFlowBucket[] | null;
  actors: { external: number; actors: { address: string; count: number }[] } | null;
  byDay: OpeningBucket[];
  /** The members' cross-tab, keyed by the index's lowercase token addresses.
   *  Absent from a server older than the cells, NULL where the family serves
   *  none — both read as "count from the members". */
  cells?: UpstreamFolderCell[] | null;
}

/** One cell exactly as rails-server sends it — assets as token addresses, and
 *  no counterparties: the index arms (Aave V3, SparkLend) have no counterparty
 *  axis on the page (`getEventCounterpartyKeys` answers [] for them). */
export interface UpstreamFolderCell {
  kind: string;
  day: string;
  assets: string[];
  count: number;
}

/** One row of `/timeline?group=1`: a raw MV row, or a folder. */
export type UpstreamGroupedRow<R> = { kind: "event"; event: R } | { kind: "folder"; folder: UpstreamFolder };

/** The grouped response's envelope, as rails-server writes it. */
export interface UpstreamGroupedTimeline<R> {
  wallet: string;
  rows: UpstreamGroupedRow<R>[];
  grouped: true;
  totalEvents: number;
  truncated: boolean;
  cutoffBlock: number | null;
  eventsServed: number;
  boundBy: "rows" | "scan" | null;
}

/** What `/timeline/folder` answers with: the folder's own header and its
 *  members in the family's own row shape, so the proxy reuses the transformer
 *  its `/timeline` twin already uses and no second mapping exists. */
export interface UpstreamFolderMembers<R> {
  wallet: string;
  folder: UpstreamFolder;
  rows: R[];
}

/** Every token address the folders in a grouped answer denominate something in
 *  — a HEADER leg or a FLOW bucket, which are different reductions over the
 *  same members and can name different assets (a liquidation's seized
 *  collateral is a header leg and a flow leg; an aToken transfer is a header
 *  leg and no flow at all). Handed to the family's own ERC20 resolver alongside
 *  the row addresses, in one batch, so a folder header, the tower beneath it
 *  and the rows below can never disagree about what a symbol is. Keys of any
 *  other kind are already in the page's vocabulary and are not resolved. */
export function folderLegAddresses<R>(rows: UpstreamGroupedRow<R>[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "folder") continue;
    for (const leg of row.folder.legs) {
      if (leg.assetKeyKind === "tokenAddress" && leg.asset) out.add(leg.asset.toLowerCase());
    }
    for (const bucket of row.folder.flows ?? []) {
      if (bucket.keyKind === "tokenAddress" && bucket.key) out.add(bucket.key.toLowerCase());
    }
    for (const cell of row.folder.cells ?? []) {
      for (const asset of cell.assets) out.add(asset.toLowerCase());
    }
  }
  return [...out];
}

/** Resolve one denomination. Returning `undefined` for either half leaves it
 *  null on the wire, and the page then draws no pair at all rather than an
 *  unscaled number — an omission, never a zero. */
export interface FolderAssetResolver {
  symbol: (key: string) => string | undefined;
  decimals: (key: string) => number | undefined;
}

function resolveLeg(leg: UpstreamFolderLeg, resolve: FolderAssetResolver): ServedFolderLeg {
  const isAddress = leg.assetKeyKind === "tokenAddress";
  const key = isAddress ? leg.asset.toLowerCase() : leg.asset;
  return {
    verb: leg.verb,
    asset: key,
    assetKeyKind: leg.assetKeyKind,
    amount: leg.amount,
    count: leg.count,
    provWhat: leg.provWhat,
    // A key that is not a token address IS the page's own vocabulary already
    // (a market key, a pool key, one leg of a fixed pair), exactly as the
    // opening balance's `keyKind` handling has it next door.
    symbol: isAddress ? (resolve.symbol(key) ?? null) : key,
    decimals: resolve.decimals(key) ?? null,
  };
}

/**
 * Rename a folder's FLOW buckets into the page's vocabulary — the same
 * translation `resolveOpeningAssetKeys` does on the other side of the cut, and
 * deliberately the same rules, because the tower merges the two lists key for
 * key:
 *
 *  • a `tokenAddress` key becomes its display symbol and keeps the raw address
 *    as `sourceKey`, since a symbol does not price and the tower looks USD up
 *    by address;
 *  • a key of any other kind IS the page's vocabulary already and is kept;
 *  • two buckets that resolve to the SAME symbol are added, in base units,
 *    because two addresses can share a display symbol and the page's own axis
 *    has always merged them;
 *  • an unresolved key is kept VERBATIM rather than dropped or replaced by a
 *    placeholder — the amount it carries is a true fact about the position, and
 *    one shared placeholder would merge two different assets into one bucket.
 */
function resolveFlows(buckets: UpstreamFolderFlowBucket[], resolve: FolderAssetResolver): OpeningFlowBucket[] {
  const merged = new Map<string, OpeningFlowBucket>();
  for (const bucket of buckets) {
    const isAddress = bucket.keyKind === "tokenAddress";
    const raw = isAddress ? bucket.key.toLowerCase() : bucket.key;
    const key = isAddress ? (resolve.symbol(raw) ?? raw) : raw;
    const id = `${key} ${bucket.epoch ?? ""}`;
    const cur = merged.get(id);
    if (!cur) {
      merged.set(id, {
        key,
        ...(isAddress ? { sourceKey: raw } : {}),
        decimals: bucket.decimals ?? resolve.decimals(raw) ?? null,
        epoch: bucket.epoch,
        legs: { ...bucket.legs },
      });
      continue;
    }
    for (const [leg, amount] of Object.entries(bucket.legs)) {
      cur.legs[leg] = (BigInt(cur.legs[leg] ?? "0") + BigInt(amount)).toString();
    }
  }
  return [...merged.values()];
}

/**
 * Rename a folder's cells into the page's vocabulary: each token address to the
 * symbol its members' cards carry, deduplicated as `getEventAssetKeys` does
 * (two addresses sharing a symbol are one key), and cells that land on the
 * same key added. An address the resolver cannot name gives up the WHOLE
 * cross-tab: the member's own card would carry a fallback this module cannot
 * know, so the page counts that folder from its members instead. */
function resolveCells(cells: UpstreamFolderCell[], resolve: FolderAssetResolver): ServedFolderCell[] | null {
  const merged = new Map<string, ServedFolderCell>();
  for (const cell of cells) {
    const assets: string[] = [];
    for (const address of cell.assets) {
      const symbol = resolve.symbol(address.toLowerCase());
      if (!symbol) return null;
      if (!assets.includes(symbol)) assets.push(symbol);
    }
    assets.sort();
    const id = `${cell.kind} ${cell.day} ${assets.join(",")}`;
    const cur = merged.get(id);
    if (cur) cur.count += cell.count;
    else merged.set(id, { kind: cell.kind, day: cell.day, assets, counterparties: [], count: cell.count });
  }
  return [...merged.values()];
}

/** Rename a folder into the page's vocabulary: `id` → the branded
 *  `responseId`, each leg's and each flow bucket's asset resolved to a symbol
 *  and its decimals attached. Every count, ordinal, block, day bucket and
 *  base-unit amount is passed through exactly as it arrived. */
export function toServedFolder(folder: UpstreamFolder, resolve: FolderAssetResolver): ServedFolder {
  return {
    responseId: folder.id as FolderResponseId,
    kind: folder.kind,
    count: folder.count,
    txCount: folder.txCount,
    ordinalFirst: folder.ordinalFirst,
    ordinalLast: folder.ordinalLast,
    firstAt: folder.firstAt,
    lastAt: folder.lastAt,
    firstBlock: folder.firstBlock,
    lastBlock: folder.lastBlock,
    legs: folder.legs.map((leg) => resolveLeg(leg, resolve)),
    counts: folder.counts,
    other: folder.other,
    stateBefore: folder.stateBefore,
    stateAfter: folder.stateAfter,
    outlier: folder.outlier,
    // NULL stays NULL: the family declares no flow reduction at all, which is a
    // different claim from an empty one (the members contributed nothing).
    flows: folder.flows ? resolveFlows(folder.flows, resolve) : null,
    actors: folder.actors,
    byDay: folder.byDay,
    cells: folder.cells ? resolveCells(folder.cells, resolve) : null,
  };
}
