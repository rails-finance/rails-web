/** Bookmarked wallets (rails-ops TO-DO-ui-jobs 431): one list per browser,
 *  keyed by the wallet's primary address, so one bookmark covers every
 *  explorer. It lives in this origin's localStorage under `rails-bookmarks`;
 *  `exportBookmarks` / `importBookmarks` at the foot carry it off the origin
 *  and back, which is what makes bookmarks survivable across browsers,
 *  machines and a site-data clear.
 *
 *  Until 431 each explorer kept its own list under `<explorer>-sessions`. On
 *  the first read in a browser those lists are merged into the one list by
 *  primary address (`migrateScopedBookmarks`) and left where they are.
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
  | "spark"
  | "compound"
  | "compound-base"
  // Compound V3 on Arbitrum, at `/arbitrum/compound-v3`: its own four Comets,
  // so its own scope.
  | "compound-v3-arbitrum"
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
  | "sky-savings";

export interface WalletSession {
  key: string;
  addresses: string[];
  ensNames: Record<string, string | null>;
  /** When the wallet was last bookmarked or merged in; drives the display
   *  order, newest first. */
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

/** DOM event dispatched after any same-tab bookmarks mutation, so listeners
 *  can resync without polling. The native `storage` event only fires across
 *  tabs. */
export const SESSIONS_CHANGED_EVENT = "rails-sessions-changed";

const STORAGE_KEY = "rails-bookmarks";
/** Set once the per-explorer lists have been merged into `STORAGE_KEY`. */
const MIGRATED_KEY = "rails-bookmarks-migrated";
/** The suffix every pre-431 explorer list's key ends in. */
const LEGACY_SUFFIX = "-sessions";

/** A bookmark row, by the fields every build agrees on. Extra fields pass:
 *  this is a shape check, not a schema. */
function isSessionRow(v: unknown): v is WalletSession {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.key === "string" &&
    Array.isArray(r.addresses) &&
    r.addresses.every((a) => typeof a === "string") &&
    r.addresses.length > 0
  );
}

const primaryOf = (row: WalletSession): string | undefined => row.addresses[0]?.toLowerCase();
const firstSeen = (row: WalletSession): number => row.bookmarkedAt ?? row.lastVisited ?? 0;

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

function readRows(key: string): WalletSession[] {
  try {
    const raw = localStorage.getItem(key);
    const held: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(held) ? held.filter(isSessionRow) : [];
  } catch {
    return [];
  }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /* storage blocked: nothing to merge */
  }
}

function loadSessions(): WalletSession[] {
  if (typeof window === "undefined") return [];
  migrateScopedBookmarks();
  return readRows(STORAGE_KEY);
}

function saveSessions(sessions: WalletSession[]): void {
  if (typeof window === "undefined") return;
  try {
    if (sessions.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    // Defer dispatch to a microtask so callers that run from inside a React
    // render phase (a setState updater) do not set subscribers' state
    // synchronously. localStorage is still written immediately.
    queueMicrotask(() => window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT)));
  } catch {
    /* ignore */
  }
}

/** The bookmarked wallets, most-recently-bookmarked first. */
export function loadBookmarks(): WalletSession[] {
  return loadSessions()
    .filter((s) => s.pinned)
    .sort((a, b) => b.lastVisited - a.lastVisited);
}

export function renameSession(key: string, customName: string): void {
  const sessions = loadSessions();
  const target = sessions.find((s) => s.key === key);
  if (!target) return;
  const trimmed = customName.trim();
  if (trimmed) target.customName = trimmed;
  else delete target.customName;
  saveSessions(sessions);
}

/** True when `address` is bookmarked, matched case-insensitively against each
 *  row's primary address. */
export function isBookmarked(address: string): boolean {
  const addr = address.toLowerCase();
  return loadSessions().some((s) => s.pinned && primaryOf(s) === addr);
}

/** Toggle a wallet's bookmark from anywhere (a card's toggle, the wallet
 *  menu). Returns the resulting state. */
export function toggleBookmark(address: string, ensName: string | null): boolean {
  const addr = address.toLowerCase();
  const sessions = loadSessions();
  const existing = sessions.find((s) => primaryOf(s) === addr);
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
      key: addr,
      addresses: [addr],
      ensNames: { [addr]: ensName },
      lastVisited: now,
      bookmarkedAt: now,
      pinned: true,
    });
  }
  saveSessions(sessions.filter((s) => s.pinned));
  return nowBookmarked;
}

/** Remove a wallet from the bookmarks (the panel's trash action). */
export function removeBookmark(address: string): void {
  const addr = address.toLowerCase();
  saveSessions(loadSessions().filter((s) => s.pinned && primaryOf(s) !== addr));
}

// ── Backup: export and import ───────────────────────────────────────────────
//
// localStorage is per-origin and per-browser: clearing site data drops every
// bookmark with no warning, and nothing carries them to a second machine.
// These two functions are the way out and back in. A field on a row that the
// reading build has no name for travels through untouched, so a row
// round-tripped by an older build keeps it.

/** 2 since 431: `bookmarks` is the one list. Version 1 files carried an
 *  object of per-explorer lists, and import still reads them. */
export const BOOKMARKS_BACKUP_VERSION = 2;

export interface BookmarksBackup {
  version: number;
  /** ISO-8601, so the stamp reads the same in every runtime locale. */
  exportedAt: string;
  bookmarks: WalletSession[];
}

export interface BookmarksImportResult {
  /** Wallets the file carried. */
  read: number;
  /** Wallets added that this origin did not already hold. */
  added: number;
}

export function exportBookmarks(): BookmarksBackup {
  return { version: BOOKMARKS_BACKUP_VERSION, exportedAt: new Date().toISOString(), bookmarks: loadBookmarks() };
}

/** `rails-bookmarks-2026-09-20.json` — ISO date, locale-independent. */
export function bookmarksBackupFilename(at: Date = new Date()): string {
  return `rails-bookmarks-${at.toISOString().slice(0, 10)}.json`;
}

/** Read a backup into the list, merging: an import adds to what is here.
 *  Takes a version 2 file (one list) or a version 1 file (per-explorer
 *  lists, merged by address). Throws with a message fit to show the reader
 *  when the file is not one of ours. */
export function importBookmarks(source: string): BookmarksImportResult {
  if (typeof window === "undefined") throw new Error("Bookmarks can only be imported in a browser.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("That file isn't JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("That file isn't a bookmarks backup.");
  const backup = parsed as { version?: unknown; bookmarks?: unknown };
  if (typeof backup.version !== "number" || backup.version < 1) {
    throw new Error("That file isn't a bookmarks backup: it carries no version.");
  }
  const lists: unknown[] = Array.isArray(backup.bookmarks)
    ? [backup.bookmarks]
    : typeof backup.bookmarks === "object" && backup.bookmarks !== null
      ? Object.values(backup.bookmarks)
      : [];
  const incoming = lists.flatMap((rows) => (Array.isArray(rows) ? rows.filter(isSessionRow) : []));
  if (incoming.length === 0) throw new Error("That backup carries no bookmarks.");
  const { rows, added } = mergeRows(loadSessions(), incoming);
  const read = new Set(incoming.map(primaryOf)).size;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    throw new Error("This browser wouldn't let the bookmarks be saved. Check that site data is allowed.");
  }
  queueMicrotask(() => window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT)));
  return { read, added };
}
