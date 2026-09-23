/** Per-protocol bookmark-wallet helpers.
 *
 *  Each mono-rail (Liquity V2, Aave V4, …) keeps its own bookmarked-wallet
 *  list in its own localStorage key. There is no cross-protocol store — a
 *  wallet bookmarked on one rail is a bookmark of *that* rail only. The
 *  protocol arg on every function makes the scope explicit at the call site.
 *  A single cross-protocol *view* over these silos lives in the bookmarks
 *  modal; the storage stays per-protocol. `exportBookmarks` /
 *  `importBookmarks` at the foot of this file are the one cross-protocol
 *  *transfer*: a JSON file that carries every scope's rows off this origin
 *  and back, which is what makes bookmarks survivable across browsers,
 *  machines and a site-data clear.
 *
 *  History: this file used to also track "recent" (auto-recorded on visit)
 *  wallets alongside bookmarks in the same array, distinguished by `pinned`.
 *  Recents were retired — only bookmarks remain, so every stored row is a
 *  bookmark. `pinned` is kept on the type for back-compat with existing
 *  localStorage and as the bookmark marker; the mutation helpers prune any
 *  legacy non-pinned (recent) rows on the next write. */

export type SessionProtocol =
  | "liquity-v2"
  | "aave-v4"
  | "aave-v3"
  | "aave-v3-base"
  // Aave's vault layer — savings GHO, Umbrella stake tokens and static
  // aTokens. Its own roster subject at an UNSTAMPED door, `/ethereum/aave`,
  // because those contracts carry no version and a version in the URL of a
  // contract that has none is false (rails-ops decision 0028 point 5). The
  // pool explorers above are version-scoped and truthfully stamped.
  | "aave-vaults"
  | "seamless"
  | "makerdao"
  | "maple"
  | "moonwell"
  | "moonwell-base"
  | "morpho"
  | "morpho-base"
  | "spark"
  | "compound"
  | "compound-base"
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
  | "yearn";

/** What a bookmark can be scoped to. Every scope is a protocol's rail now: the
 *  chain-scoped vault sections and their two namespaces (`vaults-sessions`,
 *  `vaults-base-sessions`) went with the sections themselves (rails-ops
 *  decision 0028), and nothing rewrote what was stored under them — this is
 *  preview, and `TO-DO-ui-jobs.md` §40 gives bookmarks an export/import so the
 *  next namespace change is survivable. The alias stays because every function
 *  below is keyed on it and a rename across them all would be churn. */
export type BookmarkScope = SessionProtocol;

export interface WalletSession {
  key: string;
  addresses: string[];
  ensNames: Record<string, string | null>;
  /** When the wallet was bookmarked (drives the by-recency display order). */
  lastVisited: number;
  /** The bookmark marker. Every row written now carries `pinned: true`; the
   *  field survives only to read legacy storage and mark the state. */
  pinned?: boolean;
  preset?: boolean;
  /** WHICH LISTING this bookmark was taken on — the `segment` of the explorer
   *  sub-page whose holder listing it came from ("vaults"), absent when it was
   *  taken on the explorer's own listing. One rail can own two listings of the
   *  same address: Morpho Blue Base lists Blue borrower positions at
   *  `/base/morpho` and MetaMorpho holdings at `/base/morpho/vaults/positions`,
   *  and the scope alone cannot tell them apart (§42 item 1). Recorded rather
   *  than inferred, for the reason `holderListing` is
   *  (lib/shared/protocols.ts) — "this rail has a vault listing" and "this
   *  bookmark was taken on it" are two facts.
   *
   *  ABSENT IS THE OLD LANDING, never a 404: every row written before this
   *  field has none, and `bookmarkHref` then forms the explorer's own listing
   *  as it always did. An old row corrects itself the next time the reader
   *  re-bookmarks from the vault listing. */
  listing?: string;
  /** User-provided display name, overrides ENS / short address. */
  customName?: string;
}

/** DOM event dispatched after any same-tab bookmarks mutation, so listeners
 *  can resync without polling. The native `storage` event only fires across
 *  tabs. */
export const SESSIONS_CHANGED_EVENT = "rails-sessions-changed";

/** The suffix every scope's localStorage key ends in. The export walks
 *  storage for it rather than a roster of scopes, so a scope retired from
 *  `SessionProtocol` still has its rows carried out. */
const STORAGE_KEY_SUFFIX = "-sessions";

function storageKey(protocol: BookmarkScope): string {
  return `${protocol}${STORAGE_KEY_SUFFIX}`;
}

export function loadSessions(protocol: BookmarkScope): WalletSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(protocol));
    if (!raw) return [];
    return JSON.parse(raw) as WalletSession[];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: WalletSession[], protocol: BookmarkScope): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(protocol);
    if (sessions.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(sessions));
    // Defer dispatch to a microtask so callers that accidentally run from
    // inside a React render phase (e.g. a setState updater) don't trip
    // subscribers' setStates synchronously and produce a "cannot update X
    // while rendering Y" warning. localStorage is still written immediately.
    queueMicrotask(() => window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT)));
  } catch {
    /* ignore */
  }
}

/** The bookmarked wallets for a protocol, most-recently-bookmarked first.
 *  Filters to `pinned` so any legacy non-pinned (recent) rows left in storage
 *  are ignored — the display + modal read only bookmarks. */
export function loadBookmarks(protocol: BookmarkScope): WalletSession[] {
  return loadSessions(protocol)
    .filter((s) => s.pinned)
    .sort((a, b) => b.lastVisited - a.lastVisited);
}

export function renameSession(key: string, customName: string, protocol: BookmarkScope): void {
  const sessions = loadSessions(protocol);
  const target = sessions.find((s) => s.key === key);
  if (!target) return;
  const trimmed = customName.trim();
  if (trimmed) target.customName = trimmed;
  else delete target.customName;
  saveSessions(sessions, protocol);
}

/** True when `address` is currently bookmarked in this protocol's list.
 *  Matched case-insensitively against each session's primary address. */
export function isBookmarked(address: string, protocol: BookmarkScope): boolean {
  const addr = address.toLowerCase();
  return loadSessions(protocol).some((s) => s.pinned && s.addresses[0]?.toLowerCase() === addr);
}

/** Toggle the bookmark state of a single wallet from anywhere — a listing
 *  card's bookmark toggle, the modal, etc. Bookmarking a wallet that has no session row
 *  creates one on the fly. Prunes any legacy non-pinned rows on the way out,
 *  so recents storage drains as bookmarks are toggled. Returns the resulting
 *  bookmark state. */
export function toggleBookmark(
  address: string,
  ensName: string | null,
  protocol: BookmarkScope,
  listing?: string,
): boolean {
  const addr = address.toLowerCase();
  const sessions = loadSessions(protocol);
  const existing = sessions.find((s) => s.addresses[0]?.toLowerCase() === addr);
  let nowBookmarked: boolean;
  if (existing) {
    nowBookmarked = !existing.pinned;
    existing.pinned = nowBookmarked;
    // The listing is re-stated on every bookmarking, so a row written before
    // the field existed learns it the first time it is toggled back on.
    if (nowBookmarked && listing) existing.listing = listing;
    if (ensName && !existing.ensNames[existing.addresses[0]]) {
      existing.ensNames = { ...existing.ensNames, [existing.addresses[0]]: ensName };
    }
  } else {
    nowBookmarked = true;
    sessions.unshift({
      key: addr,
      addresses: [addr],
      ensNames: { [addr]: ensName },
      lastVisited: Date.now(),
      pinned: true,
      // `JSON.stringify` drops it when it is undefined, so a bookmark taken on
      // an explorer's own listing stores nothing new.
      listing,
    });
  }
  // Only bookmarks persist — drop any legacy recent (non-pinned) rows.
  saveSessions(
    sessions.filter((s) => s.pinned),
    protocol,
  );
  return nowBookmarked;
}

/** Remove a wallet from a protocol's bookmarks entirely (the trash action in
 *  the dropdown / modal). Matched case-insensitively on the primary address. */
export function removeBookmark(address: string, protocol: BookmarkScope): void {
  const addr = address.toLowerCase();
  const sessions = loadSessions(protocol);
  saveSessions(
    sessions.filter((s) => s.pinned && s.addresses[0]?.toLowerCase() !== addr),
    protocol,
  );
}

// ── Backup: export and import ───────────────────────────────────────────────
//
// localStorage is per-origin and per-browser: clearing site data drops every
// bookmark with no warning, and nothing carries them to a second machine.
// These two functions are the way out and back in.
//
// BOTH DIRECTIONS ARE DELIBERATELY TOLERANT, because the file outlives the
// build that wrote it:
//   · a SCOPE the reading build has never heard of, or one retired since the
//     file was written, is written back to its key rather than dropped — a
//     later build that knows the scope then finds its bookmarks there;
//   · a FIELD on a row that the reading build has no name for travels through
//     untouched, so a row round-tripped by an older build keeps it. Every
//     merge below spreads rows instead of rebuilding them field by field.

/** Bumped only when a reader has to behave *differently* to read the file.
 *  Adding a field does not bump it — that is what the tolerances above are
 *  for. */
export const BOOKMARKS_BACKUP_VERSION = 1;

export interface BookmarksBackup {
  version: number;
  /** ISO-8601, so the stamp reads the same in every runtime locale. */
  exportedAt: string;
  /** Scope → its bookmark rows. Keyed by plain `string`, not `BookmarkScope`:
   *  the scopes in a file are whatever the writing build had. */
  bookmarks: Record<string, WalletSession[]>;
}

export interface BookmarksImportResult {
  /** The `version` the file declared. */
  version: number;
  /** Scopes the file carried rows for. */
  scopes: number;
  /** Wallets added that this origin did not already hold. */
  added: number;
  /** Scopes written that this build has no `SessionProtocol` for — their rows
   *  are stored, not dropped. */
  unknownScopes: string[];
}

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

/** Every scope in this origin's storage that holds bookmarks, with its rows. */
export function exportBookmarks(): BookmarksBackup {
  const bookmarks: Record<string, WalletSession[]> = {};
  if (typeof window !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.endsWith(STORAGE_KEY_SUFFIX)) continue;
        let rows: unknown;
        try {
          rows = JSON.parse(localStorage.getItem(key) ?? "null");
        } catch {
          continue;
        }
        if (!Array.isArray(rows)) continue;
        const kept = rows.filter(isSessionRow).filter((r) => r.pinned);
        if (kept.length > 0) bookmarks[key.slice(0, -STORAGE_KEY_SUFFIX.length)] = kept;
      }
    } catch {
      /* storage blocked (private window, blocked site data) — export what stands */
    }
  }
  return { version: BOOKMARKS_BACKUP_VERSION, exportedAt: new Date().toISOString(), bookmarks };
}

/** Total wallets an export holds — for a count in the UI before it is written. */
export function countBackupBookmarks(backup: BookmarksBackup): number {
  return Object.values(backup.bookmarks).reduce((n, rows) => n + rows.length, 0);
}

/** `rails-bookmarks-2026-09-20.json` — ISO date, locale-independent. */
export function bookmarksBackupFilename(at: Date = new Date()): string {
  return `rails-bookmarks-${at.toISOString().slice(0, 10)}.json`;
}

/** Merge incoming rows into what the scope already holds, newest first and
 *  one row per primary address. The incoming row wins field by field, keeping
 *  the later `lastVisited` — a wallet bookmarked on both machines survives
 *  with the name and timestamp of whichever saw it last. */
function mergeRows(existing: WalletSession[], incoming: WalletSession[]): { rows: WalletSession[]; added: number } {
  const byAddress = new Map<string, WalletSession>();
  for (const row of existing) {
    const addr = row.addresses[0]?.toLowerCase();
    if (addr) byAddress.set(addr, row);
  }
  let added = 0;
  for (const row of incoming) {
    const addr = row.addresses[0]?.toLowerCase();
    if (!addr) continue;
    const prev = byAddress.get(addr);
    if (!prev) added += 1;
    byAddress.set(addr, {
      ...prev,
      ...row,
      lastVisited: Math.max(prev?.lastVisited ?? 0, row.lastVisited ?? 0),
      pinned: true,
    });
  }
  return { rows: [...byAddress.values()].sort((a, b) => b.lastVisited - a.lastVisited), added };
}

/** Read a backup back into this origin's storage, merging rather than
 *  replacing — an import adds to what is here, it does not wipe it. Throws
 *  with a message fit to show the reader when the file is not one of ours. */
export function importBookmarks(source: string | BookmarksBackup, known?: readonly string[]): BookmarksImportResult {
  if (typeof window === "undefined") throw new Error("Bookmarks can only be imported in a browser.");

  let parsed: unknown = source;
  if (typeof source === "string") {
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error("That file isn't JSON.");
    }
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("That file isn't a bookmarks backup.");
  const backup = parsed as Partial<BookmarksBackup>;
  if (typeof backup.version !== "number" || backup.version < 1) {
    throw new Error("That file isn't a bookmarks backup — it carries no version.");
  }
  if (typeof backup.bookmarks !== "object" || backup.bookmarks === null) {
    throw new Error("That backup carries no bookmarks.");
  }

  const result: BookmarksImportResult = { version: backup.version, scopes: 0, added: 0, unknownScopes: [] };
  for (const [scope, rows] of Object.entries(backup.bookmarks)) {
    if (!scope || !Array.isArray(rows)) continue;
    const incoming = rows.filter(isSessionRow);
    if (incoming.length === 0) continue;
    if (known && !known.includes(scope)) result.unknownScopes.push(scope);
    const key = `${scope}${STORAGE_KEY_SUFFIX}`;
    let existing: WalletSession[] = [];
    try {
      const raw = localStorage.getItem(key);
      const held: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(held)) existing = held.filter(isSessionRow);
    } catch {
      /* unreadable key — treat it as empty and write the backup's rows over it */
    }
    const { rows: merged, added } = mergeRows(existing, incoming);
    try {
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {
      throw new Error("This browser wouldn't let the bookmarks be saved — check that site data is allowed.");
    }
    result.scopes += 1;
    result.added += added;
  }

  queueMicrotask(() => window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT)));
  return result;
}
