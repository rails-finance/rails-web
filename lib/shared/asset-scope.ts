"use client";

// Focus mode in the browser (ui-jobs 557): the reader's saved focus views and
// the one in use (lib/shared/focus-views.ts), and the tests every filtered
// list runs: the asset keys the focus reaches (lib/shared/asset-family.ts
// `familyOf`) and the chains it keeps. A row shows when it passes both.
//
// One state: the view in use, or none. A link (`?assets=` / `?chains=` /
// `&view=`) is a proposal the arrival dialog shows; nothing filters by it
// until "Use this view" saves it. A link naming nothing Rails knows is no link.
//
// An asset is matched by address alone. A pick carries its asset's address on
// other chains (`also`, one record per asset), and chain focus keeps the
// addresses on the focused chains: 8453:BOLD with Ethereum focused is BOLD on
// Ethereum; a pick with no address on them reaches nothing. Symbols are for
// display, and for reading a hand-written link.
//
// The server renders every list whole; the view in use is read after
// hydration. The script in app/layout.tsx marks <html data-asset-scope>
// before first paint when a view is in use, and globals.css holds a filtered
// list (`data-scope-list`) hidden until it is ready, so the whole list does
// not flash first.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { assetKey, familyDisplaySymbol, familyOf } from "@/lib/shared/asset-family";
import { SCOPE_TOKENS } from "@/lib/shared/asset-scope-tokens";
import { notifyUrlChanged } from "@/lib/shared/use-url-search-params";
import {
  ASSETS_PARAM,
  CHAINS_PARAM,
  FOCUS_MENU_KEY,
  FOCUS_VIEWS_KEY,
  formatAssetsParam,
  formatChainsParam,
  NO_FOCUS,
  parseAssetsParam,
  parseChainsParam,
  type AssetPick,
  type Focus,
  type SymbolIndex,
} from "@/lib/shared/asset-preference";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { isLaunchedChain, launchedChains } from "@/lib/shared/protocols";
import {
  mergeViews,
  activeFocus,
  activeView,
  addView,
  adoptFocus,
  editActive,
  editView,
  focusOn,
  moveView,
  NO_VIEWS,
  pickKeys,
  readViews,
  removeView,
  renameView,
  restoreView,
  setActive,
  VIEW_PARAM,
  type FocusView,
  type FocusViews,
} from "@/lib/shared/focus-views";

export type { AssetPick, FocusView };

/** The chains the asset chooser's tokens are on. */
export const SCOPE_CHAINS: Record<number, string> = { 1: "Ethereum", 8453: "Base" };

/** The slugs a focus link may name: launched chains only, so a link cannot put
 *  an unlaunched chain into the Focus panel. */
const CHAIN_SLUGS: Record<string, number> = Object.fromEntries(launchedChains().map((c) => [c.slug, c.id]));
export const chainNameOf = (id: number): string => CHAINS[id as ChainId]?.name ?? `chain ${id}`;
const chainOfKey = (k: string) => Number(k.slice(0, k.indexOf(":")));

export { SCOPE_TOKENS };

const BY_KEY = new Map(SCOPE_TOKENS.map((t) => [assetKey(t.chain, t.token), t.symbol]));
export const SCOPE_SYMBOLS: SymbolIndex = (() => {
  const m: SymbolIndex = new Map();
  for (const t of SCOPE_TOKENS) {
    const s = t.symbol.toLowerCase();
    m.set(s, [...(m.get(s) ?? []), { chain: t.chain, token: t.token }]);
  }
  return m;
})();

/** Symbols for tokens outside the chooser's tables: the /assets rows, and
 *  any pick that carries its own (`AssetPick.symbol`). */
const NAMED = new Map<string, string>();
export function registerSymbols(entries: Iterable<{ chain: number; token: string; symbol: string }>) {
  for (const e of entries) {
    const k = assetKey(e.chain, e.token);
    if (!BY_KEY.has(k)) NAMED.set(k, e.symbol);
  }
}

export const scopeSymbolOf = (chain: number, token: string): string | null =>
  BY_KEY.get(assetKey(chain, token)) ?? NAMED.get(assetKey(chain, token)) ?? null;

/** The symbol as Rails shows it (asset-family `familyDisplaySymbol`); links
 *  and lookups keep `scopeSymbolOf`. */
export const scopeLabelOf = (chain: number, token: string): string | null => {
  const s = scopeSymbolOf(chain, token);
  return s == null ? null : familyDisplaySymbol(s);
};

/** One record per asset across chains: the address tables name one token per
 *  symbol per chain, so a symbol's tokens on different chains are one asset
 *  (until the server family map ships its records). key → the record's other
 *  addresses. */
const RECORDS = new Map<string, { chain: number; token: string }[]>();
for (const tokens of SCOPE_SYMBOLS.values()) {
  const byChain = new Map<number, { chain: number; token: string }>();
  for (const t of tokens) if (!byChain.has(t.chain)) byChain.set(t.chain, t);
  const rec = [...byChain.values()];
  for (const t of rec)
    RECORDS.set(
      assetKey(t.chain, t.token),
      rec.filter((x) => x !== t),
    );
}

/** A pick with its asset's addresses on other chains attached (`also`): its
 *  own when it carries them, else the address tables' record. */
export function withRecord(p: AssetPick): AssetPick {
  if (p.also) return p;
  const also = RECORDS.get(assetKey(p.chain, p.token));
  return also?.length ? { ...p, also } : p;
}

// ── The store ───────────────────────────────────────────────────────────────

const CHANGE = "rails:asset-scope";
/** Opens the panel from anywhere: on a saved view (`view`, else the view in
 *  use), or (mode "new") on a new view that becomes one once it holds
 *  something. */
export const OPEN_SCOPE_PANEL = "rails:asset-scope-open";
export const openFocusPanel = (mode: "edit" | "new" = "edit", view?: string) =>
  window.dispatchEvent(new CustomEvent(OPEN_SCOPE_PANEL, { detail: { mode, view } }));

/** A focus link's proposal: what it sets and its name. */
export interface FocusProposal {
  focus: Focus;
  name: string | null;
}

interface Snapshot {
  /** The saved views and the one in use (lib/shared/focus-views.ts). */
  saved: FocusViews;
  stored: Focus;
  /** What a link proposes; null when the URL names nothing Rails knows. */
  link: FocusProposal | null;
  /** The view chosen for the profile menu, by id; null when none is chosen. */
  menu: string | null;
}
const EMPTY: Snapshot = { saved: NO_VIEWS, stored: NO_FOCUS, link: null, menu: null };
let cache: { raw: string; snap: Snapshot } = { raw: "", snap: EMPTY };

const newId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const knownChain = (id: number) => CHAINS[id as ChainId] != null && isLaunchedChain(id as ChainId);

/** The stores before saved views held only on localhost while Focus was a
 *  mock; they are dropped, not carried forward. */
let swept = false;
function sweepOldStores() {
  if (swept) return;
  swept = true;
  try {
    localStorage.removeItem("rails-focus-v2");
    localStorage.removeItem("rails-assets-v1");
  } catch {}
}

function readRaw(): string {
  sweepOldStores();
  let held = "";
  let menu = "";
  try {
    held = localStorage.getItem(FOCUS_VIEWS_KEY) ?? "";
    menu = localStorage.getItem(FOCUS_MENU_KEY) ?? "";
  } catch {}
  const sp = new URLSearchParams(window.location.search);
  const a = sp.get(ASSETS_PARAM);
  const c = sp.get(CHAINS_PARAM);
  const n = sp.get(VIEW_PARAM);
  return [held, a ?? "\u0001", c ?? "\u0001", n ?? "", menu].join("\u0000");
}

function snapshot(): Snapshot {
  const raw = readRaw();
  if (raw === cache.raw) return cache.snap;
  const [s, a, c, n, m] = raw.split("\u0000");
  let saved: FocusViews = NO_VIEWS;
  try {
    saved = readViews(s ? JSON.parse(s) : null, knownChain);
  } catch {}
  registerSymbols(
    saved.views.flatMap((v) =>
      v.assets.flatMap((p) => (p.symbol ? [{ chain: p.chain, token: p.token, symbol: p.symbol }] : [])),
    ),
  );
  const assets = a === "\u0001" ? [] : (parseAssetsParam(a, SCOPE_SYMBOLS) ?? []).map(withRecord);
  const chains = c === "\u0001" ? [] : (parseChainsParam(c, CHAIN_SLUGS) ?? []);
  const focus = { assets, chains };
  const link = focusOn(focus) ? { focus, name: n.trim().slice(0, 60) || null } : null;
  cache = { raw, snap: { saved, stored: activeFocus(saved), link, menu: m || null } };
  return cache.snap;
}

function subscribe(fn: () => void) {
  window.addEventListener(CHANGE, fn);
  window.addEventListener("storage", fn);
  window.addEventListener("popstate", fn);
  window.addEventListener("rails:url-change", fn);
  return () => {
    window.removeEventListener(CHANGE, fn);
    window.removeEventListener("storage", fn);
    window.removeEventListener("popstate", fn);
    window.removeEventListener("rails:url-change", fn);
  };
}

function markHtml(f: Focus) {
  const d = document.documentElement.dataset;
  if (focusOn(f)) d.assetScope = "1";
  else delete d.assetScope;
  if (f.chains.length) d.chainFocus = "1";
  else delete d.chainFocus;
}

const slugOf = (id: number) => CHAINS[id as ChainId]?.slug;

/** The query string for this view under a focus link, or with none. */
function focusQuery(f: Focus | null, name?: string | null, base: string = window.location.search): string {
  const sp = new URLSearchParams(base);
  sp.delete(ASSETS_PARAM);
  sp.delete(CHAINS_PARAM);
  sp.delete(VIEW_PARAM);
  const parts = sp.toString() ? [sp.toString()] : [];
  if (f && f.assets.length) parts.push(`${ASSETS_PARAM}=${formatAssetsParam(f.assets, scopeSymbolOf, SCOPE_SYMBOLS)}`);
  if (f && f.chains.length) parts.push(`${CHAINS_PARAM}=${formatChainsParam(f.chains, slugOf)}`);
  if (f && name) parts.push(`${VIEW_PARAM}=${encodeURIComponent(name).replace(/%20/g, "+")}`);
  return parts.join("&");
}

/** The link's params dropped from the address bar. */
function dropLink() {
  if (snapshot().link == null) {
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has(ASSETS_PARAM) && !sp.has(CHAINS_PARAM) && !sp.has(VIEW_PARAM)) return;
  }
  const qs = focusQuery(null);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  notifyUrlChanged();
}

function writeSaved(next: FocusViews) {
  try {
    localStorage.setItem(FOCUS_VIEWS_KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
  markHtml(activeFocus(next));
}

const saved = () => snapshot().saved;

/** The saved views' edits, for the profile menu, the panel and /bookmarks. */
export const focusViews = {
  use: (id: string | null) => writeSaved(setActive(saved(), id)),
  rename: (id: string, name: string) => writeSaved(renameView(saved(), id, name)),
  /** Removes a view; what `restore` needs to put it back. */
  remove(id: string): { view: FocusView; index: number; wasActive: boolean } | null {
    const now = saved();
    const index = now.views.findIndex((v) => v.id === id);
    if (index < 0) return null;
    writeSaved(removeView(now, id));
    return { view: now.views[index], index, wasActive: now.active === id };
  },
  restore: (r: { view: FocusView; index: number; wasActive: boolean }) =>
    writeSaved(restoreView(saved(), r.view, r.index, r.wasActive)),
  move: (id: string, to: number) => writeSaved(moveView(saved(), id, to)),
  /** "New view": the panel opens on a new view, which is saved and put in use
   *  once it holds something. The view in use stays until then. */
  create: () => openFocusPanel("new"),
  /** A view holding `f`, saved and put in use; its id. */
  add(f: Focus, name?: string, index = 0): string | null {
    if (!focusOn(f)) return null;
    const id = newId();
    writeSaved(addView(saved(), f, name, id, Date.now(), index));
    return id;
  },
  /** An edit to one view; emptied, it is removed. */
  edit: (id: string, f: Focus) => writeSaved(editView(saved(), id, f)),
  /** The view the profile menu offers (ui-jobs 582): one at a time. */
  showInMenu(id: string) {
    try {
      localStorage.setItem(FOCUS_MENU_KEY, id);
    } catch {}
    window.dispatchEvent(new Event(CHANGE));
  },
  /** The saved views for a backup file. */
  list: (): FocusView[] => saved().views,
  /** A saved view by id, or the view in use; read from the store, so it is
   *  right on a component's first render. */
  find(id?: string | null): FocusView | null {
    const s = saved();
    const want = id ?? s.active;
    return s.views.find((v) => v.id === want) ?? null;
  },
  /** A backup file's views merged in; the view in use stays. */
  importList(incoming: unknown): { read: number; added: number } {
    const { state, read, added } = mergeViews(saved(), incoming, newId, Date.now(), knownChain);
    if (read) writeSaved(state);
    return { read, added };
  },
};

/** A link to a focus: this page, or `path`, with `&view=` when it has a name. */
export function scopeLink(picks: AssetPick[], chains: number[] = [], name?: string, path?: string): string {
  const qs = focusQuery({ assets: picks, chains }, name, path ? "" : window.location.search);
  return `${window.location.origin}${path ?? window.location.pathname}${qs ? `?${qs}` : ""}`;
}

/** The picks as they apply under chain focus: each pick's addresses (its own
 *  and its record's) on the focused chains. No symbol is consulted. */
export function effectivePicks(picks: AssetPick[], chains: number[]): AssetPick[] {
  if (!chains.length) return picks;
  const out = new Map<string, AssetPick>();
  for (const p of picks)
    for (const k of pickKeys(withRecord(p), chains)) {
      const [c, t] = k.split(":");
      if (!out.has(k)) out.set(k, { chain: Number(c), token: t, builtOn: p.builtOn });
    }
  return [...out.values()];
}

export interface AssetScope {
  /** False through SSR and the first client render: lists draw whole. */
  ready: boolean;
  /** A view is in use. */
  on: boolean;
  /** The asset picks in force (the view in use's). */
  picks: AssetPick[];
  /** The focused chains; [] is every chain. */
  chains: number[];
  /** What a focus link proposes, for the arrival dialog; null with none. */
  link: FocusProposal | null;
  /** The saved views, in the reader's order, and the one in use. */
  views: FocusView[];
  active: FocusView | null;
  /** The one view the profile menu offers: the one chosen on /bookmarks, else
   *  the view in use, else the first saved (ui-jobs 582). */
  menuView: FocusView | null;
  /** The asset keys the picks reach on the focused chains; null when no asset is picked. */
  keys: Set<string> | null;
  /** A chain passes chain focus. */
  chainOk: (chain: number) => boolean;
  /** A row passes the whole focus: one of its keys (`chain:address`) reaches
   *  an asset in focus on a focused chain; with chains alone, its chain (or a
   *  key's chain) is focused. */
  matches: (keys: string[], chain?: number) => boolean;
  /** Replaces the view in use's assets (a view is made when none is in use;
   *  emptied, it is removed and Focus is off). */
  setPicks: (next: AssetPick[]) => void;
  /** Replaces the view in use's chains, likewise. */
  setChains: (next: number[]) => void;
  /** "Use this view": saves a focus (the link's, or the panel's draft of it)
   *  as a view, or switches to the saved one holding it, and drops the params. */
  adoptLink: (draft?: FocusProposal) => void;
  /** "Not now": drops the link's params. */
  dismissLink: () => void;
  /** Turn off: no view in use. The views stay saved. */
  clear: () => void;
}

/** The keys a focus reaches on its chains. */
export function focusKeys(f: Focus): Set<string> | null {
  if (!f.assets.length) return null;
  const all = familyOf(effectivePicks(f.assets, f.chains));
  return f.chains.length ? new Set([...all].filter((k) => f.chains.includes(chainOfKey(k)))) : all;
}

export function useAssetScope(): AssetScope {
  usePathname(); // a navigation re-reads the params
  const ready = useHydrated();
  const snap = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const focus = !ready ? NO_FOCUS : snap.stored;
  const picks = focus.assets;
  const chains = focus.chains;
  const keys = useMemo(() => focusKeys({ assets: picks, chains }), [picks, chains]);

  const chainOk = useCallback((c: number) => !chains.length || chains.includes(c), [chains]);
  const matches = useCallback(
    (rowKeys: string[], chain?: number) => {
      if (!picks.length && !chains.length) return true;
      if (chain != null && !chainOk(chain)) return false;
      if (keys) return rowKeys.some((k) => keys.has(k.toLowerCase()));
      return chain != null || rowKeys.some((k) => chainOk(chainOfKey(k)));
    },
    [picks.length, chains.length, chainOk, keys],
  );

  const write = useCallback((next: Focus) => writeSaved(editActive(saved(), next, newId(), Date.now())), []);
  const setPicks = useCallback(
    (next: AssetPick[]) => write({ ...snapshot().stored, assets: next.map(withRecord) }),
    [write],
  );
  const setChains = useCallback((next: number[]) => write({ ...snapshot().stored, chains: next }), [write]);
  const adoptLink = useCallback((draft?: FocusProposal) => {
    const p = draft ?? snapshot().link;
    if (p && focusOn(p.focus)) writeSaved(adoptFocus(saved(), p.focus, p.name ?? undefined, newId(), Date.now()));
    dropLink();
  }, []);
  const dismissLink = useCallback(() => dropLink(), []);
  const clear = useCallback(() => writeSaved(setActive(saved(), null)), []);
  const views = ready ? snap.saved.views : NO_VIEWS.views;
  const active = ready ? activeView(snap.saved) : null;

  return {
    ready,
    on: picks.length > 0 || chains.length > 0,
    picks,
    chains,
    link: ready ? snap.link : null,
    views,
    active,
    menuView: views.find((v) => v.id === snap.menu) ?? active ?? views[0] ?? null,
    keys,
    chainOk,
    matches,
    setPicks,
    setChains,
    adoptLink,
    dismissLink,
    clear,
  };
}

/** `/assets` in its manage state (`?manage=1`): every asset shown, to add to
 *  the focus. */
export const MANAGE_PARAM = "manage";
export const manageHref = (manage = true): string => (manage ? `/assets?${MANAGE_PARAM}=1` : "/assets");
