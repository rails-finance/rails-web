// Saved Focus views (ui-jobs 557, Miles 10 Nov 2026): a reader keeps any
// number of named focuses in this browser, beside the saved items, and one is
// in use or Focus is off. A view's name is a free label ("My stables"); one
// with no name of its own is called by what it holds ("WETH and BOLD").
//
// Stored under `rails-focus-views` as `{ views: [{ id, name?, assets, chains,
// savedAt }], active: id | null }`, the reader's order. The focus in use is
// mirrored to `rails-focus-v2` (lib/shared/asset-preference.ts), which the
// script in app/layout.tsx reads before first paint. The first read in a
// browser makes a `rails-focus-v2` focus that is on into one view, in use.
//
// Arriving on a link (`?assets=`, `?chains=`, `&view=<name>`), "Use this view"
// saves it, or switches to a saved view holding the same focus, so a link
// opened twice is one view.
//
// Pure: type imports only (scripts/test/focus-views.test.mjs runs it directly).

import type { AssetPick, Focus } from "@/lib/shared/asset-preference";

export const FOCUS_VIEWS_KEY = "rails-focus-views";
/** The name a link gives its view. */
export const VIEW_PARAM = "view";

export interface FocusView {
  id: string;
  /** The reader's or the link's name; absent, the view is called by what it holds. */
  name?: string;
  assets: AssetPick[];
  chains: number[];
  savedAt: number;
}

export interface FocusViews {
  views: FocusView[];
  /** The view in use; null is Focus off. */
  active: string | null;
}

export const NO_VIEWS: FocusViews = { views: [], active: null };

const isPick = (p: unknown): p is AssetPick =>
  !!p &&
  typeof p === "object" &&
  typeof (p as AssetPick).chain === "number" &&
  typeof (p as AssetPick).token === "string" &&
  typeof (p as AssetPick).builtOn === "boolean";

function isView(v: unknown): v is FocusView {
  if (!v || typeof v !== "object") return false;
  const r = v as FocusView;
  return (
    typeof r.id === "string" &&
    (r.name === undefined || typeof r.name === "string") &&
    Array.isArray(r.assets) &&
    r.assets.every(isPick) &&
    Array.isArray(r.chains) &&
    r.chains.every((c) => typeof c === "number")
  );
}

export function isFocusViews(v: unknown): v is FocusViews {
  if (!v || typeof v !== "object") return false;
  const r = v as FocusViews;
  return Array.isArray(r.views) && r.views.every(isView) && (r.active === null || typeof r.active === "string");
}

export const focusOn = (f: Focus): boolean => f.assets.length > 0 || f.chains.length > 0;

/** Two focuses hold the same assets (each with its built-on switch) and chains, in any order. */
export function sameFocus(a: Focus, b: Focus): boolean {
  const assets = (f: Focus) =>
    [...new Set(f.assets.map((p) => `${p.chain}:${p.token.toLowerCase()}:${p.builtOn ? 1 : 0}`))].sort().join(",");
  const chains = (f: Focus) => [...new Set(f.chains)].sort((x, y) => x - y).join(",");
  return assets(a) === assets(b) && chains(a) === chains(b);
}

/** The view in use, or null. */
export function activeView(s: FocusViews): FocusView | null {
  return s.views.find((v) => v.id === s.active) ?? null;
}

/** The focus in use: the active view's, or none. */
export function activeFocus(s: FocusViews): Focus {
  const v = activeView(s);
  return v ? { assets: v.assets, chains: v.chains } : { assets: [], chains: [] };
}

/** The first read: a stored focus that is on becomes one view, in use. */
export function migrateFocus(f: Focus | null, id: string, at: number): FocusViews {
  if (!f || !focusOn(f)) return NO_VIEWS;
  return { views: [{ id, assets: f.assets, chains: f.chains, savedAt: at }], active: id };
}

/** "Use this view": the link's focus saved and put in use, or the saved view
 *  holding the same focus put in use (taking the link's name when it has
 *  none). A new view goes first. */
export function adoptFocus(s: FocusViews, f: Focus, name: string | undefined, id: string, at: number): FocusViews {
  const label = name?.trim() || undefined;
  const same = s.views.find((v) => sameFocus(v, f));
  if (same)
    return {
      views: s.views.map((v) => (v.id === same.id && !v.name && label ? { ...v, name: label } : v)),
      active: same.id,
    };
  const view: FocusView = { id, ...(label ? { name: label } : {}), assets: f.assets, chains: f.chains, savedAt: at };
  return { views: [view, ...s.views], active: id };
}

/** An edit to the focus in use: written into the active view, or, with none
 *  in use and the focus on, into a new view put in use. */
export function editActive(s: FocusViews, f: Focus, id: string, at: number): FocusViews {
  if (s.active && s.views.some((v) => v.id === s.active))
    return { ...s, views: s.views.map((v) => (v.id === s.active ? { ...v, assets: f.assets, chains: f.chains } : v)) };
  if (!focusOn(f)) return s;
  return { views: [{ id, assets: f.assets, chains: f.chains, savedAt: at }, ...s.views], active: id };
}

/** An empty view, put in use, for the panel to fill ("New view"). */
export function newView(s: FocusViews, id: string, at: number): FocusViews {
  return { views: [{ id, assets: [], chains: [], savedAt: at }, ...s.views], active: id };
}

/** Views left holding nothing are dropped (the panel closing on an emptied view). */
export function pruneEmpty(s: FocusViews): FocusViews {
  const views = s.views.filter(focusOn);
  return { views, active: views.some((v) => v.id === s.active) ? s.active : null };
}

export function setActive(s: FocusViews, id: string | null): FocusViews {
  return { ...s, active: id && s.views.some((v) => v.id === id) ? id : null };
}

/** An empty name goes back to what the view holds. */
export function renameView(s: FocusViews, id: string, name: string): FocusViews {
  const label = name.trim();
  return {
    ...s,
    views: s.views.map((v) => {
      if (v.id !== id) return v;
      const { name: _old, ...rest } = v;
      void _old;
      return label ? { ...rest, name: label } : rest;
    }),
  };
}

export function removeView(s: FocusViews, id: string): FocusViews {
  return { views: s.views.filter((v) => v.id !== id), active: s.active === id ? null : s.active };
}

/** Move a view to `to` (clamped). */
export function moveView(s: FocusViews, id: string, to: number): FocusViews {
  const from = s.views.findIndex((v) => v.id === id);
  if (from < 0) return s;
  const views = [...s.views];
  const [v] = views.splice(from, 1);
  views.splice(Math.max(0, Math.min(views.length, to)), 0, v);
  return { ...s, views };
}
