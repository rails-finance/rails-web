/** Saved items (rails-ops TO-DO-ui-jobs 431, 521, 530): one list per browser
 *  holding three kinds, each entry carrying its `kind`: a wallet (keyed by its
 *  primary address), a position (keyed by its page path) and a listing view
 *  (keyed by its path and query). Every item shows everywhere, whatever
 *  explorer is in view. The list lives in this origin's localStorage under
 *  `rails-saved`; `exportBookmarks` / `importBookmarks` at the foot carry it
 *  off the origin and back, which is what makes it survivable across
 *  browsers, machines and a site-data clear.
 *
 *  One array holds all three kinds. A kind's order (ui-jobs 504) is the order
 *  of its entries in the array, so moving a position never moves a wallet.
 *
 *  Until 431 each explorer kept its own list under `<explorer>-sessions`. On
 *  the first read in a browser those lists are merged into the one list by
 *  primary address (`migrateScopedBookmarks`) and left where they are. Until
 *  521 the list was `rails-bookmarks`, wallets only, its rows carrying no
 *  kind. That key stays a wallet-only list in its old shape: the first read
 *  copies it into `rails-saved` (`seedSavedList`), every write mirrors the
 *  wallets back to it (`saveSessions`), and every read merges into
 *  `rails-saved` what a build from before 521, open in another tab, wrote
 *  there (`reconcileLegacyWallets`). That build reads and writes the wallets
 *  it knows and never sees the positions and views, so it cannot drop them.
 *
 *  `SessionProtocol` names an explorer for the props that still take one (the
 *  page's session, a listing's filter); it no longer scopes a bookmark. */

export type SessionProtocol =
  | "liquity-v2"
  | "aave-v4"
  // Aave V4 on Base (the Equities hub's Mag7 spoke), at `/base/aave-v4`: separate
  // contracts, the reason `aave-v3-base` is its own scope.
  | "aave-v4-base"
  | "aave-v3"
  | "aave-v3-base"
  // Aave V3 on Arbitrum, at `/arbitrum/aave-v3`: its own Pool, so its own scope.
  | "aave-v3-arbitrum"
  // Aave's vault layer — savings GHO, Umbrella stake tokens and static
  // aTokens. Its own roster subject at an UNSTAMPED door, `/ethereum/aave`,
  // because those contracts carry no version and a version in the URL of a
  // contract that has none is false (rails-ops decision 0028 point 5). The
  // pool explorers above are version-scoped and truthfully stamped.
  | "aave-vaults"
  // Alchemix V3's Ethereum lines (alUSD, alETH), at `/ethereum/alchemix`. The
  // position is an NFT inside a line, so a bookmark on this rail is a wallet's
  // standing across both lines rather than one id.
  | "alchemix"
  // Alchemix V3's Base line (alUSDb), at `/base/alchemix`. A separate scope
  // from the Ethereum one for the reason `aave-v3-base` is: separate contracts,
  // separate lines, and a position's identity is the (chain, line) pair — so a
  // token id on one chain says nothing about the same number on the other.
  | "alchemix-base"
  | "seamless"
  | "makerdao"
  | "maple"
  | "moonwell"
  | "moonwell-base"
  | "morpho"
  | "morpho-base"
  // Morpho Blue on Arbitrum, at `/arbitrum/morpho`: its own singleton and
  // markets, so its own scope.
  | "morpho-arbitrum"
  // Morpho Blue on Arc, at `/arc/morpho`: a position is a wallet's place in
  // one market, read from the chain when a page opens (ui-jobs 577).
  | "morpho-arc"
  | "spark"
  | "compound"
  | "compound-base"
  // Compound V3 on Arbitrum, at `/arbitrum/compound-v3`: its own four Comets,
  // so its own scope.
  | "compound-v3-arbitrum"
  // Compound V3 on Optimism, at `/optimism/compound-v3`: a position is a wallet's
  // account in one Comet, read from the chain when a page opens (ui-jobs 578).
  | "compound-v3-optimism"
  | "compound-v2"
  | "dolomite"
  | "pwn"
  | "liquity-v1"
  | "ebisu"
  | "asymmetry"
  | "basedollar"
  | "fx"
  | "fluid"
  | "frankencoin"
  | "llamalend"
  | "polaris"
  // Yearn V3, at `/ethereum/yearn`. The first subject here whose WHOLE PRODUCT
  // is vaults, so the explorer's roster is the vault directory and there is no
  // position listing beside it (rails-ops decision 0027 point 2). Yearn V2 is
  // an older registry and different vault code, and is not covered (call 4).
  | "yearn"
  // Sky Savings, at `/ethereum/sky-savings`: sUSDS holders, a position being a
  // holder address. A roster explorer outside the home headline (rails-ops
  // TO-DO-sky-savings-scoping §6.1, decision 0027 call 2).
  | "sky-savings"
  // CoW, at `/ethereum/cow`: a wallet's trades through CoW's
  // settlement, from victoria's Sieve (rails-ops decisions/0058 step 3).
  | "cow"
  // Pendle, at `/ethereum/pendle`: a wallet's PT, YT and LP per market, from
  // victoria's router capture and chain reads at a pinned block.
  | "pendle"
  // Uniswap V3 and V4, at `/ethereum/uniswap-v3` and `/ethereum/uniswap-v4`:
  // a position is an NFT id, read with its pool at two blocks (ui-jobs 556).
  | "uniswap-v3"
  | "uniswap-v4"
  // Aerodrome Slipstream on Base, at `/base/aerodrome`: a position is an NFT
  // id on one of three position managers, staked in its gauge or not (ui-jobs 566).
  | "aerodrome"
  // Uniswap V3 on Base and V3 and V4 on Arbitrum, and PancakeSwap V3 on Base
  // and Arbitrum, on Uniswap's pages with a chain (ui-jobs 568, 573, 575).
  | "uniswap-v3-base"
  | "uniswap-v3-arbitrum"
  | "uniswap-v4-arbitrum"
  | "pancakeswap-v3-base"
  | "pancakeswap-v3-arbitrum"
  // Lido on Ethereum, at `/ethereum/lido`: a wallet's stake is its stETH
  // shares and wstETH, with its withdrawal requests (ui-jobs 570).
  | "lido"
  // Fluid's vaults on Base, at `/base/fluid`: a position is a VaultFactory NFT,
  // read from the chain when a page opens (ui-jobs 574).
  | "fluid-base"
  // Aave V4 on Arc, at `/arc/aave-v4`: a position is a wallet's account on one
  // spoke, read from the chain when a page opens (ui-jobs 577).
  | "aave-v4-arc"
  // Aave V3 on Optimism, at `/optimism/aave-v3`: a position is a wallet's
  // account on the Pool, read from the chain when a page opens (ui-jobs 578).
  | "aave-v3-optimism"
  // Velodrome Slipstream on Optimism, at `/optimism/velodrome`: Aerodrome's
  // pages on Optimism's two position managers (ui-jobs 578).
  | "velodrome"
  // Euler V2 on Base and Arbitrum, at `/base/euler-v2` and `/arbitrum/euler-v2`:
  // a position is one account's holding in one vault, read at two blocks.
  | "euler-v2-base"
  | "euler-v2-arbitrum"
  // Balancer V3 on Ethereum, at `/ethereum/balancer-v3`: a pool share is the
  // wallet's balance of the pool's shares in the Vault (ui-jobs 569).
  | "balancer-v3"
  | "balancer-v3-arbitrum";

/** What a saved entry is: a wallet, a position page or a listing view. */
export type SavedKind = "wallet" | "position" | "view";

export interface WalletSession {
  /** Absent on a row written before 521; such a row reads as a wallet. */
  kind?: "wallet";
  key: string;
  addresses: string[];
  ensNames: Record<string, string | null>;
  /** When the wallet was last bookmarked or merged in. The display order was
   *  this, newest first, until the list took the reader's order (ui-jobs 504):
   *  it still orders a list being migrated and the rows an import adds. */
  lastVisited: number;
  /** When the wallet was first bookmarked, across every list it was merged
   *  from. Absent on a row written before 431: `lastVisited` stands for it. */
  bookmarkedAt?: number;
  /** The bookmark marker. Every row written carries `pinned: true`; the field
   *  survives to read legacy storage, which also held unpinned recents. */
  pinned?: boolean;
  preset?: boolean;
  /** User-provided display name, overrides ENS / short address. */
  customName?: string;
}

/** A saved position (530) or listing view (521): a page on this site by its
 *  path, with the name it was saved under. */
export interface SavedLink {
  kind: "position" | "view";
  /** The page's path, with the query for a view: what the row opens, and the
   *  entry's identity (one entry per kind and key). */
  key: string;
  /** The default name, made when the entry was saved. */
  name: string;
  customName?: string;
  /** The explorer and chain the page belongs to, when the page names them. */
  protocol?: { id: string; name: string };
  chain?: { id: string; name: string };
  /** A closed position's status tag at the last read of its card. */
  ended?: { word: string; tone: string };
  savedAt: number;
}

export type SavedEntry = WalletSession | SavedLink;

/** DOM event dispatched after any same-tab bookmarks mutation, so listeners
 *  can resync without polling. The native `storage` event only fires across
 *  tabs. */
export const SESSIONS_CHANGED_EVENT = "rails-sessions-changed";

/** Every saved item, all three kinds (ui-jobs 521, 530). */
const SAVED_KEY = "rails-saved";
/** The wallet-only list of every build before 521, kept in step with
 *  `SAVED_KEY`'s wallets in its old shape so those builds read them. */
const STORAGE_KEY = "rails-bookmarks";
/** Set once the per-explorer lists have been merged into `STORAGE_KEY`. */
const MIGRATED_KEY = "rails-bookmarks-migrated";
/** Set once `STORAGE_KEY`'s array order is the reader's order (ui-jobs 504).
 *  Before it the array was unordered and the list showed newest first, so
 *  the migration writes the rows in that order, which the reader then
 *  rearranges on /bookmarks. The array keeps its shape, so a build from
 *  before reads the same rows. */
const ORDERED_KEY = "rails-bookmarks-ordered";
/** The suffix every pre-431 explorer list's key ends in. */
const LEGACY_SUFFIX = "-sessions";

/** A wallet row, by the fields every build agrees on. Extra fields pass:
 *  this is a shape check, not a schema. */
function isSessionRow(v: unknown): v is WalletSession {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (r.kind === undefined || r.kind === "wallet") &&
    typeof r.key === "string" &&
    Array.isArray(r.addresses) &&
    r.addresses.every((a) => typeof a === "string") &&
    r.addresses.length > 0
  );
}

/** A saved position or view row. */
function isLinkRow(v: unknown): v is SavedLink {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (r.kind === "position" || r.kind === "view") &&
    typeof r.key === "string" &&
    r.key.startsWith("/") &&
    typeof r.name === "string"
  );
}

const isWallet = (row: SavedEntry): row is WalletSession => row.kind === undefined || row.kind === "wallet";
const kindOf = (row: SavedEntry): SavedKind => (isWallet(row) ? "wallet" : row.kind);
const primaryOf = (row: WalletSession): string | undefined => row.addresses[0]?.toLowerCase();
const firstSeen = (row: WalletSession): number => row.bookmarkedAt ?? row.lastVisited ?? 0;
/** An entry's identity within its kind: a wallet's primary address, a link's path. */
const idOf = (row: SavedEntry): string => (isWallet(row) ? (primaryOf(row) ?? "") : row.key);
const idFor = (kind: SavedKind, id: string): string => (kind === "wallet" ? id.toLowerCase() : id);

/** Merge rows into a list, one per primary address, newest first. The later
 *  row wins field by field, while a custom name is kept from either, the ENS
 *  names are combined, the first bookmark time is the earliest and
 *  `lastVisited` the latest. Extra fields ride along in the spread. */
function mergeRows(existing: WalletSession[], incoming: WalletSession[]): { rows: WalletSession[]; added: number } {
  const byAddress = new Map<string, WalletSession>();
  for (const row of existing) {
    const addr = primaryOf(row);
    if (addr) byAddress.set(addr, row);
  }
  let added = 0;
  for (const row of incoming) {
    const addr = primaryOf(row);
    if (!addr) continue;
    const prev = byAddress.get(addr);
    if (!prev) added += 1;
    const customName = row.customName || prev?.customName;
    byAddress.set(addr, {
      ...prev,
      ...row,
      kind: "wallet",
      key: addr,
      ensNames: { ...prev?.ensNames, ...row.ensNames },
      ...(customName ? { customName } : {}),
      bookmarkedAt: Math.min(prev ? firstSeen(prev) : Infinity, firstSeen(row)),
      lastVisited: Math.max(prev?.lastVisited ?? 0, row.lastVisited ?? 0),
      pinned: true,
    });
  }
  return { rows: [...byAddress.values()].sort((a, b) => b.lastVisited - a.lastVisited), added };
}

function readJson(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    const held: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(held) ? held : [];
  } catch {
    return [];
  }
}

/** The wallet rows under `key` (a pre-431 explorer list holds nothing else). */
function readRows(key: string): WalletSession[] {
  return readJson(key).filter(isSessionRow);
}

/** Every entry under `key`, wallets and links, in the stored order. */
function readAll(key: string = SAVED_KEY): SavedEntry[] {
  return readJson(key).filter((r): r is SavedEntry => isSessionRow(r) || isLinkRow(r));
}

/** Merge every pre-431 explorer list into the one list, once per browser. The
 *  old keys stay as they were. */
function migrateScopedBookmarks(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    const legacy: WalletSession[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.endsWith(LEGACY_SUFFIX)) legacy.push(...readRows(key).filter((r) => r.pinned));
    }
    if (legacy.length > 0) {
      const { rows } = mergeRows(readRows(STORAGE_KEY), legacy);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.map(legacyShape)));
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /* storage blocked: nothing to merge */
  }
}

const newestFirst = (a: WalletSession, b: WalletSession) => (b.lastVisited ?? 0) - (a.lastVisited ?? 0);

/** Write the list in its shown order once per browser (ORDERED_KEY). */
function migrateToReaderOrder(): void {
  try {
    if (localStorage.getItem(ORDERED_KEY)) return;
    const rows = readRows(STORAGE_KEY);
    if (rows.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify([...rows].sort(newestFirst)));
    localStorage.setItem(ORDERED_KEY, "1");
  } catch {
    /* storage blocked: nothing to order */
  }
}

/** A wallet row as builds before 521 wrote it: no kind. */
function legacyShape(row: WalletSession): WalletSession {
  const { kind: _kind, ...rest } = row;
  void _kind;
  return rest;
}

/** One wallet merged with what another list holds for it, by `mergeRows`'
 *  rules. */
function mergeWallet(prev: WalletSession, row: WalletSession): WalletSession {
  return mergeRows([prev], [row]).rows[0];
}

/** Start `SAVED_KEY` from the wallet-only list, once per browser: the wallets
 *  take `kind: "wallet"` and keep their order and every other field. Runs
 *  while `SAVED_KEY` is absent, so a second run finds it and writes nothing. */
function seedSavedList(): void {
  try {
    if (localStorage.getItem(SAVED_KEY) !== null) return;
    const rows = readAll(STORAGE_KEY).map((r) => (isWallet(r) ? { ...r, kind: "wallet" as const } : r));
    localStorage.setItem(SAVED_KEY, JSON.stringify(rows));
  } catch {
    /* storage blocked: nothing to copy */
  }
}

/** Merge into `SAVED_KEY` the wallets a build from before 521 wrote to
 *  `STORAGE_KEY` since the last mirror: a wallet it added goes first among
 *  the wallets, a name or ENS name it gave is kept (`mergeRows`). A wallet it
 *  removed stays saved here. Writes only on a change, so a second run with
 *  nothing new writes nothing. */
function reconcileLegacyWallets(): void {
  try {
    const legacy = readRows(STORAGE_KEY).filter((r) => r.pinned !== false);
    if (legacy.length === 0) return;
    const all = readAll();
    let changed = false;
    const added: WalletSession[] = [];
    for (const row of legacy) {
      const addr = primaryOf(row);
      const at = all.findIndex((r) => isWallet(r) && primaryOf(r) === addr);
      if (at < 0) {
        added.push(mergeRows([], [row]).rows[0]);
        changed = true;
        continue;
      }
      const merged = mergeWallet(all[at] as WalletSession, row);
      if (JSON.stringify(merged) !== JSON.stringify(all[at])) {
        all[at] = merged;
        changed = true;
      }
    }
    if (!changed) return;
    const first = all.findIndex(isWallet);
    all.splice(first < 0 ? 0 : first, 0, ...added);
    localStorage.setItem(SAVED_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: nothing to merge */
  }
}

function loadSessions(): SavedEntry[] {
  if (typeof window === "undefined") return [];
  migrateScopedBookmarks();
  migrateToReaderOrder();
  seedSavedList();
  reconcileLegacyWallets();
  return readAll();
}

/** Write the list, and its wallets in the old shape to `STORAGE_KEY` (removed
 *  when there are none, as builds before 521 did). Throws when storage
 *  refuses. */
function writeAll(sessions: SavedEntry[]): void {
  localStorage.setItem(SAVED_KEY, JSON.stringify(sessions));
  const wallets = sessions.filter(isWallet).map(legacyShape);
  if (wallets.length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

function saveSessions(sessions: SavedEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    writeAll(sessions);
    // Defer dispatch to a microtask so callers that run from inside a React
    // render phase (a setState updater) do not set subscribers' state
    // synchronously. localStorage is still written immediately.
    queueMicrotask(() => window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT)));
  } catch {
    /* ignore */
  }
}

/** The bookmarked wallets, in the reader's order: a new bookmark goes first,
 *  and /bookmarks moves them (`moveSaved`). */
export function loadBookmarks(): WalletSession[] {
  return loadSessions()
    .filter(isWallet)
    .filter((s) => s.pinned);
}

/** The saved positions or views, in the reader's order. */
export function loadSavedLinks(kind: "position" | "view"): SavedLink[] {
  return loadSessions().filter((r): r is SavedLink => r.kind === kind);
}

/** Move an entry to `to` (an index into its kind's list, clamped). The other
 *  kinds keep their places in the array. */
export function moveSaved(kind: SavedKind, id: string, to: number): void {
  const want = idFor(kind, id);
  const all = loadSessions();
  const slots = all.flatMap((r, i) => (kindOf(r) === kind ? [i] : []));
  const rows = slots.map((i) => all[i]);
  const from = rows.findIndex((r) => idOf(r) === want);
  if (from < 0) return;
  const target = Math.max(0, Math.min(rows.length - 1, to));
  if (target === from) return;
  const [row] = rows.splice(from, 1);
  rows.splice(target, 0, row);
  slots.forEach((slot, i) => {
    all[slot] = rows[i];
  });
  saveSessions(all);
}

/** Rename an entry of any kind; an empty name goes back to the default. */
export function renameSaved(kind: SavedKind, id: string, customName: string): void {
  const want = idFor(kind, id);
  const sessions = loadSessions();
  const target = sessions.find((s) => kindOf(s) === kind && idOf(s) === want);
  if (!target) return;
  const trimmed = customName.trim();
  if (trimmed) target.customName = trimmed;
  else delete target.customName;
  saveSessions(sessions);
}

/** Rename a wallet by its row key (its primary address). */
export function renameSession(key: string, customName: string): void {
  renameSaved("wallet", key, customName);
}

/** Remove an entry of any kind. */
export function removeSaved(kind: SavedKind, id: string): void {
  const want = idFor(kind, id);
  saveSessions(loadSessions().filter((s) => !(kindOf(s) === kind && idOf(s) === want)));
}

/** True when `address` is bookmarked, matched case-insensitively against each
 *  row's primary address. */
export function isBookmarked(address: string): boolean {
  const addr = address.toLowerCase();
  return loadSessions().some((s) => isWallet(s) && s.pinned && primaryOf(s) === addr);
}

/** Toggle a wallet's bookmark from anywhere (a card's toggle, the wallet
 *  menu). Returns the resulting state. */
export function toggleBookmark(address: string, ensName: string | null): boolean {
  const addr = address.toLowerCase();
  const sessions = loadSessions();
  const existing = sessions.find((s): s is WalletSession => isWallet(s) && primaryOf(s) === addr);
  let nowBookmarked: boolean;
  if (existing) {
    nowBookmarked = !existing.pinned;
    existing.pinned = nowBookmarked;
    if (ensName && !existing.ensNames[existing.addresses[0]]) {
      existing.ensNames = { ...existing.ensNames, [existing.addresses[0]]: ensName };
    }
  } else {
    nowBookmarked = true;
    const now = Date.now();
    sessions.unshift({
      kind: "wallet",
      key: addr,
      addresses: [addr],
      ensNames: { [addr]: ensName },
      lastVisited: now,
      bookmarkedAt: now,
      pinned: true,
    });
  }
  saveSessions(sessions.filter((s) => !isWallet(s) || s.pinned));
  return nowBookmarked;
}

/** Remove a wallet from the bookmarks. */
export function removeBookmark(address: string): void {
  removeSaved("wallet", address);
}

/** The saved entry for a page, or null. */
export function findSavedLink(kind: "position" | "view", key: string): SavedLink | null {
  return loadSessions().find((r): r is SavedLink => r.kind === kind && r.key === key) ?? null;
}

/** Save a position or view, or remove it when it is saved. A new entry goes
 *  first in its kind. Returns the resulting state. */
export function toggleSavedLink(entry: Omit<SavedLink, "savedAt">): boolean {
  const sessions = loadSessions();
  if (sessions.some((r) => r.kind === entry.kind && r.key === entry.key)) {
    removeSaved(entry.kind, entry.key);
    return false;
  }
  const first = sessions.findIndex((r) => r.kind === entry.kind);
  sessions.splice(first < 0 ? sessions.length : first, 0, { ...entry, savedAt: Date.now() });
  saveSessions(sessions);
  return true;
}

/** Refresh a saved position's closed tag from its card; writes only on a
 *  change. */
export function updateSavedEnded(key: string, ended: SavedLink["ended"]): void {
  const sessions = loadSessions();
  const row = sessions.find((r): r is SavedLink => r.kind === "position" && r.key === key);
  if (!row || row.ended?.word === ended?.word) return;
  if (ended) row.ended = ended;
  else delete row.ended;
  saveSessions(sessions);
}

// ── Backup: export and import ───────────────────────────────────────────────
//
// localStorage is per-origin and per-browser: clearing site data drops every
// bookmark with no warning, and nothing carries them to a second machine.
// These two functions are the way out and back in. A field on a row that the
// reading build has no name for travels through untouched, so a row
// round-tripped by an older build keeps it.

/** 3 since 521: `bookmarks` holds every kind, each row carrying its kind.
 *  Version 2 files carried wallets only, version 1 files an object of
 *  per-explorer lists, and import still reads both. A build that reads
 *  version 2 takes the wallets from a version 3 file and skips the rest. */
export const BOOKMARKS_BACKUP_VERSION = 3;

export interface BookmarksBackup {
  version: number;
  /** ISO-8601, so the stamp reads the same in every runtime locale. */
  exportedAt: string;
  bookmarks: SavedEntry[];
  /** Saved Focus views (lib/shared/focus-views.ts), since ui-jobs 557. An
   *  optional field: a build without it reads the rest and skips this. */
  focusViews?: unknown[];
}

export interface BookmarksImportResult {
  /** Entries the file carried. */
  read: number;
  /** Entries added that this origin did not already hold. */
  added: number;
}

export function exportBookmarks(): BookmarksBackup {
  return {
    version: BOOKMARKS_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    bookmarks: loadSessions().filter((s) => !isWallet(s) || s.pinned),
  };
}

/** `rails-bookmarks-2026-09-20.json` — ISO date, locale-independent. */
export function bookmarksBackupFilename(at: Date = new Date()): string {
  return `rails-bookmarks-${at.toISOString().slice(0, 10)}.json`;
}

/** Read a backup into the list, merging: an import adds to what is here.
 *  Takes a version 3 or 2 file (one list) or a version 1 file (per-explorer
 *  lists, merged by address). Throws with a message fit to show the reader
 *  when the file is not one of ours. */
export function importBookmarks(source: string): BookmarksImportResult {
  if (typeof window === "undefined") throw new Error("Saved items can only be imported in a browser.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("That file isn't JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("That file isn't a Rails saved items backup.");
  const backup = parsed as { version?: unknown; bookmarks?: unknown };
  if (typeof backup.version !== "number" || backup.version < 1) {
    throw new Error("That file isn't a Rails saved items backup: it carries no version.");
  }
  const lists: unknown[] = Array.isArray(backup.bookmarks)
    ? [backup.bookmarks]
    : typeof backup.bookmarks === "object" && backup.bookmarks !== null
      ? Object.values(backup.bookmarks)
      : [];
  const rowsIn = lists.flatMap((rows) => (Array.isArray(rows) ? rows : []));
  const wallets = rowsIn.filter(isSessionRow);
  const links = rowsIn.filter(isLinkRow);
  const hasViews = Array.isArray((parsed as { focusViews?: unknown }).focusViews);
  if (wallets.length + links.length === 0 && !hasViews) throw new Error("That backup carries nothing saved.");

  const held = loadSessions();
  const heldWallets = held.filter(isWallet);
  const { rows: merged, added: walletsAdded } = mergeRows(heldWallets, wallets);
  // The rows held keep the reader's order; the rows the file adds go first in
  // their kind, newest first for wallets and in the file's order for links.
  const heldAt = new Map(heldWallets.map((r, i) => [primaryOf(r), i]));
  const mergedBy = new Map(merged.map((r) => [primaryOf(r), r]));
  const newWallets = merged.filter((r) => !heldAt.has(primaryOf(r))).sort(newestFirst);

  const linkId = (r: SavedLink) => `${r.kind} ${r.key}`;
  const heldLinks = new Map(held.filter((r): r is SavedLink => !isWallet(r)).map((r) => [linkId(r), r]));
  const newLinks = new Map<string, SavedLink>();
  for (const r of links) {
    const prev = heldLinks.get(linkId(r));
    if (prev) {
      // The file's name fills a name the reader has not given here.
      if (!prev.customName && r.customName) prev.customName = r.customName;
    } else if (!newLinks.has(linkId(r))) {
      newLinks.set(linkId(r), { ...r, savedAt: typeof r.savedAt === "number" ? r.savedAt : Date.now() });
    }
  }

  const fresh = { wallet: newWallets as SavedEntry[], position: [] as SavedEntry[], view: [] as SavedEntry[] };
  for (const r of newLinks.values()) fresh[r.kind].push(r);
  const rows: SavedEntry[] = [];
  const placed = new Set<SavedKind>();
  for (const r of held) {
    const kind = kindOf(r);
    if (!placed.has(kind)) {
      rows.push(...fresh[kind]);
      placed.add(kind);
    }
    rows.push(isWallet(r) ? (mergedBy.get(primaryOf(r)) ?? r) : r);
  }
  for (const kind of ["wallet", "position", "view"] as const) if (!placed.has(kind)) rows.push(...fresh[kind]);

  const read = new Set(wallets.map(primaryOf)).size + new Set(links.map(linkId)).size;
  try {
    writeAll(rows);
  } catch {
    throw new Error("This browser wouldn't let the items be saved. Check that site data is allowed.");
  }
  queueMicrotask(() => window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT)));
  return { read, added: walletsAdded + newLinks.size };
}
